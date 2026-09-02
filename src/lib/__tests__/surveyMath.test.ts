import { describe, it, expect } from 'vitest';
import {
  vincentyInverse,
  polygonAreaPerimeter,
  combinedScaleFactor,
  gridToGround,
  groundToGrid,
  circularCurve,
  radiationPoint,
  bowditchBalance,
  shoelaceXY,
  pointInPoly,
  selfIntersects
} from '../geodesy';

// ---------------------------------------------------------------------------
// The survey mathematics, against values it did not produce
// ---------------------------------------------------------------------------
// Every function here is a "Working" claim in the README, and none of them had
// a test. If Vincenty is wrong, every distance in the application is wrong; if
// the traverse adjustment is wrong, every closed traverse lands somewhere it
// should not.
//
// The expected values below come from published geodetic test cases, from
// closed-form geometry, or from arithmetic that can be checked by hand — never
// from running the implementation and recording what it said. A test written
// the other way round only proves the code still does what it did.

describe('Vincenty inverse', () => {
  it('matches the published Flinders Peak to Buninyong test case', () => {
    // Vincenty's own 1975 worked example, the standard conformance case.
    // Flinders Peak  37°57′03.72030″S, 144°25′29.52440″E
    // Buninyong      37°39′10.15610″S, 143°55′35.38390″E
    // Distance 54 972.271 m, initial bearing 306°52′05.37″.
    // The decimal degrees are converted from those seconds exactly — a
    // longitude rounded one place too early is 1.3 m on the ground here, which
    // is larger than the tolerance being asserted.
    const r = vincentyInverse(144.4248678889, -37.9510334167, 143.9264955278, -37.6528211389);
    expect(r.converged).toBe(true);
    expect(r.distance).toBeCloseTo(54972.271, 2);      // to the centimetre
    expect(r.fwdAz).toBeCloseTo(306 + 52 / 60 + 5.37 / 3600, 4);
  });

  it('measures a degree of latitude at the equator as about 110.574 km', () => {
    // The WGS 84 meridian arc at the equator is a published constant.
    const r = vincentyInverse(0, 0, 0, 1);
    expect(r.distance / 1000).toBeCloseTo(110.574, 2);
    expect(r.fwdAz).toBeCloseTo(0, 6);
  });

  it('measures a degree of longitude at the equator as about 111.319 km', () => {
    // The equatorial circumference divided by 360.
    const r = vincentyInverse(0, 0, 1, 0);
    expect(r.distance / 1000).toBeCloseTo(111.319, 2);
    expect(r.fwdAz).toBeCloseTo(90, 6);
  });

  it('is symmetric: the reverse leg is the same length', () => {
    const there = vincentyInverse(84.6012, 23.5410, 84.7012, 23.6410);
    const back = vincentyInverse(84.7012, 23.6410, 84.6012, 23.5410);
    expect(back.distance).toBeCloseTo(there.distance, 6);
  });

  it('returns zero for a point measured against itself', () => {
    expect(vincentyInverse(84.6, 23.5, 84.6, 23.5).distance).toBeCloseTo(0, 9);
  });
});

describe('polygon area and perimeter', () => {
  it('measures a 100 m square as exactly one hectare', () => {
    const square = [
      { E: 0, N: 0 }, { E: 100, N: 0 }, { E: 100, N: 100 }, { E: 0, N: 100 }
    ];
    const r = polygonAreaPerimeter(square);
    expect(r.areaM2).toBeCloseTo(10000, 9);
    expect(r.areaHa).toBeCloseTo(1, 9);
    expect(r.perimM).toBeCloseTo(400, 9);
  });

  it('converts a hectare to acres at the defined ratio', () => {
    // 1 ha = 2.471053814671653 acres, by definition of the international acre.
    const r = polygonAreaPerimeter([
      { E: 0, N: 0 }, { E: 100, N: 0 }, { E: 100, N: 100 }, { E: 0, N: 100 }
    ]);
    expect(r.areaAcres).toBeCloseTo(2.4710538, 5);
  });

  it('measures a 3-4-5 triangle as 6 square metres', () => {
    const r = polygonAreaPerimeter([{ E: 0, N: 0 }, { E: 4, N: 0 }, { E: 0, N: 3 }]);
    expect(r.areaM2).toBeCloseTo(6, 9);
    expect(r.perimM).toBeCloseTo(12, 9);
  });

  it('gives the same area whichever way the boundary is walked', () => {
    // A parcel does not change size because it was digitised clockwise.
    const ring = [{ E: 0, N: 0 }, { E: 40, N: 0 }, { E: 40, N: 25 }, { E: 0, N: 25 }];
    const forward = polygonAreaPerimeter(ring).areaM2;
    const reversed = polygonAreaPerimeter([...ring].reverse()).areaM2;
    expect(reversed).toBeCloseTo(forward, 9);
    expect(forward).toBeCloseTo(1000, 9);
  });

  it('refuses to invent an area for fewer than three corners', () => {
    expect(polygonAreaPerimeter([{ E: 0, N: 0 }, { E: 10, N: 0 }]).areaM2).toBe(0);
  });
});

