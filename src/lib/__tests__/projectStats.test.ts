import { describe, it, expect, vi } from 'vitest';

// Creation writes through storage; the counts it records are what is under
// test, not IndexedDB, so the store is stubbed.
vi.mock('../../services/StorageService', () => ({
  storageService: {
    saveProjectMeta: vi.fn(async () => undefined),
    saveProjectData: vi.fn(async () => undefined),
    getProject: vi.fn(async () => null),
    getProjectData: vi.fn(async () => null),
    getAllProjects: vi.fn(async () => []),
    deleteProject: vi.fn(async () => undefined),
    exportBhnxPackage: vi.fn(),
    importBhnxPackage: vi.fn()
  },
  SEED_PROJECTS: []
}));

import { statsFor } from '../projectStats';
import { ProjectService } from '../../services/ProjectService';
import type { ProjectDataState } from '../../types/project';

// ---------------------------------------------------------------------------
// One derivation of a project's record counts
// ---------------------------------------------------------------------------
// Five places counted the same arrays by hand: the save path, the recovery
// restore, the package import, project creation and the live context. They had
// already drifted — creation omitted calculationsCount entirely — so a project
// created with calculations reported none of them until something else happened
// to recompute its stats.

const full = (): ProjectDataState => ({
  projectId: 'p',
  waypoints: [{}, {}, {}],
  layers: [{}],
  parcels: [{}, {}],
  boreholes: [{}, {}, {}, {}],
  photos: [{}],
  geofences: [{}, {}],
  calculations: [{}, {}, {}]
});

describe('statsFor', () => {
  it('counts every collection the stats type carries', () => {
    expect(statsFor(full())).toEqual({
      waypointsCount: 3,
      layersCount: 1,
      parcelsCount: 2,
      boreholesCount: 4,
      photosCount: 1,
      geofencesCount: 2,
      calculationsCount: 3
    });
  });

  it('reports zero rather than throwing for data that predates a field', () => {
    // An older stored record may simply not have a collection that was added
    // since, and the optional ones may legitimately be absent.
    const partial = { projectId: 'p', waypoints: [{}] } as ProjectDataState;
    expect(statsFor(partial)).toEqual({
      waypointsCount: 1,
      layersCount: 0,
      parcelsCount: 0,
      boreholesCount: 0,
      photosCount: 0,
      geofencesCount: 0,
      calculationsCount: 0
    });
  });

  it('treats null, undefined and a non-array as zero, not as a crash', () => {
    expect(statsFor(null)).toEqual(statsFor(undefined));
    expect(statsFor(null).waypointsCount).toBe(0);
    expect(statsFor({ waypoints: 'not an array' } as never).waypointsCount).toBe(0);
  });

  it('never reports a count as undefined, which would render as blank', () => {
    for (const v of Object.values(statsFor({ projectId: 'p' } as ProjectDataState))) {
      expect(typeof v).toBe('number');
    }
  });
});

describe('the drift this removes', () => {
  it('a project created with calculations reports them', async () => {
    // Creation used to stop at geofencesCount, so this came back undefined and
    // the project card showed no calculations until a save recomputed stats.
    const created = await ProjectService.createProject({
      name: 'Stats drift',
      category: 'Mining Survey',
      workingZone: '45N',
      initialData: full()
    } as never);

    // `stats` is optional on GeoProject, so assert it is there before reading it.
    expect(created.project.stats, 'a created project carries no stats at all').toBeDefined();
    expect(created.project.stats!.calculationsCount).toBe(3);
    expect(created.project.stats).toEqual(statsFor(full()));
  });
});
