import React, { useState } from 'react';
import {
  Download,
  FolderArchive,
  Upload,
  FileText,
  Eye,
  FileSpreadsheet
} from 'lucide-react';
import { TEMPLATES, DATA_DICTIONARY, buildAllTemplatesZip } from '../lib/templates';
import { downloadBlob, readZip } from '../lib/zip';
import { toCSVtext, csvEnc, extractAllFeaturesFromZip } from '../lib/formats';
import { AppTabId } from './Navigation';

interface HomeTemplatesTabProps {
  setActiveTab?: (tab: AppTabId) => void;
  workingZone?: string;
  localLandUnitPreset?: string;
  customBighaM2?: number;
  customKathaPerBigha?: number;
}

export const HomeTemplatesTab: React.FC<HomeTemplatesTabProps> = ({
  setActiveTab,
  workingZone = '45N'
}) => {
  const [activeSection, setActiveSection] = useState<'templates' | 'archive' | 'custom'>('templates');
  const [customColumns, setCustomColumns] = useState<string[]>([
    'Point_ID',
    'Longitude',
    'Latitude',
    'Elevation_m',
    'Feature_Code',
    'Remarks'
  ]);
  const [newColInput, setNewColInput] = useState('');
  const [includeSamples, setIncludeSamples] = useState(true);

  // Archive inspector state
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
    downloadBlob(zip, 'GeoStudio_Templates.zip', 'application/zip');
  };

  const handleDownloadDataDictionary = () => {
    const cols = ['Template_Category', 'Column_Name', 'Description'];
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
      if (c.toLowerCase().includes('elev') || c.toLowerCase().includes('z')) return '142.50';
      if (c.toLowerCase().includes('id')) return 'PT-101';
      return 'Sample';
    });
    const rows = includeSamples ? [sampleRow, sampleRow] : [];
    downloadBlob(csvEnc(toCSVtext(customColumns, rows)), 'custom_survey_template.csv', 'text/csv;charset=utf-8');
  };

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
      setZipStatus(`Extracted ${list.length} files (${totalFeats} total features) from ${file.name}`);
    } catch (err: any) {
      setZipStatus(`Failed to extract archive: ${err.message}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Minimal Header */}
      <div className="pt-2 pb-2 space-y-1">
        <h1 className="text-2xl sm:text-3xl font-serif italic text-white tracking-tight">
          Precision Geodesy & Survey Workspace
        </h1>
        <p className="text-xs sm:text-sm text-white/50">
          Standardized geodetic CSV templates, ZIP archive inspection, and custom survey schema generation.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] pb-1">
        <button
          onClick={() => setActiveSection('templates')}
          className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeSection === 'templates'
              ? 'border-[#c9a063] text-white'
              : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          Templates
        </button>
        <button
          onClick={() => setActiveSection('archive')}
          className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeSection === 'archive'
              ? 'border-[#c9a063] text-white'
              : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          Archive Inspector
        </button>
        <button
          onClick={() => setActiveSection('custom')}
          className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeSection === 'custom'
              ? 'border-[#c9a063] text-white'
              : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          Schema Builder
        </button>
      </div>

      {/* SECTION 2: TEMPLATES */}
      {activeSection === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-white/50">
              Standardized CSV templates for cadastral surveys, drilling logs, GNSS benchmarks, and leveling sheets.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadDataDictionary}
                className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white text-xs border border-white/[0.06] transition-colors"
              >
                Data Dictionary
              </button>
              <button
                onClick={handleDownloadAllZip}
                className="px-3 py-1.5 rounded-lg bg-[#c9a063]/10 hover:bg-[#c9a063]/20 text-[#c9a063] text-xs font-medium border border-[#c9a063]/25 transition-colors flex items-center gap-1.5"
              >
                <FolderArchive className="w-3.5 h-3.5" />
                Download All (.zip)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.keys(TEMPLATES).map(key => {
              const t = TEMPLATES[key];
              return (
                <div
                  key={key}
                  className="p-4 rounded-xl border border-white/[0.06] bg-[#111111] flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-white capitalize">
                        {key.replace(/_/g, ' ')}
                      </h4>
                      <span className="text-[10px] text-white/40 font-mono">
                        {t.cols.length} fields
                      </span>
                    </div>
                    <p className="text-[11px] text-white/40 line-clamp-2">
                      {t.description}
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {t.cols.slice(0, 3).map(c => (
                        <span
                          key={c}
                          className="text-[10px] bg-white/[0.04] px-1.5 py-0.5 rounded text-white/50 font-mono"
                        >
                          {c}
                        </span>
                      ))}
                      {t.cols.length > 3 && (
                        <span className="text-[10px] text-white/30 font-mono py-0.5">
                          +{t.cols.length - 3}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 mt-3 border-t border-white/[0.06]">
                    <button
                      onClick={() => handleDownloadSingle(key)}
                      className="text-xs text-[#c9a063] hover:text-[#e0ba7e] flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Download CSV
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: ARCHIVE INSPECTOR */}
      {activeSection === 'archive' && (
        <div className="space-y-4">
          <label className="flex flex-col items-center justify-center p-8 border border-dashed border-white/[0.12] hover:border-[#c9a063]/50 rounded-xl cursor-pointer bg-[#111111] transition-colors">
            <Upload className="w-6 h-6 text-[#c9a063] mb-2" />
            <span className="text-xs font-medium text-white">
              Upload ZIP or KMZ Archive
            </span>
            <span className="text-[11px] text-white/40 mt-0.5">
              Client-side in-memory decompressor for geospatial shapefiles, KML, and tables
            </span>
            <input
              type="file"
              accept=".zip,.kmz"
              onChange={handleZipInspectUpload}
              className="hidden"
            />
          </label>

          {zipStatus && (
            <div className="p-3 bg-white/[0.04] border border-white/[0.06] text-xs text-white/70 rounded-lg">
              {zipStatus}
            </div>
          )}

          {zipFilesList.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-white/70">
                Contained Files ({zipFilesList.length})
              </div>
              <div className="border border-white/[0.06] rounded-lg overflow-hidden bg-[#111111]">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-white/40 text-[10px]">
                      <th className="py-2 px-3">File Name</th>
                      <th className="py-2 px-3">Size</th>
                      <th className="py-2 px-3">Features</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {zipFilesList.map((f, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="py-2 px-3 text-white/80 font-sans flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-[#c9a063]" />
                          {f.name}
                        </td>
                        <td className="py-2 px-3 text-white/40">{(f.size / 1024).toFixed(1)} KB</td>
                        <td className="py-2 px-3 text-white/60">
                          {f.featCount > 0 ? `${f.featCount} parsed` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right space-x-2">
                          <button
                            onClick={() => {
                              const dec = new TextDecoder();
                              setPreviewContent({ name: f.name, text: dec.decode(f.bytes) });
                            }}
                            className="px-2 py-0.5 bg-white/[0.04] hover:bg-white/[0.08] text-white/70 rounded text-[10px] transition-colors inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" /> View
                          </button>
                          <button
                            onClick={() => downloadBlob(f.bytes, f.name.split('/').pop() || f.name)}
                            className="px-2 py-0.5 bg-[#c9a063]/10 hover:bg-[#c9a063]/20 text-[#c9a063] rounded text-[10px] transition-colors inline-flex items-center gap-1"
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
                <div className="p-4 bg-[#111111] rounded-xl border border-white/[0.06] space-y-2 mt-2">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-1">
                    <span className="text-xs font-mono text-[#c9a063]">{previewContent.name}</span>
                    <button
                      onClick={() => setPreviewContent(null)}
                      className="text-white/40 hover:text-white text-xs"
                    >
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
      )}

      {/* SECTION 4: SCHEMA BUILDER */}
      {activeSection === 'custom' && (
        <div className="space-y-4 max-w-2xl bg-[#111111] p-6 rounded-xl border border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Custom Survey Schema Builder
            </h3>
            <p className="text-xs text-white/40 mt-0.5">
              Define column headers for custom field instruments, geological logs, or cadastral registers.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newColInput}
                onChange={e => setNewColInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCustomColumn()}
                placeholder="Enter column name (e.g. Soil_Type, Owner_Name)..."
                className="flex-1 py-1.5 px-3 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white placeholder-white/30 text-xs focus:outline-none focus:border-[#c9a063]"
              />
              <button
                onClick={handleAddCustomColumn}
                className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-medium transition-colors border border-white/[0.08]"
              >
                Add Field
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 p-3 bg-white/[0.02] rounded-lg border border-white/[0.04] min-h-12 items-center">
              {customColumns.map(col => (
                <span
                  key={col}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.04] border border-white/[0.06] rounded-md text-xs font-mono text-white/80"
                >
                  {col}
                  <button
                    onClick={() => handleRemoveCustomColumn(col)}
                    className="text-white/40 hover:text-rose-400 ml-1"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSamples}
                  onChange={e => setIncludeSamples(e.target.checked)}
                  className="rounded border-white/20 bg-[#141414] text-[#c9a063]"
                />
                Include sample rows
              </label>

              <button
                onClick={handleDownloadCustomTemplate}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV ({customColumns.length} fields)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
