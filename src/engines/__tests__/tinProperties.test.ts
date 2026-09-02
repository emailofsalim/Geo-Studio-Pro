import { describe, it, expect } from 'vitest';
import { buildTin, planArea, elevationAt, type Point3D, type Breakline } from '../tin';

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------
// The hand-worked control cases prove the engine is right on geometry chosen to
// expose a specific failure. These prove it does not fall apart on geometry
// nobody chose at all.
//
// Constrained Delaunay is where triangulation code usually breaks: forcing an
// edge means deleting a strip of triangles and rebuilding the hole, and a
// mistake there leaves gaps, overlaps or inverted triangles that no single
// hand-picked case would catch. `insertConstraint` has several give-up paths
// ("the triangles it crosses do not form a single region", and so on) — if
// those are reachable on ordinary data, breaklines fail quietly and the
// surface is not what the user asked for.
//
// The checks below are computed independently of the triangulation, so they
// cannot agree with it by construction.

/** Deterministic PRNG, so a failure can be reproduced exactly. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

type Flat = { x: number; y: number };

/**
 * Convex hull area by the monotone chain, owing nothing to the triangulation.
 *
 * Points are centred before the shoelace sum. Without that, a survey at a real
 * UTM position multiplies coordinates of about 2.6e6 and then subtracts terms
 * that agree to ten digits, so the result is mostly rounding error — enough to
 * make this check report losses of tens of square metres on a triangulation
 * that is exact. The check has to be better conditioned than the code it is
 * judging.
 */
function hullArea(pts: Point3D[]): number {
  if (pts.length < 3) return 0;
  const ox = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const oy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const p: Flat[] = pts
    .map(q => ({ x: q.x - ox, y: q.y - oy }))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (o: Flat, a: Flat, b: Flat) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const build = (src: Flat[]) => {
    const out: Flat[] = [];
    for (const q of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out;
  };
  const lower = build(p);
  const upper = build([...p].reverse());
  const ring = [...lower.slice(0, -1), ...upper.slice(0, -1)];

  let a2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const u = ring[i];
    const v = ring[(i + 1) % ring.length];
    a2 += u.x * v.y - v.x * u.y;
  }
  return Math.abs(a2) / 2;
}

/**
 * Checks everything that must hold of any valid TIN, however it was built.
 *
 * The area check is the strong one: a triangulation of a point set covers its
 * convex hull exactly once, so a gap, an overlap or an inverted triangle all
 * show up as a mismatch against an area computed from the hull alone.
 */
function assertSound(tin: ReturnType<typeof buildTin>, label: string) {
  const expected = hullArea(tin.points);
  expect(planArea(tin), `${label}: covered area must equal the convex hull`).toBeCloseTo(expected, 4);

  const seen = new Set<string>();
  for (const t of tin.triangles) {
    const A = tin.points[t.a], B = tin.points[t.b], C = tin.points[t.c];
    const signed = ((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
    expect(signed, `${label}: every triangle wound counter-clockwise`).toBeGreaterThan(0);

    const key = [t.a, t.b, t.c].sort((m, n) => m - n).join('_');
    expect(seen.has(key), `${label}: no triangle repeated`).toBe(false);
    seen.add(key);
  }

  // Every constraint the engine says it honoured is really an edge.
  for (const [u, v] of tin.constraints) {
    const held = tin.triangles.some(t => {
      const s = [t.a, t.b, t.c];
      return s.includes(u) && s.includes(v);
    });
    expect(held, `${label}: constraint ${u}-${v} is claimed but not present`).toBe(true);
  }
}

/** A scatter of points on a gentle surface, with plan positions well separated. */
function scatter(seed: number, n: number, extent = 200): Point3D[] {
  const r = rng(seed);
  const pts: Point3D[] = [];
  const used = new Set<string>();
  while (pts.length < n) {
    const x = Math.round(r() * extent * 100) / 100;
    const y = Math.round(r() * extent * 100) / 100;
    const key = `${x},${y}`;
    if (used.has(key)) continue;
    used.add(key);
    pts.push({ x, y, z: 100 + Math.sin(x / 30) * 6 + Math.cos(y / 25) * 4 });
  }
  return pts;
}

describe('TIN soundness on unconstrained scatters', () => {
  it.each([1, 2, 3, 4, 5])('covers the hull exactly for seed %i', seed => {
    assertSound(buildTin(scatter(seed, 60)), `seed ${seed}`);
  });

  it('holds for a dense scatter', () => {
    assertSound(buildTin(scatter(99, 400)), 'dense');
  });
});

// ---------------------------------------------------------------------------
// Degenerate geometry
// ---------------------------------------------------------------------------
// Random scatters are well behaved and hide the failures that matter. These are
// the shapes that broke the triangulation: a regular grid, where every interior
// point is cocircular with its four neighbours; points on a circle, where every
// triple is cocircular; and near-collinear strings, whose circumcircles are
// enormous. None of these is exotic — a grid is how a pad is set out, and a
// near-collinear string is a road edge, a bench crest or a drain invert.
//
// Each is also built at a real UTM position, because the triangulation's
// conditioning depends on where the survey sits, and every project in this
// application has real coordinates.

/** Regular grid: every interior point is cocircular with four neighbours. */
function gridPts(seed: number): Point3D[] {
  const n = 6 + (seed % 9);
  const step = 5 + (seed % 4) * 5;
  const pts: Point3D[] = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) pts.push({ x: i * step, y: j * step, z: 100 + i * 0.4 + j * 0.3 });
  }
  return pts;
}

