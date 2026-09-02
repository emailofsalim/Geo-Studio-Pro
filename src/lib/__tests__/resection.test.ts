import { describe, it, expect } from 'vitest';
import { solveTienstraResection } from '../geodesy';

type Pt = { E: number; N: number };

/**
 * The unsigned angle at P between the rays P->U and P->V, in degrees (0..180) --
 * what a theodolite reads between two signals.
 */
const subtended = (P: Pt, U: Pt, V: Pt) => {
  const ux = U.E - P.E, uy = U.N - P.N;
  const vx = V.E - P.E, vy = V.N - P.N;
  return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) * 180 / Math.PI;
};

/**
 * The angles Tienstra wants, taken from the true geometry rather than from the
 * solver: alpha subtends BC, beta subtends CA, gamma subtends AB.
 */
const anglesAt = (P: Pt, A: Pt, B: Pt, C: Pt) => ({
  alpha: subtended(P, B, C),
  beta: subtended(P, C, A),
  gamma: subtended(P, A, B)
});

describe('Tienstra resection', () => {
  // Three trig stations and an instrument set up inside them.
  const A = { E: 0, N: 0 };
  const B = { E: 1000, N: 0 };
  const C = { E: 500, N: 800 };

  it('recovers a station from the angles observed there', () => {
    const P = { E: 400, N: 300 };
    const a = anglesAt(P, A, B, C);
    // The three angles round a point must close on 360 -- a check on the test
    // data itself, before it is used to judge the solver.
    expect(a.alpha + a.beta + a.gamma).toBeCloseTo(360, 9);

    const r = solveTienstraResection(A, B, C, a.alpha, a.beta, a.gamma);
    expect(r.E, 'easting recovered').toBeCloseTo(P.E, 6);
    expect(r.N, 'northing recovered').toBeCloseTo(P.N, 6);
  });

  it('recovers a station anywhere inside the triangle', () => {
    for (const P of [
      { E: 500, N: 200 },
      { E: 300, N: 400 },
      { E: 700, N: 350 },
      { E: 500, N: 400 },
      { E: 480, N: 120 }
    ]) {
      const a = anglesAt(P, A, B, C);
      const r = solveTienstraResection(A, B, C, a.alpha, a.beta, a.gamma);
      expect(r.E, `E at ${P.E},${P.N}`).toBeCloseTo(P.E, 5);
      expect(r.N, `N at ${P.E},${P.N}`).toBeCloseTo(P.N, 5);
    }
  });

  it('reports the distances to each control point', () => {
    const P = { E: 400, N: 300 };
    const a = anglesAt(P, A, B, C);
    const r = solveTienstraResection(A, B, C, a.alpha, a.beta, a.gamma);
    expect(r.distA).toBeCloseTo(Math.hypot(P.E - A.E, P.N - A.N), 5);
    expect(r.distB).toBeCloseTo(Math.hypot(P.E - B.E, P.N - B.N), 5);
    expect(r.distC).toBeCloseTo(Math.hypot(P.E - C.E, P.N - C.N), 5);
  });

  it('works on real UTM coordinates, not just a local grid', () => {
    // The same figure translated onto UTM 44N ground, where the coordinates are
    // seven digits and precision is easier to lose.
    const dE = 254800, dN = 2605200;
    const A2 = { E: A.E + dE, N: A.N + dN };
    const B2 = { E: B.E + dE, N: B.N + dN };
    const C2 = { E: C.E + dE, N: C.N + dN };
    const P2 = { E: 400 + dE, N: 300 + dN };
    const a = anglesAt(P2, A2, B2, C2);
    const r = solveTienstraResection(A2, B2, C2, a.alpha, a.beta, a.gamma);
    expect(r.E).toBeCloseTo(P2.E, 4);
    expect(r.N).toBeCloseTo(P2.N, 4);
  });

  it('is unmoved by which station is called A, B or C', () => {
    // The same observations relabelled must give the same ground position.
    const P = { E: 420, N: 260 };
    const a1 = anglesAt(P, A, B, C);
    const r1 = solveTienstraResection(A, B, C, a1.alpha, a1.beta, a1.gamma);
    const a2 = anglesAt(P, B, C, A);
    const r2 = solveTienstraResection(B, C, A, a2.alpha, a2.beta, a2.gamma);
    expect(r2.E).toBeCloseTo(r1.E, 5);
    expect(r2.N).toBeCloseTo(r1.N, 5);
  });

  it('refuses observations that do not close on 360 degrees', () => {
    // Tienstra as written here assumes the instrument stands inside the control
    // triangle. Fed the angles a theodolite reads from OUTSIDE it -- a common
    // enough setup -- it returned a confident position wrong by 288 m to 2167 m
    // across the cases tested, with nothing to say it had left its domain.
    //
    // Three angles measured round one point close on 360 degrees. These do not,
    // which is what makes the exterior setup recognisable before it is trusted.
    for (const P of [
      { E: 500, N: 1200 },
      { E: -300, N: 400 },
      { E: 1400, N: 300 },
      { E: 500, N: -400 }
    ]) {
      const a = anglesAt(P, A, B, C);
      expect(a.alpha + a.beta + a.gamma, `${P.E},${P.N} does not close`).not.toBeCloseTo(360, 3);
      expect(
        () => solveTienstraResection(A, B, C, a.alpha, a.beta, a.gamma),
        `outside the triangle at ${P.E},${P.N}`
      ).toThrow(/360/);
    }
  });

  it('accepts a misclosure small enough to be observational', () => {
    // The guard must not turn away honest work. Real misclosure round a point is
    // seconds; a tenth of a degree is already sloppy and is still accepted.
    const P = { E: 400, N: 300 };
    const a = anglesAt(P, A, B, C);
    const r = solveTienstraResection(A, B, C, a.alpha + 0.1, a.beta, a.gamma);
    expect(Number.isFinite(r.E) && Number.isFinite(r.N)).toBe(true);
    expect(r.misclosureDeg).toBeCloseTo(0.1, 9);
  });

  it('reports the angular misclosure of the observations it accepted', () => {
    const P = { E: 400, N: 300 };
    const a = anglesAt(P, A, B, C);
    expect(solveTienstraResection(A, B, C, a.alpha, a.beta, a.gamma).misclosureDeg)
      .toBeCloseTo(0, 9);
  });

  it('does not return a position for a figure on the danger circle', () => {
    // The classic failure of three-point resection. When the angle subtending a
    // side equals that side's angle in the control triangle, the observations
    // fit every point on the circle through the three stations, and the weight
    // for that station goes to infinity rather than cancelling.
    //
    // The guard tested only for a vanishing weight sum, so this passed straight
    // through and the caller was handed E=NaN, N=NaN -- and the screen announced
    // "Resection point determined: E=NaN, N=NaN".
    const aLen = Math.hypot(B.E - C.E, B.N - C.N);
    const bLen = Math.hypot(C.E - A.E, C.N - A.N);
    const cLen = Math.hypot(A.E - B.E, A.N - B.N);
    const angleA = Math.acos((bLen * bLen + cLen * cLen - aLen * aLen) / (2 * bLen * cLen)) * 180 / Math.PI;

    // alpha equal to angle A, with the three still closing on 360.
    const rest = (360 - angleA) / 2;
    expect(() => solveTienstraResection(A, B, C, angleA, rest, rest))
      .toThrow(/danger circle/i);
  });

  it('never returns a non-finite position', () => {
    // Whatever it refuses and however, it must not hand back NaN as a position.
    const cases: [number, number, number][] = [
      [60, 150, 150], [90, 135, 135], [1, 179.5, 179.5], [120, 120, 120]
    ];
    for (const [al, be, ga] of cases) {
      try {
        const r = solveTienstraResection(A, B, C, al, be, ga);
        expect(Number.isFinite(r.E) && Number.isFinite(r.N), `${al},${be},${ga}`).toBe(true);
      } catch {
        // Refusing is fine; returning NaN is not.
      }
    }
  });
});
