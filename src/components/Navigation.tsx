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
  ShieldAlert,
  Camera,
  Activity
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
  { id: 'templates', name: 'Overview & Templates', category: 'Overview', icon: FileSpreadsheet },
  { id: 'sensors', name: 'Field Hardware & Meteorology', category: 'Field & Map Tools', icon: Activity },
  { id: 'gis', name: 'GIS Map Studio', category: 'Field & Map Tools', icon: Layers },
  { id: 'gps', name: 'GNSS Field Surveyor', category: 'Field & Map Tools', icon: CompassIcon },
  { id: 'calc', name: 'Survey Calculator', category: 'Field & Map Tools', icon: Calculator },
  { id: 'convert', name: 'Coordinate Converter', category: 'Field & Map Tools', icon: Globe },
  { id: 'camera', name: 'GPS Map Camera', category: 'Field & Map Tools', icon: Camera },
  { id: 'geofence', name: 'Geofence Sentinel', category: 'Field & Map Tools', icon: ShieldAlert },
  { id: 'bhunaksha', name: 'BhuNaksha Digitizer', category: 'Cadastre & Exploration', icon: Scan },
  { id: 'cad', name: 'Cadastral Mapper', category: 'Cadastre & Exploration', icon: Layers2 },
  { id: 'bore', name: 'Borehole Stratigraphy', category: 'Cadastre & Exploration', icon: MapPin },
  { id: 'studio', name: 'Universal Converter', category: 'Cadastre & Exploration', icon: FileCode },
  { id: 'combine', name: 'Merge & Split', category: 'Cadastre & Exploration', icon: Layers2 },
  { id: 'off', name: 'Boundary Offset', category: 'Cadastre & Exploration', icon: Spline },
  { id: 'tut', name: 'Tutorials', category: 'Reference', icon: BookOpen },
  { id: 'help', name: 'Help & Docs', category: 'Reference', icon: HelpCircle }
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

  const categories = ['Overview', 'Field & Map Tools', 'Cadastre & Exploration', 'Reference'];

  const normalizedActiveTab =
    activeTab === 'merge' ? 'combine' :
    activeTab === 'offset' ? 'off' :
    activeTab === 'tutorials' ? 'tut' :
    activeTab === 'faq' ? 'help' :
    activeTab;

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
          onClick={handleClose}
        />
      )}

      {/* Minimal Sidebar Navigation */}
      <aside
        className={`fixed md:relative top-0 left-0 h-full z-30 flex flex-col bg-[#0d0d0d] border-r border-white/[0.06] text-[#d4d4d4] transition-all duration-150 ${
          isRail ? 'w-14' : 'w-60'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Top Header */}
        <div className="h-12 px-3 flex items-center justify-between border-b border-white/[0.06]">
          {!isRail && (
            <span className="text-xs font-semibold tracking-wide text-white/50 uppercase pl-1">
              Workspace
            </span>
          )}
          {setIsRail && (
            <button
              onClick={() => setIsRail(!isRail)}
              className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors ml-auto"
              title={isRail ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isRail ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 space-y-4 custom-scrollbar">
          {categories.map(cat => {
            const items = APPS_CONFIG.filter(app => app.category === cat);
            if (!items.length) return null;

            return (
              <div key={cat} className="space-y-0.5">
                {!isRail && (
                  <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/30 select-none">
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
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors group relative ${
                        isActive
                          ? 'bg-white/[0.08] text-white'
                          : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                      }`}
                      title={isRail ? app.name : undefined}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-[#c9a063]' : 'text-white/40 group-hover:text-white/80'
                        }`}
                      />
                      {!isRail && <span className="truncate text-left">{app.name}</span>}

                      {/* Rail Tooltip */}
                      {isRail && (
                        <div className="absolute left-full ml-2 px-2.5 py-1 bg-[#1a1a1a] border border-white/[0.08] rounded-md text-xs font-medium text-white whitespace-nowrap shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
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

        {/* Minimal Footer */}
        {!isRail && (
          <div className="p-3 border-t border-white/[0.06] text-[11px] text-white/40 flex items-center justify-between">
            <span className="font-mono">UTM {workingZone}</span>
            {openSettings && (
              <button
                onClick={openSettings}
                className="hover:text-white transition-colors"
                title="Settings"
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
