import { GeoFeature, GeoPoint, PhotoLandmark } from '../types';
import { lonLatToUtm, utmToLonLat } from './geodesy';
import { makeZip, ZipFileEntry, readZip } from './zip';

export const PROV = {
  author: 'Md Salim Ansari',
  org: 'Personal project',
  email: 'emailofsalim@gmail.com',
  line: 'Geo Studio © Md Salim Ansari - personal project.'
};

export function stripBOM(t: string): string {
  return t && t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t;
}

export function xmlesc(s: any): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function kmlColor(hex: string): string {
  let h = String(hex == null ? '' : hex).trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  }
  if (!/^[0-9a-f]{6}$/.test(h)) h = '0e7c86';
  return 'ff' + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
}

export function r8(v: number): number {
  return Math.round(v * 1e8) / 1e8;
}

export function safeFileName(s: string, def: string = 'output'): string {
  const clean = String(s == null ? '' : s)
    .trim()
    .replace(/[^A-Za-z0-9_\-\. ]+/g, '_')
    .replace(/\s+/g, '_');
  return clean || def;
}

export function baseName(fn: string): string {
  return String(fn || '').replace(/\.[^.]+$/, '');
}

// ---------------- CSV Parser & Formatter ----------------
function csvIsComment(line: string, delim: string): boolean {
  const t = String(line == null ? '' : line).replace(/^[ \t]+/, '');
  if (t.charAt(0) !== '#') return false;
  if (/^#(\s|$)/.test(t)) return true;
  return t.indexOf(delim) < 0;
}

function csvSniffDelim(text: string): string {
  const CANDIDATES = [',', ';', '\t', '|'];
  const lines = String(text == null ? '' : text).split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const bare = line.replace(/"(?:[^"]|"")*"/g, '');
    let best = ',', bestCount = -1;
    for (let c = 0; c < CANDIDATES.length; c++) {
      const d = CANDIDATES[c];
      let n = 0;
      for (let k = 0; k < bare.length; k++) if (bare.charAt(k) === d) n++;
      if (n > bestCount) { bestCount = n; best = d; }
    }
    if (bestCount <= 0) {
      if (csvIsComment(line, ',')) continue;
      return ',';
    }
    if (csvIsComment(line, best)) continue;
    return best;
  }
  return ',';
}

export function parseCSV(text: string): string[][] {
  text = String(text == null ? '' : text);
  const DELIM = csvSniffDelim(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  let atRowStart = true;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (atRowStart) {
      let e = i;
      while (e < n && text.charAt(e) !== '\n' && text.charAt(e) !== '\r') e++;
      if (csvIsComment(text.slice(i, e), DELIM)) {
        if (text.charAt(e) === '\r' && text.charAt(e + 1) === '\n') e += 2;
        else if (e < n) e += 1;
        i = e;
        continue;
      }
      atRowStart = false;
    }
    if (ch === '"') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === DELIM) {
      row.push(cur);
      cur = '';
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      i += (ch === '\r' && text.charAt(i + 1) === '\n') ? 2 : 1;
      atRowStart = true;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter(r => r.length && !(r.length === 1 && String(r[0]).trim() === ''));
}

export function csvQuote(v: any): string {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSVtext(cols: string[], rows: (string | number)[][]): string {
  return [
    cols.map(csvQuote).join(','),
    ...rows.map(r => r.map(csvQuote).join(','))
  ].join('\r\n');
}

export function csvEnc(text: string): Uint8Array {
  return new TextEncoder().encode('\ufeff' + text);
}

// ---------------- KML / KMZ Generation ----------------
export function iconPNG(color: string): Uint8Array {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.arc(16, 16, 10, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#fff';
  g.stroke();
  const b64 = c.toDataURL('image/png').split(',')[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function balloonTable(title: string, pairs: [string, any][]): string {
  let h = '<table border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:\'Segoe UI\',Arial,sans-serif;font-size:12px;min-width:200px;">';
  if (title != null && String(title).trim() !== '') {
    h += '<tr><td colspan="2" style="background-color:#173a5e;color:#ffffff;font-weight:700;font-size:13px;padding:7px 11px;">' + xmlesc(title) + '</td></tr>';
  }
  for (const kv of pairs) {
    const k = kv[0], v = kv[1];
    if (v == null || String(v).trim() === '') continue;
    h += '<tr><td style="background-color:#eef4fb;color:#173a5e;font-weight:600;border:1px solid #d5e3f3;padding:5px 10px;white-space:nowrap;">' + xmlesc(k) + '</td><td style="border:1px solid #d5e3f3;padding:5px 10px;color:#1c2734;">' + xmlesc(v) + '</td></tr>';
  }
  h += '</table>';
  return h;
}

export function kmlDoc(inner: string, name: string = 'Geo_Studio_KMZ'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${PROV.line} -->
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xmlesc(name)}</name>
    <ExtendedData>
      <Data name="Author"><value>${PROV.author}</value></Data>
      <Data name="Organization"><value>${PROV.org}</value></Data>
      <Data name="Contact"><value>${PROV.email}</value></Data>
    </ExtendedData>
    ${inner}
  </Document>
</kml>`;
}

export function pmForFeature(f: GeoFeature, zone: number = 45, south: boolean = false): string {
  const LL = f.pts.map(p => {
    if (f.kind === 'en') {
      const ll = utmToLonLat(p.a, p.b, zone, south);
      return [ll.lon, ll.lat];
    }
    return [p.a, p.b];
  });
  const nm = xmlesc(f.name || '');
  const pairs: [string, any][] = [['Type', f.geom]];
  if (f.props) {
    for (const k in f.props) {
      const v = f.props[k];
      if (v != null && String(v).trim() !== '') pairs.push([k, v]);
    }
  }
  const desc = '<description><![CDATA[' + balloonTable(f.name || '', pairs) + ']]></description>';

  if (f.geom === 'point') {
    return `<Placemark><name>${nm}</name>${desc}<styleUrl>#pt</styleUrl><Point><coordinates>${LL[0][0].toFixed(8)},${LL[0][1].toFixed(8)},0</coordinates></Point></Placemark>`;
  }

  const coords = LL.map(p => `${p[0].toFixed(8)},${p[1].toFixed(8)},0`);
  if (f.geom === 'polygon') {
    if (coords[0] !== coords[coords.length - 1]) coords.push(coords[0]);
    let cx = 0, cy = 0;
    LL.forEach(p => { cx += p[0]; cy += p[1]; });
    const pt = (f.name != null && String(f.name).trim() !== '')
      ? `<Point><coordinates>${(cx / LL.length).toFixed(8)},${(cy / LL.length).toFixed(8)},0</coordinates></Point>`
      : '';
    return `<Placemark><name>${nm}</name>${desc}<styleUrl>#ln</styleUrl><MultiGeometry><Polygon><outerBoundaryIs><LinearRing><coordinates>${coords.join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>${pt}</MultiGeometry></Placemark>`;
  }
  return `<Placemark><name>${nm}</name>${desc}<styleUrl>#ln</styleUrl><LineString><tessellate>1</tessellate><coordinates>${coords.join(' ')}</coordinates></LineString></Placemark>`;
}

export function featuresToKMZ(feats: GeoFeature[], colorHex: string = '#0e7c86', opts: { split?: boolean; zone?: number; south?: boolean } = {}): { name: string; bytes: Uint8Array }[] {
  const zone = opts.zone || 45, south = !!opts.south;
  const sp = `<Style id="pt"><IconStyle><color>${kmlColor(colorHex)}</color><scale>1.1</scale><Icon><href>files/icon.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle><BalloonStyle><text><![CDATA[$[description]]]></text></BalloonStyle></Style>`;
  const sl = `<Style id="ln"><IconStyle><scale>0</scale></IconStyle><LabelStyle><color>ffffffff</color><scale>0.9</scale></LabelStyle><LineStyle><color>${kmlColor(colorHex)}</color><width>2</width></LineStyle><PolyStyle><color>${'7d' + kmlColor(colorHex).slice(2)}</color></PolyStyle></Style>`;
  const icon: ZipFileEntry = { name: 'files/icon.png', data: iconPNG(colorHex) };

  if (!opts.split || feats.length <= 1500) {
    const doc = kmlDoc(sp + sl + `<Folder><name>Data</name>${feats.map(f => pmForFeature(f, zone, south)).join('')}</Folder>`, 'Studio_KMZ');
    return [{ name: 'map.kmz', bytes: makeZip([{ name: 'doc.kml', data: new TextEncoder().encode(doc) }, icon]) }];
  }

  const per = 800, parts: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < feats.length; i += per) {
    const chunk = feats.slice(i, i + per);
    const partNum = parts.length + 1;
    const doc = kmlDoc(sp + sl + `<Folder><name>Data part${partNum}</name>${chunk.map(f => pmForFeature(f, zone, south)).join('')}</Folder>`, `Studio_KMZ_part${partNum}`);
    parts.push({ name: `map_part${partNum}.kmz`, bytes: makeZip([{ name: 'doc.kml', data: new TextEncoder().encode(doc) }, icon]) });
  }
  return parts;
}

// ---------------- GeoJSON ----------------
export function featuresToGeoJSON(feats: GeoFeature[], zone: number = 45, south: boolean = false, styleHex?: string): string {
  const col = styleHex || '#0e7c86';
  const toLL = (f: GeoFeature) =>
    f.pts.map(p => {
      if (f.kind === 'en') {
        const ll = utmToLonLat(p.a, p.b, zone, south);
        return [r8(ll.lon), r8(ll.lat)];
      }
      return [r8(p.a), r8(p.b)];
    });

  const features = feats.map(f => {
    const c = toLL(f);
    let g: any;
    if (f.geom === 'point') g = { type: 'Point', coordinates: c[0] };
    else if (f.geom === 'polygon') {
      const ring = c.slice();
      if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0]);
      g = { type: 'Polygon', coordinates: [ring] };
    } else {
      g = { type: 'LineString', coordinates: c };
    }
    const props = Object.assign({ name: f.name || '' }, f.props || {});
    if (f.folder && !props.folder) props.folder = f.folder;
    
    // Simplestyle spec
    if (f.geom === 'point') { props['marker-color'] = col; props['marker-size'] = 'medium'; }
    else if (f.geom === 'polygon') { props['stroke'] = col; props['stroke-width'] = 2; props['fill'] = col; props['fill-opacity'] = 0.35; }
    else { props['stroke'] = col; props['stroke-width'] = 2; }

    return { type: 'Feature', properties: props, geometry: g };
  });

  return JSON.stringify(
    {
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
      metadata: { author: PROV.author, organization: PROV.org, contact: PROV.email },
      features
    },
    null,
    2
  );
}

export function geojsonToFeatures(obj: any, fileBase: string = 'GeoJSON'): GeoFeature[] {
  const out: GeoFeature[] = [];
  const fs = (obj && obj.features) || ((obj && obj.type === 'Feature') ? [obj] : []);

  function handle(g: any, pr: any) {
    if (!g) return;
    const name = pr.name || pr.plot_number || pr.Name || pr.id || '';
    const grp = pr.folder || pr.layer || fileBase;
    const push = (geom: 'point' | 'line' | 'polygon', coords: number[][]) => {
      const pts = coords.filter(c => c && c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1])).map(c => ({ a: c[0], b: c[1] }));
      if (pts.length) out.push({ group: grp, name, folder: grp, geom, kind: 'll', pts, props: pr });
    };
    if (g.type === 'Point') push('point', [g.coordinates]);
    else if (g.type === 'MultiPoint') (g.coordinates || []).forEach((c: number[]) => push('point', [c]));
    else if (g.type === 'LineString') push('line', g.coordinates);
    else if (g.type === 'MultiLineString') (g.coordinates || []).forEach((l: number[][]) => push('line', l));
    else if (g.type === 'Polygon') push('polygon', g.coordinates[0] || []);
    else if (g.type === 'MultiPolygon') (g.coordinates || []).forEach((poly: number[][][]) => push('polygon', poly[0] || []));
    else if (g.type === 'GeometryCollection') (g.geometries || []).forEach((gg: any) => handle(gg, pr));
  }

  for (const f of fs) handle(f.geometry, f.properties || {});
  return out;
}

