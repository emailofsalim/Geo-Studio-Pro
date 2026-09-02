import { describe, it, expect } from 'vitest';
import { parseShapefile } from '../formats';

type Ring = [number, number][];

/**
 * A minimal but spec-correct ESRI .shp writer, so the reader is tested against
 * the format rather than against itself. Layout per the ESRI Shapefile
 * Technical Description: a 100-byte header, then records of an 8-byte header
 * (record number and content length in 16-bit words, both big-endian) followed
 * by the content.
 */
function buildShp(shapes: Ring[], shapeType: 3 | 5): Uint8Array {
  const recs: ArrayBuffer[] = [];
  shapes.forEach((parts, idx) => {
    const pts = parts;
    const n = pts.length;
    const content = new ArrayBuffer(4 + 32 + 4 + 4 + 4 + n * 16);
    const dv = new DataView(content);
    let o = 0;
    dv.setInt32(o, shapeType, true); o += 4;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    dv.setFloat64(o, Math.min(...xs), true); o += 8;
    dv.setFloat64(o, Math.min(...ys), true); o += 8;
    dv.setFloat64(o, Math.max(...xs), true); o += 8;
    dv.setFloat64(o, Math.max(...ys), true); o += 8;
    dv.setInt32(o, 1, true); o += 4;      // numParts
    dv.setInt32(o, n, true); o += 4;      // numPoints
    dv.setInt32(o, 0, true); o += 4;      // part 0 begins at point 0
    for (const [x, y] of pts) {
      dv.setFloat64(o, x, true); o += 8;
      dv.setFloat64(o, y, true); o += 8;
    }
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
  dv.setInt32(32, shapeType, true);
  let off = 100;
  for (const r of recs) { new Uint8Array(buf, off).set(new Uint8Array(r)); off += r.byteLength; }
  return new Uint8Array(buf);
}

/** A single-point .shp, whose record layout differs from polygons. */
function buildPointShp(pts: [number, number][]): Uint8Array {
  const recs: ArrayBuffer[] = [];
  pts.forEach(([x, y], idx) => {
    const content = new ArrayBuffer(20);
    const dv = new DataView(content);
    dv.setInt32(0, 1, true);
    dv.setFloat64(4, x, true);
    dv.setFloat64(12, y, true);
    const rec = new ArrayBuffer(28);
    const rdv = new DataView(rec);
    rdv.setInt32(0, idx + 1, false);
    rdv.setInt32(4, 10, false);
    new Uint8Array(rec, 8).set(new Uint8Array(content));
    recs.push(rec);
  });
  const total = 100 + recs.length * 28;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setInt32(0, 9994, false);
  dv.setInt32(24, total / 2, false);
  dv.setInt32(28, 1000, true);
  dv.setInt32(32, 1, true);
  let off = 100;
  for (const r of recs) { new Uint8Array(buf, off).set(new Uint8Array(r)); off += r.byteLength; }
  return new Uint8Array(buf);
}

const E0 = 254800, N0 = 2605200;
const square: Ring = [[E0, N0], [E0 + 100, N0], [E0 + 100, N0 + 100], [E0, N0 + 100], [E0, N0]];

describe('shapefile reader', () => {
  it('reads a polygon shapefile at all', () => {
    // The defect this pins. Record content begins at offset+8, so numParts sits
    // at offset+44; the reader took it from offset+40, four bytes short, which
    // is the last word of the bounding box's Ymax double. For this parcel that
    // read 1094967418 parts, the loop ran off the buffer, and the throw was
    // swallowed by the caller's catch -- so a polygon shapefile imported as
    // "unrecognised". The format table claims "SHP + DBF, multi-part geometry".
    const feats = parseShapefile(buildShp([square], 5));
    expect(feats).toHaveLength(1);
    expect(feats[0].geom).toBe('polygon');
  });

  it('puts every vertex where the file put it', () => {
    const feats = parseShapefile(buildShp([square], 5));
    expect(feats[0].pts).toHaveLength(square.length);
    feats[0].pts.forEach((p, i) => {
      expect(p.a, `vertex ${i} easting`).toBeCloseTo(square[i][0], 9);
      expect(p.b, `vertex ${i} northing`).toBeCloseTo(square[i][1], 9);
    });
  });

  it('reads a polyline shapefile too', () => {
    const line: Ring = [[E0, N0], [E0 + 50, N0 + 30], [E0 + 90, N0 + 10]];
    const feats = parseShapefile(buildShp([line], 3));
    expect(feats).toHaveLength(1);
    expect(feats[0].geom).toBe('line');
    expect(feats[0].pts).toHaveLength(3);
    expect(feats[0].pts[1].a).toBeCloseTo(E0 + 50, 9);
  });

  it('reads several features from one file', () => {
    const other: Ring = [[E0 + 300, N0], [E0 + 400, N0], [E0 + 400, N0 + 100], [E0 + 300, N0]];
    const feats = parseShapefile(buildShp([square, other], 5));
    expect(feats).toHaveLength(2);
    expect(feats[1].pts[0].a).toBeCloseTo(E0 + 300, 9);
  });

  it('still reads a point shapefile, whose offsets were always right', () => {
    // The point branch was correct, and must stay correct: it is the evidence
    // that the fix corrected the polygon layout rather than shifting everything.
    const feats = parseShapefile(buildPointShp([[E0, N0], [E0 + 10, N0 + 20]]));
    expect(feats).toHaveLength(2);
    expect(feats[0].geom).toBe('point');
    expect(feats[0].pts[0].a).toBeCloseTo(E0, 9);
    expect(feats[1].pts[0].b).toBeCloseTo(N0 + 20, 9);
  });

  it('marks projected coordinates as eastings and northings', () => {
    const feats = parseShapefile(buildShp([square], 5));
    expect(feats[0].kind).toBe('en');
  });

  it('marks geographic coordinates as lat/lon', () => {
    const geo: Ring = [[85.0, 23.5], [85.001, 23.5], [85.001, 23.501], [85.0, 23.501], [85.0, 23.5]];
    const feats = parseShapefile(buildShp([geo], 5));
    expect(feats[0].kind).toBe('ll');
  });

  it('returns nothing for a buffer that is not a shapefile', () => {
    const junk = new Uint8Array(200);
    expect(() => parseShapefile(junk)).not.toThrow();
    expect(parseShapefile(junk)).toEqual([]);
  });
});
