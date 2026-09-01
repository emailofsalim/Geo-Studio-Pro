// ============================================================================
// BhuNex Studio — import parsing client
// ----------------------------------------------------------------------------
// Front door for importing a file. Hands the work to a Web Worker so a large
// dataset does not freeze the UI, and falls back to the main thread when a
// worker is unavailable.
//
// The fallback matters: workers are blocked in some embedded WebViews and in a
// few locked-down enterprise configurations. Failing to import at all in those
// environments would be a worse outcome than a slow import, so the same parser
// runs inline instead.
// ============================================================================

import {
  detectAndParseGeospatialFile,
  type DetectedImportResult
} from './universalDataBridge';
import type { ParseRequest, ParseResponse } from './workers/parseWorker';

/** How the last parse actually ran — useful in diagnostics and in tests. */
export type ParseStrategy = 'worker' | 'main-thread';

export interface ParseOutcome {
  result: DetectedImportResult;
  strategy: ParseStrategy;
  /** Wall-clock duration of the whole operation, ms. */
  durationMs: number;
  /** Parse time inside the worker, ms; absent on the inline path. The gap
   *  between this and durationMs is the cost of transferring the result. */
  parseMs?: number;
}

/**
 * File size above which parsing moves to the worker.
 *
 * Chosen from measurement, not taste. Parsing a CSV in a worker is not free:
 * the parsed features have to be structured-cloned back, and that clone costs
 * more than the parse itself on a large table. Measured on this codebase,
 * round trip vs inline:
 *
 *     2,000 rows  (~0.1 MB)    257 ms worker   274 ms inline
 *    20,000 rows  (~0.8 MB)    269 ms worker   267 ms inline
 *   100,000 rows  (~3.9 MB)  1,005 ms worker   576 ms inline
 *   600,000 rows  (~23 MB)   5,895 ms worker 2,201 ms inline
 *
 * So below roughly a megabyte the worker buys nothing - the inline parse is
 * already imperceptible - and above it the worker costs wall time but keeps
 * the interface alive: the 600k case rendered 76 animation frames during the
 * worker parse against 10 inline, which is the difference between a spinner
 * that animates and a page the browser may offer to kill.
 *
 * The threshold sits just above the point where an inline parse stops being
 * imperceptible.
 */
export const WORKER_THRESHOLD_BYTES = 2 * 1024 * 1024;

let worker: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;

/** Pending requests, keyed by request id. */
const pending = new Map<
  number,
  { resolve: (r: { result: DetectedImportResult; parseMs?: number }) => void; reject: (e: Error) => void }
>();

function disposeWorker(reason: string) {
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* the worker may already be gone */
    }
    worker = null;
  }
  // Anything still in flight can never be answered now.
  for (const [, entry] of pending) entry.reject(new Error(reason));
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined') {
    workerUnavailable = true;
    return null;
  }

  try {
    worker = new Worker(new URL('./workers/parseWorker.ts', import.meta.url), {
      type: 'module'
    });
  } catch {
    // Blocked by policy, or module workers unsupported. Use the main thread.
    workerUnavailable = true;
    return null;
  }

  worker.addEventListener('message', (event: MessageEvent<ParseResponse>) => {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.ok && msg.result) entry.resolve({ result: msg.result, parseMs: msg.parseMs });
    else entry.reject(new Error(msg.error || 'The import worker returned no result.'));
  });

  worker.addEventListener('error', () => {
    // A worker-level error leaves the instance unusable; drop it and let the
    // next call fall back to the main thread rather than hanging forever.
    workerUnavailable = true;
    disposeWorker('The import worker stopped unexpectedly.');
  });

  return worker;
}

function parseInWorker(file: File, workingZone: string): Promise<{ result: DetectedImportResult; parseMs?: number }> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('No worker available.'));

  const id = nextRequestId++;
  const request: ParseRequest = { id, file, workingZone };

  return new Promise<{ result: DetectedImportResult; parseMs?: number }>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      w.postMessage(request);
    } catch (err: any) {
      pending.delete(id);
      reject(new Error(err?.message || 'The file could not be sent to the import worker.'));
    }
  });
}

/**
 * Parses an import file, off the main thread when the file is big enough to be
 * worth it (see WORKER_THRESHOLD_BYTES).
 *
 * A worker failure that is not the file's fault (worker blocked, module load
 * refused) retries inline. A parse error is a genuine result about the file -
 * "this LAZ file is compressed", "this TIFF has no georeferencing" - and is
 * rethrown rather than retried, so the user sees the real reason instead of it
 * being masked by a second identical failure.
 */
export async function parseImportFile(
  file: File,
  workingZone: string
): Promise<ParseOutcome> {
  const started = Date.now();

  // Small files parse faster inline than they can be shipped to a worker and
  // back, and they are too quick to block anything.
  const worthOffloading = file.size >= WORKER_THRESHOLD_BYTES;

  if (worthOffloading && getWorker()) {
    try {
      const { result, parseMs } = await parseInWorker(file, workingZone);
      const durationMs = Date.now() - started;
      return { result, strategy: 'worker', durationMs, parseMs };
    } catch (err: any) {
      // Only fall back for infrastructure failures, never to re-run a parse
      // that legitimately rejected the file.
      const infrastructureFailure =
        workerUnavailable ||
        /no worker available|stopped unexpectedly|could not be sent/i.test(err?.message || '');
      if (!infrastructureFailure) throw err;
    }
  }

  const result = await detectAndParseGeospatialFile(file, workingZone);
  return { result, strategy: 'main-thread', durationMs: Date.now() - started };
}

/** Releases the worker. Call when the app is tearing down. */
export function releaseParseWorker() {
  disposeWorker('Import worker released.');
}

/** Test seam: forget any cached worker state. */
export function __resetParseClientForTests() {
  disposeWorker('reset');
  workerUnavailable = false;
  nextRequestId = 1;
}
