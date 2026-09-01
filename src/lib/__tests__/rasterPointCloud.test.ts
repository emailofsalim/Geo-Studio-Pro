import { describe, it, expect } from 'vitest';
import { parseGeoTiffRaster, parseLasHeaderAndPoints } from '../formats';

// ---------------------------------------------------------------------------
// Fixture builders — real binary headers, not mocks, so these tests exercise
// the same byte-level paths a user's file would.
// ---------------------------------------------------------------------------

interface TiffTag {
  tag: number;
  type: number; // 3 = SHORT, 4 = LONG, 12 = DOUBLE
  values: number[];
}

/** Builds a little-endian TIFF with the given IFD tags. */
function buildTiff(tags: TiffTag[]): Uint8Array {
  const TYPE_SIZE: Record<number, number> = { 3: 2, 4: 4, 12: 8 };
  const sorted = [...tags].sort((a, b) => a.tag - b.tag);

  const ifdOffset = 8;
  const ifdSize = 2 + sorted.length * 12 + 4;
  let heapOffset = ifdOffset + ifdSize;

  const heap: { offset: number; tag: TiffTag }[] = [];
  for (const t of sorted) {
    const total = TYPE_SIZE[t.type] * t.values.length;
    if (total > 4) {
      heap.push({ offset: heapOffset, tag: t });
      heapOffset += total;
    }
  }

  const buf = new Uint8Array(heapOffset);
  const dv = new DataView(buf.buffer);

  buf[0] = 0x49; buf[1] = 0x49;          // 'II' little-endian
  dv.setUint16(2, 42, true);             // magic
  dv.setUint32(4, ifdOffset, true);      // first IFD
  dv.setUint16(ifdOffset, sorted.length, true);

  const writeValue = (off: number, type: number, v: number) => {
    if (type === 3) dv.setUint16(off, v, true);
    else if (type === 4) dv.setUint32(off, v, true);
    else if (type === 12) dv.setFloat64(off, v, true);
  };

  sorted.forEach((t, i) => {
    const e = ifdOffset + 2 + i * 12;
    dv.setUint16(e, t.tag, true);
    dv.setUint16(e + 2, t.type, true);
    dv.setUint32(e + 4, t.values.length, true);
    const total = TYPE_SIZE[t.type] * t.values.length;
    if (total <= 4) {
      t.values.forEach((v, k) => writeValue(e + 8 + k * TYPE_SIZE[t.type], t.type, v));
    } else {
      const entry = heap.find(h => h.tag === t)!;
      dv.setUint32(e + 8, entry.offset, true);
      t.values.forEach((v, k) => writeValue(entry.offset + k * TYPE_SIZE[t.type], t.type, v));
    }
  });

  return buf;
}

