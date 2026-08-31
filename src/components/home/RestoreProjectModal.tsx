// ============================================================================
// BhuNex Studio — Portable .bhnx Package Restore & Verification Modal (Phase 5)
// ============================================================================

import React, { useState } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  MapPin,
  Compass,
  FolderKanban,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Hash,
  X,
  ArrowRight
} from 'lucide-react';
import { ParsedBhnxPackage } from '../../services/StorageService';

interface RestoreProjectModalProps {
  isOpen: boolean;
  packageData: ParsedBhnxPackage | null;
  onConfirmRestore: (options: { asNewProject: boolean; newName?: string }) => Promise<void>;
  onCancel: () => void;
}

export const RestoreProjectModal: React.FC<RestoreProjectModalProps> = ({
  isOpen,
  packageData,
  onConfirmRestore,
  onCancel
}) => {
  const [asNewProject, setAsNewProject] = useState(true);
  const [customName, setCustomName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !packageData) return null;

  const { manifest, project, data, integrityStatus, sha256, issues } = packageData;
  const projectName = project.name || manifest.projectName || 'Imported Project';
  const category = project.category || manifest.projectCategory || 'General Survey';
  const crsName = project.crs || manifest.crs?.name || 'WGS 84 / UTM Zone 45N';
  const verticalRef = manifest.crs?.verticalReference || 'Unknown';
  const epoch = manifest.crs?.coordinateEpoch || 'Unknown';
  const linearUnit = manifest.units?.linear || 'm';

  const counts = manifest.recordCounts || {
    waypoints: data.waypoints?.length || 0,
    layers: data.layers?.length || 0,
    parcels: data.parcels?.length || 0,
    boreholes: data.boreholes?.length || 0,
    photos: data.photos?.length || 0,
    geofences: data.geofences?.length || 0,
    calculations: data.calculations?.length || 0
  };

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirmRestore({
        asNewProject,
        newName: customName.trim() || undefined
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#141414] border border-white/[0.1] rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 border-b border-white/[0.08] bg-[#1a1712] flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-[#c9a063]/15 border border-[#c9a063]/30 rounded-xl text-[#c9a063] shrink-0">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono tracking-widest text-[#c9a063] font-bold block">
                Portable Archive Restore
              </span>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Restore Project Package (.bhnx)
              </h2>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-white/40 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
          {/* Cryptographic Integrity Banner */}
          {integrityStatus === 'VERIFIED' ? (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-semibold text-emerald-200">SHA-256 Cryptographic Verification Passed</div>
                  <div className="text-[11px] text-emerald-300/80">Archive internal files and manifest matched calculated SHA-256 digests.</div>
                </div>
              </div>
              <span className="font-mono text-[10px] bg-emerald-500/20 px-2 py-1 rounded text-emerald-300">
                VALID
              </span>
            </div>
          ) : integrityStatus === 'FAILED' ? (
            <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <div className="font-semibold text-red-200">Integrity Check Warning</div>
                  <div className="text-[11px] text-red-300/80">Some internal files did not match their original checksums.</div>
                </div>
              </div>
              <span className="font-mono text-[10px] bg-red-500/20 px-2 py-1 rounded text-red-300">
                CORRUPT?
              </span>
            </div>
          ) : (
            <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300 flex items-center gap-2.5 text-xs">
              <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <div className="font-semibold text-blue-200">Legacy / Unsigned JSON Package</div>
                <div className="text-[11px] text-blue-300/80">Archive loaded successfully into canonical schema representation.</div>
              </div>
            </div>
          )}

          {/* Project Overview Card */}
          <div className="p-4 bg-white/[0.03] border border-white/[0.08] rounded-xl space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase font-mono text-[#c9a063] font-semibold">
                  {category}
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">{projectName}</h3>
                {project.description && (
                  <p className="text-xs text-white/60 mt-1">{project.description}</p>
                )}
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.08] text-white/70 font-mono">
                v{manifest.schemaVersion || '3.0.0'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/[0.06] text-xs font-mono">
              <div>
                <span className="text-[10px] text-white/40 block">CRS / Datum</span>
                <span className="text-white truncate block" title={crsName}>{crsName}</span>
              </div>
              <div>
                <span className="text-[10px] text-white/40 block">Vertical Ref</span>
                <span className="text-white">{verticalRef}</span>
              </div>
              <div>
                <span className="text-[10px] text-white/40 block">Epoch</span>
                <span className="text-white">{epoch}</span>
              </div>
              <div>
                <span className="text-[10px] text-white/40 block">Distance Unit</span>
                <span className="text-white uppercase">{linearUnit}</span>
              </div>
            </div>
          </div>

          {/* Module Record Counts Breakdown */}
          <div>
            <span className="text-xs font-semibold text-white/70 uppercase tracking-wider block mb-2">
              Package Content Breakdown
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                <span className="text-white/60 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#c9a063]" /> Waypoints
                </span>
                <span className="font-mono font-bold text-white">{counts.waypoints}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                <span className="text-white/60 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" /> GIS Layers
                </span>
                <span className="font-mono font-bold text-white">{counts.layers}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                <span className="text-white/60 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Parcels
                </span>
                <span className="font-mono font-bold text-white">{counts.parcels}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                <span className="text-white/60 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-purple-400" /> Boreholes
                </span>
                <span className="font-mono font-bold text-white">{counts.boreholes}</span>
              </div>
            </div>
          </div>

          {/* Restore Destination Options */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-3">
            <span className="text-xs font-semibold text-white/80 block">
              Restore Target Mode
            </span>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.04] cursor-pointer text-xs transition-colors">
                <input
                  type="radio"
                  name="restoreMode"
                  checked={asNewProject}
                  onChange={() => setAsNewProject(true)}
                  className="text-[#c9a063] focus:ring-[#c9a063]"
                />
                <div>
                  <div className="font-semibold text-white">Import as New Project Copy (Recommended)</div>
                  <div className="text-[11px] text-white/50">Creates a separate project with a new ID, preserving existing projects intact.</div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.04] cursor-pointer text-xs transition-colors">
                <input
                  type="radio"
                  name="restoreMode"
                  checked={!asNewProject}
                  onChange={() => setAsNewProject(false)}
                  className="text-[#c9a063] focus:ring-[#c9a063]"
                />
                <div>
                  <div className="font-semibold text-white">Restore Original Project ID ({project.id})</div>
                  <div className="text-[11px] text-white/50">Overwrites/updates the project if it already exists in your workspace.</div>
                </div>
              </label>
            </div>

            {asNewProject && (
              <div className="pt-2">
                <label className="text-[11px] text-white/60 block mb-1">Custom Project Name (Optional)</label>
                <input
                  type="text"
                  placeholder={`${projectName} (Restored)`}
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/[0.1] text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-[#c9a063]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#121212] flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-white/80 hover:text-white text-xs font-medium transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="px-5 py-2.5 rounded-xl bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-[#c9a063]/20"
          >
            <Upload className="w-4 h-4" />
            {isProcessing ? 'Restoring Project...' : 'Confirm & Open Project'}
          </button>
        </div>
      </div>
    </div>
  );
};
