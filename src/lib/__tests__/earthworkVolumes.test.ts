import { describe, it, expect } from 'vitest';
import { avgEndArea, dtmGridVolume } from '../geodesy';

// ---------------------------------------------------------------------------
// The two earthwork volume methods
// ---------------------------------------------------------------------------
// Neither is reachable from the application: nothing imports them, and the
// README's capability list has been corrected to say so. They are real,
// working code that someone may wire up, so the arithmetic is pinned here
// against analytically exact values — and the two places where the cut/fill
// split is not what a reader would assume are documented rather than left to
// be discovered after it is on a screen.

describe('average end area', () => {
  it('gives a prism for two equal sections', () => {
    // Constant 12 m2 over 50 m is 600 m3, exactly.
    const r = avgEndArea([{ chainage: 0, area: 12 }, { chainage: 50, area: 12 }]);
    expect(r.volume).toBeCloseTo(600, 9);
    expect(r.cut).toBeCloseTo(600, 9);
    expect(r.fill).toBeCloseTo(0, 9);
  });

  it('gives half a prism for a wedge closing to nothing', () => {
    // 0 to 12 m2 over 50 m is 300 m3 — the trapezoidal rule is exact here.
    expect(avgEndArea([{ chainage: 0, area: 0 }, { chainage: 50, area: 12 }]).volume)
      .toBeCloseTo(300, 9);
  });

  it('sums a chain of sections', () => {
    // (0+10)/2*20 + (10+20)/2*20 = 100 + 300 = 400
    const r = avgEndArea([
      { chainage: 0, area: 0 },
      { chainage: 20, area: 10 },
      { chainage: 40, area: 20 }
    ]);
    expect(r.volume).toBeCloseTo(400, 9);
  });

  it('reads chainage in either direction', () => {
    const forward = avgEndArea([{ chainage: 0, area: 10 }, { chainage: 20, area: 20 }]).volume;
    const backward = avgEndArea([{ chainage: 20, area: 10 }, { chainage: 0, area: 20 }]).volume;
    expect(backward).toBeCloseTo(forward, 9);
  });

  it('returns nothing for a single section, which spans no length', () => {
    expect(avgEndArea([{ chainage: 0, area: 10 }]).volume).toBe(0);
    expect(avgEndArea([]).volume).toBe(0);
  });

  // --- the two behaviours worth knowing before this is put on a screen ---

  it('reports fill as a negative volume, not a positive quantity of material', () => {
    // Sections are signed: positive is cut, negative is fill. The fill total
    // therefore comes back negative. A screen showing it verbatim would read
    // "Fill: -300 m3", which is not how a quantity of material is ordered.
    const r = avgEndArea([{ chainage: 0, area: -10 }, { chainage: 20, area: -20 }]);
    expect(r.volume).toBeCloseTo(-300, 9);
    expect(r.fill).toBeCloseTo(-300, 9);
    expect(r.cut).toBeCloseTo(0, 9);
  });

  it('classifies a whole transition section by the sign of its ends combined', () => {
    // A section running +10 to -10 crosses zero at its midpoint: in reality
    // 50 m3 of cut and 50 m3 of fill. The method assigns the whole span to one
    // side by the sign of (a1 + a2), so both come back as zero here.
    //
    // The NET volume is right, and that is what the method is for. The cut and
    // fill split is not, and those are the numbers that get priced separately.
    const r = avgEndArea([{ chainage: 0, area: 10 }, { chainage: 20, area: -10 }]);
    expect(r.volume, 'the net volume is correct').toBeCloseTo(0, 9);
    expect(r.cut, 'cut is reported as zero despite 50 m3 of cut').toBeCloseTo(0, 9);
    expect(r.fill, 'fill is reported as zero despite 50 m3 of fill').toBeCloseTo(0, 9);
  });
});

describe('DTM grid volume', () => {
  /** A regular grid of n x n points at the given spacing, all at height z. */
  const grid = (n: number, spacing: number, z: number | ((i: number, j: number) => number)) => {
    const pts: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        pts.push({ x: i * spacing, y: j * spacing, z: typeof z === 'number' ? z : z(i, j) });
      }
    }
    return pts;
  };

  it('multiplies height by cell area over every point', () => {
    // 16 points, 10 m spacing, 5 m above datum: 16 * 5 * 100 = 8000 m3.
    const r = dtmGridVolume(grid(4, 10, 5), 0, 10);
    expect(r.cell).toBeCloseTo(100, 9);
    expect(r.cut).toBeCloseTo(8000, 9);
    expect(r.fill).toBeCloseTo(0, 9);
    expect(r.net).toBeCloseTo(8000, 9);
    expect(r.count).toBe(16);
  });

  it('separates cut from fill and reports fill as a positive quantity', () => {
    // Unlike the end-area method, this one negates before accumulating, so
    // fill is the amount of material to place rather than a negative volume.
    const pts = [
      { x: 0, y: 0, z: 5 }, { x: 10, y: 0, z: 5 },
      { x: 0, y: 10, z: -3 }, { x: 10, y: 10, z: -3 }
    ];
    const r = dtmGridVolume(pts, 0, 10);
    expect(r.cut).toBeCloseTo(2 * 5 * 100, 9);
    expect(r.fill).toBeCloseTo(2 * 3 * 100, 9);
    expect(r.fill).toBeGreaterThan(0);
    expect(r.net).toBeCloseTo(1000 - 600, 9);
  });

  it('measures against the stated datum, not against zero', () => {
    const r = dtmGridVolume(grid(2, 10, 105), 100, 10);
    expect(r.cut).toBeCloseTo(4 * 5 * 100, 9);
  });

  it('infers the grid pitch when none is given', () => {
    // The median nearest-neighbour distance of a 10 m grid is 10 m.
    const r = dtmGridVolume(grid(5, 10, 2), 0);
    expect(r.spacing).toBeCloseTo(10, 6);
    expect(r.cell).toBeCloseTo(100, 6);
  });

  it('refuses an empty surface rather than reporting a volume of zero', () => {
    // Zero points is not a flat site; it is no survey at all.
    expect(() => dtmGridVolume([], 0)).toThrow(/no surface points/i);
  });
});
