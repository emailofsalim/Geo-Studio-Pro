import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  FileCode,
  Globe,
  MapPin,
  FileSpreadsheet,
  Compass,
  Layers,
  Spline,
  FileText,
  Activity,
  FolderArchive,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Eye,
  Info,
  ShieldCheck,
  Check,
  Search,
  Sliders,
  ChevronRight,
  Database
} from 'lucide-react';
import {
  ExportFormatId,
  SUPPORTED_EXPORT_FORMATS,
  FormatMeta,
  DetectedImportResult,
  detectAndParseGeospatialFile,
  executeUniversalExport,
  UniversalExportOptions
} from '../lib/universalDataBridge';
import { GeoFeature, GisLayer, SurveyWaypoint, CadastralParcel, PhotoLandmark } from '../types';
import { useToast } from '../context/ToastContext';

interface UniversalDataBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'import' | 'export';
  initialFormat?: ExportFormatId;
  activeAppId: string;
  activeAppName?: string;
  workingZone: string;
  features?: GeoFeature[];
  featuresOverride?: GeoFeature[];
  layers?: GisLayer[];
  layersOverride?: GisLayer[];
  waypoints?: SurveyWaypoint[];
  waypointsOverride?: SurveyWaypoint[];
  parcels?: CadastralParcel[];
  parcelsOverride?: CadastralParcel[];
  landmarks?: PhotoLandmark[];
  landmarksOverride?: PhotoLandmark[];
  onImportComplete?: (result: DetectedImportResult, destinationApp: string) => void;
}

