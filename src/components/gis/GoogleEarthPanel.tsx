import React from 'react';
import {
  Globe,
  Sun,
  TrendingUp,
  Sliders,
  Layers,
  Compass,
  Navigation,
  Eye,
  Mountain,
  RotateCcw,
  Sparkles,
  Search,
  CheckCircle2,
  Wifi,
  WifiOff
} from 'lucide-react';
import { ImageryProvider, ImageryLayerConfig, ElevationProfileSummary, SolarPosition } from '../../lib/tileManager';

interface GoogleEarthPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Imagery settings
  imageryConfig: ImageryLayerConfig;
  onUpdateImageryConfig: (config: ImageryLayerConfig) => void;
  isOnline: boolean;
  // 3D Perspective View
  pitchDeg: number;
  onUpdatePitchDeg: (pitch: number) => void;
  headingDeg: number;
  onUpdateHeadingDeg: (heading: number) => void;
  onReset3DView: () => void;
  // Elevation Profile
  elevationProfile: ElevationProfileSummary | null;
  selectedFeatureName?: string;
  // Solar Lighting
  solarHour: number;
  onUpdateSolarHour: (hour: number) => void;
  solarPos: SolarPosition;
  solarEnabled: boolean;
  onToggleSolar: () => void;
  // Fly-to
  onFlyToCoord: (lon: number, lat: number) => void;
}

