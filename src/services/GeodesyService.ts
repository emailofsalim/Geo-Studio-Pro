// ============================================================================
// BhuNex Studio — Deterministic Geodesy & Coordinate Engine
// ============================================================================

import { CanonicalCRS } from '../types/canonical';

export interface GeodeticPoint {
  lat: number;
  lon: number;
  elevation?: number;
}

export interface ProjectedPoint {
  easting: number;
  northing: number;
  zone: string;
  elevation?: number;
  scaleFactor?: number;
  convergenceDeg?: number;
}

export class GeodesyService {
  // WGS 84 Reference Ellipsoid Constants
  static readonly WGS84_A = 6378137.0; // semi-major axis (m)
  static readonly WGS84_F = 1 / 298.257223563; // flattening
  static readonly WGS84_K0 = 0.9996; // UTM central meridian scale factor
  static readonly WGS84_E0 = 500000.0; // False Easting (m)

  /**
   * Transforms WGS84 Geographic (Lon/Lat) into UTM Easting/Northing
   */
  static lonLatToUTM(lon: number, lat: number, overrideZone?: number): ProjectedPoint {
    const a = this.WGS84_A;
    const f = this.WGS84_F;
    const k0 = this.WGS84_K0;
    const E0 = this.WGS84_E0;

    let zoneNum = overrideZone;
    if (!zoneNum) {
      zoneNum = Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
    }
    const isSouth = lat < 0;
    const zoneStr = `${zoneNum}${isSouth ? 'S' : 'N'}`;

    const lon0 = ((zoneNum * 6) - 183) * (Math.PI / 180);
    const e2 = f * (2 - f);
    const ep2 = e2 / (1 - e2);
    const la = lat * (Math.PI / 180);
    const lo = lon * (Math.PI / 180);

    const N = a / Math.sqrt(1 - e2 * Math.pow(Math.sin(la), 2));
    const T = Math.pow(Math.tan(la), 2);
    const C = ep2 * Math.pow(Math.cos(la), 2);
    const A = Math.cos(la) * (lo - lon0);

    const M = a * (
      (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256) * la
      - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(2 * la)
      + (15 * e2 * e2 / 256 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(4 * la)
      - (35 * Math.pow(e2, 3) / 3072) * Math.sin(6 * la)
    );

    const E = E0 + k0 * N * (
      A + (1 - T + C) * Math.pow(A, 3) / 6
      + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120
    );

    let Nn = k0 * (
      M + N * Math.tan(la) * (
        A * A / 2
        + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
        + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720
      )
    );

    if (isSouth) Nn += 10000000.0;

    // Grid Convergence (gamma)
    const convRad = Math.sin(la) * (lo - lon0);
    const convergenceDeg = convRad * (180 / Math.PI);

    // Point Scale Factor (k)
    const scaleFactor = k0 * (1 + (1 + C) * Math.pow(A, 2) / 2 + (5 - 4 * T + 42 * C + 13 * C * C - 28 * ep2) * Math.pow(A, 4) / 24);

    return {
      easting: E,
      northing: Nn,
      zone: zoneStr,
      scaleFactor,
      convergenceDeg
    };
  }

  /**
   * Transforms UTM Easting/Northing into WGS84 Geographic (Lon/Lat)
   */
  static utmToLonLat(easting: number, northing: number, zoneStr: string = '45N'): GeodeticPoint {
    const a = this.WGS84_A;
    const f = this.WGS84_F;
    const k0 = this.WGS84_K0;
    const E0 = this.WGS84_E0;

    const zoneNum = parseInt(zoneStr.replace(/\D/g, ''), 10) || 45;
    const isSouth = zoneStr.toUpperCase().includes('S');

    const lon0 = ((zoneNum * 6) - 183) * (Math.PI / 180);
    const e2 = f * (2 - f);
    const ep2 = e2 / (1 - e2);
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

    const Ny = isSouth ? (northing - 10000000.0) : northing;
    const M = Ny / k0;
    const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256));

    const phi1 = mu
      + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
      + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);

    const s = Math.sin(phi1);
    const c = Math.cos(phi1);
    const t = Math.tan(phi1);
    const C1 = ep2 * c * c;
    const T1 = t * t;
    const N1 = a / Math.sqrt(1 - e2 * s * s);
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5);
    const D = (easting - E0) / (N1 * k0);

    const latRad = phi1 - (N1 * t / R1) * (
      D * D / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720
    );

    const lonRad = lon0 + (
      D
      - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120
    ) / c;

    return {
      lat: (latRad * 180) / Math.PI,
      lon: (lonRad * 180) / Math.PI
    };
  }

  /**
   * Parses DMS string (e.g. `23° 45' 12.5" N` or `-85 12 33.4`) into Decimal Degrees
   */
  static parseDMS(val: string | number): number {
    if (typeof val === 'number') return val;
    const str = String(val || '').trim();
    if (!str) return NaN;
    if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);

    const isSouthOrWest = /[SWsw]/i.test(str) || str.startsWith('-');
    const nums = str.replace(/[NSEWnsew°'"]/g, ' ').match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length === 0) return NaN;

    const deg = Math.abs(parseFloat(nums[0]) || 0);
    const min = nums.length > 1 ? parseFloat(nums[1]) || 0 : 0;
    const sec = nums.length > 2 ? parseFloat(nums[2]) || 0 : 0;

    const decimal = deg + (min / 60) + (sec / 3600);
    return isSouthOrWest ? -decimal : decimal;
  }

  /**
   * Formats Decimal Degrees into canonical DMS string
   */
  static formatDMS(val: number, isLatitude: boolean): string {
    if (isNaN(val)) return '--';
    const hemi = val < 0 ? (isLatitude ? 'S' : 'W') : (isLatitude ? 'N' : 'E');
    const abs = Math.abs(val);
    const d = Math.floor(abs);
    const remM = (abs - d) * 60;
    const m = Math.floor(remM);
    const s = (remM - m) * 60;

    return `${d}° ${String(m).padStart(2, '0')}' ${s.toFixed(2)}" ${hemi}`;
  }

  /**
   * Calculates Combined Scale Factor (CSF = Grid Scale Factor * Elevation Factor)
   */
  static computeCombinedScaleFactor(pointScaleFactor: number, heightAboveEllipsoidM: number): number {
    const meanEarthRadius = 6371000.0; // Mean Earth Radius in meters
    const elevationFactor = meanEarthRadius / (meanEarthRadius + (heightAboveEllipsoidM || 0));
    return pointScaleFactor * elevationFactor;
  }

  /**
   * Returns default canonical CRS object for a given UTM zone
   */
  static getUTMCrs(zone: string = '45N'): CanonicalCRS {
    const isSouth = zone.toUpperCase().includes('S');
    const zoneNum = parseInt(zone.replace(/\D/g, ''), 10) || 45;
    const epsg = isSouth ? 32700 + zoneNum : 32600 + zoneNum;

    return {
      name: `WGS 84 / UTM Zone ${zone.toUpperCase()}`,
      epsg,
      datum: 'WGS 84',
      projection: 'Universal Transverse Mercator',
      zone: zone.toUpperCase(),
      linearUnit: 'm',
      verticalReference: 'MSL / Orthometric',
      coordinateEpoch: '2026.0'
    };
  }
}
