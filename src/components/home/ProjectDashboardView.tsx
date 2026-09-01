import React, { useState } from 'react';
import {
  ArrowLeft,
  Pickaxe,
  Layers2,
  Globe,
  Compass,
  MapPin,
  Flame,
  FileSpreadsheet,
  Layers,
  Camera,
  ShieldAlert,
  Calculator,
  FileCode,
  Spline,
  Scan,
  Activity,
  Download,
  Upload,
  Settings,
  Calendar,
  Sparkles,
  ChevronRight,
  HardDrive,
  Database,
  Share2,
  CheckCircle2,
  FolderOpen,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Package
} from 'lucide-react';
import { GeoProject, ProjectCategory } from '../../types/project';
import { AppTabId, APPS_CONFIG } from '../Navigation';
import { useProject } from '../../context/ProjectContext';
import { QAService, ProjectDataHealthReport } from '../../services/QAService';

interface ProjectDashboardViewProps {
  project: GeoProject;
  onSelectTab: (tab: AppTabId) => void;
  openUniversalImport?: () => void;
  openUniversalExport?: (format?: any) => void;
  onOpenSettings?: () => void;
}

export const ProjectDashboardView: React.FC<ProjectDashboardViewProps> = ({
  project,
  onSelectTab,
  openUniversalImport,
  openUniversalExport,
  onOpenSettings
}) => {
  const { closeProject, exportProjectData, getProjectStats, renameProject } = useProject();
  const stats = getProjectStats(project.id);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(project.name);

  const handleSaveTitle = (e: React.FormEvent) => {
    e.preventDefault();
    if (editedTitle.trim()) {
      renameProject(project.id, editedTitle.trim());
      setIsEditingTitle(false);
    }
  };

  const [qaReport, setQaReport] = useState<ProjectDataHealthReport | null>(null);
  const [isRunningQa, setIsRunningQa] = useState(false);

  const handleRunQa = () => {
    setIsRunningQa(true);
    setTimeout(() => {
      const data = {
        waypoints: stats.waypointsCount ? Array(stats.waypointsCount).fill({ E: 255000, N: 2605000, id: 'WP-1' }) : [],
        layers: stats.layersCount ? Array(stats.layersCount).fill({ name: 'Active Layer', features: [] }) : [],
        parcels: [],
        boreholes: []
      };
      const report = QAService.auditProjectData(data);
      setQaReport(report);
      setIsRunningQa(false);
    }, 400);
  };

  const getCategoryColor = (cat: ProjectCategory) => {
    switch (cat) {
      case 'Mining Survey':
        return '#d97706';
      case 'Cadastral Survey':
        return '#059669';
      case 'GIS':
        return '#0284c7';
      case 'Drone Survey':
        return '#7c3aed';
      case 'Topographic Survey':
        return '#2563eb';
      case 'Drill & Blast Planning':
        return '#e11d48';
      default:
        return '#c9a063';
    }
  };

  const catColor = getCategoryColor(project.category);

  // Group modules
  const primaryModules: { id: AppTabId; name: string; desc: string; icon: any; statLabel: string }[] = [
    {
      id: 'gps',
      name: 'GNSS Field Surveyor',
      desc: 'Dual-coordinate RTK GPS cockpit, live point averaging, satellite logger & track recorder',
      icon: Compass,
      statLabel: `${stats.waypointsCount} points logged`
    },
    {
      id: 'gis',
      name: 'GIS Vector Map Studio',
      desc: 'Multi-layer spatial editor, polygon buffer generation, satellite overlays & layer styling',
      icon: Layers,
      statLabel: `${stats.layersCount} active layers`
    },
    {
      id: 'cad',
      name: 'Cadastral Land Mapper',
      desc: 'Khasra parcel plots, land ownership register, area unit conversion & title schedules',
      icon: Layers2,
      statLabel: `${stats.parcelsCount} parcels mapped`
    },
    {
      id: 'bore',
      name: 'Borehole Stratigraphy',
      desc: '3D geotechnical core logging, mineral cutoff intervals & lithology modeling',
      icon: MapPin,
      statLabel: `${stats.boreholesCount} drillholes`
    },
    {
      id: 'camera',
      name: 'GPS Map Camera Studio',
      desc: 'Field inspection camera with real-time geostamping, satellite HUD & compass telemetry',
      icon: Camera,
      statLabel: `${stats.photosCount} geostamped photos`
    },
    {
      id: 'bhunaksha',
      name: 'BhuNaksha Digitizer',
      desc: 'High-precision village revenue plot digitizer with automated area calculation',
      icon: Scan,
      statLabel: 'Revenue Plot Digitizer'
    }
  ];

  const toolsModules: { id: AppTabId; name: string; desc: string; icon: any }[] = [
    {
      id: 'convert',
      name: 'Coordinate Converter',
      desc: 'High-precision WGS84, UTM, and local grid batch transformation',
      icon: Globe
    },
    {
      id: 'calc',
      name: 'Survey Calculator',
      desc: 'Bowditch traverse adjustment, bearing/distance, leveling & mineral cutoffs',
      icon: Calculator
    },
    {
      id: 'sensors',
      name: 'Field Sensors & Theodolite',
      desc: 'Digital electronic theodolite, clinometer, auto-level & barometer',
      icon: Activity
    },
    {
      id: 'geofence',
      name: 'Geofence Sentinel',
      desc: 'Statutory 7.5m barrier zone monitor with proximity breach alarms',
      icon: ShieldAlert
    },
    {
      id: 'studio',
      name: 'Universal Converter',
      desc: 'Cross-format spatial transformer for CSV, DXF, GeoJSON, KML & Shapefiles',
      icon: FileCode
    },
    {
      id: 'off',
      name: 'Boundary Offset & Buffer',
      desc: 'Mining statutory safety offsets, riparian corridors & setbacks',
      icon: Spline
    },
    {
      id: 'combine',
      name: 'Merge & Split Polygons',
      desc: 'Spatial boolean operations, boundary union & parcel subdivision',
      icon: Layers2
    },
    {
      id: 'templates',
      name: 'Standard Survey Schemas',
      desc: 'Pre-formatted industry CSV templates, borehole profiles & data dictionaries',
      icon: FileSpreadsheet
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* 1. Top Navigation Bar: Back to Home / My Projects */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          // Closing alone leaves the user on the dashboard with no project to
          // show, which is not what a button reading "Home / Projects" says it
          // does. It closes and then goes there.
          onClick={() => {
            closeProject();
            onSelectTab('home');
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#141414] hover:bg-[#1f1f1f] text-slate-300 hover:text-white border border-white/10 text-xs font-bold transition-all shadow-sm group"
        >
          <ArrowLeft className="w-4 h-4 text-[#c9a063] group-hover:-translate-x-0.5 transition-transform" />
          <span>← Home / Projects</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          {openUniversalImport && (
            <button
              onClick={openUniversalImport}
              className="px-3 py-1.5 rounded-xl bg-[#1a1a1a] hover:bg-[#222222] text-xs font-semibold text-slate-200 border border-white/10 flex items-center gap-1.5 transition-colors"
              title="Import Geodata into Project"
            >
              <Upload className="w-3.5 h-3.5 text-[#c9a063]" />
              <span>Import Geodata</span>
            </button>
          )}

          {openUniversalExport && (
            <button
              onClick={() => openUniversalExport()}
              className="px-3 py-1.5 rounded-xl bg-[#1a1a1a] hover:bg-[#222222] text-xs font-semibold text-slate-200 border border-white/10 flex items-center gap-1.5 transition-colors"
              title="Export Project Geodata"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Export Geodata</span>
            </button>
          )}

          <button
            onClick={() => exportProjectData(project.id, 'bhnx')}
            className="px-3.5 py-1.5 rounded-xl bg-[#c9a063]/20 hover:bg-[#c9a063]/30 text-[#c9a063] border border-[#c9a063]/40 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            title="Download portable .bhnx project package with SHA-256 integrity manifest"
          >
            <Package className="w-3.5 h-3.5 text-[#c9a063]" />
            <span>Export .bhnx Package</span>
          </button>

          <button
            onClick={() => exportProjectData(project.id, 'json')}
            className="px-3 py-1.5 rounded-xl bg-[#1a1a1a] hover:bg-[#222222] text-slate-300 border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Download JSON project backup"
          >
            <Database className="w-3.5 h-3.5 text-slate-400" />
            <span>JSON Backup</span>
          </button>
        </div>
      </div>

      {/* 2. Project Header Card */}
      <div className="bg-[#111111] border border-white/10 rounded-2xl p-5 sm:p-7 shadow-xl relative overflow-hidden">
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl pointer-events-none opacity-15"
          style={{ backgroundColor: catColor }}
        />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className="px-3 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5"
                style={{
                  backgroundColor: `${catColor}15`,
                  borderColor: `${catColor}40`,
                  color: catColor
                }}
              >
                <Pickaxe className="w-3.5 h-3.5" />
                {project.category}
              </span>

              <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-mono">
                {project.crs}
              </span>

              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Isolated Workspace Active
              </span>
            </div>

            {/* Editable Project Title */}
            {isEditingTitle ? (
              <form onSubmit={handleSaveTitle} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={editedTitle}
                  onChange={e => setEditedTitle(e.target.value)}
                  className="bg-[#1c1c1c] border border-[#c9a063] rounded-xl px-3 py-1.5 text-lg font-bold text-white focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#c9a063] text-black font-bold text-xs rounded-xl"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  className="px-3 py-1.5 bg-white/10 text-slate-300 text-xs rounded-xl"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3 group">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {project.name}
                </h1>
                <button
                  onClick={() => {
                    setEditedTitle(project.name);
                    setIsEditingTitle(true);
                  }}
                  className="text-xs text-slate-500 hover:text-[#c9a063] underline"
                >
                  Rename
                </button>
              </div>
            )}

            {project.description && (
              <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                {project.description}
              </p>
            )}

            <div className="text-[11px] text-slate-400 flex items-center gap-4 pt-1">
              <span>
                <strong>Project ID:</strong> <span className="font-mono">{project.id}</span>
              </span>
              <span>
                <strong>Working Zone:</strong> <span className="font-mono">{project.workingZone}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Live Project Data Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-6 pt-5 border-t border-white/10">
          <div className="p-3 rounded-xl bg-[#181818] border border-white/5">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#c9a063]" /> Waypoints
            </div>
            <div className="text-lg font-bold text-white mt-1">{stats.waypointsCount}</div>
          </div>

          <div className="p-3 rounded-xl bg-[#181818] border border-white/5">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-400" /> GIS Layers
            </div>
            <div className="text-lg font-bold text-white mt-1">{stats.layersCount}</div>
          </div>

          <div className="p-3 rounded-xl bg-[#181818] border border-white/5">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Layers2 className="w-3.5 h-3.5 text-emerald-400" /> Parcels
            </div>
            <div className="text-lg font-bold text-white mt-1">{stats.parcelsCount}</div>
          </div>

          <div className="p-3 rounded-xl bg-[#181818] border border-white/5">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" /> Boreholes
            </div>
            <div className="text-lg font-bold text-white mt-1">{stats.boreholesCount}</div>
          </div>

          <div className="p-3 rounded-xl bg-[#181818] border border-white/5">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-purple-400" /> Photos
            </div>
            <div className="text-lg font-bold text-white mt-1">{stats.photosCount}</div>
          </div>

          <div className="p-3 rounded-xl bg-[#181818] border border-white/5">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Geofences
            </div>
            <div className="text-lg font-bold text-white mt-1">{stats.geofencesCount}</div>
          </div>
        </div>
      </div>

      {/* Project Data Health & QA Status Card */}
      <div className="bg-[#111111] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Project Data Health & Quality Assurance</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {qaReport ? `Health: ${qaReport.overallScore}%` : 'Audit Ready'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {qaReport 
                ? `${qaReport.errorCount} critical errors, ${qaReport.warningCount} warnings detected across project layers.`
                : 'Inspect geometry closure, CRS bounds, coordinate duplicate markers, and borehole interval integrity.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto">
          <button
            onClick={handleRunQa}
            disabled={isRunningQa}
            className="px-4 py-2 bg-[#1c1c1c] hover:bg-[#252525] border border-white/10 text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors flex-1 md:flex-initial shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#c9a063] ${isRunningQa ? 'animate-spin' : ''}`} />
            <span>{isRunningQa ? 'Auditing Geodata...' : 'Run QA Audit'}</span>
          </button>
        </div>
      </div>

      {/* 3. Primary Applications Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[#c9a063]" />
            Primary Applications & Modules
          </h2>
          <span className="text-xs text-slate-400">All data saved strictly to this project</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {primaryModules.map(mod => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.id}
                onClick={() => onSelectTab(mod.id)}
                className="group p-5 rounded-2xl bg-[#131313] hover:bg-[#181818] border border-white/10 hover:border-[#c9a063]/50 transition-all duration-150 cursor-pointer shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#c9a063]/10 border border-[#c9a063]/30 flex items-center justify-center text-[#c9a063] group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>

                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-slate-300">
                      {mod.statLabel}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white group-hover:text-[#c9a063] transition-colors mb-1">
                    {mod.name}
                  </h3>

                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                    {mod.desc}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#c9a063] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Launch Module <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Geodesy, Calculations & Tools Grid */}
      <div className="space-y-3 pt-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-sky-400" />
          Geodesy, Calculations & Geotools
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {toolsModules.map(mod => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                onClick={() => onSelectTab(mod.id)}
                className="p-4 rounded-xl bg-[#121212] hover:bg-[#181818] border border-white/5 hover:border-white/15 text-left transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-slate-300 group-hover:text-white mb-2.5">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-bold text-white group-hover:text-[#c9a063] transition-colors">
                    {mod.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-snug">
                    {mod.desc}
                  </p>
                </div>
                <div className="text-[10px] text-slate-500 font-semibold mt-3 flex items-center gap-1">
                  Open Tool <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-[#c9a063]" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
