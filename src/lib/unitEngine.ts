// ============================================================================
// BhuNex Studio — Central Unit and Precision Management Engine
// ============================================================================

import { LinearUnit, AreaUnit, VolumeUnit, AngularUnit, PrecisionPolicy, CanonicalUnitsConfig } from '../types/canonical';

export const DEFAULT_PRECISION_POLICY: PrecisionPolicy = {
  calculationPrecision: 12, // Double precision floating point during calculations
  storedPrecision: 6,      // 6 decimals stored in DB
  displayPrecision: 3,     // 3 decimals in UI for coordinates & distances (mm level)
  exportPrecision: 4       // 4 decimals for official export formats
};

export const DEFAULT_CANONICAL_UNITS: CanonicalUnitsConfig = {
  linear: 'm',
  area: 'ha',
  volume: 'm3',
  angular: 'deg',
  precision: DEFAULT_PRECISION_POLICY,
  coordinatePrecision: 3,
  elevationPrecision: 3,
  areaPrecision: 4
};

export class UnitEngine {
  // ---------------- Linear Conversion Factors (to Meters) ----------------
  private static readonly LINEAR_TO_METERS: Record<LinearUnit, number> = {
    mm: 0.001,
    cm: 0.01,
    m: 1.0,
    km: 1000.0,
    inch: 0.0254,
    ft: 0.3048,
    'us-ft': 1200 / 3937 // 0.3048006096 m
  };

  // ---------------- Area Conversion Factors (to Square Meters) ----------------
  private static readonly AREA_TO_SQM: Record<AreaUnit, number> = {
    m2: 1.0,
    ha: 10000.0,
    acre: 4046.8564224,
    sqft: 0.09290304,
    ft2: 0.09290304,
    bigha: 2529.285264, // Standard 20-katha Bengal/Bihar bigha
    guntha: 101.1714106, // Maharashtra/Karnataka 1 guntha = 1089 sqft
    sqkm: 1000000.0
  };

  // ---------------- Volume Conversion Factors (to Cubic Meters) ----------------
  private static readonly VOLUME_TO_CBM: Record<VolumeUnit, number> = {
    m3: 1.0,
    cuyd: 0.764554857984,
    cuft: 0.028316846592,
    ft3: 0.028316846592
  };

  // ---------------- Linear Methods ----------------
  static toMeters(value: number, fromUnit: LinearUnit): number {
    if (isNaN(value)) return 0;
    const factor = this.LINEAR_TO_METERS[fromUnit] || 1.0;
    return value * factor;
  }

  static fromMeters(meters: number, toUnit: LinearUnit): number {
    if (isNaN(meters)) return 0;
    const factor = this.LINEAR_TO_METERS[toUnit] || 1.0;
    return meters / factor;
  }

  static convertLinear(value: number, fromUnit: LinearUnit, toUnit: LinearUnit): number {
    if (fromUnit === toUnit) return value;
    const inMeters = this.toMeters(value, fromUnit);
    return this.fromMeters(inMeters, toUnit);
  }

  // ---------------- Area Methods ----------------
  static toSquareMeters(value: number, fromUnit: AreaUnit): number {
    if (isNaN(value)) return 0;
    const factor = this.AREA_TO_SQM[fromUnit] || 1.0;
    return value * factor;
  }

  static fromSquareMeters(sqMeters: number, toUnit: AreaUnit): number {
    if (isNaN(sqMeters)) return 0;
    const factor = this.AREA_TO_SQM[toUnit] || 1.0;
    return sqMeters / factor;
  }

  static convertArea(value: number, fromUnit: AreaUnit, toUnit: AreaUnit): number {
    if (fromUnit === toUnit) return value;
    const inSqm = this.toSquareMeters(value, fromUnit);
    return this.fromSquareMeters(inSqm, toUnit);
  }

  // ---------------- Volume Methods ----------------
  static toCubicMeters(value: number, fromUnit: VolumeUnit): number {
    if (isNaN(value)) return 0;
    const factor = this.VOLUME_TO_CBM[fromUnit] || 1.0;
    return value * factor;
  }

  static fromCubicMeters(cuMeters: number, toUnit: VolumeUnit): number {
    if (isNaN(cuMeters)) return 0;
    const factor = this.VOLUME_TO_CBM[toUnit] || 1.0;
    return cuMeters / factor;
  }

  static convertVolume(value: number, fromUnit: VolumeUnit, toUnit: VolumeUnit): number {
    if (fromUnit === toUnit) return value;
    const inCbm = this.toCubicMeters(value, fromUnit);
    return this.fromCubicMeters(inCbm, toUnit);
  }

  // ---------------- Angular Methods ----------------
  static toRadians(value: number, fromUnit: AngularUnit): number {
    if (isNaN(value)) return 0;
    switch (fromUnit) {
      case 'deg':
      case 'dms':
        return (value * Math.PI) / 180;
      case 'gon':
        return (value * Math.PI) / 200;
      case 'rad':
        return value;
      default:
        return (value * Math.PI) / 180;
    }
  }

  static fromRadians(radians: number, toUnit: AngularUnit): number {
    if (isNaN(radians)) return 0;
    switch (toUnit) {
      case 'deg':
      case 'dms':
        return (radians * 180) / Math.PI;
      case 'gon':
        return (radians * 200) / Math.PI;
      case 'rad':
        return radians;
      default:
        return (radians * 180) / Math.PI;
    }
  }

  static convertAngle(value: number, fromUnit: AngularUnit, toUnit: AngularUnit): number {
    if (fromUnit === toUnit) return value;
    const rad = this.toRadians(value, fromUnit);
    return this.fromRadians(rad, toUnit);
  }

  // ---------------- Precision Formatting Helpers ----------------
  static formatDisplay(value: number, decimals: number = DEFAULT_PRECISION_POLICY.displayPrecision): string {
    if (isNaN(value) || value === null || value === undefined) return '--';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  static formatStorage(value: number, decimals: number = DEFAULT_PRECISION_POLICY.storedPrecision): number {
    if (isNaN(value)) return 0;
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  static formatExport(value: number, decimals: number = DEFAULT_PRECISION_POLICY.exportPrecision): string {
    if (isNaN(value)) return '0';
    return value.toFixed(decimals);
  }
}
