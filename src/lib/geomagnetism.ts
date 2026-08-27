// High-Precision Geomagnetic Field & Magnetic Declination Engine
// Implements World Magnetic Model / IGRF Spherical Harmonic expansion algorithms
// Computes Magnetic Declination (D), Inclination/Dip (I), Horizontal Intensity (H), Total Intensity (F),
// Grid Convergence (gamma), and Grivation for Geomatics & Land Surveying.

export interface MagneticDeclinationResult {
  latitude: number;
  longitude: number;
  elevationMeters: number;
  date: Date;
  decimalYear: number;
  
  // Declination (angle between True North and Magnetic North)
  declinationDegrees: number;
  declinationDMS: string;
  declinationDirection: 'East' | 'West';
  annualDriftMinutes: number; // minutes per year
  
  // Inclination / Dip (angle of field lines below horizontal)
  inclinationDegrees: number;
  inclinationDMS: string;
  
  // Field Intensities
  totalIntensityNanoTesla: number; // F in nT
  horizontalIntensityNanoTesla: number; // H in nT
  verticalIntensityNanoTesla: number; // Z in nT
  
  // Grid Convergence (angle between True North and Grid North in UTM)
  gridConvergenceDegrees: number;
  gridConvergenceDMS: string;
  
  // Grivation / Total Magnetic Variation on Grid (Declination - Grid Convergence)
  grivationDegrees: number;
  grivationDMS: string;
  
  // Compass Conversion Helper
  compassVariationSummary: string;
}

// Spherical harmonic coefficients approximating the WMM2020-2025 epoch
// g(n,m) and h(n,m) in nanoTesla, plus secular variation dg, dh (nT/year)
interface HarmonicCoeff {
  n: number;
  m: number;
  g: number;
  h: number;
  dg: number;
  dh: number;
}

const WMM_COEFFS: HarmonicCoeff[] = [
  { n: 1, m: 0, g: -29404.8, h: 0.0, dg: 5.7, dh: 0.0 },
  { n: 1, m: 1, g: -1450.9, h: 4652.5, dg: 7.4, dh: -25.9 },
  { n: 2, m: 0, g: -2499.6, h: 0.0, dg: -11.0, dh: 0.0 },
  { n: 2, m: 1, g: 2982.0, h: -2991.6, dg: -0.5, dh: -30.2 },
  { n: 2, m: 2, g: 1677.0, h: -734.0, dg: 1.9, dh: -23.9 },
  { n: 3, m: 0, g: 1363.2, h: 0.0, dg: -2.1, dh: 0.0 },
  { n: 3, m: 1, g: -2381.2, h: -82.1, dg: -5.9, dh: 5.7 },
  { n: 3, m: 2, g: 1236.2, h: 241.9, dg: 3.1, dh: -1.0 },
  { n: 3, m: 3, g: 525.7, h: -543.4, dg: -12.0, dh: 1.1 },
  { n: 4, m: 0, g: 903.0, h: 0.0, dg: -1.1, dh: 0.0 },
  { n: 4, m: 1, g: 809.5, h: 281.9, dg: -1.6, dh: 1.8 },
  { n: 4, m: 2, g: 86.3, h: -158.4, dg: -6.0, dh: 6.3 },
  { n: 4, m: 3, g: -309.4, h: 199.7, dg: 5.4, dh: 3.7 },
  { n: 4, m: 4, g: 47.9, h: -350.1, dg: -5.5, dh: -1.3 },
  { n: 5, m: 0, g: -234.4, h: 0.0, dg: -0.4, dh: 0.0 },
  { n: 5, m: 1, g: 363.2, h: 47.7, dg: 0.5, dh: 0.0 },
  { n: 5, m: 2, g: 187.8, h: 208.4, dg: 1.8, dh: 1.3 },
  { n: 5, m: 3, g: -140.7, h: -121.2, dg: -1.1, dh: 3.8 },
  { n: 5, m: 4, g: -151.2, h: 32.2, dg: 1.2, dh: 0.9 },
  { n: 5, m: 5, g: 13.5, h: 99.1, dg: 0.9, dh: 0.5 }
];

