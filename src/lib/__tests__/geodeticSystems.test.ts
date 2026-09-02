import { describe, it, expect } from 'vitest';
import {
  zoneFromLonLat, latBand, mgrsFromLonLat,
  geodeticToEcef, ecefToGeodetic, bursaWolf, datumTransform,
  getIndianZone, indianGridFwd, indianGridInv,
  encodePlusCode,
  ELLIPSOIDS
} from '../geodesy';

// ---------------------------------------------------------------------------
// The coordinate systems, against definitions rather than against themselves
// ---------------------------------------------------------------------------
// The remaining "Working" claims: MGRS, Plus Codes, Indian Grid, and the
// Bursa-Wolf datum transforms. Each is checked either against a value fixed by
// definition — the semi-major axis at the equator, zone 31 starting at the
// prime meridian — or by a round trip, which cannot be satisfied by a
// consistently wrong implementation the way a self-recorded expectation can.

describe('UTM zone and MGRS latitude band', () => {
  it('puts the prime meridian at the start of zone 31', () => {
    // Zones are 6° wide from 180°W; 0° to 6°E is zone 31, by definition.
    expect(zoneFromLonLat(0, 0).zone).toBe(31);
    expect(zoneFromLonLat(5.999, 0).zone).toBe(31);
    expect(zoneFromLonLat(6, 0).zone).toBe(32);
    expect(zoneFromLonLat(-180, 0).zone).toBe(1);
    expect(zoneFromLonLat(179.999, 0).zone).toBe(60);
  });

  it('reads the hemisphere from the latitude, not the longitude', () => {
    expect(zoneFromLonLat(84.6, 23.5).south).toBe(false);
    expect(zoneFromLonLat(84.6, -23.5).south).toBe(true);
  });

  it('uses the standard 8-degree bands, C at the south limit and N at the equator', () => {
    // The MGRS band letters run C to X in 8° steps from 80°S, skipping I and O.
    expect(latBand(-80)).toBe('C');
    expect(latBand(0)).toBe('N');
    expect(latBand(-0.001)).toBe('M');   // the band below the equator
    for (const lat of [-79, -40, -1, 1, 40, 79]) {
      expect('IO', `band letter for ${lat} must skip I and O`).not.toContain(latBand(lat));
    }
  });

  it('marks latitudes outside the MGRS system as Z', () => {
    expect(latBand(85)).toBe('Z');
    expect(latBand(-81)).toBe('Z');
  });

  it('builds an MGRS reference carrying its zone and band', () => {
    const ref = mgrsFromLonLat(84.6012, 23.5410);
    expect(ref.startsWith('45')).toBe(true);          // 84.6°E is zone 45
    expect(ref).toMatch(/^45[C-X]\s?[A-Z]{2}/);
  });
});

