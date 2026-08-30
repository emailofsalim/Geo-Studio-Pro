import React, { useState, useEffect } from 'react';
import { X, Globe, Map, Moon, Sun, Download, Upload, Trash2, CheckCircle2, ShieldCheck, Database, RefreshCw, User, Mail, ExternalLink, Sparkles } from 'lucide-react';
import { LandUnitPreset } from '../types';
import { downloadBlob } from '../lib/zip';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workingZone: string;
  setWorkingZone: (z: string) => void;
  isDark?: boolean;
  setIsDark?: (d: boolean) => void;
  localLandUnitPreset: string;
  setLocalLandUnitPreset: (p: string) => void;
  customBighaM2: number;
  setCustomBighaM2: (m2: number) => void;
  customKathaPerBigha: number;
  setCustomKathaPerBigha: (k: number) => void;
  distanceUnit?: 'm' | 'ft';
  setDistanceUnit?: (u: 'm' | 'ft') => void;
  onExportProject?: () => void;
  onImportProject?: (file: File) => void;
  onClearAllData?: () => void;
}

export const LOCAL_LAND_PRESETS: Record<string, LandUnitPreset> = {
  none: { label: 'Off — Standard Hectares and Acres Only', note: '', hier: [], also: [] },
  bihar: {
    label: 'Bihar / Jharkhand (Chota Nagpur / Santhal Pargana)',
    note: '1 Bigha = 20 Katha = 400 Dhur (1 Bigha ≈ 2,529.29 m² = 27,225 sq ft)',
    hier: [{ label: 'bigha', sqft: 27225 }, { label: 'katha', sqft: 1361.25 }, { label: 'dhur', sqft: 68.0625 }],
    also: [{ label: 'dismil', sqft: 435.6 }]
  },
  wb: {
    label: 'West Bengal',
    note: '1 Bigha = 20 Katha = 1,600 sq yd (1 Bigha ≈ 1,337.80 m² = 14,400 sq ft)',
    hier: [{ label: 'bigha', sqft: 14400 }, { label: 'katha', sqft: 720 }],
    also: [{ label: 'dismil', sqft: 435.6 }]
  },
  assam: {
    label: 'Assam / North East',
    note: '1 Bigha = 5 Katha = 20 Lessa (1 Bigha ≈ 1,337.80 m² = 14,400 sq ft)',
    hier: [{ label: 'bigha', sqft: 14400 }, { label: 'katha', sqft: 2880 }],
    also: [{ label: 'dismil', sqft: 435.6 }]
  },
  up: {
    label: 'Uttar Pradesh (Standard Pucca Bigha)',
    note: '1 Pucca Bigha = 20 Biswa = 3,025 sq yd (≈ 2,529.29 m² = 27,225 sq ft)',
    hier: [{ label: 'bigha', sqft: 27225 }, { label: 'biswa', sqft: 1361.25 }],
    also: [{ label: 'dismil', sqft: 435.6 }]
  },
  custom: {
    label: 'Custom Local Land Unit',
    note: 'Enter exact square metres per bigha and katha subdivisions for your specific region.',
    hier: [],
    also: [{ label: 'dismil', sqft: 435.6 }]
  }
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  workingZone,
  setWorkingZone,
  isDark = true,
  setIsDark = (_d: boolean) => {},
  localLandUnitPreset,
  setLocalLandUnitPreset,
  customBighaM2,
  setCustomBighaM2,
  customKathaPerBigha,
  setCustomKathaPerBigha,
  distanceUnit = 'm',
  setDistanceUnit = (_u: 'm' | 'ft') => {},
  onExportProject = () => {},
  onImportProject = (_f: File) => {},
  onClearAllData = () => {}
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'land' | 'map' | 'storage' | 'about'>('general');
  const [defaultImagery, setDefaultImagery] = useState<string>(() => localStorage.getItem('geo_default_imagery') || 'google_satellite');
  const [defaultBasemapOpacity, setDefaultBasemapOpacity] = useState<number>(() => {
    const s = localStorage.getItem('geo_default_opacity');
    return s ? parseFloat(s) : 0.85;
  });

  const handleSaveMapDefaults = (provider: string, opacity: number) => {
    setDefaultImagery(provider);
    setDefaultBasemapOpacity(opacity);
    localStorage.setItem('geo_default_imagery', provider);
    localStorage.setItem('geo_default_opacity', opacity.toString());
  };

  useEffect(() => {
    if (isOpen) {
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

  if (!isOpen) return null;

  const zones: string[] = [];
  for (let z = 1; z <= 60; z++) zones.push(`${z}N`);
  for (let z = 1; z <= 60; z++) zones.push(`${z}S`);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#0f0f0f] rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh] cursor-default"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-[#0a0a0a]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#c9a063]/10 border border-[#c9a063]/30 text-[#c9a063] flex items-center justify-center font-serif italic text-sm font-bold">
              BS
            </div>
            <div>
              <h3 className="font-serif italic text-lg text-white">BhuStudio Workspace Settings</h3>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">UTM Projection, Land Units, and Preferences</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-white/5 px-6 bg-[#0a0a0a] gap-4 sm:gap-6 text-xs uppercase tracking-wider font-medium overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('general')}
            className={`py-3.5 border-b-2 transition-all shrink-0 ${
              activeSubTab === 'general'
                ? 'border-[#c9a063] text-[#c9a063] font-semibold'
                : 'border-transparent text-white/40 hover:text-white/80'
            }`}
          >
            Projection & Display
          </button>
          <button
            onClick={() => setActiveSubTab('land')}
            className={`py-3.5 border-b-2 transition-all shrink-0 ${
              activeSubTab === 'land'
                ? 'border-[#c9a063] text-[#c9a063] font-semibold'
                : 'border-transparent text-white/40 hover:text-white/80'
            }`}
          >
            Local Land Units
          </button>
          <button
            onClick={() => setActiveSubTab('map')}
            className={`py-3.5 border-b-2 transition-all shrink-0 ${
              activeSubTab === 'map'
                ? 'border-[#c9a063] text-[#c9a063] font-semibold'
                : 'border-transparent text-white/40 hover:text-white/80'
            }`}
          >
            Map & AI Defaults
          </button>
          <button
            onClick={() => setActiveSubTab('storage')}
            className={`py-3.5 border-b-2 transition-all shrink-0 ${
              activeSubTab === 'storage'
                ? 'border-[#c9a063] text-[#c9a063] font-semibold'
                : 'border-transparent text-white/40 hover:text-white/80'
            }`}
          >
            Backup & Cache
          </button>
          <button
            onClick={() => setActiveSubTab('about')}
            className={`py-3.5 border-b-2 transition-all shrink-0 ${
              activeSubTab === 'about'
                ? 'border-[#c9a063] text-[#c9a063] font-semibold'
                : 'border-transparent text-white/40 hover:text-white/80'
            }`}
          >
            About & Credits
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {activeSubTab === 'general' && (
            <div className="space-y-6">
              {/* Working UTM Zone */}
              <div className="p-5 rounded-xl bg-[#141414] border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white">
                    Active Global UTM Zone
                  </label>
                  <span className="text-xs font-mono font-semibold text-[#c9a063] bg-[#c9a063]/10 px-2.5 py-0.5 rounded border border-[#c9a063]/30">
                    Zone {workingZone}
                  </span>
                </div>
                <p className="text-xs text-white/50 leading-relaxed font-light">
                  Controls the primary geodetic projection zone across coordinate reprojection, field GPS survey logging, cadastral partitioning, and boundary safety offsets.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <select
                    value={workingZone}
                    onChange={e => setWorkingZone(e.target.value)}
                    className="flex-1 py-2.5 px-3.5 rounded-xl border border-white/10 bg-[#0a0a0a] text-white text-xs sm:text-sm focus:outline-none focus:border-[#c9a063] font-mono transition-all"
                  >
                    {zones.map(z => (
                      <option key={z} value={z}>
                        UTM Projection Zone {z}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Theme Settings */}
              <div className="p-5 rounded-xl bg-[#141414] border border-white/5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-white">Display Theme</h4>
                  <p className="text-xs text-white/50 mt-0.5 font-light">
                    Sophisticated Dark luxury palette with warm gold accents
                  </p>
                </div>
                <div className="flex bg-[#0a0a0a] p-1 rounded-full border border-white/10 gap-1">
                  <button
                    onClick={() => setIsDark(false)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      !isDark ? 'bg-white text-black font-semibold' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    <Sun className="w-3 h-3" /> Light
                  </button>
                  <button
                    onClick={() => setIsDark(true)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      isDark ? 'bg-[#c9a063] text-black font-bold' : 'text-white/40 hover:text-white'
                    }`}
                  >
                    <Moon className="w-3 h-3" /> Dark
                  </button>
                </div>
              </div>

              {/* Privacy Notice */}
              <div className="p-5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3.5">
                <ShieldCheck className="w-5 h-5 text-[#c9a063] shrink-0 mt-0.5" />
                <div className="text-xs text-white/80 space-y-1 font-light">
                  <p className="font-serif italic text-sm text-white font-medium">Local-Only Processing</p>
                  <p className="text-white/50 leading-relaxed">
                    All coordinate transformations, borehole compositing, and cadastral computations run entirely in memory on your device. No survey data is transmitted to external servers.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'land' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-white">
                  Regional Land Area Preset (India)
                </label>
                <p className="text-xs text-white/50 font-light">
                  Select your state or district custom unit to format land areas alongside Standard Hectares and Acres.
                </p>
                <select
                  value={localLandUnitPreset}
                  onChange={e => setLocalLandUnitPreset(e.target.value)}
                  className="w-full py-2.5 px-3.5 rounded-xl border border-white/10 bg-[#0a0a0a] text-white text-xs sm:text-sm focus:outline-none focus:border-[#c9a063] transition-all"
                >
                  {Object.keys(LOCAL_LAND_PRESETS).map(k => (
                    <option key={k} value={k}>
                      {LOCAL_LAND_PRESETS[k].label}
                    </option>
                  ))}
                </select>
              </div>

              {localLandUnitPreset === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[#141414] rounded-xl border border-white/10">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/60">
                      Square Metres (m²) per Bigha
                    </label>
                    <input
                      type="number"
                      value={customBighaM2}
                      onChange={e => setCustomBighaM2(parseFloat(e.target.value) || 2529.29)}
                      step="0.01"
                      className="w-full py-2 px-3 rounded-lg border border-white/10 bg-[#0a0a0a] text-white text-sm font-mono focus:border-[#c9a063] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/60">
                      Katha per Bigha
                    </label>
                    <input
                      type="number"
                      value={customKathaPerBigha}
                      onChange={e => setCustomKathaPerBigha(parseInt(e.target.value, 10) || 20)}
                      step="1"
                      className="w-full py-2 px-3 rounded-lg border border-white/10 bg-[#0a0a0a] text-white text-sm font-mono focus:border-[#c9a063] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {LOCAL_LAND_PRESETS[localLandUnitPreset]?.note && (
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-xs text-white/70 font-light leading-relaxed">
                  <b className="text-[#c9a063] font-serif italic">Conversion basis:</b> {LOCAL_LAND_PRESETS[localLandUnitPreset].note}
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'map' && (
            <div className="space-y-5">
              {/* Default Satellite Imagery Layer */}
              <div className="p-5 rounded-xl bg-[#141414] border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white">
                    Default Satellite & Map Imagery Provider
                  </label>
                  <span className="text-xs font-mono font-semibold text-cyan-400 bg-cyan-950/40 px-2.5 py-0.5 rounded border border-cyan-500/30">
                    Live Tiles
                  </span>
                </div>
                <p className="text-xs text-white/50 leading-relaxed font-light">
                  Choose the default basemap tile service loaded across GIS Map Studio, GPS Camera, and Vector Radar Canvases.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {[
                    { id: 'google_satellite', name: 'Google Satellite', desc: 'High-res aerial imagery' },
                    { id: 'google_hybrid', name: 'Google Hybrid', desc: 'Satellite with road overlay' },
                    { id: 'google_streets', name: 'Google Streets', desc: 'Standard vector street map' },
                    { id: 'osm_standard', name: 'OpenStreetMap', desc: 'Global community map' },
                    { id: 'opentopo', name: 'OpenTopoMap', desc: 'Topographic contour lines' }
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSaveMapDefaults(p.id, defaultBasemapOpacity)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        defaultImagery === p.id
                          ? 'border-[#c9a063] bg-[#c9a063]/10 text-white shadow-sm'
                          : 'border-white/5 bg-[#0a0a0a] text-white/60 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <div className="text-xs font-semibold text-white">{p.name}</div>
                      <div className="text-[10px] text-white/40 mt-0.5">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Opacity Slider */}
              <div className="p-5 rounded-xl bg-[#141414] border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-white">
                    Default Basemap Opacity
                  </label>
                  <span className="text-xs font-mono font-semibold text-[#c9a063]">
                    {Math.round(defaultBasemapOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={defaultBasemapOpacity}
                  onChange={e => handleSaveMapDefaults(defaultImagery, parseFloat(e.target.value))}
                  className="w-full accent-[#c9a063] cursor-pointer"
                />
              </div>

              {/* AI Assistant Configuration */}
              <div className="p-5 rounded-xl bg-[#141414] border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#c9a063]" />
                    AI Geomatics Copilot
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/30">
                    Active & Resilient
                  </span>
                </div>
                <p className="text-xs text-white/50 leading-relaxed font-light">
                  The AI Assistant is globally accessible across the entire application from the top bar beside search. It combines offline geodesy heuristics and Gemini intelligence to assist in traverse adjustments, mineral cutoffs, and area units.
                </p>
              </div>
            </div>
          )}

          {activeSubTab === 'storage' && (
            <div className="space-y-4">
              {/* Backup / Export */}
              <div className="p-5 rounded-xl bg-[#141414] border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-white">Export Project Workspace</h4>
                  <p className="text-xs text-white/50 mt-1 font-light">
                    Save all customized mine profiles, land presets, survey waypoints, and parameters into a portable .json project file.
                  </p>
                </div>
                <button
                  onClick={onExportProject}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-[#c9a063]/10 shrink-0"
                >
                  <Download className="w-4 h-4" /> Export JSON
                </button>
              </div>

              {/* Restore / Import */}
              <div className="p-5 rounded-xl bg-[#141414] border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-white">Restore Project Workspace</h4>
                  <p className="text-xs text-white/50 mt-1 font-light">
                    Load a previously exported .json project file to restore your customized workspace.
                  </p>
                </div>
                <label className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-semibold uppercase tracking-wider cursor-pointer transition-all shrink-0">
                  <Upload className="w-4 h-4 text-[#c9a063]" /> Load JSON File
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) onImportProject(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              {/* Clear All Storage */}
              <div className="p-5 rounded-xl bg-rose-950/20 border border-rose-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-300">Wipe Local Storage</h4>
                  <p className="text-xs text-rose-400/80 mt-1 font-light">
                    Erase all saved profiles, GPS waypoint logs, calculation history, and settings from this browser.
                  </p>
                </div>
                <button
                  onClick={onClearAllData}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-widest transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" /> Clear Cache
                </button>
              </div>
            </div>
          )}

          {activeSubTab === 'about' && (
            <div className="space-y-4">
              {/* Product Info */}
              <div className="p-5 rounded-xl bg-gradient-to-br from-[#141414] to-[#181818] border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="font-serif italic text-lg text-white font-semibold">BhuStudio</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#c9a063]/20 text-[#c9a063] border border-[#c9a063]/30">v3.0</span>
                  </div>
                  <span className="text-[11px] text-white/40 font-mono">Geomatics & Cadastral Suite</span>
                </div>
                <p className="text-xs text-white/70 leading-relaxed font-light">
                  A high-precision offline geomatics, geodesy, and cadastral mapping system built for field surveyors, civil engineers, and GIS specialists.
                </p>
              </div>

              {/* Developer Info Card */}
              <div className="p-5 rounded-xl bg-[#141414] border border-white/5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-[#c9a063] shrink-0">
                  <User className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-[#c9a063]">Software Development</div>
                  <h4 className="text-base font-serif font-semibold text-white mt-0.5">Developed by Md Salim Ansari</h4>
                  <p className="text-xs text-white/50 mt-0.5 font-light">Lead Creator & Geomatics Software Architect</p>
                </div>
              </div>

              {/* Feedback Email Card */}
              <div className="p-5 rounded-xl bg-[#141414] border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-[#c9a063] shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-white">Feedback & Support</h5>
                    <a
                      href="mailto:emailofsalim@gmail.com?subject=BhuStudio%20Feedback"
                      className="text-xs sm:text-sm font-mono text-[#c9a063] hover:underline flex items-center gap-1.5 mt-0.5"
                    >
                      <span>emailofsalim@gmail.com</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
                <a
                  href="mailto:emailofsalim@gmail.com?subject=BhuStudio%20Feedback"
                  className="px-4 py-2 rounded-full bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-semibold uppercase tracking-wider transition-colors shrink-0"
                >
                  Send Feedback
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 bg-[#0a0a0a] flex items-center justify-between">
          <span className="text-[11px] text-white/40 font-mono">
            Developed by Md Salim Ansari
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors uppercase tracking-wider"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
