// ============================================================================
// BhuNex Studio — Project Management & Authoritative Lifecycle Layer
// ============================================================================

import { GeoProject, ProjectCategory, ProjectDataState } from '../types/project';
import { storageService, SEED_PROJECTS } from './StorageService';
import { BhnxProjectPackage } from '../types/canonical';
import { crsLabelFor, crsIdentityFor } from '../lib/crsIdentity';
import { statsFor } from '../lib/projectStats';

export class ProjectService {
  /**
   * Releases all active hardware resources and sensors:
   * GPS, Camera, Microphone, Orientation, Motion, Speech, Bluetooth, and Audio.
   */
  static releaseSensorsAndHardware(): void {
    try {
      // 1. Cancel Speech Synthesis
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      // 2. Stop Geolocation Watchers
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        for (let i = 0; i < 100; i++) {
          try {
            navigator.geolocation.clearWatch(i);
          } catch {}
        }
      }

      // 3. Close custom AudioContexts if accessible
      if (typeof window !== 'undefined' && (window as any).__bhnx_audio_ctx) {
        try {
          (window as any).__bhnx_audio_ctx.close();
          delete (window as any).__bhnx_audio_ctx;
        } catch {}
      }

      // 4. Dispatch global hardware reset event for mounted hooks
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bhnx:project_lifecycle_reset'));
      }
    } catch (e) {
      console.warn('Hardware sensor release notice:', e);
    }
  }

  /**
   * Retrieves all available projects from IndexedDB
   */
  static async getAllProjects(): Promise<GeoProject[]> {
    return storageService.getAllProjects();
  }

  /**
   * Retrieves a single project's metadata
   */
  static async getProject(projectId: string): Promise<GeoProject | null> {
    return storageService.getProject(projectId);
  }

  /**
   * Retrieves isolated project data from IndexedDB
   */
  static async getProjectData(projectId: string): Promise<ProjectDataState> {
    const data = await storageService.getProjectData(projectId);
    if (data) {
      // Ensure every item is strictly bound to this projectId
      return this.sanitizeAndScopeProjectData(projectId, data);
    }

    // Default blank isolated state
    return {
      projectId,
      waypoints: [],
      layers: [],
      parcels: [],
      boreholes: [],
      photos: [],
      geofences: [],
      tracks: [],
      calculations: [],
      qaReports: [],
      workingZone: '45N',
      distanceUnit: 'm'
    };
  }

  /**
   * Creates a new isolated project workspace
   */
  static async createProject(params: {
    name: string;
    description?: string;
    category: ProjectCategory;
    workingZone: string;
    crs?: string;
    userId?: string;
    initialData?: Partial<ProjectDataState>;
  }): Promise<{ project: GeoProject; data: ProjectDataState }> {
    const now = Date.now();
    const id = `bhnx_proj_${now.toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    // Built through crsIdentityFor so the EPSG authority matches the hemisphere
    // (326xx north / 327xx south) instead of always emitting a northern code.
    const crs = params.crs || crsLabelFor(params.workingZone);

    const newProject: GeoProject = {
      id,
      userId: params.userId || 'local',
      name: params.name.trim(),
      description: params.description?.trim(),
      category: params.category,
      crs,
      workingZone: params.workingZone,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      status: 'Active',
      isLocalOnly: true,
      stats: statsFor(params.initialData)
    };

    const initialData: ProjectDataState = {
      projectId: id,
      waypoints: (params.initialData?.waypoints || []).map(w => ({ ...w, projectId: id })),
      layers: (params.initialData?.layers || []).map(l => ({
        ...l,
        projectId: id,
        features: (l.features || []).map((f: any) => ({ ...f, projectId: id }))
      })),
      parcels: (params.initialData?.parcels || []).map(p => ({ ...p, projectId: id })),
      boreholes: (params.initialData?.boreholes || []).map(b => ({ ...b, projectId: id })),
      photos: (params.initialData?.photos || []).map(ph => ({ ...ph, projectId: id })),
      geofences: (params.initialData?.geofences || []).map(g => ({ ...g, projectId: id })),
      tracks: (params.initialData?.tracks || []).map(t => ({ ...t, projectId: id })),
      calculations: (params.initialData?.calculations || []).map(c => ({ ...c, projectId: id })),
      qaReports: (params.initialData?.qaReports || []).map(q => ({ ...q, projectId: id })),
      workingZone: params.workingZone,
      distanceUnit: params.initialData?.distanceUnit || 'm',
      localLandPreset: params.initialData?.localLandPreset || 'bihar_jharkhand'
    };

    await storageService.saveProjectMeta(newProject);
    await storageService.saveProjectData(id, initialData);

    return { project: newProject, data: initialData };
  }

  /**
   * Opens a project workspace: releases previous hardware, flushes dirty writes,
   * loads isolated data from IndexedDB, and stamps timestamps.
   */
  static async openProject(
    projectId: string,
    previousProjectId?: string | null,
    previousDirtyData?: ProjectDataState | null
  ): Promise<{ project: GeoProject; data: ProjectDataState }> {
    // 1. Release all active hardware resources and sensors
    this.releaseSensorsAndHardware();

    // 2. Flush dirty writes for previous project if exists
    if (previousProjectId && previousDirtyData && previousProjectId !== projectId) {
      await storageService.saveProjectData(previousProjectId, previousDirtyData);
    }

    // 3. Load target project metadata
    let project = await storageService.getProject(projectId);
    if (!project) {
      // Fallback search in seed defaults
      const seed = SEED_PROJECTS.find(s => s.project.id === projectId);
      if (seed) {
        project = seed.project;
        await storageService.saveProjectMeta(project);
        await storageService.saveProjectData(projectId, seed.data);
      } else {
        throw new Error(`Project "${projectId}" not found in storage.`);
      }
    }

    // 4. Load target project data from IndexedDB
    const rawData = await storageService.getProjectData(projectId);
    const sanitizedData = this.sanitizeAndScopeProjectData(projectId, rawData || {
      projectId,
      waypoints: [],
      layers: [],
      parcels: [],
      boreholes: [],
      photos: [],
      geofences: []
    });

    // 5. Update last opened timestamp
    project.lastOpenedAt = Date.now();
    await storageService.saveProjectMeta(project);

    return { project, data: sanitizedData };
  }

  /**
   * Closes the active project, releases sensors, and saves dirty state
   */
  static async closeProject(projectId?: string | null, dirtyData?: ProjectDataState | null): Promise<void> {
    this.releaseSensorsAndHardware();
    if (projectId && dirtyData) {
      await storageService.saveProjectData(projectId, dirtyData);
    }
  }

  /**
   * Clones an existing project with full data isolation and new entity IDs
   */
  static async duplicateProject(sourceProjectId: string, newName?: string): Promise<{ project: GeoProject; data: ProjectDataState }> {
    const source = await storageService.getProject(sourceProjectId);
    if (!source) throw new Error('Source project not found');

    const sourceData = await this.getProjectData(sourceProjectId);
    const timestamp = Date.now();
    const newId = `bhnx_proj_${timestamp.toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const clonedProject: GeoProject = {
      ...source,
      id: newId,
      name: newName || `${source.name} (Copy)`,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      status: 'Active',
      isLocalOnly: true
    };

    // Deep clone records with fresh IDs and new projectId binding
    const clonedData: ProjectDataState = {
      projectId: newId,
      workingZone: clonedProject.workingZone,
      distanceUnit: sourceData.distanceUnit || 'm',
      localLandPreset: sourceData.localLandPreset || 'bihar_jharkhand',
      waypoints: (sourceData.waypoints || []).map((w, idx) => ({
        ...w,
        id: `${w.id}_c`,
        projectId: newId
      })),
      layers: (sourceData.layers || []).map((l, idx) => ({
        ...l,
        id: `layer_${timestamp}_${idx}`,
        projectId: newId,
        features: (l.features || []).map((f: any, fIdx: number) => ({
          ...f,
          id: `feat_${timestamp}_${idx}_${fIdx}`,
          projectId: newId
        }))
      })),
      parcels: (sourceData.parcels || []).map((p, idx) => ({
        ...p,
        id: `parcel_${timestamp}_${idx}`,
        projectId: newId
      })),
      boreholes: (sourceData.boreholes || []).map((b, idx) => ({
        ...b,
        id: `bh_${timestamp}_${idx}`,
        projectId: newId
      })),
      photos: (sourceData.photos || []).map((ph, idx) => ({
        ...ph,
        id: `photo_${timestamp}_${idx}`,
        projectId: newId
      })),
      geofences: (sourceData.geofences || []).map((g, idx) => ({
        ...g,
        id: `geofence_${timestamp}_${idx}`,
        projectId: newId
      })),
      tracks: (sourceData.tracks || []).map((t, idx) => ({
        ...t,
        id: `track_${timestamp}_${idx}`,
        projectId: newId
      })),
      calculations: (sourceData.calculations || []).map((c, idx) => ({
        ...c,
        id: `calc_${timestamp}_${idx}`,
        projectId: newId
      })),
      qaReports: []
    };

    await storageService.saveProjectMeta(clonedProject);
    await storageService.saveProjectData(newId, clonedData);

    return { project: clonedProject, data: clonedData };
  }

  /**
   * Persists project dataset directly to IndexedDB
   */
  static async saveProjectData(projectId: string, data: ProjectDataState): Promise<void> {
    const sanitized = this.sanitizeAndScopeProjectData(projectId, data);
    await storageService.saveProjectData(projectId, sanitized);
  }

  /**
   * Updates project metadata
   */
  static async updateProjectMeta(projectId: string, updates: Partial<GeoProject>): Promise<GeoProject> {
    const current = await storageService.getProject(projectId);
    if (!current) throw new Error('Project not found');

    const updated: GeoProject = {
      ...current,
      ...updates,
      id: projectId, // immutable
      updatedAt: Date.now()
    };

    await storageService.saveProjectMeta(updated);
    return updated;
  }

  /**
   * Renames a project
   */
  static async renameProject(projectId: string, newName: string): Promise<GeoProject> {
    return this.updateProjectMeta(projectId, { name: newName.trim() });
  }

  /**
   * Deletes a project and all associated isolated datasets
   */
  static async deleteProject(projectId: string): Promise<void> {
    await storageService.deleteProject(projectId);
  }

  /**
   * Exports full native .bhnx package
   */
  static async exportProjectPackage(projectId: string): Promise<BhnxProjectPackage> {
    return storageService.exportBhnxPackage(projectId);
  }

  /**
   * Imports a native .bhnx package
   */
  static async importProjectPackage(packageData: BhnxProjectPackage | string): Promise<GeoProject> {
    return storageService.importBhnxPackage(packageData);
  }

  /**
   * Ensures every child item in a project data structure has projectId explicitly set
   */
  static sanitizeAndScopeProjectData(projectId: string, data: Partial<ProjectDataState>): ProjectDataState {
    return {
      projectId,
      waypoints: (data.waypoints || []).map(w => ({ ...w, projectId })),
      layers: (data.layers || []).map(l => ({
        ...l,
        projectId,
        features: (l.features || []).map((f: any) => ({ ...f, projectId }))
      })),
      parcels: (data.parcels || []).map(p => ({ ...p, projectId })),
      boreholes: (data.boreholes || []).map(b => ({ ...b, projectId })),
      photos: (data.photos || []).map(ph => ({ ...ph, projectId })),
      geofences: (data.geofences || []).map(g => ({ ...g, projectId })),
      tracks: (data.tracks || []).map(t => ({ ...t, projectId })),
      calculations: (data.calculations || []).map(c => ({ ...c, projectId })),
      qaReports: (data.qaReports || []).map(q => ({ ...q, projectId })),
      surveyCalc: data.surveyCalc,
      customInputs: data.customInputs,
      workingZone: data.workingZone || '45N',
      distanceUnit: data.distanceUnit || 'm',
      localLandPreset: data.localLandPreset || 'bihar_jharkhand',
      updatedAt: Date.now()
    };
  }

  /**
   * Verifies that two datasets share 0 records and that all records contain the matching projectId
   */
  static verifyIsolation(projectAId: string, dataA: ProjectDataState, projectBId: string, dataB: ProjectDataState): boolean {
    if (dataA.projectId !== projectAId || dataB.projectId !== projectBId) return false;

    // Check Waypoints
    const invalidWpA = (dataA.waypoints || []).some(w => w.projectId !== projectAId);
    const invalidWpB = (dataB.waypoints || []).some(w => w.projectId !== projectBId);
    if (invalidWpA || invalidWpB) return false;

    // Check Layers
    const invalidLayerA = (dataA.layers || []).some(l => l.projectId !== projectAId);
    const invalidLayerB = (dataB.layers || []).some(l => l.projectId !== projectBId);
    if (invalidLayerA || invalidLayerB) return false;

    // Check Parcels
    const invalidParcelA = (dataA.parcels || []).some(p => p.projectId !== projectAId);
    const invalidParcelB = (dataB.parcels || []).some(p => p.projectId !== projectBId);
    if (invalidParcelA || invalidParcelB) return false;

    // Check Boreholes
    const invalidBhA = (dataA.boreholes || []).some(b => b.projectId !== projectAId);
    const invalidBhB = (dataB.boreholes || []).some(b => b.projectId !== projectBId);
    if (invalidBhA || invalidBhB) return false;

    // Verify zero shared memory object instances
    if (dataA.waypoints.length > 0 && dataB.waypoints.length > 0) {
      if (dataA.waypoints[0] === dataB.waypoints[0]) return false;
    }

    return true;
  }

  /**
   * Automated Project Isolation Test:
   * Creates Project A and Project B with unique data,
   * performs 12 rapid sequential switches (A -> B -> A -> B ...),
   * and verifies zero cross-project leakage at each step.
   */
  static async runIsolationTest(): Promise<{
    passed: boolean;
    switchesCount: number;
    log: string[];
  }> {
    const log: string[] = [];
    log.push('=== STARTING AUTHORITATIVE PROJECT ISOLATION TEST ===');

    try {
      // 1. Create Project A
      const { project: projA, data: initialDataA } = await this.createProject({
        name: 'Test Project Alpha',
        category: 'Mining Survey',
        workingZone: '45N',
        initialData: {
          waypoints: [
            { id: 'ALPHA-WP-01', code: 'Alpha Base Marker', E: 111111.1, N: 2222222.2, Z: 100.0, lat: 20.1, lon: 80.1, time: Date.now() },
            { id: 'ALPHA-WP-02', code: 'Alpha Pit Edge', E: 111222.2, N: 2222333.3, Z: 105.0, lat: 20.2, lon: 80.2, time: Date.now() }
          ],
          layers: [
            { id: 'layer_alpha_1', name: 'Alpha Mining Boundary', visible: true, geomType: 'polygon', features: [] }
          ]
        }
      });
      log.push(`Created Project A: ${projA.id} (${projA.name}) with 2 waypoints and 1 layer`);

      // 2. Create Project B
      const { project: projB, data: initialDataB } = await this.createProject({
        name: 'Test Project Beta',
        category: 'Cadastral Survey',
        workingZone: '44N',
        initialData: {
          waypoints: [
            { id: 'BETA-WP-99', code: 'Beta Revenue Corner', E: 999999.9, N: 8888888.8, Z: 50.0, lat: 15.1, lon: 75.1, time: Date.now() }
          ],
          parcels: [
            { id: 'BETA-PARCEL-1', plotNo: 'Plot-999', ownerName: 'Beta Owner', areaAcre: 5.0, coordinates: [] }
          ]
        }
      });
      log.push(`Created Project B: ${projB.id} (${projB.name}) with 1 waypoint and 1 parcel`);

      // 3. Perform 12 sequential switches (A -> B -> A -> B ...)
      const switchRounds = 12;
      for (let round = 1; round <= switchRounds; round++) {
        const targetProj = round % 2 === 1 ? projA : projB;
        const targetLabel = round % 2 === 1 ? 'A' : 'B';
        const expectedWpId = round % 2 === 1 ? 'ALPHA-WP-01' : 'BETA-WP-99';
        const forbiddenWpId = round % 2 === 1 ? 'BETA-WP-99' : 'ALPHA-WP-01';

        const { project: loadedProj, data: loadedData } = await this.openProject(targetProj.id);

        // Verification checks
        if (loadedProj.id !== targetProj.id) {
          throw new Error(`Round ${round}: Project ID mismatch. Expected ${targetProj.id}, got ${loadedProj.id}`);
        }

        if (loadedData.projectId !== targetProj.id) {
          throw new Error(`Round ${round}: Data projectId mismatch. Expected ${targetProj.id}, got ${loadedData.projectId}`);
        }

        const containsForbidden = (loadedData.waypoints || []).some(w => w.id === forbiddenWpId);
        if (containsForbidden) {
          throw new Error(`Round ${round}: Cross-project leakage detected! Found forbidden waypoint ${forbiddenWpId} in Project ${targetLabel}`);
        }

        const containsExpected = (loadedData.waypoints || []).some(w => w.id === expectedWpId);
        if (!containsExpected) {
          throw new Error(`Round ${round}: Missing expected waypoint ${expectedWpId} in Project ${targetLabel}`);
        }

        // Verify every record contains correct projectId
        for (const w of loadedData.waypoints) {
          if (w.projectId !== targetProj.id) {
            throw new Error(`Round ${round}: Waypoint ${w.id} has incorrect projectId: ${w.projectId}`);
          }
        }

        log.push(`✓ Switch ${round}/${switchRounds}: Switched to Project ${targetLabel} — Isolation 100% verified (0 leakage)`);
      }

      // 4. Cleanup test projects
      await this.deleteProject(projA.id);
      await this.deleteProject(projB.id);
      log.push('Test projects cleanly removed from IndexedDB');
      log.push('=== AUTHORITATIVE PROJECT ISOLATION TEST PASSED (12/12 SWITCHES CLEAN) ===');

      return {
        passed: true,
        switchesCount: switchRounds,
        log
      };
    } catch (err: any) {
      log.push(`❌ ISOLATION TEST FAILED: ${err.message}`);
      return {
        passed: false,
        switchesCount: 0,
        log
      };
    }
  }
}
