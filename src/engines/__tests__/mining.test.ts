import { describe, it, expect } from 'vitest';
import {
  benchGeometry,
  drillPattern,
  layoutDrillHoles,
  blastDesign,
  conicalStockpile,
  frustumStockpile,
  stockpileHeightFromRepose,
  blockReserve
} from '../mining';

describe('bench geometry', () => {
  it('computes the face run from height and face angle', () => {
    // A 10 m bench at 45 degrees runs out exactly 10 m.
    const g = benchGeometry({ benchHeightM: 10, faceAngleDeg: 45, bermWidthM: 5, benchCount: 1 });
    expect(g.faceRunM).toBeCloseTo(10, 9);
    expect(g.totalHeightM).toBe(10);
  });

  it('excludes a berm below the bottom bench', () => {
    // Three 10 m benches at 45 degrees with 5 m berms: 30 m of face run plus
    // only two berms, because the lowest toe is the bottom of the wall.
    const g = benchGeometry({ benchHeightM: 10, faceAngleDeg: 45, bermWidthM: 5, benchCount: 3 });
    expect(g.totalRunM).toBeCloseTo(30 + 10, 9);
    expect(g.totalHeightM).toBe(30);
  });

  it('gives an overall slope flatter than the face angle', () => {
    // This is the point of the calculation: quoting the face angle as the wall
    // angle overstates how steep the wall really stands.
    const g = benchGeometry({ benchHeightM: 12, faceAngleDeg: 70, bermWidthM: 6, benchCount: 4 });
    expect(g.overallSlopeAngleDeg).toBeLessThan(70);
    expect(g.overallSlopeAngleDeg).toBeGreaterThan(0);
  });

  it('equals the face angle when there are no berms', () => {
    const g = benchGeometry({ benchHeightM: 10, faceAngleDeg: 60, bermWidthM: 0, benchCount: 5 });
    expect(g.overallSlopeAngleDeg).toBeCloseTo(60, 9);
  });

  it('flattens as the berm widens', () => {
    const narrow = benchGeometry({ benchHeightM: 10, faceAngleDeg: 65, bermWidthM: 4, benchCount: 4 });
    const wide = benchGeometry({ benchHeightM: 10, faceAngleDeg: 65, bermWidthM: 10, benchCount: 4 });
    expect(wide.overallSlopeAngleDeg).toBeLessThan(narrow.overallSlopeAngleDeg);
  });

  it('rejects impossible geometry rather than returning a nonsense angle', () => {
    expect(() => benchGeometry({ benchHeightM: 0, faceAngleDeg: 60, bermWidthM: 5, benchCount: 2 })).toThrow(/bench height/i);
    expect(() => benchGeometry({ benchHeightM: 10, faceAngleDeg: 90, bermWidthM: 5, benchCount: 2 })).toThrow(/face angle/i);
    expect(() => benchGeometry({ benchHeightM: 10, faceAngleDeg: 0, bermWidthM: 5, benchCount: 2 })).toThrow(/face angle/i);
    expect(() => benchGeometry({ benchHeightM: 10, faceAngleDeg: 60, bermWidthM: -1, benchCount: 2 })).toThrow(/berm/i);
    expect(() => benchGeometry({ benchHeightM: 10, faceAngleDeg: 60, bermWidthM: 5, benchCount: 0 })).toThrow(/bench count/i);
  });
});

