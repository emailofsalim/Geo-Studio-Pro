// IndexedDB Persistence Engine for Geomatics Survey Suite
// Stores active survey sessions, input states, waypoints, layers, and calculations every 30 seconds

export interface SurveySessionSnapshot {
  id?: string;
  timestamp: number;
  timeString: string;
  activeTab: string;
  workingZone: string;
  distanceUnit: 'm' | 'ft' | 'us-ft';
  isDarkMode: boolean;
  appData: {
    gpsWaypoints?: any[];
    gpsTrackLog?: any[];
    proximitySettings?: any;
    gisFeatures?: any[];
    gisLayers?: any[];
    geofenceZones?: any[];
    geofenceBreaches?: any[];
    boreholeProjects?: any[];
    surveyCalcState?: any;
    formatConverterQueue?: any[];
    cadastralState?: any;
    bhunakshaState?: any;
    customInputs?: Record<string, any>;
  };
}

const DB_NAME = 'GeoStudioGeomaticsDB_v2';
const DB_VERSION = 1;
const STORE_SESSIONS = 'survey_sessions';
const STORE_KEYVALUE = 'app_keyval_store';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const sessionStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        sessionStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_KEYVALUE)) {
        db.createObjectStore(STORE_KEYVALUE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Saves or auto-saves the active survey session state into IndexedDB.
 */
export async function saveSessionSnapshot(snapshot: Omit<SurveySessionSnapshot, 'id' | 'timestamp' | 'timeString'> & { id?: string }): Promise<SurveySessionSnapshot> {
  try {
    const db = await openDatabase();
    const now = Date.now();
    const timeString = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const fullSnapshot: SurveySessionSnapshot = {
      id: snapshot.id || 'current_active_session',
      timestamp: now,
      timeString,
      activeTab: snapshot.activeTab,
      workingZone: snapshot.workingZone,
      distanceUnit: snapshot.distanceUnit,
      isDarkMode: snapshot.isDarkMode,
      appData: snapshot.appData || {}
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SESSIONS, STORE_KEYVALUE], 'readwrite');
      const sessionStore = tx.objectStore(STORE_SESSIONS);
      const kvStore = tx.objectStore(STORE_KEYVALUE);

      sessionStore.put(fullSnapshot);
      kvStore.put({ key: 'last_auto_save_meta', timestamp: now, timeString, tab: snapshot.activeTab });

      tx.oncomplete = () => resolve(fullSnapshot);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB auto-save fallback:', err);
    // Fallback to localStorage for core pointers if indexedDB throws in sandbox
    try {
      localStorage.setItem('geostudio_last_autosave', JSON.stringify({
        timestamp: Date.now(),
        tab: snapshot.activeTab,
        zone: snapshot.workingZone
      }));
    } catch {}
    throw err;
  }
}

/**
 * Loads the latest active survey session snapshot from IndexedDB.
 */
export async function loadLatestSessionSnapshot(): Promise<SurveySessionSnapshot | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SESSIONS], 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);
      const request = store.get('current_active_session');

      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB read fallback:', err);
    return null;
  }
}

/**
 * Retrieves the last auto-save timestamp and metadata.
 */
export async function getLastAutoSaveMeta(): Promise<{ timestamp: number; timeString: string; tab: string } | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_KEYVALUE], 'readonly');
      const store = tx.objectStore(STORE_KEYVALUE);
      const req = store.get('last_auto_save_meta');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Clears stored sessions from IndexedDB.
 */
export async function clearIndexedDbSessions(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_SESSIONS, STORE_KEYVALUE], 'readwrite');
      tx.objectStore(STORE_SESSIONS).clear();
      tx.objectStore(STORE_KEYVALUE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB clear error:', err);
  }
}
