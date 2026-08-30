import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useIsDarkMode } from '../hooks/useIsDarkMode';
import { useManagedResource } from '../hooks/useHardwareResource';
import {
  ShieldAlert,
  ShieldCheck,
  Radio,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Trash2,
  Download,
  Upload,
  Layers,
  MapPin,
  Compass,
  AlertTriangle,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Activity,
  FileSpreadsheet,
  FileCode,
  Sliders,
  Settings2,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  TrendingUp,
  FolderArchive
} from 'lucide-react';
import { GeoFeature, GeoPoint, GeofenceZone, GeofenceBreachEvent, GeofenceType, GeofenceRule, GeofenceSeverity } from '../types';
import { lonLatToUtm, utmToLonLat, polygonAreaPerimeter, pointInPoly, vincentyCore, toDMSstr } from '../lib/geodesy';
import { parseCSV, stripBOM, toCSVtext, csvEnc, kmlBuild, geoJsonBuild, dxfBuild, extractAllFeaturesFromZip } from '../lib/formats';
import { downloadBlob } from '../lib/zip';
import {
  triggerWaypointAddedHaptic,
  triggerVertexAddedHaptic,
  triggerGeofenceBreachHaptic,
  isVibrationSupported,
  triggerHaptic,
  HAPTIC_PATTERNS
} from '../lib/haptics';
import { useToast } from '../context/ToastContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
  getTileUrl,
  lonLatToTile,
  tileToBBox,
  globalTileCache,
  getOptimalZoomLevel,
  ImageryProvider
} from '../lib/tileManager';
import { Globe } from 'lucide-react';

interface GeofenceStudioTabProps {
  workingZone: string;
  onSendToGis?: (features: GeoFeature[]) => void;
  onSendToOffset?: (pts: { lon: number; lat: number }[]) => void;
}

// Distance from point to line segment (in meters, Cartesian approx with UTM or Vincenty)
function distToSegment(p: GeoPoint, v: GeoPoint, w: GeoPoint): number {
  const l2 = (v.a - w.a) ** 2 + (v.b - w.b) ** 2;
  if (l2 === 0) return Math.hypot(p.a - v.a, p.b - v.b);
  let t = ((p.a - v.a) * (w.a - v.a) + (p.b - v.b) * (w.b - v.b)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projA = v.a + t * (w.a - v.a);
  const projB = v.b + t * (w.b - v.b);
  return Math.hypot(p.a - projA, p.b - projB);
}

// Shortest distance from point to polygon perimeter (meters in UTM)
function distToPolygonPerimeter(p: GeoPoint, poly: GeoPoint[]): number {
  if (poly.length < 2) return 0;
  let minD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const next = poly[(i + 1) % poly.length];
    const d = distToSegment(p, poly[i], next);
    if (d < minD) minD = d;
  }
  return minD;
}

// Web Audio Sound Synthesizer for Alarms
class GeofenceAudioEngine {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playBreachAlarm() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
      osc.frequency.setValueAtTime(880, now + 0.16);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.3);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  public playWarningChime() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.12); // A5

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } catch {
      // Audio autoplay fallback
    }
  }

  public playSafeReturnTone() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.2); // G5

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.42);
    } catch {
      // fallback
    }
  }
}

const audioEngine = new GeofenceAudioEngine();

// Preset Geofence templates
const SAMPLE_GEOFENCES: GeofenceZone[] = [
  {
    id: 'gf-001',
    name: 'Mine Site Blasting Keep-Out Zone',
    type: 'circle',
    rule: 'keep_out',
    severity: 'critical',
    enabled: true,
    color: '#ef4444',
    fillOpacity: 0.25,
    coordinates: [{ a: 88.3638, b: 22.5726 }], // Kolkata Center
    radiusMeters: 180,
    bufferWarningMeters: 40,
    description: 'Active blasting perimeter. Strictly prohibited for all unauthorized rovers and personnel.',
    category: 'Mining & Hazards',
    kind: 'll'
  },
  {
    id: 'gf-002',
    name: 'BVLOS Drone Survey Corridor',
    type: 'corridor',
    rule: 'corridor_tracking',
    severity: 'high',
    enabled: true,
    color: '#3b82f6',
    fillOpacity: 0.2,
    coordinates: [
      { a: 88.358, b: 22.568 },
      { a: 88.362, b: 22.573 },
      { a: 88.368, b: 22.577 },
      { a: 88.374, b: 22.581 }
    ],
    corridorWidthMeters: 80,
    bufferWarningMeters: 20,
    speedLimitKmh: 45,
    description: 'Approved pipeline aerial survey right-of-way corridor. Drone must stay within 40m centerline buffer.',
    category: 'Aviation & UAV',
    kind: 'll'
  },
  {
    id: 'gf-003',
    name: 'Cadastral Parcel Enclosure (Keep-In)',
    type: 'polygon',
    rule: 'keep_in',
    severity: 'warning',
    enabled: true,
    color: '#10b981',
    fillOpacity: 0.2,
    coordinates: [
      { a: 88.360, b: 22.570 },
      { a: 88.367, b: 22.570 },
      { a: 88.368, b: 22.576 },
      { a: 88.361, b: 22.577 },
      { a: 88.360, b: 22.570 }
    ],
    bufferWarningMeters: 15,
    description: 'Assigned cadastral boundary for total-station boundary demarcation survey.',
    category: 'Cadastre',
    kind: 'll'
  }
];

