// ============================================================================
// BhuNex Studio — Project Context (Authoritative UI State & Phase 5 Lifecycle)
// ============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { GeoProject, ProjectCategory, ProjectStatus, ProjectModuleStats, ProjectDataState } from '../types/project';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { downloadBlob } from '../lib/zip';
import { ProjectService } from '../services/ProjectService';
import {
  storageService,
  SEED_PROJECTS,
  RecoveryCheckpoint,
  ParsedBhnxPackage
} from '../services/StorageService';
import { RecoveryModal } from '../components/home/RecoveryModal';
import { RestoreProjectModal } from '../components/home/RestoreProjectModal';

export type SaveStatus = 'SAVED' | 'SAVING' | 'UNSAVED_CHANGES' | 'SAVE_FAILED' | 'OFFLINE';

interface CreateProjectParams {
  name: string;
  category: ProjectCategory;
  description?: string;
  crs?: string;
  workingZone?: string;
}

interface ProjectContextType {
  projects: GeoProject[];
  activeProject: GeoProject | null;
  activeProjectId: string | null;
  activeProjectData: ProjectDataState | null;
  isLoading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  isDirty: boolean;
  dirtyModules: string[];
  lastSavedTime: string;
  createProject: (params: CreateProjectParams) => Promise<GeoProject>;
  openProject: (projectId: string) => Promise<void>;
  closeProject: () => Promise<void>;
  renameProject: (id: string, newName: string) => Promise<void>;
  updateProject: (id: string, updates: Partial<GeoProject>) => Promise<void>;
  duplicateProject: (id: string) => Promise<GeoProject | null>;
  toggleArchiveProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  exportProjectData: (id: string, format?: 'bhnx' | 'json') => Promise<void>;
  importProjectData: (file: File) => Promise<void>;
  updateActiveProjectData: (updater: (prev: ProjectDataState) => ProjectDataState, moduleName?: string) => void;
  saveActiveProjectWorkspace: () => Promise<void>;
  getProjectStats: (id: string) => ProjectModuleStats;
  runProjectIsolationTest: () => Promise<{ passed: boolean; switchesCount: number; log: string[] }>;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  projectSearchQuery: string;
  setProjectSearchQuery: (q: string) => void;
  selectedCategoryFilter: string;
  setSelectedCategoryFilter: (c: string) => void;
  recoveryCheckpoint: RecoveryCheckpoint | null;
  isRecoveryModalOpen: boolean;
  restoreRecoveryCheckpoint: () => Promise<void>;
  discardRecoveryCheckpoint: () => Promise<void>;
  closeRecoveryModal: () => void;
}

