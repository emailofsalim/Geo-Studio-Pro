import { GeoFeature, GeoPoint, GisLayer, TopologyIssue } from '../types';
import { lonLatToUtm, utmToLonLat, polygonAreaPerimeter, pointInPoly } from './geodesy';

export interface Point2D {
  x: number;
  y: number;
}

// ---------------- 1. Convex Hull Algorithm (Monotone Chain) ----------------
export function computeConvexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return [...points];

  // Sort points lexicographically by x, then y
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const cross = (o: Point2D, a: Point2D, b: Point2D) => {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  };

  // Lower hull
  const lower: Point2D[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Upper hull
  const upper: Point2D[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// ---------------- 2. True Centroid of Polygon ----------------
export function computePolygonCentroid(pts: Point2D[]): Point2D {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y };
  if (pts.length === 2) return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = pts.length;

  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const cross = p1.x * p2.y - p2.x * p1.y;
    area += cross;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
  }

  area = area * 0.5;
  if (Math.abs(area) < 1e-9) {
    // Fallback to arithmetic mean if degenerate
    const avgX = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const avgY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x: avgX, y: avgY };
  }

  cx = cx / (6 * area);
  cy = cy / (6 * area);
  return { x: cx, y: cy };
}

// ---------------- 3. Point & Polyline Buffer Generation ----------------
export function generatePointBuffer(center: Point2D, radiusM: number, numSegments: number = 32): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i < numSegments; i++) {
    const angle = (i / numSegments) * Math.PI * 2;
    pts.push({
      x: center.x + radiusM * Math.cos(angle),
      y: center.y + radiusM * Math.sin(angle)
    });
  }
  return pts;
}

export function generateLineBuffer(line: Point2D[], distanceM: number, numCapSegments: number = 8): Point2D[] {
  if (line.length < 2) return [];

  const leftSide: Point2D[] = [];
  const rightSide: Point2D[] = [];

  for (let i = 0; i < line.length - 1; i++) {
    const p1 = line[i];
    const p2 = line[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;

    const nx = -dy / len * distanceM;
    const ny = dx / len * distanceM;

    leftSide.push({ x: p1.x + nx, y: p1.y + ny });
    leftSide.push({ x: p2.x + nx, y: p2.y + ny });

    rightSide.unshift({ x: p1.x - nx, y: p1.y - ny });
    rightSide.unshift({ x: p2.x - nx, y: p2.y - ny });
  }

  // Add rounded end caps
  const endCap: Point2D[] = [];
  const lastP = line[line.length - 1];
  const lastPrev = line[line.length - 2];
  const lastAngle = Math.atan2(lastP.y - lastPrev.y, lastP.x - lastPrev.x);
  for (let i = 1; i <= numCapSegments; i++) {
    const a = lastAngle + Math.PI / 2 - (i / (numCapSegments + 1)) * Math.PI;
    endCap.push({
      x: lastP.x + distanceM * Math.cos(a),
      y: lastP.y + distanceM * Math.sin(a)
    });
  }

  const startCap: Point2D[] = [];
  const firstP = line[0];
  const firstNext = line[1];
  const firstAngle = Math.atan2(firstNext.y - firstP.y, firstNext.x - firstP.x);
  for (let i = 1; i <= numCapSegments; i++) {
    const a = firstAngle - Math.PI / 2 - (i / (numCapSegments + 1)) * Math.PI;
    startCap.push({
      x: firstP.x + distanceM * Math.cos(a),
      y: firstP.y + distanceM * Math.sin(a)
    });
  }

  return [...leftSide, ...endCap, ...rightSide, ...startCap];
}

// ---------------- 4. Polygon Outer / Inner Buffer ----------------
export function generatePolygonBuffer(poly: Point2D[], distanceM: number): Point2D[] {
  if (poly.length < 3) return [];
  const n = poly.length;
  const offsetPts: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const curr = poly[i];
    const next = poly[(i + 1) % n];

    const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };

    const l1 = Math.hypot(v1.x, v1.y) || 1;
    const l2 = Math.hypot(v2.x, v2.y) || 1;

    const n1 = { x: -v1.y / l1, y: v1.x / l1 };
    const n2 = { x: -v2.y / l2, y: v2.x / l2 };

    const bisector = { x: n1.x + n2.x, y: n1.y + n2.y };
    const bLen = Math.hypot(bisector.x, bisector.y) || 1;
    const cosHalf = (n1.x * n2.x + n1.y * n2.y + 1) / 2;
    const scale = Math.min(3.0, 1 / Math.sqrt(Math.max(0.1, cosHalf)));

    offsetPts.push({
      x: curr.x + (bisector.x / bLen) * distanceM * scale,
      y: curr.y + (bisector.y / bLen) * distanceM * scale
    });
  }

  return offsetPts;
}

