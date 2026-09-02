import React, { useState } from 'react';
import {
  Spline,
  Upload,
  Download,
  ShieldCheck,
  Layers,
  Sparkles,
  RotateCw
} from 'lucide-react';
import { GeoFeature } from '../types';
import { polygonAreaPerimeter, formatAreaAllUnits, offsetPolygonEN } from '../lib/geodesy';
import { parseCSV, stripBOM, toCSVtext, csvEnc, kmlBuild, dxfBuild, geoJsonBuild } from '../lib/formats';
import { downloadBlob } from '../lib/zip';
import { VectorRadarMap } from './VectorRadarMap';

interface BoundaryOffsetTabProps {
  workingZone: string;
  localLandUnitPreset: string;
  customBighaM2: number;
  customKathaPerBigha: number;
}

export const BoundaryOffsetTab: React.FC<BoundaryOffsetTabProps> = ({
  workingZone,
  localLandUnitPreset,
  customBighaM2,
  customKathaPerBigha
}) => {
  const [offsetDist, setOffsetDist] = useState<number>(7.5);
  const [offsetDir, setOffsetDir] = useState<'in' | 'out'>('in');
  const [leasePtsText, setLeasePtsText] = useState<string>(
    '254800.00, 2605200.00\n255200.00, 2605300.00\n255300.00, 2604900.00\n254750.00, 2604850.00'
  );

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  // Parse input polygon
  const basePolygon = React.useMemo(() => {
    const lines = leasePtsText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const pts: { E: number; N: number }[] = [];
    lines.forEach(l => {
      const p = l.split(/[,\t]+/).map(parseFloat);
      if (p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) {
        pts.push({ E: p[0], N: p[1] });
      }
    });
    return pts;
  }, [leasePtsText]);

  // The statutory belt. The geometry lives in geodesy.ts rather than here, so
  // that it can be tested and so this screen cannot drift from the lat/lon
  // boundaryOffset that shares it. The version that used to sit inline took the
  // offset side from the digitising order, which put the barrier outside the
  // lease for a boundary drawn clockwise.
  const offsetResult = React.useMemo(() => {
    const empty: { E: number; N: number }[] = [];
    if (basePolygon.length < 3) return { pts: empty, reason: '' };
    if (!(offsetDist > 0)) {
      return { pts: empty, reason: 'Enter an offset distance greater than zero. The side is set by the dropdown, so a minus sign here is refused rather than read as the other direction.' };
    }
    const off = offsetPolygonEN(basePolygon, offsetDist, offsetDir === 'out');
    if (off) return { pts: off, reason: '' };
    return { pts: empty, reason: `A ${offsetDist} m ${offsetDir === 'in' ? 'inward' : 'outward'} offset leaves no belt to measure: at this distance it consumes the boundary rather than following it. Usually the distance is wide relative to the parcel, or a narrow neck closes at it. Reduce the distance, or check the boundary for a spike.` };
  }, [basePolygon, offsetDist, offsetDir]);
  const offsetPolygon = offsetResult.pts;

  // Areas
  const baseArea = React.useMemo(() => {
    if (basePolygon.length < 3) return null;
    return polygonAreaPerimeter(basePolygon);
  }, [basePolygon]);

  const offsetArea = React.useMemo(() => {
    if (offsetPolygon.length < 3) return null;
    return polygonAreaPerimeter(offsetPolygon);
  }, [offsetPolygon]);

  // Features for Map
  const mapFeatures: GeoFeature[] = React.useMemo(() => {
    const list: GeoFeature[] = [];
    if (basePolygon.length >= 3) {
      list.push({
        name: 'Original Mine Lease Boundary',
        geom: 'polygon',
        kind: 'en',
        pts: basePolygon.map(p => ({ a: p.E, b: p.N })),
        props: { layer: 'LEASE_BOUNDARY' }
      });
    }
    if (offsetPolygon.length >= 3) {
      list.push({
        name: `${offsetDist}m Statutory Safety Offset Belt`,
        geom: 'polygon',
        kind: 'en',
        pts: offsetPolygon.map(p => ({ a: p.E, b: p.N })),
        props: { layer: 'OFFSET_SAFETY_ZONE', status: 'POSITIVE' }
      });
    }
    return list;
  }, [basePolygon, offsetPolygon, offsetDist]);

  // Exports
  const handleExportDXF = () => {
    const res = dxfBuild(mapFeatures, 'utm', zNum, isSouth, true);
    downloadBlob(new TextEncoder().encode(res.dxf), 'Mine_Boundary_Safety_Offset.dxf', 'application/dxf');
  };

  const handleExportKML = () => {
    const kml = kmlBuild(mapFeatures, 'Mine_Safety_Offset', true, zNum, isSouth);
    downloadBlob(new TextEncoder().encode(kml), 'Mine_Safety_Offset.kml', 'application/vnd.google-earth.kml+xml');
  };

  const handleExportGeoJSON = () => {
    const gj = geoJsonBuild(mapFeatures, zNum, isSouth);
    downloadBlob(new TextEncoder().encode(gj), 'Mine_Safety_Offset.geojson', 'application/geo+json');
  };

  return (
    <div className="space-y-6">
      {/* 1. Mine Safety Belt Cockpit */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Spline className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              1. Mine Statutory Boundary Safety Offset Generator
            </h3>
            <p className="text-xs text-slate-500">
              Generate 7.5m statutory barrier buffers, 50m blasting safety zones, 100m river setbacks, and compute net exploitable area.
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-bold text-slate-500">Regulatory Presets:</span>
          {[
            { label: '7.5m Statutory Barrier (IBM/MCDR)', d: 7.5, dir: 'in' },
            { label: '50m Blasting Safety Zone', d: 50, dir: 'out' },
            { label: '100m River / Nallah Setback', d: 100, dir: 'in' },
            { label: '500m DGMS Habitation Buffer', d: 500, dir: 'out' }
          ].map(p => (
            <button
              key={p.label}
              onClick={() => {
                setOffsetDist(p.d);
                setOffsetDir(p.dir as any);
              }}
              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-teal-500/15 rounded-lg text-slate-700 dark:text-slate-300 font-medium"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Offset Distance (metres)</label>
            <input
              type="number"
              value={offsetDist}
              onChange={e => setOffsetDist(parseFloat(e.target.value) || 0)}
              step="0.5"
              min="0"
              className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Offset Direction</label>
            <select
              value={offsetDir}
              onChange={e => setOffsetDir(e.target.value as any)}
              className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium"
            >
              <option value="in">Inward Buffer (Net Exploitable Working Pit Area)</option>
              <option value="out">Outward Buffer (External Safety & Clearance Zone)</option>
            </select>
          </div>
        </div>

        {/* Input coordinates */}
        <div>
          <label className="text-xs font-bold text-slate-500 mb-1 block">
            Boundary Coordinates (<code>Easting, Northing</code> per line)
          </label>
          <textarea
            value={leasePtsText}
            onChange={e => setLeasePtsText(e.target.value)}
            rows={4}
            className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950 font-mono text-xs focus:outline-none"
          />
        </div>

        {offsetResult.reason !== '' && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800/60">
            <span className="text-[10px] text-rose-500 block font-sans uppercase">No belt produced</span>
            <span className="text-xs text-rose-700 dark:text-rose-300">
              {offsetResult.reason} No area is shown, because any figure here would be a fiction.
            </span>
          </div>
        )}

        {/* Area Comparison HUD */}
        {baseArea && offsetArea && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 block font-sans uppercase">Original Lease Area</span>
              <span className="text-base font-mono font-bold text-slate-800 dark:text-slate-100">
                {baseArea.areaHa.toFixed(4)} Ha ({baseArea.areaAcres.toFixed(3)} Ac)
              </span>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60">
              <span className="text-[10px] text-slate-400 block font-sans uppercase">
                {offsetDir === 'in' ? 'Net Exploitable Mining Area' : 'Total Safety Zone Footprint'}
              </span>
              <span className="text-base font-mono font-bold text-emerald-700 dark:text-emerald-300">
                {offsetArea.areaHa.toFixed(4)} Ha ({offsetArea.areaAcres.toFixed(3)} Ac)
              </span>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60">
              <span className="text-[10px] text-slate-400 block font-sans uppercase">Statutory Barrier Difference</span>
              <span className="text-base font-mono font-bold text-amber-700 dark:text-amber-300">
                {Math.abs(baseArea.areaHa - offsetArea.areaHa).toFixed(4)} Ha
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Vector Radar Map Preview */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <VectorRadarMap
          features={mapFeatures}
          zone={zNum}
          south={isSouth}
          title="Boundary & Safety Buffer Comparison"
        />
      </div>
    </div>
  );
};
