import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Map,
  Compass,
  Navigation,
  Volume2,
  VolumeX,
  Target,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Layers,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Radio,
  Download,
  Plus,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Camera,
  Upload,
  Undo2,
  Redo2,
  Trash2
} from 'lucide-react';
import { SurveyWaypoint } from '../../types';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';
import { triggerHaptic } from '../../lib/haptics';
import { speakVoiceAnnouncement } from '../../lib/hardwareComms';
import { calculateStakeoutGuidance, StakeoutGuidance } from '../../lib/voiceCommander';

interface MapTilesStakeoutViewProps {
  currentPos: {
    lat: number;
    lon: number;
    alt: number | null;
    utm: { E: number; N: number; zl: string };
    acc: number;
    speed?: number | null;
    heading?: number | null;
  } | null;
  deviceHeading: number;
  waypoints: SurveyWaypoint[];
  activeWaypointIndex: number;
  onSelectWaypointIndex: (idx: number) => void;
  onUndoWaypoint?: () => void;
  onRedoWaypoint?: () => void;
  onDeleteWaypoint?: (id: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSwitchToAr?: () => void;
  onSwitchToMode?: (mode: 'map' | 'ar' | 'compass') => void;
  onOpenImport?: () => void;
  onImportWaypoints?: () => void;
  onStoreObservation?: (remark: string) => void;
  distanceUnit?: 'm' | 'ft';
  toleranceMeters?: number;
  isMoving?: boolean;
  motionHeading?: number | null;
}

export const MapTilesStakeoutView: React.FC<MapTilesStakeoutViewProps> = ({
  currentPos,
  deviceHeading,
  waypoints,
  activeWaypointIndex,
  onSelectWaypointIndex,
  onUndoWaypoint,
  onRedoWaypoint,
  onDeleteWaypoint,
  canUndo = false,
  canRedo = false,
  onSwitchToAr,
  onSwitchToMode,
  onOpenImport,
  onImportWaypoints,
  onStoreObservation,
  distanceUnit = 'm',
  toleranceMeters = 0.3,
  isMoving = false,
  motionHeading = null
}) => {
  const isDark = useIsDarkMode();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Map Tile View Options
  const [mapStyle, setMapStyle] = useState<'grid' | 'satellite' | 'topo'>('grid');
  const [zoomScale, setZoomScale] = useState<number>(20); // meters across canvas half-width
  const [mapOrientation, setMapOrientation] = useState<'north' | 'heading'>('heading');
  const [autoCenterOn, setAutoCenterOn] = useState<'surveyor' | 'target' | 'midpoint'>('midpoint');
  
  // Voice navigation
  const [voiceActive, setVoiceActive] = useState<boolean>(false);
  const [voiceIntervalSec, setVoiceIntervalSec] = useState<number>(5);
  const lastSpokenTimeRef = useRef<number>(0);

  // Manual Walk Simulation for Desktop Testing
  const [simOffsetE, setSimOffsetE] = useState<number>(0);
  const [simOffsetN, setSimOffsetN] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Active target waypoint
  const activeWp = waypoints[activeWaypointIndex] || waypoints[0] || null;

  // Effective coordinates
  const effE = (currentPos ? currentPos.utm.E : 254800.0) + simOffsetE;
  const effN = (currentPos ? currentPos.utm.N : 2605200.0) + simOffsetN;
  const effZ = currentPos?.alt || 540.0;
  const effHeading = currentPos?.heading != null && !isNaN(currentPos.heading) ? currentPos.heading : deviceHeading || 0;

  // Stakeout Guidance
  const guidance: StakeoutGuidance | null = activeWp
    ? calculateStakeoutGuidance(effE, effN, effHeading, activeWp.E, activeWp.N, toleranceMeters, distanceUnit)
    : null;

  const dE = activeWp ? activeWp.E - effE : 0;
  const dN = activeWp ? activeWp.N - effN : 0;
  const dZ = activeWp ? effZ - activeWp.Z : 0;

  // Handle Voice Announcements
  useEffect(() => {
    if (!voiceActive || !guidance || !activeWp) return;
    const now = Date.now();
    if (now - lastSpokenTimeRef.current >= voiceIntervalSec * 1000) {
      lastSpokenTimeRef.current = now;
      let text = '';
      if (guidance.isOnTarget) {
        text = `On point! Target ${activeWp.id} achieved within tolerance.`;
      } else {
        const turnText = Math.abs(guidance.relativeTurnDeg) < 8
          ? `Straight ahead, ${guidance.distanceDisplay}`
          : guidance.relativeTurnDeg > 0
          ? `Turn right ${Math.abs(Math.round(guidance.relativeTurnDeg))} degrees, go ${guidance.distanceDisplay}`
          : `Turn left ${Math.abs(Math.round(guidance.relativeTurnDeg))} degrees, go ${guidance.distanceDisplay}`;
        text = turnText;
      }
      speakVoiceAnnouncement(text);
    }
  }, [voiceActive, guidance, activeWp, voiceIntervalSec]);

  // Render Map Canvas
  const drawMapCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    if (!activeWp) {
      ctx.fillStyle = isDark ? '#141414' : '#f8fafc';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = isDark ? '#a3a3a3' : '#64748b';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No target waypoint selected for stakeout.', cx, cy);
      return;
    }

    // Determine center reference in UTM
    let centerE = activeWp.E;
    let centerN = activeWp.N;

    if (autoCenterOn === 'surveyor') {
      centerE = effE;
      centerN = effN;
    } else if (autoCenterOn === 'midpoint') {
      centerE = (effE + activeWp.E) / 2;
      centerN = (effN + activeWp.N) / 2;
    }

    // Pixels per meter
    const ppm = (Math.min(w, h) / 2) / Math.max(1, zoomScale);

    // Rotation angle
    const rotRad = mapOrientation === 'heading' ? -(effHeading * Math.PI) / 180 : 0;

    // Helper: World UTM (E, N) to Screen (x, y)
    const worldToScreen = (e: number, n: number) => {
      const dx = (e - centerE) * ppm;
      const dy = -(n - centerN) * ppm; // North is up in world, so invert Y

      // Apply rotation around screen center
      const rx = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
      const ry = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);

      return { x: cx + rx, y: cy + ry };
    };

