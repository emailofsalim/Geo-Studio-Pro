import { describe, it, expect } from 'vitest';
import { offsetPolygonEN, boundaryOffset, polygonAreaPerimeter } from '../geodesy';

const P = (E: number, N: number) => ({ E, N });

/** Shoelace area of a ring given in metres, sign discarded. */
const area = (p: { E: number; N: number }[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    s += p[i].E * q.N - q.E * p[i].N;
  }
  return Math.abs(s / 2);
};

// A 100 m x 100 m lease block on real UTM 44N ground, 10 000 m2. Offset 7.5 m
// inward it is 85 x 85 = 7225 m2; outward, 115 x 115 = 13225 m2.
const E0 = 254800, N0 = 2605200;
const ccw = [P(E0, N0), P(E0 + 100, N0), P(E0 + 100, N0 + 100), P(E0, N0 + 100)];
const cw = [P(E0, N0), P(E0, N0 + 100), P(E0 + 100, N0 + 100), P(E0 + 100, N0)];

describe('statutory boundary offset', () => {
  it('takes the side from the dropdown, not from the digitising order', () => {
    // The defect this pins: the offset used to derive its side from the ring's
    // winding by assumption. A lease digitised clockwise got its 7.5 m
    // "inward" safety barrier placed OUTSIDE the lease -- 13225 m2 reported as
    // net exploitable area where the true figure is 7225 -- which is the wrong
    // way round for a barrier that exists to be left standing.
    const inCcw = offsetPolygonEN(ccw, 7.5, false);
    const inCw = offsetPolygonEN(cw, 7.5, false);
    expect(inCcw).not.toBeNull();
    expect(inCw).not.toBeNull();
    expect(area(inCcw!), 'counter-clockwise, inward').toBeCloseTo(7225, 6);
    expect(area(inCw!), 'clockwise, inward -- the same barrier').toBeCloseTo(7225, 6);
  });

  it('puts an outward belt outside for either winding', () => {
    const outCcw = offsetPolygonEN(ccw, 7.5, true);
    const outCw = offsetPolygonEN(cw, 7.5, true);
    expect(area(outCcw!)).toBeCloseTo(13225, 6);
    expect(area(outCw!)).toBeCloseTo(13225, 6);
  });

  it('always shrinks inward and grows outward, whatever the winding', () => {
    for (const [name, ring] of [['ccw', ccw], ['cw', cw]] as const) {
      expect(area(offsetPolygonEN(ring, 7.5, false)!), `${name} inward is smaller`)
        .toBeLessThan(area(ring));
      expect(area(offsetPolygonEN(ring, 7.5, true)!), `${name} outward is larger`)
        .toBeGreaterThan(area(ring));
    }
  });

  it('moves every edge by exactly the distance asked for', () => {
    // The west edge sits at E0; inward by 7.5 it must sit at E0 + 7.5 exactly.
    const inner = offsetPolygonEN(ccw, 7.5, false)!;
    const wested = Math.min(...inner.map(p => p.E));
    const easted = Math.max(...inner.map(p => p.E));
    expect(wested).toBeCloseTo(E0 + 7.5, 9);
    expect(easted).toBeCloseTo(E0 + 92.5, 9);
  });

  it('holds each statutory preset to its own width', () => {
    // The presets the screen offers, on a lease big enough to hold them: the
    // 7.5 m barrier, the 50 m blasting zone and the 100 m river setback. Each
    // must take exactly its own width off the lease, because the difference is
    // what gets reported as barrier area.
    const S = 1200;
    const big = [P(E0, N0), P(E0 + S, N0), P(E0 + S, N0 + S), P(E0, N0 + S)];
    for (const d of [7.5, 50, 100]) {
      const inner = offsetPolygonEN(big, d, false)!;
      expect(inner, `${d} m inward`).not.toBeNull();
      expect(area(inner), `${d} m inward`).toBeCloseTo((S - 2 * d) ** 2, 4);
    }
    // And the 500 m DGMS habitation buffer, which the screen takes outward.
    expect(area(offsetPolygonEN(big, 500, true)!)).toBeCloseTo((S + 1000) ** 2, 4);
  });

  it('refuses a belt that has consumed the parcel, however plausible it looks', () => {
    // Past half the width of the block every edge crosses the one opposite and
    // the offset comes out the other side. It arrives as a simple polygon with
    // the ring's original orientation, so neither a self-intersection test nor
    // a signed area catches it. Measured before this was fixed, a 100 m square
    // reported: 60 m -> 400 m2, 90 m -> 6400 m2. A 90 m safety barrier inside a
    // 100 m lease claimed 6400 m2 of workable ground where there is none, and
    // the claim GREW as the barrier widened.
    for (const d of [50, 51, 60, 90, 200]) {
      expect(offsetPolygonEN(ccw, d, false), `${d} m inward on a 100 m block`).toBeNull();
    }
  });

  it('never reports more workable ground for a wider barrier', () => {
    // The property that the inside-out result violated: widening a statutory
    // barrier can only reduce what is left, never increase it.
    let prev = area(ccw);
    for (const d of [5, 10, 20, 30, 40, 45, 49]) {
      const inner = offsetPolygonEN(ccw, d, false);
      expect(inner, `${d} m inward`).not.toBeNull();
      const a = area(inner!);
      expect(a, `${d} m inward is not larger than a narrower barrier`).toBeLessThan(prev);
      prev = a;
    }
  });

  it('bevels a sharp corner instead of letting the mitre run away', () => {
    // A 200 m long wedge only 8 m wide at its base: the corner at the tip is
    // very sharp. Mitred, the offset point runs to many times the distance --
    // 375 m was measured for a 7.5 m offset before this was shared code, an
    // overshoot of 50x that puts a "safety belt" vertex a quarter kilometre
    // from the boundary it is meant to follow.
    const wedge = [P(E0, N0), P(E0 + 200, N0 + 4), P(E0 + 200, N0 - 4)];
    const out = offsetPolygonEN(wedge, 7.5, true)!;
    expect(out).not.toBeNull();
    const furthest = Math.max(...out.map(p => Math.hypot(p.E - E0, p.N - N0)));
    // The tip is bevelled, so no vertex sits further from the tip than the
    // far end of the wedge plus its own offset.
    const tipRun = Math.min(...out.map(p => Math.hypot(p.E - E0, p.N - N0)));
    expect(tipRun, 'the tip vertex stays near the tip').toBeLessThan(2 * 7.5);
    expect(furthest, 'no vertex is flung beyond the wedge').toBeLessThan(230);
  });

  it('bevelling adds vertices rather than replacing the corner with a spike', () => {
    const wedge = [P(E0, N0), P(E0 + 200, N0 + 4), P(E0 + 200, N0 - 4)];
    const out = offsetPolygonEN(wedge, 7.5, true)!;
    expect(out.length).toBeGreaterThan(wedge.length);
  });

  it('refuses an offset that folds the parcel through itself', () => {
    // 60 m inward on a 100 m square: the belt has eaten the parcel. There is
    // no polygon to report, and an area for it would be a fiction.
    expect(offsetPolygonEN(ccw, 60, false)).toBeNull();
  });

  it('refuses a distance that is not a positive number', () => {
    // The side is the caller's to state. A minus sign must not quietly move
    // the statutory barrier to the other side of the boundary.
    expect(offsetPolygonEN(ccw, -7.5, false)).toBeNull();
    expect(offsetPolygonEN(ccw, 0, false)).toBeNull();
    expect(offsetPolygonEN(ccw, NaN, false)).toBeNull();
    expect(offsetPolygonEN(ccw, Infinity, false)).toBeNull();
  });

  it('refuses a ring that is not a polygon', () => {
    expect(offsetPolygonEN([], 7.5, false)).toBeNull();
    expect(offsetPolygonEN([P(0, 0), P(10, 0)], 7.5, false)).toBeNull();
    // Three points where the last repeats the first is a two-point ring.
    expect(offsetPolygonEN([P(0, 0), P(10, 0), P(0, 0)], 7.5, false)).toBeNull();
  });

  it('accepts a ring whether or not it repeats its closing vertex', () => {
    const closed = [...ccw, P(E0, N0)];
    const a = offsetPolygonEN(ccw, 7.5, false)!;
    const b = offsetPolygonEN(closed, 7.5, false)!;
    expect(area(b)).toBeCloseTo(area(a), 9);
  });

  it('agrees with polygonAreaPerimeter on the belt it produces', () => {
    // The screen reports the belt area through polygonAreaPerimeter, so the
    // two must not disagree about the same ring.
    const inner = offsetPolygonEN(ccw, 7.5, false)!;
    expect(polygonAreaPerimeter(inner).areaM2).toBeCloseTo(7225, 4);
  });

  it('the lat/lon entry point offsets the same ground', () => {
    // boundaryOffset shares the core, so a lat/lon parcel must move the same
    // way: outward is bigger, inward smaller, and neither depends on winding.
    const sq = [
      { lat: 23.5, lon: 85.0 },
      { lat: 23.5, lon: 85.001 },
      { lat: 23.501, lon: 85.001 },
      { lat: 23.501, lon: 85.0 }
    ];
    const outward = boundaryOffset(sq, 10, true, 45, false);
    const inward = boundaryOffset(sq, 10, false, 45, false);
    expect(outward).not.toBeNull();
    expect(inward).not.toBeNull();
    const box = (ll: { lat: number; lon: number }[]) =>
      (Math.max(...ll.map(p => p.lat)) - Math.min(...ll.map(p => p.lat))) *
      (Math.max(...ll.map(p => p.lon)) - Math.min(...ll.map(p => p.lon)));
    expect(box(outward!)).toBeGreaterThan(box(sq));
    expect(box(inward!)).toBeLessThan(box(sq));
  });

  it('the lat/lon entry point closes its ring and refuses like the core', () => {
    const sq = [
      { lat: 23.5, lon: 85.0 },
      { lat: 23.5, lon: 85.001 },
      { lat: 23.501, lon: 85.001 },
      { lat: 23.501, lon: 85.0 }
    ];
    const out = boundaryOffset(sq, 10, true, 45, false)!;
    expect(out[0].lat).toBeCloseTo(out[out.length - 1].lat, 12);
    expect(out[0].lon).toBeCloseTo(out[out.length - 1].lon, 12);
    // A 200 m inward offset of a ~100 m parcel has nothing left to return.
    expect(boundaryOffset(sq, 200, false, 45, false)).toBeNull();
  });
});
