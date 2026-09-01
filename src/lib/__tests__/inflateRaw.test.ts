import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { inflateRaw } from '../zip';

/** Compresses with the platform's own deflate so the round trip is real. */
async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  const pumped = (async () => {
    await w.write(bytes);
    await w.close();
  })();
  const chunks: Uint8Array[] = [];
  const r = cs.readable.getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    chunks.push(value);
  }
  await pumped;
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('inflateRaw', () => {
  it('round trips text through the platform deflate', async () => {
    const original = utf8('254800.00, 2605200.00, 112.50\n'.repeat(200));
    const back = await inflateRaw(await deflateRaw(original));
    expect(back).toEqual(original);
  });

  it('round trips an empty payload', async () => {
    expect(await inflateRaw(await deflateRaw(new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });

  it('round trips binary that spans several stream chunks', async () => {
    const big = new Uint8Array(300_000);
    for (let i = 0; i < big.length; i++) big[i] = (i * 31) & 0xff;
    const back = await inflateRaw(await deflateRaw(big));
    expect(back.length).toBe(big.length);
    expect(back).toEqual(big);
  });

  it('rejects on corrupt data rather than returning something plausible', async () => {
    const good = await deflateRaw(utf8('survey data'));
    const bad = Uint8Array.from(good);
    for (let i = Math.floor(bad.length / 2); i < bad.length; i++) bad[i] ^= 0xff;
    await expect(inflateRaw(bad)).rejects.toThrow();
  });

  it('rejects on data that is not deflate at all', async () => {
    await expect(inflateRaw(utf8('this is not compressed'))).rejects.toThrow();
  });
});

describe('inflateRaw — no unhandled rejections', () => {
  let unhandled: unknown[] = [];
  const onUnhandled = (r: unknown) => unhandled.push(r);

  beforeEach(() => {
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
  });
  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  it('does not leak a second rejection from the write side of the stream', async () => {
    // The regression this guards: `w.write(bytes)` and `w.close()` were called
    // without being awaited or caught. Corrupt data rejects on both sides of a
    // DecompressionStream, so importing a damaged .bhnx package raised two
    // uncaught errors in the page even though the import had handled the
    // failure and recovered.
    await expect(inflateRaw(utf8('definitely not deflate'))).rejects.toThrow();

    // Give the microtask queue and the process a turn to surface any stray
    // rejection before asserting there was none.
    await new Promise(res => setTimeout(res, 50));
    expect(unhandled).toHaveLength(0);
  });

  it('stays clean across repeated failures', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(inflateRaw(utf8(`garbage ${i}`))).rejects.toThrow();
    }
    await new Promise(res => setTimeout(res, 50));
    expect(unhandled).toHaveLength(0);
  });

  it('stays clean on a successful inflate too', async () => {
    await inflateRaw(await deflateRaw(utf8('fine')));
    await new Promise(res => setTimeout(res, 50));
    expect(unhandled).toHaveLength(0);
  });
});
