import React from 'react';
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
  Sparkles,
  ShieldAlert,
  Camera
} from 'lucide-react';

export type AppTabId =
  | 'templates'
  | 'gis'
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
  workingZone?: string;
}

export const APPS_CONFIG: { id: AppTabId; name: string; category: string; icon: any }[] = [
  { id: 'templates', name: 'Home & Templates', category: 'Overview', icon: FileSpreadsheet },
  { id: 'gis', name: 'GIS Map Studio', category: 'Conversion & GIS', icon: Layers },
  { id: 'camera', name: 'GPS Map Camera', category: 'Field & Coordinates', icon: Camera },
  { id: 'gps', name: 'GPS Field Surveyor', category: 'Field & Coordinates', icon: CompassIcon },
  { id: 'geofence', name: 'Geofence Sentinel', category: 'Field & Coordinates', icon: ShieldAlert },
  { id: 'convert', name: 'Coordinate Converter', category: 'Field & Coordinates', icon: Globe },
  { id: 'calc', name: 'Survey Calculator', category: 'Field & Coordinates', icon: Calculator },
  { id: 'studio', name: 'Format Converter', category: 'Conversion & GIS', icon: FileCode },
  { id: 'combine', name: 'Merge & Split', category: 'Conversion & GIS', icon: Layers2 },
  { id: 'bhunaksha', name: 'BhuNaksha Digitizer', category: 'Exploration & Cadastre', icon: Scan },
  { id: 'bore', name: 'Borehole Mapper', category: 'Exploration & Cadastre', icon: MapPin },
  { id: 'cad', name: 'Cadastral Mapper', category: 'Exploration & Cadastre', icon: Layers2 },
  { id: 'off', name: 'Boundary Offset', category: 'Exploration & Cadastre', icon: Spline },
  { id: 'tut', name: 'Tutorial Zone', category: 'Knowledge', icon: BookOpen },
  { id: 'help', name: 'Help & Tips', category: 'Knowledge', icon: HelpCircle }
];

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
  workingZone = '45N'
}) => {
  const mobileOpen = isOpen !== undefined ? isOpen : isMobileOpen;
  const handleClose = () => {
    if (onClose) onClose();
    if (setIsMobileOpen) setIsMobileOpen(false);
  };

  const categories = ['Overview', 'Field & Coordinates', 'Conversion & GIS', 'Exploration & Cadastre', 'Knowledge'];

  // Tab normalization
  const normalizedActiveTab = activeTab === 'merge' ? 'combine' : activeTab === 'offset' ? 'off' : activeTab === 'tutorials' ? 'tut' : activeTab === 'faq' ? 'help' : activeTab;

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={handleClose}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen z-50 flex flex-col bg-[#0f0f0f] border-r border-white/5 text-[#d4d4d4] transition-all duration-300 shadow-2xl ${
          isRail ? 'w-20' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Brand Header */}
        <div className="p-6 pb-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-2xl font-serif italic text-[#c9a063] tracking-tight">GeoStudio</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 mt-0.5">Geomatics Intelligence</p>
          </div>
          {setIsRail && (
            <button
              onClick={() => setIsRail(!isRail)}
              className="hidden md:flex p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              title={isRail ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isRail ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Working Zone Quick Badge */}
        {!isRail && (
          <div className="mx-4 mt-4 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
            <span className="text-white/40 text-[10px] uppercase tracking-widest font-medium">Zone Active</span>
            <span className="font-mono text-xs font-semibold text-[#c9a063] bg-[#c9a063]/10 px-2 py-0.5 rounded border border-[#c9a063]/30">
              UTM {workingZone}
            </span>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4 custom-scrollbar">
          {categories.map(cat => {
            const items = APPS_CONFIG.filter(app => app.category === cat);
            if (!items.length) return null;

            return (
              <div key={cat} className="space-y-1">
                {!isRail && (
                  <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/30 select-none">
                    {cat}
                  </div>
                )}
                {items.map(app => {
                  const Icon = app.icon;
                  const isActive =
                    normalizedActiveTab === app.id ||
                    (app.id === 'combine' && activeTab === 'merge') ||
                    (app.id === 'off' && activeTab === 'offset') ||
                    (app.id === 'tut' && activeTab === 'tutorials') ||
                    (app.id === 'help' && activeTab === 'faq');

                  return (
                    <button
                      key={app.id}
                      onClick={() => {
                        setActiveTab(app.id as any);
                        handleClose();
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all group relative ${
                        isActive
                          ? 'bg-white/5 border border-white/10 text-white font-medium shadow-xs'
                          : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                      title={isRail ? app.name : undefined}
                    >
                      {isActive ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#c9a063] shrink-0"></div>
                      ) : (
                        <Icon className="w-4 h-4 text-white/40 group-hover:text-white shrink-0 transition-colors" />
                      )}
                      {!isRail && <span className="truncate">{app.name}</span>}
                      {isActive && !isRail && (
                        <span className="ml-auto text-[9px] uppercase tracking-wider text-[#c9a063] font-serif italic">
                          active
                        </span>
                      )}
                      {isRail && (
                        <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#141414] border border-white/10 rounded-lg text-xs font-medium text-white whitespace-nowrap shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                          {app.name}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer Info */}
        <div className="p-4 border-t border-white/5 bg-[#0f0f0f] mt-auto">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-7 h-7 rounded-full bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-[10px] font-mono text-[#c9a063]">
              GS
            </div>
            <div className="text-xs">
              <p className="text-white text-[11px] font-medium leading-tight font-serif italic">GeoStudio Pro</p>
              <p className="text-[9px] uppercase tracking-widest text-white/40">v4.8.2 Suite</p>
            </div>
          </div>
          <div className="text-[9px] text-center uppercase tracking-[0.2em] text-white/20">
            Offline Field Engine
          </div>
        </div>
      </aside>
    </>
  );
};

