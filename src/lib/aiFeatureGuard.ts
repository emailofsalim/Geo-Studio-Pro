// ============================================================================
// BhuNex Studio — AI output guard
// ----------------------------------------------------------------------------
// Validates geometry proposed by a language model before it becomes project
// data.
//
// The AI copilot asks a model for a JSON block and puts whatever comes back
// straight into the feature array, which is then drawn on the map, measured,
// saved into the project and exported to KML and DXF. Model output is
// untrusted: it can be the wrong shape, carry non-numeric coordinates, or
// invent a thousand points. Downstream code reads `f.pts[0].a` and `f.geom`
// without checking, so a malformed feature either crashes a tab or, worse,
// silently becomes geometry in a survey deliverable.
//
// This guard was distilled from an unreferenced AIService class that carried a
// whitelist for an operation-command architecture the app never built. The
// whitelist guarded nothing real; the idea underneath it — do not trust model
// output — applies exactly to the path that does exist.
//
// The guard is deliberately strict and silent about it: a feature that does
// not validate is dropped and counted, never repaired. Guessing what the model
// meant is how fabricated geometry gets into a survey.
// ============================================================================

import { GeoFeature, GeoPoint } from '../types';

/** Hard ceiling on features accepted from one model response. */
export const MAX_AI_FEATURES = 500;

/** Hard ceiling on points in a single AI-proposed feature. */
export const MAX_AI_POINTS_PER_FEATURE = 10000;

export interface AiFeatureGuardResult {
  /** Features that passed every check. Safe to render, store and export. */
  features: GeoFeature[];
  /** How many candidates were rejected. */
  rejected: number;
  /** Human-readable reasons, deduplicated, for showing to the user. */
  reasons: string[];
}

const GEOM_TYPES = new Set(['point', 'line', 'polygon']);
const KIND_TYPES = new Set(['ll', 'en']);

/** Minimum points a geometry needs to be meaningful. */
const MIN_POINTS: Record<string, number> = { point: 1, line: 2, polygon: 3 };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Checks one coordinate against the bounds its declared frame allows.
 *
 * A geographic point outside lon/lat range, or a projected point outside the
 * span a UTM grid can express, is not a coordinate the model got slightly
 * wrong — it is not a coordinate at all.
 */
function pointInRange(p: GeoPoint, kind: string): boolean {
  if (kind === 'll') return Math.abs(p.a) <= 180 && Math.abs(p.b) <= 90;
  // Projected: eastings sit within a 0-1,000,000 m zone width and northings
  // within the +/-10,000,000 m the false northing allows.
  return Math.abs(p.a) <= 1_000_000 && Math.abs(p.b) <= 10_000_000;
}

function sanitisePoints(raw: unknown, kind: string): GeoPoint[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_AI_POINTS_PER_FEATURE) return null;

  const pts: GeoPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const { a, b } = item as Record<string, unknown>;
    if (!isFiniteNumber(a) || !isFiniteNumber(b)) return null;
    const pt: GeoPoint = { a, b };
    if (!pointInRange(pt, kind)) return null;
    pts.push(pt);
  }
  return pts;
}

/**
 * Strips a model-supplied properties bag down to primitives.
 *
 * Nested objects and functions are dropped rather than carried into the
 * project, where they would end up serialised into an export.
 */
function sanitiseProps(raw: unknown): Record<string, string | number | boolean> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' || typeof v === 'boolean') out[k] = v;
    else if (isFiniteNumber(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Validates a model's proposed features.
 *
 * Accepts whatever the model returned — an array, a `{features: [...]}` object
 * or a single feature — and returns only the entries that are structurally
 * sound, with a count and reasons for everything discarded.
 */
export function guardAiFeatures(raw: unknown): AiFeatureGuardResult {
  const reasons = new Set<string>();

  let candidates: unknown[];
  if (Array.isArray(raw)) {
    candidates = raw;
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as any).features)) {
    candidates = (raw as any).features;
  } else if (raw && typeof raw === 'object' && (raw as any).pts) {
    candidates = [raw];
  } else {
    return {
      features: [],
      rejected: 0,
      reasons: ['The assistant did not return geometry in a recognised shape.']
    };
  }

  let rejected = 0;
  const features: GeoFeature[] = [];

  for (const c of candidates) {
    if (features.length >= MAX_AI_FEATURES) {
      rejected += candidates.length - features.length;
      reasons.add(`Only the first ${MAX_AI_FEATURES} generated features were accepted.`);
      break;
    }

    if (!c || typeof c !== 'object') {
      rejected++;
      reasons.add('Discarded an entry that was not a feature object.');
      continue;
    }
    const f = c as Record<string, unknown>;

    const geom = String(f.geom ?? '').toLowerCase();
    if (!GEOM_TYPES.has(geom)) {
      rejected++;
      reasons.add('Discarded a feature with no valid geometry type.');
      continue;
    }

    // Frame must be declared. Assuming one is how coordinates end up in the
    // wrong part of the world.
    const kind = String(f.kind ?? '').toLowerCase();
    if (!KIND_TYPES.has(kind)) {
      rejected++;
      reasons.add('Discarded a feature that did not declare whether its coordinates are geographic or projected.');
      continue;
    }

    const pts = sanitisePoints(f.pts, kind);
    if (!pts) {
      rejected++;
      reasons.add('Discarded a feature with missing or out-of-range coordinates.');
      continue;
    }
    if (pts.length < MIN_POINTS[geom]) {
      rejected++;
      reasons.add(`Discarded a ${geom} with too few points to form one.`);
      continue;
    }

    features.push({
      name: typeof f.name === 'string' && f.name.trim() ? f.name.trim().slice(0, 120) : 'AI feature',
      geom: geom as GeoFeature['geom'],
      kind: kind as GeoFeature['kind'],
      pts,
      props: sanitiseProps(f.props)
    });
  }

  return { features, rejected, reasons: [...reasons] };
}
