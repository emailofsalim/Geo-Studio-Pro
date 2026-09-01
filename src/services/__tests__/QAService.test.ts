import { describe, it, expect } from 'vitest';
import { QAService } from '../QAService';

/**
 * The dashboard reports "Health: 100%" from this audit. A validator nobody has
 * seen fail is worse than no validator, because the clean bill of health is
 * taken at face value. These tests exist to prove each check can actually fire,
 * and that a clean dataset does not.
 */

const goodWaypoint = (id: string, E: number, N: number) => ({ id, E, N, Z: 100 });
const polygon = (name: string, pts: { a: number; b: number }[]) => ({
  name,
  geom: 'polygon' as const,
  kind: 'en' as const,
  pts
});
const layerOf = (features: any[]) => ({ id: 'L1', name: 'Test Layer', features });

const square = [
  { a: 255000, b: 2605000 },
  { a: 255100, b: 2605000 },
  { a: 255100, b: 2605100 },
  { a: 255000, b: 2605100 }
];

describe('QAService — a clean dataset passes', () => {
  it('gives a full score and PASSED for sound data', () => {
    const r = QAService.auditProjectData({
      waypoints: [goodWaypoint('P1', 255000, 2605000), goodWaypoint('P2', 255100, 2605100)],
      layers: [layerOf([polygon('Block A', square)])],
      parcels: [],
      boreholes: []
    });
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBe(0);
    expect(r.overallScore).toBe(100);
    expect(r.status).toBe('PASSED');
  });

  it('passes an empty project rather than inventing problems', () => {
    const r = QAService.auditProjectData({});
    expect(r.status).toBe('PASSED');
    expect(r.issues).toHaveLength(0);
    expect(r.metrics.totalWaypoints).toBe(0);
  });

  it('counts what it audited', () => {
    const r = QAService.auditProjectData({
      waypoints: [goodWaypoint('P1', 255000, 2605000)],
      layers: [layerOf([polygon('A', square), polygon('B', square)])],
      parcels: [],
      boreholes: []
    });
    expect(r.metrics.totalWaypoints).toBe(1);
    expect(r.metrics.totalLayers).toBe(1);
    expect(r.metrics.totalFeatures).toBe(2);
  });
});

describe('QAService — coordinate checks fire', () => {
  it('catches a point at Null Island', () => {
    // (0,0) is the classic sign of a coordinate that was never actually set.
    const r = QAService.auditProjectData({ waypoints: [goodWaypoint('P1', 0, 0)] });
    expect(r.issues.some(i => i.type === 'Null Island Coordinates')).toBe(true);
    expect(r.errorCount).toBeGreaterThan(0);
    expect(r.status).toBe('CRITICAL_ERRORS');
  });

  it('catches an easting no UTM grid could produce', () => {
    const r = QAService.auditProjectData({ waypoints: [goodWaypoint('P1', 9_000_000, 2605000)] });
    expect(r.issues.some(i => i.type === 'Abnormal Easting')).toBe(true);
  });

  it('catches two points stacked at the same position', () => {
    const r = QAService.auditProjectData({
      waypoints: [goodWaypoint('P1', 255000, 2605000), goodWaypoint('P2', 255000, 2605000)]
    });
    expect(r.issues.some(i => i.type === 'Stacked Coordinates')).toBe(true);
  });
});

describe('QAService — geometry checks fire', () => {
  it('catches a polygon with fewer than three vertices', () => {
    const r = QAService.auditProjectData({
      layers: [layerOf([polygon('Sliver', square.slice(0, 2))])]
    });
    expect(r.issues.some(i => i.type === 'Degenerate Polygon')).toBe(true);
    expect(r.status).toBe('CRITICAL_ERRORS');
  });

  it('catches a bow-tie polygon', () => {
    // Corners in the wrong order cross the boundary over itself, which makes
    // any area computed from it wrong.
    const bowtie = [
      { a: 0, b: 0 },
      { a: 100, b: 100 },
      { a: 100, b: 0 },
      { a: 0, b: 100 }
    ];
    const r = QAService.auditProjectData({ layers: [layerOf([polygon('Bowtie', bowtie)])] });
    expect(r.issues.some(i => i.type === 'Self-Intersecting Polygon')).toBe(true);
    expect(r.warningCount).toBeGreaterThan(0);
  });

  it('does not call a well-formed square self-intersecting', () => {
    const r = QAService.auditProjectData({ layers: [layerOf([polygon('Good', square)])] });
    expect(r.issues.some(i => i.type === 'Self-Intersecting Polygon')).toBe(false);
  });

  it('catches a polyline with a single point', () => {
    const r = QAService.auditProjectData({
      layers: [layerOf([{ name: 'Stub', geom: 'line', kind: 'en', pts: [{ a: 1, b: 2 }] }])]
    });
    expect(r.issues.some(i => i.type === 'Degenerate Polyline')).toBe(true);
  });
});

