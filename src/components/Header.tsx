import React from 'react';
import {
  Menu,
  Moon,
  Sun,
  Search,
  Settings,
  ShieldCheck,
  Compass,
  Play,
  Sparkles
} from 'lucide-react';
import { AppTabId, APPS_CONFIG } from './Navigation';

interface HeaderProps {
  activeTab: AppTabId;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  openCommandPalette: () => void;
  openSettings: () => void;
  openTour: () => void;
  setIsMobileOpen: (open: boolean) => void;
  hasGpsFix: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  isDark,
  setIsDark,
  openCommandPalette,
  openSettings,
  openTour,
  setIsMobileOpen,
  hasGpsFix
}) => {
  const currentApp = APPS_CONFIG.find(a => a.id === activeTab) || APPS_CONFIG[0];

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-8 py-3.5 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/5 transition-colors">
      {/* Left: Mobile menu toggle + Active App Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2 -ml-2 rounded-xl text-white/60 hover:text-white hover:bg-white/5 md:hidden transition-colors"
          aria-label="Open mobile navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <h2 className="font-serif text-lg sm:text-xl text-white italic tracking-tight font-normal">
            {currentApp.name}
          </h2>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-[0.15em] font-medium bg-[#c9a063]/10 text-[#c9a063] border border-[#c9a063]/25">
            <ShieldCheck className="w-3 h-3 text-[#c9a063]" />
            100% Offline
          </span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* GPS Live Pill */}
        {hasGpsFix && (
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs font-medium animate-pulse">
            <Compass className="w-3.5 h-3.5" />
            <span className="text-[11px] font-mono tracking-tight">GNSS Fix Active</span>
          </div>
        )}

        {/* Guided Tour Trigger */}
        <button
          onClick={openTour}
          className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-medium transition-all"
          title="Start interactive walkthrough for this tool"
        >
          <Play className="w-3 h-3 text-[#c9a063] fill-[#c9a063]" />
          <span className="text-[11px] uppercase tracking-wider">Workflow Guide</span>
        </button>

        {/* Search / Command Palette Button */}
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-all border border-white/10"
          title="Search tools or commands (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-white/40" />
          <span className="hidden md:inline font-serif italic text-white/50">Search interface...</span>
          <kbd className="hidden sm:inline px-1.5 py-0.5 text-[9px] font-mono bg-white/10 text-white/60 rounded border border-white/10">
            ⌘K
          </kbd>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={() => setIsDark(!isDark)}
          className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors"
          title={isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun className="w-4 h-4 text-[#c9a063]" /> : <Moon className="w-4 h-4 text-white/70" />}
        </button>

        {/* Settings button */}
        <button
          onClick={openSettings}
          className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors"
          title="Open Settings"
          aria-label="Open Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