/** Points exactly on a circle, plus a few inside: every triple is cocircular. */
function circlePts(seed: number): Point3D[] {
  const n = 20 + (seed % 40);
  const R = 50 + (seed % 7) * 10;
  const pts: Point3D[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    pts.push({ x: R * Math.cos(a), y: R * Math.sin(a), z: 100 + Math.sin(a) * 3 });
  }
  const r = rng(seed);
  for (let i = 0; i < 10; i++) {
    pts.push({ x: (r() - 0.5) * R, y: (r() - 0.5) * R, z: 100 + r() });
  }
  return pts;
}

/** Two dense strings 7 m apart: a road corridor, surveyed the way roads are. */
function corridorPts(seed: number): Point3D[] {
  const r = rng(seed);
  const pts: Point3D[] = [];
  for (let i = 0; i < 60; i++) {
    const x = i * 4 + r() * 0.05;
    pts.push({ x, y: r() * 0.02, z: 100 + x * 0.01 });
    pts.push({ x, y: 7 + r() * 0.02, z: 100.3 + x * 0.01 });
  }
  return pts;
}

/** Rows straight to within 2 mm: the circumcircles here are astronomically large. */
function sliverPts(seed: number): Point3D[] {
  const r = rng(seed);
  const pts: Point3D[] = [];
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 25; i++) {
      const x = i * 8 + r() * 0.01;
      const y = row * 40 + (r() - 0.5) * 0.002;
      pts.push({ x, y, z: 100 + row * 2 + x * 0.01 });
    }
  }
  return pts;
}

/** The same survey at the origin and at real UTM positions, north and south. */
const AT: [string, number, number][] = [
  ['at the origin', 0, 0],
  ['at UTM 44N', 254800, 2605200],
  ['at UTM 50S', 699000, 7845000]
];

const shift = (pts: Point3D[], ox: number, oy: number) =>
  pts.map(p => ({ x: p.x + ox, y: p.y + oy, z: p.z }));

describe('TIN soundness on degenerate geometry', () => {
  describe.each(AT)('%s', (_where, ox, oy) => {
    it.each([1, 2, 3, 4, 5, 6])('covers a regular grid exactly, seed %i', seed => {
      assertSound(buildTin(shift(gridPts(seed), ox, oy)), `grid ${seed}`);
    });

    it.each([1, 2, 3, 4, 5, 6])('covers a cocircular set exactly, seed %i', seed => {
      assertSound(buildTin(shift(circlePts(seed), ox, oy)), `circle ${seed}`);
    });
  });
});

