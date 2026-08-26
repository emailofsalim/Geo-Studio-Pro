import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Plus,
  Radio,
  Clock,
  Gauge,
  Volume2,
  VolumeX,
  Satellite,
  BarChart3,
  TrendingUp,
  Activity,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { SurveyWaypoint, SurveyTrack, TrackPoint } from '../types';
import {
  lonLatToUtm,
  utmToLonLat,
  mgrsFromLonLat,
  toDMSstr,
  getIndianZone,
  indianGridFwd,
  encodePlusCode,
  computeGpsAveragingStats,
  GpsAveragingStats
} from '../lib/geodesy';
import { downloadBlob } from '../lib/zip';
import { toCSVtext, csvEnc, dxfBuild } from '../lib/formats';

interface GpsSurveyorTabProps {
  workingZone: string;
  onSendToCalculator?: (csv: string) => void;
  onSendToOffset?: (pts: { lon: number; lat: number }[]) => void;
}

// Generate GPX 1.1 XML string
function exportToGPX(waypoints: SurveyWaypoint[], trackName: string, trackPoints: TrackPoint[]): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<gpx version="1.1" creator="GeoStudio Geomatics Engine" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  xml += `  <metadata>\n    <name>${trackName || 'GeoStudio Survey Session'}</name>\n    <time>${new Date().toISOString()}</time>\n  </metadata>\n`;

  // Waypoints
  waypoints.forEach(wp => {
    xml += `  <wpt lat="${wp.lat.toFixed(8)}" lon="${wp.lon.toFixed(8)}">\n`;
    xml += `    <ele>${wp.Z.toFixed(2)}</ele>\n`;
    xml += `    <name>${wp.id}</name>\n`;
    xml += `    <desc>${wp.code} - ${wp.remarks || ''}</desc>\n`;
    xml += `    <sym>Flag, Blue</sym>\n`;
    xml += `  </wpt>\n`;
  });

  // Track
  if (trackPoints.length > 0) {
    xml += `  <trk>\n    <name>${trackName || 'Tracklog'}</name>\n    <trkseg>\n`;
    trackPoints.forEach(pt => {
      xml += `      <trkpt lat="${pt.lat.toFixed(8)}" lon="${pt.lon.toFixed(8)}">\n`;
      xml += `        <ele>${pt.Z.toFixed(2)}</ele>\n`;
      xml += `        <time>${new Date(pt.time).toISOString()}</time>\n`;
      if (pt.speed) xml += `        <speed>${pt.speed.toFixed(2)}</speed>\n`;
      xml += `      </trkpt>\n`;
    });
    xml += `    </trkseg>\n  </trk>\n`;
  }

  xml += `</gpx>`;
  return xml;
}

// Simulated Satellite Constellation for Skyplot
interface SatelliteInfo {
  prn: string;
  system: 'GPS' | 'GLONASS' | 'Galileo' | 'BeiDou';
  elevation: number; // 0..90 deg
  azimuth: number; // 0..360 deg
  snr: number; // 20..50 dB-Hz
  used: boolean;
}

const DEFAULT_SATELLITES: SatelliteInfo[] = [
  { prn: 'G03', system: 'GPS', elevation: 65, azimuth: 45, snr: 46, used: true },
  { prn: 'G14', system: 'GPS', elevation: 42, azimuth: 120, snr: 41, used: true },
  { prn: 'G22', system: 'GPS', elevation: 78, azimuth: 280, snr: 48, used: true },
  { prn: 'G31', system: 'GPS', elevation: 25, azimuth: 210, snr: 34, used: true },
  { prn: 'R07', system: 'GLONASS', elevation: 55, azimuth: 15, snr: 43, used: true },
  { prn: 'R18', system: 'GLONASS', elevation: 32, azimuth: 175, snr: 38, used: true },
  { prn: 'E05', system: 'Galileo', elevation: 70, azimuth: 330, snr: 47, used: true },
  { prn: 'E19', system: 'Galileo', elevation: 38, azimuth: 95, snr: 39, used: true },
  { prn: 'B02', system: 'BeiDou', elevation: 52, azimuth: 140, snr: 44, used: true },
  { prn: 'B11', system: 'BeiDou', elevation: 28, azimuth: 260, snr: 35, used: true },
  { prn: 'G08', system: 'GPS', elevation: 12, azimuth: 60, snr: 27, used: false },
  { prn: 'R04', system: 'GLONASS', elevation: 8, azimuth: 310, snr: 22, used: false }
];

