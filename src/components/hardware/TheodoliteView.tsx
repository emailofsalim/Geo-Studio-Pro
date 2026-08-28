import React, { useRef, useState } from 'react';
import {
  Camera,
  Play,
  Pause,
  Zap,
  Compass,
  CheckCircle2,
  Lock,
  Unlock,
  Maximize2,
  Minimize2,
  RotateCw
} from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

interface TheodoliteViewProps {
  heading: number;
  pitch: number;
  roll: number;
  zenithAngle: number;
  slopePercent: number;
  targetLocked: boolean;
  onToggleLock: () => void;
  onLogReading: () => void;
}

export const TheodoliteView: React.FC<TheodoliteViewProps> = ({
  heading,
  pitch,
  roll,
  zenithAngle,
  slopePercent,
  targetLocked,
  onToggleLock,
  onLogReading
}) => {
  const isDark = useIsDarkMode();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');

  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);

      const track = stream.getVideoTracks()[0];
      const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
      if (capabilities.torch) {
        setHasTorch(true);
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const newState = !isTorchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: newState }]
        });
        setIsTorchOn(newState);
        triggerHaptic(25);
      } catch (err) {
        console.debug('Torch error:', err);
      }
    }
  };

  const cardinal =
    heading >= 337.5 || heading < 22.5 ? 'N' :
    heading < 67.5 ? 'NE' :
    heading < 112.5 ? 'E' :
    heading < 157.5 ? 'SE' :
    heading < 202.5 ? 'S' :
    heading < 247.5 ? 'SW' :
    heading < 292.5 ? 'W' : 'NW';

  const cardBg = isDark ? 'bg-[#111111] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm';
  const controlBarBg = isDark ? 'bg-[#161616] border-white/[0.08]' : 'bg-slate-50 border-slate-200';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-white/60' : 'text-slate-600';
  const btnSecondary = isDark ? 'bg-white/[0.06] hover:bg-white/[0.1] text-white/80 border-white/[0.08]' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs';

  return (
    <div className={`${cardBg} rounded-2xl border overflow-hidden flex flex-col min-h-[440px] transition-colors ${
      isFullscreen ? 'fixed inset-4 z-50 shadow-2xl flex flex-col' : 'relative'
    }`}>
      {/* Camera Sight / Reticle HUD */}
      <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden min-h-[360px]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
        />

        {!isCameraActive && (
          <div className="text-center p-8 space-y-3">
            <div className="w-12 h-12 rounded-full bg-white/[0.08] border border-white/[0.15] flex items-center justify-center mx-auto text-[#c9a063]">
              <Camera className="w-6 h-6" />
            </div>
            <div className="text-xs text-white/80 max-w-sm mx-auto">
              Camera viewfinder is standby. Start optical HUD to sight bearings, benchmark targets, and elevation angles.
            </div>
            <button
              onClick={startCamera}
              className="px-4 py-2 rounded-lg bg-[#c9a063] hover:bg-[#b88f55] text-black text-xs font-semibold transition-colors inline-flex items-center gap-2 shadow-sm"
            >
              <Play className="w-3.5 h-3.5" /> Start Optical Viewfinder
            </button>
          </div>
        )}

        {isCameraActive && (
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 font-mono text-xs text-white select-none">
            {/* Top Compass Azimuth Ribbon */}
            <div className="bg-black/70 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/20 mx-auto flex items-center gap-3 shadow-lg">
              <Compass className="w-4 h-4 text-[#c9a063]" />
              <span className="text-sm font-bold text-[#c9a063]">{heading.toFixed(1)}°</span>
              <span className="text-white/40">|</span>
              <span className="text-white/90 font-bold">{cardinal}</span>
            </div>

            {/* Reticle Crosshairs & 1:100 Stadia Lines */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-64 h-64 border border-white/30 rounded-full flex items-center justify-center">
                <div className="w-20 h-20 border border-[#c9a063]/60 rounded-full" />
                <div className="absolute w-full h-[1px] bg-white/40" />
                <div className="absolute h-full w-[1px] bg-white/40" />
                {/* Upper and Lower Stadia Wires */}
                <div className="absolute w-8 h-[2px] bg-[#c9a063] top-12" title="Upper Stadia wire (1:100)" />
                <div className="absolute w-8 h-[2px] bg-[#c9a063] bottom-12" title="Lower Stadia wire (1:100)" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#c9a063] ring-4 ring-[#c9a063]/40" />
              </div>
            </div>

            {/* Bottom Telemetry HUD */}
            <div className="flex items-center justify-between text-[11px] bg-black/70 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/20 shadow-lg">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-white/50">Pitch: </span>
                  <span className={pitch < 0 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {pitch.toFixed(1)}°
                  </span>
                </div>
                <div>
                  <span className="text-white/50">Roll: </span>
                  <span className="text-white font-medium">{roll.toFixed(1)}°</span>
                </div>
                <div>
                  <span className="text-white/50">Zenith: </span>
                  <span className="text-[#c9a063] font-bold">{zenithAngle.toFixed(1)}°</span>
                </div>
              </div>
              <div>
                <span className="text-white/50">Slope: </span>
                <span className="text-white font-bold">{slopePercent}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Viewfinder Controls Bar */}
      <div className={`p-3 ${controlBarBg} border-t flex items-center justify-between flex-wrap gap-2 transition-colors`}>
        <div className="flex items-center gap-2">
          {isCameraActive ? (
            <button
              onClick={stopCamera}
              className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/25 text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Pause className="w-3.5 h-3.5" /> Stop Viewfinder
            </button>
          ) : (
            <button
              onClick={startCamera}
              className={`px-3 py-1.5 rounded-lg ${btnSecondary} border text-xs font-medium transition-colors flex items-center gap-1.5`}
            >
              <Play className="w-3.5 h-3.5 text-[#c9a063]" /> Open Camera
            </button>
          )}

          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                isTorchOn
                  ? 'bg-amber-400/20 border-amber-400/40 text-amber-600 dark:text-amber-300'
                  : btnSecondary
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> Torch {isTorchOn ? 'ON' : 'OFF'}
            </button>
          )}

          <button
            onClick={() => {
              const next = cameraFacing === 'environment' ? 'user' : 'environment';
              setCameraFacing(next);
              if (isCameraActive) startCamera();
            }}
            className={`px-3 py-1.5 rounded-lg ${btnSecondary} border text-xs transition-colors flex items-center gap-1.5`}
          >
            <RotateCw className="w-3.5 h-3.5 text-slate-500 dark:text-white/60" /> Lens
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`px-3 py-1.5 rounded-lg ${btnSecondary} border text-xs transition-colors flex items-center gap-1.5`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? 'Exit' : 'Full'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleLock}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
              targetLocked
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                : btnSecondary
            }`}
          >
            {targetLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>{targetLocked ? 'Target Locked' : 'Lock Sighting Angle'}</span>
          </button>

          <button
            onClick={onLogReading}
            className="px-3.5 py-1.5 rounded-lg bg-[#c9a063] hover:bg-[#b88f55] text-black text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Log Point
          </button>
        </div>
      </div>
    </div>
  );
};