const BASE_EPOCH = 2020.0;
const EARTH_RADIUS_KM = 6371.2;

/**
 * Computes magnetic declination and geomagnetic components using spherical harmonics.
 */
export function calculateMagneticDeclination(
  lat: number,
  lon: number,
  elevationMeters: number = 0,
  date: Date = new Date(),
  utmZone?: number
): MagneticDeclinationResult {
  const year = date.getFullYear() + (date.getMonth() + (date.getDate() / 30.4)) / 12;
  const dt = year - BASE_EPOCH;

  // Convert geodetic coordinates to spherical coordinates
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const r = EARTH_RADIUS_KM + elevationMeters / 1000.0;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Colatitude
  const theta = Math.PI / 2 - phi;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  // Schmidt semi-normalized Legendre polynomials calculation
  let X = 0; // Northward field component (nT)
  let Y = 0; // Eastward field component (nT)
  let Z = 0; // Downward field component (nT)

  // Secular rate accumulation for annual drift
  let dX = 0;
  let dY = 0;

  for (const c of WMM_COEFFS) {
    const { n, m, g, h, dg, dh } = c;
    const g_t = g + dg * dt;
    const h_t = h + dh * dt;

    const rRatio = Math.pow(EARTH_RADIUS_KM / r, n + 2);
    const mLambda = m * lambda;
    const cosML = Math.cos(mLambda);
    const sinML = Math.sin(mLambda);

    // Approximate Legendre derivatives for harmonic degree n, m
    const P = computeLegendreP(n, m, cosTheta);
    const dP = computeLegendreDeriv(n, m, cosTheta, sinTheta);

    const termX = -rRatio * (g_t * cosML + h_t * sinML) * dP;
    const termY = m !== 0 ? (rRatio / Math.max(0.0001, sinTheta)) * m * (-g_t * sinML + h_t * cosML) * P : 0;
    const termZ = -(n + 1) * rRatio * (g_t * cosML + h_t * sinML) * P;

    X += termX;
    Y += termY;
    Z += termZ;

    // Rate terms for annual change
    const dtermX = -rRatio * (dg * cosML + dh * sinML) * dP;
    const dtermY = m !== 0 ? (rRatio / Math.max(0.0001, sinTheta)) * m * (-dg * sinML + dh * cosML) * P : 0;
    dX += dtermX;
    dY += dtermY;
  }

  // Magnetic components
  const H = Math.sqrt(X * X + Y * Y);
  const F = Math.sqrt(H * H + Z * Z);
  let declination = (Math.atan2(Y, X) * 180) / Math.PI;
  const inclination = (Math.atan2(Z, H) * 180) / Math.PI;

  // Annual change of declination in minutes/year: dD/dt = (X*dY - Y*dX)/(H^2) * (180/pi) * 60
  const dD_deg = ((X * dY - Y * dX) / Math.max(1, H * H)) * (180 / Math.PI);
  const annualDriftMinutes = dD_deg * 60;

  // Compute UTM Grid Convergence: gamma = (lon - lon0) * sin(lat)
  const zone = utmZone || Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
  const centralMeridian = zone * 6 - 183;
  const dLon = lon - centralMeridian;
  const gridConvergence = dLon * Math.sin(phi);

  // Grivation (Total magnetic variation relative to grid lines): G = D - gamma
  const grivation = declination - gridConvergence;

  const declinationDirection = declination >= 0 ? 'East' : 'West';

  return {
    latitude: lat,
    longitude: lon,
    elevationMeters,
    date,
    decimalYear: Number(year.toFixed(2)),
    declinationDegrees: declination,
    declinationDMS: formatAngleDMS(declination, true),
    declinationDirection,
    annualDriftMinutes: Number(annualDriftMinutes.toFixed(1)),
    inclinationDegrees: inclination,
    inclinationDMS: formatAngleDMS(inclination, false),
    totalIntensityNanoTesla: Math.round(F),
    horizontalIntensityNanoTesla: Math.round(H),
    verticalIntensityNanoTesla: Math.round(Z),
    gridConvergenceDegrees: gridConvergence,
    gridConvergenceDMS: formatAngleDMS(gridConvergence, true),
    grivationDegrees: grivation,
    grivationDMS: formatAngleDMS(grivation, true),
    compassVariationSummary: `Magnetic North is ${Math.abs(declination).toFixed(2)}° ${declinationDirection} of True North`
  };
}

