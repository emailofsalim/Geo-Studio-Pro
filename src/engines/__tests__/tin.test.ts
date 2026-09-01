import { describe, it, expect } from 'vitest';
import {
  buildTin,
  planArea,
  surfaceArea3D,
  volumeToDatum,
  volumeBetween,
  elevationAt,
  contourAt,
  contourSet,
  linkContours,
  type Point3D,
  type Triangle
} from '../tin';

// ---------------------------------------------------------------------------
// Control surfaces
// ---------------------------------------------------------------------------
// Every surface below has a volume, area and contour position that can be
// worked out on paper, so a failure here means the engine is wrong rather than
// that the expected number was read off a previous run.

/** A level 100 x 100 m pad at a fixed height. */
const flatPad = (z: number): Point3D[] => [
  { x: 0, y: 0, z },
  { x: 100, y: 0, z },
  { x: 100, y: 100, z },
  { x: 0, y: 100, z }
];

/** A 100 x 100 m plane ramping 1 in 10 along x: z = x / 10, so 0 m to 10 m. */
const ramp: Point3D[] = [
  { x: 0, y: 0, z: 0 },
  { x: 100, y: 0, z: 10 },
  { x: 100, y: 100, z: 10 },
  { x: 0, y: 100, z: 0 }
];

/** A square pyramid: 100 x 100 m base at z = 0, apex 30 m up at the centre. */
const pyramid: Point3D[] = [...flatPad(0), { x: 50, y: 50, z: 30 }];

/** A regular grid, which is the degenerate case for a Delaunay triangulation. */
function grid(n: number, step: number, z: (x: number, y: number) => number): Point3D[] {
  const pts: Point3D[] = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      pts.push({ x: i * step, y: j * step, z: z(i * step, j * step) });
    }
  }
  return pts;
}

describe('buildTin', () => {
  it('triangulates a square into two triangles covering it exactly', () => {
    const tin = buildTin(flatPad(0));
    expect(tin.triangles).toHaveLength(2);
    expect(planArea(tin)).toBeCloseTo(10000, 6);
  });

  it('fans a pyramid into four faces around the apex', () => {
    const tin = buildTin(pyramid);
    expect(tin.triangles).toHaveLength(4);
    // Every face must use the apex, which is the last input point.
    const apex = 4;
    for (const t of tin.triangles) {
      expect([t.a, t.b, t.c]).toContain(apex);
    }
  });

  it('tiles a regular grid with no gaps and no overlaps', () => {
    // A square grid is the hard case: its points are cocircular in fours, so a
    // careless in-circle test leaves holes or double-covers cells. The plan
    // area of the triangles must still come to the area of the hull.
    const tin = buildTin(grid(10, 10, () => 0));
    expect(planArea(tin)).toBeCloseTo(10000, 6);
    expect(tin.points).toHaveLength(121);
  });

  it('winds every triangle counter-clockwise', () => {
    const tin = buildTin(pyramid);
    for (const t of tin.triangles) {
      const A = tin.points[t.a], B = tin.points[t.b], C = tin.points[t.c];
      const signed = ((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
      expect(signed).toBeGreaterThan(0);
    }
  });

  it('drops a repeated plan position and says how many it dropped', () => {
    // Two shots at the same easting and northing cannot both define the
    // surface there, so the second is discarded rather than degenerating the
    // triangulation - but the count is reported, not hidden.
    const tin = buildTin([...flatPad(0), { x: 0, y: 0, z: 7 }, { x: 100, y: 0, z: 9 }]);
    expect(tin.duplicatesRemoved).toBe(2);
    expect(tin.points).toHaveLength(4);
    // The first observation is the one kept.
    expect(tin.points[0].z).toBe(0);
  });

  it('refuses points that do not define a surface instead of returning nothing', () => {
    // An empty TIN would compute a volume of zero, which reads as a real
    // measurement. These have to throw.
    expect(() => buildTin([])).toThrow(/at least three/i);
    expect(() => buildTin([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }])).toThrow(/at least three/i);
    expect(() =>
      buildTin([
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 1 },
        { x: 20, y: 0, z: 2 },
        { x: 30, y: 0, z: 3 }
      ])
    ).toThrow(/collinear/i);
  });

  it('refuses a point with a missing or non-finite height', () => {
    expect(() => buildTin([...flatPad(0), { x: 50, y: 50, z: NaN }])).toThrow(/finite/i);
    expect(() =>
      buildTin([...flatPad(0), { x: 50, y: 50 } as unknown as Point3D])
    ).toThrow(/finite/i);
  });

  it('refuses points that are all at one position', () => {
    const same = [
      { x: 5, y: 5, z: 1 },
      { x: 5, y: 5, z: 2 },
      { x: 5, y: 5, z: 3 }
    ];
    expect(() => buildTin(same)).toThrow(/distinct positions/i);
  });
});

