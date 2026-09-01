// ============================================================================
// BhuNex Studio — recovery checkpoint comparison
// ----------------------------------------------------------------------------
// Restoring a crash checkpoint replaces the project's saved data outright.
// That is the right behaviour after a crash, where the checkpoint is the newer
// state — but it is an overwrite with no undo, so a checkpoint holding fewer
// records than the project has on disk silently drops the difference.
//
// This works out what a restore would cost, so the dialog can say it before
// the button is pressed rather than after the data is gone.
// ============================================================================

export interface RecordCounts {
  waypointsCount?: number;
  layersCount?: number;
  parcelsCount?: number;
  boreholesCount?: number;
}

/** Singular and plural forms, because "1 layers" reads as a bug. */
const KINDS: { key: keyof RecordCounts; one: string; many: string }[] = [
  { key: 'waypointsCount', one: 'waypoint', many: 'waypoints' },
  { key: 'layersCount', one: 'layer', many: 'layers' },
  { key: 'parcelsCount', one: 'parcel', many: 'parcels' },
  { key: 'boreholesCount', one: 'borehole', many: 'boreholes' }
];

/**
 * Describes what restoring `inCheckpoint` over `saved` would lose.
 *
 * Returns an empty list when nothing would be lost — including when the saved
 * counts are unknown, because an unverifiable claim of loss is worse than
 * silence: it would cry wolf on every restore and train the warning away.
 */
export function checkpointShortfall(
  inCheckpoint: RecordCounts,
  saved: RecordCounts | null | undefined
): string[] {
  if (!saved) return [];

  const out: string[] = [];
  for (const { key, one, many } of KINDS) {
    const onDisk = saved[key];
    const held = inCheckpoint[key];
    if (typeof onDisk !== 'number' || typeof held !== 'number') continue;
    if (!Number.isFinite(onDisk) || !Number.isFinite(held)) continue;
    const lost = onDisk - held;
    if (lost > 0) out.push(`${lost} ${lost === 1 ? one : many}`);
  }
  return out;
}