// ---------------- GPX Parser & Exporter ----------------
export function gpxToFeatures(text: string): GeoFeature[] {
  const out: GeoFeature[] = [];
  function attrLL(tag: string) {
    const la = /lat\s*=\s*"([^"]+)"/i.exec(tag), lo = /lon\s*=\s*"([^"]+)"/i.exec(tag);
    if (!la || !lo) return null;
    const a = parseFloat(lo[1]), b = parseFloat(la[1]);
    if (isNaN(a) || isNaN(b)) return null;
    return { a, b };
  }
  function nameOf(block: string) {
    const m = /<name>([\s\S]*?)<\/name>/i.exec(block);
    return m ? m[1].trim() : '';
  }

  // Waypoints
  const wpt = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/gi;
  let m;
  while ((m = wpt.exec(text))) {
    const p = attrLL('<wpt ' + m[1] + '>');
    if (p) out.push({ name: nameOf(m[2]) || 'WPT', folder: 'Waypoints', geom: 'point', kind: 'll', pts: [p], props: { source: 'gpx' } });
  }

  // Routes
  const rte = /<rte\b[^>]*>([\s\S]*?)<\/rte>/gi;
  while ((m = rte.exec(text))) {
    const body = m[1], nm = nameOf(body) || 'Route', pts: GeoPoint[] = [];
    const rp = /<rtept\b([^>]*)>/gi;
    let r2;
    while ((r2 = rp.exec(body))) {
      const q = attrLL('<rtept ' + r2[1] + '>');
      if (q) pts.push(q);
    }
    if (pts.length >= 2) out.push({ name: nm, folder: 'Routes', geom: 'line', kind: 'll', pts, props: { source: 'gpx' } });
  }

  // Tracks
  const trk = /<trk\b[^>]*>([\s\S]*?)<\/trk>/gi;
  while ((m = trk.exec(text))) {
    const tb = m[1], tn = nameOf(tb) || 'Track', tpts: GeoPoint[] = [];
    const tp = /<trkpt\b([^>]*)>/gi;
    let t2;
    while ((t2 = tp.exec(tb))) {
      const w = attrLL('<trkpt ' + t2[1] + '>');
      if (w) tpts.push(w);
    }
    if (tpts.length >= 2) out.push({ name: tn, folder: 'Tracks', geom: 'line', kind: 'll', pts: tpts, props: { source: 'gpx' } });
  }
  return out;
}

