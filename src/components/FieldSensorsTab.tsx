import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Compass,
  Camera,
  Activity,
  Zap,
  Volume2,
  BatteryCharging,
  Download,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Layers,
  SunMedium,
  Crosshair,
  Bluetooth,
  Wifi,
  Radio,
  Share2,
  Terminal,
  WifiOff,
  Send,
  Cpu,
  Monitor,
  Mic,
  VolumeX,
  Smartphone,
  HardDrive,
  CloudSun,
  Undo2,
  Redo2,
  Trash2,
  Trash,
  MicOff,
  Sparkles
} from 'lucide-react';
import { triggerHaptic, isVibrationSupported } from '../lib/haptics';
import { lonLatToUtm } from '../lib/geodesy';
import {
  getNetworkTelemetry,
  NetworkTelemetry,
  NfcSurveyMonument,
  detectDeviceHardwareProfile
} from '../lib/hardwareComms';
import { useIsDarkMode } from '../hooks/useIsDarkMode';
import { useManagedResource } from '../hooks/useHardwareResource';
import { parseSurveyVoiceCommand, speakVoiceAnnouncement } from '../lib/voiceCommander';

// Modular Hardware Sub-views
import { TheodoliteView } from './hardware/TheodoliteView';
import { SpiritLevelView } from './hardware/SpiritLevelView';
import { BluetoothRtkView } from './hardware/BluetoothRtkView';
import { NfcCadastralView } from './hardware/NfcCadastralView';
import { WifiMeshView } from './hardware/WifiMeshView';
import { DesktopSerialHidView } from './hardware/DesktopSerialHidView';
import { DeviceDiagnosticsView } from './hardware/DeviceDiagnosticsView';
import { EnvironmentalDataView } from './hardware/EnvironmentalDataView';

interface FieldSensorsTabProps {
  workingZone?: string;
  distanceUnit?: 'm' | 'ft';
  onSendToGisLayers?: (features: any[], layerName: string) => void;
}

interface SensorReading {
  id: string;
  timestamp: string;
  heading: number;
  pitch: number;
  roll: number;
  inclineAngle: number;
  slopePercent: number;
  zenithAngle: number;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  accuracy: number | null;
  stepCount: number;
  noiseDb: number | null;
  remarks: string;
}

