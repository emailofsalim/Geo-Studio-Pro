// ============================================================================
// BhuNex Studio — Reporting engine
// ----------------------------------------------------------------------------
// Builds print-ready HTML reports from project data.
//
// Consolidated from the reporting engine in the Geo Studio modular lineage
// (apps/reports-engine.js), which produced borehole, cadastral and boundary
// reports, and extended here to cover GPS control, survey calculations and a
// whole-project summary.
//
// ONE RULE RUNS THROUGH ALL OF IT: every report states the coordinate
// reference system it was produced in, in its header, on every page. A survey
// report carrying eastings and northings with no CRS is not a record of
// anything - the same numbers are a real place in all 60 UTM zones. The CRS is
// a required argument, not an option, so a report cannot be generated without
// one.
// ============================================================================

import { crsIdentityFor, type CrsIdentity } from '../lib/crsIdentity';

export type ReportKind = 'project' | 'borehole' | 'cadastral' | 'boundary' | 'gps' | 'survey';

export interface ReportContext {
  projectName: string;
  /** Working zone, e.g. "45N". Required — reports must declare their CRS. */
  workingZone: string;
  preparedBy?: string;
  distanceUnit?: 'm' | 'ft';
  generatedAt?: number;
}

export interface ReportSection {
  heading: string;
  /** Key/value summary rendered as a definition table. */
  summary?: Record<string, string | number | null | undefined>;
  /** Tabular data. `columns` are keys into each row object. */
  table?: {
    columns: { key: string; label: string; numeric?: boolean }[];
    rows: Record<string, any>[];
  };
  /** Free prose paragraphs. */
  notes?: string[];
  /** Rendered when the section has no data, instead of an empty table. */
  emptyMessage?: string;
}