interface LasOpts {
  pointCount?: number;
  pointFormat?: number;
  points?: { x: number; y: number; z: number }[];
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

/** Builds a minimal but structurally real LAS 1.2 file. */
function buildLas(opts: LasOpts = {}): Uint8Array {
  const {
    pointFormat = 0,
    points = [],
    scale = 0.01,
    offsetX = 0,
    offsetY = 0
  } = opts;
  const pointCount = opts.pointCount ?? points.length;

  const HEADER = 227;
  const RECLEN = 20;
  const buf = new Uint8Array(HEADER + points.length * RECLEN);
  const dv = new DataView(buf.buffer);

  buf[0] = 0x4c; buf[1] = 0x41; buf[2] = 0x53; buf[3] = 0x46; // 'LASF'
  buf[24] = 1; buf[25] = 2;                                   // version 1.2
  dv.setUint32(96, HEADER, true);                             // offset to point data
  buf[104] = pointFormat;                                     // point data format
  dv.setUint16(105, RECLEN, true);                            // record length
  dv.setUint32(107, pointCount, true);                        // legacy point count

  dv.setFloat64(131, scale, true);  // scale X
  dv.setFloat64(139, scale, true);  // scale Y
  dv.setFloat64(147, scale, true);  // scale Z
  dv.setFloat64(155, offsetX, true);
  dv.setFloat64(163, offsetY, true);
  dv.setFloat64(171, 0, true);

  points.forEach((p, i) => {
    const o = HEADER + i * RECLEN;
    dv.setInt32(o, Math.round((p.x - offsetX) / scale), true);
    dv.setInt32(o + 4, Math.round((p.y - offsetY) / scale), true);
    dv.setInt32(o + 8, Math.round(p.z / scale), true);
  });

  return buf;
}

// ---------------------------------------------------------------------------

describe('GeoTIFF reader', () => {
  const TAG_WIDTH = 256, TAG_HEIGHT = 257, TAG_PIXEL_SCALE = 33550, TAG_TIEPOINT = 33922, TAG_GEOKEYS = 34735;

  it('reads real dimensions and georeferencing rather than fabricating them', () => {
    // The stub this replaces always returned 1024x1024 with a 1000x1000 square
    // at the origin, whatever the file actually contained.
    const tiff = buildTiff([
      { tag: TAG_WIDTH, type: 4, values: [300] },
      { tag: TAG_HEIGHT, type: 4, values: [200] },
      { tag: TAG_PIXEL_SCALE, type: 12, values: [2, 4, 0] },
      { tag: TAG_TIEPOINT, type: 12, values: [0, 0, 0, 500000, 2600000, 0] }
    ]);

    const r = parseGeoTiffRaster(tiff);

    expect(r.isGeoTiff).toBe(true);
    expect(r.isGeoReferenced).toBe(true);
    expect(r.width).toBe(300);
    expect(r.height).toBe(200);
    expect(r.width).not.toBe(1024); // the fabricated value
    expect(r.pixelScale).toEqual([2, 4, 0]);

    // Footprint: 300 px * 2 units wide, 200 px * 4 units tall, northing decreasing.
    expect(r.bounds).toEqual({ minX: 500000, minY: 2599200, maxX: 500600, maxY: 2600000 });
  });

  it('reports a plain TIFF as not georeferenced instead of placing it at the origin', () => {
    const tiff = buildTiff([
      { tag: TAG_WIDTH, type: 4, values: [64] },
      { tag: TAG_HEIGHT, type: 4, values: [64] }
    ]);

    const r = parseGeoTiffRaster(tiff);

    expect(r.isGeoTiff).toBe(true);
    expect(r.isGeoReferenced).toBe(false);
    expect(r.features).toHaveLength(0); // no invented geometry
    expect(r.bounds).toBeUndefined();
    expect(r.width).toBe(64);
  });

  it('reads the EPSG code from the GeoKeyDirectory', () => {
    // GeoKeyDirectory: header (1,1,0,keyCount) then key entries of 4 shorts.
    // Key 3072 = ProjectedCSTypeGeoKey, location 0 = value held inline.
    const tiff = buildTiff([
      { tag: TAG_WIDTH, type: 4, values: [10] },
      { tag: TAG_HEIGHT, type: 4, values: [10] },
      { tag: TAG_PIXEL_SCALE, type: 12, values: [1, 1, 0] },
      { tag: TAG_TIEPOINT, type: 12, values: [0, 0, 0, 0, 0, 0] },
      { tag: TAG_GEOKEYS, type: 3, values: [1, 1, 0, 1, 3072, 0, 1, 32645] }
    ]);

    expect(parseGeoTiffRaster(tiff).epsg).toBe(32645);
  });

  it('rejects a file that is not a TIFF', () => {
    expect(() => parseGeoTiffRaster(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/not a valid tiff/i);
  });

  it('rejects a TIFF with no dimensions rather than assuming a size', () => {
    const tiff = buildTiff([{ tag: TAG_PIXEL_SCALE, type: 12, values: [1, 1, 0] }]);
    expect(() => parseGeoTiffRaster(tiff)).toThrow(/dimensions/i);
  });
});

describe('LAS / LAZ point cloud reader', () => {
  it('reads points using the header scale and offset', () => {
    const las = buildLas({
      points: [
        { x: 500100, y: 2600200, z: 345.5 },
        { x: 500110, y: 2600220, z: 347.25 }
      ],
      offsetX: 500000,
      offsetY: 2600000
    });

    const r = parseLasHeaderAndPoints(las);

    expect(r.header.version).toBe('1.2');
    expect(r.header.pointCount).toBe(2);
    expect(r.header.loadedCount).toBe(2);
    expect(r.header.truncated).toBe(false);
    expect(r.features).toHaveLength(2);
    expect(r.features[0].pts[0].a).toBeCloseTo(500100, 2);
    expect(r.features[0].pts[0].b).toBeCloseTo(2600200, 2);
    expect(r.features[0].props.Elevation).toBeCloseTo(345.5, 2);
  });

  it('rejects a compressed LAZ file instead of reading it as raw LAS', () => {
    // This is the defect being guarded: LAZ carries the same "LASF" signature
    // and sets the high bit of the point-data-format byte. Parsing its
    // compressed records as raw integers produced plausible-looking garbage
    // coordinates with no error raised.
    const laz = buildLas({
      points: [{ x: 1, y: 2, z: 3 }],
      pointFormat: 0 | 0x80
    });

    expect(() => parseLasHeaderAndPoints(laz)).toThrow(/compressed LAZ/i);
    expect(() => parseLasHeaderAndPoints(laz)).toThrow(/uncompressed LAS only/i);
  });

  it('rejects the alternate LAZ compression bit', () => {
    const laz = buildLas({ points: [{ x: 1, y: 2, z: 3 }], pointFormat: 0 | 0x40 });
    expect(() => parseLasHeaderAndPoints(laz)).toThrow(/compressed LAZ/i);
  });

  it('reports subsampling honestly rather than silently truncating', () => {
    const points = Array.from({ length: 40 }, (_, i) => ({ x: i, y: i * 2, z: i / 2 }));
    const r = parseLasHeaderAndPoints(buildLas({ points }), 10);

    expect(r.header.pointCount).toBe(40);   // what the file holds
    expect(r.header.loadedCount).toBe(10);  // what was actually read
    expect(r.header.truncated).toBe(true);
    expect(r.features).toHaveLength(10);
  });

  it('refuses a file declaring no points rather than inventing a count of 1000', () => {
    expect(() => parseLasHeaderAndPoints(buildLas({ points: [], pointCount: 0 }))).toThrow(/no point records/i);
  });

  it('rejects a file without the LASF signature', () => {
    const notLas = new Uint8Array(300);
    expect(() => parseLasHeaderAndPoints(notLas)).toThrow(/invalid signature/i);
  });

  it('strips compression bits from the reported point format', () => {
    const r = parseLasHeaderAndPoints(buildLas({ points: [{ x: 1, y: 1, z: 1 }], pointFormat: 2 }));
    expect(r.header.pointFormat).toBe(2);
  });
});
