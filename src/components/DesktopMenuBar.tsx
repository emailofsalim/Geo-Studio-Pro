import React, { useState, useRef, useEffect } from 'react';
import {
  Layers,
  Globe,
  Navigation as CompassIcon,
  Calculator,
  FileCode,
  MapPin,
  Layers2,
  Scan,
  Spline,
  BookOpen,
  HelpCircle,
  Settings,
  Search,
  Moon,
  Sun,
  ShieldCheck,
  Compass,
  Sparkles,
  Maximize2,
  Minimize2,
  Download,
  Upload,
  RotateCcw,
  FileSpreadsheet,
  Camera,
  ShieldAlert,
  ChevronDown,
  Crosshair,
  Radio,
  Sliders,
  Check
} from 'lucide-react';
import { AppTabId, APPS_CONFIG } from './Navigation';

interface DesktopMenuBarProps {
  activeTab: AppTabId;
  setActiveTab: (tab: AppTabId) => void;
  workingZone: string;
  setWorkingZone: (zone: string) => void;
  distanceUnit: 'm' | 'ft';
  setDistanceUnit: (unit: 'm' | 'ft') => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  openCommandPalette: () => void;
  openSettings: () => void;
  openShortcuts: () => void;
  openTour: () => void;
  openAiModal: () => void;
  onExportProject: () => void;
  onImportProject: (file: File) => void;
  onClearAllData: () => void;
  hasGpsFix?: boolean;
}

