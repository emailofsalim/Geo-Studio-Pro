import { describe, it, expect } from 'vitest';
import {
  esc,
  buildReport,
  boreholeReport,
  cadastralReport,
  boundaryReport,
  gpsControlReport,
  surveyCalculationReport,
  projectSummaryReport,
  type ReportContext
} from '../reports';

const ctx: ReportContext = {
  projectName: 'Pakhar Bauxite Lease',
  workingZone: '45N',
  preparedBy: 'M. S. Ansari',
  generatedAt: Date.UTC(2026, 0, 15, 10, 30)
};

describe('report engine — CRS is mandatory and always declared', () => {
  it('refuses to build a report without a valid coordinate system', () => {
    // A survey report carrying eastings with no CRS is not a record of
    // anything, so this must fail rather than default to a zone.
    expect(() => boreholeReport([], { ...ctx, workingZone: '' })).toThrow(/not a valid UTM zone/i);
    expect(() => boreholeReport([], { ...ctx, workingZone: 'nonsense' })).toThrow(/not a valid UTM zone/i);
  });

  it('prints the CRS name, EPSG code, datum and units in the header', () => {
    const r = boreholeReport([], ctx);
    expect(r.html).toContain('WGS 84 / UTM Zone 45N');
    expect(r.html).toContain('EPSG:32645');
    expect(r.html).toContain('WGS 84');
    expect(r.html).toMatch(/Coordinate reference system/i);
  });

  it('uses the southern EPSG authority for a southern zone', () => {
    const r = boreholeReport([], { ...ctx, workingZone: '45S' });
    expect(r.crs.epsg).toBe(32745);
    expect(r.html).toContain('EPSG:32745');
    expect(r.html).not.toContain('EPSG:32645');
  });

  it('repeats the CRS in the footer so a detached page still carries it', () => {
    const r = boreholeReport([], ctx);
    const footer = r.html.slice(r.html.indexOf('<footer'));
    expect(footer).toContain('EPSG:32645');
  });
});

