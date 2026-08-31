// ============================================================================
// BhuNex Studio — Borehole & Stratigraphic Subsurface Engine
// ============================================================================

import { CanonicalBorehole, CanonicalBoreholeInterval, Coordinate3D } from '../types/canonical';

export interface OreIntersectionSummary {
  boreholeId: string;
  totalDepthM: number;
  oreIntervalCount: number;
  totalOreThicknessM: number;
  wasteThicknessM: number;
  strippingRatio: number; // Waste to Ore ratio
  weightedAverageGrades: Record<string, number>;
}

export class BoreholeService {
  /**
   * Computes comprehensive stratigraphic statistics and ore intersections
   */
  static analyzeBorehole(borehole: CanonicalBorehole): OreIntersectionSummary {
    let totalOreM = 0;
    let totalWasteM = 0;
    let oreCount = 0;
    const gradeSums: Record<string, number> = {};
    const gradeLengths: Record<string, number> = {};

    borehole.intervals.forEach(intv => {
      const len = Math.max(0, intv.toDepth - intv.fromDepth);
      if (intv.isOre) {
        totalOreM += len;
        oreCount++;

        Object.entries(intv.grades).forEach(([param, val]) => {
          if (val !== null && !isNaN(val)) {
            gradeSums[param] = (gradeSums[param] || 0) + (val * len);
            gradeLengths[param] = (gradeLengths[param] || 0) + len;
          }
        });
      } else {
        totalWasteM += len;
      }
    });

    const weightedAverageGrades: Record<string, number> = {};
    Object.keys(gradeSums).forEach(param => {
      const len = gradeLengths[param] || 0;
      weightedAverageGrades[param] = len > 0 ? Number((gradeSums[param] / len).toFixed(2)) : 0;
    });

    const strippingRatio = totalOreM > 0 ? Number((totalWasteM / totalOreM).toFixed(2)) : 999;

    return {
      boreholeId: borehole.id,
      totalDepthM: borehole.endOfHoleDepth,
      oreIntervalCount: oreCount,
      totalOreThicknessM: Number(totalOreM.toFixed(2)),
      wasteThicknessM: Number(totalWasteM.toFixed(2)),
      strippingRatio,
      weightedAverageGrades
    };
  }

  /**
   * Generates 3D vertical trace coordinates for an inclined or vertical borehole
   */
  static generate3DTrace(
    collar: Coordinate3D,
    endDepthM: number,
    azimuthDeg: number = 0,
    dipDeg: number = 90
  ): { x: number; y: number; z: number; depth: number }[] {
    const trace: { x: number; y: number; z: number; depth: number }[] = [];
    const cE = collar.easting ?? 0;
    const cN = collar.northing ?? 0;
    const cZ = collar.elevation ?? 0;

    const dipRad = (dipDeg * Math.PI) / 180;
    const azRad = (azimuthDeg * Math.PI) / 180;

    const step = Math.min(10, endDepthM / 10 || 5);
    for (let d = 0; d <= endDepthM; d += step) {
      const horizDist = d * Math.cos(dipRad);
      const vertDrop = d * Math.sin(dipRad);

      const dx = horizDist * Math.sin(azRad);
      const dy = horizDist * Math.cos(azRad);

      trace.push({
        x: cE + dx,
        y: cN + dy,
        z: cZ - vertDrop,
        depth: d
      });
    }

    return trace;
  }
}
