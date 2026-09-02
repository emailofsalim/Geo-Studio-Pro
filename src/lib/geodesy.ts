import { LatLon, UTMCoords } from '../types';

export const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---------------- UTM <-> WGS84 ----------------
export function utmToLonLat(E: number, N: number, zone: number = 45, south: boolean = false): LatLon {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, E0 = 500000;
  const lon0 = (zone * 6 - 183) * Math.PI / 180;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const Ny = south ? (N - 10000000) : N;
  const M = Ny / k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
  
  const phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
    + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
    + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    
  const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1), C1 = ep2 * c * c, T1 = t * t;
  const N1 = a / Math.sqrt(1 - e2 * s * s), R1 = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5), D = (E - E0) / (N1 * k0);
  
  const lat = phi1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4) / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720);
  const lon = lon0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120) / c;
  
  return { lon: lon * 180 / Math.PI, lat: lat * 180 / Math.PI };
}

export function lonLatToUtm(lon: number, lat: number, zone: number = 45, south: boolean = false): UTMCoords {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, E0 = 500000;
  const lon0 = (zone * 6 - 183) * Math.PI / 180;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  
  const N = a / Math.sqrt(1 - e2 * Math.pow(Math.sin(la), 2)), T = Math.pow(Math.tan(la), 2), C = ep2 * Math.pow(Math.cos(la), 2), A = Math.cos(la) * (lo - lon0);
  const M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256) * la - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(2 * la) + (15 * e2 * e2 / 256 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(4 * la) - (35 * Math.pow(e2, 3) / 3072) * Math.sin(6 * la));
  
  const E = E0 + k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120);
  let Nn = k0 * (M + N * Math.tan(la) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720));
  if (south) Nn += 10000000;
  
  return { E, N: Nn, zone, south };
}

export function zoneFromLonLat(lon: number, lat: number) {
  const z = Math.min(60, Math.max(1, Math.floor((Number(lon) + 180) / 6) + 1));
  return { zone: z, south: Number(lat) < 0 };
}

// ---------------- DMS Parser and Formatter ----------------
export function parseDMSval(s: string | number): number {
  if (typeof s === 'number') return s;
  s = String(s == null ? '' : s).trim();
  if (s === '') return NaN;
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  
  const hm = s.match(/([NSEWnsew])\s*$/) || s.match(/^\s*([NSEWnsew])/);
  const hemi = hm ? hm[1].toUpperCase() : '';
  const nums = s.replace(/[NSEWnsew]/g, ' ').match(/-?\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return NaN;
  
  let deg = parseFloat(nums[0]) || 0;
  let mn = nums.length > 1 ? parseFloat(nums[1]) || 0 : 0;
  let sc = nums.length > 2 ? parseFloat(nums[2]) || 0 : 0;
  const mag = Math.abs(deg) + Math.abs(mn) / 60 + Math.abs(sc) / 3600;
  const neg = deg < 0 || /^\s*-/.test(s) || hemi === 'S' || hemi === 'W';
  return neg ? -mag : mag;
}

export function toDMSstr(v: number, isLat: boolean): string {
  const hh = v < 0 ? (isLat ? 'S' : 'W') : (isLat ? 'N' : 'E');
  v = Math.abs(v);
  const d = Math.floor(v);
  const mf = (v - d) * 60;
  const mn = Math.floor(mf);
  const sc = (mf - mn) * 60;
  return `${d}°${String(mn).padStart(2, '0')}'${sc.toFixed(2)}"${hh}`;
}

// ---------------- MGRS ----------------
export function latBand(lat: number): string {
  if (lat < -80 || lat > 84) return 'Z';
  const bands = 'CDEFGHJKLMNPQRSTUVWX';
  let i = Math.floor((lat + 80) / 8);
  if (i > 19) i = 19;
  return bands.charAt(i);
}

export function mgrsFromLonLat(lon: number, lat: number, zoneOverride?: number, southOverride?: boolean): string {
  const zone = zoneOverride || (Math.floor((lon + 180) / 6) + 1);
  const band = latBand(lat);
  const south = southOverride != null ? southOverride : lat < 0;
  const u = lonLatToUtm(lon, lat, zone, south);
  const e = u.E, n = u.N;
  
  const set = ((zone - 1) % 6) + 1;
  const colOrigins: Record<number, string> = { 1: 'A', 2: 'J', 3: 'S', 4: 'A', 5: 'J', 6: 'S' };
  const colLetters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const col = Math.floor(e / 100000);
  const startCol = colLetters.indexOf(colOrigins[set]);
  const colLetter = colLetters.charAt((startCol + (col - 1)) % 24);
  const rowLetters = zone % 2 === 1 ? 'ABCDEFGHJKLMNPQRSTUV' : 'FGHJKLMNPQRSTUVABCDE';
  const rowIdx = Math.floor((n % 2000000) / 100000);
  const rowLetter = rowLetters.charAt(rowIdx % 20);
  
  const pad = (v: number) => ('00000' + Math.floor(v % 100000)).slice(-5);
  const gzd = ('0' + zone).slice(-2);
  return `${gzd}${band} ${colLetter}${rowLetter} ${pad(e)} ${pad(n)}`;
}

// ---------------- Vincenty Inverse (Ellipsoidal Geodesic) ----------------
export interface VincentyResult {
  distance: number;
  fwdAz: number;
  revAz: number;
  converged: boolean;
  antipodal?: boolean;
}

export function vincentyCore(lon1: number, lat1: number, lon2: number, lat2: number): VincentyResult {
  const a = 6378137, f = 1 / 298.257223563, b = (1 - f) * a, toR = Math.PI / 180;
  const L = (lon2 - lon1) * toR;
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * toR)), U2 = Math.atan((1 - f) * Math.tan(lat2 * toR));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1), sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  
  let lambda = L, lambdaP = 0, iter = 0;
  let cosSqAlpha = 0, sinSigma = 0, cos2SigmaM = 0, cosSigma = 0, sigma = 0, sinAlpha = 0;
  
  if (Math.abs(lon1 - lon2) < 1e-12 && Math.abs(lat1 - lat2) < 1e-12) {
    return { distance: 0, fwdAz: 0, revAz: 0, converged: true };
  }
  
  do {
    const sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
    const t1 = cosU2 * sinLambda, t2 = cosU1 * sinU2 - sinU1 * cosU2 * cosLambda;
    sinSigma = Math.sqrt(t1 * t1 + t2 * t2);
    if (sinSigma === 0) return { distance: 0, fwdAz: 0, revAz: 0, converged: true };
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? (cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha) : 0;
    const C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda = L + (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  } while (Math.abs(lambda - lambdaP) > 1e-12 && ++iter < 1000);
  
  const uSq = cosSqAlpha * (a * a - b * b) / (b * b);
  const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  const s = b * A * (sigma - deltaSigma);
  
  const fwd = Math.atan2(cosU2 * Math.sin(lambda), cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(lambda));
  const rev = Math.atan2(cosU1 * Math.sin(lambda), -sinU1 * cosU2 + cosU1 * sinU2 * Math.cos(lambda));
  const deg = 180 / Math.PI;
  
  return { distance: s, fwdAz: (fwd * deg + 360) % 360, revAz: (rev * deg + 360) % 360, converged: iter < 1000 };
}

