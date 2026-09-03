import { describe, it, expect } from 'vitest';
import { describeAiFallback } from '../aiServiceStatus';

describe('explaining an AI fallback', () => {
  it('names a missing deployment for what it is', () => {
    // The case that hid for as long as it did: the endpoints were not deployed,
    // every answer quietly came from the local engine, and nothing said so.
    const m = describeAiFallback(404);
    expect(m).toMatch(/not deployed/i);
    expect(m).toMatch(/404/);
  });

  it('distinguishes rate limiting from absence', () => {
    expect(describeAiFallback(429)).toMatch(/rate limiting/i);
    expect(describeAiFallback(429)).not.toMatch(/not deployed/i);
  });

  it('reports a refusal with its status', () => {
    expect(describeAiFallback(401)).toMatch(/refused/i);
    expect(describeAiFallback(403)).toMatch(/403/);
  });

  it('reports an oversized request', () => {
    expect(describeAiFallback(413)).toMatch(/larger than/i);
  });

  it('falls back to the bare status for anything else', () => {
    expect(describeAiFallback(500)).toMatch(/returned 500/);
  });

  it('describes a network failure, which has no status', () => {
    const m = describeAiFallback(null, new Error('Failed to fetch'));
    expect(m).toMatch(/could not be reached/i);
    expect(m).toMatch(/Failed to fetch/);
  });

  it('says something useful even with no information at all', () => {
    const m = describeAiFallback(null);
    expect(m).toMatch(/could not be reached/i);
    expect(m.length).toBeGreaterThan(20);
  });

  it('always says the answer came from the local engine', () => {
    // Whatever went wrong, the user must know which engine answered -- the
    // point is that a substituted answer is never presented as the real one.
    for (const s of [404, 429, 401, 413, 500, null]) {
      expect(describeAiFallback(s as any), String(s)).toMatch(/local engine/i);
    }
  });
});
