import React from 'react';
import { RotateCcw, Crosshair, Zap, Sliders, CheckCircle2 } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';

interface SpiritLevelViewProps {
  pitch: number;
  roll: number;
  tarePitch: number;
  tareRoll: number;
  onTareZero: () => void;
  onResetTare: () => void;
  hapticLevelArmed: boolean;
  onToggleHaptic: () => void;
  onLogReading: () => void;
}

export const SpiritLevelView: React.FC<SpiritLevelViewProps> = ({
  pitch,
  roll,
  tarePitch,
  tareRoll,
  onTareZero,
  onResetTare,
  hapticLevelArmed,
  onToggleHaptic,
  onLogReading
}) => {
  const effPitch = pitch - tarePitch;
  const effRoll = roll - tareRoll;
  const totalTilt = Math.sqrt(effPitch * effPitch + effRoll * effRoll);
  const slopeGrade = Math.round(Math.tan((totalTilt * Math.PI) / 180) * 1000) / 10;
  const isCentered = Math.abs(effPitch) < 0.25 && Math.abs(effRoll) < 0.25;

  const maxR = 90;
  const bubbleX = Math.max(-maxR, Math.min(maxR, effRoll * 4.0));
  const bubbleY = Math.max(-maxR, Math.min(maxR, effPitch * 4.0));

  // Geological Strike & Dip estimation
  const dipAngle = Math.round(totalTilt * 10) / 10;
  const dipDirection = Math.round(((Math.atan2(effRoll, effPitch) * 180) / Math.PI + 360) % 360);
  const strikeDirection = (dipDirection + 270) % 360;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
      {/* 2D Circular Bubble Vial Display */}
      <div className="md:col-span-7 bg-[#111111] p-6 rounded-2xl border border-white/[0.08] flex flex-col items-center justify-center relative min-h-[380px]">
        <div className="text-xs font-mono text-white/50 mb-4 flex items-center justify-between w-full">
          <span>Electronic Circular Spirit Level</span>
          <span className={isCentered ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
            {isCentered ? '● VIAL CENTERED (<0.25°)' : '○ LEVELING IN PROGRESS'}
          </span>
        </div>

        {/* Level Ring Chamber */}
        <div className="relative w-64 h-64 rounded-full border-2 border-white/20 bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d] flex items-center justify-center shadow-inner overflow-hidden">
          {/* Target Bullseye Rings */}
          <div className="absolute w-44 h-44 rounded-full border border-white/10" />
          <div className="absolute w-28 h-28 rounded-full border border-white/20" />
          <div className="absolute w-12 h-12 rounded-full border border-[#c9a063]/60 bg-[#c9a063]/5" />

          {/* Crosshairs */}
          <div className="absolute w-full h-[1px] bg-white/20" />
          <div className="absolute h-full w-[1px] bg-white/20" />

          {/* Dynamic Liquid Bubble */}
          <div
            className={`absolute w-10 h-10 rounded-full shadow-lg transition-transform duration-75 ease-out flex items-center justify-center ${
              isCentered
                ? 'bg-emerald-400 ring-4 ring-emerald-400/40 shadow-emerald-500/50'
                : 'bg-[#c9a063] ring-2 ring-[#c9a063]/40 shadow-[#c9a063]/50'
            }`}
            style={{
              transform: `translate(${bubbleX}px, ${bubbleY}px)`
            }}
          >
            <div className="w-2 h-2 rounded-full bg-white/80" />
          </div>
        </div>

        {/* Live Tilt Deviation Readout */}
        <div className="mt-5 grid grid-cols-3 gap-4 w-full max-w-sm font-mono text-center text-xs">
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-white/40">Pitch (Y)</div>
            <div className="text-sm font-bold text-white mt-0.5">{effPitch.toFixed(2)}°</div>
          </div>
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-white/40">Roll (X)</div>
            <div className="text-sm font-bold text-white mt-0.5">{effRoll.toFixed(2)}°</div>
          </div>
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] text-white/40">Total Tilt</div>
            <div className={`text-sm font-bold mt-0.5 ${isCentered ? 'text-emerald-400' : 'text-[#c9a063]'}`}>
              {totalTilt.toFixed(2)}°
            </div>
          </div>
        </div>
      </div>

      {/* Level Controls & Geological Clinometer */}
      <div className="md:col-span-5 space-y-4">
        {/* Zero Calibration & Controls */}
        <div className="p-5 bg-[#111111] rounded-2xl border border-white/[0.08] space-y-4 font-mono">
          <div className="text-xs font-semibold text-white font-sans flex items-center justify-between">
            <span>Level Calibration & Controls</span>
            <Crosshair className="w-4 h-4 text-[#c9a063]" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onTareZero();
                triggerHaptic([30, 40]);
              }}
              className="px-3 py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-medium transition-colors border border-white/[0.08] flex items-center justify-center gap-1.5"
            >
              <Crosshair className="w-3.5 h-3.5 text-[#c9a063]" /> Tare / Zero Level
            </button>
            <button
              onClick={() => {
                onResetTare();
                triggerHaptic(20);
              }}
              className="px-3 py-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] text-white/60 hover:text-white text-xs transition-colors border border-white/[0.06] flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Tare
            </button>
          </div>

          <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl flex items-center justify-between text-xs">
            <div>
              <div className="text-white/80 font-medium">Haptic Feedback</div>
              <div className="text-[10px] text-white/40">Vibrate when bubble enters center ring</div>
            </div>
            <button
              onClick={onToggleHaptic}
              className={`p-1.5 rounded-lg border transition-colors ${
                hapticLevelArmed
                  ? 'bg-[#c9a063]/20 border-[#c9a063]/40 text-[#c9a063]'
                  : 'bg-white/[0.04] border-white/[0.08] text-white/40'
              }`}
            >
              <Zap className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onLogReading}
            className="w-full py-2.5 rounded-lg bg-[#c9a063] hover:bg-[#d6b074] text-black text-xs font-semibold transition-colors flex items-center justify-center gap-2 font-sans"
          >
            <CheckCircle2 className="w-4 h-4" /> Log Level Observation
          </button>
        </div>

        {/* Geological Incline & Dip / Strike Card */}
        <div className="p-5 bg-[#111111] rounded-2xl border border-white/[0.08] space-y-3 font-mono">
          <div className="text-xs font-semibold text-white font-sans flex items-center justify-between">
            <span>Geological Inclinometer & Dip</span>
            <Sliders className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] text-white/40">Gradient Slope</div>
              <div className="text-sm font-bold text-white mt-0.5">{slopeGrade}%</div>
            </div>
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] text-white/40">True Dip Angle</div>
              <div className="text-sm font-bold text-[#c9a063] mt-0.5">{dipAngle}°</div>
            </div>
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] text-white/40">Dip Azimuth</div>
              <div className="text-sm font-bold text-white mt-0.5">{dipDirection}°</div>
            </div>
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] text-white/40">Strike Bearing</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">{strikeDirection}°</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