describe('drill pattern', () => {
  const base = { burdenM: 3, spacingM: 3.5, areaM2: 2000, benchHeightM: 9 };

  it('computes area and volume per hole', () => {
    const p = drillPattern(base);
    expect(p.areaPerHoleM2).toBeCloseTo(10.5, 9);
    expect(p.volumePerHoleM3).toBeCloseTo(94.5, 9); // 3 x 3.5 x 9
  });

  it('rounds the hole count up so the whole block is covered', () => {
    const p = drillPattern(base);
    expect(p.holeCount).toBe(Math.ceil(2000 / 10.5));
    expect(p.holeCount * p.areaPerHoleM2).toBeGreaterThanOrEqual(2000);
  });

  it('defaults subdrill to 0.3 of the burden and adds it to hole depth', () => {
    const p = drillPattern(base);
    expect(p.subdrillM).toBeCloseTo(0.9, 9);
    expect(p.holeDepthM).toBeCloseTo(9.9, 9);
  });

  it('honours an explicit subdrill', () => {
    const p = drillPattern({ ...base, subdrillM: 0 });
    expect(p.subdrillM).toBe(0);
    expect(p.holeDepthM).toBe(9);
  });

  it('reports the drill factor in metres per cubic metre', () => {
    const p = drillPattern(base);
    expect(p.drillFactorMPerM3).toBeCloseTo(p.totalDrillMetres / p.totalVolumeM3, 12);
    expect(p.drillFactorMPerM3).toBeGreaterThan(0);
  });

  it('warns when spacing is tighter than the burden', () => {
    const p = drillPattern({ ...base, burdenM: 4, spacingM: 3 });
    expect(p.spacingToBurdenRatio).toBeLessThan(1);
    expect(p.warnings.join(' ')).toMatch(/less than the burden/i);
  });

  it('warns on a stiff bench', () => {
    // Bench height under twice the burden throws flyrock and breaks poorly.
    const p = drillPattern({ ...base, burdenM: 5, spacingM: 6, benchHeightM: 8 });
    expect(p.warnings.join(' ')).toMatch(/stiff bench/i);
  });

  it('stays quiet on a conventional pattern', () => {
    const p = drillPattern({ burdenM: 3, spacingM: 3.6, areaM2: 1000, benchHeightM: 10 });
    expect(p.warnings).toHaveLength(0);
  });

  it('rejects non-physical inputs', () => {
    expect(() => drillPattern({ ...base, burdenM: 0 })).toThrow(/burden/i);
    expect(() => drillPattern({ ...base, spacingM: -1 })).toThrow(/spacing/i);
    expect(() => drillPattern({ ...base, areaM2: 0 })).toThrow(/area/i);
  });
});

describe('drill hole layout', () => {
  it('places rows one burden apart and holes one spacing apart', () => {
    const holes = layoutDrillHoles(10, 6, 3, 5, 'square');
    const rows = [...new Set(holes.map(h => h.y))].sort((a, b) => a - b);
    expect(rows).toEqual([0, 3, 6]);
    const firstRow = holes.filter(h => h.y === 0).map(h => h.x);
    expect(firstRow).toEqual([0, 5, 10]);
  });

  it('offsets alternate rows by half a spacing when staggered', () => {
    const holes = layoutDrillHoles(10, 3, 3, 4, 'staggered');
    const row0 = holes.filter(h => h.row === 0).map(h => h.x);
    const row1 = holes.filter(h => h.row === 1).map(h => h.x);
    expect(row0[0]).toBe(0);
    expect(row1[0]).toBe(2); // half of 4
  });

  it('produces the same rows for square and staggered patterns', () => {
    const sq = layoutDrillHoles(20, 9, 3, 4, 'square');
    const st = layoutDrillHoles(20, 9, 3, 4, 'staggered');
    expect(new Set(sq.map(h => h.row)).size).toBe(new Set(st.map(h => h.row)).size);
  });

  it('returns positions in local block coordinates, not project coordinates', () => {
    // Deliberate: the engine must not invent coordinates in an unstated CRS.
    const holes = layoutDrillHoles(10, 3, 3, 5);
    expect(Math.min(...holes.map(h => h.x))).toBe(0);
    expect(Math.min(...holes.map(h => h.y))).toBe(0);
  });

  it('rejects a zero-sized block', () => {
    expect(() => layoutDrillHoles(0, 5, 3, 4)).toThrow(/width and depth/i);
    expect(() => layoutDrillHoles(5, 5, 0, 4)).toThrow(/burden and spacing/i);
  });
});