    // 1. Draw Map Background / Grid
    if (mapStyle === 'grid') {
      ctx.fillStyle = isDark ? '#0b0f17' : '#f1f5f9';
      ctx.fillRect(0, 0, w, h);

      // Draw Grid Lines (1m, 5m, or 10m grid depending on zoom)
      const gridStep = zoomScale <= 5 ? 1 : zoomScale <= 25 ? 5 : 10;
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
      ctx.lineWidth = 1;

      // Draw polar concentric rings around target point
      const targetScr = worldToScreen(activeWp.E, activeWp.N);
      const ringRadii = [0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0];

      ringRadii.forEach(r => {
        const screenR = r * ppm;
        if (screenR > 4 && screenR < Math.max(w, h)) {
          ctx.beginPath();
          ctx.arc(targetScr.x, targetScr.y, screenR, 0, Math.PI * 2);
          if (r === toleranceMeters) {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Label tolerance zone
            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`Tolerance ±${r}m`, targetScr.x + screenR + 4, targetScr.y - 2);
          } else {
            ctx.strokeStyle = isDark ? 'rgba(201, 160, 99, 0.2)' : 'rgba(180, 140, 70, 0.25)';
            ctx.lineWidth = r === 1.0 || r === 5.0 || r === 10.0 ? 1.5 : 0.8;
            ctx.stroke();

            if (screenR > 25) {
              ctx.fillStyle = isDark ? 'rgba(201, 160, 99, 0.6)' : 'rgba(150, 110, 50, 0.8)';
              ctx.font = '9px monospace';
              ctx.fillText(`${r}m`, targetScr.x + screenR + 2, targetScr.y + 10);
            }
          }
        }
      });
    } else if (mapStyle === 'satellite') {
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, w, h);
      // Subtle terrain texture
      const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, w / 1.5);
      grad.addColorStop(0, '#1c2436');
      grad.addColorStop(1, '#0b0f19');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Draw Other Waypoints in Background
    waypoints.forEach((wp, idx) => {
      if (idx === activeWaypointIndex) return;
      const pt = worldToScreen(wp.E, wp.N);
      if (pt.x >= -20 && pt.x <= w + 20 && pt.y >= -20 && pt.y <= h + 20) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.fill();
        ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
        ctx.font = '9px sans-serif';
        ctx.fillText(wp.id, pt.x + 6, pt.y - 4);
      }
    });

    // 3. Draw Direct Line-of-Sight Guide Track Line
    const surveyorScr = worldToScreen(effE, effN);
    const targetScr = worldToScreen(activeWp.E, activeWp.N);

    ctx.beginPath();
    ctx.moveTo(surveyorScr.x, surveyorScr.y);
    ctx.lineTo(targetScr.x, targetScr.y);
    ctx.strokeStyle = guidance?.isOnTarget ? '#10b981' : '#c9a063';
    ctx.lineWidth = guidance?.isOnTarget ? 3 : 2;
    ctx.setLineDash(guidance?.isOnTarget ? [] : [6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Draw Target Waypoint Marker & Crosshair Bullseye
    ctx.save();
    ctx.translate(targetScr.x, targetScr.y);

    // Outer pulse ring if on target
    if (guidance?.isOnTarget) {
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
      ctx.fill();
    }

    // Bullseye Crosshairs
    ctx.beginPath();
    ctx.moveTo(-16, 0); ctx.lineTo(16, 0);
    ctx.moveTo(0, -16); ctx.lineTo(0, 16);
    ctx.strokeStyle = '#c9a063';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Target Point Badge
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#c9a063';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Target Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillText(`🎯 ${activeWp.id}`, 12, -8);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#c9a063';
    ctx.fillText(`${activeWp.code}`, 12, 6);
    ctx.restore();

    // 5. Draw Surveyor Position & Heading Cone / Beam
    ctx.save();
    ctx.translate(surveyorScr.x, surveyorScr.y);

    // Accuracy Circle
    const accR = Math.max(3, (currentPos?.acc || 1.5) * ppm);
    ctx.beginPath();
    ctx.arc(0, 0, accR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Heading Arrow / FOV Beam
    const surveyorRot = mapOrientation === 'heading' ? 0 : (effHeading * Math.PI) / 180;
    ctx.rotate(surveyorRot);

    // Forward Sight Triangle Cone
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-14, -32);
    ctx.lineTo(14, -32);
    ctx.closePath();
    const beamGrad = ctx.createLinearGradient(0, 0, 0, -32);
    beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.6)');
    beamGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    ctx.fillStyle = beamGrad;
    ctx.fill();

    // Position Dot & Heading Pointer
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Arrow pointer
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(4, -4);
    ctx.lineTo(-4, -4);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();

    // 6. Draw Compass Indicator Overlay in Top Right
    ctx.save();
    const compX = w - 40;
    const compY = 40;
    ctx.translate(compX, compY);
    const compAngle = mapOrientation === 'heading' ? -(effHeading * Math.PI) / 180 : 0;
    ctx.rotate(compAngle);

    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.stroke();

    // North Needle
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(4, 0);
    ctx.lineTo(-4, 0);
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    // South Needle
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(4, 0);
    ctx.lineTo(-4, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -16);
    ctx.restore();

    // 7. Draw Scale Bar in Bottom Left
    const barMeter = zoomScale <= 5 ? 1 : zoomScale <= 25 ? 5 : 10;
    const barPx = barMeter * ppm;
    ctx.fillStyle = isDark ? '#ffffff' : '#000000';
    ctx.fillRect(20, h - 25, barPx, 3);
    ctx.fillRect(20, h - 29, 2, 8);
    ctx.fillRect(20 + barPx, h - 29, 2, 8);
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${barMeter}m Scale`, 20, h - 33);

  }, [activeWp, waypoints, activeWaypointIndex, effE, effN, effZ, effHeading, zoomScale, mapOrientation, mapStyle, autoCenterOn, toleranceMeters, guidance, isDark, currentPos]);

  useEffect(() => {
    drawMapCanvas();
  }, [drawMapCanvas]);

  // Adjust canvas resolution on resize
  useEffect(() => {
    const resize = () => {
      if (containerRef.current && canvasRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = rect.width;
        canvasRef.current.height = Math.max(340, rect.height || 420);
        drawMapCanvas();
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [drawMapCanvas]);

  return (
    <div className="space-y-4">
      {/* Top Header & Dual Stakeout Mode Switcher */}
      <div className="bg-[#0f0f0f] p-4 sm:p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#c9a063]/20 text-[#c9a063]">
              <Map className="w-5 h-5" />
            </span>
            <h3 className="text-base font-serif italic text-white font-bold">
              Map Tiles Stakeout Director
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40">
              Live GNSS Sync
            </span>
          </div>
          <p className="text-xs text-white/50 mt-1">
            Centimetric visual bullseye, distance rings, and directional guidance on 2D map tiles.
          </p>
        </div>

        {/* Stakeout Mode Switcher & Actions (Map Tiles vs AR Camera, Undo/Redo, Import) */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
          {/* Undo / Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={onUndoWaypoint}
              disabled={!canUndo}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1 transition-all ${
                canUndo ? 'bg-white/5 hover:bg-white/10 text-white border-white/10' : 'opacity-40 cursor-not-allowed border-transparent text-white/40'
              }`}
              title="Undo last waypoint edit (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5 text-[#c9a063]" />
              <span className="hidden sm:inline">Undo</span>
            </button>
            <button
              onClick={onRedoWaypoint}
              disabled={!canRedo}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1 transition-all ${
                canRedo ? 'bg-white/5 hover:bg-white/10 text-white border-white/10' : 'opacity-40 cursor-not-allowed border-transparent text-white/40'
              }`}
              title="Redo last waypoint edit (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5 text-[#c9a063]" />
              <span className="hidden sm:inline">Redo</span>
            </button>
            {activeWp && onDeleteWaypoint && (
              <button
                onClick={() => onDeleteWaypoint(activeWp.id)}
                className="px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium flex items-center gap-1 transition-all"
                title={`Delete target ${activeWp.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="bg-[#141414] p-1 rounded-xl border border-white/10 flex items-center gap-1">
            <button
              onClick={() => {
                if (onSwitchToMode) onSwitchToMode('map');
              }}
              className="px-3 py-1.5 bg-[#c9a063] text-black font-bold text-xs rounded-lg shadow-md flex items-center gap-1.5 transition-all"
            >
              <Map className="w-3.5 h-3.5" />
              <span>Map 2D</span>
            </button>
            <button
              onClick={() => {
                if (onSwitchToMode) onSwitchToMode('ar');
                else if (onSwitchToAr) onSwitchToAr();
              }}
              className="px-3 py-1.5 bg-transparent hover:bg-white/10 text-white/70 hover:text-white font-medium text-xs rounded-lg flex items-center gap-1.5 transition-all"
              title="Switch to AR Camera Live 3D Reticle"
            >
              <Camera className="w-3.5 h-3.5 text-[#c9a063]" />
              <span>AR Cam 3D</span>
            </button>
            <button
              onClick={() => {
                if (onSwitchToMode) onSwitchToMode('compass');
              }}
              className="px-3 py-1.5 bg-transparent hover:bg-white/10 text-white/70 hover:text-white font-medium text-xs rounded-lg flex items-center gap-1.5 transition-all"
              title="Switch to Tactical Compass & Sentinel Radar HUD"
            >
              <Navigation className="w-3.5 h-3.5 text-[#c9a063]" />
              <span>Compass HUD</span>
            </button>
          </div>

          {(onOpenImport || onImportWaypoints) && (
            <button
              onClick={() => {
                if (onOpenImport) onOpenImport();
                else if (onImportWaypoints) onImportWaypoints();
              }}
              className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold rounded-xl border border-blue-500/40 flex items-center gap-1.5 transition-all shadow-sm"
              title="Import stakeout targets from CSV, KML, GeoJSON, GPX"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>Import Targets</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Stakeout HUD Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Map Tiles Canvas */}
        <div className="lg:col-span-2 space-y-4">
          {/* Target Waypoint Navigation Carousel Header */}
          <div className="bg-[#0f0f0f] p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-3">
            <button
              onClick={() => {
                if (waypoints.length > 0) {
                  const prev = (activeWaypointIndex - 1 + waypoints.length) % waypoints.length;
                  onSelectWaypointIndex(prev);
                }
              }}
              disabled={waypoints.length <= 1}
              className="p-2 rounded-xl bg-[#141414] hover:bg-[#1f1f1f] disabled:opacity-30 text-white border border-white/10"
              title="Previous Target"
            >
              <ChevronLeft className="w-4 h-4 text-[#c9a063]" />
            </button>

            <div className="flex-1 text-center">
              <div className="text-[10px] text-white/40 uppercase tracking-wider font-bold">
                Target {activeWaypointIndex + 1} of {waypoints.length}
              </div>
              <div className="text-base font-bold text-white font-mono flex items-center justify-center gap-2">
                <span>{activeWp?.id || 'No Target'}</span>
                <span className="text-xs text-white/60 font-normal">({activeWp?.code || '-'})</span>
              </div>
              {activeWp && (
                <div className="text-[11px] text-white/50 font-mono">
                  E: {activeWp.E.toFixed(2)} • N: {activeWp.N.toFixed(2)} • Z: {activeWp.Z.toFixed(2)}m
                </div>
              )}
            </div>

            <button
              onClick={() => {
                if (waypoints.length > 0) {
                  const next = (activeWaypointIndex + 1) % waypoints.length;
                  onSelectWaypointIndex(next);
                }
              }}
              disabled={waypoints.length <= 1}
              className="p-2 rounded-xl bg-[#141414] hover:bg-[#1f1f1f] disabled:opacity-30 text-white border border-white/10"
              title="Next Target"
            >
              <ChevronRight className="w-4 h-4 text-[#c9a063]" />
            </button>
          </div>

          {/* Interactive Map Canvas Container */}
          <div
            ref={containerRef}
            className="relative rounded-2xl overflow-hidden border border-white/10 bg-black min-h-[380px] shadow-2xl flex items-center justify-center"
          >
            <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair" />

            {/* Map Canvas Floating Controls */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-md p-1 rounded-xl border border-white/10 text-xs">
              <button
                onClick={() => setMapOrientation(mapOrientation === 'heading' ? 'north' : 'heading')}
                className={`px-2 py-1 rounded-lg font-medium transition-all ${
                  mapOrientation === 'heading' ? 'bg-[#c9a063] text-black font-bold' : 'text-white/70 hover:text-white'
                }`}
                title="Toggle Heading-Up vs North-Up"
              >
                <Compass className="w-3.5 h-3.5 inline mr-1" />
                {mapOrientation === 'heading' ? 'Heading-Up' : 'North-Up'}
              </button>
              <button
                onClick={() => setAutoCenterOn(autoCenterOn === 'midpoint' ? 'surveyor' : autoCenterOn === 'surveyor' ? 'target' : 'midpoint')}
                className="px-2 py-1 rounded-lg text-white/70 hover:text-white"
                title="Change Map Auto-Center Focus"
              >
                Center: {autoCenterOn}
              </button>
            </div>

            {/* Zoom In / Out Floating Toolbar */}
            <div className="absolute bottom-3 right-3 flex flex-col gap-1 bg-black/70 backdrop-blur-md p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setZoomScale(z => Math.max(2, z / 1.5))}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white"
                title="Zoom In (High Precision)"
              >
                <ZoomIn className="w-4 h-4 text-[#c9a063]" />
              </button>
              <button
                onClick={() => setZoomScale(z => Math.min(200, z * 1.5))}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white"
                title="Zoom Out (Wide View)"
              >
                <ZoomOut className="w-4 h-4 text-[#c9a063]" />
              </button>
            </div>

            {/* In-Tolerance Banner Overlay */}
            {guidance?.isOnTarget && (
              <div className="absolute top-3 right-3 bg-emerald-950/90 border border-emerald-400 text-emerald-200 px-3.5 py-1.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold animate-pulse">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>ON TARGET (±{toleranceMeters}m)</span>
              </div>
            )}
          </div>

          {/* Steer Guidance Banner */}
          {guidance && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 bg-[#0f0f0f] rounded-xl border border-white/5 space-y-0.5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Total Distance</span>
                <span className="text-lg font-bold text-white block">{guidance.distanceDisplay}</span>
                <span className="text-[10px] text-emerald-400 font-sans">
                  {guidance.isOnTarget ? '✓ In Tolerance' : 'Steering Active'}
                </span>
              </div>

              <div className="p-3 bg-[#0f0f0f] rounded-xl border border-white/5 space-y-0.5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Turn Command</span>
                <span className="text-lg font-bold text-[#c9a063] block">
                  {Math.abs(guidance.relativeTurnDeg) < 5
                    ? 'Forward'
                    : guidance.relativeTurnDeg > 0
                    ? `Right ${Math.abs(Math.round(guidance.relativeTurnDeg))}°`
                    : `Left ${Math.abs(Math.round(guidance.relativeTurnDeg))}°`}
                </span>
                <span className="text-[10px] text-white/40 font-sans">Bearing: {guidance.bearingDeg.toFixed(1)}°</span>
              </div>

              <div className="p-3 bg-[#0f0f0f] rounded-xl border border-white/5 space-y-0.5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Δ Easting / Northing</span>
                <span className="text-xs font-bold text-white block">
                  ΔE: {dE >= 0 ? `+${dE.toFixed(2)}` : dE.toFixed(2)}m
                </span>
                <span className="text-xs font-bold text-white block">
                  ΔN: {dN >= 0 ? `+${dN.toFixed(2)}` : dN.toFixed(2)}m
                </span>
              </div>

              <div className="p-3 bg-[#0f0f0f] rounded-xl border border-white/5 space-y-0.5">
                <span className="text-[10px] text-white/40 block uppercase font-sans">Cut / Fill (ΔZ)</span>
                <span className={`text-base font-bold block ${dZ > 0.1 ? 'text-amber-400' : dZ < -0.1 ? 'text-blue-400' : 'text-emerald-400'}`}>
                  {dZ > 0.05 ? `Cut -${dZ.toFixed(2)}m` : dZ < -0.05 ? `Fill +${Math.abs(dZ).toFixed(2)}m` : 'Grade Grade'}
                </span>
                <span className="text-[10px] text-white/40 font-sans">Target Z: {activeWp?.Z.toFixed(2)}m</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Voice Navigation, Simulation & Observation Logger */}
        <div className="space-y-4">
          {/* Spoken Turn-by-Turn Guidance Engine */}
          <div className="bg-[#0f0f0f] p-5 rounded-2xl border border-white/5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-serif italic text-white flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-[#c9a063]" />
                Spoken Voice Guidance
              </h4>
              <button
                onClick={() => {
                  const next = !voiceActive;
                  setVoiceActive(next);
                  if (next && guidance) {
                    speakVoiceAnnouncement(`Target ${activeWp?.id || ''}, go ${guidance.distanceDisplay}`);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-all ${
                  voiceActive
                    ? 'bg-emerald-600 text-white animate-pulse'
                    : 'bg-white/5 text-white/60 hover:text-white border border-white/10'
                }`}
              >
                {voiceActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-white/40" />}
                <span>{voiceActive ? 'Active' : 'Muted'}</span>
              </button>
            </div>

            <p className="text-white/50 text-[11px]">
              Hands-free audio prompts notify you when approaching target boundary pins.
            </p>

            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
              <span className="text-white/40">Prompt Cadence:</span>
              <div className="flex items-center gap-1">
                {[3, 5, 10].map(s => (
                  <button
                    key={s}
                    onClick={() => setVoiceIntervalSec(s)}
                    className={`px-2 py-0.5 rounded border text-[10px] ${
                      voiceIntervalSec === s
                        ? 'bg-[#c9a063] text-black font-bold border-[#c9a063]'
                        : 'bg-white/5 text-white/60 border-white/10'
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Record As-Built Stakeout Point */}
          <div className="bg-[#0f0f0f] p-5 rounded-2xl border border-white/5 space-y-3 text-xs">
            <h4 className="font-serif italic text-white flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Log As-Built Observation
            </h4>
            <p className="text-white/50 text-[11px]">
              Store current GNSS fix with delta errors relative to target design point {activeWp?.id}.
            </p>

            <button
              onClick={() => {
                if (onStoreObservation && activeWp && guidance) {
                  const rem = `Stakeout Check on ${activeWp.id} • Dist Err: ${guidance.distanceMeters.toFixed(3)}m • dE: ${dE.toFixed(3)}m, dN: ${dN.toFixed(3)}m`;
                  onStoreObservation(rem);
                }
              }}
              className="w-full py-2.5 bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold rounded-xl shadow-lg flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Record Stakeout Observation</span>
            </button>
          </div>

          {/* Walk Simulator for Testing */}
          <div className="bg-[#0f0f0f] p-5 rounded-2xl border border-white/5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-serif italic text-white flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-[#38bdf8]" />
                Field Walk Stepper (Simulator)
              </h4>
              <button
                onClick={() => {
                  setSimOffsetE(0);
                  setSimOffsetN(0);
                }}
                className="text-[10px] text-white/40 hover:text-white"
              >
                Reset
              </button>
            </div>

            <p className="text-white/50 text-[11px]">
              Simulate walking towards target marker on desktop sandboxes:
            </p>

            <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
              <div />
              <button
                onClick={() => setSimOffsetN(n => n + 1)}
                className="py-1.5 bg-[#141414] hover:bg-white/10 rounded-lg border border-white/10 text-white font-bold"
              >
                ▲ +1m N
              </button>
              <div />
              <button
                onClick={() => setSimOffsetE(e => e - 1)}
                className="py-1.5 bg-[#141414] hover:bg-white/10 rounded-lg border border-white/10 text-white font-bold"
              >
                ◀ -1m E
              </button>
              <button
                onClick={() => {
                  if (activeWp) {
                    setSimOffsetE(activeWp.E - (currentPos?.utm.E || 254800.0));
                    setSimOffsetN(activeWp.N - (currentPos?.utm.N || 2605200.0));
                  }
                }}
                className="py-1.5 bg-[#c9a063]/20 hover:bg-[#c9a063]/30 text-[#c9a063] rounded-lg border border-[#c9a063]/40 text-[10px] font-bold"
              >
                Snap Target
              </button>
              <button
                onClick={() => setSimOffsetE(e => e + 1)}
                className="py-1.5 bg-[#141414] hover:bg-white/10 rounded-lg border border-white/10 text-white font-bold"
              >
                +1m E ▶
              </button>
              <div />
              <button
                onClick={() => setSimOffsetN(n => n - 1)}
                className="py-1.5 bg-[#141414] hover:bg-white/10 rounded-lg border border-white/10 text-white font-bold"
              >
                ▼ -1m N
              </button>
              <div />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
