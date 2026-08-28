import { GeoFeature, GisLayer } from '../../types';
import { Point2D } from '../../lib/spatialAnalysis';
import { lonLatToUtm, polygonAreaPerimeter } from '../../lib/geodesy';
import { SnapTarget } from './gisTypes';

// Douglas-Peucker Polygon/Polyline Simplification
export function simplifyDouglasPeucker(pts: { a: number; b: number }[], toleranceM: number): { a: number; b: number }[] {
  if (pts.length <= 2) return pts;

  let maxDist = 0;
  let index = 0;
  const p1 = pts[0];
  const p2 = pts[pts.length - 1];

  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const lineLen = Math.hypot(p2.a - p1.a, p2.b - p1.b);
    let d = 0;
    if (lineLen === 0) {
      d = Math.hypot(p.a - p1.a, p.b - p1.b);
    } else {
      d = Math.abs((p2.b - p1.b) * p.a - (p2.a - p1.a) * p.b + p2.a * p1.b - p2.b * p1.a) / lineLen;
    }
    if (d > maxDist) {
      index = i;
      maxDist = d;
    }
  }

  if (maxDist > toleranceM) {
    const res1 = simplifyDouglasPeucker(pts.slice(0, index + 1), toleranceM);
    const res2 = simplifyDouglasPeucker(pts.slice(index), toleranceM);
    return res1.slice(0, res1.length - 1).concat(res2);
  } else {
    return [p1, p2];
  }
}

// Find nearest snap target to world coordinate
export function findSnapTarget(
  worldE: number,
  worldN: number,
  layers: GisLayer[],
  scale: number,
  zNum: number,
  isSouth: boolean,
  snapThresholdPx: number = 14,
  snapGrid: boolean = false,
  gridStepM: number = 50
): SnapTarget | null {
  let closest: SnapTarget | null = null;
  let minDistancePx = snapThresholdPx;

  // 1. Check all visible feature vertices
  for (const layer of layers) {
    if (!layer.visible) continue;
    for (const feat of layer.features) {
      for (let i = 0; i < feat.pts.length; i++) {
        const p = feat.pts[i];
        let e = p.a;
        let n = p.b;
        if (feat.kind === 'll') {
          const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
          e = u.E;
          n = u.N;
        }

        const distM = Math.hypot(e - worldE, n - worldN);
        const distPx = distM * scale;

        if (distPx < minDistancePx) {
          minDistancePx = distPx;
          closest = {
            E: e,
            N: n,
            type: 'vertex',
            sourceFeatureName: feat.name,
            distancePx: distPx
          };
        }
      }

      // Check midpoints of segments
      if (feat.geom === 'line' || feat.geom === 'polygon') {
        const numEdges = feat.geom === 'polygon' ? feat.pts.length : feat.pts.length - 1;
        for (let i = 0; i < numEdges; i++) {
          const p1 = feat.pts[i];
          const p2 = feat.pts[(i + 1) % feat.pts.length];
          const midE = (p1.a + p2.a) / 2;
          const midN = (p1.b + p2.b) / 2;
          const distPx = Math.hypot(midE - worldE, midN - worldN) * scale;
          if (distPx < minDistancePx) {
            minDistancePx = distPx;
            closest = {
              E: midE,
              N: midN,
              type: 'midpoint',
              sourceFeatureName: `${feat.name} (Midpoint)`,
              distancePx: distPx
            };
          }
        }
      }
    }
  }

  // 2. Check UTM grid snap if enabled and no vertex is closer
  if (snapGrid && (!closest || minDistancePx > 8)) {
    const gridE = Math.round(worldE / gridStepM) * gridStepM;
    const gridN = Math.round(worldN / gridStepM) * gridStepM;
    const distPx = Math.hypot(gridE - worldE, gridN - worldN) * scale;
    if (distPx < snapThresholdPx && (!closest || distPx < closest.distancePx)) {
      closest = {
        E: gridE,
        N: gridN,
        type: 'grid',
        distancePx: distPx
      };
    }
  }

  return closest;
}

// Compute live geometry statistics for a feature
export function getFeatureStats(
  feat: GeoFeature,
  zNum: number,
  isSouth: boolean,
  customBighaM2: number = 2529.285
) {
  const pts = feat.pts.map(p => {
    if (feat.kind === 'en') return { E: p.a, N: p.b };
    const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
    return { E: u.E, N: u.N };
  });

  if (feat.geom === 'point') {
    return {
      type: 'point',
      pointCount: pts.length,
      coordinates: pts[0] ? `E: ${pts[0].E.toFixed(2)}, N: ${pts[0].N.toFixed(2)}` : 'N/A'
    };
  }

  if (feat.geom === 'line') {
    let totalLengthM = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      totalLengthM += Math.hypot(pts[i + 1].E - pts[i].E, pts[i + 1].N - pts[i].N);
    }
    return {
      type: 'line',
      vertexCount: pts.length,
      lengthM: totalLengthM,
      lengthKm: totalLengthM / 1000,
      lengthFt: totalLengthM * 3.28084
    };
  }

  // Polygon
  const poly = polygonAreaPerimeter(pts);
  const bigha = poly.areaM2 / customBighaM2;
  const katha = (bigha - Math.floor(bigha)) * 20;

  return {
    type: 'polygon',
    vertexCount: pts.length,
    areaM2: poly.areaM2,
    areaHa: poly.areaHa,
    areaAcres: poly.areaAcres,
    bighaText: `${Math.floor(bigha)} Bigha ${katha.toFixed(1)} Katha`,
    perimeterM: poly.perimM
  };
}
