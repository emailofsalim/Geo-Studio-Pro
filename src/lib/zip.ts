import { crc32 } from './geodesy';

const DEF_LEN_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const DEF_LEN_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DEF_DST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DEF_DST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

function defLitCode(v: number): [number, number] {
  if (v <= 143) return [0x30 + v, 8];
  if (v <= 255) return [0x190 + (v - 144), 9];
  if (v <= 279) return [v - 256, 7];
  return [0xC0 + (v - 280), 8];
}

export function deflateRawSync(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  let bitBuf = 0, bitCnt = 0;

  function putBits(v: number, n: number) {
    bitBuf |= (v << bitCnt);
    bitCnt += n;
    while (bitCnt >= 8) {
      out.push(bitBuf & 255);
      bitBuf >>>= 8;
      bitCnt -= 8;
    }
  }

  function putCode(code: number, len: number) {
    let r = 0;
    for (let i = 0; i < len; i++) r = (r << 1) | ((code >>> i) & 1);
    putBits(r, len);
  }

  function endBlock() {
    const e = defLitCode(256);
    putCode(e[0], e[1]);
    if (bitCnt > 0) out.push(bitBuf & 255);
  }

  const n = src.length;
  putBits(1, 1);
  putBits(1, 2);
  if (n === 0) {
    endBlock();
    return new Uint8Array(out);
  }

  const head = new Int32Array(65536).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const hash3 = (i: number) => ((src[i] << 10) ^ (src[i + 1] << 5) ^ src[i + 2]) & 65535;
  const insert = (i: number) => {
    if (i + 3 <= n) {
      const h = hash3(i);
      prev[i] = head[h];
      head[h] = i;
    }
  };

  let i = 0;
  while (i < n) {
    let bestLen = 0, bestDist = 0;
    if (i + 3 <= n) {
      let j = head[hash3(i)], chain = 0;
      const maxLen = Math.min(258, n - i);
      while (j >= 0 && (i - j) <= 32768 && chain < 128) {
        if (src[j + bestLen] === src[i + bestLen]) {
          let l = 0;
          while (l < maxLen && src[j + l] === src[i + l]) l++;
          if (l > bestLen) {
            bestLen = l;
            bestDist = i - j;
            if (l >= maxLen) break;
          }
        }
        j = prev[j];
        chain++;
      }
    }
    if (bestLen >= 3) {
      let li = DEF_LEN_BASE.length - 1;
      while (DEF_LEN_BASE[li] > bestLen) li--;
      const lc = defLitCode(257 + li);
      putCode(lc[0], lc[1]);
      if (DEF_LEN_EXTRA[li]) putBits(bestLen - DEF_LEN_BASE[li], DEF_LEN_EXTRA[li]);
      
      let di = DEF_DST_BASE.length - 1;
      while (DEF_DST_BASE[di] > bestDist) di--;
      putCode(di, 5);
      if (DEF_DST_EXTRA[di]) putBits(bestDist - DEF_DST_BASE[di], DEF_DST_EXTRA[di]);
      
      for (let k = 0; k < bestLen; k++) insert(i + k);
      i += bestLen;
    } else {
      const c = defLitCode(src[i]);
      putCode(c[0], c[1]);
      insert(i);
      i++;
    }
  }
  endBlock();
  return new Uint8Array(out);
}

function dosDateTime(d: Date = new Date()) {
  let y = d.getFullYear();
  if (y < 1980) y = 1980;
  return {
    time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31),
    date: (((y - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31)
  };
}

export interface ZipFileEntry {
  name: string;
  data: Uint8Array;
}

export function makeZip(files: ZipFileEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => [v & 255, (v >>> 8) & 255];
  const u32 = (v: number) => {
    v = Math.floor(v);
    return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  };
  const u64 = (v: number) => {
    const a: number[] = [];
    let x = BigInt(Math.floor(v));
    for (let i = 0; i < 8; i++) {
      a.push(Number(x & 255n));
      x >>= 8n;
    }
    return a;
  };

  const dt = dosDateTime();
  const FLAGS = 0x0800; // UTF-8 filename

  for (const f of files) {
    const nameB = enc.encode(f.name);
    const raw = f.data;
    const crc = crc32(raw);

    let method = 0;
    let body = raw;
    try {
      const packed = deflateRawSync(raw);
      if (packed.length < raw.length) {
        method = 8;
        body = packed;
      }
    } catch {
      method = 0;
      body = raw;
    }

    const lh = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(FLAGS), ...u16(method),
      ...u16(dt.time), ...u16(dt.date), ...u32(crc), ...u32(body.length),
      ...u32(raw.length), ...u16(nameB.length), ...u16(0)
    ]);
    chunks.push(lh, nameB, body);

    central.push(
      new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(FLAGS), ...u16(method),
        ...u16(dt.time), ...u16(dt.date), ...u32(crc), ...u32(body.length),
        ...u32(raw.length), ...u16(nameB.length), ...u16(0), ...u16(0), ...u16(0),
        ...u16(0), ...u32(0), ...u32(offset)
      ]),
      nameB
    );
    offset += lh.length + nameB.length + body.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  central.forEach(c => (cdSize += c.length));

  const n = files.length;
  const MAX16 = 0xFFFF;
  const MAX32 = 0xFFFFFFFF;
  const need64 = n > MAX16 || cdSize > MAX32 || cdStart > MAX32;

  const tail: Uint8Array[] = [];
  if (need64) {
    tail.push(
      new Uint8Array([
        ...u32(0x06064b50), ...u64(44), ...u16(45), ...u16(45),
        ...u32(0), ...u32(0), ...u64(n), ...u64(n), ...u64(cdSize), ...u64(cdStart)
      ])
    );
    tail.push(new Uint8Array([...u32(0x07064b50), ...u32(0), ...u64(cdStart + cdSize), ...u32(1)]));
  }

  const eN = need64 ? MAX16 : n;
  const eSize = cdSize > MAX32 ? MAX32 : cdSize;
  const eStart = cdStart > MAX32 ? MAX32 : cdStart;
  tail.push(
    new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(eN), ...u16(eN),
      ...u32(eSize), ...u32(eStart), ...u16(0)
    ])
  );

  const all = [...chunks, ...central, ...tail];
  let total = 0;
  all.forEach(a => (total += a.length));
  const out = new Uint8Array(total);
  let p = 0;
  all.forEach(a => {
    out.set(a, p);
    p += a.length;
  });
  return out;
}