export function vincentyInverse(lon1: number, lat1: number, lon2: number, lat2: number): VincentyResult {
  const r = vincentyCore(lon1, lat1, lon2, lat2);
  if (r.converged) return r;
  
  // Antipodal fallback via waypoint minimization
  const leg1 = vincentyCore(lon1, lat1, lon1, 89.9);
  const leg2 = vincentyCore(lon1, 89.9, lon2, lat2);
  return {
    distance: leg1.distance + leg2.distance,
    fwdAz: leg1.fwdAz,
    revAz: leg2.revAz,
    converged: true,
    antipodal: true
  };
}

// ---------------- Combined Scale Factor (CSF) ----------------
export function earthRadii(latDeg: number) {
  const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f);
  const la = (latDeg || 0) * Math.PI / 180, s = Math.sin(la);
  const den = 1 - e2 * s * s;
  const N = a / Math.sqrt(den);
  const M = a * (1 - e2) / Math.pow(den, 1.5);
  return { N, M, gaussian: Math.sqrt(M * N) };
}

export function combinedScaleFactor(opts: { easting?: number; elevation?: number; latitude?: number; k0?: number }) {
  const R = earthRadii(opts.latitude || 0).gaussian;
  const k0 = opts.k0 || 0.9996;
  const Ep = (opts.easting != null ? opts.easting : 500000) - 500000;
  const k = k0 * (1 + (Ep * Ep) / (2 * R * R));
  const H = opts.elevation || 0;
  const elevFactor = R / (R + H);
  return { k, elevFactor, csf: k * elevFactor, R };
}

export function gridToGround(gridDist: number, csf: number): number {
  return csf !== 0 ? gridDist / csf : gridDist;
}

export function groundToGrid(groundDist: number, csf: number): number {
  return groundDist * csf;
}

// ---------------- Datum Transform (Bursa-Wolf 7-Parameter) ----------------
export interface Ellipsoid {
  name: string;
  a: number;
  invf: number;
}

export const ELLIPSOIDS: Record<string, Ellipsoid> = {
  wgs84: { name: 'WGS84', a: 6378137.0, invf: 298.257223563 },
  everestIndia: { name: 'Everest 1830 (India)', a: 6377276.345, invf: 300.8017 },
  everest1975: { name: 'Everest 1830 (1975 / Kalianpur)', a: 6377301.243, invf: 300.80174 }
};

export interface BursaWolfParams {
  dx: number;
  dy: number;
  dz: number;
  rx: number;
  ry: number;
  rz: number;
  s: number;
}

export const DEFAULT_BURSA_WOLF_7: BursaWolfParams = {
  dx: 282.0, dy: 726.0, dz: 254.0, rx: 0.0, ry: 0.0, rz: 0.0, s: 0.0
};

export function geodeticToEcef(latDeg: number, lonDeg: number, h: number, ell: Ellipsoid) {
  const a = ell.a, f = 1 / ell.invf, e2 = f * (2 - f);
  const la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180;
  const s = Math.sin(la), c = Math.cos(la);
  const N = a / Math.sqrt(1 - e2 * s * s);
  return {
    x: (N + h) * c * Math.cos(lo),
    y: (N + h) * c * Math.sin(lo),
    z: (N * (1 - e2) + h) * s
  };
}

export function ecefToGeodetic(x: number, y: number, z: number, ell: Ellipsoid) {
  const a = ell.a, f = 1 / ell.invf, e2 = f * (2 - f), b = a * (1 - f), ep2 = (a * a - b * b) / (b * b);
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y), th = Math.atan2(z * a, p * b);
  const st = Math.sin(th), ct = Math.cos(th);
  const lat = Math.atan2(z + ep2 * b * Math.pow(st, 3), p - e2 * a * Math.pow(ct, 3));
  const s = Math.sin(lat), N = a / Math.sqrt(1 - e2 * s * s);
  const h = p / Math.cos(lat) - N;
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI, h };
}

export function bursaWolf(x: number, y: number, z: number, p: BursaWolfParams, dir: number) {
  const asec = Math.PI / 180 / 3600;
  const rx = p.rx * asec * dir, ry = p.ry * asec * dir, rz = p.rz * asec * dir;
  const ds = 1 + p.s * 1e-6 * dir;
  const dx = p.dx * dir, dy = p.dy * dir, dz = p.dz * dir;
  return {
    x: dx + ds * (x - rz * y + ry * z),
    y: dy + ds * (rz * x + y - rx * z),
    z: dz + ds * (-ry * x + rx * y + z)
  };
}

export function datumTransform(latDeg: number, lonDeg: number, h: number, fromEll: Ellipsoid, toEll: Ellipsoid, p: BursaWolfParams) {
  h = h || 0;
  if (fromEll === toEll) return { lat: latDeg, lon: lonDeg, h };
  const toWgs = toEll === ELLIPSOIDS.wgs84;
  const ec = geodeticToEcef(latDeg, lonDeg, h, fromEll);
  const out = bursaWolf(ec.x, ec.y, ec.z, p, toWgs ? +1 : -1);
  return ecefToGeodetic(out.x, out.y, out.z, toEll);
}

// ---------------- 2D Helmert 4-Parameter Least-Squares ----------------
export interface ControlPointPair {
  x: number;
  y: number;
  X: number;
  Y: number;
}

export interface HelmertResult {
  a: number;
  b: number;
  tx: number;
  ty: number;
  scale: number;
  rotDeg: number;
  res: number[];
  rms: number;
  maxRes: number;
  n: number;
  redundancy: FitRedundancy;
}

export function helmertFit(ctrl: ControlPointPair[]): HelmertResult {
  if (!ctrl || ctrl.length < 2) throw new Error('Need at least 2 control points');
  const n = ctrl.length;
  let Sx = 0, Sy = 0, SX = 0, SY = 0;
  for (let i = 0; i < n; i++) {
    Sx += ctrl[i].x; Sy += ctrl[i].y; SX += ctrl[i].X; SY += ctrl[i].Y;
  }
  const meanx = Sx / n, meany = Sy / n, meanX = SX / n, meanY = SY / n;
  let num_a = 0, num_b = 0, den = 0;
  for (let j = 0; j < n; j++) {
    const dx = ctrl[j].x - meanx, dy = ctrl[j].y - meany;
    const dX = ctrl[j].X - meanX, dY = ctrl[j].Y - meanY;
    num_a += dx * dX + dy * dY;
    num_b += dx * dY - dy * dX;
    den += dx * dx + dy * dy;
  }
  if (den === 0) throw new Error('Control points are coincident');
  const a = num_a / den, b = num_b / den;
  const tx = meanX - (a * meanx - b * meany);
  const ty = meanY - (b * meanx + a * meany);
  const scale = Math.hypot(a, b), rotDeg = Math.atan2(b, a) * 180 / Math.PI;
  
  const res: number[] = [];
  let rms = 0, maxr = 0;
  for (let k = 0; k < n; k++) {
    const Xp = a * ctrl[k].x - b * ctrl[k].y + tx;
    const Yp = b * ctrl[k].x + a * ctrl[k].y + ty;
    const r = Math.hypot(Xp - ctrl[k].X, Yp - ctrl[k].Y);
    res.push(r);
    rms += r * r;
    if (r > maxr) maxr = r;
  }
  rms = Math.sqrt(rms / n);
  return { a, b, tx, ty, scale, rotDeg, res, rms, maxRes: maxr, n, redundancy: fitRedundancy(n, 4) };
}