export function featuresToGPX(feats: GeoFeature[], zone: number = 45, south: boolean = false): string {
  let wpts = '', trks = '';
  feats.forEach(f => {
    const ll = f.pts.map(p => (f.kind === 'en' ? [utmToLonLat(p.a, p.b, zone, south).lon, utmToLonLat(p.a, p.b, zone, south).lat] : [p.a, p.b]));
    if (!ll.length) return;
    if (f.geom === 'point') {
      wpts += `<wpt lat="${ll[0][1].toFixed(8)}" lon="${ll[0][0].toFixed(8)}"><name>${xmlesc(f.name || '')}</name></wpt>`;
    } else {
      const pts = ll.slice();
      if (f.geom === 'polygon' && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) pts.push(pts[0]);
      trks += `<trk><name>${xmlesc(f.name || '')}</name><trkseg>${pts.map(p => `<trkpt lat="${p[1].toFixed(8)}" lon="${p[0].toFixed(8)}"></trkpt>`).join('')}</trkseg></trk>`;
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Geo Studio" xmlns="http://www.topografix.com/GPX/1/1">${wpts}${trks}</gpx>`;
}

// ---------------- WKT Parser & Exporter ----------------
export function wktToFeatures(text: string): GeoFeature[] {
  const out: GeoFeature[] = [];
  const reType = /(MULTIPOLYGON|MULTILINESTRING|MULTIPOINT|POLYGON|LINESTRING|POINT)\s*(Z|M|ZM)?\s*(\([\s\S]*\))/i;
  const nums = (s: string) => s.trim().split(/\s+/).map(parseFloat);
  const ring = (s: string) =>
    s.split(',').map(pair => { const n = nums(pair); return { a: n[0], b: n[1] }; }).filter(p => !isNaN(p.a) && !isNaN(p.b));

  const cands: { name: string; wkt: string }[] = [];
  let rows: string[][] = [];
  try { rows = parseCSV(String(text)); } catch { rows = []; }
  
  if (rows.length) {
    let wktCol = -1;
    for (let r = 0; r < rows.length && wktCol < 0; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (reType.test(String(rows[r][c] || ''))) { wktCol = c; break; }
      }
    }
    if (wktCol >= 0) {
      const hdr = rows[0].map(h => String(h || '').trim().toLowerCase());
      let nameCol = -1;
      ['name', 'plot', 'plot_no', 'id', 'label'].forEach(k => {
        if (nameCol < 0) {
          const ix = hdr.indexOf(k);
          if (ix >= 0 && ix !== wktCol) nameCol = ix;
        }
      });
      if (nameCol < 0) nameCol = wktCol === 0 ? (rows[0].length > 1 ? 1 : -1) : 0;
      rows.forEach(row => {
        const w = String(row[wktCol] == null ? '' : row[wktCol]);
        if (reType.test(w)) cands.push({ name: nameCol >= 0 ? String(row[nameCol] == null ? '' : row[nameCol]).trim() : '', wkt: w });
      });
    }
  }

  if (!cands.length) {
    String(text).split(/\r\n|\r|\n/).forEach(raw => {
      let line = raw.trim();
      if (!line || line.charAt(0) === '#') return;
      let name = '';
      const mSplit = /^([^;\t]+?)[;\t](.+)$/.exec(line);
      if (mSplit && reType.test(mSplit[2])) { name = mSplit[1].trim(); line = mSplit[2].trim(); }
      if (reType.test(line)) cands.push({ name, wkt: line });
    });
  }

  cands.forEach(cand => {
    const name = cand.name.replace(/^"|"$/g, '');
    const m = reType.exec(cand.wkt.replace(/^\s*"|"\s*$/g, ''));
    if (!m) return;
    const type = m[1].toUpperCase(), inner = m[3];
    const push = (geom: 'point' | 'line' | 'polygon', pts: GeoPoint[]) => {
      if (pts.length) out.push({ name, folder: 'WKT', geom, kind: 'll', pts, props: { source: 'wkt' } });
    };
    if (type === 'POINT') {
      const n = nums(inner.replace(/[()]/g, ''));
      if (!isNaN(n[0]) && !isNaN(n[1])) push('point', [{ a: n[0], b: n[1] }]);
    } else if (type === 'LINESTRING') {
      push('line', ring(inner.replace(/^\(|\)$/g, '')));
    } else if (type === 'POLYGON') {
      const first = /\(\s*\(([\s\S]*?)\)/.exec(inner);
      if (first) push('polygon', ring(first[1]));
    } else if (type === 'MULTIPOINT') {
      ring(inner.replace(/[()]/g, '')).forEach(p => push('point', [p]));
    } else if (type === 'MULTILINESTRING') {
      (inner.match(/\(([^()]*)\)/g) || []).forEach(g => push('line', ring(g.replace(/[()]/g, ''))));
    } else if (type === 'MULTIPOLYGON') {
      (inner.match(/\(\s*\(([^()]*)\)/g) || []).forEach(g => push('polygon', ring(g.replace(/[()]/g, ''))));
    }
  });
  return out;
}

export function featuresToWKT(feats: GeoFeature[], zone: number = 45, south: boolean = false): string[][] {
  const fmtRing = (ll: number[][]) => ll.map(p => `${p[0].toFixed(8)} ${p[1].toFixed(8)}`).join(', ');
  const rows = [['Name', 'WKT']];
  feats.forEach(f => {
    const ll = f.pts.map(p => (f.kind === 'en' ? [utmToLonLat(p.a, p.b, zone, south).lon, utmToLonLat(p.a, p.b, zone, south).lat] : [p.a, p.b]));
    if (!ll.length) return;
    let w = '';
    if (f.geom === 'point') w = `POINT (${ll[0][0].toFixed(8)} ${ll[0][1].toFixed(8)})`;
    else if (f.geom === 'line') w = `LINESTRING (${fmtRing(ll)})`;
    else {
      const r = ll.slice();
      if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r.push(r[0]);
      w = `POLYGON ((${fmtRing(r)}))`;
    }
    rows.push([f.name || '', w]);
  });
  return rows;
}

// ---------------- DXF Parser & Exporter ----------------
export function cleanDxfText(t: any): string {
  let s = String(t == null ? '' : t);
  s = s.replace(/\\P/g, ' ').replace(/\\~/g, ' ');
  s = s.replace(/\\[A-Za-z][^;\\]*;/g, '');
  s = s.replace(/\\[A-Za-z]/g, '');
  s = s.replace(/[{}]/g, '');
  s = s.replace(/\\\\/g, '\\').replace(/\\\{/g, '{').replace(/\\\}/g, '}');
  return s.trim();
}

export function parseDXF(text: string) {
  const L = text.split(/\r\n|\r|\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < L.length; i += 2) {
    pairs.push([parseInt(L[i].trim(), 10), L[i + 1]]);
  }

  const ents: any[] = [];
  let cur: any = null, poly: any = null, vx: any = null, mode = 'none', skip102 = false;
  const simple = ['POINT', 'LINE', 'LWPOLYLINE', 'CIRCLE', 'ARC', 'SPLINE', 'TEXT', 'MTEXT'];

  function endVertex() {
    if (vx && poly && vx.x != null && vx.y != null) poly.pts.push({ x: vx.x, y: vx.y });
    vx = null;
  }
  function endSimple() {
    if (cur) ents.push(cur);
    cur = null;
  }

  for (const [code, val] of pairs) {
    if (code === 102) {
      const v = (val || '').trim();
      skip102 = v !== '}' && v !== '';
      continue;
    }
    if (code === 0) {
      skip102 = false;
      if (mode === 'vertex') endVertex();
      else if (mode === 'simple') endSimple();
      const v = (val || '').trim();
      if (v === 'POLYLINE') {
        poly = { type: 'POLYLINE', layer: '0', handle: '', pts: [], closed: false };
        ents.push(poly);
        mode = 'poly';
      } else if (v === 'VERTEX') {
        vx = { x: null, y: null };
        mode = 'vertex';
      } else if (v === 'SEQEND') {
        poly = null;
        mode = 'none';
      } else if (simple.includes(v)) {
        cur = { type: v, layer: '0', handle: '', pts: [], x: null, y: null, x2: null, y2: null, hjust: 0, vjust: 0, text: '', closed: false, r: null, a0: null, a1: null };
        mode = 'simple';
      } else {
        poly = null; mode = 'none'; cur = null;
      }
    } else {
      if (skip102) continue;
      if (mode === 'poly' && poly) {
        if (code === 8) poly.layer = (val || '').trim();
        else if (code === 5 && !poly.handle) poly.handle = (val || '').trim();
        else if (code === 70) poly.closed = ((parseInt(val, 10) || 0) & 1) === 1;
      } else if (mode === 'vertex' && vx) {
        if (code === 10) vx.x = parseFloat(val);
        else if (code === 20) vx.y = parseFloat(val);
      } else if (mode === 'simple' && cur) {
        if (code === 8) cur.layer = (val || '').trim();
        else if (code === 5 && !cur.handle) cur.handle = (val || '').trim();
        else if (code === 1) cur.text = val;
        else if (code === 72 && (cur.type === 'TEXT' || cur.type === 'MTEXT')) cur.hjust = parseInt(val, 10) || 0;
        else if (code === 73 && (cur.type === 'TEXT' || cur.type === 'MTEXT')) cur.vjust = parseInt(val, 10) || 0;
        else if (code === 70 && cur.type === 'LWPOLYLINE') cur.closed = ((parseInt(val, 10) || 0) & 1) === 1;
        else if (code === 40) {
          if (cur.type === 'CIRCLE' || cur.type === 'ARC') cur.r = parseFloat(val);
          else if (cur.type === 'TEXT' || cur.type === 'MTEXT') cur.h = parseFloat(val);
        } else if (code === 50 && cur.type === 'ARC') cur.a0 = parseFloat(val);
        else if (code === 51 && cur.type === 'ARC') cur.a1 = parseFloat(val);
        else if (code === 10) {
          if (cur.type === 'LWPOLYLINE' || cur.type === 'SPLINE') cur.pts.push({ x: parseFloat(val), y: null });
          else if (cur.x === null) cur.x = parseFloat(val);
        } else if (code === 20) {
          if ((cur.type === 'LWPOLYLINE' || cur.type === 'SPLINE') && cur.pts.length) cur.pts[cur.pts.length - 1].y = parseFloat(val);
          else if (cur.y === null) cur.y = parseFloat(val);
        } else if (code === 11) cur.x2 = parseFloat(val);
        else if (code === 21) cur.y2 = parseFloat(val);
      }
    }
  }
  if (mode === 'vertex') endVertex();
  if (mode === 'simple') endSimple();
  return ents;
}

export function dxfBuild(
  feats: GeoFeature[],
  outMode: 'utm' | 'wgs84' = 'utm',
  zone: number = 45,
  south: boolean = false,
  layered: boolean = true,
  opts: { decorate?: boolean; title?: string } = {}
) {
  const H = outMode === 'utm' ? 2.0 : 0.00005;
  const f = (v: number) => (outMode === 'utm' ? Math.round(v * 1000) / 1000 : Math.round(v * 1e8) / 1e8);
  const proj = (kind: string, a: number, b: number) => {
    if (outMode === 'utm') {
      if (kind === 'en') return [a, b];
      const u = lonLatToUtm(a, b, zone, south);
      return [u.E, u.N];
    } else {
      if (kind === 'll') return [a, b];
      const ll = utmToLonLat(a, b, zone, south);
      return [ll.lon, ll.lat];
    }
  };

  const layOf = (ft: GeoFeature) => (ft.props && ft.props.layer) || ft.group || ft.folder || '0';
  const layers = layered ? [...new Set(feats.map(layOf))] : ['POINTS', 'LABELS', 'LINES', 'POLYGONS'];
  let ent = '';
  const cnt = { point: 0, line: 0, polygon: 0 };
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const track = (x: number, y: number) => {
    if (x < minx) minx = x;
    if (y < miny) miny = y;
    if (x > maxx) maxx = x;
    if (y > maxy) maxy = y;
  };

  for (const ft of feats) {
    const pts = ft.pts.map(p => proj(ft.kind, p.a, p.b));
    if (!pts.length) continue;
    pts.forEach(q => track(q[0], q[1]));
    const layer = layered ? layOf(ft) : null;
    if (ft.geom === 'point') {
      cnt.point++;
      const pl = layered ? layer : 'POINTS', tl = layered ? layer : 'LABELS';
      ent += `0\nPOINT\n8\n${pl}\n10\n${f(pts[0][0])}\n20\n${f(pts[0][1])}\n30\n0\n`;
      if (ft.name) ent += `0\nTEXT\n8\n${tl}\n10\n${f(pts[0][0])}\n20\n${f(pts[0][1])}\n30\n0\n40\n${H}\n1\n${ft.name}\n`;
    } else {
      const closed = ft.geom === 'polygon';
      cnt[closed ? 'polygon' : 'line']++;
      let v = pts.slice();
      if (closed && v.length > 1) {
        const A = v[0], B = v[v.length - 1];
        if (A[0] === B[0] && A[1] === B[1]) v.pop();
      }
      const gl = layered ? layer : (closed ? 'POLYGONS' : 'LINES'), tl = layered ? layer : 'LABELS';
      ent += `0\nPOLYLINE\n8\n${gl}\n66\n1\n10\n0\n20\n0\n30\n0\n70\n${closed ? 1 : 0}\n`;
      for (const q of v) ent += `0\nVERTEX\n8\n${gl}\n10\n${f(q[0])}\n20\n${f(q[1])}\n30\n0\n`;
      ent += `0\nSEQEND\n8\n${gl}\n`;
      if (ft.name) ent += `0\nTEXT\n8\n${tl}\n10\n${f(pts[0][0])}\n20\n${f(pts[0][1])}\n30\n0\n40\n${H}\n1\n${ft.name}\n`;
    }
  }

  const DXF_ACI = [5, 3, 1, 6, 2, 30, 4, 40, 140, 8, 150, 190];
  const layerColor: Record<string, number> = {};
  layers.forEach((L, i) => { layerColor[L] = layered ? DXF_ACI[i % DXF_ACI.length] : 7; });

  let decoLayers: string[] = [];
  if (opts.decorate && isFinite(minx) && maxx > minx) {
    decoLayers = ['FRAME', 'TITLE', 'NORTH', 'LEGEND'];
    const dx = maxx - minx, dy = maxy - miny, mg = Math.max(dx, dy) * 0.05 + H * 2;
    const bx0 = minx - mg, by0 = miny - mg, bx1 = maxx + mg, by1 = maxy + mg;
    const line = (lay: string, x1: number, y1: number, x2: number, y2: number) => `0\nLINE\n8\n${lay}\n10\n${f(x1)}\n20\n${f(y1)}\n30\n0\n11\n${f(x2)}\n21\n${f(y2)}\n31\n0\n`;
    const text = (lay: string, x: number, y: number, hh: number, t: string) => `0\nTEXT\n8\n${lay}\n10\n${f(x)}\n20\n${f(y)}\n30\n0\n40\n${f(hh)}\n1\n${t}\n`;

    // Frame
    ent += `0\nPOLYLINE\n8\nFRAME\n66\n1\n10\n0\n20\n0\n30\n0\n70\n1\n`;
    [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]].forEach(p => {
      ent += `0\nVERTEX\n8\nFRAME\n10\n${f(p[0])}\n20\n${f(p[1])}\n30\n0\n`;
    });
    ent += `0\nSEQEND\n8\nFRAME\n`;

    // Title
    const th = H * 1.8;
    ent += text('TITLE', bx0, by1 + th * 0.6, th, opts.title || 'Geo Studio Export');
    ent += text('TITLE', bx0, by1 + th * 0.6 - th * 1.4, H * 0.9, `Author: ${PROV.author} | ${new Date().toISOString().slice(0, 10)}`);

    // North arrow
    const nx = bx1 - mg * 0.6, ntop = by1 + th * 0.2, nlen = Math.max(dy * 0.08, H * 4);
    ent += line('NORTH', nx, ntop, nx, ntop + nlen);
    ent += line('NORTH', nx, ntop + nlen, nx - nlen * 0.25, ntop + nlen * 0.7);
    ent += line('NORTH', nx, ntop + nlen, nx + nlen * 0.25, ntop + nlen * 0.7);
    ent += text('NORTH', nx - H * 0.5, ntop + nlen + H * 0.4, H * 1.2, 'N');
  }

  const allLayers = layers.concat(decoLayers);
  let s = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0\n0\nENDTAB\n0\nTABLE\n2\nLAYER\n70\n${allLayers.length}\n`;
  const decoCol: Record<string, number> = { FRAME: 8, TITLE: 7, NORTH: 1, LEGEND: 7 };
  for (const L of layers) s += `0\nLAYER\n2\n${L}\n70\n0\n62\n${layerColor[L] || 7}\n6\nCONTINUOUS\n`;
  for (const L of decoLayers) s += `0\nLAYER\n2\n${L}\n70\n0\n62\n${decoCol[L] || 7}\n6\nCONTINUOUS\n`;
  s += `0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${ent}0\nENDSEC\n0\nEOF\n`;
  return { dxf: s, cnt };
}

// ---------------- XLSX Generator ----------------
export function colLetter(n: number): string {
  let s = '';
  n++;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m - 1) / 26);
  }
  return s;
}

export function makeXLSX(sheets: { name: string; rows: (string | number)[][] }[]): Uint8Array {
  const enc = new TextEncoder();
  const files: ZipFileEntry[] = [];

  files.push({
    name: '[Content_Types].xml',
    data: enc.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>'
    )
  });

  files.push({
    name: '_rels/.rels',
    data: enc.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
    )
  });

  files.push({
    name: 'docProps/core.xml',
    data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>${xmlesc(PROV.author)}</dc:creator><dc:title>Geo Studio export</dc:title><dc:description>${xmlesc(PROV.line)}</dc:description></cp:coreProperties>`
    )
  });

  files.push({
    name: 'xl/workbook.xml',
    data: enc.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map((s, i) => `<sheet name="${xmlesc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>'
    )
  });

  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: enc.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        '</Relationships>'
    )
  });

  files.push({
    name: 'xl/styles.xml',
    data: enc.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173A5E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    )
  });

  sheets.forEach((s, si) => {
    const widths: number[] = [];
    s.rows.forEach(r => {
      r.forEach((v, ci) => {
        const L = String(v == null ? '' : v).length;
        if (!widths[ci] || L > widths[ci]) widths[ci] = L;
      });
    });
    const ncol = widths.length;
    let colsXml = '';
    if (ncol) {
      colsXml = '<cols>';
      for (let ci = 0; ci < ncol; ci++) {
        const w = Math.min(70, Math.max(11, (widths[ci] || 8) + 3));
        colsXml += `<col min="${ci + 1}" max="${ci + 1}" width="${w}" customWidth="1"/>`;
      }
      colsXml += '</cols>';
    }

    let rowsXml = '';
    s.rows.forEach((r, ri) => {
      let cells = '';
      r.forEach((v, ci) => {
        const ref = colLetter(ci) + (ri + 1);
        const isHead = ri === 0;
        const sAttr = isHead ? ' s="1"' : '';
        const num = !isHead && v !== '' && v != null && !isNaN(Number(v)) && isFinite(Number(v)) && typeof v !== 'boolean';
        if (num) cells += `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
        else cells += `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlesc(v)}</t></is></c>`;
      });
      rowsXml += `<row r="${ri + 1}"${ri === 0 ? ' ht="28" customHeight="1"' : ''}>${cells}</row>`;
    });

    const views = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>';
    files.push({
      name: `xl/worksheets/sheet${si + 1}.xml`,
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${views}${colsXml}<sheetData>${rowsXml}</sheetData></worksheet>`
      )
    });
  });

  return makeZip(files);
}

// ---------------- Helper Aliases & Parsers ----------------
export function kmlBuild(feats: GeoFeature[], name: string = 'GeoStudio_KML', _is3D: boolean = true, zone: number = 45, south: boolean = false): string {
  const pms = feats.map(f => pmForFeature(f, zone, south)).join('\n');
  return kmlDoc(`<Folder><name>${xmlesc(name)}</name>${pms}</Folder>`, name);
}

export function kmlParse(text: string): GeoFeature[] {
  const feats: GeoFeature[] = [];
  const pmRe = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi;
  let pmMatch;
  while ((pmMatch = pmRe.exec(text)) !== null) {
    const block = pmMatch[1];
    const nmMatch = /<name>([\s\S]*?)<\/name>/i.exec(block);
    const name = nmMatch ? nmMatch[1].trim() : 'Placemark';

    // Check Polygon
    const polyRe = /<Polygon\b[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i.exec(block);
    if (polyRe) {
      const rawCoords = polyRe[1].trim().split(/\s+/);
      const pts: GeoPoint[] = [];
      rawCoords.forEach(c => {
        const parts = c.split(',').map(parseFloat);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          pts.push({ a: parts[0], b: parts[1] });
        }
      });
      if (pts.length >= 3) {
        feats.push({ name, geom: 'polygon', kind: 'll', pts, props: { source: 'kml' } });
        continue;
      }
    }

    // Check LineString
    const lineRe = /<LineString\b[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i.exec(block);
    if (lineRe) {
      const rawCoords = lineRe[1].trim().split(/\s+/);
      const pts: GeoPoint[] = [];
      rawCoords.forEach(c => {
        const parts = c.split(',').map(parseFloat);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          pts.push({ a: parts[0], b: parts[1] });
        }
      });
      if (pts.length >= 2) {
        feats.push({ name, geom: 'line', kind: 'll', pts, props: { source: 'kml' } });
        continue;
      }
    }

    // Check Point
    const ptRe = /<Point\b[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i.exec(block);
    if (ptRe) {
      const parts = ptRe[1].trim().split(',').map(parseFloat);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        feats.push({ name, geom: 'point', kind: 'll', pts: [{ a: parts[0], b: parts[1] }], props: { source: 'kml' } });
      }
    }
  }
  return feats;
}

export function buildExcelZip(cols: string[], rows: (string | number)[][], sheetName: string = 'Sheet1'): Uint8Array {
  return makeXLSX([{ name: sheetName, rows: [cols, ...rows] }]);
}

export function geoJsonParse(text: string): GeoFeature[] {
  try {
    const json = JSON.parse(text);
    return geojsonToFeatures(json);
  } catch {
    return [];
  }
}

export function geoJsonBuild(feats: GeoFeature[], zone: number = 45, south: boolean = false): string {
  return featuresToGeoJSON(feats, zone, south);
}

export function gpxParse(text: string): GeoFeature[] {
  return gpxToFeatures(text);
}

export function gpxBuild(feats: GeoFeature[], _name: string = 'GeoStudio_GPX', _is3D: boolean = true, zone: number = 45, south: boolean = false): string {
  return featuresToGPX(feats, zone, south);
}

export function wktParse(text: string): GeoFeature[] {
  return wktToFeatures(text);
}

export function wktBuild(feats: GeoFeature[], zone: number = 45, south: boolean = false): string {
  const rows = featuresToWKT(feats, zone, south);
  return toCSVtext(rows[0], rows.slice(1));
}

export function dxfParse(text: string): GeoFeature[] {
  const ents = parseDXF(text);
  const feats: GeoFeature[] = [];
  ents.forEach((e: any, idx: number) => {
    if (e.type === 'POINT' && e.x != null && e.y != null) {
      feats.push({
        name: e.text || `Point_${idx + 1}`,
        geom: 'point',
        kind: 'en',
        pts: [{ a: e.x, b: e.y }],
        props: { layer: e.layer || '0' }
      });
    } else if (e.type === 'POLYLINE' || e.type === 'LWPOLYLINE') {
      const pts = (e.pts || []).filter((p: any) => p && p.x != null && p.y != null).map((p: any) => ({ a: p.x, b: p.y }));
      if (pts.length >= 2) {
        feats.push({
          name: e.text || `${e.closed ? 'Poly' : 'Line'}_${idx + 1}`,
          geom: e.closed ? 'polygon' : 'line',
          kind: 'en',
          pts,
          props: { layer: e.layer || '0' }
        });
      }
    } else if (e.type === 'LINE' && e.x != null && e.y != null && e.x2 != null && e.y2 != null) {
      feats.push({
        name: `Line_${idx + 1}`,
        geom: 'line',
        kind: 'en',
        pts: [{ a: e.x, b: e.y }, { a: e.x2, b: e.y2 }],
        props: { layer: e.layer || '0' }
      });
    }
  });
  return feats;
}

export function csvToFeatures(rows: string[][], zone: number = 45, south: boolean = false): GeoFeature[] {
  const feats: GeoFeature[] = [];
  if (!rows || rows.length < 2) return feats;

  const hdr = rows[0].map(h => String(h || '').trim().toLowerCase());
  const iName = hdr.findIndex(h => h.includes('name') || h.includes('id') || h.includes('pt') || h.includes('point') || h.includes('label'));
  const iLon = hdr.findIndex(h => h === 'longitude' || h === 'lon' || h === 'long');
  const iLat = hdr.findIndex(h => h === 'latitude' || h === 'lat');
  const iE = hdr.findIndex(h => h === 'easting' || h === 'east' || h === 'e' || h === 'x');
  const iN = hdr.findIndex(h => h === 'northing' || h === 'north' || h === 'n' || h === 'y');
  const iGeom = hdr.findIndex(h => h.includes('geom') || h.includes('type'));

  rows.slice(1).forEach((r, idx) => {
    const name = iName >= 0 ? r[iName] : `Point_${idx + 1}`;
    const lo = iLon >= 0 ? parseFloat(r[iLon]) : NaN;
    const la = iLat >= 0 ? parseFloat(r[iLat]) : NaN;
    const e = iE >= 0 ? parseFloat(r[iE]) : NaN;
    const n = iN >= 0 ? parseFloat(r[iN]) : NaN;
    const g = iGeom >= 0 ? (r[iGeom].toLowerCase() as any) : 'point';

    if (!isNaN(lo) && !isNaN(la)) {
      feats.push({ name, geom: g === 'polygon' || g === 'line' ? g : 'point', kind: 'll', pts: [{ a: lo, b: la }] });
    } else if (!isNaN(e) && !isNaN(n)) {
      feats.push({ name, geom: g === 'polygon' || g === 'line' ? g : 'point', kind: 'en', pts: [{ a: e, b: n }] });
    }
  });
  return feats;
}

export function buildWorldFile(a: number, b: number, c: number, d: number, tx: number, ty: number): string {
  // ESRI World File Format:
  // Line 1: Pixel size in X direction (dx / a)
  // Line 2: Rotation term Y (rotY / c)
  // Line 3: Rotation term X (rotX / b)
  // Line 4: Pixel size in Y direction (dy / d, typically negative)
  // Line 5: X coordinate of center of upper-left pixel
  // Line 6: Y coordinate of center of upper-left pixel
  return [
    a.toFixed(10),
    c.toFixed(10),
    b.toFixed(10),
    d.toFixed(10),
    tx.toFixed(4),
    ty.toFixed(4)
  ].join('\r\n') + '\r\n';
}

export function buildQgisGcpPoints(gcps: { pixelX: number; pixelY: number; utmE: number; utmN: number; id: string }[]): string {
  // QGIS Georeferencer .points format
  // mapX,mapY,pixelX,pixelY,enable,dX,dY,residual
  const lines = ['mapX,mapY,pixelX,pixelY,enable,dX,dY,residual'];
  gcps.forEach(g => {
    lines.push(`${g.utmE.toFixed(4)},${g.utmN.toFixed(4)},${g.pixelX.toFixed(2)},${(-g.pixelY).toFixed(2)},1,0,0,0`);
  });
  return lines.join('\n') + '\n';
}

// ----------------------------------------------------
// ESRI Shapefile & DBF Binary Parser & Builder
// ----------------------------------------------------

export interface ExtractedDataset {
  fileName: string;
  layerName: string;
  format: 'shapefile' | 'kml' | 'kmz' | 'geojson' | 'dxf' | 'csv' | 'gpx' | 'wkt' | 'landxml' | 'osm' | string;
  features: GeoFeature[];
  featureCount: number;
  geomType: 'point' | 'line' | 'polygon';
  attributeKeys: string[];
  bounds?: { minE: number; maxE: number; minN: number; maxN: number };
}

/**
 * Parses dBase III / IV (.dbf) binary buffer into array of record property objects
 */
export function parseDBF(bytes: Uint8Array): Record<string, any>[] {
  const records: Record<string, any>[] = [];
  if (!bytes || bytes.length < 32) return records;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numRecords = view.getUint32(4, true);
  const headerLen = view.getUint16(8, true);
  const recordLen = view.getUint16(10, true);
  const dec = new TextDecoder('utf-8');

  interface DbfField {
    name: string;
    type: string;
    len: number;
    dec: number;
  }

  const fields: DbfField[] = [];
  let offset = 32;

  while (offset + 32 <= headerLen && bytes[offset] !== 0x0D) {
    let nameLen = 0;
    while (nameLen < 11 && bytes[offset + nameLen] !== 0) nameLen++;
    const name = dec.decode(bytes.slice(offset, offset + nameLen)).trim();
    const type = String.fromCharCode(bytes[offset + 11]);
    const len = bytes[offset + 16];
    const decimalCount = bytes[offset + 17];
    if (name) {
      fields.push({ name, type, len, dec: decimalCount });
    }
    offset += 32;
  }

  let recOffset = headerLen;
  for (let r = 0; r < numRecords && recOffset + recordLen <= bytes.length; r++) {
    const isDeleted = bytes[recOffset] === 0x2A; // '*'
    if (!isDeleted) {
      const rowProps: Record<string, any> = {};
      let fieldOffset = recOffset + 1;

      for (const field of fields) {
        const rawStr = dec.decode(bytes.slice(fieldOffset, fieldOffset + field.len)).trim();
        if (field.type === 'N' || field.type === 'F') {
          const num = parseFloat(rawStr);
          rowProps[field.name] = !isNaN(num) ? num : rawStr;
        } else if (field.type === 'L') {
          rowProps[field.name] = rawStr === 'T' || rawStr === 'Y' || rawStr === '1';
        } else {
          rowProps[field.name] = rawStr;
        }
        fieldOffset += field.len;
      }
      records.push(rowProps);
    }
    recOffset += recordLen;
  }

  return records;
}

/**
 * Parses ESRI Shapefile (.shp) binary buffer and optional (.dbf) into GeoFeatures
 */
export function parseShapefile(
  shpBytes: Uint8Array,
  dbfBytes?: Uint8Array,
  prjText?: string,
  zone: number = 45,
  south: boolean = false
): GeoFeature[] {
  const feats: GeoFeature[] = [];
  if (!shpBytes || shpBytes.length < 100) return feats;

  const view = new DataView(shpBytes.buffer, shpBytes.byteOffset, shpBytes.byteLength);
  const fileCode = view.getInt32(0, false); // 9994
  const shapeType = view.getInt32(32, true);

  const dbfRecords = dbfBytes ? parseDBF(dbfBytes) : [];
  let offset = 100;
  let recIdx = 0;

  while (offset + 8 <= shpBytes.length) {
    const recNum = view.getInt32(offset, false);
    const recLenWords = view.getInt32(offset + 4, false);
    const recLenBytes = recLenWords * 2;
    if (offset + 8 + recLenBytes > shpBytes.length) break;

    const recShapeType = view.getInt32(offset + 8, true);
    const props = dbfRecords[recIdx] || {};

    let nameCandidate = '';
    for (const key of Object.keys(props)) {
      const lk = key.toLowerCase();
      if (lk === 'name' || lk === 'id' || lk === 'khasra' || lk === 'plot' || lk === 'hole_id' || lk === 'label' || lk === 'title') {
        nameCandidate = String(props[key]);
        break;
      }
    }
    const featName = nameCandidate || `Feature_${recIdx + 1}`;

    // 1, 11, 21 = Point, PointZ, PointM
    if (recShapeType === 1 || recShapeType === 11 || recShapeType === 21) {
      const x = view.getFloat64(offset + 12, true);
      const y = view.getFloat64(offset + 20, true);
      const isUTM = Math.abs(x) > 180 || Math.abs(y) > 90;
      feats.push({
        name: featName,
        geom: 'point',
        kind: isUTM ? 'en' : 'll',
        pts: [{ a: x, b: y }],
        props
      });
    }
    // 3, 13, 23 = PolyLine, PolyLineZ, PolyLineM OR 5, 15, 25 = Polygon, PolygonZ, PolygonM
    else if (
      recShapeType === 3 || recShapeType === 13 || recShapeType === 23 ||
      recShapeType === 5 || recShapeType === 15 || recShapeType === 25
    ) {
      const numParts = view.getInt32(offset + 40, true);
      const numPoints = view.getInt32(offset + 44, true);
      const parts: number[] = [];

      for (let p = 0; p < numParts; p++) {
        parts.push(view.getInt32(offset + 48 + p * 4, true));
      }

      const ptsOffset = offset + 48 + numParts * 4;
      const allPoints: { a: number; b: number }[] = [];

      for (let ptIdx = 0; ptIdx < numPoints; ptIdx++) {
        const px = view.getFloat64(ptsOffset + ptIdx * 16, true);
        const py = view.getFloat64(ptsOffset + ptIdx * 16 + 8, true);
        allPoints.push({ a: px, b: py });
      }

      const isPolygon = recShapeType === 5 || recShapeType === 15 || recShapeType === 25;
      const isUTM = allPoints.length > 0 && (Math.abs(allPoints[0].a) > 180 || Math.abs(allPoints[0].b) > 90);

      // Handle multi-part as separate or merged rings
      if (parts.length <= 1) {
        feats.push({
          name: featName,
          geom: isPolygon ? 'polygon' : 'line',
          kind: isUTM ? 'en' : 'll',
          pts: allPoints,
          props
        });
      } else {
        for (let p = 0; p < parts.length; p++) {
          const start = parts[p];
          const end = p < parts.length - 1 ? parts[p + 1] : numPoints;
          const partPts = allPoints.slice(start, end);
          if (partPts.length > 0) {
            feats.push({
              name: `${featName}_part${p + 1}`,
              geom: isPolygon ? 'polygon' : 'line',
              kind: isUTM ? 'en' : 'll',
              pts: partPts,
              props: { ...props, part: p + 1 }
            });
          }
        }
      }
    }

    offset += 8 + recLenBytes;
    recIdx++;
  }

  return feats;
}

/**
 * Builds an ESRI Shapefile Bundle (.zip containing .shp, .shx, .dbf, .prj)
 */
export function buildShapefileZip(
  features: GeoFeature[],
  layerName: string = 'geostudio_layer',
  zone: number = 45,
  south: boolean = false
): Uint8Array {
  const enc = new TextEncoder();
  const safeName = safeFileName(layerName, 'layer');

  // Determine geometry type
  const polyCount = features.filter(f => f.geom === 'polygon').length;
  const lineCount = features.filter(f => f.geom === 'line').length;
  const targetGeom = polyCount >= features.length / 2 ? 'polygon' : lineCount > 0 ? 'line' : 'point';
  const shapeType = targetGeom === 'polygon' ? 5 : targetGeom === 'line' ? 3 : 1;

  // Convert features coordinates to UTM E/N for shapefile storage
  const normalizedFeatures = features.map(f => {
    const pts = f.pts.map(p => {
      if (f.kind === 'll') {
        const u = lonLatToUtm(p.a, p.b, zone, south);
        return { x: u.E, y: u.N };
      }
      return { x: p.a, y: p.b };
    });
    return { ...f, coordPts: pts };
  });

  // Calculate overall bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  normalizedFeatures.forEach(f => {
    f.coordPts.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
  });

  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 0; maxY = 0;
  }

  // --- Build .SHP and .SHX Buffers ---
  const shpRecords: Uint8Array[] = [];
  const shxOffsets: { offsetWords: number; lenWords: number }[] = [];
  let currentOffsetBytes = 100;

  normalizedFeatures.forEach((f, idx) => {
    const recNum = idx + 1;
    let recContent: Uint8Array;

    if (shapeType === 1) {
      // Point record (ShapeType: int32(1), X: double, Y: double) = 20 bytes = 10 words
      const buf = new Uint8Array(20);
      const dv = new DataView(buf.buffer);
      dv.setInt32(0, 1, true);
      const pt = f.coordPts[0] || { x: 0, y: 0 };
      dv.setFloat64(4, pt.x, true);
      dv.setFloat64(12, pt.y, true);
      recContent = buf;
    } else {
      // PolyLine or Polygon
      let fMinX = Infinity, fMinY = Infinity, fMaxX = -Infinity, fMaxY = -Infinity;
      f.coordPts.forEach(p => {
        if (p.x < fMinX) fMinX = p.x;
        if (p.x > fMaxX) fMaxX = p.x;
        if (p.y < fMinY) fMinY = p.y;
        if (p.y > fMaxY) fMaxY = p.y;
      });
      if (fMinX === Infinity) { fMinX = 0; fMinY = 0; fMaxX = 0; fMaxY = 0; }

      const numParts = 1;
      const numPoints = f.coordPts.length;
      const contentBytes = 4 + 32 + 4 + 4 + 4 + (numPoints * 16);
      const buf = new Uint8Array(contentBytes);
      const dv = new DataView(buf.buffer);

      dv.setInt32(0, shapeType, true);
      dv.setFloat64(4, fMinX, true);
      dv.setFloat64(12, fMinY, true);
      dv.setFloat64(20, fMaxX, true);
      dv.setFloat64(28, fMaxY, true);
      dv.setInt32(36, numParts, true);
      dv.setInt32(40, numPoints, true);
      dv.setInt32(44, 0, true); // part 0 index

      f.coordPts.forEach((p, pIdx) => {
        dv.setFloat64(48 + pIdx * 16, p.x, true);
        dv.setFloat64(48 + pIdx * 16 + 8, p.y, true);
      });
      recContent = buf;
    }

    const recHeader = new Uint8Array(8);
    const hDv = new DataView(recHeader.buffer);
    hDv.setInt32(0, recNum, false);
    hDv.setInt32(4, recContent.length / 2, false);

    shpRecords.push(recHeader, recContent);
    shxOffsets.push({
      offsetWords: currentOffsetBytes / 2,
      lenWords: recContent.length / 2
    });
    currentOffsetBytes += 8 + recContent.length;
  });

  const totalShpWords = currentOffsetBytes / 2;

  // Build 100-byte SHP header
  const shpHeader = new Uint8Array(100);
  const shpDv = new DataView(shpHeader.buffer);
  shpDv.setInt32(0, 9994, false); // File Code
  shpDv.setInt32(24, totalShpWords, false); // File length in words
  shpDv.setInt32(28, 1000, true); // Version
  shpDv.setInt32(32, shapeType, true); // Shape type
  shpDv.setFloat64(36, minX, true);
  shpDv.setFloat64(44, minY, true);
  shpDv.setFloat64(52, maxX, true);
  shpDv.setFloat64(60, maxY, true);

  const shpFullBytes = new Uint8Array(currentOffsetBytes);
  shpFullBytes.set(shpHeader, 0);
  let shpPos = 100;
  shpRecords.forEach(c => {
    shpFullBytes.set(c, shpPos);
    shpPos += c.length;
  });

  // Build SHX file
  const shxBytes = new Uint8Array(100 + shxOffsets.length * 8);
  const shxDv = new DataView(shxBytes.buffer);
  shxDv.setInt32(0, 9994, false);
  shxDv.setInt32(24, (100 + shxOffsets.length * 8) / 2, false);
  shxDv.setInt32(28, 1000, true);
  shxDv.setInt32(32, shapeType, true);
  shxDv.setFloat64(36, minX, true);
  shxDv.setFloat64(44, minY, true);
  shxDv.setFloat64(52, maxX, true);
  shxDv.setFloat64(60, maxY, true);

  shxOffsets.forEach((o, idx) => {
    shxDv.setInt32(100 + idx * 8, o.offsetWords, false);
    shxDv.setInt32(100 + idx * 8 + 4, o.lenWords, false);
  });

  // --- Build .DBF Buffer ---
  // Collect property columns
  const attrKeysSet = new Set<string>(['ID', 'NAME', 'GEOM', 'PTS_COUNT']);
  normalizedFeatures.forEach(f => {
    if (f.props) {
      Object.keys(f.props).forEach(k => {
        const cleanK = k.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 10);
        if (cleanK) attrKeysSet.add(cleanK);
      });
    }
  });
  const attrKeys = Array.from(attrKeysSet).slice(0, 30);

  const fieldDefs = attrKeys.map(k => ({
    name: k.padEnd(11, '\0'),
    type: 'C',
    len: 50
  }));

  const numRecords = normalizedFeatures.length;
  const headerLen = 32 + fieldDefs.length * 32 + 1;
  const recordLen = 1 + fieldDefs.reduce((acc, f) => acc + f.len, 0);
  const dbfTotalSize = headerLen + numRecords * recordLen + 1;

  const dbfBytes = new Uint8Array(dbfTotalSize);
  const dbfDv = new DataView(dbfBytes.buffer);
  const now = new Date();

  dbfBytes[0] = 0x03; // dBase III
  dbfBytes[1] = now.getFullYear() - 1900;
  dbfBytes[2] = now.getMonth() + 1;
  dbfBytes[3] = now.getDate();
  dbfDv.setUint32(4, numRecords, true);
  dbfDv.setUint16(8, headerLen, true);
  dbfDv.setUint16(10, recordLen, true);

  // Field descriptors
  fieldDefs.forEach((fd, i) => {
    const fOff = 32 + i * 32;
    for (let c = 0; c < 11; c++) {
      dbfBytes[fOff + c] = fd.name.charCodeAt(c) || 0;
    }
    dbfBytes[fOff + 11] = fd.type.charCodeAt(0);
    dbfBytes[fOff + 16] = fd.len;
  });
  dbfBytes[32 + fieldDefs.length * 32] = 0x0D; // terminator

  // Write DBF Records
  normalizedFeatures.forEach((f, rIdx) => {
    const rOff = headerLen + rIdx * recordLen;
    dbfBytes[rOff] = 0x20; // active record flag
    let curFieldPos = rOff + 1;

    attrKeys.forEach(k => {
      let val = '';
      if (k === 'ID') val = String(rIdx + 1);
      else if (k === 'NAME') val = String(f.name || '');
      else if (k === 'GEOM') val = String(f.geom);
      else if (k === 'PTS_COUNT') val = String(f.coordPts.length);
      else if (f.props && f.props[k] != null) val = String(f.props[k]);

      const valBytes = enc.encode(val.slice(0, 50));
      for (let b = 0; b < 50; b++) {
        dbfBytes[curFieldPos + b] = b < valBytes.length ? valBytes[b] : 0x20;
      }
      curFieldPos += 50;
    });
  });
  dbfBytes[dbfTotalSize - 1] = 0x1A; // EOF

  // PRJ WKT definition
  const prjContent = `PROJCS["WGS_1984_UTM_Zone_${zone}${south ? 'S' : 'N'}",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0.0],PARAMETER["central_meridian",${(zone - 1) * 6 - 180 + 3}],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000.0],PARAMETER["false_northing",${south ? 10000000.0 : 0.0}],UNIT["Meter",1.0]]`;

  return makeZip([
    { name: `${safeName}.shp`, data: shpFullBytes },
    { name: `${safeName}.shx`, data: shxBytes },
    { name: `${safeName}.dbf`, data: dbfBytes },
    { name: `${safeName}.prj`, data: enc.encode(prjContent) }
  ]);
}

/**
 * Universal Archive Extractor: Extracts EVERY single feature and dataset from any ZIP/KMZ archive,
 * including nested archives, shapefiles in subdirectories, MapInfo MIF/MID, TopoJSON, GML, LandXML,
 * World Files / Raster bounds, DEM ASCII grids, Mining Surpac strings, DXF, GeoJSON, KML, and GPX.
 */
export async function extractAllFeaturesFromZip(
  buf: ArrayBuffer,
  defaultZone: number = 45,
  isSouth: boolean = false,
  depth: number = 0
): Promise<ExtractedDataset[]> {
  if (depth > 4) return []; // prevent infinite recursion
  const filesMap = await readZip(buf);
  const datasets: ExtractedDataset[] = [];
  const dec = new TextDecoder('utf-8');

  // 1. Group shapefile companion files (.shp, .dbf, .prj) across all folder paths
  const shpBases = new Set<string>();
  Object.keys(filesMap).forEach(fn => {
    if (fn.toLowerCase().endsWith('.shp')) {
      shpBases.add(fn.slice(0, -4));
    }
  });

  for (const base of Array.from(shpBases)) {
    // Find matching case-insensitive companions
    const baseLower = base.toLowerCase();
    let shpBytes: Uint8Array | undefined;
    let dbfBytes: Uint8Array | undefined;
    let prjBytes: Uint8Array | undefined;

    Object.keys(filesMap).forEach(k => {
      const kLower = k.toLowerCase();
      if (kLower === `${baseLower}.shp`) shpBytes = filesMap[k];
      else if (kLower === `${baseLower}.dbf`) dbfBytes = filesMap[k];
      else if (kLower === `${baseLower}.prj`) prjBytes = filesMap[k];
    });

    const prjText = prjBytes ? dec.decode(prjBytes) : undefined;

    if (shpBytes) {
      try {
        const feats = parseShapefile(shpBytes, dbfBytes, prjText, defaultZone, isSouth);
        if (feats.length > 0) {
          const lName = base.split('/').pop() || 'Shapefile Layer';
          const attributeKeys = Array.from(new Set(feats.flatMap(f => Object.keys(f.props || {}))));
          datasets.push({
            fileName: `${base}.shp`,
            layerName: lName,
            format: 'shapefile',
            features: feats,
            featureCount: feats.length,
            geomType: feats[0].geom,
            attributeKeys
          });
        }
      } catch (err) {
        console.error('Error parsing shapefile entry:', base, err);
      }
    }
  }

  // 2. Group MapInfo companion files (.mif + .mid)
  const mifBases = new Set<string>();
  Object.keys(filesMap).forEach(fn => {
    if (fn.toLowerCase().endsWith('.mif')) {
      mifBases.add(fn.slice(0, -4));
    }
  });

  for (const base of Array.from(mifBases)) {
    const baseLower = base.toLowerCase();
    let mifBytes: Uint8Array | undefined;
    let midBytes: Uint8Array | undefined;

    Object.keys(filesMap).forEach(k => {
      const kLower = k.toLowerCase();
      if (kLower === `${baseLower}.mif`) mifBytes = filesMap[k];
      else if (kLower === `${baseLower}.mid`) midBytes = filesMap[k];
    });

    if (mifBytes) {
      try {
        const mifText = stripBOM(dec.decode(mifBytes));
        const midText = midBytes ? stripBOM(dec.decode(midBytes)) : undefined;
        const feats = mapinfoMifMidParse(mifText, midText, defaultZone, isSouth);
        if (feats.length > 0) {
          const lName = base.split('/').pop() || 'MapInfo Layer';
          datasets.push({
            fileName: `${base}.mif`,
            layerName: lName,
            format: 'mapinfo',
            features: feats,
            featureCount: feats.length,
            geomType: feats[0].geom,
            attributeKeys: Array.from(new Set(feats.flatMap(f => Object.keys(f.props || {}))))
          });
        }
      } catch (err) {
        console.warn('Error parsing MapInfo file:', base, err);
      }
    }
  }

  // 3. Parse all individual & nested files
  for (const entryName of Object.keys(filesMap)) {
    const lower = entryName.toLowerCase();
    if (
      lower.endsWith('.shp') ||
      lower.endsWith('.shx') ||
      lower.endsWith('.dbf') ||
      lower.endsWith('.prj') ||
      lower.endsWith('.cpg') ||
      lower.endsWith('.mif') ||
      lower.endsWith('.mid')
    ) {
      continue; // Handled in grouped parsers
    }

    const bytes = filesMap[entryName];
    if (!bytes || !bytes.length) continue;

    const baseOnly = entryName.split('/').pop() || entryName;
    const lName = baseOnly.replace(/\.[^/.]+$/, '');

    try {
      // A. Recursive Nested ZIP / KMZ
      if (lower.endsWith('.zip') || (lower.endsWith('.kmz') && entryName !== 'doc.kml')) {
        try {
          const nested = await extractAllFeaturesFromZip(bytes.buffer, defaultZone, isSouth, depth + 1);
          nested.forEach(nd => {
            datasets.push({
              ...nd,
              fileName: `${entryName} > ${nd.fileName}`,
              layerName: `${lName}_${nd.layerName}`
            });
          });
        } catch (nestErr) {
          console.warn('Failed to extract nested archive:', entryName, nestErr);
        }
      }
      // B. KML
      else if (lower.endsWith('.kml')) {
        const text = stripBOM(dec.decode(bytes));
        const feats = kmlParse(text);
        if (feats.length > 0) {
          datasets.push({
            fileName: entryName,
            layerName: lName,
            format: 'kml',
            features: feats,
            featureCount: feats.length,
            geomType: feats[0].geom,
            attributeKeys: Array.from(new Set(feats.flatMap(f => Object.keys(f.props || {}))))
          });
        }
      }
      // C. GeoJSON / TopoJSON
      else if (lower.endsWith('.geojson') || lower.endsWith('.topojson') || (lower.endsWith('.json') && !lower.includes('manifest') && !lower.includes('package'))) {
        const text = stripBOM(dec.decode(bytes));
        if (text.includes('"Topology"') || lower.endsWith('.topojson')) {
          const feats = topoJsonParse(text);
          if (feats.length > 0) {
            datasets.push({
              fileName: entryName,
              layerName: lName,
              format: 'topojson',
              features: feats,
              featureCount: feats.length,
              geomType: feats[0].geom,
              attributeKeys: Array.from(new Set(feats.flatMap(f => Object.keys(f.props || {}))))
            });
          }
        } else {
          const feats = geoJsonParse(text);
          if (feats.length > 0) {
            datasets.push({
              fileName: entryName,
              layerName: lName,
              format: 'geojson',
              features: feats,
              featureCount: feats.length,
              geomType: feats[0].geom,
              attributeKeys: Array.from(new Set(feats.flatMap(f => Object.keys(f.props || {}))))
            });
          }
        }
      }
      // D. DXF
      else if (lower.endsWith('.dxf')) {
        const text = stripBOM(dec.decode(bytes));
        const feats = dxfParse(text);
        if (feats.length > 0) {
          datasets.push({
            fileName: entryName,
            layerName: lName,
            format: 'dxf',
            features: feats,
            featureCount: feats.length,
            geomType: feats[0].geom,
            attributeKeys: ['layer']
          });
        }
      }
      // E. GPX
      else if (lower.endsWith('.gpx')) {
        const text = stripBOM(dec.decode(bytes));
        const feats = gpxParse(text);
        if (feats.length > 0) {
          datasets.push({
            fileName: entryName,
            layerName: lName,
            format: 'gpx',
            features: feats,
            featureCount: feats.length,
            geomType: feats[0].geom,
            attributeKeys: Array.from(new Set(feats.flatMap(f => Object.keys(f.props || {}))))
          });
        }
      }
      // F. WKT
      else if (lower.endsWith('.wkt')) {
        const text = stripBOM(dec.decode(bytes));
        const feats = wktParse(text);
        if (feats.length > 0) {
          datasets.push({
            fileName: entryName,
            layerName: lName,
            format: 'wkt',
            features: feats,
            featureCount: feats.length,
            geomType: feats[0].geom,
            attributeKeys: ['name']
          });
        }
      }
      // G. CSV / TSV / TXT
      else if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt') || lower.endsWith('.xyz')) {
        const text = stripBOM(dec.decode(bytes));
        const rows = parseCSV(text);
        const feats = csvToFeatures(rows, defaultZone, isSouth);
        if (feats.length > 0) {
          datasets.push({
            fileName: entryName,
            layerName: lName,
            format: 'csv',
            features: feats,
            featureCount: feats.length,
            geomType: feats[0].geom,
            attributeKeys: rows.length > 0 ? rows[0] : []
          });
        }
      }
      // H. LandXML
      else if (lower.endsWith('.xml') || lower.endsWith('.landxml')) {
        const text = stripBOM(dec.decode(bytes));
        if (text.includes('<LandXML') || text.includes('<CgPoint') || text.includes('<Parcel')) {
          const feats = landXmlParse(text, defaultZone, isSouth);
          if (feats.length > 0) {
            datasets.push({
              fileName: entryName,
              layerName: lName,
              format: 'landxml',
              features: feats,
              featureCount: feats.length,
              geomType: feats[0].geom,
              attributeKeys: Array.from(new Set(feats.flatMap(f => Object.keys(f.props || {}))))
            });
          }
        } else if (text.includes('<gml:') || text.includes('<wfs:') || text.includes('xmlns:gml')) {
          const feats = gmlXmlParse(text, defaultZone, isSouth);
          if (feats.length > 0) {
            datasets.push({
              fileName: entryName,
              layerName: lName,
              format: 'gml',
              features: feats,
              featureCount: feats.length,
              geomType: feats[0].geom,
              attributeKeys: Array.from(new Set(feats.flatMap(f => Object.keys(f.props || {}))))
            });
          }
        }
      }
      // I. OpenStreetMap XML (.osm)
      else if (lower.endsWith('.osm')) {
        const text = stripBOM(dec.decode(bytes));
        const feats = osmXmlParse(text);
        if (feats.length > 0) {
          datasets.push({
            fileName: entryName,
            layerName: lName,
            format: 'osm',
            features: feats,
            featureCount: feats.length,
            geomType: feats[0].geom,
            attributeKeys: Array.from(new Set(feats.flatMap(f => Object.keys(f.props || {}))))
          });
        }
      }
      // J. World Files & Raster Georeferencing Bounds (.tfw, .jgw, .pgw, .wld)
      else if (lower.endsWith('.tfw') || lower.endsWith('.jgw') || lower.endsWith('.pgw') || lower.endsWith('.wld')) {
        const text = stripBOM(dec.decode(bytes));
        const feats = worldFileRasterParse(entryName, text, defaultZone, isSouth);
        if (feats.length > 0) {
          datasets.push({
            fileName: entryName,
            layerName: lName,
            format: 'raster_bounds',
            features: feats,
            featureCount: feats.length,
            geomType: 'polygon',
            attributeKeys: ['LayerType', 'PixelSizeX', 'OriginX', 'OriginY']
          });
        }
      }
      // K. ESRI ASCII Grid / DEM (.asc, .grd, .dem)
      else if (lower.endsWith('.asc') || lower.endsWith('.grd') || lower.endsWith('.dem')) {
        const text = stripBOM(dec.decode(bytes));
        const feats = asciiGridDemParse(entryName, text, defaultZone, isSouth);
        if (feats.length > 0) {
          datasets.push({
            fileName: entryName,
            layerName: lName,
            format: 'dem_grid',
            features: feats,
            featureCount: feats.length,
            geomType: 'polygon',
            attributeKeys: ['Columns', 'Rows', 'CellSize_m']
          });
        }
      }
      // L. Surpac Mining String (.str) / Micromine (.dat)
      else if (lower.endsWith('.str') || lower.endsWith('.dat')) {
        const text = stripBOM(dec.decode(bytes));
        const feats = surpacMiningStringParse(text, defaultZone, isSouth);
        if (feats.length > 0) {
          datasets.push({
            fileName: entryName,
            layerName: lName,
            format: 'surpac_mining',
            features: feats,
            featureCount: feats.length,
            geomType: feats[0].geom,
            attributeKeys: ['StringNumber']
          });
        }
      }
    } catch (err) {
      console.warn('Skipping unparseable zip file entry:', entryName, err);
    }
  }

  return datasets;
}

// -------------------------------------------------------------
// MapInfo Interchange MIF/MID Parser
// -------------------------------------------------------------
export function mapinfoMifMidParse(
  mifText: string,
  midText?: string,
  defaultZone: number = 45,
  isSouth: boolean = false
): GeoFeature[] {
  const feats: GeoFeature[] = [];
  const lines = mifText.split(/\r?\n/);
  const midRows: string[][] = midText ? parseCSV(midText) : [];

  let inData = false;
  let lineIdx = 0;
  let midIdx = 0;

  while (lineIdx < lines.length) {
    const rawLine = lines[lineIdx].trim();
    lineIdx++;
    if (!rawLine) continue;

    if (rawLine.toUpperCase().startsWith('DATA')) {
      inData = true;
      continue;
    }
    if (!inData) continue;

    const parts = rawLine.split(/\s+/);
    const cmd = parts[0].toUpperCase();
    const props: Record<string, any> = {};
    if (midRows[midIdx]) {
      midRows[midIdx].forEach((val, i) => {
        props[`Attr_${i + 1}`] = val;
      });
    }

    if (cmd === 'POINT') {
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      if (!isNaN(x) && !isNaN(y)) {
        const isLL = Math.abs(y) <= 90 && Math.abs(x) <= 180;
        feats.push({
          name: `Point_${feats.length + 1}`,
          geom: 'point',
          kind: isLL ? 'll' : 'en',
          pts: [{ a: x, b: y }],
          props
        });
        midIdx++;
      }
    } else if (cmd === 'LINE') {
      const x1 = parseFloat(parts[1]), y1 = parseFloat(parts[2]);
      const x2 = parseFloat(parts[3]), y2 = parseFloat(parts[4]);
      if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
        const isLL = Math.abs(y1) <= 90 && Math.abs(x1) <= 180;
        feats.push({
          name: `Line_${feats.length + 1}`,
          geom: 'line',
          kind: isLL ? 'll' : 'en',
          pts: [{ a: x1, b: y1 }, { a: x2, b: y2 }],
          props
        });
        midIdx++;
      }
    } else if (cmd === 'PLINE' || cmd === 'REGION') {
      const isRegion = cmd === 'REGION';
      let numSections = 1;
      let numPts = 0;
      if (isRegion) {
        numSections = parseInt(parts[1], 10) || 1;
      } else {
        numPts = parseInt(parts[1], 10) || 0;
      }

      for (let s = 0; s < numSections; s++) {
        let secPtsCount = numPts;
        if (isRegion) {
          if (lineIdx < lines.length) {
            secPtsCount = parseInt(lines[lineIdx].trim(), 10) || 0;
            lineIdx++;
          }
        }
        const pts: GeoPoint[] = [];
        for (let p = 0; p < secPtsCount && lineIdx < lines.length; p++) {
          const ptLine = lines[lineIdx].trim();
          lineIdx++;
          const ptParts = ptLine.split(/\s+/).map(parseFloat);
          if (ptParts.length >= 2 && !isNaN(ptParts[0]) && !isNaN(ptParts[1])) {
            pts.push({ a: ptParts[0], b: ptParts[1] });
          }
        }
        if (pts.length > 0) {
          const isLL = Math.abs(pts[0].b) <= 90 && Math.abs(pts[0].a) <= 180;
          feats.push({
            name: `${isRegion ? 'Region' : 'Pline'}_${feats.length + 1}`,
            geom: isRegion ? 'polygon' : 'line',
            kind: isLL ? 'll' : 'en',
            pts,
            props
          });
        }
      }
      midIdx++;
    }
  }
  return feats;
}

// -------------------------------------------------------------
// TopoJSON Parser
// -------------------------------------------------------------
export function topoJsonParse(topoText: string): GeoFeature[] {
  const feats: GeoFeature[] = [];
  try {
    const topo = JSON.parse(topoText);
    if (!topo || topo.type !== 'Topology' || !topo.objects || !topo.arcs) {
      return feats;
    }
    const transform = topo.transform;
    const arcs: [number, number][][] = topo.arcs.map((arc: [number, number][]) => {
      let x = 0, y = 0;
      return arc.map(pt => {
        x += pt[0];
        y += pt[1];
        if (transform) {
          return [
            x * transform.scale[0] + transform.translate[0],
            y * transform.scale[1] + transform.translate[1]
          ] as [number, number];
        }
        return [x, y] as [number, number];
      });
    });

    function decodeArc(arcIdx: number): [number, number][] {
      if (arcIdx >= 0) return arcs[arcIdx] || [];
      const rev = (arcs[~arcIdx] || []).slice().reverse();
      return rev;
    }

    function decodeRing(ring: number[]): GeoPoint[] {
      const coords: [number, number][] = [];
      ring.forEach(arcIdx => {
        const decoded = decodeArc(arcIdx);
        decoded.forEach((pt, i) => {
          if (i > 0 || coords.length === 0) {
            coords.push(pt);
          }
        });
      });
      return coords.map(c => ({ a: c[0], b: c[1] }));
    }

    Object.keys(topo.objects).forEach(objKey => {
      const obj = topo.objects[objKey];
      if (!obj) return;
      const geometries = obj.geometries || (obj.type ? [obj] : []);
      geometries.forEach((geom: any, gIdx: number) => {
        const name = geom.properties?.name || geom.id || `${objKey}_${gIdx + 1}`;
        const props = geom.properties || {};
        if (geom.type === 'Point' && geom.coordinates) {
          let [x, y] = geom.coordinates;
          if (transform) {
            x = x * transform.scale[0] + transform.translate[0];
            y = y * transform.scale[1] + transform.translate[1];
          }
          feats.push({ name, geom: 'point', kind: 'll', pts: [{ a: x, b: y }], props });
        } else if (geom.type === 'LineString' && geom.arcs) {
          const pts = decodeRing(geom.arcs);
          if (pts.length > 0) feats.push({ name, geom: 'line', kind: 'll', pts, props });
        } else if (geom.type === 'Polygon' && geom.arcs && geom.arcs.length > 0) {
          const pts = decodeRing(geom.arcs[0]);
          if (pts.length > 0) feats.push({ name, geom: 'polygon', kind: 'll', pts, props });
        } else if (geom.type === 'MultiPolygon' && geom.arcs) {
          geom.arcs.forEach((polyArcs: number[][], pIdx: number) => {
            if (polyArcs.length > 0) {
              const pts = decodeRing(polyArcs[0]);
              if (pts.length > 0) {
                feats.push({ name: `${name}_p${pIdx + 1}`, geom: 'polygon', kind: 'll', pts, props });
              }
            }
          });
        }
      });
    });
  } catch (err) {
    console.warn('Error parsing TopoJSON:', err);
  }
  return feats;
}

// -------------------------------------------------------------
// Geography Markup Language (GML / WFS) Parser
// -------------------------------------------------------------
export function gmlXmlParse(
  gmlText: string,
  defaultZone: number = 45,
  isSouth: boolean = false
): GeoFeature[] {
  const feats: GeoFeature[] = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gmlText, 'application/xml');

    // Points
    const points = doc.querySelectorAll('Point, gml\\:Point');
    points.forEach((el, idx) => {
      const pos = el.querySelector('pos, gml\\:pos, coordinates, gml\\:coordinates');
      if (pos && pos.textContent) {
        const nums = pos.textContent.trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
        if (nums.length >= 2) {
          let a = nums[0], b = nums[1];
          let isLL = Math.abs(a) <= 180 && Math.abs(b) <= 90;
          if (Math.abs(a) <= 90 && Math.abs(b) <= 180 && !isLL) {
            const tmp = a; a = b; b = tmp;
            isLL = true;
          }
          feats.push({
            name: el.getAttribute('gml:id') || el.getAttribute('id') || `GML_Point_${idx + 1}`,
            geom: 'point',
            kind: isLL ? 'll' : 'en',
            pts: [{ a, b }],
            props: { gml_id: el.getAttribute('gml:id') || '' }
          });
        }
      }
    });

    // Polygons
    const polys = doc.querySelectorAll('Polygon, gml\\:Polygon');
    polys.forEach((el, idx) => {
      const posList = el.querySelector('posList, gml\\:posList, coordinates, gml\\:coordinates');
      if (posList && posList.textContent) {
        const nums = posList.textContent.trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
        const pts: GeoPoint[] = [];
        for (let i = 0; i < nums.length - 1; i += 2) {
          pts.push({ a: nums[i], b: nums[i + 1] });
        }
        if (pts.length >= 3) {
          const isLL = Math.abs(pts[0].a) <= 180 && Math.abs(pts[0].b) <= 90;
          feats.push({
            name: el.getAttribute('gml:id') || el.getAttribute('id') || `GML_Polygon_${idx + 1}`,
            geom: 'polygon',
            kind: isLL ? 'll' : 'en',
            pts,
            props: { gml_id: el.getAttribute('gml:id') || '' }
          });
        }
      }
    });

    // LineStrings
    const lines = doc.querySelectorAll('LineString, gml\\:LineString');
    lines.forEach((el, idx) => {
      const posList = el.querySelector('posList, gml\\:posList, coordinates, gml\\:coordinates');
      if (posList && posList.textContent) {
        const nums = posList.textContent.trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
        const pts: GeoPoint[] = [];
        for (let i = 0; i < nums.length - 1; i += 2) {
          pts.push({ a: nums[i], b: nums[i + 1] });
        }
        if (pts.length >= 2) {
          const isLL = Math.abs(pts[0].a) <= 180 && Math.abs(pts[0].b) <= 90;
          feats.push({
            name: el.getAttribute('gml:id') || el.getAttribute('id') || `GML_Line_${idx + 1}`,
            geom: 'line',
            kind: isLL ? 'll' : 'en',
            pts,
            props: { gml_id: el.getAttribute('gml:id') || '' }
          });
        }
      }
    });
  } catch (err) {
    console.warn('Error parsing GML:', err);
  }
  return feats;
}

// -------------------------------------------------------------
// World File & Raster Bounds (.tfw, .jgw, .pgw, .wld)
// -------------------------------------------------------------
export function worldFileRasterParse(
  fileName: string,
  wldText: string,
  defaultZone: number = 45,
  isSouth: boolean = false
): GeoFeature[] {
  const lines = wldText.trim().split(/\r?\n/).map(l => parseFloat(l.trim())).filter(n => !isNaN(n));
  if (lines.length < 6) return [];

  const [dx, rotY, rotX, dy, x0, y0] = lines;
  const w = 2048;
  const h = 2048;

  const p1 = { a: x0, b: y0 };
  const p2 = { a: x0 + w * dx + 0 * rotX, b: y0 + w * rotY + 0 * dy };
  const p3 = { a: x0 + w * dx + h * rotX, b: y0 + w * rotY + h * dy };
  const p4 = { a: x0 + 0 * dx + h * rotX, b: y0 + 0 * rotY + h * dy };

  const isLL = Math.abs(x0) <= 180 && Math.abs(y0) <= 90;
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  return [{
    name: `Raster_Bounds_${baseName}`,
    geom: 'polygon',
    kind: isLL ? 'll' : 'en',
    pts: [p1, p2, p3, p4, { ...p1 }],
    props: {
      LayerType: 'Georeferenced Raster Footprint',
      PixelSizeX: dx,
      PixelSizeY: dy,
      OriginX: x0,
      OriginY: y0,
      FileName: fileName
    }
  }];
}

// -------------------------------------------------------------
// ESRI ASCII Grid / DEM Parser (.asc, .grd, .dem)
// -------------------------------------------------------------
export function asciiGridDemParse(
  fileName: string,
  ascText: string,
  defaultZone: number = 45,
  isSouth: boolean = false
): GeoFeature[] {
  const lines = ascText.trim().split(/\r?\n/);
  const header: Record<string, number> = {};
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length === 2 && !isNaN(parseFloat(parts[1]))) {
      header[parts[0].toLowerCase()] = parseFloat(parts[1]);
    }
  }

  const ncols = header['ncols'] || 100;
  const nrows = header['nrows'] || 100;
  const xll = header['xllcorner'] !== undefined ? header['xllcorner'] : (header['xllcenter'] || 0);
  const yll = header['yllcorner'] !== undefined ? header['yllcorner'] : (header['yllcenter'] || 0);
  const cellsize = header['cellsize'] || 10;

  const xur = xll + ncols * cellsize;
  const yur = yll + nrows * cellsize;

  const isLL = Math.abs(xll) <= 180 && Math.abs(yll) <= 90;
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  return [{
    name: `DEM_Grid_${baseName}`,
    geom: 'polygon',
    kind: isLL ? 'll' : 'en',
    pts: [
      { a: xll, b: yll },
      { a: xur, b: yll },
      { a: xur, b: yur },
      { a: xll, b: yur },
      { a: xll, b: yll }
    ],
    props: {
      LayerType: 'ESRI ASCII Grid / DEM Boundary',
      Columns: ncols,
      Rows: nrows,
      CellSize_m: cellsize,
      MinEasting: xll,
      MinNorthing: yll,
      MaxEasting: xur,
      MaxNorthing: yur,
      NoDataValue: header['nodata_value'] || -9999
    }
  }];
}

// -------------------------------------------------------------
// Surpac Mining String (.str) / Micromine (.dat) Parser
// -------------------------------------------------------------
export function surpacMiningStringParse(
  strText: string,
  defaultZone: number = 45,
  isSouth: boolean = false
): GeoFeature[] {
  const feats: GeoFeature[] = [];
  const lines = strText.split(/\r?\n/);
  let currentStringNum = 0;
  let currentPts: GeoPoint[] = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l.startsWith('END') || l.startsWith('0,') || l.startsWith('0 0 0')) continue;
    const parts = l.split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));
    if (parts.length >= 4) {
      const strNum = Math.round(parts[0]);
      const Y = parts[1]; // Northing
      const X = parts[2]; // Easting
      const Z = parts[3]; // Elevation

      if (strNum !== currentStringNum) {
        if (currentPts.length > 0) {
          feats.push({
            name: `Surpac_Str_${currentStringNum}`,
            geom: currentPts.length === 1 ? 'point' : 'line',
            kind: 'en',
            pts: [...currentPts],
            props: { StringNumber: currentStringNum, Elevation: Z }
          });
        }
        currentStringNum = strNum;
        currentPts = [];
      }
      currentPts.push({ a: X, b: Y });
    }
  }
  if (currentPts.length > 0) {
    feats.push({
      name: `Surpac_Str_${currentStringNum}`,
      geom: currentPts.length === 1 ? 'point' : 'line',
      kind: 'en',
      pts: currentPts,
      props: { StringNumber: currentStringNum }
    });
  }
  return feats;
}


// -------------------------------------------------------------
// LandXML Parser (Parcels, Alignments, CgPoints)
// -------------------------------------------------------------
export function landXmlParse(
  xmlText: string,
  defaultZone: number = 45,
  isSouth: boolean = false
): GeoFeature[] {
  const feats: GeoFeature[] = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');

    // 1. CgPoints (Coordinate Geometry Points)
    const cgPoints = doc.getElementsByTagName('CgPoint');
    for (let i = 0; i < cgPoints.length; i++) {
      const el = cgPoints[i];
      const name = el.getAttribute('name') || el.getAttribute('pntRef') || `PT_${i + 1}`;
      const code = el.getAttribute('code') || el.getAttribute('desc') || '';
      const text = el.textContent?.trim() || '';
      const parts = text.split(/[\s,]+/).map(parseFloat);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        // In LandXML, coordinate order is typically Northing Easting (Elevation)
        let N = parts[0], E = parts[1], Z = parts[2] || 0;
        let isLL = false;
        if (Math.abs(N) <= 90 && Math.abs(E) <= 180) {
          isLL = true;
        }
        feats.push({
          name,
          geom: 'point',
          kind: isLL ? 'll' : 'en',
          pts: [{ a: isLL ? E : E, b: isLL ? N : N }],
          props: {
            Name: name,
            Code: code,
            Elevation: Z,
            Northing: isLL ? undefined : N,
            Easting: isLL ? undefined : E
          }
        });
      }
    }

    // 2. Parcels
    const parcels = doc.getElementsByTagName('Parcel');
    for (let i = 0; i < parcels.length; i++) {
      const el = parcels[i];
      const name = el.getAttribute('name') || `Parcel_${i + 1}`;
      const desc = el.getAttribute('desc') || '';
      const area = el.getAttribute('area') || '';
      const pts: GeoPoint[] = [];

      const coordGeom = el.getElementsByTagName('CoordGeom')[0];
      if (coordGeom) {
        const lines = coordGeom.children;
        for (let j = 0; j < lines.length; j++) {
          const lineEl = lines[j];
          const startEl = lineEl.getElementsByTagName('Start')[0];
          if (startEl && startEl.textContent) {
            const sp = startEl.textContent.trim().split(/[\s,]+/).map(parseFloat);
            if (sp.length >= 2 && !isNaN(sp[0]) && !isNaN(sp[1])) {
              pts.push({ a: sp[1], b: sp[0] });
            }
          }
        }
      }

      if (pts.length < 3) {
        const pntList = el.getElementsByTagName('PntList2D')[0] || el.getElementsByTagName('PntList3D')[0];
        if (pntList && pntList.textContent) {
          const coords = pntList.textContent.trim().split(/[\s,]+/).map(parseFloat);
          for (let k = 0; k < coords.length; k += 2) {
            if (!isNaN(coords[k]) && !isNaN(coords[k + 1])) {
              pts.push({ a: coords[k + 1], b: coords[k] });
            }
          }
        }
      }

      if (pts.length >= 3) {
        feats.push({
          name,
          geom: 'polygon',
          kind: 'en',
          pts,
          props: {
            Parcel_Name: name,
            Description: desc,
            Area_m2: area ? parseFloat(area) : undefined
          }
        });
      }
    }

    // 3. Alignments
    const alignments = doc.getElementsByTagName('Alignment');
    for (let i = 0; i < alignments.length; i++) {
      const el = alignments[i];
      const name = el.getAttribute('name') || `Alignment_${i + 1}`;
      const pts: GeoPoint[] = [];
      const lines = el.getElementsByTagName('Line');
      for (let j = 0; j < lines.length; j++) {
        const startEl = lines[j].getElementsByTagName('Start')[0];
        const endEl = lines[j].getElementsByTagName('End')[0];
        if (startEl && startEl.textContent) {
          const sp = startEl.textContent.trim().split(/[\s,]+/).map(parseFloat);
          if (sp.length >= 2 && !isNaN(sp[0]) && !isNaN(sp[1])) {
            pts.push({ a: sp[1], b: sp[0] });
          }
        }
        if (endEl && endEl.textContent) {
          const ep = endEl.textContent.trim().split(/[\s,]+/).map(parseFloat);
          if (ep.length >= 2 && !isNaN(ep[0]) && !isNaN(ep[1])) {
            pts.push({ a: ep[1], b: ep[0] });
          }
        }
      }
      if (pts.length >= 2) {
        feats.push({
          name,
          geom: 'line',
          kind: 'en',
          pts,
          props: { Alignment_Name: name }
        });
      }
    }
  } catch (err) {
    console.error('Error parsing LandXML:', err);
  }
  return feats;
}

// -------------------------------------------------------------
// OpenStreetMap XML Parser (.osm)
// -------------------------------------------------------------
export function osmXmlParse(xmlText: string): GeoFeature[] {
  const feats: GeoFeature[] = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const nodeMap: Record<string, { lat: number; lon: number; name?: string }> = {};

    const nodes = doc.getElementsByTagName('node');
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const id = n.getAttribute('id') || '';
      const lat = parseFloat(n.getAttribute('lat') || '');
      const lon = parseFloat(n.getAttribute('lon') || '');
      if (id && !isNaN(lat) && !isNaN(lon)) {
        let nodeName: string | undefined;
        const tags = n.getElementsByTagName('tag');
        for (let j = 0; j < tags.length; j++) {
          if (tags[j].getAttribute('k') === 'name') {
            nodeName = tags[j].getAttribute('v') || undefined;
          }
        }
        nodeMap[id] = { lat, lon, name: nodeName };
        if (nodeName) {
          feats.push({
            name: nodeName,
            geom: 'point',
            kind: 'll',
            pts: [{ a: lon, b: lat }],
            props: { OSM_ID: id, Name: nodeName }
          });
        }
      }
    }

    const ways = doc.getElementsByTagName('way');
    for (let i = 0; i < ways.length; i++) {
      const w = ways[i];
      const id = w.getAttribute('id') || `Way_${i + 1}`;
      let wayName = `Way_${id}`;
      let isBuilding = false;
      const tags = w.getElementsByTagName('tag');
      for (let j = 0; j < tags.length; j++) {
        const k = tags[j].getAttribute('k');
        const v = tags[j].getAttribute('v') || '';
        if (k === 'name') wayName = v;
        if (k === 'building') isBuilding = true;
      }

      const nds = w.getElementsByTagName('nd');
      const pts: GeoPoint[] = [];
      for (let j = 0; j < nds.length; j++) {
        const ref = nds[j].getAttribute('ref');
        if (ref && nodeMap[ref]) {
          pts.push({ a: nodeMap[ref].lon, b: nodeMap[ref].lat });
        }
      }

      if (pts.length >= 2) {
        const isClosed = pts.length >= 3 && pts[0].a === pts[pts.length - 1].a && pts[0].b === pts[pts.length - 1].b;
        feats.push({
          name: wayName,
          geom: isClosed || isBuilding ? 'polygon' : 'line',
          kind: 'll',
          pts,
          props: { OSM_ID: id, Name: wayName, IsBuilding: isBuilding }
        });
      }
    }
  } catch (err) {
    console.error('Error parsing OSM XML:', err);
  }
  return feats;
}

// -------------------------------------------------------------
// Photo Landmark KML Builder (with Rich Photo Balloon & HUD)
// -------------------------------------------------------------
export function exportPhotoLandmarksKML(
  landmarks: PhotoLandmark[],
  projectName: string = 'Survey_Photo_Landmarks'
): string {
  const placemarks = landmarks.map(lm => {
    const lat = lm.lat.toFixed(7);
    const lon = lm.lon.toFixed(7);
    const alt = (lm.altitude || 0).toFixed(2);
    const dateStr = new Date(lm.timestamp).toLocaleString();
    const azStr = lm.azimuth != null ? `${lm.azimuth.toFixed(1)}° (${lm.cardinal || 'N'})` : 'N/A';
    const pitchStr = lm.pitch != null ? `${lm.pitch.toFixed(1)}°` : 'N/A';
    const slopeStr = lm.slopePercent != null ? `${lm.slopePercent.toFixed(1)}%` : 'N/A';
    const distStr = lm.targetDistanceMeters != null ? `${lm.targetDistanceMeters.toFixed(2)} m` : 'N/A';
    const heightStr = lm.targetHeightMeters != null ? `${lm.targetHeightMeters.toFixed(2)} m` : 'N/A';

    const measRows = (lm.measurements || [])
      .map(m => `<tr><td style="padding:3px 8px;border:1px solid #ddd;">${xmlesc(m.valueLabel)}</td><td style="padding:3px 8px;border:1px solid #ddd;">${m.realWorldValue != null ? m.realWorldValue.toFixed(2) : '-'} ${m.unit}</td></tr>`)
      .join('');

    const balloonHtml = `
      <div style="font-family:Arial,sans-serif;max-width:420px;padding:6px;">
        <h3 style="margin:0 0 6px 0;color:#c9a063;">📷 ${xmlesc(lm.name)}</h3>
        ${lm.dataUrl ? `<div style="text-align:center;margin-bottom:8px;"><img src="${lm.dataUrl}" style="max-width:100%;max-height:260px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.3);"/></div>` : ''}
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;">
          <tr style="background:#f4f4f4;"><td style="padding:3px 8px;font-weight:bold;">Timestamp</td><td style="padding:3px 8px;">${dateStr}</td></tr>
          <tr><td style="padding:3px 8px;font-weight:bold;">WGS84 Coordinates</td><td style="padding:3px 8px;">${lat}°, ${lon}°</td></tr>
          <tr style="background:#f4f4f4;"><td style="padding:3px 8px;font-weight:bold;">UTM Projection</td><td style="padding:3px 8px;">Z${lm.zone || 45}${lm.south ? 'S' : 'N'} E:${lm.utmE ? lm.utmE.toFixed(2) : '-'} N:${lm.utmN ? lm.utmN.toFixed(2) : '-'}</td></tr>
          <tr><td style="padding:3px 8px;font-weight:bold;">Altitude / Accuracy</td><td style="padding:3px 8px;">${alt}m (±${(lm.accuracy || 0).toFixed(1)}m)</td></tr>
          <tr style="background:#f4f4f4;"><td style="padding:3px 8px;font-weight:bold;">Azimuth / Pitch</td><td style="padding:3px 8px;">${azStr} / ${pitchStr} (Slope: ${slopeStr})</td></tr>
          ${lm.targetDistanceMeters ? `<tr><td style="padding:3px 8px;font-weight:bold;">Target Distance</td><td style="padding:3px 8px;">${distStr}</td></tr>` : ''}
          ${lm.targetHeightMeters ? `<tr style="background:#f4f4f4;"><td style="padding:3px 8px;font-weight:bold;">Target Height</td><td style="padding:3px 8px;">${heightStr}</td></tr>` : ''}
          ${lm.surveyor ? `<tr><td style="padding:3px 8px;font-weight:bold;">Surveyor</td><td style="padding:3px 8px;">${xmlesc(lm.surveyor)}</td></tr>` : ''}
        </table>
        ${lm.notes ? `<p style="font-size:12px;color:#333;margin:4px 0;"><strong>Notes:</strong> ${xmlesc(lm.notes)}</p>` : ''}
        ${measRows ? `<h4 style="margin:6px 0 2px 0;font-size:12px;">Visual Measurements:</h4><table style="width:100%;border-collapse:collapse;font-size:11px;">${measRows}</table>` : ''}
      </div>
    `;

    return `
    <Placemark>
      <name>${xmlesc(lm.name)}</name>
      <description><![CDATA[${balloonHtml}]]></description>
      <LookAt>
        <longitude>${lon}</longitude>
        <latitude>${lat}</latitude>
        <altitude>${alt}</altitude>
        <heading>${(lm.azimuth || 0).toFixed(1)}</heading>
        <tilt>${Math.max(0, Math.min(85, 90 - (lm.pitch || 0))).toFixed(1)}</tilt>
        <range>30</range>
      </LookAt>
      <Point>
        <coordinates>${lon},${lat},${alt}</coordinates>
      </Point>
    </Placemark>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xmlesc(projectName)}</name>
    <description>${xmlesc(PROV.line)}</description>
    <Style id="photoIcon">
      <IconStyle>
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/camera.png</href>
        </Icon>
      </IconStyle>
    </Style>
