import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The worker module is replaced so these tests exercise the client's routing
// and fallback logic rather than the parser itself.
vi.mock('../universalDataBridge', () => ({
  detectAndParseGeospatialFile: vi.fn(async () => ({
    formatId: 'csv',
    formatName: 'CSV Coordinate Table',
    features: [],
    featureCount: 0
  }))
}));

import { parseImportFile, __resetParseClientForTests, WORKER_THRESHOLD_BYTES } from '../parseClient';
import { detectAndParseGeospatialFile } from '../universalDataBridge';

/** Builds a File of a given size without allocating the whole thing eagerly. */
function fileOfSize(bytes: number, name = 'points.csv'): File {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'text/csv' });
  return new File([blob], name, { type: 'text/csv' });
}

const originalWorker = (globalThis as any).Worker;

beforeEach(() => {
  __resetParseClientForTests();
  vi.mocked(detectAndParseGeospatialFile).mockClear();
});

afterEach(() => {
  (globalThis as any).Worker = originalWorker;
  __resetParseClientForTests();
});

describe('parse client — routing by size', () => {
  it('parses a small file inline rather than paying for a worker round trip', async () => {
    // Measured: below about a megabyte the inline parse is already
    // imperceptible, and shipping the result back costs more than it saves.
    const outcome = await parseImportFile(fileOfSize(1024), '45N');
    expect(outcome.strategy).toBe('main-thread');
    expect(detectAndParseGeospatialFile).toHaveBeenCalledTimes(1);
  });

  it('keeps small files inline right up to the threshold', async () => {
    const outcome = await parseImportFile(fileOfSize(WORKER_THRESHOLD_BYTES - 1), '45N');
    expect(outcome.strategy).toBe('main-thread');
  });

  it('reports the strategy and a duration', async () => {
    const outcome = await parseImportFile(fileOfSize(512), '45N');
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
    expect(outcome.result.formatName).toBe('CSV Coordinate Table');
  });
});

describe('parse client — fallback when no worker is available', () => {
  it('falls back inline when the environment has no Worker at all', async () => {
    delete (globalThis as any).Worker;
    __resetParseClientForTests();

    const outcome = await parseImportFile(fileOfSize(WORKER_THRESHOLD_BYTES + 1), '45N');
    expect(outcome.strategy).toBe('main-thread');
    expect(detectAndParseGeospatialFile).toHaveBeenCalledTimes(1);
  });

  it('falls back inline when constructing a Worker throws', async () => {
    // Embedded WebViews and some locked-down enterprise policies block workers.
    // Failing the import outright there would be worse than a slow import.
    (globalThis as any).Worker = function () {
      throw new Error('blocked by policy');
    };
    __resetParseClientForTests();

    const outcome = await parseImportFile(fileOfSize(WORKER_THRESHOLD_BYTES + 1), '45N');
    expect(outcome.strategy).toBe('main-thread');
    expect(outcome.result.formatName).toBe('CSV Coordinate Table');
  });

  it('does not retry inline when the worker rejects the file for a real reason', async () => {
    // A parse error is a genuine finding about the file - "this LAZ is
    // compressed" - and must surface, not be masked by a second identical run.
    class FakeWorker {
      onmessage: any;
      listeners: Record<string, Function[]> = {};
      addEventListener(type: string, fn: Function) {
        (this.listeners[type] ||= []).push(fn);
      }
      postMessage(req: any) {
        queueMicrotask(() => {
          for (const fn of this.listeners['message'] || []) {
            fn({
              data: {
                id: req.id,
                ok: false,
                error: 'This is a compressed LAZ file.'
              }
            });
          }
        });
      }
      terminate() {}
    }
    (globalThis as any).Worker = FakeWorker;
    __resetParseClientForTests();

    await expect(parseImportFile(fileOfSize(WORKER_THRESHOLD_BYTES + 1), '45N')).rejects.toThrow(
      /compressed LAZ/i
    );
    expect(detectAndParseGeospatialFile).not.toHaveBeenCalled();
  });

  it('uses the worker result when one succeeds', async () => {
    class FakeWorker {
      listeners: Record<string, Function[]> = {};
      addEventListener(type: string, fn: Function) {
        (this.listeners[type] ||= []).push(fn);
      }
      postMessage(req: any) {
        queueMicrotask(() => {
          for (const fn of this.listeners['message'] || []) {
            fn({
              data: {
                id: req.id,
                ok: true,
                parseMs: 42,
                result: { formatId: 'csv', formatName: 'From worker', features: [], featureCount: 7 }
              }
            });
          }
        });
      }
      terminate() {}
    }
    (globalThis as any).Worker = FakeWorker;
    __resetParseClientForTests();

    const outcome = await parseImportFile(fileOfSize(WORKER_THRESHOLD_BYTES + 1), '45N');
    expect(outcome.strategy).toBe('worker');
    expect(outcome.result.formatName).toBe('From worker');
    expect(outcome.parseMs).toBe(42);
    // The inline parser must not have been touched.
    expect(detectAndParseGeospatialFile).not.toHaveBeenCalled();
  });
});
