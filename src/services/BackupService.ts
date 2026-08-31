// ============================================================================
// BhuNex Studio — Backup & Workspace Disaster Recovery Service
// ============================================================================

import { storageService, RecoveryCheckpoint } from './StorageService';
import { BhnxProjectPackage } from '../types/canonical';
import { GeoProject, ProjectDataState } from '../types/project';

export class BackupService {
  /**
   * Generates a complete JSON backup archive of all projects & preferences
   */
  static async createFullSystemBackup(): Promise<{
    timestamp: number;
    projectCount: number;
    blob: Blob;
    filename: string;
  }> {
    const projects = await storageService.getAllProjects();
    const projectPayloads: Record<string, { meta: GeoProject; data: ProjectDataState | null }> = {};

    for (const p of projects) {
      const data = await storageService.getProjectData(p.id);
      projectPayloads[p.id] = { meta: p, data };
    }

    const backupPayload = {
      format: 'BhuNex_System_Backup_v3',
      timestamp: Date.now(),
      appVersion: '3.7.0',
      totalProjects: projects.length,
      projects: projectPayloads
    };

    const jsonStr = JSON.stringify(backupPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const filename = `BhuNexStudio_System_Backup_${new Date().toISOString().slice(0, 10)}.json`;

    return {
      timestamp: Date.now(),
      projectCount: projects.length,
      blob,
      filename
    };
  }

  /**
   * Restores system backup from JSON file
   */
  static async restoreFullSystemBackup(jsonString: string): Promise<{ restoredCount: number }> {
    const parsed = JSON.parse(jsonString);
    if (!parsed.projects || typeof parsed.projects !== 'object') {
      throw new Error('Invalid backup archive structure.');
    }

    let count = 0;
    for (const [id, item] of Object.entries(parsed.projects as Record<string, any>)) {
      if (item.meta) {
        await storageService.saveProjectMeta(item.meta);
        if (item.data) {
          await storageService.saveProjectData(id, item.data);
        }
        count++;
      }
    }

    return { restoredCount: count };
  }
}

export class RecoveryService {
  /**
   * Captures automatic state checkpoint during active surveying or editing
   */
  static async captureCheckpoint(projectId: string, projectName: string, activeTab: string, data: ProjectDataState): Promise<void> {
    const timestamp = Date.now();
    const checkpoint: RecoveryCheckpoint = {
      id: `checkpoint_${projectId}`,
      projectId,
      projectName,
      timestamp,
      timeString: new Date(timestamp).toLocaleTimeString(),
      data,
      activeTab
    };
    await storageService.saveRecoveryCheckpoint(checkpoint);
  }

  /**
   * Retrieves pending recovery checkpoint if an unexpected browser termination occurred
   */
  static async checkPendingRecovery(projectId: string): Promise<RecoveryCheckpoint | null> {
    return storageService.getLatestRecoveryCheckpoint(projectId);
  }

  /**
   * Clears checkpoint upon clean exit or manual dismissal
   */
  static async discardCheckpoint(projectId: string): Promise<void> {
    await storageService.clearRecoveryCheckpoint(projectId);
  }
}
