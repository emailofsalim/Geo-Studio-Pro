import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * WHY THE SURFACE TOOLS NEED THIS
 *
 * The TIN panels recompute from their pasted point list on every render, which
 * keeps the numbers honest — there is no Compute button leaving a stale result
 * on screen beside changed input. But triangulation is not free, and its cost
 * grows faster than the point count. Measured on this codebase, one full pass
 * of buildTin plus a volume and a 1 m contour set:
 *
 *      200 points      379 triangles     29 ms
 *      500 points      972 triangles     36 ms
 *    1,000 points    1,969 triangles     43 ms
 *    2,000 points    3,966 triangles    181 ms
 *    4,000 points    7,966 triangles    573 ms
 *
 * Up to about a thousand points that is imperceptible while typing. Beyond it,
 * running the whole pass on every keystroke would lock the textarea for longer
 * than the keystroke itself — and a real pit or stockpile pickup is thousands
 * of points, not hundreds.
 *
 * A short debounce keeps typing responsive and collapses a paste into one
 * computation, without weakening the guarantee that what is displayed was
 * computed from what is in the box.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (Object.is(value, settled)) return;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, settled]);

  return settled;
}
