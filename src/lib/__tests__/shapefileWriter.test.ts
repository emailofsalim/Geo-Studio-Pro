import { describe, it, expect } from 'vitest';
import { buildShapefileZip, parseShapefile, parseDBF } from '../formats';
import { parsePrj } from '../crsIdentity';
import { readZip } from '../zip';
import { GeoFeature } from '../../types';

const E0 = 254800, N0 = 2605200;
const P = (a: number, b: number) => ({ a, b });

const polyA: GeoFeature = {
  name: 'Khasra 101', geom: 'polygon', kind: 'en',
  pts: [P(E0, N0), P(E0 + 100, N0), P(E0 + 100, N0 + 100), P(E0, N0 + 100), P(E0, N0)],
  props: { KHASRA: '101' }
};
const polyB: GeoFeature = {
  name: 'Khasra 102', geom: 'polygon', kind: 'en',
  pts: [P(E0 + 200, N0), P(E0 + 300, N0), P(E0 + 300, N0 + 100), P(E0 + 200, N0)]
};
const bore: GeoFeature = { name: 'BH-1', geom: 'point', kind: 'en', pts: [P(E0 + 50, N0 + 50)] };
const road: GeoFeature = { name: 'Haul road', geom: 'line', kind: 'en', pts: [P(E0, N0), P(E0 + 100, N0 + 100), P(E0 + 180, N0 + 60)] };

const unzip = (z: Uint8Array) =>
  readZip(z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer);

/** Read every shapefile out of a written bundle, keyed by member base name. */
async function readBundle(z: Uint8Array) {
  const files = await unzip(z);
  const out: Record<string, GeoFeature[]> = {};
  for (const k of Object.keys(files)) {
    if (!k.toLowerCase().endsWith('.shp')) continue;
    const base = k.slice(0, -4);
    const dbf = files[Object.keys(files).find(x => x.toLowerCase() === `${base.toLowerCase()}.dbf`) || ''];
    const prjKey = Object.keys(files).find(x => x.toLowerCase() === `${base.toLowerCase()}.prj`);
    const prj = prjKey ? new TextDecoder().decode(files[prjKey]) : undefined;
    out[base] = parseShapefile(files[k], dbf, prj);
  }
  return { files, layers: out };
}

