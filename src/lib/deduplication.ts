import { GeoFeature, GeoPoint, SurveyWaypoint, CadastralParcel, BoreholeHole } from '../types';

export interface DeduplicationOptions {
  distanceToleranceMeters?: number; // Spatial distance threshold to consider points identical
  matchNames?: boolean; // Whether names must match to consider items duplicates
  removeCollinearVertices?: boolean; // Whether to simplify straight line redundant vertices
}

export interface DeduplicationSummary {
  originalCount: number;
  cleanCount: number;
  removedCount: number;
  details: string[];
}

/**
 * Calculates Euclidean distance between two points (in meters if projected, approx if degrees)
 */
function pointDistance(p1: GeoPoint, p2: GeoPoint, isDegrees: boolean = false): number {
  const dx = p1.a - p2.a;
  const dy = p1.b - p2.b;
  if (isDegrees) {
    // Approximate degree distance at equator in meters: 1 deg lat ~ 111,320m
    const meanLatRad = ((p1.b + p2.b) / 2) * (Math.PI / 180);
    const dLatM = dy * 111320;
    const dLonM = dx * 111320 * Math.cos(meanLatRad);
    return Math.sqrt(dLatM * dLatM + dLonM * dLonM);
  }
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Deduplicates adjacent or proximate vertices inside a single GeoFeature polyline or polygon
 */
export function deduplicateFeatureVertices(
  feature: GeoFeature,
  toleranceMeters: number = 0.005
): { feature: GeoFeature; removedVertices: number } {
  if (!feature.pts || feature.pts.length <= 1) {
    return { feature, removedVertices: 0 };
  }

  const isDeg = feature.kind === 'll';
  const cleanPts: GeoPoint[] = [feature.pts[0]];
  let removed = 0;

  for (let i = 1; i < feature.pts.length; i++) {
    const prev = cleanPts[cleanPts.length - 1];
    const curr = feature.pts[i];
    const dist = pointDistance(prev, curr, isDeg);

    // If it's the closing point of a polygon, keep it only if polygon has at least 3 distinct pts
    const isClosing = feature.geom === 'polygon' && i === feature.pts.length - 1;
    if (isClosing && cleanPts.length >= 3) {
      cleanPts.push(curr);
    } else if (dist > toleranceMeters) {
      cleanPts.push(curr);
    } else {
      removed++;
    }
  }

  return {
    feature: {
      ...feature,
      pts: cleanPts
    },
    removedVertices: removed
  };
}

/**
 * Deduplicates an array of GeoFeatures (removes identical overlapping shapes or duplicate point coordinates)
 */
export function deduplicateFeatures(
  features: GeoFeature[],
  options: DeduplicationOptions = {}
): { cleanFeatures: GeoFeature[]; summary: DeduplicationSummary } {
  const tolerance = options.distanceToleranceMeters ?? 0.05; // 5 cm default geodetic tolerance
  const matchNames = options.matchNames ?? false;

  const originalCount = features.length;
  const cleanFeatures: GeoFeature[] = [];
  const details: string[] = [];
  let duplicateCount = 0;
  let cleanedVerticesTotal = 0;

  const featureSignatures = new Set<string>();

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (!f.pts || f.pts.length === 0) {
      duplicateCount++;
      details.push(`Removed empty geometry: "${f.name || 'Unnamed'}"`);
      continue;
    }

    // First clean internal duplicate vertices
    const { feature: cleanedFeature, removedVertices } = deduplicateFeatureVertices(f, tolerance);
    cleanedVerticesTotal += removedVertices;

    // Create a spatial footprint signature
    // Quantize coordinates to the tolerance grid
    const isDeg = cleanedFeature.kind === 'll';
    const gridStep = isDeg ? tolerance / 111320 : tolerance;

    const quantCoords = cleanedFeature.pts.map(p => {
      const qx = Math.round(p.a / gridStep);
      const qy = Math.round(p.b / gridStep);
      return `${qx},${qy}`;
    });

    const geomKey = `${cleanedFeature.geom}:${cleanedFeature.kind}:${quantCoords.join(';')}`;
    const fullSig = matchNames ? `${cleanedFeature.name}:${geomKey}` : geomKey;

    if (featureSignatures.has(fullSig)) {
      duplicateCount++;
      details.push(`Removed duplicate feature #${i + 1} (${cleanedFeature.name || cleanedFeature.geom})`);
    } else {
      featureSignatures.add(fullSig);
      cleanFeatures.push(cleanedFeature);
    }
  }

  if (cleanedVerticesTotal > 0) {
    details.push(`Cleaned ${cleanedVerticesTotal} redundant or jitter vertices across geometries.`);
  }

  return {
    cleanFeatures,
    summary: {
      originalCount,
      cleanCount: cleanFeatures.length,
      removedCount: duplicateCount,
      details
    }
  };
}

/**
 * Deduplicates Survey Waypoints (removes duplicate IDs or co-located GPS points)
 */
