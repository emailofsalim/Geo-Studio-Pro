import React, { useState } from 'react';
import {
  X,
  Plus,
  Pickaxe,
  Layers2,
  Globe,
  Compass,
  MapPin,
  Flame,
  FileSpreadsheet,
  FolderPlus,
  Info,
  Check
} from 'lucide-react';
import { ProjectCategory } from '../../types/project';
import {
  COMMON_ZONES,
  NORTHERN_ZONES,
  SOUTHERN_ZONES,
  DEFAULT_ZONE,
  crsLabelFor,
  isValidZone
} from '../../lib/crsIdentity';
import { useProject } from '../../context/ProjectContext';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated?: (projectId: string) => void;
}

const CATEGORY_OPTIONS: { id: ProjectCategory; label: string; icon: any; color: string; desc: string }[] = [
  {
    id: 'Mining Survey',
    label: 'Mining Survey',
    icon: Pickaxe,
    color: '#d97706',
    desc: 'Open pit volumetrics, statutory 7.5m barrier, blast patterns & haul roads'
  },
  {
    id: 'Cadastral Survey',
    label: 'Cadastral Survey',
    icon: Layers2,
    color: '#059669',
    desc: 'Khasra plot boundaries, revenue mouza sheets & land tenancy schedules'
  },
  {
    id: 'GIS',
    label: 'GIS & Cartography',
    icon: Globe,
    color: '#0284c7',
    desc: 'Multi-layer spatial analysis, satellite imagery overlays & vector maps'
  },
  {
    id: 'Drone Survey',
    label: 'Drone Survey',
    icon: Compass,
    color: '#7c3aed',
    desc: 'UAV flight paths, orthomosaics, photogrammetry GCPs & point clouds'
  },
  {
    id: 'Topographic Survey',
    label: 'Topographic Survey',
    icon: MapPin,
    color: '#2563eb',
    desc: 'Contour lines, DTM/DEM elevation profiling, breaklines & spot heights'
  },
  {
    id: 'Land Survey',
    label: 'Land Survey',
    icon: Layers2,
    color: '#10b981',
    desc: 'Boundary demarcation, easement offsets, parcels & traverse loops'
  },
  {
    id: 'Drill & Blast Planning',
    label: 'Drill & Blast Planning',
    icon: Flame,
    color: '#e11d48',
    desc: 'Blast pattern holes, burden/spacing, charge calculation & safety zones'
  },
  {
    id: 'General Survey',
    label: 'General Survey',
    icon: FileSpreadsheet,
    color: '#d97706',
    desc: 'Standard traverse, GPS waypoints, distance measurements & field logging'
  }
];