export async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();

  // Corrupt deflate data rejects on BOTH sides of the stream. The read side is
  // awaited below and propagates to the caller, which handles it. The write
  // side used to be fire-and-forget, so a damaged archive raised two unhandled
  // rejections that reached the window as uncaught errors — visible when
  // importing a tampered .bhnx package, even though the import itself had
  // already reported the fault and recovered.
  //
  // The write-side rejection is swallowed because it is the same fault the
  // reader reports; letting both through would surface one failure twice.
  const pumped = (async () => {
    await w.write(bytes);
    await w.close();
  })().catch(() => undefined);

  const chunks: Uint8Array[] = [];
  const r = ds.readable.getReader();
  try {
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    await pumped;
  }
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function _u16(b: Uint8Array, i: number) {
  return b[i] | (b[i + 1] << 8);
}
function _u32(b: Uint8Array, i: number) {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

export async function readZip(buf: ArrayBuffer): Promise<Record<string, Uint8Array>> {
  const b = new Uint8Array(buf);
  const files: Record<string, Uint8Array> = {};
  const dec = new TextDecoder();

  async function body(method: number, bytes: Uint8Array) {
    return method === 0 ? bytes : await inflateRaw(bytes);
  }

  // Locate EOCD
  let eocd = -1;
  const floor = Math.max(0, b.length - 65557);
  for (let p = b.length - 22; p >= floor; p--) {
    if (_u32(b, p) === 0x06054b50) {
      eocd = p;
      break;
    }
  }

  if (eocd >= 0) {
    const count = _u16(b, eocd + 10);
    let q = _u32(b, eocd + 16);
    let read = 0;
    for (let c = 0; c < count && q + 46 <= b.length; c++) {
      if (_u32(b, q) !== 0x02014b50) break;
      const method = _u16(b, q + 10);
      const csize = _u32(b, q + 20);
      const nlen = _u16(b, q + 28);
      const elen = _u16(b, q + 30);
      const clen = _u16(b, q + 32);
      const lho = _u32(b, q + 42);
      const name = dec.decode(b.slice(q + 46, q + 46 + nlen));
      q += 46 + nlen + elen + clen;
      if (!name || name.endsWith('/')) continue;
      if (lho + 30 > b.length || _u32(b, lho) !== 0x04034b50) continue;
      const ds = lho + 30 + _u16(b, lho + 26) + _u16(b, lho + 28);
      try {
        files[name] = await body(method, b.slice(ds, ds + csize));
        read++;
      } catch {}
    }
    if (read > 0) return files;
  }

  // Fallback: local headers
  let i = 0;
  while (i + 30 <= b.length && _u32(b, i) === 0x04034b50) {
    const flags = _u16(b, i + 6);
    const method = _u16(b, i + 8);
    let csize = _u32(b, i + 18);
    const nlen = _u16(b, i + 26);
    const elen = _u16(b, i + 28);
    const name = dec.decode(b.slice(i + 30, i + 30 + nlen));
    const ds = i + 30 + nlen + elen;
    let next: number;
    if ((flags & 8) && csize === 0) {
      let k = ds, found = -1;
      while (k + 16 <= b.length) {
        if (_u32(b, k) === 0x08074b50 && _u32(b, k + 8) === k - ds) {
          found = k;
          break;
        }
        k++;
      }
      csize = found >= 0 ? found - ds : b.length - ds;
      next = found >= 0 ? found + 16 : b.length;
    } else {
      next = ds + csize;
    }
    if (name && !name.endsWith('/')) {
      try {
        files[name] = await body(method, b.slice(ds, ds + csize));
      } catch {}
    }
    if (next <= i) break;
    i = next;
  }
  return files;
}

export function downloadBlob(data: Uint8Array | string | Blob, filename: string, mime: string = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : (typeof data === 'string' ? new Blob([data], { type: mime }) : new Blob([data], { type: mime }));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

export function zipFiles(files: ZipFileEntry[]): Uint8Array {
  return makeZip(files);
}

