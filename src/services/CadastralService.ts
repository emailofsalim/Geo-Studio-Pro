// ============================================================================
// BhuNex Studio — Cadastral Engineering Service
// ============================================================================

import { CanonicalParcel, Coordinate3D } from '../types/canonical';
import { GeometryService } from './GeometryService';
import { UnitEngine } from '../lib/unitEngine';

export class CadastralService {
  /**
   * Computes boundary metrics for a cadastral parcel
   */
  static computeParcelMetrics(points: Coordinate3D[]): {
    areaM2: number;
    areaHa: number;
    areaAcres: number;
    perimeterM: number;
    centroid: { easting: number; northing: number };
  } {
    const pts2d = points.map(p => ({
      x: p.easting ?? p.longitude ?? 0,
      y: p.northing ?? p.latitude ?? 0
    }));

    const metrics = GeometryService.computePolygonMetrics(pts2d);

    return {
      areaM2: metrics.areaM2,
      areaHa: metrics.areaHa,
      areaAcres: metrics.areaAcres,
      perimeterM: metrics.perimeterM,
      centroid: { easting: metrics.centroid.x, northing: metrics.centroid.y }
    };
  }

  /**
   * Converts area between Metric, English, and regional Indian revenue units (Bigha, Katha, Dhur, Guntha)
   */
  static convertRegionalArea(
    areaSqm: number,
    statePreset: 'Bihar / Bengal (Standard)' | 'UP (Pucca Bigha)' | 'Rajasthan' | 'Maharashtra (Guntha)' | 'Punjab (Kanal)' = 'Bihar / Bengal (Standard)'
  ): {
    primary: string;
    bigha: number;
    katha: number;
    dhur: number;
    sqm: number;
    hectares: number;
    acres: number;
  } {
    let bighaSqm = 2529.285264; // Standard 20-katha Bengal/Bihar
    let kathaPerBigha = 20;
    let dhurPerKatha = 20;

    if (statePreset === 'UP (Pucca Bigha)') {
      bighaSqm = 2529.3;
    } else if (statePreset === 'Rajasthan') {
      bighaSqm = 1618.7;
    } else if (statePreset === 'Maharashtra (Guntha)') {
      bighaSqm = 101.1714106 * 20; // Guntha based
    }

    const totalBighas = areaSqm / bighaSqm;
    const bighaInt = Math.floor(totalBighas);
    const remAfterBigha = areaSqm - (bighaInt * bighaSqm);

    const kathaSqm = bighaSqm / kathaPerBigha;
    const totalKathas = remAfterBigha / kathaSqm;
    const kathaInt = Math.floor(totalKathas);
    const remAfterKatha = remAfterBigha - (kathaInt * kathaSqm);

    const dhurSqm = kathaSqm / dhurPerKatha;
    const dhurVal = remAfterKatha / dhurSqm;

    const hectares = areaSqm / 10000;
    const acres = areaSqm / 4046.8564224;

    const primary = `${bighaInt} Bigha, ${kathaInt} Katha, ${dhurVal.toFixed(2)} Dhur`;

    return {
      primary,
      bigha: bighaInt,
      katha: kathaInt,
      dhur: Number(dhurVal.toFixed(2)),
      sqm: areaSqm,
      hectares: Number(hectares.toFixed(4)),
      acres: Number(acres.toFixed(4))
    };
  }
}
