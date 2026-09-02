import { describe, it, expect } from 'vitest';
import { auditLayerTopology } from '../spatialAnalysis';
import { geoJsonParse } from '../formats';
import { GeoFeature, GisLayer } from '../../types';

const E0 = 254800, N0 = 2605200;

const feature = (name: string, geom: GeoFeature['geom'], pts: [number, number][], kind: GeoFeature['kind'] = 'en'): GeoFeature =>
  ({ name, geom, kind, pts: pts.map(([a, b]) => ({ a, b })) });

const layerOf = (...features: GeoFeature[]): GisLayer => ({
  id: 'L1', name: 'Test', visible: true, color: '#000', fillColor: '#000',
  fillOpacity: 0.5, strokeWidth: 1, geomType: 'polygon', features
});

const types = (issues: { type: string }[]) => issues.map(i => i.type).sort();

describe('layer topology audit', () => {
  it('passes a clean parcel without inventing a problem', () => {
    // A tidy 100 m square: nothing to report. An audit that cries wolf on good
    // geometry is worse than none.
    const sq = feature('Plot 1', 'polygon', [
      [E0, N0], [E0 + 100, N0], [E0 + 100, N0 + 100], [E0, N0 + 100]
    ]);
    expect(auditLayerTopology(layerOf(sq), 44, false)).toEqual([]);
  });

  it('catches a bow-tie boundary', () => {
    // The two diagonals cross: a parcel that encloses two lobes of opposite
    // sign, whose area is the difference rather than the sum.
    const bow = feature('Bow tie', 'polygon', [
      [E0, N0], [E0 + 100, N0 + 100], [E0 + 100, N0], [E0, N0 + 100]
    ]);
    const issues = auditLayerTopology(layerOf(bow), 44, false);
    expect(issues.some(i => i.type === 'self_intersection')).toBe(true);
    expect(issues.find(i => i.type === 'self_intersection')!.severity).toBe('error');
  });

  it('catches a repeated vertex', () => {
    const dup = feature('Doubled', 'polygon', [
      [E0, N0], [E0 + 100, N0], [E0 + 100, N0 + 0.001], [E0 + 100, N0 + 100], [E0, N0 + 100]
    ]);
    const issues = auditLayerTopology(layerOf(dup), 44, false);
    expect(issues.some(i => i.type === 'duplicate_vertex')).toBe(true);
  });

  it('catches a degenerate ring and an empty feature', () => {
    const twoPt = feature('Two points', 'polygon', [[E0, N0], [E0 + 10, N0]]);
    const empty = feature('Nothing', 'polygon', []);
    expect(types(auditLayerTopology(layerOf(twoPt), 44, false))).toContain('non_closed');
    expect(types(auditLayerTopology(layerOf(empty), 44, false))).toContain('non_closed');
  });

  it('catches a sliver too small to be a parcel', () => {
    // 10 m long, 20 mm wide: 0.2 m2. Usually a digitising artefact rather than
    // a plot anyone owns.
    const sliver = feature('Sliver', 'polygon', [
      [E0, N0], [E0 + 10, N0], [E0 + 10, N0 + 0.02], [E0, N0 + 0.02]
    ]);
    const issues = auditLayerTopology(layerOf(sliver), 44, false);
    expect(issues.some(i => i.type === 'sliver_polygon')).toBe(true);
  });

  it('catches a parcel too small to be a parcel, even when it is not elongated', () => {
    // A compact 0.5 m square: 0.25 m2. The elongation rule cannot see this one
    // -- its isoperimetric ratio is about 1.3, nowhere near the threshold -- so
    // this exercises the area rule specifically. Added after a mutation check
    // showed the first sliver test was being satisfied by the other rule.
    const tiny = feature('Speck', 'polygon', [
      [E0, N0], [E0 + 0.5, N0], [E0 + 0.5, N0 + 0.5], [E0, N0 + 0.5]
    ]);
    const issues = auditLayerTopology(layerOf(tiny), 44, false);
    expect(issues.some(i => i.type === 'sliver_polygon' && i.severity === 'warning')).toBe(true);
  });

  it('reports each feature under its own name', () => {
    const good = feature('Plot A', 'polygon', [
      [E0, N0], [E0 + 100, N0], [E0 + 100, N0 + 100], [E0, N0 + 100]
    ]);
    const bad = feature('Plot B', 'polygon', [
      [E0, N0], [E0 + 100, N0 + 100], [E0 + 100, N0], [E0, N0 + 100]
    ]);
    const issues = auditLayerTopology(layerOf(good, bad), 44, false);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(i => i.featureName === 'Plot B')).toBe(true);
  });

  it('does not audit a line as if it were a ring', () => {
    // An open traverse is not a polygon; crossing itself is not a defect.
    const line = feature('Traverse', 'line', [
      [E0, N0], [E0 + 100, N0 + 100], [E0 + 100, N0], [E0, N0 + 100]
    ]);
    const issues = auditLayerTopology(layerOf(line), 44, false);
    expect(issues.some(i => i.type === 'self_intersection')).toBe(false);
  });

  it('projects lat/lon features in the zone it is given', () => {
    // The signature defaults to zone 45. A layer in another zone must be
    // audited in that zone; the reported location is the proof that the
    // argument reaches the projection rather than being ignored.
    const bowLL = feature('LL bow tie', 'polygon', [
      [72.5, 23.0], [72.501, 23.001], [72.501, 23.0], [72.5, 23.001]
    ], 'll');
    const z43 = auditLayerTopology(layerOf(bowLL), 43, false);
    const z45 = auditLayerTopology(layerOf(bowLL), 45, false);
    expect(z43.some(i => i.type === 'self_intersection')).toBe(true);
    expect(z45.some(i => i.type === 'self_intersection')).toBe(true);
    const e43 = z43.find(i => i.type === 'self_intersection')!.location!.E;
    const e45 = z45.find(i => i.type === 'self_intersection')!.location!.E;
    expect(e43, 'the zone argument must actually reach the projection')
      .not.toBeCloseTo(e45, 0);
  });

  it('accepts a ring that repeats its closing vertex', () => {
    // The defect this pins. A closed ring is the normal representation --
    // GeoJSON requires it, KML and Shapefile produce it -- and the repeat made
    // the last edge end exactly where the first begins. The segment test read
    // that shared endpoint as a crossing, so EVERY properly closed parcel came
    // back as a self-intersection error: a square, a pentagon, anything.
    const closed = feature('Closed ring', 'polygon', [
      [E0, N0], [E0 + 100, N0], [E0 + 100, N0 + 100], [E0, N0 + 100], [E0, N0]
    ]);
    expect(auditLayerTopology(layerOf(closed), 44, false)).toEqual([]);

    const pent = feature('Closed pentagon', 'polygon', [
      [E0, N0], [E0 + 100, N0], [E0 + 120, N0 + 80],
      [E0 + 50, N0 + 140], [E0 - 20, N0 + 80], [E0, N0]
    ]);
    expect(auditLayerTopology(layerOf(pent), 44, false)).toEqual([]);
  });

  it('passes a parcel imported from spec-compliant GeoJSON', () => {
    // End to end, because that is how the false positive actually reached a
    // user: GeoJSON requires the first and last positions to be identical, the
    // reader keeps them, and the audit called the result broken.
    const feats = geoJsonParse(JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'Khasra 101' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [85.0, 23.5], [85.001, 23.5], [85.001, 23.501], [85.0, 23.501], [85.0, 23.5]
          ]]
        }
      }]
    }));
    expect(feats).toHaveLength(1);
    expect(feats[0].pts, 'the reader keeps the closing position').toHaveLength(5);
    expect(auditLayerTopology(layerOf(...feats), 45, false)).toEqual([]);
  });

  it('still catches a bow-tie that happens to be closed', () => {
    // Dropping the closing vertex must not blind the audit to a real crossing.
    const bow = feature('Closed bow tie', 'polygon', [
      [E0, N0], [E0 + 100, N0 + 100], [E0 + 100, N0], [E0, N0 + 100], [E0, N0]
    ]);
    expect(auditLayerTopology(layerOf(bow), 44, false).some(i => i.type === 'self_intersection'))
      .toBe(true);
  });
});
