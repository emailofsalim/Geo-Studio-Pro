import React, { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Sparkles,
  FolderArchive,
  BookOpen,
  Layers,
  CheckCircle2,
  ArrowRight,
  Upload,
  FileText,
  Eye
} from 'lucide-react';
import { TEMPLATES, DATA_DICTIONARY, buildAllTemplatesZip } from '../lib/templates';
import { downloadBlob, readZip } from '../lib/zip';
import { toCSVtext, csvEnc, stripBOM, parseCSV, csvToFeatures, kmlParse, geoJsonParse, dxfParse, extractAllFeaturesFromZip } from '../lib/formats';
import { AppTabId } from './Navigation';
import { GeoFeature } from '../types';
import { ShieldAlert, Radio } from 'lucide-react';

interface HomeTemplatesTabProps {
  setActiveTab?: (tab: AppTabId) => void;
  workingZone?: string;
  localLandUnitPreset?: string;
  customBighaM2?: number;
  customKathaPerBigha?: number;
}

export const HomeTemplatesTab: React.FC<HomeTemplatesTabProps> = ({ setActiveTab, workingZone = '45N' }) => {
  const [customColumns, setCustomColumns] = useState<string[]>(['BH_ID', 'Longitude', 'Latitude', 'From_m', 'To_m', 'Lithology', 'Al2O3', 'SiO2']);
  const [newColInput, setNewColInput] = useState('');
  const [includeSamples, setIncludeSamples] = useState(true);

  // Quick Zip Unpack State
  const [zipFilesList, setZipFilesList] = useState<{ name: string; size: number; bytes: Uint8Array; featCount: number }[]>([]);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<{ name: string; text: string } | null>(null);

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  const handleDownloadSingle = (key: string) => {
    const t = TEMPLATES[key];
    if (!t) return;
    const txt = toCSVtext(t.cols, t.ex);
    downloadBlob(csvEnc(txt), `template_${key}.csv`, 'text/csv;charset=utf-8');
  };

  const handleDownloadAllZip = () => {
    const zip = buildAllTemplatesZip();
    downloadBlob(zip, 'GeoStudio_All_Templates.zip', 'application/zip');
  };

  const handleDownloadDataDictionary = () => {
    const cols = ['Template_Category', 'Field_Column_Name', 'Technical_Description'];
    const rows = DATA_DICTIONARY.map(d => [d.template, d.col, d.desc]);
    downloadBlob(csvEnc(toCSVtext(cols, rows)), 'GeoStudio_Data_Dictionary.csv', 'text/csv;charset=utf-8');
  };

  const handleAddCustomColumn = () => {
    if (!newColInput.trim()) return;
    if (customColumns.includes(newColInput.trim())) return;
    setCustomColumns([...customColumns, newColInput.trim()]);
    setNewColInput('');
  };

  const handleRemoveCustomColumn = (col: string) => {
    setCustomColumns(customColumns.filter(c => c !== col));
  };

  const handleDownloadCustomTemplate = () => {
    if (!customColumns.length) return;
    const sampleRow = customColumns.map(c => {
      if (c.toLowerCase().includes('lon')) return '84.601550';
      if (c.toLowerCase().includes('lat')) return '23.541200';
      if (c.toLowerCase().includes('from')) return '0.00';
      if (c.toLowerCase().includes('to')) return '3.50';
      if (c.toLowerCase().includes('id')) return 'P-01';
      return 'Sample';
    });
    const rows = includeSamples ? [sampleRow, sampleRow] : [];
    downloadBlob(csvEnc(toCSVtext(customColumns, rows)), 'custom_geostudio_template.csv', 'text/csv;charset=utf-8');
  };

  // Inspect any uploaded ZIP/KMZ
  const handleZipInspectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const extractedDs = await extractAllFeaturesFromZip(buf, zNum, isSouth);
      const filesMap = await readZip(buf);
      const list: { name: string; size: number; bytes: Uint8Array; featCount: number }[] = [];

      for (const name of Object.keys(filesMap)) {
        const bytes = filesMap[name];
        if (!bytes || !bytes.length) continue;
        const matchingDs = extractedDs.find(d => d.fileName === name || d.fileName.endsWith(name));
        list.push({
          name,
          size: bytes.length,
          bytes,
          featCount: matchingDs ? matchingDs.features.length : 0
        });
      }

      setZipFilesList(list);
      const totalFeats = extractedDs.reduce((acc, d) => acc + d.features.length, 0);
      setZipStatus(`Successfully extracted ${list.length} archive items (${extractedDs.length} geospatial datasets, ${totalFeats} features) from ${file.name}`);
    } catch (err: any) {
      setZipStatus(`Failed to extract archive: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-br from-[#c9a063]/15 via-[#0f0f0f] to-[#0a0a0a] border border-[#c9a063]/20 rounded-2xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.2em] font-medium bg-[#c9a063]/10 text-[#c9a063] border border-[#c9a063]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c9a063]"></span>
            Geomatics Intelligence Engine
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif italic text-white tracking-tight">
            Precision Survey & Geodesy Workspace
          </h1>
          <p className="text-sm sm:text-base text-[#d4d4d4]/70 leading-relaxed font-light">
            Engineered for high-order geodesy, bidirectional Bursa-Wolf transformations, IBM/JORC borehole compositing, Bowditch traverse balancing, revenue cadastral partition mapping, and offline GIS conversions.
          </p>
          <div className="flex items-center gap-4 pt-4 flex-wrap">
            {setActiveTab && (
              <>
                <button
                  onClick={() => setActiveTab('gis')}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-[#c9a063]/10"
                >
                  <Layers className="w-4 h-4" /> Open GIS Map Studio
                </button>
                <button
                  onClick={() => setActiveTab('geofence')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-600/90 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-red-500/20"
                >
                  <ShieldAlert className="w-4 h-4" /> Geofence Sentinel
                </button>
              </>
            )}
            <button
              onClick={handleDownloadAllZip}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white font-semibold text-xs uppercase tracking-wider transition-all border border-white/10"
            >
              <FolderArchive className="w-4 h-4 text-[#c9a063]" /> Download All Templates (.zip)
            </button>
            <button
              onClick={handleDownloadDataDictionary}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-medium border border-white/10 transition-all uppercase tracking-wider"
            >
              <BookOpen className="w-4 h-4 text-[#c9a063]" /> Data Dictionary (.csv)
            </button>
          </div>
        </div>
      </div>

      {/* Quick Archive Dropzone & Extractor */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium">Archive Inspector</p>
          <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
            ZIP & KMZ Archive Decompressor & Extractor
          </h3>
          <p className="text-xs text-white/40 mt-1">
            Drop any survey ZIP or KMZ package to inspect individual sub-files, examine raw data, and extract layers.
          </p>
        </div>

        <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/10 hover:border-[#c9a063]/50 rounded-2xl cursor-pointer bg-[#141414]/60 transition-colors">
          <Upload className="w-6 h-6 text-[#c9a063] mb-2" />
          <span className="text-xs font-semibold text-white">
            Upload ZIP or KMZ Archive to Inspect and Extract
          </span>
          <span className="text-[11px] text-white/40 mt-0.5">Decompresses in-memory without uploading to any remote server</span>
          <input
            type="file"
            accept=".zip,.kmz"
            onChange={handleZipInspectUpload}
            className="hidden"
          />
        </label>

        {zipStatus && (
          <div className="p-3 bg-white/5 border border-white/10 text-xs text-white/80 rounded-xl flex items-center justify-between">
            <span>{zipStatus}</span>
          </div>
        )}

        {zipFilesList.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Contained Archive Files ({zipFilesList.length})
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-white/10 text-white/40 text-[10px] uppercase">
                    <th className="py-2 px-3">File Name</th>
                    <th className="py-2 px-3">Size</th>
                    <th className="py-2 px-3">Features</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {zipFilesList.map((f, i) => (
                    <tr key={i} className="hover:bg-white/5">
                      <td className="py-2 px-3 text-white/90 font-sans flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[#c9a063]" />
                        {f.name}
                      </td>
                      <td className="py-2 px-3 text-white/50">{(f.size / 1024).toFixed(1)} KB</td>
                      <td className="py-2 px-3">
                        {f.featCount > 0 ? (
                          <span className="text-emerald-400 font-semibold">{f.featCount} parsed</span>
                        ) : (
                          <span className="text-white/30">0</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            const dec = new TextDecoder();
                            setPreviewContent({ name: f.name, text: dec.decode(f.bytes) });
                          }}
                          className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded text-[10px] transition-colors inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> View
                        </button>
                        <button
                          onClick={() => downloadBlob(f.bytes, f.name.split('/').pop() || f.name)}
                          className="px-2 py-1 bg-[#c9a063]/10 hover:bg-[#c9a063]/20 text-[#c9a063] rounded text-[10px] transition-colors inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> Save
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewContent && (
              <div className="p-4 bg-[#141414] rounded-xl border border-white/10 space-y-2 mt-2">
                <div className="flex items-center justify-between border-b border-white/5 pb-1">
                  <span className="text-xs font-mono text-[#c9a063]">{previewContent.name}</span>
                  <button onClick={() => setPreviewContent(null)} className="text-white/40 hover:text-white text-xs">
                    &times; Close
                  </button>
                </div>
                <pre className="text-[11px] font-mono text-white/70 max-h-40 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                  {previewContent.text.slice(0, 2000)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Template Grid */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium">Standard Libraries</p>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              Verified Schema Templates
            </h3>
            <p className="text-xs text-white/40 mt-1">
              Engineered with calibrated headers, data dictionaries, and field coordinates.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Object.keys(TEMPLATES).map(key => {
            const t = TEMPLATES[key];
            return (
              <div
                key={key}
                className="p-5 rounded-2xl border border-white/5 hover:border-[#c9a063]/40 bg-[#141414]/60 transition-all flex flex-col justify-between group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-serif italic text-base text-white capitalize group-hover:text-[#c9a063] transition-colors">
                      {key.replace('_', ' ')}
                    </h4>
                    <span className="text-[10px] font-mono text-[#c9a063] px-2 py-0.5 bg-[#c9a063]/10 rounded-full border border-[#c9a063]/25">
                      {t.cols.length} cols
                    </span>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed line-clamp-2 font-light">
                    {t.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {t.cols.slice(0, 4).map(c => (
                      <span key={c} className="text-[10px] bg-white/5 px-2 py-0.5 rounded border border-white/5 text-white/60 font-mono">
                        {c}
                      </span>
                    ))}
                    {t.cols.length > 4 && (
                      <span className="text-[10px] text-white/30 px-1 font-mono">
                        +{t.cols.length - 4} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-white/5 mt-4">
                  <button
                    onClick={() => handleDownloadSingle(key)}
                    className="flex items-center gap-2 text-xs font-serif italic text-[#c9a063] hover:text-[#e0ba7e] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download CSV
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Smart Template Builder */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium">Custom Generator</p>
          <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
            Dynamic Schema Builder
          </h3>
          <p className="text-xs text-white/40 mt-1">
            Synthesize survey schema tailored to proprietary field receivers or laboratory assay suites.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={newColInput}
              onChange={e => setNewColInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCustomColumn()}
              placeholder="Enter attribute column name (e.g. Specific_Gravity, Soil_Type, Owner_Phone)..."
              className="flex-1 min-w-[260px] py-2.5 px-4 rounded-xl border border-white/10 bg-[#141414] text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#c9a063] focus:ring-1 focus:ring-[#c9a063]/30 transition-all"
            />
            <button
              onClick={handleAddCustomColumn}
              className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold uppercase tracking-wider transition-colors border border-white/10"
            >
              + Add Column
            </button>
          </div>

          {/* Active Columns */}
          <div className="flex flex-wrap gap-2 p-4 bg-[#141414]/80 rounded-xl border border-white/5 min-h-14 items-center">
            {customColumns.map(col => (
              <span
                key={col}
                className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-white/90 shadow-xs"
              >
                {col}
                <button
                  onClick={() => handleRemoveCustomColumn(col)}
                  className="text-white/40 hover:text-rose-400 font-bold ml-1 transition-colors"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4 pt-3">
            <label className="flex items-center gap-2.5 text-xs font-medium text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSamples}
                onChange={e => setIncludeSamples(e.target.checked)}
                className="rounded border-white/20 bg-[#141414] text-[#c9a063] focus:ring-[#c9a063]/30"
              />
              Include mock record rows in generated CSV
            </label>

            <button
              onClick={handleDownloadCustomTemplate}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-widest shadow-lg shadow-[#c9a063]/10 transition-all"
            >
              <Download className="w-4 h-4" /> Download Configured Schema ({customColumns.length} cols)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
