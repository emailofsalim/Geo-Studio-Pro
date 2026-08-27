import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Globe,
  Calculator,
  MapPin,
  Layers,
  FileSpreadsheet,
  Compass,
  FileCode,
  Layers2,
  Spline,
  BookOpen,
  HelpCircle,
  Moon,
  Sun,
  Settings,
  Trash2,
  ArrowRight,
  Sparkles,
  Play,
  Keyboard,
  ShieldCheck,
  Camera,
  ShieldAlert,
  X
} from 'lucide-react';
import { AppTabId, APPS_CONFIG } from './Navigation';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  setActiveTab: (tab: AppTabId) => void;
  isDark?: boolean;
  setIsDark?: (d: boolean) => void;
  openSettings?: () => void;
  onOpenSettings?: () => void;
  onOpenShortcuts?: () => void;
  onOpenTour?: () => void;
  onOpenAi?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  setActiveTab,
  isDark,
  setIsDark,
  openSettings,
  onOpenSettings,
  onOpenShortcuts,
  onOpenTour,
  onOpenAi
}) => {
  const isOnline = useOnlineStatus();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      const handleGlobalEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      };
      window.addEventListener('keydown', handleGlobalEsc);
      return () => window.removeEventListener('keydown', handleGlobalEsc);
    }
  }, [isOpen, onClose]);

  const handleSettings = onOpenSettings || openSettings;

  const actions = [
    ...APPS_CONFIG.map(app => ({
      id: `app-${app.id}`,
      title: `Open ${app.name}`,
      category: 'Applications & Tools',
      icon: app.icon,
      run: () => {
        setActiveTab(app.id);
        onClose();
      }
    })),
    ...(onOpenAi && isOnline ? [{
      id: 'act-ai',
      title: 'Open BhuNex AI Assistant',
      category: 'AI Assistant',
      icon: Sparkles,
      run: () => {
        onOpenAi();
        onClose();
      }
    }] : []),
    ...(onOpenTour ? [{
      id: 'act-tour',
      title: 'Start Interactive Feature Tour & Workflow Guide',
      category: 'Help & Tutorials',
      icon: Play,
      run: () => {
        onOpenTour();
        onClose();
      }
    }] : []),
    ...(onOpenShortcuts ? [{
      id: 'act-shortcuts',
      title: 'View Keyboard Shortcuts Matrix',
      category: 'Help & Navigation',
      icon: Keyboard,
      run: () => {
        onOpenShortcuts();
        onClose();
      }
    }] : []),
    ...(setIsDark ? [{
      id: 'act-theme',
      title: isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode',
      category: 'Appearance',
      icon: isDark ? Sun : Moon,
      run: () => {
        setIsDark(!isDark);
        onClose();
      }
    }] : []),
    ...(handleSettings ? [{
      id: 'act-settings',
      title: 'Open Settings, CRS Zones & Land Units',
      category: 'Settings',
      icon: Settings,
      run: () => {
        handleSettings();
        onClose();
      }
    }] : [])
  ];

  const filtered = actions.filter(a =>
    a.title.toLowerCase().includes(query.toLowerCase().trim()) ||
    a.category.toLowerCase().includes(query.toLowerCase().trim())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].run();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 px-3 sm:px-4 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#0f0f0f] rounded-2xl shadow-2xl border border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150 cursor-default"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 sm:px-5 border-b border-white/5 gap-2">
          <Search className="w-4 h-4 text-[#c9a063] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or jump to an application..."
            className="w-full py-3.5 sm:py-4 px-2 sm:px-3 bg-transparent text-white placeholder-white/30 text-xs sm:text-sm focus:outline-none font-sans"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono bg-white/5 text-white/40 rounded border border-white/10">
              ESC
            </kbd>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Close (Esc)"
              aria-label="Close Command Palette"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-white/40 font-light">
              No matching commands or tools found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.run}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-white/5 border border-white/10 text-white font-medium shadow-xs'
                      : 'text-white/60 hover:bg-white/5 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isSelected ? (
                      <div className="w-1.5 h-1.5 rounded-full bg-[#c9a063]"></div>
                    ) : (
                      <Icon className="w-4 h-4 text-white/40" />
                    )}
                    <span>{item.title}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-white/30 font-mono">{item.category}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 sm:px-5 py-2.5 bg-[#0a0a0a] border-t border-white/5 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/40">
          <span className="hidden sm:inline">Navigate with <kbd className="font-mono text-white/60">↑</kbd> <kbd className="font-mono text-white/60">↓</kbd></span>
          <button
            onClick={onClose}
            className="sm:hidden text-white/60 hover:text-white font-medium py-1"
          >
            Tap anywhere or Click here to close
          </button>
          <span>Select with <kbd className="font-mono text-white/60">Enter</kbd></span>
        </div>
      </div>
    </div>
  );
};
