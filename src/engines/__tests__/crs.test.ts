import { describe, it, expect } from 'vitest';
// @ts-ignore - ported engine is plain JS by design (see src/engines/crs.js header)
import * as CRS from '../crs.js';
import { lonLatToUtm, utmToLonLat } from '../../lib/geodesy';

const W = CRS.ELLIPSOIDS.WGS84;

describe('CRS engine — structural invariants', () => {
  // These hold by the definition of UTM, so they need no external authority.
  it('places the central meridian at exactly 500,000 m easting', () => {
    for (const zone of [1, 17, 43, 45, 60]) {
      const cm = CRS.utmCentralMeridian(zone);
      const [E] = CRS.utmForward(cm, 0, zone, W);
      expect(E).toBeCloseTo(500000, 6);
    }
  });

  it('places the equator at 0 m northing in the northern hemisphere', () => {
    const [, N] = CRS.utmForward(CRS.utmCentralMeridian(45), 0, 45, W);
    expect(N).toBeCloseTo(0, 6);
  });

  it('derives the central meridian from the zone correctly', () => {
    expect(CRS.utmCentralMeridian(1)).toBe(-177);
    expect(CRS.utmCentralMeridian(31)).toBe(3);
    expect(CRS.utmCentralMeridian(45)).toBe(87);
    expect(CRS.utmCentralMeridian(60)).toBe(177);
  });

  it('derives the zone from longitude correctly', () => {
    expect(CRS.utmZoneFromLon(-180)).toBe(1);
    expect(CRS.utmZoneFromLon(-177)).toBe(1);
    expect(CRS.utmZoneFromLon(0)).toBe(31);
    expect(CRS.utmZoneFromLon(85)).toBe(45);
    expect(CRS.utmZoneFromLon(179.9)).toBe(60);
  });

  it('has a point scale factor of k0 on the central meridian', () => {
    const zone = 45;
    const [E, N] = CRS.utmForward(CRS.utmCentralMeridian(zone), 23.5, zone, W);
    expect(CRS.utmPointScaleFactor(E, N, zone, true, W)).toBeCloseTo(0.9996, 9);
  });

  it('has a point scale factor above 1 far from the central meridian', () => {
    const zone = 45;
    const [E, N] = CRS.utmForward(CRS.utmCentralMeridian(zone) + 2.9, 23.5, zone, W);
    expect(CRS.utmPointScaleFactor(E, N, zone, true, W)).toBeGreaterThan(1.0);
  });
});

describe('CRS engine — round-trip accuracy', () => {
  const cases: [number, number, number][] = [
    [85.0, 23.5, 45],    // Jharkhand
    [75.8, 26.9, 43],    // Rajasthan
    [77.2, 28.6, 43],    // Delhi
    [-0.1, 51.5, 30],    // London
    [-74.0, 40.7, 18],   // New York
    [151.2, -33.9, 56],  // Sydney (southern)
    [87.0, 0.001, 45]    // near the equator
  ];

  it.each(cases)('round-trips lon=%s lat=%s in zone %s to sub-millimetre', (lon, lat, zone) => {
    const north = lat >= 0;
    const [E, N] = CRS.utmForward(lon, lat, zone, W);
    const [lon2, lat2] = CRS.utmInverse(E, N, zone, north, W);

    // Assert the error in METRES, not degrees: a degree of longitude shrinks
    // with latitude, so a fixed degree tolerance is far stricter at the equator
    // than at 51N and would misreport an acceptable result as a failure.
    const mPerDegLat = 111132.0;
    const mPerDegLon = 111320.0 * Math.cos((lat * Math.PI) / 180);
    const errLonM = Math.abs(lon2 - lon) * mPerDegLon;
    const errLatM = Math.abs(lat2 - lat) * mPerDegLat;

    expect(errLonM).toBeLessThan(0.001);
    expect(errLatM).toBeLessThan(0.001);
  });

  it('round-trips Web Mercator', () => {
    const [x, y] = CRS.webMercatorForward(85.0, 23.5);
    const [lon, lat] = CRS.webMercatorInverse(x, y);
    expect(lon).toBeCloseTo(85.0, 9);
    expect(lat).toBeCloseTo(23.5, 9);
  });

  it('bounds Web Mercator at the expected world extent', () => {
    expect(CRS.WEBMERC_MAX).toBeCloseTo(20037508.34, 1);
  });
});