/**
 * Degrees of freedom in a least-squares fit, and whether its residuals can
 * mean anything.
 *
 * Each control point contributes two equations (easting and northing). A fit
 * solving `params` unknowns therefore has `2n - params` degrees of freedom.
 * At zero the fit passes exactly through every point and the residuals are
 * identically zero **whatever the control points say** — there is no spare
 * observation left to disagree with them.
 *
 * That matters because the residual is the only thing telling a surveyor
 * whether a georeference is any good. Measured on the four-parameter Helmert
 * fit: two control points, one of them mis-keyed by 50 m, reports an RMS of
 * 0.000 m and quietly absorbs the error into a 6.25% scale change. The same
 * error with three points reports 14.4 m. A "perfect" fit at the minimum
 * point count is not evidence of a good georeference; it is evidence of
 * having no evidence.
 */
export interface FitRedundancy {
  /** Control points used. */
  n: number;
  /** 2n - unknowns. Zero means the residuals cannot detect an error. */
  degreesOfFreedom: number;
  /** False when the fit is exactly determined, so residuals are structurally zero. */
  residualsAreMeaningful: boolean;
  /** Plain wording for the screen, or null when there is redundancy to report. */
  caution: string | null;
}

export function fitRedundancy(n: number, unknowns: number): FitRedundancy {
  const degreesOfFreedom = 2 * n - unknowns;
  const meaningful = degreesOfFreedom > 0;
  const minimum = Math.ceil(unknowns / 2);
  return {
    n,
    degreesOfFreedom,
    residualsAreMeaningful: meaningful,
    caution: meaningful
      ? null
      : `${n} control points fit this transform exactly, so the residual is 0 by construction ` +
        `and cannot show an error in them. Add a ${minimum + 1}${minimum + 1 === 3 ? 'rd' : 'th'} ` +
        `point to make the residual mean something.`
  };
}

/**
 * Six-parameter affine fit from image pixels to ground coordinates.
 *
 * Least squares over the normal equations, the same arithmetic the cadastral
 * digitiser used inline. It lives here so it can be tested, and so the
 * redundancy of the fit is reported beside its RMSE rather than left to be
 * inferred from the point count.
 */
export interface AffineFitResult {
  a: number; b: number; tx: number;
  c: number; d: number; ty: number;
  /** Root mean square residual, in ground units. */
  rmse: number;
  /** Residual per control point, in ground units. */
  res: number[];
  redundancy: FitRedundancy;
}

export function affineFit(
  pts: { pixelX: number; pixelY: number; E: number; N: number }[]
): AffineFitResult | null {
  const n = pts.length;
  if (n < 3) return null;

  let sumX = 0, sumY = 0, sumE = 0, sumN = 0;
  let sumXX = 0, sumYY = 0, sumXY = 0;
  let sumXE = 0, sumYE = 0, sumXN = 0, sumYN = 0;
  for (const g of pts) {
    sumX += g.pixelX; sumY += g.pixelY; sumE += g.E; sumN += g.N;
    sumXX += g.pixelX * g.pixelX;
    sumYY += g.pixelY * g.pixelY;
    sumXY += g.pixelX * g.pixelY;
    sumXE += g.pixelX * g.E; sumYE += g.pixelY * g.E;
    sumXN += g.pixelX * g.N; sumYN += g.pixelY * g.N;
  }

  const det =
    n * (sumXX * sumYY - sumXY * sumXY) -
    sumX * (sumX * sumYY - sumY * sumXY) +
    sumY * (sumX * sumXY - sumY * sumXX);
  if (Math.abs(det) < 1e-9) return null;

  const solve3x3 = (r1: number, r2: number, r3: number) => {
    const d1 = r1 * (sumYY * n - sumY * sumY) - sumXY * (r2 * n - sumY * r3) + sumX * (r2 * sumY - sumYY * r3);
    const d2 = sumXX * (r2 * n - sumY * r3) - r1 * (sumXY * n - sumX * sumY) + sumX * (sumXY * r3 - sumX * r2);
    const d3 = sumXX * (sumYY * r3 - r2 * sumY) - sumXY * (sumXY * r3 - r1 * sumY) + sumX * (sumXY * r2 - sumYY * r1);
    return [d1 / det, d2 / det, d3 / det];
  };

  const [a, b, tx] = solve3x3(sumXE, sumYE, sumE);
  const [c, d, ty] = solve3x3(sumXN, sumYN, sumN);

  const res: number[] = [];
  let errSqSum = 0;
  for (const g of pts) {
    const dE = a * g.pixelX + b * g.pixelY + tx - g.E;
    const dN = c * g.pixelX + d * g.pixelY + ty - g.N;
    const r = Math.hypot(dE, dN);
    res.push(r);
    errSqSum += dE * dE + dN * dN;
  }

  return { a, b, tx, c, d, ty, rmse: Math.sqrt(errSqSum / n), res, redundancy: fitRedundancy(n, 6) };
}

export function helmertApply(p: { a: number; b: number; tx: number; ty: number }, x: number, y: number) {
  return { X: p.a * x - p.b * y + p.tx, Y: p.b * x + p.a * y + p.ty };
}

// ---------------- Indian Grid (LCC 1SP) ----------------
export interface IndianGridZone {
  epsg: number;
  name: string;
  lat0: number;
  lon0: number;
  a: number;
  invf: number;
  k0: number;
  fe: number;
  fn: number;
}

export const INDIAN_GRID_ZONES: IndianGridZone[] = [
  { epsg: 24378, name: 'India zone I (Kalianpur 1975)', lat0: 32.5, lon0: 68, a: 6377299.151, invf: 300.8017255, k0: 0.99878641, fe: 2743195.5, fn: 914398.5 },
  { epsg: 24379, name: 'India zone IIa (Kalianpur 1975)', lat0: 26, lon0: 74, a: 6377299.151, invf: 300.8017255, k0: 0.99878641, fe: 2743195.5, fn: 914398.5 },
  { epsg: 24380, name: 'India zone IIb (Kalianpur 1975)', lat0: 26, lon0: 90, a: 6377299.151, invf: 300.8017255, k0: 0.99878641, fe: 2743195.5, fn: 914398.5 },
  { epsg: 24381, name: 'India zone IIIa (Kalianpur 1975)', lat0: 19, lon0: 80, a: 6377299.151, invf: 300.8017255, k0: 0.99878641, fe: 2743195.5, fn: 914398.5 },
  { epsg: 24383, name: 'India zone IVa (Kalianpur 1975)', lat0: 12, lon0: 80, a: 6377299.151, invf: 300.8017255, k0: 0.99878641, fe: 2743195.5, fn: 914398.5 },
  { epsg: 24376, name: 'India zone I (Kalianpur 1962)', lat0: 32.5, lon0: 68, a: 6377301.243, invf: 300.8017255, k0: 0.99878641, fe: 2743196.4, fn: 914398.8 },
  { epsg: 24377, name: 'India zone IIa (Kalianpur 1962)', lat0: 26, lon0: 74, a: 6377301.243, invf: 300.8017255, k0: 0.99878641, fe: 2743196.4, fn: 914398.8 },
  { epsg: 24375, name: 'India zone IIb (Kalianpur 1937)', lat0: 26, lon0: 90, a: 6377276.345, invf: 300.8017, k0: 0.99878641, fe: 2743185.69, fn: 914395.23 }
];

export function getIndianZone(epsg: number | string): IndianGridZone | undefined {
  return INDIAN_GRID_ZONES.find(z => String(z.epsg) === String(epsg));
}

