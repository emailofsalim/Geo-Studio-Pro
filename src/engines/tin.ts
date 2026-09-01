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

/**
 * A line the surface must break along — a crest, a toe, a road edge, a ditch.
 *
 * Its vertices carry surveyed heights like any other point, and the
 * triangulation is forced to use the segments between them as triangle edges.
 * Without that, a Delaunay triangulation is free to span across the feature
 * and will do so whenever the circumcircle test prefers it: a ridge gets a
 * triangle bridging its two flanks, so the modelled crest sags to the
 * interpolated height of ground either side of it. Nothing in the output says
 * this happened — the surface is simply wrong, and every volume taken from it
 * with it.
 */
export interface Breakline {
  /** Ordered points along the line. Consecutive pairs become forced edges. */
  pts: Point3D[];
  /** Optional label, used when reporting a segment that could not be honoured. */
  name?: string;
}

export interface TinOptions {
  /** Lines the triangulation must break along. */
  breaklines?: Breakline[];
}

export interface Tin {
  points: Point3D[];
  triangles: Triangle[];
  /** Points discarded as duplicates before triangulation. */
  duplicatesRemoved: number;
  /**
   * Breakline segments the triangulation honours, as index pairs into `points`.
   *
   * Every requested segment either appears here or is explained in
   * `breaklineIssues`. A breakline silently dropped would leave a surface that
   * looks constrained and is not.
   */
  constraints: [number, number][];
  /** Breakline segments that could not be honoured, and why. */
  breaklineIssues: string[];
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

// ---------------------------------------------------------------------------
// Constraints (breaklines)
// ---------------------------------------------------------------------------
// Forcing an edge into a finished Delaunay triangulation, by the standard
// cavity method: remove the triangles the edge crosses, which leaves a simple
// polygon split in two by the edge, then re-triangulate each half. The halves
// are triangulated Delaunay-optimally, so the result is a constrained Delaunay
// triangulation — as close to Delaunay as the constraint permits, rather than
// an arbitrary retriangulation.

/** True when `ab` and `cd` cross at a point interior to both. Shared endpoints do not count. */
function segmentsCross(p: Point3D[], a: number, b: number, c: number, d: number): boolean {
  if (a === c || a === d || b === c || b === d) return false;
  const d1 = signedArea2D(p, c, d, a);
  const d2 = signedArea2D(p, c, d, b);
  const d3 = signedArea2D(p, a, b, c);
  const d4 = signedArea2D(p, a, b, d);
  return (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  );
}

/**
 * Vertices lying on the open segment `u`-`v`, ordered from `u` towards `v`.
 *
 * An edge cannot pass through a vertex without using it, so a constraint that
 * runs over existing points has to be split at each one. This is not a corner
 * case: a haul road or bench toe drawn across a gridded survey passes through
 * a grid vertex at every step, and without splitting none of those steps is a
 * proper crossing of anything, so the whole line would be refused.
 *
 * The tolerance is a micron of perpendicular distance — far below survey
 * precision, so it cannot capture a point that genuinely sits off the line.
 */
function verticesOnSegment(p: Point3D[], u: number, v: number): number[] {
  const a = p[u];
  const b = p[v];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return [];
  const len = Math.sqrt(len2);

  const on: { i: number; t: number }[] = [];
  for (let i = 0; i < p.length; i++) {
    if (i === u || i === v) continue;
    const c = p[i];
    // |cross| / |ab| is the perpendicular distance from the point to the line.
    const cross = (c.x - a.x) * dy - (c.y - a.y) * dx;
    if (Math.abs(cross) > 1e-6 * len) continue;
    const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2;
    if (t > EPS && t < 1 - EPS) on.push({ i, t });
  }
  on.sort((m, n) => m.t - n.t);
  return on.map(o => o.i);
}

/** True when some triangle already carries the edge `u`-`v`. */
function hasEdge(tris: Triangle[], u: number, v: number): boolean {
  for (const t of tris) {
    if (
      (t.a === u && t.b === v) || (t.b === u && t.a === v) ||
      (t.b === u && t.c === v) || (t.c === u && t.b === v) ||
      (t.c === u && t.a === v) || (t.a === u && t.c === v)
    ) {
      return true;
    }
  }
  return false;
}

/** True when `d` lies strictly inside the circumcircle of `a`, `b`, `c`. */
function insideCircumcircle(p: Point3D[], a: number, b: number, c: number, d: number): boolean {
  const cc = circumcircle(p, a, b, c);
  if (!cc) return false;
  return (p[d].x - cc.cx) ** 2 + (p[d].y - cc.cy) ** 2 < cc.r2 - EPS;
}

/** Appends a triangle wound counter-clockwise, skipping degenerate ones. */
function pushWound(p: Point3D[], out: Triangle[], a: number, b: number, c: number): void {
  const area = signedArea2D(p, a, b, c);
  if (Math.abs(area) < EPS) return;
  out.push(area > 0 ? { a, b, c } : { a, b: c, c: b });
}

/**
 * Triangulates a simple polygon whose first and last vertices are joined by the
 * constraint edge.
 *
 * Picks, for each sub-polygon, the vertex whose circumcircle with the two ends
 * contains no other vertex of the polygon — the Delaunay choice — then recurses
 * on the two halves it creates.
 */
function triangulateCavity(p: Point3D[], poly: number[], out: Triangle[]): void {
  const n = poly.length;
  if (n < 3) return;
  if (n === 3) {
    pushWound(p, out, poly[0], poly[1], poly[2]);
    return;
  }
  let best = 1;
  for (let i = 2; i < n - 1; i++) {
    if (insideCircumcircle(p, poly[0], poly[n - 1], poly[best], poly[i])) best = i;
  }
  pushWound(p, out, poly[0], poly[best], poly[n - 1]);
  triangulateCavity(p, poly.slice(0, best + 1), out);
  triangulateCavity(p, poly.slice(best, n), out);
}

/** Walks a set of boundary edges into a single closed ring, or null if they do not form one. */
function ringFromEdges(edges: [number, number][]): number[] | null {
  const adj = new Map<number, number[]>();
  for (const [u, v] of edges) {
    if (!adj.has(u)) adj.set(u, []);
    if (!adj.has(v)) adj.set(v, []);
    adj.get(u)!.push(v);
    adj.get(v)!.push(u);
  }
  // A simple ring has exactly two neighbours at every vertex. Anything else is
  // a pinched or branching cavity, which this method cannot resolve.
  for (const list of adj.values()) if (list.length !== 2) return null;

  const start = edges[0][0];
  const ring: number[] = [start];
  let prev = -1;
  let cur = start;
  for (;;) {
    const [n1, n2] = adj.get(cur)!;
    const next = n1 === prev ? n2 : n1;
    if (next === start) break;
    if (ring.length > edges.length) return null; // did not close
    ring.push(next);
    prev = cur;
    cur = next;
  }
  return ring.length === adj.size ? ring : null;
}

/**
 * Forces the edge `u`-`v` into the triangulation.
 *
 * Returns null on success, or a short reason it could not be done. The reasons
 * are surfaced to the caller rather than swallowed: a breakline that was asked
 * for and not applied leaves a surface that looks constrained and is not.
 */
function insertConstraint(p: Point3D[], tris: Triangle[], u: number, v: number): string | null {
  if (u === v) return 'its two ends are the same point';
  if (hasEdge(tris, u, v)) return null;

  const crossed: number[] = [];
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    if (
      segmentsCross(p, u, v, t.a, t.b) ||
      segmentsCross(p, u, v, t.b, t.c) ||
      segmentsCross(p, u, v, t.c, t.a)
    ) {
      crossed.push(i);
    }
  }
  if (crossed.length === 0) {
    // Unreachable on well-formed input: the ends are both surface points, the
    // hull is convex, and any vertex lying on the way has already split the
    // segment. Kept as a guard, worded for what would actually be true.
    return 'no triangle lies between its two ends, so the ground there is degenerate';
  }

