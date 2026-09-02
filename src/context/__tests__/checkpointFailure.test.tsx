// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// ---------------------------------------------------------------------------
// A crash safety net that has failed must say so — once
// ---------------------------------------------------------------------------
// The recovery checkpoint is written on every edit, and its failures used to be
// swallowed by `.catch(() => {})`. Committed work was never at risk — the save
// path reports its own failures — but a user whose checkpoints were failing was
// unprotected against a tab crash with no way to know.
//
// Reporting it on every edit would be worse than silence: the write happens
// continuously, so a repeating message is trained away before it matters. Both
// halves are pinned here — that it is reported, and that it is reported once.

const showError = vi.fn();
const saveRecoveryCheckpoint = vi.fn();

const PROJECT = {
  id: 'proj_test',
  userId: 'local',
  name: 'Checkpoint test',
  workingZone: '45N',
  updatedAt: Date.now(),
  stats: {}
};
const DATA = {
  projectId: PROJECT.id,
  waypoints: [], layers: [], parcels: [], boreholes: [], photos: [], geofences: []
};

vi.mock('../ToastContext', () => ({
  useToast: () => ({ showError, showSuccess: vi.fn(), showInfo: vi.fn(), showWarning: vi.fn() })
}));
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'local' }, isAuthenticated: true })
}));
vi.mock('../../components/home/RecoveryModal', () => ({ RecoveryModal: () => null }));
vi.mock('../../components/home/RestoreProjectModal', () => ({ RestoreProjectModal: () => null }));
vi.mock('../../lib/zip', () => ({ downloadBlob: vi.fn(), makeZip: vi.fn(), readZip: vi.fn() }));
vi.mock('../../services/ProjectService', () => ({
  ProjectService: {
    getAllProjects: vi.fn(async () => [PROJECT]),
    openProject: vi.fn(async () => ({ project: PROJECT, data: DATA })),
    saveProjectData: vi.fn(async () => undefined),
    getProjectData: vi.fn(async () => DATA),
    releaseSensorsAndHardware: vi.fn(),
    createProject: vi.fn(), deleteProject: vi.fn(), duplicateProject: vi.fn(),
    renameProject: vi.fn(), updateProjectMeta: vi.fn(), runIsolationTest: vi.fn()
  }
}));
vi.mock('../../services/StorageService', () => ({
  storageService: {
    saveRecoveryCheckpoint: (...a: unknown[]) => saveRecoveryCheckpoint(...a),
    clearRecoveryCheckpoint: vi.fn(async () => undefined),
    getLatestRecoveryCheckpoint: vi.fn(async () => null),
    migrateLegacyGlobalLocalStorage: vi.fn(async () => undefined),
    exportBhnxPackageArchive: vi.fn(), parseBhnxPackageArchive: vi.fn(),
    restoreBhnxPackageTx: vi.fn(), restoreRecoveryCheckpointTx: vi.fn()
  },
  SEED_PROJECTS: []
}));

import { ProjectProvider, useProject } from '../ProjectContext';

let container: HTMLDivElement;
let root: Root;
let edit: (() => void) | null = null;
let sawProject = false;

const Harness: React.FC = () => {
  const { updateActiveProjectData, activeProjectId } = useProject();
  React.useEffect(() => {
    if (activeProjectId) sawProject = true;
    edit = () => updateActiveProjectData(prev => ({ ...prev, waypoints: [...(prev.waypoints || []), { id: 'w' }] }));
  }, [updateActiveProjectData, activeProjectId]);
  return null;
};

const mount = async () => {
  await act(async () => {
    root.render(<ProjectProvider><Harness /></ProjectProvider>);
  });
  // Let the provider's async init settle so a project becomes active.
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  showError.mockClear();
  saveRecoveryCheckpoint.mockClear();
  edit = null;
  sawProject = false;
  localStorage.setItem('bhnx_active_project_pref', PROJECT.id);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const warnings = () =>
  showError.mock.calls.map(c => String(c[0])).filter(m => /crash recovery/i.test(m));

describe('a failing recovery checkpoint', () => {
  it('is reported once, however many edits follow', async () => {
    saveRecoveryCheckpoint.mockRejectedValue(new Error('QuotaExceededError'));
    await mount();

    // The test is only meaningful with a project open and writes attempted.
    expect(sawProject, 'no project became active, so nothing was exercised').toBe(true);
    expect(edit, 'the provider never exposed a write').not.toBeNull();

    for (let i = 0; i < 5; i++) {
      await act(async () => { edit!(); await Promise.resolve(); });
    }

    expect(saveRecoveryCheckpoint.mock.calls.length, 'no checkpoint was attempted').toBeGreaterThan(1);
    expect(warnings().length, 'the failure was never reported').toBe(1);
    expect(warnings()[0]).toMatch(/saved work is unaffected/i);
    expect(warnings()[0]).toMatch(/QuotaExceededError/);
  });

  it('says nothing at all while checkpoints are succeeding', async () => {
    saveRecoveryCheckpoint.mockResolvedValue(undefined);
    await mount();
    expect(sawProject).toBe(true);

    for (let i = 0; i < 3; i++) {
      await act(async () => { edit!(); await Promise.resolve(); });
    }
    expect(saveRecoveryCheckpoint.mock.calls.length).toBeGreaterThan(0);
    expect(warnings()).toEqual([]);
  });

  it('reports again after protection comes back and fails a second time', async () => {
    // Otherwise one transient failure silences the warning for the session.
    saveRecoveryCheckpoint.mockRejectedValueOnce(new Error('QuotaExceededError'));
    saveRecoveryCheckpoint.mockResolvedValueOnce(undefined);
    saveRecoveryCheckpoint.mockRejectedValueOnce(new Error('QuotaExceededError again'));
    await mount();
    expect(sawProject).toBe(true);

    for (let i = 0; i < 3; i++) {
      await act(async () => { edit!(); await Promise.resolve(); await Promise.resolve(); });
    }
    expect(warnings().length, 'the second outage was swallowed').toBe(2);
  });
});
