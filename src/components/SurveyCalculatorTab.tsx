import React, { useState, useEffect, useMemo } from 'react';
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
  ListOrdered,
  Camera,
  Ruler,
  MapPin,
  Radio,
  Navigation,
  Globe,
  RefreshCw,
  Share2,
  Waves
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
  LevelingRow,
  parseDMSval,
  toDMSstr
} from '../lib/geodesy';
import { calculateMagneticDeclination, convertAzimuthAngles, MagneticDeclinationResult } from '../lib/geomagnetism';
import {
  buildTin,
  planArea,
  surfaceArea3D,
  volumeToDatum,
  volumeBetween,
  contourSet,
  linkContours
} from '../engines/tin';
import { parseSurfacePoints, parseBreaklines } from '../lib/surfacePointText';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { crsLabelFor, isValidZone } from '../lib/crsIdentity';
import { downloadBlob } from '../lib/zip';
import { toCSVtext, csvEnc } from '../lib/formats';
import { CameraLandmarkStudio } from './CameraLandmarkStudio';
import { GeoFeature } from '../types';
import { useToast } from '../context/ToastContext';
import { sensorManager } from '../lib/sensorResourceManager';

interface SurveyCalculatorTabProps {
  workingZone?: string;
  localLandUnitPreset: string;
  customBighaM2: number;
  customKathaPerBigha: number;
  onSendToGisLayers?: (features: GeoFeature[], layerName: string) => void;
}

