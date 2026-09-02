import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeUniversalExport } from '../universalDataBridge';
import type { GeoFeature } from '../../types';

// ---------------------------------------------------------------------------
// Exports that are read as records must not invent their contents
// ---------------------------------------------------------------------------
// A plot register, a Khatian schedule and an ore QA report all settle
// something: who holds a plot, how large it is, whether a hole is worth
// mining. A value substituted for one that was never recorded reads as a real
// observation, and nothing in the file marks it as invented.
//
// Each builder previously filled its gaps with something plausible. These
// tests pin the blanks.

let written: Uint8Array | string = '';
vi.mock('../zip', async orig => {
  const actual = await orig<typeof import('../zip')>();
  return { ...actual, downloadBlob: (data: Uint8Array | string) => { written = data; } };
});

const text = () => (typeof written === 'string' ? written : new TextDecoder().decode(written));
// Rows are CRLF-terminated, so the carriage return has to come off before
// splitting or the last column of every row carries it.
const csv = () => text().trim().split(/\r?\n/).map(r => r.replace(/\r$/, '').split(','));

const pt = (name: string, lon: number, lat: number, props: Record<string, unknown>): GeoFeature =>
  ({ kind: 'll', name, pts: [{ a: lon, b: lat }], props } as unknown as GeoFeature);

const poly = (name: string, props: Record<string, unknown>): GeoFeature =>
  ({
    kind: 'll',
    name,
    pts: [{ a: 84.60, b: 23.54 }, { a: 84.61, b: 23.54 }, { a: 84.61, b: 23.55 }, { a: 84.60, b: 23.55 }],
    props
  } as unknown as GeoFeature);

const run = async (format: string, features: GeoFeature[]) => {
  written = '';
  await executeUniversalExport({ format, fileName: 't', features, workingZoneStr: '45N' } as never);
};

describe('Ore QA/QC report', () => {
  beforeEach(() => { written = ''; });

  const holes = () => [
    pt('BH-01', 84.6012, 23.5410, { Status: 'Positive Ore', Ore_Thickness: '7.20 m' }),
    pt('BH-02', 84.6035, 23.5425, { Status: 'Positive Ore', Ore_Thickness: '5.80 m' }),
    pt('BH-03', 84.6050, 23.5390, { Status: 'Barren / Waste', Ore_Thickness: '3.70 m' })
  ];

  it('leaves blank every figure the holes do not carry', async () => {
    await run('assay_qa', holes());
    const rows = csv();
    const head = rows[0];
    const col = (r: string[], n: string) => r[head.indexOf(n)];
    // These holes log a status and a thickness. They log no collar level, no
    // total depth and no assay, so those columns must be empty.
    for (const r of rows.slice(1)) {
      for (const field of ['Collar_RL', 'Total_Depth_m', 'Assay_Mean_Grade']) {
        expect(col(r, field), `${col(r, 'Hole_ID')} ${field}`).toBe('');
      }
      // Waste and strip ratio derive from a depth that was never recorded.
      expect(col(r, 'Waste_OB_m')).toBe('');
      expect(col(r, 'Strip_Ratio')).toBe('');
    }
  });

  it('reads the ore intercept that was logged, unit and all', async () => {
    await run('assay_qa', holes());
    const rows = csv();
    const i = rows[0].indexOf('Ore_Intercept_m');
    expect(rows.slice(1).map(r => r[i])).toEqual(['7.20', '5.80', '3.70']);
  });

  it('takes the verdict from the log, not from a hole position in the list', async () => {
    // The shipped rule compared an invented intercept that alternated by
    // index against 20, so two holes logged identically disagreed and a
    // barren hole came out POSITIVE.
    await run('assay_qa', holes());
    const rows = csv();
    const i = rows[0].indexOf('Ore_Status');
    expect(rows.slice(1).map(r => r[i])).toEqual(['POSITIVE ORE', 'POSITIVE ORE', 'BARREN / WASTE']);
  });

  it('leaves the verdict blank when the hole was never classified', async () => {
    await run('assay_qa', [pt('BH-09', 84.60, 23.54, {})]);
    const rows = csv();
    expect(rows[1][rows[0].indexOf('Ore_Status')]).toBe('');
  });

  it('reports every figure that is present', async () => {
    await run('assay_qa', [
      pt('BH-10', 84.60, 23.54, { Status: 'ORE', depth: 40, ore: 10, elevation: 212.5, grade: '46.2% Al2O3' })
    ]);
    const rows = csv();
    const head = rows[0];
    const r = rows[1];
    const col = (n: string) => r[head.indexOf(n)];
    expect(col('Collar_RL')).toBe('212.50');
    expect(col('Total_Depth_m')).toBe('40.00');
    expect(col('Ore_Intercept_m')).toBe('10.00');
    expect(col('Waste_OB_m')).toBe('30.00');
    expect(col('Strip_Ratio')).toBe('3.00');
    expect(col('Assay_Mean_Grade')).toBe('46.2% Al2O3');
  });
});

