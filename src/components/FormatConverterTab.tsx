import React, { useState, useRef } from 'react';
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
  Trash2,
  Play,
  Check,
  X,
  FileDown,
  Sparkles,
  Sliders,
  Filter,
  Layers2
} from 'lucide-react';
import {
  parseCSV,
  csvToFeatures,
  kmlBuild,
  featuresToKMZ,
  dxfBuild,
  geoJsonBuild,
  gpxBuild,
  wktBuild,
  buildExcelZip,
  toCSVtext,
  csvEnc,
  buildShapefileZip,
  extractAllFeaturesFromZip,
  osmXmlParse
} from '../lib/formats';
import { validateFeatures } from '../lib/qa';
import { downloadBlob, readZip, zipFiles, ZipFileEntry } from '../lib/zip';
import { GeoFeature, QAResult } from '../types';
import { VectorRadarMap } from './VectorRadarMap';
import { deduplicateFeatures } from '../lib/deduplication';
import { useToast } from '../context/ToastContext';
import { parseImportFile } from '../lib/parseClient';

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

interface BatchQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  srcFormat: string;
  targetFormat: string;
  status: 'pending' | 'converting' | 'completed' | 'error';
  featureCount: number;
  resultData?: Uint8Array;
  resultName?: string;
  mimeType?: string;
  error?: string;
  features?: GeoFeature[];
}

