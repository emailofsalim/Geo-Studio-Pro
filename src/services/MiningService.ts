// ============================================================================
// BhuNex Studio — Mining & Statutory Safety Engine
// ============================================================================

import { CanonicalGeofence, Coordinate3D } from '../types/canonical';
import { GeometryService } from './GeometryService';

export interface MiningLeaseMetrics {
  leaseAreaHa: number;
  safetyZoneAreaHa: number;
  effectiveWorkingAreaHa: number;
  perimeterM: number;
  safetyOffsetM: number;
}

export class MiningService {
  /**
   * Generates statutory 7.5m / custom mining lease safety barrier offset polygon
   */
  static generateStatutorySafetyBuffer(
    leaseBoundary: { easting: number; northing: number }[],
    offsetMeters: number = 7.5
  ): {
    innerWorkingBoundary: { easting: number; northing: number }[];
    metrics: MiningLeaseMetrics;
  } {
    const pts = leaseBoundary.map(p => ({ x: p.easting, y: p.northing }));
    const baseMetrics = GeometryService.computePolygonMetrics(pts);

    // Generate inward buffer (approximate polygon shrinkage)
    const centroid = baseMetrics.centroid;
    const innerBoundary = pts.map(p => {
      const dx = centroid.x - p.x;
      const dy = centroid.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-6) return { easting: p.x, northing: p.y };
      const scale = Math.max(0, (dist - offsetMeters) / dist);
      return {
        easting: centroid.x - dx * scale,
        northing: centroid.y - dy * scale
      };
    });

    const innerMetrics = GeometryService.computePolygonMetrics(innerBoundary.map(p => ({ x: p.easting, y: p.northing })));

    const leaseAreaHa = baseMetrics.areaHa;
    const effectiveWorkingAreaHa = innerMetrics.areaHa;
    const safetyZoneAreaHa = Math.max(0, leaseAreaHa - effectiveWorkingAreaHa);

    return {
      innerWorkingBoundary: innerBoundary,
      metrics: {
        leaseAreaHa,
        safetyZoneAreaHa,
        effectiveWorkingAreaHa,
        perimeterM: baseMetrics.perimeterM,
        safetyOffsetM: offsetMeters
      }
    };
  }

  /**
   * Evaluates mineral cutoff threshold according to Indian Bureau of Mines (IBM) guidelines
   */
  static evaluateIBMCutoff(
    gradeValue: number,
    mineral: 'Iron Ore (Hematite)' | 'Bauxite' | 'Limestone' | 'Coal' | 'Chromite',
    parameterKey: 'Fe' | 'Al2O3' | 'SiO2' | 'CaO' | 'Ash' | 'Cr2O3'
  ): { isOre: boolean; threshold: number; operator: '>=' | '<=' } {
    switch (mineral) {
      case 'Iron Ore (Hematite)':
        if (parameterKey === 'Fe') return { isOre: gradeValue >= 45.0, threshold: 45.0, operator: '>=' };
        if (parameterKey === 'SiO2') return { isOre: gradeValue <= 10.0, threshold: 10.0, operator: '<=' };
        break;
      case 'Bauxite':
        if (parameterKey === 'Al2O3') return { isOre: gradeValue >= 40.0, threshold: 40.0, operator: '>=' };
        if (parameterKey === 'SiO2') return { isOre: gradeValue <= 5.0, threshold: 5.0, operator: '<=' };
        break;
      case 'Limestone':
        if (parameterKey === 'CaO') return { isOre: gradeValue >= 42.0, threshold: 42.0, operator: '>=' };
        if (parameterKey === 'SiO2') return { isOre: gradeValue <= 12.0, threshold: 12.0, operator: '<=' };
        break;
      case 'Coal':
        if (parameterKey === 'Ash') return { isOre: gradeValue <= 35.0, threshold: 35.0, operator: '<=' };
        break;
    }

    return { isOre: gradeValue >= 50.0, threshold: 50.0, operator: '>=' };
  }
}