describe('geodetic and ECEF', () => {
  const wgs = ELLIPSOIDS.wgs84;

  it('places the equator on the prime meridian at exactly the semi-major axis', () => {
    const p = geodeticToEcef(0, 0, 0, wgs);
    expect(p.x).toBeCloseTo(wgs.a, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it('places the north pole at exactly the semi-minor axis', () => {
    // b = a(1 - f), the defining relationship of the ellipsoid.
    const b = wgs.a * (1 - 1 / wgs.invf);
    const p = geodeticToEcef(90, 0, 0, wgs);
    expect(p.z).toBeCloseTo(b, 6);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(0, 6);
  });

  it('round-trips a real survey position to the millimetre', () => {
    const [lat, lon, h] = [23.5410987, 84.6012345, 412.5];
    const p = geodeticToEcef(lat, lon, h, wgs);
    const back = ecefToGeodetic(p.x, p.y, p.z, wgs);
    expect(back.lat).toBeCloseTo(lat, 9);
    expect(back.lon).toBeCloseTo(lon, 9);
    expect(back.h).toBeCloseTo(h, 3);
  });
});

describe('Bursa-Wolf datum transform', () => {
  const identity = { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, s: 0 };

  it('leaves coordinates untouched when every parameter is zero', () => {
    const out = bursaWolf(4000000, 3000000, 2500000, identity, 1);
    expect(out.x).toBeCloseTo(4000000, 9);
    expect(out.y).toBeCloseTo(3000000, 9);
    expect(out.z).toBeCloseTo(2500000, 9);
  });

  it('applies a pure translation exactly', () => {
    const shift = { ...identity, dx: 295, dy: 736, dz: 257 };
    const out = bursaWolf(4000000, 3000000, 2500000, shift, 1);
    expect(out.x - 4000000).toBeCloseTo(295, 6);
    expect(out.y - 3000000).toBeCloseTo(736, 6);
    expect(out.z - 2500000).toBeCloseTo(257, 6);
  });

  it('inverts to within a centimetre, which is the limit of the method', () => {
    // The India-to-WGS84 shape: large translations, small rotations and scale.
    const p = { dx: 295, dy: 736, dz: 257, rx: 0.5, ry: -1.2, rz: 0.8, s: 2.5 };
    const fwd = bursaWolf(4000000, 3000000, 2500000, p, 1);
    const back = bursaWolf(fwd.x, fwd.y, fwd.z, p, -1);

    // Negating the seven parameters is the standard *approximate* inverse, not
    // an exact one: the reverse pass does not rotate and rescale the
    // translation it is undoing. The residual is therefore about
    // (scale + rotation) x |translation| -- here roughly 7 mm at most for an
    // 833 m shift with a 1.2" rotation and 2.5 ppm scale, and about 4 mm in
    // practice once the per-axis components partly cancel.
    //
    // A centimetre is asserted because that is the honest bound of the method
    // at these magnitudes. It is far below the hundreds of metres a datum
    // transform moves a position, but it is not zero, and a reader comparing
    // a round trip against survey tolerances should know which it is.
    const worst = Math.max(
      Math.abs(back.x - 4000000),
      Math.abs(back.y - 3000000),
      Math.abs(back.z - 2500000)
    );
    expect(worst, 'the approximate inverse drifted further than the method allows').toBeLessThan(0.01);
    expect(worst, 'an exact inverse would mean the method changed').toBeGreaterThan(0);
  });

  it('is a no-op between identical ellipsoids, whatever the parameters say', () => {
    const p = { dx: 295, dy: 736, dz: 257, rx: 0, ry: 0, rz: 0, s: 0 };
    const out = datumTransform(23.5, 84.6, 400, ELLIPSOIDS.wgs84, ELLIPSOIDS.wgs84, p);
    expect(out.lat).toBe(23.5);
    expect(out.lon).toBe(84.6);
  });

  it('actually moves a position between different datums', () => {
    // Everest to WGS 84 is hundreds of metres in India; a transform that
    // returned the input unchanged would be silently doing nothing.
    const p = { dx: 295, dy: 736, dz: 257, rx: 0, ry: 0, rz: 0, s: 0 };
    const out = datumTransform(23.5, 84.6, 400, ELLIPSOIDS.everestIndia, ELLIPSOIDS.wgs84, p);
    const movedDeg = Math.hypot(out.lat - 23.5, out.lon - 84.6);
    expect(movedDeg, 'the datum transform changed nothing').toBeGreaterThan(1e-5);
    expect(movedDeg, 'the datum transform moved absurdly far').toBeLessThan(0.05);
  });
});

describe('Indian Grid (Lambert conformal conic)', () => {
  it('knows the published zones by their EPSG codes', () => {
    const zoneI = getIndianZone(24378);
    expect(zoneI).toBeDefined();
    expect(zoneI!.lat0).toBe(32.5);
    expect(zoneI!.lon0).toBe(68);
    expect(getIndianZone(99999)).toBeUndefined();
  });

  it('round-trips a position through the projection and back', () => {
    const z = getIndianZone(24381)!; // zone IIIa, central meridian 80°E
    const [lon, lat] = [80.5, 19.4];
    const grid = indianGridFwd(lon, lat, z);
    const back = indianGridInv(grid.E, grid.N, z);
    expect(back.lat).toBeCloseTo(lat, 7);
    expect(back.lon).toBeCloseTo(lon, 7);
  });

  it('puts the central meridian at the false easting', () => {
    // On the central meridian the projection has no easting offset beyond fe.
    const z = getIndianZone(24381)!;
    const onCM = indianGridFwd(z.lon0, z.lat0, z);
    expect(onCM.E).toBeCloseTo(z.fe, 3);
  });

  it('increases easting to the east and northing to the north', () => {
    const z = getIndianZone(24381)!;
    const base = indianGridFwd(80, 19, z);
    expect(indianGridFwd(80.5, 19, z).E).toBeGreaterThan(base.E);
    expect(indianGridFwd(80, 19.5, z).N).toBeGreaterThan(base.N);
  });
});

describe('Plus Codes', () => {
  it('produces a full code of the documented shape', () => {
    const code = encodePlusCode(23.5410987, 84.6012345);
    // A full Open Location Code is 8 characters, a '+', then the rest.
    expect(code[8]).toBe('+');
    expect(code.length).toBeGreaterThanOrEqual(11);
    expect(code).toMatch(/^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]+$/);
  });

  it('gives neighbouring points a shared prefix and distant points none', () => {
    const here = encodePlusCode(23.5410987, 84.6012345);
    const nearby = encodePlusCode(23.5411987, 84.6013345);   // ~15 m away
    const faraway = encodePlusCode(-33.8688, 151.2093);      // Sydney
    expect(nearby.slice(0, 6)).toBe(here.slice(0, 6));
    expect(faraway.slice(0, 4)).not.toBe(here.slice(0, 4));
  });

  it('refines rather than changes when asked for more characters', () => {
    const short = encodePlusCode(23.5410987, 84.6012345, 8);
    const long = encodePlusCode(23.5410987, 84.6012345, 10);
    expect(long.replace('+', '').startsWith(short.replace('+', ''))).toBe(true);
  });
});
