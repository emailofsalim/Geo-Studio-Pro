import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useIsDarkMode } from '../hooks/useIsDarkMode';
import { useManagedResource } from '../hooks/useHardwareResource';
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
  Volume1,
  Satellite,
  BarChart3,
  TrendingUp,
  Activity,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  Sliders,
  Eye,
  History,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  Undo2,
  Redo2,
  Camera,
  Mic,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Map as MapIcon,
  Upload,
  Footprints
} from 'lucide-react';
import { GeoFeature, SurveyWaypoint, SurveyTrack, TrackPoint, ProximityAlarmSettings, ProximityAlarmEvent } from '../types';
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
import { proximityAudio, ProximitySoundProfile } from '../lib/audioAlerts';
import {
  triggerWaypointAddedHaptic,
  triggerProximityAlertHaptic,
  isVibrationSupported,
  triggerHaptic,
  HAPTIC_PATTERNS
} from '../lib/haptics';
import { deduplicateSurveyWaypoints } from '../lib/deduplication';
import { useToast } from '../context/ToastContext';
import { useProject } from '../context/ProjectContext';
import { ArStakeoutView } from './hardware/ArStakeoutView';
import { MapTilesStakeoutView } from './hardware/MapTilesStakeoutView';
import { ImportWaypointsModal } from './ImportWaypointsModal';
import {
  calculateStakeoutGuidance,
  parseSurveyVoiceCommand,
  StakeoutGuidance
} from '../lib/voiceCommander';
import {
  speakVoiceAnnouncement,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported
} from '../lib/hardwareComms';

interface GpsSurveyorTabProps {
  workingZone: string;
  distanceUnit?: 'm' | 'ft';
  onSendToGis?: (features: GeoFeature[]) => void;
  onSendToCalculator?: (csv: string) => void;
  onSendToOffset?: (pts: { lon: number; lat: number }[]) => void;
}

const DEFAULT_INITIAL_WAYPOINTS: SurveyWaypoint[] = [
  {
    id: 'CP-01',
    code: 'Boundary Pillar',
    E: 254820.0,
    N: 2605240.0,
    Z: 542.5,
    lat: 23.5415,
    lon: 84.6018,
    acc: 0.8,
    zone: '45N',
    time: Date.now() - 3600000,
    remarks: 'Concrete benchmark monument with brass center pin',
    proximityRadius: 10
  },
  {
    id: 'CP-02',
    code: 'Triangulation Station',
    E: 255150.0,
    N: 2605380.0,
    Z: 554.2,
    lat: 23.5428,
    lon: 84.6050,
    acc: 0.5,
    zone: '45N',
    time: Date.now() - 1800000,
    remarks: 'Survey of India secondary pillar',
    proximityRadius: 15
  },
  {
    id: 'BH-01',
    code: 'Exploration Collar',
    E: 254920.0,
    N: 2605150.0,
    Z: 540.0,
    lat: 23.5407,
    lon: 84.6028,
    acc: 1.2,
    zone: '45N',
    time: Date.now() - 900000,
    remarks: 'Diamond core drillhole collar casing',
    proximityRadius: 8
  }
];

