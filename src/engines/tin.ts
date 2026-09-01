// ============================================================================
// BhuNex Studio — TIN surface engine
// ----------------------------------------------------------------------------
// Builds a triangulated irregular network from surveyed points, and computes
// volumes and contours from it.
//
// WHY A TIN RATHER THAN THE EXISTING GRID
//
// The suite already had `dtmGridVolume`, which bins points into a regular grid.
// That is fine for a dense, evenly-spread survey and poor for the way ground is
// actually picked up: breaklines along a crest, a scatter of spot heights, more
// detail where the ground changes. A grid either loses those points to
// averaging or invents cells where nothing was surveyed.
//
// A TIN uses the surveyed points as they are. Every vertex is an observation,
// nothing is interpolated between them beyond the plane of each triangle, and
// the volume is the sum of exact triangular prisms rather than a sampled
// approximation.
//
// UNITS: all coordinates and heights are metres, in the project's own CRS.
// This module never transforms coordinates — a TIN built from eastings and
// northings stays in that grid, which is what makes its areas and volumes
// meaningful.
// ============================================================================

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/** A triangle as indices into the point array, wound counter-clockwise. */
export interface Triangle {
  a: number;
  b: number;
  c: number;
}

export interface Tin {
  points: Point3D[];
  triangles: Triangle[];
  /** Points discarded as duplicates before triangulation. */
  duplicatesRemoved: number;
}

const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Triangulation
// ---------------------------------------------------------------------------

interface WorkingTriangle {
  a: number;
  b: number;
  c: number;
  /** Circumcircle, cached because Bowyer-Watson tests it for every insertion. */
  cx: number;
  cy: number;
  r2: number;
}

function circumcircle(p: Point3D[], a: number, b: number, c: number): WorkingTriangle | null {
  const ax = p[a].x, ay = p[a].y;
  const bx = p[b].x, by = p[b].y;
  const cx = p[c].x, cy = p[c].y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < EPS) return null; // collinear: no circumcircle

  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;

  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;

  return { a, b, c, cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
}

/** Signed area of a triangle in plan, positive when counter-clockwise. */
function signedArea2D(p: Point3D[], a: number, b: number, c: number): number {
  return ((p[b].x - p[a].x) * (p[c].y - p[a].y) - (p[c].x - p[a].x) * (p[b].y - p[a].y)) / 2;
}

/**
 * Builds a Delaunay TIN from surveyed points.
 *
 * Bowyer-Watson incremental insertion. Duplicate plan positions are dropped —
 * two observations at the same easting and northing cannot both define the
 * surface there, and keeping them degenerates the triangulation.
 *
 * Throws when the points cannot form a surface, rather than returning an empty
 * TIN that would silently compute a volume of zero.
 */
