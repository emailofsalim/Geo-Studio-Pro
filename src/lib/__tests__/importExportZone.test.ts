import { describe, it, expect, vi } from 'vitest';
import { parseUtmZoneStr, executeUniversalExport } from '../universalDataBridge';
import type { GeoFeature } from '../../types';

// ---------------------------------------------------------------------------
// The zone the live paths actually use
// ---------------------------------------------------------------------------
// parseUtmZoneStr is the parse behind detectAndParseGeospatialFile and
// executeUniversalExport -- the import and export the application really runs.
// It returned Zone 45 for anything it could not read, so an unreadable zone
// silently placed the whole dataset hundreds of kilometres from where it was
// surveyed, in a file carrying no sign that anything had been assumed.

vi.mock('../zip', async orig => {
  const actual = await orig<typeof import('../zip')>();
  return { ...actual, downloadBlob: () => undefined };
});

describe('parseUtmZoneStr', () => {
  it.each(['45', '45N', '45 N', '45n'])('still reads %o as Zone 45 north', z => {
    expect(parseUtmZoneStr(z)).toEqual({ zone: 45, south: false });
  });

  it('still reads a southern zone', () => {
    expect(parseUtmZoneStr('43S')).toEqual({ zone: 43, south: true });
  });

  it.each(['', '  ', 'nonsense', '99N', '0N', '61N', 'Zone 45', '45X', 'N45'])(
    'refuses %o rather than returning Zone 45',
    bad => {
      expect(() => parseUtmZoneStr(bad), `"${bad}" was accepted`).toThrow(/not a valid UTM zone/i);
    }
  );

  it('refuses rather than clamping an out-of-range zone into 45', () => {
    // The old code mapped 0, 61 and 99 onto Zone 45, which reads as a
    // deliberate choice of zone rather than a rejected input.
    for (const z of ['0N', '61N', '99N']) {
      expect(() => parseUtmZoneStr(z)).toThrow();
    }
  });
});

describe('the live export refuses an unreadable zone', () => {
  const feats = (): GeoFeature[] =>
    ([{ kind: 'en', name: 'P1', geom: 'point', pts: [{ a: 254800, b: 2605200 }], props: {} }] as unknown as GeoFeature[]);

  it('does not fall back to Zone 45', async () => {
    await expect(
      executeUniversalExport({
        format: 'csv', fileName: 't', features: feats(), workingZoneStr: 'nonsense'
      } as never)
    ).rejects.toThrow(/not a valid UTM zone/i);
  });

  it('exports normally for a zone it can read', async () => {
    const r = await executeUniversalExport({
      format: 'csv', fileName: 't', features: feats(), workingZoneStr: '43S'
    } as never);
    expect(r.success).toBe(true);
  });
});