describe('blast design', () => {
  const pattern = drillPattern({ burdenM: 3, spacingM: 3.5, areaM2: 1050, benchHeightM: 9 });

  it('computes linear charge density from hole area and explosive density', () => {
    // (pi/4) x 0.115^2 x 800 = 8.31 kg/m for a 115 mm hole loaded with ANFO.
    const b = blastDesign({
      holeDiameterMm: 115,
      explosiveDensityKgM3: 800,
      rockDensityKgM3: 2600,
      pattern
    });
    expect(b.linearChargeDensityKgPerM).toBeCloseTo(8.31, 2);
  });

  it('scales charge density with the square of the diameter', () => {
    const small = blastDesign({ holeDiameterMm: 100, explosiveDensityKgM3: 800, rockDensityKgM3: 2600, pattern });
    const big = blastDesign({ holeDiameterMm: 200, explosiveDensityKgM3: 800, rockDensityKgM3: 2600, pattern });
    expect(big.linearChargeDensityKgPerM / small.linearChargeDensityKgPerM).toBeCloseTo(4, 9);
  });

  it('charges the hole below the stemming only', () => {
    const b = blastDesign({
      holeDiameterMm: 115,
      explosiveDensityKgM3: 800,
      rockDensityKgM3: 2600,
      stemmingM: 3,
      pattern
    });
    expect(b.chargeLengthM).toBeCloseTo(pattern.holeDepthM - 3, 9);
    expect(b.chargePerHoleKg).toBeCloseTo(b.chargeLengthM * b.linearChargeDensityKgPerM, 9);
  });

  it('defaults stemming to the burden', () => {
    const b = blastDesign({ holeDiameterMm: 115, explosiveDensityKgM3: 800, rockDensityKgM3: 2600, pattern });
    expect(b.stemmingM).toBe(pattern.burdenM);
  });

  it('reports powder factor per cubic metre and per tonne consistently', () => {
    const b = blastDesign({ holeDiameterMm: 115, explosiveDensityKgM3: 800, rockDensityKgM3: 2600, pattern });
    expect(b.powderFactorKgPerM3).toBeCloseTo(b.totalExplosiveKg / b.totalVolumeM3, 9);
    expect(b.powderFactorKgPerTonne).toBeCloseTo(b.totalExplosiveKg / b.totalTonnes, 9);
    // Per-tonne must be the per-m3 figure divided by density in t/m3.
    expect(b.powderFactorKgPerTonne).toBeCloseTo(b.powderFactorKgPerM3 / 2.6, 6);
  });

  it('lands in the usual range for a conventional hard-rock design', () => {
    const b = blastDesign({ holeDiameterMm: 115, explosiveDensityKgM3: 800, rockDensityKgM3: 2600, pattern });
    expect(b.powderFactorKgPerM3).toBeGreaterThan(0.2);
    expect(b.powderFactorKgPerM3).toBeLessThan(1.0);
  });

  it('warns about short stemming', () => {
    const b = blastDesign({
      holeDiameterMm: 115,
      explosiveDensityKgM3: 800,
      rockDensityKgM3: 2600,
      stemmingM: 1,
      pattern
    });
    expect(b.warnings.join(' ')).toMatch(/stemming/i);
    expect(b.warnings.join(' ')).toMatch(/flyrock/i);
  });

  it('refuses a design with no room for explosive', () => {
    expect(() =>
      blastDesign({
        holeDiameterMm: 115,
        explosiveDensityKgM3: 800,
        rockDensityKgM3: 2600,
        stemmingM: pattern.holeDepthM,
        pattern
      })
    ).toThrow(/no room for explosive/i);
  });
});

