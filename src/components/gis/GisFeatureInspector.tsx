import React, { useState } from 'react';
import {
  Sparkles,
  Trash2,
  Copy,
  RotateCw,
  Scissors,
  CheckCircle,
  X,
  Sliders,
  ChevronDown,
  ChevronUp,
  MapPin,
  Maximize2
} from 'lucide-react';
import { GeoFeature, GisLayer } from '../../types';
import { getFeatureStats, simplifyDouglasPeucker } from './gisHelpers';
import { useToast } from '../../context/ToastContext';

interface GisFeatureInspectorProps {
  selectedFeature: { layerId: string; featureIdx: number; feature: GeoFeature } | null;
  activeLayer: GisLayer;
  zNum: number;
  isSouth: boolean;
  customBighaM2: number;
  onClose: () => void;
  onUpdateFeature: (updated: GeoFeature) => void;
  onDeleteFeature: () => void;
  onDuplicateFeature: () => void;
}

export const GisFeatureInspector: React.FC<GisFeatureInspectorProps> = ({
  selectedFeature,
  activeLayer,
  zNum,
  isSouth,
  customBighaM2,
  onClose,
  onUpdateFeature,
  onDeleteFeature,
  onDuplicateFeature
}) => {
  const toast = useToast();
  const [showSimplifySlider, setShowSimplifySlider] = useState(false);
  const [simplifyTolerance, setSimplifyTolerance] = useState(1.0);
  const [showCoordsTable, setShowCoordsTable] = useState(false);

  if (!selectedFeature) return null;

  const feat = selectedFeature.feature;
  const stats = getFeatureStats(feat, zNum, isSouth, customBighaM2);

  // Auto-Repair Geometry (removes duplicate vertices, removes collinear vertices)
  const handleAutoRepair = () => {
    if (feat.pts.length < 3) return;
    const cleanPts: { a: number; b: number }[] = [];
    feat.pts.forEach((p, idx) => {
      if (idx === 0) {
        cleanPts.push(p);
      } else {
        const prev = cleanPts[cleanPts.length - 1];
        if (Math.hypot(p.a - prev.a, p.b - prev.b) > 0.05) {
          cleanPts.push(p);
        }
      }
    });

    const updated: GeoFeature = {
      ...feat,
      pts: cleanPts
    };
    onUpdateFeature(updated);
    toast.showSuccess(`Cleaned geometry: Removed duplicate vertices (${cleanPts.length} remaining).`);
  };

  // Reverse Vertex Orientation
  const handleReverseVertices = () => {
    const updated: GeoFeature = {
      ...feat,
      pts: [...feat.pts].reverse()
    };
    onUpdateFeature(updated);
    toast.showInfo('Reversed vertex traversal direction.');
  };

  // Simplify Geometry
  const handleApplySimplify = () => {
    const simplified = simplifyDouglasPeucker(feat.pts, simplifyTolerance);
    if (simplified.length < (feat.geom === 'polygon' ? 3 : 2)) {
      toast.showWarning('Simplification tolerance too aggressive for this geometry.');
      return;
    }
    const updated: GeoFeature = {
      ...feat,
      pts: simplified
    };
    onUpdateFeature(updated);
    toast.showSuccess(`Simplified feature from ${feat.pts.length} to ${simplified.length} vertices.`);
    setShowSimplifySlider(false);
  };

  // Convert Type
  const handleToggleGeometryType = () => {
    if (feat.geom === 'line') {
      onUpdateFeature({ ...feat, geom: 'polygon' });
      toast.showSuccess('Converted Polyline to Closed Polygon.');
    } else if (feat.geom === 'polygon') {
      onUpdateFeature({ ...feat, geom: 'line' });
      toast.showSuccess('Converted Polygon to Polyline corridor.');
    }
  };

  return (
    <div className="absolute top-3 right-3 p-4 bg-slate-900/95 dark:bg-black/90 backdrop-blur-md rounded-2xl border border-amber-500/30 text-xs text-white space-y-3 w-80 max-h-[85vh] overflow-y-auto shadow-2xl z-30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <input
            type="text"
            value={feat.name}
            onChange={e => onUpdateFeature({ ...feat, name: e.target.value })}
            className="font-bold text-amber-300 bg-transparent border-b border-white/10 focus:border-amber-400 outline-none truncate w-full"
          />
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white p-1 rounded-lg">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Geometry & Layer Details */}
      <div className="grid grid-cols-2 gap-2 bg-white/5 p-2 rounded-xl text-[11px] font-mono">
        <div>
          <span className="text-white/40 block text-[10px]">LAYER</span>
          <span className="font-semibold text-slate-200 truncate block">{activeLayer.name}</span>
        </div>
        <div>
          <span className="text-white/40 block text-[10px]">GEOM TYPE</span>
          <span className="font-semibold text-amber-400 uppercase">{feat.geom}</span>
        </div>
      </div>

      {/* Live Measurement Stats */}
      {stats.type === 'polygon' && (
        <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl space-y-1 font-mono text-[11px]">
          <div className="flex justify-between">
            <span className="text-amber-200/60">Area (Metric):</span>
            <span className="font-bold text-amber-300">{(stats.areaHa || 0).toFixed(4)} Ha ({(stats.areaM2 || 0).toFixed(1)} m²)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-amber-200/60">Perimeter:</span>
            <span className="font-bold text-white">{(stats.perimeterM || 0).toFixed(2)} m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-amber-200/60">Local Units:</span>
            <span className="font-bold text-emerald-400">{stats.bighaText}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-amber-200/60">Vertices:</span>
            <span className="font-bold text-sky-400">{stats.vertexCount} nodes</span>
          </div>
        </div>
      )}

      {stats.type === 'line' && (
        <div className="bg-purple-500/10 border border-purple-500/20 p-2.5 rounded-xl space-y-1 font-mono text-[11px]">
          <div className="flex justify-between">
            <span className="text-purple-200/60">Total Length:</span>
            <span className="font-bold text-purple-300">{(stats.lengthM || 0).toFixed(2)} m ({(stats.lengthKm || 0).toFixed(3)} km)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-purple-200/60">Vertices:</span>
            <span className="font-bold text-sky-400">{stats.vertexCount} nodes</span>
          </div>
        </div>
      )}

      {/* Quick Action Grips */}
      <div className="space-y-1.5 pt-1">
        <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider">Geometry Actions</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={handleAutoRepair}
            className="py-1.5 px-2 bg-white/5 hover:bg-white/10 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
            title="Remove overlapping/duplicate vertices"
          >
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            <span>Auto-Repair</span>
          </button>

          <button
            onClick={handleReverseVertices}
            className="py-1.5 px-2 bg-white/5 hover:bg-white/10 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
            title="Reverse vertex order"
          >
            <RotateCw className="w-3 h-3 text-cyan-400" />
            <span>Reverse</span>
          </button>

          <button
            onClick={() => setShowSimplifySlider(!showSimplifySlider)}
            className="py-1.5 px-2 bg-white/5 hover:bg-white/10 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
            title="Simplify geometry nodes (Douglas-Peucker)"
          >
            <Sliders className="w-3 h-3 text-amber-400" />
            <span>Simplify</span>
          </button>

          <button
            onClick={onDuplicateFeature}
            className="py-1.5 px-2 bg-white/5 hover:bg-white/10 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
            title="Duplicate feature"
          >
            <Copy className="w-3 h-3 text-sky-400" />
            <span>Duplicate</span>
          </button>
        </div>

        {/* Simplify Slider Drawer */}
        {showSimplifySlider && (
          <div className="p-2.5 bg-black/50 border border-amber-500/20 rounded-xl space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-white/60">Tolerance:</span>
              <span className="font-bold text-amber-300">{simplifyTolerance.toFixed(1)} m</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="20"
              step="0.2"
              value={simplifyTolerance}
              onChange={e => setSimplifyTolerance(parseFloat(e.target.value))}
              className="w-full accent-amber-400"
            />
            <button
              onClick={handleApplySimplify}
              className="w-full py-1 bg-amber-500 text-black font-bold rounded-lg text-xs"
            >
              Apply Simplification
            </button>
          </div>
        )}
      </div>

      {/* Coordinate Inspector Table Toggle */}
      <div className="border-t border-white/10 pt-2">
        <button
          onClick={() => setShowCoordsTable(!showCoordsTable)}
          className="w-full flex items-center justify-between text-[11px] text-white/60 hover:text-white py-1"
        >
          <span>Vertex Coordinates ({feat.pts.length})</span>
          {showCoordsTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showCoordsTable && (
          <div className="mt-1.5 max-h-32 overflow-y-auto space-y-1 font-mono text-[10px] bg-black/40 p-2 rounded-xl border border-white/5">
            {feat.pts.map((p, idx) => (
              <div key={idx} className="flex justify-between items-center text-white/80 py-0.5 border-b border-white/5">
                <span className="text-amber-400 font-bold">#{idx + 1}</span>
                <span>E: {p.a.toFixed(1)}</span>
                <span>N: {p.b.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer / Delete */}
      <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
        {feat.geom !== 'point' && (
          <button
            onClick={handleToggleGeometryType}
            className="text-[10px] text-sky-400 hover:underline"
          >
            Convert to {feat.geom === 'line' ? 'Polygon' : 'Line'}
          </button>
        )}
        <button
          onClick={onDeleteFeature}
          className="ml-auto py-1 px-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      </div>
    </div>
  );
};
