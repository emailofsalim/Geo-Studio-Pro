// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { detectAndParseGeospatialFile } from '../universalDataBridge';
import { makeZip } from '../zip';

type Ring = [number, number][];

/** Spec-correct ESRI polygon .shp bytes (see shapefileReader.test.ts). */
function buildShp(shapes: Ring[]): Uint8Array {
  const recs: ArrayBuffer[] = [];
  shapes.forEach((pts, idx) => {
    const n = pts.length;
    const content = new ArrayBuffer(4 + 32 + 4 + 4 + 4 + n * 16);
    const dv = new DataView(content);
    let o = 0;
    dv.setInt32(o, 5, true); o += 4;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    dv.setFloat64(o, Math.min(...xs), true); o += 8;
    dv.setFloat64(o, Math.min(...ys), true); o += 8;
    dv.setFloat64(o, Math.max(...xs), true); o += 8;
    dv.setFloat64(o, Math.max(...ys), true); o += 8;
    dv.setInt32(o, 1, true); o += 4;
    dv.setInt32(o, n, true); o += 4;
    dv.setInt32(o, 0, true); o += 4;
    for (const [x, y] of pts) { dv.setFloat64(o, x, true); o += 8; dv.setFloat64(o, y, true); o += 8; }
    const rec = new ArrayBuffer(8 + content.byteLength);
    const rdv = new DataView(rec);
    rdv.setInt32(0, idx + 1, false);
    rdv.setInt32(4, content.byteLength / 2, false);
    new Uint8Array(rec, 8).set(new Uint8Array(content));
    recs.push(rec);
  });
  const total = 100 + recs.reduce((s, r) => s + r.byteLength, 0);
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setInt32(0, 9994, false);
  dv.setInt32(24, total / 2, false);
  dv.setInt32(28, 1000, true);
  dv.setInt32(32, 5, true);
  let off = 100;
  for (const r of recs) { new Uint8Array(buf, off).set(new Uint8Array(r)); off += r.byteLength; }
  return new Uint8Array(buf);
}


/** A minimal dBase III .dbf carrying one character field per record. */
function buildDbf(field: string, values: string[]): Uint8Array {
  const fieldLen = Math.max(1, ...values.map(v => v.length));
  const headerLen = 32 + 32 + 1;
  const recordLen = 1 + fieldLen;
  const total = headerLen + values.length * recordLen + 1;
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x03;
  dv.setUint32(4, values.length, true);
  dv.setUint16(8, headerLen, true);
  dv.setUint16(10, recordLen, true);
  // one field descriptor at offset 32
  const nameBytes = new TextEncoder().encode(field.slice(0, 10));
  buf.set(nameBytes, 32);
  buf[32 + 11] = 'C'.charCodeAt(0);
  buf[32 + 16] = fieldLen;
  buf[32 + 17] = 0;
  buf[64] = 0x0d; // header terminator
  let o = headerLen;
  for (const v of values) {
    buf[o] = 0x20; // not deleted
    const vb = new TextEncoder().encode(v.padEnd(fieldLen, ' '));
    buf.set(vb.slice(0, fieldLen), o + 1);
    o += recordLen;
  }
  buf[total - 1] = 0x1a;
  return buf;
}

const PRJ_UTM_44N =
  'PROJCS["WGS_1984_UTM_Zone_44N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],' +
  'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],' +
  'PARAMETER["Central_Meridian",81.0],PARAMETER["Scale_Factor",0.9996],' +
  'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

const parcel: Ring = [
  [254800, 2605200], [254900, 2605200], [254900, 2605300], [254800, 2605300], [254800, 2605200]
];

const zipFile = (entries: { name: string; data: Uint8Array }[]) => {
  const bytes = makeZip(entries);
  return new File([bytes as any], 'parcels.zip', { type: 'application/zip' });
};
const enc = new TextEncoder();

describe('importing a shapefile ZIP through the bridge', () => {
  it('reads the .shp out of the archive', async () => {
    // The archive's own bytes were being passed as if they were a .shp, which
    // parses to nothing, so a zipped shapefile -- the normal way one is
    // shipped -- never got this far.
    const res = await detectAndParseGeospatialFile(
      zipFile([{ name: 'parcels.shp', data: buildShp([parcel]) },
               { name: 'parcels.prj', data: enc.encode(PRJ_UTM_44N) }]),
      '44N'
    );
    expect(res.features.length, 'the parcel is read').toBe(1);
    expect(res.features[0].pts).toHaveLength(5);
  });

  it('reports the coordinate system the .prj declares', async () => {
    const res = await detectAndParseGeospatialFile(
      zipFile([{ name: 'parcels.shp', data: buildShp([parcel]) },
               { name: 'parcels.prj', data: enc.encode(PRJ_UTM_44N) }]),
      '44N'
    );
    expect(res.crsStatus).toBe('EXPLICIT');
    expect(res.detectedCRS).toMatch(/44N/);
    expect(res.detectedUnits).toBe('m');
    expect(res.features[0].kind).toBe('en');
  });

  it('does not claim EPSG:4326 for a file it has not read a .prj for', async () => {
    // Every shapefile used to be reported as "WGS 84 (EPSG:4326)" with status
    // EXPLICIT, whatever it actually was and with no .prj read at all.
    const res = await detectAndParseGeospatialFile(
      zipFile([{ name: 'parcels.shp', data: buildShp([parcel]) }]),
      '44N'
    );
    expect(res.crsStatus, 'no .prj means inferred, not explicit').toBe('INFERRED');
    expect(res.detectedCRS).not.toMatch(/4326/);
    expect(res.detectedCRS).toMatch(/inferred/i);
  });

  it('warns that the coordinate system was inferred when there is no .prj', async () => {
    const res = await detectAndParseGeospatialFile(
      zipFile([{ name: 'parcels.shp', data: buildShp([parcel]) }]),
      '44N'
    );
    const ws = res.warnings ?? [];
    expect(ws.some(w => /no \.prj/i.test(w)), ws.join(' | ')).toBe(true);
  });

  it('carries the attributes from the .dbf alongside the geometry', async () => {
    // The .dbf was never located either, so a parcel arrived with no attributes
    // even when the archive carried them -- a cadastral layer with no khasra
    // numbers on it.
    const res = await detectAndParseGeospatialFile(
      zipFile([{ name: 'parcels.shp', data: buildShp([parcel]) },
               { name: 'parcels.dbf', data: buildDbf('KHASRA', ['101']) },
               { name: 'parcels.prj', data: enc.encode(PRJ_UTM_44N) }]),
      '44N'
    );
    expect(res.features).toHaveLength(1);
    expect(res.features[0].props?.KHASRA, JSON.stringify(res.features[0].props)).toBe('101');
  });

  it('finds the companions whatever case or folder they are in', async () => {
    const res = await detectAndParseGeospatialFile(
      zipFile([{ name: 'GIS/Parcels.SHP', data: buildShp([parcel]) },
               { name: 'GIS/Parcels.PRJ', data: enc.encode(PRJ_UTM_44N) }]),
      '44N'
    );
    expect(res.features).toHaveLength(1);
    expect(res.crsStatus).toBe('EXPLICIT');
  });
});
