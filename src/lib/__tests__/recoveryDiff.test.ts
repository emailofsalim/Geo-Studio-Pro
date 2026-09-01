import { describe, it, expect } from 'vitest';
import { checkpointShortfall } from '../recoveryDiff';

const saved = { waypointsCount: 6, layersCount: 3, parcelsCount: 2, boreholesCount: 4 };

describe('checkpointShortfall', () => {
  it('reports nothing when the checkpoint matches what is saved', () => {
    expect(checkpointShortfall({ ...saved }, saved)).toEqual([]);
  });

  it('reports nothing when the checkpoint holds more', () => {
    // The normal case after a crash: the checkpoint is the newer, larger state.
    const bigger = { waypointsCount: 9, layersCount: 4, parcelsCount: 2, boreholesCount: 4 };
    expect(checkpointShortfall(bigger, saved)).toEqual([]);
  });

  it('names each kind that would be lost, with the amount', () => {
    const trimmed = { waypointsCount: 1, layersCount: 3, parcelsCount: 0, boreholesCount: 1 };
    expect(checkpointShortfall(trimmed, saved)).toEqual(['5 waypoints', '2 parcels', '3 boreholes']);
  });

  it('uses the singular for a loss of one', () => {
    // "1 layers" reads as a bug in the warning, which undermines the warning.
    const one = { waypointsCount: 5, layersCount: 2, parcelsCount: 1, boreholesCount: 3 };
    expect(checkpointShortfall(one, saved)).toEqual(['1 waypoint', '1 layer', '1 parcel', '1 borehole']);
  });

  it('reports the whole loss when the checkpoint is empty', () => {
    const empty = { waypointsCount: 0, layersCount: 0, parcelsCount: 0, boreholesCount: 0 };
    expect(checkpointShortfall(empty, saved)).toEqual([
      '6 waypoints',
      '3 layers',
      '2 parcels',
      '4 boreholes'
    ]);
  });

  it('stays silent when the saved counts are unknown', () => {
    // An unverifiable claim of loss is worse than silence: warning on every
    // restore would train the warning away before it ever mattered.
    expect(checkpointShortfall({ waypointsCount: 0 }, null)).toEqual([]);
    expect(checkpointShortfall({ waypointsCount: 0 }, undefined)).toEqual([]);
    expect(checkpointShortfall({ waypointsCount: 0 }, {})).toEqual([]);
  });

  it('skips a kind the checkpoint does not report rather than assuming zero', () => {
    // A checkpoint with no `parcels` key is not the same as one with none, and
    // treating the absence as zero would invent a loss that is not happening.
    expect(checkpointShortfall({ waypointsCount: 6, layersCount: 3, boreholesCount: 4 }, saved)).toEqual([]);
  });

  it('ignores counts that are not finite numbers', () => {
    expect(checkpointShortfall({ waypointsCount: NaN }, saved)).toEqual([]);
    expect(checkpointShortfall({ waypointsCount: Infinity }, saved)).toEqual([]);
    expect(
      checkpointShortfall({ waypointsCount: 0 }, { ...saved, waypointsCount: NaN })
    ).toEqual([]);
  });

  it('keeps the kinds in a stable order', () => {
    const empty = { waypointsCount: 0, layersCount: 0, parcelsCount: 0, boreholesCount: 0 };
    const first = checkpointShortfall(empty, saved);
    const second = checkpointShortfall(empty, saved);
    expect(first).toEqual(second);
    expect(first[0]).toMatch(/waypoint/);
  });

  it('handles a project that has nothing saved yet', () => {
    const nothing = { waypointsCount: 0, layersCount: 0, parcelsCount: 0, boreholesCount: 0 };
    expect(checkpointShortfall({ waypointsCount: 3 }, nothing)).toEqual([]);
  });
});
