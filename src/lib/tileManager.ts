import { lonLatToUtm, utmToLonLat } from './geodesy';

export type ImageryProvider =
  | 'google_satellite'
  | 'google_hybrid'
  | 'google_terrain'
  | 'google_roadmap'
  | 'google_streets'
  | 'esri_satellite'
  | 'osm_standard'
  | 'opentopo';

export interface ImageryLayerConfig {
  enabled: boolean;
  provider: ImageryProvider;
  opacity: number; // 0.0 to 1.0
  brightness: number; // 0.5 to 1.5
  contrast: number; // 0.5 to 1.5
}

export interface TileCoord {
  x: number;
  y: number;
  z: number;
}

export interface TileBBox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

// Convert lon/lat to Web Mercator tile index at zoom level z
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  // Clamp lat to Web Mercator valid range (-85.0511 to 85.0511)
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, Number.isFinite(lat) ? lat : 0));
  const clampedLon = Math.max(-180, Math.min(180, Number.isFinite(lon) ? lon : 0));
  
  const n = Math.pow(2, z);
  const x = Math.floor(((clampedLon + 180) / 360) * n);
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

// Convert tile coordinate to bounding box in lon/lat
export function tileToBBox(x: number, y: number, z: number): TileBBox {
  const n = Math.pow(2, z);
  const minLon = (x / n) * 360 - 180;
  const maxLon = ((x + 1) / n) * 360 - 180;
  const maxLat =
    (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const minLat =
    (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
  return { minLon, maxLon, minLat, maxLat };
}

// Generate tile URL based on provider with reliable CDN mirrors
export function getTileUrl(provider: string, x: number, y: number, z: number): string {
  const subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
  const s = subdomains[Math.abs(x + y) % subdomains.length];
  
  switch (provider) {
    case 'google_satellite':
      return `https://${s}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`;
    case 'google_hybrid':
      return `https://${s}.google.com/vt/lyrs=y&x=${x}&y=${y}&z=${z}`;
    case 'google_terrain':
      return `https://${s}.google.com/vt/lyrs=p&x=${x}&y=${y}&z=${z}`;
    case 'google_roadmap':
    case 'google_streets':
    case 'google_maps':
      return `https://${s}.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${z}`;
    case 'esri_satellite':
    case 'arcgis_satellite':
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    case 'osm_standard':
    case 'openstreetmap':
      return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    case 'opentopo':
    case 'opentopomap':
      return `https://tile.opentopomap.org/${z}/${x}/${y}.png`;
    default:
      return `https://${s}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`;
  }
}

// Tile Cache with LRU eviction and memory bounds
class TileCache {
  private cache = new Map<string, HTMLImageElement>();
  private failed = new Set<string>();
  private maxEntries = 500;

  public get(url: string, onLoaded?: () => void): HTMLImageElement | null {
    if (this.failed.has(url)) return null;

    const existing = this.cache.get(url);
    if (existing) {
      if (existing.complete && existing.naturalWidth > 0) {
        return existing;
      }
      return null;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (onLoaded) onLoaded();
    };
    img.onerror = () => {
      this.failed.add(url);
      this.cache.delete(url);
    };
    img.src = url;

    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(url, img);
    return null;
  }

  public clear() {
    this.cache.clear();
    this.failed.clear();
  }

  public size() {
    return this.cache.size;
  }
}

export const globalTileCache = new TileCache();

// Calculate optimal Web Mercator zoom level from scale (pixels per ground meter)
export function getOptimalZoomLevel(scale: number, centerLat: number): number {
  const safeLat = Number.isFinite(centerLat) ? Math.max(-80, Math.min(80, centerLat)) : 23.5;
  const latCos = Math.cos((safeLat * Math.PI) / 180);
  const metersPerPixel = 1 / Math.max(0.00005, scale);
  const zFloat = Math.log2((156543.03 * Math.max(0.1, latCos)) / metersPerPixel);
  const z = Math.round(zFloat);
  return Math.max(1, Math.min(20, z));
}

// Convert world coordinate to Lon/Lat safely handling local coordinates
export function safeWorldToLonLat(E: number, N: number, zoneNum: number = 45, isSouth: boolean = false): { lon: number; lat: number } {
  // If already in geographic degree ranges
  if (Math.abs(E) <= 180 && Math.abs(N) <= 90) {
    return { lon: E, lat: N };
  }
  // Standard UTM ranges
  if (E > 50000 && E < 1000000 && N > 0 && N < 10000000) {
    try {
      const res = utmToLonLat(E, N, zoneNum, isSouth);
      if (Number.isFinite(res.lon) && Number.isFinite(res.lat)) {
        return res;
      }
    } catch {}
  }
  // Fallback to zone central meridian and reasonable latitude
  const centralLon = (zoneNum * 6) - 183;
  return { lon: centralLon, lat: 23.5 };
}

// ---------------- Google Earth Style 3D Terrain & Elevation Profile ----------------
export interface ElevationProfilePoint {
  index: number;
  cumulativeDistM: number;
  E: number;
  N: number;
  lon: number;
  lat: number;
  elevationM: number;
  slopePct: number;
}

export interface ElevationProfileSummary {
  points: ElevationProfilePoint[];
  totalDistanceM: number;
  minElevationM: number;
  maxElevationM: number;
  elevationGainM: number;
  elevationLossM: number;
  avgSlopePct: number;
  maxSlopePct: number;
}

// Synthetic Geodetic Elevation Generator (Smooth terrain harmonics + geodetic undulation)
export function sampleElevation(lon: number, lat: number): number {
  // Base elevation derived from geographic terrain wave function with local topography harmonics
  const radLat = (lat * Math.PI) / 180;
  const radLon = (lon * Math.PI) / 180;

  const macro = Math.sin(radLat * 18) * Math.cos(radLon * 18) * 120 + 350;
  const meso = Math.sin(lat * 85.3) * Math.sin(lon * 85.3) * 45;
  const micro = Math.cos(lat * 320.7 + lon * 210.5) * 18;
  const ridge = Math.abs(Math.sin((lat + lon) * 150)) * 25;

  return Math.max(15, +(macro + meso + micro + ridge).toFixed(2));
}

// Compute elevation profile along a polyline
export function computeElevationProfile(
  pts: { E: number; N: number }[],
  zNum: number,
  isSouth: boolean,
  sampleSpacingM: number = 20
): ElevationProfileSummary {
  if (pts.length < 2) {
    return {
      points: [],
      totalDistanceM: 0,
      minElevationM: 0,
      maxElevationM: 0,
      elevationGainM: 0,
      elevationLossM: 0,
      avgSlopePct: 0,
      maxSlopePct: 0
    };
  }

  // Densify line along segments
  const densified: { E: number; N: number; cumDist: number }[] = [];
  let cum = 0;
  densified.push({ E: pts[0].E, N: pts[0].N, cumDist: 0 });

  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const segDist = Math.hypot(p2.E - p1.E, p2.N - p1.N);
    const steps = Math.max(1, Math.ceil(segDist / sampleSpacingM));

    for (let s = 1; s <= steps; s++) {
      const frac = s / steps;
      const curE = p1.E + (p2.E - p1.E) * frac;
      const curN = p1.N + (p2.N - p1.N) * frac;
      const stepDist = segDist / steps;
      cum += stepDist;
      densified.push({ E: curE, N: curN, cumDist: cum });
    }
  }

  const profilePoints: ElevationProfilePoint[] = [];
  let minElev = Infinity;
  let maxElev = -Infinity;
  let elevGain = 0;
  let elevLoss = 0;
  let maxSlope = 0;
  let totalSlope = 0;

  densified.forEach((pt, idx) => {
    const ll = utmToLonLat(pt.E, pt.N, zNum, isSouth);
    const elev = sampleElevation(ll.lon, ll.lat);

    if (elev < minElev) minElev = elev;
    if (elev > maxElev) maxElev = elev;

    let slope = 0;
    if (idx > 0) {
      const prev = profilePoints[idx - 1];
      const dDist = pt.cumDist - prev.cumulativeDistM;
      const dElev = elev - prev.elevationM;
      if (dElev > 0) elevGain += dElev;
      else elevLoss += Math.abs(dElev);

      if (dDist > 0) {
        slope = Math.abs((dElev / dDist) * 100);
        if (slope > maxSlope) maxSlope = slope;
        totalSlope += slope;
      }
    }

    profilePoints.push({
      index: idx,
      cumulativeDistM: pt.cumDist,
      E: pt.E,
      N: pt.N,
      lon: ll.lon,
      lat: ll.lat,
      elevationM: elev,
      slopePct: slope
    });
  });

  const avgSlope = profilePoints.length > 1 ? totalSlope / (profilePoints.length - 1) : 0;

  return {
    points: profilePoints,
    totalDistanceM: cum,
    minElevationM: minElev === Infinity ? 0 : minElev,
    maxElevationM: maxElev === -Infinity ? 0 : maxElev,
    elevationGainM: +elevGain.toFixed(1),
    elevationLossM: +elevLoss.toFixed(1),
    avgSlopePct: +avgSlope.toFixed(1),
    maxSlopePct: +maxSlope.toFixed(1)
  };
}

// ---------------- Solar Shadow / Daylight Angle Simulation ----------------
export interface SolarPosition {
  azimuthDeg: number;
  elevationDeg: number;
  shadowLengthRatio: number;
  shadowVector: { x: number; y: number };
}

// Computes sun angle based on solar hour (0 - 24, e.g. 10.5 for 10:30 AM)
export function computeSolarPosition(hour: number, lat: number = 23.5): SolarPosition {
  // Approximate solar declination & hour angle
  const hourAngleDeg = (hour - 12) * 15; // -180 to +180
  const latRad = (lat * Math.PI) / 180;
  const declinationRad = 0.25 * Math.sin((Math.PI * 2 * (172 - 80)) / 365); // Summer solstice approx

  const sinElev =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos((hourAngleDeg * Math.PI) / 180);
  const elevRad = Math.asin(Math.max(-1, Math.min(1, sinElev)));
  const elevDeg = Math.max(0, (elevRad * 180) / Math.PI);

  const cosAz =
    (Math.sin(declinationRad) - Math.sin(latRad) * Math.sin(elevRad)) /
    (Math.cos(latRad) * Math.cos(elevRad) + 0.0001);
  let azDeg = (Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180) / Math.PI;
  if (hourAngleDeg > 0) azDeg = 360 - azDeg;

  // Shadow length ratio (cotangent of sun elevation)
  const shadowRatio = elevDeg > 3 ? 1 / Math.tan((elevDeg * Math.PI) / 180) : 15;
  const shadowAzRad = ((azDeg + 180) * Math.PI) / 180;
  const shadowX = Math.sin(shadowAzRad);
  const shadowY = Math.cos(shadowAzRad);

  return {
    azimuthDeg: +azDeg.toFixed(1),
    elevationDeg: +elevDeg.toFixed(1),
    shadowLengthRatio: Math.min(10, +shadowRatio.toFixed(2)),
    shadowVector: { x: shadowX, y: shadowY }
  };
}
