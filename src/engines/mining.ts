// ============================================================================
// BhuNex Studio — Mining engine
// ----------------------------------------------------------------------------
// Bench geometry, drill pattern layout, blast design and stockpile volumes for
// open-cast work.
//
// The suite previously carried borehole grade classification and a lease
// safety buffer, but nothing for the geometry of the pit itself. Everything
// here is new capability rather than a port.
//
// UNITS ARE EXPLICIT AND CONSISTENT THROUGHOUT
//   lengths          metres, except hole diameter, which is millimetres
//                    because that is how drill bits are specified
//   angles           degrees on the boundary, radians only inside a formula
//   density          kg/m³
//   mass             kilograms, with tonnes derived where a report wants them
//
// Mixing feet into a burden or leaving a diameter in millimetres inside an
// area term is the classic way these calculations go wrong, so every function
// names its units in the parameter and states them in the result.
// ============================================================================

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Bench geometry
// ---------------------------------------------------------------------------

export interface BenchGeometryInput {
  /** Vertical height of a single bench, m. */
  benchHeightM: number;
  /** Angle of the bench face from horizontal, degrees. */
  faceAngleDeg: number;
  /** Width of the catch berm left at each bench toe, m. */
  bermWidthM: number;
  /** Number of stacked benches making up the wall. */
  benchCount: number;
}

export interface BenchGeometryResult {
  benchHeightM: number;
  faceAngleDeg: number;
  bermWidthM: number;
  benchCount: number;
  /** Horizontal distance the face itself spans, m. */
  faceRunM: number;
  /** Horizontal advance per bench including its berm, m. */
  horizontalPerBenchM: number;
  /** Total wall height, m. */
  totalHeightM: number;
  /** Total horizontal distance from crest to toe, m. */
  totalRunM: number;
  /** Overall (inter-ramp) slope angle of the stacked wall, degrees. */
  overallSlopeAngleDeg: number;
}

/**
 * Bench and overall wall geometry.
 *
 * The overall slope angle is the angle of the line joining the top crest to
 * the bottom toe. It is always flatter than the individual face angle, because
 * each berm steps the wall back — which is exactly why quoting the face angle
 * as the wall angle overstates stability.
 */
export function benchGeometry(input: BenchGeometryInput): BenchGeometryResult {
  const { benchHeightM, faceAngleDeg, bermWidthM, benchCount } = input;

  if (!(benchHeightM > 0)) throw new Error('Bench height must be greater than zero.');
  if (!(faceAngleDeg > 0 && faceAngleDeg < 90)) {
    throw new Error('Face angle must be between 0 and 90 degrees exclusive.');
  }
  if (bermWidthM < 0) throw new Error('Berm width cannot be negative.');
  if (!Number.isInteger(benchCount) || benchCount < 1) {
    throw new Error('Bench count must be a whole number of at least 1.');
  }

  const faceRunM = benchHeightM / Math.tan(faceAngleDeg * DEG);
  const horizontalPerBenchM = faceRunM + bermWidthM;
  const totalHeightM = benchHeightM * benchCount;

  // The lowest bench has no berm below it: the toe of the bottom face is the
  // bottom of the wall. Counting benchCount berms would flatten the answer.
  const totalRunM = faceRunM * benchCount + bermWidthM * (benchCount - 1);
  const overallSlopeAngleDeg = Math.atan(totalHeightM / totalRunM) / DEG;

  return {
    benchHeightM,
    faceAngleDeg,
    bermWidthM,
    benchCount,
    faceRunM,
    horizontalPerBenchM,
    totalHeightM,
    totalRunM,
    overallSlopeAngleDeg
  };
}

// ---------------------------------------------------------------------------
// Drill pattern
// ---------------------------------------------------------------------------

export type DrillPattern = 'square' | 'staggered';

export interface DrillPatternInput {
  /** Distance from the free face to the first row, m. */
  burdenM: number;
  /** Distance between holes along a row, m. */
  spacingM: number;
  /** Area to be drilled, m². */
  areaM2: number;
  /** Bench height, m. */
  benchHeightM: number;
  /** Extra depth drilled below grade to break the toe, m. */
  subdrillM?: number;
  pattern?: DrillPattern;
}

export interface DrillPatternResult {
  pattern: DrillPattern;
  burdenM: number;
  spacingM: number;
  /** Spacing-to-burden ratio; 1.15–1.30 is the usual working range. */
  spacingToBurdenRatio: number;
  /** Ground area each hole is responsible for, m². */
  areaPerHoleM2: number;
  /** Rock volume each hole breaks, m³. */
  volumePerHoleM3: number;
  holeCount: number;
  holeDepthM: number;
  subdrillM: number;
  /** Total metres drilled across the pattern. */
  totalDrillMetres: number;
  totalVolumeM3: number;
  /** Drilled metres per cubic metre broken — a standard efficiency measure. */
  drillFactorMPerM3: number;
  warnings: string[];
}

