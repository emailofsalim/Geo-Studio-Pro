// ============================================================================
// BhuNex Studio — Authoritative Storage Service & IndexedDB Engine (Phase 5)
// ============================================================================

import { BhnxProjectPackage, BhnxManifest, CanonicalCRS, CanonicalUnitsConfig } from '../types/canonical';
import { GeoProject, ProjectDataState } from '../types/project';
import { makeZip, readZip, ZipFileEntry } from '../lib/zip';
import { calculateSha256, verifySha256 } from '../lib/crypto';
import { crsLabelFor, parseZone, DEFAULT_ZONE, crsIdentityFor } from '../lib/crsIdentity';

/** EPSG code for a stored working zone; falls back to the default zone's code only when the project never declared one. */
function crsEpsgFor(zone: string | undefined | null): number {
  const parsed = parseZone(zone);
  return crsIdentityFor(parsed ? (zone as string) : DEFAULT_ZONE).epsg;
}

export const DB_NAME = 'BhuNexStudio_Storage_v3';
export const DB_VERSION = 3;

export const STORE_PROJECTS = 'projects';
export const STORE_PROJECT_DATA = 'project_data';
export const STORE_RECOVERY = 'recovery_checkpoints';
export const STORE_KEYVAL = 'app_preferences';

export interface RecoveryCheckpoint {
  id: string; // e.g. 'checkpoint_project_123'
  projectId: string;
  projectName: string;
  timestamp: number;
  timeString: string;
  activeTab?: string;
  dirtyModules?: string[];
  data: ProjectDataState;
  recordCounts?: {
    waypoints: number;
    layers: number;
    parcels: number;
    boreholes: number;
    photos: number;
    geofences: number;
    calculations: number;
  };
  sha256?: string;
}

export interface ParsedBhnxPackage {
  manifest: BhnxManifest;
  project: GeoProject;
  settings: any;
  data: ProjectDataState;
  integrityStatus: 'VERIFIED' | 'FAILED' | 'LEGACY_UNHASHED';
  sha256: string;
  issues: string[];
}