function lccConst(z: IndianGridZone) {
  const f = 1 / z.invf, e2 = f * (2 - f), e = Math.sqrt(e2);
  const p0 = z.lat0 * Math.PI / 180;
  const t = (p: number) => {
    const s = Math.sin(p);
    return Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - e * s) / (1 + e * s), e / 2);
  };
  const m = (p: number) => Math.cos(p) / Math.sqrt(1 - e2 * Math.pow(Math.sin(p), 2));
  const n = Math.sin(p0);
  const F = m(p0) / (n * Math.pow(t(p0), n));
  return { e, e2, n, F, t, rho0: z.a * z.k0 * F * Math.pow(t(p0), n) };
}

export function indianGridFwd(lon: number, lat: number, z: IndianGridZone) {
  const C = lccConst(z);
  const rho = z.a * z.k0 * C.F * Math.pow(C.t(lat * Math.PI / 180), C.n);
  const th = C.n * (lon - z.lon0) * Math.PI / 180;
  return { E: z.fe + rho * Math.sin(th), N: z.fn + C.rho0 - rho * Math.cos(th) };
}

export function indianGridInv(E: number, N: number, z: IndianGridZone) {
  const C = lccConst(z);
  const dx = E - z.fe, dy = C.rho0 - (N - z.fn);
  const sgn = C.n < 0 ? -1 : 1;
  const rho = sgn * Math.sqrt(dx * dx + dy * dy);
  const th = Math.atan2(sgn * dx, sgn * dy);
  const tv = Math.pow(rho / (z.a * z.k0 * C.F), 1 / C.n);
  let lat = Math.PI / 2 - 2 * Math.atan(tv);
  for (let i = 0; i < 12; i++) {
    const s = Math.sin(lat);
    const next = Math.PI / 2 - 2 * Math.atan(tv * Math.pow((1 - C.e * s) / (1 + C.e * s), C.e / 2));
    if (Math.abs(next - lat) < 1e-13) { lat = next; break; }
    lat = next;
  }
  return { lon: z.lon0 + th / C.n * 180 / Math.PI, lat: lat * 180 / Math.PI };
}

// ---------------- Volumetrics, Traverse & Geometry Helpers ----------------
export function shoelaceXY(pts: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

export function pointInPoly(x: number, y: number, v: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const xi = v[i].x, yi = v[i].y, xj = v[j].x, yj = v[j].y;
    const dy = yj - yi || 1e-12;
    const inter = (yi > y !== (yj > y)) && (x < (xj - xi) * (y - yi) / dy + xi);
    if (inter) inside = !inside;
  }
  return inside;
}

export function segsCross(p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }, p4: { x: number; y: number }): boolean {
  const o = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
    const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return Math.abs(v) < 1e-9 ? 0 : v > 0 ? 1 : -1;
  };
  const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
  return (d1 > 0 && d2 < 0 || d1 < 0 && d2 > 0) && (d3 > 0 && d4 < 0 || d3 < 0 && d4 > 0);
}

export function selfIntersects(v: { x: number; y: number }[]): boolean {
  const n = v.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (i === j) continue;
      if (j === i + 1 || i === 0 && j === n - 1) continue;
      if (segsCross(v[i], v[(i + 1) % n], v[j], v[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function ringsOverlap(A: { x: number; y: number }[], B: { x: number; y: number }[]): boolean {
  if (!A || !B || A.length < 3 || B.length < 3) return false;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      if (segsCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
    }
  }
  return pointInPoly(A[0].x, A[0].y, B) || pointInPoly(B[0].x, B[0].y, A);
}

// ---------------- Miter-Clamped Boundary Offsetting ----------------
/**
 * Offset a closed polygon given in projected metres (UTM easting/northing).
 *
 * `dist` is a magnitude and `outward` chooses the side. The direction is taken
 * from the ring's own signed area rather than assumed, so a boundary digitised
 * clockwise offsets the same way as one digitised counter-clockwise -- the
 * surveyor's digitising order is not a statement about which side the barrier
 * goes on.
 *
 * A sharp outer corner is bevelled rather than mitred, because the mitre point
 * of a narrow corner runs away to many times the offset distance. Returns null
 * for a distance that is not a positive number, for a ring of fewer than three
 * distinct points, and for an offset that has consumed the parcel -- whether it
 * folds through itself or turns inside out. An inward belt that has eaten the
 * parcel is not a belt, and reporting an area for it would be reporting a
 * fiction. A negative distance is refused rather than read as the opposite
 * side, because the side is `outward`'s to state, not a minus sign's.
 */
export function offsetPolygonEN(
  pts: { E: number; N: number }[],
  dist: number,
  outward: boolean
): { E: number; N: number }[] | null {
  if (!Number.isFinite(dist) || dist <= 0) return null;
  const v = pts.map(p => ({ x: p.E, y: p.N }));
  if (v.length > 1) {
    const a = v[0], b = v[v.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) v.pop();
  }
  const n = v.length;
  if (n < 3) return null;

  let sArea = 0;
  for (let i = 0; i < n; i++) {
    const a = v[i], b = v[(i + 1) % n];
    sArea += a.x * b.y - b.x * a.y;
  }
  const ccw = sArea > 0;
  const s = (outward ? 1 : -1) * (ccw ? 1 : -1);
  const MAX = 2.0;
  const out: { x: number; y: number }[] = [];

  for (let i = 0; i < n; i++) {
    const p0 = v[(i - 1 + n) % n], p1 = v[i], p2 = v[(i + 1) % n];
    let a = { x: p1.x - p0.x, y: p1.y - p0.y }, b = { x: p2.x - p1.x, y: p2.y - p1.y };
    const la = Math.hypot(a.x, a.y) || 1, lb = Math.hypot(b.x, b.y) || 1;
    a = { x: a.x / la, y: a.y / la };
    b = { x: b.x / lb, y: b.y / lb };

    const na = { x: a.y, y: -a.x }, nb = { x: b.y, y: -b.x };
    let mx = na.x + nb.x, my = na.y + nb.y;
    const ml = Math.hypot(mx, my);

    if (ml < 1e-6) {
      out.push({ x: p1.x + s * na.x * dist, y: p1.y + s * na.y * dist });
      out.push({ x: p1.x + s * nb.x * dist, y: p1.y + s * nb.y * dist });
      continue;
    }
    mx /= ml; my /= ml;
    const cosHalf = na.x * mx + na.y * my;
    const miter = dist / Math.max(Math.abs(cosHalf), 1e-6);
    const cross = a.x * b.y - a.y * b.x;
    const isOuter = cross * s > 0;

    if (isOuter && miter > MAX * dist) {
      out.push({ x: p1.x + s * na.x * dist, y: p1.y + s * na.y * dist });
      out.push({ x: p1.x + s * nb.x * dist, y: p1.y + s * nb.y * dist });
    } else {
      out.push({ x: p1.x + s * mx * miter, y: p1.y + s * my * miter });
    }
  }

  if (out.length < 3 || selfIntersects(out)) return null;

  // Hold the result to the definition of an offset: every vertex must stand at
  // least `dist` from the original boundary. Once an inward belt is wider than
  // the parcel is narrow, each edge crosses the one opposite and the result
  // comes out the other side -- and it does so as a *simple* polygon with the
  // ring's original orientation intact, so neither selfIntersects nor a signed
  // area can see it. What gives it away is that the survivors sit closer to
  // the boundary than the belt they claim to be. Without this check a 100 m
  // block asked for a 90 m inward barrier returns a tidy 6400 m2 of "net
  // exploitable area" where the honest answer is that nothing is left, and the
  // reported figure grows as the barrier widens.
  const tol = 1e-6 * Math.max(1, dist);
  for (const q of out) {
    let near = Infinity;
    for (let i = 0; i < n; i++) {
      const a = v[i], b = v[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2));
      const d = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
      if (d < near) near = d;
    }
    if (near < dist - tol) return null;
  }

  // Collapse vertices that have met, and refuse what is left if it is no
  // longer a polygon. At exactly half the width of a parcel an inward belt
  // brings every corner to the same point: four coincident vertices enclosing
  // nothing, which passes the distance check because each one really is `dist`
  // from the boundary. It is still not a belt, and exporting it would put a
  // degenerate ring into a KML or DXF.
  const ring: { x: number; y: number }[] = [];
  for (const q of out) {
    if (!ring.some(r => Math.hypot(r.x - q.x, r.y - q.y) <= tol)) ring.push(q);
  }
  if (ring.length < 3) return null;

  return ring.map(u => ({ E: u.x, N: u.y }));
}

export function boundaryOffset(ll: LatLon[], dist: number, outward: boolean, zone: number, south: boolean): LatLon[] | null {
  const en = ll.map(p => {
    const u = lonLatToUtm(p.lon, p.lat, zone, south);
    return { E: u.E, N: u.N };
  });
  const off = offsetPolygonEN(en, dist, outward);
  if (!off) return null;
  const llo = off.map(u => {
    const g = utmToLonLat(u.E, u.N, zone, south);
    return { lon: g.lon, lat: g.lat };
  });
  llo.push({ lon: llo[0].lon, lat: llo[0].lat });
  return llo;
}

// ---------------- True Interior Label Point (Point-on-Surface) ----------------
export function labelPointOnSurface(ll: LatLon[]): LatLon {
  const pts = ll.slice();
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a.lon - b.lon) < 1e-12 && Math.abs(a.lat - b.lat) < 1e-12) pts.pop();
  }
  const n = pts.length;
  if (n === 0) return { lon: 0, lat: 0 };
  if (n < 3) {
    let sx = 0, sy = 0;
    for (let t = 0; t < n; t++) { sx += pts[t].lon; sy += pts[t].lat; }
    return { lon: sx / n, lat: sy / n };
  }
  
  let A = 0, cx = 0, cy = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i].lon, yi = pts[i].lat, xj = pts[j].lon, yj = pts[j].lat;
    const cr = xj * yi - xi * yj;
    A += cr;
    cx += (xi + xj) * cr;
    cy += (yi + yj) * cr;
  }
  A /= 2;
  const C = Math.abs(A) > 1e-16 ? { lon: cx / (6 * A), lat: cy / (6 * A) } : { lon: pts[0].lon, lat: pts[0].lat };
  
  const polyCoords = pts.map(p => ({ x: p.lon, y: p.lat }));
  if (pointInPoly(C.lon, C.lat, polyCoords)) return C;
  
  // Scanline fallback
  const y = C.lat, xs: number[] = [];
  for (let p = 0, q = n - 1; p < n; q = p++) {
    const yp = pts[p].lat, yq = pts[q].lat, xp = pts[p].lon, xq = pts[q].lon;
    if (yp > y !== (yq > y)) {
      xs.push((xq - xp) * (y - yp) / (yq - yp || 1e-12) + xp);
    }
  }
  xs.sort((m, n2) => m - n2);
  if (xs.length >= 2) {
    let bestW = -1;
    let bestMid: number | null = null;
    for (let s = 0; s + 1 < xs.length; s += 2) {
      const w = xs[s + 1] - xs[s];
      if (w > bestW) { bestW = w; bestMid = (xs[s] + xs[s + 1]) / 2; }
    }
    if (bestMid != null) return { lon: bestMid, lat: y };
  }
  return C;
}

