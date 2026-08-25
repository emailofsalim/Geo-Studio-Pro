import React, { useState } from 'react';
import {
  Calculator,
  RotateCw,
  Download,
  Copy,
  Check,
  Layers,
  Compass,
  ArrowRight,
  TrendingUp,
  FileSpreadsheet,
  Mountain,
  Box,
  Crosshair,
  ListOrdered
} from 'lucide-react';
import {
  vincentyCore,
  polygonAreaPerimeter,
  bowditchBalance,
  circularCurve,
  bearingBearingIntersection,
  formatAreaAllUnits,
  computeDifferentialLeveling,
  solve3PointDipStrike,
  computeEndAreaVolume,
  solveTienstraResection,
  LevelingRow
} from '../lib/geodesy';
import { downloadBlob } from '../lib/zip';
import { toCSVtext, csvEnc } from '../lib/formats';

interface SurveyCalculatorTabProps {
  localLandUnitPreset: string;
  customBighaM2: number;
  customKathaPerBigha: number;
}

export const SurveyCalculatorTab: React.FC<SurveyCalculatorTabProps> = ({
  localLandUnitPreset,
  customBighaM2,
  customKathaPerBigha
}) => {
  const [activeSubTool, setActiveSubTool] = useState<
    'vincenty' | 'traverse' | 'area' | 'curve' | 'intersect' | 'leveling' | 'dipstrike' | 'volume' | 'resection' | 'calc'
  >('vincenty');

  // Vincenty State
  const [vLon1, setVLon1] = useState('84.601550');
  const [vLat1, setVLat1] = useState('23.541200');
  const [vLon2, setVLon2] = useState('84.624800');
  const [vLat2, setVLat2] = useState('23.562100');
  const [vResult, setVResult] = useState<any | null>(null);

  // Polygonal Traverse Balancing State
  const [travMethod, setTravMethod] = useState<'bowditch' | 'transit'>('bowditch');
  const [startE, setStartE] = useState('250000.000');
  const [startN, setStartN] = useState('2600000.000');
  const [travText, setTravText] = useState<string>(
    'STN_1, 45.0, 150.000\nSTN_2, 135.0, 200.000\nSTN_3, 225.0, 150.000\nSTN_4, 315.0, 200.000'
  );
  const [travResult, setTravResult] = useState<any | null>(null);

  // Area by Coordinates State
  const [areaPtsText, setAreaPtsText] = useState<string>(
    '254800.00, 2605200.00\n255120.00, 2605250.00\n255180.00, 2604980.00\n254820.00, 2604920.00'
  );
  const [areaResult, setAreaResult] = useState<any | null>(null);

  // Circular Curve State
  const [curveR, setCurveR] = useState('350');
  const [curveDelta, setCurveDelta] = useState('42.5');
  const [curveStartStation, setCurveStartStation] = useState('1000');
  const [curveResult, setCurveResult] = useState<any | null>(null);

  // Intersection State
  const [intE1, setIntE1] = useState('250000');
  const [intN1, setIntN1] = useState('2600000');
  const [intBrg1, setIntBrg1] = useState('45.0');
  const [intE2, setIntE2] = useState('250500');
  const [intN2, setIntN2] = useState('2600000');
  const [intBrg2, setIntBrg2] = useState('315.0');
  const [intResult, setIntResult] = useState<any | null>(null);

  // Leveling State
  const [levelingBmRL, setLevelingBmRL] = useState('100.000');
  const [levelingText, setLevelingText] = useState<string>(
    'BM-1, 1.450, , , Initial Bench Mark\nSTN-1, , 1.820, , Intermediate\nSTN-2, , 2.110, , Intermediate\nCP-1, 0.980, , 2.650, Change Point\nSTN-3, , 1.340, , Intermediate\nBM-2, , , 1.780, Final BM Check'
  );
  const [levelingResult, setLevelingResult] = useState<any | null>(null);

  // Dip & Strike State
  const [dipP1, setDipP1] = useState({ x: '254800', y: '2605200', z: '450' });
  const [dipP2, setDipP2] = useState({ x: '255200', y: '2605300', z: '420' });
  const [dipP3, setDipP3] = useState({ x: '255000', y: '2604900', z: '390' });
  const [apparentDir, setApparentDir] = useState('120');
  const [dipResult, setDipResult] = useState<any | null>(null);

  // Volume State
  const [volumeText, setVolumeText] = useState<string>(
    '0, 120.5, 80.0, 40.5\n50, 185.0, 140.0, 45.0\n100, 240.2, 190.0, 50.2\n150, 190.0, 150.0, 40.0\n200, 95.0, 70.0, 25.0'
  );
  const [volumeResult, setVolumeResult] = useState<any | null>(null);

  // Resection State
  const [resA, setResA] = useState({ E: '254000', N: '2605000' });
  const [resB, setResB] = useState({ E: '256000', N: '2606000' });
  const [resC, setResC] = useState({ E: '255500', N: '2604000' });
  const [resAlpha, setResAlpha] = useState('65.5');
  const [resBeta, setResBeta] = useState('52.3');
  const [resGamma, setResGamma] = useState('242.2');
  const [resectionResult, setResectionResult] = useState<any | null>(null);

  // Calculator Screen State
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [angleMode, setAngleMode] = useState<'deg' | 'rad'>('deg');

  // Compute Vincenty
  const handleComputeVincenti = () => {
    const lon1 = parseFloat(vLon1), lat1 = parseFloat(vLat1);
    const lon2 = parseFloat(vLon2), lat2 = parseFloat(vLat2);
    if (isNaN(lon1) || isNaN(lat1) || isNaN(lon2) || isNaN(lat2)) return;
    const res = vincentyCore(lon1, lat1, lon2, lat2);
    setVResult(res);
  };

  // Compute Traverse Balancing
  const handleComputeTraverse = () => {
    try {
      const lines = travText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const legs: { name: string; brg: number; dist: number }[] = [];
      lines.forEach(l => {
        const p = l.split(/[,\t]+/).map(s => s.trim());
        if (p.length >= 3) {
          legs.push({ name: p[0], brg: parseFloat(p[1]), dist: parseFloat(p[2]) });
        }
      });
      if (legs.length < 2) return;
      const res = bowditchBalance(parseFloat(startE) || 0, parseFloat(startN) || 0, legs);
      setTravResult(res);
    } catch (err: any) {
      alert(`Traverse computation error: ${err.message}`);
    }
  };

  // Compute Area
  const handleComputeArea = () => {
    try {
      const lines = areaPtsText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const pts: { E: number; N: number }[] = [];
      lines.forEach(l => {
        const p = l.split(/[,\t]+/).map(parseFloat);
        if (p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1])) {
          pts.push({ E: p[0], N: p[1] });
        }
      });
      if (pts.length < 3) return;
      const poly = polygonAreaPerimeter(pts);
      const formatted = formatAreaAllUnits(poly.areaM2, localLandUnitPreset, customBighaM2, customKathaPerBigha);
      setAreaResult({ ...poly, formatted });
    } catch (err: any) {
      alert(`Area calculation error: ${err.message}`);
    }
  };

  // Compute Curve
  const handleComputeCurve = () => {
    const r = parseFloat(curveR);
    const d = parseFloat(curveDelta);
    const st = parseFloat(curveStartStation) || 0;
    if (isNaN(r) || isNaN(d)) return;
    const res = circularCurve(r, d, st);
    setCurveResult(res);
  };

  // Compute Intersection
  const handleComputeIntersection = () => {
    const e1 = parseFloat(intE1), n1 = parseFloat(intN1), b1 = parseFloat(intBrg1);
    const e2 = parseFloat(intE2), n2 = parseFloat(intN2), b2 = parseFloat(intBrg2);
    if (isNaN(e1) || isNaN(n1) || isNaN(e2) || isNaN(n2)) return;
    try {
      const res = bearingBearingIntersection(e1, n1, b1, e2, n2, b2);
      setIntResult(res);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Compute Leveling
  const handleComputeLeveling = () => {
    try {
      const lines = levelingText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const rows: LevelingRow[] = [];
      lines.forEach(l => {
        const parts = l.split(/[,\t]+/).map(s => s.trim());
        if (parts.length >= 1) {
          const bs = parts[1] && !isNaN(parseFloat(parts[1])) ? parseFloat(parts[1]) : undefined;
          const isVal = parts[2] && !isNaN(parseFloat(parts[2])) ? parseFloat(parts[2]) : undefined;
          const fs = parts[3] && !isNaN(parseFloat(parts[3])) ? parseFloat(parts[3]) : undefined;
          rows.push({
            stn: parts[0],
            bs,
            is: isVal,
            fs,
            remarks: parts[4] || ''
          });
        }
      });
      const initialRL = parseFloat(levelingBmRL) || 100;
      const res = computeDifferentialLeveling(initialRL, rows);
      setLevelingResult(res);
    } catch (err: any) {
      alert(`Leveling error: ${err.message}`);
    }
  };

  // Compute Dip & Strike
  const handleComputeDipStrike = () => {
    const p1 = { x: parseFloat(dipP1.x), y: parseFloat(dipP1.y), z: parseFloat(dipP1.z) };
    const p2 = { x: parseFloat(dipP2.x), y: parseFloat(dipP2.y), z: parseFloat(dipP2.z) };
    const p3 = { x: parseFloat(dipP3.x), y: parseFloat(dipP3.y), z: parseFloat(dipP3.z) };
    const appDir = parseFloat(apparentDir);
    const res = solve3PointDipStrike(p1, p2, p3, isNaN(appDir) ? undefined : appDir);
    setDipResult(res);
  };

  // Compute Volume
  const handleComputeVolume = () => {
    try {
      const lines = volumeText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const sections = lines.map(l => {
        const parts = l.split(/[,\t]+/).map(parseFloat);
        return {
          station: parts[0],
          area: parts[1],
          cutArea: parts[2],
          fillArea: parts[3]
        };
      });
      const res = computeEndAreaVolume(sections);
      setVolumeResult(res);
    } catch (err: any) {
      alert(`Volume error: ${err.message}`);
    }
  };

  // Compute Resection
  const handleComputeResection = () => {
    try {
      const A = { E: parseFloat(resA.E), N: parseFloat(resA.N) };
      const B = { E: parseFloat(resB.E), N: parseFloat(resB.N) };
      const C = { E: parseFloat(resC.E), N: parseFloat(resC.N) };
      const alpha = parseFloat(resAlpha);
      const beta = parseFloat(resBeta);
      const gamma = parseFloat(resGamma);
      const res = solveTienstraResection(A, B, C, alpha, beta, gamma);
      setResectionResult(res);
    } catch (err: any) {
      alert(`Resection error: ${err.message}`);
    }
  };

  // Calculator button handler
  const handleCalcBtn = (btn: string) => {
    if (btn === 'C') {
      setCalcDisplay('0');
    } else if (btn === 'DEL') {
      setCalcDisplay(prev => (prev.length > 1 ? prev.slice(0, -1) : '0'));
    } else if (btn === '=') {
      try {
        let expr = calcDisplay
          .replace(/sin\(/g, angleMode === 'deg' ? 'Math.sin((Math.PI/180)*' : 'Math.sin(')
          .replace(/cos\(/g, angleMode === 'deg' ? 'Math.cos((Math.PI/180)*' : 'Math.cos(')
          .replace(/tan\(/g, angleMode === 'deg' ? 'Math.tan((Math.PI/180)*' : 'Math.tan(')
          .replace(/sqrt\(/g, 'Math.sqrt(');
        // eslint-disable-next-line no-eval
        const res = Function(`'use strict'; return (${expr})`)();
        setCalcDisplay(String(Number(res.toFixed(8))));
      } catch {
        setCalcDisplay('Error');
      }
    } else if (['sin', 'cos', 'tan', 'sqrt'].includes(btn)) {
      setCalcDisplay(prev => (prev === '0' ? `${btn}(` : `${prev}${btn}(`));
    } else {
      setCalcDisplay(prev => (prev === '0' ? btn : `${prev}${btn}`));
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Sub-tool Navigation Header */}
      <div className="bg-[#0f0f0f] rounded-2xl p-4 sm:p-6 border border-white/5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-0.5 font-medium">Mathematical Survey Engine</p>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#c9a063]" />
              Field Geodesy & Survey Calculator Suite
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5 text-xs font-semibold">
          {[
            { id: 'vincenty', label: 'Vincenty Geodesic', icon: Compass },
            { id: 'traverse', label: 'Traverse Balancing', icon: TrendingUp },
            { id: 'leveling', label: 'Differential Leveling', icon: ListOrdered },
            { id: 'dipstrike', label: '3-Point Dip & Strike', icon: Mountain },
            { id: 'volume', label: 'Earthwork Volume', icon: Box },
            { id: 'resection', label: 'Tienstra Resection', icon: Crosshair },
            { id: 'area', label: 'Area & Perimeter', icon: Layers },
            { id: 'curve', label: 'Circular Curve', icon: RotateCw },
            { id: 'intersect', label: 'Ray Intersection', icon: ArrowRight },
            { id: 'calc', label: 'Scientific Keypad', icon: Calculator }
          ].map(tool => {
            const Icon = tool.icon;
            const active = activeSubTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => setActiveSubTool(tool.id as any)}
                className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all ${
                  active
                    ? 'bg-[#c9a063] text-black font-bold shadow-lg shadow-[#c9a063]/10'
                    : 'bg-[#141414] text-white/60 hover:text-white hover:bg-[#1a1a1a] border border-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tool.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Vincenty Geodesic Sub-tool */}
      {activeSubTool === 'vincenty' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div>
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#c9a063]" />
              Vincenty Inverse Geodesic (WGS-84 Ellipsoid)
            </h4>
            <p className="text-xs text-white/40 mt-1">
              Computes millimeter-accurate ellipsoidal distance, forward azimuth, and reverse azimuth between two geodetic coordinates.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 p-4 bg-[#141414] rounded-xl border border-white/5">
              <span className="text-xs font-semibold text-[#c9a063] block">Point 1 (Station A)</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={vLon1}
                  onChange={e => setVLon1(e.target.value)}
                  placeholder="Longitude (deg/DMS)"
                  className="py-2 px-3 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
                />
                <input
                  type="text"
                  value={vLat1}
                  onChange={e => setVLat1(e.target.value)}
                  placeholder="Latitude (deg/DMS)"
                  className="py-2 px-3 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-2 p-4 bg-[#141414] rounded-xl border border-white/5">
              <span className="text-xs font-semibold text-[#c9a063] block">Point 2 (Station B)</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={vLon2}
                  onChange={e => setVLon2(e.target.value)}
                  placeholder="Longitude (deg/DMS)"
                  className="py-2 px-3 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
                />
                <input
                  type="text"
                  value={vLat2}
                  onChange={e => setVLat2(e.target.value)}
                  placeholder="Latitude (deg/DMS)"
                  className="py-2 px-3 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleComputeVincenti}
            className="px-5 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-[#c9a063]/10"
          >
            Compute Ellipsoidal Geodesic
          </button>

          {vResult && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Ellipsoidal Distance</span>
                <span className="text-base font-bold text-white">{(vResult.distance / 1000).toFixed(4)} km</span>
                <span className="text-[11px] text-white/50 block font-mono">({vResult.distance.toFixed(3)} m)</span>
              </div>
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Forward Azimuth (A &rarr; B)</span>
                <span className="text-base font-bold text-[#c9a063]">{vResult.fwdAz.toFixed(4)}&deg;</span>
              </div>
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Reverse Azimuth (B &rarr; A)</span>
                <span className="text-base font-bold text-[#c9a063]">{vResult.revAz.toFixed(4)}&deg;</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Differential Leveling Sub-tool */}
      {activeSubTool === 'leveling' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="text-base font-serif italic text-white flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-[#c9a063]" />
                Differential Leveling (Collimation HI & Rise/Fall Method)
              </h4>
              <p className="text-xs text-white/40 mt-1">
                Computes Reduced Levels (RL), Height of Instrument (HI), Rise, Fall, and performs standard 3-way arithmetic misclosure checks.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60">Initial BM RL (m):</span>
              <input
                type="number"
                value={levelingBmRL}
                onChange={e => setLevelingBmRL(e.target.value)}
                className="w-24 py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#141414] text-white text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-white/60 block">
              Level Field Book Data (Format: <code className="text-[#c9a063]">Station, BS, IS, FS, Remarks</code>)
            </label>
            <textarea
              rows={6}
              value={levelingText}
              onChange={e => setLevelingText(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-white/10 bg-[#141414] text-white font-mono text-xs focus:outline-none focus:border-[#c9a063]"
            />
          </div>

          <button
            onClick={handleComputeLeveling}
            className="px-5 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-[#c9a063]/10"
          >
            Compute Reduced Levels (RL)
          </button>

          {levelingResult && (
            <div className="space-y-4 pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 text-[10px] uppercase">
                      <th className="py-2.5 px-3">Station</th>
                      <th className="py-2.5 px-3">BS (m)</th>
                      <th className="py-2.5 px-3">IS (m)</th>
                      <th className="py-2.5 px-3">FS (m)</th>
                      <th className="py-2.5 px-3">HI (m)</th>
                      <th className="py-2.5 px-3">Rise (m)</th>
                      <th className="py-2.5 px-3">Fall (m)</th>
                      <th className="py-2.5 px-3 text-[#c9a063] font-bold">RL (m)</th>
                      <th className="py-2.5 px-3 font-sans">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {levelingResult.rows.map((r: any, idx: number) => (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="py-2 px-3 font-bold text-white">{r.stn}</td>
                        <td className="py-2 px-3 text-emerald-400">{r.bs != null ? r.bs.toFixed(3) : '-'}</td>
                        <td className="py-2 px-3 text-white/60">{r.is != null ? r.is.toFixed(3) : '-'}</td>
                        <td className="py-2 px-3 text-rose-400">{r.fs != null ? r.fs.toFixed(3) : '-'}</td>
                        <td className="py-2 px-3 text-sky-400">{r.hi != null ? r.hi.toFixed(3) : '-'}</td>
                        <td className="py-2 px-3 text-emerald-300">{r.rise != null ? r.rise.toFixed(3) : '-'}</td>
                        <td className="py-2 px-3 text-rose-300">{r.fall != null ? r.fall.toFixed(3) : '-'}</td>
                        <td className="py-2 px-3 text-[#c9a063] font-bold">{r.rl.toFixed(3)}</td>
                        <td className="py-2 px-3 text-white/50 font-sans text-[11px]">{r.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Arithmetic Check Banner */}
              <div className="p-4 bg-[#141414] rounded-xl border border-white/10 text-xs font-mono space-y-1">
                <div className="font-bold text-[#c9a063] font-serif italic text-sm">Arithmetic Check:</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-white/80">
                  <div>&Sigma;BS - &Sigma;FS = {(levelingResult.sumBS - levelingResult.sumFS).toFixed(3)} m</div>
                  <div>&Sigma;Rise - &Sigma;Fall = {(levelingResult.sumRise - levelingResult.sumFall).toFixed(3)} m</div>
                  <div>Last RL - First RL = {(levelingResult.lastRL - levelingResult.initialRL).toFixed(3)} m</div>
                </div>
                <div className="pt-2 text-emerald-400 font-bold">
                  &check; Mathematical Check Verified (Error: {levelingResult.diffCheck.toFixed(4)} m)
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Geological 3-Point Dip & Strike Solver */}
      {activeSubTool === 'dipstrike' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div>
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Mountain className="w-5 h-5 text-[#c9a063]" />
              Geological 3-Point Dip & Strike Solver
            </h4>
            <p className="text-xs text-white/40 mt-1">
              Computes True Strike, True Dip, Dip Azimuth, and Apparent Dip from 3 non-collinear borehole intersections or surface outcrop elevations.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-[#141414] rounded-xl border border-white/5 space-y-2">
              <span className="text-xs font-semibold text-[#c9a063] block">Point 1 (X, Y, Z / Elevation)</span>
              <input
                type="number"
                value={dipP1.x}
                onChange={e => setDipP1({ ...dipP1, x: e.target.value })}
                placeholder="Easting X"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={dipP1.y}
                onChange={e => setDipP1({ ...dipP1, y: e.target.value })}
                placeholder="Northing Y"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={dipP1.z}
                onChange={e => setDipP1({ ...dipP1, z: e.target.value })}
                placeholder="Elevation Z"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
            </div>

            <div className="p-4 bg-[#141414] rounded-xl border border-white/5 space-y-2">
              <span className="text-xs font-semibold text-[#c9a063] block">Point 2 (X, Y, Z / Elevation)</span>
              <input
                type="number"
                value={dipP2.x}
                onChange={e => setDipP2({ ...dipP2, x: e.target.value })}
                placeholder="Easting X"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={dipP2.y}
                onChange={e => setDipP2({ ...dipP2, y: e.target.value })}
                placeholder="Northing Y"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={dipP2.z}
                onChange={e => setDipP2({ ...dipP2, z: e.target.value })}
                placeholder="Elevation Z"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
            </div>

            <div className="p-4 bg-[#141414] rounded-xl border border-white/5 space-y-2">
              <span className="text-xs font-semibold text-[#c9a063] block">Point 3 (X, Y, Z / Elevation)</span>
              <input
                type="number"
                value={dipP3.x}
                onChange={e => setDipP3({ ...dipP3, x: e.target.value })}
                placeholder="Easting X"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={dipP3.y}
                onChange={e => setDipP3({ ...dipP3, y: e.target.value })}
                placeholder="Northing Y"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={dipP3.z}
                onChange={e => setDipP3({ ...dipP3, z: e.target.value })}
                placeholder="Elevation Z"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-white/60">Cross-Section Trend for Apparent Dip (Azimuth &deg;):</span>
            <input
              type="number"
              value={apparentDir}
              onChange={e => setApparentDir(e.target.value)}
              className="w-24 py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#141414] text-white text-xs font-mono"
            />
            <button
              onClick={handleComputeDipStrike}
              className="px-5 py-2 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-[#c9a063]/10"
            >
              Solve Dip & Strike
            </button>
          </div>

          {dipResult && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">True Strike</span>
                <span className="text-base font-bold text-white">{dipResult.strikeDirectionStr}</span>
                <span className="text-[11px] text-[#c9a063] block">{dipResult.strikeQuadrant}</span>
              </div>
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">True Dip Angle</span>
                <span className="text-base font-bold text-emerald-400">{dipResult.dipDeg.toFixed(2)}&deg;</span>
              </div>
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Dip Direction</span>
                <span className="text-base font-bold text-white">{dipResult.dipDirectionDeg.toFixed(1)}&deg;</span>
                <span className="text-[11px] text-[#c9a063] block">{dipResult.dipDirectionQuadrant}</span>
              </div>
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Apparent Dip ({apparentDir}&deg;)</span>
                <span className="text-base font-bold text-sky-400">
                  {dipResult.apparentDipDeg != null ? `${dipResult.apparentDipDeg.toFixed(2)}°` : 'N/A'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Earthwork & Stockpile Volume Sub-tool */}
      {activeSubTool === 'volume' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div>
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Box className="w-5 h-5 text-[#c9a063]" />
              Earthwork & Stockpile Volume (End-Area & Prismoidal)
            </h4>
            <p className="text-xs text-white/40 mt-1">
              Computes cut/fill and total volumetric stockpile quantities across progressive chainage cross-sections.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-white/60 block">
              Cross-Section Chainages & Areas (Format: <code className="text-[#c9a063]">Station, Total_Area_m2, Cut_Area_m2, Fill_Area_m2</code>)
            </label>
            <textarea
              rows={5}
              value={volumeText}
              onChange={e => setVolumeText(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-white/10 bg-[#141414] text-white font-mono text-xs focus:outline-none focus:border-[#c9a063]"
            />
          </div>

          <button
            onClick={handleComputeVolume}
            className="px-5 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-[#c9a063]/10"
          >
            Compute Volumetric Quantities
          </button>

          {volumeResult && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block uppercase font-sans">Total Stockpile Volume</span>
                  <span className="text-base font-bold text-white">{volumeResult.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })} m&sup3;</span>
                </div>
                <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block uppercase font-sans">Total Excavation (Cut)</span>
                  <span className="text-base font-bold text-rose-400">{volumeResult.cutVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })} m&sup3;</span>
                </div>
                <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block uppercase font-sans">Total Embankment (Fill)</span>
                  <span className="text-base font-bold text-emerald-400">{volumeResult.fillVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })} m&sup3;</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 text-[10px] uppercase">
                      <th className="py-2 px-3">Segment</th>
                      <th className="py-2 px-3">Interval (m)</th>
                      <th className="py-2 px-3">End-Area Vol (m&sup3;)</th>
                      <th className="py-2 px-3">Prismoidal Vol (m&sup3;)</th>
                      <th className="py-2 px-3 text-rose-400">Cut Vol (m&sup3;)</th>
                      <th className="py-2 px-3 text-emerald-400">Fill Vol (m&sup3;)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {volumeResult.segments.map((s: any, idx: number) => (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="py-2 px-3 text-white font-bold">{s.fromStation}m &rarr; {s.toStation}m</td>
                        <td className="py-2 px-3 text-white/50">{s.distance} m</td>
                        <td className="py-2 px-3 text-white font-bold">{s.endAreaVol.toFixed(1)}</td>
                        <td className="py-2 px-3 text-[#c9a063]">{s.prismoidalVol.toFixed(1)}</td>
                        <td className="py-2 px-3 text-rose-300">{s.cutVol.toFixed(1)}</td>
                        <td className="py-2 px-3 text-emerald-300">{s.fillVol.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. Tienstra 3-Point Resection Sub-tool */}
      {activeSubTool === 'resection' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div>
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-[#c9a063]" />
              Tienstra 3-Point Resection Coordinate Solver
            </h4>
            <p className="text-xs text-white/40 mt-1">
              Determines exact unknown coordinates of station P from 3 known triangulation targets (A, B, C) and observed horizontal subtended angles.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-[#141414] rounded-xl border border-white/5 space-y-2">
              <span className="text-xs font-semibold text-[#c9a063] block">Target Station A (Left)</span>
              <input
                type="number"
                value={resA.E}
                onChange={e => setResA({ ...resA, E: e.target.value })}
                placeholder="Easting E"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={resA.N}
                onChange={e => setResA({ ...resA, N: e.target.value })}
                placeholder="Northing N"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
            </div>

            <div className="p-4 bg-[#141414] rounded-xl border border-white/5 space-y-2">
              <span className="text-xs font-semibold text-[#c9a063] block">Target Station B (Apex)</span>
              <input
                type="number"
                value={resB.E}
                onChange={e => setResB({ ...resB, E: e.target.value })}
                placeholder="Easting E"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={resB.N}
                onChange={e => setResB({ ...resB, N: e.target.value })}
                placeholder="Northing N"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
            </div>

            <div className="p-4 bg-[#141414] rounded-xl border border-white/5 space-y-2">
              <span className="text-xs font-semibold text-[#c9a063] block">Target Station C (Right)</span>
              <input
                type="number"
                value={resC.E}
                onChange={e => setResC({ ...resC, E: e.target.value })}
                placeholder="Easting E"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={resC.N}
                onChange={e => setResC({ ...resC, N: e.target.value })}
                placeholder="Northing N"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-white/60 mb-1 block">Subtended Angle &alpha; (B &rarr; C at P)</label>
              <input
                type="number"
                value={resAlpha}
                onChange={e => setResAlpha(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1 block">Subtended Angle &beta; (C &rarr; A at P)</label>
              <input
                type="number"
                value={resBeta}
                onChange={e => setResBeta(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1 block">Subtended Angle &gamma; (A &rarr; B at P)</label>
              <input
                type="number"
                value={resGamma}
                onChange={e => setResGamma(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-mono"
              />
            </div>
          </div>

          <button
            onClick={handleComputeResection}
            className="px-5 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-[#c9a063]/10"
          >
            Solve Unknown Coordinates (P)
          </button>

          {resectionResult && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Solved Easting (E)</span>
                <span className="text-base font-bold text-white">{resectionResult.E.toFixed(3)} m</span>
              </div>
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Solved Northing (N)</span>
                <span className="text-base font-bold text-white">{resectionResult.N.toFixed(3)} m</span>
              </div>
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Distance to Targets</span>
                <span className="text-[11px] text-white/70 block">PA: {resectionResult.distA.toFixed(1)}m</span>
                <span className="text-[11px] text-white/70 block">PB: {resectionResult.distB.toFixed(1)}m</span>
                <span className="text-[11px] text-white/70 block">PC: {resectionResult.distC.toFixed(1)}m</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. Polygonal Traverse Balancing Sub-tool */}
      {activeSubTool === 'traverse' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="text-base font-serif italic text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#c9a063]" />
                Closed Polygonal Traverse Balancing (Bowditch & Transit Rule)
              </h4>
              <p className="text-xs text-white/40 mt-1">
                Distributes angular and linear misclosure proportionally across traverse legs and computes balanced coordinates.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60">Origin Easting / Northing:</span>
              <input
                type="number"
                value={startE}
                onChange={e => setStartE(e.target.value)}
                className="w-24 py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#141414] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={startN}
                onChange={e => setStartN(e.target.value)}
                className="w-24 py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#141414] text-white text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-white/60 block">
              Traverse Legs (Format: <code className="text-[#c9a063]">Leg_ID, Bearing_Deg, Distance_m</code>)
            </label>
            <textarea
              rows={5}
              value={travText}
              onChange={e => setTravText(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-white/10 bg-[#141414] text-white font-mono text-xs focus:outline-none focus:border-[#c9a063]"
            />
          </div>

          <button
            onClick={handleComputeTraverse}
            className="px-5 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-[#c9a063]/10"
          >
            Balance Traverse Network
          </button>

          {travResult && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-3.5 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block uppercase font-sans">Total Perimeter</span>
                  <span className="text-base font-bold text-white">{travResult.totalLength.toFixed(2)} m</span>
                </div>
                <div className="p-3.5 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block uppercase font-sans">Linear Misclosure</span>
                  <span className="text-base font-bold text-amber-400">{travResult.linearMisclosure.toFixed(3)} m</span>
                </div>
                <div className="p-3.5 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block uppercase font-sans">Relative Precision</span>
                  <span className="text-base font-bold text-emerald-400">{travResult.precision}</span>
                </div>
                <div className="p-3.5 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block uppercase font-sans">Closure Errors (&Delta;E, &Delta;N)</span>
                  <span className="text-xs font-bold text-white/80">
                    E: {travResult.misclosureE.toFixed(3)}, N: {travResult.misclosureN.toFixed(3)}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 text-[10px] uppercase">
                      <th className="py-2 px-3">Leg</th>
                      <th className="py-2 px-3">Adj Dist</th>
                      <th className="py-2 px-3">Adj Brg</th>
                      <th className="py-2 px-3">Adj &Delta;E</th>
                      <th className="py-2 px-3">Adj &Delta;N</th>
                      <th className="py-2 px-3 text-[#c9a063] font-bold">Balanced E</th>
                      <th className="py-2 px-3 text-[#c9a063] font-bold">Balanced N</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {travResult.legs.map((l: any, idx: number) => (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="py-2 px-3 font-bold text-white">{l.name}</td>
                        <td className="py-2 px-3 text-white/70">{l.adjDist.toFixed(2)}m</td>
                        <td className="py-2 px-3 text-white/70">{l.adjBearingDeg.toFixed(2)}&deg;</td>
                        <td className="py-2 px-3 text-emerald-400">{l.adjDE.toFixed(3)}</td>
                        <td className="py-2 px-3 text-sky-400">{l.adjDN.toFixed(3)}</td>
                        <td className="py-2 px-3 text-[#c9a063] font-bold">{l.E.toFixed(2)}</td>
                        <td className="py-2 px-3 text-[#c9a063] font-bold">{l.N.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. Area & Perimeter Sub-tool */}
      {activeSubTool === 'area' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div>
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#c9a063]" />
              Polygon Area & Perimeter (Shoelace / Gauss Method)
            </h4>
            <p className="text-xs text-white/40 mt-1">
              Computes geometric area from polygon coordinates with instant conversion to regional land tenure units.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-white/60 block">
              Vertex Coordinates (Format: <code className="text-[#c9a063]">Easting, Northing</code> per line)
            </label>
            <textarea
              rows={5}
              value={areaPtsText}
              onChange={e => setAreaPtsText(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-white/10 bg-[#141414] text-white font-mono text-xs focus:outline-none focus:border-[#c9a063]"
            />
          </div>

          <button
            onClick={handleComputeArea}
            className="px-5 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-[#c9a063]/10"
          >
            Compute Area & Perimeter
          </button>

          {areaResult && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Square Metres</span>
                <span className="text-base font-bold text-white">{areaResult.areaM2.toLocaleString(undefined, { maximumFractionDigits: 2 })} m&sup2;</span>
                <span className="text-[11px] text-white/50 block">Perimeter: {areaResult.perimeterM.toFixed(2)} m</span>
              </div>
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Hectares / Acres</span>
                <span className="text-base font-bold text-[#c9a063]">{areaResult.areaHa.toFixed(4)} Ha</span>
                <span className="text-[11px] text-white/50 block">({areaResult.areaAcre.toFixed(3)} Acres)</span>
              </div>
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Regional Land Units</span>
                <span className="text-xs font-bold text-emerald-400 block font-sans">{areaResult.formatted}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 9. Circular Curve Sub-tool */}
      {activeSubTool === 'curve' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div>
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <RotateCw className="w-5 h-5 text-[#c9a063]" />
              Circular Horizontal Curve Setting-Out
            </h4>
            <p className="text-xs text-white/40 mt-1">
              Computes tangent length (T), arc length (L), long chord (C), mid-ordinate (M), and external distance (E).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-white/60 mb-1 block">Radius R (m)</label>
              <input
                type="number"
                value={curveR}
                onChange={e => setCurveR(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1 block">Deflection Angle &Delta; (deg)</label>
              <input
                type="number"
                value={curveDelta}
                onChange={e => setCurveDelta(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1 block">Station at BC (m)</label>
              <input
                type="number"
                value={curveStartStation}
                onChange={e => setCurveStartStation(e.target.value)}
                className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-mono"
              />
            </div>
          </div>

          <button
            onClick={handleComputeCurve}
            className="px-5 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-[#c9a063]/10"
          >
            Compute Curve Elements
          </button>

          {curveResult && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
              <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block font-sans">Tangent (T)</span>
                <span className="font-bold text-white">{curveResult.tangent.toFixed(3)} m</span>
              </div>
              <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block font-sans">Arc Length (L)</span>
                <span className="font-bold text-[#c9a063]">{curveResult.length.toFixed(3)} m</span>
              </div>
              <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block font-sans">Long Chord (C)</span>
                <span className="font-bold text-white">{curveResult.chord.toFixed(3)} m</span>
              </div>
              <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block font-sans">External (E)</span>
                <span className="font-bold text-white">{curveResult.external.toFixed(3)} m</span>
              </div>
              <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block font-sans">Mid-Ord (M)</span>
                <span className="font-bold text-white">{curveResult.midOrd.toFixed(3)} m</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 10. Bearing-Bearing Intersection */}
      {activeSubTool === 'intersect' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div>
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-[#c9a063]" />
              Bearing-Bearing Ray Intersection
            </h4>
            <p className="text-xs text-white/40 mt-1">
              Computes intersection coordinates from two known stations and their observed forward azimuths.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-[#141414] rounded-xl border border-white/5 space-y-2">
              <span className="text-xs font-semibold text-[#c9a063] block">Station 1 & Bearing</span>
              <input
                type="number"
                value={intE1}
                onChange={e => setIntE1(e.target.value)}
                placeholder="Easting 1"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={intN1}
                onChange={e => setIntN1(e.target.value)}
                placeholder="Northing 1"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={intBrg1}
                onChange={e => setIntBrg1(e.target.value)}
                placeholder="Bearing 1 (deg)"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
            </div>

            <div className="p-4 bg-[#141414] rounded-xl border border-white/5 space-y-2">
              <span className="text-xs font-semibold text-[#c9a063] block">Station 2 & Bearing</span>
              <input
                type="number"
                value={intE2}
                onChange={e => setIntE2(e.target.value)}
                placeholder="Easting 2"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={intN2}
                onChange={e => setIntN2(e.target.value)}
                placeholder="Northing 2"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
              <input
                type="number"
                value={intBrg2}
                onChange={e => setIntBrg2(e.target.value)}
                placeholder="Bearing 2 (deg)"
                className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#0f0f0f] text-white text-xs font-mono"
              />
            </div>
          </div>

          <button
            onClick={handleComputeIntersection}
            className="px-5 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-[#c9a063]/10"
          >
            Compute Ray Intersection
          </button>

          {intResult && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Intersection Easting</span>
                <span className="text-base font-bold text-white">{intResult.E.toFixed(3)} m</span>
                <span className="text-[11px] text-white/50 block">Distance from Stn 1: {intResult.dist1.toFixed(2)} m</span>
              </div>
              <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Intersection Northing</span>
                <span className="text-base font-bold text-white">{intResult.N.toFixed(3)} m</span>
                <span className="text-[11px] text-white/50 block">Distance from Stn 2: {intResult.dist2.toFixed(2)} m</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 11. Scientific Keypad Sub-tool */}
      {activeSubTool === 'calc' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 border border-white/5 max-w-md mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#c9a063]" />
              Field Scientific Keypad
            </h4>
            <button
              onClick={() => setAngleMode(angleMode === 'deg' ? 'rad' : 'deg')}
              className="px-2.5 py-1 text-xs font-mono font-bold bg-[#141414] rounded-lg text-[#c9a063] border border-white/10"
            >
              MODE: {angleMode.toUpperCase()}
            </button>
          </div>

          <div className="p-4 rounded-xl bg-black text-right font-mono text-2xl font-bold text-[#c9a063] overflow-x-auto border border-white/10">
            {calcDisplay}
          </div>

          <div className="grid grid-cols-4 gap-2 text-sm font-semibold">
            {['sin', 'cos', 'tan', 'sqrt', 'C', 'DEL', '(', ')', '7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+'].map(btn => (
              <button
                key={btn}
                onClick={() => handleCalcBtn(btn)}
                className={`py-3 rounded-xl transition-all ${
                  btn === '='
                    ? 'bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold'
                    : ['C', 'DEL'].includes(btn)
                    ? 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40'
                    : ['sin', 'cos', 'tan', 'sqrt', '(', ')'].includes(btn)
                    ? 'bg-white/5 hover:bg-white/10 text-[#c9a063] border border-white/5'
                    : 'bg-[#141414] hover:bg-[#1f1f1f] text-white border border-white/5'
                }`}
              >
                {btn}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