export interface BuiltReport {
  kind: ReportKind;
  title: string;
  crs: CrsIdentity;
  html: string;
  sectionCount: number;
  rowCount: number;
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

/**
 * Escapes text for HTML. Report content comes from user-entered project data
 * (plot numbers, owner names, free-text notes) and from imported files, so it
 * is untrusted and must never be interpolated raw into the document.
 */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(value: unknown, numeric = false): string {
  if (value === null || value === undefined || value === '') return '—';
  if (numeric && typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  return esc(value);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #16242b; background: #fff;
    margin: 0; padding: 24px; font-size: 12px; line-height: 1.5;
  }
  .doc { max-width: 900px; margin: 0 auto; }
  header.rpt { border-bottom: 2px solid #16242b; padding-bottom: 12px; margin-bottom: 20px; }
  header.rpt h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: #42565d; font-size: 12px; }
  .crs-band {
    margin-top: 12px; padding: 8px 12px;
    background: #eef3f2; border: 1px solid #cfd8d6; border-left: 3px solid #1f6f6b;
    border-radius: 3px; font-size: 11px;
  }
  .crs-band strong { display: block; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.08em; color: #42565d; margin-bottom: 2px; }
  .crs-band code { font-family: "SFMono-Regular", Menlo, monospace; }
  section { margin-bottom: 22px; page-break-inside: avoid; }
  h2 { font-size: 14px; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid #cfd8d6; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; margin-bottom: 8px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #dfe5e4; vertical-align: top; }
  th { background: #eef3f2; font-size: 10px; text-transform: uppercase;
       letter-spacing: 0.06em; color: #42565d; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums;
                   font-family: "SFMono-Regular", Menlo, monospace; }
  dl.kv { display: grid; grid-template-columns: max-content 1fr; gap: 3px 16px; margin: 0 0 8px; }
  dl.kv dt { color: #42565d; }
  dl.kv dd { margin: 0; font-weight: 600; }
  .empty { color: #6d8189; font-style: italic; padding: 6px 0; }
  .note { margin: 0 0 6px; }
  footer.rpt { margin-top: 28px; padding-top: 10px; border-top: 1px solid #cfd8d6;
               font-size: 10px; color: #6d8189; }
  @media print {
    body { padding: 0; font-size: 10.5px; }
    .doc { max-width: none; }
    header.rpt { position: running(head); }
    section { page-break-inside: avoid; }
    @page { margin: 16mm 14mm; }
  }
`;

function renderSummary(summary: Record<string, any>): string {
  const entries = Object.entries(summary).filter(([, v]) => v !== undefined);
  if (!entries.length) return '';
  return (
    '<dl class="kv">' +
    entries.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${fmt(v)}</dd>`).join('') +
    '</dl>'
  );
}

function renderTable(table: NonNullable<ReportSection['table']>): string {
  const head =
    '<tr>' +
    table.columns.map(c => `<th${c.numeric ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('') +
    '</tr>';
  const body = table.rows
    .map(
      row =>
        '<tr>' +
        table.columns
          .map(c => `<td${c.numeric ? ' class="num"' : ''}>${fmt(row[c.key], c.numeric)}</td>`)
          .join('') +
        '</tr>'
    )
    .join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function renderSection(s: ReportSection): string {
  const parts: string[] = [`<h2>${esc(s.heading)}</h2>`];
  if (s.summary) parts.push(renderSummary(s.summary));
  if (s.table && s.table.rows.length) {
    parts.push(renderTable(s.table));
  } else if (s.table) {
    parts.push(`<p class="empty">${esc(s.emptyMessage || 'No records in this project.')}</p>`);
  }
  if (s.notes?.length) {
    parts.push(s.notes.map(n => `<p class="note">${esc(n)}</p>`).join(''));
  }
  return `<section>${parts.join('')}</section>`;
}

/**
 * Assembles a complete report document.
 *
 * `ctx.workingZone` must be a valid UTM zone — crsIdentityFor throws otherwise,
 * so a report can never be produced without a declared coordinate system.
 */
export function buildReport(
  kind: ReportKind,
  title: string,
  ctx: ReportContext,
  sections: ReportSection[]
): BuiltReport {
  const crs = crsIdentityFor(ctx.workingZone);
  const generatedAt = ctx.generatedAt ?? Date.now();
  const stamp = new Date(generatedAt).toLocaleString();

  const rowCount = sections.reduce((n, s) => n + (s.table?.rows.length ?? 0), 0);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)} — ${esc(ctx.projectName)}</title>
<style>${STYLES}</style>
</head><body><div class="doc">
<header class="rpt">
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(ctx.projectName)} · Generated ${esc(stamp)}${
    ctx.preparedBy ? ` · Prepared by ${esc(ctx.preparedBy)}` : ''
  }</div>
  <div class="crs-band">
    <strong>Coordinate reference system</strong>
    ${esc(crs.name)} · <code>EPSG:${crs.epsg}</code> · Datum ${esc(crs.datum)} ·
    Units ${esc(crs.units)}${ctx.distanceUnit && ctx.distanceUnit !== 'm' ? ` · Distances shown in ${esc(ctx.distanceUnit)}` : ''}
  </div>
</header>
${sections.map(renderSection).join('')}
<footer class="rpt">
  BhuNex Studio · All coordinates in ${esc(crs.label)}.
  Values are as recorded in the project and have not been independently adjusted.
</footer>
</div></body></html>`;

  return { kind, title, crs, html, sectionCount: sections.length, rowCount };
}

// ---------------------------------------------------------------------------
// Domain reports
// ---------------------------------------------------------------------------

export function boreholeReport(boreholes: any[], ctx: ReportContext): BuiltReport {
  const withThickness = boreholes.filter(b => Number.isFinite(Number(b.bauxiteThick)));
  const totalThickness = withThickness.reduce((n, b) => n + Number(b.bauxiteThick), 0);
  const depths = boreholes.map(b => Number(b.depth)).filter(Number.isFinite);

  return buildReport('borehole', 'Borehole Register', ctx, [
    {
      heading: 'Summary',
      summary: {
        'Boreholes logged': boreholes.length,
        'Total depth drilled': depths.length ? `${depths.reduce((a, b) => a + b, 0).toFixed(2)} m` : undefined,
        'Deepest hole': depths.length ? `${Math.max(...depths).toFixed(2)} m` : undefined,
        'Mean intercept thickness': withThickness.length
          ? `${(totalThickness / withThickness.length).toFixed(2)} m`
          : undefined
      }
    },
    {
      heading: 'Collar schedule',
      table: {
        columns: [
          { key: 'id', label: 'Hole ID' },
          { key: 'easting', label: 'Easting', numeric: true },
          { key: 'northing', label: 'Northing', numeric: true },
          { key: 'elevation', label: 'Collar RL', numeric: true },
          { key: 'depth', label: 'Depth', numeric: true },
          { key: 'obThick', label: 'Overburden', numeric: true },
          { key: 'bauxiteThick', label: 'Intercept', numeric: true }
        ],
        rows: boreholes
      },
      emptyMessage: 'No boreholes have been logged in this project.'
    }
  ]);
}

export function cadastralReport(parcels: any[], ctx: ReportContext): BuiltReport {
  const areas = parcels.map(p => Number(p.areaM2 ?? p.computedAreaM2)).filter(Number.isFinite);
  const totalM2 = areas.reduce((a, b) => a + b, 0);

  return buildReport('cadastral', 'Cadastral Plot Register', ctx, [
    {
      heading: 'Summary',
      summary: {
        'Plots recorded': parcels.length,
        'Total area': areas.length ? `${totalM2.toFixed(2)} m² (${(totalM2 / 10000).toFixed(4)} ha)` : undefined,
        'Mean plot area': areas.length ? `${(totalM2 / areas.length).toFixed(2)} m²` : undefined
      }
    },
    {
      heading: 'Plot register',
      table: {
        columns: [
          { key: 'plotNo', label: 'Plot no.' },
          { key: 'khata', label: 'Khata' },
          { key: 'owner', label: 'Owner' },
          { key: 'areaM2', label: 'Area (m²)', numeric: true },
          { key: 'perimeterM', label: 'Perimeter (m)', numeric: true }
        ],
        rows: parcels
      },
      emptyMessage: 'No cadastral plots have been recorded in this project.'
    }
  ]);
}

export function boundaryReport(
  operation: Record<string, any>,
  vertices: any[],
  ctx: ReportContext
): BuiltReport {
  return buildReport('boundary', 'Boundary Offset Report', ctx, [
    { heading: 'Operation', summary: operation },
    {
      heading: 'Offset vertices',
      table: {
        columns: [
          { key: 'id', label: '#' },
          { key: 'E', label: 'Easting', numeric: true },
          { key: 'N', label: 'Northing', numeric: true }
        ],
        rows: vertices
      },
      emptyMessage: 'No offset geometry has been generated.'
    },
    {
      heading: 'Notes',
      notes: [
        'Offset distances are computed on the projected grid in the coordinate system declared above. ' +
          'Grid distances differ from ground distances by the combined scale factor; apply the correction before setting out.'
      ]
    }
  ]);
}

export function gpsControlReport(waypoints: any[], ctx: ReportContext): BuiltReport {
  const accs = waypoints.map(w => Number(w.acc)).filter(Number.isFinite);
  return buildReport('gps', 'GNSS Control Report', ctx, [
    {
      heading: 'Summary',
      summary: {
        'Points observed': waypoints.length,
        'Best accuracy': accs.length ? `${Math.min(...accs).toFixed(3)} m` : undefined,
        'Worst accuracy': accs.length ? `${Math.max(...accs).toFixed(3)} m` : undefined,
        'Mean accuracy': accs.length
          ? `${(accs.reduce((a, b) => a + b, 0) / accs.length).toFixed(3)} m`
          : undefined
      }
    },
    {
      heading: 'Observed points',
      table: {
        columns: [
          { key: 'id', label: 'Point' },
          { key: 'code', label: 'Code' },
          { key: 'E', label: 'Easting', numeric: true },
          { key: 'N', label: 'Northing', numeric: true },
          { key: 'Z', label: 'RL', numeric: true },
          { key: 'acc', label: 'Acc (m)', numeric: true }
        ],
        rows: waypoints
      },
      emptyMessage: 'No GNSS observations have been recorded in this project.'
    },
    {
      heading: 'Notes',
      notes: [
        'Accuracy figures are the receiver-reported horizontal estimate at the time of observation and are not a substitute for an independent check.'
      ]
    }
  ]);
}

export function surveyCalculationReport(calculations: any[], ctx: ReportContext): BuiltReport {
  return buildReport('survey', 'Survey Calculation Record', ctx, [
    { heading: 'Summary', summary: { 'Calculations recorded': calculations.length } },
    {
      heading: 'Calculations',
      table: {
        columns: [
          { key: 'type', label: 'Type' },
          { key: 'label', label: 'Description' },
          { key: 'result', label: 'Result' },
          { key: 'timestamp', label: 'Recorded' }
        ],
        rows: calculations.map(c => ({
          ...c,
          timestamp: c.timestamp ? new Date(c.timestamp).toLocaleString() : ''
        }))
      },
      emptyMessage: 'No calculations have been saved in this project.'
    }
  ]);
}

/** Whole-project summary covering every populated module. */
export function projectSummaryReport(data: Record<string, any[]>, ctx: ReportContext): BuiltReport {
  const counts: Record<string, number> = {
    'GNSS points': data.waypoints?.length ?? 0,
    'GIS layers': data.layers?.length ?? 0,
    'Cadastral plots': data.parcels?.length ?? 0,
    Boreholes: data.boreholes?.length ?? 0,
    Photos: data.photos?.length ?? 0,
    Geofences: data.geofences?.length ?? 0,
    Calculations: data.calculations?.length ?? 0
  };

  return buildReport('project', 'Project Summary', ctx, [
    { heading: 'Contents', summary: counts },
    {
      heading: 'Modules with data',
      table: {
        columns: [
          { key: 'module', label: 'Module' },
          { key: 'records', label: 'Records', numeric: true }
        ],
        rows: Object.entries(counts)
          .filter(([, n]) => n > 0)
          .map(([module, records]) => ({ module, records }))
      },
      emptyMessage: 'This project does not contain any data yet.'
    }
  ]);
}