describe('QAService — cadastral and borehole checks fire', () => {
  // CadastralParcel names these fields `khasra` and `pts`.
  const parcelPts = square.map(p => ({ E: p.a, N: p.b }));

  it('catches two parcels sharing a khasra number', () => {
    const r = QAService.auditProjectData({
      parcels: [
        { khasra: '112/2', pts: parcelPts },
        { khasra: '112/2', pts: parcelPts }
      ] as any
    });
    expect(r.issues.some(i => i.type === 'Duplicate Khasra Number')).toBe(true);
  });

  it('does not call two differently numbered parcels duplicates', () => {
    const r = QAService.auditProjectData({
      parcels: [
        { khasra: '112/1', pts: parcelPts },
        { khasra: '112/2', pts: parcelPts }
      ] as any
    });
    expect(r.issues.some(i => i.type === 'Duplicate Khasra Number')).toBe(false);
  });

  it('catches a parcel boundary that cannot enclose an area', () => {
    const r = QAService.auditProjectData({
      parcels: [{ khasra: '9', pts: [{ E: 1, N: 2 }] }] as any
    });
    expect(r.issues.some(i => i.type === 'Invalid Parcel Boundary')).toBe(true);
  });

  it('catches two boreholes sharing an id', () => {
    const r = QAService.auditProjectData({
      boreholes: [
        { id: 'BH-1', intervals: [] },
        { id: 'BH-1', intervals: [] }
      ] as any
    });
    expect(r.issues.some(i => i.type === 'Duplicate Borehole ID')).toBe(true);
  });

  it('catches an inverted depth interval', () => {
    // "from 12 m to 8 m" is not a depth interval, and any thickness or grade
    // computed across it is meaningless.
    const r = QAService.auditProjectData({
      boreholes: [{ id: 'BH-1', intervals: [{ from: 12, to: 8 }] }] as any
    });
    expect(r.issues.some(i => i.type === 'Negative or Inverted Depth Interval')).toBe(true);
  });
});

describe('QAService — scoring', () => {
  it('deducts more for an error than for a warning', () => {
    const err = QAService.auditProjectData({ waypoints: [goodWaypoint('P1', 0, 0)] });
    const warn = QAService.auditProjectData({
      layers: [
        layerOf([
          polygon('Bowtie', [
            { a: 0, b: 0 },
            { a: 100, b: 100 },
            { a: 100, b: 0 },
            { a: 0, b: 100 }
          ])
        ])
      ]
    });
    expect(err.overallScore).toBeLessThan(warn.overallScore);
    expect(warn.overallScore).toBeLessThan(100);
  });

  it('never reports a negative score however bad the data', () => {
    const waypoints = Array.from({ length: 40 }, (_, i) => goodWaypoint(`P${i}`, 0, 0));
    const r = QAService.auditProjectData({ waypoints });
    expect(r.overallScore).toBe(0);
    expect(r.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('reports CRITICAL_ERRORS when any error is present, even beside warnings', () => {
    const r = QAService.auditProjectData({
      waypoints: [goodWaypoint('P1', 0, 0)],
      layers: [
        layerOf([
          polygon('Bowtie', [
            { a: 0, b: 0 },
            { a: 100, b: 100 },
            { a: 100, b: 0 },
            { a: 0, b: 100 }
          ])
        ])
      ]
    });
    expect(r.errorCount).toBeGreaterThan(0);
    expect(r.warningCount).toBeGreaterThan(0);
    expect(r.status).toBe('CRITICAL_ERRORS');
  });

  it('gives every issue a recommendation, not just a complaint', () => {
    const r = QAService.auditProjectData({
      waypoints: [goodWaypoint('P1', 0, 0)],
      layers: [layerOf([polygon('Sliver', square.slice(0, 2))])]
    });
    expect(r.issues.length).toBeGreaterThan(0);
    for (const i of r.issues) {
      expect(i.recommendation.length).toBeGreaterThan(10);
      expect(i.detail.length).toBeGreaterThan(10);
    }
  });
});
