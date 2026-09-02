import { describe, it, expect } from 'vitest';
import { helmertFit, affineFit, fitRedundancy } from '../geodesy';

// ---------------------------------------------------------------------------
// A residual of zero is not evidence of a good fit
// ---------------------------------------------------------------------------
// The residual is the only thing telling a surveyor whether a georeference is
// any good. At the minimum number of control points the fit passes exactly
// through every one of them, so the residual is zero by construction and stays
// zero however wrong the points are.
//
// Both fits in this codebase accept exactly that minimum: the Helmert fit takes
// 2 points for 4 unknowns, and the cadastral digitiser's affine takes 3 for 6.
// Three points is also what someone placing the fewest allowed will use.

describe('the Helmert fit at its minimum point count', () => {
  const clean = [
    { x: 100, y: 100, X: 254800, Y: 2605200 },
    { x: 900, y: 100, X: 255600, Y: 2605200 }
  ];
  /** The same pair with one ground coordinate mis-keyed by 50 m. */
  const miskeyed = [
    { x: 100, y: 100, X: 254800, Y: 2605200 },
    { x: 900, y: 100, X: 255650, Y: 2605200 }
  ];

  it('reports zero residual even when a control point is 50 m wrong', () => {
    const bad = helmertFit(miskeyed);
    expect(bad.rms).toBeCloseTo(0, 9);
    expect(bad.maxRes).toBeCloseTo(0, 9);
    // The error does not vanish — it is absorbed into the scale, unremarked.
    expect(bad.scale).toBeCloseTo(1.0625, 4);
    expect(helmertFit(clean).scale).toBeCloseTo(1, 9);
  });

  it('says the residual cannot mean anything there', () => {
    const r = helmertFit(miskeyed).redundancy;
    expect(r.degreesOfFreedom).toBe(0);
    expect(r.residualsAreMeaningful).toBe(false);
    expect(r.caution).toMatch(/0 by construction/);
  });

  it('and says nothing once there is a spare observation', () => {
    const three = [...clean, { x: 100, y: 900, X: 254800, Y: 2606000 }];
    const r = helmertFit(three);
    expect(r.redundancy.degreesOfFreedom).toBe(2);
    expect(r.redundancy.residualsAreMeaningful).toBe(true);
    expect(r.redundancy.caution).toBeNull();
  });

  it('a third point makes the same 50 m error visible', () => {
    const three = [...miskeyed, { x: 100, y: 900, X: 254800, Y: 2606000 }];
    expect(helmertFit(three).rms).toBeGreaterThan(10);
  });
});

describe('the cadastral affine fit at its minimum point count', () => {
  const p = (pixelX: number, pixelY: number, E: number, N: number) => ({ pixelX, pixelY, E, N });
  const threeClean = [p(100, 100, 254800, 2605200), p(900, 100, 255600, 2605200), p(100, 900, 254800, 2604400)];

  it('reports zero RMSE for three points however wrong they are', () => {
    // One sheet corner mis-identified by 40 m.
    const threeBad = [p(100, 100, 254800, 2605200), p(900, 100, 255640, 2605200), p(100, 900, 254800, 2604400)];
    const fit = affineFit(threeBad)!;
    expect(fit.rmse).toBeCloseTo(0, 6);
    expect(fit.redundancy.degreesOfFreedom).toBe(0);
    expect(fit.redundancy.residualsAreMeaningful).toBe(false);
    expect(fit.redundancy.caution).toMatch(/4th point/);
  });

  it('a fourth point makes the same error visible', () => {
    const fourBad = [
      p(100, 100, 254800, 2605200), p(900, 100, 255640, 2605200),
      p(100, 900, 254800, 2604400), p(900, 900, 255600, 2604400)
    ];
    const fit = affineFit(fourBad)!;
    expect(fit.rmse).toBeGreaterThan(5);
    expect(fit.redundancy.residualsAreMeaningful).toBe(true);
    expect(fit.redundancy.caution).toBeNull();
  });

  it('solves a clean sheet exactly and refuses fewer than three points', () => {
    const fit = affineFit(threeClean)!;
    expect(fit.rmse).toBeCloseTo(0, 6);
    expect(affineFit(threeClean.slice(0, 2))).toBeNull();
  });
});

describe('fitRedundancy', () => {
  it('counts two equations per control point', () => {
    expect(fitRedundancy(2, 4).degreesOfFreedom).toBe(0);
    expect(fitRedundancy(3, 4).degreesOfFreedom).toBe(2);
    expect(fitRedundancy(3, 6).degreesOfFreedom).toBe(0);
    expect(fitRedundancy(4, 6).degreesOfFreedom).toBe(2);
  });

  it('names the point count that would help', () => {
    expect(fitRedundancy(2, 4).caution).toMatch(/3rd point/);
    expect(fitRedundancy(3, 6).caution).toMatch(/4th point/);
  });
});