describe('areas', () => {
  it('reports plan area for a level surface and 3D area equal to it', () => {
    const tin = buildTin(flatPad(12.5));
    expect(planArea(tin)).toBeCloseTo(10000, 6);
    expect(surfaceArea3D(tin)).toBeCloseTo(10000, 6);
  });

  it('reports a larger 3D area than plan area on sloping ground', () => {
    // A 1-in-10 plane: every square metre in plan is sqrt(1 + 0.1^2) m2 of
    // ground, so 10,000 m2 in plan is 10,049.876 m2 of surface.
    const tin = buildTin(ramp);
    expect(planArea(tin)).toBeCloseTo(10000, 6);
    expect(surfaceArea3D(tin)).toBeCloseTo(10000 * Math.sqrt(1.01), 4);
    expect(surfaceArea3D(tin)).toBeGreaterThan(planArea(tin));
  });

  it('measures the four sloping faces of the pyramid, not its footprint', () => {
    // Each face has |u x v| = sqrt(34e6), so its area is sqrt(34e6)/2 and the
    // four together are 2 * sqrt(34e6) = 11,661.904 m2.
    const tin = buildTin(pyramid);
    expect(surfaceArea3D(tin)).toBeCloseTo(2 * Math.sqrt(34_000_000), 4);
    expect(planArea(tin)).toBeCloseTo(10000, 6);
  });
});

describe('volumeToDatum', () => {
  it('measures a level pad as area times height', () => {
    const tin = buildTin(flatPad(10));
    const v = volumeToDatum(tin, 0);
    expect(v.cutM3).toBeCloseTo(100_000, 6);
    expect(v.fillM3).toBe(0);
    expect(v.netM3).toBeCloseTo(100_000, 6);
    expect(v.planAreaM2).toBeCloseTo(10000, 6);
  });

  it('measures a pyramid as base times height over three', () => {
    // 10,000 m2 x 30 m / 3 = 100,000 m3, independent of how it is triangulated.
    const v = volumeToDatum(buildTin(pyramid), 0);
    expect(v.cutM3).toBeCloseTo(100_000, 6);
    expect(v.fillM3).toBe(0);
  });

  it('measures below the datum as fill, not as negative cut', () => {
    const v = volumeToDatum(buildTin(flatPad(-4)), 0);
    expect(v.cutM3).toBe(0);
    expect(v.fillM3).toBeCloseTo(40_000, 6);
    expect(v.netM3).toBeCloseTo(-40_000, 6);
  });

  it('measures against a datum that is not zero', () => {
    const v = volumeToDatum(buildTin(flatPad(10)), 4);
    expect(v.cutM3).toBeCloseTo(60_000, 6);
    expect(v.fillM3).toBe(0);
  });

  it('keeps cut and fill separate where a triangle straddles the datum', () => {
    // The ramp z = x/10 against a datum of 5 m crosses at x = 50. Above it,
    // the integral of (x/10 - 5) over x = 50..100 across 100 m of width is
    // 12,500 m3, and by symmetry the same volume lies below. Reporting a net
    // of zero and nothing else would hide 25,000 m3 of earthworks.
    const v = volumeToDatum(buildTin(ramp), 5);
    expect(v.cutM3).toBeCloseTo(12_500, 6);
    expect(v.fillM3).toBeCloseTo(12_500, 6);
    expect(v.netM3).toBeCloseTo(0, 6);
  });

  it('clips the straddling triangle exactly, not by sampling it', () => {
    // An off-centre datum makes the two sides unequal, so a symmetric sampling
    // error cannot cancel out and hide itself. Datum 2 m crosses at x = 20:
    // above is the integral of (x/10 - 2) over 20..100 x 100 m wide = 32,000,
    // below is the integral of (2 - x/10) over 0..20 x 100 m wide = 2,000.
    const v = volumeToDatum(buildTin(ramp), 2);
    expect(v.cutM3).toBeCloseTo(32_000, 6);
    expect(v.fillM3).toBeCloseTo(2_000, 6);
  });

  it('gives the same answer on a dense grid as on the four corners', () => {
    // A plane is a plane however finely it is picked up; a triangulation that
    // loses or double-counts area would show up as a difference here.
    const coarse = volumeToDatum(buildTin(ramp), 3);
    const dense = volumeToDatum(buildTin(grid(20, 5, x => x / 10)), 3);
    expect(dense.cutM3).toBeCloseTo(coarse.cutM3, 4);
    expect(dense.fillM3).toBeCloseTo(coarse.fillM3, 4);
  });

  it('treats a surface sitting exactly on the datum as no volume at all', () => {
    const v = volumeToDatum(buildTin(flatPad(0)), 0);
    expect(v.cutM3).toBe(0);
    expect(v.fillM3).toBe(0);
  });
});

