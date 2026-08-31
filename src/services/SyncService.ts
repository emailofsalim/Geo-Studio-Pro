// ============================================================================
// BhuNex Studio — Optional Cloud & Multi-Device Sync Interface
// ============================================================================

import { CanonicalProject, BhnxProjectPackage } from '../types/canonical';

export type SyncStatus = 'IDLE' | 'SYNCING' | 'UP_TO_DATE' | 'CONFLICT' | 'OFFLINE' | 'ERROR';

export interface SyncEntityChange {
  entityType: 'project' | 'waypoint' | 'layer' | 'parcel' | 'borehole' | 'photo';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  version: number;
  timestamp: number;
  data: any;
}

export interface SyncConflict {
  entityId: string;
  entityType: string;
  localVersion: number;
  remoteVersion: number;
  localData: any;
  remoteData: any;
  resolvedData?: any;
}

/**
 * Standard Sync Service Interface for Future Cloud Adapters (Firestore, CouchDB, Supabase, etc.)
 */
export interface ISyncService {
  getStatus(): SyncStatus;
  isOnline(): boolean;
  pushProjectChanges(projectId: string, changes: SyncEntityChange[]): Promise<{ success: boolean; syncedVersion: number }>;
  pullProjectChanges(projectId: string, sinceVersion: number): Promise<{ changes: SyncEntityChange[]; latestVersion: number }>;
  resolveConflict(conflict: SyncConflict, resolution: 'USE_LOCAL' | 'USE_REMOTE' | 'CUSTOM'): Promise<void>;
  exportSyncPackage(projectId: string): Promise<BhnxProjectPackage>;
}

/**
 * Default Local-First (Offline Authoritative) Sync Provider
 */
export class LocalOfflineSyncService implements ISyncService {
  getStatus(): SyncStatus {
    return 'IDLE';
  }

  isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  async pushProjectChanges(projectId: string, changes: SyncEntityChange[]): Promise<{ success: boolean; syncedVersion: number }> {
    return { success: true, syncedVersion: 1 };
  }

  async pullProjectChanges(projectId: string, sinceVersion: number): Promise<{ changes: SyncEntityChange[]; latestVersion: number }> {
    return { changes: [], latestVersion: 1 };
  }

  async resolveConflict(conflict: SyncConflict, resolution: 'USE_LOCAL' | 'USE_REMOTE' | 'CUSTOM'): Promise<void> {
    // Local is default authoritative in offline mode
  }

  async exportSyncPackage(projectId: string): Promise<BhnxProjectPackage> {
    throw new Error('Not implemented in base offline stub');
  }
}

export const syncService: ISyncService = new LocalOfflineSyncService();