export const UniversalDataBridgeModal: React.FC<UniversalDataBridgeModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'export',
  initialFormat = 'geojson',
  activeAppId,
  activeAppName = 'Active Tool',
  workingZone,
  features = [],
  featuresOverride,
  layers = [],
  layersOverride,
  waypoints = [],
  waypointsOverride,
  parcels = [],
  parcelsOverride,
  landmarks = [],
  landmarksOverride,
  onImportComplete
}) => {
  const toast = useToast();
  const [mode, setMode] = useState<'import' | 'export'>(initialMode);

  // Sync mode and format when modal is opened
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      if (initialFormat) {
        setSelectedFormat(initialFormat);
      }
    }
  }, [isOpen, initialMode, initialFormat]);

  const finalFeatures = featuresOverride !== undefined ? featuresOverride : features;
  const finalLayers = layersOverride !== undefined ? layersOverride : layers;
  const finalWaypoints = waypointsOverride !== undefined ? waypointsOverride : waypoints;
  const finalParcels = parcelsOverride !== undefined ? parcelsOverride : parcels;
  const finalLandmarks = landmarksOverride !== undefined ? landmarksOverride : landmarks;

  // Export State
  const [selectedFormat, setSelectedFormat] = useState<ExportFormatId>(initialFormat || 'geojson');
  const [fileName, setFileName] = useState<string>(() => {
    const d = new Date().toISOString().slice(0, 10);
    return `${activeAppId}_export_${d}`;
  });
  const [coordSystem, setCoordSystem] = useState<'wgs84' | 'utm'>('wgs84');
  const [exportZone, setExportZone] = useState<string>(workingZone || '45N');
  const [include3dZ, setInclude3dZ] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [formatSearch, setFormatSearch] = useState<string>('');

  // Import State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectedResult, setDetectedResult] = useState<DetectedImportResult | null>(null);
  const [destinationApp, setDestinationApp] = useState<string>(activeAppId || 'gis');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-generate default filename when active app changes
  useEffect(() => {
    const d = new Date().toISOString().slice(0, 10);
    setFileName(`${activeAppId}_export_${d}`);
    setDestinationApp(activeAppId || 'gis');
  }, [activeAppId]);

  // Compute total available feature metrics for export
  const totalFeatureCount = finalFeatures.length > 0 
    ? finalFeatures.length 
    : (finalLayers.reduce((acc, l) => acc + (l.features?.length || 0), 0) || finalWaypoints.length || finalParcels.length || 0);

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  // Process and Auto-Detect format of uploaded file
  const processSelectedFile = async (file: File) => {
    setSelectedFile(file);
    setIsDetecting(true);
    try {
      const result = await detectAndParseGeospatialFile(file, exportZone);
      setDetectedResult(result);
      if (result.suggestedAppDestination && result.suggestedAppDestination !== 'unknown') {
        setDestinationApp(result.suggestedAppDestination);
      }
      toast.showSuccess(`Auto-detected: ${result.formatName} (${result.featureCount} items found)`);
    } catch (err: any) {
      toast.showError(`Auto-detection error: ${err.message}`);
    } finally {
      setIsDetecting(false);
    }
  };

  // Trigger Export
  const handleRunExport = async () => {
    setIsExporting(true);
    try {
      const result = await executeUniversalExport({
        format: selectedFormat,
        fileName: fileName.trim() || 'geostudio_export',
        features: finalFeatures,
        allLayers: finalLayers,
        waypoints: finalWaypoints,
        parcels: finalParcels,
        landmarks: finalLandmarks,
        workingZoneStr: exportZone,
        coordSystem,
        include3dZ
      });

      toast.showSuccess(`Exported ${result.formatName} (${(result.byteCount / 1024).toFixed(1)} KB)`);
      onClose();
    } catch (err: any) {
      toast.showError(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Confirm Import
  const handleConfirmImport = () => {
    if (!detectedResult) return;

    if (detectedResult.formatId === 'project' && detectedResult.projectData) {
      // Full Project Workspace Restore
      try {
        const pd = detectedResult.projectData;
        if (pd.storageDump) {
          Object.entries(pd.storageDump).forEach(([k, v]) => {
            if (typeof v === 'string') localStorage.setItem(k, v);
          });
        }
        toast.showSuccess(`Complete project restored from ${selectedFile?.name}`);
        onClose();
        setTimeout(() => window.location.reload(), 400);
        return;
      } catch (err: any) {
        toast.showError(`Project restore error: ${err.message}`);
        return;
      }
    }

    if (onImportComplete) {
      onImportComplete(detectedResult, destinationApp);
    } else {
      // Default fallback router
      if (destinationApp === 'gis' || destinationApp === 'studio') {
        try {
          const existingLayers = JSON.parse(localStorage.getItem('gis_studio_layers') || '[]');
          const newLayer: GisLayer = {
            id: `layer_${Date.now()}`,
            name: selectedFile?.name.replace(/\.[^.]+$/, '') || 'Imported Layer',
            visible: true,
            color: '#c9a063',
            fillColor: '#c9a063',
            fillOpacity: 0.35,
            strokeWidth: 2,
            geomType: detectedResult.polygonsCount > 0 ? 'polygon' : detectedResult.linesCount > 0 ? 'line' : 'point',
            features: detectedResult.features
          };
          localStorage.setItem('gis_studio_layers', JSON.stringify([newLayer, ...existingLayers]));
          toast.showSuccess(`Imported ${detectedResult.featureCount} feature(s) into GIS Studio layer.`);
        } catch (err: any) {
          toast.showError(`Could not save layer: ${err.message}`);
        }
      } else if (destinationApp === 'gps') {
        try {
          const existingWps: SurveyWaypoint[] = JSON.parse(localStorage.getItem('survey_waypoints') || '[]');
          const newWps: SurveyWaypoint[] = detectedResult.features.map((f, i) => {
            const pt = f.pts[0] || { a: 0, b: 0 };
            return {
              id: f.name || `IMP-${existingWps.length + i + 1}`,
              code: (f.props?.code as string) || 'Imported Point',
              E: (f.props?.utmE as number) || (f.kind === 'en' ? pt.a : 0),
              N: (f.props?.utmN as number) || (f.kind === 'en' ? pt.b : 0),
              Z: (f.props?.elevation as number) || (f.props?.Z as number) || 0,
              lat: f.kind === 'll' ? pt.b : 0,
              lon: f.kind === 'll' ? pt.a : 0,
              acc: (f.props?.acc as number) || 1.0,
              zone: exportZone,
              time: Date.now(),
              remarks: f.props ? JSON.stringify(f.props) : undefined,
              proximityRadius: 5
            };
          });
          localStorage.setItem('survey_waypoints', JSON.stringify([...existingWps, ...newWps]));
          toast.showSuccess(`Added ${newWps.length} waypoint(s) to GPS Surveyor.`);
        } catch (err: any) {
          toast.showError(`Could not save waypoints: ${err.message}`);
        }
      }
    }

    onClose();
  };

  if (!isOpen) return null;

  const currentMeta = SUPPORTED_EXPORT_FORMATS.find(f => f.id === selectedFormat) || SUPPORTED_EXPORT_FORMATS[0];

  const filteredFormats = SUPPORTED_EXPORT_FORMATS.filter(
    f =>
      f.name.toLowerCase().includes(formatSearch.toLowerCase()) ||
      f.extension.toLowerCase().includes(formatSearch.toLowerCase()) ||
      f.category.toLowerCase().includes(formatSearch.toLowerCase()) ||
      f.recommendedFor.toLowerCase().includes(formatSearch.toLowerCase())
  );

  const getFormatIcon = (iconName: string) => {
    switch (iconName) {
      case 'Globe': return <Globe className="w-5 h-5 text-sky-400" />;
      case 'MapPin': return <MapPin className="w-5 h-5 text-red-400" />;
      case 'FolderArchive': return <FolderArchive className="w-5 h-5 text-amber-400" />;
      case 'FileCode': return <FileCode className="w-5 h-5 text-emerald-400" />;
      case 'FileSpreadsheet': return <FileSpreadsheet className="w-5 h-5 text-green-400" />;
      case 'Compass': return <Compass className="w-5 h-5 text-purple-400" />;
      case 'Layers': return <Layers className="w-5 h-5 text-orange-400" />;
      case 'Spline': return <Spline className="w-5 h-5 text-cyan-400" />;
      case 'FileText': return <FileText className="w-5 h-5 text-blue-400" />;
      case 'Activity': return <Activity className="w-5 h-5 text-yellow-400" />;
      default: return <FileCode className="w-5 h-5 text-[#c9a063]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-[#d4d4d4]">
        {/* Top Header Bar */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-[#171717]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#c9a063]/15 border border-[#c9a063]/30 flex items-center justify-center text-[#c9a063] shadow-inner">
              {mode === 'export' ? <Download className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {mode === 'export' ? 'Universal Data Exporter' : 'Universal Data Importer'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-white/80 border border-white/10">
                  {activeAppName}
                </span>
              </div>
              <p className="text-xs text-white/50">
                {mode === 'export'
                  ? 'Select any geomatics or CAD extension to export active workspace data'
                  : 'Drop any survey, CAD, GIS, or GPS file — automatic format detection'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher Tabs */}
            <div className="bg-black/50 p-1 rounded-xl border border-white/10 flex items-center gap-1">
              <button
                onClick={() => setMode('import')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  mode === 'import'
                    ? 'bg-[#c9a063] text-black shadow-md'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import (Auto-Detect)</span>
              </button>
              <button
                onClick={() => setMode('export')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  mode === 'export'
                    ? 'bg-[#c9a063] text-black shadow-md'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export (Choose Format)</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors ml-1"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
          {/* ===================== MODE: EXPORT (CHOOSE EXTENSION / FORMAT) ===================== */}
          {mode === 'export' && (
            <div className="space-y-6">
              {/* Context Summary Banner */}
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs text-white/80">
                  <Database className="w-4 h-4 text-[#c9a063]" />
                  <span>
                    Source Dataset: <strong className="text-white">{activeAppName}</strong>
                  </span>
                  <span className="text-white/40">•</span>
                  <span>
                    Total Items: <strong className="text-emerald-400">{totalFeatureCount}</strong> features / points
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/50">Projection:</span>
                  <span className="px-2 py-0.5 rounded bg-white/10 font-mono text-white text-[11px]">
                    {coordSystem === 'wgs84' ? 'WGS84 Lat/Lon (EPSG:4326)' : `UTM Zone ${exportZone}`}
                  </span>
                </div>
              </div>

              {/* Format Search & Quick Filter */}
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    value={formatSearch}
                    onChange={e => setFormatSearch(e.target.value)}
                    placeholder="Search format (e.g. DXF, KML, CSV, GeoJSON, Shapefile, Excel, LandXML)..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-white/40 focus:border-[#c9a063] focus:outline-none"
                  />
                  {formatSearch && (
                    <button
                      onClick={() => setFormatSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Formats Grid */}
              <div>
                <label className="text-xs font-bold text-white/80 block mb-2.5">
                  Select Output Extension & Format ({filteredFormats.length} Available)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredFormats.map(fmt => {
                    const isSelected = selectedFormat === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setSelectedFormat(fmt.id)}
                        className={`text-left p-3.5 rounded-xl border transition-all relative flex flex-col justify-between ${
                          isSelected
                            ? 'bg-[#c9a063]/15 border-[#c9a063] shadow-lg shadow-[#c9a063]/10 ring-1 ring-[#c9a063]'
                            : 'bg-black/30 border-white/10 hover:border-white/20 hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-black/40 border border-white/10">
                                {getFormatIcon(fmt.iconName)}
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-white">{fmt.name}</h4>
                                <span className="text-[10px] font-mono text-white/50">{fmt.extension}</span>
                              </div>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-white/10 text-white/70">
                              {fmt.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-white/60 leading-relaxed line-clamp-2">
                            {fmt.description}
                          </p>
                        </div>

                        <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-white/40">
                          <span className="truncate max-w-[170px]">App: {fmt.recommendedFor.split(',')[0]}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#c9a063]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Format Options & Customization */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Sliders className="w-4 h-4 text-[#c9a063]" />
                  <span>Export Settings & Parameters</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* File Name */}
                  <div>
                    <label className="text-[11px] font-medium text-white/70 block mb-1">
                      File Name Base
                    </label>
                    <input
                      type="text"
                      value={fileName}
                      onChange={e => setFileName(e.target.value)}
                      placeholder="geostudio_export"
                      className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/10 text-xs text-white focus:border-[#c9a063] focus:outline-none"
                    />
                  </div>

                  {/* Coordinate System */}
                  <div>
                    <label className="text-[11px] font-medium text-white/70 block mb-1">
                      Coordinate Reference System
                    </label>
                    <select
                      value={coordSystem}
                      onChange={e => setCoordSystem(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/10 text-xs text-white focus:border-[#c9a063] focus:outline-none"
                    >
                      <option value="wgs84">WGS84 Geodetic (Lat / Lon)</option>
                      <option value="utm">Projected UTM (Easting / Northing)</option>
                    </select>
                  </div>

                  {/* UTM Zone */}
                  <div>
                    <label className="text-[11px] font-medium text-white/70 block mb-1">
                      Target UTM Zone
                    </label>
                    <select
                      value={exportZone}
                      onChange={e => setExportZone(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/10 text-xs text-white focus:border-[#c9a063] focus:outline-none"
                    >
                      <option value="42N">UTM 42N (West India / PK)</option>
                      <option value="43N">UTM 43N (West / Central India)</option>
                      <option value="44N">UTM 44N (Central / South India)</option>
                      <option value="45N">UTM 45N (East India / BD)</option>
                      <option value="46N">UTM 46N (North-East / MM)</option>
                      <option value="47N">UTM 47N (SE Asia / Thailand)</option>
                      <option value="43S">UTM 43S (Indian Ocean South)</option>
                      <option value="45S">UTM 45S (Southern Hemisphere)</option>
                    </select>
                  </div>
                </div>

                {/* Toggles */}
                <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-white/5 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-white/80 select-none">
                    <input
                      type="checkbox"
                      checked={include3dZ}
                      onChange={e => setInclude3dZ(e.target.checked)}
                      className="rounded border-white/20 bg-black/40 text-[#c9a063] focus:ring-0"
                    />
                    <span>Include 3D Elevation / Z-Coordinates</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ===================== MODE: IMPORT (AUTOMATIC FORMAT DETECTION) ===================== */}
          {mode === 'import' && (
            <div className="space-y-6">
              {/* Drag and Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-8 sm:p-10 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-[#c9a063] bg-[#c9a063]/10 scale-[1.01]'
                    : 'border-white/20 hover:border-white/40 bg-black/30 hover:bg-black/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileInputChange}
                  accept=".geojson,.kml,.kmz,.dxf,.csv,.xlsx,.tsv,.txt,.gpx,.wkt,.shp,.zip,.landxml,.xml,.topojson,.mif,.asc,.str,.json"
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl bg-[#c9a063]/15 border border-[#c9a063]/30 flex items-center justify-center text-[#c9a063] shadow-lg mb-1">
                  {isDetecting ? (
                    <RefreshCw className="w-7 h-7 animate-spin" />
                  ) : (
                    <Upload className="w-7 h-7" />
                  )}
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    {selectedFile ? selectedFile.name : 'Drop any survey or geospatial file here, or click to browse'}
                  </h3>
                  <p className="text-xs text-white/50 max-w-md mx-auto">
                    Supported: GeoJSON, KML, KMZ, DXF, CSV, Excel, GPX, Shapefile ZIP, TopoJSON, WKT, LandXML, and Project JSON.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                  {['.geojson', '.kml', '.kmz', '.dxf', '.csv', '.xlsx', '.gpx', '.shp', '.landxml', '.json'].map(ext => (
                    <span
                      key={ext}
                      className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-white/70 border border-white/10"
                    >
                      {ext}
                    </span>
                  ))}
                </div>
              </div>

              {/* Automatic Detection Results Banner */}
              {detectedResult && (
                <div className="p-4 sm:p-5 rounded-2xl bg-[#161616] border border-[#c9a063]/40 shadow-xl space-y-4 animate-in fade-in duration-200">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-md">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                            Auto-Detection Succeeded
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {Math.round(detectedResult.confidence * 100)}% Match
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white">
                          {detectedResult.formatName} ({detectedResult.extension})
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/50">Target Destination:</span>
                      <select
                        value={destinationApp}
                        onChange={e => setDestinationApp(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-black/60 border border-white/20 text-xs font-bold text-white focus:border-[#c9a063] focus:outline-none"
                      >
                        <option value="gis">GIS Studio (Map Layer)</option>
                        <option value="gps">GPS Surveyor (Waypoints)</option>
                        <option value="convert">Coordinate Converter (Batch)</option>
                        <option value="calc">Survey Calculator</option>
                        <option value="cad">Cadastral Mapper</option>
                        <option value="bhunaksha">Bhunaksha Digitizer</option>
                        <option value="bore">Borehole Mapper</option>
                        <option value="geofence">Geofence Studio</option>
                        {detectedResult.formatId === 'project' && (
                          <option value="project_restore">Full Workspace Project Restore</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Summary Metric Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                      <span className="text-[10px] text-white/50 uppercase block font-mono">Total Features</span>
                      <span className="text-base font-bold text-white">{detectedResult.featureCount}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                      <span className="text-[10px] text-white/50 uppercase block font-mono">Points / Vertices</span>
                      <span className="text-base font-bold text-cyan-400">{detectedResult.pointsCount}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                      <span className="text-[10px] text-white/50 uppercase block font-mono">Polylines & Paths</span>
                      <span className="text-base font-bold text-amber-400">{detectedResult.linesCount}</span>
                    </div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/10">
                      <span className="text-[10px] text-white/50 uppercase block font-mono">Polygons / Parcels</span>
                      <span className="text-base font-bold text-emerald-400">{detectedResult.polygonsCount}</span>
                    </div>
                  </div>

                  {/* Bounding Box / Spatial Extents Preview */}
                  {detectedResult.boundingBox && (
                    <div className="p-3 rounded-xl bg-black/30 border border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs text-white/70">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-[#c9a063]" />
                        <strong>Extents:</strong> Lat [{detectedResult.boundingBox.minLat.toFixed(5)}° to {detectedResult.boundingBox.maxLat.toFixed(5)}°], Lon [{detectedResult.boundingBox.minLon.toFixed(5)}° to {detectedResult.boundingBox.maxLon.toFixed(5)}°]
                      </span>
                    </div>
                  )}

                  {/* Attribute Fields */}
                  {detectedResult.attributeKeys.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/60">
                      <span className="font-semibold text-white/80">Detected Attributes:</span>
                      {detectedResult.attributeKeys.slice(0, 8).map(k => (
                        <span key={k} className="px-2 py-0.5 rounded bg-white/10 font-mono text-white text-[10px]">
                          {k}
                        </span>
                      ))}
                      {detectedResult.attributeKeys.length > 8 && (
                        <span className="text-white/40">+{detectedResult.attributeKeys.length - 8} more</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-[#171717] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Info className="w-4 h-4 text-[#c9a063]" />
            <span>
              {mode === 'export'
                ? `Ready to generate ${currentMeta.name} (${currentMeta.extension})`
                : detectedResult
                ? `Auto-detected ${detectedResult.formatName} • Ready to import into ${destinationApp}`
                : 'Select or drop a file above to begin auto-detection'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>

            {mode === 'export' ? (
              <button
                onClick={handleRunExport}
                disabled={isExporting}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#c9a063] text-black hover:bg-[#d6b075] transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>Export & Download ({currentMeta.extension})</span>
              </button>
            ) : (
              <button
                onClick={handleConfirmImport}
                disabled={!detectedResult || isDetecting}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#c9a063] text-black hover:bg-[#d6b075] transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>Confirm & Import Data</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