describe('elevationAt', () => {
  it('returns the surveyed height inside the surface', () => {
    expect(elevationAt(buildTin(flatPad(7)), 50, 50)).toBeCloseTo(7, 9);
  });

  it('interpolates across the plane of a triangle', () => {
    const tin = buildTin(ramp);
    expect(elevationAt(tin, 30, 40)).toBeCloseTo(3, 9);
    expect(elevationAt(tin, 75, 10)).toBeCloseTo(7.5, 9);
  });

  it('returns a vertex height exactly at that vertex', () => {
    expect(elevationAt(buildTin(pyramid), 50, 50)).toBeCloseTo(30, 9);
  });

  it('works on the outer edge and corners of the extent', () => {
    // The lookup grid must not lose a position that falls on the boundary of
    // the last cell, which is where a corner of the survey sits.
    const tin = buildTin(grid(10, 10, () => 4));
    expect(elevationAt(tin, 0, 0)).toBeCloseTo(4, 9);
    expect(elevationAt(tin, 100, 100)).toBeCloseTo(4, 9);
    expect(elevationAt(tin, 100, 50)).toBeCloseTo(4, 9);
  });

  it('returns null outside the surface rather than extrapolating', () => {
    // Extending the nearest triangle's plane would invent ground that was
    // never surveyed, and it would go into a volume looking like a measurement.
    const tin = buildTin(ramp);
    expect(elevationAt(tin, 150, 50)).toBeNull();
    expect(elevationAt(tin, -1, 50)).toBeNull();
    expect(elevationAt(tin, 50, 500)).toBeNull();
  });

  it('returns null outside the hull even when inside the bounding box', () => {
    // An L-shaped pickup has a concave gap; a point in the gap is outside the
    // survey even though it is within the extent.
    const tri = buildTin([
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 0, y: 100, z: 0 }
    ]);
    expect(elevationAt(tri, 5, 5)).toBeCloseTo(0, 9);
    expect(elevationAt(tri, 90, 90)).toBeNull();
  });

  it('returns null for a position that is not a number', () => {
    const tin = buildTin(flatPad(1));
    expect(elevationAt(tin, NaN, 50)).toBeNull();
    expect(elevationAt(tin, 50, Infinity)).toBeNull();
  });
});

describe('volumeBetween', () => {
  it('measures a uniform lift between two parallel surfaces', () => {
    const lower = buildTin(grid(10, 10, () => 0));
    const upper = buildTin(flatPad(5));
    const v = volumeBetween(lower, upper);
    expect(v.cutM3).toBeCloseTo(50_000, 6);
    expect(v.fillM3).toBe(0);
    expect(v.uncoveredAreaM2).toBe(0);
    expect(v.partialAreaM2).toBe(0);
    expect(v.planAreaM2).toBeCloseTo(10_000, 6);
  });

  it('reports material removed as fill when the upper surface is lower', () => {
    const lower = buildTin(grid(10, 10, () => 8));
    const upper = buildTin(flatPad(3));
    const v = volumeBetween(lower, upper);
    expect(v.fillM3).toBeCloseTo(50_000, 6);
    expect(v.cutM3).toBe(0);
    expect(v.netM3).toBeCloseTo(-50_000, 6);
  });

  it('separates cut from fill within a single triangle', () => {
    // The 1-in-10 ramp against a level design surface at 5 m: the ramp is
    // below it for x < 50 and above it beyond. Sampling one height per
    // triangle would let the two sides cancel and report a net of zero with
    // no earthworks at all; each side is 12,500 m3.
    const lower = buildTin(ramp);
    const upper = buildTin(flatPad(5));
    const v = volumeBetween(lower, upper);
    expect(v.cutM3).toBeCloseTo(12_500, 6);
    expect(v.fillM3).toBeCloseTo(12_500, 6);
    expect(v.netM3).toBeCloseTo(0, 6);
  });

  it('gives the same answer however finely the lower surface is picked up', () => {
    const coarse = volumeBetween(buildTin(ramp), buildTin(flatPad(5)));
    const dense = volumeBetween(buildTin(grid(20, 5, x => x / 10)), buildTin(flatPad(5)));
    expect(dense.cutM3).toBeCloseTo(coarse.cutM3, 4);
    expect(dense.fillM3).toBeCloseTo(coarse.fillM3, 4);
  });

  it('reports the ground the second pickup does not reach', () => {
    // Comparing a full-site survey against a partial one must not quote the
    // overlap volume as if it covered the site.
    const lower = buildTin(grid(10, 10, () => 0));
    const upper = buildTin([
      { x: 0, y: 0, z: 5 },
      { x: 50, y: 0, z: 5 },
      { x: 50, y: 100, z: 5 },
      { x: 0, y: 100, z: 5 }
    ]);
    const v = volumeBetween(lower, upper);
    expect(v.uncoveredAreaM2).toBeGreaterThan(0);
    // Nothing is lost: every triangle is measured, reported uncovered, or
    // reported as straddling the edge of the second pickup.
    expect(v.planAreaM2 + v.uncoveredAreaM2 + v.partialAreaM2).toBeCloseTo(planArea(lower), 6);
    // Only the covered part contributes.
    expect(v.cutM3).toBeCloseTo(v.planAreaM2 * 5, 6);
  });

  it('does not measure a triangle that straddles the edge of the upper surface', () => {
    // Half a triangle's difference quoted over its whole area would overstate
    // the volume, so it is reported apart rather than estimated.
    const lower = buildTin([
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 100, z: 0 },
      { x: 0, y: 100, z: 0 }
    ]);
    const upper = buildTin([
      { x: -10, y: -10, z: 5 },
      { x: 50, y: -10, z: 5 },
      { x: 50, y: 110, z: 5 },
      { x: -10, y: 110, z: 5 }
    ]);
    const v = volumeBetween(lower, upper);
    expect(v.partialAreaM2).toBeGreaterThan(0);
    expect(v.planAreaM2 + v.uncoveredAreaM2 + v.partialAreaM2).toBeCloseTo(10_000, 6);
  });

  it('reports zero volume and the whole area uncovered when they do not overlap', () => {
    const lower = buildTin(flatPad(0));
    const upper = buildTin([
      { x: 1000, y: 1000, z: 5 },
      { x: 1100, y: 1000, z: 5 },
      { x: 1100, y: 1100, z: 5 },
      { x: 1000, y: 1100, z: 5 }
    ]);
    const v = volumeBetween(lower, upper);
    expect(v.cutM3).toBe(0);
    expect(v.fillM3).toBe(0);
    expect(v.planAreaM2).toBe(0);
    expect(v.partialAreaM2).toBe(0);
    expect(v.uncoveredAreaM2).toBeCloseTo(10000, 6);
  });
});

