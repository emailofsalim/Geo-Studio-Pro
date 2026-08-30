import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Globe,
  Navigation as CompassIcon,
  Calculator,
  Layers,
  FileCode,
  MapPin,
  Layers2,
  Scan,
  Spline,
  BookOpen,
  HelpCircle,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Camera,
  Activity,
  Grid,
  Upload,
  Download,
  Sparkles
} from 'lucide-react';

export type AppTabId =
  | 'templates'
  | 'gis'
  | 'sensors'
  | 'sensor'
  | 'theodolite'
  | 'level'
  | 'geofence'
  | 'gf'
  | 'camera'
  | 'cam'
  | 'photo'
  | 'gps'
  | 'convert'
  | 'calc'
  | 'studio'
  | 'combine'
  | 'merge'
  | 'bore'
  | 'cad'
  | 'bhunaksha'
  | 'digitize'
  | 'offset'
  | 'off'
  | 'tutorials'
  | 'tut'
  | 'faq'
  | 'help';

export interface AppDefinition {
  id: AppTabId;
  name: string;
  shortName: string;
  category: 'Primary' | 'Geodesy & Survey' | 'Cadastre & Exploration' | 'Geometry & Tools' | 'Help & Docs';
  description: string;
  icon: any;
  isPrimary?: boolean;
}

interface NavigationProps {
  activeTab: AppTabId;
  setActiveTab: (tab: AppTabId) => void;
  isRail?: boolean;
  setIsRail?: React.Dispatch<React.SetStateAction<boolean>>;
  isMobileOpen?: boolean;
  setIsMobileOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  isOpen?: boolean;
  onClose?: () => void;
  openSettings?: () => void;
  openUniversalImport?: () => void;
  openUniversalExport?: (format?: any) => void;
  workingZone?: string;
}

export const APPS_CONFIG: AppDefinition[] = [
  // 5 Primary Field & Core Apps (Pinned on Navigation Bar)
  {
    id: 'templates',
    name: 'Home & Templates',
    shortName: 'Home',
    category: 'Primary',
    description: 'Central project dashboard, industry schemas, standard survey templates & ZIP manager',
    icon: FileSpreadsheet,
    isPrimary: true
  },
  {
    id: 'camera',
    name: 'GPS Map Camera',
    shortName: 'Camera',
    category: 'Primary',
    description: 'Field inspection camera with real-time HUD telemetry, satellite PIP, and geostamping',
    icon: Camera,
    isPrimary: true
  },
  {
    id: 'gps',
    name: 'GNSS Field Survey',
    shortName: 'GNSS',
    category: 'Primary',
    description: 'RTK/GNSS point surveyor, satellite constellation logger, and live track recorder',
    icon: CompassIcon,
    isPrimary: true
  },
  {
    id: 'bore',
    name: 'Borehole Stratigraphy',
    shortName: 'Borehole',
    category: 'Primary',
    description: '3D geotechnical core logger, lithology columns, grade intervals, and seam modeling',
    icon: MapPin,
    isPrimary: true
  },
  {
    id: 'gis',
    name: 'GIS Map Studio',
    shortName: 'GIS Map',
    category: 'Primary',
    description: 'Vector GIS canvas, layer styling, buffer generation, and high-res satellite imagery',
    icon: Layers,
    isPrimary: true
  },

  // More Options: Geodesy & Survey
  {
    id: 'convert',
    name: 'Coordinate Converter',
    shortName: 'Converter',
    category: 'Geodesy & Survey',
    description: 'High-precision WGS84, UTM, and local grid batch coordinate transformation engine',
    icon: Globe
  },
  {
    id: 'calc',
    name: 'Survey Calculator',
    shortName: 'Calculator',
    category: 'Geodesy & Survey',
    description: 'Bowditch traverse adjustment, bearing/distance, leveling, and mineral cutoffs',
    icon: Calculator
  },
  {
    id: 'sensors',
    name: 'Field Sensors & Theodolite',
    shortName: 'Sensors',
    category: 'Geodesy & Survey',
    description: 'Digital electronic theodolite, clinometer, auto-level, and barometric weather sensor',
    icon: Activity
  },
  {
    id: 'geofence',
    name: 'Geofence Sentinel',
    shortName: 'Geofence',
    category: 'Geodesy & Survey',
    description: 'Lease boundary containment monitor, audio proximity alerts, and breach logger',
    icon: ShieldAlert
  },

  // More Options: Cadastre & Exploration
  {
    id: 'bhunaksha',
    name: 'BhuNaksha Digitizer',
    shortName: 'BhuNaksha',
    category: 'Cadastre & Exploration',
    description: 'Indian revenue cadastral parcel digitizer with automatic area calculations',
    icon: Scan
  },
  {
    id: 'cad',
    name: 'Cadastral Mapper',
    shortName: 'Cadastre',
    category: 'Cadastre & Exploration',
    description: 'Khatian tenancy register, village boundary plots, and land classification manager',
    icon: Layers2
  },

  // More Options: Geometry & Tools
  {
    id: 'studio',
    name: 'Universal Converter',
    shortName: 'Format Studio',
    category: 'Geometry & Tools',
    description: 'Cross-format spatial transformer for CSV, DXF, GeoJSON, KML, and ESRI Shapefiles',
    icon: FileCode
  },
  {
    id: 'combine',
    name: 'Merge & Split Polygons',
    shortName: 'Merge/Split',
    category: 'Geometry & Tools',
    description: 'Spatial boolean operations, boundary union, parcel subdivision, and slice geometry',
    icon: Layers2
  },
  {
    id: 'off',
    name: 'Boundary Offset & Buffer',
    shortName: 'Offset',
    category: 'Geometry & Tools',
    description: 'Statutory 7.5m mining safety barrier offsets, riparian buffers, and road setbacks',
    icon: Spline
  },

  // More Options: Help & Docs
  {
    id: 'tut',
    name: 'Tutorials & Guides',
    shortName: 'Tutorials',
    category: 'Help & Docs',
    description: 'Step-by-step workflow manuals, field checklists, and cadastral survey guides',
    icon: BookOpen
  },
  {
    id: 'help',
    name: 'Help & Documentation',
    shortName: 'Help',
    category: 'Help & Docs',
    description: 'Technical specifications, formula derivations, geodesic constants, and FAQ',
    icon: HelpCircle
  }
];