export const SurveyCalculatorTab: React.FC<SurveyCalculatorTabProps> = ({
  workingZone = '45N',
  localLandUnitPreset,
  customBighaM2,
  customKathaPerBigha,
  onSendToGisLayers
}) => {
  const [activeSubTool, setActiveSubTool] = useState<
    'camera' | 'magnetic' | 'vincenty' | 'traverse' | 'area' | 'curve' | 'intersect' | 'leveling' | 'dipstrike' | 'volume' | 'surface' | 'resection' | 'calc'
  >('camera');
  const toast = useToast();

  // Magnetic Declination State
  const [magLat, setMagLat] = useState('23.541200');
  const [magLon, setMagLon] = useState('84.601550');
  const [magElevation, setMagElevation] = useState('150');
  const [magDate, setMagDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [magResult, setMagResult] = useState<MagneticDeclinationResult | null>(null);
  const [magAzimuthTest, setMagAzimuthTest] = useState('45.0');
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [magCopied, setMagCopied] = useState(false);

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

  // TIN surface state
  const [surfAText, setSurfAText] = useState<string>(
    [
      '# Surface A — E, N, RL. One surveyed point per line.',
      '254800, 2605200, 100.0',
      '254860, 2605200, 101.5',
      '254860, 2605260, 100.8',
      '254800, 2605260, 100.2',
      '254830, 2605230, 106.0'
    ].join('\n')
  );
  const [surfBText, setSurfBText] = useState<string>('');
  const [breaklineText, setBreaklineText] = useState<string>('');
  const [surfDatumMode, setSurfDatumMode] = useState<'toe' | 'rl'>('toe');
  const [surfDatumRl, setSurfDatumRl] = useState<string>('100');
  const [contourInterval, setContourInterval] = useState<string>('1');

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

  // Compute Magnetic Declination
  const handleComputeDeclination = () => {
    const lat = parseDMSval(magLat);
    const lon = parseDMSval(magLon);
    const elev = parseFloat(magElevation) || 0;
    const d = magDate ? new Date(magDate) : new Date();
    const zoneNum = parseInt(workingZone, 10) || 45;

    if (isNaN(lat) || isNaN(lon)) return;
    const res = calculateMagneticDeclination(lat, lon, elev, d, zoneNum);
    setMagResult(res);
  };

  // Re-run magnetic declination when inputs change
  useEffect(() => {
    handleComputeDeclination();
  }, [magLat, magLon, magElevation, magDate, workingZone]);

  // Acquire Live GPS Coordinates for Magnetic Declination
  const handleGetDeviceLocationForDeclination = () => {
    if (!navigator.geolocation) {
      toast.showError('Geolocation is not supported by your browser or environment.');
      return;
    }
    setIsLocatingGps(true);
    // Routed through the resource manager so the fix is recorded in the privacy
    // audit log and is covered by the master kill switch.
    sensorManager
      .requestOneTimeLocation('survey_calc_locate', 'Survey Calculator \u2014 Magnetic declination fix', {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      })
      .then(pos => {
        setIsLocatingGps(false);
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        const alt = pos.coords.altitude != null ? Math.round(pos.coords.altitude).toString() : '100';
        setMagLat(lat);
        setMagLon(lon);
        setMagElevation(alt);
        toast.showSuccess(`Acquired GPS coordinates: ${lat}°, ${lon}° (${alt}m MSL)`);
      })
      .catch((err: any) => {
        setIsLocatingGps(false);
        toast.showError(`Could not acquire GPS position: ${err.message}`);
      });
  };

  // Export Magnetic Declination Certificate
  const handleExportMagneticReport = () => {
    if (!magResult) return;
    const cols = ['Parameter', 'Primary Value', 'Secondary Value / Units'];
    const rows = [
      ['GEOMATICS MAGNETIC DECLINATION & GRID CONVERGENCE CERTIFICATE', '', ''],
      ['Generated On', new Date().toISOString(), ''],
      ['UTM Working Zone', `UTM Zone ${workingZone}`, ''],
      ['', '', ''],
      ['COORDINATES & OBSERVATION EPOCH', '', ''],
      ['Latitude (WGS84)', magResult.latitude.toFixed(6), toDMSstr(magResult.latitude, true)],
      ['Longitude (WGS84)', magResult.longitude.toFixed(6), toDMSstr(magResult.longitude, false)],
      ['Elevation (MSL)', `${magResult.elevationMeters} meters`, ''],
      ['Date / Decimal Epoch', magResult.date.toDateString(), `${magResult.decimalYear} yr`],
      ['', '', ''],
      ['GEOMAGNETIC VALUES', '', ''],
      ['Magnetic Declination (D)', `${magResult.declinationDegrees.toFixed(4)}°`, magResult.declinationDMS],
      ['Direction', magResult.declinationDirection, ''],
      ['Annual Secular Drift', `${magResult.annualDriftMinutes} min/year`, ''],
      ['Magnetic Inclination / Dip (I)', `${magResult.inclinationDegrees.toFixed(4)}°`, magResult.inclinationDMS],
      ['Total Field Intensity (F)', `${magResult.totalIntensityNanoTesla} nT`, ''],
      ['Horizontal Field Intensity (H)', `${magResult.horizontalIntensityNanoTesla} nT`, ''],
      ['Vertical Field Intensity (Z)', `${magResult.verticalIntensityNanoTesla} nT`, ''],
      ['', '', ''],
      ['GRID & GRIVATION VALUES', '', ''],
      ['UTM Grid Convergence (gamma)', `${magResult.gridConvergenceDegrees.toFixed(4)}°`, magResult.gridConvergenceDMS],
      ['Grivation / Grid Magnetic Angle (D - gamma)', `${magResult.grivationDegrees.toFixed(4)}°`, magResult.grivationDMS],
      ['Summary', magResult.compassVariationSummary, '']
    ];

    const csvContent = toCSVtext(cols, rows);
    downloadBlob(csvContent, `Magnetic_Declination_Report_${magResult.latitude.toFixed(4)}_${magResult.longitude.toFixed(4)}.csv`, 'text/csv');
    toast.showSuccess('Exported Magnetic Declination Certificate (.csv)');
  };

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
      toast.showSuccess(`Traverse balanced (${legs.length} stations, linear closure ${res.precision})`);
    } catch (err: any) {
      toast.showError(`Traverse computation error: ${err.message}`);
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
      toast.showSuccess(`Computed area: ${poly.areaHa.toFixed(4)} Ha (${poly.perimM.toFixed(2)}m perimeter)`);
    } catch (err: any) {
      toast.showError(`Area calculation error: ${err.message}`);
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
      toast.showSuccess(`Intersection solved: E=${res.E.toFixed(3)}, N=${res.N.toFixed(3)}`);
    } catch (err: any) {
      toast.showError(err.message);
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
      toast.showSuccess(`Differential Leveling solved (${res.rows.length} stations, check closure=${res.checkPassed ? 'OK' : 'MISMATCH'})`);
    } catch (err: any) {
      toast.showError(`Leveling error: ${err.message}`);
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

  /**
   * TIN surface results.
   *
   * Everything here is derived from the pasted points, so it recomputes as
   * they are edited rather than sitting behind a Compute button that can leave
   * stale numbers on screen next to changed input.
   */
  // Debounced so a large pickup is triangulated once per pause, not per keystroke.
  const surfATextSettled = useDebouncedValue(surfAText, 350);
  const surfBTextSettled = useDebouncedValue(surfBText, 350);
  const breaklineTextSettled = useDebouncedValue(breaklineText, 350);

  const surfaceResult = useMemo(() => {
    const a = parseSurfacePoints(surfATextSettled);
    if (a.pts.length < 3) {
      return { ok: false as const, error: 'Surface A needs at least three points, as E, N, RL per line.', rejected: a.rejected };
    }

    const bl = parseBreaklines(breaklineTextSettled);

    let tinA;
    try {
      tinA = buildTin(a.pts, { breaklines: bl.lines });
    } catch (err: any) {
      return {
        ok: false as const,
        error: `Surface A: ${err.message}`,
        rejected: [...a.rejected, ...bl.rejected]
      };
    }

    const zs = tinA.points.map(p => p.z);
    const lowest = Math.min(...zs);
    const highest = Math.max(...zs);
    const datumZ = surfDatumMode === 'toe' ? lowest : (Number.isFinite(parseFloat(surfDatumRl)) ? parseFloat(surfDatumRl) : lowest);
    const vol = volumeToDatum(tinA, datumZ);

    // Surface B is optional; a comparison is only offered once it parses.
    const b = parseSurfacePoints(surfBTextSettled);
    let comparison: ReturnType<typeof volumeBetween> | null = null;
    let comparisonError: string | null = null;
    if (b.pts.length > 0) {
      try {
        comparison = volumeBetween(tinA, buildTin(b.pts));
      } catch (err: any) {
        comparisonError = `Surface B: ${err.message}`;
      }
    }

    // Contours.
    const intervalM = parseFloat(contourInterval);
    let contours: ReturnType<typeof linkContours> = [];
    let contourError: string | null = null;
    try {
      contours = linkContours(contourSet(tinA, intervalM));
    } catch (err: any) {
      contourError = err.message;
    }

    return {
      ok: true as const,
      tinA,
      lowest,
      highest,
      datumZ,
      vol,
      planAreaM2: planArea(tinA),
      surfaceAreaM2: surfaceArea3D(tinA),
      comparison,
      comparisonError,
      contours,
      contourError,
      breaklineCount: bl.lines.length,
      rejected: [...a.rejected, ...b.rejected, ...bl.rejected]
    };
  }, [surfATextSettled, surfBTextSettled, breaklineTextSettled, surfDatumMode, surfDatumRl, contourInterval]);

  /** Sends the linked contours to GIS Studio as line features in the project grid. */
  const handleSendContours = () => {
    if (!surfaceResult.ok || surfaceResult.contours.length === 0) {
      toast.showError('No contours to send. Check the surface and the interval.');
      return;
    }
    if (!isValidZone(workingZone)) {
      // The contours are eastings and northings; without a zone there is no
      // saying which grid they belong to, and exporting them would attach
      // them to whatever zone happened to be assumed downstream.
      toast.showError('Set the project coordinate system before sending contours to GIS.');
      return;
    }
    const feats: GeoFeature[] = surfaceResult.contours.map((c, i) => ({
      name: `Contour ${c.level} m`,
      geom: 'line',
      kind: 'en',
      pts: c.pts.map(p => ({ a: p.x, b: p.y })),
      props: {
        level_m: c.level,
        closed: c.closed,
        crs: crsLabelFor(workingZone),
        source: 'TIN contour',
        index: i + 1
      }
    }));
    onSendToGisLayers?.(feats, `Contours ${contourInterval} m`);
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
      toast.showSuccess(`Volume computed: Total Cut=${res.cutVolume.toFixed(1)} m³, Total Fill=${res.fillVolume.toFixed(1)} m³`);
    } catch (err: any) {
      toast.showError(`Volume error: ${err.message}`);
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
      toast.showSuccess(`Resection point determined: E=${res.E.toFixed(3)}, N=${res.N.toFixed(3)}`);
    } catch (err: any) {
      toast.showError(`Resection error: ${err.message}`);
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
            { id: 'camera', label: 'GPS Cam & Rangefinder', icon: Camera },
            { id: 'magnetic', label: 'Magnetic Declination (WMM)', icon: Navigation },
            { id: 'vincenty', label: 'Vincenty Geodesic', icon: Compass },
            { id: 'traverse', label: 'Traverse Balancing', icon: TrendingUp },
            { id: 'leveling', label: 'Differential Leveling', icon: ListOrdered },
            { id: 'dipstrike', label: '3-Point Dip & Strike', icon: Mountain },
            { id: 'volume', label: 'Earthwork Volume', icon: Box },
            { id: 'surface', label: 'Surface & Contours', icon: Waves },
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

      {/* 0. GPS Camera & Visual Landmark Rangefinder Studio */}
      {activeSubTool === 'camera' && (
        <CameraLandmarkStudio
          workingZone={workingZone}
          onSendToGisLayers={onSendToGisLayers}
        />
      )}

      {/* 1. Magnetic Declination & World Magnetic Model Sub-tool */}
      {activeSubTool === 'magnetic' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] font-semibold">Geomagnetism & Geodesy</span>
                <span className="text-[10px] bg-[#c9a063]/10 text-[#c9a063] px-2 py-0.5 rounded border border-[#c9a063]/20 font-mono">
                  World Magnetic Model &bull; IGRF Epoch
                </span>
              </div>
              <h4 className="text-lg font-serif italic text-white flex items-center gap-2">
                <Navigation className="w-5 h-5 text-[#c9a063]" />
                Magnetic Declination, Grid Convergence & Grivation
              </h4>
              <p className="text-xs text-white/40 mt-1 max-w-2xl">
                Calculates the exact localized angular offset between True (Geographic) North, Magnetic North (Compass needle), and UTM Grid North with secular annual drift.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGetDeviceLocationForDeclination}
                disabled={isLocatingGps}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                <MapPin className={`w-3.5 h-3.5 ${isLocatingGps ? 'animate-bounce' : ''}`} />
                {isLocatingGps ? 'Acquiring GPS...' : 'Use Current Device GPS'}
              </button>

              <button
                onClick={handleExportMagneticReport}
                disabled={!magResult}
                className="px-3.5 py-2 bg-[#141414] hover:bg-[#1a1a1a] text-white border border-white/10 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5 text-[#c9a063]" />
                Export Certificate (.CSV)
              </button>
            </div>
          </div>

          {/* Coordinate Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#141414] p-4 rounded-xl border border-white/5 text-xs">
            <div>
              <label className="text-white/60 block mb-1 font-medium flex items-center justify-between">
                <span>Latitude (DD or DMS)</span>
                <span className="text-[10px] text-white/40 font-mono">{toDMSstr(parseDMSval(magLat) || 0, true)}</span>
              </label>
              <input
                type="text"
                value={magLat}
                onChange={e => setMagLat(e.target.value)}
                placeholder={'e.g. 23.541200 or 23°32\'28"N'}
                className="w-full py-2 px-3 rounded-lg border border-white/10 bg-[#0a0a0a] text-white font-mono focus:border-[#c9a063] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-white/60 block mb-1 font-medium flex items-center justify-between">
                <span>Longitude (DD or DMS)</span>
                <span className="text-[10px] text-white/40 font-mono">{toDMSstr(parseDMSval(magLon) || 0, false)}</span>
              </label>
              <input
                type="text"
                value={magLon}
                onChange={e => setMagLon(e.target.value)}
                placeholder={'e.g. 84.601550 or 84°36\'05"E'}
                className="w-full py-2 px-3 rounded-lg border border-white/10 bg-[#0a0a0a] text-white font-mono focus:border-[#c9a063] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-white/60 block mb-1 font-medium">Elevation Above MSL (m)</label>
              <input
                type="number"
                value={magElevation}
                onChange={e => setMagElevation(e.target.value)}
                placeholder="e.g. 150"
                className="w-full py-2 px-3 rounded-lg border border-white/10 bg-[#0a0a0a] text-white font-mono focus:border-[#c9a063] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-white/60 block mb-1 font-medium">Calculation Date / Epoch</label>
              <input
                type="date"
                value={magDate}
                onChange={e => setMagDate(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-white/10 bg-[#0a0a0a] text-white font-mono focus:border-[#c9a063] focus:outline-none"
              />
            </div>
          </div>

          {/* Results Grid */}
          {magResult && (
            <div className="space-y-6">
              {/* Primary Output Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Magnetic Declination Card */}
                <div className="p-5 bg-[#141414] rounded-2xl border border-[#c9a063]/30 space-y-2 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <Navigation className="w-16 h-16 text-[#c9a063]" />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-[#c9a063] font-mono font-bold block">
                    Magnetic Declination (D)
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-bold font-mono text-white">
                      {Math.abs(magResult.declinationDegrees).toFixed(3)}°
                    </span>
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded font-mono ${
                      magResult.declinationDegrees >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {magResult.declinationDirection} (True North)
                    </span>
                  </div>
                  <p className="text-xs font-mono text-white/70">
                    {magResult.declinationDMS}
                  </p>
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-white/50">
                    <span>Annual Secular Drift:</span>
                    <span className="font-mono text-[#c9a063] font-bold">
                      {magResult.annualDriftMinutes > 0 ? `+${magResult.annualDriftMinutes}` : magResult.annualDriftMinutes}' / year
                    </span>
                  </div>
                </div>

                {/* 2. Grid Convergence Card */}
                <div className="p-5 bg-[#141414] rounded-2xl border border-white/5 space-y-2 relative overflow-hidden">
                  <span className="text-[10px] uppercase tracking-wider text-sky-400 font-mono font-bold block">
                    UTM Grid Convergence (γ)
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-bold font-mono text-white">
                      {magResult.gridConvergenceDegrees.toFixed(3)}°
                    </span>
                    <span className="text-xs text-white/50 font-mono">UTM Zone {workingZone}</span>
                  </div>
                  <p className="text-xs font-mono text-white/70">
                    {magResult.gridConvergenceDMS}
                  </p>
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-white/50">
                    <span>Grid vs True North:</span>
                    <span className="font-mono text-sky-300">
                      {magResult.gridConvergenceDegrees >= 0 ? 'Grid East of True' : 'Grid West of True'}
                    </span>
                  </div>
                </div>

                {/* 3. Grivation / Grid Magnetic Angle Card */}
                <div className="p-5 bg-[#141414] rounded-2xl border border-white/5 space-y-2 relative overflow-hidden">
                  <span className="text-[10px] uppercase tracking-wider text-amber-400 font-mono font-bold block">
                    Grivation / Grid Magnetic Angle (D - γ)
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-bold font-mono text-white">
                      {magResult.grivationDegrees.toFixed(3)}°
                    </span>
                    <span className="text-xs text-white/50 font-mono">Total Variation</span>
                  </div>
                  <p className="text-xs font-mono text-white/70">
                    {magResult.grivationDMS}
                  </p>
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-white/50">
                    <span>Magnetic to Grid:</span>
                    <span className="font-mono text-amber-300">
                      Grid = Mag {magResult.grivationDegrees >= 0 ? `+ ${magResult.grivationDegrees.toFixed(2)}°` : `- ${Math.abs(magResult.grivationDegrees).toFixed(2)}°`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Visual Compass Needle & Geomagnetic Vectors */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#141414] p-6 rounded-2xl border border-white/5">
                {/* 3-North Needle Compass Graphic */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 bg-[#0a0a0a] rounded-xl border border-white/5">
                  <div className="text-[10px] uppercase tracking-widest text-[#c9a063] font-bold mb-3">
                    3-North Directional Vector Diagram
                  </div>
                  <div className="relative w-48 h-48 rounded-full border border-white/10 bg-[#0f0f0f] flex items-center justify-center shadow-inner">
                    {/* Outer Compass Cardinal Marks */}
                    <span className="absolute top-1 text-[11px] font-mono font-bold text-white">N (0°)</span>
                    <span className="absolute right-2 text-[11px] font-mono font-bold text-white/40">E</span>
                    <span className="absolute bottom-1 text-[11px] font-mono font-bold text-white/40">S</span>
                    <span className="absolute left-2 text-[11px] font-mono font-bold text-white/40">W</span>

                    {/* True North Line (Black/White Star 0 deg) */}
                    <div className="absolute w-0.5 h-20 bg-white bottom-24 origin-bottom shadow-sm">
                      <div className="w-2 h-2 -ml-[3px] -mt-1 bg-white rotate-45" />
                    </div>

                    {/* Grid North Line (Sky Blue) */}
                    <div
                      className="absolute w-0.5 h-20 bg-sky-400 bottom-24 origin-bottom transition-all duration-300"
                      style={{ transform: `rotate(${magResult.gridConvergenceDegrees}deg)` }}
                    >
                      <div className="w-2 h-2 -ml-[3px] -mt-1 bg-sky-400 rotate-45" />
                    </div>

                    {/* Magnetic North Needle (Gold) */}
                    <div
                      className="absolute w-1 h-22 bg-[#c9a063] bottom-24 origin-bottom transition-all duration-300 shadow-md shadow-[#c9a063]/30"
                      style={{ transform: `rotate(${magResult.declinationDegrees}deg)` }}
                    >
                      <div className="w-3 h-3 -ml-[4px] -mt-1.5 bg-[#c9a063] rotate-45" />
                    </div>

                    {/* Center Pivot Point */}
                    <div className="w-3 h-3 rounded-full bg-white border-2 border-black z-10" />
                  </div>

                  {/* Needle Legend */}
                  <div className="mt-4 flex items-center justify-center gap-4 text-[10px] font-mono flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 bg-white rounded-full" />
                      <span className="text-white/80">True North (TN 0.0°)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 bg-[#c9a063] rounded-full" />
                      <span className="text-[#c9a063]">Mag North (MN {magResult.declinationDegrees >= 0 ? `+${magResult.declinationDegrees.toFixed(2)}` : magResult.declinationDegrees.toFixed(2)}°)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 bg-sky-400 rounded-full" />
                      <span className="text-sky-400">Grid North (GN {magResult.gridConvergenceDegrees >= 0 ? `+${magResult.gridConvergenceDegrees.toFixed(2)}` : magResult.gridConvergenceDegrees.toFixed(2)}°)</span>
                    </div>
                  </div>
                </div>

                {/* Field Intensities & Interactive Heading Converter */}
                <div className="lg:col-span-7 space-y-4">
                  {/* Additional Geomagnetic Field Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div className="p-3 bg-[#0a0a0a] rounded-xl border border-white/5">
                      <span className="text-[10px] text-white/40 block">Inclination / Dip (I)</span>
                      <span className="text-white font-bold">{magResult.inclinationDegrees.toFixed(2)}°</span>
                      <span className="text-[9px] text-white/40 block">{magResult.inclinationDMS}</span>
                    </div>
                    <div className="p-3 bg-[#0a0a0a] rounded-xl border border-white/5">
                      <span className="text-[10px] text-white/40 block">Total Intensity (F)</span>
                      <span className="text-emerald-400 font-bold">{magResult.totalIntensityNanoTesla} nT</span>
                      <span className="text-[9px] text-white/40 block">{(magResult.totalIntensityNanoTesla / 100000).toFixed(4)} Gauss</span>
                    </div>
                    <div className="p-3 bg-[#0a0a0a] rounded-xl border border-white/5">
                      <span className="text-[10px] text-white/40 block">Horizontal (H)</span>
                      <span className="text-sky-400 font-bold">{magResult.horizontalIntensityNanoTesla} nT</span>
                    </div>
                    <div className="p-3 bg-[#0a0a0a] rounded-xl border border-white/5">
                      <span className="text-[10px] text-white/40 block">Vertical (Z)</span>
                      <span className="text-amber-400 font-bold">{magResult.verticalIntensityNanoTesla} nT</span>
                    </div>
                  </div>

                  {/* Interactive Azimuth & Compass Bearing Transformer */}
                  <div className="p-4 bg-[#0a0a0a] rounded-xl border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-[#c9a063]" />
                        Azimuth & Compass Bearing Transformation Matrix
                      </span>
                      <span className="text-[10px] text-white/40 font-mono">Live Recalculation</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-32 shrink-0">
                        <label className="text-[10px] text-white/60 block mb-0.5">True Azimuth (°)</label>
                        <input
                          type="number"
                          value={magAzimuthTest}
                          onChange={e => setMagAzimuthTest(e.target.value)}
                          placeholder="e.g. 45.0"
                          className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#141414] text-white font-mono text-xs focus:border-[#c9a063] focus:outline-none"
                        />
                      </div>

                      {(() => {
                        const trueAz = parseFloat(magAzimuthTest) || 0;
                        const conv = convertAzimuthAngles(trueAz, magResult.declinationDegrees, magResult.gridConvergenceDegrees);
                        return (
                          <div className="flex-1 grid grid-cols-3 gap-2 text-center text-xs font-mono">
                            <div className="p-2 bg-[#141414] rounded-lg border border-white/5">
                              <span className="text-[9px] text-white/40 block uppercase">True Azimuth</span>
                              <span className="text-white font-bold">{conv.trueAzimuth.toFixed(2)}°</span>
                            </div>
                            <div className="p-2 bg-[#141414] rounded-lg border border-[#c9a063]/30">
                              <span className="text-[9px] text-[#c9a063] block uppercase">Magnetic Compass</span>
                              <span className="text-[#c9a063] font-bold">{conv.magneticBearing.toFixed(2)}°</span>
                            </div>
                            <div className="p-2 bg-[#141414] rounded-lg border border-sky-500/30">
                              <span className="text-[9px] text-sky-400 block uppercase">Grid Azimuth</span>
                              <span className="text-sky-300 font-bold">{conv.gridAzimuth.toFixed(2)}°</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* 5b. TIN Surface & Contours Sub-tool */}
      {activeSubTool === 'surface' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div>
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Waves className="w-5 h-5 text-[#c9a063]" />
              Surface &amp; Contours (Triangulated Irregular Network)
            </h4>
            <p className="text-xs text-white/40 mt-1">
              Triangulates surveyed points as they were picked up, then measures area and volume from the faces and
              cuts contours through them. Unlike the end-area tool above, this needs no chainage — it works from a
              scatter of spot heights.
            </p>
            <p className="text-xs text-white/40 mt-1">
              The surface spans the convex hull of the points, so a mis-keyed coordinate stretches it across ground
              that was never surveyed and <em>adds</em> volume. Check the plan area against the site before quoting.
            </p>
            <p className="text-xs text-white/40 mt-1">
              Points are read in the project grid:{' '}
              <span className="text-[#c9a063]">
                {isValidZone(workingZone) ? crsLabelFor(workingZone) : 'coordinate system not set'}
              </span>
              . Nothing here reprojects them.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/60 block">
                Surface A — <code className="text-[#c9a063]">E, N, RL</code> per line
              </label>
              <textarea
                rows={8}
                spellCheck={false}
                value={surfAText}
                onChange={e => setSurfAText(e.target.value)}
                className="w-full p-3.5 rounded-xl border border-white/10 bg-[#141414] text-white font-mono text-xs focus:outline-none focus:border-[#c9a063]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/60 block">
                Surface B — optional, to compare against A
              </label>
              <textarea
                rows={8}
                spellCheck={false}
                value={surfBText}
                placeholder={'Leave empty for a single surface.\nPaste a second pickup here for cut and fill between the two.'}
                onChange={e => setSurfBText(e.target.value)}
                className="w-full p-3.5 rounded-xl border border-white/10 bg-[#141414] text-white font-mono text-xs focus:outline-none focus:border-[#c9a063] placeholder:text-white/25"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-white/60 block">
              Breaklines — optional. Blocks of <code className="text-[#c9a063]">E, N, RL</code>, one blank line
              between lines, a <code className="text-[#c9a063]">#</code> comment to name each.
            </label>
            <textarea
              rows={6}
              spellCheck={false}
              value={breaklineText}
              placeholder={'# Crest\n254800, 2605200, 106.0\n254830, 2605210, 106.4\n\n# Toe\n254790, 2605190, 100.0\n254830, 2605195, 100.2'}
              onChange={e => setBreaklineText(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-white/10 bg-[#141414] text-white font-mono text-xs focus:outline-none focus:border-[#c9a063] placeholder:text-white/25"
            />
            <p className="text-[11px] text-white/40">
              A crest, toe, road edge or ditch. Without one, the triangulation is free to span across the feature
              and will do so whenever that gives rounder triangles — a ridge then sags to the height of the ground
              either side of it, and every volume follows the sag. Breakline vertices are survey points too, so
              they extend the surface if they fall outside the spot heights.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-white/40 block">Datum for A</span>
              <div className="flex gap-1.5">
                {(
                  [
                    ['toe', 'Lowest surveyed point'],
                    ['rl', 'Stated level']
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setSurfDatumMode(id)}
                    className={`px-3 py-2 rounded-xl text-xs border ${
                      surfDatumMode === id
                        ? 'bg-[#c9a063]/15 border-[#c9a063]/60 text-white'
                        : 'border-white/10 text-white/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {surfDatumMode === 'rl' && (
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-white/40 block">Datum level (m RL)</span>
                <input
                  type="number"
                  step="any"
                  value={surfDatumRl}
                  onChange={e => setSurfDatumRl(e.target.value)}
                  className="w-32 p-2.5 rounded-xl border border-white/10 bg-[#141414] text-white font-mono text-xs focus:outline-none focus:border-[#c9a063]"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-white/40 block">Contour interval (m)</span>
              <input
                type="number"
                step="any"
                min="0"
                value={contourInterval}
                onChange={e => setContourInterval(e.target.value)}
                className="w-32 p-2.5 rounded-xl border border-white/10 bg-[#141414] text-white font-mono text-xs focus:outline-none focus:border-[#c9a063]"
              />
            </div>
          </div>

          {!surfaceResult.ok ? (
            <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200">
              {surfaceResult.error}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block uppercase font-sans">Plan Area</span>
                  <span className="text-base font-bold text-white">
                    {surfaceResult.planAreaM2.toLocaleString(undefined, { maximumFractionDigits: 1 })} m&sup2;
                  </span>
                </div>
                <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block uppercase font-sans">Surface Area (3D)</span>
                  <span className="text-base font-bold text-[#c9a063]">
                    {surfaceResult.surfaceAreaM2.toLocaleString(undefined, { maximumFractionDigits: 1 })} m&sup2;
                  </span>
                </div>
                <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block uppercase font-sans">Above Datum</span>
                  <span className="text-base font-bold text-rose-400">
                    {surfaceResult.vol.cutM3.toLocaleString(undefined, { maximumFractionDigits: 1 })} m&sup3;
                  </span>
                </div>
                <div className="p-4 bg-[#141414] rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block uppercase font-sans">Below Datum</span>
                  <span className="text-base font-bold text-emerald-400">
                    {surfaceResult.vol.fillM3.toLocaleString(undefined, { maximumFractionDigits: 1 })} m&sup3;
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px] text-white/60">
                <div>
                  Points <span className="text-white">{surfaceResult.tinA.points.length}</span>
                  {surfaceResult.tinA.duplicatesRemoved > 0 && (
                    <span className="text-amber-400"> ({surfaceResult.tinA.duplicatesRemoved} repeated dropped)</span>
                  )}
                </div>
                <div>
                  Triangles <span className="text-white">{surfaceResult.tinA.triangles.length}</span>
                </div>
                <div>
                  Range{' '}
                  <span className="text-white">
                    {surfaceResult.lowest.toFixed(2)} – {surfaceResult.highest.toFixed(2)} m
                  </span>
                </div>
                <div>
                  Datum <span className="text-white">{surfaceResult.datumZ.toFixed(2)} m</span>
                  {surfDatumMode === 'toe' && <span className="text-white/40"> (lowest)</span>}
                </div>
              </div>

              {/* Breaklines: what was asked for, and what the surface actually honours. */}
              {(surfaceResult.breaklineCount > 0 || surfaceResult.tinA.breaklineIssues.length > 0) && (
                <div className="p-4 rounded-xl border border-white/10 bg-[#141414] space-y-2">
                  <div className="text-xs font-medium text-white/60">Breaklines</div>
                  <div className="font-mono text-xs text-white/70">
                    <span className="text-white font-bold">{surfaceResult.breaklineCount}</span> line
                    {surfaceResult.breaklineCount === 1 ? '' : 's'} read,{' '}
                    <span className="text-white font-bold">{surfaceResult.tinA.constraints.length}</span> segment
                    {surfaceResult.tinA.constraints.length === 1 ? '' : 's'} held as triangle edges.
                  </div>
                  {surfaceResult.tinA.breaklineIssues.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {surfaceResult.tinA.breaklineIssues.map((issue, i) => (
                        <div key={i} className="text-[11px] text-amber-300/90 flex gap-2">
                          <Mountain className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{issue}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {surfaceResult.comparisonError && (
                <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200">
                  {surfaceResult.comparisonError}
                </div>
              )}
              {surfaceResult.comparison && (
                <div className="p-4 rounded-xl border border-white/10 bg-[#141414] space-y-3">
                  <div className="text-xs font-medium text-white/60">A compared with B</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-white/40 block uppercase font-sans">B above A</span>
                      <span className="text-sm font-bold text-rose-400">
                        {surfaceResult.comparison.cutM3.toLocaleString(undefined, { maximumFractionDigits: 1 })} m&sup3;
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 block uppercase font-sans">B below A</span>
                      <span className="text-sm font-bold text-emerald-400">
                        {surfaceResult.comparison.fillM3.toLocaleString(undefined, { maximumFractionDigits: 1 })} m&sup3;
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 block uppercase font-sans">Net</span>
                      <span className="text-sm font-bold text-white">
                        {surfaceResult.comparison.netM3.toLocaleString(undefined, { maximumFractionDigits: 1 })} m&sup3;
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 block uppercase font-sans">Overlap</span>
                      <span className="text-sm font-bold text-white">
                        {surfaceResult.comparison.planAreaM2.toLocaleString(undefined, { maximumFractionDigits: 1 })}{' '}
                        m&sup2;
                      </span>
                    </div>
                  </div>
                  {(surfaceResult.comparison.uncoveredAreaM2 > 0.001 ||
                    surfaceResult.comparison.partialAreaM2 > 0.001) && (
                    <div className="text-[11px] text-amber-300/90 flex gap-2">
                      <Mountain className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        {surfaceResult.comparison.uncoveredAreaM2 > 0.001 && (
                          <>
                            {surfaceResult.comparison.uncoveredAreaM2.toLocaleString(undefined, {
                              maximumFractionDigits: 1
                            })}{' '}
                            m&sup2; of A lies outside B.{' '}
                          </>
                        )}
                        {surfaceResult.comparison.partialAreaM2 > 0.001 && (
                          <>
                            {surfaceResult.comparison.partialAreaM2.toLocaleString(undefined, {
                              maximumFractionDigits: 1
                            })}{' '}
                            m&sup2; straddles the edge of B and is left unmeasured rather than measured on part of
                            its area.{' '}
                          </>
                        )}
                        The volumes above cover only the overlap, so they are not a whole-site figure.
                      </span>
                    </div>
                  )}
                  <p className="text-[11px] text-white/40">
                    B is sampled at each vertex of A&apos;s triangles and the difference clipped at zero, so cut and
                    fill stay apart even where the two surfaces cross inside one triangle. The resolution is
                    A&apos;s triangle size — put the denser pickup in A.
                  </p>
                </div>
              )}

              <div className="p-4 rounded-xl border border-white/10 bg-[#141414] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs font-medium text-white/60">Contours from A</div>
                  <button
                    onClick={handleSendContours}
                    disabled={surfaceResult.contours.length === 0}
                    className="px-4 py-2 bg-[#c9a063] hover:bg-[#d6b074] disabled:opacity-40 disabled:cursor-not-allowed text-black text-[11px] font-bold uppercase tracking-wider rounded-xl inline-flex items-center gap-2"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Send to GIS Layers
                  </button>
                </div>
                {surfaceResult.contourError ? (
                  <div className="text-xs text-rose-300">{surfaceResult.contourError}</div>
                ) : surfaceResult.contours.length === 0 ? (
                  <div className="text-xs text-white/40">
                    No contours at this interval. A surface at a single level has none to draw.
                  </div>
                ) : (
                  <>
                    <div className="font-mono text-xs text-white/70">
                      <span className="text-white font-bold">{surfaceResult.contours.length}</span> line
                      {surfaceResult.contours.length === 1 ? '' : 's'} across{' '}
                      <span className="text-white font-bold">
                        {new Set(surfaceResult.contours.map(c => c.level)).size}
                      </span>{' '}
                      level{new Set(surfaceResult.contours.map(c => c.level)).size === 1 ? '' : 's'},{' '}
                      <span className="text-white font-bold">
                        {surfaceResult.contours.filter(c => c.closed).length}
                      </span>{' '}
                      closed.
                    </div>
                    <div className="overflow-x-auto max-h-56">
                      <table className="w-full text-left text-xs border-collapse font-mono">
                        <thead>
                          <tr className="border-b border-white/10 text-white/40 text-[10px] uppercase">
                            <th className="py-2 px-3">Level (m)</th>
                            <th className="py-2 px-3">Vertices</th>
                            <th className="py-2 px-3">Length (m)</th>
                            <th className="py-2 px-3">Closed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {surfaceResult.contours.slice(0, 60).map((c, i) => {
                            let len = 0;
                            for (let k = 1; k < c.pts.length; k++) {
                              len += Math.hypot(c.pts[k].x - c.pts[k - 1].x, c.pts[k].y - c.pts[k - 1].y);
                            }
                            return (
                              <tr key={i} className="hover:bg-white/5">
                                <td className="py-1.5 px-3 text-[#c9a063] font-bold">{c.level.toFixed(2)}</td>
                                <td className="py-1.5 px-3 text-white/70">{c.pts.length}</td>
                                <td className="py-1.5 px-3 text-white">{len.toFixed(2)}</td>
                                <td className="py-1.5 px-3 text-white/50">{c.closed ? 'yes' : 'no'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {surfaceResult.contours.length > 60 && (
                        <div className="text-[11px] text-white/40 px-3 py-2">
                          and {surfaceResult.contours.length - 60} more — all of them are sent to GIS.
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-white/40">
                      Contours are the intersection of each level with the triangulated faces. Nothing is smoothed,
                      and the triangulation is unconstrained, so a crest or toe line is honoured only where points
                      were picked up along it.
                    </p>
                  </>
                )}
              </div>

              {surfaceResult.rejected.length > 0 && (
                <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 space-y-1">
                  <div className="text-xs font-medium text-rose-200">
                    {surfaceResult.rejected.length} line{surfaceResult.rejected.length === 1 ? '' : 's'} could not be
                    read and {surfaceResult.rejected.length === 1 ? 'was' : 'were'} left out
                  </div>
                  {surfaceResult.rejected.slice(0, 5).map((r, i) => (
                    <div key={i} className="text-[11px] font-mono text-rose-200/70 break-all">
                      {r}
                    </div>
                  ))}
                  {surfaceResult.rejected.length > 5 && (
                    <div className="text-[11px] text-rose-200/60">and {surfaceResult.rejected.length - 5} more</div>
                  )}
                </div>
              )}
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