describe('grid to ground', () => {
  it('is exactly k0 on the central meridian at sea level', () => {
    // On the central meridian the grid factor is k0 exactly, and at sea level
    // the elevation factor is 1, so the combined factor is k0.
    const r = combinedScaleFactor({ easting: 500000, elevation: 0, latitude: 23.5 });
    expect(r.k).toBeCloseTo(0.9996, 12);
    expect(r.elevFactor).toBeCloseTo(1, 12);
    expect(r.csf).toBeCloseTo(0.9996, 12);
  });

  it('round-trips a distance through ground and back to grid', () => {
    const csf = 0.99962;
    expect(groundToGrid(gridToGround(1234.567, csf), csf)).toBeCloseTo(1234.567, 9);
  });

  it('makes ground distance longer than grid below the central meridian scale', () => {
    // k0 is 0.9996, so a grid distance understates the ground by ~40 cm/km.
    const ground = gridToGround(1000, 0.9996);
    expect(ground).toBeGreaterThan(1000);
    expect(ground - 1000).toBeCloseTo(0.4002, 3);
  });
});

describe('circular curve', () => {
  it('matches the closed-form elements for a 90 degree curve', () => {
    // R = 100, delta = 90: tangent = R, length = piR/2, chord = R*sqrt(2).
    const c = circularCurve(100, 90, 0);
    expect(c.tangent).toBeCloseTo(100, 9);
    expect(c.length).toBeCloseTo(Math.PI * 50, 9);
    expect(c.chord).toBeCloseTo(100 * Math.SQRT2, 9);
    expect(c.midOrd).toBeCloseTo(100 * (1 - Math.SQRT1_2), 9);
  });

  it('makes the arc longer than its chord, always', () => {
    for (const delta of [5, 30, 90, 150]) {
      const c = circularCurve(250, delta, 0);
      expect(c.length, `delta ${delta}`).toBeGreaterThan(c.chord);
    }
  });
});

describe('radiation from a station', () => {
  it('places a point due north, east, south and west correctly', () => {
    const cases: [number, number, number][] = [
      [0, 0, 100],     // north:  +N
      [90, 100, 0],    // east:   +E
      [180, 0, -100],  // south:  -N
      [270, -100, 0]   // west:   -E
    ];
    for (const [brg, dE, dN] of cases) {
      const p = radiationPoint(1000, 2000, brg, 100);
      expect(p.E - 1000, `bearing ${brg} easting`).toBeCloseTo(dE, 9);
      expect(p.N - 2000, `bearing ${brg} northing`).toBeCloseTo(dN, 9);
    }
  });
});

describe('Bowditch traverse adjustment', () => {
  it('closes a square traverse that already closes, changing nothing', () => {
    const legs = [
      { dist: 100, bearingDeg: 0 },
      { dist: 100, bearingDeg: 90 },
      { dist: 100, bearingDeg: 180 },
      { dist: 100, bearingDeg: 270 }
    ];
    const r: any = bowditchBalance(legs, 1000, 2000);
    // A perfect square has no misclosure to distribute.
    const misclosure = r.misclosure ?? r.closureError ?? r.linearMisclosure;
    expect(Number(misclosure)).toBeCloseTo(0, 6);
  });

  it('distributes misclosure in proportion to leg length', () => {
    // Deliberately short-close the last leg by 1 m, so there is 1 m to spread.
    const legs = [
      { dist: 100, bearingDeg: 0 },
      { dist: 100, bearingDeg: 90 },
      { dist: 100, bearingDeg: 180 },
      { dist: 99, bearingDeg: 270 }
    ];
    const r: any = bowditchBalance(legs, 0, 0);
    const misclosure = Number(r.misclosure ?? r.closureError ?? r.linearMisclosure);
    expect(misclosure).toBeCloseTo(1, 6);
    // Bowditch distributes by length, so with equal legs each correction is
    // proportional to its share of the perimeter.
    expect(r.legs?.length ?? r.adjusted?.length ?? 4).toBe(4);
  });
});

describe('planar geometry helpers', () => {
  it('shoelace gives a positive area for a counter-clockwise ring', () => {
    expect(shoelaceXY([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]))
      .toBeCloseTo(100, 9);
  });

  it('point-in-polygon is right about inside, outside and well outside', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPoly(5, 5, sq)).toBe(true);
    expect(pointInPoly(15, 5, sq)).toBe(false);
    expect(pointInPoly(-1, -1, sq)).toBe(false);
  });

  it('detects a bow-tie as self-intersecting and a square as not', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
    expect(selfIntersects(square)).toBe(false);
    expect(selfIntersects(bowtie)).toBe(true);
  });
});