// ---------------- DTM Grid Volume ----------------
export function dtmGridVolume(pts: { x: number; y: number; z: number }[], refRL: number, customSpacing?: number) {
  if (!pts || pts.length === 0) throw new Error('No surface points provided');
  let sp = customSpacing;
  if (!sp || sp <= 0) {
    const ds: number[] = [];
    const lim = Math.min(pts.length, 300);
    for (let i = 0; i < lim; i++) {
      let best = Infinity;
      for (let j = 0; j < lim; j++) {
        if (i === j) continue;
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d > 1e-6 && d < best) best = d;
      }
      if (isFinite(best)) ds.push(best);
    }
    ds.sort((a, b) => a - b);
    sp = ds.length ? ds[Math.floor(ds.length / 2)] : 5.0;
  }
  const cell = sp * sp;
  let cut = 0, fill = 0;
  for (let i = 0; i < pts.length; i++) {
    const dz = pts[i].z - refRL;
    if (dz >= 0) cut += dz * cell;
    else fill += (-dz) * cell;
  }
  return { spacing: sp, cell, cut, fill, net: cut - fill, count: pts.length };
}

// ---------------- Average-End-Area ----------------
export function avgEndArea(sections: { chainage: number; area: number }[]) {
  let vol = 0, cut = 0, fill = 0;
  for (let i = 0; i < sections.length - 1; i++) {
    const a1 = sections[i].area, a2 = sections[i + 1].area;
    const L = Math.abs(sections[i + 1].chainage - sections[i].chainage);
    const v = (a1 + a2) / 2 * L;
    vol += v;
    if (a1 + a2 >= 0) cut += v;
    else fill += v;
  }
  return { volume: vol, cut, fill };
}

// ---------------- Polar / Radiation ----------------
export function radiationPoint(E0: number, N0: number, bearingDeg: number, dist: number) {
  const b = bearingDeg * Math.PI / 180;
  return { E: E0 + dist * Math.sin(b), N: N0 + dist * Math.cos(b) };
}

// ---------------- Polygon Area & Perimeter ----------------
export function polygonArea(pts: { x: number; y: number }[]): number {
  return shoelaceXY(pts);
}

