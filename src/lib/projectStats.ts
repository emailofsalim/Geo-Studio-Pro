import { ProjectDataState, ProjectModuleStats } from '../types/project';

/**
 * Counts the records a project holds, for its card and dashboard.
 *
 * One derivation, because there were five: the save path, the recovery
 * restore, the package import, project creation and the live context each
 * counted the same arrays by hand. They had already drifted — creation omitted
 * `calculationsCount` entirely, so a project created with calculations showed
 * none until something else happened to recompute its stats.
 *
 * The counts are optional-safe throughout. A project data record may legitimately
 * arrive without the optional collections (`calculations` is optional on
 * `ProjectDataState`), and an older stored record may predate a field that was
 * added since, so a missing collection means zero rather than a crash.
 */
export function statsFor(data: Partial<ProjectDataState> | null | undefined): ProjectModuleStats {
  const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
  return {
    waypointsCount: count(data?.waypoints),
    layersCount: count(data?.layers),
    parcelsCount: count(data?.parcels),
    boreholesCount: count(data?.boreholes),
    photosCount: count(data?.photos),
    geofencesCount: count(data?.geofences),
    calculationsCount: count(data?.calculations)
  };
}