export const SEED_PROJECTS: { project: GeoProject; data: ProjectDataState }[] = [
  {
    project: {
      id: 'project_pakhar_2026',
      userId: 'local',
      name: 'Pakhar Mine FY 2026-27',
      description: 'Bauxite lease block pit volumetrics, statutory 7.5m barrier zone, and core drillholes.',
      category: 'Mining Survey',
      crs: 'WGS 84 / UTM Zone 45N (EPSG:32645)',
      workingZone: '45N',
      createdAt: 1716000000000,
      updatedAt: 1716500000000,
      lastOpenedAt: 1716500000000,
      status: 'Active',
      isLocalOnly: true,
      stats: {
        waypointsCount: 6,
        layersCount: 3,
        parcelsCount: 2,
        boreholesCount: 4,
        photosCount: 2,
        geofencesCount: 2
      }
    },
    data: {
      projectId: 'project_pakhar_2026',
      workingZone: '45N',
      distanceUnit: 'm',
      localLandPreset: 'bihar_jharkhand',
      waypoints: [
        { id: 'BP-01', projectId: 'project_pakhar_2026', code: 'Boundary Pillar', E: 254820.5, N: 2605310.2, Z: 1045.2, lat: 23.5412, lon: 84.5934, acc: 0.02, zone: '45N', time: 1716000000000, proximityRadius: 10 },
        { id: 'BP-02', projectId: 'project_pakhar_2026', code: 'Boundary Pillar', E: 255420.1, N: 2605480.9, Z: 1052.8, lat: 23.5428, lon: 84.5993, acc: 0.03, zone: '45N', time: 1716000100000, proximityRadius: 10 },
        { id: 'BP-03', projectId: 'project_pakhar_2026', code: 'Boundary Pillar', E: 255650.0, N: 2604850.4, Z: 1038.4, lat: 23.5371, lon: 84.6015, acc: 0.02, zone: '45N', time: 1716000200000, proximityRadius: 10 },
        { id: 'BP-04', projectId: 'project_pakhar_2026', code: 'Boundary Pillar', E: 254950.8, N: 2604620.1, Z: 1030.1, lat: 23.5350, lon: 84.5946, acc: 0.04, zone: '45N', time: 1716000300000, proximityRadius: 10 },
        { id: 'CP-01', projectId: 'project_pakhar_2026', code: 'GPS Base Station', E: 255100.0, N: 2605000.0, Z: 1042.0, lat: 23.5384, lon: 84.5961, acc: 0.01, zone: '45N', time: 1716000400000, proximityRadius: 15 },
        { id: 'CP-02', projectId: 'project_pakhar_2026', code: 'Haul Road Intersection', E: 255280.0, N: 2605150.0, Z: 1040.5, lat: 23.5398, lon: 84.5979, acc: 0.03, zone: '45N', time: 1716000500000, proximityRadius: 8 }
      ],
      layers: [
        {
          id: 'layer_pakhar_ml',
          projectId: 'project_pakhar_2026',
          name: 'Statutory Lease Boundary',
          visible: true,
          color: '#d97706',
          fillColor: '#d97706',
          fillOpacity: 0.15,
          strokeWidth: 2,
          geomType: 'polygon',
          features: [
            {
              id: 'feat_pakhar_outer',
              projectId: 'project_pakhar_2026',
              name: 'Mining Lease Perimeter',
              kind: 'en',
              pts: [
                { a: 254820.5, b: 2605310.2 },
                { a: 255420.1, b: 2605480.9 },
                { a: 255650.0, b: 2604850.4 },
                { a: 254950.8, b: 2604620.1 }
              ]
            }
          ]
        },
        {
          id: 'layer_pakhar_barrier',
          projectId: 'project_pakhar_2026',
          name: '7.5m Statutory Safety Barrier',
          visible: true,
          color: '#ef4444',
          fillColor: '#ef4444',
          fillOpacity: 0.25,
          strokeWidth: 1.5,
          geomType: 'polygon',
          features: [
            {
              id: 'feat_pakhar_inner',
              projectId: 'project_pakhar_2026',
              name: 'Excavation Limit (7.5m Offset)',
              kind: 'en',
              pts: [
                { a: 254827.5, b: 2605303.2 },
                { a: 255413.1, b: 2605473.9 },
                { a: 255643.0, b: 2604857.4 },
                { a: 254957.8, b: 2604627.1 }
              ]
            }
          ]
        },
        {
          id: 'layer_pakhar_haul',
          projectId: 'project_pakhar_2026',
          name: 'Main Haul Road Alignment',
          visible: true,
          color: '#0ea5e9',
          fillColor: '#0ea5e9',
          fillOpacity: 0.3,
          strokeWidth: 3,
          geomType: 'line',
          features: [
            {
              id: 'feat_pakhar_road',
              projectId: 'project_pakhar_2026',
              name: 'Incline Pit Road',
              kind: 'en',
              pts: [
                { a: 254900.0, b: 2604700.0 },
                { a: 255150.0, b: 2604950.0 },
                { a: 255350.0, b: 2605200.0 }
              ]
            }
          ]
        }
      ],
      parcels: [
        {
          id: 'PARCEL-PK-01',
          projectId: 'project_pakhar_2026',
          plotNo: '101/A',
          khataNo: '14',
          khatian: 'Gair Mazarua Khas',
          ownerName: 'Forest & Environment Dept',
          landType: 'Forest Jungle Jhari',
          areaAcre: 14.5,
          areaSqm: 58679.4,
          coordinates: [
            { x: 254820.5, y: 2605310.2 },
            { x: 255100.0, y: 2605400.0 },
            { x: 255050.0, y: 2604900.0 },
            { x: 254950.8, y: 2604620.1 }
          ]
        },
        {
          id: 'PARCEL-PK-02',
          projectId: 'project_pakhar_2026',
          plotNo: '102',
          khataNo: '28',
          khatian: 'Raiyati',
          ownerName: 'Rameshwar Oraon & Others',
          landType: 'Tand II',
          areaAcre: 8.2,
          areaSqm: 33184.2,
          coordinates: [
            { x: 255100.0, y: 2605400.0 },
            { x: 255420.1, y: 2605480.9 },
            { x: 255350.0, y: 2605000.0 },
            { x: 255050.0, y: 2604900.0 }
          ]
        }
      ],
      boreholes: [
        { id: 'BH-01', projectId: 'project_pakhar_2026', easting: 255050, northing: 2605100, elevation: 1044.5, depth: 32.0, bauxiteThick: 6.2, obThick: 3.5, al2o3: 47.8, sio2: 3.2 },
        { id: 'BH-02', projectId: 'project_pakhar_2026', easting: 255250, northing: 2605200, elevation: 1048.2, depth: 28.5, bauxiteThick: 7.8, obThick: 2.8, al2o3: 49.5, sio2: 2.9 },
        { id: 'BH-03', projectId: 'project_pakhar_2026', easting: 255400, northing: 2605000, elevation: 1042.1, depth: 35.0, bauxiteThick: 5.4, obThick: 4.1, al2o3: 46.2, sio2: 4.0 },
        { id: 'BH-04', projectId: 'project_pakhar_2026', easting: 255150, northing: 2604800, elevation: 1036.8, depth: 30.0, bauxiteThick: 8.1, obThick: 2.2, al2o3: 51.2, sio2: 2.4 }
      ],
      photos: [
        { id: 'photo_pk_01', projectId: 'project_pakhar_2026', title: 'Pillar BP-01 Inspection', lat: 23.5412, lon: 84.5934, elevation: 1045.2, timestamp: 1716000000000, category: 'Boundary' },
        { id: 'photo_pk_02', projectId: 'project_pakhar_2026', title: 'BH-02 Core Tray Run #4', lat: 23.5398, lon: 84.5979, elevation: 1048.2, timestamp: 1716001000000, category: 'Geological' }
      ],
      geofences: [
        { id: 'geo_pk_blast', projectId: 'project_pakhar_2026', name: '500m Blast Danger Zone', type: 'danger', radiusMeters: 500, centerE: 255200, centerN: 2605050, active: true },
        { id: 'geo_pk_pit', projectId: 'project_pakhar_2026', name: 'Pit Active Dig Zone', type: 'active', radiusMeters: 250, centerE: 255150, centerN: 2604950, active: true }
      ]
    }
  },
  {
    project: {
      id: 'project_bagru_bauxite',
      userId: 'local',
      name: 'Bagru Bauxite Lease Block-B',
      description: 'Topographic contour layout, overburden boundary offsets, and GPS traverse targets.',
      category: 'Topographic Survey',
      crs: 'WGS 84 / UTM Zone 45N (EPSG:32645)',
      workingZone: '45N',
      createdAt: 1715000000000,
      updatedAt: 1715800000000,
      lastOpenedAt: 1715800000000,
      status: 'Active',
      isLocalOnly: true,
      stats: {
        waypointsCount: 4,
        layersCount: 2,
        parcelsCount: 0,
        boreholesCount: 2,
        photosCount: 0,
        geofencesCount: 0
      }
    },
    data: {
      projectId: 'project_bagru_bauxite',
      workingZone: '45N',
      distanceUnit: 'm',
      localLandPreset: 'bihar_jharkhand',
      waypoints: [
        { id: 'BGR-T1', projectId: 'project_bagru_bauxite', code: 'Traverse Station', E: 248100.0, N: 2598200.0, Z: 980.5, lat: 23.4765, lon: 84.5281, acc: 0.02, zone: '45N', time: 1715000000000, proximityRadius: 10 },
        { id: 'BGR-T2', projectId: 'project_bagru_bauxite', code: 'Traverse Station', E: 248600.0, N: 2598450.0, Z: 988.2, lat: 23.4788, lon: 84.5330, acc: 0.02, zone: '45N', time: 1715000100000, proximityRadius: 10 },
        { id: 'BGR-T3', projectId: 'project_bagru_bauxite', code: 'Traverse Station', E: 248850.0, N: 2597950.0, Z: 975.4, lat: 23.4743, lon: 84.5355, acc: 0.03, zone: '45N', time: 1715000200000, proximityRadius: 10 },
        { id: 'BGR-BM', projectId: 'project_bagru_bauxite', code: 'GTS Benchmark', E: 248300.0, N: 2598100.0, Z: 982.0, lat: 23.4756, lon: 84.5301, acc: 0.01, zone: '45N', time: 1715000300000, proximityRadius: 12 }
      ],
      layers: [
        {
          id: 'layer_bgr_boundary',
          projectId: 'project_bagru_bauxite',
          name: 'Bagru Block-B Boundary',
          visible: true,
          color: '#2563eb',
          fillColor: '#2563eb',
          fillOpacity: 0.2,
          strokeWidth: 2,
          geomType: 'polygon',
          features: [
            {
              id: 'feat_bgr_poly',
              projectId: 'project_bagru_bauxite',
              name: 'Block-B Boundary Polygon',
              kind: 'en',
              pts: [
                { a: 248100.0, b: 2598200.0 },
                { a: 248600.0, b: 2598450.0 },
                { a: 248850.0, b: 2597950.0 },
                { a: 248250.0, b: 2597750.0 }
              ]
            }
          ]
        },
        {
          id: 'layer_bgr_contours',
          projectId: 'project_bagru_bauxite',
          name: '980m Index Contour',
          visible: true,
          color: '#8b5cf6',
          fillColor: '#8b5cf6',
          fillOpacity: 0.1,
          strokeWidth: 2,
          geomType: 'line',
          features: [
            {
              id: 'feat_bgr_c980',
              projectId: 'project_bagru_bauxite',
              name: '980m RL Contour Line',
              kind: 'en',
              pts: [
                { a: 248150.0, b: 2598100.0 },
                { a: 248350.0, b: 2598200.0 },
                { a: 248550.0, b: 2598150.0 }
              ]
            }
          ]
        }
      ],
      parcels: [],
      boreholes: [
        { id: 'BGR-BH-01', projectId: 'project_bagru_bauxite', easting: 248350, northing: 2598100, elevation: 981.2, depth: 24.0, bauxiteThick: 5.5, obThick: 1.8, al2o3: 48.0, sio2: 3.1 },
        { id: 'BGR-BH-02', projectId: 'project_bagru_bauxite', easting: 248600, northing: 2598250, elevation: 986.5, depth: 28.0, bauxiteThick: 6.8, obThick: 2.1, al2o3: 50.1, sio2: 2.6 }
      ],
      photos: [],
      geofences: []
    }
  },
  {
    project: {
      id: 'project_chotanagpur_cadastre',
      userId: 'local',
      name: 'Chotanagpur Mouza Revenue Cadastre',
      description: 'Khasra plot boundary digitization, tenancy ownership schedule, and area discrepancy audits.',
      category: 'Cadastral Survey',
      crs: 'WGS 84 / UTM Zone 45N (EPSG:32645)',
      workingZone: '45N',
      createdAt: 1714000000000,
      updatedAt: 1715500000000,
      lastOpenedAt: 1715500000000,
      status: 'Active',
      isLocalOnly: true,
      stats: {
        waypointsCount: 3,
        layersCount: 0,
        parcelsCount: 2,
        boreholesCount: 0,
        photosCount: 0,
        geofencesCount: 0
      }
    },
    data: {
      projectId: 'project_chotanagpur_cadastre',
      workingZone: '45N',
      distanceUnit: 'm',
      localLandPreset: 'bihar_jharkhand',
      waypoints: [
        { id: 'TRI-01', projectId: 'project_chotanagpur_cadastre', code: 'Tri-Junction Pillar', E: 262100.0, N: 2612000.0, Z: 620.0, lat: 23.6021, lon: 84.6645, acc: 0.02, zone: '45N', time: 1714000000000, proximityRadius: 10 },
        { id: 'TRI-02', projectId: 'project_chotanagpur_cadastre', code: 'Tri-Junction Pillar', E: 262600.0, N: 2612300.0, Z: 625.5, lat: 23.6048, lon: 84.6694, acc: 0.02, zone: '45N', time: 1714000100000, proximityRadius: 10 },
        { id: 'TRI-03', projectId: 'project_chotanagpur_cadastre', code: 'Mouza Corner Pillar', E: 262400.0, N: 2611700.0, Z: 618.0, lat: 23.5994, lon: 84.6675, acc: 0.03, zone: '45N', time: 1714000200000, proximityRadius: 10 }
      ],
      layers: [],
      parcels: [
        {
          id: 'PARCEL-CN-101',
          projectId: 'project_chotanagpur_cadastre',
          plotNo: '101',
          khataNo: '12',
          khatian: 'Raiyati Dakhalkar',
          ownerName: 'Birsa Munda & Sons',
          landType: 'Dhan I (Lowland Paddy)',
          areaAcre: 2.45,
          areaSqm: 9914.8,
          coordinates: [
            { x: 262100.0, y: 2612000.0 },
            { x: 262350.0, y: 2612150.0 },
            { x: 262300.0, y: 2611850.0 },
            { x: 262150.0, y: 2611800.0 }
          ]
        },
        {
          id: 'PARCEL-CN-102',
          projectId: 'project_chotanagpur_cadastre',
          plotNo: '102',
          khataNo: '18',
          khatian: 'Bakast Malik',
          ownerName: 'Gram Sabha Common Land',
          landType: 'Gair Mazarua Aam (Village Pond)',
          areaAcre: 1.8,
          areaSqm: 7284.3,
          coordinates: [
            { x: 262350.0, y: 2612150.0 },
            { x: 262600.0, y: 2612300.0 },
            { x: 262500.0, y: 2611950.0 },
            { x: 262300.0, y: 2611850.0 }
          ]
        }
      ],
      boreholes: [],
      photos: [],
      geofences: []
    }
  }
];