describe('writing a shapefile', () => {
  it('round-trips a parcel through its own reader', async () => {
    // The test that matters for a writer. Nothing had exercised the pair, and
    // the reader was separately found to be unable to read a polygon at all --
    // so the application could write files it could not open.
    const { layers } = await readBundle(buildShapefileZip([polyA], 'parcels', 44, false));
    const feats = layers['parcels'];
    expect(feats).toHaveLength(1);
    expect(feats[0].geom).toBe('polygon');
    expect(feats[0].pts).toHaveLength(polyA.pts.length);
    feats[0].pts.forEach((p, i) => {
      expect(p.a, `vertex ${i} easting`).toBeCloseTo(polyA.pts[i].a, 9);
      expect(p.b, `vertex ${i} northing`).toBeCloseTo(polyA.pts[i].b, 9);
    });
  });

  it('writes the four members a shapefile needs', async () => {
    const { files } = await readBundle(buildShapefileZip([polyA], 'parcels', 44, false));
    const names = Object.keys(files).map(n => n.toLowerCase()).sort();
    expect(names).toEqual(['parcels.dbf', 'parcels.prj', 'parcels.shp', 'parcels.shx']);
  });

  it('writes a .prj that names the zone it was given', async () => {
    for (const [zone, south] of [[44, false], [43, false], [50, true]] as [number, boolean][]) {
      const { files } = await readBundle(buildShapefileZip([polyA], 'parcels', zone, south));
      const prj = parsePrj(new TextDecoder().decode(files['parcels.prj']));
      expect(prj.kind, `zone ${zone}`).toBe('projected');
      expect(prj.utmZone, `zone ${zone}`).toBe(zone);
      expect(prj.south, `zone ${zone}`).toBe(south);
    }
  });

  it('projects lat/lon input into the zone it states', async () => {
    const ll: GeoFeature = {
      name: 'Plot', geom: 'polygon', kind: 'll',
      pts: [P(85.0, 23.5), P(85.001, 23.5), P(85.001, 23.501), P(85.0, 23.5)]
    };
    const { layers } = await readBundle(buildShapefileZip([ll], 'plot', 45, false));
    const f = layers['plot'][0];
    expect(f.kind, 'written as eastings and northings').toBe('en');
    // Zone 45 covers 84-90 E, so a point at 85 E sits west of the 500 000 m
    // false easting on the central meridian at 87 E.
    expect(f.pts[0].a).toBeGreaterThan(200000);
    expect(f.pts[0].a).toBeLessThan(500000);
  });

  it('carries attributes through the .dbf', async () => {
    const { files } = await readBundle(buildShapefileZip([polyA], 'parcels', 44, false));
    const recs = parseDBF(files['parcels.dbf']);
    expect(recs).toHaveLength(1);
    expect(recs[0].KHASRA).toBe('101');
    expect(recs[0].NAME).toBe('Khasra 101');
  });

  it('keeps every geometry type in a mixed layer', async () => {
    // The defect this pins. One shapefile holds one geometry type, and the
    // writer used to force every feature into whichever type was in the
    // majority. A layer of one parcel and two boreholes came back as three
    // points: the parcel's boundary reduced to its first vertex, the other
    // three discarded, with nothing said.
    const { layers } = await readBundle(
      buildShapefileZip([polyA, bore, { ...bore, name: 'BH-2' }], 'site', 44, false)
    );
    const all = Object.values(layers).flat();
    expect(all).toHaveLength(3);
    const polys = all.filter(f => f.geom === 'polygon');
    const points = all.filter(f => f.geom === 'point');
    expect(polys, 'the parcel survives as a polygon').toHaveLength(1);
    expect(points, 'both boreholes survive as points').toHaveLength(2);
    expect(polys[0].pts, 'with all of its vertices').toHaveLength(polyA.pts.length);
  });

  it('does not turn a borehole into a one-vertex ring', async () => {
    const { layers } = await readBundle(buildShapefileZip([polyA, polyB, bore], 'site', 44, false));
    const all = Object.values(layers).flat();
    expect(all.filter(f => f.geom === 'polygon')).toHaveLength(2);
    const pts = all.filter(f => f.geom === 'point');
    expect(pts).toHaveLength(1);
    expect(pts[0].pts).toHaveLength(1);
  });

  it('keeps a line as a line beside polygons', async () => {
    const { layers } = await readBundle(buildShapefileZip([polyA, polyB, road], 'site', 44, false));
    const all = Object.values(layers).flat();
    const lines = all.filter(f => f.geom === 'line');
    expect(lines).toHaveLength(1);
    expect(lines[0].pts, 'all three vertices of the road').toHaveLength(3);
  });

  it('names the members by type only when there is more than one', async () => {
    const single = await readBundle(buildShapefileZip([polyA, polyB], 'parcels', 44, false));
    expect(Object.keys(single.layers), 'one type keeps the plain layer name').toEqual(['parcels']);

    const mixed = await readBundle(buildShapefileZip([polyA, bore, road], 'site', 44, false));
    expect(Object.keys(mixed.layers).sort())
      .toEqual(['site_lines', 'site_points', 'site_polygons']);
  });

  it('gives every member of a mixed bundle its own .prj and .dbf', async () => {
    const { files } = await readBundle(buildShapefileZip([polyA, bore], 'site', 44, false));
    const names = Object.keys(files).map(n => n.toLowerCase());
    for (const base of ['site_polygons', 'site_points']) {
      for (const ext of ['shp', 'shx', 'dbf', 'prj']) {
        expect(names, `${base}.${ext}`).toContain(`${base}.${ext}`);
      }
    }
  });

  it('does not drop a feature whose geometry it does not recognise', async () => {
    // Importers hand back whatever the file said, so a feature can arrive with
    // a geometry outside the three this writer groups by. Losing it silently is
    // the failure the grouping exists to stop, so it goes with the points
    // rather than nowhere. Added after a mutation check showed the grouping
    // could be changed to drop such a feature with every other test still
    // passing.
    const odd = { ...bore, name: 'Odd', geom: 'multipoint' as any };
    const { layers } = await readBundle(buildShapefileZip([polyA, odd], 'site', 44, false));
    const all = Object.values(layers).flat();
    expect(all, 'both features survive').toHaveLength(2);
    expect(all.some(f => f.props?.NAME === 'Odd' || f.name === 'Odd')).toBe(true);
  });

  it('writes an empty layer without throwing', async () => {
    expect(() => buildShapefileZip([], 'empty', 44, false)).not.toThrow();
  });
});
