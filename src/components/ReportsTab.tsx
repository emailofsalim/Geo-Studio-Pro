import React, { useState, useMemo } from 'react';
import { FileText, Printer, Download, AlertTriangle } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { downloadBlob } from '../lib/zip';
import {
  boreholeReport,
  cadastralReport,
  gpsControlReport,
  surveyCalculationReport,
  projectSummaryReport,
  type BuiltReport,
  type ReportContext,
  type ReportKind
} from '../engines/reports';
import { isValidZone, crsLabelFor } from '../lib/crsIdentity';

interface ReportsTabProps {
  workingZone: string;
  distanceUnit?: 'm' | 'ft';
}

interface ReportDef {
  kind: ReportKind;
  name: string;
  description: string;
  /** Records available for this report in the active project. */
  count: (d: any) => number;
  build: (d: any, ctx: ReportContext) => BuiltReport;
}

const REPORTS: ReportDef[] = [
  {
    kind: 'project',
    name: 'Project Summary',
    description: 'Everything the project contains, module by module.',
    count: d => Object.values(d || {}).filter(v => Array.isArray(v) && v.length).length,
    build: (d, ctx) => projectSummaryReport(d, ctx)
  },
  {
    kind: 'gps',
    name: 'GNSS Control Report',
    description: 'Observed control points with accuracy statistics.',
    count: d => d?.waypoints?.length ?? 0,
    build: (d, ctx) => gpsControlReport(d?.waypoints ?? [], ctx)
  },
  {
    kind: 'cadastral',
    name: 'Cadastral Plot Register',
    description: 'Plot numbers, khata, owners and areas.',
    count: d => d?.parcels?.length ?? 0,
    build: (d, ctx) => cadastralReport(d?.parcels ?? [], ctx)
  },
  {
    kind: 'borehole',
    name: 'Borehole Register',
    description: 'Collar schedule with depths and intercepts.',
    count: d => d?.boreholes?.length ?? 0,
    build: (d, ctx) => boreholeReport(d?.boreholes ?? [], ctx)
  },
  {
    kind: 'survey',
    name: 'Survey Calculation Record',
    description: 'Saved traverse, level and volume calculations.',
    count: d => d?.calculations?.length ?? 0,
    build: (d, ctx) => surveyCalculationReport(d?.calculations ?? [], ctx)
  }
];

export const ReportsTab: React.FC<ReportsTabProps> = ({ workingZone, distanceUnit }) => {
  const { activeProject, activeProjectData } = useProject();
  const toast = useToast();
  const [preview, setPreview] = useState<BuiltReport | null>(null);

  const zoneIsSet = isValidZone(workingZone);

  const ctx: ReportContext | null = useMemo(() => {
    if (!zoneIsSet) return null;
    return {
      projectName: activeProject?.name || 'Untitled project',
      workingZone,
      distanceUnit,
      preparedBy: undefined
    };
  }, [activeProject?.name, workingZone, distanceUnit, zoneIsSet]);

  const generate = (def: ReportDef) => {
    if (!ctx) return;
    try {
      setPreview(def.build(activeProjectData ?? {}, { ...ctx, generatedAt: Date.now() }));
    } catch (err: any) {
      toast.showError(`Could not build the ${def.name}: ${err.message}`);
    }
  };

  const printReport = () => {
    if (!preview) return;
    const w = window.open('', '_blank');
    if (!w) {
      toast.showError('The browser blocked the print window. Allow pop-ups for this site and try again.');
      return;
    }
    w.document.write(preview.html);
    w.document.close();
    w.focus();
    w.print();
  };

  const saveReport = () => {
    if (!preview) return;
    const safe = `${preview.title}_${ctx?.projectName ?? 'project'}`.replace(/[^a-z0-9]+/gi, '_');
    downloadBlob(preview.html, `${safe}.html`, 'text/html');
    toast.showSuccess(`Saved ${preview.title}.`);
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="w-5 h-5" /> Reports
        </h1>
        <p className="text-sm opacity-70 mt-1">
          Print-ready records built from the active project. Every report states the coordinate system it was
          produced in.
        </p>
      </div>

      {/* CRS banner — a report cannot be produced without a declared CRS. */}
      {zoneIsSet ? (
        <div className="rounded-lg border border-teal-600/40 bg-teal-500/10 px-4 py-3 text-sm">
          <div className="text-[11px] uppercase tracking-wider opacity-60">Reports will be produced in</div>
          <div className="font-semibold mt-0.5">{crsLabelFor(workingZone)}</div>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-600/50 bg-amber-500/10 px-4 py-3 text-sm flex gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
          <div>
            <div className="font-semibold">No coordinate system set</div>
            <div className="opacity-80 mt-0.5">
              Set the working zone for this project in Settings before generating a report. Coordinates without a
              declared CRS cannot be interpreted.
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(def => {
          const n = def.count(activeProjectData);
          return (
            <button
              key={def.kind}
              onClick={() => generate(def)}
              disabled={!zoneIsSet}
              className="text-left rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 p-4 hover:border-teal-600/50 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              <div className="font-semibold text-sm">{def.name}</div>
              <div className="text-xs opacity-70 mt-1">{def.description}</div>
              <div className="text-xs mt-2 font-mono opacity-60">
                {n > 0 ? `${n} record${n === 1 ? '' : 's'}` : 'no data yet'}
              </div>
            </button>
          );
        })}
      </div>

      {preview && (
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10">
            <div className="text-sm font-semibold">
              {preview.title}
              <span className="ml-2 font-normal opacity-60 text-xs">
                {preview.rowCount} row{preview.rowCount === 1 ? '' : 's'} · EPSG:{preview.crs.epsg}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={printReport}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
              <button
                onClick={saveReport}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Download className="w-3.5 h-3.5" /> Save HTML
              </button>
            </div>
          </div>
          <iframe
            title={`${preview.title} preview`}
            srcDoc={preview.html}
            className="w-full bg-white"
            style={{ height: '60vh', border: 'none' }}
            sandbox=""
          />
        </div>
      )}
    </div>
  );
};
