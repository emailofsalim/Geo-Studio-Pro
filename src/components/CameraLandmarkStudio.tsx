import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Camera,
  Compass,
  Crosshair,
  Maximize2,
  Minimize2,
  RefreshCw,
  Zap,
  ZapOff,
  Download,
  Trash2,
  MapPin,
  Eye,
  Sliders,
  Layers,
  Ruler,
  TrendingUp,
  FileSpreadsheet,
  Share2,
  CheckCircle2,
  Upload,
  Info,
  ArrowUpRight,
  ShieldCheck,
  Plus,
  Edit3
} from 'lucide-react';
import { PhotoLandmark, LandmarkMeasurement, GeoFeature } from '../types';
import { lonLatToUtm, utmToLonLat } from '../lib/geodesy';
import { downloadBlob } from '../lib/zip';
import {
  exportPhotoLandmarksKML,
  buildPhotoLandmarksZip,
  toCSVtext
} from '../lib/formats';

interface CameraLandmarkStudioProps {
  workingZone: string;
  onSendToGisLayers?: (features: GeoFeature[], layerName: string) => void;
}

// Convert decimal degrees to DMS string
function toDMS(val: number, isLat: boolean): string {
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(1);
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : val >= 0 ? 'E' : 'W';
  return `${deg}°${min}'${sec}" ${dir}`;
}

// Cardinal direction from degrees
function getCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const ix = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return dirs[ix];
}