describe('CRS engine — cross-validation against the incumbent geodesy', () => {
  // The transplanted engine and the suite's existing lib/geodesy.ts are
  // independent implementations of the same projection. Agreement between them
  // is strong evidence the transplant introduced no arithmetic regression.
  const cases: [number, number, number, boolean][] = [
    [85.0, 23.5, 45, false],
    [75.8, 26.9, 43, false],
    [77.2, 28.6, 43, false],
    [-0.1, 51.5, 30, false],
    [151.2, -33.9, 56, true]
  ];

  it.each(cases)('agrees on forward projection for lon=%s lat=%s zone=%s', (lon, lat, zone, south) => {
    const [E1, N1] = CRS.utmForward(lon, lat, zone, W);
    const incumbent = lonLatToUtm(lon, lat, zone, south);
    // Both implementations apply the southern false northing themselves, so
    // the values are already in the same frame.
    expect(E1).toBeCloseTo(incumbent.E, 3);   // agree to the millimetre
    expect(N1).toBeCloseTo(incumbent.N, 3);
  });

  it.each(cases)('agrees on inverse projection for lon=%s lat=%s zone=%s', (lon, lat, zone, south) => {
    const incumbent = lonLatToUtm(lon, lat, zone, south);
    const back = utmToLonLat(incumbent.E, incumbent.N, zone, south);
    const [lon2, lat2] = CRS.utmInverse(incumbent.E, incumbent.N, zone, !south, W);
    expect(lon2).toBeCloseTo(back.lon, 8);
    expect(lat2).toBeCloseTo(back.lat, 8);
  });
});

describe('CRS engine — EPSG identification', () => {
  it('maps northern UTM codes', () => {
    expect(CRS.parseEpsg(32601)).toMatchObject({ kind: 'utm', zone: 1, north: true });
    expect(CRS.parseEpsg(32645)).toMatchObject({ kind: 'utm', zone: 45, north: true });
    expect(CRS.parseEpsg(32660)).toMatchObject({ kind: 'utm', zone: 60, north: true });
  });

  it('maps southern UTM codes', () => {
    expect(CRS.parseEpsg(32701)).toMatchObject({ kind: 'utm', zone: 1, north: false });
    expect(CRS.parseEpsg(32745)).toMatchObject({ kind: 'utm', zone: 45, north: false });
    expect(CRS.parseEpsg(32760)).toMatchObject({ kind: 'utm', zone: 60, north: false });
  });

  it('maps geographic and Web Mercator', () => {
    expect(CRS.parseEpsg(4326)).toMatchObject({ kind: 'geographic' });
    expect(CRS.parseEpsg(3857)).toMatchObject({ kind: 'webmercator' });
  });

  it('marks an unrecognised code as unknown rather than falling back', () => {
    expect(CRS.parseEpsg(99999)).toMatchObject({ kind: 'unknown' });
  });
});

