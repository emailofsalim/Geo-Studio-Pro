// ============================================================================
// BhuNex Studio — CRS identity
// ----------------------------------------------------------------------------
// A single place that turns a working-zone string ("45N", "43S") into an
// explicit, correct coordinate-reference-system identity.
//
// WHY THIS EXISTS
//
// The suite previously built EPSG codes inline, in more than one place, as:
//
//     `326${zone.replace(/\D/g, '') || '45'}`
//
// That is wrong twice over. It hardcodes the northern-hemisphere authority
// prefix (326xx), so every southern-hemisphere project was labelled with a
// northern EPSG code while its geometry was computed with the southern false
// northing — a project whose label and arithmetic disagree. And the `|| '45'`
// fallback silently invents Zone 45 for any zone string it fails to parse,
// which is the exact silent-guess failure mode the CRS audit flagged.
//
// Every CRS label in the application is produced here so that the label a user
// sees, the EPSG code recorded in an export, and the numbers the geodesy
// routines actually computed can never disagree.
// ============================================================================

export interface CrsIdentity {
  /** Canonical zone string, e.g. "45N". */
  zone: string;
  /** UTM zone number, 1-60. */
  zoneNumber: number;
  /** True for southern-hemisphere zones (false northing of 10,000,000 m). */
  south: boolean;
  /** EPSG code: 326xx north, 327xx south. */
  epsg: number;
  /** Human-readable name, e.g. "WGS 84 / UTM Zone 45N". */
  name: string;
  /** Fully-qualified label used in exports and the UI. */
  label: string;
  datum: string;
  units: 'm';
}

export const DEFAULT_ZONE = '45N';

/**
 * Parses a working-zone string into its parts.
 *
 * Returns null rather than guessing when the input is not a valid UTM zone.
 * Callers must decide what to do about that — this module will not invent a
 * zone, because a wrong zone is not a small error.
 */
export function parseZone(zone: string | null | undefined): { zoneNumber: number; south: boolean } | null {
  if (zone == null) return null;
  const m = String(zone).trim().match(/^(\d{1,2})\s*([NnSs])?$/);
  if (!m) return null;
  const zoneNumber = parseInt(m[1], 10);
  if (!Number.isFinite(zoneNumber) || zoneNumber < 1 || zoneNumber > 60) return null;
  return { zoneNumber, south: (m[2] || 'N').toUpperCase() === 'S' };
}

/** True when `zone` is a usable UTM zone string. */
export function isValidZone(zone: string | null | undefined): boolean {
  return parseZone(zone) !== null;
}

/**
 * Builds the full CRS identity for a working zone.
 *
 * Throws on an unparseable zone. Use `parseZone` first when you need to handle
 * bad input without an exception.
 */
export function crsIdentityFor(zone: string): CrsIdentity {
  const parsed = parseZone(zone);
  if (!parsed) {
    throw new Error(
      `"${zone}" is not a valid UTM zone. Expected a zone number 1-60 followed by N or S, for example "45N".`
    );
  }
  const { zoneNumber, south } = parsed;
  const epsg = (south ? 32700 : 32600) + zoneNumber;
  const canonical = `${zoneNumber}${south ? 'S' : 'N'}`;
  const name = `WGS 84 / UTM Zone ${canonical}`;
  return {
    zone: canonical,
    zoneNumber,
    south,
    epsg,
    name,
    label: `${name} (EPSG:${epsg})`,
    datum: 'WGS 84',
    units: 'm'
  };
}

/**
 * Convenience label builder that never throws — for display paths where an
 * unparseable zone should render as an explicit unknown rather than crash the
 * view. It still refuses to substitute a default zone.
 */
export function crsLabelFor(zone: string | null | undefined): string {
  const parsed = parseZone(zone ?? '');
  if (!parsed) return 'Coordinate system not set';
  return crsIdentityFor(zone as string).label;
}

/** Splits a zone string into the (zoneNumber, south) pair the geodesy routines take. */
export function zoneParams(zone: string): { zNum: number; isSouth: boolean } {
  const id = crsIdentityFor(zone);
  return { zNum: id.zoneNumber, isSouth: id.south };
}

/**
 * Builds the canonical CRS record used by the import and export services.
 *
 * Replaces a service-layer version that parsed the zone with
 * `parseInt(...) || 45` — silently substituting Zone 45 for anything it could
 * not read — and asserted a hardcoded coordinate epoch of "2026.0". This one
 * refuses an unparseable zone, and omits the epoch rather than inventing one,
 * because a stated epoch is a claim about when the coordinates were realised.
 */
export function canonicalCrsFor(zone: string): {
  name: string;
  epsg: number;
  datum: string;
  projection: string;
  zone: string;
  linearUnit: 'm';
  verticalReference: string;
} {
  const id = crsIdentityFor(zone);
  return {
    name: id.name,
    epsg: id.epsg,
    datum: id.datum,
    projection: 'Universal Transverse Mercator',
    zone: id.zone,
    linearUnit: 'm',
    verticalReference: 'MSL / Orthometric'
  };
}

// ---------------------------------------------------------------------------
// Zone catalogue
// ---------------------------------------------------------------------------
// The zone picker previously offered eight hand-written entries covering the
// India region, each with its EPSG code typed in by hand. That made every zone
// outside South Asia unreachable through the UI even though the projection
// engine handles all sixty, and it was a second place for an EPSG code to drift
// out of step with crsIdentityFor. The catalogue below is generated, so the
// codes cannot disagree, and the regional zones stay grouped first because they
// are the common case.

export interface ZoneOption {
  zone: string;
  epsg: number;
  label: string;
}

/** Regional context for the zones most used in South Asian survey work. */
const REGION_NOTES: Record<string, string> = {
  '42N': 'West India / Pakistan',
  '43N': 'West & Central India',
  '44N': 'Central & South India',
  '45N': 'East India / Bangladesh',
  '46N': 'North-East India / Myanmar',
  '47N': 'SE Asia / Thailand',
  '43S': 'Indian Ocean, south',
  '45S': 'Southern hemisphere'
};

/** The zones surfaced first in pickers. */
export const COMMON_ZONES: ZoneOption[] = Object.keys(REGION_NOTES).map(zone => {
  const id = crsIdentityFor(zone);
  return { zone: id.zone, epsg: id.epsg, label: `UTM ${id.zone} (${REGION_NOTES[zone]})` };
});

function buildHemisphere(south: boolean): ZoneOption[] {
  const out: ZoneOption[] = [];
  for (let z = 1; z <= 60; z++) {
    const id = crsIdentityFor(`${z}${south ? 'S' : 'N'}`);
    const west = (z - 1) * 6 - 180;
    out.push({
      zone: id.zone,
      epsg: id.epsg,
      label: `UTM ${id.zone} (${Math.abs(west)}°${west < 0 ? 'W' : 'E'} to ${Math.abs(west + 6)}°${
        west + 6 <= 0 ? 'W' : 'E'
      })`
    });
  }
  return out;
}

/** All 60 northern-hemisphere zones. */
export const NORTHERN_ZONES: ZoneOption[] = buildHemisphere(false);

/** All 60 southern-hemisphere zones. */
export const SOUTHERN_ZONES: ZoneOption[] = buildHemisphere(true);

/** Every selectable zone, north then south. */
export const ALL_ZONES: ZoneOption[] = [...NORTHERN_ZONES, ...SOUTHERN_ZONES];