export function polygonPerimeter(pts: { x: number; y: number }[]): number {
  if (!pts || pts.length < 2) return 0;
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

export function polygonAreaPerimeter(pts: { E: number; N: number }[]) {
  if (!pts || pts.length < 3) return { areaM2: 0, areaHa: 0, areaAcres: 0, perimM: 0 };
  const xy = pts.map(p => ({ x: p.E, y: p.N }));
  const areaM2 = shoelaceXY(xy);
  const perimM = polygonPerimeter(xy);
  return {
    areaM2,
    areaHa: areaM2 / 10000,
    areaAcres: areaM2 * 0.000247105381467,
    perimM
  };
}

// ---------------- Regional Land Area Formatter ----------------
export function formatAreaAllUnits(
  areaM2: number,
  _preset?: string,
  customBigha?: number,
  customKatha?: number
): string {
  const ha = areaM2 / 10000;
  const acres = areaM2 * 0.000247105381467;
  const sqft = areaM2 * 10.7639104;
  const bigha = customBigha && customBigha > 0 ? sqft / customBigha : sqft / 27225; // Standard 27,225 sq ft
  const katha = customKatha && customKatha > 0 ? sqft / customKatha : (bigha - Math.floor(bigha)) * 20;

  return `${ha.toFixed(4)} ha | ${acres.toFixed(4)} acres | ${areaM2.toFixed(1)} m² (${Math.floor(bigha)} Bigha ${katha.toFixed(1)} Katha)`;
}

export function formatAreaRegional(areaM2: number, state?: string): string {
  return formatAreaAllUnits(areaM2, state);
}

// ---------------- Traverse (Bowditch Rule) ----------------
export interface TraverseLeg {
  name?: string;
  id?: string;
  dist: number;
  brg?: number;
  bearingDeg?: number;
}

export function bowditchBalance(
  arg1: number | any[],
  arg2: number | any,
  arg3?: any
) {

  let startE = 0;
  let startN = 0;
  let rawLegs: any[] = [];

  if (typeof arg1 === 'number' && typeof arg2 === 'number') {
    startE = arg1;
    startN = arg2;
    rawLegs = Array.isArray(arg3) ? arg3 : [];
  } else if (Array.isArray(arg1)) {
    rawLegs = arg1;
    startE = typeof arg2 === 'number' ? arg2 : 500000;
    startN = typeof arg3 === 'number' ? arg3 : 2000000;
  }

  const legs = rawLegs.map(l => ({
    name: l.name || l.id || 'Leg',
    dist: Number(l.dist) || 0,
    bearingDeg: Number(l.bearingDeg != null ? l.bearingDeg : l.brg) || 0
  }));

  if (!legs || !legs.length) {
    return {
      coords: [{ E: startE, N: startN }],
      misclosureE: 0,
      misclosureN: 0,
      linearMisclosure: 0,
      totalLength: 0,
      precision: '1 : ∞',
      legs: []
    };
  }

  let totalDist = 0;
  const unadjDeltas: { name: string; dE: number; dN: number; dist: number }[] = [];
  let sumDE = 0, sumDN = 0;

  for (const leg of legs) {
    const rad = leg.bearingDeg * Math.PI / 180;
    const dE = leg.dist * Math.sin(rad);
    const dN = leg.dist * Math.cos(rad);
    totalDist += leg.dist;
    sumDE += dE;
    sumDN += dN;
    unadjDeltas.push({ name: leg.name, dE, dN, dist: leg.dist });
  }

  const misclosureE = sumDE;
  const misclosureN = sumDN;
  const linearMisclosure = Math.hypot(misclosureE, misclosureN);
  const precisionFrac = linearMisclosure > 0 ? Math.round(totalDist / linearMisclosure) : Infinity;

  let curE = startE, curN = startN;
  const coords = [{ E: curE, N: curN }];
  const legResults: {
    name: string;
    dE: number;
    dN: number;
    corrE: number;
    corrN: number;
    adjDE: number;
    adjDN: number;
    adjBearingDeg: number;
    adjDist: number;
    E: number;
    N: number;
  }[] = [];

  for (let i = 0; i < unadjDeltas.length; i++) {
    const d = unadjDeltas[i];
    const corrE = totalDist > 0 ? -(misclosureE * (d.dist / totalDist)) : 0;
    const corrN = totalDist > 0 ? -(misclosureN * (d.dist / totalDist)) : 0;
    const adjDE = d.dE + corrE;
    const adjDN = d.dN + corrN;
    curE += adjDE;
    curN += adjDN;
    coords.push({ E: curE, N: curN });
    legResults.push({
      name: d.name,
      dE: d.dE,
      dN: d.dN,
      corrE,
      corrN,
      adjDE,
      adjDN,
      adjBearingDeg: (Math.atan2(adjDE, adjDN) * 180 / Math.PI + 360) % 360,
      adjDist: Math.hypot(adjDE, adjDN),
      E: curE,
      N: curN
    });
  }

  return {
    coords,
    misclosureE,
    misclosureN,
    linearMisclosure,
    totalLength: totalDist,
    precision: `1 : ${precisionFrac.toLocaleString()}`,
    legs: legResults
  };
}

export function bowditchAdjust(legs: TraverseLeg[], startE?: number, startN?: number) {
  return bowditchBalance(legs, startE, startN);
}

// ---------------- Circular Horizontal Curve ----------------
export function circularCurve(R: number, deltaDeg: number, startStation: number = 0) {
  const deltaRad = deltaDeg * Math.PI / 180;
  const halfDelta = deltaRad / 2;
  const tangent = R * Math.tan(halfDelta);
  const length = R * deltaRad;
  const chord = 2 * R * Math.sin(halfDelta);
  const midOrd = R * (1 - Math.cos(halfDelta));
  const external = R * (1 / Math.cos(halfDelta) - 1);
  const degreeOfCurve = (5729.57795 / R);

  return {
    radius: R,
    deflectionDeg: deltaDeg,
    tangent,
    length,
    chord,
    midOrd,
    external,
    degreeOfCurve,
    stationBC: startStation,
    stationEC: startStation + length
  };
}


export function curveElements(R: number, deltaDeg: number) {
  return circularCurve(R, deltaDeg);
}

// ---------------- Bearing-Bearing Intersection ----------------
export function bearingBearingIntersection(
  e1: number,
  n1: number,
  b1Deg: number,
  e2: number,
  n2: number,
  b2Deg: number
) {
  const r1 = b1Deg * Math.PI / 180;
  const r2 = b2Deg * Math.PI / 180;
  const s1 = Math.sin(r1), c1 = Math.cos(r1);
  const s2 = Math.sin(r2), c2 = Math.cos(r2);

  const denom = s1 * c2 - c1 * s2;
  if (Math.abs(denom) < 1e-7) {
    throw new Error('Bearings are parallel or anti-parallel (no unique intersection)');
  }

  const dE = e2 - e1, dN = n2 - n1;
  const t1 = (dE * c2 - dN * s2) / denom;
  const t2 = (dE * c1 - dN * s1) / denom;

  return {
    E: e1 + t1 * s1,
    N: n1 + t1 * c1,
    dist1: t1,
    dist2: t2
  };
}

export function twoBearingIntersection(
  e1: number,
  n1: number,
  b1Deg: number,
  e2: number,
  n2: number,
  b2Deg: number
) {
  return bearingBearingIntersection(e1, n1, b1Deg, e2, n2, b2Deg);
}

// ---------------- Differential Leveling (HI & Rise/Fall) ----------------
export interface LevelingRow {
  stn: string;
  bs?: number; // Backsight
  is?: number; // Intermediate sight
  fs?: number; // Foresight
  dist?: number;
  remarks?: string;
}

export interface LevelingResultRow {
  stn: string;
  bs?: number;
  is?: number;
  fs?: number;
  hi?: number;
  rise?: number;
  fall?: number;
  rl: number;
  remarks: string;
}

export function computeDifferentialLeveling(
  initialRL: number,
  rows: LevelingRow[],
  method: 'hi' | 'rise_fall' = 'hi'
) {
  const result: LevelingResultRow[] = [];
  let currentRL = initialRL;
  let currentHI = initialRL + (rows[0]?.bs || 0);

  let sumBS = 0;
  let sumFS = 0;
  let sumRise = 0;
  let sumFall = 0;
  let prevSight = rows[0]?.bs || 0;

  rows.forEach((r, idx) => {
    let rise: number | undefined;
    let fall: number | undefined;
    let hi: number | undefined;

    if (idx === 0) {
      if (r.bs != null) {
        sumBS += r.bs;
        currentHI = initialRL + r.bs;
        hi = currentHI;
      }
      result.push({
        stn: r.stn || `BM-${idx + 1}`,
        bs: r.bs,
        is: r.is,
        fs: r.fs,
        hi,
        rl: initialRL,
        remarks: r.remarks || 'Benchmark (Initial BM)'
      });
      prevSight = r.bs || 0;
      return;
    }

    const currentSight = r.is != null ? r.is : (r.fs != null ? r.fs : 0);

    // Rise / Fall calculation
    const diff = prevSight - currentSight;
    if (diff > 0) {
      rise = diff;
      sumRise += rise;
      currentRL += rise;
    } else if (diff < 0) {
      fall = Math.abs(diff);
      sumFall += fall;
      currentRL -= fall;
    }

    if (r.fs != null) {
      sumFS += r.fs;
      currentRL = currentHI - r.fs;
      if (r.bs != null) {
        sumBS += r.bs;
        currentHI = currentRL + r.bs;
        hi = currentHI;
        prevSight = r.bs;
      } else {
        prevSight = r.fs;
      }
    } else if (r.is != null) {
      currentRL = currentHI - r.is;
      prevSight = r.is;
      hi = currentHI;
    }

    result.push({
      stn: r.stn || `STN-${idx + 1}`,
      bs: r.bs,
      is: r.is,
      fs: r.fs,
      hi,
      rise,
      fall,
      rl: currentRL,
      remarks: r.remarks || (r.fs != null && r.bs != null ? 'Change Point (CP)' : '')
    });
  });

  const check1 = sumBS - sumFS;
  const check2 = sumRise - sumFall;
  const lastRL = result[result.length - 1]?.rl || initialRL;
  const check3 = lastRL - initialRL;

  return {
    rows: result,
    sumBS,
    sumFS,
    sumRise,
    sumFall,
    initialRL,
    lastRL,
    checkPassed: Math.abs(check1 - check3) < 0.001,
    diffCheck: check1 - check3
  };
}

// ---------------- Geological 3-Point Dip & Strike Solver ----------------
export interface DipStrikeResult {
  strikeDeg: number;
  strikeQuadrant: string;
  dipDeg: number;
  dipDirectionDeg: number;
  dipDirectionQuadrant: string;
  strikeDirectionStr: string;
}

export function solve3PointDipStrike(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number },
  p3: { x: number; y: number; z: number },
  apparentDirDeg?: number
): DipStrikeResult & { apparentDipDeg?: number } {
  // Vector v1 = p2 - p1, Vector v2 = p3 - p1
  const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
  const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };

  // Normal vector N = v1 x v2 = (A, B, C)
  let A = v1.y * v2.z - v1.z * v2.y;
  let B = v1.z * v2.x - v1.x * v2.z;
  let C = v1.x * v2.y - v1.y * v2.x;

  // Ensure C is positive so normal points upward
  if (C < 0) {
    A = -A;
    B = -B;
    C = -C;
  }

  const normH = Math.hypot(A, B);
  if (normH < 1e-9) {
    return {
      strikeDeg: 0,
      strikeQuadrant: 'Horizontal Plane',
      dipDeg: 0,
      dipDirectionDeg: 0,
      dipDirectionQuadrant: 'N/A',
      strikeDirectionStr: '0° - 180°'
    };
  }

  // True dip angle
  const dipRad = Math.atan(normH / C);
  const dipDeg = dipRad * 180 / Math.PI;

  // Dip direction (direction of maximum downward gradient = direction of [-A, -B])
  let dipDirRad = Math.atan2(-A, -B);
  let dipDirDeg = (dipDirRad * 180 / Math.PI + 360) % 360;

  // Strike direction (perpendicular to dip direction)
  let strike1 = (dipDirDeg - 90 + 360) % 360;
  let strike2 = (dipDirDeg + 90) % 360;
  const primaryStrike = Math.min(strike1, strike2);

  const toQuadrant = (az: number) => {
    if (az >= 0 && az <= 90) return `N ${az.toFixed(1)}° E`;
    if (az > 90 && az <= 180) return `S ${(180 - az).toFixed(1)}° E`;
    if (az > 180 && az <= 270) return `S ${(az - 180).toFixed(1)}° W`;
    return `N ${(360 - az).toFixed(1)}° W`;
  };

  let apparentDipDeg: number | undefined;
  if (apparentDirDeg != null) {
    const alpha = Math.abs(apparentDirDeg - dipDirDeg) * Math.PI / 180;
    apparentDipDeg = Math.atan(Math.tan(dipRad) * Math.cos(alpha)) * 180 / Math.PI;
  }

  return {
    strikeDeg: primaryStrike,
    strikeQuadrant: toQuadrant(primaryStrike),
    dipDeg,
    dipDirectionDeg: dipDirDeg,
    dipDirectionQuadrant: toQuadrant(dipDirDeg),
    strikeDirectionStr: `${primaryStrike.toFixed(1)}° - ${(primaryStrike + 180).toFixed(1)}°`,
    apparentDipDeg
  };
}

