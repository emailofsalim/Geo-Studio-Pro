import { GeoFeature, GeoPoint } from '../types';
import { lonLatToUtm, utmToLonLat } from './geodesy';
import { makeZip, ZipFileEntry } from './zip';

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