/**
 * Lays out a drill pattern over an area and reports what it will break.
 *
 * A staggered pattern offsets alternate rows by half the spacing. It
 * distributes energy more evenly than a square pattern for the same burden and
 * spacing, but it covers the same ground area per hole, so the hole count is
 * the same; the difference is in fragmentation, not quantity.
 */
export function drillPattern(input: DrillPatternInput): DrillPatternResult {
  const {
    burdenM,
    spacingM,
    areaM2,
    benchHeightM,
    subdrillM = 0.3 * input.burdenM,
    pattern = 'staggered'
  } = input;

  if (!(burdenM > 0)) throw new Error('Burden must be greater than zero.');
  if (!(spacingM > 0)) throw new Error('Spacing must be greater than zero.');
  if (!(areaM2 > 0)) throw new Error('Area must be greater than zero.');
  if (!(benchHeightM > 0)) throw new Error('Bench height must be greater than zero.');
  if (subdrillM < 0) throw new Error('Subdrill cannot be negative.');

  const warnings: string[] = [];
  const spacingToBurdenRatio = spacingM / burdenM;
  if (spacingToBurdenRatio < 1.0) {
    warnings.push(
      `Spacing is less than the burden (ratio ${spacingToBurdenRatio.toFixed(2)}). Patterns are normally 1.15 to 1.30; a ratio below 1 tends to give coarse fragmentation and back-break.`
    );
  } else if (spacingToBurdenRatio > 1.6) {
    warnings.push(
      `Spacing-to-burden ratio of ${spacingToBurdenRatio.toFixed(2)} is wide. Above about 1.6 the risk of unbroken rock between holes rises.`
    );
  }
  if (benchHeightM < 2 * burdenM) {
    warnings.push(
      `Bench height (${benchHeightM} m) is less than twice the burden (${burdenM} m). Stiff benches like this tend to throw flyrock and break poorly at the toe.`
    );
  }

  const areaPerHoleM2 = burdenM * spacingM;
  const volumePerHoleM3 = areaPerHoleM2 * benchHeightM;
  const holeCount = Math.ceil(areaM2 / areaPerHoleM2);
  const holeDepthM = benchHeightM + subdrillM;
  const totalDrillMetres = holeCount * holeDepthM;
  const totalVolumeM3 = holeCount * volumePerHoleM3;

  return {
    pattern,
    burdenM,
    spacingM,
    spacingToBurdenRatio,
    areaPerHoleM2,
    volumePerHoleM3,
    holeCount,
    holeDepthM,
    subdrillM,
    totalDrillMetres,
    totalVolumeM3,
    drillFactorMPerM3: totalDrillMetres / totalVolumeM3,
    warnings
  };
}

/** A single hole's position in a laid-out pattern, in local pattern coordinates. */
export interface DrillHolePosition {
  row: number;
  hole: number;
  /** Offset along the face from the pattern origin, m. */
  x: number;
  /** Offset back from the free face, m. */
  y: number;
}

/**
 * Generates hole positions for a rectangular blast block.
 *
 * Coordinates are local to the block: x runs along the free face, y runs back
 * from it. The caller transforms them into the project CRS — this function
 * deliberately does not, so it cannot silently produce coordinates in an
 * unstated system.
 */