// ---------------- Earthwork & Stockpile Volume ----------------
export interface VolumeSection {
  station: number;
  area: number;
  cutArea?: number;
  fillArea?: number;
}

export function computeEndAreaVolume(sections: VolumeSection[]) {
  if (sections.length < 2) {
    return { totalVolume: 0, cutVolume: 0, fillVolume: 0, segments: [] };
  }

  const sorted = [...sections].sort((a, b) => a.station - b.station);
  let totalVolume = 0;
  let cutVolume = 0;
  let fillVolume = 0;
  const segments: {
    fromStation: number;
    toStation: number;
    distance: number;
    endAreaVol: number;
    prismoidalVol: number;
    cutVol: number;
    fillVol: number;
  }[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const s1 = sorted[i];
    const s2 = sorted[i + 1];
    const dist = s2.station - s1.station;
    const avgArea = (s1.area + s2.area) / 2;
    const vol = avgArea * dist;
    totalVolume += vol;

    const cutV = ((s1.cutArea || 0) + (s2.cutArea || 0)) / 2 * dist;
    const fillV = ((s1.fillArea || 0) + (s2.fillArea || 0)) / 2 * dist;
    cutVolume += cutV;
    fillVolume += fillV;

    // Prismoidal estimation
    const prismoidalVol = (dist / 6) * (s1.area + 4 * Math.sqrt(s1.area * s2.area) + s2.area);

    segments.push({
      fromStation: s1.station,
      toStation: s2.station,
      distance: dist,
      endAreaVol: vol,
      prismoidalVol,
      cutVol: cutV,
      fillVol: fillV
    });
  }

  return {
    totalVolume,
    cutVolume,
    fillVolume,
    segments
  };
}

// ---------------- Tienstra 3-Point Resection ----------------
export function solveTienstraResection(
  A: { E: number; N: number },
  B: { E: number; N: number },
  C: { E: number; N: number },
  alphaDeg: number, // Angle observed between B and C at P (subtends BC)
  betaDeg: number,  // Angle observed between C and A at P (subtends CA)
  gammaDeg: number  // Angle observed between A and B at P (subtends AB)
) {
  const alpha = alphaDeg * Math.PI / 180;
  const beta = betaDeg * Math.PI / 180;
  const gamma = gammaDeg * Math.PI / 180;

  // Angles of triangle ABC
  const aLen = Math.hypot(B.E - C.E, B.N - C.N);
  const bLen = Math.hypot(C.E - A.E, C.N - A.N);
  const cLen = Math.hypot(A.E - B.E, A.N - B.N);

  const angleA = Math.acos((bLen * bLen + cLen * cLen - aLen * aLen) / (2 * bLen * cLen));
  const angleB = Math.acos((aLen * aLen + cLen * cLen - bLen * bLen) / (2 * aLen * cLen));
  const angleC = Math.acos((aLen * aLen + bLen * bLen - cLen * cLen) / (2 * aLen * bLen));

  const cot = (x: number) => 1 / Math.tan(x);

  const wA = 1 / (cot(angleA) - cot(alpha));
  const wB = 1 / (cot(angleB) - cot(beta));
  const wC = 1 / (cot(angleC) - cot(gamma));

  const wSum = wA + wB + wC;
  if (Math.abs(wSum) < 1e-9) {
    throw new Error('Point lies on the danger circle (indeterminate resection)');
  }

  const pE = (wA * A.E + wB * B.E + wC * C.E) / wSum;
  const pN = (wA * A.N + wB * B.N + wC * C.N) / wSum;

  return {
    E: pE,
    N: pN,
    distA: Math.hypot(pE - A.E, pN - A.N),
    distB: Math.hypot(pE - B.E, pN - B.N),
    distC: Math.hypot(pE - C.E, pN - C.N)
  };
}

