import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  MapPin,
  X,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Layers,
  Sparkles
} from 'lucide-react';
import { SurveyWaypoint } from '../types';
import { parseCSV, geojsonToFeatures, gpxToFeatures, wktToFeatures } from '../lib/formats';
import { lonLatToUtm } from '../lib/geodesy';
import { useToast } from '../context/ToastContext';

interface ImportWaypointsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workingZone: string;
  onImportWaypoints: (newWaypoints: SurveyWaypoint[]) => void;
}

export const ImportWaypointsModal: React.FC<ImportWaypointsModalProps> = ({
  isOpen,
  onClose,
  workingZone,
  onImportWaypoints
}) => {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importedPreview, setImportedPreview] = useState<SurveyWaypoint[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  const processFileContent = (name: string, content: string) => {
    setError(null);
    setFileName(name);
    try {
      const lower = name.toLowerCase();
      let extracted: SurveyWaypoint[] = [];

      // 1. GeoJSON / JSON
      if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
        const json = JSON.parse(content);
        const features = geojsonToFeatures(json, name);
        extracted = features.map((f, idx) => {
          const pt = f.pts[0];
          const isEn = f.kind === 'en';
          const lat = isEn ? 23.5 : pt.b;
          const lon = isEn ? 84.6 : pt.a;
          const utm = isEn ? { E: pt.a, N: pt.b } : lonLatToUtm(lon, lat, zNum, isSouth);
          return {
            id: f.name || `PT-${idx + 1}`,
            code: f.folder || 'Imported GeoJSON',
            E: utm.E,
            N: utm.N,
            Z: 540.0,
            lat,
            lon,
            acc: 0.5,
            zone: workingZone,
            time: Date.now(),
            remarks: `Imported from ${name}`,
            proximityRadius: 10
          };
        });
      }
      // 2. GPX
      else if (lower.endsWith('.gpx')) {
        const features = gpxToFeatures(content);
        extracted = features.map((f, idx) => {
          const pt = f.pts[0];
          const lat = pt.b;
          const lon = pt.a;
          const utm = lonLatToUtm(lon, lat, zNum, isSouth);
          return {
            id: f.name || `WPT-${idx + 1}`,
            code: f.folder || 'GPX Waypoint',
            E: utm.E,
            N: utm.N,
            Z: 540.0,
            lat,
            lon,
            acc: 0.5,
            zone: workingZone,
            time: Date.now(),
            remarks: `Imported from ${name}`,
            proximityRadius: 10
          };
        });
      }
      // 3. CSV / TXT / TSV
      else {
        const rows = parseCSV(content);
        if (rows.length < 2) {
          throw new Error('CSV must contain header and at least one data row.');
        }

        const header = rows[0].map(h => h.trim().toLowerCase());
        
        // Find column indices
        let idCol = header.findIndex(h => ['id', 'name', 'point', 'pt', 'point_id', 'p'].includes(h));
        let eCol = header.findIndex(h => ['easting', 'e', 'x', 'east'].includes(h));
        let nCol = header.findIndex(h => ['northing', 'n', 'y', 'north'].includes(h));
        let zCol = header.findIndex(h => ['elevation', 'elev', 'z', 'alt', 'height'].includes(h));
        let codeCol = header.findIndex(h => ['code', 'desc', 'description', 'feature', 'type'].includes(h));
        let latCol = header.findIndex(h => ['latitude', 'lat'].includes(h));
        let lonCol = header.findIndex(h => ['longitude', 'lon', 'lng', 'long'].includes(h));
        let remarksCol = header.findIndex(h => ['remarks', 'remark', 'notes', 'note'].includes(h));

        // Default fallbacks if no header match
        if (eCol === -1 && nCol === -1 && latCol === -1 && lonCol === -1) {
          // Assume ID, E, N, Z, Code order
          idCol = 0;
          eCol = 1;
          nCol = 2;
          zCol = 3;
          codeCol = 4;
        }

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 2) continue;

          const id = idCol >= 0 && row[idCol] ? row[idCol].trim() : `PT-${i}`;
          const code = codeCol >= 0 && row[codeCol] ? row[codeCol].trim() : 'Design Point';
          const z = zCol >= 0 && !isNaN(parseFloat(row[zCol])) ? parseFloat(row[zCol]) : 540.0;
          const remarks = remarksCol >= 0 && row[remarksCol] ? row[remarksCol].trim() : '';

          let E = 0, N = 0, lat = 0, lon = 0;

          if (eCol >= 0 && nCol >= 0 && !isNaN(parseFloat(row[eCol])) && !isNaN(parseFloat(row[nCol]))) {
            E = parseFloat(row[eCol]);
            N = parseFloat(row[nCol]);
            // If coords are in lat/lon range
            if (Math.abs(E) <= 180 && Math.abs(N) <= 90) {
              lon = E;
              lat = N;
              const u = lonLatToUtm(lon, lat, zNum, isSouth);
              E = u.E;
              N = u.N;
            } else {
              // Convert to approximate lat/lon
              lat = 23.5415;
              lon = 84.6018;
            }
          } else if (latCol >= 0 && lonCol >= 0) {
            lat = parseFloat(row[latCol]);
            lon = parseFloat(row[lonCol]);
            const u = lonLatToUtm(lon, lat, zNum, isSouth);
            E = u.E;
            N = u.N;
          }

          if (E && N) {
            extracted.push({
              id,
              code,
              E,
              N,
              Z: z,
              lat,
              lon,
              acc: 0.5,
              zone: workingZone,
              time: Date.now(),
              remarks: remarks || `Imported from ${name}`,
              proximityRadius: 10
            });
          }
        }
      }

      if (extracted.length === 0) {
        throw new Error('No valid point coordinates could be extracted from this file.');
      }

      setImportedPreview(extracted);
    } catch (err: any) {
      setError(err.message || 'Failed to parse file.');
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = evt => {
        const text = evt.target?.result as string;
        processFileContent(file.name, text);
      };
      reader.readAsText(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = evt => {
        const text = evt.target?.result as string;
        processFileContent(file.name, text);
      };
      reader.readAsText(file);
    }
  };

  const handleConfirmImport = () => {
    if (importedPreview.length === 0) return;
    onImportWaypoints(importedPreview);
    toast.showSuccess(`Successfully imported ${importedPreview.length} waypoint(s) into registry & stakeout queue.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-4 p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#c9a063]/20 text-[#c9a063]">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-serif italic text-white font-bold">
                Import Survey Waypoints & Stakeout Targets
              </h3>
              <p className="text-xs text-white/50">
                Support for CSV, TXT, GeoJSON, and GPX coordinate files.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drag and Drop Zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-[#c9a063] bg-[#c9a063]/10'
              : 'border-white/15 hover:border-white/30 bg-[#141414]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.tsv,.geojson,.json,.gpx"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-[#c9a063]" />
            <div className="text-sm font-semibold text-white">
              Drag & Drop coordinate file here, or <span className="text-[#c9a063]">Browse</span>
            </div>
            <div className="text-xs text-white/40">
              CSV (Point ID, Easting, Northing, Elev, Code) • GeoJSON • GPX Waypoints
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Preview of Extracted Waypoints */}
        {importedPreview.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Parsed {importedPreview.length} Points from {fileName}
              </span>
              <span className="text-white/40 font-mono">UTM Zone: {workingZone}</span>
            </div>

            <div className="max-h-52 overflow-y-auto border border-white/10 rounded-xl bg-[#141414]">
              <table className="w-full text-left text-xs font-mono text-white/80">
                <thead className="sticky top-0 bg-[#1a1a1a] text-[10px] text-[#c9a063] uppercase border-b border-white/10">
                  <tr>
                    <th className="p-2">Point ID</th>
                    <th className="p-2">Code</th>
                    <th className="p-2">Easting (m)</th>
                    <th className="p-2">Northing (m)</th>
                    <th className="p-2">Elev (m)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {importedPreview.slice(0, 50).map((pt, i) => (
                    <tr key={i} className="hover:bg-white/5">
                      <td className="p-2 font-bold text-white">{pt.id}</td>
                      <td className="p-2 text-white/60 font-sans">{pt.code}</td>
                      <td className="p-2">{pt.E.toFixed(3)}</td>
                      <td className="p-2">{pt.N.toFixed(3)}</td>
                      <td className="p-2">{pt.Z.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importedPreview.length > 50 && (
              <p className="text-[11px] text-white/40 text-center">
                Showing first 50 of {importedPreview.length} points
              </p>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmImport}
            disabled={importedPreview.length === 0}
            className="px-4 py-2 bg-[#c9a063] hover:bg-[#d6b074] disabled:opacity-30 text-black font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Import {importedPreview.length} Points to Registry</span>
          </button>
        </div>
      </div>
    </div>
  );
};