describe('stockpiles', () => {
  it('computes a conical volume as one third of the enclosing cylinder', () => {
    const s = conicalStockpile(10, 6, 1600);
    expect(s.volumeM3).toBeCloseTo((Math.PI / 3) * 100 * 6, 9);
    expect(s.volumeM3).toBeCloseTo((Math.PI * 100 * 6) / 3, 9);
    expect(s.tonnes).toBeCloseTo((s.volumeM3 * 1600) / 1000, 9);
  });

  it('converts loose volume back to in-situ using the swell factor', () => {
    const s = conicalStockpile(10, 6, 1600, 1.5);
    expect(s.looseVolumeM3).toBeCloseTo(s.volumeM3 / 1.5, 9);
  });

  it('reduces to the cone formula when a frustum has zero top radius', () => {
    const cone = conicalStockpile(10, 6, 1600);
    const frustum = frustumStockpile(10, 0, 6, 1600);
    expect(frustum.volumeM3).toBeCloseTo(cone.volumeM3, 9);
  });

  it('gives a flat-topped pile more volume than a full cone of the same base', () => {
    const cone = conicalStockpile(10, 6, 1600);
    const flat = frustumStockpile(10, 4, 6, 1600);
    expect(flat.volumeM3).toBeGreaterThan(cone.volumeM3);
  });

  it('derives peak height from the angle of repose', () => {
    expect(stockpileHeightFromRepose(10, 45)).toBeCloseTo(10, 9);
    expect(stockpileHeightFromRepose(10, 37)).toBeCloseTo(10 * Math.tan(37 * Math.PI / 180), 9);
  });

  it('rejects a top radius wider than the base', () => {
    expect(() => frustumStockpile(5, 8, 4, 1600)).toThrow(/top radius cannot exceed/i);
  });

  it('rejects non-physical dimensions', () => {
    expect(() => conicalStockpile(0, 6, 1600)).toThrow(/radius/i);
    expect(() => conicalStockpile(10, 0, 1600)).toThrow(/height/i);
    expect(() => stockpileHeightFromRepose(10, 90)).toThrow(/angle of repose/i);
  });
});

describe('block reserves', () => {
  it('computes in-situ volume and tonnage', () => {
    const r = blockReserve({ areaM2: 10000, seamThicknessM: 5, oreDensityKgM3: 2400 });
    expect(r.inSituVolumeM3).toBe(50000);
    expect(r.inSituTonnes).toBe(120000);
    expect(r.recoverableTonnes).toBe(120000); // recovery defaults to 1
  });

  it('applies the recovery factor', () => {
    const r = blockReserve({ areaM2: 10000, seamThicknessM: 5, oreDensityKgM3: 2400, recoveryFactor: 0.85 });
    expect(r.recoverableTonnes).toBeCloseTo(102000, 6);
  });

  it('computes the stripping ratio by mass', () => {
    const r = blockReserve({
      areaM2: 10000,
      seamThicknessM: 5,
      oreDensityKgM3: 2400,
      overburdenThicknessM: 10,
      overburdenDensityKgM3: 1800
    });
    expect(r.overburdenTonnes).toBe(180000);
    expect(r.strippingRatio).toBeCloseTo(180000 / 120000, 9);
  });

  it('reports a zero stripping ratio when there is no overburden', () => {
    const r = blockReserve({ areaM2: 10000, seamThicknessM: 5, oreDensityKgM3: 2400 });
    expect(r.overburdenTonnes).toBe(0);
    expect(r.strippingRatio).toBe(0);
  });

  it('rejects an out-of-range recovery factor', () => {
    expect(() => blockReserve({ areaM2: 1, seamThicknessM: 1, oreDensityKgM3: 1, recoveryFactor: 0 })).toThrow(/recovery/i);
    expect(() => blockReserve({ areaM2: 1, seamThicknessM: 1, oreDensityKgM3: 1, recoveryFactor: 1.2 })).toThrow(/recovery/i);
  });
});