export const GeofenceStudioTab: React.FC<GeofenceStudioTabProps> = ({
  workingZone,
  onSendToGis,
  onSendToOffset
}) => {
  const toast = useToast();
  const managedResource = useManagedResource('geofence_studio_tab', 'Geofence Breach & Proximity Radar');
  const isDark = useIsDarkMode();
  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  // Geofence Zones State
  const [zones, setZones] = useState<GeofenceZone[]>(() => {
    try {
      const saved = localStorage.getItem('geo_geofence_zones');
      return saved ? JSON.parse(saved) : SAMPLE_GEOFENCES;
    } catch {
      return SAMPLE_GEOFENCES;
    }
  });

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(zones[0]?.id || null);
  const [isEditingZone, setIsEditingZone] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [vibrationEnabled, setVibrationEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('geo_geofence_haptics');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Live Position / Rover State
  const [trackingMode, setTrackingMode] = useState<'sim' | 'gps' | 'idle'>('sim');
  const [roverPos, setRoverPos] = useState<{ lat: number; lon: number; speedKmh: number; heading: number; acc: number }>({
    lat: 22.5720,
    lon: 88.3625,
    speedKmh: 18.5,
    heading: 45,
    acc: 2.1
  });
  const [trackHistory, setTrackHistory] = useState<{ lat: number; lon: number; time: number }[]>([]);

  // Simulation Controller State
  const [simPlaying, setSimPlaying] = useState<boolean>(true);
  const [simSpeedFactor, setSimSpeedFactor] = useState<number>(1);
  const simStepRef = useRef<number>(0);

  // Events & Breach Ledger
  const [breachEvents, setBreachEvents] = useState<GeofenceBreachEvent[]>([]);
  const [activeBreachAlert, setActiveBreachAlert] = useState<{ message: string; severity: GeofenceSeverity; fenceName: string } | null>(null);
  const [lastBreachSoundTime, setLastBreachSoundTime] = useState<number>(0);

  // Map & Canvas State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isOnline = useOnlineStatus();
  const [showBasemap, setShowBasemap] = useState<boolean>(false);
  const [basemapProvider, setBasemapProvider] = useState<ImageryProvider>('google_satellite');
  const [basemapOpacity, setBasemapOpacity] = useState<number>(0.85);
  const [, setRenderTick] = useState<number>(0);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredCoord, setHoveredCoord] = useState<{ lat: number; lon: number; utmE: number; utmN: number } | null>(null);
  const [drawMode, setDrawMode] = useState<'none' | 'polygon' | 'circle' | 'corridor'>('none');
  const [newFencePts, setNewFencePts] = useState<GeoPoint[]>([]);

  // Mobile Touch Gesture Ref (prevents browser pinch zoom)
  const touchStateRef = useRef<{
    isPinching: boolean;
    startDist: number;
    startZoom: number;
    startOffset: { x: number; y: number };
    startTouch: { x: number; y: number };
    startTime: number;
    hasMoved: boolean;
  }>({
    isPinching: false,
    startDist: 0,
    startZoom: 1,
    startOffset: { x: 0, y: 0 },
    startTouch: { x: 0, y: 0 },
    startTime: 0,
    hasMoved: false
  });

  // Persist Zones
  useEffect(() => {
    localStorage.setItem('geo_geofence_zones', JSON.stringify(zones));
  }, [zones]);

  // Convert all coordinates to UTM for accurate metric spatial math
  const metricZones = useMemo(() => {
    return zones.map(z => {
      const utmPts = z.coordinates.map(pt => {
        if (z.kind === 'll') {
          const res = lonLatToUtm(pt.a, pt.b, zNum, isSouth);
          return { a: res.E, b: res.N };
        }
        return pt;
      });
      return { ...z, utmPts };
    });
  }, [zones, zNum, isSouth]);

  // Rover UTM position
  const roverUtm = useMemo(() => {
    return lonLatToUtm(roverPos.lon, roverPos.lat, zNum, isSouth);
  }, [roverPos, zNum, isSouth]);

  // Evaluate Geofence Rules against Rover Position
  const evaluateBreaches = useCallback((lat: number, lon: number, speedKmh: number, heading: number) => {
    const curUtm = lonLatToUtm(lon, lat, zNum, isSouth);
    const curPt: GeoPoint = { a: curUtm.E, b: curUtm.N };
    let highestSeverityAlert: { message: string; severity: GeofenceSeverity; fenceName: string } | null = null;

    metricZones.forEach(z => {
      if (!z.enabled) return;

      let isInside = false;
      let distToEdge = Infinity;

      if (z.type === 'circle') {
        const center = z.utmPts[0];
        if (center) {
          const dCenter = Math.hypot(curPt.a - center.a, curPt.b - center.b);
          const r = z.radiusMeters || 100;
          isInside = dCenter <= r;
          distToEdge = Math.abs(dCenter - r);
        }
      } else if (z.type === 'polygon') {
        const polyNodes = z.utmPts.map(p => ({ x: p.a, y: p.b }));
        isInside = pointInPoly(curPt.a, curPt.b, polyNodes);
        distToEdge = distToPolygonPerimeter(curPt, z.utmPts);
      } else if (z.type === 'corridor') {
        const halfWidth = (z.corridorWidthMeters || 50) / 2;
        let minDToLine = Infinity;
        for (let i = 0; i < z.utmPts.length - 1; i++) {
          const d = distToSegment(curPt, z.utmPts[i], z.utmPts[i + 1]);
          if (d < minDToLine) minDToLine = d;
        }
        isInside = minDToLine <= halfWidth;
        distToEdge = Math.abs(minDToLine - halfWidth);
      }

      // Check Rules
      let breach: { type: GeofenceBreachEvent['eventType']; msg: string } | null = null;

      if (z.rule === 'keep_out' && isInside) {
        breach = {
          type: 'ENTER',
          msg: `KEEP-OUT BREACH! Rover penetrated restricted zone "${z.name}" (${distToEdge.toFixed(1)}m deep)`
        };
      } else if (z.rule === 'keep_in' && !isInside) {
        breach = {
          type: 'EXIT',
          msg: `KEEP-IN BREACH! Rover escaped boundary "${z.name}" by ${distToEdge.toFixed(1)}m`
        };
      } else if (z.rule === 'corridor_tracking' && !isInside) {
        breach = {
          type: 'CORRIDOR_DEVIATION',
          msg: `CORRIDOR DEVIATION! Rover strayed off flight centerline in "${z.name}" by ${distToEdge.toFixed(1)}m`
        };
      } else if (z.rule === 'speed_limit' && isInside && z.speedLimitKmh && speedKmh > z.speedLimitKmh) {
        breach = {
          type: 'SPEED_BREACH',
          msg: `SPEED BREACH! ${speedKmh.toFixed(1)} km/h exceeds speed limit (${z.speedLimitKmh} km/h) in "${z.name}"`
        };
      } else if (z.bufferWarningMeters && distToEdge <= z.bufferWarningMeters && ((z.rule === 'keep_out' && !isInside) || (z.rule === 'keep_in' && isInside))) {
        // Approaching border buffer warning
        if (!highestSeverityAlert) {
          highestSeverityAlert = {
            message: `Proximity Warning: ${distToEdge.toFixed(1)}m to boundary of "${z.name}"`,
            severity: 'warning',
            fenceName: z.name
          };
        }
      }

      if (breach) {
        const newEvt: GeofenceBreachEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          timestamp: Date.now(),
          fenceId: z.id,
          fenceName: z.name,
          eventType: breach.type,
          severity: z.severity,
          lat,
          lon,
          utmE: curUtm.E,
          utmN: curUtm.N,
          speedKmh,
          heading,
          distanceToBoundaryMeters: distToEdge,
          message: breach.msg
        };

        setBreachEvents(prev => [newEvt, ...prev.slice(0, 49)]); // keep last 50 events
        highestSeverityAlert = {
          message: breach.msg,
          severity: z.severity,
          fenceName: z.name
        };
      }
    });

    setActiveBreachAlert(highestSeverityAlert);

    // Trigger Audio & Haptic Physical Alarms
    if (highestSeverityAlert) {
      const now = Date.now();
      if (now - lastBreachSoundTime > 1800) {
        if (soundEnabled) {
          if (highestSeverityAlert.severity === 'critical' || highestSeverityAlert.severity === 'high') {
            audioEngine.playBreachAlarm();
          } else {
            audioEngine.playWarningChime();
          }
        }
        if (vibrationEnabled) {
          triggerGeofenceBreachHaptic(highestSeverityAlert.severity);
        }
        setLastBreachSoundTime(now);
      }
    }
  }, [metricZones, zNum, isSouth, soundEnabled, vibrationEnabled, lastBreachSoundTime]);

  // Simulation Loop
  useEffect(() => {
    if (trackingMode !== 'sim' || !simPlaying) return;

    const interval = setInterval(() => {
      simStepRef.current += 0.025 * simSpeedFactor;
      const t = simStepRef.current;

      // Elliptical multi-loop orbit passing in & out of zones
      const baseLat = 22.5725;
      const baseLon = 88.3650;
      const rLat = 0.007 * Math.sin(t * 0.9);
      const rLon = 0.009 * Math.cos(t * 0.7);

      const lat = baseLat + rLat;
      const lon = baseLon + rLon;

      const dLat = 0.007 * 0.9 * Math.cos(t * 0.9);
      const dLon = -0.009 * 0.7 * Math.sin(t * 0.7);
      const heading = (Math.atan2(dLon, dLat) * 180) / Math.PI + (dLon < 0 ? 360 : 0);
      const speedKmh = Math.max(8, (Math.hypot(dLat, dLon) * 111000 * 3.6 * 0.8) % 65);

      setRoverPos({
        lat,
        lon,
        speedKmh: Math.round(speedKmh * 10) / 10,
        heading: Math.round(heading),
        acc: 1.8
      });

      setTrackHistory(prev => [{ lat, lon, time: Date.now() }, ...prev.slice(0, 150)]);
      evaluateBreaches(lat, lon, speedKmh, heading);
    }, 200);

    return () => clearInterval(interval);
  }, [trackingMode, simPlaying, simSpeedFactor, evaluateBreaches]);

  // Real GPS Geolocation Watcher (Managed Hardware Lifecycle)
  useEffect(() => {
    if (trackingMode !== 'gps') return;

    try {
      const stopTracking = managedResource.startLocationTracking(
        pos => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const speedKmh = pos.coords.speed !== null ? pos.coords.speed * 3.6 : 0;
          const heading = pos.coords.heading !== null ? pos.coords.heading : 0;
          const acc = pos.coords.accuracy || 3.0;

          setRoverPos({
            lat,
            lon,
            speedKmh: Math.round(speedKmh * 10) / 10,
            heading: Math.round(heading),
            acc: Math.round(acc * 10) / 10
          });

          setTrackHistory(prev => [{ lat, lon, time: Date.now() }, ...prev.slice(0, 150)]);
          evaluateBreaches(lat, lon, speedKmh, heading);
        },
        err => {
          console.warn('GPS watch error:', err.message);
          toast.showError(`GPS Error: ${err.message}`);
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );

      return () => {
        stopTracking();
      };
    } catch (err: any) {
      toast.showError('Geolocation API not supported in this browser.');
      setTrackingMode('sim');
    }
  }, [trackingMode, evaluateBreaches, managedResource, toast]);

  // Draw Vector Radar Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background & Radar Rings
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = isDark ? '#0f172a' : '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // Compute coordinate bounds
    const allPts: { x: number; y: number }[] = [];
    metricZones.forEach(z => {
      z.utmPts.forEach(pt => allPts.push({ x: pt.a, y: pt.b }));
      if (z.type === 'circle' && z.utmPts[0] && z.radiusMeters) {
        const c = z.utmPts[0];
        allPts.push({ x: c.a - z.radiusMeters, y: c.b - z.radiusMeters });
        allPts.push({ x: c.a + z.radiusMeters, y: c.b + z.radiusMeters });
      }
    });
    allPts.push({ x: roverUtm.E, y: roverUtm.N });

    let minX = Math.min(...allPts.map(p => p.x));
    let maxX = Math.max(...allPts.map(p => p.x));
    let minY = Math.min(...allPts.map(p => p.y));
    let maxY = Math.max(...allPts.map(p => p.y));

    // Pad bounds
    const spanX = Math.max(200, maxX - minX);
    const spanY = Math.max(200, maxY - minY);
    minX -= spanX * 0.25;
    maxX += spanX * 0.25;
    minY -= spanY * 0.25;
    maxY += spanY * 0.25;

    const scaleX = (width - 80) / (maxX - minX);
    const scaleY = (height - 80) / (maxY - minY);
    const baseScale = Math.min(scaleX, scaleY) * zoomLevel;

    const toScreen = (utmE: number, utmN: number) => {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const sx = width / 2 + (utmE - cx) * baseScale + panOffset.x;
      const sy = height / 2 - (utmN - cy) * baseScale + panOffset.y; // invert Y for northing
      return { x: sx, y: sy };
    };

    // Satellite Imagery Layer Background
    if (showBasemap) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const worldMinE = cx + (0 - width / 2 - panOffset.x) / baseScale;
      const worldMaxE = cx + (width - width / 2 - panOffset.x) / baseScale;
      const worldMaxN = cy - (0 - height / 2 - panOffset.y) / baseScale;
      const worldMinN = cy - (height - height / 2 - panOffset.y) / baseScale;

      const swLL = utmToLonLat(Math.min(worldMinE, worldMaxE), Math.min(worldMinN, worldMaxN), zNum, isSouth);
      const neLL = utmToLonLat(Math.max(worldMinE, worldMaxE), Math.max(worldMinN, worldMaxN), zNum, isSouth);

      const centerLat = (swLL.lat + neLL.lat) / 2;
      const zoom = getOptimalZoomLevel(baseScale, centerLat);

      const minTile = lonLatToTile(swLL.lon, neLL.lat, zoom);
      const maxTile = lonLatToTile(neLL.lon, swLL.lat, zoom);

      ctx.save();
      ctx.globalAlpha = basemapOpacity;

      const minX_tile = Math.max(0, Math.min(minTile.x, maxTile.x) - 1);
      const maxX_tile = Math.min(Math.pow(2, zoom) - 1, Math.max(minTile.x, maxTile.x) + 1);
      const minY_tile = Math.max(0, Math.min(minTile.y, maxTile.y) - 1);
      const maxY_tile = Math.min(Math.pow(2, zoom) - 1, Math.max(minTile.y, maxTile.y) + 1);

      if ((maxX_tile - minX_tile + 1) * (maxY_tile - minY_tile + 1) <= 100) {
        for (let tx = minX_tile; tx <= maxX_tile; tx++) {
          for (let ty = minY_tile; ty <= maxY_tile; ty++) {
            const tileBBox = tileToBBox(tx, ty, zoom);
            const tileSW_utm = lonLatToUtm(tileBBox.minLon, tileBBox.minLat, zNum, isSouth);
            const tileNE_utm = lonLatToUtm(tileBBox.maxLon, tileBBox.maxLat, zNum, isSouth);

            const pTL = toScreen(tileSW_utm.E, tileNE_utm.N);
            const pBR = toScreen(tileNE_utm.E, tileSW_utm.N);

            const tileWidth = pBR.x - pTL.x;
            const tileHeight = pBR.y - pTL.y;

            const url = getTileUrl(basemapProvider, tx, ty, zoom);
            const cachedImg = globalTileCache.get(url, () => {
              setRenderTick(t => t + 1);
            });

            if (cachedImg) {
              ctx.drawImage(cachedImg, pTL.x, pTL.y, tileWidth, tileHeight);
            }
          }
        }
      }
      ctx.restore();
    }

    // Draw Grid Lines (100m grid)
    ctx.strokeStyle = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const gridStep = spanX > 3000 ? 500 : spanX > 1000 ? 200 : 50;

    const startGridX = Math.floor(minX / gridStep) * gridStep;
    const endGridX = Math.ceil(maxX / gridStep) * gridStep;
    for (let gx = startGridX; gx <= endGridX; gx += gridStep) {
      const p1 = toScreen(gx, minY);
      const p2 = toScreen(gx, maxY);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    const startGridY = Math.floor(minY / gridStep) * gridStep;
    const endGridY = Math.ceil(maxY / gridStep) * gridStep;
    for (let gy = startGridY; gy <= endGridY; gy += gridStep) {
      const p1 = toScreen(minX, gy);
      const p2 = toScreen(maxX, gy);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw Geofences
    metricZones.forEach(z => {
      if (!z.enabled) return;
      const isSelected = z.id === selectedZoneId;

      ctx.fillStyle = z.color + Math.round((z.fillOpacity || 0.25) * 255).toString(16).padStart(2, '0');
      ctx.strokeStyle = z.color;
      ctx.lineWidth = isSelected ? 3.5 : 2;

      if (z.type === 'circle' && z.utmPts[0] && z.radiusMeters) {
        const sc = toScreen(z.utmPts[0].a, z.utmPts[0].b);
        const rScreen = z.radiusMeters * baseScale;

        // Buffer warning perimeter
        if (z.bufferWarningMeters) {
          const rWarn = (z.radiusMeters + (z.rule === 'keep_out' ? z.bufferWarningMeters : -z.bufferWarningMeters)) * baseScale;
          ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)'; // amber
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.arc(sc.x, sc.y, Math.max(2, rWarn), 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.strokeStyle = z.color;
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, rScreen, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Zone Center marker & Label
        ctx.fillStyle = '#ffffff';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${z.name} (${z.radiusMeters}m R)`, sc.x, sc.y - 8);
      } else if (z.type === 'polygon' && z.utmPts.length >= 3) {
        const screenPts = z.utmPts.map(p => toScreen(p.a, p.b));

        ctx.beginPath();
        ctx.moveTo(screenPts[0].x, screenPts[0].y);
        for (let i = 1; i < screenPts.length; i++) {
          ctx.lineTo(screenPts[i].x, screenPts[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Label at centroid
        const avgX = screenPts.reduce((sum, p) => sum + p.x, 0) / screenPts.length;
        const avgY = screenPts.reduce((sum, p) => sum + p.y, 0) / screenPts.length;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(z.name, avgX, avgY);
      } else if (z.type === 'corridor' && z.utmPts.length >= 2) {
        const screenPts = z.utmPts.map(p => toScreen(p.a, p.b));
        const halfW = ((z.corridorWidthMeters || 50) / 2) * baseScale;

        // Corridor Buffer Envelope
        ctx.strokeStyle = z.color;
        ctx.lineWidth = halfW * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = z.fillOpacity || 0.2;
        ctx.beginPath();
        ctx.moveTo(screenPts[0].x, screenPts[0].y);
        for (let i = 1; i < screenPts.length; i++) {
          ctx.lineTo(screenPts[i].x, screenPts[i].y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Centerline
        ctx.strokeStyle = z.color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(screenPts[0].x, screenPts[0].y);
        for (let i = 1; i < screenPts.length; i++) {
          ctx.lineTo(screenPts[i].x, screenPts[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Draw Drawing in Progress
    if (drawMode !== 'none' && newFencePts.length > 0) {
      const drawnScreenPts = newFencePts.map(p => {
        const u = lonLatToUtm(p.a, p.b, zNum, isSouth);
        return toScreen(u.E, u.N);
      });

      ctx.strokeStyle = '#f59e0b'; // amber-500
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(drawnScreenPts[0].x, drawnScreenPts[0].y);
      for (let i = 1; i < drawnScreenPts.length; i++) {
        ctx.lineTo(drawnScreenPts[i].x, drawnScreenPts[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      drawnScreenPts.forEach((p, idx) => {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px sans-serif';
        ctx.fillText(`V${idx + 1}`, p.x + 8, p.y + 3);
      });
    }

    // Draw Breadcrumb History
    if (trackHistory.length > 1) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'; // sky-400
      ctx.lineWidth = 2;
      ctx.beginPath();
      const firstU = lonLatToUtm(trackHistory[0].lon, trackHistory[0].lat, zNum, isSouth);
      const firstScr = toScreen(firstU.E, firstU.N);
      ctx.moveTo(firstScr.x, firstScr.y);

      for (let i = 1; i < trackHistory.length; i++) {
        const u = lonLatToUtm(trackHistory[i].lon, trackHistory[i].lat, zNum, isSouth);
        const s = toScreen(u.E, u.N);
        ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    }

    // Draw Live Rover Position & Vector
    const rScr = toScreen(roverUtm.E, roverUtm.N);

    // Pulsing breach ring if under active alarm
    if (activeBreachAlert) {
      ctx.strokeStyle = activeBreachAlert.severity === 'critical' ? '#ef4444' : '#f59e0b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rScr.x, rScr.y, 22 + Math.sin(Date.now() / 150) * 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Accuracy Circle
    const rAcc = Math.max(6, (roverPos.acc || 2) * baseScale);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(rScr.x, rScr.y, rAcc, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Rover Heading Cone
    const headingRad = ((roverPos.heading - 90) * Math.PI) / 180;
    const tipX = rScr.x + 22 * Math.cos(headingRad);
    const tipY = rScr.y + 22 * Math.sin(headingRad);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(rScr.x, rScr.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Rover Center Dot
    ctx.fillStyle = activeBreachAlert ? '#ef4444' : '#38bdf8';
    ctx.beginPath();
    ctx.arc(rScr.x, rScr.y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rover Telemetry Badge
    ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = isDark ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rScr.x + 12, rScr.y - 28, 120, 36, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`ROVER: ${roverPos.speedKmh} km/h`, rScr.x + 18, rScr.y - 14);
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.font = '10px monospace';
    ctx.fillText(`${roverPos.lat.toFixed(5)}°, ${roverPos.lon.toFixed(5)}°`, rScr.x + 18, rScr.y - 1);

    // Scale Bar in lower left
    const scaleBarMeters = spanX > 2000 ? 500 : spanX > 500 ? 100 : 25;
    const scaleBarPx = scaleBarMeters * baseScale;
    ctx.strokeStyle = isDark ? '#ffffff' : '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, height - 25);
    ctx.lineTo(20 + scaleBarPx, height - 25);
    ctx.stroke();

    ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
    ctx.font = '10px monospace';
    ctx.fillText(`${scaleBarMeters} m`, 20 + scaleBarPx / 2 - 12, height - 32);

  }, [metricZones, selectedZoneId, roverUtm, roverPos, trackHistory, activeBreachAlert, drawMode, newFencePts, zoomLevel, panOffset, zNum, isSouth, isDark, showBasemap, basemapProvider, basemapOpacity]);

  // Touch Event Listeners for Mobile Pinch Zoom & Pan
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();

      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

        touchStateRef.current = {
          isPinching: true,
          startDist: Math.max(10, dist),
          startZoom: zoomLevel,
          startOffset: { ...panOffset },
          startTouch: { x: midX, y: midY },
          startTime: Date.now(),
          hasMoved: false
        };
        setIsDragging(false);
        return;
      }

      if (e.touches.length === 1) {
        const t = e.touches[0];
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;

        touchStateRef.current = {
          isPinching: false,
          startDist: 0,
          startZoom: zoomLevel,
          startOffset: { ...panOffset },
          startTouch: { x: sx, y: sy },
          startTime: Date.now(),
          hasMoved: false
        };
        setIsDragging(true);
        setDragStart({ x: t.clientX - panOffset.x, y: t.clientY - panOffset.y });
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();

      if (e.touches.length === 2 && touchStateRef.current.isPinching) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

        const zoomRatio = dist / touchStateRef.current.startDist;
        const newZoom = Math.max(0.3, Math.min(8, touchStateRef.current.startZoom * zoomRatio));
        setZoomLevel(newZoom);
        touchStateRef.current.hasMoved = true;
        return;
      }

      if (e.touches.length === 1) {
        const t = e.touches[0];
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;

        const distTouch = Math.hypot(sx - touchStateRef.current.startTouch.x, sy - touchStateRef.current.startTouch.y);
        if (distTouch > 5) {
          touchStateRef.current.hasMoved = true;
        }

        const dx = sx - touchStateRef.current.startTouch.x;
        const dy = sy - touchStateRef.current.startTouch.y;
        setPanOffset({
          x: touchStateRef.current.startOffset.x + dx,
          y: touchStateRef.current.startOffset.y + dy
        });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const duration = Date.now() - touchStateRef.current.startTime;

      if (!touchStateRef.current.hasMoved && duration < 300 && drawMode !== 'none') {
        const rect = cv.getBoundingClientRect();
        const clickX = touchStateRef.current.startTouch.x;
        const clickY = touchStateRef.current.startTouch.y;

        const allPts: { x: number; y: number }[] = [];
        metricZones.forEach(z => z.utmPts.forEach(pt => allPts.push({ x: pt.a, y: pt.b })));
        allPts.push({ x: roverUtm.E, y: roverUtm.N });
        let minX = Math.min(...allPts.map(p => p.x));
        let maxX = Math.max(...allPts.map(p => p.x));
        let minY = Math.min(...allPts.map(p => p.y));
        let maxY = Math.max(...allPts.map(p => p.y));
        const spanX = Math.max(200, maxX - minX);
        const spanY = Math.max(200, maxY - minY);
        minX -= spanX * 0.25; maxX += spanX * 0.25;
        minY -= spanY * 0.25; maxY += spanY * 0.25;
        const baseScale = Math.min((cv.width - 80) / (maxX - minX), (cv.height - 80) / (maxY - minY)) * zoomLevel;

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const utmE = cx + (clickX - cv.width / 2 - panOffset.x) / baseScale;
        const utmN = cy - (clickY - cv.height / 2 - panOffset.y) / baseScale;

        const ll = utmToLonLat(utmE, utmN, zNum, isSouth);
        setNewFencePts(prev => [...prev, { a: ll.lon, b: ll.lat }]);
        if (vibrationEnabled) {
          triggerVertexAddedHaptic();
        }
      }

      setIsDragging(false);
      touchStateRef.current.isPinching = false;
    };

    const onTouchCancel = (e: TouchEvent) => {
      e.preventDefault();
      setIsDragging(false);
      touchStateRef.current.isPinching = false;
    };

    cv.addEventListener('touchstart', onTouchStart, { passive: false });
    cv.addEventListener('touchmove', onTouchMove, { passive: false });
    cv.addEventListener('touchend', onTouchEnd, { passive: false });
    cv.addEventListener('touchcancel', onTouchCancel, { passive: false });

    return () => {
      cv.removeEventListener('touchstart', onTouchStart);
      cv.removeEventListener('touchmove', onTouchMove);
      cv.removeEventListener('touchend', onTouchEnd);
      cv.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [zoomLevel, panOffset, drawMode, metricZones, roverUtm, zNum, isSouth, vibrationEnabled]);

  // Handle Canvas Mouse Interactions
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawMode !== 'none') {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Inverse projection to UTM then Lon/Lat
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = canvas.width;
      const height = canvas.height;

      const allPts: { x: number; y: number }[] = [];
      metricZones.forEach(z => z.utmPts.forEach(pt => allPts.push({ x: pt.a, y: pt.b })));
      allPts.push({ x: roverUtm.E, y: roverUtm.N });
      let minX = Math.min(...allPts.map(p => p.x));
      let maxX = Math.max(...allPts.map(p => p.x));
      let minY = Math.min(...allPts.map(p => p.y));
      let maxY = Math.max(...allPts.map(p => p.y));
      const spanX = Math.max(200, maxX - minX);
      const spanY = Math.max(200, maxY - minY);
      minX -= spanX * 0.25; maxX += spanX * 0.25;
      minY -= spanY * 0.25; maxY += spanY * 0.25;
      const baseScale = Math.min((width - 80) / (maxX - minX), (height - 80) / (maxY - minY)) * zoomLevel;

      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const utmE = cx + (clickX - width / 2 - panOffset.x) / baseScale;
      const utmN = cy - (clickY - height / 2 - panOffset.y) / baseScale;

      const ll = utmToLonLat(utmE, utmN, zNum, isSouth);
      setNewFencePts(prev => [...prev, { a: ll.lon, b: ll.lat }]);
      if (vibrationEnabled) {
        triggerVertexAddedHaptic();
      }
      return;
    }

    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;

    const allPts: { x: number; y: number }[] = [];
    metricZones.forEach(z => z.utmPts.forEach(pt => allPts.push({ x: pt.a, y: pt.b })));
    allPts.push({ x: roverUtm.E, y: roverUtm.N });
    let minX = Math.min(...allPts.map(p => p.x));
    let maxX = Math.max(...allPts.map(p => p.x));
    let minY = Math.min(...allPts.map(p => p.y));
    let maxY = Math.max(...allPts.map(p => p.y));
    const spanX = Math.max(200, maxX - minX);
    const spanY = Math.max(200, maxY - minY);
    minX -= spanX * 0.25; maxX += spanX * 0.25;
    minY -= spanY * 0.25; maxY += spanY * 0.25;
    const baseScale = Math.min((width - 80) / (maxX - minX), (height - 80) / (maxY - minY)) * zoomLevel;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const utmE = cx + (clickX - width / 2 - panOffset.x) / baseScale;
    const utmN = cy - (clickY - height / 2 - panOffset.y) / baseScale;
    const ll = utmToLonLat(utmE, utmN, zNum, isSouth);
    setHoveredCoord({ lat: ll.lat, lon: ll.lon, utmE, utmN });
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  // Complete Drawing New Geofence
  const handleFinishDrawing = () => {
    if (newFencePts.length < (drawMode === 'circle' ? 1 : drawMode === 'corridor' ? 2 : 3)) {
      toast.showWarning(`Please click at least ${drawMode === 'circle' ? 1 : drawMode === 'corridor' ? 2 : 3} points on the map.`);
      return;
    }

    const newZone: GeofenceZone = {
      id: `gf-cust-${Date.now()}`,
      name: `Custom ${drawMode.toUpperCase()} Zone ${zones.length + 1}`,
      type: drawMode as GeofenceType,
      rule: drawMode === 'corridor' ? 'corridor_tracking' : 'keep_in',
      severity: 'high',
      enabled: true,
      color: '#3b82f6',
      fillOpacity: 0.25,
      coordinates: drawMode === 'polygon' && newFencePts.length > 2 ? [...newFencePts, newFencePts[0]] : newFencePts,
      radiusMeters: drawMode === 'circle' ? 150 : undefined,
      corridorWidthMeters: drawMode === 'corridor' ? 60 : undefined,
      bufferWarningMeters: 20,
      description: 'Surveyor digitized geofence boundary.',
      category: 'Field Boundaries',
      kind: 'll'
    };

    setZones(prev => [...prev, newZone]);
    if (vibrationEnabled) {
      triggerWaypointAddedHaptic();
    }
    setSelectedZoneId(newZone.id);
    setDrawMode('none');
    setNewFencePts([]);
    toast.showSuccess(`Created new geofence: ${newZone.name}`);
  };

  // Import Geofences from GIS Files & Archives
  const handleImportGeofenceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let importedZones: GeofenceZone[] = [];

      if (ext === 'zip' || ext === 'kmz') {
        const buf = await file.arrayBuffer();
        const datasets = await extractAllFeaturesFromZip(buf, zNum, isSouth);
        datasets.forEach(ds => {
          ds.features.forEach((feat, idx) => {
            if (feat.pts && feat.pts.length > 0) {
              const isCircle = feat.geom === 'point';
              const isCorr = feat.geom === 'line';
              importedZones.push({
                id: `gf-imp-${Date.now()}-${idx}`,
                name: feat.name || `${ds.layerName}_${idx + 1}`,
                type: isCircle ? 'circle' : isCorr ? 'corridor' : 'polygon',
                rule: 'keep_in',
                severity: 'warning',
                enabled: true,
                color: '#10b981',
                fillOpacity: 0.25,
                coordinates: feat.pts,
                radiusMeters: isCircle ? 100 : undefined,
                corridorWidthMeters: isCorr ? 50 : undefined,
                bufferWarningMeters: 15,
                description: `Imported from ${file.name} (${ds.format})`,
                kind: feat.kind
              });
            }
          });
        });
      } else {
        const text = stripBOM(await file.text());
        if (ext === 'geojson' || ext === 'json') {
          const parsed = JSON.parse(text);
          const feats = parsed.features || (parsed.type === 'Feature' ? [parsed] : []);
          feats.forEach((f: any, idx: number) => {
            const geom = f.geometry;
            if (!geom) return;
            if (geom.type === 'Polygon' && geom.coordinates && geom.coordinates[0]) {
              importedZones.push({
                id: `gf-imp-${Date.now()}-${idx}`,
                name: f.properties?.name || `Polygon_${idx + 1}`,
                type: 'polygon',
                rule: 'keep_in',
                severity: 'warning',
                enabled: true,
                color: '#3b82f6',
                fillOpacity: 0.25,
                coordinates: geom.coordinates[0].map((c: any) => ({ a: c[0], b: c[1] })),
                bufferWarningMeters: 15,
                kind: 'll'
              });
            }
          });
        }
      }

      if (importedZones.length > 0) {
        setZones(prev => [...prev, ...importedZones]);
        toast.showSuccess(`Successfully imported ${importedZones.length} geofence boundaries from ${file.name}`);
      } else {
        toast.showWarning('No compatible polygon or line boundaries found in file.');
      }
    } catch (err: any) {
      toast.showError(`Error reading geofence file: ${err.message}`);
    }
  };

  // Export Geofences
  const handleExportZonesGeoJSON = () => {
    const geoJsonFeats = zones.map(z => {
      let geom: any = null;
      if (z.type === 'polygon') {
        geom = {
          type: 'Polygon',
          coordinates: [z.coordinates.map(p => [p.a, p.b])]
        };
      } else if (z.type === 'corridor') {
        geom = {
          type: 'LineString',
          coordinates: z.coordinates.map(p => [p.a, p.b])
        };
      } else {
        geom = {
          type: 'Point',
          coordinates: [z.coordinates[0]?.a || 0, z.coordinates[0]?.b || 0]
        };
      }
      return {
        type: 'Feature',
        geometry: geom,
        properties: {
          name: z.name,
          rule: z.rule,
          severity: z.severity,
          type: z.type,
          radiusMeters: z.radiusMeters,
          corridorWidthMeters: z.corridorWidthMeters,
          speedLimitKmh: z.speedLimitKmh
        }
      };
    });

    const out = JSON.stringify({ type: 'FeatureCollection', features: geoJsonFeats }, null, 2);
    downloadBlob(new TextEncoder().encode(out), 'geofence_zones.geojson', 'application/geo+json');
    toast.showSuccess('Exported geofences as GeoJSON');
  };

  // Export Breach Ledger as CSV
  const handleExportBreachCSV = () => {
    if (breachEvents.length === 0) {
      toast.showWarning('No breach events logged yet.');
      return;
    }
    const headers = ['Timestamp', 'DateTime', 'FenceName', 'EventType', 'Severity', 'Latitude', 'Longitude', 'UTM_E', 'UTM_N', 'Speed_kmh', 'Heading', 'DistanceToBorder_m', 'Message'];
    const rows = breachEvents.map(e => [
      e.timestamp.toString(),
      new Date(e.timestamp).toISOString(),
      e.fenceName,
      e.eventType,
      e.severity,
      e.lat.toFixed(6),
      e.lon.toFixed(6),
      e.utmE ? e.utmE.toFixed(2) : '',
      e.utmN ? e.utmN.toFixed(2) : '',
      e.speedKmh.toFixed(1),
      e.heading ? e.heading.toString() : '',
      e.distanceToBoundaryMeters.toFixed(2),
      e.message
    ]);

    const csv = toCSVtext(headers, rows);
    downloadBlob(new TextEncoder().encode(csv), 'geofence_breach_audit_log.csv', 'text/csv;charset=utf-8');
    toast.showSuccess('Exported Geofence Breach Audit Log (.csv)');
  };

  // Send Geofences to GIS Studio
  const handleSendToGisStudio = () => {
    if (!onSendToGis) {
      toast.showInfo('GIS Studio connector is active.');
      return;
    }
    const feats: GeoFeature[] = zones.map(z => ({
      name: z.name,
      geom: z.type === 'circle' ? 'point' : z.type === 'corridor' ? 'line' : 'polygon',
      kind: z.kind,
      pts: z.coordinates,
      props: {
        Rule: z.rule,
        Severity: z.severity,
        Type: z.type,
        Radius_m: z.radiusMeters || '',
        Corridor_m: z.corridorWidthMeters || ''
      }
    }));
    onSendToGis(feats);
    toast.showSuccess(`Transferred ${feats.length} Geofence boundary layers to GIS Map Studio!`);
  };

  const selectedZone = zones.find(z => z.id === selectedZoneId);

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6 max-w-7xl mx-auto w-full">
      {/* Top Header & Mission Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-white">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30 shadow-inner">
            <ShieldAlert className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Geofence Studio & Boundary Sentinel</h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-950 text-red-300 font-semibold border border-red-800/60">
                PRO ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              High-precision geofencing, keep-out hazard exclusions, corridor flight buffers, and real-time GNSS rover telemetry.
            </p>
          </div>
        </div>

        {/* Global Controls & Mode Selector */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-slate-800/90 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setTrackingMode('sim')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                trackingMode === 'sim' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Route Simulator
            </button>
            <button
              onClick={() => setTrackingMode('gps')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                trackingMode === 'gps' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5 animate-spin" />
              Live GNSS GPS
            </button>
          </div>

          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
            }}
            className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all ${
              soundEnabled ? 'bg-slate-800 text-emerald-400 border-emerald-500/40' : 'bg-slate-800/60 text-slate-500 border-slate-700'
            }`}
            title={soundEnabled ? 'Audio Alarms Active (Click to Mute)' : 'Audio Alarms Muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              const next = !vibrationEnabled;
              setVibrationEnabled(next);
              try { localStorage.setItem('geo_geofence_haptics', String(next)); } catch {}
              if (next) {
                triggerGeofenceBreachHaptic('critical');
              }
            }}
            className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all ${
              vibrationEnabled ? 'bg-slate-800 text-[#c9a063] border-[#c9a063]/40' : 'bg-slate-800/60 text-slate-500 border-slate-700'
            }`}
            title={vibrationEnabled ? 'Physical Vibration Active (Click to Mute / Test)' : 'Physical Vibration Muted'}
          >
            <Activity className="w-4 h-4" />
            <span className="hidden sm:inline text-[11px] font-mono">
              {vibrationEnabled ? (isVibrationSupported() ? 'Haptics ON' : 'Haptics (Emulated)') : 'Haptics OFF'}
            </span>
          </button>

          <button
            onClick={handleSendToGisStudio}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow transition-all"
          >
            <Layers className="w-4 h-4" />
            Send to GIS Studio
          </button>
        </div>
      </div>

      {/* Real-Time Breach Alert Banner */}
      {activeBreachAlert && (
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 shadow-lg animate-bounce transition-all ${
          activeBreachAlert.severity === 'critical'
            ? 'bg-red-950/90 border-red-500 text-red-200'
            : activeBreachAlert.severity === 'high'
            ? 'bg-orange-950/90 border-orange-500 text-orange-200'
            : 'bg-amber-950/90 border-amber-500 text-amber-200'
        }`}>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 animate-spin" />
            <div>
              <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-red-900/60 border border-red-700 mr-2">
                {activeBreachAlert.severity} ALERT
              </span>
              <span className="text-sm font-semibold">{activeBreachAlert.message}</span>
            </div>
          </div>
          <div className="text-right text-xs opacity-80 hidden sm:block">
            Zone: <span className="font-bold underline">{activeBreachAlert.fenceName}</span>
          </div>
        </div>
      )}

      {/* Main Grid: Radar Viewport & Control Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Interactive Radar Canvas Viewport */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-3 relative">
            {/* Viewport Top Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 z-10">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-blue-400" />
                  Tactical Vector Radar ({workingZone})
                </span>

                {/* Map Imagery Toggle */}
                <label className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showBasemap}
                    onChange={e => setShowBasemap(e.target.checked)}
                    className="rounded border-slate-600 text-blue-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 bg-slate-900"
                  />
                  <Globe className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Imagery</span>
                </label>

                {showBasemap && (
                  <select
                    value={basemapProvider}
                    onChange={e => setBasemapProvider(e.target.value as ImageryProvider)}
                    className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-2 py-0.5 text-xs"
                  >
                    <option value="google_satellite">Google Satellite</option>
                    <option value="google_hybrid">Google Hybrid</option>
                    <option value="google_streets">Google Streets</option>
                    <option value="osm_standard">OpenStreetMap</option>
                    <option value="opentopo">OpenTopoMap</option>
                  </select>
                )}
              </div>

              {/* Draw Toolbar */}
              <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
                <button
                  onClick={() => { setDrawMode(drawMode === 'polygon' ? 'none' : 'polygon'); setNewFencePts([]); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                    drawMode === 'polygon' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Plus className="w-3 h-3" /> Draw Polygon
                </button>
                <button
                  onClick={() => { setDrawMode(drawMode === 'circle' ? 'none' : 'circle'); setNewFencePts([]); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                    drawMode === 'circle' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Plus className="w-3 h-3" /> Draw Circle
                </button>
                <button
                  onClick={() => { setDrawMode(drawMode === 'corridor' ? 'none' : 'corridor'); setNewFencePts([]); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                    drawMode === 'corridor' ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Plus className="w-3 h-3" /> Corridor Path
                </button>

                {drawMode !== 'none' && (
                  <button
                    onClick={handleFinishDrawing}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold"
                  >
                    Finish ({newFencePts.length} pts)
                  </button>
                )}
              </div>

              {/* Zoom & Pan Controls */}
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
                <button
                  onClick={() => setZoomLevel(prev => Math.min(prev * 1.3, 5))}
                  className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-700"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomLevel(prev => Math.max(prev / 1.3, 0.3))}
                  className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-700"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
                  className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-700"
                  title="Reset View"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Canvas Viewport */}
            <div className="relative w-full h-[480px] bg-slate-100 dark:bg-slate-950 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 flex items-center justify-center cursor-crosshair">
              <canvas
                ref={canvasRef}
                width={800}
                height={480}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                className="w-full h-full object-contain bg-slate-50 dark:bg-slate-950"
              />

              {/* Cursor Coordinates Overlay */}
              {hoveredCoord && (
                <div className="absolute bottom-3 right-3 bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-lg px-3 py-1.5 text-[11px] font-mono text-slate-300 shadow">
                  <span>Lat: {hoveredCoord.lat.toFixed(5)}° | Lon: {hoveredCoord.lon.toFixed(5)}°</span>
                  <span className="text-slate-500 mx-1.5">|</span>
                  <span className="text-blue-400">E: {hoveredCoord.utmE.toFixed(1)}m | N: {hoveredCoord.utmN.toFixed(1)}m</span>
                </div>
              )}
            </div>

            {/* Simulation Playback Bar (if simulation mode active) */}
            {trackingMode === 'sim' && (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/80 border border-slate-700 rounded-xl p-3 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSimPlaying(!simPlaying)}
                    className={`p-2 rounded-lg text-white font-medium flex items-center gap-1.5 ${
                      simPlaying ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'
                    }`}
                  >
                    {simPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {simPlaying ? 'Pause Simulation' : 'Resume Flight'}
                  </button>

                  <button
                    onClick={() => { simStepRef.current = 0; setTrackHistory([]); }}
                    className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset Path
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-slate-400">Sim Speed:</span>
                  {[1, 2, 4].map(s => (
                    <button
                      key={s}
                      onClick={() => setSimSpeedFactor(s)}
                      className={`px-2 py-0.5 rounded font-bold ${
                        simSpeedFactor === s ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 text-slate-300">
                  <span>Speed: <strong className="text-blue-400">{roverPos.speedKmh} km/h</strong></span>
                  <span>Heading: <strong className="text-emerald-400">{roverPos.heading}°</strong></span>
                  <span>GPS Acc: <strong className="text-slate-200">±{roverPos.acc}m</strong></span>
                </div>
              </div>
            )}
          </div>

          {/* Breach Ledger & Incident Audit Log */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-bold text-slate-200">Breach Events & Incident Audit Log</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                  {breachEvents.length} events
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportBreachCSV}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Export CSV Audit
                </button>
                <button
                  onClick={() => setBreachEvents([])}
                  className="p-1 text-slate-500 hover:text-red-400 rounded"
                  title="Clear Event Log"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800/80 bg-slate-950 font-mono text-xs">
              {breachEvents.length === 0 ? (
                <div className="p-4 text-center text-slate-500 italic">
                  No boundary breaches or speed violations recorded. All active zones secure.
                </div>
              ) : (
                breachEvents.map(evt => (
                  <div key={evt.id} className="p-2.5 flex items-center justify-between gap-3 hover:bg-slate-900/60">
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        evt.severity === 'critical' ? 'bg-red-950 text-red-400 border border-red-800' :
                        evt.severity === 'high' ? 'bg-orange-950 text-orange-400 border border-orange-800' :
                        'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}>
                        {evt.eventType}
                      </span>
                      <span className="text-slate-300 font-sans text-xs">{evt.message}</span>
                    </div>
                    <div className="text-right text-[11px] text-slate-400 flex items-center gap-3">
                      <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                      <span className="text-slate-500">{evt.speedKmh} km/h</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Active Geofence Zones & Parameters */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Zones Manager Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-slate-200">Active Geofence Zones</h2>
              </div>

              {/* Import / Export Menu */}
              <div className="flex items-center gap-1.5">
                <label className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer" title="Import Shapefile ZIP / GeoJSON / KML">
                  <FolderArchive className="w-3.5 h-3.5" />
                  <input type="file" accept=".zip,.kmz,.kml,.geojson,.json" onChange={handleImportGeofenceFile} className="hidden" />
                </label>
                <button
                  onClick={handleExportZonesGeoJSON}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                  title="Export GeoJSON"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Zone List */}
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              {zones.map(z => {
                const isSel = z.id === selectedZoneId;
                return (
                  <div
                    key={z.id}
                    onClick={() => setSelectedZoneId(z.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                      isSel ? 'bg-slate-800/90 border-blue-500 shadow-md' : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shadow-inner"
                          style={{ backgroundColor: z.color }}
                        />
                        <span className="font-semibold text-xs text-slate-200">{z.name}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setZones(zones.map(item => item.id === z.id ? { ...item, enabled: !item.enabled } : item));
                          }}
                          className={`p-1 rounded ${z.enabled ? 'text-emerald-400' : 'text-slate-600'}`}
                          title={z.enabled ? 'Enabled' : 'Disabled'}
                        >
                          {z.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setZones(zones.filter(item => item.id !== z.id));
                          }}
                          className="p-1 text-slate-500 hover:text-red-400 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] uppercase font-bold text-slate-300">
                        {z.type}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-950/70 border border-blue-800 text-[10px] font-semibold text-blue-300">
                        Rule: {z.rule.replace('_', ' ')}
                      </span>
                      {z.radiusMeters && <span>R: {z.radiusMeters}m</span>}
                      {z.corridorWidthMeters && <span>Corridor: {z.corridorWidthMeters}m</span>}
                      {z.speedLimitKmh && <span>Max: {z.speedLimitKmh} km/h</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Zone Inspector & Parameter Tuning */}
          {selectedZone && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Zone Policy & Security Rules
                </span>
                <span className="text-[11px] font-mono text-slate-500">{selectedZone.id}</span>
              </div>

              <div className="flex flex-col gap-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Zone Name</label>
                  <input
                    type="text"
                    value={selectedZone.name}
                    onChange={e => setZones(zones.map(z => z.id === selectedZone.id ? { ...z, name: e.target.value } : z))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Policy Rule</label>
                    <select
                      value={selectedZone.rule}
                      onChange={e => setZones(zones.map(z => z.id === selectedZone.id ? { ...z, rule: e.target.value as GeofenceRule } : z))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none"
                    >
                      <option value="keep_in">Keep In (Boundary Containment)</option>
                      <option value="keep_out">Keep Out (Hazard / Blasting)</option>
                      <option value="corridor_tracking">Corridor Tracking (UAV)</option>
                      <option value="speed_limit">Speed Limit Enforced</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Alert Severity</label>
                    <select
                      value={selectedZone.severity}
                      onChange={e => setZones(zones.map(z => z.id === selectedZone.id ? { ...z, severity: e.target.value as GeofenceSeverity } : z))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200 focus:outline-none"
                    >
                      <option value="critical">Critical (Blasting / Danger)</option>
                      <option value="high">High</option>
                      <option value="warning">Warning</option>
                      <option value="info">Info</option>
                    </select>
                  </div>
                </div>

                {selectedZone.type === 'circle' && (
                  <div>
                    <label className="text-slate-400 block mb-1">Radius (Meters)</label>
                    <input
                      type="number"
                      value={selectedZone.radiusMeters || 100}
                      onChange={e => setZones(zones.map(z => z.id === selectedZone.id ? { ...z, radiusMeters: parseFloat(e.target.value) || 100 } : z))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200"
                    />
                  </div>
                )}

                {selectedZone.type === 'corridor' && (
                  <div>
                    <label className="text-slate-400 block mb-1">Corridor Buffer Width (Meters)</label>
                    <input
                      type="number"
                      value={selectedZone.corridorWidthMeters || 50}
                      onChange={e => setZones(zones.map(z => z.id === selectedZone.id ? { ...z, corridorWidthMeters: parseFloat(e.target.value) || 50 } : z))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">Warning Buffer (m)</label>
                    <input
                      type="number"
                      value={selectedZone.bufferWarningMeters || 15}
                      onChange={e => setZones(zones.map(z => z.id === selectedZone.id ? { ...z, bufferWarningMeters: parseFloat(e.target.value) || 0 } : z))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Speed Limit (km/h)</label>
                    <input
                      type="number"
                      value={selectedZone.speedLimitKmh || 40}
                      onChange={e => setZones(zones.map(z => z.id === selectedZone.id ? { ...z, speedLimitKmh: parseFloat(e.target.value) || 0 } : z))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Zone Theme Color</label>
                  <div className="flex items-center gap-2">
                    {['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'].map(c => (
                      <button
                        key={c}
                        onClick={() => setZones(zones.map(z => z.id === selectedZone.id ? { ...z, color: c } : z))}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          selectedZone.color === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