describe('contours', () => {
  it('draws a straight contour at the right position on a ramp', () => {
    // z = x/10, so the 5 m contour is the line x = 50 and nothing else.
    const segments = contourAt(buildTin(ramp), 5);
    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) {
      expect(s.x1).toBeCloseTo(50, 6);
      expect(s.x2).toBeCloseTo(50, 6);
      expect(s.level).toBe(5);
    }
    const totalLength = segments.reduce(
      (sum, s) => sum + Math.hypot(s.x2 - s.x1, s.y2 - s.y1),
      0
    );
    expect(totalLength).toBeCloseTo(100, 6);
  });

  it('draws nothing at a level the surface never reaches', () => {
    expect(contourAt(buildTin(ramp), 50)).toHaveLength(0);
    expect(contourAt(buildTin(ramp), -5)).toHaveLength(0);
  });

  it('closes the contour around a peak', () => {
    // The 15 m contour on the 30 m pyramid is a square halfway up: each of the
    // four faces contributes one segment, and they meet end to end.
    const segments = contourAt(buildTin(pyramid), 15);
    expect(segments).toHaveLength(4);
    for (const s of segments) {
      // Halfway between the apex and the base edge on every face.
      expect(Math.hypot(s.x1 - 50, s.y1 - 50)).toBeCloseTo(25 * Math.SQRT2, 6);
      expect(Math.hypot(s.x2 - 50, s.y2 - 50)).toBeCloseTo(25 * Math.SQRT2, 6);
    }
  });

  it('spaces a contour set at the interval asked for', () => {
    const set = contourSet(buildTin(ramp), 2);
    const levels = [...new Set(set.map(s => s.level))].sort((a, b) => a - b);
    expect(levels).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('draws no contours across a level surface', () => {
    // A flat pad has no contour line - the whole pad is at one height, and
    // drawing its outline would state a crossing the ground does not have.
    expect(contourSet(buildTin(flatPad(6)), 1)).toHaveLength(0);
  });

  it('refuses an interval that is not a positive number', () => {
    const tin = buildTin(ramp);
    expect(() => contourSet(tin, 0)).toThrow(/greater than zero/i);
    expect(() => contourSet(tin, -1)).toThrow(/greater than zero/i);
    expect(() => contourSet(tin, NaN)).toThrow(/greater than zero/i);
  });

  it('refuses an interval so fine it would produce an unusable set', () => {
    // 10 m of range at 1 mm would be 10,000 contours; better to say so than to
    // lock the browser building them.
    expect(() => contourSet(buildTin(ramp), 0.001)).toThrow(/coarser interval/i);
  });
});

describe('linkContours', () => {
  const chain = [
    { level: 5, x1: 0, y1: 0, x2: 10, y2: 0 },
    { level: 5, x1: 10, y1: 0, x2: 20, y2: 0 },
    { level: 5, x1: 20, y1: 0, x2: 30, y2: 0 }
  ];

  it('joins segments that share an end into one line', () => {
    const lines = linkContours(chain);
    expect(lines).toHaveLength(1);
    expect(lines[0].pts).toHaveLength(4);
    expect(lines[0].pts[0]).toEqual({ x: 0, y: 0 });
    expect(lines[0].pts[3]).toEqual({ x: 30, y: 0 });
    expect(lines[0].closed).toBe(false);
  });

  it('joins them whatever order they arrive in', () => {
    // Marching triangles emits in triangle order, not along the contour.
    const shuffled = [chain[2], chain[0], chain[1]];
    const lines = linkContours(shuffled);
    expect(lines).toHaveLength(1);
    expect(lines[0].pts).toHaveLength(4);
  });

  it('joins them when a segment runs the other way round', () => {
    const flipped = [chain[0], { level: 5, x1: 20, y1: 0, x2: 10, y2: 0 }, chain[2]];
    const lines = linkContours(flipped);
    expect(lines).toHaveLength(1);
    expect(lines[0].pts).toHaveLength(4);
  });

  it('marks a line that returns to its start as closed', () => {
    const ring = [
      { level: 3, x1: 0, y1: 0, x2: 10, y2: 0 },
      { level: 3, x1: 10, y1: 0, x2: 10, y2: 10 },
      { level: 3, x1: 10, y1: 10, x2: 0, y2: 10 },
      { level: 3, x1: 0, y1: 10, x2: 0, y2: 0 }
    ];
    const lines = linkContours(ring);
    expect(lines).toHaveLength(1);
    expect(lines[0].closed).toBe(true);
    expect(lines[0].pts[0]).toEqual(lines[0].pts[lines[0].pts.length - 1]);
  });

  it('keeps contours at different levels apart', () => {
    const lines = linkContours([...chain, { level: 9, x1: 0, y1: 50, x2: 10, y2: 50 }]);
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map(l => l.level))).toEqual(new Set([5, 9]));
  });

  it('returns separate lines for contours that do not touch', () => {
    const lines = linkContours([
      { level: 5, x1: 0, y1: 0, x2: 10, y2: 0 },
      { level: 5, x1: 100, y1: 0, x2: 110, y2: 0 }
    ]);
    expect(lines).toHaveLength(2);
  });

  it('uses every segment exactly once', () => {
    const lines = linkContours(chain);
    const totalPts = lines.reduce((n, l) => n + l.pts.length - 1, 0);
    expect(totalPts).toBe(chain.length);
  });

  it('does not merge ends that are genuinely apart', () => {
    // A millimetre is a real gap in survey terms and must stay a gap.
    const lines = linkContours([
      { level: 5, x1: 0, y1: 0, x2: 10, y2: 0 },
      { level: 5, x1: 10.001, y1: 0, x2: 20, y2: 0 }
    ]);
    expect(lines).toHaveLength(2);
  });

  it('handles an empty set', () => {
    expect(linkContours([])).toEqual([]);
  });

  it('refuses a tolerance that is not positive', () => {
    expect(() => linkContours(chain, 0)).toThrow(/greater than zero/i);
  });

  it('links a real contour on a ramp into one straight line', () => {
    const tin = buildTin(grid(6, 20, x => x / 10));
    const lines = linkContours(contourAt(tin, 5));
    expect(lines).toHaveLength(1);
    expect(lines[0].closed).toBe(false);
    for (const p of lines[0].pts) expect(p.x).toBeCloseTo(50, 6);
    // The line spans the full 120 m width of the surface.
    const ys = lines[0].pts.map(p => p.y);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(120, 6);
  });

  it('links a contour round a peak into one closed ring', () => {
    const lines = linkContours(contourAt(buildTin(pyramid), 15));
    expect(lines).toHaveLength(1);
    expect(lines[0].closed).toBe(true);
    // Four faces, so four corners plus the repeated first point.
    expect(lines[0].pts).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Breaklines
// ---------------------------------------------------------------------------
// The control case is a ridge across a diamond-shaped site, chosen because the
// unconstrained Delaunay triangulation is provably WRONG on it.
//
//              (10,10,0)
//                  *
//                /   \
//   (0,5,10) *           * (20,5,10)      the crest runs west to east
//                \   /
//                  *
//              (10,0,0)
//
// The hull is a rhombus with diagonals 20 m (the crest) and 10 m (across the
// valley). Delaunay takes the shorter diagonal: the circumcircle of the crest
// triangle contains the fourth point, so the crest edge fails the test and the
// cross edge wins. The modelled surface then runs through (10, 5) at 0 m —
// ground level — when the surveyed crest there is 10 m.

/** The diamond site. Indices: 0 west crest, 1 south, 2 east crest, 3 north. */
const ridgeSite: Point3D[] = [
  { x: 0, y: 5, z: 10 },
  { x: 10, y: 0, z: 0 },
  { x: 20, y: 5, z: 10 },
  { x: 10, y: 10, z: 0 }
];

const crest = { name: 'Crest', pts: [{ x: 0, y: 5, z: 10 }, { x: 20, y: 5, z: 10 }] };

/** True when some triangle carries the edge between these two plan positions. */
function carriesEdge(tin: { points: Point3D[]; triangles: Triangle[] }, a: Point3D, b: Point3D): boolean {
  const at = (p: Point3D) =>
    tin.points.findIndex(q => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6);
  const u = at(a);
  const v = at(b);
  if (u < 0 || v < 0) return false;
  return tin.triangles.some(t => {
    const s = [t.a, t.b, t.c];
    return s.includes(u) && s.includes(v);
  });
}

describe('breaklines — the ridge that Delaunay gets wrong', () => {
  it('spans the crest without a breakline, sinking it to ground level', () => {
    // Not a bug in the triangulation: this IS the Delaunay answer. It is the
    // reason breaklines exist.
    const tin = buildTin(ridgeSite);
    expect(carriesEdge(tin, ridgeSite[0], ridgeSite[2])).toBe(false);
    expect(elevationAt(tin, 10, 5)).toBeCloseTo(0, 9);
  });

  it('honours the crest as an edge when given one', () => {
    const tin = buildTin(ridgeSite, { breaklines: [crest] });
    expect(carriesEdge(tin, ridgeSite[0], ridgeSite[2])).toBe(true);
    expect(tin.breaklineIssues).toEqual([]);
    expect(tin.constraints).toHaveLength(1);
  });

  it('models the crest at its surveyed height', () => {
    const tin = buildTin(ridgeSite, { breaklines: [crest] });
    expect(elevationAt(tin, 10, 5)).toBeCloseTo(10, 9);
    // Halfway up the western flank, midway between crest and the south point.
    expect(elevationAt(tin, 5, 2.5)).toBeCloseTo(5, 9);
  });

  it('doubles the volume, which is the whole point', () => {
    // Unconstrained: two triangles of 50 m2, mean height 10/3 -> 333.33 m3.
    // Constrained:   two triangles of 50 m2, mean height 20/3 -> 666.67 m3.
    // A quarry quoting the first figure would be out by half the stockpile.
    const without = volumeToDatum(buildTin(ridgeSite), 0);
    const withIt = volumeToDatum(buildTin(ridgeSite, { breaklines: [crest] }), 0);
    expect(without.cutM3).toBeCloseTo(1000 / 3, 6);
    expect(withIt.cutM3).toBeCloseTo(2000 / 3, 6);
    expect(withIt.cutM3 / without.cutM3).toBeCloseTo(2, 9);
  });

  it('does not change the plan area it covers', () => {
    // A constraint reshuffles triangles inside the hull; it must not add or
    // lose ground. The rhombus is 20 x 10 / 2 = 100 m2 either way.
    const without = planArea(buildTin(ridgeSite));
    const withIt = planArea(buildTin(ridgeSite, { breaklines: [crest] }));
    expect(without).toBeCloseTo(100, 9);
    expect(withIt).toBeCloseTo(100, 9);
  });

  it('leaves every triangle wound counter-clockwise', () => {
    const tin = buildTin(ridgeSite, { breaklines: [crest] });
    for (const t of tin.triangles) {
      const A = tin.points[t.a], B = tin.points[t.b], C = tin.points[t.c];
      expect(((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2).toBeGreaterThan(0);
    }
  });

  it('puts the contour on the flanks rather than across the crest', () => {
    const tin = buildTin(ridgeSite, { breaklines: [crest] });
    const segs = contourAt(tin, 5);
    expect(segs.length).toBeGreaterThan(0);
    // The 5 m contour sits halfway down each flank, never crossing y = 5.
    for (const s of segs) {
      expect(Math.abs(s.y1 - 5)).toBeGreaterThan(1e-6);
      expect(Math.abs(s.y2 - 5)).toBeGreaterThan(1e-6);
    }
  });
});

describe('breaklines — bookkeeping', () => {
  it('records a segment that the triangulation already had', () => {
    // The south-west edge is on the hull, so it is an edge already. Asking for
    // it must still count as honoured, not silently do nothing.
    const line = { name: 'Toe', pts: [{ x: 0, y: 5, z: 10 }, { x: 10, y: 0, z: 0 }] };
    const tin = buildTin(ridgeSite, { breaklines: [line] });
    expect(tin.constraints).toHaveLength(1);
    expect(tin.breaklineIssues).toEqual([]);
  });

  it('adds breakline vertices that were not surveyed separately', () => {
    const line = { name: 'Spur', pts: [{ x: 8, y: 5, z: 6 }, { x: 12, y: 5, z: 6 }] };
    const tin = buildTin(ridgeSite, { breaklines: [line] });
    expect(tin.points).toHaveLength(6);
    expect(carriesEdge(tin, { x: 8, y: 5, z: 6 }, { x: 12, y: 5, z: 6 })).toBe(true);
  });

  it('counts a multi-segment line as one constraint per segment', () => {
    const line = {
      name: 'Crest',
      pts: [{ x: 0, y: 5, z: 10 }, { x: 10, y: 5, z: 12 }, { x: 20, y: 5, z: 10 }]
    };
    const tin = buildTin(ridgeSite, { breaklines: [line] });
    expect(tin.constraints).toHaveLength(2);
    expect(tin.breaklineIssues).toEqual([]);
  });
});

describe('breaklines — what it refuses to do', () => {
  it('reports a line with fewer than two points', () => {
    const tin = buildTin(ridgeSite, { breaklines: [{ name: 'Stub', pts: [{ x: 5, y: 5, z: 1 }] }] });
    expect(tin.constraints).toHaveLength(0);
    expect(tin.breaklineIssues.join(' ')).toMatch(/fewer than two points/i);
  });

  it('extends the surveyed extent to reach a distant breakline, rather than refusing it', () => {
    // Breakline vertices ARE survey observations, so a crest picked up beyond
    // the spot heights genuinely adds ground. The consequence is the same one
    // the surface panels warn about: a mis-keyed breakline coordinate stretches
    // the hull across ground nobody surveyed, and ADDS volume.
    const away = { name: 'Elsewhere', pts: [{ x: 500, y: 500, z: 1 }, { x: 600, y: 500, z: 1 }] };
    const near = planArea(buildTin(ridgeSite));
    const far = buildTin(ridgeSite, { breaklines: [away] });
    expect(far.breaklineIssues).toEqual([]);
    expect(far.constraints).toHaveLength(1);
    expect(planArea(far)).toBeGreaterThan(near * 100);
  });

  it('refuses two breaklines that contradict each other at their crossing', () => {
    // A crest at 10 m and a drain at 0 m cannot both be right where they meet.
    // The gap is quoted so the surveyor can see which pickup is wrong.
    const a = { name: 'Crest', pts: [{ x: 0, y: 5, z: 10 }, { x: 20, y: 5, z: 10 }] };
    const b = { name: 'Drain', pts: [{ x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }] };
    const tin = buildTin(ridgeSite, { breaklines: [a, b] });
    expect(tin.constraints).toHaveLength(0);
    const said = tin.breaklineIssues.join(' ');
    expect(said).toMatch(/Crest and Drain cross at 10\.000, 5\.000/);
    expect(said).toMatch(/10\.000 m and the other 0\.000 m/);
    expect(said).toMatch(/10\.000 m apart/);
    expect(said).toMatch(/Survey the junction/i);
  });

  it('splits two breaklines that cross and agree, and holds both', () => {
    // A track crossing the crest at grade. Its ends are inside the site and
    // clear of the surveyed corners, so nothing contradicts: both lines say
    // 10 m at (10, 5), the junction becomes a vertex, and each line is cut in
    // two there.
    const a = { name: 'Crest', pts: [{ x: 0, y: 5, z: 10 }, { x: 20, y: 5, z: 10 }] };
    const b = { name: 'Track', pts: [{ x: 10, y: 2, z: 10 }, { x: 10, y: 8, z: 10 }] };
    const tin = buildTin(ridgeSite, { breaklines: [a, b] });
    expect(tin.breaklineIssues).toEqual([]);
    expect(tin.constraints).toHaveLength(4);

    // Four corners, the two track ends, and the junction the engine worked out.
    expect(tin.points).toHaveLength(7);
    expect(elevationAt(tin, 10, 5)).toBeCloseTo(10, 9);
  });

  it('measures the surface a resolved junction produces', () => {
    // The crest alone gives 666.67 m3. The track raises the ground either side
    // of it as well, so the volume can only go up from there.
    const a = { name: 'Crest', pts: [{ x: 0, y: 5, z: 10 }, { x: 20, y: 5, z: 10 }] };
    const b = { name: 'Track', pts: [{ x: 10, y: 2, z: 10 }, { x: 10, y: 8, z: 10 }] };
    const tin = buildTin(ridgeSite, { breaklines: [a, b] });
    expect(planArea(tin)).toBeCloseTo(100, 9);
    expect(volumeToDatum(tin, 0).cutM3).toBeGreaterThan(2000 / 3);
  });

  it('adds no junction point where the two heights contradict', () => {
    // Both lines here run between existing corners, so nothing new is added
    // and no invented junction appears either.
    const a = { name: 'Crest', pts: [{ x: 0, y: 5, z: 10 }, { x: 20, y: 5, z: 10 }] };
    const b = { name: 'Drain', pts: [{ x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }] };
    const tin = buildTin(ridgeSite, { breaklines: [a, b] });
    expect(tin.points).toHaveLength(4);
    expect(elevationAt(tin, 10, 5)).toBeCloseTo(0, 9);
  });

  it('reports a breakline whose height contradicts a point it passes over', () => {
    // The track claims 10 m at (10, 0), which was surveyed at 0 m. The
    // surveyed height stands and the disagreement is named.
    const b = { name: 'Track', pts: [{ x: 10, y: 0, z: 10 }, { x: 10, y: 10, z: 10 }] };
    const tin = buildTin(ridgeSite, { breaklines: [b] });
    const said = tin.breaklineIssues.join(' ');
    expect(said).toMatch(/Track gives 10\.000 m at 10\.000, 0\.000/);
    expect(said).toMatch(/0\.000 m was already surveyed/);
    expect(tin.points[1].z).toBe(0);
  });

  it('allows two breaklines that meet at a shared point', () => {
    // Meeting is not crossing: a shared vertex has one height, so there is
    // nothing ambiguous about it.
    const a = { name: 'West arm', pts: [{ x: 0, y: 5, z: 10 }, { x: 10, y: 5, z: 12 }] };
    const b = { name: 'East arm', pts: [{ x: 10, y: 5, z: 12 }, { x: 20, y: 5, z: 10 }] };
    const tin = buildTin(ridgeSite, { breaklines: [a, b] });
    expect(tin.constraints).toHaveLength(2);
    expect(tin.breaklineIssues).toEqual([]);
  });

  it('reports a breakline height that contradicts a surveyed point', () => {
    // Same ground, two different statements about how high it is.
    const line = { name: 'Crest', pts: [{ x: 0, y: 5, z: 99 }, { x: 20, y: 5, z: 10 }] };
    const tin = buildTin(ridgeSite, { breaklines: [line] });
    expect(tin.breaklineIssues.join(' ')).toMatch(/99\.000 m/);
    expect(tin.breaklineIssues.join(' ')).toMatch(/10\.000 m was already surveyed/);
    expect(tin.breaklineIssues.join(' ')).toMatch(/surveyed height was kept/i);
    // The surveyed value stands.
    expect(tin.points[0].z).toBe(10);
  });

  it('throws on a breakline point without a finite height', () => {
    expect(() =>
      buildTin(ridgeSite, { breaklines: [{ pts: [{ x: 1, y: 1, z: NaN }, { x: 2, y: 2, z: 0 }] }] })
    ).toThrow(/finite/i);
  });

  it('is unchanged when given no breaklines at all', () => {
    const plain = buildTin(ridgeSite);
    const empty = buildTin(ridgeSite, { breaklines: [] });
    expect(empty.triangles).toEqual(plain.triangles);
    expect(empty.constraints).toEqual([]);
    expect(empty.breaklineIssues).toEqual([]);
  });
});

describe('breaklines — on a dense surface', () => {
  it('holds a diagonal constraint across a regular grid without losing area', () => {
    // A grid is the degenerate case for Delaunay, and a long constraint has to
    // cut through many triangles. The hull area must survive it exactly.
    const pts = grid(10, 10, (x, y) => 100 + x / 20 + y / 25);
    const line = {
      name: 'Haul road',
      pts: [{ x: 0, y: 0, z: 100 }, { x: 100, y: 100, z: 109 }]
    };
    const tin = buildTin(pts, { breaklines: [line] });
    expect(tin.breaklineIssues).toEqual([]);
    expect(planArea(tin)).toBeCloseTo(10000, 6);

    // The diagonal runs over the grid vertices at (10,10) ... (90,90), so it is
    // split into ten sub-segments rather than forced as one impossible edge.
    expect(tin.constraints).toHaveLength(10);
    expect(carriesEdge(tin, { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 0 })).toBe(true);
    expect(carriesEdge(tin, { x: 40, y: 40, z: 0 }, { x: 50, y: 50, z: 0 })).toBe(true);
    expect(carriesEdge(tin, { x: 90, y: 90, z: 0 }, { x: 100, y: 100, z: 0 })).toBe(true);
  });

  it('keeps every triangle wound counter-clockwise on the dense case', () => {
    const pts = grid(8, 12.5, () => 50);
    const line = { name: 'Bench toe', pts: [{ x: 0, y: 50, z: 50 }, { x: 100, y: 50, z: 50 }] };
    const tin = buildTin(pts, { breaklines: [line] });
    for (const t of tin.triangles) {
      const A = tin.points[t.a], B = tin.points[t.b], C = tin.points[t.c];
      expect(((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2).toBeGreaterThan(0);
    }
    expect(planArea(tin)).toBeCloseTo(10000, 6);
  });
});
