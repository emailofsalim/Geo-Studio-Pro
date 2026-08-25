import React, { useState, useEffect, useRef } from 'react';
import {
  Compass,
  Play,
  Pause,
  Square,
  MapPin,
  Target,
  Navigation,
  Download,
  Trash2,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  RotateCw,
  Plus
} from 'lucide-react';
import { SurveyWaypoint, SurveyTrack, TrackPoint } from '../types';
import { lonLatToUtm, utmToLonLat, mgrsFromLonLat, toDMSstr, getIndianZone, indianGridFwd } from '../lib/geodesy';
import { downloadBlob } from '../lib/zip';
import { toCSVtext, csvEnc, dxfBuild } from '../lib/formats';

interface GpsSurveyorTabProps {
  workingZone: string;
  onSendToCalculator?: (csv: string) => void;
  onSendToOffset?: (pts: { lon: number; lat: number }[]) => void;
}

export const GpsSurveyorTab: React.FC<GpsSurveyorTabProps> = ({
  workingZone,
  onSendToCalculator,
  onSendToOffset
}) => {
  // GPS Cockpit State
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentPos, setCurrentPos] = useState<any | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [compassMode, setCompassMode] = useState<'north' | 'heading'>('north');

  // Multi-Sample Averaging State
  const [isAveraging, setIsAveraging] = useState(false);
  const [avgSamples, setAvgSamples] = useState<{ E: number; N: number; Z: number; lat: number; lon: number; acc: number }[]>([]);
  const [avgProgress, setAvgProgress] = useState(0);
  const [avgResult, setAvgResult] = useState<any | null>(null);

  // Radar Canvas State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [radarZoom, setRadarZoom] = useState(30); // metres from centre to perimeter

  // Waypoint Collector State
  const [waypoints, setWaypoints] = useState<SurveyWaypoint[]>(() => {
    try {
      const s = localStorage.getItem('gs_waypoints_v2');
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });
  const [wpId, setWpId] = useState('WP-001');
  const [wpCode, setWpCode] = useState('Boundary Pillar');
  const [wpElev, setWpElev] = useState('');
  const [wpRemarks, setWpRemarks] = useState('');
  const [wpSearch, setWpSearch] = useState('');

  // Track Logger State
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [trackName, setTrackName] = useState('Traverse-01');
  const [trackInterval, setTrackInterval] = useState('5');
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);

  // Field Stakeout State
  const [isStakeoutActive, setIsStakeoutActive] = useState(false);
  const [stakeTarget, setStakeTarget] = useState<string>('manual');
  const [stakeE, setStakeE] = useState('254820');
  const [stakeN, setStakeN] = useState('2605240');
  const [stakeoutMetrics, setStakeoutMetrics] = useState<any | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const trackTimerRef = useRef<any>(null);

  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  // Save waypoints to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('gs_waypoints_v2', JSON.stringify(waypoints));
    } catch {}
  }, [waypoints]);

  // Compass listener
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if ((e as any).webkitCompassHeading != null) {
        setDeviceHeading((e as any).webkitCompassHeading);
      } else if (e.alpha != null) {
        setDeviceHeading((360 - e.alpha) % 360);
      }
    };
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, []);

  // GNSS Fix Calculation
  const processFix = (pos: GeolocationPosition) => {
    const c = pos.coords;
    const lat = c.latitude, lon = c.longitude, acc = c.accuracy;
    const alt = c.altitude, altAcc = c.altitudeAccuracy;
    const speed = c.speed, heading = c.heading;
    const u = lonLatToUtm(lon, lat, zNum, isSouth);
    const mgrs = mgrsFromLonLat(lon, lat, zNum, isSouth);

    // Indian Grid
    let indianTxt = '-';
    try {
      const z = getIndianZone(24379);
      if (z) {
        const g = indianGridFwd(lon, lat, z);
        indianTxt = `E ${g.E.toFixed(2)} N ${g.N.toFixed(2)}`;
      }
    } catch {}

    const data = {
      lat, lon, acc, alt, altAcc, speed, heading, time: pos.timestamp,
      utm: { E: u.E, N: u.N, zl: workingZone },
      mgrs,
      indian: indianTxt
    };

    setCurrentPos(data);
    setGpsError(null);

    // Process Averaging
    if (isAveraging && avgSamples.length < 10) {
      setAvgSamples(prev => {
        const updated = [...prev, { E: u.E, N: u.N, Z: alt || 0, lat, lon, acc }];
        setAvgProgress(Math.min(100, Math.round((updated.length / 10) * 100)));
        if (updated.length === 10) {
          // Centroid
          const sumE = updated.reduce((s, x) => s + x.E, 0) / 10;
          const sumN = updated.reduce((s, x) => s + x.N, 0) / 10;
          const sumZ = updated.reduce((s, x) => s + x.Z, 0) / 10;
          const sqE = updated.reduce((s, x) => s + Math.pow(x.E - sumE, 2), 0);
          const sqN = updated.reduce((s, x) => s + Math.pow(x.N - sumN, 2), 0);
          const sd2D = Math.sqrt((sqE + sqN) / 9);
          setAvgResult({ E: sumE, N: sumN, Z: sumZ, sd2D, count: 10 });
          if (navigator.vibrate) try { navigator.vibrate([120, 60, 120]); } catch {}
        }
        return updated;
      });
    }

    // Process Track logging
    if (isTracking && !isPaused) {
      setTrackPoints(prev => {
        if (prev.length > 0) {
          const last = prev[prev.length - 1];
          const distStep = Math.hypot(u.E - last.E, u.N - last.N);
          if (trackInterval.startsWith('dist')) {
            const thresh = parseFloat(trackInterval.replace('dist', '')) || 3.0;
            if (distStep < thresh) return prev;
          }
          setTotalDistance(d => d + distStep);
        }
        const spdKm = (speed || 0) * 3.6;
        if (spdKm > maxSpeed) setMaxSpeed(spdKm);
        return [...prev, { E: u.E, N: u.N, Z: alt || 0, lat, lon, speed: speed || 0, time: pos.timestamp }];
      });
    }

    // Process Stakeout Guidance
    if (isStakeoutActive) {
      let targetE = parseFloat(stakeE) || 0;
      let targetN = parseFloat(stakeN) || 0;
      let targetName = 'Custom Coordinate';

      if (stakeTarget.startsWith('wp_')) {
        const idx = parseInt(stakeTarget.replace('wp_', ''), 10);
        const wp = waypoints[idx];
        if (wp) {
          targetE = wp.E;
          targetN = wp.N;
          targetName = `${wp.id} (${wp.code})`;
        }
      }

      const dE = targetE - u.E;
      const dN = targetN - u.N;
      const dist = Math.hypot(dE, dN);
      const bearing = (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360;
      const hdg = (heading != null && !isNaN(heading)) ? heading : (deviceHeading || 0);
      const turn = ((bearing - hdg + 540) % 360) - 180;

      setStakeoutMetrics({
        targetName,
        dist,
        bearing,
        turn,
        dE,
        dN
      });

      // Bullseye arrival vibration
      if (dist <= 1.0 && navigator.vibrate) {
        try { navigator.vibrate([150, 80, 150]); } catch {}
      }
    }
  };

  const handleError = (err: GeolocationPositionError) => {
    setGpsError(err.message || 'Position unavailable');
  };

  const getSingleFix = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(processFix, handleError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  };

  const toggleStream = () => {
    if (isStreaming) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsStreaming(false);
    } else {
      if (!navigator.geolocation) {
        setGpsError('Geolocation is not supported by your browser.');
        return;
      }
      watchIdRef.current = navigator.geolocation.watchPosition(processFix, handleError, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      });
      setIsStreaming(true);
    }
  };

  // Track Timer
  useEffect(() => {
    if (isTracking && !isPaused) {
      trackTimerRef.current = setInterval(() => {
        setElapsedSec(s => s + 1);
      }, 1000);
    } else {
      if (trackTimerRef.current) clearInterval(trackTimerRef.current);
    }
    return () => {
      if (trackTimerRef.current) clearInterval(trackTimerRef.current);
    };
  }, [isTracking, isPaused]);

  // Render Radar Canvas
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cv.width, cv.height);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, cv.width, cv.height);

    const cx = cv.width / 2;
    const cy = cv.height / 2;
    const rMax = Math.min(cx, cy) - 20;
    const scale = rMax / radarZoom;

    const centerE = currentPos ? currentPos.utm.E : 254800;
    const centerN = currentPos ? currentPos.utm.N : 2605200;

    let rot = 0;
    if (compassMode === 'heading') {
      rot = -((currentPos?.heading || deviceHeading || 0) * Math.PI) / 180;
    }

    const toScreen = (E: number, N: number) => {
      const dE = E - centerE;
      const dN = N - centerN;
      const rx = dE * Math.cos(rot) - dN * Math.sin(rot);
      const ry = dE * Math.sin(rot) + dN * Math.cos(rot);
      return { x: cx + rx * scale, y: cy - ry * scale };
    };

    // Range Rings
    [radarZoom * 0.33, radarZoom * 0.66, radarZoom].forEach(dist => {
      const r = dist * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.font = '10px Consolas, monospace';
      ctx.fillText(`${Math.round(dist)}m`, cx + 4, cy - r + 11);
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx, cy - rMax); ctx.lineTo(cx, cy + rMax);
    ctx.moveTo(cx - rMax, cy); ctx.lineTo(cx + rMax, cy);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.stroke();

    // North Indicator
    const nAngle = 0 + rot;
    const nx = cx + Math.sin(nAngle) * (rMax + 4);
    const ny = cy - Math.cos(nAngle) * (rMax + 4);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', nx, ny);

    // Track Polyline
    if (trackPoints.length > 1) {
      ctx.beginPath();
      const p0 = toScreen(trackPoints[0].E, trackPoints[0].N);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < trackPoints.length; i++) {
        const pt = toScreen(trackPoints[i].E, trackPoints[i].N);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Waypoints
    waypoints.forEach(w => {
      const p = toScreen(w.E, w.N);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ea580c';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(w.id, p.x, p.y - 8);
    });

    // Stakeout Target & Guide Vector
    if (isStakeoutActive && stakeoutMetrics && currentPos) {
      const tgtE = stakeTarget.startsWith('wp_')
        ? waypoints[parseInt(stakeTarget.replace('wp_', ''), 10)]?.E
        : parseFloat(stakeE);
      const tgtN = stakeTarget.startsWith('wp_')
        ? waypoints[parseInt(stakeTarget.replace('wp_', ''), 10)]?.N
        : parseFloat(stakeN);

      if (tgtE && tgtN) {
        const tSc = toScreen(tgtE, tgtN);
        const devSc = toScreen(currentPos.utm.E, currentPos.utm.N);

        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(devSc.x, devSc.y);
        ctx.lineTo(tSc.x, tSc.y);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Target marker
        ctx.beginPath();
        ctx.arc(tSc.x, tSc.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Current Device Fix
    if (currentPos) {
      const dSc = toScreen(currentPos.utm.E, currentPos.utm.N);
      const accPx = currentPos.acc * scale;

      // Accuracy circle
      if (accPx > 2) {
        ctx.beginPath();
        ctx.arc(dSc.x, dSc.y, accPx, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(14, 124, 134, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(14, 124, 134, 0.6)';
        ctx.stroke();
      }

      // Center Dot
      ctx.beginPath();
      ctx.arc(dSc.x, dSc.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#0e7c86';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [currentPos, waypoints, trackPoints, radarZoom, compassMode, deviceHeading, isStakeoutActive, stakeoutMetrics, stakeE, stakeN, stakeTarget]);

  // Save Waypoint
  const handleSaveWaypoint = () => {
    if (!currentPos && !avgResult) {
      alert('Take a GPS fix or average first!');
      return;
    }
    const ptId = wpId.trim() || `WP-${String(waypoints.length + 1).padStart(3, '0')}`;
    const E = avgResult ? avgResult.E : currentPos.utm.E;
    const N = avgResult ? avgResult.N : currentPos.utm.N;
    const Z = parseFloat(wpElev) || (avgResult ? avgResult.Z : currentPos.alt) || 0;
    const lat = avgResult ? avgResult.lat : currentPos.lat;
    const lon = avgResult ? avgResult.lon : currentPos.lon;
    const acc = avgResult ? avgResult.sd2D : currentPos.acc;

    const newWp: SurveyWaypoint = {
      id: ptId,
      code: wpCode,
      E, N, Z,
      lat, lon,
      acc,
      zone: workingZone,
      time: Date.now(),
      remarks: wpRemarks.trim()
    };

    setWaypoints(prev => [...prev, newWp]);

    // Increment WP ID (e.g. WP-001 -> WP-002)
    const m = ptId.match(/^(.*?)(\d+)$/);
    if (m) {
      const nextNum = parseInt(m[2], 10) + 1;
      setWpId(`${m[1]}${String(nextNum).padStart(m[2].length, '0')}`);
    }
    setWpRemarks('');
    setAvgResult(null);
    setAvgSamples([]);
  };

  const handleStartAveraging = () => {
    setAvgSamples([]);
    setAvgProgress(0);
    setAvgResult(null);
    setIsAveraging(true);
    if (!isStreaming) toggleStream();
  };

  const handleExportCSV = () => {
    if (!waypoints.length) return;
    const cols = ['Point_ID', 'Feature_Code', 'Easting', 'Northing', 'Elevation_Z', 'Latitude', 'Longitude', 'Accuracy_m', 'Zone', 'Remarks'];
    const rows = waypoints.map(w => [w.id, w.code, w.E.toFixed(3), w.N.toFixed(3), w.Z.toFixed(2), w.lat.toFixed(7), w.lon.toFixed(7), w.acc.toFixed(1), w.zone, w.remarks || '']);
    downloadBlob(csvEnc(toCSVtext(cols, rows)), 'gps_survey_waypoints.csv', 'text/csv;charset=utf-8');
  };

  const handleExportDXF = () => {
    if (!waypoints.length) return;
    const feats = waypoints.map(w => ({
      name: `${w.id} (${w.code})`,
      geom: 'point' as const,
      kind: 'en' as const,
      pts: [{ a: w.E, b: w.N }],
      props: { layer: 'SURVEY_POINTS', Elevation: w.Z }
    }));
    const res = dxfBuild(feats, 'utm', zNum, isSouth, true);
    downloadBlob(new TextEncoder().encode(res.dxf), 'gps_survey_points.dxf', 'application/dxf');
  };

  return (
    <div className="space-y-6">
      {/* 1. Live GNSS Cockpit */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              1. Live GNSS Cockpit & Offline Radar
            </h3>
            <p className="text-xs text-slate-500">
              Direct access to your device satellite GNSS receiver with real-time vector compass radar and precision metrics.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={getSingleFix}
              className="px-3.5 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Get Fix
            </button>
            <button
              onClick={toggleStream}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                isStreaming
                  ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                  : 'bg-teal-600 hover:bg-teal-500 text-white'
              }`}
            >
              {isStreaming ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isStreaming ? 'Stop Stream' : 'Live Stream'}
            </button>
            <button
              onClick={handleStartAveraging}
              disabled={isAveraging}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Average 10 Epochs
            </button>
          </div>
        </div>

        {/* Status / Error Box */}
        {gpsError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 rounded-xl">
            {gpsError}
          </div>
        )}

        {/* Averaging Progress */}
        {isAveraging && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-300">
              <span>GNSS Averaging: Sample {avgSamples.length} / 10</span>
              <span>{avgProgress}%</span>
            </div>
            <div className="w-full bg-amber-200 dark:bg-amber-900 h-2 rounded-full overflow-hidden">
              <div className="bg-amber-600 h-full transition-all duration-200" style={{ width: `${avgProgress}%` }} />
            </div>
          </div>
        )}

        {/* Metric HUD Cards */}
        {currentPos && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">WGS84 Latitude</span>
              <span className="text-sm font-mono font-bold text-slate-800 dark:text-slate-100">{currentPos.lat.toFixed(7)}°</span>
              <span className="text-[10px] text-slate-500 block font-mono">{toDMSstr(currentPos.lat, true)}</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">WGS84 Longitude</span>
              <span className="text-sm font-mono font-bold text-slate-800 dark:text-slate-100">{currentPos.lon.toFixed(7)}°</span>
              <span className="text-[10px] text-slate-500 block font-mono">{toDMSstr(currentPos.lon, false)}</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">UTM Coordinates</span>
              <span className="text-sm font-mono font-bold text-slate-800 dark:text-slate-100">E {currentPos.utm.E.toFixed(2)}</span>
              <span className="text-sm font-mono font-bold text-slate-800 dark:text-slate-100 block">N {currentPos.utm.N.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Horizontal Accuracy</span>
              <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">±{currentPos.acc.toFixed(1)} m</span>
              <span className="text-[10px] text-slate-500 block">68% confidence</span>
            </div>
          </div>
        )}

        {/* Vector Radar Canvas */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-600 dark:text-slate-300">Vector Radar Screen</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCompassMode(compassMode === 'north' ? 'heading' : 'north')}
                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded font-semibold text-slate-700 dark:text-slate-300"
              >
                Orientation: {compassMode === 'north' ? 'North-Up' : 'Heading-Up'}
              </button>
              <button
                onClick={() => setRadarZoom(z => Math.max(10, z - 10))}
                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded font-bold"
              >
                Zoom +
              </button>
              <button
                onClick={() => setRadarZoom(z => Math.min(500, z + 20))}
                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded font-bold"
              >
                Zoom -
              </button>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border border-slate-700/60 shadow-inner">
            <canvas ref={canvasRef} width={720} height={320} className="w-full h-72 bg-slate-950 block" />
          </div>
        </div>
      </div>

      {/* 2. Waypoint Collector */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            2. Survey Waypoint Collector
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={handleExportDXF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <Download className="w-3.5 h-3.5" /> DXF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Point ID</label>
            <input
              type="text"
              value={wpId}
              onChange={e => setWpId(e.target.value)}
              className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Feature Code</label>
            <select
              value={wpCode}
              onChange={e => setWpCode(e.target.value)}
              className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium"
            >
              <option value="Boundary Pillar">Boundary Pillar</option>
              <option value="Borehole Collar">Borehole Collar</option>
              <option value="Bench Mark">Bench Mark (BM)</option>
              <option value="Control Station">Control Station</option>
              <option value="Corner Post">Corner Post</option>
              <option value="Spot Level">Spot Level</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Elevation Z (m)</label>
            <input
              type="text"
              value={wpElev}
              onChange={e => setWpElev(e.target.value)}
              placeholder="Auto MSL"
              className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
            />
          </div>
          <div>
            <button
              onClick={handleSaveWaypoint}
              className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-bold shadow-md transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Save Point
            </button>
          </div>
        </div>

        {/* Waypoints Table */}
        <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 font-semibold sticky top-0">
              <tr>
                <th className="p-2 border-b border-slate-200 dark:border-slate-700">Point ID</th>
                <th className="p-2 border-b border-slate-200 dark:border-slate-700">Code</th>
                <th className="p-2 border-b border-slate-200 dark:border-slate-700">Easting (m)</th>
                <th className="p-2 border-b border-slate-200 dark:border-slate-700">Northing (m)</th>
                <th className="p-2 border-b border-slate-200 dark:border-slate-700">Elev (m)</th>
                <th className="p-2 border-b border-slate-200 dark:border-slate-700">Accuracy</th>
                <th className="p-2 border-b border-slate-200 dark:border-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {waypoints.map((w, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="p-2 font-bold text-slate-800 dark:text-slate-200">{w.id}</td>
                  <td className="p-2 font-sans">{w.code}</td>
                  <td className="p-2">{w.E.toFixed(2)}</td>
                  <td className="p-2">{w.N.toFixed(2)}</td>
                  <td className="p-2">{w.Z.toFixed(2)}</td>
                  <td className="p-2 text-emerald-600">±{w.acc.toFixed(1)}m</td>
                  <td className="p-2">
                    <button
                      onClick={() => setWaypoints(waypoints.filter((_, i) => i !== idx))}
                      className="text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Field Stakeout & Target Navigation */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-500" />
            3. Field Stakeout & Navigation ("Go to Point")
          </h3>
          <button
            onClick={() => setIsStakeoutActive(!isStakeoutActive)}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              isStakeoutActive ? 'bg-rose-600 text-white' : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {isStakeoutActive ? 'Stop Stakeout' : 'Start Navigation'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Select Target</label>
            <select
              value={stakeTarget}
              onChange={e => setStakeTarget(e.target.value)}
              className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium"
            >
              <option value="manual">Enter Manual Coordinate</option>
              {waypoints.map((w, i) => (
                <option key={i} value={`wp_${i}`}>
                  {w.id} ({w.code})
                </option>
              ))}
            </select>
          </div>
          {stakeTarget === 'manual' && (
            <>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Target Easting (m)</label>
                <input
                  type="text"
                  value={stakeE}
                  onChange={e => setStakeE(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Target Northing (m)</label>
                <input
                  type="text"
                  value={stakeN}
                  onChange={e => setStakeN(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                />
              </div>
            </>
          )}
        </div>

        {/* Stakeout Guidance HUD */}
        {isStakeoutActive && stakeoutMetrics && (
          <div className="p-4 rounded-xl bg-linear-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-500/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Target: {stakeoutMetrics.targetName}
              </span>
              <span className="font-mono font-bold text-lg text-amber-700 dark:text-amber-400">
                Distance: {stakeoutMetrics.dist < 1000 ? `${stakeoutMetrics.dist.toFixed(2)} m` : `${(stakeoutMetrics.dist / 1000).toFixed(3)} km`}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Bearing</span>
                <span className="font-bold text-sm font-mono">{stakeoutMetrics.bearing.toFixed(1)}°</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Turn Command</span>
                <span className="font-bold text-sm font-mono text-amber-600">
                  {Math.abs(stakeoutMetrics.turn) <= 5 ? 'Straight Ahead' : stakeoutMetrics.turn > 0 ? `Turn Right ${Math.round(stakeoutMetrics.turn)}°` : `Turn Left ${Math.round(Math.abs(stakeoutMetrics.turn))}°`}
                </span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Δ Easting</span>
                <span className="font-bold text-sm font-mono">{stakeoutMetrics.dE.toFixed(2)} m</span>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Δ Northing</span>
                <span className="font-bold text-sm font-mono">{stakeoutMetrics.dN.toFixed(2)} m</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