export const PRIMARY_APPS = APPS_CONFIG.filter(a => a.isPrimary);
export const MORE_APPS = APPS_CONFIG.filter(a => !a.isPrimary);

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  isRail = false,
  setIsRail,
  isMobileOpen = false,
  setIsMobileOpen,
  isOpen,
  onClose,
  openSettings,
  openUniversalImport,
  openUniversalExport,
  workingZone = '45N'
}) => {
  const mobileOpen = isOpen !== undefined ? isOpen : isMobileOpen;
  const [isMoreExpanded, setIsMoreExpanded] = useState<boolean>(true);
  const [isRailMoreMenuOpen, setIsRailMoreMenuOpen] = useState<boolean>(false);

  const handleClose = () => {
    if (onClose) onClose();
    if (setIsMobileOpen) setIsMobileOpen(false);
  };

  const normalizedActiveTab =
    activeTab === 'merge' ? 'combine' :
    activeTab === 'offset' ? 'off' :
    activeTab === 'tutorials' ? 'tut' :
    activeTab === 'faq' ? 'help' :
    activeTab === 'sensor' || activeTab === 'theodolite' || activeTab === 'level' ? 'sensors' :
    activeTab === 'gf' ? 'geofence' :
    activeTab === 'cam' || activeTab === 'photo' ? 'camera' :
    activeTab === 'digitize' ? 'bhunaksha' :
    activeTab;

  const isMoreAppActive = MORE_APPS.some(a => a.id === normalizedActiveTab);

  // Auto-expand More Tools section if a secondary app is active
  useEffect(() => {
    if (isMoreAppActive) {
      setIsMoreExpanded(true);
    }
  }, [isMoreAppActive]);

  const secondaryCategories: ('Geodesy & Survey' | 'Cadastre & Exploration' | 'Geometry & Tools' | 'Help & Docs')[] = [
    'Geodesy & Survey',
    'Cadastre & Exploration',
    'Geometry & Tools',
    'Help & Docs'
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={handleClose}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed md:relative top-0 left-0 h-full z-30 flex flex-col bg-[#0d0d0d] border-r border-white/[0.06] text-[#d4d4d4] transition-all duration-150 ${
          isRail ? 'w-14' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Top Header */}
        <div className="h-12 px-3 flex items-center justify-between border-b border-white/[0.06]">
          {!isRail && (
            <div className="flex items-center gap-2 pl-1">
              <span className="text-xs font-semibold tracking-wider text-white/50 uppercase">
                Workspace
              </span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40 border border-white/[0.04]">
                {APPS_CONFIG.length} Apps
              </span>
            </div>
          )}
          {setIsRail && (
            <button
              onClick={() => setIsRail(!isRail)}
              className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors ml-auto"
              title={isRail ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isRail ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Navigation Items Scroll Area */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2.5 space-y-3 custom-scrollbar">
          {/* Universal Data Bridge Actions */}
          {(openUniversalImport || openUniversalExport) && (
            <div className="space-y-1 pb-1">
              {!isRail && (
                <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 select-none flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    Data Bridge
                  </span>
                  <span className="text-[9px] font-mono text-white/30">Auto / 12+</span>
                </div>
              )}

              {openUniversalImport && (
                <button
                  type="button"
                  onClick={openUniversalImport}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all shadow-xs group relative"
                  title="Universal Import: Auto-detects GeoJSON, KML, DXF, CSV, GPX, Shapefile, LandXML"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  {!isRail && (
                    <div className="flex items-center justify-between w-full">
                      <span>Universal Import</span>
                      <span className="text-[9px] font-mono bg-emerald-500/20 px-1 rounded">Auto</span>
                    </div>
                  )}
                </button>
              )}

              {openUniversalExport && (
                <button
                  type="button"
                  onClick={() => openUniversalExport()}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#c9a063]/10 hover:bg-[#c9a063]/20 text-[#c9a063] border border-[#c9a063]/20 transition-all shadow-xs group relative"
                  title="Universal Export: Choose format or extension"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  {!isRail && (
                    <div className="flex items-center justify-between w-full">
                      <span>Universal Export</span>
                      <span className="text-[9px] font-mono bg-[#c9a063]/20 px-1 rounded">Choose</span>
                    </div>
                  )}
                </button>
              )}
            </div>
          )}

          {/* 1. PRIMARY NAVIGATION SECTION */}
          <div className="space-y-0.5">
            {!isRail && (
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#c9a063]/80 select-none flex items-center justify-between">
                <span>Primary Apps</span>
                <span className="text-[9px] font-mono text-white/30">Quick Access</span>
              </div>
            )}
            {PRIMARY_APPS.map(app => {
              const Icon = app.icon;
              const isActive = normalizedActiveTab === app.id;

              return (
                <button
                  key={app.id}
                  onClick={() => {
                    setActiveTab(app.id as any);
                    handleClose();
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all group relative ${
                    isActive
                      ? 'bg-[#c9a063]/15 text-white border border-[#c9a063]/30 shadow-xs'
                      : 'text-white/70 hover:text-white hover:bg-white/[0.05] border border-transparent'
                  }`}
                  title={isRail ? `${app.name} - ${app.description}` : undefined}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-[#c9a063]' : 'text-white/50 group-hover:text-white'
                    }`}
                  />
                  {!isRail && (
                    <div className="flex flex-col items-start min-w-0 text-left">
                      <span className="truncate text-xs font-medium">{app.name}</span>
                    </div>
                  )}

                  {/* Rail Tooltip */}
                  {isRail && (
                    <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-[#1a1a1a] border border-white/[0.1] rounded-md text-xs font-medium text-white whitespace-nowrap shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                      <div className="font-semibold text-[#c9a063]">{app.name}</div>
                      <div className="text-[10px] text-white/50 font-normal">{app.description}</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Divider between Primary and More Tools */}
          <div className="my-1 border-t border-white/[0.06]" />

          {/* 2. MORE TOOLS EXPANDABLE ACCORDION (Desktop Expanded View) */}
          {!isRail ? (
            <div className="space-y-1">
              {/* More Tools Header Toggle */}
              <button
                onClick={() => setIsMoreExpanded(prev => !prev)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isMoreAppActive
                    ? 'bg-white/[0.04] text-white'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.02]'
                }`}
                title="Toggle More Apps & Utilities"
              >
                <div className="flex items-center gap-2">
                  <Grid className="w-3.5 h-3.5 text-[#c9a063]" />
                  <span className="uppercase text-[10px] font-semibold tracking-wider">
                    More Tools & Apps
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/[0.08] text-white/60">
                    {MORE_APPS.length}
                  </span>
                </div>
                {isMoreExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 opacity-60" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                )}
              </button>

              {/* Collapsible Content */}
              {isMoreExpanded && (
                <div className="space-y-3 pt-1 pl-1">
                  {secondaryCategories.map(cat => {
                    const catItems = MORE_APPS.filter(a => a.category === cat);
                    if (!catItems.length) return null;

                    return (
                      <div key={cat} className="space-y-0.5">
                        <div className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/30 select-none">
                          {cat}
                        </div>
                        {catItems.map(app => {
                          const Icon = app.icon;
                          const isActive = normalizedActiveTab === app.id;

                          return (
                            <button
                              key={app.id}
                              onClick={() => {
                                setActiveTab(app.id as any);
                                handleClose();
                              }}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors group relative ${
                                isActive
                                  ? 'bg-white/[0.1] text-white font-medium shadow-xs'
                                  : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                              }`}
                              title={app.description}
                            >
                              <Icon
                                className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                                  isActive ? 'text-[#c9a063]' : 'text-white/40 group-hover:text-white/80'
                                }`}
                              />
                              <span className="truncate text-left text-[11.5px]">{app.name}</span>
                              {isActive && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#c9a063]" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* RAIL MODE: More Tools Popover Launcher */
            <div className="relative pt-1 flex flex-col items-center">
              <button
                onClick={() => setIsRailMoreMenuOpen(prev => !prev)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative group ${
                  isMoreAppActive || isRailMoreMenuOpen
                    ? 'bg-[#c9a063]/20 text-[#c9a063]'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
                }`}
                title="More Tools & Utilities"
              >
                <Grid className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white/[0.12] text-[9px] font-mono text-white flex items-center justify-center">
                  {MORE_APPS.length}
                </span>

                {/* Rail Hover Tooltip */}
                {!isRailMoreMenuOpen && (
                  <div className="absolute left-full ml-2 px-2.5 py-1 bg-[#1a1a1a] border border-white/[0.1] rounded-md text-xs font-medium text-white whitespace-nowrap shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                    More Apps ({MORE_APPS.length} Tools)
                  </div>
                )}
              </button>

              {/* Flyout Popup in Rail Mode */}
              {isRailMoreMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsRailMoreMenuOpen(false)}
                  />
                  <div className="absolute left-full top-0 ml-2 w-64 max-h-[85vh] overflow-y-auto bg-[#141414] border border-white/[0.1] rounded-xl shadow-2xl p-2 z-50 custom-scrollbar text-xs">
                    <div className="px-2 py-1.5 border-b border-white/[0.06] text-xs font-semibold text-white flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Grid className="w-3.5 h-3.5 text-[#c9a063]" />
                        More Tools & Apps
                      </span>
                      <span className="text-[10px] font-mono text-white/40">
                        {MORE_APPS.length} apps
                      </span>
                    </div>

                    <div className="space-y-3 pt-2">
                      {secondaryCategories.map(cat => {
                        const catItems = MORE_APPS.filter(a => a.category === cat);
                        if (!catItems.length) return null;

                        return (
                          <div key={cat} className="space-y-0.5">
                            <div className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/30 select-none">
                              {cat}
                            </div>
                            {catItems.map(app => {
                              const Icon = app.icon;
                              const isActive = normalizedActiveTab === app.id;

                              return (
                                <button
                                  key={app.id}
                                  onClick={() => {
                                    setActiveTab(app.id as any);
                                    setIsRailMoreMenuOpen(false);
                                  }}
                                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
                                    isActive
                                      ? 'bg-white/[0.1] text-white font-medium'
                                      : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                                  }`}
                                >
                                  <Icon
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      isActive ? 'text-[#c9a063]' : 'text-white/40'
                                    }`}
                                  />
                                  <span className="truncate">{app.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </nav>

        {/* Minimal Footer */}
        {!isRail && (
          <div className="p-3 border-t border-white/[0.06] text-[11px] text-white/40 flex items-center justify-between">
            <span className="font-mono">UTM {workingZone}</span>
            {openSettings && (
              <button
                onClick={openSettings}
                className="hover:text-white transition-colors"
                title="Workspace Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
};
