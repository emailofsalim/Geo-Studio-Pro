// ============================================================================
// BhuNex Studio — IndexedDB Storage Re-Export & Consolidation Bridge
// ============================================================================
// NOTE: Low-level persistence is consolidated in /src/services/StorageService.ts.
// This file exists to maintain backwards-compatibility across any legacy imports.

export {
  saveSessionSnapshot,
  loadLatestSessionSnapshot,
  getLastAutoSaveMeta,
  clearIndexedDbSessions,
  storageService,
  DB_NAME,
  DB_VERSION
} from '../services/StorageService';

export interface SurveySessionSnapshot {
  id?: string;
  timestamp: number;
  timeString: string;
  activeTab: string;
  workingZone: string;
  distanceUnit: 'm' | 'ft';
  isDarkMode: boolean;
  appData: {
    waypoints?: any[];
    gisLayers?: any[];
    cadastralParcels?: any[];
    boreholes?: any[];
    geofences?: any[];
    photos?: any[];
    [key: string]: any;
  };
}