export const GoogleEarthPanel: React.FC<GoogleEarthPanelProps> = ({
  isOpen,
  onClose,
  imageryConfig,
  onUpdateImageryConfig,
  isOnline,
  pitchDeg,
  onUpdatePitchDeg,
  headingDeg,
  onUpdateHeadingDeg,
  onReset3DView,
  elevationProfile,
  selectedFeatureName,
  solarHour,
  onUpdateSolarHour,
  solarPos,
  solarEnabled,
  onToggleSolar,
  onFlyToCoord
}) => {
  const [activeTab, setActiveTab] = React.useState<'imagery' | '3d' | 'elevation' | 'solar'>('imagery');
  const [flyToQuery, setFlyToQuery] = React.useState('');

  if (!isOpen) return null;

  const handleFlyToSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flyToQuery.trim()) return;

    // Check if query is Lat, Lon format (e.g. "23.754, 86.425")
    const parts = flyToQuery.split(/[\s,]+/);
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        onFlyToCoord(lon, lat);
        return;
      }
    }

    // Common Geomatics / Mining Sites Presets
    const presets: Record<string, [number, number]> = {
      'dhanbad': [86.4304, 23.7957],
      'jharia': [86.4172, 23.7431],
      'singrauli': [82.6738, 24.1997],
      'bokaro': [85.9622, 23.7915],
      'korba': [82.7108, 22.3595],
      'goa': [73.8567, 15.2993],
      'bellary': [76.9214, 15.1394],
      'dubai': [55.2708, 25.2048],
      'tokyo': [139.6917, 35.6895],
      'london': [-0.1276, 51.5074],
      'san francisco': [-122.4194, 37.7749]
    };

    const key = flyToQuery.trim().toLowerCase();
    if (presets[key]) {
      onFlyToCoord(presets[key][0], presets[key][1]);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-slate-900/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col text-white animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 via-sky-500 to-emerald-400 p-0.5 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Globe className="w-4 h-4 text-sky-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm tracking-wide text-white">Google Earth & Satellite Studio</h2>
              {isOnline ? (
                <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Wifi className="w-2.5 h-2.5" />
                  Live Web
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <WifiOff className="w-2.5 h-2.5" />
                  Offline
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/50">High-res aerial imagery, 3D tilt, elevation slice & sunlight</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/10 transition-all text-xs"
        >
          ✕
        </button>
      </div>

      {/* Quick Fly-To Search Bar */}
      <div className="p-3 border-b border-white/10 bg-slate-950/40">
        <form onSubmit={handleFlyToSubmit} className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={flyToQuery}
            onChange={e => setFlyToQuery(e.target.value)}
            placeholder="Fly To Landmark or Lat, Lon (e.g. 23.79, 86.43)..."
            className="w-full pl-8 pr-16 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-sky-500 transition-all"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-0.5 bg-sky-500 hover:bg-sky-400 text-black font-bold text-[10px] rounded-lg transition-all"
          >
            Fly To
          </button>
        </form>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-slate-950/30 p-1 gap-1">
        <button
          onClick={() => setActiveTab('imagery')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'imagery'
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Satellite</span>
        </button>
        <button
          onClick={() => setActiveTab('3d')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === '3d'
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>3D Tilt</span>
        </button>
        <button
          onClick={() => setActiveTab('elevation')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'elevation'
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Mountain className="w-3.5 h-3.5" />
          <span>Elevation</span>
        </button>
        <button
          onClick={() => setActiveTab('solar')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'solar'
              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
          <span>Daylight</span>
        </button>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* TAB 1: SATELLITE IMAGERY SETTINGS */}
        {activeTab === 'imagery' && (
          <div className="space-y-4">
            {/* Primary Toggle Switch */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-white">Google Maps / Satellite Background</span>
                  {imageryConfig.enabled && (
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/50">Stream live aerial imagery under GIS vector features</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={imageryConfig.enabled}
                  onChange={e =>
                    onUpdateImageryConfig({ ...imageryConfig, enabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {/* Provider Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/80">Imagery Provider</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  {
                    id: 'google_satellite' as ImageryProvider,
                    name: 'Google Maps Satellite',
                    desc: 'Pure high-res optical satellite & aerial photography'
                  },
                  {
                    id: 'google_hybrid' as ImageryProvider,
                    name: 'Google Maps Hybrid',
                    desc: 'Satellite imagery overlaid with road network & place labels'
                  },
                  {
                    id: 'google_terrain' as ImageryProvider,
                    name: 'Google Maps Terrain',
                    desc: 'Topographic contour shading & geological relief'
                  },
                  {
                    id: 'google_roadmap' as ImageryProvider,
                    name: 'Google Maps Roadmap',
                    desc: 'Standard vector street map reference'
                  },
                  {
                    id: 'esri_satellite' as ImageryProvider,
                    name: 'Esri World Imagery',
                    desc: 'ArcGIS global high-resolution orthophoto basemap'
                  },
                  {
                    id: 'osm_standard' as ImageryProvider,
                    name: 'OpenStreetMap Standard',
                    desc: 'Open community cadastral and infrastructure cartography'
                  }
                ].map(prov => (
                  <button
                    key={prov.id}
                    onClick={() =>
                      onUpdateImageryConfig({
                        ...imageryConfig,
                        enabled: true,
                        provider: prov.id
                      })
                    }
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      imageryConfig.provider === prov.id && imageryConfig.enabled
                        ? 'bg-sky-500/20 border-sky-500 text-white shadow-md'
                        : 'bg-white/5 border-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white">{prov.name}</span>
                      {imageryConfig.provider === prov.id && imageryConfig.enabled && (
                        <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                      )}
                    </div>
                    <p className="text-[10px] text-white/40 mt-0.5">{prov.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Visual Adjustments */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <span className="font-bold text-xs text-white flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                <span>Layer Opacity & Visibility Calibration</span>
              </span>

              <div>
                <div className="flex items-center justify-between text-[11px] text-white/70 mb-1">
                  <span>Satellite Opacity</span>
                  <span className="font-mono text-sky-400">{Math.round(imageryConfig.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={imageryConfig.opacity}
                  onChange={e =>
                    onUpdateImageryConfig({ ...imageryConfig, opacity: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-white/70 mb-1">
                  <span>Image Brightness</span>
                  <span className="font-mono text-amber-400">{Math.round(imageryConfig.brightness * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={imageryConfig.brightness}
                  onChange={e =>
                    onUpdateImageryConfig({ ...imageryConfig, brightness: parseFloat(e.target.value) })
                  }
                  className="w-full accent-amber-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: 3D PERSPECTIVE TILT & ROTATION */}
        {activeTab === '3d' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-xs text-white">Google Earth 3D Perspective Tilt</h3>
                  <p className="text-[11px] text-white/50">Oblique camera pitch for realistic 3D depth</p>
                </div>
                <button
                  onClick={onReset3DView}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/15 rounded-lg text-[10px] font-semibold text-white/80 transition-all"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset 2D
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-white/70 mb-1">
                  <span>Pitch Tilt Angle</span>
                  <span className="font-mono text-sky-400">{pitchDeg}° (Oblique)</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={pitchDeg}
                  onChange={e => onUpdatePitchDeg(parseInt(e.target.value, 10))}
                  className="w-full accent-sky-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-white/30 mt-1 font-mono">
                  <span>0° (Top-Down)</span>
                  <span>30°</span>
                  <span>60° (3D Horizon)</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-white/70 mb-1">
                  <span>Camera Heading / Azimuth</span>
                  <span className="font-mono text-emerald-400">{headingDeg}° {headingDeg === 0 ? '(True North)' : ''}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="359"
                  step="1"
                  value={headingDeg}
                  onChange={e => onUpdateHeadingDeg(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Quick 3D Perspective Presets */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/80">3D Camera Angles</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    onUpdatePitchDeg(0);
                    onUpdateHeadingDeg(0);
                  }}
                  className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-xs text-white transition-all"
                >
                  <div className="font-bold text-sky-400">2D Plan Top-Down</div>
                  <div className="text-[10px] text-white/40">Pitch 0°, Heading 0°</div>
                </button>
                <button
                  onClick={() => {
                    onUpdatePitchDeg(35);
                    onUpdateHeadingDeg(45);
                  }}
                  className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-xs text-white transition-all"
                >
                  <div className="font-bold text-amber-400">3D Isometric View</div>
                  <div className="text-[10px] text-white/40">Pitch 35°, Heading 45°</div>
                </button>
                <button
                  onClick={() => {
                    onUpdatePitchDeg(55);
                    onUpdateHeadingDeg(0);
                  }}
                  className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-xs text-white transition-all"
                >
                  <div className="font-bold text-purple-400">Flight Simulator Horizon</div>
                  <div className="text-[10px] text-white/40">Pitch 55°, Heading 0°</div>
                </button>
                <button
                  onClick={() => {
                    onUpdatePitchDeg(45);
                    onUpdateHeadingDeg(180);
                  }}
                  className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-left text-xs text-white transition-all"
                >
                  <div className="font-bold text-emerald-400">South Oblique Angle</div>
                  <div className="text-[10px] text-white/40">Pitch 45°, Heading 180°</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ELEVATION PROFILE SLICE */}
        {activeTab === 'elevation' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-xs text-white flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                  <span>Google Earth Elevation Profile</span>
                </h3>
                {selectedFeatureName && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    {selectedFeatureName}
                  </span>
                )}
              </div>

              {elevationProfile && elevationProfile.points.length > 1 ? (
                <div>
                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="p-2 bg-black/40 rounded-xl border border-white/5 text-center">
                      <div className="text-[10px] text-white/50 uppercase">Min RL</div>
                      <div className="font-bold font-mono text-emerald-400 text-xs">
                        {elevationProfile.minElevationM.toFixed(1)}m
                      </div>
                    </div>
                    <div className="p-2 bg-black/40 rounded-xl border border-white/5 text-center">
                      <div className="text-[10px] text-white/50 uppercase">Max RL</div>
                      <div className="font-bold font-mono text-rose-400 text-xs">
                        {elevationProfile.maxElevationM.toFixed(1)}m
                      </div>
                    </div>
                    <div className="p-2 bg-black/40 rounded-xl border border-white/5 text-center">
                      <div className="text-[10px] text-white/50 uppercase">Avg Slope</div>
                      <div className="font-bold font-mono text-amber-400 text-xs">
                        {elevationProfile.avgSlopePct}%
                      </div>
                    </div>
                  </div>

                  {/* SVG Elevation Chart */}
                  <div className="h-32 bg-black/50 rounded-xl p-2 border border-white/10 relative flex flex-col justify-end">
                    <svg className="w-full h-full overflow-visible">
                      <defs>
                        <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05" />
                        </linearGradient>
                      </defs>
                      {(() => {
                        const pts = elevationProfile.points;
                        const minE = elevationProfile.minElevationM;
                        const maxE = Math.max(minE + 1, elevationProfile.maxElevationM);
                        const totalD = Math.max(1, elevationProfile.totalDistanceM);

                        const coords = pts.map(p => {
                          const xPct = (p.cumulativeDistM / totalD) * 100;
                          const yPct = 100 - ((p.elevationM - minE) / (maxE - minE)) * 80 - 10;
                          return `${xPct},${yPct}`;
                        });

                        const polyPoints = `0,100 ${coords.join(' ')} 100,100`;

                        return (
                          <>
                            <polygon points={polyPoints} fill="url(#elevGrad)" />
                            <polyline
                              points={coords.join(' ')}
                              fill="none"
                              stroke="#38bdf8"
                              strokeWidth="2"
                            />
                          </>
                        );
                      })()}
                    </svg>
                    <div className="flex justify-between text-[9px] text-white/40 font-mono mt-1">
                      <span>0.0m Start</span>
                      <span>Total: {elevationProfile.totalDistanceM.toFixed(1)}m</span>
                    </div>
                  </div>

                  <div className="mt-2 text-[11px] text-white/50 flex items-center justify-between">
                    <span>Gain: +{elevationProfile.elevationGainM}m</span>
                    <span>Loss: -{elevationProfile.elevationLossM}m</span>
                    <span>Max Grade: {elevationProfile.maxSlopePct}%</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-white/40 text-xs">
                  <Mountain className="w-8 h-8 mx-auto mb-2 text-white/20" />
                  <p>Select any line or polygon feature on the canvas, or use the <strong>Measure Tape</strong> to view its real-time elevation profile slice.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: SOLAR DAYLIGHT & SHADOWS */}
        {activeTab === 'solar' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-xs text-white">Solar Daylight & Shadow Simulator</h3>
                  <p className="text-[11px] text-white/50">Simulate sun angle and terrain shadow cast</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={solarEnabled}
                    onChange={onToggleSolar}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-white/70 mb-1">
                  <span>Time of Day (Solar Time)</span>
                  <span className="font-mono text-amber-400 font-bold">
                    {Math.floor(solarHour).toString().padStart(2, '0')}:
                    {Math.round((solarHour % 1) * 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="18"
                  step="0.25"
                  value={solarHour}
                  onChange={e => onUpdateSolarHour(parseFloat(e.target.value))}
                  className="w-full accent-amber-400 h-1.5 bg-white/10 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-white/30 mt-1 font-mono">
                  <span>06:00 (Dawn)</span>
                  <span>12:00 (Noon)</span>
                  <span>18:00 (Dusk)</span>
                </div>
              </div>

              {/* Solar Metrics */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                <div className="p-2 bg-black/40 rounded-xl border border-white/5">
                  <div className="text-[10px] text-white/50">Sun Azimuth</div>
                  <div className="font-mono text-xs font-bold text-amber-300">{solarPos.azimuthDeg}°</div>
                </div>
                <div className="p-2 bg-black/40 rounded-xl border border-white/5">
                  <div className="text-[10px] text-white/50">Sun Elevation Angle</div>
                  <div className="font-mono text-xs font-bold text-amber-300">{solarPos.elevationDeg}°</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
