import { describe, it, expect } from 'vitest';
import { parseImportFile } from '../parseClient';

// ---------------------------------------------------------------------------
// A zone refusal reaches the user through the real import front door
// ---------------------------------------------------------------------------
// parseUtmZoneStr now throws instead of returning Zone 45, and the import path
// has three layers between it and the user: the worker, the client's
// retry-on-infrastructure-failure logic, and the modal. A refusal swallowed or
// retried anywhere in there would leave the import failing for no stated
// reason, which is no better than the silently wrong zone it replaced.
//
// This uses the real parser rather than the mocked one in parseClient.test.ts,
// so it exercises the actual refusal.

/** Under the worker threshold, so this runs inline and needs no worker. */
const smallCsv = () =>
  new File([new Blob(['Easting,Northing\n254800,2605200\n'], { type: 'text/csv' })], 'p.csv', {
    type: 'text/csv'
  });

describe('importing with an unreadable zone', () => {
  it.each(['', 'nonsense', '99N', '45X'])('states the reason for %o', async bad => {
    await expect(parseImportFile(smallCsv(), bad)).rejects.toThrow(/not a valid UTM zone/i);
  });

  it('is not retried into a second identical failure', async () => {
    // The client falls back to an inline parse only for infrastructure
    // failures. A zone refusal is a genuine answer about the request, so it
    // must surface as itself rather than as a masked second attempt.
    let message = '';
    try {
      await parseImportFile(smallCsv(), 'nonsense');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/not a valid UTM zone/i);
    expect(message).not.toMatch(/worker|unavailable|stopped unexpectedly/i);
  });

  it('imports normally for a zone it can read', async () => {
    const out = await parseImportFile(smallCsv(), '43S');
    expect(out.result.featureCount).toBeGreaterThan(0);
  });
});
