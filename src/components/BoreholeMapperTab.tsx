import React, { useState, useMemo } from 'react';
import {
  MapPin,
  Upload,
  Download,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Sliders,
  CheckCircle2,
  Table,
  FolderArchive,
  Plus,
  Trash2,
  Check,
  Search,
  Eye,
  Settings,
  Flame,
  FileCode,
  ShieldCheck
} from 'lucide-react';
import { parseCSV, stripBOM, toCSVtext, csvEnc, kmlBuild, dxfBuild, buildExcelZip } from '../lib/formats';
import { downloadBlob, makeZip } from '../lib/zip';
import { BoreRow, GeoFeature, MineProfile, BoreholeHole } from '../types';
import { BORE_PRESETS, boreClassifyInterval, boreSummary, boreCardHTML, boreOpSym } from '../lib/mineProfiles';
import { lonLatToUtm, utmToLonLat } from '../lib/geodesy';
import { VectorRadarMap } from './VectorRadarMap';

interface BoreholeMapperTabProps {
  workingZone: string;
}

export const BoreholeMapperTab: React.FC<BoreholeMapperTabProps> = ({ workingZone }) => {
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('bauxite');
  const [activeProfile, setActiveProfile] = useState<MineProfile>(BORE_PRESETS.bauxite);

  // Raw Borehole Rows State
  const [boreRows, setBoreRows] = useState<BoreRow[]>([
    { bh: 'BH-01', lon: 84.6012, lat: 23.5410, from: 0.0, to: 1.5, lith: 'Laterite Soil', g1: 18.2, g2: 42.1 },
    { bh: 'BH-01', lon: 84.6012, lat: 23.5410, from: 1.5, to: 5.2, lith: 'Bauxite Ore', g1: 46.5, g2: 3.8 },
    { bh: 'BH-01', lon: 84.6012, lat: 23.5410, from: 5.2, to: 6.0, lith: 'Clay Parting', g1: 22.0, g2: 38.0 },
    { bh: 'BH-01', lon: 84.6012, lat: 23.5410, from: 6.0, to: 9.5, lith: 'High Grade Bauxite', g1: 49.2, g2: 2.9 },
    { bh: 'BH-01', lon: 84.6012, lat: 23.5410, from: 9.5, to: 12.0, lith: 'Lithomarge Clay', g1: 20.1, g2: 48.2 },

    { bh: 'BH-02', lon: 84.6035, lat: 23.5425, from: 0.0, to: 2.0, lith: 'Top Soil', g1: 15.0, g2: 50.0 },
    { bh: 'BH-02', lon: 84.6035, lat: 23.5425, from: 2.0, to: 7.8, lith: 'Aluminous Laterite', g1: 44.1, g2: 4.5 },
    { bh: 'BH-02', lon: 84.6035, lat: 23.5425, from: 7.8, to: 10.0, lith: 'Basalt Bedrock', g1: 12.0, g2: 52.0 },

    { bh: 'BH-03', lon: 84.6050, lat: 23.5390, from: 0.0, to: 1.2, lith: 'Soil Cover', g1: 12.5, g2: 48.0 },
    { bh: 'BH-03', lon: 84.6050, lat: 23.5390, from: 1.2, to: 4.8, lith: 'Ferruginous Laterite', g1: 32.0, g2: 12.0 },
    { bh: 'BH-03', lon: 84.6050, lat: 23.5390, from: 4.8, to: 8.5, lith: 'Hard Bauxite Lense', g1: 48.7, g2: 3.2 },
    { bh: 'BH-03', lon: 84.6050, lat: 23.5390, from: 8.5, to: 11.0, lith: 'Clay Substratum', g1: 19.5, g2: 44.0 }
  ]);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [searchHole, setSearchHole] = useState('');
  const [selectedHoleId, setSelectedHoleId] = useState<string>('BH-01');
  const [showRuleModal, setShowRuleModal] = useState(false);

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  // Switch preset
  const handlePresetSelect = (k: string) => {
    setSelectedPresetKey(k);
    if (BORE_PRESETS[k]) {
      setActiveProfile(JSON.parse(JSON.stringify(BORE_PRESETS[k])));
    }
  };

  // Group into Hole structures
  const holes = useMemo<BoreholeHole[]>(() => {
    const grouped: Record<string, BoreRow[]> = {};
    boreRows.forEach(r => {
      if (!grouped[r.bh]) grouped[r.bh] = [];
      grouped[r.bh].push(r);
    });

    return Object.keys(grouped).map(id => {
      const rows = grouped[id].sort((a, b) => a.from - b.from);
      const first = rows[0];
      const maxTo = Math.max(...rows.map(r => r.to));
      const pKey1 = activeProfile.params[0]?.key || 'g1';
      const pKey2 = activeProfile.params[1]?.key || 'g2';

      const intervals = rows.map(r => {
        const vals: Record<string, number | null> = {};
        vals[pKey1] = r.g1 ?? null;
        if (pKey2) vals[pKey2] = r.g2 ?? null;

        const { isOre, text } = boreClassifyInterval(vals, activeProfile.rule);
        return {
          from: r.from,
          to: r.to,
          lith: r.lith,
          vals,
          isOre,
          logic: text
        };
      });

      return {
        id,
        project: 'Exploration Lease Block',
        lon: first.lon,
        lat: first.lat,
        rl: 520.0,
        eoh: maxTo,
        zone: zNum,
        south: isSouth,
        intervals
      };
    });
  }, [boreRows, activeProfile, zNum, isSouth]);

  // Overall mining evaluation stats
  const stats = useMemo(() => {
    let totalOre = 0;
    let totalOb = 0;
    let totalIb = 0;
    let positiveHoles = 0;

    holes.forEach(h => {
      const s = boreSummary(h, activeProfile);
      totalOre += s.oreThk;
      totalOb += s.ob;
      totalIb += s.ib;
      if (s.positive) positiveHoles++;
    });

    const avgStrip = totalOre > 0 ? (totalOb + totalIb) / totalOre : 0;

    return {
      totalHoles: holes.length,
      positiveHoles,
      totalOre,
      totalOb,
      totalIb,
      avgStrip
    };
  }, [holes, activeProfile]);

  // Handle CSV Upload
  const handleUploadCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = stripBOM(await file.text());
      const rows = parseCSV(text);
      if (rows.length < 2) return;

      const hdr = rows[0].map(h => h.trim().toLowerCase());
      const bhIdx = hdr.findIndex(h => h.includes('hole') || h.includes('bh') || h.includes('id'));
      const lonIdx = hdr.findIndex(h => h.includes('lon') || h.includes('x') || h.includes('east'));
      const latIdx = hdr.findIndex(h => h.includes('lat') || h.includes('y') || h.includes('north'));
      const fromIdx = hdr.findIndex(h => h === 'from' || h.includes('start') || h.includes('depth_from'));
      const toIdx = hdr.findIndex(h => h === 'to' || h.includes('end') || h.includes('depth_to'));
      const lithIdx = hdr.findIndex(h => h.includes('lith') || h.includes('rock') || h.includes('formation'));
      const g1Idx = hdr.findIndex(h => h.includes('g1') || h.includes('al2o3') || h.includes('fe') || h.includes('gcv') || h.includes('cao') || h.includes('grade'));
      const g2Idx = hdr.findIndex(h => h.includes('g2') || h.includes('sio2') || h.includes('ash') || h.includes('mgo'));

      const parsed: BoreRow[] = [];
      rows.slice(1).forEach((r, idx) => {
        const bh = bhIdx >= 0 ? r[bhIdx] : `BH-${Math.floor(idx / 4) + 1}`;
        let lon = parseFloat(r[lonIdx >= 0 ? lonIdx : 1]);
        let lat = parseFloat(r[latIdx >= 0 ? latIdx : 2]);

        // If coordinates are large UTM Easting/Northing, convert to Lon/Lat
        if (lon > 1000 && lat > 1000) {
          const ll = utmToLonLat(lon, lat, zNum, isSouth);
          lon = ll.lon;
          lat = ll.lat;
        }

        const from = parseFloat(r[fromIdx >= 0 ? fromIdx : 3]);
        const to = parseFloat(r[toIdx >= 0 ? toIdx : 4]);
        const lith = lithIdx >= 0 ? r[lithIdx] : 'Ore Horizon';
        const g1 = g1Idx >= 0 ? parseFloat(r[g1Idx]) : undefined;
        const g2 = g2Idx >= 0 ? parseFloat(r[g2Idx]) : undefined;

        if (!isNaN(lon) && !isNaN(lat) && !isNaN(from) && !isNaN(to)) {
          parsed.push({
            bh,
            lon,
            lat,
            from,
            to,
            lith,
            g1: isNaN(g1 as number) ? undefined : g1,
            g2: isNaN(g2 as number) ? undefined : g2
          });
        }
      });

      if (parsed.length > 0) {
        setBoreRows(parsed);
        setSelectedHoleId(parsed[0].bh);
        setStatusMsg(`Successfully loaded ${parsed.length} assay intervals across ${new Set(parsed.map(p => p.bh)).size} boreholes from ${file.name}`);
      }
    } catch (err: any) {
      setStatusMsg(`Error reading CSV: ${err.message}`);
    }
  };

  // Download Sample Template
  const handleDownloadTemplate = () => {
    const cols = ['Hole_ID', 'Longitude', 'Latitude', 'From_m', 'To_m', 'Lithology', activeProfile.params[0]?.label || 'G1', activeProfile.params[1]?.label || 'G2'];
    const sampleRows = [
      ['BH-01', '84.6012', '23.5410', '0.0', '1.5', 'Laterite Soil', '18.2', '42.1'],
      ['BH-01', '84.6012', '23.5410', '1.5', '5.2', 'Bauxite Ore', '46.5', '3.8'],
      ['BH-01', '84.6012', '23.5410', '5.2', '6.0', 'Clay Parting', '22.0', '38.0'],
      ['BH-01', '84.6012', '23.5410', '6.0', '9.5', 'High Grade Bauxite', '49.2', '2.9'],
      ['BH-02', '84.6035', '23.5425', '0.0', '2.0', 'Top Soil', '15.0', '50.0'],
      ['BH-02', '84.6035', '23.5425', '2.0', '7.8', 'Aluminous Laterite', '44.1', '4.5']
    ];
    const csv = toCSVtext(cols, sampleRows);
    downloadBlob(csvEnc(csv), `borehole_template_${activeProfile.name.toLowerCase().replace(/\s+/g, '_')}.csv`, 'text/csv');
  };

  // Export Surpac ZIP
  const handleExportSurpac = async () => {
    const collarCols = ['Hole_ID', 'Y_Northing', 'X_Easting', 'Z_Collar_RL', 'Max_Depth'];
    const lithCols = ['Hole_ID', 'Depth_From', 'Depth_To', 'Lithology'];
    const assayCols = ['Hole_ID', 'Depth_From', 'Depth_To', 'Sample_ID', activeProfile.params[0]?.key || 'G1', activeProfile.params[1]?.key || 'G2'];

    const collarRows = holes.map(h => {
      const u = lonLatToUtm(h.lon, h.lat, zNum, isSouth);
      return [h.id, u.N.toFixed(3), u.E.toFixed(3), (h.rl || 500).toFixed(2), h.eoh.toFixed(2)];
    });

    const lithRows: string[][] = [];
    const assayRows: string[][] = [];

    holes.forEach(h => {
      h.intervals.forEach((iv, i) => {
        lithRows.push([h.id, iv.from.toFixed(2), iv.to.toFixed(2), iv.lith]);
        const g1 = iv.vals[activeProfile.params[0]?.key] != null ? String(iv.vals[activeProfile.params[0]?.key]) : '';
        const g2 = iv.vals[activeProfile.params[1]?.key] != null ? String(iv.vals[activeProfile.params[1]?.key]) : '';
        assayRows.push([h.id, iv.from.toFixed(2), iv.to.toFixed(2), `${h.id}_S${i + 1}`, g1, g2]);
      });
    });

    const collarCsv = toCSVtext(collarCols, collarRows);
    const lithCsv = toCSVtext(lithCols, lithRows);
    const assayCsv = toCSVtext(assayCols, assayRows);

    const zipData = makeZip([
      { name: 'surpac_collar.csv', data: csvEnc(collarCsv) },
      { name: 'surpac_lithology.csv', data: csvEnc(lithCsv) },
      { name: 'surpac_assay.csv', data: csvEnc(assayCsv) }
    ]);

    downloadBlob(zipData, `${activeProfile.name}_Surpac_Database.zip`, 'application/zip');
  };

  // Export Ore QA Compliance Report CSV
  const handleExportOreQA = () => {
    const cols = ['Hole_ID', 'Easting', 'Northing', 'Collar_RL', 'Total_Depth', 'Overburden_m', 'Ore_Thickness_m', 'Interburden_m', 'Strip_Ratio', 'Status', activeProfile.params[0]?.key || 'G1_Avg'];
    const rows = holes.map(h => {
      const u = lonLatToUtm(h.lon, h.lat, zNum, isSouth);
      const s = boreSummary(h, activeProfile);
      const g1Mean = s.wmeans[activeProfile.params[0]?.key];
      return [
        h.id,
        u.E.toFixed(2),
        u.N.toFixed(2),
        (h.rl || 500).toFixed(2),
        h.eoh.toFixed(2),
        s.ob.toFixed(2),
        s.oreThk.toFixed(2),
        s.ib.toFixed(2),
        s.strip != null ? s.strip.toFixed(2) : 'N/A',
        s.positive ? 'POSITIVE_ORE' : 'NEGATIVE',
        g1Mean != null ? g1Mean.toFixed(2) : '-'
      ];
    });

    const csv = toCSVtext(cols, rows);
    downloadBlob(csvEnc(csv), `Ore_QA_Compliance_Report_${activeProfile.name}.csv`, 'text/csv');
  };

  // Export Full KMZ / KML
  const handleExportKML = () => {
    const feats: GeoFeature[] = holes.map(h => {
      const u = lonLatToUtm(h.lon, h.lat, zNum, isSouth);
      const s = boreSummary(h, activeProfile);
      return {
        name: `Borehole ${h.id} (${s.positive ? 'ORE' : 'WASTE'})`,
        geom: 'point',
        kind: 'en',
        pts: [{ a: u.E, b: u.N }],
        props: {
          Hole_ID: h.id,
          Status: s.positive ? 'Positive Ore' : 'Barren / Waste',
          Ore_Thickness: `${s.oreThk.toFixed(2)} m`,
          Overburden: `${s.ob.toFixed(2)} m`,
          Strip_Ratio: s.strip != null ? `${s.strip.toFixed(2)} : 1` : '-',
          EOH_Depth: `${h.eoh.toFixed(2)} m`
        }
      };
    });

    const kml = kmlBuild(feats, `${activeProfile.name}_Borehole_Map`, true, zNum, isSouth);
    downloadBlob(new TextEncoder().encode(kml), `${activeProfile.name}_Boreholes.kml`, 'application/vnd.google-earth.kml+xml');
  };

  // Export DXF
  const handleExportDXF = () => {
    const feats: GeoFeature[] = holes.map(h => {
      const u = lonLatToUtm(h.lon, h.lat, zNum, isSouth);
      const s = boreSummary(h, activeProfile);
      return {
        name: h.id,
        geom: 'point',
        kind: 'en',
        pts: [{ a: u.E, b: u.N }],
        props: { layer: s.positive ? 'BH_ORE' : 'BH_WASTE' }
      };
    });

    const res = dxfBuild(feats, 'utm', zNum, isSouth, true);
    downloadBlob(new TextEncoder().encode(res.dxf), `${activeProfile.name}_Borehole_Collars.dxf`, 'application/dxf');
  };

  // Map Features
  const mapFeatures: GeoFeature[] = useMemo(() => {
    return holes.map(h => {
      const u = lonLatToUtm(h.lon, h.lat, zNum, isSouth);
      const s = boreSummary(h, activeProfile);
      return {
        name: h.id,
        geom: 'point',
        kind: 'en',
        pts: [{ a: u.E, b: u.N }],
        props: {
          positive: s.positive ? 'ORE' : 'WASTE',
          oreThk: `${s.oreThk.toFixed(2)}m`,
          ob: `${s.ob.toFixed(2)}m`
        }
      };
    });
  }, [holes, activeProfile, zNum, isSouth]);

  const activeHole = holes.find(h => h.id === selectedHoleId) || holes[0];
  const activeSummary = activeHole ? boreSummary(activeHole, activeProfile) : null;

  return (
    <div className="space-y-6">
      {/* 1. Mining Exploration Cockpit */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 border border-white/5 shadow-sm space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] font-medium">Borehole & Exploration Suite</span>
              <span className="text-[10px] bg-[#c9a063]/20 text-[#c9a063] px-2 py-0.5 rounded border border-[#c9a063]/30 font-mono">
                14 Commodity Cutoffs &bull; GEOVIA Surpac
              </span>
            </div>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#c9a063]" />
              Borehole Exploration, Cutoff & Core-Log Engine
            </h3>
            <p className="text-xs text-white/40 mt-1 max-w-2xl">
              Evaluate multi-condition cutoffs, calculate strip ratios, export GEOVIA Surpac collar/lith/assay databases, and generate core logs.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold border border-white/10"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#c9a063]" /> Template (.csv)
            </button>
            <button
              onClick={() => setShowRuleModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold border border-white/10"
            >
              <Sliders className="w-3.5 h-3.5 text-[#c9a063]" /> Edit Cutoff Rules
            </button>
            <button
              onClick={handleExportSurpac}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs rounded-xl uppercase tracking-wider"
            >
              <FolderArchive className="w-3.5 h-3.5" /> Export Surpac DB (.zip)
            </button>
          </div>
        </div>

        {/* Commodity Preset Selector & CSV Upload Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/5">
          <div>
            <label className="text-[10px] text-white/50 block mb-1 uppercase font-mono">Commodity Profile Preset</label>
            <select
              value={selectedPresetKey}
              onChange={e => handlePresetSelect(e.target.value)}
              className="w-full px-3 py-2 bg-[#141414] border border-white/10 rounded-xl text-xs text-white"
            >
              {Object.keys(BORE_PRESETS).map(k => (
                <option key={k} value={k}>
                  {BORE_PRESETS[k].name} ({BORE_PRESETS[k].params.map(p => p.key).join(', ')})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-white/50 block mb-1 uppercase font-mono">Active Cutoff Rule Summary</label>
            <div className="px-3 py-2 bg-[#141414] border border-white/10 rounded-xl text-xs text-white/70 truncate flex items-center justify-between">
              <span className="truncate">
                {activeProfile.rule.conds.map(c => `${c.param} ${boreOpSym(c.op)} ${c.v || ''}`).join(` ${activeProfile.rule.logic} `)}
                {activeProfile.rule.minThick > 0 ? ` (Min ${activeProfile.rule.minThick}m)` : ''}
              </span>
              <button onClick={() => setShowRuleModal(true)} className="text-[#c9a063] hover:underline text-[11px] font-bold ml-2">
                Configure
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-white/50 block mb-1 uppercase font-mono">Import Borehole Assay CSV</label>
            <label className="flex items-center justify-center gap-2 px-3 py-2 bg-[#141414] hover:bg-[#1a1a1a] border border-white/10 rounded-xl text-xs text-white cursor-pointer truncate">
              <Upload className="w-3.5 h-3.5 text-[#c9a063]" />
              <span className="truncate">Upload Drillhole / Assay CSV</span>
              <input type="file" accept=".csv" onChange={handleUploadCSV} className="hidden" />
            </label>
          </div>
        </div>

        {statusMsg && (
          <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs text-[#c9a063] font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Global Evaluation Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
            <span className="text-[10px] text-white/40 block uppercase font-mono">Total Collars</span>
            <span className="text-base font-mono font-bold text-white">{stats.totalHoles}</span>
          </div>
          <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
            <span className="text-[10px] text-white/40 block uppercase font-mono">Positive Ore Collars</span>
            <span className="text-base font-mono font-bold text-emerald-400">
              {stats.positiveHoles} / {stats.totalHoles}
            </span>
          </div>
          <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
            <span className="text-[10px] text-white/40 block uppercase font-mono">Total Ore Intercept</span>
            <span className="text-base font-mono font-bold text-[#c9a063]">{stats.totalOre.toFixed(2)} m</span>
          </div>
          <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
            <span className="text-[10px] text-white/40 block uppercase font-mono">Total Waste / OB</span>
            <span className="text-base font-mono font-bold text-white">{(stats.totalOb + stats.totalIb).toFixed(2)} m</span>
          </div>
          <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
            <span className="text-[10px] text-white/40 block uppercase font-mono">Average Strip Ratio</span>
            <span className="text-base font-mono font-bold text-sky-400">{stats.avgStrip.toFixed(2)} : 1</span>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/50">Drillhole Inspector:</span>
            <select
              value={selectedHoleId}
              onChange={e => setSelectedHoleId(e.target.value)}
              className="px-3 py-1.5 bg-[#141414] border border-white/10 rounded-xl text-xs text-white font-mono"
            >
              {holes.map(h => (
                <option key={h.id} value={h.id}>
                  {h.id} ({h.intervals.length} intervals &bull; {boreSummary(h, activeProfile).positive ? 'Positive' : 'Negative'})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleExportKML}
              className="px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold border border-white/10"
            >
              KML
            </button>
            <button
              onClick={handleExportDXF}
              className="px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white rounded-xl text-xs font-semibold border border-white/10"
            >
              DXF
            </button>
            <button
              onClick={handleExportOreQA}
              className="px-3.5 py-1.5 bg-[#c9a063] hover:bg-[#d6b074] text-black rounded-xl text-xs font-bold"
            >
              Ore QA Report (.csv)
            </button>
          </div>
        </div>

        {/* Visual Core Log & Stratigraphy Card for selected Hole */}
        {activeHole && activeSummary && (
          <div className="p-4 rounded-xl border border-white/10 bg-[#141414] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <span className="text-lg font-serif font-bold text-white">{activeHole.id}</span>
                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono ${
                    activeSummary.positive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {activeSummary.positive ? 'ORE QUALIFIED' : 'BARREN / WASTE'}
                </span>
                <span className="text-xs text-white/40 font-mono">EOH: {activeHole.eoh.toFixed(2)}m</span>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-amber-400">Overburden: {activeSummary.ob.toFixed(2)}m</span>
                <span className="text-emerald-400">Ore Thk: {activeSummary.oreThk.toFixed(2)}m</span>
                <span className="text-sky-400">Strip: {activeSummary.strip != null ? `${activeSummary.strip.toFixed(2)}:1` : 'N/A'}</span>
              </div>
            </div>

            {/* Interval Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#1c1c1c] text-white/70 font-semibold border-b border-white/10 font-mono">
                  <tr>
                    <th className="p-2">From - To (m)</th>
                    <th className="p-2">Lithology</th>
                    <th className="p-2">Thickness (m)</th>
                    {activeProfile.params.map(p => (
                      <th key={p.key} className="p-2">
                        {p.label} ({p.unit || '%'})
                      </th>
                    ))}
                    <th className="p-2">Classification Logic</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-white/80">
                  {activeHole.intervals.map((iv, i) => (
                    <tr key={i} className={iv.isOre ? 'bg-emerald-950/20' : ''}>
                      <td className="p-2 font-bold text-white">
                        {iv.from.toFixed(2)} - {iv.to.toFixed(2)}
                      </td>
                      <td className="p-2 font-sans font-medium text-white/90">{iv.lith}</td>
                      <td className="p-2">{(iv.to - iv.from).toFixed(2)}</td>
                      {activeProfile.params.map(p => (
                        <td key={p.key} className="p-2 font-bold text-amber-400">
                          {iv.vals[p.key] != null ? (iv.vals[p.key] as number).toFixed(2) : '-'}
                        </td>
                      ))}
                      <td className="p-2">
                        <span className={`text-[11px] ${iv.isOre ? 'text-emerald-400 font-bold' : 'text-white/40'}`}>
                          {iv.logic}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 2. Interactive Map of Collars */}
      <div className="bg-[#0f0f0f] rounded-2xl p-6 border border-white/5 shadow-sm">
        <VectorRadarMap
          features={mapFeatures}
          zone={zNum}
          south={isSouth}
          title="Borehole Collar Locations & Ore Classification Map"
        />
      </div>

      {/* 3. Cutoff Rules Modal */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#141414] border border-white/10 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-serif italic text-white text-base flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#c9a063]" /> Configure Cutoff Rule: {activeProfile.name}
              </h3>
              <button onClick={() => setShowRuleModal(false)} className="text-white/40 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Boolean Logic</label>
                  <select
                    value={activeProfile.rule.logic}
                    onChange={e =>
                      setActiveProfile({
                        ...activeProfile,
                        rule: { ...activeProfile.rule, logic: e.target.value as 'AND' | 'OR' }
                      })
                    }
                    className="px-3 py-1.5 bg-[#181818] border border-white/10 rounded-xl text-xs text-white"
                  >
                    <option value="AND">ALL conditions must match (AND)</option>
                    <option value="OR">ANY condition may match (OR)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Min Ore Thickness (m)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={activeProfile.rule.minThick}
                    onChange={e =>
                      setActiveProfile({
                        ...activeProfile,
                        rule: { ...activeProfile.rule, minThick: parseFloat(e.target.value) || 0 }
                      })
                    }
                    className="w-28 px-3 py-1.5 bg-[#181818] border border-white/10 rounded-xl text-xs text-white"
                  />
                </div>
              </div>

              {/* Conditions List */}
              <div className="space-y-2 pt-2">
                <label className="text-[10px] text-white/50 block uppercase font-mono">Threshold Conditions</label>
                {activeProfile.rule.conds.map((cond, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-[#181818] rounded-xl border border-white/5">
                    <select
                      value={cond.param}
                      onChange={e => {
                        const next = [...activeProfile.rule.conds];
                        next[idx].param = e.target.value;
                        setActiveProfile({ ...activeProfile, rule: { ...activeProfile.rule, conds: next } });
                      }}
                      className="px-2 py-1 bg-[#222] border border-white/10 rounded-lg text-xs text-white"
                    >
                      {activeProfile.params.map(p => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={cond.op}
                      onChange={e => {
                        const next = [...activeProfile.rule.conds];
                        next[idx].op = e.target.value as any;
                        setActiveProfile({ ...activeProfile, rule: { ...activeProfile.rule, conds: next } });
                      }}
                      className="px-2 py-1 bg-[#222] border border-white/10 rounded-lg text-xs text-white"
                    >
                      <option value="ge">≥ (greater or equal)</option>
                      <option value="le">≤ (less or equal)</option>
                      <option value="gt">&gt; (greater than)</option>
                      <option value="lt">&lt; (less than)</option>
                      <option value="eq">= (equal)</option>
                      <option value="ne">≠ (not equal)</option>
                      <option value="between">between</option>
                      <option value="nz">not blank / zero</option>
                    </select>

                    {cond.op !== 'nz' && cond.op !== 'blank' && (
                      <input
                        type="number"
                        step="any"
                        value={cond.v ?? ''}
                        onChange={e => {
                          const next = [...activeProfile.rule.conds];
                          next[idx].v = parseFloat(e.target.value) || 0;
                          setActiveProfile({ ...activeProfile, rule: { ...activeProfile.rule, conds: next } });
                        }}
                        placeholder="Value"
                        className="w-20 px-2 py-1 bg-[#222] border border-white/10 rounded-lg text-xs text-white"
                      />
                    )}

                    {cond.op === 'between' && (
                      <input
                        type="number"
                        step="any"
                        value={cond.v2 ?? ''}
                        onChange={e => {
                          const next = [...activeProfile.rule.conds];
                          next[idx].v2 = parseFloat(e.target.value) || 0;
                          setActiveProfile({ ...activeProfile, rule: { ...activeProfile.rule, conds: next } });
                        }}
                        placeholder="Upper"
                        className="w-20 px-2 py-1 bg-[#222] border border-white/10 rounded-lg text-xs text-white"
                      />
                    )}

                    <button
                      onClick={() => {
                        const next = activeProfile.rule.conds.filter((_, i) => i !== idx);
                        setActiveProfile({ ...activeProfile, rule: { ...activeProfile.rule, conds: next } });
                      }}
                      className="text-rose-400 hover:text-rose-300 ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => {
                    const firstParam = activeProfile.params[0]?.key || 'Grade';
                    const next = [...activeProfile.rule.conds, { param: firstParam, op: 'ge' as const, v: 40 }];
                    setActiveProfile({ ...activeProfile, rule: { ...activeProfile.rule, conds: next } });
                  }}
                  className="flex items-center gap-1 text-xs text-[#c9a063] hover:underline font-bold mt-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Condition
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowRuleModal(false)}
                className="px-4 py-2 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs rounded-xl"
              >
                Apply Cutoff Rules
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