export function layoutDrillHoles(
  blockWidthM: number,
  blockDepthM: number,
  burdenM: number,
  spacingM: number,
  pattern: DrillPattern = 'staggered'
): DrillHolePosition[] {
  if (!(blockWidthM > 0 && blockDepthM > 0)) {
    throw new Error('Block width and depth must be greater than zero.');
  }
  if (!(burdenM > 0 && spacingM > 0)) {
    throw new Error('Burden and spacing must be greater than zero.');
  }

  const positions: DrillHolePosition[] = [];
  const rowCount = Math.floor(blockDepthM / burdenM) + 1;

  for (let row = 0; row < rowCount; row++) {
    const y = row * burdenM;
    // Alternate rows step across by half a spacing in a staggered pattern.
    const offset = pattern === 'staggered' && row % 2 === 1 ? spacingM / 2 : 0;
    let hole = 0;
    for (let x = offset; x <= blockWidthM + 1e-9; x += spacingM) {
      positions.push({ row, hole, x, y });
      hole++;
    }
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Blast design
// ---------------------------------------------------------------------------

export interface BlastDesignInput {
  /** Drill hole diameter, mm. */
  holeDiameterMm: number;
  /** Density of the explosive column, kg/m³ (ANFO is about 800). */
  explosiveDensityKgM3: number;
  /** Length of the collar left uncharged, m. Defaults to the burden. */
  stemmingM?: number;
  /** Rock density in place, kg/m³. */
  rockDensityKgM3: number;
  pattern: DrillPatternResult;
}

export interface BlastDesignResult {
  holeDiameterMm: number;
  /** Explosive mass per metre of charged column, kg/m. */
  linearChargeDensityKgPerM: number;
  stemmingM: number;
  /** Charged length of each hole, m. */
  chargeLengthM: number;
  /** Explosive in one hole, kg. */
  chargePerHoleKg: number;
  totalExplosiveKg: number;
  totalVolumeM3: number;
  totalTonnes: number;
  /** Explosive per cubic metre of rock, kg/m³. */
  powderFactorKgPerM3: number;
  /** Explosive per tonne of rock, kg/t. */
  powderFactorKgPerTonne: number;
  warnings: string[];
}

/**
 * Charge design for a laid-out pattern.
 *
 * Linear charge density is the cross-sectional area of the hole times the
 * explosive density: (π/4)·d²·ρ, with the diameter converted from millimetres
 * to metres first. Getting that conversion wrong is a factor of a million, so
 * the input is named in millimetres and converted in one place.
 */
export function blastDesign(input: BlastDesignInput): BlastDesignResult {
  const { holeDiameterMm, explosiveDensityKgM3, rockDensityKgM3, pattern } = input;
  const stemmingM = input.stemmingM ?? pattern.burdenM;

  if (!(holeDiameterMm > 0)) throw new Error('Hole diameter must be greater than zero.');
  if (!(explosiveDensityKgM3 > 0)) throw new Error('Explosive density must be greater than zero.');
  if (!(rockDensityKgM3 > 0)) throw new Error('Rock density must be greater than zero.');
  if (stemmingM < 0) throw new Error('Stemming cannot be negative.');
  if (stemmingM >= pattern.holeDepthM) {
    throw new Error(
      `Stemming (${stemmingM} m) is at least the hole depth (${pattern.holeDepthM} m), leaving no room for explosive.`
    );
  }

  const warnings: string[] = [];
  const diameterM = holeDiameterMm / 1000;
  const linearChargeDensityKgPerM = (Math.PI / 4) * diameterM * diameterM * explosiveDensityKgM3;

  const chargeLengthM = pattern.holeDepthM - stemmingM;
  const chargePerHoleKg = chargeLengthM * linearChargeDensityKgPerM;
  const totalExplosiveKg = chargePerHoleKg * pattern.holeCount;
  const totalVolumeM3 = pattern.totalVolumeM3;
  const totalTonnes = (totalVolumeM3 * rockDensityKgM3) / 1000;

  const powderFactorKgPerM3 = totalExplosiveKg / totalVolumeM3;
  const powderFactorKgPerTonne = totalExplosiveKg / totalTonnes;

  if (stemmingM < 0.7 * pattern.burdenM) {
    warnings.push(
      `Stemming (${stemmingM.toFixed(2)} m) is under 0.7 times the burden. Short stemming vents gas at the collar, which means flyrock, airblast and wasted energy.`
    );
  }
  if (powderFactorKgPerM3 < 0.15) {
    warnings.push(
      `Powder factor of ${powderFactorKgPerM3.toFixed(3)} kg/m³ is low for most rock and is likely to leave oversize.`
    );
  } else if (powderFactorKgPerM3 > 1.0) {
    warnings.push(
      `Powder factor of ${powderFactorKgPerM3.toFixed(3)} kg/m³ is high; check for excessive throw, airblast and ground vibration.`
    );
  }

  return {
    holeDiameterMm,
    linearChargeDensityKgPerM,
    stemmingM,
    chargeLengthM,
    chargePerHoleKg,
    totalExplosiveKg,
    totalVolumeM3,
    totalTonnes,
    powderFactorKgPerM3,
    powderFactorKgPerTonne,
    warnings
  };
}

// ---------------------------------------------------------------------------
// Stockpiles
// ---------------------------------------------------------------------------

export interface StockpileResult {
  volumeM3: number;
  tonnes: number;
  /** Loose volume after bulking, m³. */
  looseVolumeM3?: number;
  shape: 'cone' | 'frustum';
  heightM: number;
}

/**
 * Volume of a conical stockpile.
 *
 * `swellFactor` is the bulking of broken rock over its in-situ volume (1.5
 * means 50% swell). A surveyed stockpile is already loose, so the tonnage uses
 * the loose density supplied; the swell factor is only applied when converting
 * back to an in-situ equivalent.
 */
export function conicalStockpile(
  baseRadiusM: number,
  heightM: number,
  looseDensityKgM3: number,
  swellFactor?: number
): StockpileResult {
  if (!(baseRadiusM > 0)) throw new Error('Base radius must be greater than zero.');
  if (!(heightM > 0)) throw new Error('Height must be greater than zero.');
  if (!(looseDensityKgM3 > 0)) throw new Error('Density must be greater than zero.');

  const volumeM3 = (Math.PI / 3) * baseRadiusM * baseRadiusM * heightM;
  return {
    volumeM3,
    tonnes: (volumeM3 * looseDensityKgM3) / 1000,
    looseVolumeM3: swellFactor ? volumeM3 / swellFactor : undefined,
    shape: 'cone',
    heightM
  };
}

/** Volume of a flat-topped (truncated cone) stockpile. */
export function frustumStockpile(
  baseRadiusM: number,
  topRadiusM: number,
  heightM: number,
  looseDensityKgM3: number
): StockpileResult {
  if (!(baseRadiusM > 0)) throw new Error('Base radius must be greater than zero.');
  if (topRadiusM < 0) throw new Error('Top radius cannot be negative.');
  if (topRadiusM > baseRadiusM) {
    throw new Error('Top radius cannot exceed the base radius for a stockpile.');
  }
  if (!(heightM > 0)) throw new Error('Height must be greater than zero.');

  const volumeM3 =
    (Math.PI * heightM / 3) *
    (baseRadiusM * baseRadiusM + baseRadiusM * topRadiusM + topRadiusM * topRadiusM);

  return {
    volumeM3,
    tonnes: (volumeM3 * looseDensityKgM3) / 1000,
    shape: 'frustum',
    heightM
  };
}

/**
 * Peak height a free-tipped conical pile reaches for a given base radius,
 * from the material's angle of repose.
 */
export function stockpileHeightFromRepose(baseRadiusM: number, angleOfReposeDeg: number): number {
  if (!(baseRadiusM > 0)) throw new Error('Base radius must be greater than zero.');
  if (!(angleOfReposeDeg > 0 && angleOfReposeDeg < 90)) {
    throw new Error('Angle of repose must be between 0 and 90 degrees exclusive.');
  }
  return baseRadiusM * Math.tan(angleOfReposeDeg * DEG);
}

// ---------------------------------------------------------------------------
// Reserves
// ---------------------------------------------------------------------------

export interface ReserveResult {
  inSituVolumeM3: number;
  inSituTonnes: number;
  /** Tonnes remaining after the recovery factor. */
  recoverableTonnes: number;
  /** Waste tonnes over the ore, from the overburden thickness. */
  overburdenTonnes: number;
  /** Waste-to-ore ratio by mass. */
  strippingRatio: number;
}

/**
 * Block reserve estimate from an area, a seam thickness and densities.
 *
 * This is a geometric estimate over a single block. It is not a resource
 * classification and carries no confidence category — treat it as a planning
 * figure, not a statement of reserves.
 */
export function blockReserve(params: {
  areaM2: number;
  seamThicknessM: number;
  oreDensityKgM3: number;
  overburdenThicknessM?: number;
  overburdenDensityKgM3?: number;
  recoveryFactor?: number;
}): ReserveResult {
  const {
    areaM2,
    seamThicknessM,
    oreDensityKgM3,
    overburdenThicknessM = 0,
    overburdenDensityKgM3 = 1800,
    recoveryFactor = 1
  } = params;

  if (!(areaM2 > 0)) throw new Error('Area must be greater than zero.');
  if (!(seamThicknessM > 0)) throw new Error('Seam thickness must be greater than zero.');
  if (!(oreDensityKgM3 > 0)) throw new Error('Ore density must be greater than zero.');
  if (!(recoveryFactor > 0 && recoveryFactor <= 1)) {
    throw new Error('Recovery factor must be greater than 0 and at most 1.');
  }
  if (overburdenThicknessM < 0) throw new Error('Overburden thickness cannot be negative.');

  const inSituVolumeM3 = areaM2 * seamThicknessM;
  const inSituTonnes = (inSituVolumeM3 * oreDensityKgM3) / 1000;
  const recoverableTonnes = inSituTonnes * recoveryFactor;
  const overburdenTonnes = (areaM2 * overburdenThicknessM * overburdenDensityKgM3) / 1000;

  return {
    inSituVolumeM3,
    inSituTonnes,
    recoverableTonnes,
    overburdenTonnes,
    strippingRatio: inSituTonnes > 0 ? overburdenTonnes / inSituTonnes : 0
  };
}
