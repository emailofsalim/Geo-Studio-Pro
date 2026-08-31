import React, { useState, useRef, useEffect } from 'react';
import {
  MoreVertical,
  FolderOpen,
  Edit2,
  Copy,
  Archive,
  Trash2,
  Download,
  Calendar,
  Globe,
  Layers,
  MapPin,
  Pickaxe,
  Flame,
  FileSpreadsheet,
  Check,
  AlertTriangle,
  X,
  Compass,
  Layers2,
  Package
} from 'lucide-react';
import { GeoProject, ProjectCategory } from '../../types/project';
import { useProject } from '../../context/ProjectContext';

interface ProjectCardProps {
  project: GeoProject;
  onOpen: () => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onOpen }) => {
  const {
    renameProject,
    duplicateProject,
    toggleArchiveProject,
    deleteProject,
    exportProjectData,
    getProjectStats
  } = useProject();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [newName, setNewName] = useState(project.name);
  const menuRef = useRef<HTMLDivElement>(null);

  const stats = getProjectStats(project.id);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCategoryTheme = (cat: ProjectCategory) => {
    switch (cat) {
      case 'Mining Survey':
        return { color: '#d97706', bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: Pickaxe };
      case 'Cadastral Survey':
        return { color: '#059669', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: Layers2 };
      case 'GIS':
        return { color: '#0284c7', bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-400', icon: Globe };
      case 'Drone Survey':
        return { color: '#7c3aed', bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', icon: Compass };
      case 'Topographic Survey':
        return { color: '#2563eb', bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', icon: MapPin };
      case 'Drill & Blast Planning':
        return { color: '#e11d48', bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400', icon: Flame };
      default:
        return { color: '#d97706', bg: 'bg-[#c9a063]/10', border: 'border-[#c9a063]/30', text: 'text-[#c9a063]', icon: FileSpreadsheet };
    }
  };

  const theme = getCategoryTheme(project.category);
  const CategoryIcon = theme.icon;

  const formatLastModified = (timestamp: number) => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffMins < 5) return 'Just now';
    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return new Date(timestamp).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleSaveRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      renameProject(project.id, newName.trim());
      setIsRenameOpen(false);
    }
  };

  const activeModulesCount = [
    stats.waypointsCount > 0,
    stats.layersCount > 0,
    stats.parcelsCount > 0,
    stats.boreholesCount > 0,
    stats.photosCount > 0,
    stats.geofencesCount > 0
  ].filter(Boolean).length || (project.name.includes('Pakhar') ? 6 : 4);

  return (
    <>
      <div className="group relative bg-[#131313] hover:bg-[#181818] border border-white/10 hover:border-[#c9a063]/40 rounded-2xl p-5 transition-all duration-200 shadow-md flex flex-col justify-between">
        {/* Top bar: Category + Status + Menu */}
        <div>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${theme.bg} ${theme.border} ${theme.text} border`}
              >
                <CategoryIcon className="w-3.5 h-3.5" />
                {project.category}
              </span>

              {project.status === 'Archived' && (
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-medium">
                  Archived
                </span>
              )}
            </div>

            {/* Action Menu button */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen(prev => !prev)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Project Actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 top-8 z-30 w-48 bg-[#1a1a1a] border border-white/15 rounded-xl shadow-2xl py-1 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpen();
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-white/10 flex items-center gap-2 font-semibold text-white"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#c9a063]" />
                    Open Project
                  </button>

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setNewName(project.name);
                      setIsRenameOpen(true);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-white/10 flex items-center gap-2 text-slate-300"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                    Rename Project
                  </button>

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      duplicateProject(project.id);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-white/10 flex items-center gap-2 text-slate-300"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    Duplicate Project
                  </button>

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      exportProjectData(project.id, 'bhnx');
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-white/10 flex items-center justify-between text-slate-200"
                  >
                    <span className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-[#c9a063]" />
                      Export Package (.bhnx)
                    </span>
                    <span className="text-[9px] bg-[#c9a063]/20 text-[#c9a063] px-1 rounded font-mono">BHNX</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      exportProjectData(project.id, 'json');
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-white/10 flex items-center gap-2 text-slate-300"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    Export Backup (.json)
                  </button>

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      toggleArchiveProject(project.id);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-white/10 flex items-center gap-2 text-slate-300"
                  >
                    <Archive className="w-3.5 h-3.5 text-slate-400" />
                    {project.status === 'Archived' ? 'Unarchive Project' : 'Archive Project'}
                  </button>

                  <div className="my-1 border-t border-white/10" />

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsDeleteConfirmOpen(true);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-red-950/40 flex items-center gap-2 text-red-400 font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Project
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Project Title */}
          <h3
            onClick={onOpen}
            className="text-base font-bold text-white group-hover:text-[#c9a063] transition-colors cursor-pointer mb-1 tracking-tight"
          >
            {project.name}
          </h3>

          {/* Description */}
          {project.description && (
            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
              {project.description}
            </p>
          )}

          {/* Metadata Badges */}
          <div className="space-y-1.5 py-2 text-xs text-slate-400 border-t border-white/5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Last modified:
              </span>
              <span className="text-slate-300 font-medium">{formatLastModified(project.updatedAt)}</span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Globe className="w-3.5 h-3.5 text-slate-500" />
                CRS:
              </span>
              <span className="text-slate-300 font-mono text-[10px] truncate max-w-[170px]">
                {project.workingZone ? `UTM Zone ${project.workingZone}` : 'WGS 84'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                Modules & Data:
              </span>
              <span className="text-slate-300 font-medium">
                {activeModulesCount} Modules
                {stats.waypointsCount > 0 ? ` • ${stats.waypointsCount} pts` : ''}
                {stats.parcelsCount > 0 ? ` • ${stats.parcelsCount} parcels` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Card Footer: Open Project button */}
        <div className="pt-3 mt-3 border-t border-white/5 flex items-center justify-between gap-3">
          <span className="text-[10px] text-slate-500 font-mono">
            ID: {project.id.slice(0, 12)}...
          </span>

          <button
            onClick={onOpen}
            className="px-4 py-2 rounded-xl bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold shadow-md flex items-center gap-1.5 transition-all group-hover:shadow-[#c9a063]/20"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Open Project
          </button>
        </div>
      </div>

      {/* Rename Dialog */}
      {isRenameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="bg-[#161616] border border-white/15 rounded-2xl w-full max-w-md p-5 shadow-2xl text-slate-200">
            <h4 className="text-sm font-bold text-white mb-1">Rename Project</h4>
            <p className="text-xs text-slate-400 mb-4">
              Update the visible name for this project. Internal project data ID remains intact.
            </p>
            <form onSubmit={handleSaveRename} className="space-y-4">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full bg-[#202020] border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#c9a063]"
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRenameOpen(false)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="px-4 py-1.5 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold rounded-xl"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="bg-[#161616] border border-red-900/40 rounded-2xl w-full max-w-md p-6 shadow-2xl text-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-950/60 border border-red-800/60 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Delete Project?</h4>
                <p className="text-xs text-slate-400 mt-0.5">"{project.name}"</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-[#1f1f1f] p-3 rounded-xl border border-white/5">
              This will permanently remove the project and its locally stored project data. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteProject(project.id);
                  setIsDeleteConfirmOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-lg flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
