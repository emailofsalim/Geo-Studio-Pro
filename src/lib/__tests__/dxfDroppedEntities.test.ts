import { describe, it, expect } from 'vitest';
import { dxfParse, dxfUnconvertedEntities, dxfUnconvertedWarning } from '../formats';
import { detectAndParseGeospatialFile } from '../universalDataBridge';

// ---------------------------------------------------------------------------
// A DXF import says what it could not bring in
// ---------------------------------------------------------------------------
// The reader converts points, lines and polylines. It parses arcs, circles,
// splines and text too, and then drops them, because the feature model has no
// arc or spline to hold them.
//
// Dropping them is the honest limit of the reader; dropping them in silence is
// not. A cadastral drawing whose plot boundaries are arcs imports as a smaller
// set of straight lines, reports how many features arrived, and says nothing
// about the ones that did not.

/** A minimal DXF entities section. */
function dxf(entities: string): string {
  return `0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
}

const LINE = '0\nLINE\n8\nBOUNDARY\n10\n254800.0\n20\n2605200.0\n11\n254900.0\n21\n2605300.0\n';
const ARC = '0\nARC\n8\nBOUNDARY\n10\n254850.0\n20\n2605250.0\n40\n25.0\n50\n0.0\n51\n90.0\n';
const CIRCLE = '0\nCIRCLE\n8\nSTRUCT\n10\n254870.0\n20\n2605270.0\n40\n5.0\n';

describe('entities the reader cannot convert', () => {
  it('counts them by type', () => {
    const counts = dxfUnconvertedEntities(dxf(LINE + ARC + ARC + CIRCLE));
    expect(counts.ARC).toBe(2);
    expect(counts.CIRCLE).toBe(1);
    expect(counts.LINE).toBeUndefined();
  });

  it('reports nothing when everything converted', () => {
    expect(dxfUnconvertedWarning(dxf(LINE + LINE))).toBeNull();
    expect(dxfUnconvertedEntities(dxf(LINE))).toEqual({});
  });

  it('names them in a sentence a surveyor can act on', () => {
    const w = dxfUnconvertedWarning(dxf(LINE + ARC + ARC + CIRCLE));
    expect(w).toContain('2 ARC');
    expect(w).toContain('1 CIRCLE');
    expect(w).toMatch(/not imported/i);
  });
});

describe('the import result carries the warning', () => {
  it('warns that arcs were dropped, and still imports the lines', async () => {
    const file = new File([dxf(LINE + ARC + ARC)], 'plot.dxf', { type: 'application/dxf' });
    const res = await detectAndParseGeospatialFile(file, '45N');

    expect(res.formatId).toBe('dxf');
    // The line still arrives — this is a partial import, not a refusal.
    expect(res.features.length).toBe(1);
    // And the loss is stated.
    expect((res.warnings || []).join(' ')).toMatch(/2 ARC/);
  });

  it('does not invent a warning for a drawing it fully converted', async () => {
    const file = new File([dxf(LINE)], 'plot.dxf', { type: 'application/dxf' });
    const res = await detectAndParseGeospatialFile(file, '45N');
    expect((res.warnings || []).join(' ')).not.toMatch(/not imported/i);
  });

  it('the parser really does drop them, which is what makes the warning necessary', () => {
    // Guards the premise: if a later change starts converting arcs, this test
    // fails and the warning should be revisited rather than left claiming a
    // loss that no longer happens.
    expect(dxfParse(dxf(LINE + ARC + CIRCLE)).length).toBe(1);
  });
});
