// ============================================================================
// BhuNex Studio — Engineering Quality Assurance (QA) Engine
// ============================================================================

import { GeoFeature, CadastralParcel, BoreholeHole } from '../types';
import { GeometryService } from './GeometryService';

export interface QAProblem {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: 'Geometry' | 'Coordinate' | 'Cadastral' | 'Borehole' | 'Survey' | 'Topology';
  type: string;
  featureName?: string;
  detail: string;
  recommendation: string;
  location?: { easting: number; northing: number };
}

export interface ProjectDataHealthReport {
  timestamp: number;
  overallScore: number; // 0 to 100%
  status: 'PASSED' | 'WARNINGS' | 'CRITICAL_ERRORS';
  errorCount: number;
  warningCount: number;
  infoCount: number;
  metrics: {
    totalWaypoints: number;
    totalLayers: number;
    totalFeatures: number;
    totalParcels: number;
    totalBoreholes: number;
  };
  issues: QAProblem[];
}

export class QAService {
  /**
   * Runs comprehensive multi-module QA audit across active project dataset
   */
  static auditProjectData(data: {
    waypoints?: any[];
    layers?: any[];
    parcels?: CadastralParcel[];
    boreholes?: BoreholeHole[];
  }): ProjectDataHealthReport {
    const issues: QAProblem[] = [];

    // 1. Waypoint & Coordinate Checks
    const waypoints = data.waypoints || [];
    const coordMap = new Map<string, number>();

    waypoints.forEach((wp, idx) => {
      const e = wp.E || wp.easting || 0;
      const n = wp.N || wp.northing || 0;
      const id = wp.id || wp.code || `WP-${idx + 1}`;

      // Check Null Island (0,0)
      if (Math.abs(e) < 1 && Math.abs(n) < 1) {
        issues.push({
          id: `qa_wp_null_${idx}`,
          severity: 'error',
          category: 'Coordinate',
          type: 'Null Island Coordinates',
          featureName: id,
          detail: `Waypoint ${id} coordinates are located at origin (0, 0).`,
          recommendation: 'Update with valid ground survey coordinates or delete placeholder station.'
        });
      }

      // Check UTM range
      if (e < 100000 || e > 900000) {
        issues.push({
          id: `qa_wp_utm_e_${idx}`,
          severity: 'warning',
          category: 'Coordinate',
          type: 'Abnormal Easting',
          featureName: id,
          detail: `Easting (${e.toFixed(1)} m) is outside typical UTM range [100,000 to 900,000 m].`,
          recommendation: 'Check whether Latitude/Longitude was entered or verify the project UTM zone.'
        });
      }

      // Check duplicate coordinate markers
      const key = `${e.toFixed(2)}_${n.toFixed(2)}`;
      coordMap.set(key, (coordMap.get(key) || 0) + 1);
    });

    coordMap.forEach((count, key) => {
      if (count > 1) {
        const [e, n] = key.split('_');
        issues.push({
          id: `qa_dup_coord_${key}`,
          severity: 'info',
          category: 'Survey',
          type: 'Stacked Coordinates',
          detail: `${count} survey stations share identical coordinate (E: ${e}, N: ${n}).`,
          recommendation: 'Confirm whether stacked monument or redundant point duplicate.'
        });
      }
    });

    // 2. GIS Vector Layer & Geometry QA
    const layers = data.layers || [];
    let totalFeatures = 0;

    layers.forEach(layer => {
      const feats = layer.features || [];
      totalFeatures += feats.length;

      feats.forEach((f: GeoFeature, fIdx: number) => {
        const name = f.name || `Feature ${fIdx + 1}`;
        const pts = f.pts || [];

        if (f.geom === 'polygon') {
          if (pts.length < 3) {
            issues.push({
              id: `qa_geom_deg_poly_${layer.id}_${fIdx}`,
              severity: 'error',
              category: 'Geometry',
              type: 'Degenerate Polygon',
              featureName: name,
              detail: `Polygon "${name}" in layer "${layer.name}" has fewer than 3 vertices.`,
              recommendation: 'Polygons require at least 3 distinct boundary vertices.'
            });
          } else {
            const xy = pts.map(p => ({ x: p.a, y: p.b }));
            if (GeometryService.checkSelfIntersection(xy)) {
              issues.push({
                id: `qa_geom_self_int_${layer.id}_${fIdx}`,
                severity: 'warning',
                category: 'Geometry',
                type: 'Self-Intersecting Polygon',
                featureName: name,
                detail: `Polygon "${name}" contains self-intersecting edges (bow-tie geometry).`,
                recommendation: 'Reorder boundary nodes in sequential clockwise or counter-clockwise order.'
              });
            }
          }
        } else if (f.geom === 'line') {
          if (pts.length < 2) {
            issues.push({
              id: `qa_geom_deg_line_${layer.id}_${fIdx}`,
              severity: 'error',
              category: 'Geometry',
              type: 'Degenerate Polyline',
              featureName: name,
              detail: `Polyline "${name}" in layer "${layer.name}" has fewer than 2 vertices.`,
              recommendation: 'Polylines require at least 2 points to form a segment.'
            });
          }
        }
      });
    });

    // 3. Cadastral Parcel QA
    const parcels = data.parcels || [];
    const khasraSet = new Set<string>();

    parcels.forEach((p, pIdx) => {
      const khasra = p.khasra || `Plot ${pIdx + 1}`;
      if (khasraSet.has(khasra)) {
        issues.push({
          id: `qa_cad_dup_khasra_${pIdx}`,
          severity: 'warning',
          category: 'Cadastral',
          type: 'Duplicate Khasra Number',
          featureName: khasra,
          detail: `Khasra/Plot ID "${khasra}" is assigned to multiple distinct parcels.`,
          recommendation: 'Ensure unique parcel identifiers or append subdivision suffixes (e.g. 102/1, 102/2).'
        });
      } else {
        khasraSet.add(khasra);
      }

      if (!p.pts || p.pts.length < 3) {
        issues.push({
          id: `qa_cad_poly_${pIdx}`,
          severity: 'error',
          category: 'Cadastral',
          type: 'Invalid Parcel Boundary',
          featureName: khasra,
          detail: `Cadastral plot "${khasra}" has invalid geometry (fewer than 3 corners).`,
          recommendation: 'Survey and digitize all boundary pillars.'
        });
      }
    });

    // 4. Borehole & Geotechnical QA
    const boreholes = data.boreholes || [];
    const bhIdSet = new Set<string>();

    boreholes.forEach((bh, bIdx) => {
      if (bhIdSet.has(bh.id)) {
        issues.push({
          id: `qa_bh_dup_${bIdx}`,
          severity: 'error',
          category: 'Borehole',
          type: 'Duplicate Borehole ID',
          featureName: bh.id,
          detail: `Borehole ID "${bh.id}" is duplicated in the collar register.`,
          recommendation: 'Assign unique collar identifiers (e.g. BH-01, BH-02).'
        });
      } else {
        bhIdSet.add(bh.id);
      }

      const intervals = bh.intervals || [];
      for (let i = 0; i < intervals.length; i++) {
        const intv = intervals[i];
        if (intv.from < 0 || intv.to <= intv.from) {
          issues.push({
            id: `qa_bh_intv_${bIdx}_${i}`,
            severity: 'error',
            category: 'Borehole',
            type: 'Negative or Inverted Depth Interval',
            featureName: bh.id,
            detail: `Borehole "${bh.id}" interval ${i + 1} has invalid depth: from ${intv.from} m to ${intv.to} m.`,
            recommendation: 'Depth intervals must satisfy 0 <= From < To.'
          });
        }
      }
    });

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;

    // Calculate score
    const deduction = (errorCount * 15) + (warningCount * 5);
    const overallScore = Math.max(0, Math.min(100, 100 - deduction));

    let status: 'PASSED' | 'WARNINGS' | 'CRITICAL_ERRORS' = 'PASSED';
    if (errorCount > 0) status = 'CRITICAL_ERRORS';
    else if (warningCount > 0) status = 'WARNINGS';

    return {
      timestamp: Date.now(),
      overallScore,
      status,
      errorCount,
      warningCount,
      infoCount,
      metrics: {
        totalWaypoints: waypoints.length,
        totalLayers: layers.length,
        totalFeatures,
        totalParcels: parcels.length,
        totalBoreholes: boreholes.length
      },
      issues
    };
  }
}