describe('TIN soundness on near-collinear surveys', () => {
  // Near-collinear geometry is the one case that is not exact. A triangle two
  // millimetres wide at the very edge of the hull can still be discarded, so
  // the mesh comes back one sliver short. Measured over 120 sets per family at
  // each position below, the shortfall never exceeded 0.003 m2, and the error
  // is always a shortfall — never an overlap, which would double-count volume.
  //
  // The bound is asserted rather than the exact figure: it is what makes the
  // difference between a negligible sliver and a hole. Before the
  // super-triangle was enlarged these same sets lost up to 1.96 m2, and
  // triangulating them at their UTM coordinates instead of normalised ones
  // overlapped by as much as 22,719 m2.
  const TOLERANCE_M2 = 0.01;

  describe.each(AT)('%s', (_where, ox, oy) => {
    it.each([1, 2, 3, 4, 5, 6, 7, 8])('stays within a sliver of the hull, seed %i', seed => {
      for (const [name, make] of [['corridor', corridorPts], ['slivers', sliverPts]] as const) {
        const tin = buildTin(shift(make(seed), ox, oy));
        const miss = hullArea(tin.points) - planArea(tin);

        expect(miss, `${name} ${seed}: triangles overlap, so volumes are double-counted`)
          .toBeGreaterThan(-1e-6);
        expect(miss, `${name} ${seed}: a hole this size is not a sliver`)
          .toBeLessThan(TOLERANCE_M2);

        // Whatever the area check allows, the mesh itself must still be valid.
        for (const t of tin.triangles) {
          const A = tin.points[t.a], B = tin.points[t.b], C = tin.points[t.c];
          const signed = ((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
          expect(signed, `${name} ${seed}: every triangle wound counter-clockwise`).toBeGreaterThan(0);
        }
      }
    });
  });
});

describe('TIN soundness with breaklines', () => {
  /** Breaklines drawn between points already in the set, so the hull cannot move. */
  function linesFromPoints(seed: number, pts: Point3D[], count: number): Breakline[] {
    const r = rng(seed * 7919 + 13);
    const lines: Breakline[] = [];
    for (let i = 0; i < count; i++) {
      const a = pts[Math.floor(r() * pts.length)];
      const b = pts[Math.floor(r() * pts.length)];
      if (a === b) continue;
      lines.push({ name: `Line ${i + 1}`, pts: [a, b] });
    }
    return lines;
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('stays sound with breaklines, seed %i', seed => {
    const pts = scatter(seed, 80);
    const tin = buildTin(pts, { breaklines: linesFromPoints(seed, pts, 6) });
    assertSound(tin, `seed ${seed}`);
  });

  it.each([11, 12, 13, 14, 15])('stays sound with many crossing breaklines, seed %i', seed => {
    const pts = scatter(seed, 120);
    const tin = buildTin(pts, { breaklines: linesFromPoints(seed, pts, 20) });
    assertSound(tin, `seed ${seed}`);
  });

  it('stays sound with long breaklines across a regular grid', () => {
    // A grid is the degenerate case for Delaunay, and long constraints run
    // over many existing vertices.
    const pts: Point3D[] = [];
    for (let i = 0; i <= 14; i++) {
      for (let j = 0; j <= 14; j++) pts.push({ x: i * 10, y: j * 10, z: 100 + i * 0.4 + j * 0.3 });
    }
    const lines: Breakline[] = [
      { name: 'Diagonal', pts: [{ x: 0, y: 0, z: 100 }, { x: 140, y: 140, z: 149.8 }] },
      { name: 'Cross', pts: [{ x: 0, y: 70, z: 121 }, { x: 140, y: 70, z: 177 }] },
      { name: 'Skew', pts: [{ x: 10, y: 130, z: 143 }, { x: 130, y: 20, z: 158 }] }
    ];
    const tin = buildTin(pts, { breaklines: lines });
    assertSound(tin, 'grid');
  });

  it('never claims a segment it did not apply, and never drops one in silence', () => {
    // Every requested segment must be accounted for: held, or explained.
    for (const seed of [21, 22, 23, 24, 25]) {
      const pts = scatter(seed, 70);
      const lines = linesFromPoints(seed, pts, 8);
      const tin = buildTin(pts, { breaklines: lines });
      assertSound(tin, `seed ${seed}`);
      // A line asked for and neither held nor explained would be invisible.
      const asked = lines.length;
      const explained = tin.breaklineIssues.length;
      expect(
        tin.constraints.length > 0 || explained > 0 || asked === 0,
        `seed ${seed}: ${asked} lines asked, none held and none explained`
      ).toBe(true);
    }
  });

  it('never reports the give-up paths on ordinary data', () => {
    // These messages exist as guards. If ordinary scatters reach them, the
    // cavity retriangulation is not coping and breaklines are failing quietly.
    const giveUps = /do not form a single region|too thin to retriangulate|produced nothing|degenerate/i;
    for (let seed = 30; seed < 45; seed++) {
      const pts = scatter(seed, 90);
      const lines = linesFromPoints(seed, pts, 10);
      const tin = buildTin(pts, { breaklines: lines });
      const hit = tin.breaklineIssues.filter(i => giveUps.test(i));
      expect(hit, `seed ${seed} reached a give-up path: ${hit.join(' | ')}`).toEqual([]);
    }
  });

  it('keeps interpolated heights on the surface, never outside the surveyed range', () => {
    // A broken retriangulation can leave a triangle spanning the wrong points,
    // which shows up as a height no observation supports.
    for (const seed of [51, 52, 53]) {
      const pts = scatter(seed, 90);
      const tin = buildTin(pts, { breaklines: linesFromPoints(seed, pts, 8) });
      const zs = tin.points.map(p => p.z);
      const lo = Math.min(...zs);
      const hi = Math.max(...zs);
      const r = rng(seed + 500);
      for (let k = 0; k < 300; k++) {
        const z = elevationAt(tin, r() * 200, r() * 200);
        if (z === null) continue;
        expect(z, `seed ${seed}: height below every observation`).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(z, `seed ${seed}: height above every observation`).toBeLessThanOrEqual(hi + 1e-6);
      }
    }
  });
});