export const CameraLandmarkStudio: React.FC<CameraLandmarkStudioProps> = ({
  workingZone,
  onSendToGisLayers
}) => {
  const zNum = parseInt(workingZone, 10) || 45;
  const isSouth = workingZone.endsWith('S');

  // Video and Canvas Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Camera State
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);

  // Live GNSS / Sensors State
  const [lat, setLat] = useState<number>(23.5412);
  const [lon, setLon] = useState<number>(84.60155);
  const [altitude, setAltitude] = useState<number>(450.2);
  const [accuracy, setAccuracy] = useState<number>(1.8);
  const [azimuth, setAzimuth] = useState<number>(135.0);
  const [pitch, setPitch] = useState<number>(8.5); // Clinometer elevation angle in degrees
  const [roll, setRoll] = useState<number>(-0.5);
  const [gpsActive, setGpsActive] = useState<boolean>(false);
  const [sensorActive, setSensorActive] = useState<boolean>(false);

  // UI / HUD Reticle Settings
  const [reticleMode, setReticleMode] = useState<'crosshair' | 'stadia' | 'horizon' | 'grid' | 'none'>('crosshair');
  const [hudTheme, setHudTheme] = useState<'survey_gold' | 'tactical_green' | 'clean_white' | 'dark_hud'>('survey_gold');
  const [showWatermark, setShowWatermark] = useState<boolean>(true);

  // Survey Metadata
  const [projectName, setProjectName] = useState<string>('Mining & Infrastructure Survey');
  const [surveyorName, setSurveyorName] = useState<string>('Chief Geomatician');
  const [landmarkTag, setLandmarkTag] = useState<string>('LM-01');
  const [notes, setNotes] = useState<string>('Boundary pillar inspection & highwall crest');

  // Rangefinder / Trigonometric Measurement Inputs
  const [targetDistance, setTargetDistance] = useState<string>('45.0');
  const [deviceHeight, setDeviceHeight] = useState<string>('1.60'); // Eye-level instrument height
  const [twoAngleTop, setTwoAngleTop] = useState<string>('24.5');
  const [twoAngleBase, setTwoAngleBase] = useState<string>('-4.2');

  // Visual Dimension Measurement tool on Photo
  const [measuringMode, setMeasuringMode] = useState<boolean>(false);
  const [measurementLabel, setMeasurementLabel] = useState<string>('Crest Offset');
  const [activeMeasurements, setActiveMeasurements] = useState<LandmarkMeasurement[]>([]);
  const [currentDragStart, setCurrentDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragEnd, setCurrentDragEnd] = useState<{ x: number; y: number } | null>(null);

  // Frozen / Captured Preview
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedMetadata, setCapturedMetadata] = useState<PhotoLandmark | null>(null);

  // Saved Landmarks Registry
  const [savedLandmarks, setSavedLandmarks] = useState<PhotoLandmark[]>(() => {
    // Initial sample landmark
    const u = lonLatToUtm(84.60155, 23.5412, zNum, isSouth);
    return [
      {
        id: 'LM-20260825-01',
        name: 'Control Pillar CP-04',
        timestamp: Date.now() - 3600000,
        dataUrl: '',
        lat: 23.5412,
        lon: 84.60155,
        altitude: 450.2,
        accuracy: 1.5,
        azimuth: 142.5,
        cardinal: 'SE',
        pitch: 6.2,
        roll: -0.4,
        slopePercent: 10.9,
        targetDistanceMeters: 38.5,
        targetHeightMeters: 5.76,
        deviceHeightMeters: 1.6,
        notes: 'Monolithic concrete control beacon with GPS bronze plaque',
        project: 'Block IV Boundary Survey',
        surveyor: 'M. Salim Ansari',
        zone: zNum,
        south: isSouth,
        utmE: u.E,
        utmN: u.N,
        measurements: [
          {
            id: 'm1',
            type: 'distance',
            p1: { x: 0.35, y: 0.65 },
            p2: { x: 0.65, y: 0.65 },
            valueLabel: 'Beacon Width: 0.85m',
            realWorldValue: 0.85,
            unit: 'm',
            color: '#c9a063'
          }
        ]
      }
    ];
  });

  const [activeTab, setActiveTab] = useState<'camera' | 'rangefinder' | 'gallery'>('camera');
  const [statusMsg, setStatusMsg] = useState<string>('');

  // 1. Initialize Camera
  const startCamera = async (facing: 'environment' | 'user' = facingMode) => {
    stopCamera();
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser Camera API is not supported in this environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setCameraActive(true);

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.torch) {
          setHasTorch(true);
        }
      }
    } catch (err: any) {
      console.warn('Camera access issue:', err);
      setCameraError(
        `Unable to access live camera (${err.message}). You can still use the simulation mode, manual sensor inputs, and upload field photos!`
      );
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const toggleCameraFacing = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    if (cameraActive) {
      startCamera(nextFacing);
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const next = !torchOn;
        await (track as any).applyConstraints({ advanced: [{ torch: next }] });
        setTorchOn(next);
      } catch (err) {
        console.warn('Torch failed:', err);
      }
    }
  };

  // 2. Real-time GPS & Orientation Sensors
  useEffect(() => {
    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        pos => {
          setLat(pos.coords.latitude);
          setLon(pos.coords.longitude);
          if (pos.coords.altitude != null) setAltitude(pos.coords.altitude);
          if (pos.coords.accuracy != null) setAccuracy(pos.coords.accuracy);
          if (pos.coords.heading != null && !isNaN(pos.coords.heading)) setAzimuth(pos.coords.heading);
          setGpsActive(true);
        },
        err => {
          console.log('GPS watch status:', err.message);
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    }

    // Orientation / Clinometer / Compass
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha != null && !isNaN(e.alpha)) {
        // Compass heading
        let heading = e.alpha;
        if ((e as any).webkitCompassHeading != null) {
          heading = (e as any).webkitCompassHeading;
        }
        setAzimuth(heading);
      }
      if (e.beta != null && !isNaN(e.beta)) {
        // Pitch (-90 to +90)
        setPitch(e.beta);
      }
      if (e.gamma != null && !isNaN(e.gamma)) {
        // Roll (-90 to +90)
        setRoll(e.gamma);
      }
      setSensorActive(true);
    };

    window.addEventListener('deviceorientation', handleOrientation, true);

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      window.removeEventListener('deviceorientation', handleOrientation, true);
      stopCamera();
    };
  }, []);

  // Calculate UTM on the fly
  const currentUtm = useMemo(() => {
    return lonLatToUtm(lon, lat, zNum, isSouth);
  }, [lon, lat, zNum, isSouth]);

  // Calculate Trigonometric Height
  const calcTrigHeight = useMemo(() => {
    const d = parseFloat(targetDistance) || 0;
    const hInst = parseFloat(deviceHeight) || 1.6;
    const rad = (pitch * Math.PI) / 180;
    const deltaH = d * Math.tan(rad);
    const totalH = deltaH + hInst;
    const slopePct = Math.tan(rad) * 100;
    return {
      deltaH,
      totalH,
      slopePct: isNaN(slopePct) ? 0 : slopePct,
      slopeDist: Math.sqrt(d * d + deltaH * deltaH)
    };
  }, [targetDistance, deviceHeight, pitch]);

  // Calculate 2-Angle Height
  const calcTwoAngleHeight = useMemo(() => {
    const d = parseFloat(targetDistance) || 0;
    const tTop = parseFloat(twoAngleTop) || 0;
    const tBase = parseFloat(twoAngleBase) || 0;
    const rTop = (tTop * Math.PI) / 180;
    const rBase = (tBase * Math.PI) / 180;
    const h = d * (Math.tan(rTop) - Math.tan(rBase));
    return Math.abs(h);
  }, [targetDistance, twoAngleTop, twoAngleBase]);

  // 3. Stamping HUD Overlay onto Offscreen Canvas & Capturing High-Res Photo
  const capturePhotoWithHUD = () => {
    const canvas = document.createElement('canvas');
    const width = 1280;
    const height = 720;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw Video Frame or Simulated Background
    if (cameraActive && videoRef.current && videoRef.current.readyState >= 2) {
      ctx.drawImage(videoRef.current, 0, 0, width, height);
    } else {
      // Draw simulated photogrammetry gradient background
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#1a1f2c');
      grad.addColorStop(0.5, '#111827');
      grad.addColorStop(1, '#0b0f17');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Grid terrain texture
      ctx.strokeStyle = 'rgba(201, 160, 99, 0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.fillStyle = '#c9a063';
      ctx.font = 'bold 24px serif';
      ctx.textAlign = 'center';
      ctx.fillText('📷 FIELD PHOTOGRAMMETRY & RANGEFINDER HUD', width / 2, height / 2 - 20);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '14px sans-serif';
      ctx.fillText('High-Precision Geotagged Landmark & Measurement Overlay', width / 2, height / 2 + 15);
    }

    // Render Reticle
    if (reticleMode === 'crosshair' || reticleMode === 'stadia') {
      const cx = width / 2;
      const cy = height / 2;
      ctx.strokeStyle = '#c9a063';
      ctx.lineWidth = 2;

      // Circle
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - 70, cy);
      ctx.lineTo(cx - 15, cy);
      ctx.moveTo(cx + 15, cy);
      ctx.lineTo(cx + 70, cy);
      ctx.moveTo(cx, cy - 70);
      ctx.lineTo(cx, cy - 15);
      ctx.moveTo(cx, cy + 15);
      ctx.lineTo(cx, cy + 70);
      ctx.stroke();

      if (reticleMode === 'stadia') {
        // Stadia hairs
        ctx.lineWidth = 1.5;
        [-25, 25].forEach(dy => {
          ctx.beginPath();
          ctx.moveTo(cx - 20, cy + dy);
          ctx.lineTo(cx + 20, cy + dy);
          ctx.stroke();
        });
      }
    } else if (reticleMode === 'horizon') {
      // Horizon level line based on roll
      const cx = width / 2;
      const cy = height / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((-roll * Math.PI) / 180);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(-width / 3, 0);
      ctx.lineTo(width / 3, 0);
      ctx.stroke();
      ctx.restore();
    }

    // Render Visual Measurement Overlays
    activeMeasurements.forEach(m => {
      const x1 = m.p1.x * width;
      const y1 = m.p1.y * height;
      const x2 = m.p2.x * width;
      const y2 = m.p2.y * height;

      ctx.strokeStyle = m.color || '#c9a063';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // End points
      ctx.fillStyle = m.color || '#c9a063';
      ctx.beginPath();
      ctx.arc(x1, y1, 6, 0, Math.PI * 2);
      ctx.arc(x2, y2, 6, 0, Math.PI * 2);
      ctx.fill();

      // Label
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(midX - 60, midY - 14, 120, 24);
      ctx.strokeStyle = m.color || '#c9a063';
      ctx.strokeRect(midX - 60, midY - 14, 120, 24);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.valueLabel, midX, midY - 2);
    });

    // Render GPS Map Camera / Avenza Professional HUD Banner
    if (showWatermark) {
      // Bottom Watermark Box
      const hudH = 110;
      ctx.fillStyle = 'rgba(10, 14, 22, 0.88)';
      ctx.fillRect(0, height - hudH, width, hudH);
      ctx.strokeStyle = 'rgba(201, 160, 99, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, height - hudH);
      ctx.lineTo(width, height - hudH);
      ctx.stroke();

      // Top Status Badge
      ctx.fillStyle = 'rgba(10, 14, 22, 0.85)';
      ctx.fillRect(16, 16, 320, 48);
      ctx.strokeStyle = '#c9a063';
      ctx.strokeRect(16, 16, 320, 48);

      ctx.fillStyle = '#c9a063';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`📍 ${landmarkTag || 'LANDMARK'} | ${projectName.slice(0, 24)}`, 28, 36);
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';
      ctx.fillText(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC', 28, 52);

      // Compass Rose Pill Top Right
      const card = getCardinal(azimuth);
      ctx.fillStyle = 'rgba(10, 14, 22, 0.85)';
      ctx.fillRect(width - 180, 16, 164, 48);
      ctx.strokeStyle = '#c9a063';
      ctx.strokeRect(width - 180, 16, 164, 48);
      ctx.fillStyle = '#c9a063';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`🧭 ${azimuth.toFixed(1)}° ${card}`, width - 98, 38);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.fillText(`TILT: ${pitch >= 0 ? '+' : ''}${pitch.toFixed(1)}° | ROLL: ${roll.toFixed(1)}°`, width - 98, 52);

      // Bottom HUD Information Columns
      ctx.textAlign = 'left';
      const col1X = 24;
      const col2X = 360;
      const col3X = 720;
      const col4X = 1000;

      // Col 1: WGS-84 Coordinates
      ctx.fillStyle = '#c9a063';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('WGS-84 GEODETIC COORDINATES', col1X, height - hudH + 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.fillText(`LAT: ${toDMS(lat, true)} (${lat.toFixed(7)}°)`, col1X, height - hudH + 42);
      ctx.fillText(`LON: ${toDMS(lon, false)} (${lon.toFixed(7)}°)`, col1X, height - hudH + 62);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText(`ALT: ${altitude.toFixed(2)}m MSL | ACCURACY: ±${accuracy.toFixed(1)}m`, col1X, height - hudH + 82);

      // Col 2: Projected UTM Coordinates
      ctx.fillStyle = '#c9a063';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`UTM PROJECTED (ZONE ${zNum}${isSouth ? 'S' : 'N'})`, col2X, height - hudH + 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.fillText(`EASTING:  ${currentUtm.E.toFixed(3)} m E`, col2X, height - hudH + 42);
      ctx.fillText(`NORTHING: ${currentUtm.N.toFixed(3)} m N`, col2X, height - hudH + 62);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText(`SURVEYOR: ${surveyorName.slice(0, 26)}`, col2X, height - hudH + 82);

      // Col 3: Clinometer & Photogrammetric Rangefinder
      ctx.fillStyle = '#c9a063';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('RANGEFINDER & CLINOMETER', col3X, height - hudH + 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.fillText(`TARGET DIST: ${parseFloat(targetDistance) || 0}m | SLOPE: ${(Math.tan((pitch * Math.PI) / 180) * 100).toFixed(1)}%`, col3X, height - hudH + 42);
      ctx.fillText(`CALC HEIGHT: ${calcTrigHeight.totalH.toFixed(2)} m (Δh: ${calcTrigHeight.deltaH.toFixed(2)}m)`, col3X, height - hudH + 62);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText(`NOTES: ${(notes || 'Visual landmark captured').slice(0, 32)}`, col3X, height - hudH + 82);

      // Col 4: Avenza / GeoStudio Logo & Watermark Tag
      ctx.fillStyle = '#c9a063';
      ctx.font = 'bold 13px serif';
      ctx.textAlign = 'right';
      ctx.fillText('GEOSTUDIO GEOMATICS', width - 24, height - hudH + 30);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '10px sans-serif';
      ctx.fillText('GPS MAP CAMERA & RANGEFINDER', width - 24, height - hudH + 48);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('© Md Salim Ansari | Geomatics Engine', width - 24, height - hudH + 68);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(dataUrl);

    const newLandmark: PhotoLandmark = {
      id: `LM-${Date.now().toString().slice(-6)}`,
      name: landmarkTag || `Landmark_${savedLandmarks.length + 1}`,
      timestamp: Date.now(),
      dataUrl,
      lat,
      lon,
      altitude,
      accuracy,
      azimuth,
      cardinal: getCardinal(azimuth),
      pitch,
      roll,
      slopePercent: Number((Math.tan((pitch * Math.PI) / 180) * 100).toFixed(1)),
      targetDistanceMeters: parseFloat(targetDistance) || undefined,
      targetHeightMeters: Number(calcTrigHeight.totalH.toFixed(2)),
      deviceHeightMeters: parseFloat(deviceHeight) || 1.6,
      notes,
      measurements: [...activeMeasurements],
      zone: zNum,
      south: isSouth,
      utmE: currentUtm.E,
      utmN: currentUtm.N,
      project: projectName,
      surveyor: surveyorName
    };

    setCapturedMetadata(newLandmark);
    setStatusMsg(`Captured landmark "${newLandmark.name}" with stamped GPS HUD!`);
  };

  // Save current captured photo to persistent list
  const handleSaveToGallery = () => {
    if (!capturedMetadata) return;
    setSavedLandmarks(prev => [capturedMetadata, ...prev]);
    setStatusMsg(`Saved "${capturedMetadata.name}" to Landmark Registry!`);
    setCapturedImage(null);
    setCapturedMetadata(null);
    setActiveMeasurements([]);
    // Advance landmark tag
    const match = landmarkTag.match(/(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10) + 1;
      setLandmarkTag(landmarkTag.replace(/\d+$/, String(num).padStart(match[1].length, '0')));
    } else {
      setLandmarkTag(`LM-${savedLandmarks.length + 2}`);
    }
  };

  // Add visual measurement line
  const handleAddMeasurement = () => {
    const start = currentDragStart || { x: 0.3, y: 0.5 };
    const end = currentDragEnd || { x: 0.7, y: 0.5 };
    const distM = parseFloat(targetDistance) || 10;
    const pxDist = Math.hypot(end.x - start.x, end.y - start.y);
    const estVal = Number((pxDist * distM * 0.8).toFixed(2));

    const newMeas: LandmarkMeasurement = {
      id: `m_${Date.now()}`,
      type: 'distance',
      p1: start,
      p2: end,
      valueLabel: `${measurementLabel || 'Dist'}: ${estVal}m`,
      realWorldValue: estVal,
      unit: 'm',
      color: '#c9a063'
    };

    setActiveMeasurements(prev => [...prev, newMeas]);
    setCurrentDragStart(null);
    setCurrentDragEnd(null);
    setMeasuringMode(false);
  };

  // Export handlers
  const handleExportKML = () => {
    if (savedLandmarks.length === 0) return;
    const kml = exportPhotoLandmarksKML(savedLandmarks, projectName);
    downloadBlob(new TextEncoder().encode(kml), `${projectName}_Photo_Landmarks.kml`, 'application/vnd.google-earth.kml+xml');
    setStatusMsg(`Exported ${savedLandmarks.length} photo landmarks to KML!`);
  };

  const handleExportZip = () => {
    if (savedLandmarks.length === 0) return;
    const zipBytes = buildPhotoLandmarksZip(savedLandmarks, projectName, zNum, isSouth);
    downloadBlob(zipBytes, `${projectName}_Photo_Landmarks_Package.zip`, 'application/zip');
    setStatusMsg(`Generated complete photo landmarks ZIP package!`);
  };

  const handleSendToGis = () => {
    if (!onSendToGisLayers || savedLandmarks.length === 0) return;
    const feats: GeoFeature[] = savedLandmarks.map(lm => ({
      name: lm.name,
      geom: 'point',
      kind: 'll',
      pts: [{ a: lm.lon, b: lm.lat }],
      props: {
        ID: lm.id,
        Name: lm.name,
        Azimuth: lm.azimuth,
        Pitch: lm.pitch,
        Target_Dist_m: lm.targetDistanceMeters,
        Height_m: lm.targetHeightMeters,
        Alt_m: lm.altitude,
        Notes: lm.notes,
        Surveyor: lm.surveyor
      }
    }));
    onSendToGisLayers(feats, 'Photo Landmarks');
    setStatusMsg(`Sent ${feats.length} photo landmarks to GIS Studio Layers!`);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-[#0f0f0f] rounded-2xl p-4 sm:p-6 border border-white/5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a063] mb-0.5 font-medium">Photogrammetric GNSS Camera</p>
            <h3 className="text-xl font-serif italic text-white flex items-center gap-2">
              <Camera className="w-5 h-5 text-[#c9a063]" />
              GPS Map Camera & Landmark Rangefinder Studio
            </h3>
            <p className="text-xs text-white/50 mt-1">
              Avenza-style real-time GNSS watermark stamping, optical clinometer rangefinder, visual distance dimensioning, and KML/Shapefile photo landmark export.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('camera')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'camera'
                  ? 'bg-[#c9a063] text-black shadow-lg shadow-[#c9a063]/10 font-bold'
                  : 'bg-[#141414] text-white/60 hover:text-white border border-white/5'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Live Camera HUD
            </button>
            <button
              onClick={() => setActiveTab('rangefinder')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'rangefinder'
                  ? 'bg-[#c9a063] text-black shadow-lg shadow-[#c9a063]/10 font-bold'
                  : 'bg-[#141414] text-white/60 hover:text-white border border-white/5'
              }`}
            >
              <Ruler className="w-3.5 h-3.5" />
              Trig Rangefinder
            </button>
            <button
              onClick={() => setActiveTab('gallery')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'gallery'
                  ? 'bg-[#c9a063] text-black shadow-lg shadow-[#c9a063]/10 font-bold'
                  : 'bg-[#141414] text-white/60 hover:text-white border border-white/5'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Landmark Gallery ({savedLandmarks.length})
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="py-2 px-3 bg-[#c9a063]/10 border border-[#c9a063]/30 rounded-xl text-xs text-[#c9a063] flex items-center justify-between">
            <span>{statusMsg}</span>
            <button onClick={() => setStatusMsg('')} className="text-white/40 hover:text-white ml-2">✕</button>
          </div>
        )}
      </div>

      {/* 2. Main Live Camera & HUD Viewfinder */}
      {activeTab === 'camera' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Viewfinder Frame (Col 1 & 2) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="relative aspect-[16/9] sm:aspect-[4/3] bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center">
              {/* Video Element */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              />

              {/* Simulated / Fallback Canvas View when camera is inactive */}
              {!cameraActive && (
                <div className="absolute inset-0 bg-gradient-to-b from-[#161c28] via-[#0f141d] to-[#0a0d14] flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#c9a063]/10 border border-[#c9a063]/30 flex items-center justify-center mb-3">
                    <Camera className="w-8 h-8 text-[#c9a063]" />
                  </div>
                  <h4 className="text-base font-serif italic text-white mb-1">Field Camera & Viewfinder</h4>
                  <p className="text-xs text-white/50 max-w-sm mb-4">
                    Click "Start Live Camera" to enable your device camera with live GNSS HUD watermarking, or snap a simulated landmark below.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startCamera()}
                      className="px-4 py-2 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5"
                    >
                      <Camera className="w-4 h-4" />
                      Start Live Camera
                    </button>
                  </div>
                  {cameraError && (
                    <p className="text-[11px] text-amber-400/80 mt-3 max-w-md bg-amber-950/40 p-2 rounded-lg border border-amber-800/40">
                      {cameraError}
                    </p>
                  )}
                </div>
              )}

              {/* Viewfinder Overlays (Reticle, Horizon, Rule-of-Thirds Grid) */}
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 sm:p-6">
                {/* Top Floating Badge */}
                <div className="flex items-start justify-between">
                  <div className="bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-[11px] font-mono text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-[#c9a063] font-bold">{landmarkTag}</span>
                    <span className="text-white/40">|</span>
                    <span>Z{zNum}{isSouth ? 'S' : 'N'}</span>
                  </div>

                  <div className="bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-[11px] font-mono text-white flex items-center gap-2">
                    <Compass className="w-3.5 h-3.5 text-[#c9a063]" />
                    <span>{azimuth.toFixed(1)}° {getCardinal(azimuth)}</span>
                    <span className="text-white/40">|</span>
                    <span className="text-emerald-400">Tilt: {pitch >= 0 ? '+' : ''}{pitch.toFixed(1)}°</span>
                  </div>
                </div>

                {/* Center Crosshair Reticle */}
                {reticleMode === 'crosshair' && (
                  <div className="self-center flex items-center justify-center relative">
                    <div className="w-16 h-16 rounded-full border-2 border-[#c9a063]/80 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-[#c9a063] rounded-full"></div>
                    </div>
                    <div className="absolute w-28 h-0.5 bg-[#c9a063]/70"></div>
                    <div className="absolute h-28 w-0.5 bg-[#c9a063]/70"></div>
                  </div>
                )}

                {reticleMode === 'stadia' && (
                  <div className="self-center flex flex-col items-center justify-center relative">
                    <div className="w-20 h-20 rounded-full border-2 border-[#c9a063]/80 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-[#c9a063] rounded-full"></div>
                    </div>
                    <div className="absolute w-36 h-0.5 bg-[#c9a063]/70"></div>
                    <div className="absolute h-36 w-0.5 bg-[#c9a063]/70"></div>
                    {/* Stadia intervals */}
                    <div className="absolute top-2 w-8 h-0.5 bg-[#c9a063]"></div>
                    <div className="absolute bottom-2 w-8 h-0.5 bg-[#c9a063]"></div>
                  </div>
                )}

                {reticleMode === 'grid' && (
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                    <div className="border-r border-b border-white/20"></div>
                    <div className="border-r border-b border-white/20"></div>
                    <div className="border-b border-white/20"></div>
                    <div className="border-r border-b border-white/20"></div>
                    <div className="border-r border-b border-white/20"></div>
                    <div className="border-b border-white/20"></div>
                    <div className="border-r border-white/20"></div>
                    <div className="border-r border-white/20"></div>
                    <div></div>
                  </div>
                )}

                {/* Bottom Real-time Watermark Preview Bar */}
                <div className="bg-black/85 backdrop-blur-md p-2.5 sm:p-3 rounded-xl border border-white/10 text-white text-[10px] sm:text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between flex-wrap gap-2 text-[#c9a063] font-bold">
                    <span>LAT: {lat.toFixed(6)}° N  LON: {lon.toFixed(6)}° E</span>
                    <span>E: {currentUtm.E.toFixed(2)}m  N: {currentUtm.N.toFixed(2)}m</span>
                  </div>
                  <div className="flex items-center justify-between text-white/70 text-[10px] flex-wrap gap-1">
                    <span>ALT: {altitude.toFixed(1)}m (±{accuracy.toFixed(1)}m) | TGT DIST: {targetDistance}m</span>
                    <span>CALC H: {calcTrigHeight.totalH.toFixed(2)}m (Slope: {calcTrigHeight.slopePct.toFixed(1)}%)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Bar Under Viewfinder */}
            <div className="flex items-center justify-between flex-wrap gap-2 p-3 bg-[#0f0f0f] rounded-xl border border-white/5">
              <div className="flex items-center gap-2">
                {cameraActive ? (
                  <>
                    <button
                      onClick={toggleCameraFacing}
                      className="px-3 py-2 bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[#c9a063]" />
                      Flip Camera
                    </button>
                    {hasTorch && (
                      <button
                        onClick={toggleTorch}
                        className={`px-3 py-2 text-xs font-semibold rounded-xl border flex items-center gap-1.5 ${
                          torchOn ? 'bg-amber-400 text-black border-amber-400' : 'bg-[#141414] text-white border-white/10'
                        }`}
                      >
                        {torchOn ? <Zap className="w-3.5 h-3.5" /> : <ZapOff className="w-3.5 h-3.5" />}
                        Flash
                      </button>
                    )}
                    <button
                      onClick={stopCamera}
                      className="px-3 py-2 bg-red-950/40 hover:bg-red-900/50 text-red-300 text-xs font-semibold rounded-xl border border-red-800/40"
                    >
                      Stop Camera
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => startCamera()}
                    className="px-3.5 py-2 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Activate Live Camera
                  </button>
                )}
              </div>

              {/* Big Capture Button */}
              <button
                onClick={capturePhotoWithHUD}
                className="px-6 py-2.5 bg-gradient-to-r from-[#c9a063] to-[#e4be83] hover:from-[#d6b074] hover:to-[#ebd09c] text-black font-bold text-sm rounded-xl shadow-xl shadow-[#c9a063]/20 flex items-center gap-2 transform active:scale-95 transition-transform"
              >
                <Camera className="w-4 h-4" />
                Capture Landmark with HUD
              </button>
            </div>

            {/* Frozen / Captured Image Modal Preview */}
            {capturedImage && capturedMetadata && (
              <div className="p-4 bg-[#141414] rounded-2xl border border-[#c9a063]/40 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-serif italic text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Captured Photo Landmark Preview ({capturedMetadata.name})
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        downloadBlob(
                          capturedImage ? Uint8Array.from(atob(capturedImage.split(',')[1]), c => c.charCodeAt(0)) : new Uint8Array(),
                          `${capturedMetadata.name}_stamped.jpg`,
                          'image/jpeg'
                        );
                      }}
                      className="px-3 py-1.5 bg-[#0f0f0f] hover:bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-[#c9a063]" />
                      Download Photo (.jpg)
                    </button>
                    <button
                      onClick={handleSaveToGallery}
                      className="px-4 py-1.5 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs rounded-xl shadow-lg"
                    >
                      Save to Registry
                    </button>
                    <button
                      onClick={() => {
                        setCapturedImage(null);
                        setCapturedMetadata(null);
                      }}
                      className="text-white/40 hover:text-white text-xs px-2"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>

                <div className="rounded-xl overflow-hidden border border-white/10 aspect-[16/9] max-h-[380px] bg-black">
                  <img src={capturedImage} alt="Captured Landmark" className="w-full h-full object-contain" />
                </div>
              </div>
            )}
          </div>

          {/* Right Control & Parameter Panel (Col 3) */}
          <div className="space-y-4">
            {/* Metadata & Tagging Card */}
            <div className="bg-[#0f0f0f] p-4 sm:p-5 rounded-2xl border border-white/5 space-y-4">
              <h4 className="text-xs font-serif italic text-white flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#c9a063]" />
                Landmark Metadata & Watermark
              </h4>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Landmark Tag / ID</label>
                  <input
                    type="text"
                    value={landmarkTag}
                    onChange={e => setLandmarkTag(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white font-mono text-xs focus:border-[#c9a063] outline-none"
                    placeholder="e.g. LM-01"
                  />
                </div>

                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-xs focus:border-[#c9a063] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Surveyor Name</label>
                  <input
                    type="text"
                    value={surveyorName}
                    onChange={e => setSurveyorName(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-xs focus:border-[#c9a063] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Field Notes / Description</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#141414] text-white text-xs focus:border-[#c9a063] outline-none resize-none"
                    placeholder="Describe structure, material, status..."
                  />
                </div>
              </div>
            </div>

            {/* Rangefinder Inputs & Calibrations */}
            <div className="bg-[#0f0f0f] p-4 sm:p-5 rounded-2xl border border-white/5 space-y-4">
              <h4 className="text-xs font-serif italic text-white flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-[#c9a063]" />
                Sensor & Rangefinder Tuning
              </h4>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between text-[11px] text-white/60 mb-1">
                    <span>Target Baseline Distance (m)</span>
                    <span className="font-mono text-[#c9a063]">{targetDistance} m</span>
                  </div>
                  <input
                    type="number"
                    step="0.5"
                    value={targetDistance}
                    onChange={e => setTargetDistance(e.target.value)}
                    className="w-full py-1.5 px-3 rounded-xl border border-white/10 bg-[#141414] text-white font-mono text-xs focus:border-[#c9a063] outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-white/60 mb-1">
                    <span>Manual Azimuth / Bearing (°)</span>
                    <span className="font-mono text-[#c9a063]">{azimuth.toFixed(1)}° ({getCardinal(azimuth)})</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="0.5"
                    value={azimuth}
                    onChange={e => setAzimuth(parseFloat(e.target.value))}
                    className="w-full accent-[#c9a063]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-white/60 mb-1">
                    <span>Clinometer Tilt / Pitch (°)</span>
                    <span className="font-mono text-emerald-400">{pitch >= 0 ? '+' : ''}{pitch.toFixed(1)}°</span>
                  </div>
                  <input
                    type="range"
                    min="-85"
                    max="85"
                    step="0.5"
                    value={pitch}
                    onChange={e => setPitch(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                {/* Reticle Style Selector */}
                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Viewfinder Reticle Mode</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'crosshair', label: 'Crosshair' },
                      { id: 'stadia', label: 'Stadia Hairs' },
                      { id: 'horizon', label: 'Horizon Level' },
                      { id: 'grid', label: '3x3 Grid' }
                    ].map(r => (
                      <button
                        key={r.id}
                        onClick={() => setReticleMode(r.id as any)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border ${
                          reticleMode === r.id
                            ? 'bg-[#c9a063]/20 border-[#c9a063] text-[#c9a063]'
                            : 'bg-[#141414] border-white/5 text-white/60 hover:text-white'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Trigonometric Height & Rangefinder Calculator Tab */}
      {activeTab === 'rangefinder' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div>
            <h4 className="text-base font-serif italic text-white flex items-center gap-2">
              <Ruler className="w-5 h-5 text-[#c9a063]" />
              Optical Clinometer & Trigonometric Rangefinder
            </h4>
            <p className="text-xs text-white/50 mt-1">
              Compute precise vertical heights of highwalls, communication towers, cliffs, borehole drill rigs, and overhead cables from angle of inclination.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Mode 1: Single Angle + Baseline Distance */}
            <div className="p-5 bg-[#141414] rounded-2xl border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#c9a063]">Method A: Single Angle & Instrument Height</span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-[#c9a063]/10 text-[#c9a063] rounded">h = d·tan(θ) + h_inst</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Baseline Distance (m)</label>
                  <input
                    type="number"
                    value={targetDistance}
                    onChange={e => setTargetDistance(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#0f0f0f] text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Device/Eye Height (m)</label>
                  <input
                    type="number"
                    value={deviceHeight}
                    onChange={e => setDeviceHeight(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#0f0f0f] text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-white/60 mb-1">
                  <span>Elevation Angle θ (deg)</span>
                  <span className="font-mono text-emerald-400">{pitch.toFixed(1)}°</span>
                </div>
                <input
                  type="range"
                  min="-80"
                  max="80"
                  step="0.1"
                  value={pitch}
                  onChange={e => setPitch(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div className="p-4 bg-[#0a0d14] rounded-xl border border-white/5 space-y-2 text-xs">
                <div className="flex justify-between text-white/60">
                  <span>Elevation Delta (Δh):</span>
                  <span className="font-mono text-white">{calcTrigHeight.deltaH.toFixed(3)} m</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Slope Distance (Hypotenuse):</span>
                  <span className="font-mono text-white">{calcTrigHeight.slopeDist.toFixed(3)} m</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Slope Grade:</span>
                  <span className="font-mono text-emerald-400">{calcTrigHeight.slopePct.toFixed(2)} %</span>
                </div>
                <div className="pt-2 border-t border-white/10 flex justify-between items-center text-sm font-bold">
                  <span className="text-[#c9a063]">True Vertical Target Height:</span>
                  <span className="font-mono text-emerald-400 text-base">{calcTrigHeight.totalH.toFixed(3)} m</span>
                </div>
              </div>
            </div>

            {/* Mode 2: Two-Angle Span (Top and Bottom) */}
            <div className="p-5 bg-[#141414] rounded-2xl border border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#c9a063]">Method B: Two-Angle Vertical Span</span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-[#c9a063]/10 text-[#c9a063] rounded">h = d·(tan θ₁ - tan θ₂)</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Top Summit Angle θ₁ (°)</label>
                  <input
                    type="number"
                    value={twoAngleTop}
                    onChange={e => setTwoAngleTop(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#0f0f0f] text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-white/50 text-[11px] mb-1">Base Angle θ₂ (°)</label>
                  <input
                    type="number"
                    value={twoAngleBase}
                    onChange={e => setTwoAngleBase(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl border border-white/10 bg-[#0f0f0f] text-white font-mono"
                  />
                </div>
              </div>

              <div className="p-4 bg-[#0a0d14] rounded-xl border border-white/5 space-y-2 text-xs">
                <div className="flex justify-between text-white/60">
                  <span>Baseline Distance:</span>
                  <span className="font-mono text-white">{targetDistance} m</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Angle Span (θ₁ - θ₂):</span>
                  <span className="font-mono text-white">{(parseFloat(twoAngleTop) - parseFloat(twoAngleBase)).toFixed(2)}°</span>
                </div>
                <div className="pt-2 border-t border-white/10 flex justify-between items-center text-sm font-bold">
                  <span className="text-[#c9a063]">Calculated Total Height Span:</span>
                  <span className="font-mono text-emerald-400 text-base">{calcTwoAngleHeight.toFixed(3)} m</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Saved Landmark Gallery & Multi-Format Exporter */}
      {activeTab === 'gallery' && (
        <div className="bg-[#0f0f0f] rounded-2xl p-6 sm:p-8 border border-white/5 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h4 className="text-base font-serif italic text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#c9a063]" />
                Geotagged Photo Landmark Registry ({savedLandmarks.length})
              </h4>
              <p className="text-xs text-white/50 mt-1">
                Persistent gallery of captured visual survey points with embedded GPS coordinates, compass headings, and height measurements.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleExportKML}
                disabled={savedLandmarks.length === 0}
                className="px-3 py-2 bg-[#141414] hover:bg-[#1a1a1a] text-white text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-1.5 disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5 text-[#c9a063]" />
                Export KML (Avenza/Google Earth)
              </button>
              <button
                onClick={handleExportZip}
                disabled={savedLandmarks.length === 0}
                className="px-3.5 py-2 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5 disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                Download Photo Package (.zip)
              </button>
              {onSendToGisLayers && (
                <button
                  onClick={handleSendToGis}
                  disabled={savedLandmarks.length === 0}
                  className="px-3 py-2 bg-[#141414] hover:bg-[#1a1a1a] text-[#c9a063] text-xs font-semibold rounded-xl border border-[#c9a063]/30 flex items-center gap-1.5 disabled:opacity-40"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Plot on GIS Studio Map
                </button>
              )}
            </div>
          </div>

          {/* Landmark Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedLandmarks.map((lm, idx) => (
              <div
                key={lm.id}
                className="bg-[#141414] rounded-2xl border border-white/5 overflow-hidden hover:border-[#c9a063]/30 transition-all flex flex-col justify-between"
              >
                {/* Photo Thumbnail */}
                <div className="aspect-[16/9] bg-black relative flex items-center justify-center overflow-hidden">
                  {lm.dataUrl ? (
                    <img src={lm.dataUrl} alt={lm.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center p-4">
                      <Camera className="w-8 h-8 text-[#c9a063]/40 mx-auto mb-1" />
                      <span className="text-[10px] text-white/30">Control Landmark Vector</span>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-mono text-[#c9a063] border border-white/10">
                    {lm.name}
                  </div>
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-mono text-emerald-400 border border-white/10">
                    {lm.azimuth?.toFixed(1)}° {lm.cardinal}
                  </div>
                </div>

                {/* Body Details */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between text-white font-mono text-[11px]">
                      <span>{lm.lat.toFixed(6)}°, {lm.lon.toFixed(6)}°</span>
                      <span className="text-[#c9a063]">Z{lm.zone || zNum}</span>
                    </div>
                    <div className="flex justify-between text-white/50 text-[10px]">
                      <span>Alt: {(lm.altitude || 0).toFixed(1)}m</span>
                      <span>Target: {lm.targetHeightMeters ? `${lm.targetHeightMeters.toFixed(2)}m H` : 'Direct'}</span>
                    </div>
                    {lm.notes && (
                      <p className="text-white/70 text-[11px] line-clamp-2 pt-1 border-t border-white/5">
                        {lm.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-white/40">
                    <span>{new Date(lm.timestamp).toLocaleTimeString()}</span>
                    <button
                      onClick={() => setSavedLandmarks(prev => prev.filter(x => x.id !== lm.id))}
                      className="text-red-400/60 hover:text-red-400 p-1"
                      title="Delete landmark"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
