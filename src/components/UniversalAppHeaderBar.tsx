import React, { useState } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  ChevronDown,
  Globe,
  FileCode,
  FileSpreadsheet,
  MapPin,
  Compass,
  Layers,
  FolderArchive,
  Check
} from 'lucide-react';
import { ExportFormatId, SUPPORTED_EXPORT_FORMATS } from '../lib/universalDataBridge';

interface UniversalAppHeaderBarProps {
  appId?: string;
  appName: string;
  description?: string;
  appDescription?: string;
  icon?: React.ReactNode;
  badge?: string;
  metricsText?: string;
  featureCount?: number;
  workingZone?: string;
  onOpenUniversalImport?: () => void;
  onOpenUniversalExport?: (format?: ExportFormatId) => void;
  onUniversalImport?: () => void;
  onUniversalExport?: (format?: ExportFormatId) => void;
  extraControls?: React.ReactNode;
}

export const UniversalAppHeaderBar: React.FC<UniversalAppHeaderBarProps> = ({
  appId = 'tool',
  appName,
  description,
  appDescription,
  icon,
  badge,
  metricsText,
  featureCount,
  workingZone,
  onOpenUniversalImport,
  onOpenUniversalExport,
  onUniversalImport,
  onUniversalExport,
  extraControls
}) => {
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const handleImport = onUniversalImport || onOpenUniversalImport || (() => {});
  const handleExport = onUniversalExport || onOpenUniversalExport || (() => {});
  const finalDescription = description || appDescription;
  const finalMetrics = metricsText || (featureCount !== undefined ? `${featureCount} Items` : workingZone ? `UTM ${workingZone}` : undefined);

  const quickFormats: { id: ExportFormatId; label: string; ext: string }[] = [
    { id: 'geojson', label: 'GeoJSON', ext: '.geojson' },
    { id: 'kml', label: 'Google Earth KML', ext: '.kml' },
    { id: 'kmz', label: 'Google Earth KMZ', ext: '.kmz' },
    { id: 'dxf', label: 'AutoCAD DXF', ext: '.dxf' },
    { id: 'csv', label: 'CSV Table', ext: '.csv' },
    { id: 'xlsx', label: 'Excel Workbook', ext: '.xlsx' },
    { id: 'gpx', label: 'GPX GPS', ext: '.gpx' },
    { id: 'shp', label: 'Shapefile ZIP', ext: '.shp.zip' }
  ];

  return (
    <div className="p-3.5 sm:p-4 rounded-2xl bg-[#111111] border border-white/10 shadow-lg flex flex-wrap items-center justify-between gap-3 mb-6 relative select-none">
      {/* Left: App Title, Icon & Description */}
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-[#c9a063]/15 border border-[#c9a063]/30 flex items-center justify-center text-[#c9a063] shadow-inner shrink-0">
            {icon}
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
              {appName}
            </h2>
            {badge && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#c9a063]/20 text-[#c9a063] border border-[#c9a063]/30">
                {badge}
              </span>
            )}
            {finalMetrics && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-white/70 border border-white/10">
                {finalMetrics}
              </span>
            )}
          </div>
          {finalDescription && (
            <p className="text-xs text-white/50 leading-relaxed max-w-2xl hidden sm:block">
              {finalDescription}
            </p>
          )}
        </div>
      </div>

      {/* Right: Universal Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap ml-auto">
        {extraControls}

        {/* 1. Universal Import Button (Auto-Detect) */}
        <button
          type="button"
          onClick={handleImport}
          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white border border-white/10 hover:border-white/20 transition-all flex items-center gap-2 shadow-sm group"
          title={`Universal Import: Auto-detects GeoJSON, KML, DXF, CSV, GPX, Shapefile, LandXML into ${appName}`}
        >
          <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[9px] font-bold">
            <Sparkles className="w-2.5 h-2.5" />
          </div>
          <Upload className="w-3.5 h-3.5 text-white/80 group-hover:text-white" />
          <span>Universal Import</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-white/60 hidden md:inline">
            Auto-Detect
          </span>
        </button>

        {/* 2. Universal Export Button with Quick Extension Chooser */}
        <div className="relative">
          <div className="flex items-center rounded-xl bg-[#c9a063] text-black shadow-md border border-[#c9a063]/50">
            <button
              type="button"
              onClick={() => handleExport()}
              className="px-3.5 py-2 text-xs font-bold hover:bg-[#d6b075] transition-colors flex items-center gap-2 rounded-l-xl"
              title={`Universal Export: Choose format or extension (GeoJSON, KML, KMZ, DXF, CSV, Excel, GPX, Shapefile)`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Universal Export</span>
            </button>

            <div className="w-px h-5 bg-black/20" />

            <button
              type="button"
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="px-2 py-2 text-xs font-bold hover:bg-[#d6b075] transition-colors rounded-r-xl"
              title="Quick export format selector"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExportDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Quick Format Dropdown Menu */}
          {isExportDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setIsExportDropdownOpen(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-[#181818] border border-white/15 shadow-2xl p-2 z-40 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40 border-b border-white/10 flex items-center justify-between">
                  <span>Choose Export Extension</span>
                  <span className="text-[#c9a063]">All Formats</span>
                </div>

                <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-0.5">
                  {quickFormats.map(qf => (
                    <button
                      key={qf.id}
                      type="button"
                      onClick={() => {
                        setIsExportDropdownOpen(false);
                        handleExport(qf.id);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-white/10 text-white/90 hover:text-white flex items-center justify-between group transition-colors"
                    >
                      <span className="font-medium">{qf.label}</span>
                      <span className="text-[10px] font-mono text-white/40 group-hover:text-[#c9a063]">
                        {qf.ext}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="pt-1 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setIsExportDropdownOpen(false);
                      onOpenUniversalExport?.();
                    }}
                    className="w-full text-center px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#c9a063] bg-[#c9a063]/10 hover:bg-[#c9a063]/20 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span>More Formats (12+ Available)...</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
