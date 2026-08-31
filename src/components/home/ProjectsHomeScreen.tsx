import React, { useState, useRef } from 'react';
import {
  FolderPlus,
  Search,
  Filter,
  Plus,
  Upload,
  User,
  Sparkles,
  FolderKanban,
  HardDrive,
  Globe,
  Pickaxe,
  Layers2,
  MapPin,
  Flame,
  CheckCircle2,
  FileSpreadsheet,
  CloudOff,
  Cloud,
  ChevronDown
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { ProjectCard } from './ProjectCard';
import { CreateProjectModal } from './CreateProjectModal';
import { UserProfileModal } from './UserProfileModal';
import { ProjectCategory } from '../../types/project';

const CATEGORY_FILTERS: { id: string; label: string }[] = [
  { id: 'All', label: 'All Projects' },
  { id: 'Mining Survey', label: 'Mining' },
  { id: 'Cadastral Survey', label: 'Cadastral' },
  { id: 'GIS', label: 'GIS & Cartography' },
  { id: 'Drone Survey', label: 'Drone' },
  { id: 'Topographic Survey', label: 'Topographic' },
  { id: 'Land Survey', label: 'Land Survey' },
  { id: 'Drill & Blast Planning', label: 'Drill & Blast' }
];

export const ProjectsHomeScreen: React.FC = () => {
  const {
    projects,
    openProject,
    importProjectData,
    isCreateModalOpen,
    setIsCreateModalOpen,
    projectSearchQuery,
    setProjectSearchQuery,
    selectedCategoryFilter,
    setSelectedCategoryFilter
  } = useProject();

  const { user, isGuest, isAuthModalOpen, setIsAuthModalOpen } = useAuth();
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTabFilter, setActiveTabFilter] = useState<'All' | 'Active' | 'Archived'>('Active');

  // Filter projects by search query and category
  const filteredProjects = projects.filter(p => {
    // Status filter
    if (activeTabFilter === 'Active' && p.status === 'Archived') return false;
    if (activeTabFilter === 'Archived' && p.status !== 'Archived') return false;

    // Category filter
    if (selectedCategoryFilter !== 'All' && p.category !== selectedCategoryFilter) return false;

    // Search query
    if (projectSearchQuery.trim()) {
      const q = projectSearchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = p.description?.toLowerCase().includes(q) || false;
      const matchCat = p.category.toLowerCase().includes(q);
      const matchCrs = p.crs.toLowerCase().includes(q);
      return matchName || matchDesc || matchCat || matchCrs;
    }
    return true;
  });

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importProjectData(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* 1. Top Greeting & Actions Bar */}
      <div className="bg-[#111111] border border-white/10 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#c9a063]/15 border border-[#c9a063]/40 flex items-center justify-center text-[#c9a063] shrink-0 shadow-inner">
            <FolderKanban className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white tracking-tight">My Projects</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#c9a063]/20 text-[#c9a063] border border-[#c9a063]/30">
                {projects.length} {projects.length === 1 ? 'Project' : 'Projects'}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  isOnline
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {isOnline ? (
                  <>
                    <Cloud className="w-3 h-3 text-emerald-400" /> Offline-Ready
                  </>
                ) : (
                  <>
                    <CloudOff className="w-3 h-3 text-amber-400" /> Local Storage Mode
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Select an existing workspace or create a new project with isolated geodata layers and coordinates.
            </p>
          </div>
        </div>

        {/* Right side buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".bhnx,.json"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 bg-[#1a1a1a] hover:bg-[#222222] text-slate-200 text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-1.5 transition-colors shadow-sm"
            title="Import Native Project (.bhnx or .json)"
          >
            <Upload className="w-3.5 h-3.5 text-[#c9a063]" />
            <span>Import Project</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold rounded-xl shadow-lg flex items-center gap-1.5 transition-all transform hover:scale-[1.02]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* 2. Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={projectSearchQuery}
            onChange={e => setProjectSearchQuery(e.target.value)}
            placeholder="Search projects by name, category, or CRS..."
            className="w-full bg-[#141414] border border-white/10 rounded-xl pl-9.5 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#c9a063] transition-colors"
          />
          {projectSearchQuery && (
            <button
              onClick={() => setProjectSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status toggles (Active vs Archived) */}
        <div className="flex items-center gap-1 bg-[#141414] p-1 rounded-xl border border-white/10 self-start md:self-auto">
          <button
            onClick={() => setActiveTabFilter('Active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTabFilter === 'Active'
                ? 'bg-[#c9a063] text-black shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Active ({projects.filter(p => p.status !== 'Archived').length})
          </button>
          <button
            onClick={() => setActiveTabFilter('Archived')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTabFilter === 'Archived'
                ? 'bg-[#c9a063] text-black shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Archived ({projects.filter(p => p.status === 'Archived').length})
          </button>
          <button
            onClick={() => setActiveTabFilter('All')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTabFilter === 'All'
                ? 'bg-[#c9a063] text-black shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All ({projects.length})
          </button>
        </div>
      </div>

      {/* Category Pills Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
        {CATEGORY_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setSelectedCategoryFilter(f.id)}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${
              selectedCategoryFilter === f.id
                ? 'bg-[#c9a063]/20 border-[#c9a063] text-[#c9a063]'
                : 'bg-[#141414] border-white/5 text-slate-400 hover:text-white hover:bg-[#1a1a1a]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 3. Projects Grid */}
      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => openProject(project.id)}
            />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-[#121212] border border-white/10 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#c9a063]/10 border border-[#c9a063]/30 flex items-center justify-center text-[#c9a063] mx-auto">
            <FolderKanban className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-bold text-white">No projects yet</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {projectSearchQuery || selectedCategoryFilter !== 'All'
                ? 'No projects match your search filters. Try clearing your filters or create a new project.'
                : 'Create your first project to get started with GNSS surveys, borehole modeling, cadastral mapping, and GIS workflows.'}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            {projectSearchQuery || selectedCategoryFilter !== 'All' ? (
              <button
                onClick={() => {
                  setProjectSearchQuery('');
                  setSelectedCategoryFilter('All');
                }}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
              >
                Clear Filters
              </button>
            ) : null}

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-5 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold rounded-xl shadow-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Create New Project
            </button>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
};
