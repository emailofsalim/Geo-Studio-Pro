import { describe, it, expect } from 'vitest';
import { ExportService } from '../ExportService';
import type { GeoFeature } from '../../types';

// ---------------------------------------------------------------------------
// The export zone is never assumed
// ---------------------------------------------------------------------------
// These paths used to read the zone with `parseInt(zone.replace(/\D/g,''), 10)
// || 45`, so anything unparseable silently became Zone 45. A project in Zone 43
// previewed and round-trip-verified against Zone 45 puts its coordinates
// hundreds of kilometres from where they belong, and the preview is the last
// thing a user checks before exporting.
//
// The same substitution was already identified and removed from the CRS layer;
// it had simply survived here. crsIdentity refuses an unreadable zone, so these
// now surface the refusal instead of a plausible-looking wrong answer.

const pts = (): GeoFeature[] => ([
  { kind: 'll', name: 'P1', geom: 'point', pts: [{ a: 84.6, b: 23.5 }], props: {} }
] as unknown as GeoFeature[]);

/**
 * Eastings and northings, so the zone actually decides where the point lands.
 * A lon/lat feature passes straight through and would look identical whatever
 * zone was named, which makes it useless for telling zones apart.
 */
const utmPts = (): GeoFeature[] => ([
  { kind: 'en', name: 'P1', geom: 'point', pts: [{ a: 254800, b: 2605200 }], props: {} }
] as unknown as GeoFeature[]);

describe('export preview does not substitute a zone', () => {
  it.each(['', 'nonsense', '99N', '0N', 'Zone', '45X'])(
    'refuses %o rather than quietly using Zone 45',
    bad => {
      const out = ExportService.generatePreviewSnippet(pts(), 'geojson', { workingZone: bad });
      expect(out, `"${bad}" produced a preview instead of a refusal`).toMatch(/notice|not a valid/i);
      expect(out).not.toMatch(/^\{[\s\S]*"type"/);
    }
  );

  it('previews normally for a zone it can read', () => {
    const out = ExportService.generatePreviewSnippet(pts(), 'geojson', { workingZone: '43N' });
    expect(out).toContain('"type"');
    expect(out).not.toMatch(/notice/i);
  });

  it('distinguishes zones rather than collapsing them onto one', () => {
    // The substitution made every unreadable zone identical. Two real zones
    // must still produce different ground coordinates.
    const a = ExportService.generatePreviewSnippet(utmPts(), 'wkt', { workingZone: '43N' });
    const b = ExportService.generatePreviewSnippet(utmPts(), 'wkt', { workingZone: '45N' });
    expect(a).not.toBe(b);
  });
});

describe('round-trip verification does not substitute a zone', () => {
  it('reports the refusal rather than verifying against Zone 45', async () => {
    const res = await ExportService.verifyRoundTrip(pts(), 'geojson', 'bogus');
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not a valid|notice/i);
  });
});

// The two tests that stood here covered ExportService.validate, which was
// deleted as unreachable. The guarantee they made -- that an unreadable zone is
// surfaced rather than silently replaced with Zone 45 -- is still asserted
// above against generatePreviewSnippet and verifyRoundTrip, which are the two
// methods anything actually calls.