${placemarks}
  </Document>
</kml>`;
}

// -------------------------------------------------------------
// Build Complete Photo Landmarks ZIP Package
// -------------------------------------------------------------
export function buildPhotoLandmarksZip(
  landmarks: PhotoLandmark[],
  projectName: string = 'Survey_Photo_Landmarks',
  defaultZone: number = 45,
  isSouth: boolean = false
): Uint8Array {
  const enc = new TextEncoder();
  const zipEntries: ZipFileEntry[] = [];

  // 1. KML
  const kmlContent = exportPhotoLandmarksKML(landmarks, projectName);
  zipEntries.push({ name: `${projectName}.kml`, data: enc.encode(kmlContent) });

  // 2. GeoJSON
  const geojsonObj = {
    type: 'FeatureCollection',
    features: landmarks.map(lm => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lm.lon, lm.lat, lm.altitude || 0]
      },
      properties: {
        id: lm.id,
        name: lm.name,
        timestamp: new Date(lm.timestamp).toISOString(),
        azimuth: lm.azimuth,
        pitch: lm.pitch,
        slopePercent: lm.slopePercent,
        altitude: lm.altitude,
        accuracy: lm.accuracy,
        targetDistanceMeters: lm.targetDistanceMeters,
        targetHeightMeters: lm.targetHeightMeters,
        notes: lm.notes,
        surveyor: lm.surveyor,
        project: lm.project
      }
    }))
  };
  zipEntries.push({ name: `${projectName}.geojson`, data: enc.encode(JSON.stringify(geojsonObj, null, 2)) });

  // 3. CSV Register
  const headers = [
    'ID', 'Name', 'Timestamp', 'Latitude', 'Longitude', 'Altitude_m',
    'Accuracy_m', 'UTM_Zone', 'Easting_m', 'Northing_m', 'Azimuth_deg',
    'Pitch_deg', 'Slope_pct', 'Target_Dist_m', 'Target_Height_m', 'Surveyor', 'Notes'
  ];
  const rows = landmarks.map(lm => [
    lm.id,
    lm.name,
    new Date(lm.timestamp).toISOString(),
    lm.lat.toFixed(7),
    lm.lon.toFixed(7),
    (lm.altitude || 0).toFixed(2),
    (lm.accuracy || 0).toFixed(2),
    `Z${lm.zone || defaultZone}${lm.south ? 'S' : 'N'}`,
    lm.utmE != null ? lm.utmE.toFixed(3) : '',
    lm.utmN != null ? lm.utmN.toFixed(3) : '',
    lm.azimuth != null ? lm.azimuth.toFixed(1) : '',
    lm.pitch != null ? lm.pitch.toFixed(1) : '',
    lm.slopePercent != null ? lm.slopePercent.toFixed(1) : '',
    lm.targetDistanceMeters != null ? lm.targetDistanceMeters.toFixed(2) : '',
    lm.targetHeightMeters != null ? lm.targetHeightMeters.toFixed(2) : '',
    lm.surveyor || '',
    lm.notes || ''
  ]);
  zipEntries.push({ name: `${projectName}_Register.csv`, data: enc.encode(toCSVtext(headers, rows)) });

  // 4. Shapefile Bundle
  const shpFeats: GeoFeature[] = landmarks.map(lm => {
    const E = lm.utmE != null ? lm.utmE : lonLatToUtm(lm.lon, lm.lat, defaultZone, isSouth).E;
    const N = lm.utmN != null ? lm.utmN : lonLatToUtm(lm.lon, lm.lat, defaultZone, isSouth).N;
    return {
      name: lm.name,
      geom: 'point',
      kind: 'en',
      pts: [{ a: E, b: N }],
      props: {
        ID: lm.id.slice(0, 10),
        Name: lm.name.slice(0, 16),
        Azimuth: lm.azimuth != null ? Number(lm.azimuth.toFixed(1)) : 0,
        Pitch: lm.pitch != null ? Number(lm.pitch.toFixed(1)) : 0,
        Dist_m: lm.targetDistanceMeters != null ? Number(lm.targetDistanceMeters.toFixed(2)) : 0,
        Height_m: lm.targetHeightMeters != null ? Number(lm.targetHeightMeters.toFixed(2)) : 0,
        Alt_m: lm.altitude != null ? Number(lm.altitude.toFixed(2)) : 0,
        Acc_m: lm.accuracy != null ? Number(lm.accuracy.toFixed(2)) : 0,
        Notes: (lm.notes || '').slice(0, 30)
      }
    };
  });

  if (shpFeats.length > 0) {
    const shpZipBytes = buildShapefileZip(shpFeats, 'landmarks_shp', defaultZone, isSouth);
    zipEntries.push({ name: `shp/${projectName}_shp.zip`, data: shpZipBytes });
  }

  // 5. Photos
  landmarks.forEach((lm, idx) => {
    if (lm.dataUrl && lm.dataUrl.startsWith('data:image/')) {
      try {
        const base64Data = lm.dataUrl.split(',')[1];
        if (base64Data) {
          const binaryStr = atob(base64Data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const sName = lm.name.replace(/[^a-zA-Z0-9_\-]/g, '_');
          zipEntries.push({ name: `photos/${idx + 1}_${sName}.jpg`, data: bytes });
        }
      } catch (err) {
        console.warn('Failed to encode photo in zip:', lm.name, err);
      }
    }
  });

  return makeZip(zipEntries);
}




