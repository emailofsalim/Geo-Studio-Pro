import React, { useState } from 'react';
import {
  Layers,
  Upload,
  Download,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FolderArchive,
  RefreshCw,
  Info,
  Eye,
  FileText,
  Trash2
} from 'lucide-react';
import {
  parseCSV,
  stripBOM,
  csvToFeatures,
  kmlParse,
  kmlBuild,
  featuresToKMZ,
  dxfParse,
  dxfBuild,
  geoJsonParse,
  geoJsonBuild,
  gpxParse,
  gpxBuild,
  wktParse,
  wktBuild,
  buildExcelZip,
  toCSVtext,
  csvEnc
} from '../lib/formats';
import { validateFeatures } from '../lib/qa';
import { downloadBlob, readZip } from '../lib/zip';
import { GeoFeature, QAResult } from '../types';
import { VectorRadarMap } from './VectorRadarMap';

interface FormatConverterTabProps {
  workingZone: string;
}

interface ExtractedArchiveFile {
  name: string;
  size: number;
  ext: string;
  bytes: Uint8Array;
  featureCount: number;
}

export const FormatConverterTab: React.FC<FormatConverterTabProps> = ({ workingZone }) => {
  const [loadedFeatures, setLoadedFeatures] = useState<GeoFeature[]>([]);
  const [sourceFormat, setSourceFormat] = useState<string>('csv');
  const [targetFormat, setTargetFormat] = useState<string>('kml');
  const [fileName, setFileName] = useState<string>('survey_export');
  const [qaReport, setQaReport] = useState<QAResult | null>(null);
  const [is3D, setIs3D] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [archiveFiles, setArchiveFiles] = useState<ExtractedArchiveFile[]>([]);
  const [previewFile, setPreviewFile] = useState<{ name: string; text: string } | null>(null);

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  // Handle File Input (supports single files and .zip/.kmz archives)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      setFileName(file.name.replace(/\.[^/.]+$/, ''));
      setArchiveFiles([]);
      setPreviewFile(null);

      let feats: GeoFeature[] = [];

      if (ext === 'zip' || ext === 'kmz') {
        const buf = await file.arrayBuffer();
        const filesMap = await readZip(buf);
        const extractedList: ExtractedArchiveFile[] = [];
        const dec = new TextDecoder();

        for (const entryName of Object.keys(filesMap)) {
          const entryExt = entryName.split('.').pop()?.toLowerCase() || '';
          const bytes = filesMap[entryName];
          if (!bytes || !bytes.length) continue;
          const text = stripBOM(dec.decode(bytes));
          let fileFeats: GeoFeature[] = [];

          if (entryExt === 'kml' || entryName.endsWith('.kml')) {
            fileFeats = kmlParse(text);
          } else if (entryExt === 'geojson' || entryExt === 'json') {
            fileFeats = geoJsonParse(text);
          } else if (entryExt === 'dxf') {
            fileFeats = dxfParse(text);
          } else if (entryExt === 'csv') {
            fileFeats = csvToFeatures(parseCSV(text), zNum, isSouth);
          } else if (entryExt === 'gpx') {
            fileFeats = gpxParse(text);
          } else if (entryExt === 'wkt') {
            fileFeats = wktParse(text);
          }

          feats.push(...fileFeats);
          extractedList.push({
            name: entryName,
            size: bytes.length,
            ext: entryExt,
            bytes,
            featureCount: fileFeats.length
          });
        }

        setArchiveFiles(extractedList);
        setSourceFormat(ext);
        setStatusMsg(`Extracted ${extractedList.length} file(s) from ${file.name}, parsed ${feats.length} spatial features.`);
      } else {
        const text = stripBOM(await file.text());

        if (ext === 'csv') {
          const rows = parseCSV(text);
          feats = csvToFeatures(rows, zNum, isSouth);
          setSourceFormat('csv');
        } else if (ext === 'kml') {
          feats = kmlParse(text);
          setSourceFormat('kml');
        } else if (ext === 'dxf') {
          feats = dxfParse(text);
          setSourceFormat('dxf');
        } else if (ext === 'geojson' || ext === 'json') {
          feats = geoJsonParse(text);
          setSourceFormat('geojson');
        } else if (ext === 'gpx') {
          feats = gpxParse(text);
          setSourceFormat('gpx');
        } else if (ext === 'wkt') {
          feats = wktParse(text);
          setSourceFormat('wkt');
        } else {
          setStatusMsg(`Unsupported file type .${ext}`);
          return;
        }

        setStatusMsg(`Successfully loaded ${feats.length} features from ${file.name}`);
      }

      setLoadedFeatures(feats);

      // Run QA Pre-Flight
      const qa = validateFeatures(feats, workingZone);
      setQaReport(qa);
    } catch (err: any) {
      setStatusMsg(`Error reading file: ${err.message}`);
    }
  };

  const handleDownloadSingleArchiveFile = (f: ExtractedArchiveFile) => {
    let mime = 'application/octet-stream';
    if (f.ext === 'csv') mime = 'text/csv;charset=utf-8';
    else if (f.ext === 'kml') mime = 'application/vnd.google-earth.kml+xml';
    else if (f.ext === 'dxf') mime = 'application/dxf';
    else if (f.ext === 'geojson' || f.ext === 'json') mime = 'application/geo+json';
    else if (f.ext === 'gpx') mime = 'application/gpx+xml';
    downloadBlob(f.bytes, f.name.split('/').pop() || f.name, mime);
  };

  const handlePreviewArchiveFile = (f: ExtractedArchiveFile) => {
    const dec = new TextDecoder();
    const text = dec.decode(f.bytes);
    setPreviewFile({ name: f.name, text });
  };

  // Convert & Download
  const handleExport = () => {
    if (!loadedFeatures.length) {
      alert('No features loaded to convert.');
      return;
    }

    try {
      if (targetFormat === 'kmz') {
        const kmzList = featuresToKMZ(loadedFeatures, '#c9a063', { zone: zNum, south: isSouth });
        kmzList.forEach(kmz => {
          downloadBlob(kmz.bytes, `${fileName}.kmz`, 'application/vnd.google-earth.kmz');
        });
      } else if (targetFormat === 'kml') {
        const kml = kmlBuild(loadedFeatures, fileName, is3D, zNum, isSouth);
        downloadBlob(new TextEncoder().encode(kml), `${fileName}.kml`, 'application/vnd.google-earth.kml+xml');
      } else if (targetFormat === 'dxf') {
        const res = dxfBuild(loadedFeatures, 'utm', zNum, isSouth, true);
        downloadBlob(new TextEncoder().encode(res.dxf), `${fileName}.dxf`, 'application/dxf');
      } else if (targetFormat === 'geojson') {
        const gj = geoJsonBuild(loadedFeatures, zNum, isSouth);
        downloadBlob(new TextEncoder().encode(gj), `${fileName}.geojson`, 'application/geo+json');
      } else if (targetFormat === 'gpx') {
        const gpx = gpxBuild(loadedFeatures, fileName, is3D, zNum, isSouth);
        downloadBlob(new TextEncoder().encode(gpx), `${fileName}.gpx`, 'application/gpx+xml');
      } else if (targetFormat === 'wkt') {
        const wkt = wktBuild(loadedFeatures, zNum, isSouth);
        downloadBlob(new TextEncoder().encode(wkt), `${fileName}.wkt`, 'text/plain');
      } else if (targetFormat === 'xlsx') {
        const cols = ['Feature_Name', 'Geometry_Type', 'Coordinates'];
        const rows = loadedFeatures.map(f => [
          f.name || 'Unnamed',
          f.geom.toUpperCase(),
          f.pts.map(p => `${p.a},${p.b}`).join(' | ')
        ]);
        const zip = buildExcelZip(cols, rows, 'Features');
        downloadBlob(zip, `${fileName}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else if (targetFormat === 'csv') {
        const cols = ['Feature_Name', 'Geometry_Type', 'Point_Index', 'Coord_A', 'Coord_B'];
        const rows: any[] = [];
        loadedFeatures.forEach(f => {
          f.pts.forEach((p, idx) => {
            rows.push([f.name || 'Unnamed', f.geom, idx + 1, p.a, p.b]);
          });
        });
        const txt = toCSVtext(cols, rows);
        downloadBlob(csvEnc(txt), `${fileName}.csv`, 'text/csv;charset=utf-8');
      }
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    }
  };

  const pointCount = loadedFeatures.filter(f => f.geom === 'point').length;
  const polyCount = loadedFeatures.filter(f => f.geom === 'polygon').length;
  const lineCount = loadedFeatures.filter(f => f.geom === 'line').length;

  return (
    <div className="space-y-6">
      {/* 1. Universal Format Converter Cockpit */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium">Cross-Platform Engine</p>
          <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
            Universal GIS, CAD & Archive Converter
          </h3>
          <p className="text-xs text-white/40 mt-1">
            Convert seamlessly between CSV, KML, KMZ, AutoCAD DXF, GeoJSON, GPX, WKT, and Excel with full ZIP/KMZ batch decompression and detailed file analysis.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-white/60 mb-2 block">Upload Source File / Archive</label>
            <label className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs font-semibold cursor-pointer transition-colors border border-dashed border-white/10 hover:border-[#c9a063]/50">
              <Upload className="w-4 h-4 text-[#c9a063]" /> Choose File (.zip, .kmz, .csv, .kml, .dxf, .geojson, .gpx)
              <input
                type="file"
                accept=".zip,.kmz,.csv,.kml,.dxf,.geojson,.json,.gpx,.wkt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="text-xs font-medium text-white/60 mb-2 block">Target Output Format</label>
            <select
              value={targetFormat}
              onChange={e => setTargetFormat(e.target.value)}
              className="w-full py-2.5 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-sm font-medium focus:outline-none focus:border-[#c9a063]"
            >
              <option value="kml">Google Earth KML (.kml)</option>
              <option value="kmz">Google Earth KMZ Archive (.kmz)</option>
              <option value="dxf">AutoCAD DXF (.dxf)</option>
              <option value="geojson">GeoJSON (.geojson)</option>
              <option value="gpx">GPS Exchange Format (.gpx)</option>
              <option value="wkt">Well-Known Text (.wkt)</option>
              <option value="xlsx">Excel Workbook (.xlsx)</option>
              <option value="csv">CSV Spreadsheet (.csv)</option>
            </select>
          </div>

          <div>
            <button
              onClick={handleExport}
              disabled={!loadedFeatures.length}
              className="w-full py-2.5 bg-[#c9a063] hover:bg-[#d6b074] disabled:opacity-30 text-black rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#c9a063]/10"
            >
              <Download className="w-4 h-4" /> Convert & Download
            </button>
          </div>
        </div>

        {/* Status or Details */}
        {statusMsg && (
          <div className="p-3.5 bg-white/5 border border-white/10 text-xs text-white/80 rounded-xl flex items-center justify-between flex-wrap gap-2">
            <span>{statusMsg}</span>
            {archiveFiles.length > 0 && (
              <span className="text-[10px] font-mono text-[#c9a063] bg-[#c9a063]/10 px-2 py-0.5 rounded border border-[#c9a063]/30">
                {archiveFiles.length} archive entries decompressed
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Decompressed Archive Contents Inspector */}
      {archiveFiles.length > 0 && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <FolderArchive className="w-4 h-4 text-[#c9a063]" />
              Extracted Archive Contents ({archiveFiles.length} files)
            </h4>
            <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">
              Decompressed in Memory
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-white/40 font-mono text-[10px] uppercase">
                  <th className="py-2.5 px-3">File Path / Name</th>
                  <th className="py-2.5 px-3">Format</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3">Features</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {archiveFiles.map((file, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 px-3 text-white/90 font-sans font-medium flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-[#c9a063]" />
                      {file.name}
                    </td>
                    <td className="py-2.5 px-3 text-[#c9a063] uppercase text-[11px]">{file.ext || 'bin'}</td>
                    <td className="py-2.5 px-3 text-white/50">{(file.size / 1024).toFixed(1)} KB</td>
                    <td className="py-2.5 px-3 text-white/70">
                      {file.featureCount > 0 ? (
                        <span className="text-emerald-400 font-semibold">{file.featureCount} parsed</span>
                      ) : (
                        <span className="text-white/30">0</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      <button
                        onClick={() => handlePreviewArchiveFile(file)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded text-[11px] transition-colors"
                        title="Preview text/code"
                      >
                        <Eye className="w-3 h-3" /> View
                      </button>
                      <button
                        onClick={() => handleDownloadSingleArchiveFile(file)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#c9a063]/10 hover:bg-[#c9a063]/20 text-[#c9a063] rounded text-[11px] transition-colors"
                        title="Download extracted file"
                      >
                        <Download className="w-3 h-3" /> Save
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Quick File Preview Modal/Box */}
          {previewFile && (
            <div className="mt-4 p-4 bg-[#141414] rounded-xl border border-white/10 space-y-2">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-xs font-mono text-[#c9a063]">{previewFile.name} (Preview)</span>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="text-white/40 hover:text-white text-xs"
                >
                  Close &times;
                </button>
              </div>
              <pre className="text-[11px] font-mono text-white/70 max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                {previewFile.text.slice(0, 3000)}
                {previewFile.text.length > 3000 && '\n... [truncated preview]'}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 3. QA Pre-flight Validation Checklist */}
      {qaReport && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-serif italic text-white flex items-center gap-2 text-base">
              <CheckCircle2 className="w-4 h-4 text-[#c9a063]" />
              QA Pre-Flight Validation Report
            </h4>
            <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">
              Zone UTM {workingZone}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
              <span className="text-[10px] text-white/40 block font-sans uppercase">Total Features</span>
              <span className="font-bold font-mono text-white text-base">{loadedFeatures.length}</span>
            </div>
            <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
              <span className="text-[10px] text-white/40 block font-sans uppercase">Polys / Lines / Points</span>
              <span className="font-bold font-mono text-white text-base">
                {polyCount} / {lineCount} / {pointCount}
              </span>
            </div>
            <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
              <span className="text-[10px] text-white/40 block font-sans uppercase">Errors Detected</span>
              <span className={`font-bold font-mono text-base ${qaReport.nErr ? 'text-rose-400' : 'text-emerald-400'}`}>
                {qaReport.nErr}
              </span>
            </div>
            <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
              <span className="text-[10px] text-white/40 block font-sans uppercase">Warnings</span>
              <span className={`font-bold font-mono text-base ${qaReport.nWarn ? 'text-amber-400' : 'text-emerald-400'}`}>
                {qaReport.nWarn}
              </span>
            </div>
          </div>

          {qaReport.issues.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              {qaReport.issues.map((iss, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    iss.sev === 'err'
                      ? 'bg-rose-950/30 border-rose-800/50 text-rose-300'
                      : iss.sev === 'warn'
                      ? 'bg-amber-950/30 border-amber-800/50 text-amber-300'
                      : 'bg-white/5 border-white/10 text-white/80'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold font-serif italic">{iss.type}: {iss.detail}</div>
                    <div className="text-[11px] opacity-75 mt-0.5">Fix: {iss.fix}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. Interactive Vector Radar Map Preview */}
      {loadedFeatures.length > 0 && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 border border-white/5">
          <VectorRadarMap
            features={loadedFeatures}
            zone={zNum}
            south={isSouth}
            onFeaturesChange={setLoadedFeatures}
            title="Converted Geometry Preview & Vector Radar"
          />
        </div>
      )}
    </div>
  );
};
