// ============================================================================
// BhuNex Studio — surveyed point list parsing
// ----------------------------------------------------------------------------
// Reads a small pasted list of survey points. File imports go through the
// universal data bridge; this is for the case where a surveyor has a handful
// of reduced levels in front of them and types or pastes them in.
// ============================================================================

import type { Point3D } from '../engines/tin';

/**
 * Reads a pasted list of survey points as `E, N, RL` per line.
 *
 * Deliberately strict about column order. A line carrying a non-numeric label
 * first ("STK1, 254800, 2605200, 112.5") is unambiguous, so the label is
 * dropped; a line with four or more numbers is not — it could be a point
 * number followed by E, N, RL, or E, N, RL followed by a code — so it is
 * rejected with a message rather than read on a guess. Reading the wrong
 * columns would put a point number where an easting belongs and produce a
 * volume that looks perfectly reasonable.
 */
export function parseSurfacePoints(text: string): { pts: Point3D[]; rejected: string[] } {
  const pts: Point3D[] = [];
  const rejected: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    let tokens = line.split(/[,;\t]+|\s+/).filter(Boolean);
    // An unambiguous leading label.
    if (tokens.length >= 4 && !Number.isFinite(parseFloat(tokens[0]))) tokens = tokens.slice(1);

    const nums = tokens.map(parseFloat);
    if (nums.length > 3 && nums.every(Number.isFinite)) {
      rejected.push(`${line}  — more than three numbers; keep only E, N, RL`);
      continue;
    }
    if (nums.length < 3 || !Number.isFinite(nums[0]) || !Number.isFinite(nums[1]) || !Number.isFinite(nums[2])) {
      rejected.push(`${line}  — needs three numbers: E, N, RL`);
      continue;
    }
    pts.push({ x: nums[0], y: nums[1], z: nums[2] });
  }

  return { pts, rejected };
}
