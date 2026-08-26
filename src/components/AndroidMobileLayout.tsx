import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Layers,
  Camera,
  Navigation as CompassIcon,
  ShieldAlert,
  Globe,
  Calculator,
  FileCode,
  Layers2,
  Scan,
  MapPin,
  Spline,
  BookOpen,
  HelpCircle,
  Menu,
  Search,
  Settings,
  Plus,
  Crosshair,
  Radio,
  Battery,
  Wifi,
  Clock,
  Sparkles,
  X,
  Compass,
  Maximize,
  Check,
  ChevronUp
} from 'lucide-react';
import { AppTabId, APPS_CONFIG } from './Navigation';

interface AndroidMobileLayoutProps {
  activeTab: AppTabId;
  setActiveTab: (tab: AppTabId) => void;
  workingZone: string;
  setWorkingZone: (zone: string) => void;
  openCommandPalette: () => void;
  openSettings: () => void;
  openAiModal: () => void;
  hasGpsFix?: boolean;
}

export const AndroidMobileLayout: React.FC<AndroidMobileLayoutProps> = ({
  activeTab,
  setActiveTab,
  workingZone,
  setWorkingZone,
  openCommandPalette,
  openSettings,
  openAiModal,
  hasGpsFix = false
}) => {
  const [currentTime, setCurrentTime] = useState('');
  const [isAppsDrawerOpen, setIsAppsDrawerOpen] = useState(false);
  const [isQuickFabOpen, setIsQuickFabOpen] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const currentApp = APPS_CONFIG.find(a => a.id === activeTab) || APPS_CONFIG[0];

  const primaryMobileNav: { id: AppTabId; label: string; icon: any }[] = [
    { id: 'templates', label: 'Projects', icon: FileSpreadsheet },
    { id: 'gis', label: 'GIS Map', icon: Layers },
    { id: 'gps', label: 'GPS Rover', icon: CompassIcon },
    { id: 'calc', label: 'COGO Calc', icon: Calculator },
    { id: 'camera', label: 'Survey Cam', icon: Camera }
  ];

  const filteredApps = APPS_CONFIG.filter(
    app =>
      app.name.toLowerCase().includes(drawerSearch.toLowerCase()) ||
      app.category.toLowerCase().includes(drawerSearch.toLowerCase())
  );

  return (
    <>
      {/* 1. Android Top System & Instrument Telemetry Status Bar */}
      <div className="md:hidden sticky top-0 z-40 bg-[#0a0a0a] border-b border-white/10 select-none">
        {/* Android Native Status Bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-[#050505] text-[10px] text-white/70 font-mono">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">{currentTime}</span>
            <span className="text-white/40">•</span>
            <div className="flex items-center gap-1 text-emerald-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>RTK FIX</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 text-white/80">
              <Radio className="w-2.5 h-2.5 text-[#c9a063]" />
              <span>18 Sat</span>
            </div>
            <span className="text-white/40">|</span>
            <div className="flex items-center gap-0.5 text-white/80">
              <span>HDOP 0.8</span>
            </div>
            <span className="text-white/40">|</span>
            <div className="flex items-center gap-0.5 text-emerald-400">
              <Battery className="w-3 h-3" />
              <span>96%</span>
            </div>
          </div>
        </div>

        {/* Android Survey Controller App Bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#121212]">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsAppsDrawerOpen(true)}
              className="p-2 rounded-xl bg-white/5 active:bg-white/15 border border-white/10 text-white"
              aria-label="Open All Survey Stations"
            >
              <Menu className="w-4 h-4 text-[#c9a063]" />
            </button>

            <div>
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>{currentApp.name}</span>
              </h1>
              <div className="flex items-center gap-1.5 text-[10px] text-white/50 font-mono">
                <span className="text-[#c9a063] font-bold">UTM {workingZone}</span>
                <span>•</span>
                <span>WGS84</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* AI Assistant Pill */}
            <button
              onClick={openAiModal}
              className="p-2 rounded-xl bg-[#c9a063]/15 border border-[#c9a063]/30 text-[#c9a063] active:scale-95 transition-transform"
              title="AI Consultant"
            >
              <Sparkles className="w-4 h-4" />
            </button>

            {/* Quick Search */}
            <button
              onClick={openCommandPalette}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/70 active:bg-white/10"
              title="Search"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Settings */}
            <button
              onClick={openSettings}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/70 active:bg-white/10"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Floating Action Button (FAB) for Quick Survey Measurement / Action */}
      <div className="md:hidden fixed bottom-20 right-4 z-40">
        <button
          onClick={() => setIsQuickFabOpen(!isQuickFabOpen)}
          className={`w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center border transition-all duration-200 ${
            isQuickFabOpen
              ? 'bg-[#181818] border-white/20 text-white rotate-45'
              : 'bg-[#c9a063] border-[#c9a063] text-black shadow-[#c9a063]/30 hover:scale-105 active:scale-95'
          }`}
          aria-label="Quick Survey Measure Action"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>

        {/* Quick Actions Radial / Vertical Menu */}
        {isQuickFabOpen && (
          <div className="absolute bottom-16 right-0 w-56 bg-[#161616] border border-white/15 rounded-2xl shadow-2xl p-2 space-y-1.5 text-xs text-white z-50 animate-in fade-in slide-in-from-bottom-3 duration-150">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#c9a063]">
              Quick Field Actions
            </div>
            <button
              onClick={() => {
                setActiveTab('gps');
                setIsQuickFabOpen(false);
              }}
              className="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-2.5 text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-[#c9a063]/20 text-[#c9a063] flex items-center justify-center">
                <Crosshair className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-white">Log GPS Fix</div>
                <div className="text-[10px] text-white/50">Stack & store current epoch</div>
              </div>
            </button>

            <button
              onClick={() => {
                setActiveTab('camera');
                setIsQuickFabOpen(false);
              }}
              className="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-2.5 text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-white">Geostamp Photo</div>
                <div className="text-[10px] text-white/50">Snap with HUD overlay</div>
              </div>
            </button>

            <button
              onClick={() => {
                setActiveTab('calc');
                setIsQuickFabOpen(false);
              }}
              className="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-2.5 text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <Calculator className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-white">COGO Inverse</div>
                <div className="text-[10px] text-white/50">Bearing & Distance calc</div>
              </div>
            </button>

            <button
              onClick={() => {
                setActiveTab('convert');
                setIsQuickFabOpen(false);
              }}
              className="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-2.5 text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-white">Transform Datum</div>
                <div className="text-[10px] text-white/50">Lat/Lon ↔ UTM ↔ Cassini</div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* 3. Android Bottom Navigation Bar (Material Design 3 Controller style) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0e0e0e]/95 backdrop-blur-md border-t border-white/10 px-2 py-1.5 flex items-center justify-around select-none">
        {primaryMobileNav.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setIsQuickFabOpen(false);
              }}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
                isActive ? 'text-white' : 'text-white/40 active:text-white'
              }`}
            >
              <div
                className={`w-10 h-7 rounded-full flex items-center justify-center transition-all ${
                  isActive ? 'bg-[#c9a063] text-black shadow-lg shadow-[#c9a063]/30 font-bold' : 'bg-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5]' : ''}`} />
              </div>
              <span className={`text-[10px] mt-0.5 tracking-tight ${isActive ? 'font-bold text-[#c9a063]' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}

        {/* 6th: "All Modules" Sheet Launcher */}
        <button
          onClick={() => setIsAppsDrawerOpen(true)}
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-white/40 active:text-white ${
            !primaryMobileNav.some(n => n.id === activeTab) ? 'text-[#c9a063]' : ''
          }`}
        >
          <div
            className={`w-10 h-7 rounded-full flex items-center justify-center transition-all ${
              !primaryMobileNav.some(n => n.id === activeTab)
                ? 'bg-[#c9a063] text-black shadow-lg shadow-[#c9a063]/30'
                : 'bg-white/5'
            }`}
          >
            <Menu className="w-4 h-4" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">More Apps</span>
        </button>
      </nav>

      {/* 4. Android Bottom Sheet Drawer: All 15 Surveying Stations & Modules */}
      {isAppsDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="flex-1"
            onClick={() => setIsAppsDrawerOpen(false)}
          />
          <div className="bg-[#121212] border-t border-white/15 rounded-t-3xl max-h-[85vh] flex flex-col p-4 shadow-2xl animate-in slide-in-from-bottom duration-250">
            {/* Sheet Handle */}
            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-3" />

            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-[#c9a063]" />
                <h2 className="text-base font-bold text-white">Geomatics Workstations</h2>
              </div>
              <button
                onClick={() => setIsAppsDrawerOpen(false)}
                className="p-1.5 rounded-full bg-white/10 text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Search */}
            <div className="my-3 relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-white/40" />
              <input
                type="text"
                placeholder="Search survey station or tool..."
                value={drawerSearch}
                onChange={e => setDrawerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#1a1a1a] border border-white/10 rounded-xl text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#c9a063]"
              />
            </div>

            {/* Apps Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-2.5 py-2">
              {filteredApps.map(app => {
                const Icon = app.icon;
                const isCurrent = activeTab === app.id;

                return (
                  <button
                    key={app.id}
                    onClick={() => {
                      setActiveTab(app.id);
                      setIsAppsDrawerOpen(false);
                    }}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between gap-2 transition-all ${
                      isCurrent
                        ? 'bg-[#c9a063]/15 border-[#c9a063] text-white shadow-lg'
                        : 'bg-[#181818] hover:bg-[#202020] border-white/10 text-white/80 active:scale-98'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          isCurrent ? 'bg-[#c9a063] text-black font-bold' : 'bg-white/10 text-[#c9a063]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                        {app.category.split(' ')[0]}
                      </span>
                    </div>
                    <div>
                      <div className="font-bold text-xs leading-tight text-white">{app.name}</div>
                      <div className="text-[10px] text-white/40 mt-0.5">{app.category}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
