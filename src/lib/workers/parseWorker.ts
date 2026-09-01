/// <reference lib="webworker" />
// ============================================================================
// BhuNex Studio — import parsing worker
// ----------------------------------------------------------------------------
// Runs format detection and parsing off the main thread.
//
// A field survey CSV or a cadastral shapefile can carry tens of thousands of
// features. Parsing one on the main thread freezes every interaction until it
// finishes - no scrolling, no cancel button, and on a phone the browser may
// decide the page has hung. The work is pure computation over a File, so it
// belongs here.
//
// This module imports the same parser the main thread uses; there is no second
// implementation to drift out of step. It must only ever call the PARSE side of
// that module: the export side touches `document` and `localStorage`, which do
// not exist in a worker.
// ============================================================================

import { detectAndParseGeospatialFile, type DetectedImportResult } from '../universalDataBridge';

export interface ParseRequest {
  id: number;
  file: File;
  workingZone: string;
}

/** Reply from the worker. */
export type ParseResponse =
  | {
      id: number;
      ok: true;
      result: DetectedImportResult;
      /** Time spent parsing inside the worker, ms (excludes transfer). */
      parseMs: number;
    }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', async (event: MessageEvent<ParseRequest>) => {
  const { id, file, workingZone } = event.data;
  try {
    const t0 = Date.now();
    const result = await detectAndParseGeospatialFile(file, workingZone);
    const parseMs = Date.now() - t0;

    // `rawRows` duplicates the parsed features as raw strings and is read by
    // nothing in the application. Structured-cloning it across the worker
    // boundary costs more than the parse itself on a large table - a 600k-row
    // CSV ships 600k extra string arrays for no consumer - so it is dropped
    // here. Restore it deliberately if a caller ever needs it.
    if (result.rawRows) delete result.rawRows;

    const response: ParseResponse = { id, ok: true, result, parseMs };
    ctx.postMessage(response);
  } catch (err: any) {
    const response: ParseResponse = {
      id,
      ok: false,
      error: err?.message || 'The file could not be parsed.'
    };
    ctx.postMessage(response);
  }
});