export function deduplicateSurveyWaypoints(
  waypoints: SurveyWaypoint[],
  toleranceMeters: number = 0.02
): { cleanWaypoints: SurveyWaypoint[]; summary: DeduplicationSummary } {
  const originalCount = waypoints.length;
  const cleanWaypoints: SurveyWaypoint[] = [];
  const details: string[] = [];
  const seenIds = new Set<string>();
  let removedCount = 0;

  for (const wp of waypoints) {
    // Check ID duplicate
    if (wp.id && seenIds.has(wp.id)) {
      removedCount++;
      details.push(`Removed duplicate waypoint ID: "${wp.id}" (${wp.code})`);
      continue;
    }

    // Check spatial proximity duplicate against existing clean waypoints
    let isSpatialDuplicate = false;
    for (const existing of cleanWaypoints) {
      const dE = wp.E - existing.E;
      const dN = wp.N - existing.N;
      const dZ = Math.abs(wp.Z - existing.Z);
      const dist2D = Math.sqrt(dE * dE + dN * dN);

      if (dist2D <= toleranceMeters && dZ <= toleranceMeters * 2) {
        isSpatialDuplicate = true;
        removedCount++;
        details.push(`Merged duplicate coordinate waypoint: "${wp.code}" within ${dist2D.toFixed(3)}m of "${existing.code}"`);
        break;
      }
    }

    if (!isSpatialDuplicate) {
      if (wp.id) seenIds.add(wp.id);
      cleanWaypoints.push(wp);
    }
  }

  return {
    cleanWaypoints,
    summary: {
      originalCount,
      cleanCount: cleanWaypoints.length,
      removedCount,
      details
    }
  };
}

/**
 * Deduplicates Cadastral Land Parcels (by khasra number, village, or boundary geometry)
 */
export function deduplicateCadastralParcels(
  parcels: CadastralParcel[],
  toleranceMeters: number = 0.1
): { cleanParcels: CadastralParcel[]; summary: DeduplicationSummary } {
  const originalCount = parcels.length;
  const cleanParcels: CadastralParcel[] = [];
  const details: string[] = [];
  const seenKeys = new Set<string>();
  let removedCount = 0;

  for (const p of parcels) {
    const key = `${p.village || ''}_${p.khasra || ''}`.trim().toLowerCase();
    if (key && seenKeys.has(key)) {
      removedCount++;
      details.push(`Removed duplicate Khasra record: #${p.khasra} in village ${p.village}`);
      continue;
    }

    // Check boundary overlap
    let isDuplicateGeom = false;
    if (p.pts && p.pts.length >= 3) {
      const centroidE = p.pts.reduce((s, pt) => s + pt.E, 0) / p.pts.length;
      const centroidN = p.pts.reduce((s, pt) => s + pt.N, 0) / p.pts.length;

      for (const existing of cleanParcels) {
        if (!existing.pts || existing.pts.length < 3) continue;
        const exCentroidE = existing.pts.reduce((s, pt) => s + pt.E, 0) / existing.pts.length;
        const exCentroidN = existing.pts.reduce((s, pt) => s + pt.N, 0) / existing.pts.length;
        const cDist = Math.hypot(centroidE - exCentroidE, centroidN - exCentroidN);
        const areaDiff = Math.abs(p.areaM2 - existing.areaM2);

        if (cDist < toleranceMeters && areaDiff < 0.1) {
          isDuplicateGeom = true;
          removedCount++;
          details.push(`Removed duplicate parcel boundary for #${p.khasra}`);
          break;
        }
      }
    }

    if (!isDuplicateGeom) {
      if (key) seenKeys.add(key);
      cleanParcels.push(p);
    }
  }

  return {
    cleanParcels,
    summary: {
      originalCount,
      cleanCount: cleanParcels.length,
      removedCount,
      details
    }
  };
}

/**
 * Deduplicates Raw Coordinate Lists / Point Clouds
 */
export function deduplicateCoordinatePoints(
  points: { a: number; b: number; z?: number; label?: string }[],
  tolerance: number = 0.001
): { cleanPoints: { a: number; b: number; z?: number; label?: string }[]; removedCount: number } {
  const cleanPoints: { a: number; b: number; z?: number; label?: string }[] = [];
  let removedCount = 0;

  for (const pt of points) {
    let isDuplicate = false;
    for (const ex of cleanPoints) {
      const da = Math.abs(pt.a - ex.a);
      const db = Math.abs(pt.b - ex.b);
      const dz = (pt.z !== undefined && ex.z !== undefined) ? Math.abs(pt.z - ex.z) : 0;

      if (da <= tolerance && db <= tolerance && dz <= tolerance) {
        isDuplicate = true;
        removedCount++;
        break;
      }
    }

    if (!isDuplicate) {
      cleanPoints.push(pt);
    }
  }

  return { cleanPoints, removedCount };
}