export const DesktopMenuBar: React.FC<DesktopMenuBarProps> = ({
  activeTab,
  setActiveTab,
  workingZone,
  setWorkingZone,
  distanceUnit,
  setDistanceUnit,
  isDark,
  setIsDark,
  openCommandPalette,
  openSettings,
  openShortcuts,
  openTour,
  openAiModal,
  onExportProject,
  onImportProject,
  onClearAllData,
  hasGpsFix = false
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const utmZones = [
    { zone: '42N', epsg: '32642', label: 'UTM 42N (West India / PK)' },
    { zone: '43N', epsg: '32643', label: 'UTM 43N (West / Central India)' },
    { zone: '44N', epsg: '32644', label: 'UTM 44N (Central / South India)' },
    { zone: '45N', epsg: '32645', label: 'UTM 45N (East India / BD)' },
    { zone: '46N', epsg: '32646', label: 'UTM 46N (North-East / MM)' },
    { zone: '47N', epsg: '32647', label: 'UTM 47N (SE Asia / Thailand)' },
    { zone: '43S', epsg: '32743', label: 'UTM 43S (Indian Ocean South)' },
    { zone: '45S', epsg: '32745', label: 'UTM 45S (Southern Hemisphere)' }
  ];

  return (
    <div ref={menuBarRef} className="hidden md:flex flex-col bg-[#0d0d0d] border-b border-white/10 select-none z-30">
      {/* 1. Desktop Window Top Bar & Dropdown Menu */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#080808] border-b border-white/5 text-xs text-white/80">
        {/* Left: App Brand & Desktop Menu Items */}
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-2 px-2.5 py-1 mr-2 rounded bg-white/5 border border-white/10">
            <Crosshair className="w-3.5 h-3.5 text-[#c9a063] animate-pulse" />
            <span className="font-serif italic font-bold text-white tracking-tight">GeoStudio Pro</span>
            <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 bg-[#c9a063]/20 text-[#c9a063] rounded border border-[#c9a063]/40">
              v4.8.2 Geomatics
            </span>
          </div>

          {/* [FILE] Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
              className={`px-2.5 py-1 rounded hover:bg-white/10 font-medium text-xs flex items-center gap-1 transition-colors ${
                openMenu === 'file' ? 'bg-white/10 text-white' : 'text-white/70'
              }`}
            >
              File <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {openMenu === 'file' && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-[#141414] border border-white/10 rounded-xl shadow-2xl py-1.5 z-50 text-xs text-white">
                <button
                  onClick={() => {
                    setActiveTab('templates');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#c9a063]" />
                    New Project / Template
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">Ctrl+1</span>
                </button>
                <button
                  onClick={() => {
                    onExportProject();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    Export Project Backup (.json)
                  </span>
                </button>
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5 text-sky-400" />
                    Import Project Backup
                  </span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={e => {
                    if (e.target.files?.[0]) {
                      onImportProject(e.target.files[0]);
                    }
                  }}
                  accept=".json"
                  className="hidden"
                />
                <div className="my-1 border-t border-white/10" />
                <button
                  onClick={() => {
                    openSettings();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5 text-amber-400" />
                    Preferences & Units...
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">Ctrl+,</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Reset all cached surveyor data and restore defaults?')) {
                      onClearAllData();
                    }
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-red-950/40 text-red-300 flex items-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Workspace Storage
                </button>
              </div>
            )}
          </div>

          {/* [DATUM & GEODESY] Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'geodesy' ? null : 'geodesy')}
              className={`px-2.5 py-1 rounded hover:bg-white/10 font-medium text-xs flex items-center gap-1 transition-colors ${
                openMenu === 'geodesy' ? 'bg-white/10 text-white' : 'text-white/70'
              }`}
            >
              Geodesy & Datum <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {openMenu === 'geodesy' && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-[#141414] border border-white/10 rounded-xl shadow-2xl py-1.5 z-50 text-xs text-white">
                <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#c9a063]">
                  Active UTM Grid Zone
                </div>
                {utmZones.map(z => (
                  <button
                    key={z.zone}
                    onClick={() => {
                      setWorkingZone(z.zone);
                      setOpenMenu(null);
                    }}
                    className="w-full px-3.5 py-1.5 text-left hover:bg-white/10 flex items-center justify-between text-xs"
                  >
                    <span>{z.label}</span>
                    {workingZone === z.zone && <Check className="w-3.5 h-3.5 text-[#c9a063]" />}
                  </button>
                ))}
                <div className="my-1 border-t border-white/10" />
                <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#c9a063]">
                  Distance & Dimension Unit
                </div>
                <button
                  onClick={() => {
                    setDistanceUnit('m');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-1.5 text-left hover:bg-white/10 flex items-center justify-between"
                >
                  <span>Meters [m] (SI Standard)</span>
                  {distanceUnit === 'm' && <Check className="w-3.5 h-3.5 text-[#c9a063]" />}
                </button>
                <button
                  onClick={() => {
                    setDistanceUnit('ft');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-1.5 text-left hover:bg-white/10 flex items-center justify-between"
                >
                  <span>Feet [ft] (Imperial / US Survey)</span>
                  {distanceUnit === 'ft' && <Check className="w-3.5 h-3.5 text-[#c9a063]" />}
                </button>
              </div>
            )}
          </div>

          {/* [FIELD INSTRUMENTS] Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'instruments' ? null : 'instruments')}
              className={`px-2.5 py-1 rounded hover:bg-white/10 font-medium text-xs flex items-center gap-1 transition-colors ${
                openMenu === 'instruments' ? 'bg-white/10 text-white' : 'text-white/70'
              }`}
            >
              Field Instruments <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {openMenu === 'instruments' && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-[#141414] border border-white/10 rounded-xl shadow-2xl py-1.5 z-50 text-xs text-white">
                <button
                  onClick={() => {
                    setActiveTab('gps');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center gap-2.5"
                >
                  <CompassIcon className="w-4 h-4 text-[#c9a063]" />
                  <div>
                    <div className="font-semibold">GNSS Field Surveyor</div>
                    <div className="text-[10px] text-white/50">RTK/Cockpit • Stakeout • Proximity Alarms</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('camera');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center gap-2.5"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="font-semibold">GPS Map Field Camera</div>
                    <div className="text-[10px] text-white/50">Geostamped Photogrammetry HUD</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('calc');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center gap-2.5"
                >
                  <Calculator className="w-4 h-4 text-sky-400" />
                  <div>
                    <div className="font-semibold">Survey Calculator & COGO</div>
                    <div className="text-[10px] text-white/50">Leveling • Bowditch Traverse • Resection</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('geofence');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center gap-2.5"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <div>
                    <div className="font-semibold">Geofence Sentinel</div>
                    <div className="text-[10px] text-white/50">Polygon & Corridor Breach Monitoring</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* [CADASTRE & GIS] Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'cadastre' ? null : 'cadastre')}
              className={`px-2.5 py-1 rounded hover:bg-white/10 font-medium text-xs flex items-center gap-1 transition-colors ${
                openMenu === 'cadastre' ? 'bg-white/10 text-white' : 'text-white/70'
              }`}
            >
              Cadastre & GIS <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {openMenu === 'cadastre' && (
              <div className="absolute left-0 top-full mt-1 w-64 bg-[#141414] border border-white/10 rounded-xl shadow-2xl py-1.5 z-50 text-xs text-white">
                <button
                  onClick={() => {
                    setActiveTab('gis');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center gap-2.5"
                >
                  <Layers className="w-4 h-4 text-[#c9a063]" />
                  <div>
                    <div className="font-semibold">GIS Map Studio</div>
                    <div className="text-[10px] text-white/50">Multi-layer Vector CAD / GIS Workstation</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('bhunaksha');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center gap-2.5"
                >
                  <Scan className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="font-semibold">BhuNaksha Digitizer</div>
                    <div className="text-[10px] text-white/50">Affine Georeferencing & Vectorization</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('cad');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center gap-2.5"
                >
                  <Layers2 className="w-4 h-4 text-indigo-400" />
                  <div>
                    <div className="font-semibold">Cadastral Mapper</div>
                    <div className="text-[10px] text-white/50">Khasra Jamabandi & Metes/Bounds</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('bore');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center gap-2.5"
                >
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="font-semibold">Borehole & Mine Stratigraphy</div>
                    <div className="text-[10px] text-white/50">Assay Compositing & Cross-Sections</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('studio');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center gap-2.5"
                >
                  <FileCode className="w-4 h-4 text-teal-400" />
                  <div>
                    <div className="font-semibold">Universal Format Converter</div>
                    <div className="text-[10px] text-white/50">DXF • SHP • KML • CSV • GeoJSON</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* [HELP & AI] Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'help' ? null : 'help')}
              className={`px-2.5 py-1 rounded hover:bg-white/10 font-medium text-xs flex items-center gap-1 transition-colors ${
                openMenu === 'help' ? 'bg-white/10 text-white' : 'text-white/70'
              }`}
            >
              Help & AI <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {openMenu === 'help' && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-[#141414] border border-white/10 rounded-xl shadow-2xl py-1.5 z-50 text-xs text-white">
                <button
                  onClick={() => {
                    openAiModal();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#c9a063]" />
                    AI Geomatics Consultant
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">Ctrl+G</span>
                </button>
                <button
                  onClick={() => {
                    openCommandPalette();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-white/70" />
                    Command Palette
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">Ctrl+K</span>
                </button>
                <button
                  onClick={() => {
                    openShortcuts();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-white/70" />
                    Keyboard Shortcuts
                  </span>
                  <span className="text-[10px] text-white/40 font-mono">Ctrl+/</span>
                </button>
                <button
                  onClick={() => {
                    openTour();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-white/10 flex items-center gap-2"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-white/70" />
                  Interactive Guided Tour
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Quick Action Desktop Utilities */}
        <div className="flex items-center gap-2">
          {/* Quick AI Consultant button */}
          <button
            onClick={openAiModal}
            className="px-2.5 py-1 rounded bg-[#c9a063]/10 hover:bg-[#c9a063]/20 border border-[#c9a063]/30 text-[#c9a063] font-medium flex items-center gap-1.5 transition-all text-xs"
            title="Ask AI Geomatics Consultant (Ctrl+G)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Consultant</span>
            <kbd className="text-[9px] bg-[#c9a063]/20 px-1 rounded font-mono">⌘G</kbd>
          </button>

          {/* Quick Search */}
          <button
            onClick={openCommandPalette}
            className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white flex items-center gap-1.5 transition-all text-xs"
            title="Command Palette (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5 text-white/40" />
            <span className="text-white/60">Quick Search</span>
            <kbd className="text-[9px] bg-white/10 px-1 rounded font-mono">⌘K</kbd>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen Workstation Mode'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title={isDark ? 'Light Theme' : 'Dark Theme'}
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-[#c9a063]" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          {/* Settings */}
          <button
            onClick={openSettings}
            className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Settings (Ctrl+,)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Desktop Quick Ribbon Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#111111] border-b border-white/5 text-xs">
        {/* Left: Active Module Quick Switcher & Geodetic Parameters */}
        <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar py-0.5">
          <div className="flex items-center gap-2 pr-3 border-r border-white/10">
            <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Active Datum:</span>
            <select
              value={workingZone}
              onChange={e => setWorkingZone(e.target.value)}
              className="bg-[#181818] text-[#c9a063] font-mono font-bold text-xs py-1 px-2.5 rounded-lg border border-[#c9a063]/30 cursor-pointer focus:outline-none"
            >
              {utmZones.map(z => (
                <option key={z.zone} value={z.zone}>
                  UTM {z.zone} (EPSG:{z.epsg})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 pr-3 border-r border-white/10 text-white/60 font-mono text-[11px]">
            <span className="text-white/40">Ellipsoid:</span>
            <span className="text-white font-medium">WGS84</span>
            <span className="text-white/30">•</span>
            <span className="text-white/40">Scale Factor $k_0$:</span>
            <span className="text-emerald-400 font-bold">0.999600</span>
          </div>

          <div className="flex items-center gap-1.5 pr-3 border-r border-white/10 text-white/60 font-mono text-[11px]">
            <span className="text-white/40">Unit:</span>
            <button
              onClick={() => setDistanceUnit(distanceUnit === 'm' ? 'ft' : 'm')}
              className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[#c9a063] font-bold"
              title="Click to toggle Meters / Feet"
            >
              {distanceUnit === 'm' ? 'Meters [m]' : 'Feet [ft]'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-white/40 text-[10px] uppercase font-semibold">Field Station:</span>
            <span className="px-2.5 py-0.5 rounded-md bg-[#181818] text-white font-serif italic border border-white/10 text-xs">
              {APPS_CONFIG.find(a => a.id === activeTab)?.name || 'Geomatics Station'}
            </span>
          </div>
        </div>

        {/* Right: GNSS Quality Status & Security Badge */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span className="font-bold">{hasGpsFix ? 'RTK FIX (0.01m)' : 'GNSS READY (STANDBY)'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-[#c9a063]" />
            <span className="text-[11px]">100% Offline Secured</span>
          </div>
        </div>
      </div>
    </div>
  );
};
