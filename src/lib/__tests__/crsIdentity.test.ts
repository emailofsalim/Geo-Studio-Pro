import { describe, it, expect } from 'vitest';
import { parseZone, isValidZone, crsIdentityFor, crsLabelFor, zoneParams, DEFAULT_ZONE } from '../crsIdentity';

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