describe('report engine — escaping', () => {
  it('escapes HTML metacharacters', () => {
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(esc('A & B')).toBe('A &amp; B');
    expect(esc(`"quoted" 'single'`)).toBe('&quot;quoted&quot; &#39;single&#39;');
  });

  it('renders null and undefined as empty rather than the words', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('does not let project data inject markup into a report', () => {
    // Plot numbers and owner names come from user input and imported files.
    const r = cadastralReport(
      [{ plotNo: '<img src=x onerror=alert(1)>', owner: '</td></tr><script>bad()</script>' }],
      ctx
    );
    expect(r.html).not.toContain('<img src=x');
    expect(r.html).not.toContain('<script>bad()');
    expect(r.html).toContain('&lt;img src=x');
  });

  it('escapes the project name and preparer', () => {
    const r = boreholeReport([], { ...ctx, projectName: '<b>X</b>', preparedBy: '<i>Y</i>' });
    expect(r.html).not.toContain('<b>X</b>');
    expect(r.html).toContain('&lt;b&gt;X&lt;/b&gt;');
  });
});

describe('report engine — borehole register', () => {
  const holes = [
    { id: 'BH-01', easting: 255050, northing: 2605100, elevation: 1044.5, depth: 32, obThick: 3.5, bauxiteThick: 6.2 },
    { id: 'BH-02', easting: 255250, northing: 2605200, elevation: 1048.2, depth: 28.5, obThick: 2.8, bauxiteThick: 7.8 }
  ];

  it('reports the collar schedule and its totals', () => {
    const r = boreholeReport(holes, ctx);
    expect(r.html).toContain('BH-01');
    expect(r.html).toContain('BH-02');
    expect(r.html).toMatch(/Boreholes logged/);
    expect(r.rowCount).toBe(2);
  });

  it('computes total and maximum depth', () => {
    const r = boreholeReport(holes, ctx);
    expect(r.html).toContain('60.50 m'); // 32 + 28.5
    expect(r.html).toContain('32.00 m'); // deepest
  });

  it('computes the mean intercept thickness', () => {
    const r = boreholeReport(holes, ctx);
    expect(r.html).toContain('7.00 m'); // (6.2 + 7.8) / 2
  });

  it('says so plainly when there are no boreholes', () => {
    const r = boreholeReport([], ctx);
    expect(r.html).toMatch(/No boreholes have been logged/i);
    expect(r.rowCount).toBe(0);
  });
});

describe('report engine — cadastral register', () => {
  const parcels = [
    { plotNo: '101', khata: '45', owner: 'A. Kumar', areaM2: 2500, perimeterM: 200 },
    { plotNo: '102', khata: '46', owner: 'B. Devi', areaM2: 7500, perimeterM: 350 }
  ];

  it('lists plots and totals the area in m² and hectares', () => {
    const r = cadastralReport(parcels, ctx);
    expect(r.html).toContain('101');
    expect(r.html).toContain('A. Kumar');
    expect(r.html).toContain('10000.00 m²');
    expect(r.html).toContain('1.0000 ha');
  });

  it('computes the mean plot area', () => {
    expect(cadastralReport(parcels, ctx).html).toContain('5000.00 m²');
  });
});

describe('report engine — other domains', () => {
  it('builds a boundary report including the operation parameters', () => {
    const r = boundaryReport({ Distance: '5 m', Direction: 'Outward' }, [{ id: 1, E: 100, N: 200 }], ctx);
    expect(r.html).toContain('5 m');
    expect(r.html).toContain('Outward');
    expect(r.html).toMatch(/combined scale factor/i);
  });

  it('builds a GNSS control report with accuracy statistics', () => {
    const r = gpsControlReport(
      [
        { id: 'BP-01', code: 'Pillar', E: 1, N: 2, Z: 3, acc: 0.02 },
        { id: 'BP-02', code: 'Pillar', E: 4, N: 5, Z: 6, acc: 0.04 }
      ],
      ctx
    );
    expect(r.html).toContain('0.020 m'); // best
    expect(r.html).toContain('0.040 m'); // worst
    expect(r.html).toContain('0.030 m'); // mean
  });

  it('builds a survey calculation record', () => {
    const r = surveyCalculationReport([{ type: 'Traverse', label: 'Loop A', result: 'Closure 1:12000' }], ctx);
    expect(r.html).toContain('Loop A');
    expect(r.html).toContain('Closure 1:12000');
  });

  it('builds a project summary counting only populated modules', () => {
    const r = projectSummaryReport(
      { waypoints: [1, 2, 3], boreholes: [1], layers: [], parcels: [], photos: [], geofences: [], calculations: [] } as any,
      ctx
    );
    expect(r.html).toContain('GNSS points');
    expect(r.rowCount).toBe(2); // waypoints and boreholes only
  });
});

describe('report engine — document structure', () => {
  it('produces a standalone printable document', () => {
    const r = boreholeReport([], ctx);
    expect(r.html).toMatch(/^<!doctype html>/i);
    expect(r.html).toContain('@media print');
    expect(r.html).toContain('</html>');
  });

  it('marks numeric columns for right alignment', () => {
    const r = boreholeReport([{ id: 'BH-01', depth: 32 }], ctx);
    expect(r.html).toContain('class="num"');
  });

  it('reports its own section and row counts', () => {
    const r = buildReport('project', 'T', ctx, [
      { heading: 'A', table: { columns: [{ key: 'x', label: 'X' }], rows: [{ x: 1 }, { x: 2 }] } },
      { heading: 'B', summary: { k: 'v' } }
    ]);
    expect(r.sectionCount).toBe(2);
    expect(r.rowCount).toBe(2);
  });

  it('renders a missing value as an em dash rather than "undefined"', () => {
    const r = boreholeReport([{ id: 'BH-01' }], ctx);
    expect(r.html).not.toContain('undefined');
    expect(r.html).toContain('—');
  });
});