export class StorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Opens the authoritative IndexedDB database with schema versioning & migration handlers.
   */
  getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB is not supported in this runtime environment.'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        console.info(`[StorageService] Upgrading IndexedDB from version ${oldVersion} to ${DB_VERSION}`);

        // Store 1: projects metadata
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          const projectStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          projectStore.createIndex('userId', 'userId', { unique: false });
          projectStore.createIndex('category', 'category', { unique: false });
        }

        // Store 2: isolated project datasets
        if (!db.objectStoreNames.contains(STORE_PROJECT_DATA)) {
          db.createObjectStore(STORE_PROJECT_DATA, { keyPath: 'projectId' });
        }

        // Store 3: crash recovery checkpoints
        if (!db.objectStoreNames.contains(STORE_RECOVERY)) {
          const recStore = db.createObjectStore(STORE_RECOVERY, { keyPath: 'id' });
          recStore.createIndex('timestamp', 'timestamp', { unique: false });
          recStore.createIndex('projectId', 'projectId', { unique: false });
        }

        // Store 4: application preferences & settings
        if (!db.objectStoreNames.contains(STORE_KEYVAL)) {
          db.createObjectStore(STORE_KEYVAL, { keyPath: 'key' });
        }
      };

      request.onsuccess = async () => {
        const db = request.result;
        try {
          await this.seedInitialProjectsIfEmpty(db);
        } catch (e) {
          console.warn('Initial project seeding notice:', e);
        }
        resolve(db);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error || new Error('Failed to open BhuNex IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  /**
   * Executes an atomic IndexedDB transaction with automatic rollback on rejection.
   */
  async runTransaction<T>(
    storeNames: string[],
    mode: IDBTransactionMode,
    operation: (tx: IDBTransaction) => Promise<T>
  ): Promise<T> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      let result: T;

      operation(tx)
        .then(res => {
          result = res;
        })
        .catch(err => {
          try {
            tx.abort();
          } catch {}
          reject(err);
        });

      tx.oncomplete = () => {
        resolve(result);
      };

      tx.onerror = () => {
        reject(tx.error || new Error('IndexedDB transaction failed.'));
      };

      tx.onabort = () => {
        reject(new Error('IndexedDB transaction was aborted.'));
      };
    });
  }

  private async seedInitialProjectsIfEmpty(db: IDBDatabase): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_PROJECTS, STORE_PROJECT_DATA], 'readwrite');
      const projStore = tx.objectStore(STORE_PROJECTS);
      const countReq = projStore.count();

      countReq.onsuccess = () => {
        if (countReq.result === 0) {
          const dataStore = tx.objectStore(STORE_PROJECT_DATA);
          for (const item of SEED_PROJECTS) {
            projStore.put(item.project);
            dataStore.put({
              projectId: item.project.id,
              data: item.data,
              updatedAt: item.project.updatedAt
            });
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ==========================================================================
  // Projects Metadata Store
  // ==========================================================================

  async getAllProjects(): Promise<GeoProject[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_PROJECTS], 'readonly');
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.getAll();

        req.onsuccess = () => {
          const results: GeoProject[] = req.result || [];
          results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          resolve(results);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return SEED_PROJECTS.map(s => s.project);
    }
  }

  async getProject(projectId: string): Promise<GeoProject | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_PROJECTS], 'readonly');
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.get(projectId);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      const p = SEED_PROJECTS.find(s => s.project.id === projectId);
      return p ? p.project : null;
    }
  }

  async saveProjectMeta(project: GeoProject): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_PROJECTS], 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      store.put(project);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    return this.runTransaction(
      [STORE_PROJECTS, STORE_PROJECT_DATA, STORE_RECOVERY],
      'readwrite',
      async (tx) => {
        tx.objectStore(STORE_PROJECTS).delete(projectId);
        tx.objectStore(STORE_PROJECT_DATA).delete(projectId);
        tx.objectStore(STORE_RECOVERY).delete(`checkpoint_${projectId}`);
      }
    );
  }

  // ==========================================================================
  // Isolated Project Data Store & Transactions
  // ==========================================================================

  async getProjectData(projectId: string): Promise<ProjectDataState | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_PROJECT_DATA], 'readonly');
        const store = tx.objectStore(STORE_PROJECT_DATA);
        const req = store.get(projectId);

        req.onsuccess = () => {
          const res = req.result;
          if (res && res.data) {
            const data: ProjectDataState = res.data;
            data.projectId = projectId;
            resolve(data);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      const seed = SEED_PROJECTS.find(s => s.project.id === projectId);
      return seed ? seed.data : null;
    }
  }

  /**
   * Transactional project dataset persistence with metadata stats synchronization.
   */
  async saveProjectData(projectId: string, data: ProjectDataState): Promise<void> {
    const sanitizedData: ProjectDataState = {
      ...data,
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
      updatedAt: Date.now()
    };

    return this.runTransaction(
      [STORE_PROJECT_DATA, STORE_PROJECTS],
      'readwrite',
      async (tx) => {
        const dataStore = tx.objectStore(STORE_PROJECT_DATA);
        dataStore.put({
          projectId,
          data: sanitizedData,
          updatedAt: Date.now()
        });

        const projStore = tx.objectStore(STORE_PROJECTS);
        const projReq = projStore.get(projectId);
        projReq.onsuccess = () => {
          const proj: GeoProject = projReq.result;
          if (proj) {
            proj.updatedAt = Date.now();
            proj.stats = {
              waypointsCount: sanitizedData.waypoints.length,
              layersCount: sanitizedData.layers.length,
              parcelsCount: sanitizedData.parcels.length,
              boreholesCount: sanitizedData.boreholes.length,
              photosCount: sanitizedData.photos.length,
              geofencesCount: sanitizedData.geofences.length,
              calculationsCount: (sanitizedData.calculations || []).length
            };
            projStore.put(proj);
          }
        };
      }
    );
  }

  // ==========================================================================
  // Recovery Checkpoints Store
  // ==========================================================================

  async saveRecoveryCheckpoint(checkpoint: RecoveryCheckpoint): Promise<void> {
    const rawData = JSON.stringify(checkpoint.data);
    const hash = await calculateSha256(rawData);
    const enriched: RecoveryCheckpoint = {
      ...checkpoint,
      sha256: hash,
      timeString: new Date(checkpoint.timestamp).toLocaleTimeString()
    };

    return this.runTransaction([STORE_RECOVERY], 'readwrite', async (tx) => {
      tx.objectStore(STORE_RECOVERY).put(enriched);
    });
  }

  async getLatestRecoveryCheckpoint(projectId?: string): Promise<RecoveryCheckpoint | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_RECOVERY], 'readonly');
      const store = tx.objectStore(STORE_RECOVERY);

      if (projectId) {
        const req = store.get(`checkpoint_${projectId}`);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      } else {
        // Find most recent checkpoint across all projects
        const req = store.getAll();
        req.onsuccess = () => {
          const list: RecoveryCheckpoint[] = req.result || [];
          if (list.length === 0) return resolve(null);
          list.sort((a, b) => b.timestamp - a.timestamp);
          resolve(list[0]);
        };
        req.onerror = () => reject(req.error);
      }
    });
  }

  async getAllRecoveryCheckpoints(): Promise<RecoveryCheckpoint[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_RECOVERY], 'readonly');
      const store = tx.objectStore(STORE_RECOVERY);
      const req = store.getAll();

      req.onsuccess = () => {
        const list: RecoveryCheckpoint[] = req.result || [];
        list.sort((a, b) => b.timestamp - a.timestamp);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async clearRecoveryCheckpoint(projectId: string): Promise<void> {
    const key = projectId.startsWith('checkpoint_') ? projectId : `checkpoint_${projectId}`;
    return this.runTransaction([STORE_RECOVERY], 'readwrite', async (tx) => {
      tx.objectStore(STORE_RECOVERY).delete(key);
    });
  }

  /**
   * Transactional Restore of a Recovery Checkpoint
   */
  async restoreRecoveryCheckpointTx(checkpoint: RecoveryCheckpoint): Promise<void> {
    return this.runTransaction(
      [STORE_PROJECT_DATA, STORE_PROJECTS, STORE_RECOVERY],
      'readwrite',
      async (tx) => {
        const dataStore = tx.objectStore(STORE_PROJECT_DATA);
        dataStore.put({
          projectId: checkpoint.projectId,
          data: checkpoint.data,
          updatedAt: Date.now()
        });

        const projStore = tx.objectStore(STORE_PROJECTS);
        const projReq = projStore.get(checkpoint.projectId);
        projReq.onsuccess = () => {
          const proj: GeoProject = projReq.result;
          if (proj) {
            proj.updatedAt = Date.now();
            proj.stats = {
              waypointsCount: checkpoint.data.waypoints?.length || 0,
              layersCount: checkpoint.data.layers?.length || 0,
              parcelsCount: checkpoint.data.parcels?.length || 0,
              boreholesCount: checkpoint.data.boreholes?.length || 0,
              photosCount: checkpoint.data.photos?.length || 0,
              geofencesCount: checkpoint.data.geofences?.length || 0,
              calculationsCount: checkpoint.data.calculations?.length || 0
            };
            projStore.put(proj);
          }
        };

        // Clear recovery checkpoint once committed
        tx.objectStore(STORE_RECOVERY).delete(checkpoint.id);
      }
    );
  }

  // ==========================================================================
  // Portable .bhnx Package Generation (Real Zipped Archive + SHA-256 Hashes)
  // ==========================================================================

  /**
   * Generates a real, portable .bhnx zipped project archive with folder structure and SHA-256 integrity verification.
   */
  async exportBhnxPackageArchive(projectId: string): Promise<{
    blob: Blob;
    filename: string;
    manifest: BhnxManifest;
    sha256: string;
  }> {
    const meta = await this.getProject(projectId);
    if (!meta) throw new Error(`Project "${projectId}" not found in storage.`);

    const data = (await this.getProjectData(projectId)) || {
      projectId,
      waypoints: [],
      layers: [],
      parcels: [],
      boreholes: [],
      photos: [],
      geofences: []
    };

    // Determine actual vertical reference and epoch (NEVER hardcode defaults)
    const verticalReference = (data as any)?.verticalDatum || (meta as any)?.verticalReference || 'Unknown';
    const coordinateEpoch = (meta as any)?.coordinateEpoch || (data as any)?.coordinateEpoch || 'Unknown';

    const crs: CanonicalCRS = {
      name: meta.crs || crsLabelFor(meta.workingZone),
      epsg: crsEpsgFor(meta.workingZone),
      datum: 'WGS 84',
      projection: 'Universal Transverse Mercator',
      zone: meta.workingZone || '45N',
      linearUnit: (data.distanceUnit as any) || 'm',
      verticalReference,
      coordinateEpoch
    };

    const units: CanonicalUnitsConfig = {
      linear: (data.distanceUnit as any) || 'm',
      area: 'ha',
      volume: 'm3',
      angular: 'deg',
      precision: {
        calculationPrecision: 12,
        storedPrecision: 6,
        displayPrecision: 3,
        exportPrecision: 4
      },
      coordinatePrecision: 3,
      elevationPrecision: 3,
      areaPrecision: 4
    };

    const manifest: BhnxManifest = {
      format: 'bhnx_package',
      schemaVersion: '3.0.0',
      appVersion: '3.7.0',
      generator: 'BhuNex Studio Professional Suite',
      createdAt: meta.createdAt || Date.now(),
      modifiedAt: Date.now(),
      projectId: meta.id,
      projectName: meta.name,
      projectCategory: meta.category,
      crs,
      units,
      recordCounts: {
        waypoints: data.waypoints?.length || 0,
        layers: data.layers?.length || 0,
        parcels: data.parcels?.length || 0,
        boreholes: data.boreholes?.length || 0,
        photos: data.photos?.length || 0,
        geofences: data.geofences?.length || 0,
        calculations: data.calculations?.length || 0
      }
    };

    const projectJson = {
      projectId: meta.id,
      id: meta.id,
      projectName: meta.name,
      name: meta.name,
      projectType: meta.category,
      category: meta.category,
      description: meta.description,
      workingZone: meta.workingZone,
      crs,
      units,
      schemaVersion: '3.0.0',
      applicationVersion: '3.7.0',
      status: meta.status,
      createdAt: meta.createdAt,
      updatedAt: Date.now()
    };

    const settingsJson = {
      units,
      localLandPreset: data.localLandPreset || 'bihar_jharkhand',
      workingZone: meta.workingZone
    };

    const encoder = new TextEncoder();

    // Prepare components
    const entries: { path: string; json: any }[] = [
      { path: 'project.json', json: projectJson },
      { path: 'settings/settings.json', json: settingsJson },
      { path: 'layers/layers.json', json: data.layers || [] },
      { path: 'survey/waypoints.json', json: data.waypoints || [] },
      { path: 'gps/tracks.json', json: data.tracks || [] },
      { path: 'cadastral/parcels.json', json: data.parcels || [] },
      { path: 'boreholes/boreholes.json', json: data.boreholes || [] },
      { path: 'geofence/zones.json', json: data.geofences || [] },
      { path: 'camera/photos.json', json: data.photos || [] },
      { path: 'calculations/calculations.json', json: data.calculations || [] },
      { path: 'qa/reports.json', json: data.qaReports || [] }
    ];

    const zipFiles: ZipFileEntry[] = [];
    const fileHashes: Record<string, string> = {};

    for (const item of entries) {
      const jsonStr = JSON.stringify(item.json, null, 2);
      const bytes = encoder.encode(jsonStr);
      const hash = await calculateSha256(bytes);
      fileHashes[item.path] = hash;
      zipFiles.push({ name: item.path, data: bytes });
    }

    // Add integrity manifest
    const integrityJson = {
      algorithm: 'SHA-256',
      generatedAt: Date.now(),
      files: fileHashes
    };
    const integrityBytes = encoder.encode(JSON.stringify(integrityJson, null, 2));
    zipFiles.push({ name: 'metadata/integrity.json', data: integrityBytes });

    // Compute manifest checksum
    manifest.checksum = await calculateSha256(encoder.encode(JSON.stringify(fileHashes)));
    const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2));
    zipFiles.unshift({ name: 'manifest.json', data: manifestBytes });

    // Pack into portable .bhnx zip archive
    const zipBytes = makeZip(zipFiles);
    const overallSha256 = await calculateSha256(zipBytes);

    const safeName = meta.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const filename = `${safeName}.bhnx`;
    const blob = new Blob([zipBytes], { type: 'application/octet-stream' });

    return {
      blob,
      filename,
      manifest,
      sha256: overallSha256
    };
  }

  /**
   * Extracts and validates an imported .bhnx archive or fallback JSON package with SHA-256 verification.
   */
  async parseBhnxPackageArchive(fileOrBuffer: ArrayBuffer | Uint8Array | string): Promise<ParsedBhnxPackage> {
    const issues: string[] = [];
    const decoder = new TextDecoder();

    let filesMap: Record<string, Uint8Array> = {};
    let isZipArchive = false;

    // Check if input is string (JSON) or binary (Zip)
    if (typeof fileOrBuffer === 'string') {
      try {
        const parsedJson = JSON.parse(fileOrBuffer);
        if (parsedJson.manifest && parsedJson.project && parsedJson.data) {
          const sha = await calculateSha256(fileOrBuffer);
          return {
            manifest: parsedJson.manifest,
            project: {
              id: parsedJson.project.id || parsedJson.project.projectId || `bhnx_${Date.now()}`,
              userId: 'local',
              name: parsedJson.project.name || parsedJson.project.projectName || 'Imported Project',
              description: parsedJson.project.description,
              category: parsedJson.project.category || parsedJson.project.projectType || 'General Survey',
              crs: typeof parsedJson.project.crs === 'string' ? parsedJson.project.crs : parsedJson.project.crs?.name || 'WGS 84 / UTM Zone 45N',
              workingZone: parsedJson.project.workingZone || parsedJson.manifest.crs?.zone || '45N',
              createdAt: parsedJson.project.createdAt || Date.now(),
              updatedAt: Date.now(),
              lastOpenedAt: Date.now(),
              status: 'Active'
            },
            settings: parsedJson.settings || {},
            data: parsedJson.data,
            integrityStatus: 'LEGACY_UNHASHED',
            sha256: sha,
            issues: []
          };
        }
      } catch (err: any) {
        issues.push(`Failed to parse as JSON string: ${err.message}`);
      }
    }

    // Binary Zip parsing
    try {
      const buffer = fileOrBuffer instanceof Uint8Array ? fileOrBuffer.buffer : (fileOrBuffer as ArrayBuffer);
      filesMap = await readZip(buffer);
      if (Object.keys(filesMap).length > 0) {
        isZipArchive = true;
      }
    } catch (err: any) {
      issues.push(`Zip decompression notice: ${err.message}`);
    }

    if (!isZipArchive || !filesMap['manifest.json']) {
      throw new Error('Invalid .bhnx archive: missing or unreadable manifest.json in root package.');
    }

    // 1. Parse Manifest
    const manifestStr = decoder.decode(filesMap['manifest.json']);
    const manifest: BhnxManifest = JSON.parse(manifestStr);

    if (manifest.format !== 'bhnx_package') {
      throw new Error(`Unsupported package format: "${manifest.format}". Expected "bhnx_package".`);
    }

    // 2. Parse Project Meta
    const projectStr = filesMap['project.json'] ? decoder.decode(filesMap['project.json']) : null;
    const projectRaw = projectStr ? JSON.parse(projectStr) : {};

    // 3. Parse Settings
    const settingsStr = filesMap['settings/settings.json'] ? decoder.decode(filesMap['settings/settings.json']) : null;
    const settings = settingsStr ? JSON.parse(settingsStr) : {};

    // 4. Parse Modules
    const readJson = (path: string, fallback: any = []) => {
      if (filesMap[path]) {
        try {
          return JSON.parse(decoder.decode(filesMap[path]));
        } catch {
          issues.push(`Corrupted JSON in ${path}`);
          return fallback;
        }
      }
      return fallback;
    };

    const targetProjectId = projectRaw.id || projectRaw.projectId || manifest.projectId || `bhnx_${Date.now()}`;

    const data: ProjectDataState = {
      projectId: targetProjectId,
      waypoints: readJson('survey/waypoints.json', []),
      tracks: readJson('gps/tracks.json', []),
      layers: readJson('layers/layers.json', []),
      parcels: readJson('cadastral/parcels.json', []),
      boreholes: readJson('boreholes/boreholes.json', []),
      geofences: readJson('geofence/zones.json', []),
      photos: readJson('camera/photos.json', []),
      calculations: readJson('calculations/calculations.json', []),
      qaReports: readJson('qa/reports.json', []),
      workingZone: projectRaw.workingZone || manifest.crs?.zone || '45N',
      distanceUnit: (manifest.units?.linear as any) || 'm',
      localLandPreset: settings.localLandPreset || 'bihar_jharkhand'
    };

    // 5. Verify Cryptographic SHA-256 Integrity
    let integrityStatus: 'VERIFIED' | 'FAILED' | 'LEGACY_UNHASHED' = 'LEGACY_UNHASHED';
    let packageSha256 = '';

    try {
      const allBytes = fileOrBuffer instanceof Uint8Array ? fileOrBuffer : new Uint8Array(fileOrBuffer as ArrayBuffer);
      packageSha256 = await calculateSha256(allBytes);

      if (filesMap['metadata/integrity.json']) {
        const integrityStr = decoder.decode(filesMap['metadata/integrity.json']);
        const integrityMeta = JSON.parse(integrityStr);
        let allMatched = true;

        for (const [filePath, expectedHash] of Object.entries(integrityMeta.files || {})) {
          if (filesMap[filePath]) {
            const actualHash = await calculateSha256(filesMap[filePath]);
            if (actualHash.toLowerCase() !== (expectedHash as string).toLowerCase()) {
              allMatched = false;
              issues.push(`Integrity mismatch on file: ${filePath}`);
            }
          } else {
            allMatched = false;
            issues.push(`Missing file specified in integrity manifest: ${filePath}`);
          }
        }

        integrityStatus = allMatched ? 'VERIFIED' : 'FAILED';
      }
    } catch (e: any) {
      issues.push(`Integrity check exception: ${e.message}`);
    }

    const crsStr = typeof projectRaw.crs === 'string' ? projectRaw.crs : (projectRaw.crs?.name || manifest.crs?.name || 'WGS 84 / UTM Zone 45N');

    const project: GeoProject = {
      id: targetProjectId,
      userId: 'local',
      name: projectRaw.projectName || projectRaw.name || manifest.projectName || 'Imported Project',
      description: projectRaw.description || `Restored from .bhnx package`,
      category: (projectRaw.projectType || projectRaw.category || manifest.projectCategory || 'General Survey') as any,
      crs: crsStr,
      workingZone: data.workingZone || '45N',
      createdAt: projectRaw.createdAt || manifest.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastOpenedAt: Date.now(),
      status: 'Active',
      stats: {
        waypointsCount: data.waypoints?.length || 0,
        layersCount: data.layers?.length || 0,
        parcelsCount: data.parcels?.length || 0,
        boreholesCount: data.boreholes?.length || 0,
        photosCount: data.photos?.length || 0,
        geofencesCount: data.geofences?.length || 0,
        calculationsCount: data.calculations?.length || 0
      }
    };

    return {
      manifest,
      project,
      settings,
      data,
      integrityStatus,
      sha256: packageSha256,
      issues
    };
  }

  /**
   * Transactionally restores an imported .bhnx package into IndexedDB.
   */
  async restoreBhnxPackageTx(
    parsed: ParsedBhnxPackage,
    options?: { asNewProject?: boolean; newName?: string }
  ): Promise<GeoProject> {
    const finalProjectId = options?.asNewProject
      ? `bhnx_proj_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`
      : parsed.project.id;

    const finalProject: GeoProject = {
      ...parsed.project,
      id: finalProjectId,
      name: options?.newName?.trim() || (options?.asNewProject ? `${parsed.project.name} (Restored)` : parsed.project.name),
      updatedAt: Date.now(),
      lastOpenedAt: Date.now()
    };

    const finalData: ProjectDataState = {
      ...parsed.data,
      projectId: finalProjectId,
      waypoints: (parsed.data.waypoints || []).map(w => ({ ...w, projectId: finalProjectId })),
      layers: (parsed.data.layers || []).map(l => ({
        ...l,
        projectId: finalProjectId,
        features: (l.features || []).map((f: any) => ({ ...f, projectId: finalProjectId }))
      })),
      parcels: (parsed.data.parcels || []).map(p => ({ ...p, projectId: finalProjectId })),
      boreholes: (parsed.data.boreholes || []).map(b => ({ ...b, projectId: finalProjectId })),
      photos: (parsed.data.photos || []).map(ph => ({ ...ph, projectId: finalProjectId })),
      geofences: (parsed.data.geofences || []).map(g => ({ ...g, projectId: finalProjectId })),
      tracks: (parsed.data.tracks || []).map(t => ({ ...t, projectId: finalProjectId })),
      calculations: (parsed.data.calculations || []).map(c => ({ ...c, projectId: finalProjectId })),
      qaReports: (parsed.data.qaReports || []).map(q => ({ ...q, projectId: finalProjectId }))
    };

    await this.runTransaction(
      [STORE_PROJECTS, STORE_PROJECT_DATA, STORE_RECOVERY],
      'readwrite',
      async (tx) => {
        tx.objectStore(STORE_PROJECTS).put(finalProject);
        tx.objectStore(STORE_PROJECT_DATA).put({
          projectId: finalProjectId,
          data: finalData,
          updatedAt: Date.now()
        });
        // Clear any lingering recovery checkpoints
        tx.objectStore(STORE_RECOVERY).delete(`checkpoint_${finalProjectId}`);
      }
    );

    return finalProject;
  }

  // ==========================================================================
  // Legacy Session Snapshot Bridge (Consolidates indexedDbStorage.ts)
  // ==========================================================================

  async saveSessionSnapshot(snapshot: any): Promise<any> {
    const now = Date.now();
    const timeString = new Date(now).toLocaleTimeString();
    const fullSnapshot = {
      id: snapshot.id || 'current_active_session',
      timestamp: now,
      timeString,
      activeTab: snapshot.activeTab,
      workingZone: snapshot.workingZone,
      distanceUnit: snapshot.distanceUnit,
      isDarkMode: snapshot.isDarkMode,
      appData: snapshot.appData || {}
    };

    await this.runTransaction([STORE_RECOVERY, STORE_KEYVAL], 'readwrite', async (tx) => {
      tx.objectStore(STORE_RECOVERY).put(fullSnapshot);
      tx.objectStore(STORE_KEYVAL).put({
        key: 'last_auto_save_meta',
        timestamp: now,
        timeString,
        tab: snapshot.activeTab
      });
    });

    return fullSnapshot;
  }

  async loadLatestSessionSnapshot(): Promise<any | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_RECOVERY], 'readonly');
        const store = tx.objectStore(STORE_RECOVERY);
        const req = store.get('current_active_session');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async getLastAutoSaveMeta(): Promise<{ timestamp: number; timeString: string; tab: string } | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction([STORE_KEYVAL], 'readonly');
        const store = tx.objectStore(STORE_KEYVAL);
        const req = store.get('last_auto_save_meta');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async clearIndexedDbSessions(): Promise<void> {
    try {
      await this.runTransaction([STORE_RECOVERY, STORE_KEYVAL], 'readwrite', async (tx) => {
        tx.objectStore(STORE_RECOVERY).clear();
        tx.objectStore(STORE_KEYVAL).delete('last_auto_save_meta');
      });
    } catch (err) {
      console.warn('Clear sessions notice:', err);
    }
  }

  // ==========================================================================
  // Legacy LocalStorage Migration (Enforces Project Isolation)
  // ==========================================================================

  async migrateLegacyGlobalLocalStorage(targetProjectId: string = 'project_pakhar_2026'): Promise<{ migrated: boolean; keysRemoved: string[] }> {
    const legacyKeys = [
      'survey_waypoints',
      'gis_studio_layers',
      'cadastral_parcels',
      'borehole_projects',
      'geofence_zones',
      'camera_landmarks',
      'gs_waypoints_v2',
      'calc_import_csv',
      'offset_import_pts',
      'geo_geofence_zones',
      'gs_proximity_events_v1',
      'geostudio_projects_list',
      'bhnx_projects_meta'
    ];

    const keysToRemove: string[] = [];
    const collectedData: Partial<ProjectDataState> = {};

    try {
      for (const key of legacyKeys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (key === 'survey_waypoints' || key === 'gs_waypoints_v2') {
              if (Array.isArray(parsed) && parsed.length > 0) collectedData.waypoints = parsed;
            } else if (key === 'gis_studio_layers') {
              if (Array.isArray(parsed) && parsed.length > 0) collectedData.layers = parsed;
            } else if (key === 'cadastral_parcels') {
              if (Array.isArray(parsed) && parsed.length > 0) collectedData.parcels = parsed;
            } else if (key === 'borehole_projects') {
              if (Array.isArray(parsed) && parsed.length > 0) collectedData.boreholes = parsed;
            } else if (key === 'camera_landmarks') {
              if (Array.isArray(parsed) && parsed.length > 0) collectedData.photos = parsed;
            } else if (key === 'geofence_zones' || key === 'geo_geofence_zones') {
              if (Array.isArray(parsed) && parsed.length > 0) collectedData.geofences = parsed;
            }
          } catch {}
          keysToRemove.push(key);
        }
      }

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('gs_project_data_') || k.startsWith('bhnx_data_') || k.startsWith('geostudio_user_projects_'))) {
          keysToRemove.push(k);
        }
      }

      if (Object.keys(collectedData).length > 0) {
        const existing = (await this.getProjectData(targetProjectId)) || {
          projectId: targetProjectId,
          waypoints: [],
          layers: [],
          parcels: [],
          boreholes: [],
          photos: [],
          geofences: []
        };

        const merged: ProjectDataState = {
          ...existing,
          projectId: targetProjectId,
          waypoints: collectedData.waypoints ? [...existing.waypoints, ...collectedData.waypoints] : existing.waypoints,
          layers: collectedData.layers ? [...existing.layers, ...collectedData.layers] : existing.layers,
          parcels: collectedData.parcels ? [...existing.parcels, ...collectedData.parcels] : existing.parcels,
          boreholes: collectedData.boreholes ? [...existing.boreholes, ...collectedData.boreholes] : existing.boreholes,
          photos: collectedData.photos ? [...existing.photos, ...collectedData.photos] : existing.photos,
          geofences: collectedData.geofences ? [...existing.geofences, ...collectedData.geofences] : existing.geofences
        };

        await this.saveProjectData(targetProjectId, merged);
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }

      return { migrated: keysToRemove.length > 0, keysRemoved: keysToRemove };
    } catch (e) {
      console.warn('Legacy migration error:', e);
      return { migrated: false, keysRemoved: [] };
    }
  }

  // Legacy export alias
  async exportBhnxPackage(projectId: string): Promise<BhnxProjectPackage> {
    const meta = await this.getProject(projectId);
    if (!meta) throw new Error(`Project ${projectId} not found`);

    const data = (await this.getProjectData(projectId)) || {
      projectId,
      waypoints: [],
      layers: [],
      parcels: [],
      boreholes: [],
      photos: [],
      geofences: []
    };

    const crs: CanonicalCRS = {
      name: meta.crs || crsLabelFor(meta.workingZone),
      epsg: crsEpsgFor(meta.workingZone),
      datum: 'WGS 84',
      projection: 'Universal Transverse Mercator',
      zone: meta.workingZone || '45N',
      linearUnit: (data.distanceUnit as any) || 'm',
      verticalReference: (data as any)?.verticalDatum || (meta as any)?.verticalReference || 'Unknown',
      coordinateEpoch: (meta as any)?.coordinateEpoch || (data as any)?.coordinateEpoch || 'Unknown'
    };

    const units: CanonicalUnitsConfig = {
      linear: (data.distanceUnit as any) || 'm',
      area: 'ha',
      volume: 'm3',
      angular: 'deg',
      precision: {
        calculationPrecision: 12,
        storedPrecision: 6,
        displayPrecision: 3,
        exportPrecision: 4
      },
      coordinatePrecision: 3,
      elevationPrecision: 3,
      areaPrecision: 4
    };

    const manifest: BhnxManifest = {
      format: 'bhnx_package',
      schemaVersion: '3.0.0',
      appVersion: '3.7.0',
      generator: 'BhuNex Studio Professional Suite',
      createdAt: meta.createdAt || Date.now(),
      modifiedAt: Date.now(),
      projectId: meta.id,
      projectName: meta.name,
      projectCategory: meta.category,
      crs,
      units,
      recordCounts: {
        waypoints: data.waypoints?.length || 0,
        layers: data.layers?.length || 0,
        parcels: data.parcels?.length || 0,
        boreholes: data.boreholes?.length || 0,
        photos: data.photos?.length || 0,
        geofences: data.geofences?.length || 0,
        calculations: data.calculations?.length || 0
      }
    };

    const rawPackage: BhnxProjectPackage = {
      manifest,
      project: {
        projectId: meta.id,
        id: meta.id,
        projectName: meta.name,
        name: meta.name,
        projectType: meta.category,
        category: meta.category,
        description: meta.description,
        workingZone: meta.workingZone,
        crs,
        units,
        schemaVersion: '3.0.0',
        applicationVersion: '3.7.0',
        status: meta.status,
        createdAt: meta.createdAt,
        updatedAt: Date.now()
      },
      settings: {
        units,
        localLandPreset: data.localLandPreset
      },
      data: {
        waypoints: (data.waypoints || []).map(w => ({ ...w, projectId: meta.id })),
        tracks: (data.tracks || []).map(t => ({ ...t, projectId: meta.id })),
        layers: (data.layers || []).map(l => ({ ...l, projectId: meta.id })),
        parcels: (data.parcels || []).map(p => ({ ...p, projectId: meta.id })),
        boreholes: (data.boreholes || []).map(b => ({ ...b, projectId: meta.id })),
        geofences: (data.geofences || []).map(g => ({ ...g, projectId: meta.id })),
        photos: (data.photos || []).map(ph => ({ ...ph, projectId: meta.id })),
        calculations: (data.calculations || []).map(c => ({ ...c, projectId: meta.id })),
        qaReports: (data.qaReports || []).map(q => ({ ...q, projectId: meta.id })),
        auditTrail: [
          {
            timestamp: Date.now(),
            action: 'EXPORT_BHNX',
            detail: `Project exported as native .bhnx package`
          }
        ]
      }
    };

    const jsonString = JSON.stringify(rawPackage);
    manifest.checksum = await calculateSha256(jsonString);
    rawPackage.manifest = manifest;

    return rawPackage;
  }

  // Legacy import alias
  async importBhnxPackage(packageJson: BhnxProjectPackage | string): Promise<GeoProject> {
    const parsed = await this.parseBhnxPackageArchive(typeof packageJson === 'string' ? packageJson : JSON.stringify(packageJson));
    return this.restoreBhnxPackageTx(parsed);
  }
}

export const storageService = new StorageService();

// Export consolidated convenience functions for any legacy components
export const saveSessionSnapshot = (snapshot: any) => storageService.saveSessionSnapshot(snapshot);
export const loadLatestSessionSnapshot = () => storageService.loadLatestSessionSnapshot();
export const getLastAutoSaveMeta = () => storageService.getLastAutoSaveMeta();
export const clearIndexedDbSessions = () => storageService.clearIndexedDbSessions();