const ACTIVE_PROJECT_PREF_KEY = 'bhnx_active_project_pref';

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const toast = useToast();
  const userId = user?.id || 'local';

  const [projects, setProjects] = useState<GeoProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectData, setActiveProjectData] = useState<ProjectDataState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Save Status & Dirty Tracking
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('SAVED');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [dirtyModules, setDirtyModules] = useState<string[]>([]);
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  // Modals & UI
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');

  // Recovery & Restore Modals
  const [recoveryCheckpoint, setRecoveryCheckpoint] = useState<RecoveryCheckpoint | null>(null);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState<boolean>(false);
  const [pendingRestorePackage, setPendingRestorePackage] = useState<ParsedBhnxPackage | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);

  // Refs for debouncing and flush-on-unmount
  const activeDataRef = useRef<ProjectDataState | null>(null);
  activeDataRef.current = activeProjectData;

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeProjectId;

  const debounceTimerRef = useRef<any>(null);
  const isOnlineRef = useRef<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      isOnlineRef.current = true;
      if (saveStatus === 'OFFLINE') {
        setSaveStatus(isDirty ? 'UNSAVED_CHANGES' : 'SAVED');
      }
    };
    const handleOffline = () => {
      isOnlineRef.current = false;
      setSaveStatus('OFFLINE');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [saveStatus, isDirty]);

  // 1. Initial Load: Migrate legacy keys, open IndexedDB, check recovery checkpoints, restore active project
  useEffect(() => {
    let isMounted = true;

    async function initializeProjects() {
      try {
        setIsLoading(true);

        // Run legacy localStorage migration to IndexedDB
        await storageService.migrateLegacyGlobalLocalStorage();

        // Load authoritative projects from IndexedDB
        const loadedProjects = await ProjectService.getAllProjects();
        if (!isMounted) return;

        setProjects(loadedProjects);

        // Scan for crash recovery checkpoints
        try {
          const checkpoint = await storageService.getLatestRecoveryCheckpoint();
          if (checkpoint && isMounted) {
            // If checkpoint timestamp is newer than 1 minute or project is marked dirty
            setRecoveryCheckpoint(checkpoint);
            setIsRecoveryModalOpen(true);
          }
        } catch (e) {
          console.warn('Recovery scan notice:', e);
        }

        // Restore active project preference
        let preferredId: string | null = null;
        try {
          preferredId = localStorage.getItem(ACTIVE_PROJECT_PREF_KEY);
        } catch {}

        if (preferredId && loadedProjects.some(p => p.id === preferredId)) {
          const { project, data } = await ProjectService.openProject(preferredId);
          if (isMounted) {
            setActiveProjectId(project.id);
            setActiveProjectData(data);
            setSaveStatus('SAVED');
            setLastSavedTime(new Date(project.updatedAt).toLocaleTimeString());
          }
        }
      } catch (err: any) {
        console.error('Failed to initialize projects from IndexedDB:', err);
        if (isMounted) {
          setError(err.message || 'Storage initialization failed');
          setProjects(SEED_PROJECTS.map(s => s.project));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initializeProjects();

    return () => {
      isMounted = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      // Flush dirty writes on unmount
      if (activeIdRef.current && activeDataRef.current) {
        ProjectService.saveProjectData(activeIdRef.current, activeDataRef.current);
      }
      ProjectService.releaseSensorsAndHardware();
    };
  }, [userId]);

  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  // Refresh projects list from IndexedDB
  const refreshProjectsList = useCallback(async () => {
    try {
      const all = await ProjectService.getAllProjects();
      setProjects(all);
    } catch (e) {
      console.warn('Failed to refresh projects list:', e);
    }
  }, []);

  // Compute live module stats for a project
  const getProjectStats = useCallback((id: string): ProjectModuleStats => {
    if (activeProjectId === id && activeProjectData) {
      return {
        waypointsCount: activeProjectData.waypoints?.length || 0,
        layersCount: activeProjectData.layers?.length || 0,
        parcelsCount: activeProjectData.parcels?.length || 0,
        boreholesCount: activeProjectData.boreholes?.length || 0,
        photosCount: activeProjectData.photos?.length || 0,
        geofencesCount: activeProjectData.geofences?.length || 0,
        calculationsCount: activeProjectData.calculations?.length || 0
      };
    }

    const p = projects.find(item => item.id === id);
    return {
      waypointsCount: p?.stats?.waypointsCount || 0,
      layersCount: p?.stats?.layersCount || 0,
      parcelsCount: p?.stats?.parcelsCount || 0,
      boreholesCount: p?.stats?.boreholesCount || 0,
      photosCount: p?.stats?.photosCount || 0,
      geofencesCount: p?.stats?.geofencesCount || 0,
      calculationsCount: p?.stats?.calculationsCount || 0
    };
  }, [activeProjectId, activeProjectData, projects]);

  // Performs authoritative transactional flush to IndexedDB
  /** True once a checkpoint write has failed, so the warning is not repeated per edit. */
  const checkpointFailedRef = useRef(false);

  const performSave = useCallback(async (projectId: string, dataToSave: ProjectDataState) => {
    try {
      setSaveStatus('SAVING');
      await ProjectService.saveProjectData(projectId, dataToSave);
      
      // Clear recovery checkpoint upon successful flush
      await storageService.clearRecoveryCheckpoint(projectId);

      setIsDirty(false);
      setDirtyModules([]);
      const timeStr = new Date().toLocaleTimeString();
      setLastSavedTime(timeStr);
      setSaveStatus(isOnlineRef.current ? 'SAVED' : 'OFFLINE');
      refreshProjectsList();
    } catch (err: any) {
      console.error('Failed to save project data:', err);
      setSaveStatus('SAVE_FAILED');
      toast.showError(`Auto-save error: ${err.message || 'IndexedDB write rejected'}`);
    }
  }, [refreshProjectsList, toast]);

  // Update active project data in memory, record dirty state, write recovery checkpoint, and trigger 1000ms debounced save
  const updateActiveProjectData = useCallback((updater: (prev: ProjectDataState) => ProjectDataState, moduleName?: string) => {
    if (!activeProjectId) return;

    setActiveProjectData(prev => {
      const base = prev || {
        projectId: activeProjectId,
        waypoints: [],
        layers: [],
        parcels: [],
        boreholes: [],
        photos: [],
        geofences: []
      };
      const next = updater(base);
      next.projectId = activeProjectId;
      next.updatedAt = Date.now();

      setIsDirty(true);
      if (moduleName) {
        setDirtyModules(curr => (curr.includes(moduleName) ? curr : [...curr, moduleName]));
      }
      setSaveStatus('UNSAVED_CHANGES');

      // 1. Immediately record a recovery checkpoint in case of unexpected tab crash
      storageService.saveRecoveryCheckpoint({
        id: `checkpoint_${activeProjectId}`,
        projectId: activeProjectId,
        projectName: activeProject?.name || 'Current Project',
        timestamp: Date.now(),
        timeString: new Date().toLocaleTimeString(),
        dirtyModules: moduleName ? [moduleName] : ['general'],
        data: next
      })
        .then(() => {
          // Protection is back; a later failure is worth reporting again.
          checkpointFailedRef.current = false;
        })
        .catch((err: any) => {
          // The checkpoint is the crash safety net, not the save. Losing it
          // costs no committed work -- performSave reports its own failures --
          // but it does mean an unexpected close would drop changes made since
          // the last flush, and until now that happened in complete silence.
          //
          // Reported once rather than per write: this runs on every edit, and a
          // message that fires continuously is trained away before it matters.
          if (checkpointFailedRef.current) return;
          checkpointFailedRef.current = true;
          toast.showError(
            `Crash recovery is not being recorded (${err?.message || 'storage write rejected'}). ` +
              'Saved work is unaffected, but changes made since the last save would be lost if this tab closes unexpectedly.'
          );
        });

      // 2. Debounced save to authoritative IndexedDB store (1000ms)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        performSave(activeProjectId, next);
      }, 1000);

      return next;
    });
  }, [activeProjectId, activeProject?.name, performSave]);

  // Manual save trigger for workspace
  const saveActiveProjectWorkspace = useCallback(async () => {
    if (!activeProjectId || !activeProjectData) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    await performSave(activeProjectId, activeProjectData);
  }, [activeProjectId, activeProjectData, performSave]);

  // Switch / Open a Project with Authoritative Project Lifecycle
  const openProject = async (projectId: string) => {
    if (activeProjectId === projectId) return;

    try {
      setIsLoading(true);

      // Save previous project if dirty
      if (activeProjectId && activeProjectData && isDirty) {
        await performSave(activeProjectId, activeProjectData);
      }

      // Clear old in-memory project state
      setActiveProjectData(null);
      setIsDirty(false);
      setDirtyModules([]);

      // Open new project via authoritative ProjectService
      const { project, data } = await ProjectService.openProject(
        projectId,
        activeProjectId,
        activeProjectData
      );

      // Switch current project pointer
      setActiveProjectId(project.id);
      setActiveProjectData(data);
      setSaveStatus('SAVED');
      setLastSavedTime(new Date(project.updatedAt).toLocaleTimeString());

      try {
        localStorage.setItem(ACTIVE_PROJECT_PREF_KEY, project.id);
      } catch {}

      await refreshProjectsList();
      toast.showSuccess(`Opened workspace for "${project.name}"`);
    } catch (err: any) {
      toast.showError(`Failed to open project: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Close current project and return to Projects overview
  const closeProject = async () => {
    try {
      if (activeProjectId && activeProjectData && isDirty) {
        await performSave(activeProjectId, activeProjectData);
      } else {
        ProjectService.releaseSensorsAndHardware();
      }

      setActiveProjectId(null);
      setActiveProjectData(null);
      setIsDirty(false);
      setDirtyModules([]);
      setSaveStatus('SAVED');

      try {
        localStorage.removeItem(ACTIVE_PROJECT_PREF_KEY);
      } catch {}

      await refreshProjectsList();
    } catch (err: any) {
      console.warn('Error closing project:', err);
      setActiveProjectId(null);
      setActiveProjectData(null);
    }
  };

  // Create New Project with strict IndexedDB isolation
  const createProject = async (params: CreateProjectParams): Promise<GeoProject> => {
    try {
      const { project, data } = await ProjectService.createProject({
        name: params.name,
        description: params.description,
        category: params.category,
        workingZone: params.workingZone || '45N',
        crs: params.crs,
        userId
      });

      await refreshProjectsList();
      setIsCreateModalOpen(false);
      toast.showSuccess(`Created project "${project.name}"`);
      return project;
    } catch (err: any) {
      toast.showError(`Failed to create project: ${err.message}`);
      throw err;
    }
  };

  const renameProject = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      await ProjectService.renameProject(id, newName);
      await refreshProjectsList();
      toast.showSuccess(`Project renamed to "${newName.trim()}"`);
    } catch (err: any) {
      toast.showError(`Failed to rename project: ${err.message}`);
    }
  };

  const updateProject = async (id: string, updates: Partial<GeoProject>) => {
    try {
      await ProjectService.updateProjectMeta(id, updates);
      await refreshProjectsList();
      toast.showSuccess('Project details updated.');
    } catch (err: any) {
      toast.showError(`Failed to update project: ${err.message}`);
    }
  };

  const duplicateProject = async (id: string): Promise<GeoProject | null> => {
    try {
      const { project } = await ProjectService.duplicateProject(id);
      await refreshProjectsList();
      toast.showSuccess(`Duplicated project "${project.name}"`);
      return project;
    } catch (err: any) {
      toast.showError(`Failed to duplicate project: ${err.message}`);
      return null;
    }
  };

  const toggleArchiveProject = async (id: string) => {
    const p = projects.find(item => item.id === id);
    if (!p) return;

    const newStatus: ProjectStatus = p.status === 'Archived' ? 'Active' : 'Archived';
    try {
      await ProjectService.updateProjectMeta(id, { status: newStatus });
      await refreshProjectsList();
      toast.showInfo(`Project marked as ${newStatus}`);
    } catch (err: any) {
      toast.showError(`Failed to update status: ${err.message}`);
    }
  };

  const deleteProject = async (id: string) => {
    const target = projects.find(p => p.id === id);
    try {
      if (activeProjectId === id) {
        await closeProject();
      }
      await ProjectService.deleteProject(id);
      await refreshProjectsList();
      toast.showSuccess(`Deleted project "${target?.name || id}"`);
    } catch (err: any) {
      toast.showError(`Failed to delete project: ${err.message}`);
    }
  };

  // Portable .bhnx Archive Export
  const exportProjectData = async (id: string, format: 'bhnx' | 'json' = 'bhnx') => {
    const p = projects.find(item => item.id === id);
    if (!p) return;

    try {
      // Flush current edits if exporting active project
      if (activeProjectId === id && isDirty && activeProjectData) {
        await performSave(id, activeProjectData);
      }

      if (format === 'bhnx') {
        const { blob, filename } = await storageService.exportBhnxPackageArchive(id);
        downloadBlob(blob, filename, 'application/octet-stream');
        toast.showSuccess(`Exported portable archive "${filename}"`);
      } else {
        const data = await ProjectService.getProjectData(id);
        const exportBundle = {
          app: 'BhuNex Studio Geomatics Suite',
          version: '3.7.0',
          exportedAt: new Date().toISOString(),
          project: p,
          data
        };
        const filename = `${p.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_backup.json`;
        downloadBlob(JSON.stringify(exportBundle, null, 2), filename, 'application/json');
        toast.showSuccess(`Exported "${p.name}" backup JSON`);
      }
    } catch (e: any) {
      toast.showError(`Failed to export project: ${e.message}`);
    }
  };

  // Portable .bhnx Package Import & Restore Preview
  const importProjectData = async (file: File): Promise<void> => {
    try {
      setIsLoading(true);
      let parsed: ParsedBhnxPackage;

      if (file.name.endsWith('.json')) {
        const text = await file.text();
        parsed = await storageService.parseBhnxPackageArchive(text);
      } else {
        const buffer = await file.arrayBuffer();
        parsed = await storageService.parseBhnxPackageArchive(buffer);
      }

      setPendingRestorePackage(parsed);
      setIsRestoreModalOpen(true);
    } catch (err: any) {
      toast.showError(`Failed to inspect package: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Confirms restore from RestoreProjectModal
  const handleConfirmRestore = async (options: { asNewProject: boolean; newName?: string }) => {
    if (!pendingRestorePackage) return;
    try {
      const restored = await storageService.restoreBhnxPackageTx(pendingRestorePackage, options);
      await refreshProjectsList();
      setIsRestoreModalOpen(false);
      setPendingRestorePackage(null);
      toast.showSuccess(`Restored project "${restored.name}"`);
      // Open restored workspace
      await openProject(restored.id);
    } catch (err: any) {
      toast.showError(`Restore error: ${err.message}`);
    }
  };

  // Restores recovery checkpoint
  const restoreRecoveryCheckpoint = async () => {
    if (!recoveryCheckpoint) return;
    try {
      await storageService.restoreRecoveryCheckpointTx(recoveryCheckpoint);
      await refreshProjectsList();
      setIsRecoveryModalOpen(false);
      toast.showSuccess(`Restored unsaved session for "${recoveryCheckpoint.projectName}"`);
      await openProject(recoveryCheckpoint.projectId);
      setRecoveryCheckpoint(null);
    } catch (err: any) {
      toast.showError(`Failed to restore checkpoint: ${err.message}`);
    }
  };

  // Discards recovery checkpoint
  const discardRecoveryCheckpoint = async () => {
    if (!recoveryCheckpoint) return;
    try {
      await storageService.clearRecoveryCheckpoint(recoveryCheckpoint.projectId);
      setIsRecoveryModalOpen(false);
      setRecoveryCheckpoint(null);
      toast.showInfo('Unsaved checkpoint discarded.');
    } catch (err: any) {
      toast.showError(`Error discarding checkpoint: ${err.message}`);
    }
  };

  const runProjectIsolationTest = async () => {
    const result = await ProjectService.runIsolationTest();
    await refreshProjectsList();
    return result;
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        activeProjectId,
        activeProjectData,
        isLoading,
        error,
        saveStatus,
        isDirty,
        dirtyModules,
        lastSavedTime,
        createProject,
        openProject,
        closeProject,
        renameProject,
        updateProject,
        duplicateProject,
        toggleArchiveProject,
        deleteProject,
        exportProjectData,
        importProjectData,
        updateActiveProjectData,
        saveActiveProjectWorkspace,
        getProjectStats,
        runProjectIsolationTest,
        isCreateModalOpen,
        setIsCreateModalOpen,
        projectSearchQuery,
        setProjectSearchQuery,
        selectedCategoryFilter,
        setSelectedCategoryFilter,
        recoveryCheckpoint,
        isRecoveryModalOpen,
        restoreRecoveryCheckpoint,
        discardRecoveryCheckpoint,
        closeRecoveryModal: () => setIsRecoveryModalOpen(false)
      }}
    >
      {children}

      {/* Crash / Unsaved Session Recovery Dialog */}
      <RecoveryModal
        isOpen={isRecoveryModalOpen}
        checkpoint={recoveryCheckpoint}
        // What the project currently has saved, so the dialog can show what a
        // restore would replace rather than only what it would write.
        currentStats={
          recoveryCheckpoint
            ? projects.find(p => p.id === recoveryCheckpoint.projectId)?.stats ?? null
            : null
        }
        onRestore={restoreRecoveryCheckpoint}
        onDiscard={discardRecoveryCheckpoint}
        onClose={() => setIsRecoveryModalOpen(false)}
      />

      {/* Portable .bhnx Package Restore & Verification Dialog */}
      <RestoreProjectModal
        isOpen={isRestoreModalOpen}
        packageData={pendingRestorePackage}
        onConfirmRestore={handleConfirmRestore}
        onCancel={() => {
          setIsRestoreModalOpen(false);
          setPendingRestorePackage(null);
        }}
      />
    </ProjectContext.Provider>
  );
};

export const useProject = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