export const FieldSensorsTab: React.FC<FieldSensorsTabProps> = ({
  workingZone = '45N',
  distanceUnit = 'm',
  onSendToGisLayers
}) => {
  const isDark = useIsDarkMode();
  const [activeSubTab, setActiveSubTab] = useState<
    'theodolite' | 'level' | 'weather' | 'bluetooth' | 'nfc' | 'mesh' | 'desktop' | 'pedometer' | 'sound' | 'diagnostics'
  >('theodolite');

  // 1. Orientation & Motion Sensors State
  const [heading, setHeading] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);
  const [roll, setRoll] = useState<number>(0);
  const [isSensorActive, setIsSensorActive] = useState<boolean>(false);
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [tarePitch, setTarePitch] = useState<number>(0);
  const [tareRoll, setTareRoll] = useState<number>(0);
  const [hapticLevelArmed, setHapticLevelArmed] = useState<boolean>(true);

  // 2. Accelerometer & Pedometer State
  const [accel, setAccel] = useState<{ x: number; y: number; z: number; mag: number }>({ x: 0, y: 0, z: 0, mag: 9.8 });
  const [stepCount, setStepCount] = useState<number>(0);
  const [isPacingActive, setIsPacingActive] = useState<boolean>(false);
  const [paceLengthM, setPaceLengthM] = useState<number>(0.762);
  const [paceStartTime, setPaceStartTime] = useState<number | null>(null);
  const [paceElapsedTime, setPaceElapsedTime] = useState<number>(0);
  const lastAccelMagRef = useRef<number>(9.8);
  const lastStepTimeRef = useRef<number>(0);

  // 3. Sighting & Lock
  const [targetLocked, setTargetLocked] = useState<boolean>(false);
  const [lockedReading, setLockedReading] = useState<{ heading: number; pitch: number; roll: number } | null>(null);

  // 4. Acoustic / Sound Level Meter
  const [noiseDb, setNoiseDb] = useState<number | null>(null);
  const [peakNoiseDb, setPeakNoiseDb] = useState<number>(0);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnimFrameRef = useRef<number | null>(null);

  // 5. Battery & System Hardware Telemetry
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);
  const [isWakeLocked, setIsWakeLocked] = useState<boolean>(false);
  const wakeLockSentinelRef = useRef<any>(null);

  // 6. GNSS / Geolocation State
  const [gpsFix, setGpsFix] = useState<{
    lat: number;
    lon: number;
    alt: number | null;
    acc: number | null;
    speed: number | null;
  } | null>(null);

  // 7. Wi-Fi / Hotspot & Direct P2P Mesh State
  const [networkInfo, setNetworkInfo] = useState<NetworkTelemetry>(getNetworkTelemetry());
  const [meshPeerId] = useState<string>(() => `SURV-${Math.floor(1000 + Math.random() * 9000)}`);
  const [meshMessages, setMeshMessages] = useState<
    { sender: string; time: string; type: 'point' | 'chat' | 'beacon' | 'rtcm'; payload: any }[]
  >([]);
  const [activePeers, setActivePeers] = useState<string[]>(['RODMAN-02', 'BASE-STATION-HOTSPOT']);
  const meshChannelRef = useRef<BroadcastChannel | null>(null);

  // 8. Data Logging & Ledger with Undo / Redo History
  const [readingsLog, setReadingsLog] = useState<SensorReading[]>([]);
  const [readingsHistory, setReadingsHistory] = useState<SensorReading[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [currentRemarks, setCurrentRemarks] = useState<string>('');

  // 9. Voice Commander & Natural Language Recognition
  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const [voiceActionFeedback, setVoiceActionFeedback] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const commitReadingsWithHistory = useCallback((updater: SensorReading[] | ((prev: SensorReading[]) => SensorReading[])) => {
    setReadingsLog(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setReadingsHistory(hist => {
        const sliced = hist.slice(0, historyIndex + 1);
        sliced.push(next);
        if (sliced.length > 50) sliced.shift();
        return sliced;
      });
      setHistoryIndex(prevIdx => Math.min(prevIdx + 1, 49));
      return next;
    });
  }, [historyIndex]);

  const handleUndoReading = useCallback(() => {
    if (historyIndex > 0) {
      const targetIdx = historyIndex - 1;
      const targetState = readingsHistory[targetIdx];
      setReadingsLog(targetState);
      setHistoryIndex(targetIdx);
      speakVoiceAnnouncement('Observation undo applied.');
      triggerHaptic([20, 20]);
    }
  }, [historyIndex, readingsHistory]);

  const handleRedoReading = useCallback(() => {
    if (historyIndex < readingsHistory.length - 1) {
      const targetIdx = historyIndex + 1;
      const targetState = readingsHistory[targetIdx];
      setReadingsLog(targetState);
      setHistoryIndex(targetIdx);
      speakVoiceAnnouncement('Observation redo applied.');
      triggerHaptic([20, 20]);
    }
  }, [historyIndex, readingsHistory]);

  const handleDeleteReading = useCallback((id: string) => {
    commitReadingsWithHistory(prev => prev.filter(r => r.id !== id));
    speakVoiceAnnouncement(`Deleted observation ${id}`);
    triggerHaptic([30, 20]);
  }, [commitReadingsWithHistory]);

  const handleDeleteLastReading = useCallback(() => {
    if (readingsLog.length === 0) return;
    const lastItem = readingsLog[0];
    commitReadingsWithHistory(prev => prev.slice(1));
    speakVoiceAnnouncement(`Deleted observation ${lastItem.id}`);
    triggerHaptic([30, 20]);
  }, [readingsLog, commitReadingsWithHistory]);

  const handleClearReadings = useCallback(() => {
    if (readingsLog.length === 0) return;
    commitReadingsWithHistory([]);
    speakVoiceAnnouncement('All observations cleared.');
    triggerHaptic([40, 40, 60]);
  }, [readingsLog, commitReadingsWithHistory]);

  // Centralized Managed Hardware Resource Token
  const managedResource = useManagedResource('field_sensors_suite', 'Field Sensors Suite');

  // -------------------------------------------------------------
  // A. SENSOR LISTENERS (Strictly On-Demand / Subtab-Driven)
  // -------------------------------------------------------------
  const isOrientationRequired =
    activeSubTab === 'theodolite' ||
    activeSubTab === 'level' ||
    activeSubTab === 'diagnostics' ||
    isSensorActive;

  const isMotionRequired =
    activeSubTab === 'pedometer' ||
    isPacingActive ||
    activeSubTab === 'diagnostics';

  // Orientation Lifecycle (Electronic Theodolite, Spirit Level & Compass)
  useEffect(() => {
    if (!isOrientationRequired) {
      setIsSensorActive(false);
      return;
    }

    const unregister = managedResource.registerOrientation((e: DeviceOrientationEvent) => {
      let h = 0;
      if ((e as any).webkitCompassHeading !== undefined) {
        h = (e as any).webkitCompassHeading;
      } else if (e.alpha !== null) {
        h = (360 - e.alpha) % 360;
      }
      setHeading(Math.round(h * 10) / 10);

      const p = e.beta !== null ? Math.round(e.beta * 10) / 10 : 0;
      const r = e.gamma !== null ? Math.round(e.gamma * 10) / 10 : 0;
      setPitch(p);
      setRoll(r);
      setIsSensorActive(true);

      const effP = Math.abs(p - tarePitch);
      const effR = Math.abs(r - tareRoll);
      if (hapticLevelArmed && effP < 0.25 && effR < 0.25) {
        triggerHaptic([20]);
      }
    });

    return () => {
      unregister();
    };
  }, [isOrientationRequired, tarePitch, tareRoll, hapticLevelArmed, managedResource]);

  // Accelerometer / Motion Lifecycle (Surveyor Pacing Dead-Reckoning)
  useEffect(() => {
    if (!isMotionRequired) return;

    const unregister = managedResource.registerMotion((e: DeviceMotionEvent) => {
      if (!e.accelerationIncludingGravity) return;
      const x = e.accelerationIncludingGravity.x || 0;
      const y = e.accelerationIncludingGravity.y || 0;
      const z = e.accelerationIncludingGravity.z || 0;
      const mag = Math.sqrt(x * x + y * y + z * z);

      setAccel({
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        z: Math.round(z * 100) / 100,
        mag: Math.round(mag * 100) / 100
      });

      if (isPacingActive) {
        const delta = mag - lastAccelMagRef.current;
        const now = Date.now();
        if (delta > 1.8 && now - lastStepTimeRef.current > 330) {
          lastStepTimeRef.current = now;
          setStepCount(prev => prev + 1);
          triggerHaptic(15);
        }
        lastAccelMagRef.current = mag;
      }
    });

    return () => {
      unregister();
    };
  }, [isMotionRequired, isPacingActive, managedResource]);

  // GNSS Geolocation Watcher (Only on Diagnostics or active GNSS request)
  useEffect(() => {
    if (activeSubTab !== 'diagnostics') return;

    const stopTracking = managedResource.startLocationTracking(
      pos => {
        setGpsFix({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          alt: pos.coords.altitude,
          acc: pos.coords.accuracy,
          speed: pos.coords.speed
        });
      },
      err => {
        console.debug('Field sensors GNSS status:', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );

    return () => {
      stopTracking();
    };
  }, [activeSubTab, managedResource]);

  const requestOrientationPermission = async () => {
    if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
      try {
        const res = await (DeviceOrientationEvent as any).requestPermission();
        if (res === 'granted') {
          setIsSensorActive(true);
        } else {
          setSensorError('Device orientation permission denied.');
        }
      } catch (err: any) {
        setSensorError(err.message || 'Permission request failed');
      }
    } else {
      setIsSensorActive(true);
    }
  };

  // Battery Status & Network Watcher
  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        setIsCharging(battery.charging);

        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
        battery.addEventListener('chargingchange', () => {
          setIsCharging(battery.charging);
        });
      }).catch(() => {});
    }

    const updateNetwork = () => setNetworkInfo(getNetworkTelemetry());
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    if ((navigator as any).connection) {
      (navigator as any).connection.addEventListener('change', updateNetwork);
    }

    try {
      // Channel name retained across the rebrand so a rebranded device can still
      // mesh with a field device still running the previous build.
      const channel = new BroadcastChannel('geostudio_field_mesh');
      meshChannelRef.current = channel;
      channel.onmessage = (event: MessageEvent) => {
        if (event.data && event.data.sender !== meshPeerId) {
          setMeshMessages(prev => [event.data, ...prev.slice(0, 40)]);
          if (!activePeers.includes(event.data.sender)) {
            setActivePeers(prev => [...prev, event.data.sender]);
          }
          triggerHaptic(20);
        }
      };
    } catch (e) {
      console.debug('BroadcastChannel fallback');
    }

    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      if (meshChannelRef.current) meshChannelRef.current.close();
    };
  }, [meshPeerId, activePeers]);

  // Pacing Timer loop
  useEffect(() => {
    let interval: any;
    if (isPacingActive) {
      interval = setInterval(() => {
        if (paceStartTime) {
          setPaceElapsedTime(Math.floor((Date.now() - paceStartTime) / 1000));
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPacingActive, paceStartTime]);

  // Screen Wake Lock Toggle (Managed Hardware Lifecycle)
  const toggleWakeLock = async () => {
    try {
      if (!isWakeLocked) {
        const acquired = await managedResource.acquireWakeLock('Survey Wake Lock');
        if (acquired) {
          setIsWakeLocked(true);
          triggerHaptic([30, 20, 40]);
        } else {
          setSensorError('Screen Wake Lock is not supported or was rejected by browser.');
        }
      } else {
        managedResource.releaseWakeLock();
        setIsWakeLocked(false);
      }
    } catch (err: any) {
      setSensorError(`Wake Lock: ${err.message}`);
    }
  };

  // Sound Meter (Managed Microphone Lifecycle)
  const startMic = async () => {
    try {
      const stream = await managedResource.acquireMicrophone({ audio: true }, 'Sound Level Analyzer');
      micStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      setIsMicActive(true);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const updateNoise = () => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sum / buffer.length);
        const calculatedDb = rms > 0 ? Math.min(120, Math.max(30, Math.round(20 * Math.log10(rms) + 20))) : 30;
        setNoiseDb(calculatedDb);
        setPeakNoiseDb(prev => Math.max(prev, calculatedDb));
        micAnimFrameRef.current = requestAnimationFrame(updateNoise);
      };
      updateNoise();
    } catch (err: any) {
      setSensorError(`Mic error: ${err.message}`);
      setIsMicActive(false);
    }
  };

  const stopMic = () => {
    if (micAnimFrameRef.current) cancelAnimationFrame(micAnimFrameRef.current);
    micAnimFrameRef.current = null;
    managedResource.releaseMicrophone();
    micStreamRef.current = null;
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close().catch(() => {});
      } catch {}
      audioCtxRef.current = null;
    }
    setIsMicActive(false);
    setNoiseDb(null);
  };

  // Automatically release microphone when navigating away from Sound subtab
  useEffect(() => {
    if (activeSubTab !== 'sound' && isMicActive) {
      stopMic();
    }
  }, [activeSubTab, isMicActive]);

  // Calculations
  const activePitch = targetLocked && lockedReading ? lockedReading.pitch : pitch - tarePitch;
  const activeRoll = targetLocked && lockedReading ? lockedReading.roll : roll - tareRoll;
  const activeHeading = targetLocked && lockedReading ? lockedReading.heading : heading;
  const inclineTotalDeg = Math.sqrt(activePitch * activePitch + activeRoll * activeRoll);
  const slopePercent = Math.round(Math.tan((inclineTotalDeg * Math.PI) / 180) * 1000) / 10;
  const zenithAngle = Math.round(Math.abs(90 - Math.abs(activePitch)) * 10) / 10;

  const totalPacingDistanceM = stepCount * paceLengthM;
  const totalPacingDistance = distanceUnit === 'ft' ? totalPacingDistanceM * 3.28084 : totalPacingDistanceM;
  const pacingSpeedMps = paceElapsedTime > 0 ? totalPacingDistanceM / paceElapsedTime : 0;
  const pacingSpeedKmH = pacingSpeedMps * 3.6;

  // Logging & Exports with Undo/Redo tracking
  const handleLogReading = (customRemark?: string) => {
    const newReading: SensorReading = {
      id: `OBS-${Date.now().toString().slice(-4)}`,
      timestamp: new Date().toLocaleTimeString(),
      heading: activeHeading,
      pitch: Math.round(activePitch * 10) / 10,
      roll: Math.round(activeRoll * 10) / 10,
      inclineAngle: Math.round(inclineTotalDeg * 10) / 10,
      slopePercent,
      zenithAngle,
      latitude: gpsFix?.lat || null,
      longitude: gpsFix?.lon || null,
      altitude: gpsFix?.alt ? Math.round(gpsFix.alt * 10) / 10 : null,
      accuracy: gpsFix?.acc ? Math.round(gpsFix.acc * 10) / 10 : null,
      stepCount,
      noiseDb,
      remarks: customRemark || currentRemarks.trim() || 'Field Observation'
    };

    commitReadingsWithHistory(prev => [newReading, ...prev]);
    speakVoiceAnnouncement(`Observation ${newReading.id} recorded.`);
    setCurrentRemarks('');
    triggerHaptic([30, 40, 60]);
  };

  // Web Speech Recognition Controller
  const startVoiceCommander = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSensorError('Speech recognition is not supported in this browser. Use Chrome/Edge/Safari on desktop or mobile.');
      speakVoiceAnnouncement('Voice commands not supported in this browser.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsVoiceListening(true);
        setVoiceActionFeedback('Listening for survey commands (e.g., "Record point", "Undo", "Tare level", "Lock sight")...');
        speakVoiceAnnouncement('Voice commands active.');
        triggerHaptic([20, 30]);
      };

      recognition.onresult = (event: any) => {
        const lastResultIndex = event.results.length - 1;
        const transcript = event.results[lastResultIndex][0].transcript.trim();
        setVoiceTranscript(transcript);

        const action = parseSurveyVoiceCommand(transcript);
        if (action) {
          setVoiceActionFeedback(`Executed: "${transcript}"`);
          switch (action.type) {
            case 'RECORD_POINT':
              handleLogReading(action.remark || 'Voice Observation');
              break;
            case 'UNDO':
              handleUndoReading();
              break;
            case 'REDO':
              handleRedoReading();
              break;
            case 'DELETE_LAST':
              handleDeleteLastReading();
              break;
            case 'CLEAR_ALL':
              handleClearReadings();
              break;
            case 'TARE_LEVEL':
              setTarePitch(pitch);
              setTareRoll(roll);
              speakVoiceAnnouncement('Sensors tared to current horizon.');
              break;
            case 'LOCK_TARGET':
              setTargetLocked(true);
              setLockedReading({ heading, pitch, roll });
              speakVoiceAnnouncement('Target sight locked.');
              break;
            case 'UNLOCK_TARGET':
              setTargetLocked(false);
              setLockedReading(null);
              speakVoiceAnnouncement('Target sight unlocked.');
              break;
            case 'START_PACING':
              setIsPacingActive(true);
              setPaceStartTime(Date.now());
              speakVoiceAnnouncement('Pedometer pacing started.');
              break;
            case 'STOP_PACING':
              setIsPacingActive(false);
              speakVoiceAnnouncement('Pedometer pacing paused.');
              break;
            case 'OPEN_AR':
              setActiveSubTab('theodolite');
              speakVoiceAnnouncement('Theodolite camera optical view opened.');
              break;
            default:
              break;
          }
        } else {
          setVoiceActionFeedback(`Heard: "${transcript}" (Unrecognized command)`);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          setVoiceActionFeedback(`Voice error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsVoiceListening(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err: any) {
      setSensorError(`Speech recognition start error: ${err.message}`);
      setIsVoiceListening(false);
    }
  }, [pitch, roll, heading, handleLogReading, handleUndoReading, handleRedoReading, handleDeleteLastReading]);

  const stopVoiceCommander = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsVoiceListening(false);
    setVoiceActionFeedback(null);
    speakVoiceAnnouncement('Voice commands paused.');
    triggerHaptic([20]);
  }, []);

  const handleExportCsv = () => {
    if (!readingsLog.length) return;
    const headers = [
      'Reading_ID',
      'Timestamp',
      'Azimuth_Deg',
      'Pitch_Deg',
      'Roll_Deg',
      'Incline_Deg',
      'Slope_Percent',
      'Zenith_Deg',
      'Latitude',
      'Longitude',
      'Altitude_m',
      'GPS_Accuracy_m',
      'Pace_Steps',
      'Noise_dB',
      'Remarks'
    ];
    const rows = readingsLog.map(r => [
      r.id,
      r.timestamp,
      r.heading,
      r.pitch,
      r.roll,
      r.inclineAngle,
      r.slopePercent,
      r.zenithAngle,
      r.latitude ?? '',
      r.longitude ?? '',
      r.altitude ?? '',
      r.accuracy ?? '',
      r.stepCount,
      r.noiseDb ?? '',
      `"${r.remarks.replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BhuNexStudio_Sensors_Log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSendToGis = () => {
    if (!readingsLog.length || !onSendToGisLayers) return;
    const zNum = parseInt(workingZone, 10) || 45;
    const isSouth = workingZone.endsWith('S');

    const validReadings = readingsLog.filter(r => r.latitude !== null && r.longitude !== null);
    if (!validReadings.length) {
      alert('No logged readings contain GPS coordinates to plot on GIS map.');
      return;
    }

    const features = validReadings.map(r => {
      const utm = lonLatToUtm(r.longitude!, r.latitude!, zNum, isSouth);
      return {
        id: r.id,
        name: `${r.id} (${r.remarks})`,
        geomType: 'point',
        coordinates: [r.longitude!, r.latitude!],
        properties: {
          Azimuth: `${r.heading}°`,
          Pitch: `${r.pitch}°`,
          Roll: `${r.roll}°`,
          Incline: `${r.inclineAngle}°`,
          Slope: `${r.slopePercent}%`,
          Easting: utm.E.toFixed(2),
          Northing: utm.N.toFixed(2),
          Altitude: r.altitude ? `${r.altitude}m` : 'N/A',
          Noise_dB: r.noiseDb ? `${r.noiseDb} dB` : 'N/A'
        }
      };
    });

    onSendToGisLayers(features, 'Field Sensor Observations');
  };

  const handleSendNfcToGis = (monument: NfcSurveyMonument) => {
    if (!onSendToGisLayers) return;
    const zNum = parseInt(workingZone, 10) || 45;
    const isSouth = workingZone.endsWith('S');
    const utm = lonLatToUtm(monument.longitude, monument.latitude, zNum, isSouth);

    const feature = {
      id: monument.pointId,
      name: `${monument.pointId} (${monument.surveyType})`,
      geomType: 'point',
      coordinates: [monument.longitude, monument.latitude],
      properties: {
        Type: monument.surveyType,
        Datum: monument.datum,
        Easting: utm.E.toFixed(3),
        Northing: utm.N.toFixed(3),
        Elevation_m: monument.altitudeM.toFixed(3),
        Surveyor: monument.surveyor,
        Notes: monument.notes
      }
    };
    onSendToGisLayers([feature], 'NFC Cadastral Monuments');
  };

  // Reusable theme class variables
  const cardBg = isDark ? 'bg-[#111111] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm';
  const subCardBg = isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-slate-200/80';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-white/50' : 'text-slate-500';
  const textMuted = isDark ? 'text-white/40' : 'text-slate-400';
  const borderSubtle = isDark ? 'border-white/[0.06]' : 'border-slate-200';
  const btnSecondary = isDark ? 'bg-white/[0.04] hover:bg-white/[0.08] text-white/80 hover:text-white border-white/[0.08]' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200';

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header & Quick Telemetry Badges */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b ${borderSubtle} pb-4`}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl sm:text-2xl font-serif italic ${textPrimary} tracking-tight`}>
              Field Hardware & Meteorology Station
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#c9a063]/10 text-[#c9a063] border border-[#c9a063]/25">
              Cross-Platform Drivers
            </span>
          </div>
          <p className={`text-xs ${textSecondary} mt-1`}>
            Universal peripheral suite: Bluetooth LE RTK, Atmospheric Meteorology, NFC tags, Wi-Fi Direct Mesh, USB-OTG Total Stations, Optical HUD, 2D Spirit Level & Voice Surveyor.
          </p>
        </div>

        {/* Quick System Badges */}
        <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
          <div className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
            networkInfo.online
              ? isDark ? 'bg-white/[0.04] border-white/[0.08] text-white/80' : 'bg-slate-100 border-slate-200 text-slate-700'
              : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
          }`}>
            {networkInfo.online ? <Wifi className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="capitalize">{networkInfo.type}</span>
          </div>

          <button
            onClick={toggleWakeLock}
            className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-colors ${
              isWakeLocked
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-medium'
                : btnSecondary
            }`}
            title="Toggle Keep Screen On"
          >
            <SunMedium className="w-3.5 h-3.5" />
            <span>{isWakeLocked ? 'Awake' : 'Sleep OK'}</span>
          </button>

          {batteryLevel !== null && (
            <div className={`px-2.5 py-1 rounded-lg ${isDark ? 'bg-white/[0.04] border-white/[0.08] text-white/70' : 'bg-slate-100 border-slate-200 text-slate-700'} border flex items-center gap-1.5`}>
              <BatteryCharging className={`w-3.5 h-3.5 ${isCharging ? 'text-emerald-500 dark:text-emerald-400' : 'text-[#c9a063]'}`} />
              <span>{batteryLevel}%</span>
            </div>
          )}

          {isVibrationSupported() && (
            <button
              onClick={() => setHapticLevelArmed(!hapticLevelArmed)}
              className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-colors ${
                hapticLevelArmed
                  ? 'bg-[#c9a063]/10 border-[#c9a063]/30 text-[#c9a063] font-medium'
                  : btnSecondary
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Haptics {hapticLevelArmed ? 'ON' : 'OFF'}</span>
            </button>
          )}

          {/* Voice Commander Quick Controller in Top Bar */}
          <button
            onClick={isVoiceListening ? stopVoiceCommander : startVoiceCommander}
            className={`px-3 py-1 rounded-lg border flex items-center gap-1.5 transition-all text-xs font-semibold ${
              isVoiceListening
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse border-emerald-400 shadow-md shadow-emerald-600/30'
                : 'bg-[#c9a063]/20 hover:bg-[#c9a063]/30 text-[#c9a063] border-[#c9a063]/40'
            }`}
            title="Toggle Live Voice Command Recognition"
          >
            {isVoiceListening ? <Mic className="w-3.5 h-3.5 animate-bounce" /> : <MicOff className="w-3.5 h-3.5" />}
            <span>{isVoiceListening ? 'Voice Active' : 'Voice Cmd'}</span>
          </button>
        </div>
      </div>

      {/* Voice Commander Status HUD Banner */}
      {isVoiceListening && (
        <div className="p-3.5 bg-gradient-to-r from-emerald-950/80 via-[#141714] to-black border border-emerald-500/40 rounded-2xl shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-950 border border-emerald-400/60 rounded-xl text-emerald-400">
              <Mic className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-300 bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-500/40">
                  Voice Command Engine Active
                </span>
                {voiceTranscript && (
                  <span className="text-white font-mono font-medium">"{voiceTranscript}"</span>
                )}
              </div>
              <p className="text-white/60 text-[11px] mt-0.5">
                {voiceActionFeedback || 'Say: "Record point", "Undo", "Redo", "Tare level", "Lock sight", "Start pacing"...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
            {['Record point', 'Undo', 'Redo', 'Tare level', 'Lock sight'].map(cmd => (
              <span key={cmd} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/70 font-mono">
                {cmd}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sensor Permission Notice for Mobile Orientation */}
      {!isSensorActive && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5 text-amber-700 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
            <span>Mobile motion & IMU sensors require browser permission on some mobile devices.</span>
          </div>
          <button
            onClick={requestOrientationPermission}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs shrink-0 transition-colors shadow-sm"
          >
            Enable IMU
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className={`flex items-center gap-1 overflow-x-auto custom-scrollbar border-b ${borderSubtle} pb-1`}>
        {[
          { id: 'theodolite', label: 'Optical Theodolite HUD', icon: Camera },
          { id: 'level', label: '2D Spirit Level & Dip', icon: Crosshair },
          { id: 'weather', label: 'Atmospheric & Space Weather', icon: CloudSun },
          { id: 'bluetooth', label: 'Bluetooth LE RTK & Disto', icon: Bluetooth },
          { id: 'nfc', label: 'NFC Cadastral Monuments', icon: Cpu },
          { id: 'mesh', label: 'Wi-Fi Direct / Mesh', icon: Radio },
          { id: 'desktop', label: 'USB Serial & Voice Surveyor', icon: Terminal },
          { id: 'pedometer', label: 'Pacing Pedometer', icon: Activity },
          { id: 'sound', label: 'Acoustic Noise (dB)', icon: Volume2 },
          { id: 'diagnostics', label: 'Hardware Matrix', icon: Zap }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
                isActive
                  ? isDark
                    ? 'bg-white/[0.08] text-white border border-white/[0.12]'
                    : 'bg-white text-slate-900 border border-slate-300 shadow-sm font-semibold'
                  : isDark
                    ? 'text-white/50 hover:text-white hover:bg-white/[0.03]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#c9a063]' : textMuted}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENTS */}
      {activeSubTab === 'theodolite' && (
        <TheodoliteView
          heading={activeHeading}
          pitch={activePitch}
          roll={activeRoll}
          zenithAngle={zenithAngle}
          slopePercent={slopePercent}
          targetLocked={targetLocked}
          onToggleLock={() => {
            if (!targetLocked) {
              setLockedReading({ heading, pitch, roll });
              setTargetLocked(true);
              triggerHaptic([40, 20, 60]);
            } else {
              setTargetLocked(false);
              setLockedReading(null);
            }
          }}
          onLogReading={() => handleLogReading('Optical Sighting')}
        />
      )}

      {activeSubTab === 'level' && (
        <SpiritLevelView
          pitch={pitch}
          roll={roll}
          tarePitch={tarePitch}
          tareRoll={tareRoll}
          onTareZero={() => {
            setTarePitch(pitch);
            setTareRoll(roll);
          }}
          onResetTare={() => {
            setTarePitch(0);
            setTareRoll(0);
          }}
          hapticLevelArmed={hapticLevelArmed}
          onToggleHaptic={() => setHapticLevelArmed(!hapticLevelArmed)}
          onLogReading={() => handleLogReading('Level Observation')}
        />
      )}

      {activeSubTab === 'bluetooth' && (
        <BluetoothRtkView
          onLogDistance={dist => handleLogReading(`Laser Disto: ${dist}m`)}
        />
      )}

      {activeSubTab === 'nfc' && (
        <NfcCadastralView
          workingZone={workingZone}
          currentGps={gpsFix}
          onSendToGis={handleSendNfcToGis}
        />
      )}

      {activeSubTab === 'mesh' && (
        <WifiMeshView
          networkInfo={networkInfo}
          meshPeerId={meshPeerId}
          activePeers={activePeers}
          meshMessages={meshMessages}
          onSendMessage={(type, payload) => {
            const packet = {
              sender: meshPeerId,
              time: new Date().toLocaleTimeString(),
              type,
              payload
            };
            setMeshMessages(prev => [packet, ...prev.slice(0, 40)]);
            if (meshChannelRef.current) meshChannelRef.current.postMessage(packet);
            triggerHaptic(20);
          }}
          onShareGpsPoint={() => {
            if (!gpsFix) return alert('No GPS position to share.');
            const zNum = parseInt(workingZone, 10) || 45;
            const isSouth = workingZone.endsWith('S');
            const utm = lonLatToUtm(gpsFix.lon, gpsFix.lat, zNum, isSouth);
            const pointPayload = {
              pointId: `PT-${Date.now().toString().slice(-4)}`,
              lat: gpsFix.lat,
              lon: gpsFix.lon,
              alt: gpsFix.alt || 0,
              easting: utm.E,
              northing: utm.N,
              azimuth: heading,
              slope: slopePercent,
              surveyor: meshPeerId
            };
            const packet = {
              sender: meshPeerId,
              time: new Date().toLocaleTimeString(),
              type: 'point' as const,
              payload: pointPayload
            };
            setMeshMessages(prev => [packet, ...prev.slice(0, 40)]);
            if (meshChannelRef.current) meshChannelRef.current.postMessage(packet);
            triggerHaptic(20);
          }}
        />
      )}

      {activeSubTab === 'desktop' && (
        <DesktopSerialHidView
          onVoiceRecordPoint={remark => handleLogReading(remark)}
        />
      )}

      {activeSubTab === 'weather' && (
        <EnvironmentalDataView
          gpsFix={gpsFix}
          onLogReading={handleLogReading}
        />
      )}

      {activeSubTab === 'pedometer' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className={`md:col-span-6 ${cardBg} p-6 rounded-2xl border space-y-4 font-mono transition-colors`}>
            <div className="flex items-center justify-between font-sans">
              <span className={`text-xs font-semibold ${textPrimary}`}>Reconnaissance Pacing Pedometer</span>
              <Activity className="w-4 h-4 text-[#c9a063]" />
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className={`p-4 ${subCardBg} border rounded-xl`}>
                <div className={`text-[10px] ${textMuted} uppercase tracking-wider`}>Step Count</div>
                <div className={`text-3xl font-bold ${textPrimary} mt-1`}>{stepCount}</div>
              </div>
              <div className={`p-4 ${subCardBg} border rounded-xl`}>
                <div className={`text-[10px] ${textMuted} uppercase tracking-wider`}>Paced Distance</div>
                <div className="text-3xl font-bold text-[#c9a063] mt-1">
                  {totalPacingDistance.toFixed(2)} {distanceUnit}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isPacingActive ? (
                <button
                  onClick={() => {
                    setIsPacingActive(true);
                    if (!paceStartTime) setPaceStartTime(Date.now());
                    triggerHaptic([30, 40]);
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5 font-sans shadow-sm"
                >
                  <Play className="w-3.5 h-3.5" /> Start Pacing Session
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsPacingActive(false);
                    triggerHaptic(20);
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5 font-sans shadow-sm"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause Pacing
                </button>
              )}
              <button
                onClick={() => {
                  setStepCount(0);
                  setPaceStartTime(null);
                  setPaceElapsedTime(0);
                  setIsPacingActive(false);
                  triggerHaptic(20);
                }}
                className={`px-3 py-2.5 rounded-lg ${btnSecondary} text-xs border transition-colors`}
                title="Reset Steps"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className={`md:col-span-6 ${cardBg} p-6 rounded-2xl border space-y-4 font-mono text-xs transition-colors`}>
            <div className={`text-xs font-semibold ${textPrimary} font-sans`}>Stride Length Calibration</div>
            <div>
              <label className={`text-[10px] ${textMuted} block mb-1`}>Average Stride / Double-Pace (Meters)</label>
              <input
                type="number"
                step="0.01"
                value={paceLengthM}
                onChange={e => setPaceLengthM(parseFloat(e.target.value) || 0.762)}
                className={`w-full px-3 py-2 rounded-lg ${isDark ? 'bg-white/[0.04] border-white/[0.08] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} border focus:outline-none focus:border-[#c9a063]`}
              />
            </div>
            <div className={`p-3 ${subCardBg} border rounded-xl space-y-1`}>
              <div className="flex justify-between">
                <span className={textSecondary}>Elapsed Time:</span>
                <span className={`font-bold ${textPrimary}`}>{paceElapsedTime} seconds</span>
              </div>
              <div className="flex justify-between">
                <span className={textSecondary}>Walking Speed:</span>
                <span className="text-[#c9a063] font-bold">{pacingSpeedKmH.toFixed(2)} km/h</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'sound' && (
        <div className={`${cardBg} p-6 rounded-2xl border space-y-5 font-mono transition-colors`}>
          <div className="flex items-center justify-between font-sans">
            <div>
              <h3 className={`text-sm font-semibold ${textPrimary}`}>Acoustic Sound Level Meter (dB SPL)</h3>
              <p className={`text-xs ${textSecondary}`}>Site safety and heavy mining/construction equipment noise monitoring.</p>
            </div>
            <Volume2 className="w-5 h-5 text-[#c9a063]" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className={`p-4 ${subCardBg} border rounded-xl`}>
              <div className={`text-[10px] ${textMuted} uppercase tracking-wider`}>Real-Time Level</div>
              <div className="text-4xl font-bold text-[#c9a063] mt-1">
                {noiseDb !== null ? `${noiseDb} dB` : '-- dB'}
              </div>
            </div>
            <div className={`p-4 ${subCardBg} border rounded-xl`}>
              <div className={`text-[10px] ${textMuted} uppercase tracking-wider`}>Peak Recorded</div>
              <div className={`text-4xl font-bold ${textPrimary} mt-1`}>
                {peakNoiseDb > 0 ? `${peakNoiseDb} dB` : '-- dB'}
              </div>
            </div>
            <div className={`p-4 ${subCardBg} border rounded-xl`}>
              <div className={`text-[10px] ${textMuted} uppercase tracking-wider`}>OSHA Site Limit</div>
              <div className="text-4xl font-bold text-emerald-500 dark:text-emerald-400 mt-1">85 dB</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isMicActive ? (
              <button
                onClick={startMic}
                className="px-4 py-2 rounded-lg bg-[#c9a063] hover:bg-[#b88f55] text-black font-semibold text-xs transition-colors flex items-center gap-1.5 font-sans shadow-sm"
              >
                <Play className="w-3.5 h-3.5" /> Start Sound Analyzer
              </button>
            ) : (
              <button
                onClick={stopMic}
                className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5 font-sans"
              >
                <Pause className="w-3.5 h-3.5" /> Stop Analyzer
              </button>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'diagnostics' && (
        <DeviceDiagnosticsView
          networkInfo={networkInfo}
          batteryLevel={batteryLevel}
          isCharging={isCharging}
          accel={accel}
        />
      )}

      {/* ========================================================================= */}
      {/* OBSERVATION AUDIT LEDGER & GIS EXPORT */}
      {/* ========================================================================= */}
      <div className={`${cardBg} p-5 rounded-2xl border space-y-4 transition-colors`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className={`text-sm font-semibold ${textPrimary}`}>Sensor & Peripheral Observation Ledger</h3>
            <p className={`text-xs ${textSecondary}`}>Review, audit, and dispatch multi-sensor observations to GIS Map Layers or CSV.</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Undo / Redo / Delete Controls */}
            <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
              <button
                onClick={handleUndoReading}
                disabled={historyIndex <= 0}
                className={`px-2.5 py-1 rounded-lg ${btnSecondary} disabled:opacity-30 text-xs font-semibold flex items-center gap-1 transition-colors`}
                title="Undo last observation action"
              >
                <Undo2 className="w-3.5 h-3.5 text-[#c9a063]" />
                <span>Undo</span>
              </button>
              <button
                onClick={handleRedoReading}
                disabled={historyIndex >= readingsHistory.length - 1}
                className={`px-2.5 py-1 rounded-lg ${btnSecondary} disabled:opacity-30 text-xs font-semibold flex items-center gap-1 transition-colors`}
                title="Redo observation action"
              >
                <Redo2 className="w-3.5 h-3.5 text-[#c9a063]" />
                <span>Redo</span>
              </button>
              <button
                onClick={handleDeleteLastReading}
                disabled={readingsLog.length === 0}
                className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 disabled:opacity-30 text-xs font-semibold flex items-center gap-1 border border-red-500/20 transition-colors"
                title="Delete the most recent observation"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Last</span>
              </button>
              <button
                onClick={handleClearReadings}
                disabled={readingsLog.length === 0}
                className="px-2.5 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 disabled:opacity-30 text-xs font-semibold flex items-center gap-1 border border-red-500/30 transition-colors"
                title="Clear all recorded observations"
              >
                <Trash className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>

            <button
              onClick={handleExportCsv}
              disabled={!readingsLog.length}
              className={`px-3 py-1.5 rounded-lg ${btnSecondary} disabled:opacity-30 text-xs font-medium transition-colors border flex items-center gap-1.5`}
            >
              <Download className="w-3.5 h-3.5" /> Export CSV ({readingsLog.length})
            </button>
            {onSendToGisLayers && (
              <button
                onClick={handleSendToGis}
                disabled={!readingsLog.length}
                className="px-3.5 py-1.5 rounded-lg bg-[#c9a063] hover:bg-[#b88f55] disabled:opacity-30 text-black text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Layers className="w-3.5 h-3.5" /> Plot on GIS Map
              </button>
            )}
          </div>
        </div>

        {/* Ledger Table */}
        <div className={`border ${borderSubtle} rounded-xl overflow-x-auto max-h-60 custom-scrollbar`}>
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className={`${isDark ? 'bg-white/[0.02]' : 'bg-slate-50'} border-b ${borderSubtle} ${textMuted} text-[11px]`}>
                <th className="py-2.5 px-3">Point ID</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Azimuth</th>
                <th className="py-2.5 px-3">Pitch / Roll</th>
                <th className="py-2.5 px-3">Slope</th>
                <th className="py-2.5 px-3">GPS Lat/Lon</th>
                <th className="py-2.5 px-3">Elev (m)</th>
                <th className="py-2.5 px-3">Remarks</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-white/[0.04]' : 'divide-slate-200'}`}>
              {readingsLog.length > 0 ? (
                readingsLog.map(r => (
                  <tr key={r.id} className={`${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50/80'} ${textPrimary}`}>
                    <td className="py-2 px-3 text-[#c9a063] font-bold">{r.id}</td>
                    <td className={`py-2 px-3 ${textSecondary}`}>{r.timestamp}</td>
                    <td className="py-2 px-3">{r.heading}°</td>
                    <td className="py-2 px-3">{r.pitch}° / {r.roll}°</td>
                    <td className="py-2 px-3">{r.slopePercent}%</td>
                    <td className={`py-2 px-3 ${textSecondary}`}>
                      {r.latitude ? `${r.latitude.toFixed(5)}, ${r.longitude?.toFixed(5)}` : 'N/A'}
                    </td>
                    <td className="py-2 px-3">{r.altitude ?? 'N/A'}</td>
                    <td className={`py-2 px-3 ${textPrimary} truncate max-w-xs`}>{r.remarks}</td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => handleDeleteReading(r.id)}
                        className="p-1 hover:bg-red-500/20 text-red-500/70 hover:text-red-400 rounded transition-colors"
                        title={`Delete reading ${r.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className={`py-8 text-center ${textMuted} italic`}>
                    No observations logged yet. Log sight readings, level observations, or NFC/BLE points above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