// ---------------- Open Location Code (Plus Code) Generator ----------------
const OLC_ALPHABET = '23456789CFGHJMPQRVWX';

export function encodePlusCode(latitude: number, longitude: number, codeLength: number = 10): string {
  // Normalize lat & lon
  let lat = Math.min(90, Math.max(-90, latitude));
  let lon = longitude;
  while (lon < -180) lon += 360;
  while (lon >= 180) lon -= 360;

  if (lat === 90) {
    lat = lat - 1e-10;
  }

  // Shift to positive values
  let latVal = lat + 90;
  let lonVal = lon + 180;

  let code = '';
  // First pair (resolution: 20 deg)
  let latDigit = Math.floor(latVal / 20);
  let lonDigit = Math.floor(lonVal / 20);
  latVal -= latDigit * 20;
  lonVal -= lonDigit * 20;
  code += OLC_ALPHABET[latDigit] + OLC_ALPHABET[lonDigit];

  // Subsequent pairs (1 deg, 0.05 deg, 0.0025 deg, 0.000125 deg)
  const steps = [1, 0.05, 0.0025, 0.000125];
  for (let i = 0; i < steps.length && code.length < codeLength; i++) {
    const step = steps[i];
    latDigit = Math.floor(latVal / step);
    lonDigit = Math.floor(lonVal / step);
    latVal -= latDigit * step;
    lonVal -= lonDigit * step;
    code += OLC_ALPHABET[Math.min(19, Math.max(0, latDigit))] + OLC_ALPHABET[Math.min(19, Math.max(0, lonDigit))];
  }

  // Insert plus sign at index 8
  if (code.length >= 8) {
    code = code.substring(0, 8) + '+' + code.substring(8);
  } else {
    code = code + '+';
  }

  return code;
}

// ---------------- GPS Multi-Sample Averaging Statistics (Handy GPS style) ----------------
export interface GpsSample {
  E: number;
  N: number;
  Z: number;
  lat: number;
  lon: number;
  acc: number;
  timestamp?: number;
}

export interface GpsAveragingStats {
  sampleCount: number;
  avgE: number;
  avgN: number;
  avgZ: number;
  avgLat: number;
  avgLon: number;
  meanE: number;
  meanN: number;
  meanZ: number;
  meanLat: number;
  meanLon: number;
  stdDevE: number;
  stdDevN: number;
  stdDevZ: number;
  cep50: number;    // Circular Error Probable (50% confidence radius in metres)
  cep95: number;    // 95% confidence radius (approx 2.44 * sigma)
  drms2: number;    // 2DRMS (approx 2 * sqrt(sigmaE^2 + sigmaN^2))
  plusCode: string;
  dmsLat: string;
  dmsLon: string;
  qualityGrade: 'Survey-Grade' | 'Mapping-Grade' | 'Sub-Meter' | 'Recreational' | 'Coarse';
}

export function computeGpsAveragingStats(samples: GpsSample[]): GpsAveragingStats | null {
  if (!samples || samples.length === 0) return null;
  const n = samples.length;

  // Compute arithmetic means
  let sumE = 0, sumN = 0, sumZ = 0, sumLat = 0, sumLon = 0;
  for (const s of samples) {
    sumE += s.E;
    sumN += s.N;
    sumZ += (s.Z || 0);
    sumLat += s.lat;
    sumLon += s.lon;
  }
  const avgE = sumE / n;
  const avgN = sumN / n;
  const avgZ = sumZ / n;
  const avgLat = sumLat / n;
  const avgLon = sumLon / n;

  // Compute standard deviations
  let varE = 0, varN = 0, varZ = 0;
  for (const s of samples) {
    varE += Math.pow(s.E - avgE, 2);
    varN += Math.pow(s.N - avgN, 2);
    varZ += Math.pow((s.Z || 0) - avgZ, 2);
  }
  const stdDevE = Math.sqrt(varE / Math.max(1, n - 1));
  const stdDevN = Math.sqrt(varN / Math.max(1, n - 1));
  const stdDevZ = Math.sqrt(varZ / Math.max(1, n - 1));

  // Circular Error Probable (CEP) calculations:
  // Approximate CEP 50% = 0.5887 * (stdDevE + stdDevN) or 0.562 * sigmaMax + 0.614 * sigmaMin
  const sigmaMin = Math.min(stdDevE, stdDevN);
  const sigmaMax = Math.max(stdDevE, stdDevN);
  const cep50 = n > 1 ? 0.562 * sigmaMax + 0.614 * sigmaMin : samples[0].acc * 0.68;
  const drms2 = n > 1 ? 2 * Math.sqrt(stdDevE * stdDevE + stdDevN * stdDevN) : samples[0].acc * 2.0;
  const cep95 = n > 1 ? 2.08 * cep50 : samples[0].acc * 1.96;

  // Quality rating
  let qualityGrade: GpsAveragingStats['qualityGrade'] = 'Recreational';
  if (cep95 < 0.05) qualityGrade = 'Survey-Grade';
  else if (cep95 < 0.3) qualityGrade = 'Sub-Meter';
  else if (cep95 < 1.5) qualityGrade = 'Mapping-Grade';
  else if (cep95 < 5.0) qualityGrade = 'Recreational';
  else qualityGrade = 'Coarse';

  const roundedE = parseFloat(avgE.toFixed(4));
  const roundedN = parseFloat(avgN.toFixed(4));
  const roundedZ = parseFloat(avgZ.toFixed(3));
  const roundedLat = parseFloat(avgLat.toFixed(8));
  const roundedLon = parseFloat(avgLon.toFixed(8));

  return {
    sampleCount: n,
    avgE: roundedE,
    avgN: roundedN,
    avgZ: roundedZ,
    avgLat: roundedLat,
    avgLon: roundedLon,
    meanE: roundedE,
    meanN: roundedN,
    meanZ: roundedZ,
    meanLat: roundedLat,
    meanLon: roundedLon,
    stdDevE: parseFloat(stdDevE.toFixed(4)),
    stdDevN: parseFloat(stdDevN.toFixed(4)),
    stdDevZ: parseFloat(stdDevZ.toFixed(4)),
    cep50: parseFloat(cep50.toFixed(4)),
    cep95: parseFloat(cep95.toFixed(4)),
    drms2: parseFloat(drms2.toFixed(4)),
    plusCode: encodePlusCode(avgLat, avgLon),
    dmsLat: toDMSstr(avgLat, true),
    dmsLon: toDMSstr(avgLon, false),
    qualityGrade
  };
}