describe('CRS engine — refuses to guess a UTM zone', () => {
  // This is the behaviour the whole engine exists for. A UTM easting/northing
  // pair is a valid location in all 60 zones, so the zone can only come from
  // evidence outside the coordinates.
  const utmSample: [number, number][] = [[295771, 2600293]];

  it('identifies the family but not the zone from coordinates alone', () => {
    const d = CRS.detectCrs(utmSample, {});
    expect(d.family).toBe('utm');
    expect(d.needsConfirmation).toBe(true);
    expect(d.confidence).toBe(0);
  });

  it('offers all 60 zones as candidates rather than picking one', () => {
    const d = CRS.detectCrs(utmSample, {});
    expect(d.candidates).toHaveLength(60);
  });

  it('states explicitly that the zone must be confirmed', () => {
    const d = CRS.detectCrs(utmSample, {});
    expect(d.reasons.join(' ')).toMatch(/cannot be derived from easting\/northing alone/i);
    expect(d.reasons.join(' ')).toMatch(/MUST be confirmed/i);
  });

  it('never silently returns zone 45', () => {
    const d = CRS.detectCrs(utmSample, {});
    expect(d.crs).toBeNull();
  });

  it('commits when an EPSG code is declared and agrees with the magnitudes', () => {
    const d = CRS.detectCrs(utmSample, { epsgCode: 32645 });
    expect(d.needsConfirmation).toBe(false);
    expect(d.crs.zone).toBe(45);
    expect(d.confidence).toBeGreaterThan(0.9);
  });

  it('rejects a declared code that contradicts the coordinate magnitudes', () => {
    // A portal declaring a projected code while serving lon/lat is a real
    // observed failure; the declaration must not override the evidence.
    const d = CRS.detectCrs([[85.0, 23.5]], { epsgCode: 32645 });
    expect(d.crs.kind).toBe('geographic');
    expect(d.reasons.join(' ')).toMatch(/CONFLICTS/i);
  });

  it('resolves the zone from regional evidence in page text', () => {
    const d = CRS.detectCrs(utmSample, { pageText: 'Jharkhand Bhunaksha Ranchi' });
    expect(d.needsConfirmation).toBe(false);
    expect(d.crs.zone).toBe(45);
  });

  it('needs no zone for geographic coordinates', () => {
    const d = CRS.detectCrs([[85.0, 23.5]], {});
    expect(d.family).toBe('geographic');
    expect(d.needsConfirmation).toBe(false);
  });
});

describe('CRS engine — ellipsoids for Indian legacy cadastral data', () => {
  it('carries the Everest 1830 (1937 Adjustment) parameters', () => {
    const e = CRS.ELLIPSOIDS.EVEREST_1830;
    expect(e.a).toBeCloseTo(6377276.345, 3);
    expect(e.invF).toBeCloseTo(300.8017, 4);
  });

  it('carries the Everest 1830 (1975 Definition) parameters', () => {
    expect(CRS.ELLIPSOIDS.EVEREST_1830_1975.a).toBeCloseTo(6377301.243, 3);
  });

  it('carries WGS 84 and GRS 80 with their distinct flattenings', () => {
    expect(CRS.ELLIPSOIDS.WGS84.a).toBe(6378137.0);
    expect(CRS.ELLIPSOIDS.WGS84.invF).toBeCloseTo(298.257223563, 9);
    expect(CRS.ELLIPSOIDS.GRS80.invF).toBeCloseTo(298.257222101, 9);
    expect(CRS.ELLIPSOIDS.WGS84.invF).not.toBe(CRS.ELLIPSOIDS.GRS80.invF);
  });

  it('derives consistent ellipsoid parameters', () => {
    const p = CRS.ellipsoidParams(CRS.ELLIPSOIDS.WGS84);
    expect(p.a).toBe(6378137.0);
    expect(p.e2).toBeCloseTo(0.00669437999014, 12);
    expect(p.b).toBeCloseTo(6356752.314245, 6);
  });
});

describe('CRS engine — geodesic distance', () => {
  it('measures one degree of latitude at the equator as about 110.57 km', () => {
    const d = CRS.geodesicDistance(0, 0, 0, 1, W);
    expect(d / 1000).toBeGreaterThan(110.5);
    expect(d / 1000).toBeLessThan(110.65);
  });

  it('returns zero for coincident points', () => {
    expect(CRS.geodesicDistance(85, 23.5, 85, 23.5, W)).toBeCloseTo(0, 6);
  });

  it('is symmetric', () => {
    const ab = CRS.geodesicDistance(85, 23.5, 77.2, 28.6, W);
    const ba = CRS.geodesicDistance(77.2, 28.6, 85, 23.5, W);
    expect(ab).toBeCloseTo(ba, 6);
  });
});
