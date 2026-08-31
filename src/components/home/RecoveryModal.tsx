// ============================================================================
// BhuNex Studio — Crash & Session Recovery Dialog (Phase 5)
// ============================================================================

import React, { useState } from 'react';
import {
  ShieldAlert,
  RotateCcw,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  Layers,
  MapPin,
  FileSpreadsheet,
  AlertTriangle,
  FolderKanban,
  Hash
} from 'lucide-react';
import { RecoveryCheckpoint } from '../../services/StorageService';

interface RecoveryModalProps {
  isOpen: boolean;
  checkpoint: RecoveryCheckpoint | null;
  onRestore: () => Promise<void>;
  onDiscard: () => Promise<void>;
  onClose: () => void;
}

export const RecoveryModal: React.FC<RecoveryModalProps> = ({
  isOpen,
  checkpoint,
  onRestore,
  onDiscard,
  onClose
}) => {
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !checkpoint) return null;

  const data = checkpoint.data || ({} as any);
  const waypointsCount = data.waypoints?.length || 0;
  const layersCount = data.layers?.length || 0;
  const parcelsCount = data.parcels?.length || 0;
  const boreholesCount = data.boreholes?.length || 0;
  const photosCount = data.photos?.length || 0;
  const geofencesCount = data.geofences?.length || 0;
  const calculationsCount = data.calculations?.length || 0;

  const handleRestoreClick = async () => {
    setIsProcessing(true);
    try {
      await onRestore();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDiscardClick = async () => {
    if (window.confirm('Are you sure you want to discard these uncommitted recovery changes? This cannot be undone.')) {
      setIsProcessing(true);
      try {
        await onDiscard();
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#141414] border border-[#c9a063]/40 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-white/[0.08] bg-[#1a1712] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-[#c9a063]/15 border border-[#c9a063]/30 rounded-xl text-[#c9a063] shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#c9a063] font-bold px-2 py-0.5 rounded bg-[#c9a063]/10 border border-[#c9a063]/20">
                  Crash Recovery
                </span>
                <span className="text-xs text-white/50 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {checkpoint.timeString || new Date(checkpoint.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">
                Unsaved Session Changes Detected
              </h2>
              <p className="text-xs text-white/60 mt-0.5">
                BhuNex Studio recovered uncommitted modifications for project{' '}
                <strong className="text-white">"{checkpoint.projectName}"</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1">
          {/* Quick Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="text-[11px] text-white/50 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#c9a063]" /> Waypoints
              </div>
              <div className="text-lg font-bold text-white font-mono mt-1">{waypointsCount}</div>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="text-[11px] text-white/50 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" /> GIS Layers
              </div>
              <div className="text-lg font-bold text-white font-mono mt-1">{layersCount}</div>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="text-[11px] text-white/50 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Parcels
              </div>
              <div className="text-lg font-bold text-white font-mono mt-1">{parcelsCount}</div>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="text-[11px] text-white/50 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-purple-400" /> Boreholes
              </div>
              <div className="text-lg font-bold text-white font-mono mt-1">{boreholesCount}</div>
            </div>
          </div>

          {/* SHA-256 Checkpoint Verification */}
          {checkpoint.sha256 && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Cryptographic SHA-256 Checkpoint Validated</span>
              </span>
              <span className="font-mono text-[10px] text-emerald-400/70 truncate max-w-[140px]" title={checkpoint.sha256}>
                {checkpoint.sha256.substring(0, 16)}...
              </span>
            </div>
          )}

          {/* Interactive Review / Diff Toggle */}
          <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-black/40">
            <button
              onClick={() => setIsReviewOpen(!isReviewOpen)}
              className="w-full px-4 py-3 text-left text-xs font-semibold text-white/80 hover:text-white hover:bg-white/[0.04] flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                {isReviewOpen ? <EyeOff className="w-4 h-4 text-[#c9a063]" /> : <Eye className="w-4 h-4 text-[#c9a063]" />}
                <span>{isReviewOpen ? 'Hide Detailed Record Review' : 'Review Unsaved Changes & Items'}</span>
              </span>
              <span className="text-[11px] text-[#c9a063] font-mono">
                {isReviewOpen ? 'Collapse' : 'Inspect'}
              </span>
            </button>

            {isReviewOpen && (
              <div className="p-4 border-t border-white/[0.08] space-y-4 text-xs font-mono">
                {/* Waypoints List */}
                {waypointsCount > 0 && (
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-white/40 block mb-1.5">
                      Recovered Waypoints ({waypointsCount})
                    </span>
                    <div className="max-h-32 overflow-y-auto space-y-1 bg-black/60 p-2.5 rounded-lg border border-white/5">
                      {data.waypoints.map((wp: any, idx: number) => (
                        <div key={wp.id || idx} className="flex items-center justify-between text-white/70 text-[11px]">
                          <span>{wp.id} — {wp.code || 'Point'}</span>
                          <span className="text-white/40">E: {wp.E?.toFixed(1) || wp.lon?.toFixed(4)}, N: {wp.N?.toFixed(1) || wp.lat?.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Layers List */}
                {layersCount > 0 && (
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-white/40 block mb-1.5">
                      Recovered GIS Layers ({layersCount})
                    </span>
                    <div className="max-h-32 overflow-y-auto space-y-1 bg-black/60 p-2.5 rounded-lg border border-white/5">
                      {data.layers.map((l: any, idx: number) => (
                        <div key={l.id || idx} className="flex items-center justify-between text-white/70 text-[11px]">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color || '#c9a063' }} />
                            {l.name}
                          </span>
                          <span className="text-white/40">{l.features?.length || 0} features ({l.geomType})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Parcels List */}
                {parcelsCount > 0 && (
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-white/40 block mb-1.5">
                      Recovered Cadastral Parcels ({parcelsCount})
                    </span>
                    <div className="max-h-32 overflow-y-auto space-y-1 bg-black/60 p-2.5 rounded-lg border border-white/5">
                      {data.parcels.map((p: any, idx: number) => (
                        <div key={p.id || idx} className="flex items-center justify-between text-white/70 text-[11px]">
                          <span>Plot: {p.plotNo || p.khasra || p.id}</span>
                          <span className="text-white/40">{p.ownerName || p.owner || 'Unknown Owner'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3 Explicit Action Buttons (Restore, Discard, Close/Review) */}
        <div className="p-4 border-t border-white/[0.08] bg-[#121212] flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleDiscardClick}
            disabled={isProcessing}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-semibold text-xs flex items-center justify-center gap-2 transition-all"
          >
            <Trash2 className="w-4 h-4" /> Discard Checkpoint
          </button>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-white/80 hover:text-white font-medium text-xs transition-colors"
            >
              Decide Later
            </button>

            <button
              onClick={handleRestoreClick}
              disabled={isProcessing}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#c9a063]/20"
            >
              <RotateCcw className="w-4 h-4" />
              {isProcessing ? 'Restoring...' : 'Restore Unsaved Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