// ---------------- 5. Polygon Intersection (Sutherland-Hodgman Polygon Clipping) ----------------
export function clipPolygon(subjectPoly: Point2D[], clipPoly: Point2D[]): Point2D[] {
  let outputList = subjectPoly;
  const cpLen = clipPoly.length;

  for (let i = 0; i < cpLen; i++) {
    const cp1 = clipPoly[i];
    const cp2 = clipPoly[(i + 1) % cpLen];
    const inputList = outputList;
    outputList = [];

    if (inputList.length === 0) break;

    const isInside = (p: Point2D) => {
      return (cp2.x - cp1.x) * (p.y - cp1.y) > (cp2.y - cp1.y) * (p.x - cp1.x);
    };

    const intersection = (p1: Point2D, p2: Point2D): Point2D => {
      const dc = { x: cp1.x - cp2.x, y: cp1.y - cp2.y };
      const dp = { x: p1.x - p2.x, y: p1.y - p2.y };
      const n1 = cp1.x * cp2.y - cp1.y * cp2.x;
      const n2 = p1.x * p2.y - p1.y * p2.x;
      const n3 = 1.0 / (dc.x * dp.y - dc.y * dp.x);
      return {
        x: (n1 * dp.x - n2 * dc.x) * n3,
        y: (n1 * dp.y - n2 * dc.y) * n3
      };
    };

    let s = inputList[inputList.length - 1];
    for (const e of inputList) {
      if (isInside(e)) {
        if (!isInside(s)) {
          outputList.push(intersection(s, e));
        }
        outputList.push(e);
      } else if (isInside(s)) {
        outputList.push(intersection(s, e));
      }
      s = e;
    }
  }

  return outputList;
}

// ---------------- 6. Topology Audit & QA Validator ----------------
export function auditLayerTopology(layer: GisLayer, zone: number = 45, south: boolean = false): TopologyIssue[] {
  const issues: TopologyIssue[] = [];

  layer.features.forEach((feat, fIdx) => {
    // Convert points to UTM Easting/Northing
    const pts: Point2D[] = feat.pts.map(p => {
      if (feat.kind === 'en') return { x: p.a, y: p.b };
      const u = lonLatToUtm(p.a, p.b, zone, south);
      return { x: u.E, y: u.N };
    });

    if (pts.length === 0) {
      issues.push({
        type: 'non_closed',
        severity: 'error',
        featureName: feat.name || `Feature #${fIdx + 1}`,
        description: 'Feature contains zero coordinate vertices.'
      });
      return;
    }

    // 1. Duplicate Vertices Check
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist < 0.005) {
        issues.push({
          type: 'duplicate_vertex',
          severity: 'warning',
          featureName: feat.name || `Feature #${fIdx + 1}`,
          description: `Duplicate/Coincident vertex detected at vertex #${i + 1} and #${i + 2} (< 5mm distance).`,
          location: { E: p1.x, N: p1.y }
        });
      }
    }

    if (feat.geom === 'polygon') {
      if (pts.length < 3) {
        issues.push({
          type: 'non_closed',
          severity: 'error',
          featureName: feat.name || `Feature #${fIdx + 1}`,
          description: 'Polygon has fewer than 3 vertices (degenerate ring).'
        });
        return;
      }

      // 2. Area & Sliver Polygon Check
      const areaCalc = polygonAreaPerimeter(pts.map(p => ({ E: p.x, N: p.y })));
      if (areaCalc.areaM2 < 1.0) {
        issues.push({
          type: 'sliver_polygon',
          severity: 'warning',
          featureName: feat.name || `Feature #${fIdx + 1}`,
          description: `Sliver polygon detected: Area is extremely small (${areaCalc.areaM2.toFixed(3)} m²).`
        });
      }

      // Compactness / Thinness check (Perimeter² / 4π*Area > 100 indicates spike/sliver)
      const isoperimetricRatio = (areaCalc.perimM * areaCalc.perimM) / (4 * Math.PI * Math.max(0.1, areaCalc.areaM2));
      if (isoperimetricRatio > 75 && areaCalc.areaM2 < 500) {
        issues.push({
          type: 'sliver_polygon',
          severity: 'info',
          featureName: feat.name || `Feature #${fIdx + 1}`,
          description: `Spike or narrow ribbon sliver geometry detected (Elongation factor: ${isoperimetricRatio.toFixed(1)}).`
        });
      }

      // 3. Self-Intersection Check (Pairwise non-adjacent edge crossing)
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const a1 = pts[i];
        const a2 = pts[(i + 1) % n];

        for (let j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue; // Adjacent edge in ring
          const b1 = pts[j];
          const b2 = pts[(j + 1) % n];

          if (doSegmentsIntersect(a1, a2, b1, b2)) {
            issues.push({
              type: 'self_intersection',
              severity: 'error',
              featureName: feat.name || `Feature #${fIdx + 1}`,
              description: `Self-intersecting loop detected between edge [${i + 1}-${(i + 1) % n + 1}] and edge [${j + 1}-${(j + 1) % n + 1}].`,
              location: { E: (a1.x + a2.x) / 2, N: (a1.y + a2.y) / 2 }
            });
          }
        }
      }
    }
  });

  return issues;
}

