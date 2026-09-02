import { describe, it, expect } from 'vitest';
import { parseLasHeaderAndPoints, parseGeoTiffRaster } from '../formats';

// ---------------------------------------------------------------------------
// The formats the README says are refused, or only partly read
// ---------------------------------------------------------------------------
// "Do not claim a format is supported until the implementation is verified."
// The README states three refusals by name. Each is asserted here against a
// real file header rather than against a reading of the code, because the whole
// point of these claims is that the alternative — accepting the file — produces
// plausible, meaningless output rather than an error.

/**
 * A minimal but structurally real LAS 1.2 header.
 *
 * Byte offsets are the ones the parser reads, so a mistake here shows up as a
 * parse failure rather than as a silently passing test.
 */
function lasFile(opts: { pointFormat: number; pointCount: number; recordLength?: number }): Uint8Array {
  const HEADER = 227;
  const recLen = opts.recordLength ?? 20;
  const bytes = new Uint8Array(HEADER + opts.pointCount * recLen);
  const view = new DataView(bytes.buffer);

  bytes.set([0x4c, 0x41, 0x53, 0x46], 0); // "LASF"
  view.setUint8(24, 1);                   // version 1.2
  view.setUint8(25, 2);
  view.setUint32(96, HEADER, true);       // offset to point data
  view.setUint8(104, opts.pointFormat);   // point data format
  view.setUint16(105, recLen, true);      // point record length
  view.setUint32(107, opts.pointCount, true);

  view.setFloat64(131, 0.01, true);       // scale x/y/z
  view.setFloat64(139, 0.01, true);
  view.setFloat64(147, 0.01, true);
  view.setFloat64(155, 254800, true);     // offset x/y/z at a real UTM position
  view.setFloat64(163, 2605200, true);
  view.setFloat64(171, 0, true);
  view.setFloat64(179, 254900, true);     // max/min x, y, z
  view.setFloat64(187, 254800, true);
  view.setFloat64(195, 2605300, true);
  view.setFloat64(203, 2605200, true);
  view.setFloat64(211, 100, true);
  view.setFloat64(219, 0, true);

  // Point records: X, Y, Z as scaled int32.
  for (let i = 0; i < opts.pointCount; i++) {
    const at = HEADER + i * recLen;
    view.setInt32(at, i * 100, true);
    view.setInt32(at + 4, i * 100, true);
    view.setInt32(at + 8, i * 10, true);
  }
  return bytes;
}

describe('LAZ is refused, not misread', () => {
  it.each([
    ['laszip compression bit', 0x80],
    ['the other reserved compression bit', 0x40]
  ])('rejects a file whose point format sets %s', (_label, bit) => {
    // A LAZ file carries the same "LASF" signature. Reading its compressed
    // records as raw little-endian integers yields coordinates that look real.
    expect(() => parseLasHeaderAndPoints(lasFile({ pointFormat: bit | 3, pointCount: 4 })))
      .toThrow(/compressed LAZ/i);
  });

  it('names the remedy rather than only refusing', () => {
    let message = '';
    try {
      parseLasHeaderAndPoints(lasFile({ pointFormat: 0x80, pointCount: 2 }));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/uncompressed LAS/i);
    expect(message).toMatch(/\.las/);
  });

  it('still reads an uncompressed file, so the check is not refusing everything', () => {
    const out = parseLasHeaderAndPoints(lasFile({ pointFormat: 3, pointCount: 5 }));
    expect(out.header.pointCount).toBe(5);
    expect(out.header.loadedCount).toBe(5);
    expect(out.features.length).toBe(5);
    // The compression bits are stripped, leaving the real format number.
    expect(out.header.pointFormat).toBe(3);
  });
});

describe('a large cloud is subsampled, and says so', () => {
  it('reports the subsampling rather than implying it read everything', () => {
    const out = parseLasHeaderAndPoints(lasFile({ pointFormat: 0, pointCount: 60 }), 10);
    expect(out.header.pointCount, 'the true count must still be reported').toBe(60);
    expect(out.header.loadedCount, 'more points loaded than the cap allows').toBeLessThanOrEqual(10);
    expect(out.header.truncated, 'a subsampled cloud did not say so').toBe(true);
  });

  it('does not claim subsampling when the whole cloud fits', () => {
    const out = parseLasHeaderAndPoints(lasFile({ pointFormat: 0, pointCount: 5 }), 2500);
    expect(out.header.loadedCount).toBe(5);
    expect(out.header.truncated).toBe(false);
  });
});

/** A minimal little-endian TIFF with the given tags. */
function tiffFile(tags: [number, number, number, number][]): Uint8Array {
  const IFD = 8;
  const count = tags.length;
  const size = IFD + 2 + count * 12 + 4;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49], 0);        // "II" little-endian
  view.setUint16(2, 42, true);       // magic
  view.setUint32(4, IFD, true);      // offset to first IFD
  view.setUint16(IFD, count, true);
  tags.forEach(([tag, type, n, value], i) => {
    const at = IFD + 2 + i * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, n, true);
    view.setUint32(at + 8, value, true);
  });
  view.setUint32(IFD + 2 + count * 12, 0, true); // no next IFD
  return bytes;
}

describe('a TIFF without georeferencing is not placed at the origin', () => {
  it('reads the size but reports that it is not georeferenced', () => {
    // 256 = ImageWidth, 257 = ImageLength, type 3 = SHORT.
    const info = parseGeoTiffRaster(tiffFile([[256, 3, 1, 800], [257, 3, 1, 600]]));
    expect(info.width).toBe(800);
    expect(info.height).toBe(600);
    expect(info.isGeoReferenced, 'a plain TIFF was reported as georeferenced').toBe(false);
  });

  it('leaves the footprint empty rather than reporting a position it does not have', () => {
    const info = parseGeoTiffRaster(tiffFile([[256, 3, 1, 800], [257, 3, 1, 600]]));
    // `bounds` is documented as empty when the file is not georeferenced, so a
    // zeroed footprint would be a position the file never stated.
    expect(info.bounds, 'a footprint was reported for a file with no tiepoint').toBeUndefined();
  });
});
