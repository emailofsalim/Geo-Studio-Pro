// ============================================================================
// BhuNex Studio — Deterministic Geometry Engine
// ============================================================================

export interface Point2D {
  x: number; // Easting or Lon
  y: number; // Northing or Lat
}

export interface PolygonMetrics {
  areaM2: number;
  areaHa: number;
  areaAcres: number;
  perimeterM: number;
  centroid: Point2D;
  isClosed: boolean;
  vertexCount: number;
}

export class GeometryService {
  /**
   * Deterministic Shoelace Polygon Area and Perimeter Calculation
   */
  static computePolygonMetrics(pts: Point2D[]): PolygonMetrics {
    if (!pts || pts.length < 3) {
      return {
        areaM2: 0,
        areaHa: 0,
        areaAcres: 0,
        perimeterM: 0,
        centroid: pts && pts.length > 0 ? pts[0] : { x: 0, y: 0 },
        isClosed: false,
        vertexCount: pts ? pts.length : 0
      };
    }

    const n = pts.length;
    // Check if implicitly or explicitly closed
    const first = pts[0];
    const last = pts[n - 1];
    const isExplicitlyClosed = Math.hypot(first.x - last.x, first.y - last.y) < 0.001;

    let area = 0;
    let perimeter = 0;
    let cx = 0;
    let cy = 0;

    const count = isExplicitlyClosed ? n - 1 : n;

    for (let i = 0; i < count; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % count];

      const cross = p1.x * p2.y - p2.x * p1.y;
      area += cross;
      cx += (p1.x + p2.x) * cross;
      cy += (p1.y + p2.y) * cross;

      perimeter += Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }

    area = Math.abs(area) * 0.5;

    let centroid: Point2D;
    if (area > 1e-9) {
      cx = Math.abs(cx) / (6 * area);
      cy = Math.abs(cy) / (6 * area);
      centroid = { x: cx, y: cy };
    } else {
      // Fallback arithmetic mean for degenerate line or zero-area polygon
      centroid = {
        x: pts.reduce((sum, p) => sum + p.x, 0) / n,
        y: pts.reduce((sum, p) => sum + p.y, 0) / n
      };
    }

    return {
      areaM2: area,
      areaHa: area / 10000,
      areaAcres: area / 4046.8564224,
      perimeterM: perimeter,
      centroid,
      isClosed: isExplicitlyClosed,
      vertexCount: n
    };
  }

  /**
   * Point in Polygon Test via Even-Odd Ray Casting
   */
  static isPointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
    if (!poly || poly.length < 3) return false;
    let inside = false;
    const n = poly.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;

      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-12) + xi);

      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Distance between two points in 2D plane
   */
  static distance2D(p1: Point2D, p2: Point2D): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  /**
   * Distance between two 3D points (including elevation Z)
   */
  static distance3D(p1: Point2D & { z?: number }, p2: Point2D & { z?: number }): { slopeDist: number; horizDist: number; deltaZ: number } {
    const horizDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const z1 = p1.z || 0;
    const z2 = p2.z || 0;
    const deltaZ = z2 - z1;
    const slopeDist = Math.hypot(horizDist, deltaZ);
    return { slopeDist, horizDist, deltaZ };
  }

  /**
   * Whole Circle Bearing (Azimuth) from P1 to P2 in degrees [0..360)
   */
  static azimuthDegrees(p1: Point2D, p2: Point2D): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    let rad = Math.atan2(dx, dy); // 0 at North, clockwise to East
    let deg = (rad * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  }

  /**
   * Line Segment Intersection Test
   */
  static lineIntersection(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): Point2D | null {
    const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(denom) < 1e-12) return null; // Parallel or collinear

    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y)
      };
    }
    return null;
  }

  /**
   * Self-Intersection detection for polygons (bow-tie geometry)
   */
  static checkSelfIntersection(pts: Point2D[]): boolean {
    if (pts.length < 4) return false;
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 2; j < n - 1; j++) {
        if (i === 0 && j === n - 2) continue; // adjacent in closed loop
        if (this.lineIntersection(pts[i], pts[i + 1], pts[j], pts[j + 1])) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Generates a circular buffer around a point
   */
  static createPointBuffer(center: Point2D, radiusM: number, segments: number = 32): Point2D[] {
    const pts: Point2D[] = [];
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      pts.push({
        x: center.x + radiusM * Math.cos(theta),
        y: center.y + radiusM * Math.sin(theta)
      });
    }
    pts.push({ ...pts[0] }); // close ring
    return pts;
  }

  /**
   * Generates a corridor buffer around a polyline
   */
  static createLineBuffer(line: Point2D[], widthM: number): Point2D[] {
    if (line.length < 2) return [];
    const halfWidth = widthM / 2;
    const leftSide: Point2D[] = [];
    const rightSide: Point2D[] = [];

    for (let i = 0; i < line.length - 1; i++) {
      const p1 = line[i];
      const p2 = line[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;

      const ux = -dy / len;
      const uy = dx / len;

      leftSide.push({ x: p1.x + ux * halfWidth, y: p1.y + uy * halfWidth });
      rightSide.push({ x: p1.x - ux * halfWidth, y: p1.y - uy * halfWidth });

      if (i === line.length - 2) {
        leftSide.push({ x: p2.x + ux * halfWidth, y: p2.y + uy * halfWidth });
        rightSide.push({ x: p2.x - ux * halfWidth, y: p2.y - uy * halfWidth });
      }
    }

    rightSide.reverse();
    const ring = [...leftSide, ...rightSide];
    if (ring.length > 0) ring.push({ ...ring[0] });
    return ring;
  }
}