export const GpsSurveyorTab: React.FC<GpsSurveyorTabProps> = ({
  workingZone,
  onSendToCalculator,
  onSendToOffset
}) => {
  // Active Tab: 'cockpit' | 'averaging' | 'navigation' | 'trip' | 'satellites' | 'waypoints'
  const [subTab, setSubTab] = useState<'cockpit' | 'averaging' | 'navigation' | 'trip' | 'satellites' | 'waypoints'>('cockpit');

  // GPS Cockpit State
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentPos, setCurrentPos] = useState<any | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [compassMode, setCompassMode] = useState<'north' | 'heading'>('north');

  // Multi-Sample Averaging State (Handy GPS Style)
  const [isAveraging, setIsAveraging] = useState(false);
  const [targetEpochCount, setTargetEpochCount] = useState<number>(30);
  const [avgSamples, setAvgSamples] = useState<{ E: number; N: number; Z: number; lat: number; lon: number; acc: number; timestamp?: number }[]>([]);
  const [avgStats, setAvgStats] = useState<GpsAveragingStats | null>(null);

  // Radar Canvas State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scatterCanvasRef = useRef<HTMLCanvasElement>(null);
  const skyplotCanvasRef = useRef<HTMLCanvasElement>(null);
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
  const [trackName, setTrackName] = useState('Field_Traverse_01');
  const [trackInterval, setTrackInterval] = useState('5');
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [movingSec, setMovingSec] = useState(0);
  const [stoppedSec, setStoppedSec] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [minAlt, setMinAlt] = useState<number | null>(null);
  const [maxAlt, setMaxAlt] = useState<number | null>(null);
  const [totalAscent, setTotalAscent] = useState(0);
  const [totalDescent, setTotalDescent] = useState(0);

  // Go-To Waypoint Navigation & Proximity Guidance State (Handy GPS Style)
  const [navTargetId, setNavTargetId] = useState<string>('manual');
  const [navTargetE, setNavTargetE] = useState('254820');
  const [navTargetN, setNavTargetN] = useState('2605240');
  const [navTargetLat, setNavTargetLat] = useState('23.5415');
  const [navTargetLon, setNavTargetLon] = useState('84.6018');
  const [navTargetName, setNavTargetName] = useState('Control Pillar CP-02');
  const [audioAlerts, setAudioAlerts] = useState<boolean>(true);
  const [proximityRadiusMeters, setProximityRadiusMeters] = useState<number>(5.0);
  const [navMetrics, setNavMetrics] = useState<{
    dist: number;
    bearing: number;
    turn: number;
    dE: number;
    dN: number;
    xte: number;
    etaSec: number | null;
    isArrived: boolean;
  } | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const trackTimerRef = useRef<any>(null);
  const prevAltRef = useRef<number | null>(null);

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
    const plusCode = encodePlusCode(lat, lon);

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
      plusCode,
      indian: indianTxt
    };

    setCurrentPos(data);
    setGpsError(null);

    // Elevation profiling
    if (alt != null) {
      if (minAlt === null || alt < minAlt) setMinAlt(alt);
      if (maxAlt === null || alt > maxAlt) setMaxAlt(alt);
      if (prevAltRef.current !== null) {
        const diff = alt - prevAltRef.current;
        if (diff > 0.5) setTotalAscent(a => a + diff);
        else if (diff < -0.5) setTotalDescent(d => d + Math.abs(diff));
      }
      prevAltRef.current = alt;
    }

    // Process Averaging
    if (isAveraging && avgSamples.length < targetEpochCount) {
      setAvgSamples(prev => {
        const updated = [...prev, { E: u.E, N: u.N, Z: alt || 0, lat, lon, acc, timestamp: pos.timestamp }];
        const stats = computeGpsAveragingStats(updated);
        setAvgStats(stats);
        if (updated.length >= targetEpochCount) {
          setIsAveraging(false);
          if (navigator.vibrate) try { navigator.vibrate([150, 80, 150]); } catch {}
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
        if (spdKm > 1.0) {
          setMovingSec(m => m + 1);
        } else {
          setStoppedSec(s => s + 1);
        }
        return [...prev, { E: u.E, N: u.N, Z: alt || 0, lat, lon, speed: speed || 0, time: pos.timestamp }];
      });
    }

    // Process Go-To Navigation Guidance
    let targetE = parseFloat(navTargetE) || 0;
    let targetN = parseFloat(navTargetN) || 0;

    if (navTargetId.startsWith('wp_')) {
      const idx = parseInt(navTargetId.replace('wp_', ''), 10);
      const wp = waypoints[idx];
      if (wp) {
        targetE = wp.E;
        targetN = wp.N;
      }
    }

    if (targetE && targetN) {
      const dE = targetE - u.E;
      const dN = targetN - u.N;
      const dist = Math.hypot(dE, dN);
      const bearing = (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360;
      const hdg = (heading != null && !isNaN(heading)) ? heading : (deviceHeading || 0);
      const turn = ((bearing - hdg + 540) % 360) - 180;
      const isArrived = dist <= proximityRadiusMeters;

      // ETA calculation
      let etaSec: number | null = null;
      if (speed && speed > 0.5) {
        etaSec = Math.round(dist / speed);
      }

      setNavMetrics({
        dist,
        bearing,
        turn,
        dE,
        dN,
        xte: Math.abs(dist * Math.sin((turn * Math.PI) / 180)),
        etaSec,
        isArrived
      });

      if (isArrived && audioAlerts && navigator.vibrate) {
        try { navigator.vibrate([200, 100, 200]); } catch {}
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

    ctx.fillStyle = '#0a0e17';
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
      ctx.strokeStyle = 'rgba(201, 160, 99, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(201, 160, 99, 0.6)';
      ctx.font = '10px monospace';
      ctx.fillText(`${Math.round(dist)}m`, cx + 4, cy - r + 11);
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx, cy - rMax); ctx.lineTo(cx, cy + rMax);
    ctx.moveTo(cx - rMax, cy); ctx.lineTo(cx + rMax, cy);
    ctx.strokeStyle = 'rgba(201, 160, 99, 0.2)';
    ctx.stroke();

    // North Indicator
    const nAngle = 0 + rot;
    const nx = cx + Math.sin(nAngle) * (rMax + 4);
    const ny = cy - Math.cos(nAngle) * (rMax + 4);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', nx, ny);

    // Track Polyline (Historical in blue, active in gold)
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
      ctx.fillStyle = '#c9a063';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(w.id, p.x, p.y - 8);
    });

    // Navigation Target & Guidance Vector
    if (navMetrics && currentPos) {
      const tgtE = navTargetId.startsWith('wp_')
        ? waypoints[parseInt(navTargetId.replace('wp_', ''), 10)]?.E
        : parseFloat(navTargetE);
      const tgtN = navTargetId.startsWith('wp_')
        ? waypoints[parseInt(navTargetId.replace('wp_', ''), 10)]?.N
        : parseFloat(navTargetN);

      if (tgtE && tgtN) {
        const tSc = toScreen(tgtE, tgtN);
        const devSc = toScreen(currentPos.utm.E, currentPos.utm.N);

        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(devSc.x, devSc.y);
        ctx.lineTo(tSc.x, tSc.y);
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Target bullseye
        ctx.beginPath();
        ctx.arc(tSc.x, tSc.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#eab308';
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
        ctx.fillStyle = 'rgba(201, 160, 99, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(201, 160, 99, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Center Dot
      ctx.beginPath();
      ctx.arc(dSc.x, dSc.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [currentPos, waypoints, trackPoints, radarZoom, compassMode, deviceHeading, navMetrics, navTargetE, navTargetN, navTargetId]);

  // Render Averaging Scatter Canvas
  useEffect(() => {
    if (subTab !== 'averaging') return;
    const cv = scatterCanvasRef.current;
    if (!cv || !avgStats) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, cv.width, cv.height);

    const cx = cv.width / 2;
    const cy = cv.height / 2;
    const maxRadiusM = Math.max(2.0, avgStats.cep95 * 1.5);
    const scale = (cx - 30) / maxRadiusM;

    // Grid circles
    [avgStats.cep50, avgStats.cep95].forEach((rad, idx) => {
      const rPx = rad * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = idx === 0 ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 179, 8, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = idx === 0 ? '#22c55e' : '#eab308';
      ctx.font = '10px monospace';
      ctx.fillText(`${idx === 0 ? 'CEP50' : 'CEP95'}: ${rad.toFixed(2)}m`, cx + 6, cy - rPx + 12);
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx, 10); ctx.lineTo(cx, cv.height - 10);
    ctx.moveTo(10, cy); ctx.lineTo(cv.width - 10, cy);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    // Plot Epoch Points
    avgSamples.forEach(pt => {
      const dE = pt.E - avgStats.meanE;
      const dN = pt.N - avgStats.meanN;
      const px = cx + dE * scale;
      const py = cy - dN * scale;

      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.fill();
    });

    // Centroid
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#c9a063';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [subTab, avgStats, avgSamples]);

  // Render Skyplot Canvas
  useEffect(() => {
    if (subTab !== 'satellites') return;
    const cv = skyplotCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, cv.width, cv.height);

    const cx = cv.width / 2;
    const cy = cv.height / 2;
    const rMax = Math.min(cx, cy) - 24;

    // Polar Rings (0, 30, 60 deg elevation)
    [0, 30, 60].forEach(el => {
      const r = rMax * (1 - el / 90);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(201, 160, 99, 0.2)';
      ctx.stroke();

      ctx.fillStyle = 'rgba(201, 160, 99, 0.5)';
      ctx.font = '9px monospace';
      ctx.fillText(`${el}°`, cx + 4, cy - r + 10);
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx, cy - rMax); ctx.lineTo(cx, cy + rMax);
    ctx.moveTo(cx - rMax, cy); ctx.lineTo(cx + rMax, cy);
    ctx.strokeStyle = 'rgba(201, 160, 99, 0.2)';
    ctx.stroke();

    // North
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', cx - 4, cy - rMax - 6);

    // Plot Satellites
    DEFAULT_SATELLITES.forEach(sat => {
      const r = rMax * (1 - sat.elevation / 90);
      const rad = ((sat.azimuth - 90) * Math.PI) / 180;
      const sx = cx + r * Math.cos(rad);
      const sy = cy + r * Math.sin(rad);

      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fillStyle = sat.used ? (sat.system === 'GPS' ? '#38bdf8' : sat.system === 'GLONASS' ? '#ef4444' : sat.system === 'Galileo' ? '#22c55e' : '#f59e0b') : '#64748b';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sat.prn, sx, sy);
    });
  }, [subTab]);

  // Save Averaged Benchmark to Waypoint Registry
  const handleCommitAveragedWaypoint = () => {
    if (!avgStats) return;
    const ptId = wpId.trim() || `BM-${String(waypoints.length + 1).padStart(3, '0')}`;
    const newWp: SurveyWaypoint = {
      id: ptId,
      code: `Averaged Benchmark (${avgStats.sampleCount} ep)`,
      E: avgStats.meanE,
      N: avgStats.meanN,
      Z: avgStats.meanZ,
      lat: avgStats.meanLat,
      lon: avgStats.meanLon,
      acc: avgStats.cep95,
      zone: workingZone,
      time: Date.now(),
      remarks: `CEP95: ${avgStats.cep95.toFixed(2)}m | 2DRMS: ${avgStats.drms2.toFixed(2)}m | Grade: ${avgStats.qualityGrade}`
    };

    setWaypoints(prev => [...prev, newWp]);
    setSubTab('waypoints');
    const m = ptId.match(/^(.*?)(\d+)$/);
    if (m) {
      const nextNum = parseInt(m[2], 10) + 1;
      setWpId(`${m[1]}${String(nextNum).padStart(m[2].length, '0')}`);
    }
  };

  // Start Averaging Session
  const handleStartAveraging = () => {
    setAvgSamples([]);
    setAvgStats(null);
    setIsAveraging(true);
    if (!isStreaming) toggleStream();
  };

  // Export handlers
  const handleExportCSV = () => {
    if (!waypoints.length) return;
    const cols = ['Point_ID', 'Feature_Code', 'Easting', 'Northing', 'Elevation_Z', 'Latitude', 'Longitude', 'Accuracy_CEP95_m', 'Zone', 'Remarks'];
    const rows = waypoints.map(w => [w.id, w.code, w.E.toFixed(3), w.N.toFixed(3), w.Z.toFixed(2), w.lat.toFixed(8), w.lon.toFixed(8), (w.acc || 0).toFixed(2), w.zone, w.remarks || '']);
    downloadBlob(csvEnc(toCSVtext(cols, rows)), 'gps_survey_waypoints.csv', 'text/csv;charset=utf-8');
  };

  const handleExportGPX = () => {
    const gpx = exportToGPX(waypoints, trackName, trackPoints);
    downloadBlob(new TextEncoder().encode(gpx), `${trackName || 'GeoStudio'}.gpx`, 'application/gpx+xml');
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
      {/* 1. Header & Navigation Sub-Tabs */}
      <div className="bg-[#0f0f0f] rounded-2xl p-4 sm:p-6 border border-white/5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-0.5 font-medium">Dual-Coordinate Geodetic Cockpit & GNSS Engine</p>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#c9a063]" />
              GNSS Surveyor & Waypoint Guidance (Handy GPS / Avenza Suite)
            </h3>
            <p className="text-xs text-white/50 mt-1">
              Simultaneous UTM & WGS-84 telemetry, Multi-Epoch GPS Averaging (CEP95), Go-To Waypoint Guidance with acoustic proximity alarms, Trip Odometer, and Multi-GNSS Constellation Skyplot.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={getSingleFix}
              className="px-3.5 py-2 bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl border border-white/10"
            >
              Get Fix
            </button>
            <button
              onClick={toggleStream}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                isStreaming
                  ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                  : 'bg-[#c9a063] hover:bg-[#d6b074] text-black shadow-lg shadow-[#c9a063]/20'
              }`}
            >
              {isStreaming ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isStreaming ? 'Stop Stream' : 'Live Stream'}
            </button>
          </div>
        </div>

        {/* Sub-Nav Pill Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'cockpit', label: 'Dual Coordinate Cockpit', icon: Radio },
            { id: 'averaging', label: 'GPS Averaging (CEP95)', icon: Target },
            { id: 'navigation', label: 'Go-To Guidance', icon: Navigation },
            { id: 'trip', label: 'Trip Odometer', icon: Activity },
            { id: 'satellites', label: 'Satellite Skyplot', icon: Satellite },
            { id: 'waypoints', label: `Waypoints (${waypoints.length})`, icon: MapPin }
          ].map(tab => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                  active
                    ? 'bg-[#c9a063] text-black font-bold shadow-md shadow-[#c9a063]/10'
                    : 'bg-[#141414] text-white/60 hover:text-white border border-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {gpsError && (
          <div className="p-3 bg-red-950/40 border border-red-800/40 text-xs text-red-300 rounded-xl">
            {gpsError}
          </div>
        )}
      </div>

      {/* 2. Cockpit View: Dual Coordinates & Vector Radar */}
      {subTab === 'cockpit' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Dual Coordinate HUD (Handy GPS style) */}
            {currentPos ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-[#0f0f0f] rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#c9a063] block">WGS-84 Geodetic</span>
                  <span className="text-sm font-mono font-bold text-white block">{currentPos.lat.toFixed(7)}°</span>
                  <span className="text-[10px] text-white/50 block font-mono">{toDMSstr(currentPos.lat, true)}</span>
                  <span className="text-xs font-mono font-bold text-white block">{currentPos.lon.toFixed(7)}°</span>
                  <span className="text-[10px] text-white/50 block font-mono">{toDMSstr(currentPos.lon, false)}</span>
                </div>

                <div className="p-3.5 bg-[#0f0f0f] rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#c9a063] block">UTM (Zone {workingZone})</span>
                  <span className="text-xs text-white/50 block">EASTING</span>
                  <span className="text-sm font-mono font-bold text-white block">{currentPos.utm.E.toFixed(3)} m E</span>
                  <span className="text-xs text-white/50 block">NORTHING</span>
                  <span className="text-sm font-mono font-bold text-white block">{currentPos.utm.N.toFixed(3)} m N</span>
                </div>

                <div className="p-3.5 bg-[#0f0f0f] rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#c9a063] block">MGRS & Plus Code</span>
                  <span className="text-xs text-white/50 block">MGRS GRID</span>
                  <span className="text-xs font-mono font-bold text-white block">{currentPos.mgrs}</span>
                  <span className="text-xs text-white/50 block">PLUS CODE</span>
                  <span className="text-xs font-mono font-bold text-emerald-400 block">{currentPos.plusCode}</span>
                </div>

                <div className="p-3.5 bg-[#0f0f0f] rounded-2xl border border-white/5 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#c9a063] block">Altitude & Accuracy</span>
                  <span className="text-sm font-mono font-bold text-white block">{(currentPos.alt || 0).toFixed(1)} m MSL</span>
                  <span className="text-xs font-mono font-bold text-emerald-400 block">±{currentPos.acc.toFixed(1)} m (68%)</span>
                  <span className="text-[10px] text-white/50 block">Speed: {((currentPos.speed || 0) * 3.6).toFixed(1)} km/h</span>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-[#0f0f0f] rounded-2xl border border-white/5 text-center text-xs text-white/50">
                Awaiting active GNSS stream. Click <strong>Live Stream</strong> above or <strong>Get Fix</strong>.
              </div>
            )}

            {/* Vector Radar Screen */}
            <div className="bg-[#0f0f0f] p-4 sm:p-5 rounded-2xl border border-white/5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-serif italic text-white flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-[#c9a063]" />
                  Vector Compass & Tracking Radar
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCompassMode(compassMode === 'north' ? 'heading' : 'north')}
                    className="px-2.5 py-1 bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs rounded-lg border border-white/10 font-mono"
                  >
                    {compassMode === 'north' ? 'North-Up' : 'Heading-Up'}
                  </button>
                  <button
                    onClick={() => setRadarZoom(z => Math.max(10, z - 10))}
                    className="px-2 py-1 bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs rounded-lg border border-white/10"
                  >
                    Zoom +
                  </button>
                  <button
                    onClick={() => setRadarZoom(z => Math.min(500, z + 20))}
                    className="px-2 py-1 bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs rounded-lg border border-white/10"
                  >
                    Zoom -
                  </button>
                </div>
              </div>

              <div className="rounded-xl overflow-hidden border border-white/10 shadow-inner flex justify-center bg-black">
                <canvas ref={canvasRef} width={600} height={420} className="w-full max-w-[600px] h-[360px] sm:h-[420px]" />
              </div>
            </div>
          </div>

          {/* Right Panel: Quick Waypoint Capture */}
          <div className="space-y-4">
            <div className="bg-[#0f0f0f] p-5 rounded-2xl border border-white/5 space-y-4">
              <h4 className="text-xs font-serif italic text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-[#c9a063]" />
                Log Survey Waypoint
              </h4>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Point ID</label>
                  <input
                    type="text"
                    value={wpId}
                    onChange={e => setWpId(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Feature Code / Type</label>
                  <input
                    type="text"
                    value={wpCode}
                    onChange={e => setWpCode(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white"
                  />
                </div>

                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Remarks</label>
                  <textarea
                    rows={2}
                    value={wpRemarks}
                    onChange={e => setWpRemarks(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white resize-none"
                    placeholder="Condition, monument type..."
                  />
                </div>

                <button
                  onClick={() => {
                    if (!currentPos) {
                      alert('Take a GPS fix or live stream first!');
                      return;
                    }
                    const newWp: SurveyWaypoint = {
                      id: wpId.trim() || `WP-${waypoints.length + 1}`,
                      code: wpCode,
                      E: currentPos.utm.E,
                      N: currentPos.utm.N,
                      Z: currentPos.alt || 0,
                      lat: currentPos.lat,
                      lon: currentPos.lon,
                      acc: currentPos.acc,
                      zone: workingZone,
                      time: Date.now(),
                      remarks: wpRemarks.trim()
                    };
                    setWaypoints(prev => [...prev, newWp]);
                    const m = wpId.match(/^(.*?)(\d+)$/);
                    if (m) {
                      const nextNum = parseInt(m[2], 10) + 1;
                      setWpId(`${m[1]}${String(nextNum).padStart(m[2].length, '0')}`);
                    }
                    setWpRemarks('');
                  }}
                  className="w-full py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold rounded-xl shadow-lg flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Save Current Fix to Registry
                </button>
              </div>
            </div>

            {/* Quick Track Logger */}
            <div className="bg-[#0f0f0f] p-5 rounded-2xl border border-white/5 space-y-3 text-xs">
              <h4 className="font-serif italic text-white flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[#c9a063]" />
                Track Logger
              </h4>

              <div className="flex items-center justify-between text-white/60 text-[11px]">
                <span>Logged Points: {trackPoints.length}</span>
                <span>Distance: {(totalDistance / 1000).toFixed(2)} km</span>
              </div>

              <div className="flex items-center gap-2">
                {!isTracking ? (
                  <button
                    onClick={() => {
                      setIsTracking(true);
                      setIsPaused(false);
                      if (!isStreaming) toggleStream();
                    }}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-1"
                  >
                    <Play className="w-3.5 h-3.5" /> Start Recording
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setIsPaused(!isPaused)}
                      className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl flex items-center justify-center gap-1"
                    >
                      {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button
                      onClick={() => {
                        setIsTracking(false);
                        setIsPaused(false);
                      }}
                      className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl"
                    >
                      Stop
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. GPS Averaging Suite (Handy GPS Style CEP95) */}
      {subTab === 'averaging' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-white/5 space-y-4">
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-[#c9a063]" />
              Multi-Epoch GPS Averaging Engine
            </h4>
            <p className="text-xs text-white/50">
              Collect multiple GNSS epochs over time to compute statistical centroid coordinates, 50% CEP, 95% CEP, and 2DRMS precision ratings.
            </p>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white/60">Target Epochs:</span>
                <div className="flex items-center gap-1">
                  {[10, 30, 60, 120, 300].map(cnt => (
                    <button
                      key={cnt}
                      onClick={() => setTargetEpochCount(cnt)}
                      className={`px-2.5 py-1 rounded-lg font-mono text-xs ${
                        targetEpochCount === cnt
                          ? 'bg-[#c9a063] text-black font-bold'
                          : 'bg-[#141414] text-white/60 hover:text-white border border-white/10'
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-mono text-white">
                  <span>Epoch Progress: {avgSamples.length} / {targetEpochCount}</span>
                  <span className="text-[#c9a063] font-bold">{Math.round((avgSamples.length / targetEpochCount) * 100)}%</span>
                </div>
                <div className="w-full h-2.5 bg-[#141414] rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-[#c9a063] to-[#e4be83] transition-all"
                    style={{ width: `${Math.min(100, (avgSamples.length / targetEpochCount) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleStartAveraging}
                  disabled={isAveraging}
                  className="flex-1 py-2.5 bg-[#c9a063] hover:bg-[#d6b074] disabled:opacity-50 text-black font-bold rounded-xl shadow-lg flex items-center justify-center gap-1.5"
                >
                  <Target className="w-4 h-4" />
                  {isAveraging ? 'Collecting Epochs...' : `Start Averaging (${targetEpochCount} Epochs)`}
                </button>
                {isAveraging && (
                  <button
                    onClick={() => setIsAveraging(false)}
                    className="px-4 py-2.5 bg-red-950/40 text-red-300 border border-red-800/40 font-bold rounded-xl text-xs"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Results Card */}
            {avgStats && (
              <div className="p-4 bg-[#141414] rounded-xl border border-[#c9a063]/40 space-y-3 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[#c9a063] font-bold text-sm">Quality Grade:</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    avgStats.qualityGrade === 'Survey-Grade' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' :
                    avgStats.qualityGrade === 'Mapping-Grade' ? 'bg-blue-950 text-blue-300 border border-blue-500/40' :
                    'bg-amber-950 text-amber-300 border border-amber-500/40'
                  }`}>
                    {avgStats.qualityGrade}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-white/80 pt-1 border-t border-white/5">
                  <div>Mean Easting: <strong className="text-white">{avgStats.meanE.toFixed(3)} m</strong></div>
                  <div>Mean Northing: <strong className="text-white">{avgStats.meanN.toFixed(3)} m</strong></div>
                  <div>Mean Elevation: <strong className="text-white">{avgStats.meanZ.toFixed(2)} m</strong></div>
                  <div>CEP 95% Radius: <strong className="text-emerald-400">±{avgStats.cep95.toFixed(2)} m</strong></div>
                  <div>CEP 50% Radius: <strong className="text-emerald-400">±{avgStats.cep50.toFixed(2)} m</strong></div>
                  <div>2DRMS (95.4%): <strong className="text-white">{avgStats.drms2.toFixed(2)} m</strong></div>
                </div>

                <button
                  onClick={handleCommitAveragedWaypoint}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 mt-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Save as Benchmark Waypoint
                </button>
              </div>
            )}
          </div>

          {/* Scatter Plot Visualizer */}
          <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-white/5 space-y-3">
            <h4 className="text-sm font-serif italic text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#c9a063]" />
              Epoch Scatter Distribution Plot
            </h4>
            <div className="rounded-xl overflow-hidden border border-white/10 shadow-inner flex justify-center bg-black">
              <canvas ref={scatterCanvasRef} width={450} height={320} className="w-full h-[300px]" />
            </div>
          </div>
        </div>
      )}

      {/* 4. Go-To Waypoint Guidance & Proximity Alarms (Handy GPS Style) */}
      {subTab === 'navigation' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-white/5 space-y-4">
              <h4 className="text-base font-serif italic text-white flex items-center gap-2">
                <Navigation className="w-5 h-5 text-[#c9a063]" />
                Go-To Waypoint Guidance & Steering Director
              </h4>

              {navMetrics ? (
                <div className="space-y-6">
                  {/* Dynamic Big Turn Compass Header */}
                  <div className="p-6 bg-gradient-to-b from-[#141414] to-[#0a0e17] rounded-2xl border border-white/10 text-center space-y-3">
                    <div className="text-[11px] uppercase tracking-wider text-[#c9a063]">
                      Navigating to: {navTargetName}
                    </div>

                    <div className="text-4xl sm:text-5xl font-mono font-bold text-white">
                      {navMetrics.dist > 1000 ? `${(navMetrics.dist / 1000).toFixed(2)} km` : `${navMetrics.dist.toFixed(1)} m`}
                    </div>

                    <div className="flex items-center justify-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold font-mono ${
                        Math.abs(navMetrics.turn) < 10
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                          : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                      }`}>
                        {Math.abs(navMetrics.turn) < 5
                          ? 'ON TARGET 🎯'
                          : navMetrics.turn > 0
                          ? `TURN ${navMetrics.turn.toFixed(0)}° RIGHT ➔`
                          : `TURN ${Math.abs(navMetrics.turn).toFixed(0)}° LEFT ⬅`}
                      </span>
                    </div>

                    {navMetrics.isArrived && (
                      <div className="p-2.5 bg-emerald-900/60 border border-emerald-400 text-emerald-200 text-xs font-bold rounded-xl animate-pulse">
                        🎯 PROXIMITY ALERT: Arrived within {proximityRadiusMeters}m of waypoint!
                      </div>
                    )}
                  </div>

                  {/* Navigation Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                      <span className="text-[10px] text-white/50 block">BEARING</span>
                      <span className="text-base font-bold text-[#c9a063]">{navMetrics.bearing.toFixed(1)}°</span>
                    </div>
                    <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                      <span className="text-[10px] text-white/50 block">CROSS-TRACK ERR</span>
                      <span className="text-base font-bold text-white">{navMetrics.xte.toFixed(1)} m</span>
                    </div>
                    <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                      <span className="text-[10px] text-white/50 block">EST. TIME (ETA)</span>
                      <span className="text-base font-bold text-white">{navMetrics.etaSec ? `${Math.floor(navMetrics.etaSec / 60)}m ${navMetrics.etaSec % 60}s` : '--'}</span>
                    </div>
                    <div className="p-3 bg-[#141414] rounded-xl border border-white/5">
                      <span className="text-[10px] text-white/50 block">Δ EAST / Δ NORTH</span>
                      <span className="text-xs font-bold text-white">{navMetrics.dE >= 0 ? `+${navMetrics.dE.toFixed(1)}` : navMetrics.dE.toFixed(1)}m E</span>
                      <span className="text-xs font-bold text-white block">{navMetrics.dN >= 0 ? `+${navMetrics.dN.toFixed(1)}` : navMetrics.dN.toFixed(1)}m N</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-[#141414] rounded-xl border border-white/5 text-center text-xs text-white/50">
                  Select a target waypoint from the right panel to begin Go-To guidance.
                </div>
              )}
            </div>
          </div>

          {/* Right: Target Selector */}
          <div className="bg-[#0f0f0f] p-5 rounded-2xl border border-white/5 space-y-4 text-xs">
            <h4 className="font-serif italic text-white flex items-center gap-1.5">
              <Target className="w-4 h-4 text-[#c9a063]" />
              Select Target Waypoint
            </h4>

            <div>
              <label className="block text-white/50 text-[11px] mb-1">Target Source</label>
              <select
                value={navTargetId}
                onChange={e => {
                  const val = e.target.value;
                  setNavTargetId(val);
                  if (val.startsWith('wp_')) {
                    const idx = parseInt(val.replace('wp_', ''), 10);
                    const wp = waypoints[idx];
                    if (wp) {
                      setNavTargetE(wp.E.toString());
                      setNavTargetN(wp.N.toString());
                      setNavTargetName(`${wp.id} (${wp.code})`);
                    }
                  } else {
                    setNavTargetName('Custom Coordinates');
                  }
                }}
                className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white"
              >
                <option value="manual">Manual UTM Coordinates</option>
                {waypoints.map((wp, idx) => (
                  <option key={wp.id} value={`wp_${idx}`}>
                    {wp.id} - {wp.code} ({wp.E.toFixed(1)}, {wp.N.toFixed(1)})
                  </option>
                ))}
              </select>
            </div>

            {navTargetId === 'manual' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Target Easting (m)</label>
                  <input
                    type="number"
                    value={navTargetE}
                    onChange={e => setNavTargetE(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#141414] text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Target Northing (m)</label>
                  <input
                    type="number"
                    value={navTargetN}
                    onChange={e => setNavTargetN(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-lg border border-white/10 bg-[#141414] text-white font-mono"
                  />
                </div>
              </div>
            )}

            {/* Proximity Alarm Settings */}
            <div className="pt-3 border-t border-white/5 space-y-2">
              <label className="block text-white/50 text-[11px]">Proximity Arrival Radius: {proximityRadiusMeters}m</label>
              <input
                type="range"
                min="1"
                max="25"
                step="1"
                value={proximityRadiusMeters}
                onChange={e => setProximityRadiusMeters(parseFloat(e.target.value))}
                className="w-full accent-[#c9a063]"
              />

              <div className="flex items-center justify-between pt-1">
                <span className="text-white/70">Acoustic & Vibration Alert</span>
                <input
                  type="checkbox"
                  checked={audioAlerts}
                  onChange={e => setAudioAlerts(e.target.checked)}
                  className="rounded bg-[#141414] border-white/20 text-[#c9a063]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Trip Computer & Odometer */}
      {subTab === 'trip' && (
        <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-white/5 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#c9a063]" />
              Field Trip Computer & Odometer
            </h4>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setTotalDistance(0);
                  setElapsedSec(0);
                  setMovingSec(0);
                  setStoppedSec(0);
                  setMaxSpeed(0);
                  setTotalAscent(0);
                  setTotalDescent(0);
                  setTrackPoints([]);
                }}
                className="px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl border border-white/10"
              >
                Reset Trip Computer
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-[#141414] rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-white/40 block">Trip Distance</span>
              <span className="text-2xl sm:text-3xl font-mono font-bold text-white">{(totalDistance / 1000).toFixed(3)}</span>
              <span className="text-xs text-[#c9a063] font-bold block">kilometers ({totalDistance.toFixed(1)} m)</span>
            </div>

            <div className="p-4 bg-[#141414] rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-white/40 block">Current Speed</span>
              <span className="text-2xl sm:text-3xl font-mono font-bold text-emerald-400">
                {currentPos ? ((currentPos.speed || 0) * 3.6).toFixed(1) : '0.0'}
              </span>
              <span className="text-xs text-white/50 block">km/h (Max: {maxSpeed.toFixed(1)} km/h)</span>
            </div>

            <div className="p-4 bg-[#141414] rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-white/40 block">Moving Time</span>
              <span className="text-2xl sm:text-3xl font-mono font-bold text-white">
                {Math.floor(movingSec / 60)}m {movingSec % 60}s
              </span>
              <span className="text-xs text-white/50 block">Stopped: {Math.floor(stoppedSec / 60)}m {stoppedSec % 60}s</span>
            </div>

            <div className="p-4 bg-[#141414] rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-white/40 block">Total Ascent / Descent</span>
              <span className="text-2xl sm:text-3xl font-mono font-bold text-[#c9a063]">
                +{totalAscent.toFixed(1)}m
              </span>
              <span className="text-xs text-white/50 block">Descent: -{totalDescent.toFixed(1)}m</span>
            </div>
          </div>
        </div>
      )}

      {/* 6. Multi-GNSS Satellite Skyplot */}
      {subTab === 'satellites' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-white/5 space-y-3">
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Satellite className="w-5 h-5 text-[#c9a063]" />
              GNSS Constellation Skyplot
            </h4>
            <p className="text-xs text-white/50">
              Visual azimuth and elevation polar distribution of tracked satellites (GPS, GLONASS, Galileo, BeiDou).
            </p>
            <div className="rounded-xl overflow-hidden border border-white/10 shadow-inner flex justify-center bg-black">
              <canvas ref={skyplotCanvasRef} width={400} height={340} className="w-full h-[320px]" />
            </div>
          </div>

          <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-white/5 space-y-4 text-xs">
            <h4 className="text-sm font-serif italic text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#c9a063]" />
              Satellite Signal-to-Noise Ratio (SNR dB-Hz)
            </h4>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {DEFAULT_SATELLITES.map(sat => (
                <div key={sat.prn} className="p-2 bg-[#141414] rounded-lg border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      sat.system === 'GPS' ? 'bg-blue-950 text-blue-300' :
                      sat.system === 'GLONASS' ? 'bg-red-950 text-red-300' :
                      sat.system === 'Galileo' ? 'bg-emerald-950 text-emerald-300' :
                      'bg-amber-950 text-amber-300'
                    }`}>
                      {sat.prn} ({sat.system})
                    </span>
                    <span className="text-[10px] text-white/50">El: {sat.elevation}° Az: {sat.azimuth}°</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-[#0a0e17] h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${sat.used ? 'bg-emerald-500' : 'bg-slate-600'}`}
                        style={{ width: `${(sat.snr / 50) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-white text-[11px] font-bold w-12 text-right">{sat.snr} dB</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. Waypoints Table & Multi-Format Exporter */}
      {subTab === 'waypoints' && (
        <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-white/5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="text-base font-serif italic text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#c9a063]" />
                Survey Waypoint Registry ({waypoints.length})
              </h4>
              <p className="text-xs text-white/50">Export to GPX (Avenza/Garmin), DXF (AutoCAD/QGIS), or CSV.</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleExportGPX}
                disabled={waypoints.length === 0}
                className="px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-1.5 disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5 text-[#c9a063]" />
                Export GPX (Avenza)
              </button>
              <button
                onClick={handleExportDXF}
                disabled={waypoints.length === 0}
                className="px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-1.5 disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                Export DXF (CAD)
              </button>
              <button
                onClick={handleExportCSV}
                disabled={waypoints.length === 0}
                className="px-3.5 py-1.5 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5 disabled:opacity-40"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-white/80">
              <thead className="text-[10px] uppercase text-[#c9a063] border-b border-white/10 bg-[#141414]">
                <tr>
                  <th className="py-2.5 px-3">Point ID</th>
                  <th className="py-2.5 px-3">Feature Code</th>
                  <th className="py-2.5 px-3 font-mono">Easting (m)</th>
                  <th className="py-2.5 px-3 font-mono">Northing (m)</th>
                  <th className="py-2.5 px-3 font-mono">Elev (m)</th>
                  <th className="py-2.5 px-3 font-mono">Accuracy</th>
                  <th className="py-2.5 px-3">Remarks</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {waypoints.map((wp, idx) => (
                  <tr key={wp.id} className="hover:bg-white/5">
                    <td className="py-2 px-3 font-mono font-bold text-white">{wp.id}</td>
                    <td className="py-2 px-3">{wp.code}</td>
                    <td className="py-2 px-3 font-mono">{wp.E.toFixed(3)}</td>
                    <td className="py-2 px-3 font-mono">{wp.N.toFixed(3)}</td>
                    <td className="py-2 px-3 font-mono">{wp.Z.toFixed(2)}</td>
                    <td className="py-2 px-3 font-mono text-emerald-400">±{(wp.acc || 0).toFixed(2)}m</td>
                    <td className="py-2 px-3 text-white/50 truncate max-w-xs">{wp.remarks || '-'}</td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => setWaypoints(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-400/60 hover:text-red-400 p-1"
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
      )}
    </div>
  );
};