function doSegmentsIntersect(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): boolean {
  const ccw = (a: Point2D, b: Point2D, c: Point2D) => {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  };
  return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

// ---------------- 7. Voronoi / Thiessen Polygons Generator ----------------
export function generateVoronoiCells(points: { id: string; x: number; y: number; props?: Record<string, any> }[], bboxPadding: number = 200): GeoFeature[] {
  if (points.length < 2) return [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const boundPoly: Point2D[] = [
    { x: minX - bboxPadding, y: minY - bboxPadding },
    { x: maxX + bboxPadding, y: minY - bboxPadding },
    { x: maxX + bboxPadding, y: maxY + bboxPadding },
    { x: minX - bboxPadding, y: maxY + bboxPadding }
  ];

  const cells: GeoFeature[] = [];

  points.forEach((center, idx) => {
    let cellPoly = [...boundPoly];

    points.forEach((other, oIdx) => {
      if (idx === oIdx) return;
      // Perpendicular bisector between center and other
      const mid = { x: (center.x + other.x) / 2, y: (center.y + other.y) / 2 };
      const dx = other.x - center.x;
      const dy = other.y - center.y;
      const dist = Math.hypot(dx, dy) || 1;

      // Normal pointing towards center
      const nx = -dx / dist;
      const ny = -dy / dist;

      // Halfplane cutting clip polygon
      const tangent = { x: -ny * 20000, y: nx * 20000 };
      const p1 = { x: mid.x - tangent.x, y: mid.y - tangent.y };
      const p2 = { x: mid.x + tangent.x, y: mid.y + tangent.y };
      const p3 = { x: p2.x + nx * 20000, y: p2.y + ny * 20000 };
      const p4 = { x: p1.x + nx * 20000, y: p1.y + ny * 20000 };

      const halfPlane = [p1, p2, p3, p4];
      cellPoly = clipPolygon(cellPoly, halfPlane);
    });

    if (cellPoly.length >= 3) {
      cells.push({
        name: `Voronoi Cell (${center.id})`,
        geom: 'polygon',
        kind: 'en',
        pts: cellPoly.map(p => ({ a: p.x, b: p.y })),
        props: {
          Center_ID: center.id,
          Center_Easting: center.x.toFixed(2),
          Center_Northing: center.y.toFixed(2),
          ...center.props
        }
      });
    }
  });

  return cells;
}

// ---------------- 8. Attribute Summary & Field Statistics ----------------
export function computeFieldStatistics(features: GeoFeature[], fieldKey: string) {
  const numericVals: number[] = [];
  const textFreq: Record<string, number> = {};

  features.forEach(f => {
    const v = f.props?.[fieldKey];
    if (v != null) {
      const num = typeof v === 'number' ? v : parseFloat(String(v));
      if (!isNaN(num)) {
        numericVals.push(num);
      }
      const strVal = String(v).trim();
      if (strVal) {
        textFreq[strVal] = (textFreq[strVal] || 0) + 1;
      }
    }
  });

  if (numericVals.length > 0) {
    const sum = numericVals.reduce((a, b) => a + b, 0);
    const mean = sum / numericVals.length;
    const min = Math.min(...numericVals);
    const max = Math.max(...numericVals);
    const sorted = [...numericVals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const variance = numericVals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / numericVals.length;
    const stdDev = Math.sqrt(variance);

    return {
      type: 'numeric' as const,
      count: numericVals.length,
      min,
      max,
      sum,
      mean,
      median,
      stdDev,
      frequencies: textFreq
    };
  }

  return {
    type: 'string' as const,
    count: Object.keys(textFreq).length,
    frequencies: textFreq
  };
}
