import React from 'react';
import {
  Hand,
  MousePointer,
  Spline,
  MapPin,
  Ruler,
  Undo2,
  Redo2,
  Trash2,
  Magnet,
  Grid,
  Tag,
  Maximize2,
  Sparkles,
  FileDown,
  Globe,
  CheckCircle2,
  Mountain,
  Compass,
  Lock,
  Unlock,
  RefreshCw,
  Navigation
} from 'lucide-react';
import { GisTool } from './gisTypes';
import { ImageryLayerConfig, ImageryProvider } from '../../lib/tileManager';

interface GisToolbarProps {
  activeTool: GisTool;
  onSelectTool: (tool: GisTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hasSelectedFeature: boolean;
  onDeleteSelected: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  snapGrid: boolean;
  onToggleSnapGrid: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  basemapTheme: string;
  onChangeBasemap: (theme: any) => void;
  onFitView: () => void;
  onOpenAiCopilot: () => void;
  onExportMap: () => void;
  // Satellite Imagery & Google Earth Props
  imageryConfig: ImageryLayerConfig;
  onToggleImagery: () => void;
  onChangeImageryProvider: (provider: ImageryProvider) => void;
  onOpenGoogleEarth: () => void;
  pitchDeg: number;
  isOnline: boolean;
  // Map Lock & Live Map Refresh Controls
  isMapLocked?: boolean;
  onToggleMapLock?: () => void;
  onRefreshMapTiles?: () => void;
  onLiveGpsLocate?: () => void;
  isLocatingGps?: boolean;
}

export const GisToolbar: React.FC<GisToolbarProps> = ({
  activeTool,
  onSelectTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasSelectedFeature,
  onDeleteSelected,
  snapEnabled,
  onToggleSnap,
  snapGrid,
  onToggleSnapGrid,
  showGrid,
  onToggleGrid,
  showLabels,
  onToggleLabels,
  basemapTheme,
  onChangeBasemap,
  onFitView,
  onOpenAiCopilot,
  onExportMap,
  imageryConfig,
  onToggleImagery,
  onChangeImageryProvider,
  onOpenGoogleEarth,
  pitchDeg,
  isOnline,
  isMapLocked = false,
  onToggleMapLock,
  onRefreshMapTiles,
  onLiveGpsLocate,
  isLocatingGps = false
}) => {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-200 dark:border-white/5">
      {/* Left: Tools & Edit Stack */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Undo / Redo / Delete Group */}
        <div className="flex items-center bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo Last Action (Ctrl+Z)"
            className="p-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo Action (Ctrl+Y)"
            className="p-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          {hasSelectedFeature && (
            <button
              onClick={onDeleteSelected}
              title="Delete Selected Feature (Delete / Backspace)"
              className="p-1.5 rounded-lg text-xs font-semibold text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all ml-0.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Primary Tool Palette */}
        <div className="flex items-center bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10">
          <button
            onClick={() => onSelectTool('pan')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              activeTool === 'pan'
                ? 'bg-[#c9a063] text-black shadow-sm'
                : 'text-slate-700 dark:text-white/60 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Pan Viewport (Drag with hand)"
          >
            <Hand className="w-3.5 h-3.5" />
            <span>Pan</span>
          </button>

          <button
            onClick={() => onSelectTool('select')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              activeTool === 'select'
                ? 'bg-[#c9a063] text-black shadow-sm'
                : 'text-slate-700 dark:text-white/60 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Select & Move Feature (Click feature to inspect/translate)"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Select</span>
          </button>

          <button
            onClick={() => onSelectTool('edit_vertex')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              activeTool === 'edit_vertex'
                ? 'bg-amber-500 text-black font-bold shadow-sm'
                : 'text-amber-500 dark:text-amber-400 hover:bg-amber-500/10'
            }`}
            title="Vertex Grip Edit: Drag node handles, click '+' to add vertex, right-click to delete vertex"
          >
            <Spline className="w-3.5 h-3.5" />
            <span>Edit Vertices</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-300 dark:bg-white/10 mx-1" />

          <button
            onClick={() => onSelectTool('draw_point')}
            className={`px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              activeTool === 'draw_point'
                ? 'bg-emerald-500 text-black font-bold shadow-sm'
                : 'text-slate-700 dark:text-white/60 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Add Point Feature"
          >
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>+ Point</span>
          </button>

          <button
            onClick={() => onSelectTool('draw_line')}
            className={`px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              activeTool === 'draw_line'
                ? 'bg-purple-500 text-white font-bold shadow-sm'
                : 'text-slate-700 dark:text-white/60 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Digitize Polyline Corridor"
          >
            <span>+ Line</span>
          </button>

          <button
            onClick={() => onSelectTool('draw_poly')}
            className={`px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              activeTool === 'draw_poly'
                ? 'bg-sky-500 text-black font-bold shadow-sm'
                : 'text-slate-700 dark:text-white/60 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Digitize Enclosed Polygon Parcel"
          >
            <span>+ Polygon</span>
          </button>

          <button
            onClick={() => onSelectTool('measure')}
            className={`px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              activeTool === 'measure'
                ? 'bg-pink-500 text-white font-bold shadow-sm'
                : 'text-slate-700 dark:text-white/60 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Geodesic Tape: Distance, Bearing & Enclosed Area"
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Measure</span>
          </button>
        </div>
      </div>

      {/* Right: Satellite Reference, Snapping, Visual Display & Actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* GOOGLE SATELLITE / MAP BACKGROUND CHECKBOX OPTION */}
        <div className="flex items-center bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10 gap-1">
          <button
            onClick={onToggleImagery}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              imageryConfig.enabled
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'bg-transparent text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Toggle Google Maps / Satellite Aerial Background Reference on/off"
          >
            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${imageryConfig.enabled ? 'border-slate-900 bg-slate-900 text-emerald-400' : 'border-slate-400 dark:border-white/40'}`}>
              {imageryConfig.enabled && <span className="text-[10px] leading-none">✓</span>}
            </div>
            <span>Google Map / Satellite</span>
          </button>

          {imageryConfig.enabled && (
            <select
              value={imageryConfig.provider}
              onChange={e => onChangeImageryProvider(e.target.value as ImageryProvider)}
              className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/15 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-white focus:outline-none"
            >
              <option value="google_satellite">Google Satellite</option>
              <option value="google_hybrid">Google Hybrid (Labels)</option>
              <option value="google_terrain">Google Terrain (Relief)</option>
              <option value="google_roadmap">Google Roadmap</option>
              <option value="esri_satellite">Esri World Imagery</option>
              <option value="osm_standard">OpenStreetMap</option>
            </select>
          )}

          {/* Google Earth Studio Controls Drawer Trigger */}
          <button
            onClick={onOpenGoogleEarth}
            className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-all ${
              pitchDeg > 0
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 font-bold'
                : 'text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10'
            }`}
            title="Open Google Earth 3D Tilt, Elevation Slice & Solar Shadow Studio"
          >
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            {pitchDeg > 0 && <span className="text-[10px] font-mono text-sky-300 font-bold">{pitchDeg}° 3D</span>}
          </button>
        </div>

        {/* Snap Controls */}
        <div className="flex items-center bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10">
          <button
            onClick={onToggleSnap}
            className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              snapEnabled
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
                : 'text-slate-500 dark:text-white/40 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Snap to Nearby Vertices & Midpoints"
          >
            <Magnet className="w-3 h-3" />
            <span>Snap</span>
          </button>

          <button
            onClick={onToggleSnapGrid}
            className={`px-1.5 py-1 rounded-lg text-xs transition-all ${
              snapGrid
                ? 'text-cyan-300 font-bold'
                : 'text-slate-500 dark:text-white/30 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Snap to UTM Grid Lines"
          >
            Grid Snap
          </button>
        </div>

        {/* View Options & Themes */}
        {!imageryConfig.enabled && (
          <select
            value={basemapTheme}
            onChange={e => onChangeBasemap(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-white font-medium"
          >
            <option value="dark_obsidian">Dark Obsidian</option>
            <option value="blueprint">Blueprint CAD</option>
            <option value="parchment">Cadastral Parchment</option>
            <option value="light_topo">Light Topo Grid</option>
          </select>
        )}

        {/* MAP LOCK / UNLOCK CONTROLS */}
        {onToggleMapLock && (
          <button
            onClick={onToggleMapLock}
            className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all ${
              isMapLocked
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-sm'
                : 'bg-slate-100 dark:bg-[#141414] text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-white/10'
            }`}
            title={
              isMapLocked
                ? 'Map is LOCKED (Pan & Zoom fixed; Imagery refresh paused). Click to UNLOCK'
                : 'Map is UNLOCKED (Refreshes on location/scale change). Click to LOCK View'
            }
          >
            {isMapLocked ? <Lock className="w-3.5 h-3.5 text-rose-400" /> : <Unlock className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline text-[11px]">{isMapLocked ? 'Locked' : 'Lock Map'}</span>
          </button>
        )}

        {/* REFRESH MAP TILES */}
        {onRefreshMapTiles && (
          <button
            onClick={onRefreshMapTiles}
            className="p-1.5 bg-slate-100 dark:bg-[#141414] hover:bg-slate-200 dark:hover:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-xl text-slate-700 dark:text-white transition-all"
            title="Refresh Aerial Satellite Tiles / Redraw Viewport"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        {/* LIVE LOCATION GPS */}
        {onLiveGpsLocate && (
          <button
            onClick={onLiveGpsLocate}
            disabled={isLocatingGps}
            className={`p-1.5 rounded-xl border text-xs transition-all ${
              isLocatingGps
                ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500 animate-pulse'
                : 'bg-slate-100 dark:bg-[#141414] text-slate-700 dark:text-white hover:bg-slate-200 dark:hover:bg-[#1a1a1a] border-slate-200 dark:border-white/10'
            }`}
            title="Fly to Live Device GPS Location on Map"
          >
            <Navigation className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        )}

        <button
          onClick={onToggleGrid}
          className={`p-1.5 rounded-xl border text-xs transition-all ${
            showGrid
              ? 'bg-slate-200 dark:bg-white/10 text-amber-600 dark:text-[#c9a063] border-slate-300 dark:border-white/20'
              : 'bg-slate-100 dark:bg-[#141414] text-slate-400 dark:text-white/40 border-slate-200 dark:border-white/5'
          }`}
          title="Toggle Grid (G)"
        >
          <Grid className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onToggleLabels}
          className={`p-1.5 rounded-xl border text-xs transition-all ${
            showLabels
              ? 'bg-slate-200 dark:bg-white/10 text-sky-600 dark:text-sky-400 border-slate-300 dark:border-white/20'
              : 'bg-slate-100 dark:bg-[#141414] text-slate-400 dark:text-white/40 border-slate-200 dark:border-white/5'
          }`}
          title="Toggle Labels (L)"
        >
          <Tag className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onFitView}
          className="p-1.5 bg-slate-100 dark:bg-[#141414] hover:bg-slate-200 dark:hover:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 rounded-xl text-slate-700 dark:text-white transition-all"
          title="Fit to All Features Extent (F)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        {/* AI Spatial Copilot */}
        <button
          onClick={onOpenAiCopilot}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 hover:from-amber-500/30 hover:to-yellow-500/30 border border-amber-500/40 text-amber-500 dark:text-amber-300 font-bold text-xs rounded-xl shadow-sm transition-all"
          title="Open Smart AI Spatial Copilot"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>AI Copilot</span>
        </button>

        {/* Export Map */}
        <button
          onClick={onExportMap}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs rounded-xl shadow-md transition-all"
          title="Export High-Resolution PDF/PNG Map"
        >
          <FileDown className="w-3.5 h-3.5" />
          <span>Export Map</span>
        </button>
      </div>
    </div>
  );
};