export const FormatConverterTab: React.FC<FormatConverterTabProps> = ({ workingZone }) => {
  const toast = useToast();

  // Navigation: Batch Queue vs Single File Inspector
  const [activeMode, setActiveMode] = useState<'batch' | 'inspector'>('batch');

  // Global Settings
  const [globalTargetFormat, setGlobalTargetFormat] = useState<string>('dxf');
  const [autoDeduplicate, setAutoDeduplicate] = useState<boolean>(true);
  const [is3D, setIs3D] = useState(true);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch Queue State
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);
  const [batchSummaryMsg, setBatchSummaryMsg] = useState<string | null>(null);

  // Single Inspector State
  const [loadedFeatures, setLoadedFeatures] = useState<GeoFeature[]>([]);
  const [inspectorFileName, setInspectorFileName] = useState<string>('survey_export');
  const [inspectorTargetFormat, setInspectorTargetFormat] = useState<string>('kml');
  const [qaReport, setQaReport] = useState<QAResult | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [archiveFiles, setArchiveFiles] = useState<ExtractedArchiveFile[]>([]);
  const [previewFile, setPreviewFile] = useState<{ name: string; text: string } | null>(null);

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  // Extract features from any raw file.
  //
  // Delegates to the central parser rather than repeating its format chain.
  // This function previously reimplemented the same eleven parsers the bridge
  // already dispatches to - a second, extension-only detector that could drift
  // out of step with the signature-based one. Routing through the bridge also
  // means large files here get the same worker treatment as the global import.
  const parseFileToFeatures = async (file: File): Promise<{ feats: GeoFeature[]; format: string }> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'dat';

    // Archives can hold several datasets; the converter flattens them all,
    // which the single-result bridge contract does not express.
    if (ext === 'zip' || ext === 'kmz') {
      const buf = await file.arrayBuffer();
      const feats: GeoFeature[] = [];
      const extractedDatasets = await extractAllFeaturesFromZip(buf, zNum, isSouth);
      extractedDatasets.forEach(ds => feats.push(...ds.features));
      return { feats, format: ext };
    }

    const { result } = await parseImportFile(file, workingZone);
    return { feats: result.features || [], format: result.formatId || ext };
  };

  // Convert parsed features into binary/text payload
  const convertFeaturesToTarget = (feats: GeoFeature[], baseName: string, targetFmt: string): { data: Uint8Array; fileName: string; mime: string } => {
    if (targetFmt === 'shp') {
      const zipBytes = buildShapefileZip(feats, baseName, zNum, isSouth);
      return { data: zipBytes, fileName: `${baseName}_shp.zip`, mime: 'application/zip' };
    } else if (targetFmt === 'kmz') {
      const kmzList = featuresToKMZ(feats, '#c9a063', { zone: zNum, south: isSouth });
      const first = kmzList[0]?.bytes || new Uint8Array();
      return { data: first, fileName: `${baseName}.kmz`, mime: 'application/vnd.google-earth.kmz' };
    } else if (targetFmt === 'kml') {
      const kml = kmlBuild(feats, baseName, is3D, zNum, isSouth);
      return { data: new TextEncoder().encode(kml), fileName: `${baseName}.kml`, mime: 'application/vnd.google-earth.kml+xml' };
    } else if (targetFmt === 'dxf') {
      const res = dxfBuild(feats, 'utm', zNum, isSouth, true);
      return { data: new TextEncoder().encode(res.dxf), fileName: `${baseName}.dxf`, mime: 'application/dxf' };
    } else if (targetFmt === 'geojson') {
      const gj = geoJsonBuild(feats, zNum, isSouth);
      return { data: new TextEncoder().encode(gj), fileName: `${baseName}.geojson`, mime: 'application/geo+json' };
    } else if (targetFmt === 'gpx') {
      const gpx = gpxBuild(feats, baseName, is3D, zNum, isSouth);
      return { data: new TextEncoder().encode(gpx), fileName: `${baseName}.gpx`, mime: 'application/gpx+xml' };
    } else if (targetFmt === 'wkt') {
      const wkt = wktBuild(feats, zNum, isSouth);
      return { data: new TextEncoder().encode(wkt), fileName: `${baseName}.wkt`, mime: 'text/plain' };
    } else if (targetFmt === 'xlsx') {
      const cols = ['Feature_Name', 'Geometry_Type', 'Coordinates'];
      const rows = feats.map(f => [
        f.name || 'Unnamed',
        f.geom.toUpperCase(),
        f.pts.map(p => `${p.a},${p.b}`).join(' | ')
      ]);
      const zip = buildExcelZip(cols, rows, 'Features');
      return { data: zip, fileName: `${baseName}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    } else {
      // CSV
      const cols = ['Feature_Name', 'Geometry_Type', 'Point_Index', 'Coord_A', 'Coord_B'];
      const rows: any[] = [];
      feats.forEach(f => {
        f.pts.forEach((p, idx) => {
          rows.push([f.name || 'Unnamed', f.geom, idx + 1, p.a, p.b]);
        });
      });
      const txt = toCSVtext(cols, rows);
      return { data: csvEnc(txt), fileName: `${baseName}.csv`, mime: 'text/csv;charset=utf-8' };
    }
  };

  // Add files to Batch Queue
  const handleAddFilesToQueue = (files: FileList | File[]) => {
    const newItems: BatchQueueItem[] = [];
    Array.from(files).forEach((file, i) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'dat';
      newItems.push({
        id: `batch_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        file,
        name: file.name,
        size: file.size,
        srcFormat: ext,
        targetFormat: globalTargetFormat,
        status: 'pending',
        featureCount: 0
      });
    });

    setBatchQueue(prev => [...prev, ...newItems]);
    setBatchSummaryMsg(`Added ${newItems.length} file(s) to the conversion queue.`);
  };

  // Handle Drag and Drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFilesToQueue(e.dataTransfer.files);
    }
  };

  // Execute Batch Processing
  const handleRunBatchProcessing = async () => {
    if (batchQueue.length === 0) return;
    setIsBatchProcessing(true);
    setBatchSummaryMsg('Batch conversion engine processing queue...');

    let completedCount = 0;
    let errCount = 0;

    const updatedQueue = [...batchQueue];

    for (let i = 0; i < updatedQueue.length; i++) {
      const item = updatedQueue[i];
      if (item.status === 'completed' && item.resultData) continue; // skip already converted

      // Set converting
      updatedQueue[i] = { ...item, status: 'converting', error: undefined };
      setBatchQueue([...updatedQueue]);

      try {
        let { feats, format } = await parseFileToFeatures(item.file);
        if (feats.length === 0) {
          throw new Error('No spatial features could be extracted.');
        }

        if (autoDeduplicate) {
          const dedupeRes = deduplicateFeatures(feats, { distanceToleranceMeters: 0.05 });
          feats = dedupeRes.cleanFeatures;
        }

        const baseName = item.name.replace(/\.[^/.]+$/, '');
        const { data, fileName, mime } = convertFeaturesToTarget(feats, baseName, item.targetFormat);

        updatedQueue[i] = {
          ...item,
          status: 'completed',
          srcFormat: format,
          featureCount: feats.length,
          resultData: data,
          resultName: fileName,
          mimeType: mime,
          features: feats
        };
        completedCount++;
      } catch (err: any) {
        updatedQueue[i] = {
          ...item,
          status: 'error',
          error: err.message || 'Conversion failed'
        };
        errCount++;
      }

      setBatchQueue([...updatedQueue]);
    }

    setIsBatchProcessing(false);
    setBatchSummaryMsg(`Batch complete: ${completedCount} converted successfully${errCount > 0 ? `, ${errCount} error(s)` : ''}.`);
  };

  // Download All as Combined ZIP Archive
  const handleDownloadAllZip = () => {
    const readyItems = batchQueue.filter(item => item.status === 'completed' && item.resultData);
    if (readyItems.length === 0) {
      toast.showWarning('No converted files ready to download.');
      return;
    }

    try {
      const zipEntries: ZipFileEntry[] = readyItems.map(item => ({
        name: item.resultName || `${item.name}.${item.targetFormat}`,
        data: item.resultData!
      }));

      const zipBytes = zipFiles(zipEntries);
      downloadBlob(zipBytes, `Batch_Converted_Geomatics_${new Date().toISOString().slice(0, 10)}.zip`, 'application/zip');
      setBatchSummaryMsg(`Downloaded master ZIP containing ${readyItems.length} converted files.`);
      toast.showSuccess(`Downloaded master ZIP containing ${readyItems.length} converted files.`);
    } catch (err: any) {
      toast.showError(`Could not build batch ZIP: ${err.message}`);
    }
  };

  // Single Item Actions
  const handleDownloadSingleBatchItem = (item: BatchQueueItem) => {
    if (!item.resultData) return;
    downloadBlob(item.resultData, item.resultName || `${item.name}.${item.targetFormat}`, item.mimeType || 'application/octet-stream');
  };

  const handleInspectBatchItem = (item: BatchQueueItem) => {
    if (item.features && item.features.length > 0) {
      setLoadedFeatures(item.features);
      setInspectorFileName(item.name.replace(/\.[^/.]+$/, ''));
      const qa = validateFeatures(item.features, workingZone);
      setQaReport(qa);
      setActiveMode('inspector');
    }
  };

  const handleRemoveQueueItem = (id: string) => {
    setBatchQueue(prev => prev.filter(it => it.id !== id));
  };

  const handleApplyGlobalFormatToAll = (fmt: string) => {
    setGlobalTargetFormat(fmt);
    setBatchQueue(prev => prev.map(it => ({ ...it, targetFormat: fmt, status: 'pending', resultData: undefined })));
  };

  // Single File Inspector Upload Handler
  const handleSingleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      setInspectorFileName(file.name.replace(/\.[^/.]+$/, ''));
      setArchiveFiles([]);
      setPreviewFile(null);

      let feats: GeoFeature[] = [];

      if (ext === 'zip' || ext === 'kmz') {
        const buf = await file.arrayBuffer();
        const extractedDatasets = await extractAllFeaturesFromZip(buf, zNum, isSouth);
        const filesMap = await readZip(buf);
        const extractedList: ExtractedArchiveFile[] = [];

        for (const entryName of Object.keys(filesMap)) {
          const entryExt = entryName.split('.').pop()?.toLowerCase() || '';
          const bytes = filesMap[entryName];
          if (!bytes || !bytes.length) continue;

          const matchingDataset = extractedDatasets.find(ds => ds.fileName === entryName || ds.fileName.endsWith(entryName));
          extractedList.push({
            name: entryName,
            size: bytes.length,
            ext: entryExt,
            bytes,
            featureCount: matchingDataset ? matchingDataset.features.length : 0
          });
        }

        extractedDatasets.forEach(ds => feats.push(...ds.features));
        setArchiveFiles(extractedList);
        setStatusMsg(`Extracted ${extractedList.length} archive entries from ${file.name}, parsed ${feats.length} features.`);
      } else {
        const parsed = await parseFileToFeatures(file);
        feats = parsed.feats;
        setStatusMsg(`Loaded ${feats.length} features from ${file.name}`);
      }

      setLoadedFeatures(feats);
      const qa = validateFeatures(feats, workingZone);
      setQaReport(qa);
      toast.showSuccess(`Loaded ${feats.length} spatial features from ${file.name}`);
    } catch (err: any) {
      setStatusMsg(`Error reading file: ${err.message}`);
      toast.showError(`Error reading file: ${err.message}`);
    }
  };

  const handleDeduplicateLoadedFeatures = () => {
    if (!loadedFeatures.length) {
      toast.showWarning('No features currently loaded to deduplicate.');
      return;
    }
    const { cleanFeatures, summary } = deduplicateFeatures(loadedFeatures, {
      distanceToleranceMeters: 0.05
    });
    setLoadedFeatures(cleanFeatures);
    const qa = validateFeatures(cleanFeatures, workingZone);
    setQaReport(qa);

    if (summary.removedCount > 0 || summary.details.length > 0) {
      toast.showSuccess(
        `Deduplication complete: Cleaned ${summary.removedCount} duplicate geometry/features. (${cleanFeatures.length} active)`
      );
    } else {
      toast.showInfo('No duplicate features or vertices detected in dataset.');
    }
  };

  const handleSingleExport = () => {
    if (!loadedFeatures.length) {
      toast.showWarning('No features loaded to convert.');
      return;
    }
    const { data, fileName, mime } = convertFeaturesToTarget(loadedFeatures, inspectorFileName, inspectorTargetFormat);
    downloadBlob(data, fileName, mime);
    toast.showSuccess(`Exported ${inspectorFileName} as ${inspectorTargetFormat.toUpperCase()}`);
  };

  // Queue Statistics
  const totalQueueSize = batchQueue.reduce((s, it) => s + it.size, 0);
  const completedQueueCount = batchQueue.filter(it => it.status === 'completed').length;
  const errorQueueCount = batchQueue.filter(it => it.status === 'error').length;
  const totalFeaturesInQueue = batchQueue.reduce((s, it) => s + it.featureCount, 0);

  return (
    <div className="space-y-6">
      {/* 1. Header & Mode Switcher */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium font-mono">
              High-Throughput Geomatics Engine
            </p>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              Batch Format Converter & GIS Stream Processor
            </h3>
            <p className="text-xs text-white/50 mt-1">
              Simultaneously convert multi-file queues between AutoCAD DXF, ESRI Shapefile, Google Earth KML/KMZ, GeoJSON, GPX, and WKT.
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center bg-[#141414] p-1 rounded-xl border border-white/10 shrink-0">
            <button
              onClick={() => setActiveMode('batch')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeMode === 'batch'
                  ? 'bg-[#c9a063] text-black shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Layers2 className="w-3.5 h-3.5" /> Batch Queue ({batchQueue.length})
            </button>
            <button
              onClick={() => setActiveMode('inspector')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeMode === 'inspector'
                  ? 'bg-[#c9a063] text-black shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Single-File Inspector
            </button>
          </div>
        </div>

        {/* 2. BATCH MODE COCKPIT */}
        {activeMode === 'batch' && (
          <div className="space-y-6">
            {/* Global Controls & File Dropzone */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Drag and Drop Zone */}
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`lg:col-span-2 p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2 ${
                  isDragOver
                    ? 'border-[#c9a063] bg-[#c9a063]/10 scale-[1.01]'
                    : 'border-white/15 bg-[#141414]/80 hover:border-[#c9a063]/50 hover:bg-[#181818]'
                }`}
              >
                <div className="p-3 bg-[#c9a063]/10 border border-[#c9a063]/20 rounded-2xl">
                  <Upload className="w-6 h-6 text-[#c9a063]" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">
                    Drag & Drop Multiple Survey/GIS Files Here
                  </span>
                  <span className="text-[11px] text-white/40">
                    Supports .dxf, .shp, .kml, .kmz, .geojson, .csv, .gpx, .wkt, .zip archives
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".zip,.kmz,.csv,.tsv,.xyz,.txt,.kml,.dxf,.geojson,.json,.gpx,.wkt,.shp,.mif,.xml,.landxml,.osm,.str,.dem,.asc,.tfw,.wld"
                  onChange={e => e.target.files && handleAddFilesToQueue(e.target.files)}
                  className="hidden"
                />
              </div>

              {/* Global Output Format Setting & Trigger */}
              <div className="bg-[#141414] p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-white/80 uppercase font-mono block">
                    Global Output Format
                  </label>
                  <select
                    value={globalTargetFormat}
                    onChange={e => handleApplyGlobalFormatToAll(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl border border-white/10 bg-[#0f0f0f] text-white text-xs font-medium focus:outline-none focus:border-[#c9a063]"
                  >
                    <option value="dxf">AutoCAD DXF (.dxf)</option>
                    <option value="shp">ESRI Shapefile Bundle (.zip)</option>
                    <option value="kml">Google Earth KML (.kml)</option>
                    <option value="kmz">Google Earth KMZ Archive (.kmz)</option>
                    <option value="geojson">GeoJSON (.geojson)</option>
                    <option value="gpx">GPS Exchange Format (.gpx)</option>
                    <option value="wkt">Well-Known Text (.wkt)</option>
                    <option value="xlsx">Excel Workbook (.xlsx)</option>
                    <option value="csv">Survey CSV (.csv)</option>
                  </select>

                  <div className="flex flex-col gap-1.5 pt-1">
                    <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={is3D}
                        onChange={e => setIs3D(e.target.checked)}
                        className="accent-[#c9a063] rounded"
                      />
                      Preserve 3D Coordinates (Z Elevation)
                    </label>
                    <label className="flex items-center gap-2 text-xs text-emerald-400/90 cursor-pointer font-medium">
                      <input
                        type="checkbox"
                        checked={autoDeduplicate}
                        onChange={e => setAutoDeduplicate(e.target.checked)}
                        className="accent-emerald-500 rounded"
                      />
                      Auto-Deduplicate Overlapping Geometries
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={handleRunBatchProcessing}
                    disabled={isBatchProcessing || batchQueue.length === 0}
                    className="w-full py-2.5 bg-[#c9a063] hover:bg-[#d6b074] disabled:opacity-40 text-black rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#c9a063]/10"
                  >
                    {isBatchProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Processing Queue...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-black" /> Convert All Files ({batchQueue.length})
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownloadAllZip}
                    disabled={completedQueueCount === 0}
                    className="w-full py-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 border border-white/10 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <FileDown className="w-3.5 h-3.5 text-[#c9a063]" /> Download All as Master ZIP
                  </button>
                </div>
              </div>
            </div>

            {/* Batch Status Bar */}
            {batchSummaryMsg && (
              <div className="p-3 bg-white/5 border border-white/10 text-xs text-white/80 rounded-xl flex items-center justify-between">
                <span>{batchSummaryMsg}</span>
                <span className="text-[10px] font-mono text-white/40">Datum: UTM Zone {workingZone}</span>
              </div>
            )}

            {/* Batch Queue Metrics Bar */}
            {batchQueue.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block font-mono uppercase">Total In Queue</span>
                  <span className="font-bold font-mono text-white text-sm">
                    {batchQueue.length} files ({(totalQueueSize / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block font-mono uppercase">Converted Ready</span>
                  <span className="font-bold font-mono text-emerald-400 text-sm">
                    {completedQueueCount} / {batchQueue.length}
                  </span>
                </div>
                <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block font-mono uppercase">Total Features Processed</span>
                  <span className="font-bold font-mono text-white text-sm">
                    {totalFeaturesInQueue}
                  </span>
                </div>
                <div className="p-3 bg-[#141414] rounded-xl border border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-white/40 block font-mono uppercase">Queue Actions</span>
                    <button
                      onClick={() => setBatchQueue([])}
                      className="text-rose-400 hover:text-rose-300 font-bold text-xs"
                    >
                      Clear All Queue
                    </button>
                  </div>
                  <Trash2 className="w-4 h-4 text-rose-400/50" />
                </div>
              </div>
            )}

            {/* Batch Queue Items List */}
            {batchQueue.length > 0 ? (
              <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#141414]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#181818] border-b border-white/10 text-white/50 font-mono text-[10px] uppercase">
                        <th className="py-3 px-4">Source File</th>
                        <th className="py-3 px-3">Size</th>
                        <th className="py-3 px-3">Detected Source</th>
                        <th className="py-3 px-3">Target Format</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Features</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {batchQueue.map((item) => (
                        <tr key={item.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4 text-white font-sans font-medium flex items-center gap-2.5">
                            <FileText className="w-4 h-4 text-[#c9a063] shrink-0" />
                            <span className="truncate max-w-[220px]" title={item.name}>
                              {item.name}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-white/40">
                            {(item.size / 1024).toFixed(1)} KB
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded bg-white/5 text-[#c9a063] uppercase text-[10px] font-bold">
                              {item.srcFormat}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <select
                              value={item.targetFormat}
                              onChange={e => {
                                const newFmt = e.target.value;
                                setBatchQueue(prev =>
                                  prev.map(it =>
                                    it.id === item.id
                                      ? { ...it, targetFormat: newFmt, status: 'pending', resultData: undefined }
                                      : it
                                  )
                                );
                              }}
                              disabled={item.status === 'converting'}
                              className="py-1 px-2 rounded bg-black/60 border border-white/10 text-white text-[11px] uppercase font-mono"
                            >
                              <option value="dxf">DXF</option>
                              <option value="shp">SHP ZIP</option>
                              <option value="kml">KML</option>
                              <option value="kmz">KMZ</option>
                              <option value="geojson">GeoJSON</option>
                              <option value="gpx">GPX</option>
                              <option value="wkt">WKT</option>
                              <option value="xlsx">XLSX</option>
                              <option value="csv">CSV</option>
                            </select>
                          </td>
                          <td className="py-3 px-3">
                            {item.status === 'converting' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 text-[10px] font-bold uppercase">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Converting
                              </span>
                            )}
                            {item.status === 'completed' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">
                                <Check className="w-3 h-3" /> Ready
                              </span>
                            )}
                            {item.status === 'pending' && (
                              <span className="px-2 py-0.5 rounded bg-white/5 text-white/50 text-[10px] uppercase">
                                Queued
                              </span>
                            )}
                            {item.status === 'error' && (
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold uppercase" title={item.error}>
                                Error
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-white/70">
                            {item.featureCount > 0 ? (
                              <span className="text-emerald-400 font-bold">{item.featureCount}</span>
                            ) : (
                              <span className="text-white/30">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right space-x-1.5">
                            {item.status === 'completed' && (
                              <>
                                <button
                                  onClick={() => handleInspectBatchItem(item)}
                                  className="p-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-lg transition-colors"
                                  title="Inspect in 2D Vector Radar"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDownloadSingleBatchItem(item)}
                                  className="p-1.5 bg-[#c9a063]/20 hover:bg-[#c9a063]/30 text-[#c9a063] rounded-lg transition-colors"
                                  title="Download converted file"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleRemoveQueueItem(item.id)}
                              className="p-1.5 text-white/30 hover:text-rose-400 rounded-lg transition-colors"
                              title="Remove from queue"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-8 bg-[#141414] rounded-2xl border border-white/5 text-center space-y-2">
                <FolderArchive className="w-8 h-8 text-white/30 mx-auto" />
                <p className="text-xs text-white/60 font-semibold">Queue is empty</p>
                <p className="text-[11px] text-white/40">
                  Drag and drop files or click above to populate the batch conversion queue.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 3. SINGLE FILE INSPECTOR & RADAR MODE */}
        {activeMode === 'inspector' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="text-xs font-medium text-white/60 mb-2 block">Upload File / Archive</label>
                <label className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs font-semibold cursor-pointer transition-colors border border-dashed border-white/10 hover:border-[#c9a063]/50">
                  <Upload className="w-4 h-4 text-[#c9a063]" /> Choose Single File (.zip, .shp, .kml, .dxf)
                  <input
                    type="file"
                    accept=".zip,.kmz,.csv,.kml,.dxf,.geojson,.json,.gpx,.wkt,.shp,.mif,.landxml"
                    onChange={handleSingleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="text-xs font-medium text-white/60 mb-2 block">Target Output Format</label>
                <select
                  value={inspectorTargetFormat}
                  onChange={e => setInspectorTargetFormat(e.target.value)}
                  className="w-full py-2.5 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-sm font-medium focus:outline-none focus:border-[#c9a063]"
                >
                  <option value="dxf">AutoCAD DXF (.dxf)</option>
                  <option value="shp">ESRI Shapefile Bundle (.zip)</option>
                  <option value="kml">Google Earth KML (.kml)</option>
                  <option value="kmz">Google Earth KMZ Archive (.kmz)</option>
                  <option value="geojson">GeoJSON (.geojson)</option>
                  <option value="gpx">GPS Exchange Format (.gpx)</option>
                  <option value="wkt">Well-Known Text (.wkt)</option>
                  <option value="xlsx">Excel Workbook (.xlsx)</option>
                  <option value="csv">CSV Spreadsheet (.csv)</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleDeduplicateLoadedFeatures}
                  disabled={!loadedFeatures.length}
                  className="py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-30 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                  title="Remove duplicate features and simplify redundant vertices"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#c9a063]" /> Deduplicate
                </button>

                <button
                  onClick={handleSingleExport}
                  disabled={!loadedFeatures.length}
                  className="flex-1 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] disabled:opacity-30 text-black rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#c9a063]/10"
                >
                  <Download className="w-4 h-4" /> Convert & Download
                </button>
              </div>
            </div>

            {statusMsg && (
              <div className="p-3.5 bg-white/5 border border-white/10 text-xs text-white/80 rounded-xl flex items-center justify-between">
                <span>{statusMsg}</span>
              </div>
            )}

            {/* QA Pre-Flight Checklist */}
            {qaReport && (
              <div className="bg-[#141414] rounded-2xl p-5 border border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-serif italic text-white flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-[#c9a063]" />
                    QA Pre-Flight Validation Report ({inspectorFileName})
                  </h4>
                  <span className="text-[10px] uppercase font-mono text-white/40">Zone UTM {workingZone}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                    <span className="text-[10px] text-white/40 block uppercase font-mono">Features</span>
                    <span className="font-bold font-mono text-white text-sm">{loadedFeatures.length}</span>
                  </div>
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                    <span className="text-[10px] text-white/40 block uppercase font-mono">Errors</span>
                    <span className={`font-bold font-mono text-sm ${qaReport.nErr ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {qaReport.nErr}
                    </span>
                  </div>
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                    <span className="text-[10px] text-white/40 block uppercase font-mono">Warnings</span>
                    <span className={`font-bold font-mono text-sm ${qaReport.nWarn ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {qaReport.nWarn}
                    </span>
                  </div>
                  <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                    <span className="text-[10px] text-white/40 block uppercase font-mono">Pass Status</span>
                    <span className="font-bold font-mono text-emerald-400 text-sm">
                      {qaReport.nErr === 0 ? 'CLEARED FOR CAD' : 'REVIEW NEEDED'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Vector Radar Map */}
            {loadedFeatures.length > 0 && (
              <div className="bg-[#141414] rounded-2xl p-5 border border-white/5">
                <VectorRadarMap
                  features={loadedFeatures}
                  zone={zNum}
                  south={isSouth}
                  onFeaturesChange={setLoadedFeatures}
                  title={`Geometry Radar: ${inspectorFileName}`}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
