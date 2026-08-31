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
  Check,
  Info,
  FolderKanban,
  User,
  CheckCircle2,
  Laptop,
  ChevronRight,
  Loader2,
  AlertTriangle,
  WifiOff,
  Save,
  Package
} from 'lucide-react';
import { AppTabId, APPS_CONFIG } from './Navigation';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';

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
  openAbout?: () => void;
  openAiCopilot?: () => void;
  openProfile?: () => void;
  onExportProject: () => void;
  onImportProject: (file: File) => void;
  openUniversalImport?: () => void;
  openUniversalExport?: (format?: any) => void;
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
  openAbout,
  openAiCopilot,
  openProfile,
  onExportProject,
  onImportProject,
  openUniversalImport,
  openUniversalExport,
  onClearAllData
}) => {
  const isOnline = useOnlineStatus();
  const { user, isGuest, setIsAuthModalOpen } = useAuth();
  const {
    activeProject,
    closeProject,
    saveStatus,
    isDirty,
    lastSavedTime,
    saveActiveProjectWorkspace,
    exportProjectData,
    importProjectData
  } = useProject();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
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

  const handleOpenProfile = () => {
    if (openProfile) openProfile();
    else setIsAuthModalOpen(true);
  };

  return (
    <header
      ref={menuBarRef}
      className="hidden md:flex items-center justify-between h-12 px-4 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/[0.08] select-none z-30 sticky top-0"
    >
      {/* Left: Brand & Breadcrumb */}
      <div className="flex items-center gap-3">
        {/* Brand */}
        <button
          onClick={() => {
            closeProject();
            setActiveTab('home');
          }}
          className="flex items-center gap-2 text-left group"
          title="BhuNex Studio Home & Projects"
        >
          <div className="w-7 h-7 rounded-lg overflow-hidden border border-[#c9a063]/40 bg-[#1c1810] flex items-center justify-center p-0.5 group-hover:border-[#c9a063] transition-colors shadow-2xs">
            <img
              src="/icon-192.svg"
              alt="BhuNex Studio Logo"
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="font-bold text-sm text-white tracking-tight">
            BhuNex Studio
          </span>
        </button>

        {/* Project Breadcrumb & Save Status Indicator */}
        {activeProject ? (
          <div className="flex items-center gap-2 text-xs">
            <ChevronRight className="w-3.5 h-3.5 text-white/30" />
            <button
              onClick={() => setActiveTab('dashboard')}
              className="px-2.5 py-0.5 rounded-md bg-[#c9a063]/10 hover:bg-[#c9a063]/20 border border-[#c9a063]/30 text-white font-medium flex items-center gap-1.5 transition-colors max-w-[180px] truncate"
              title={`Active Project: ${activeProject.name} (${activeProject.category})`}
            >
              <FolderKanban className="w-3 h-3 text-[#c9a063] shrink-0" />
              <span className="truncate">{activeProject.name}</span>
            </button>

            {/* Save Status Badge */}
            <button
              onClick={() => saveActiveProjectWorkspace()}
              className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1.5 transition-all border ${
                saveStatus === 'SAVING'
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                  : saveStatus === 'UNSAVED_CHANGES'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                  : saveStatus === 'SAVE_FAILED'
                  ? 'bg-red-500/15 border-red-500/40 text-red-300 animate-pulse hover:bg-red-500/25'
                  : saveStatus === 'OFFLINE'
                  ? 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300/90'
              }`}
              title={
                saveStatus === 'SAVING'
                  ? 'Saving changes to IndexedDB...'
                  : saveStatus === 'UNSAVED_CHANGES'
                  ? 'Unsaved changes (Auto-saving in 1s or click to save now)'
                  : saveStatus === 'SAVE_FAILED'
                  ? 'Save error. Click to retry.'
                  : saveStatus === 'OFFLINE'
                  ? 'Offline Mode: Data saved securely in local IndexedDB'
                  : `All changes saved to IndexedDB ${lastSavedTime ? `(${lastSavedTime})` : ''}`
              }
            >
              {saveStatus === 'SAVING' ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                  <span className="hidden xl:inline">Saving...</span>
                </>
              ) : saveStatus === 'UNSAVED_CHANGES' ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="hidden xl:inline">Unsaved</span>
                </>
              ) : saveStatus === 'SAVE_FAILED' ? (
                <>
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span>Save Error</span>
                </>
              ) : saveStatus === 'OFFLINE' ? (
                <>
                  <WifiOff className="w-3 h-3 text-slate-400" />
                  <span className="hidden xl:inline">Offline (DB)</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span className="hidden xl:inline">Saved</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ChevronRight className="w-3.5 h-3.5 text-white/30" />
            <span className="font-medium text-white/80">Home / Projects</span>
          </div>
        )}

        <div className="h-4 w-px bg-white/[0.08]" />

        {/* Minimal Navigation Menus */}
        <nav className="flex items-center gap-0.5 text-xs text-white/70">
          {/* File Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
              className={`px-2.5 py-1 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-1 ${
                openMenu === 'file' ? 'bg-white/[0.08] text-white' : ''
              }`}
            >
              File <ChevronDown className="w-3 h-3 opacity-40" />
            </button>

            {openMenu === 'file' && (
              <div className="absolute left-0 top-full mt-1.5 w-60 bg-[#121212] border border-white/[0.08] rounded-xl shadow-xl py-1 z-50 text-xs text-white/90">
                {activeProject && (
                  <button
                    onClick={() => {
                      saveActiveProjectWorkspace();
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center justify-between text-[#c9a063] font-medium"
                  >
                    <span className="flex items-center gap-2">
                      <Save className="w-3.5 h-3.5" />
                      Save Project Now
                    </span>
                    <span className="text-[10px] text-white/40 font-mono">⌘S</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setActiveTab('templates');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#c9a063]" />
                    Projects & Templates
                  </span>
                  <span className="text-[10px] text-white/30 font-mono">⌘1</span>
                </button>
                <button
                  onClick={() => {
                    if (openUniversalImport) openUniversalImport();
                    else fileInputRef.current?.click();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-[#c9a063]/10 text-[#c9a063] flex items-center justify-between font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" />
                    Universal Import (Auto-Detect)
                  </span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded">ALL</span>
                </button>
                <button
                  onClick={() => {
                    if (openUniversalExport) openUniversalExport();
                    else onExportProject();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-[#c9a063]/10 text-[#c9a063] flex items-center justify-between font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5" />
                    Universal Export (Choose Format)
                  </span>
                  <span className="text-[9px] bg-[#c9a063]/20 text-[#c9a063] px-1 rounded">12+</span>
                </button>
                <div className="my-1 border-t border-white/[0.06]" />
                {activeProject && (
                  <button
                    onClick={() => {
                      exportProjectData(activeProject.id, 'bhnx');
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2 text-white/90">
                      <Package className="w-3.5 h-3.5 text-[#c9a063]" />
                      Export Portable Package (.bhnx)
                    </span>
                    <span className="text-[9px] bg-[#c9a063]/20 text-[#c9a063] px-1 rounded font-mono">BHNX</span>
                  </button>
                )}
                {activeProject && (
                  <button
                    onClick={() => {
                      exportProjectData(activeProject.id, 'json');
                      setOpenMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2 text-white/70"
                  >
                    <Download className="w-3.5 h-3.5 text-white/60" />
                    Export Project Backup (.json)
                  </button>
                )}
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2 text-white/80"
                >
                  <Upload className="w-3.5 h-3.5 text-white/60" />
                  Import Package / Backup (.bhnx / .json)
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={e => {
                    if (e.target.files?.[0]) {
                      importProjectData(e.target.files[0]);
                    }
                  }}
                  accept=".bhnx,.json"
                  className="hidden"
                />
                <div className="my-1 border-t border-white/[0.06]" />
                <button
                  onClick={() => {
                    openSettings();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5 text-white/60" />
                    Preferences
                  </span>
                  <span className="text-[10px] text-white/30 font-mono">⌘,</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Reset all cached surveyor data and restore defaults?')) {
                      onClearAllData();
                    }
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-red-500/10 text-red-400 flex items-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Workspace
                </button>
              </div>
            )}
          </div>

          {/* Tools Menu */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'tools' ? null : 'tools')}
              className={`px-2.5 py-1 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-1 ${
                openMenu === 'tools' ? 'bg-white/[0.08] text-white' : ''
              }`}
            >
              Tools <ChevronDown className="w-3 h-3 opacity-40" />
            </button>

            {openMenu === 'tools' && (
              <div className="absolute left-0 top-full mt-1.5 w-56 bg-[#121212] border border-white/[0.08] rounded-xl shadow-xl py-1 z-50 text-xs text-white/90">
                <button
                  onClick={() => {
                    setActiveTab('sensors');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <Crosshair className="w-3.5 h-3.5 text-[#c9a063]" />
                  <span>Field Sensors & Theodolite</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('gis');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <Layers className="w-3.5 h-3.5 text-white/60" />
                  <span>GIS Map Studio</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('gps');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <CompassIcon className="w-3.5 h-3.5 text-white/60" />
                  <span>GNSS Field Surveyor</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('calc');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <Calculator className="w-3.5 h-3.5 text-white/60" />
                  <span>Survey Calculator</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('convert');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <Globe className="w-3.5 h-3.5 text-white/60" />
                  <span>Coordinate Converter</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('camera');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <Camera className="w-3.5 h-3.5 text-white/60" />
                  <span>GPS Map Camera</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('geofence');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3.5 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-white/60" />
                  <span>Geofence Sentinel</span>
                </button>
              </div>
            )}
          </div>

          {/* Cadastre & Explorations */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'cadastre' ? null : 'cadastre')}
              className={`px-2.5 py-1 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-1 ${
                openMenu === 'cadastre' ? 'bg-white/[0.08] text-white' : ''
              }`}
            >
              Cadastre <ChevronDown className="w-3 h-3 opacity-40" />
            </button>

            {openMenu === 'cadastre' && (
              <div className="absolute left-0 top-full mt-1.5 w-56 bg-[#121212] border border-white/[0.08] rounded-xl shadow-xl py-1 z-50 text-xs text-white/90">
                <button
                  onClick={() => {
                    setActiveTab('bhunaksha');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <Scan className="w-3.5 h-3.5 text-white/60" />
                  <span>BhuNaksha Digitizer</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('cad');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <Layers2 className="w-3.5 h-3.5 text-white/60" />
                  <span>Cadastral Mapper</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('bore');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <MapPin className="w-3.5 h-3.5 text-white/60" />
                  <span>Borehole Stratigraphy</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('studio');
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2.5"
                >
                  <FileCode className="w-3.5 h-3.5 text-white/60" />
                  <span>Universal Converter</span>
                </button>
              </div>
            )}
          </div>

          {/* Help */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === 'help' ? null : 'help')}
              className={`px-2.5 py-1 rounded-md hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-1 ${
                openMenu === 'help' ? 'bg-white/[0.08] text-white' : ''
              }`}
            >
              Help <ChevronDown className="w-3 h-3 opacity-40" />
            </button>

            {openMenu === 'help' && (
              <div className="absolute left-0 top-full mt-1.5 w-52 bg-[#121212] border border-white/[0.08] rounded-xl shadow-xl py-1 z-50 text-xs text-white/90">
                <button
                  onClick={() => {
                    openCommandPalette();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-white/60" />
                    Command Palette
                  </span>
                  <span className="text-[10px] text-white/30 font-mono">⌘K</span>
                </button>
                <button
                  onClick={() => {
                    openShortcuts();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-white/60" />
                    Shortcuts
                  </span>
                  <span className="text-[10px] text-white/30 font-mono">⌘/</span>
                </button>
                <button
                  onClick={() => {
                    openTour();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center gap-2"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-white/60" />
                  Guided Tour
                </button>
                <div className="my-1 border-t border-white/[0.06]" />
                <button
                  onClick={() => {
                    if (openAbout) openAbout();
                    else openSettings();
                    setOpenMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-white/[0.06] flex items-center justify-between text-[#c9a063]"
                >
                  <span className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5" />
                    About BhuNex
                  </span>
                  <span className="text-[10px] text-[#c9a063]/60 font-mono">v2.4</span>
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* Center: Datum & Units Quick Config */}
      <div className="flex items-center gap-2">
        {/* Zone Selector */}
        <div className="relative flex items-center">
          <select
            value={workingZone}
            onChange={e => setWorkingZone(e.target.value)}
            className="appearance-none bg-white/[0.04] hover:bg-white/[0.07] text-white/90 font-mono text-xs py-1 pl-2.5 pr-6 rounded-md border border-white/[0.08] cursor-pointer focus:outline-none focus:border-[#c9a063]/40 transition-colors"
            title="Active Coordinate Datum"
          >
            {utmZones.map(z => (
              <option key={z.zone} value={z.zone} className="bg-[#141414] text-white">
                UTM {z.zone}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-white/40 absolute right-2 pointer-events-none" />
        </div>

        {/* Universal Import & Export Toolbar Buttons (ONE GLOBAL IMPORT + ONE GLOBAL EXPORT) */}
        {openUniversalImport && (
          <button
            onClick={openUniversalImport}
            className="px-3 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-all shadow-xs"
            title="Import Geodata (Auto-Detects GeoJSON, KML, DXF, CSV, Excel, GPX, Shapefile, LandXML, etc.)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="font-semibold">Import</span>
          </button>
        )}

        {openUniversalExport && (
          <button
            onClick={() => openUniversalExport()}
            className="px-3 py-1 rounded-md bg-[#c9a063]/15 hover:bg-[#c9a063]/25 border border-[#c9a063]/40 text-xs font-semibold text-[#c9a063] hover:text-[#d6b074] flex items-center gap-1.5 transition-all shadow-xs"
            title="Export Geodata (Select GeoJSON, KML, DXF, CSV, Excel, GPX, Shapefile, Surpac, etc.)"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="font-semibold">Export</span>
          </button>
        )}
      </div>

      {/* Right: Search, AI, Profile & Preferences */}
      <div className="flex items-center gap-2 text-white/70">
        {/* Search / Command Palette */}
        <button
          onClick={openCommandPalette}
          className="h-8 px-2.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white/60 hover:text-white flex items-center gap-2 transition-colors text-xs"
          title="Command Palette (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-white/40" />
          <span className="hidden lg:inline text-white/50 font-normal">Search tools...</span>
          <kbd className="text-[10px] bg-white/[0.08] text-white/50 px-1.5 py-0.2 rounded font-mono">⌘K</kbd>
        </button>

        {/* Global AI Geomatics Copilot */}
        {openAiCopilot && (
          <button
            onClick={openAiCopilot}
            className="h-8 px-2.5 rounded-md bg-[#c9a063]/10 hover:bg-[#c9a063]/20 border border-[#c9a063]/30 text-[#c9a063] hover:text-[#d6b074] flex items-center gap-1.5 transition-all text-xs font-semibold shadow-xs"
            title="Open AI Geomatics Assistant"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#c9a063] animate-pulse" />
            <span className="hidden sm:inline">AI Copilot</span>
          </button>
        )}

        {/* Theme Toggle */}
        <button
          onClick={() => setIsDark(!isDark)}
          className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/[0.08] text-white/60 hover:text-white transition-colors"
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {isDark ? <Sun className="w-4 h-4 text-[#c9a063]" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Settings */}
        <button
          onClick={openSettings}
          className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-white/[0.08] text-white/60 hover:text-white transition-colors"
          title="Settings (Ctrl+,)"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Top-Right Profile / Account Button */}
        <button
          onClick={handleOpenProfile}
          className="h-8 pl-1.5 pr-2.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] flex items-center gap-2 transition-all group"
          title="Account Profile & Google Login"
        >
          {user?.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={user.name}
              className="w-5 h-5 rounded-full object-cover border border-[#c9a063]/60"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-[#c9a063]/20 text-[#c9a063] flex items-center justify-center">
              <User className="w-3 h-3" />
            </div>
          )}
          <span className="text-xs font-medium text-white max-w-[90px] truncate hidden sm:inline">
            {user?.name ? user.name.split(' ')[0] : 'Guest'}
          </span>
          <span
            className={`w-2 h-2 rounded-full ${
              !isGuest ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
            title={!isGuest ? 'Google Account Connected' : 'Guest Offline Mode'}
          />
        </button>
      </div>
    </header>
  );
};