describe('Cadastral plot register', () => {
  beforeEach(() => { written = ''; });

  it('never invents an owner, a village, a status or an area', async () => {
    await run('plot_register', [poly('Plot-7', {})]);
    const rows = csv();
    const head = rows[0];
    const r = rows[1];
    const blankIfPresent = (name: string) => {
      const i = head.findIndex(h => new RegExp(name, 'i').test(h));
      if (i >= 0) expect(r[i], `${head[i]} was filled in`).toBe('');
    };
    for (const f of ['owner', 'holder', 'village', 'mouza', 'status']) blankIfPresent(f);
    // Area columns too: an invented area becomes a compensation figure.
    for (const f of ['Sq.?M', 'Hectare', 'Acre', 'Bigha', 'Katha']) blankIfPresent(f);
  });

  it('reports an area that is recorded', async () => {
    await run('plot_register', [poly('Plot-8', { areaM2: 20000, owner: 'R. Devi', village: 'Bara' })]);
    const rows = csv();
    expect(rows[1].join(',')).toContain('R. Devi');
    expect(rows[1].join(',')).toContain('Bara');
    expect(rows[1].join(',')).toContain('2.0000'); // hectares
  });
});

describe('QGIS ground control points', () => {
  beforeEach(() => { written = ''; });

  it('emits no control point for a feature that carries no pixel position', async () => {
    // The dangerous case. A .points file pairs pixel positions with ground
    // coordinates so QGIS can warp a scanned map onto the ground. Inventing
    // the pixel side produces a georeference that is confidently wrong, and
    // the residual column, always 0.000, claims a perfect fit.
    await run('qgis_points', [
      pt('C1', 84.60, 23.54, {}),
      pt('C2', 84.61, 23.55, {}),
      pt('C3', 84.62, 23.56, {})
    ]);
    const rows = csv();
    expect(rows[0][0]).toBe('mapX'); // header still written
    expect(rows.length, 'control points were invented for features with no pixel position').toBe(1);
  });

  it('emits exactly the control points that were recorded', async () => {
    await run('qgis_points', [
      pt('C1', 84.60, 23.54, { pixelX: 412, pixelY: 903 }),
      pt('C2', 84.61, 23.55, {}),
      pt('C3', 84.62, 23.56, { pixelX: 1180, pixelY: 244 })
    ]);
    const rows = csv();
    expect(rows.length - 1).toBe(2);
    expect(rows[1][2]).toBe('412');
    expect(rows[1][3]).toBe('-903');
    expect(rows[2][2]).toBe('1180');
  });
});

describe('Surpac geological string', () => {
  beforeEach(() => { written = ''; });

  it('does not walk an unlevelled string downhill', async () => {
    // The fallback was `100 - pointIndex * 5`, which gave every unlevelled
    // string a steady 5 m fall per point and read as surveyed relief.
    written = '';
    await executeUniversalExport({
      format: 'surpac', fileName: 't', workingZoneStr: '45N',
      features: [{
        kind: 'll', name: 'S1', geom: 'line',
        pts: [{ a: 84.60, b: 23.54 }, { a: 84.61, b: 23.54 }, { a: 84.62, b: 23.54 }],
        props: {}
      } as unknown as GeoFeature]
    } as never);
    // Data rows carry a non-zero string id; the header and trailer rows use 0.
    const zs = text().trim().split(/\r?\n/)
      .map(l => l.split(','))
      .filter(c => c.length >= 5 && c[0].trim() !== '0')
      .map(c => Number(c[3]));
    const distinct = new Set(zs);
    expect(distinct.size, `levels varied without being surveyed: ${[...distinct].join(', ')}`).toBe(1);
  });

  it('does not label an unclassified string as ore', async () => {
    written = '';
    await executeUniversalExport({
      format: 'surpac', fileName: 't', workingZoneStr: '45N',
      features: [{ kind: 'll', name: '', geom: 'line', pts: [{ a: 84.6, b: 23.5 }], props: {} } as unknown as GeoFeature]
    } as never);
    expect(text()).not.toContain('ORE');
  });
});

describe('Generic table export', () => {
  beforeEach(() => { written = ''; });

  it('leaves elevation blank rather than placing a 2D feature at sea level', async () => {
    await run('csv', [pt('P1', 84.60, 23.54, {})]);
    const rows = csv();
    const i = rows[0].indexOf('Elevation_Z');
    expect(rows[1][i]).toBe('');
  });

  it('reports an elevation that is recorded', async () => {
    await run('csv', [pt('P2', 84.60, 23.54, { elevation: 212.5 })]);
    const rows = csv();
    expect(rows[1][rows[0].indexOf('Elevation_Z')]).toBe('212.500');
  });
});
