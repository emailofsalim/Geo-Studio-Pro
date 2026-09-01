import { describe, it, expect } from 'vitest';
import {
  parseZone,
  isValidZone,
  crsIdentityFor,
  crsLabelFor,
  zoneParams,
  DEFAULT_ZONE,
  COMMON_ZONES,
  NORTHERN_ZONES,
  SOUTHERN_ZONES,
  ALL_ZONES
} from '../crsIdentity';

describe('CRS identity', () => {
  describe('EPSG authority matches the hemisphere', () => {
    // The bug this guards: EPSG codes were built as `326${zoneDigits}`, which
    // labelled every southern-hemisphere project with a northern EPSG code
    // while the geodesy used the southern false northing.
    it('uses 326xx for northern zones', () => {
      expect(crsIdentityFor('45N').epsg).toBe(32645);
      expect(crsIdentityFor('43N').epsg).toBe(32643);
      expect(crsIdentityFor('1N').epsg).toBe(32601);
      expect(crsIdentityFor('60N').epsg).toBe(32660);
    });

    it('uses 327xx for southern zones', () => {
      expect(crsIdentityFor('45S').epsg).toBe(32745);
      expect(crsIdentityFor('43S').epsg).toBe(32743);
      expect(crsIdentityFor('1S').epsg).toBe(32701);
      expect(crsIdentityFor('60S').epsg).toBe(32760);
    });

    it('never emits a northern code for a southern zone', () => {
      for (let z = 1; z <= 60; z++) {
        expect(crsIdentityFor(`${z}S`).epsg).toBeGreaterThanOrEqual(32701);
        expect(crsIdentityFor(`${z}N`).epsg).toBeLessThanOrEqual(32660);
      }
    });
  });

  describe('refuses to guess', () => {
    // A UTM easting/northing pair cannot identify its own zone, so an
    // unparseable zone must surface as an error rather than defaulting to 45.
    it.each(['', '  ', 'abc', '0N', '61N', '99', 'zone45', '45X', '-3N', '4.5N'])(
      'rejects %j rather than substituting a default',
      bad => {
        expect(parseZone(bad)).toBeNull();
        expect(isValidZone(bad)).toBe(false);
        expect(() => crsIdentityFor(bad)).toThrow(/not a valid UTM zone/i);
      }
    );

    it('rejects null and undefined', () => {
      expect(parseZone(null)).toBeNull();
      expect(parseZone(undefined)).toBeNull();
      expect(isValidZone(null)).toBe(false);
    });

    it('labels an unset zone explicitly instead of inventing one', () => {
      expect(crsLabelFor('')).toBe('Coordinate system not set');
      expect(crsLabelFor(null)).toBe('Coordinate system not set');
      expect(crsLabelFor('nonsense')).toBe('Coordinate system not set');
      // Critically, it must not silently produce Zone 45.
      expect(crsLabelFor('nonsense')).not.toMatch(/45/);
    });
  });

  describe('parsing', () => {
    it('defaults a bare zone number to the northern hemisphere', () => {
      expect(parseZone('45')).toEqual({ zoneNumber: 45, south: false });
    });

    it('accepts lower case and surrounding whitespace', () => {
      expect(parseZone(' 43s ')).toEqual({ zoneNumber: 43, south: true });
      expect(parseZone('43n')).toEqual({ zoneNumber: 43, south: false });
    });

    it('canonicalises the zone string', () => {
      expect(crsIdentityFor('43s').zone).toBe('43S');
      expect(crsIdentityFor(' 7 ').zone).toBe('7N');
    });

    it('produces the geodesy call parameters', () => {
      expect(zoneParams('45N')).toEqual({ zNum: 45, isSouth: false });
      expect(zoneParams('43S')).toEqual({ zNum: 43, isSouth: true });
    });
  });

  describe('labels', () => {
    it('states name, zone and EPSG together', () => {
      expect(crsIdentityFor('45N').label).toBe('WGS 84 / UTM Zone 45N (EPSG:32645)');
      expect(crsIdentityFor('43S').label).toBe('WGS 84 / UTM Zone 43S (EPSG:32743)');
    });

    it('always declares datum and units', () => {
      const id = crsIdentityFor('45N');
      expect(id.datum).toBe('WGS 84');
      expect(id.units).toBe('m');
    });
  });

  it('exposes a default zone that is itself valid', () => {
    expect(isValidZone(DEFAULT_ZONE)).toBe(true);
  });
});

describe('zone catalogue', () => {
  it('offers all 60 zones in each hemisphere', () => {
    expect(NORTHERN_ZONES).toHaveLength(60);
    expect(SOUTHERN_ZONES).toHaveLength(60);
    expect(ALL_ZONES).toHaveLength(120);
  });

  it('derives every EPSG code from crsIdentityFor rather than a hand-written list', () => {
    for (const z of ALL_ZONES) {
      expect(z.epsg).toBe(crsIdentityFor(z.zone).epsg);
    }
  });

  it('keeps northern and southern codes in their own authority ranges', () => {
    expect(NORTHERN_ZONES.every(z => z.epsg >= 32601 && z.epsg <= 32660)).toBe(true);
    expect(SOUTHERN_ZONES.every(z => z.epsg >= 32701 && z.epsg <= 32760)).toBe(true);
  });

  it('surfaces the South Asian zones as the common set', () => {
    const zones = COMMON_ZONES.map(z => z.zone);
    expect(zones).toContain('43N');
    expect(zones).toContain('45N');
    expect(zones).toContain('45S');
    // Each common zone must also exist in the full catalogue.
    for (const z of zones) expect(ALL_ZONES.some(a => a.zone === z)).toBe(true);
  });

  it('makes zones outside South Asia reachable', () => {
    // The picker previously offered only eight India-region zones, so a survey
    // anywhere else could not select its own CRS through the UI.
    for (const z of ['30N', '18N', '56S', '1N', '60S']) {
      expect(ALL_ZONES.some(a => a.zone === z)).toBe(true);
    }
  });

  it('labels each zone with its longitude band', () => {
    expect(NORTHERN_ZONES[0].label).toContain('180°W');
    expect(NORTHERN_ZONES[30].label).toContain('0°');
  });
});