// ---------------------------------------------------------------------------
// Coordinate reference system
// ---------------------------------------------------------------------------
// The working zone is the single source of truth here, and the CRS label is
// derived from it rather than typed alongside it.
//
// This dialog previously carried a list of hand-written CRS strings and a
// separate free-text zone box, and stored both. Nothing kept them in step, so
// the two disagreed in three ways that all reached storage:
//
//   - Choosing "UTM Zone 45N (EPSG:32645)" and then typing 30S in the zone box
//     stored that label against workingZone "30S". Every calculation and export
//     then ran in Zone 30 SOUTH while every label read 45N north.
//   - "WGS 84 Geographic 2D (EPSG:4326)" stored a geographic CRS against a UTM
//     working zone of 45N. Nothing in the application reads project.crs to
//     switch behaviour — it is only ever displayed — so the label was a claim
//     with no arithmetic behind it.
//   - "Universal UTM Grid (Custom Zone)" stored "WGS 84 / UTM Global Grid",
//     which names neither a zone nor an EPSG code, against zone 45N.
//
// So the picker now offers zones, `ProjectService.createProject` derives the
// label from the chosen zone through `crsIdentityFor`, and the derived label is
// shown live so what is recorded is what was seen. The free-text zone box is
// gone: it was a second control setting the same value as the picker, and the
// picker reaches all 120 zones the projection engine supports.

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated
}) => {
  const { createProject, openProject } = useProject();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProjectCategory>('Mining Survey');
  const [workingZone, setWorkingZone] = useState(DEFAULT_ZONE);
  const [openImmediately, setOpenImmediately] = useState(true);

  if (!isOpen) return null;

  // What will actually be recorded, shown before it is.
  const zoneIsValid = isValidZone(workingZone);
  const derivedCrs = crsLabelFor(workingZone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !zoneIsValid) return;

    // `crs` is deliberately not passed: ProjectService derives it from the
    // working zone, so the label and the arithmetic cannot disagree.
    const newProject = await createProject({
      name: name.trim(),
      description: description.trim() || undefined,
      category,
      workingZone
    });

    if (openImmediately && newProject) {
      await openProject(newProject.id);
      if (onProjectCreated) onProjectCreated(newProject.id);
    }

    onClose();
    setName('');
    setDescription('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#121212] border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#161616]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#c9a063]/20 border border-[#c9a063]/40 flex items-center justify-center text-[#c9a063]">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">Create New Geomatics Project</h2>
              <p className="text-[11px] text-slate-400">Initialize an isolated workspace for survey and GIS data</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* Project Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-200">
              Project Name <span className="text-[#c9a063]">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Pakhar Mine FY 2026-27"
              className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#c9a063] transition-colors"
              autoFocus
            />
            <p className="text-[11px] text-slate-500">
              Unique human-friendly name. You can rename this anytime without losing data.
            </p>
          </div>

          {/* Project Type / Category */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-200">
              Project Type / Category <span className="text-[#c9a063]">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-0.5">
              {CATEGORY_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const isSelected = category === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCategory(opt.id)}
                    className={`p-3 rounded-xl text-left border transition-all flex items-start gap-2.5 ${
                      isSelected
                        ? 'bg-[#c9a063]/10 border-[#c9a063] text-white shadow-sm'
                        : 'bg-[#181818] border-white/5 text-slate-300 hover:bg-[#202020]'
                    }`}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        backgroundColor: `${opt.color}20`,
                        color: opt.color
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate flex items-center justify-between">
                        <span>{opt.label}</span>
                        {isSelected && <Check className="w-3 h-3 text-[#c9a063] shrink-0" />}
                      </div>
                      <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Project Description (Optional) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-200">
              Project Description <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Bauxite pit quarterly volume reconciliation, 7.5m statutory barrier and drillholes."
              className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#c9a063] transition-colors"
            />
          </div>

          {/* Coordinate Reference System (CRS) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-200">Coordinate Reference System (CRS)</label>
            <select
              value={workingZone}
              onChange={e => setWorkingZone(e.target.value)}
              className="w-full bg-[#1c1c1c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#c9a063]"
            >
              <optgroup label="Commonly used">
                {COMMON_ZONES.map(z => (
                  <option key={`c-${z.zone}`} value={z.zone}>
                    {z.label} — EPSG:{z.epsg}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Northern hemisphere">
                {NORTHERN_ZONES.map(z => (
                  <option key={`n-${z.zone}`} value={z.zone}>
                    {z.label} — EPSG:{z.epsg}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Southern hemisphere">
                {SOUTHERN_ZONES.map(z => (
                  <option key={`s-${z.zone}`} value={z.zone}>
                    {z.label} — EPSG:{z.epsg}
                  </option>
                ))}
              </optgroup>
            </select>

            <div className="pt-1 text-[11px] text-slate-400">
              Recorded as <span className="text-[#c9a063] font-mono">{derivedCrs}</span>
            </div>
            <div className="text-[10px] text-slate-500 italic">
              Every calculation and export in this project uses this grid. It can be changed later in Project
              Settings, and the CRS label follows it.
            </div>
          </div>

          {/* Open Immediately Checkbox */}
          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={openImmediately}
                onChange={e => setOpenImmediately(e.target.checked)}
                className="rounded border-white/20 text-[#c9a063] focus:ring-[#c9a063] bg-[#1c1c1c]"
              />
              <span>Open Project Dashboard immediately after creation</span>
            </label>
          </div>

          {/* Footer buttons */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !zoneIsValid}
              className="px-5 py-2 rounded-xl bg-[#c9a063] hover:bg-[#d6b074] disabled:opacity-40 text-black text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