  // The cavity boundary is the set of edges belonging to exactly one of the
  // removed triangles — the same counting trick the point insertion uses.
  const once = new Map<string, [number, number]>();
  const bump = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (once.has(key)) once.delete(key);
    else once.set(key, [a, b]);
  };
  for (const i of crossed) {
    const t = tris[i];
    bump(t.a, t.b);
    bump(t.b, t.c);
    bump(t.c, t.a);
  }

  const ring = ringFromEdges([...once.values()]);
  if (!ring) return 'the triangles it crosses do not form a single region';

  const iu = ring.indexOf(u);
  const iv = ring.indexOf(v);
  if (iu < 0 || iv < 0) return 'one of its ends is not on the edge of the region it crosses';

  // The ring, cut at u and v, gives the two polygons either side of the edge.
  const side = (from: number, to: number): number[] => {
    const out: number[] = [];
    for (let i = from; ; i = (i + 1) % ring.length) {
      out.push(ring[i]);
      if (i === to) break;
      if (out.length > ring.length) return [];
    }
    return out;
  };
  const left = side(iu, iv);
  const right = side(iv, iu);
  if (left.length < 3 || right.length < 3) return 'the region it crosses is too thin to retriangulate';

  const replacement: Triangle[] = [];
  triangulateCavity(p, left, replacement);
  triangulateCavity(p, right, replacement);
  if (replacement.length === 0) return 'retriangulating the region it crosses produced nothing';

  const drop = new Set(crossed);
  const kept = tris.filter((_, i) => !drop.has(i));
  tris.length = 0;
  tris.push(...kept, ...replacement);
  return null;
}

