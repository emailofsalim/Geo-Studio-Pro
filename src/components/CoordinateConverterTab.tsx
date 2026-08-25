import React, { useState, useEffect } from 'react';
import {
  Globe,
  ArrowLeftRight,
  Upload,
  Download,
  Copy,
  Check,
  RefreshCw,
  Layers,
  Sparkles,
  Compass
} from 'lucide-react';
import {
  utmToLonLat,
  lonLatToUtm,
  zoneFromLonLat,
  parseDMSval,
  toDMSstr,
  mgrsFromLonLat,
  datumTransform,
  ELLIPSOIDS,
  DEFAULT_BURSA_WOLF_7,
  helmertFit,
  helmertApply,
  INDIAN_GRID_ZONES,
  getIndianZone,
  indianGridFwd,
  indianGridInv,
  ControlPointPair
} from '../lib/geodesy';
import { parseCSV, stripBOM, toCSVtext, csvEnc } from '../lib/formats';
import { downloadBlob } from '../lib/zip';

interface CoordinateConverterTabProps {
  workingZone: string;
  setWorkingZone: (z: string) => void;
}

export const CoordinateConverterTab: React.FC<CoordinateConverterTabProps> = ({
  workingZone,
  setWorkingZone
}) => {
  // Single Point State
  const [direction, setDirection] = useState<'u2w' | 'w2u'>('u2w');
  const [valA, setValA] = useState<string>('254800.00');
  const [valB, setValB] = useState<string>('2605200.00');
  const [singleZone, setSingleZone] = useState<string>(workingZone);
  const [precision, setPrecision] = useState<number>(8);
  const [copied, setCopied] = useState<string | null>(null);

  // Batch CSV State
  const [batchDir, setBatchDir] = useState<'u2w' | 'w2u'>('u2w');
  const [batchZone, setBatchZone] = useState<string>(workingZone);
  const [batchRows, setBatchRows] = useState<string[][] | null>(null);
  const [batchCols, setBatchCols] = useState<string[] | null>(null);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);

  // Bulk Paste State
  const [pasteDir, setPasteDir] = useState<'ll2en' | 'en2ll'>('ll2en');
  const [pasteZone, setPasteZone] = useState<string>(workingZone);
  const [pasteText, setPasteText] = useState<string>(
    '84.6147, 23.5487\n84°36\'53"E, 23°32\'55"N'
  );
  const [pasteResults, setPasteResults] = useState<{ cols: string[]; rows: (string | number)[][] } | null>(null);

  // Zone to Zone Re-projector
  const [zFrom, setZFrom] = useState<string>('45N');
  const [zTo, setZTo] = useState<string>('44N');
  const [zE, setZE] = useState<string>('255000');
  const [zN, setZN] = useState<string>('2605000');
  const [zResult, setZResult] = useState<string | null>(null);

  // Local Shift
  const [shiftE, setShiftE] = useState<string>('255000');
  const [shiftN, setShiftN] = useState<string>('2605000');
  const [deltaE, setDeltaE] = useState<string>('0');
  const [deltaN, setDeltaN] = useState<string>('0');
  const [shiftResult, setShiftResult] = useState<string | null>(null);

  // Datum Transform (Bursa-Wolf)
  const [datumFrom, setDatumFrom] = useState<string>('everestIndia');
  const [datumTo, setDatumTo] = useState<string>('wgs84');
  const [datumLon, setDatumLon] = useState<string>('84.6147');
  const [datumLat, setDatumLat] = useState<string>('23.5487');
  const [datumH, setDatumH] = useState<string>('0');
  const [bwParams, setBwParams] = useState(DEFAULT_BURSA_WOLF_7);
  const [datumResult, setDatumResult] = useState<{ lon: number; lat: number; h: number } | null>(null);

  // Helmert 2D Fit (Local -> UTM)
  const [ctrlText, setCtrlText] = useState<string>(
    '1000, 1000, 255000.000, 2605000.000\n1500, 1000, 255480.500, 2604985.200\n1000, 1600, 254982.100, 2605598.700'
  );
  const [localPtsText, setLocalPtsText] = useState<string>('P1, 1250, 1300\nP2, 1420, 1180');
  const [helmertModel, setHelmertModel] = useState<any | null>(null);
  const [helmertConverted, setHelmertConverted] = useState<any[] | null>(null);

  // Indian Grid (LCC)
  const [indZoneEpsg, setIndZoneEpsg] = useState<number>(24379);
  const [indDir, setIndDir] = useState<'l2g' | 'g2l'>('l2g');
  const [indDatumMode, setIndDatumMode] = useState<'local' | 'wgs'>('local');
  const [indValA, setIndValA] = useState<string>('74.0');
  const [indValB, setIndValB] = useState<string>('26.0');
  const [indResult, setIndResult] = useState<any | null>(null);

  // Calculation History
  const [history, setHistory] = useState<{ text: string; time: number }[]>([]);

  useEffect(() => {
    setSingleZone(workingZone);
    setBatchZone(workingZone);
    setPasteZone(workingZone);
  }, [workingZone]);

  const zoneNum = parseInt(singleZone, 10) || 45;
  const isSouth = singleZone.endsWith('S');

  // Single Point live calculation
  const singleResult = React.useMemo(() => {
    const a = parseDMSval(valA);
    const b = parseDMSval(valB);
    if (isNaN(a) || isNaN(b)) return null;

    if (direction === 'u2w') {
      const ll = utmToLonLat(a, b, zoneNum, isSouth);
      const mgrs = mgrsFromLonLat(ll.lon, ll.lat, zoneNum, isSouth);
      const dmsLat = toDMSstr(ll.lat, true);
      const dmsLon = toDMSstr(ll.lon, false);
      return {
        type: 'WGS84',
        lon: ll.lon.toFixed(precision),
        lat: ll.lat.toFixed(precision),
        dms: `${dmsLat}, ${dmsLon}`,
        mgrs,
        zone: singleZone
      };
    } else {
      const u = lonLatToUtm(a, b, zoneNum, isSouth);
      const mgrs = mgrsFromLonLat(a, b, zoneNum, isSouth);
      const dmsLat = toDMSstr(b, true);
      const dmsLon = toDMSstr(a, false);
      return {
        type: 'UTM',
        E: u.E.toFixed(3),
        N: u.N.toFixed(3),
        dms: `${dmsLat}, ${dmsLon}`,
        mgrs,
        zone: singleZone
      };
    }
  }, [direction, valA, valB, zoneNum, isSouth, precision, singleZone]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleSwapXY = () => {
    const temp = valA;
    setValA(valB);
    setValB(temp);
  };

  const handleAutoZone = () => {
    const a = parseDMSval(valA);
    const b = parseDMSval(valB);
    if (!isNaN(a) && !isNaN(b) && direction === 'w2u') {
      const z = zoneFromLonLat(a, b);
      const zStr = `${z.zone}${z.south ? 'S' : 'N'}`;
      setSingleZone(zStr);
    }
  };

  // Batch CSV Handler
  const handleBatchFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = stripBOM(await file.text());
      const rows = parseCSV(text);
      if (rows.length < 2) {
        setBatchStatus('Error: CSV has no data rows.');
        return;
      }
      const hdr = rows[0].map(h => h.trim().toLowerCase());
      const bZNum = parseInt(batchZone, 10) || 45;
      const bSouth = batchZone.endsWith('S');

      const li = hdr.findIndex(h => h === 'longitude' || h === 'lon');
      const la = hdr.findIndex(h => h === 'latitude' || h === 'lat');
      const ei = hdr.findIndex(h => h === 'easting' || h === 'e');
      const ni = hdr.findIndex(h => h === 'northing' || h === 'n');

      const out: string[][] = [];
      let skipped = 0;

      rows.slice(1).forEach(row => {
        if (batchDir === 'u2w') {
          const E = parseFloat(row[ei]);
          const N = parseFloat(row[ni]);
          if (isNaN(E) || isNaN(N)) {
            skipped++;
            return;
          }
          const ll = utmToLonLat(E, N, bZNum, bSouth);
          out.push([...row, ll.lon.toFixed(8), ll.lat.toFixed(8)]);
        } else {
          const lon = parseFloat(row[li]);
          const lat = parseFloat(row[la]);
          if (isNaN(lon) || isNaN(lat)) {
            skipped++;
            return;
          }
          const u = lonLatToUtm(lon, lat, bZNum, bSouth);
          out.push([...row, u.E.toFixed(3), u.N.toFixed(3)]);
        }
      });

      const newCols = batchDir === 'u2w'
        ? [...rows[0], 'Longitude_WGS84', 'Latitude_WGS84']
        : [...rows[0], 'Easting_UTM', 'Northing_UTM'];

      setBatchCols(newCols);
      setBatchRows(out);
      setBatchStatus(`Successfully converted ${out.length} rows (${skipped} skipped).`);
    } catch (err: any) {
      setBatchStatus(`Error processing CSV: ${err.message}`);
    }
  };

  const handleDownloadBatch = () => {
    if (!batchCols || !batchRows) return;
    const txt = toCSVtext(batchCols, batchRows);
    downloadBlob(csvEnc(txt), 'batch_converted_coordinates.csv', 'text/csv;charset=utf-8');
  };

  // Bulk Paste / DMS
  const handleConvertPaste = () => {
    const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const pZNum = parseInt(pasteZone, 10) || 45;
    const pSouth = pasteZone.endsWith('S');

    const rows: (string | number)[][] = [];
    lines.forEach(line => {
      const parts = line.split(/[,\t]+/).map(p => p.trim());
      if (parts.length < 2) return;

      if (pasteDir === 'll2en') {
        const lon = parseDMSval(parts[0]);
        const lat = parseDMSval(parts[1]);
        if (!isNaN(lon) && !isNaN(lat)) {
          const u = lonLatToUtm(lon, lat, pZNum, pSouth);
          rows.push([lon.toFixed(8), lat.toFixed(8), u.E.toFixed(3), u.N.toFixed(3)]);
        }
      } else {
        const E = parseFloat(parts[0]);
        const N = parseFloat(parts[1]);
        if (!isNaN(E) && !isNaN(N)) {
          const ll = utmToLonLat(E, N, pZNum, pSouth);
          rows.push([ll.lon.toFixed(8), ll.lat.toFixed(8), toDMSstr(ll.lat, true), toDMSstr(ll.lon, false), E.toFixed(3), N.toFixed(3)]);
        }
      }
    });

    const cols = pasteDir === 'll2en'
      ? ['Longitude', 'Latitude', 'Easting_UTM', 'Northing_UTM']
      : ['Longitude', 'Latitude', 'Lat_DMS', 'Lon_DMS', 'Easting_UTM', 'Northing_UTM'];

    setPasteResults({ cols, rows });
  };

  // Helmert 2D Fit
  const handleFitHelmert = () => {
    try {
      const lines = ctrlText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const ctrl: ControlPointPair[] = [];
      lines.forEach(l => {
        const p = l.split(/[,\s\t]+/).map(parseFloat);
        if (p.length >= 4 && p.every(v => !isNaN(v))) {
          ctrl.push({ x: p[0], y: p[1], X: p[2], Y: p[3] });
        }
      });
      const res = helmertFit(ctrl);
      setHelmertModel(res);

      // Convert local points if present
      const localLines = localPtsText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const conv: any[] = [];
      localLines.forEach((l, idx) => {
        const parts = l.split(/[,\t]+/).map(p => p.trim());
        let name = `P${idx + 1}`, ex = 0, ny = 0;
        if (parts.length >= 3 && isNaN(parseFloat(parts[0]))) {
          name = parts[0]; ex = parseFloat(parts[1]); ny = parseFloat(parts[2]);
        } else {
          ex = parseFloat(parts[0]); ny = parseFloat(parts[1]);
        }
        if (!isNaN(ex) && !isNaN(ny)) {
          const u = helmertApply(res, ex, ny);
          const ll = utmToLonLat(u.X, u.Y, 45, false);
          conv.push({ name, localE: ex, localN: ny, utmE: u.X, utmN: u.Y, lon: ll.lon, lat: ll.lat });
        }
      });
      setHelmertConverted(conv);
    } catch (err: any) {
      alert(`Helmert fit error: ${err.message}`);
    }
  };

  // Indian Grid
  const handleIndianGrid = () => {
    const z = getIndianZone(indZoneEpsg);
    if (!z) return;
    const a = parseFloat(indValA);
    const b = parseFloat(indValB);
    if (isNaN(a) || isNaN(b)) return;

    if (indDir === 'l2g') {
      let lon = a, lat = b;
      if (indDatumMode === 'wgs') {
        const shifted = datumTransform(lat, lon, 0, ELLIPSOIDS.wgs84, ELLIPSOIDS.everest1975, DEFAULT_BURSA_WOLF_7);
        lon = shifted.lon;
        lat = shifted.lat;
      }
      const res = indianGridFwd(lon, lat, z);
      setIndResult({ E: res.E, N: res.N, zone: z.name, epsg: z.epsg });
    } else {
      const res = indianGridInv(a, b, z);
      let lon = res.lon, lat = res.lat;
      if (indDatumMode === 'wgs') {
        const shifted = datumTransform(lat, lon, 0, ELLIPSOIDS.everest1975, ELLIPSOIDS.wgs84, DEFAULT_BURSA_WOLF_7);
        lon = shifted.lon;
        lat = shifted.lat;
      }
      setIndResult({ lon, lat, zone: z.name, epsg: z.epsg });
    }
  };

  const zones: string[] = [];
  for (let z = 1; z <= 60; z++) zones.push(`${z}N`);
  for (let z = 1; z <= 60; z++) zones.push(`${z}S`);

  return (
    <div className="space-y-8">
      {/* 1. Single Point Converter */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium">Analytical Engine</p>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              Single Point Coordinate Transformation
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSwapXY}
              className="px-3.5 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 rounded-full flex items-center gap-1.5 transition-all"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[#c9a063]" /> Swap X/Y
            </button>
            <button
              onClick={handleAutoZone}
              className="px-3.5 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 rounded-full transition-all"
            >
              Auto Detect Zone
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 mb-1.5 block">
              Transformation Direction
            </label>
            <select
              value={direction}
              onChange={e => setDirection(e.target.value as any)}
              className="w-full py-2.5 px-3.5 rounded-xl border border-white/10 bg-[#141414] text-white text-xs sm:text-sm font-medium focus:outline-none focus:border-[#c9a063] transition-all"
            >
              <option value="u2w">UTM → WGS84 (Lon/Lat)</option>
              <option value="w2u">WGS84 (Lon/Lat) → UTM</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 mb-1.5 block">
              UTM Projection Zone
            </label>
            <select
              value={singleZone}
              onChange={e => setSingleZone(e.target.value)}
              className="w-full py-2.5 px-3.5 rounded-xl border border-white/10 bg-[#141414] text-white text-xs sm:text-sm font-mono focus:outline-none focus:border-[#c9a063] transition-all"
            >
              {zones.map(z => (
                <option key={z} value={z}>
                  Zone {z}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 mb-1.5 block">
              {direction === 'u2w' ? 'Easting (m)' : 'Longitude (deg)'}
            </label>
            <input
              type="text"
              value={valA}
              onChange={e => setValA(e.target.value)}
              className="w-full py-2.5 px-3.5 rounded-xl border border-white/10 bg-[#141414] text-white text-xs sm:text-sm font-mono focus:outline-none focus:border-[#c9a063] transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 mb-1.5 block">
              {direction === 'u2w' ? 'Northing (m)' : 'Latitude (deg)'}
            </label>
            <input
              type="text"
              value={valB}
              onChange={e => setValB(e.target.value)}
              className="w-full py-2.5 px-3.5 rounded-xl border border-white/10 bg-[#141414] text-white text-xs sm:text-sm font-mono focus:outline-none focus:border-[#c9a063] transition-all"
            />
          </div>
        </div>

        {/* Live Result Display */}
        {singleResult && (
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#c9a063]">
                Transformed Coordinate Matrix
              </span>
              <button
                onClick={() => handleCopy(
                  direction === 'u2w' ? `${singleResult.lon}, ${singleResult.lat}` : `${singleResult.E}, ${singleResult.N}`,
                  'main'
                )}
                className="flex items-center gap-1.5 text-xs font-serif italic text-[#c9a063] hover:text-[#e0ba7e] transition-colors"
              >
                {copied === 'main' ? <Check className="w-3.5 h-3.5 text-[#c9a063]" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === 'main' ? 'Copied' : 'Copy Values'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 font-mono text-sm">
              <div className="bg-[#141414] p-4 rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase tracking-wider font-sans mb-1">Primary Coordinates</span>
                <span className="font-bold text-white text-sm">
                  {direction === 'u2w' ? `Lon: ${singleResult.lon}, Lat: ${singleResult.lat}` : `E: ${singleResult.E}m, N: ${singleResult.N}m`}
                </span>
              </div>
              <div className="bg-[#141414] p-4 rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase tracking-wider font-sans mb-1">Degrees Minutes Seconds</span>
                <span className="font-bold text-[#d4d4d4] text-sm">{singleResult.dms}</span>
              </div>
              <div className="bg-[#141414] p-4 rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase tracking-wider font-sans mb-1">Military Grid (MGRS)</span>
                <span className="font-bold text-[#c9a063] text-sm">{singleResult.mgrs}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Batch CSV Converter */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6 shadow-xl">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium">Batch Operations</p>
          <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
            Batch Coordinate Transformation (CSV)
          </h3>
          <p className="text-xs text-white/40 mt-1 font-light">
            Upload any delimiter-separated file containing <code className="font-mono text-white/70">Longitude, Latitude</code> or <code className="font-mono text-white/70">Easting, Northing</code> to batch reproject.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={batchDir}
            onChange={e => setBatchDir(e.target.value as any)}
            className="py-2.5 px-4 rounded-xl border border-white/10 bg-[#141414] text-white text-xs sm:text-sm font-medium focus:outline-none focus:border-[#c9a063]"
          >
            <option value="u2w">UTM → WGS84</option>
            <option value="w2u">WGS84 → UTM</option>
          </select>

          <select
            value={batchZone}
            onChange={e => setBatchZone(e.target.value)}
            className="py-2.5 px-4 rounded-xl border border-white/10 bg-[#141414] text-white text-xs sm:text-sm font-mono focus:outline-none focus:border-[#c9a063]"
          >
            {zones.map(z => (
              <option key={z} value={z}>
                Zone {z}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-full text-xs font-semibold uppercase tracking-wider cursor-pointer transition-all shadow-sm">
            <Upload className="w-4 h-4 text-[#c9a063]" /> Upload CSV File
            <input type="file" accept=".csv" onChange={handleBatchFile} className="hidden" />
          </label>

          {batchRows && (
            <button
              onClick={handleDownloadBatch}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-[#c9a063]/10"
            >
              <Download className="w-4 h-4" /> Download Reprojected CSV ({batchRows.length} rows)
            </button>
          )}
        </div>

        {batchStatus && (
          <div className="p-4 rounded-xl bg-[#141414] border border-white/10 text-xs font-mono text-[#c9a063]">
            {batchStatus}
          </div>
        )}
      </div>

      {/* 3. Bulk Paste & DMS Convert */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6 shadow-xl">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium">Text Stream Ingestion</p>
          <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
            Bulk Clipboard & DMS Coordinate Parser
          </h3>
          <p className="text-xs text-white/40 mt-1 font-light">
            Paste multiline raw coordinates from field books, survey dockets, or GPS records.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={pasteDir}
            onChange={e => setPasteDir(e.target.value as any)}
            className="py-2.5 px-4 rounded-xl border border-white/10 bg-[#141414] text-white text-xs sm:text-sm font-medium focus:outline-none focus:border-[#c9a063]"
          >
            <option value="ll2en">Lon/Lat (or DMS) → UTM E/N</option>
            <option value="en2ll">UTM E/N → Lon/Lat</option>
          </select>

          <select
            value={pasteZone}
            onChange={e => setPasteZone(e.target.value)}
            className="py-2.5 px-4 rounded-xl border border-white/10 bg-[#141414] text-white text-xs sm:text-sm font-mono focus:outline-none focus:border-[#c9a063]"
          >
            {zones.map(z => (
              <option key={z} value={z}>
                Zone {z}
              </option>
            ))}
          </select>

          <button
            onClick={handleConvertPaste}
            className="px-6 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-[#c9a063]/10"
          >
            Parse & Convert Stream
          </button>
        </div>

        <textarea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          rows={4}
          className="w-full p-4 rounded-xl border border-white/10 bg-[#141414] font-mono text-xs text-white placeholder-white/20 focus:outline-none focus:border-[#c9a063] transition-all"
          placeholder="84.6147, 23.5487&#10;84°36'53&quot;E, 23°32'55&quot;N"
        />

        {pasteResults && (
          <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#141414] custom-scrollbar">
            <table className="w-full text-xs text-left">
              <thead className="bg-white/5 font-semibold sticky top-0 border-b border-white/10">
                <tr>
                  {pasteResults.cols.map(c => (
                    <th key={c} className="p-3 text-[10px] uppercase tracking-wider text-white/50 font-mono">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-white/80">
                {pasteResults.rows.map((r, rIdx) => (
                  <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                    {r.map((v, cIdx) => (
                      <td key={cIdx} className="p-3">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Indian Grid LCC (Kalianpur 1975/1962/1937) */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6 shadow-xl">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium">Geodetic Projections</p>
          <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
            Indian Grid (Everest / Kalianpur LCC 1SP)
          </h3>
          <p className="text-xs text-white/40 mt-1 font-light">
            Transform coordinates between Indian Grid Zones (Lambert Conformal Conic 1SP) and WGS84 for khasra and cadastral maps.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 mb-1.5 block">
              Indian Grid Zone
            </label>
            <select
              value={indZoneEpsg}
              onChange={e => setIndZoneEpsg(parseInt(e.target.value, 10))}
              className="w-full py-2.5 px-3.5 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-medium focus:outline-none focus:border-[#c9a063]"
            >
              {INDIAN_GRID_ZONES.map(z => (
                <option key={z.epsg} value={z.epsg}>
                  {z.name} (EPSG:{z.epsg})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 mb-1.5 block">
              Direction
            </label>
            <select
              value={indDir}
              onChange={e => setIndDir(e.target.value as any)}
              className="w-full py-2.5 px-3.5 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-medium focus:outline-none focus:border-[#c9a063]"
            >
              <option value="l2g">Lon/Lat → Indian Grid E/N</option>
              <option value="g2l">Indian Grid E/N → Lon/Lat</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 mb-1.5 block">
              {indDir === 'l2g' ? 'Longitude' : 'Easting (m)'}
            </label>
            <input
              type="text"
              value={indValA}
              onChange={e => setIndValA(e.target.value)}
              className="w-full py-2.5 px-3.5 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-mono focus:outline-none focus:border-[#c9a063]"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 mb-1.5 block">
              {indDir === 'l2g' ? 'Latitude' : 'Northing (m)'}
            </label>
            <input
              type="text"
              value={indValB}
              onChange={e => setIndValB(e.target.value)}
              className="w-full py-2.5 px-3.5 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-mono focus:outline-none focus:border-[#c9a063]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
          <button
            onClick={handleIndianGrid}
            className="px-6 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-[#c9a063]/10"
          >
            Compute Indian Grid Projection
          </button>

          {indResult && (
            <div className="text-xs font-mono font-bold text-[#c9a063] bg-[#c9a063]/10 px-4 py-2 rounded-xl border border-[#c9a063]/30">
              {indResult.E != null
                ? `E: ${indResult.E.toFixed(2)} m, N: ${indResult.N.toFixed(2)} m`
                : `Lon: ${indResult.lon.toFixed(8)}°, Lat: ${indResult.lat.toFixed(8)}°`}
            </div>
          )}
        </div>
      </div>

      {/* 5. 2D Helmert Local-to-UTM Fitter */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6 shadow-xl">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-1 font-medium">Similarity Transformation</p>
          <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
            2D Helmert Local Grid → UTM Least-Squares Control Fit
          </h3>
          <p className="text-xs text-white/40 mt-1 font-light">
            Reconcile an assumed mine plant grid with real UTM world coordinates via 4-parameter Helmert similarity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 mb-1.5 block">
              Control Points (<code className="font-mono text-white/70">local_E, local_N, utm_E, utm_N</code>)
            </label>
            <textarea
              value={ctrlText}
              onChange={e => setCtrlText(e.target.value)}
              rows={3}
              className="w-full p-3 rounded-xl border border-white/10 bg-[#141414] font-mono text-xs text-white focus:outline-none focus:border-[#c9a063]"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 mb-1.5 block">
              Local Points to Convert (<code className="font-mono text-white/70">Name, local_E, local_N</code>)
            </label>
            <textarea
              value={localPtsText}
              onChange={e => setLocalPtsText(e.target.value)}
              rows={3}
              className="w-full p-3 rounded-xl border border-white/10 bg-[#141414] font-mono text-xs text-white focus:outline-none focus:border-[#c9a063]"
            />
          </div>
        </div>

        <button
          onClick={handleFitHelmert}
          className="px-6 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-[#c9a063]/10"
        >
          Fit Control & Transform Local Grid
        </button>

        {helmertModel && (
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs font-mono text-white/90 space-y-1.5">
            <p className="font-bold text-[#c9a063]">
              Helmert Fit: Scale: {helmertModel.scale.toFixed(8)}, Rotation: {helmertModel.rotDeg.toFixed(4)}°, Shift: ({helmertModel.tx.toFixed(2)}m, {helmertModel.ty.toFixed(2)}m)
            </p>
            <p className="text-white/60">RMS Residual: ±{helmertModel.rms.toFixed(3)} m (Max: {helmertModel.maxRes.toFixed(3)} m)</p>
          </div>
        )}
      </div>
    </div>
  );
};
