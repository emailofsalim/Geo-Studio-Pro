import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Compass,
  Navigation,
  Volume2,
  VolumeX,
  RotateCcw,
  Undo2,
  Redo2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Target,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Crosshair,
  Radio,
  Share2,
  Download,
  Info
} from 'lucide-react';
import { SurveyWaypoint } from '../../types';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';
import { triggerHaptic, isVibrationSupported } from '../../lib/haptics';
import { speakVoiceAnnouncement, isSpeechRecognitionSupported, isSpeechSynthesisSupported } from '../../lib/hardwareComms';
import { calculateStakeoutGuidance, StakeoutGuidance } from '../../lib/voiceCommander';
import { toCSVtext } from '../../lib/formats';

interface ArStakeoutViewProps {
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
  distanceUnit?: 'm' | 'ft';
  toleranceMeters?: number;
  onStoreObservation?: (remark: string) => void;
}

export const ArStakeoutView: React.FC<ArStakeoutViewProps> = ({
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
  distanceUnit = 'm',
  toleranceMeters = 0.3,
  onStoreObservation
}) => {
  const isDark = useIsDarkMode();

  // 1. Camera Stream State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // 2. Motion / Orientation Sensors
  const [pitch, setPitch] = useState<number>(0);
  const [roll, setRoll] = useState<number>(0);
  const [liveHeading, setLiveHeading] = useState<number>(deviceHeading || 0);

  // 3. Simulated Position for Desktop / Sandbox testing
  const [simOffsetE, setSimOffsetE] = useState<number>(0);
  const [simOffsetN, setSimOffsetN] = useState<number>(0);
  const [isSimulatingWalk, setIsSimulatingWalk] = useState<boolean>(false);

  // 4. Voice & Audio Guidance
  const [voiceGuidanceActive, setVoiceGuidanceActive] = useState<boolean>(false);
  const [voiceIntervalSec, setVoiceIntervalSec] = useState<number>(5);
  const lastSpokenTimeRef = useRef<number>(0);
  const lastGuidanceRef = useRef<StakeoutGuidance | null>(null);

  // 5. Target Waypoint
  const activeWp = waypoints[activeWaypointIndex] || waypoints[0] || null;

  // Compute effective coordinates (combining GPS fix or fallback with simulation offset)
  const effE = (currentPos ? currentPos.utm.E : 254800.0) + simOffsetE;
  const effN = (currentPos ? currentPos.utm.N : 2605200.0) + simOffsetN;
  const effZ = currentPos?.alt || 540.0;

  // Guidance metrics
  const guidance: StakeoutGuidance | null = activeWp
    ? calculateStakeoutGuidance(effE, effN, liveHeading, activeWp.E, activeWp.N, toleranceMeters, distanceUnit)
    : null;

  // Track orientation changes
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let h = liveHeading;
      if ((e as any).webkitCompassHeading != null) {
        h = (e as any).webkitCompassHeading;
      } else if (e.alpha != null) {
        h = (360 - e.alpha) % 360;
      }
      setLiveHeading(Math.round(h * 10) / 10);
      setPitch(e.beta != null ? Math.round(e.beta * 10) / 10 : 0);
      setRoll(e.gamma != null ? Math.round(e.gamma * 10) / 10 : 0);
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => window.removeEventListener('deviceorientation', handleOrientation, true);
  }, [liveHeading]);

  // Sync external device heading
  useEffect(() => {
    if (deviceHeading) {
      setLiveHeading(deviceHeading);
    }
  }, [deviceHeading]);

  // Initialize Camera
  const startCamera = async () => {
    try {
      setCameraError(null);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError(`Camera feed unavailable (${err.message || 'Permission denied'}). AR Overlay remains active in HUD mode.`);
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setTorchOn(false);
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [facingMode]);

  // Toggle Torch Flashlight
  const toggleTorch = async () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    try {
      const stream = videoRef.current.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.torch) {
          await (track as any).applyConstraints({
            advanced: [{ torch: !torchOn }]
          });
          setTorchOn(!torchOn);
          triggerHaptic([30, 20, 40]);
        } else {
          alert('Flashlight torch is not supported on this camera/browser.');
        }
      }
    } catch (err) {
      console.warn('Torch error:', err);
    }
  };

  // Spoken Stakeout Voice Loop
  const handleSpeakNow = useCallback(() => {
    if (!guidance || !activeWp) return;
    speakVoiceAnnouncement(guidance.spokenInstruction);
    lastSpokenTimeRef.current = Date.now();
    lastGuidanceRef.current = guidance;
    triggerHaptic([20, 30]);
  }, [guidance, activeWp]);

  useEffect(() => {
    if (!voiceGuidanceActive || !guidance) return;
    const now = Date.now();
    if (now - lastSpokenTimeRef.current >= voiceIntervalSec * 1000) {
      handleSpeakNow();
    }
  }, [voiceGuidanceActive, guidance, voiceIntervalSec, handleSpeakNow]);

  // Render AR Canvas Overlays
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!activeWp || !guidance) {
        animId = requestAnimationFrame(render);
        return;
      }

      const cx = w / 2;
      const cy = h / 2;

      // 1. Draw Optical Reticle / Stadia Crosshairs in Center
      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Center cross
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy);
      ctx.lineTo(cx + 40, cy);
      ctx.moveTo(cx, cy - 40);
      ctx.lineTo(cx, cy + 40);
      ctx.stroke();

      // Center Circle
      ctx.beginPath();
      ctx.arc(cx, cy, 25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 2. Compute 3D Projective AR position of target point
      // Standard smartphone camera field of view: ~60° horizontal, ~45° vertical
      const hFOV = 60;
      const vFOV = 45;

      const relBearing = guidance.relativeTurnDeg; // -180 to +180 relative to current phone heading
      // Elevation pitch angle towards target
      const deltaZ = (activeWp.Z || 540) - effZ;
      const targetPitchDeg = (Math.atan2(deltaZ, guidance.distanceMeters) * (180 / Math.PI));
      const relPitch = targetPitchDeg - (pitch - 90); // camera looking outward

      const inHorizontalFOV = Math.abs(relBearing) <= (hFOV / 2);
      const inVerticalFOV = Math.abs(relPitch) <= (vFOV / 2);

      const isTargetInView = inHorizontalFOV;

      if (isTargetInView) {
        // Target is INSIDE the camera view screen!
        // Calculate screen X and Y
        const screenX = cx + (relBearing / (hFOV / 2)) * (w / 2);
        // Vertical perspective
        const clampedRelPitch = Math.max(-vFOV / 2, Math.min(vFOV / 2, relPitch));
        const screenY = cy - (clampedRelPitch / (vFOV / 2)) * (h / 3);

        const distScale = Math.max(0.6, Math.min(2.5, 30 / Math.max(1, guidance.distanceMeters)));

        // A. Draw Ground Projection Vertical Guideline
        ctx.save();
        const grad = ctx.createLinearGradient(screenX, screenY + 60, screenX, h);
        grad.addColorStop(0, guidance.isOnTarget ? 'rgba(16, 185, 129, 0.8)' : 'rgba(201, 160, 99, 0.8)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX, h);
        ctx.stroke();
        ctx.restore();

        // B. Draw 3D Pulsing AR Beacon Target Circle
        ctx.save();
        const time = Date.now() / 300;
        const pulse = Math.sin(time) * 6;

        ctx.strokeStyle = guidance.isOnTarget ? '#10b981' : '#c9a063';
        ctx.fillStyle = guidance.isOnTarget ? 'rgba(16, 185, 129, 0.25)' : 'rgba(201, 160, 99, 0.25)';
        ctx.lineWidth = 3;

        // Outer Ring
        ctx.beginPath();
        ctx.arc(screenX, screenY, (24 + pulse) * distScale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();

        // Inner Bullseye
        ctx.beginPath();
        ctx.arc(screenX, screenY, 8 * distScale, 0, Math.PI * 2);
        ctx.fillStyle = guidance.isOnTarget ? '#10b981' : '#c9a063';
        ctx.fill();

        // Crosshairs on target
        ctx.beginPath();
        ctx.moveTo(screenX - 18 * distScale, screenY);
        ctx.lineTo(screenX + 18 * distScale, screenY);
        ctx.moveTo(screenX, screenY - 18 * distScale);
        ctx.lineTo(screenX, screenY + 18 * distScale);
        ctx.stroke();

        // C. Floating AR Tag Card
        const tagText = `${activeWp.id} [${guidance.distanceDisplay}]`;
        ctx.font = 'bold 13px monospace';
        const textWidth = ctx.measureText(tagText).width;
        const cardW = textWidth + 24;
        const cardH = 28;
        const cardX = screenX - cardW / 2;
        const cardY = screenY - 45 * distScale;

        // Card background
        ctx.fillStyle = guidance.isOnTarget ? 'rgba(6, 78, 59, 0.92)' : 'rgba(20, 20, 20, 0.88)';
        ctx.strokeStyle = guidance.isOnTarget ? '#10b981' : '#c9a063';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 8);
        ctx.fill();
        ctx.stroke();

        // Card Text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, screenX, cardY + cardH / 2);

        ctx.restore();
      } else {
        // Target is OUTSIDE camera view!
        // Render Off-Screen Directional Indicator Arrows at the screen border
        ctx.save();
        const isLeft = guidance.relativeTurnDeg < 0;
        const arrowX = isLeft ? 45 : w - 45;
        const arrowY = cy;

        ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
        ctx.strokeStyle = '#c9a063';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(arrowX, arrowY, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw Chevron
        ctx.strokeStyle = '#c9a063';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (isLeft) {
          ctx.moveTo(arrowX + 8, arrowY - 12);
          ctx.lineTo(arrowX - 8, arrowY);
          ctx.lineTo(arrowX + 8, arrowY + 12);
        } else {
          ctx.moveTo(arrowX - 8, arrowY - 12);
          ctx.lineTo(arrowX + 8, arrowY);
          ctx.lineTo(arrowX - 8, arrowY + 12);
        }
        ctx.stroke();

        // Angle tag
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.abs(guidance.relativeTurnDeg)}°`, arrowX, arrowY + 48);

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [activeWp, guidance, effZ, pitch, liveHeading, isDark]);

  // Adjust canvas size to match container
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth || 640;
        canvasRef.current.height = containerRef.current.clientHeight || 420;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Step simulation controls
  const handleSimStep = (direction: 'forward' | 'backward' | 'left' | 'right' | 'jumpTo') => {
    if (direction === 'jumpTo' && activeWp && currentPos) {
      setSimOffsetE(activeWp.E - currentPos.utm.E);
      setSimOffsetN(activeWp.N - currentPos.utm.N);
      triggerHaptic([30, 40, 60]);
      return;
    }

    const stepM = 2.0;
    const rad = (liveHeading * Math.PI) / 180;
    let de = 0;
    let dn = 0;

    if (direction === 'forward') {
      de = stepM * Math.sin(rad);
      dn = stepM * Math.cos(rad);
    } else if (direction === 'backward') {
      de = -stepM * Math.sin(rad);
      dn = -stepM * Math.cos(rad);
    } else if (direction === 'left') {
      de = -stepM * Math.cos(rad);
      dn = stepM * Math.sin(rad);
    } else if (direction === 'right') {
      de = stepM * Math.cos(rad);
      dn = -stepM * Math.sin(rad);
    }

    setSimOffsetE(prev => prev + de);
    setSimOffsetN(prev => prev + dn);
    triggerHaptic([15]);
  };

  const handleResetSim = () => {
    setSimOffsetE(0);
    setSimOffsetN(0);
    triggerHaptic([20, 20]);
  };

  // Record verification observation
  const handleStoreStakeoutVerification = () => {
    if (!activeWp || !guidance) return;
    const remark = `Stakeout Check ${activeWp.id}: Dist=${guidance.distanceDisplay}, ΔE=${(activeWp.E - effE).toFixed(2)}m, ΔN=${(activeWp.N - effN).toFixed(2)}m`;
    if (onStoreObservation) {
      onStoreObservation(remark);
    }
    speakVoiceAnnouncement(`Point ${activeWp.id} verification recorded.`);
    triggerHaptic([40, 60, 80]);
  };

  const cardBg = isDark ? 'bg-[#0f0f0f] border-white/10' : 'bg-white border-slate-200 shadow-sm';
  const btnSecondary = isDark ? 'bg-white/5 hover:bg-white/10 text-white border-white/10' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200';

  return (
    <div className="space-y-4">
      {/* 1. Top HUD Action Bar: Undo, Redo, Delete, Waypoint Selector & Voice Toggle */}
      <div className={`p-4 rounded-2xl border ${cardBg} flex flex-wrap items-center justify-between gap-3 transition-colors`}>
        {/* Waypoint Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#c9a063] block">
            Target Stakeout Point:
          </span>
          <div className="flex items-center gap-1 bg-black/20 dark:bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => onSelectWaypointIndex(Math.max(0, activeWaypointIndex - 1))}
              disabled={activeWaypointIndex <= 0}
              className="p-1 rounded-lg hover:bg-white/10 text-white/70 disabled:opacity-30"
              title="Previous Waypoint"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <select
              value={activeWaypointIndex}
              onChange={e => onSelectWaypointIndex(parseInt(e.target.value, 10))}
              className="bg-transparent text-xs font-bold font-mono text-[#c9a063] outline-none px-2 py-0.5"
            >
              {waypoints.map((wp, idx) => (
                <option key={wp.id} value={idx} className="bg-slate-900 text-white">
                  {wp.id} - {wp.code} ({wp.E.toFixed(0)}E, {wp.N.toFixed(0)}N)
                </option>
              ))}
            </select>

            <button
              onClick={() => onSelectWaypointIndex(Math.min(waypoints.length - 1, activeWaypointIndex + 1))}
              disabled={activeWaypointIndex >= waypoints.length - 1}
              className="p-1 rounded-lg hover:bg-white/10 text-white/70 disabled:opacity-30"
              title="Next Waypoint"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Undo, Redo, Delete Toolbar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={onUndoWaypoint}
            disabled={!canUndo}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1 transition-all ${
              canUndo ? btnSecondary : 'opacity-40 cursor-not-allowed border-transparent'
            }`}
            title="Undo last point action (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5 text-[#c9a063]" />
            <span className="hidden sm:inline">Undo</span>
          </button>

          <button
            onClick={onRedoWaypoint}
            disabled={!canRedo}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1 transition-all ${
              canRedo ? btnSecondary : 'opacity-40 cursor-not-allowed border-transparent'
            }`}
            title="Redo last point action (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5 text-[#c9a063]" />
            <span className="hidden sm:inline">Redo</span>
          </button>

          {activeWp && (
            <button
              onClick={() => onDeleteWaypoint && onDeleteWaypoint(activeWp.id)}
              className="px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium flex items-center gap-1 transition-all"
              title={`Delete ${activeWp.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}

          {/* Voice Guidance Toggle */}
          <button
            onClick={() => {
              setVoiceGuidanceActive(!voiceGuidanceActive);
              if (!voiceGuidanceActive) {
                handleSpeakNow();
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              voiceGuidanceActive
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 animate-pulse'
                : `${btnSecondary} border`
            }`}
            title="Toggle Turn-by-Turn Spoken Guidance"
          >
            {voiceGuidanceActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-white/50" />}
            <span>{voiceGuidanceActive ? 'Voice Active' : 'Spoken Voice'}</span>
          </button>

          <button
            onClick={handleSpeakNow}
            className="px-2.5 py-1.5 rounded-xl bg-[#c9a063]/20 hover:bg-[#c9a063]/30 text-[#c9a063] border border-[#c9a063]/40 text-xs font-bold flex items-center gap-1"
            title="Speak Direction Now"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Speak</span>
          </button>
        </div>
      </div>

      {/* 2. AR Live Camera Stage Viewport */}
      <div
        ref={containerRef}
        className="relative w-full h-[460px] sm:h-[520px] rounded-3xl overflow-hidden bg-black border border-white/15 shadow-2xl flex items-center justify-center select-none"
      >
        {/* Background Live Video Feed */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* AR Canvas Overlay */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Top Floating Turn-by-Turn Guidance Banner */}
        {guidance && (
          <div className="absolute top-4 left-4 right-4 z-20 flex flex-col items-center gap-2 pointer-events-auto">
            <div
              className={`px-4 py-2.5 rounded-2xl border backdrop-blur-md shadow-2xl flex items-center justify-between gap-3 max-w-xl w-full transition-all ${
                guidance.isOnTarget
                  ? 'bg-emerald-950/90 border-emerald-400 text-white animate-bounce'
                  : 'bg-black/85 border-[#c9a063]/60 text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl ${
                    guidance.isOnTarget ? 'bg-emerald-500 text-black' : 'bg-[#c9a063] text-black'
                  }`}
                >
                  {guidance.isOnTarget ? (
                    <Target className="w-5 h-5 animate-spin" />
                  ) : guidance.turnDirection === 'left' ? (
                    <ArrowLeft className="w-5 h-5" />
                  ) : guidance.turnDirection === 'right' ? (
                    <ArrowRight className="w-5 h-5" />
                  ) : (
                    <ArrowUp className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-extrabold tracking-wide uppercase">
                    {guidance.shortVisualInstruction}
                  </div>
                  <div className="text-[11px] text-white/70 font-mono">
                    Target: <span className="text-[#c9a063] font-bold">{activeWp?.id}</span> • Bearing:{' '}
                    {guidance.bearingDeg}° • Relative: {guidance.relativeTurnDeg > 0 ? `+${guidance.relativeTurnDeg}` : guidance.relativeTurnDeg}°
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-lg sm:text-xl font-mono font-black text-emerald-400">
                  {guidance.distanceDisplay}
                </div>
                <div className="text-[10px] text-white/60 uppercase">
                  {guidance.isOnTarget ? '🎯 LOCKED ON' : 'Distance'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Floating Telemetry & Controls Overlay */}
        <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
          {/* Compass & Sensor HUD Badge */}
          <div className="px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs font-mono flex items-center gap-3">
            <div className="flex items-center gap-1 text-[#c9a063]">
              <Compass className="w-4 h-4" />
              <span>{liveHeading.toFixed(0)}°</span>
            </div>
            <div className="text-white/60">
              P: {pitch.toFixed(0)}° • R: {roll.toFixed(0)}°
            </div>
            <div className="text-emerald-400">
              ΔE: {activeWp ? (activeWp.E - effE >= 0 ? `+${(activeWp.E - effE).toFixed(1)}` : (activeWp.E - effE).toFixed(1)) : '--'}m
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTorch}
              className={`p-2.5 rounded-xl border backdrop-blur-md transition-all ${
                torchOn ? 'bg-amber-400 text-black border-amber-300 shadow-lg shadow-amber-400/50' : 'bg-black/70 text-white/80 border-white/20'
              }`}
              title="Toggle Flashlight Torch"
            >
              <Zap className="w-4 h-4" />
            </button>

            <button
              onClick={() => setFacingMode(facingMode === 'environment' ? 'user' : 'environment')}
              className="p-2.5 rounded-xl bg-black/70 hover:bg-black/90 text-white border border-white/20 backdrop-blur-md transition-all"
              title="Switch Camera (Rear / Front)"
            >
              <Camera className="w-4 h-4" />
            </button>

            <button
              onClick={handleStoreStakeoutVerification}
              className="px-4 py-2 rounded-xl bg-[#c9a063] hover:bg-[#d6b074] text-black font-bold text-xs flex items-center gap-1.5 shadow-xl transition-all"
              title="Record Verification Log"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Record Stake</span>
            </button>
          </div>
        </div>

        {/* Camera Warning / Fallback Notice if camera is blocked */}
        {cameraError && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-15 text-xs text-white/80 space-y-3">
            <AlertTriangle className="w-10 h-10 text-amber-400 animate-pulse" />
            <p className="max-w-md text-sm font-medium">{cameraError}</p>
            <p className="text-white/50 text-[11px]">
              The AR Target Reticle, Directional Arrows, and Turn-by-Turn Voice Navigation remain 100% active over this virtual radar grid.
            </p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-[#c9a063] text-black font-bold rounded-xl shadow-md text-xs"
            >
              Retry Camera Permission
            </button>
          </div>
        )}
      </div>

      {/* 3. Testing & Desktop Simulation Walkpad */}
      <div className={`p-4 rounded-2xl border ${cardBg} space-y-3 transition-colors`}>
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Navigation className="w-4 h-4 text-[#c9a063]" />
            Field Simulation Walkpad & Virtual Geodetic Stepper
          </span>
          {(simOffsetE !== 0 || simOffsetN !== 0) && (
            <span className="text-[11px] text-amber-400 font-mono">
              Simulated Offset: ΔE={simOffsetE.toFixed(1)}m, ΔN={simOffsetN.toFixed(1)}m
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <button
            onClick={() => handleSimStep('forward')}
            className={`py-2 px-3 rounded-xl ${btnSecondary} border font-medium flex items-center justify-center gap-1`}
          >
            <ArrowUp className="w-3.5 h-3.5 text-emerald-400" /> Forward 2m
          </button>
          <button
            onClick={() => handleSimStep('backward')}
            className={`py-2 px-3 rounded-xl ${btnSecondary} border font-medium flex items-center justify-center gap-1`}
          >
            <ArrowDown className="w-3.5 h-3.5 text-amber-400" /> Back 2m
          </button>
          <button
            onClick={() => handleSimStep('left')}
            className={`py-2 px-3 rounded-xl ${btnSecondary} border font-medium flex items-center justify-center gap-1`}
          >
            <ArrowLeft className="w-3.5 h-3.5 text-blue-400" /> Step Left 2m
          </button>
          <button
            onClick={() => handleSimStep('right')}
            className={`py-2 px-3 rounded-xl ${btnSecondary} border font-medium flex items-center justify-center gap-1`}
          >
            <ArrowRight className="w-3.5 h-3.5 text-purple-400" /> Step Right 2m
          </button>
          <button
            onClick={() => handleSimStep('jumpTo')}
            className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1 shadow-sm"
          >
            <Target className="w-3.5 h-3.5" /> Jump to Target
          </button>
        </div>

        {/* Voice Command Simulation Bar */}
        <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between flex-wrap gap-2 text-[11px]">
          <span className="text-slate-500 dark:text-white/50">Quick Voice Commands (1-Click Trigger):</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => {
                speakVoiceAnnouncement('Point observation stored.');
                if (onStoreObservation) onStoreObservation('Voice Command: Record Point');
              }}
              className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-[#c9a063]/20 text-slate-800 dark:text-white font-mono border border-slate-300 dark:border-white/10"
            >
              "Record Point"
            </button>
            <button
              onClick={onUndoWaypoint}
              disabled={!canUndo}
              className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-[#c9a063]/20 text-slate-800 dark:text-white font-mono border border-slate-300 dark:border-white/10 disabled:opacity-30"
            >
              "Undo"
            </button>
            <button
              onClick={onRedoWaypoint}
              disabled={!canRedo}
              className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-[#c9a063]/20 text-slate-800 dark:text-white font-mono border border-slate-300 dark:border-white/10 disabled:opacity-30"
            >
              "Redo"
            </button>
            <button
              onClick={handleSpeakNow}
              className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-[#c9a063]/20 text-slate-800 dark:text-white font-mono border border-slate-300 dark:border-white/10"
            >
              "Where is Target?"
            </button>
            <button
              onClick={handleResetSim}
              className="px-2.5 py-1 rounded-lg text-red-500 hover:bg-red-500/10 font-mono"
            >
              Reset Sim
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