/**
 * Builds a Delaunay TIN from surveyed points, honouring any breaklines given.
 *
 * Bowyer-Watson incremental insertion. Duplicate plan positions are dropped —
 * two observations at the same easting and northing cannot both define the
 * surface there, and keeping them degenerates the triangulation.
 *
 * Breakline vertices join the point set and their segments are then forced in
 * as triangle edges, giving a constrained Delaunay triangulation. Anything that
 * could not be honoured is reported in `breaklineIssues` rather than dropped.
 *
 * Throws when the points cannot form a surface, rather than returning an empty
 * TIN that would silently compute a volume of zero.
 */
export function buildTin(input: Point3D[], options: TinOptions = {}): Tin {
  if (!Array.isArray(input) || input.length < 3) {
    throw new Error('A surface needs at least three points.');
  }

  const breaklines = options.breaklines ?? [];
  const breaklineIssues: string[] = [];

  // Drop duplicate plan positions, keeping the first observation.
  const indexByPosition = new Map<string, number>();
  const points: Point3D[] = [];
  let duplicatesRemoved = 0;

  const planKey = (p: Point3D) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;

  for (const p of input) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y) || !Number.isFinite(p?.z)) {
      throw new Error('Every surface point needs finite x, y and z values.');
    }
    const key = planKey(p);
    if (indexByPosition.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    indexByPosition.set(key, points.length);
    points.push({ x: p.x, y: p.y, z: p.z });
  }

  // Breakline vertices become surface points. Where one falls on a position
  // already surveyed, the existing observation is kept — the same rule as any
  // other duplicate — but a disagreement in height is reported rather than
  // absorbed, because the two sources are stating different things about the
  // same piece of ground.
  const lineIndices: { name: string; idx: number[] }[] = [];
  breaklines.forEach((line, li) => {
    const name = line?.name?.trim() || `Breakline ${li + 1}`;
    const pts = Array.isArray(line?.pts) ? line.pts : [];
    if (pts.length < 2) {
      breaklineIssues.push(`${name} has fewer than two points, so it defines no edge.`);
      return;
    }
    const idx: number[] = [];
    for (const p of pts) {
      if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y) || !Number.isFinite(p?.z)) {
        throw new Error(`${name} has a point without finite x, y and z values.`);
      }
      const key = planKey(p);
      const existing = indexByPosition.get(key);
      if (existing !== undefined) {
        const held = points[existing].z;
        if (Math.abs(held - p.z) > 1e-3) {
          breaklineIssues.push(
            `${name} gives ${p.z.toFixed(3)} m at ${p.x.toFixed(3)}, ${p.y.toFixed(3)}, where a point of ${held.toFixed(3)} m was already surveyed. The surveyed height was kept.`
          );
        }
        idx.push(existing);
        continue;
      }
      indexByPosition.set(key, points.length);
      points.push({ x: p.x, y: p.y, z: p.z });
      idx.push(points.length - 1);
    }
    lineIndices.push({ name, idx });
  });

  if (points.length < 3) {
    throw new Error('A surface needs at least three points at distinct positions.');
  }

  // ---- Resolve breakline crossings, before anything is triangulated -------
  // Two breaklines that cross meet at a point which, on the ground, has one
  // elevation. Usually both lines agree on it — a haul road crossing a toe at
  // grade, say — and then there is nothing ambiguous to resolve: the junction
  // becomes a vertex and both lines are split there. Only a genuine
  // disagreement is refused, and then the two heights are quoted so the
  // surveyor can see exactly what is wrong.
  //
  // This runs before triangulation because a junction is a new surface point,
  // and a point added afterwards would not be part of the mesh.
  interface Segment {
    name: string;
    u: number;
    v: number;
  }
  const segments: Segment[] = [];
  for (const { name, idx } of lineIndices) {
    for (let i = 0; i + 1 < idx.length; i++) {
      if (idx[i] !== idx[i + 1]) segments.push({ name, u: idx[i], v: idx[i + 1] });
    }
  }

  /** Adds a point, reusing an existing one at the same plan position. */
  const pointAt = (x: number, y: number, z: number): number => {
    const key = planKey({ x, y, z });
    const existing = indexByPosition.get(key);
    if (existing !== undefined) return existing;
    indexByPosition.set(key, points.length);
    points.push({ x, y, z });
    return points.length - 1;
  };

  // Two lines crossing at the same height is agreement to survey precision;
  // a millimetre apart is the same point, a decimetre apart is a contradiction.
  const JUNCTION_TOLERANCE_M = 0.001;
  const refused = new Set<Segment>();

  for (let guard = 0; guard < 500; guard++) {
    let resolvedOne = false;

    search: for (let i = 0; i < segments.length; i++) {
      if (refused.has(segments[i])) continue;
      for (let j = i + 1; j < segments.length; j++) {
        if (refused.has(segments[j])) continue;
        const a = segments[i];
        const b = segments[j];
        if (!segmentsCross(points, a.u, a.v, b.u, b.v)) continue;

        const p1 = points[a.u], p2 = points[a.v];
        const p3 = points[b.u], p4 = points[b.v];
        const den = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
        if (Math.abs(den) < EPS) {
          refused.add(a);
          refused.add(b);
          resolvedOne = true;
          break search;
        }
        const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / den;
        const s = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / den;
        const x = p1.x + t * (p2.x - p1.x);
        const y = p1.y + t * (p2.y - p1.y);
        const zOnA = p1.z + t * (p2.z - p1.z);
        const zOnB = p3.z + s * (p4.z - p3.z);

        if (Math.abs(zOnA - zOnB) > JUNCTION_TOLERANCE_M) {
          breaklineIssues.push(
            `${a.name} and ${b.name} cross at ${x.toFixed(3)}, ${y.toFixed(3)}, where one is ${zOnA.toFixed(3)} m and the other ${zOnB.toFixed(3)} m — ${Math.abs(zOnA - zOnB).toFixed(3)} m apart. Neither segment was applied. Survey the junction and give both lines that height.`
          );
          refused.add(a);
          refused.add(b);
          resolvedOne = true;
          break search;
        }

        // They agree, so the junction is simply a point on both lines.
        const k = pointAt(x, y, (zOnA + zOnB) / 2);
        segments.splice(j, 1);
        segments.splice(i, 1);
        segments.push(
          { name: a.name, u: a.u, v: k },
          { name: a.name, u: k, v: a.v },
          { name: b.name, u: b.u, v: k },
          { name: b.name, u: k, v: b.v }
        );
        resolvedOne = true;
        break search;
      }
    }

    if (!resolvedOne) break;
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

  // ---- Force the surviving breakline segments in ------------------------
  // Any surveyed point sitting on a segment becomes part of the line: an edge
  // cannot run through a vertex without using it. Junction points added above
  // are included, which is why this split happens here and not earlier.
  const constraints: [number, number][] = [];
  for (const seg of segments) {
    if (refused.has(seg)) continue;
    const chain = [seg.u, ...verticesOnSegment(points, seg.u, seg.v), seg.v];
    for (let k = 0; k + 1 < chain.length; k++) {
      const u = chain[k];
      const v = chain[k + 1];
      const failure = insertConstraint(points, triangles, u, v);
      if (failure) {
        breaklineIssues.push(`A segment of ${seg.name} was not applied because ${failure}.`);
      } else {
        constraints.push([u, v]);
      }
    }
  }

  return { points, triangles, duplicatesRemoved, constraints, breaklineIssues };
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