// Generate GPX 1.1 XML string
function exportToGPX(waypoints: SurveyWaypoint[], trackName: string, trackPoints: TrackPoint[]): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<gpx version="1.1" creator="BhuNex Studio Geomatics Engine" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  xml += `  <metadata>\n    <name>${trackName || 'BhuNex Studio Survey Session'}</name>\n    <time>${new Date().toISOString()}</time>\n  </metadata>\n`;

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
  distanceUnit = 'm',
  onSendToGis,
  onSendToCalculator,
  onSendToOffset
}) => {
  const toast = useToast();
  const managedResource = useManagedResource('gps_surveyor_tab', 'GNSS RTK & Waypoints Surveyor');
  const { activeProject, activeProjectId, activeProjectData, updateActiveProjectData } = useProject();

  // Hook for active Dark / Light mode detection
  const isDark = useIsDarkMode();

  // Active Tab: 'cockpit' | 'averaging' | 'stakeout_director' | 'map_stakeout' | 'ar_stakeout' | 'navigation' | 'trip' | 'satellites' | 'waypoints'
  const [subTab, setSubTab] = useState<'cockpit' | 'averaging' | 'stakeout_director' | 'map_stakeout' | 'ar_stakeout' | 'navigation' | 'trip' | 'satellites' | 'waypoints'>('cockpit');
  const [directorMode, setDirectorMode] = useState<'map' | 'ar' | 'compass'>('map');
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // Dynamic Movement / Course-Over-Ground (COG) Tracking State
  const [motionHeading, setMotionHeading] = useState<number | null>(null);
  const [isMoving, setIsMoving] = useState<boolean>(false);
  const lastPosRef = useRef<{ E: number; N: number; time: number } | null>(null);

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

  // Project-Isolated Waypoint Collector State
  const [waypoints, setWaypoints] = useState<SurveyWaypoint[]>(() => {
    return activeProjectData?.waypoints && activeProjectData.waypoints.length > 0
      ? activeProjectData.waypoints
      : DEFAULT_INITIAL_WAYPOINTS;
  });

  // Keep waypoints synced with active project
  useEffect(() => {
    if (activeProjectData?.waypoints) {
      setWaypoints(activeProjectData.waypoints);
    }
  }, [activeProjectId, activeProjectData?.waypoints]);

  // Waypoints Undo / Redo History Stack
  const [wpHistory, setWpHistory] = useState<SurveyWaypoint[][]>([
    activeProjectData?.waypoints && activeProjectData.waypoints.length > 0
      ? activeProjectData.waypoints
      : DEFAULT_INITIAL_WAYPOINTS
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const [activeWaypointIndex, setActiveWaypointIndex] = useState<number>(0);
  const [wpId, setWpId] = useState('WP-001');
  const [wpCode, setWpCode] = useState('Boundary Pillar');
  const [wpElev, setWpElev] = useState('');
  const [wpRemarks, setWpRemarks] = useState('');
  const [wpSearch, setWpSearch] = useState('');
  const [wpCustomRadius, setWpCustomRadius] = useState<string>('10');

  // Spoken Turn-by-Turn Voice Guidance for Navigation and AR
  const [voiceNavActive, setVoiceNavActive] = useState<boolean>(false);
  const [voiceNavIntervalSec, setVoiceNavIntervalSec] = useState<number>(5);
  const lastSpokenNavTimeRef = useRef<number>(0);

  // Helper to commit changes to waypoints with Undo/Redo tracking and authoritative project update
  const updateWaypointsWithHistory = useCallback((action: SurveyWaypoint[] | ((prev: SurveyWaypoint[]) => SurveyWaypoint[]), message?: string) => {
    const currentProjId = activeProjectId || activeProject?.id || 'project_pakhar_2026';
    setWaypoints(prev => {
      const nextRaw = typeof action === 'function' ? action(prev) : action;
      const next = nextRaw.map(w => ({ ...w, projectId: currentProjId }));

      setWpHistory(hist => {
        const sliced = hist.slice(0, historyIndex + 1);
        sliced.push(next);
        if (sliced.length > 50) sliced.shift();
        return sliced;
      });
      setHistoryIndex(prevIdx => Math.min(prevIdx + 1, 49));

      // Update authoritative ProjectContext state (which saves to IndexedDB)
      updateActiveProjectData(old => ({
        ...old,
        waypoints: next
      }));

      return next;
    });
  }, [historyIndex, activeProjectId, activeProject, updateActiveProjectData]);

  const handleUndoWaypoints = useCallback(() => {
    if (historyIndex > 0) {
      const targetIdx = historyIndex - 1;
      const targetState = wpHistory[targetIdx];
      setWaypoints(targetState);
      setHistoryIndex(targetIdx);
      updateActiveProjectData(old => ({
        ...old,
        waypoints: targetState
      }));
      toast.showInfo(`Undid action (${targetState.length} waypoints in registry)`);
      speakVoiceAnnouncement('Undo applied.');
      triggerHaptic([20, 20]);
    } else {
      toast.showInfo('No previous actions to undo.');
    }
  }, [historyIndex, wpHistory, toast, updateActiveProjectData]);

  const handleRedoWaypoints = useCallback(() => {
    if (historyIndex < wpHistory.length - 1) {
      const targetIdx = historyIndex + 1;
      const targetState = wpHistory[targetIdx];
      setWaypoints(targetState);
      setHistoryIndex(targetIdx);
      updateActiveProjectData(old => ({
        ...old,
        waypoints: targetState
      }));
      toast.showInfo(`Redid action (${targetState.length} waypoints in registry)`);
      speakVoiceAnnouncement('Redo applied.');
      triggerHaptic([20, 20]);
    } else {
      toast.showInfo('No actions to redo.');
    }
  }, [historyIndex, wpHistory, toast, updateActiveProjectData]);

  const handleDeleteWaypoint = useCallback((id: string) => {
    updateWaypointsWithHistory(prev => prev.filter(w => w.id !== id), `Deleted waypoint ${id}`);
    toast.showInfo(`Deleted waypoint ${id}`);
    speakVoiceAnnouncement(`Waypoint ${id} deleted.`);
    triggerHaptic([30, 20]);
  }, [updateWaypointsWithHistory, toast]);

  const handleDeleteLastWaypoint = useCallback(() => {
    if (waypoints.length === 0) {
      toast.showWarning('No waypoints to delete.');
      return;
    }
    const lastWp = waypoints[waypoints.length - 1];
    updateWaypointsWithHistory(prev => prev.slice(0, -1), `Deleted last waypoint ${lastWp.id}`);
    toast.showInfo(`Deleted waypoint ${lastWp.id}`);
    speakVoiceAnnouncement(`Deleted last waypoint ${lastWp.id}`);
    triggerHaptic([30, 20]);
  }, [waypoints, updateWaypointsWithHistory, toast]);

  const handleClearAllWaypoints = useCallback(() => {
    if (waypoints.length === 0) return;
    updateWaypointsWithHistory([], 'Cleared all waypoints');
    toast.showInfo('Cleared all waypoints from registry (Can be undone via Ctrl+Z).');
    speakVoiceAnnouncement('All waypoints cleared.');
    triggerHaptic([40, 40, 60]);
  }, [waypoints, updateWaypointsWithHistory, toast]);

  // Global Keyboard Shortcuts (Ctrl+Z for Undo, Ctrl+Y or Ctrl+Shift+Z for Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || (activeEl as HTMLElement)?.isContentEditable) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedoWaypoints();
        } else {
          e.preventDefault();
          handleUndoWaypoints();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedoWaypoints();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndoWaypoints, handleRedoWaypoints]);

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

  // Proximity Alarm System State (Surveyor GNSS Radius Sentinel)
  const [proximitySettings, setProximitySettings] = useState<ProximityAlarmSettings>(() => {
    try {
      const s = localStorage.getItem('gs_proximity_settings_v1');
      if (s) return JSON.parse(s);
    } catch {}
    return {
      enabled: true,
      globalRadius: 10,
      soundProfile: 'subtle-ping',
      volume: 0.6,
      vibrate: true,
      repeatMode: 'entry-only',
      bannerAlerts: true
    };
  });

  const [activeInProximity, setActiveInProximity] = useState<{
    waypoint: SurveyWaypoint;
    distance: number;
    bearing: number;
    turn: number;
    radius: number;
    enteredTime: number;
  }[]>([]);

  const [snoozedWpIds, setSnoozedWpIds] = useState<string[]>([]);
  const [dismissedBannerIds, setDismissedBannerIds] = useState<string[]>([]);
  const [alarmEvents, setAlarmEvents] = useState<ProximityAlarmEvent[]>(() => {
    try {
      const s = localStorage.getItem('gs_proximity_events_v1');
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  });
  const [testSoundPlaying, setTestSoundPlaying] = useState(false);
  const [editingRadiusWpId, setEditingRadiusWpId] = useState<string | null>(null);
  const [editingRadiusValue, setEditingRadiusValue] = useState<string>('10');

  const insideWpIdsRef = useRef<Set<string>>(new Set());
  const lastAlarmTimeMapRef = useRef<Record<string, number>>({});

  // Go-To Waypoint Navigation & Guidance State (Handy GPS Style)
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

  // Save proximity settings and events per project state
  useEffect(() => {
    if (activeProjectId) {
      updateActiveProjectData(old => ({
        ...old,
        customInputs: {
          ...old.customInputs,
          proximitySettings,
          alarmEvents
        }
      }));
    }
  }, [proximitySettings, alarmEvents, activeProjectId, updateActiveProjectData]);

  // Play test audio alert helper
  const handlePlayTestSound = () => {
    setTestSoundPlaying(true);
    proximityAudio.playProximityChime(proximitySettings.soundProfile, proximitySettings.volume);
    if (proximitySettings.vibrate) {
      triggerProximityAlertHaptic('critical');
    }
    setTimeout(() => setTestSoundPlaying(false), 700);
  };

  // Toggle individual waypoint alarm mute
  const toggleWaypointAlarm = (wpIdToToggle: string) => {
    setWaypoints(prev =>
      prev.map(w => (w.id === wpIdToToggle ? { ...w, alarmDisabled: !w.alarmDisabled } : w))
    );
  };

  // Update individual waypoint alarm radius
  const updateWaypointRadius = (wpIdToUpdate: string, radiusMeters: number) => {
    setWaypoints(prev =>
      prev.map(w => (w.id === wpIdToUpdate ? { ...w, proximityRadius: Math.max(1, radiusMeters) } : w))
    );
    setEditingRadiusWpId(null);
  };

  // Snooze waypoint proximity alarm
  const handleSnoozeWaypoint = (wpIdToSnooze: string) => {
    setSnoozedWpIds(prev => [...prev.filter(id => id !== wpIdToSnooze), wpIdToSnooze]);
    setDismissedBannerIds(prev => [...prev, wpIdToSnooze]);
  };

  // Clear proximity breach log
  const handleClearAlarmHistory = () => {
    setAlarmEvents([]);
    try {
      localStorage.removeItem('gs_proximity_events_v1');
    } catch {}
  };

  // Export proximity alarm audit log to CSV
  const handleExportAlarmLogCSV = () => {
    if (alarmEvents.length === 0) return;
    let csv = 'Timestamp_ISO,Timestamp_Local,Waypoint_ID,Feature_Code,Event_Type,Distance_m,Threshold_Radius_m\n';
    alarmEvents.forEach(evt => {
      csv += `${new Date(evt.timestamp).toISOString()},"${new Date(evt.timestamp).toLocaleString()}",${csvEnc(evt.waypointId)},${csvEnc(evt.waypointCode)},${evt.type},${evt.distance.toFixed(2)},${evt.radius.toFixed(1)}\n`;
    });
    downloadBlob(csv, `BhuNexStudio_Proximity_Alerts_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
  };

  // Compass listener (Managed Hardware Lifecycle)
  useEffect(() => {
    const unregister = managedResource.registerOrientation((e: DeviceOrientationEvent) => {
      if ((e as any).webkitCompassHeading != null) {
        setDeviceHeading((e as any).webkitCompassHeading);
      } else if (e.alpha != null) {
        setDeviceHeading((360 - e.alpha) % 360);
      }
    });
    return () => {
      unregister();
    };
  }, [managedResource]);

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

    // Calculate Dynamic Movement Course-Over-Ground (COG)
    const speedMps = speed ?? 0;
    let calculatedCog: number | null = null;
    let movingNow = false;

    if (lastPosRef.current) {
      const dE_move = u.E - lastPosRef.current.E;
      const dN_move = u.N - lastPosRef.current.N;
      const dist_move = Math.hypot(dE_move, dN_move);
      const dt_move = (pos.timestamp - lastPosRef.current.time) / 1000;
      const calcSpeed = dt_move > 0 ? dist_move / dt_move : 0;

      if (dist_move >= 0.5 || speedMps >= 0.35 || calcSpeed >= 0.35) {
        calculatedCog = (Math.atan2(dE_move, dN_move) * 180 / Math.PI + 360) % 360;
        movingNow = true;
        setMotionHeading(calculatedCog);
        setIsMoving(true);
      } else if (speedMps < 0.2) {
        setIsMoving(false);
      }
    }

    lastPosRef.current = { E: u.E, N: u.N, time: pos.timestamp };

    const effectiveHeading = (movingNow || (speedMps >= 0.35 && heading != null && !isNaN(heading)))
      ? (heading != null && !isNaN(heading) ? heading : (calculatedCog ?? deviceHeading ?? 0))
      : (deviceHeading ?? heading ?? 0);

    const data = {
      lat, lon, acc, alt, altAcc, speed, heading: effectiveHeading, time: pos.timestamp,
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

    // Process Proximity Alarm System for ALL saved waypoints
    const inRangeList: {
      waypoint: SurveyWaypoint;
      distance: number;
      bearing: number;
      turn: number;
      radius: number;
      enteredTime: number;
    }[] = [];
    const currentInsideIds = new Set<string>();
    const now = Date.now();

    if (proximitySettings.enabled && waypoints.length > 0) {
      waypoints.forEach(wp => {
        const dE = wp.E - u.E;
        const dN = wp.N - u.N;
        const dist = Math.hypot(dE, dN);
        const radius = wp.proximityRadius ?? proximitySettings.globalRadius;
        const bearing = (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360;
        const hdg = effectiveHeading;
        const turn = ((bearing - hdg + 540) % 360) - 180;

        if (dist <= radius) {
          currentInsideIds.add(wp.id);
          const isSnoozed = snoozedWpIds.includes(wp.id);
          const isMuted = wp.alarmDisabled || isSnoozed;

          inRangeList.push({
            waypoint: wp,
            distance: dist,
            bearing,
            turn,
            radius,
            enteredTime: lastAlarmTimeMapRef.current[wp.id] || now
          });

          if (!isMuted) {
            const wasInside = insideWpIdsRef.current.has(wp.id);
            const lastChime = lastAlarmTimeMapRef.current[wp.id] || 0;
            let shouldChime = false;

            if (!wasInside) {
              // New entry event!
              shouldChime = true;
              const newEvt: ProximityAlarmEvent = {
                id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                waypointId: wp.id,
                waypointCode: wp.code,
                distance: dist,
                radius,
                timestamp: now,
                type: 'entered'
              };
              setAlarmEvents(prev => [newEvt, ...prev.slice(0, 49)]);
            } else {
              // Continuous repeat interval check
              if (proximitySettings.repeatMode === 'continuous-5s' && (now - lastChime >= 5000)) shouldChime = true;
              else if (proximitySettings.repeatMode === 'continuous-15s' && (now - lastChime >= 15000)) shouldChime = true;
              else if (proximitySettings.repeatMode === 'continuous-30s' && (now - lastChime >= 30000)) shouldChime = true;
            }

            if (shouldChime) {
              lastAlarmTimeMapRef.current[wp.id] = now;
              proximityAudio.playProximityChime(proximitySettings.soundProfile, proximitySettings.volume);
              if (proximitySettings.vibrate) {
                triggerProximityAlertHaptic('warning');
              }
            }
          }
        } else if (insideWpIdsRef.current.has(wp.id)) {
          // Exit event!
          const exitEvt: ProximityAlarmEvent = {
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            waypointId: wp.id,
            waypointCode: wp.code,
            distance: dist,
            radius,
            timestamp: now,
            type: 'exited'
          };
          setAlarmEvents(prev => [exitEvt, ...prev.slice(0, 49)]);
        }
      });
    }

    insideWpIdsRef.current = currentInsideIds;
    setActiveInProximity(inRangeList);

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
      const hdg = effectiveHeading;
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

      if (isArrived && audioAlerts) {
        // Trigger subtle chime on arrival at dedicated navigation target if not already chimed in this fix
        if (!insideWpIdsRef.current.has(navTargetId)) {
          proximityAudio.playProximityChime(proximitySettings.soundProfile, proximitySettings.volume);
          if (proximitySettings.vibrate) {
            triggerHaptic(HAPTIC_PATTERNS.TARGET_LOCKED);
          }
        }
      }

      // Voice turn-by-turn navigation spoken director loop
      if (voiceNavActive && (Date.now() - lastSpokenNavTimeRef.current >= voiceNavIntervalSec * 1000)) {
        lastSpokenNavTimeRef.current = Date.now();
        if (isArrived) {
          speakVoiceAnnouncement(`Arrived at target within ${proximityRadiusMeters} meters.`);
        } else {
          const absTurn = Math.abs(turn);
          let spoken = '';
          if (absTurn < 5) {
            spoken = `Direct on target. Walk forward ${dist.toFixed(0)} meters.`;
          } else if (turn > 0) {
            spoken = `Turn right ${absTurn.toFixed(0)} degrees, then walk forward ${dist.toFixed(0)} meters.`;
          } else {
            spoken = `Turn left ${absTurn.toFixed(0)} degrees, then walk forward ${dist.toFixed(0)} meters.`;
          }
          speakVoiceAnnouncement(spoken);
        }
      }
    }
  };

  const handleError = (err: GeolocationPositionError) => {
    setGpsError(err.message || 'Position unavailable');
  };

  const getSingleFix = async () => {
    try {
      setGpsError(null);
      const pos = await managedResource.getSingleLocationFix({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });
      processFix(pos);
    } catch (err: any) {
      handleError(err);
    }
  };

  const toggleStream = () => {
    if (isStreaming) {
      managedResource.stopLocationTracking();
      watchIdRef.current = null;
      setIsStreaming(false);
    } else {
      try {
        setGpsError(null);
        managedResource.startLocationTracking(processFix, handleError, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        });
        setIsStreaming(true);
      } catch (err: any) {
        setGpsError(err.message || 'Failed to initialize GNSS stream');
      }
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

    // Dynamic background for dark vs light mode
    ctx.fillStyle = isDark ? '#0a0e17' : '#f8fafc';
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
      ctx.strokeStyle = isDark ? 'rgba(201, 160, 99, 0.25)' : 'rgba(180, 83, 9, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = isDark ? 'rgba(201, 160, 99, 0.8)' : '#b45309';
      ctx.font = '10px monospace';
      ctx.fillText(`${Math.round(dist)}m`, cx + 4, cy - r + 11);
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx, cy - rMax); ctx.lineTo(cx, cy + rMax);
    ctx.moveTo(cx - rMax, cy); ctx.lineTo(cx + rMax, cy);
    ctx.strokeStyle = isDark ? 'rgba(201, 160, 99, 0.2)' : 'rgba(148, 163, 184, 0.4)';
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
      ctx.strokeStyle = isDark ? '#38bdf8' : '#0284c7';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Waypoints & Proximity Zones
    waypoints.forEach(w => {
      const p = toScreen(w.E, w.N);
      const radM = w.proximityRadius ?? proximitySettings.globalRadius ?? 10;
      const screenRad = radM * scale;
      const isInside = insideWpIdsRef.current.has(w.id);
      const isMuted = w.alarmDisabled || snoozedWpIds.includes(w.id);

      // Draw Proximity Alarm Radius Ring
      if (screenRad > 2 && screenRad < 1000) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, screenRad, 0, Math.PI * 2);
        if (isInside) {
          ctx.fillStyle = isMuted ? 'rgba(234, 179, 8, 0.12)' : 'rgba(34, 197, 94, 0.18)';
          ctx.fill();
          ctx.strokeStyle = isMuted ? 'rgba(234, 179, 8, 0.8)' : 'rgba(34, 197, 94, 0.9)';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = isMuted
            ? (isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)')
            : (isDark ? 'rgba(201, 160, 99, 0.25)' : 'rgba(180, 83, 9, 0.3)');
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Waypoint Monument Marker
      ctx.beginPath();
      ctx.arc(p.x, p.y, isInside ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isInside ? '#22c55e' : (isDark ? '#c9a063' : '#b45309');
      ctx.fill();
      ctx.strokeStyle = isDark ? '#ffffff' : '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = isDark
        ? (isInside ? '#4ade80' : '#ffffff')
        : (isInside ? '#15803d' : '#0f172a');
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(w.id, p.x, p.y - (isInside ? 10 : 8));
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
  }, [currentPos, waypoints, trackPoints, radarZoom, compassMode, deviceHeading, navMetrics, navTargetE, navTargetN, navTargetId, isDark]);

  // Render Averaging Scatter Canvas
  useEffect(() => {
    if (subTab !== 'averaging') return;
    const cv = scatterCanvasRef.current;
    if (!cv || !avgStats) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = isDark ? '#0a0e17' : '#f8fafc';
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
      ctx.strokeStyle = idx === 0
        ? (isDark ? 'rgba(34, 197, 94, 0.4)' : 'rgba(22, 163, 74, 0.5)')
        : (isDark ? 'rgba(234, 179, 8, 0.4)' : 'rgba(217, 119, 6, 0.5)');
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = idx === 0 ? (isDark ? '#22c55e' : '#16a34a') : (isDark ? '#eab308' : '#d97706');
      ctx.font = '10px monospace';
      ctx.fillText(`${idx === 0 ? 'CEP50' : 'CEP95'}: ${rad.toFixed(2)}m`, cx + 6, cy - rPx + 12);
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx, 10); ctx.lineTo(cx, cv.height - 10);
    ctx.moveTo(10, cy); ctx.lineTo(cv.width - 10, cy);
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(100, 116, 139, 0.3)';
    ctx.stroke();

    // Plot Epoch Points
    avgSamples.forEach(pt => {
      const dE = pt.E - avgStats.meanE;
      const dN = pt.N - avgStats.meanN;
      const px = cx + dE * scale;
      const py = cy - dN * scale;

      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.8)' : 'rgba(2, 132, 199, 0.8)';
      ctx.fill();
    });

    // Centroid
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#c9a063' : '#b45309';
    ctx.fill();
    ctx.strokeStyle = isDark ? '#fff' : '#0f172a';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [subTab, avgStats, avgSamples, isDark]);

  // Render Skyplot Canvas
  useEffect(() => {
    if (subTab !== 'satellites') return;
    const cv = skyplotCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = isDark ? '#0a0e17' : '#f8fafc';
    ctx.fillRect(0, 0, cv.width, cv.height);

    const cx = cv.width / 2;
    const cy = cv.height / 2;
    const rMax = Math.min(cx, cy) - 24;

    // Polar Rings (0, 30, 60 deg elevation)
    [0, 30, 60].forEach(el => {
      const r = rMax * (1 - el / 90);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = isDark ? 'rgba(201, 160, 99, 0.2)' : 'rgba(180, 83, 9, 0.25)';
      ctx.stroke();

      ctx.fillStyle = isDark ? 'rgba(201, 160, 99, 0.6)' : '#b45309';
      ctx.font = '9px monospace';
      ctx.fillText(`${el}°`, cx + 4, cy - r + 10);
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx, cy - rMax); ctx.lineTo(cx, cy + rMax);
    ctx.moveTo(cx - rMax, cy); ctx.lineTo(cx + rMax, cy);
    ctx.strokeStyle = isDark ? 'rgba(201, 160, 99, 0.2)' : 'rgba(148, 163, 184, 0.4)';
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
      ctx.fillStyle = sat.used
        ? (sat.system === 'GPS' ? '#38bdf8' : sat.system === 'GLONASS' ? '#ef4444' : sat.system === 'Galileo' ? '#22c55e' : '#f59e0b')
        : (isDark ? '#64748b' : '#94a3b8');
      ctx.fill();
      ctx.strokeStyle = isDark ? '#fff' : '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sat.prn, sx, sy);
    });
  }, [subTab, isDark]);

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

    updateWaypointsWithHistory(prev => [...prev, newWp], `Added averaged benchmark ${newWp.id}`);
    triggerWaypointAddedHaptic();
    speakVoiceAnnouncement(`Benchmark ${newWp.id} recorded.`);
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

  // Deduplicate Waypoints Engine
  const handleDeduplicateWaypoints = () => {
    if (waypoints.length === 0) {
      toast.showWarning('No waypoints in registry to deduplicate.');
      return;
    }
    const { cleanWaypoints, summary } = deduplicateSurveyWaypoints(waypoints, 0.1);
    updateWaypointsWithHistory(cleanWaypoints, `Deduplicated waypoints`);

    if (summary.removedCount > 0) {
      toast.showSuccess(
        `Deduplication complete: Removed ${summary.removedCount} duplicate waypoint(s). (${cleanWaypoints.length} active in registry)`
      );
    } else {
      toast.showInfo('Waypoint registry is clean. Zero duplicate waypoints found.');
    }
  };

  // Export handlers
  const handleExportCSV = () => {
    if (!waypoints.length) {
      toast.showWarning('No waypoints in registry to export.');
      return;
    }
    const cols = ['Point_ID', 'Feature_Code', 'Easting', 'Northing', 'Elevation_Z', 'Latitude', 'Longitude', 'Accuracy_CEP95_m', 'Zone', 'Remarks'];
    const rows = waypoints.map(w => [w.id, w.code, w.E.toFixed(3), w.N.toFixed(3), w.Z.toFixed(2), w.lat.toFixed(8), w.lon.toFixed(8), (w.acc || 0).toFixed(2), w.zone, w.remarks || '']);
    downloadBlob(csvEnc(toCSVtext(cols, rows)), 'gps_survey_waypoints.csv', 'text/csv;charset=utf-8');
    toast.showSuccess(`Exported ${waypoints.length} waypoints to CSV`);
  };

  const handleExportGPX = () => {
    if (!waypoints.length && !trackPoints.length) {
      toast.showWarning('No waypoints or tracks recorded to export.');
      return;
    }
    const gpx = exportToGPX(waypoints, trackName, trackPoints);
    downloadBlob(new TextEncoder().encode(gpx), `${trackName || 'BhuNexStudio'}.gpx`, 'application/gpx+xml');
    toast.showSuccess(`Exported GPX file with ${waypoints.length} waypoints & ${trackPoints.length} track points`);
  };

  const handleExportDXF = () => {
    if (!waypoints.length) {
      toast.showWarning('No waypoints in registry to export.');
      return;
    }
    const feats = waypoints.map(w => ({
      name: `${w.id} (${w.code})`,
      geom: 'point' as const,
      kind: 'en' as const,
      pts: [{ a: w.E, b: w.N }],
      props: { layer: 'SURVEY_POINTS', Elevation: w.Z }
    }));
    const res = dxfBuild(feats, 'utm', zNum, isSouth, true);
    downloadBlob(new TextEncoder().encode(res.dxf), 'gps_survey_points.dxf', 'application/dxf');
    toast.showSuccess(`Exported ${waypoints.length} waypoints to DXF CAD format`);
  };

  const handleSendToGisAction = () => {
    if (!waypoints.length) {
      toast.showWarning('No waypoints in registry to send to GIS.');
      return;
    }
    const features: GeoFeature[] = waypoints.map(wp => ({
      name: wp.id,
      geom: 'point',
      kind: 'en',
      pts: [{ a: wp.E, b: wp.N }],
      props: {
        Point_ID: wp.id,
        Feature_Code: wp.code,
        Elevation_m: wp.Z,
        Accuracy_m: wp.acc,
        Remarks: wp.remarks || '',
        Latitude: wp.lat,
        Longitude: wp.lon
      }
    }));
    if (onSendToGis) {
      onSendToGis(features);
    } else {
      try {
        const currentProjId = activeProjectId || activeProject?.id || 'project_pakhar_2026';
        const newLayer = {
          id: `layer_${Date.now()}`,
          projectId: currentProjId,
          name: `GNSS Waypoints (${waypoints.length})`,
          visible: true,
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.8,
          strokeWidth: 2,
          geomType: 'point' as const,
          features: features.map(f => ({ ...f, projectId: currentProjId }))
        };
        updateActiveProjectData(old => ({
          ...old,
          layers: [newLayer, ...(old.layers || [])]
        }));
        toast.showSuccess(`Transferred ${waypoints.length} waypoints into GIS Map Studio layers`);
      } catch (e: any) {
        toast.showError(`Failed to transfer layer: ${e.message}`);
      }
    }
  };

  const handleSendToCalcAction = () => {
    if (!waypoints.length) {
      toast.showWarning('No waypoints in registry to send.');
      return;
    }
    const csv = waypoints.map(w => `${w.id}, ${w.E.toFixed(3)}, ${w.N.toFixed(3)}, ${w.Z.toFixed(2)}`).join('\n');
    if (onSendToCalculator) {
      onSendToCalculator(csv);
    } else {
      updateActiveProjectData(old => ({
        ...old,
        customInputs: {
          ...old.customInputs,
          calc_import_csv: csv
        }
      }));
      toast.showSuccess(`Transferred ${waypoints.length} coordinates to Survey Calculator`);
    }
  };

  const handleSendToOffsetAction = () => {
    if (waypoints.length < 3) return;
    const pts = waypoints.map(w => ({ lon: w.lon, lat: w.lat }));
    if (onSendToOffset) {
      onSendToOffset(pts);
    } else {
      updateActiveProjectData(old => ({
        ...old,
        customInputs: {
          ...old.customInputs,
          offset_import_pts: pts
        }
      }));
    }
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
            { 
              id: 'stakeout_director', 
              label: 'Stakeout & Go-To Director', 
              icon: Compass, 
              badge: 'Map • AR • Compass',
              isMerged: true 
            },
            { id: 'trip', label: 'Trip Odometer', icon: Activity },
            { id: 'satellites', label: 'Satellite Skyplot', icon: Satellite },
            { id: 'waypoints', label: `Waypoints (${waypoints.length})`, icon: MapPin }
          ].map(tab => {
            const Icon = tab.icon;
            const active = subTab === tab.id || (tab.id === 'stakeout_director' && (subTab === 'map_stakeout' || subTab === 'ar_stakeout' || subTab === 'navigation'));
            const isMerged = (tab as any).isMerged;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                  active
                    ? 'bg-[#c9a063] text-black font-bold shadow-md shadow-[#c9a063]/25 ring-1 ring-[#c9a063]'
                    : isMerged
                    ? 'bg-gradient-to-r from-amber-500/15 via-[#c9a063]/20 to-blue-500/15 text-amber-200 hover:text-white border border-[#c9a063]/40 hover:border-[#c9a063]'
                    : 'bg-[#141414] text-white/60 hover:text-white border border-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-black' : isMerged ? 'text-[#c9a063]' : ''}`} />
                <span>{tab.label}</span>
                {(tab as any).badge && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                    active ? 'bg-black/20 text-black' : 'bg-[#c9a063]/20 text-[#c9a063]'
                  }`}>
                    {(tab as any).badge}
                  </span>
                )}
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

      {/* Floating Proximity Alarm Sentinel Banner HUD */}
      {proximitySettings.bannerAlerts && activeInProximity.some(p => !dismissedBannerIds.includes(p.waypoint.id)) && (
        <div className="p-4 bg-gradient-to-r from-[#0d2014] via-[#141714] to-[#1c150c] border border-emerald-500/50 shadow-xl rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5 text-xs transition-all">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-emerald-950/90 border border-emerald-400/60 rounded-xl text-emerald-400 shadow-lg shadow-emerald-950/60 relative">
              <BellRing className="w-5 h-5 animate-pulse text-emerald-400" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/40">
                  🎯 Proximity Alarm Zone Active
                </span>
                <span className="text-white/60 font-mono text-[11px]">
                  {activeInProximity.length} {activeInProximity.length === 1 ? 'waypoint' : 'waypoints'} in range
                </span>
              </div>
              <div className="text-sm font-bold text-white mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="text-[#c9a063] font-mono">{activeInProximity[0].waypoint.id}</span>
                <span className="text-white/70 font-normal">({activeInProximity[0].waypoint.code})</span>
                <span className="font-mono text-emerald-300 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  {distanceUnit === 'ft'
                    ? `${(activeInProximity[0].distance * 3.28084).toFixed(1)} ft`
                    : `${activeInProximity[0].distance.toFixed(1)} m`}
                </span>
                <span className="text-white/50 text-xs font-mono">
                  • Target Radius: {activeInProximity[0].radius}m • Bearing: {activeInProximity[0].bearing.toFixed(0)}°
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
            <button
              onClick={() => {
                const targetWp = activeInProximity[0].waypoint;
                const idx = waypoints.findIndex(w => w.id === targetWp.id);
                setNavTargetId(`wp_${idx}`);
                setNavTargetE(targetWp.E.toString());
                setNavTargetN(targetWp.N.toString());
                setNavTargetName(`${targetWp.id} (${targetWp.code})`);
                setSubTab('navigation');
              }}
              className="px-3.5 py-1.5 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold rounded-xl flex items-center gap-1.5 text-xs shadow-md transition-all"
            >
              <Navigation className="w-3.5 h-3.5" />
              Go-To Guidance
            </button>
            <button
              onClick={() => handleSnoozeWaypoint(activeInProximity[0].waypoint.id)}
              className="px-3 py-1.5 bg-black/40 hover:bg-black/60 text-amber-300 font-semibold rounded-xl border border-amber-500/30 flex items-center gap-1.5 text-xs"
              title="Snooze alerts for this waypoint"
            >
              <BellOff className="w-3.5 h-3.5" />
              Snooze
            </button>
            <button
              onClick={handlePlayTestSound}
              disabled={testSoundPlaying}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl border border-white/10 flex items-center gap-1.5 text-xs"
              title="Preview alarm sound chime"
            >
              <Volume2 className={`w-3.5 h-3.5 ${testSoundPlaying ? 'text-emerald-400 animate-bounce' : 'text-[#c9a063]'}`} />
              <span>Chime</span>
            </button>
            <button
              onClick={() => setDismissedBannerIds(prev => [...prev, ...activeInProximity.map(p => p.waypoint.id)])}
              className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10"
              title="Dismiss notification banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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

              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-inner flex justify-center bg-slate-100 dark:bg-black">
                <canvas ref={canvasRef} width={600} height={420} className="w-full max-w-[600px] h-[360px] sm:h-[420px] bg-slate-50 dark:bg-black" />
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

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-white/50 text-[11px] mb-1">Alarm Radius (m)</label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={wpCustomRadius}
                      onChange={e => setWpCustomRadius(e.target.value)}
                      className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white font-mono"
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className="block text-white/50 text-[11px] mb-1">Remarks</label>
                    <input
                      type="text"
                      value={wpRemarks}
                      onChange={e => setWpRemarks(e.target.value)}
                      className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white"
                      placeholder="Condition..."
                    />
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!currentPos) {
                      toast.showWarning('Please take a GPS fix or start live streaming first!');
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
                      remarks: wpRemarks.trim(),
                      proximityRadius: parseFloat(wpCustomRadius) || proximitySettings.globalRadius || 10,
                      alarmDisabled: false
                    };
                    updateWaypointsWithHistory(prev => [...prev, newWp], `Logged waypoint ${newWp.id}`);
                    triggerWaypointAddedHaptic();
                    speakVoiceAnnouncement(`Point ${newWp.id} recorded.`);
                    toast.showSuccess(`Logged waypoint ${newWp.id} (${newWp.code}) to registry`);
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

                {/* Undo, Redo, Delete Last Toolbar */}
                <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-1.5">
                  <button
                    onClick={handleUndoWaypoints}
                    disabled={historyIndex <= 0}
                    className="flex-1 py-1.5 px-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white rounded-lg border border-white/10 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                    title="Undo last recorded point (Ctrl+Z)"
                  >
                    <Undo2 className="w-3.5 h-3.5 text-[#c9a063]" />
                    <span>Undo</span>
                  </button>
                  <button
                    onClick={handleRedoWaypoints}
                    disabled={historyIndex >= wpHistory.length - 1}
                    className="flex-1 py-1.5 px-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white rounded-lg border border-white/10 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                    title="Redo action (Ctrl+Y)"
                  >
                    <Redo2 className="w-3.5 h-3.5 text-[#c9a063]" />
                    <span>Redo</span>
                  </button>
                  <button
                    onClick={handleDeleteLastWaypoint}
                    disabled={waypoints.length === 0}
                    className="py-1.5 px-2 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-30 text-red-400 rounded-lg border border-red-500/30 text-[11px] font-medium flex items-center justify-center gap-1 transition-all"
                    title="Delete most recently logged waypoint"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Last</span>
                  </button>
                </div>
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
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-inner flex justify-center bg-slate-100 dark:bg-black">
              <canvas ref={scatterCanvasRef} width={450} height={320} className="w-full h-[300px] bg-slate-50 dark:bg-black" />
            </div>
          </div>
        </div>
      )}

      {/* 4. Unified Stakeout & Go-To Director (Merged Map Tiles, AR Camera, and Tactical Compass / Proximity) */}
      {(subTab === 'stakeout_director' || subTab === 'map_stakeout' || subTab === 'ar_stakeout' || subTab === 'navigation') && (
        <div className="space-y-4">
          {/* Dynamic Motion Sentinel & Vector Status Banner */}
          <div className="p-3.5 rounded-2xl bg-[#0f0f0f] border border-white/10 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border flex items-center justify-center transition-all ${
                isMoving 
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-400 shadow-md shadow-emerald-900/30'
                  : 'bg-amber-950/40 border-amber-500/30 text-amber-400'
              }`}>
                {isMoving ? <Footprints className="w-4 h-4 animate-bounce" /> : <Compass className="w-4 h-4" />}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    {isMoving ? '🚶 Dynamic GNSS Motion Course Active (COG)' : '🧭 Magnetic Sensor Compass Active'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isMoving ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {isMoving ? 'Moving Trajectory' : 'Stationary'}
                  </span>
                </div>
                <p className="text-[11px] text-white/60">
                  {isMoving 
                    ? `Direction & azimuth dynamically aligned to surveyor movement: ${currentPos?.heading != null ? currentPos.heading.toFixed(0) : '--'}° COG • Speed: ${((currentPos?.speed || 0) * 3.6).toFixed(1)} km/h`
                    : `Walk 2-3 steps to activate Course-Over-Ground (COG) movement trajectory tracking.`}
                </p>
              </div>
            </div>

            {/* Integrated Director Mode Switcher */}
            <div className="bg-black/40 p-1 rounded-xl border border-white/10 flex items-center gap-1">
              <button
                onClick={() => {
                  setDirectorMode('map');
                  if (subTab !== 'stakeout_director') setSubTab('stakeout_director');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  (directorMode === 'map' && subTab === 'stakeout_director') || subTab === 'map_stakeout'
                    ? 'bg-[#c9a063] text-black shadow-md'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Map Tiles (2D)</span>
              </button>
              <button
                onClick={() => {
                  setDirectorMode('ar');
                  if (subTab !== 'stakeout_director') setSubTab('stakeout_director');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  (directorMode === 'ar' && subTab === 'stakeout_director') || subTab === 'ar_stakeout'
                    ? 'bg-[#c9a063] text-black shadow-md'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>AR Camera (3D)</span>
              </button>
              <button
                onClick={() => {
                  setDirectorMode('compass');
                  if (subTab !== 'stakeout_director') setSubTab('stakeout_director');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  (directorMode === 'compass' && subTab === 'stakeout_director') || subTab === 'navigation'
                    ? 'bg-[#c9a063] text-black shadow-md'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Tactical Compass & Radar</span>
              </button>
            </div>
          </div>

          {/* Mode 1: Map Tiles 2D Stakeout */}
          {((directorMode === 'map' && subTab === 'stakeout_director') || subTab === 'map_stakeout') && (
            <MapTilesStakeoutView
              currentPos={currentPos}
              deviceHeading={currentPos?.heading ?? deviceHeading ?? 0}
              waypoints={waypoints}
              activeWaypointIndex={activeWaypointIndex}
              onSelectWaypointIndex={setActiveWaypointIndex}
              onUndoWaypoint={handleUndoWaypoints}
              onRedoWaypoint={handleRedoWaypoints}
              onDeleteWaypoint={handleDeleteWaypoint}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < wpHistory.length - 1}
              distanceUnit={distanceUnit}
              onSwitchToAr={() => { setDirectorMode('ar'); setSubTab('stakeout_director'); }}
              onSwitchToMode={mode => { setDirectorMode(mode); setSubTab('stakeout_director'); }}
              onOpenImport={() => setIsImportModalOpen(true)}
              isMoving={isMoving}
              motionHeading={motionHeading}
              onStoreObservation={remark => {
                if (currentPos) {
                  const newWp: SurveyWaypoint = {
                    id: `STK-${waypoints.length + 1}`,
                    code: 'Map Stakeout Ground Marker',
                    E: currentPos.utm.E,
                    N: currentPos.utm.N,
                    Z: currentPos.alt || 0,
                    lat: currentPos.lat,
                    lon: currentPos.lon,
                    acc: currentPos.acc,
                    zone: workingZone,
                    time: Date.now(),
                    remarks: remark,
                    proximityRadius: 5
                  };
                  updateWaypointsWithHistory(prev => [...prev, newWp], `Recorded map stakeout point ${newWp.id}`);
                  speakVoiceAnnouncement(`Map stakeout point ${newWp.id} recorded.`);
                  toast.showSuccess(`Saved map stakeout check observation ${newWp.id}`);
                } else {
                  toast.showWarning('No current GPS fix available to record stakeout position.');
                }
              }}
            />
          )}

          {/* Mode 2: AR Camera 3D Stakeout */}
          {((directorMode === 'ar' && subTab === 'stakeout_director') || subTab === 'ar_stakeout') && (
            <ArStakeoutView
              currentPos={currentPos}
              deviceHeading={currentPos?.heading ?? deviceHeading ?? 0}
              waypoints={waypoints}
              activeWaypointIndex={activeWaypointIndex}
              onSelectWaypointIndex={setActiveWaypointIndex}
              onUndoWaypoint={handleUndoWaypoints}
              onRedoWaypoint={handleRedoWaypoints}
              onDeleteWaypoint={handleDeleteWaypoint}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < wpHistory.length - 1}
              distanceUnit={distanceUnit}
              onSwitchToMap={() => { setDirectorMode('map'); setSubTab('stakeout_director'); }}
              onSwitchToMode={mode => { setDirectorMode(mode); setSubTab('stakeout_director'); }}
              onOpenImport={() => setIsImportModalOpen(true)}
              isMoving={isMoving}
              motionHeading={motionHeading}
              onStoreObservation={remark => {
                if (currentPos) {
                  const newWp: SurveyWaypoint = {
                    id: `STK-${waypoints.length + 1}`,
                    code: 'Stakeout Ground Marker',
                    E: currentPos.utm.E,
                    N: currentPos.utm.N,
                    Z: currentPos.alt || 0,
                    lat: currentPos.lat,
                    lon: currentPos.lon,
                    acc: currentPos.acc,
                    zone: workingZone,
                    time: Date.now(),
                    remarks: remark,
                    proximityRadius: 5
                  };
                  updateWaypointsWithHistory(prev => [...prev, newWp], `Recorded stakeout point ${newWp.id}`);
                  speakVoiceAnnouncement(`Stakeout point ${newWp.id} recorded.`);
                  toast.showSuccess(`Saved stakeout check observation ${newWp.id}`);
                } else {
                  toast.showWarning('No current GPS fix available to record stakeout position.');
                }
              }}
            />
          )}

          {/* Mode 3: Tactical Compass & Proximity Radar HUD */}
          {((directorMode === 'compass' && subTab === 'stakeout_director') || subTab === 'navigation') && (
            <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Go-To Guidance Director */}
              <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-base font-serif italic text-white flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-[#c9a063]" />
                    Go-To Waypoint Guidance & Steering Director
                  </h4>
                  {navMetrics && (
                    <span className="text-[11px] font-mono text-[#c9a063] bg-[#141414] px-2.5 py-1 rounded-lg border border-white/5">
                      Target: {navTargetName}
                    </span>
                  )}
                </div>

                {navMetrics ? (
                  <div className="space-y-6">
                    {/* Dynamic Big Turn Compass Header */}
                    <div className="p-6 bg-gradient-to-b from-[#141414] to-[#0a0e17] rounded-2xl border border-white/10 text-center space-y-3 shadow-inner">
                      <div className="text-[11px] uppercase tracking-wider text-[#c9a063] font-bold">
                        Target Bearing: {navMetrics.bearing.toFixed(1)}° • Heading: {((currentPos?.heading || deviceHeading || 0)).toFixed(0)}°
                      </div>

                      <div className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-tight">
                        {distanceUnit === 'ft'
                          ? `${(navMetrics.dist * 3.28084).toFixed(1)} ft`
                          : navMetrics.dist > 1000
                          ? `${(navMetrics.dist / 1000).toFixed(3)} km`
                          : `${navMetrics.dist.toFixed(1)} m`}
                      </div>

                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        <span className={`px-4 py-1.5 rounded-full text-sm font-bold font-mono transition-all ${
                          Math.abs(navMetrics.turn) < 10
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50 shadow-lg shadow-emerald-950/50'
                            : 'bg-amber-950 text-amber-300 border border-amber-500/50 shadow-lg shadow-amber-950/50'
                        }`}>
                          {Math.abs(navMetrics.turn) < 5
                            ? '🎯 DIRECT ON TARGET'
                            : navMetrics.turn > 0
                            ? `TURN ${navMetrics.turn.toFixed(0)}° RIGHT ➔`
                            : `TURN ${Math.abs(navMetrics.turn).toFixed(0)}° LEFT ⬅`}
                        </span>

                        <button
                          onClick={() => setSubTab('ar_stakeout')}
                          className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-[#c9a063] hover:brightness-110 text-black font-bold text-xs flex items-center gap-1.5 shadow-lg transition-all active:scale-95"
                          title="Open Camera AR Stakeout View with 3D reticle overlay"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>AR Camera View</span>
                        </button>
                      </div>

                      {navMetrics.isArrived && (
                        <div className="p-3 bg-emerald-950/80 border border-emerald-400 text-emerald-200 text-xs font-bold rounded-xl animate-pulse flex items-center justify-center gap-2">
                          <BellRing className="w-4 h-4 text-emerald-400" />
                          <span>🎯 PROXIMITY ARRIVAL: Reached target threshold within {proximityRadiusMeters}m!</span>
                        </div>
                      )}
                    </div>

                    {/* Turn-by-Turn Spoken Stakeout Voice Controller */}
                    <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                        <span className="font-semibold text-white flex items-center gap-1.5">
                          <Volume2 className="w-4 h-4 text-[#c9a063]" />
                          Turn-by-Turn Stakeout Spoken Voice Engine
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              const newActive = !voiceNavActive;
                              setVoiceNavActive(newActive);
                              if (newActive) {
                                const turnTxt = Math.abs(navMetrics.turn) < 5
                                  ? `On target, walk forward ${navMetrics.dist.toFixed(0)} meters.`
                                  : navMetrics.turn > 0
                                  ? `Turn right ${Math.abs(navMetrics.turn).toFixed(0)} degrees, then forward ${navMetrics.dist.toFixed(0)} meters.`
                                  : `Turn left ${Math.abs(navMetrics.turn).toFixed(0)} degrees, then forward ${navMetrics.dist.toFixed(0)} meters.`;
                                speakVoiceAnnouncement(turnTxt);
                                lastSpokenNavTimeRef.current = Date.now();
                              }
                            }}
                            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                              voiceNavActive
                                ? 'bg-emerald-600 text-white animate-pulse shadow-md shadow-emerald-600/30'
                                : 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/10'
                            }`}
                          >
                            {voiceNavActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                            <span>{voiceNavActive ? 'Voice Navigation Active' : 'Enable Spoken Guidance'}</span>
                          </button>

                          <button
                            onClick={() => {
                              const turnTxt = Math.abs(navMetrics.turn) < 5
                                ? `On target, walk forward ${navMetrics.dist.toFixed(0)} meters.`
                                : navMetrics.turn > 0
                                ? `Turn right ${Math.abs(navMetrics.turn).toFixed(0)} degrees, forward ${navMetrics.dist.toFixed(0)} meters.`
                                : `Turn left ${Math.abs(navMetrics.turn).toFixed(0)} degrees, forward ${navMetrics.dist.toFixed(0)} meters.`;
                              speakVoiceAnnouncement(turnTxt);
                              triggerHaptic([20, 30]);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#c9a063]/20 hover:bg-[#c9a063]/30 text-[#c9a063] border border-[#c9a063]/40 text-xs font-bold flex items-center gap-1"
                          >
                            <Radio className="w-3.5 h-3.5" />
                            <span>Speak Now</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-white/70 font-mono flex-wrap gap-2 pt-1 border-t border-white/5">
                        <div className="flex items-center gap-2">
                          <span className="text-white/50">Direction:</span>
                          <span className="text-emerald-400 font-bold">
                            {Math.abs(navMetrics.turn) < 5
                              ? `Forward ${navMetrics.dist.toFixed(1)}m`
                              : `${navMetrics.turn > 0 ? 'Right' : 'Left'} ${Math.abs(navMetrics.turn).toFixed(0)}° • Forward ${navMetrics.dist.toFixed(1)}m`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-[10px]">
                          <span className="text-white/40">Cadence:</span>
                          {[3, 5, 10].map(s => (
                            <button
                              key={s}
                              onClick={() => setVoiceNavIntervalSec(s)}
                              className={`px-1.5 py-0.5 rounded border ${
                                voiceNavIntervalSec === s
                                  ? 'bg-[#c9a063] text-black font-bold border-[#c9a063]'
                                  : 'bg-white/5 text-white/60 border-white/10 hover:text-white'
                              }`}
                            >
                              {s}s
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Navigation Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      <div className="p-3.5 bg-[#141414] rounded-xl border border-white/5 space-y-0.5">
                        <span className="text-[10px] text-white/40 block uppercase">Azimuth Bearing</span>
                        <span className="text-base font-bold text-[#c9a063]">{navMetrics.bearing.toFixed(1)}°</span>
                        <span className="text-[10px] text-white/40 block">Turn: {navMetrics.turn.toFixed(1)}°</span>
                      </div>
                      <div className="p-3.5 bg-[#141414] rounded-xl border border-white/5 space-y-0.5">
                        <span className="text-[10px] text-white/40 block uppercase">Cross-Track (XTE)</span>
                        <span className="text-base font-bold text-white">{navMetrics.xte.toFixed(1)} m</span>
                        <span className="text-[10px] text-white/40 block">{navMetrics.xte < 2 ? 'On Track' : 'Off Path'}</span>
                      </div>
                      <div className="p-3.5 bg-[#141414] rounded-xl border border-white/5 space-y-0.5">
                        <span className="text-[10px] text-white/40 block uppercase">Est. Time (ETA)</span>
                        <span className="text-base font-bold text-white">{navMetrics.etaSec ? `${Math.floor(navMetrics.etaSec / 60)}m ${navMetrics.etaSec % 60}s` : '--'}</span>
                        <span className="text-[10px] text-white/40 block">{((currentPos?.speed || 0) * 3.6).toFixed(1)} km/h</span>
                      </div>
                      <div className="p-3.5 bg-[#141414] rounded-xl border border-white/5 space-y-0.5">
                        <span className="text-[10px] text-white/40 block uppercase">ΔE / ΔN Delta</span>
                        <span className="text-xs font-bold text-white block">{navMetrics.dE >= 0 ? `+${navMetrics.dE.toFixed(1)}` : navMetrics.dE.toFixed(1)}m E</span>
                        <span className="text-xs font-bold text-white block">{navMetrics.dN >= 0 ? `+${navMetrics.dN.toFixed(1)}` : navMetrics.dN.toFixed(1)}m N</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 bg-[#141414] rounded-xl border border-white/5 text-center text-xs text-white/50 space-y-2">
                    <Navigation className="w-8 h-8 text-[#c9a063]/40 mx-auto" />
                    <p>Select a target waypoint from the right panel or the Live Proximity Radar below to initiate steering guidance.</p>
                  </div>
                )}
              </div>

              {/* Live Waypoint Proximity Radar Table */}
              <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-base font-serif italic text-white flex items-center gap-2">
                      <Radio className="w-4 h-4 text-[#c9a063]" />
                      Real-Time Waypoint Proximity Radar ({waypoints.length})
                    </h4>
                    <p className="text-xs text-white/50">Live distances and arrival sentinel states relative to your current GNSS position.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-500/30 font-mono">
                      {activeInProximity.length} In Range
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-white/80">
                    <thead className="text-[10px] uppercase text-[#c9a063] border-b border-white/10 bg-[#141414]">
                      <tr>
                        <th className="py-2.5 px-3">Waypoint</th>
                        <th className="py-2.5 px-3 font-mono">Coordinates</th>
                        <th className="py-2.5 px-3 font-mono">Distance</th>
                        <th className="py-2.5 px-3 font-mono">Bearing</th>
                        <th className="py-2.5 px-3 font-mono">Alarm Radius</th>
                        <th className="py-2.5 px-3">Sentinel Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {waypoints.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-white/40">
                            No waypoints registered yet. Add waypoints in the Waypoints tab.
                          </td>
                        </tr>
                      ) : (
                        [...waypoints]
                          .map((wp, originalIdx) => {
                            const dE = currentPos ? wp.E - currentPos.utm.E : 0;
                            const dN = currentPos ? wp.N - currentPos.utm.N : 0;
                            const dist = currentPos ? Math.hypot(dE, dN) : 999999;
                            const bearing = (Math.atan2(dE, dN) * 180 / Math.PI + 360) % 360;
                            const radius = wp.proximityRadius ?? proximitySettings.globalRadius;
                            const isInside = dist <= radius;
                            const isNear = dist <= radius * 2.5;
                            const isMuted = wp.alarmDisabled || snoozedWpIds.includes(wp.id);
                            return { wp, originalIdx, dist, bearing, radius, isInside, isNear, isMuted };
                          })
                          .sort((a, b) => a.dist - b.dist)
                          .map(({ wp, originalIdx, dist, bearing, radius, isInside, isNear, isMuted }) => (
                            <tr
                              key={`prox_wp_${wp.id}_${wp.time || originalIdx}_${originalIdx}`}
                              className={`transition-colors ${
                                isInside
                                  ? 'bg-emerald-950/30 hover:bg-emerald-950/50'
                                  : isNear
                                  ? 'bg-amber-950/15 hover:bg-amber-950/30'
                                  : 'hover:bg-white/5'
                              }`}
                            >
                              <td className="py-2.5 px-3 font-mono">
                                <span className="font-bold text-white block">{wp.id}</span>
                                <span className="text-[10px] text-white/50">{wp.code}</span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px]">
                                <div>{wp.E.toFixed(1)} E</div>
                                <div className="text-white/50">{wp.N.toFixed(1)} N</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold">
                                {currentPos ? (
                                  <span className={isInside ? 'text-emerald-300' : isNear ? 'text-amber-300' : 'text-white'}>
                                    {distanceUnit === 'ft'
                                      ? `${(dist * 3.28084).toFixed(1)} ft`
                                      : dist > 1000
                                      ? `${(dist / 1000).toFixed(2)} km`
                                      : `${dist.toFixed(1)} m`}
                                  </span>
                                ) : (
                                  <span className="text-white/40">--</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono">
                                {currentPos ? (
                                  <span className="flex items-center gap-1">
                                    <ArrowUpRight
                                      className="w-3.5 h-3.5 text-[#c9a063]"
                                      style={{ transform: `rotate(${bearing}deg)` }}
                                    />
                                    {bearing.toFixed(0)}°
                                  </span>
                                ) : (
                                  '--'
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono">
                                {editingRadiusWpId === wp.id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="1"
                                      max="500"
                                      value={editingRadiusValue}
                                      onChange={e => setEditingRadiusValue(e.target.value)}
                                      className="w-14 px-1.5 py-0.5 bg-[#141414] border border-[#c9a063] rounded text-white text-xs font-mono"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => updateWaypointRadius(wp.id, parseFloat(editingRadiusValue) || 10)}
                                      className="px-1.5 py-0.5 bg-[#c9a063] text-black rounded text-[10px] font-bold"
                                    >
                                      ✓
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setEditingRadiusWpId(wp.id);
                                      setEditingRadiusValue(radius.toString());
                                    }}
                                    className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono text-[11px] flex items-center gap-1"
                                    title="Click to edit alarm radius"
                                  >
                                    <span>{radius}m</span>
                                    <Sliders className="w-2.5 h-2.5 text-white/40" />
                                  </button>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {isInside ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 w-fit animate-pulse">
                                    <BellRing className="w-3 h-3" />
                                    IN ZONE
                                  </span>
                                ) : isNear ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-500/40 w-fit">
                                    APPROACHING
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-white/40">
                                    CLEAR
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => toggleWaypointAlarm(wp.id)}
                                    className={`p-1.5 rounded-lg border transition-colors ${
                                      isMuted
                                        ? 'bg-red-950/40 border-red-800/40 text-red-400'
                                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-[#c9a063]'
                                    }`}
                                    title={isMuted ? 'Alarm Muted (Click to Unmute)' : 'Alarm Active (Click to Mute)'}
                                  >
                                    {isMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setNavTargetId(`wp_${originalIdx}`);
                                      setNavTargetE(wp.E.toString());
                                      setNavTargetN(wp.N.toString());
                                      setNavTargetName(`${wp.id} (${wp.code})`);
                                    }}
                                    className="px-2 py-1 bg-[#141414] hover:bg-[#c9a063] hover:text-black text-white text-xs font-semibold rounded-lg border border-white/10 flex items-center gap-1 transition-all"
                                    title="Set as Go-To Target"
                                  >
                                    <Target className="w-3 h-3" />
                                    <span>Target</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right: Proximity Alarm Sentinel Engine Controls & Target Selector */}
            <div className="space-y-6">
              {/* Target Selector */}
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
                      <option key={`target_opt_${wp.id}_${wp.time || idx}_${idx}`} value={`wp_${idx}`}>
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
              </div>

              {/* Comprehensive Proximity Alarm Sentinel Engine Control Card */}
              <div className="bg-[#0f0f0f] p-5 rounded-2xl border border-white/5 space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-serif italic text-white flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-[#c9a063]" />
                    Proximity Alarm Sentinel
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/50">
                      {proximitySettings.enabled ? 'ACTIVE' : 'MUTED'}
                    </span>
                    <input
                      type="checkbox"
                      checked={proximitySettings.enabled}
                      onChange={e => setProximitySettings(prev => ({ ...prev, enabled: e.target.checked }))}
                      className="accent-[#c9a063] rounded cursor-pointer w-4 h-4"
                    />
                  </div>
                </div>

                {/* Global Detection Radius */}
                <div className="space-y-2 pt-1 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <label className="text-white/70 text-[11px] font-medium">Default Alarm Radius</label>
                    <span className="font-mono text-[#c9a063] font-bold">
                      {proximitySettings.globalRadius} m ({Math.round(proximitySettings.globalRadius * 3.28084)} ft)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={proximitySettings.globalRadius}
                    onChange={e => setProximitySettings(prev => ({ ...prev, globalRadius: parseInt(e.target.value, 10) || 10 }))}
                    className="w-full accent-[#c9a063]"
                  />
                  <div className="flex items-center gap-1 justify-between text-[10px]">
                    {[2, 5, 10, 20, 50, 100].map(r => (
                      <button
                        key={r}
                        onClick={() => setProximitySettings(prev => ({ ...prev, globalRadius: r }))}
                        className={`px-1.5 py-0.5 rounded border ${
                          proximitySettings.globalRadius === r
                            ? 'bg-[#c9a063] text-black font-bold border-[#c9a063]'
                            : 'bg-[#141414] text-white/60 border-white/10 hover:text-white'
                        }`}
                      >
                        {r}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sound Engine Profile Selector & Live Preview Button */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <label className="text-white/70 text-[11px] font-medium block">Audio Alert Tone Profile</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={proximitySettings.soundProfile}
                      onChange={e => setProximitySettings(prev => ({ ...prev, soundProfile: e.target.value as any }))}
                      className="flex-1 py-1.5 px-2.5 rounded-xl border border-white/10 bg-[#141414] text-white text-xs font-mono"
                    >
                      <option value="subtle-ping">Subtle Radar Chime (A5/E6 Harmonic Sine)</option>
                      <option value="surveyor-beep">Surveyor Station Beep (Double Pip)</option>
                      <option value="major-triad">Melodic Major Triad (C-E-G-C)</option>
                      <option value="sonar-pulse">Resonant Sonar Pulse (Sweep)</option>
                      <option value="geiger-click">Field Geiger Ticks (Fast Click)</option>
                    </select>

                    <button
                      onClick={handlePlayTestSound}
                      disabled={testSoundPlaying}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        testSoundPlaying
                          ? 'bg-emerald-500 text-black animate-pulse'
                          : 'bg-[#c9a063] hover:bg-[#d6b074] text-black shadow-md shadow-[#c9a063]/20'
                      }`}
                      title="Test synthesized Web Audio chime"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Test</span>
                    </button>
                  </div>
                </div>

                {/* Volume & Alerts Configuration */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <label className="text-white/70 text-[11px]">Audio Master Volume</label>
                    <span className="font-mono text-[#c9a063]">{Math.round(proximitySettings.volume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={proximitySettings.volume}
                    onChange={e => setProximitySettings(prev => ({ ...prev, volume: parseFloat(e.target.value) }))}
                    className="w-full accent-[#c9a063]"
                  />

                  <div className="space-y-2 pt-1">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white/70 text-[11px]">Haptic Vibration Pulse</span>
                        {isVibrationSupported() ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                            Mobile Active
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-white/40 font-mono">
                            Device Emulated
                          </span>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={proximitySettings.vibrate}
                        onChange={e => setProximitySettings(prev => ({ ...prev, vibrate: e.target.checked }))}
                        className="accent-[#c9a063] rounded"
                      />
                    </label>

                    {proximitySettings.vibrate && (
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => triggerProximityAlertHaptic('critical')}
                          className="px-2 py-1 rounded bg-[#c9a063]/10 hover:bg-[#c9a063]/20 text-[#c9a063] text-[10px] font-medium border border-[#c9a063]/30 transition-all flex items-center gap-1 active:scale-95"
                        >
                          <Activity className="w-3 h-3" />
                          Test Haptic Pulse
                        </button>
                      </div>
                    )}

                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-white/70 text-[11px]">Floating Banner HUD</span>
                      <input
                        type="checkbox"
                        checked={proximitySettings.bannerAlerts}
                        onChange={e => setProximitySettings(prev => ({ ...prev, bannerAlerts: e.target.checked }))}
                        className="accent-[#c9a063] rounded"
                      />
                    </label>
                  </div>
                </div>

                {/* Alarm Repeat Mode */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <label className="text-white/70 text-[11px] font-medium block">Alarm Trigger Cadence</label>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    {[
                      { id: 'entry-only', label: 'On Entry Only' },
                      { id: 'continuous-5s', label: 'Repeat 5s' },
                      { id: 'continuous-15s', label: 'Repeat 15s' },
                      { id: 'continuous-30s', label: 'Repeat 30s' }
                    ].map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => setProximitySettings(prev => ({ ...prev, repeatMode: mode.id as any }))}
                        className={`py-1 px-2 rounded-lg border text-center transition-all ${
                          proximitySettings.repeatMode === mode.id
                            ? 'bg-[#c9a063]/20 border-[#c9a063] text-[#c9a063] font-bold'
                            : 'bg-[#141414] border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Proximity Alarm Event Audit Log */}
          <div className="bg-[#0f0f0f] p-6 rounded-2xl border border-white/5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="text-base font-serif italic text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-[#c9a063]" />
                  Proximity Alarm Event Audit Log ({alarmEvents.length})
                </h4>
                <p className="text-xs text-white/50">Chronological history of waypoint radius entry and exit triggers during survey operations.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportAlarmLogCSV}
                  disabled={alarmEvents.length === 0}
                  className="px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5 text-[#c9a063]" />
                  Export Log (CSV)
                </button>
                <button
                  onClick={handleClearAlarmHistory}
                  disabled={alarmEvents.length === 0}
                  className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 text-xs font-semibold rounded-xl border border-red-800/40 flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Log
                </button>
              </div>
            </div>

            {alarmEvents.length === 0 ? (
              <div className="p-6 bg-[#141414] rounded-xl border border-white/5 text-center text-xs text-white/40">
                No proximity breach events recorded yet. Alarm logs will appear here when you enter a waypoint's radius.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-xs text-left text-white/80 font-mono">
                  <thead className="text-[10px] uppercase text-[#c9a063] border-b border-white/10 bg-[#141414] sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Time</th>
                      <th className="py-2 px-3">Waypoint ID</th>
                      <th className="py-2 px-3">Event Type</th>
                      <th className="py-2 px-3">Distance</th>
                      <th className="py-2 px-3">Threshold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {alarmEvents.slice(0, 30).map(evt => (
                      <tr key={evt.id} className="hover:bg-white/5">
                        <td className="py-2 px-3 text-white/60">{new Date(evt.timestamp).toLocaleTimeString()}</td>
                        <td className="py-2 px-3 font-bold text-white">
                          {evt.waypointId} <span className="text-white/40 font-normal">({evt.waypointCode})</span>
                        </td>
                        <td className="py-2 px-3">
                          {evt.type === 'entered' ? (
                            <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded border border-emerald-500/40 text-[10px] font-bold">
                              ENTERED ZONE
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-zinc-800 text-white/70 rounded text-[10px]">
                              EXITED ZONE
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-bold text-emerald-400">{evt.distance.toFixed(2)} m</td>
                        <td className="py-2 px-3 text-white/50">{evt.radius.toFixed(1)} m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
          )}
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
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-inner flex justify-center bg-slate-100 dark:bg-black">
              <canvas ref={skyplotCanvasRef} width={400} height={340} className="w-full h-[320px] bg-slate-50 dark:bg-black" />
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
              {/* Undo & Redo & Delete controls */}
              <div className="flex items-center gap-1 bg-[#141414] p-1 rounded-xl border border-white/10">
                <button
                  onClick={handleUndoWaypoints}
                  disabled={historyIndex <= 0}
                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                  title="Undo last waypoint action (Ctrl+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5 text-[#c9a063]" />
                  <span>Undo</span>
                </button>
                <button
                  onClick={handleRedoWaypoints}
                  disabled={historyIndex >= wpHistory.length - 1}
                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                  title="Redo waypoint action (Ctrl+Y)"
                >
                  <Redo2 className="w-3.5 h-3.5 text-[#c9a063]" />
                  <span>Redo</span>
                </button>
                <button
                  onClick={handleDeleteLastWaypoint}
                  disabled={waypoints.length === 0}
                  className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-30 text-red-400 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                  title="Delete last recorded waypoint"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Last</span>
                </button>
                <button
                  onClick={handleClearAllWaypoints}
                  disabled={waypoints.length === 0}
                  className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/60 disabled:opacity-30 text-red-300 rounded-lg text-xs font-semibold border border-red-500/30 flex items-center gap-1 transition-all"
                  title="Clear all waypoints (Undoable with Ctrl+Z)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              </div>

              <button
                onClick={() => setIsImportModalOpen(true)}
                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold rounded-xl border border-blue-500/40 flex items-center gap-1.5 transition-all shadow-sm"
                title="Import waypoints and stakeout targets from CSV, GeoJSON, GPX, or WKT files"
              >
                <Upload className="w-3.5 h-3.5 text-blue-400" />
                Import Targets
              </button>
              <button
                onClick={handleDeduplicateWaypoints}
                disabled={waypoints.length === 0}
                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-xl border border-emerald-500/30 flex items-center gap-1.5 disabled:opacity-40 transition-all"
                title="Remove duplicate waypoints by spatial tolerance and ID"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Clean Duplicates
              </button>
              <button
                onClick={handleSendToGisAction}
                disabled={waypoints.length === 0}
                className="px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 text-xs font-semibold rounded-xl border border-emerald-500/30 flex items-center gap-1.5 disabled:opacity-40"
                title="Send waypoints as a new layer to GIS Map Studio"
              >
                <Layers className="w-3.5 h-3.5" />
                Send to GIS
              </button>
              <button
                onClick={handleSendToCalcAction}
                disabled={waypoints.length === 0}
                className="px-3 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-1.5 disabled:opacity-40"
                title="Send coordinates to Survey Calculator"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-[#c9a063]" />
                Send to Calc
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
                  <th className="py-2.5 px-3 font-mono">Proximity Alarm</th>
                  <th className="py-2.5 px-3">Remarks</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {waypoints.map((wp, idx) => {
                  const dE = currentPos ? wp.E - currentPos.utm.E : 0;
                  const dN = currentPos ? wp.N - currentPos.utm.N : 0;
                  const dist = currentPos ? Math.hypot(dE, dN) : null;
                  const radius = wp.proximityRadius ?? proximitySettings.globalRadius;
                  const isInside = dist !== null && dist <= radius;
                  const isMuted = wp.alarmDisabled || snoozedWpIds.includes(wp.id);

                  return (
                    <tr key={`reg_wp_${wp.id}_${wp.time || idx}_${idx}`} className={`hover:bg-white/5 ${isInside ? 'bg-emerald-950/20' : ''}`}>
                      <td className="py-2 px-3 font-mono font-bold text-white">
                        <div className="flex items-center gap-1.5">
                          {isInside && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />}
                          <span>{wp.id}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3">{wp.code}</td>
                      <td className="py-2 px-3 font-mono">{wp.E.toFixed(3)}</td>
                      <td className="py-2 px-3 font-mono">{wp.N.toFixed(3)}</td>
                      <td className="py-2 px-3 font-mono">{wp.Z.toFixed(2)}</td>
                      <td className="py-2 px-3 font-mono">
                        <div className="flex items-center gap-1.5">
                          {editingRadiusWpId === wp.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                max="500"
                                value={editingRadiusValue}
                                onChange={e => setEditingRadiusValue(e.target.value)}
                                className="w-12 px-1 py-0.5 bg-[#141414] border border-[#c9a063] rounded text-white text-xs font-mono"
                                autoFocus
                              />
                              <button
                                onClick={() => updateWaypointRadius(wp.id, parseFloat(editingRadiusValue) || 10)}
                                className="px-1.5 py-0.5 bg-[#c9a063] text-black rounded text-[10px] font-bold"
                              >
                                ✓
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingRadiusWpId(wp.id);
                                setEditingRadiusValue(radius.toString());
                              }}
                              className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono text-[11px] flex items-center gap-1"
                              title="Click to edit alarm radius"
                            >
                              <span>{radius}m</span>
                              <Sliders className="w-2.5 h-2.5 text-white/40" />
                            </button>
                          )}

                          {dist !== null && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              isInside ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'text-white/40'
                            }`}>
                              {isInside ? '🎯 In Zone' : `${dist.toFixed(1)}m`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-white/50 truncate max-w-xs">{wp.remarks || '-'}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggleWaypointAlarm(wp.id)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isMuted
                                ? 'bg-red-950/40 border-red-800/40 text-red-400'
                                : 'bg-white/5 hover:bg-white/10 border-white/10 text-[#c9a063]'
                            }`}
                            title={isMuted ? 'Alarm Muted (Click to Unmute)' : 'Alarm Active (Click to Mute)'}
                          >
                            {isMuted ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => {
                              setNavTargetId(`wp_${idx}`);
                              setNavTargetE(wp.E.toString());
                              setNavTargetN(wp.N.toString());
                              setNavTargetName(`${wp.id} (${wp.code})`);
                              setSubTab('navigation');
                            }}
                            className="p-1.5 bg-white/5 hover:bg-[#c9a063] hover:text-black text-white rounded-lg border border-white/10"
                            title="Navigate to Waypoint"
                          >
                            <Navigation className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setWaypoints(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-400/60 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/30"
                            title="Delete Waypoint"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Waypoints & Stakeout Targets Import Modal */}
      <ImportWaypointsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        workingZone={workingZone}
        onImportWaypoints={(importedPoints) => {
          updateWaypointsWithHistory(
            prev => [...prev, ...importedPoints],
            `Imported ${importedPoints.length} waypoints`
          );
          toast.showSuccess(`Successfully imported ${importedPoints.length} stakeout waypoints.`);
          speakVoiceAnnouncement(`Imported ${importedPoints.length} waypoints.`);
        }}
      />
    </div>
  );
};
