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

// ---------------------------------------------------------------------------
// Shapefile .prj (OGC WKT) identity
// ---------------------------------------------------------------------------

export interface PrjIdentity {
  /**
   * What the file says its coordinates are. `null` when the text states
   * neither, which is not the same as "geographic" and must not be treated
   * as it.
   */
  kind: 'projected' | 'geographic' | null;
  /** The name the file gave, for display and for saying what was read. */
  name: string | null;
  /** UTM zone 1-60 when the definition names or implies one. */
  utmZone: number | null;
  south: boolean | null;
  /** EPSG code when the definition carries one. */
  epsg: number | null;
}

const EMPTY_PRJ: PrjIdentity = { kind: null, name: null, utmZone: null, south: null, epsg: null };

/**
 * Reads a shapefile's `.prj` — the file's own statement of its coordinate
 * system — far enough to answer the question that decides how its coordinates
 * are interpreted: are they degrees or metres on a grid, and if a grid, which
 * UTM zone.
 *
 * Only the outermost keyword decides projected against geographic. A PROJCS
 * contains a GEOGCS describing its own datum, so a definition that merely
 * *contains* "GEOGCS" is not geographic, and testing for that would read every
 * projected file as lat/lon.
 *
 * Three sources can name the zone, and they are taken in order of authority:
 * an EPSG code (32601-32660 north, 32701-32760 south) is a citation and wins;
 * the projection parameters are the definition itself and come next, with the
 * central meridian giving the zone and a false northing of 10 000 000 marking
 * the southern hemisphere; the name comes last, because it is a label a person
 * typed and is the part most likely to be stale.
 *
 * Anything it cannot establish comes back null rather than guessed. A caller
 * that gets null must say it inferred what it did next, not claim the file
 * told it.
 */
export function parsePrj(prjText: string | null | undefined): PrjIdentity {
  if (typeof prjText !== 'string') return { ...EMPTY_PRJ };
  const text = prjText.replace(/^﻿/, '').trim();
  if (!text) return { ...EMPTY_PRJ };

  const head = text.match(/^([A-Za-z]+)\s*\[/);
  const keyword = head ? head[1].toUpperCase() : '';
  let kind: PrjIdentity['kind'] = null;
  if (keyword === 'PROJCS' || keyword === 'PROJCRS') kind = 'projected';
  else if (keyword === 'GEOGCS' || keyword === 'GEOGCRS' || keyword === 'GEODCRS') kind = 'geographic';

  const nameMatch = text.match(/^[A-Za-z]+\s*\[\s*"([^"]*)"/);
  const name = nameMatch ? nameMatch[1] : null;

  // EPSG code: the last authority in the string is the outermost one.
  let epsg: number | null = null;
  const auth = [...text.matchAll(/(?:AUTHORITY|ID)\s*\[\s*"EPSG"\s*,\s*"?(\d+)"?\s*\]/gi)];
  if (auth.length) {
    const n = parseInt(auth[auth.length - 1][1], 10);
    if (Number.isFinite(n)) epsg = n;
  }

  let utmZone: number | null = null;
  let south: boolean | null = null;

  // 1. From the EPSG code, which cites a published definition.
  if (epsg !== null) {
    if (epsg >= 32601 && epsg <= 32660) { utmZone = epsg - 32600; south = false; }
    else if (epsg >= 32701 && epsg <= 32760) { utmZone = epsg - 32700; south = true; }
    else if (epsg === 4326 || epsg === 4269 || epsg === 4267) { if (!kind) kind = 'geographic'; }
  }

  // 2. From the projection parameters, which are the definition itself.
  if (utmZone === null) {
    const cm = text.match(/PARAMETER\s*\[\s*"[Cc]entral[_ ][Mm]eridian"\s*,\s*(-?[\d.]+)/);
    if (cm) {
      const z = Math.round((parseFloat(cm[1]) + 183) / 6);
      if (z >= 1 && z <= 60 && Math.abs(6 * z - 183 - parseFloat(cm[1])) < 1e-6) utmZone = z;
    }
  }
  if (south === null) {
    const fn = text.match(/PARAMETER\s*\[\s*"[Ff]alse[_ ][Nn]orthing"\s*,\s*(-?[\d.]+)/);
    if (fn) south = parseFloat(fn[1]) > 0;
  }

  // 3. From the name, which is a label rather than a definition.
  if (utmZone === null || south === null) {
    const m = text.match(/UTM[\s_]*(?:zone[\s_]*)?(\d{1,2})\s*([NnSs])?/);
    if (m) {
      const z = parseInt(m[1], 10);
      if (utmZone === null && z >= 1 && z <= 60) utmZone = z;
      if (south === null && m[2]) south = m[2].toUpperCase() === 'S';
    }
  }

  return { kind, name, utmZone, south, epsg };
}