export function buildTin(input: Point3D[]): Tin {
  if (!Array.isArray(input) || input.length < 3) {
    throw new Error('A surface needs at least three points.');
  }

  // Drop duplicate plan positions, keeping the first observation.
  const seen = new Set<string>();
  const points: Point3D[] = [];
  let duplicatesRemoved = 0;
  for (const p of input) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y) || !Number.isFinite(p?.z)) {
      throw new Error('Every surface point needs finite x, y and z values.');
    }
    const key = `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
    if (seen.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(key);
    points.push({ x: p.x, y: p.y, z: p.z });
  }

  if (points.length < 3) {
    throw new Error('A surface needs at least three points at distinct positions.');
  }

  // A super-triangle large enough to contain every point.
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;
  const span = Math.max(dx, dy) * 100;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const work = points.slice();
  const s0 = work.length;
  work.push({ x: midX - span, y: midY - span, z: 0 });
  work.push({ x: midX + span, y: midY - span, z: 0 });
  work.push({ x: midX, y: midY + span, z: 0 });

  const seed = circumcircle(work, s0, s0 + 1, s0 + 2);
  if (!seed) throw new Error('Could not initialise the triangulation.');
  let tris: WorkingTriangle[] = [seed];

  for (let i = 0; i < points.length; i++) {
    const bad: WorkingTriangle[] = [];
    const good: WorkingTriangle[] = [];
    for (const t of tris) {
      const inside = (work[i].x - t.cx) ** 2 + (work[i].y - t.cy) ** 2 <= t.r2 + EPS;
      (inside ? bad : good).push(t);
    }

    // Edges on the boundary of the hole appear exactly once across bad triangles.
    const counts = new Map<string, [number, number]>();
    const bump = (u: number, v: number) => {
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      const prev = counts.get(key);
      if (prev) counts.delete(key);
      else counts.set(key, [u, v]);
    };
    for (const t of bad) {
      bump(t.a, t.b);
      bump(t.b, t.c);
      bump(t.c, t.a);
    }

    tris = good;
    for (const [u, v] of counts.values()) {
      const nt = circumcircle(work, u, v, i);
      if (nt) tris.push(nt);
    }
  }

  // Drop anything still touching the super-triangle, and wind consistently.
  const triangles: Triangle[] = [];
  for (const t of tris) {
    if (t.a >= s0 || t.b >= s0 || t.c >= s0) continue;
    const area = signedArea2D(points, t.a, t.b, t.c);
    if (Math.abs(area) < EPS) continue; // sliver
    triangles.push(area > 0 ? { a: t.a, b: t.b, c: t.c } : { a: t.a, b: t.c, c: t.b });
  }

  if (!triangles.length) {
    throw new Error('These points are collinear, so they do not define a surface.');
  }

  return { points, triangles, duplicatesRemoved };
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/** Plan (projected) area of the TIN, m². */
export function planArea(tin: Tin): number {
  return tin.triangles.reduce(
    (sum, t) => sum + Math.abs(signedArea2D(tin.points, t.a, t.b, t.c)),
    0
  );
}

/**
 * Surface area of the TIN in three dimensions, m².
 *
 * Always at least the plan area, and larger the steeper the ground. The
 * difference is what a plan area understates when quoting, say, a liner or
 * a re-vegetation quantity.
 */
export function surfaceArea3D(tin: Tin): number {
  let total = 0;
  for (const t of tin.triangles) {
    const A = tin.points[t.a], B = tin.points[t.b], C = tin.points[t.c];
    const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z;
    const vx = C.x - A.x, vy = C.y - A.y, vz = C.z - A.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    total += Math.hypot(nx, ny, nz) / 2;
  }
  return total;
}

export interface VolumeResult {
  /** Volume above the datum, m³. */
  cutM3: number;
  /** Volume below the datum, m³. */
  fillM3: number;
  /** cut − fill, m³. Positive means net material above the datum. */
  netM3: number;
  planAreaM2: number;
}

/** A plan position carrying its height above the datum, used while clipping. */
interface PlanVertex {
  x: number;
  y: number;
  h: number;
}

/**
 * Sutherland-Hodgman clip of a convex plan polygon against the datum plane.
 *
 * `h` is linear across the face, so the datum crosses it along one straight
 * line and the kept side stays convex.
 */
function clipToHalf(poly: PlanVertex[], keepAbove: boolean): PlanVertex[] {
  const inside = (v: PlanVertex) => (keepAbove ? v.h >= 0 : v.h <= 0);
  const out: PlanVertex[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % poly.length];
    const curIn = inside(cur);
    if (curIn) out.push(cur);
    if (curIn !== inside(nxt)) {
      const f = cur.h / (cur.h - nxt.h);
      out.push({ x: cur.x + f * (nxt.x - cur.x), y: cur.y + f * (nxt.y - cur.y), h: 0 });
    }
  }
  return out;
}

/**
 * Volume of the prism between a convex plan polygon and the datum.
 *
 * Exact: `h` is linear, and the integral of a linear function over a triangle
 * is its area times the mean of the three vertex values, so a fan
 * triangulation sums to the true volume with no sampling error.
 */
function prismVolume(poly: PlanVertex[]): number {
  if (poly.length < 3) return 0;
  let vol = 0;
  const A = poly[0];
  for (let i = 1; i + 1 < poly.length; i++) {
    const B = poly[i];
    const C = poly[i + 1];
    const area = Math.abs(((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2);
    vol += (area * (A.h + B.h + C.h)) / 3;
  }
  return vol;
}

/**
 * Volume of the surface against a horizontal datum.
 *
 * Each triangle contributes a prism: its plan area times the mean height of
 * its three vertices above the datum. Where a triangle straddles the datum it
 * is clipped at the crossing line and each side measured separately, so cut
 * and fill never cancel inside one triangle — a surface that is half above and
 * half below must not report zero. The clip is exact, not sampled.
 */
export function volumeToDatum(tin: Tin, datumZ: number): VolumeResult {
  let cut = 0;
  let fill = 0;

  for (const t of tin.triangles) {
    const idx = [t.a, t.b, t.c];
    const area = Math.abs(signedArea2D(tin.points, t.a, t.b, t.c));
    if (area < EPS) continue;

    const h = idx.map(i => tin.points[i].z - datumZ);
    const above = h.filter(v => v > 0).length;
    const below = h.filter(v => v < 0).length;

    if (below === 0) {
      // Wholly on or above the datum.
      cut += (area * (h[0] + h[1] + h[2])) / 3;
    } else if (above === 0) {
      fill += (area * -(h[0] + h[1] + h[2])) / 3;
    } else {
      const poly: PlanVertex[] = idx.map((i, k) => ({
        x: tin.points[i].x,
        y: tin.points[i].y,
        h: h[k]
      }));
      cut += prismVolume(clipToHalf(poly, true));
      fill += -prismVolume(clipToHalf(poly, false));
    }
  }

  return { cutM3: cut, fillM3: fill, netM3: cut - fill, planAreaM2: planArea(tin) };
}

export interface SurfaceComparison extends VolumeResult {
  /**
   * Plan area of the lower surface with no part of the upper surface over it, m².
   *
   * Non-zero means the two pickups do not cover the same ground and the
   * volume above is only for the overlap. Reported rather than ignored,
   * because a partial overlap quoted as a whole-site quantity is the way a
   * comparison silently under-reads.
   */
  uncoveredAreaM2: number;
  /**
   * Plan area of lower triangles straddling the edge of the upper surface, m².
   *
   * The difference is defined over part of such a triangle and not the rest,
   * so it is left out of the volume and reported here instead of being
   * measured on a fraction of its area and quoted as if whole.
   */
  partialAreaM2: number;
}

/**
 * Volume between two surfaces over their shared plan extent.
 *
 * The upper surface is sampled at the vertices of each lower triangle, so the
 * two need not share vertices — a design surface and an as-built pickup rarely
 * do. The difference is then linear across the triangle and is clipped at zero
 * exactly, so cut and fill are separated within a triangle rather than
 * cancelling: a triangle where the upper surface crosses the lower reports
 * both, not their net.
 *
 * ACCURACY: sampling at the vertices makes the answer exact wherever the upper
 * surface is planar across the lower triangle, and approximate where it folds
 * within one. The resolution is therefore the lower surface's triangle size,
 * so pass the denser of the two pickups as `lower`.
 */
export function volumeBetween(lower: Tin, upper: Tin): SurfaceComparison {
  let cut = 0;
  let fill = 0;
  let coveredArea = 0;
  let uncoveredArea = 0;
  let partialArea = 0;

  for (const t of lower.triangles) {
    const idx = [t.a, t.b, t.c];
    const area = Math.abs(signedArea2D(lower.points, t.a, t.b, t.c));
    if (area < EPS) continue;

    const verts = idx.map(i => lower.points[i]);
    const zUpper = verts.map(v => elevationAt(upper, v.x, v.y));
    const inside = zUpper.filter(z => z !== null).length;

    if (inside === 0) {
      uncoveredArea += area;
      continue;
    }
    if (inside < 3) {
      partialArea += area;
      continue;
    }

    coveredArea += area;
    const h = verts.map((v, k) => (zUpper[k] as number) - v.z);
    const above = h.filter(v => v > 0).length;
    const below = h.filter(v => v < 0).length;

    if (below === 0) {
      cut += (area * (h[0] + h[1] + h[2])) / 3;
    } else if (above === 0) {
      fill += (area * -(h[0] + h[1] + h[2])) / 3;
    } else {
      const poly: PlanVertex[] = verts.map((v, k) => ({ x: v.x, y: v.y, h: h[k] }));
      cut += prismVolume(clipToHalf(poly, true));
      fill += -prismVolume(clipToHalf(poly, false));
    }
  }

  return {
    cutM3: cut,
    fillM3: fill,
    netM3: cut - fill,
    planAreaM2: coveredArea,
    uncoveredAreaM2: uncoveredArea,
    partialAreaM2: partialArea
  };
}

// ---------------------------------------------------------------------------
// Point location
// ---------------------------------------------------------------------------
// `elevationAt` is called once per triangle of the other surface by
// volumeBetween, so a linear scan over the triangles makes a surface
// comparison quadratic — two 5,000-triangle pickups would be 25 million
// barycentric tests. A uniform grid over the triangles' bounding boxes turns
// each lookup into a bucket of a handful of candidates. The index is derived
// wholly from the TIN, so it is cached against it and never has to be
// invalidated: `buildTin` returns a fresh object for every surface.

interface TinIndex {
  minX: number;
  minY: number;
  cellX: number;
  cellY: number;
  cols: number;
  rows: number;
  buckets: number[][];
}

const indexCache = new WeakMap<Tin, TinIndex>();

function buildIndex(tin: Tin): TinIndex {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of tin.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // Aim for a few triangles per cell, bounded so a pathological extent cannot
  // allocate an enormous grid.
  const target = Math.max(1, Math.min(256, Math.ceil(Math.sqrt(tin.triangles.length / 2))));
  const cols = target;
  const rows = target;
  const cellX = (maxX - minX) / cols || 1;
  const cellY = (maxY - minY) / rows || 1;

  const buckets: number[][] = Array.from({ length: cols * rows }, () => []);
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));

  tin.triangles.forEach((t, ti) => {
    const A = tin.points[t.a], B = tin.points[t.b], C = tin.points[t.c];
    const i0 = clamp(Math.floor((Math.min(A.x, B.x, C.x) - minX) / cellX), cols - 1);
    const i1 = clamp(Math.floor((Math.max(A.x, B.x, C.x) - minX) / cellX), cols - 1);
    const j0 = clamp(Math.floor((Math.min(A.y, B.y, C.y) - minY) / cellY), rows - 1);
    const j1 = clamp(Math.floor((Math.max(A.y, B.y, C.y) - minY) / cellY), rows - 1);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) buckets[j * cols + i].push(ti);
    }
  });

  return { minX, minY, cellX, cellY, cols, rows, buckets };
}

/** Height on one triangle's plane, or null when the position is outside it. */
function heightOnTriangle(tin: Tin, t: Triangle, x: number, y: number): number | null {
  const A = tin.points[t.a], B = tin.points[t.b], C = tin.points[t.c];
  const d = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
  if (Math.abs(d) < EPS) return null;
  const w1 = ((B.y - C.y) * (x - C.x) + (C.x - B.x) * (y - C.y)) / d;
  const w2 = ((C.y - A.y) * (x - C.x) + (A.x - C.x) * (y - C.y)) / d;
  const w3 = 1 - w1 - w2;
  if (w1 >= -EPS && w2 >= -EPS && w3 >= -EPS) return w1 * A.z + w2 * B.z + w3 * C.z;
  return null;
}

/**
 * Interpolated height at a plan position, or null when outside the surface.
 *
 * Returns null rather than extrapolating. A height outside the surveyed extent
 * is not a measurement, and quietly extending the nearest triangle's plane is
 * how invented ground gets into a volume.
 */
export function elevationAt(tin: Tin, x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  let idx = indexCache.get(tin);
  if (!idx) {
    idx = buildIndex(tin);
    indexCache.set(tin, idx);
  }

  const i = Math.floor((x - idx.minX) / idx.cellX);
  const j = Math.floor((y - idx.minY) / idx.cellY);
  if (i < -1 || j < -1 || i > idx.cols || j > idx.rows) return null;

  // The neighbouring cells are checked too: a position exactly on a cell
  // boundary, or on the outer edge of the extent, can land a hair outside the
  // cell holding the triangle it belongs to.
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const ci = i + di, cj = j + dj;
      if (ci < 0 || cj < 0 || ci >= idx.cols || cj >= idx.rows) continue;
      for (const ti of idx.buckets[cj * idx.cols + ci]) {
        const z = heightOnTriangle(tin, tin.triangles[ti], x, y);
        if (z !== null) return z;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Contours
// ---------------------------------------------------------------------------

export interface ContourSegment {
  level: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Contour segments at one level, by marching triangles.
 *
 * Exact for a TIN: each face is a plane, so a level crosses it along a single
 * straight segment. No smoothing is applied — a contour drawn here is the
 * intersection of the level with the surveyed surface, not an interpretation
 * of it.
 *
 * A face lying entirely at the level — a flat bench at exactly the contour
 * height — yields no segment, because there the contour is an area rather than
 * a line and drawing its outline would state something the surface does not.
 */
export function contourAt(tin: Tin, level: number): ContourSegment[] {
  const out: ContourSegment[] = [];

  for (const t of tin.triangles) {
    const v = [tin.points[t.a], tin.points[t.b], tin.points[t.c]];
    const crossings: { x: number; y: number }[] = [];

    for (let i = 0; i < 3; i++) {
      const p = v[i];
      const q = v[(i + 1) % 3];
      const dp = p.z - level;
      const dq = q.z - level;
      if ((dp > 0 && dq > 0) || (dp < 0 && dq < 0)) continue;
      if (Math.abs(dp - dq) < EPS) continue; // edge lies in the level plane
      const f = dp / (dp - dq);
      if (f < -EPS || f > 1 + EPS) continue;
      const cx = p.x + f * (q.x - p.x);
      const cy = p.y + f * (q.y - p.y);
      // A vertex sitting exactly on the level is found by both of its edges;
      // de-duplicating keeps the two ends of the real segment rather than
      // discarding the face as a zero-length one.
      if (crossings.some(c => Math.hypot(c.x - cx, c.y - cy) <= EPS)) continue;
      crossings.push({ x: cx, y: cy });
    }

    // Two distinct crossings make one segment; a single touched vertex makes none.
    if (crossings.length >= 2) {
      const [c0, c1] = crossings;
      out.push({ level, x1: c0.x, y1: c0.y, x2: c1.x, y2: c1.y });
    }
  }

  return out;
}

export interface ContourPolyline {
  level: number;
  pts: { x: number; y: number }[];
  /** True when the line returns to its start — a contour around a hill or hollow. */
  closed: boolean;
}

/**
 * Chains contour segments into polylines.
 *
 * `contourAt` yields one segment per triangle, which is correct but useless as
 * a drawing: a modest surface produces thousands of two-point lines, and a
 * CAD or GIS package receiving them cannot label a contour or offset it. Here
 * segments that share an end are joined into a single line, and a line that
 * returns to its start is marked closed.
 *
 * Adjacent triangles compute their shared crossing from the same two vertices,
 * so the two ends agree to within floating-point noise; `toleranceM` is what
 * counts as the same point, and defaults to a micron — far below any survey
 * precision, so it can never merge two genuinely distinct contour ends.
 *
 * Where four segments meet at one node the surface has a saddle, and which
 * pair continues through it is genuinely ambiguous. One consistent choice is
 * made rather than guessing at the ground's intent.
 */
export function linkContours(segments: ContourSegment[], toleranceM = 1e-6): ContourPolyline[] {
  if (!(toleranceM > 0)) throw new Error('Contour join tolerance must be greater than zero.');

  const key = (x: number, y: number) => `${Math.round(x / toleranceM)}_${Math.round(y / toleranceM)}`;

  const byLevel = new Map<number, ContourSegment[]>();
  for (const s of segments) {
    const at = byLevel.get(s.level);
    if (at) at.push(s);
    else byLevel.set(s.level, [s]);
  }

  const out: ContourPolyline[] = [];

  for (const [level, segs] of byLevel) {
    const incident = new Map<string, number[]>();
    const register = (k: string, i: number) => {
      const at = incident.get(k);
      if (at) at.push(i);
      else incident.set(k, [i]);
    };
    segs.forEach((s, i) => {
      register(key(s.x1, s.y1), i);
      register(key(s.x2, s.y2), i);
    });

    const used = new Array<boolean>(segs.length).fill(false);
    const nextAt = (k: string) => {
      for (const j of incident.get(k) ?? []) if (!used[j]) return j;
      return -1;
    };

    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const pts = [
        { x: segs[i].x1, y: segs[i].y1 },
        { x: segs[i].x2, y: segs[i].y2 }
      ];

      // Grow from the tail, then from the head.
      for (const fromTail of [true, false]) {
        for (;;) {
          const tip = fromTail ? pts[pts.length - 1] : pts[0];
          const far = fromTail ? pts[0] : pts[pts.length - 1];
          if (pts.length > 2 && key(tip.x, tip.y) === key(far.x, far.y)) break; // closed
          const j = nextAt(key(tip.x, tip.y));
          if (j < 0) break;
          used[j] = true;
          const s = segs[j];
          const other =
            key(s.x1, s.y1) === key(tip.x, tip.y) ? { x: s.x2, y: s.y2 } : { x: s.x1, y: s.y1 };
          if (fromTail) pts.push(other);
          else pts.unshift(other);
        }
      }

      const closed =
        pts.length > 3 && key(pts[0].x, pts[0].y) === key(pts[pts.length - 1].x, pts[pts.length - 1].y);
      out.push({ level, pts, closed });
    }
  }

  return out;
}

/** Contours across the surface's height range at a fixed interval. */
export function contourSet(tin: Tin, intervalM: number): ContourSegment[] {
  if (!(intervalM > 0)) throw new Error('Contour interval must be greater than zero.');

  const zs = tin.points.map(p => p.z);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  if (maxZ - minZ < EPS) return []; // a level surface has no contours

  const span = maxZ - minZ;
  if (span / intervalM > 5000) {
    throw new Error(
      `An interval of ${intervalM} m over a ${span.toFixed(1)} m range would produce more than 5000 contours. Use a coarser interval.`
    );
  }

  const out: ContourSegment[] = [];
  const first = Math.ceil(minZ / intervalM) * intervalM;
  for (let level = first; level <= maxZ + EPS; level += intervalM) {
    out.push(...contourAt(tin, level));
  }
  return out;
}
