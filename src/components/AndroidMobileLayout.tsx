import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Layers,
  Camera,
  Navigation as CompassIcon,
  Calculator,
  Menu,
  Search,
  Settings,
  Sparkles,
  X,
  Crosshair,
  Activity,
  Sun,
  Moon
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
  isDark?: boolean;
  setIsDark?: (dark: boolean) => void;
}

export const AndroidMobileLayout: React.FC<AndroidMobileLayoutProps> = ({
  activeTab,
  setActiveTab,
  workingZone,
  openCommandPalette,
  openSettings,
  openAiModal,
  isDark = true,
  setIsDark = () => {}
}) => {
  const [isAppsDrawerOpen, setIsAppsDrawerOpen] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');

  const currentApp = APPS_CONFIG.find(a => a.id === activeTab) || APPS_CONFIG[0];

  const primaryMobileNav: { id: AppTabId; label: string; icon: any }[] = [
    { id: 'templates', label: 'Home', icon: FileSpreadsheet },
    { id: 'sensors', label: 'Sensors', icon: Activity },
    { id: 'gis', label: 'GIS', icon: Layers },
    { id: 'gps', label: 'GNSS', icon: CompassIcon },
    { id: 'camera', label: 'Camera', icon: Camera }
  ];

  const filteredApps = APPS_CONFIG.filter(
    app =>
      app.name.toLowerCase().includes(drawerSearch.toLowerCase()) ||
      app.category.toLowerCase().includes(drawerSearch.toLowerCase())
  );

  return (
    <>
      {/* Clean Mobile App Header */}
      <header className="md:hidden sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/[0.08] select-none h-12 px-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsAppsDrawerOpen(true)}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
            aria-label="Open App Drawer"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <div className="text-xs font-semibold text-white tracking-tight flex items-center gap-1.5">
              <span>{currentApp.name}</span>
            </div>
            <div className="text-[10px] text-white/40 font-mono leading-none">
              UTM {workingZone}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {isDark ? <Sun className="w-4 h-4 text-[#c9a063]" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={openAiModal}
            className="p-1.5 rounded-lg text-[#c9a063] bg-[#c9a063]/10 hover:bg-[#c9a063]/20 border border-[#c9a063]/20 transition-colors"
            title="AI Help"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          <button
            onClick={openCommandPalette}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Search"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            onClick={openSettings}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Clean Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0c0c0c]/95 backdrop-blur-md border-t border-white/[0.08] px-2 py-1 flex items-center justify-around select-none h-14">
        {primaryMobileNav.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors ${
                isActive ? 'text-[#c9a063]' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] mt-1 tracking-tight font-medium">
                {item.label}
              </span>
            </button>
          );
        })}

        {/* More Apps Button */}
        <button
          onClick={() => setIsAppsDrawerOpen(true)}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors ${
            !primaryMobileNav.some(n => n.id === activeTab) ? 'text-[#c9a063]' : 'text-white/40 hover:text-white/70'
          }`}
        >
          <Menu className="w-4 h-4" />
          <span className="text-[10px] mt-1 tracking-tight font-medium">More</span>
        </button>
      </nav>

      {/* Minimal Drawer: All Tools & Stations */}
      {isAppsDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="flex-1" onClick={() => setIsAppsDrawerOpen(false)} />
          <div className="bg-[#121212] border-t border-white/[0.08] rounded-t-2xl max-h-[80vh] flex flex-col p-4 shadow-2xl">
            {/* Sheet Handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />

            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-[#c9a063]" />
                <h2 className="text-sm font-semibold text-white">All Workspaces</h2>
              </div>
              <button
                onClick={() => setIsAppsDrawerOpen(false)}
                className="p-1 rounded-md text-white/50 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Search */}
            <div className="my-3 relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-white/40" />
              <input
                type="text"
                placeholder="Search tools..."
                value={drawerSearch}
                onChange={e => setDrawerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#c9a063]/50"
              />
            </div>

            {/* Apps Grid */}
            <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-2 py-1">
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
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-colors ${
                      isCurrent
                        ? 'bg-white/[0.08] border-white/[0.12] text-white'
                        : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.06] text-white/70'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isCurrent ? 'bg-[#c9a063]/20 text-[#c9a063]' : 'bg-white/[0.06] text-white/50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-medium truncate">{app.name}</div>
                      <div className="text-[10px] text-white/40 truncate">{app.category}</div>
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