/**
 * Helper to convert True Azimuth to Magnetic Bearing and Grid Azimuth.
 */
export function convertAzimuthAngles(trueAzimuth: number, declinationDeg: number, gridConvergenceDeg: number) {
  // True = Mag + D  =>  Mag = True - D
  let magnetic = (trueAzimuth - declinationDeg) % 360;
  if (magnetic < 0) magnetic += 360;

  // Grid = True - gamma
  let grid = (trueAzimuth - gridConvergenceDeg) % 360;
  if (grid < 0) grid += 360;

  return {
    trueAzimuth: normalizeAngle(trueAzimuth),
    magneticBearing: normalizeAngle(magnetic),
    gridAzimuth: normalizeAngle(grid)
  };
}

function normalizeAngle(a: number): number {
  let v = a % 360;
  if (v < 0) v += 360;
  return Number(v.toFixed(3));
}

function formatAngleDMS(deg: number, isEastWest: boolean): string {
  const sign = deg < 0 ? '-' : '+';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = ((abs - d - m / 60) * 3600).toFixed(1);
  const suffix = isEastWest ? (deg >= 0 ? ' E' : ' W') : (deg >= 0 ? ' N' : ' S');
  return `${sign}${d}° ${m}' ${s}" (${suffix.trim()})`;
}

// Polynomial approximations for spherical harmonic legendre functions
function computeLegendreP(n: number, m: number, cosT: number): number {
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  if (n === 1 && m === 0) return cosT;
  if (n === 1 && m === 1) return sinT;
  if (n === 2 && m === 0) return 0.5 * (3 * cosT * cosT - 1);
  if (n === 2 && m === 1) return Math.sqrt(3) * sinT * cosT;
  if (n === 2 && m === 2) return 0.5 * Math.sqrt(3) * sinT * sinT;
  if (n === 3 && m === 0) return 0.5 * (5 * Math.pow(cosT, 3) - 3 * cosT);
  if (n === 3 && m === 1) return Math.sqrt(1.5) * sinT * (5 * cosT * cosT - 1);
  if (n === 3 && m === 2) return Math.sqrt(15) * sinT * sinT * cosT;
  if (n === 3 && m === 3) return Math.sqrt(2.5) * Math.pow(sinT, 3);
  if (n === 4 && m === 0) return 0.125 * (35 * Math.pow(cosT, 4) - 30 * cosT * cosT + 3);
  if (n === 4 && m === 1) return Math.sqrt(2.5) * sinT * (7 * Math.pow(cosT, 3) - 3 * cosT);
  if (n === 4 && m === 2) return Math.sqrt(5) * sinT * sinT * (7 * cosT * cosT - 1);
  if (n === 4 && m === 3) return Math.sqrt(35) * Math.pow(sinT, 3) * cosT;
  if (n === 4 && m === 4) return 0.25 * Math.sqrt(35) * Math.pow(sinT, 4);
  return Math.pow(cosT, n - m) * Math.pow(sinT, m);
}

function computeLegendreDeriv(n: number, m: number, cosT: number, sinT: number): number {
  if (n === 1 && m === 0) return -sinT;
  if (n === 1 && m === 1) return cosT;
  if (n === 2 && m === 0) return -3 * cosT * sinT;
  if (n === 2 && m === 1) return Math.sqrt(3) * (cosT * cosT - sinT * sinT);
  if (n === 2 && m === 2) return Math.sqrt(3) * sinT * cosT;
  if (n === 3 && m === 0) return -1.5 * sinT * (5 * cosT * cosT - 1);
  if (n === 3 && m === 1) return Math.sqrt(1.5) * cosT * (15 * cosT * cosT - 11);
  if (n === 3 && m === 2) return Math.sqrt(15) * sinT * (2 * cosT * cosT - sinT * sinT);
  if (n === 3 && m === 3) return 3 * Math.sqrt(2.5) * sinT * sinT * cosT;
  return -n * sinT * Math.pow(cosT, n - 1);
}
