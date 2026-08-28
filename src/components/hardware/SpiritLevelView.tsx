import React from 'react';
import { RotateCcw, Crosshair, Zap, Sliders, CheckCircle2 } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

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
  const isDark = useIsDarkMode();
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

  const cardBg = isDark ? 'bg-[#111111] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm';
  const subCardBg = isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-slate-200/80';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-white/50' : 'text-slate-500';
  const textMuted = isDark ? 'text-white/40' : 'text-slate-400';
  const btnSecondary = isDark ? 'bg-white/[0.06] hover:bg-white/[0.1] text-white border-white/[0.08]' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200';

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
      {/* 2D Circular Bubble Vial Display */}
      <div className={`md:col-span-7 ${cardBg} p-6 rounded-2xl border flex flex-col items-center justify-center relative min-h-[380px] transition-colors`}>
        <div className={`text-xs font-mono ${textSecondary} mb-4 flex items-center justify-between w-full`}>
          <span className="font-sans font-medium">Electronic Circular Spirit Level</span>
          <span className={isCentered ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-medium'}>
            {isCentered ? '● VIAL CENTERED (<0.25°)' : '○ LEVELING IN PROGRESS'}
          </span>
        </div>

        {/* Level Ring Chamber */}
        <div className={`relative w-64 h-64 rounded-full border-2 ${
          isDark ? 'border-white/20 bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d]' : 'border-slate-300 bg-gradient-to-b from-slate-100 to-slate-200 shadow-inner'
        } flex items-center justify-center overflow-hidden`}>
          {/* Target Bullseye Rings */}
          <div className={`absolute w-44 h-44 rounded-full border ${isDark ? 'border-white/10' : 'border-slate-300'}`} />
          <div className={`absolute w-28 h-28 rounded-full border ${isDark ? 'border-white/20' : 'border-slate-400'}`} />
          <div className="absolute w-12 h-12 rounded-full border border-[#c9a063]/60 bg-[#c9a063]/10" />

          {/* Crosshairs */}
          <div className={`absolute w-full h-[1px] ${isDark ? 'bg-white/20' : 'bg-slate-300'}`} />
          <div className={`absolute h-full w-[1px] ${isDark ? 'bg-white/20' : 'bg-slate-300'}`} />

          {/* Dynamic Liquid Bubble */}
          <div
            className={`absolute w-10 h-10 rounded-full shadow-lg transition-transform duration-75 ease-out flex items-center justify-center ${
              isCentered
                ? 'bg-emerald-500 ring-4 ring-emerald-500/40 shadow-emerald-500/50'
                : 'bg-[#c9a063] ring-2 ring-[#c9a063]/40 shadow-[#c9a063]/50'
            }`}
            style={{
              transform: `translate(${bubbleX}px, ${bubbleY}px)`
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-white/90 shadow-xs" />
          </div>
        </div>

        {/* Live Tilt Deviation Readout */}
        <div className="mt-5 grid grid-cols-3 gap-3 w-full max-w-sm font-mono text-center text-xs">
          <div className={`p-2.5 rounded-xl ${subCardBg} border`}>
            <div className={`text-[10px] ${textMuted}`}>Pitch (Y)</div>
            <div className={`text-sm font-bold ${textPrimary} mt-0.5`}>{effPitch.toFixed(2)}°</div>
          </div>
          <div className={`p-2.5 rounded-xl ${subCardBg} border`}>
            <div className={`text-[10px] ${textMuted}`}>Roll (X)</div>
            <div className={`text-sm font-bold ${textPrimary} mt-0.5`}>{effRoll.toFixed(2)}°</div>
          </div>
          <div className={`p-2.5 rounded-xl ${subCardBg} border`}>
            <div className={`text-[10px] ${textMuted}`}>Total Tilt</div>
            <div className={`text-sm font-bold mt-0.5 ${isCentered ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#c9a063]'}`}>
              {totalTilt.toFixed(2)}°
            </div>
          </div>
        </div>
      </div>

      {/* Level Controls & Geological Clinometer */}
      <div className="md:col-span-5 space-y-4">
        {/* Zero Calibration & Controls */}
        <div className={`p-5 ${cardBg} rounded-2xl border space-y-4 font-mono transition-colors`}>
          <div className={`text-xs font-semibold ${textPrimary} font-sans flex items-center justify-between`}>
            <span>Level Calibration & Controls</span>
            <Crosshair className="w-4 h-4 text-[#c9a063]" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onTareZero();
                triggerHaptic([30, 40]);
              }}
              className={`px-3 py-2.5 rounded-lg ${btnSecondary} text-xs font-medium transition-colors border flex items-center justify-center gap-1.5`}
            >
              <Crosshair className="w-3.5 h-3.5 text-[#c9a063]" /> Tare / Zero Level
            </button>
            <button
              onClick={() => {
                onResetTare();
                triggerHaptic(20);
              }}
              className={`px-3 py-2.5 rounded-lg ${
                isDark ? 'bg-white/[0.02] hover:bg-white/[0.06] text-white/60 hover:text-white border-white/[0.06]' : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              } text-xs transition-colors border flex items-center justify-center gap-1.5`}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Tare
            </button>
          </div>

          <div className={`p-3 ${subCardBg} border rounded-xl flex items-center justify-between text-xs`}>
            <div>
              <div className={`${textPrimary} font-medium`}>Haptic Center Ring</div>
              <div className={`text-[10px] ${textMuted}`}>Vibrate when bubble enters center target</div>
            </div>
            <button
              onClick={onToggleHaptic}
              className={`p-1.5 rounded-lg border transition-colors ${
                hapticLevelArmed
                  ? 'bg-[#c9a063]/20 border-[#c9a063]/40 text-[#c9a063]'
                  : isDark
                  ? 'bg-white/[0.04] border-white/[0.08] text-white/40'
                  : 'bg-white border-slate-200 text-slate-400'
              }`}
            >
              <Zap className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onLogReading}
            className="w-full py-2.5 rounded-lg bg-[#c9a063] hover:bg-[#b88f55] text-black text-xs font-semibold transition-colors flex items-center justify-center gap-2 font-sans shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" /> Log Level Observation
          </button>
        </div>

        {/* Geological Incline & Dip / Strike Card */}
        <div className={`p-5 ${cardBg} rounded-2xl border space-y-3 font-mono transition-colors`}>
          <div className={`text-xs font-semibold ${textPrimary} font-sans flex items-center justify-between`}>
            <span>Geological Inclinometer & Dip</span>
            <Sliders className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className={`p-2.5 rounded-lg ${subCardBg} border`}>
              <div className={`text-[10px] ${textMuted}`}>Gradient Slope</div>
              <div className={`text-sm font-bold ${textPrimary} mt-0.5`}>{slopeGrade}%</div>
            </div>
            <div className={`p-2.5 rounded-lg ${subCardBg} border`}>
              <div className={`text-[10px] ${textMuted}`}>True Dip Angle</div>
              <div className="text-sm font-bold text-[#c9a063] mt-0.5">{dipAngle}°</div>
            </div>
            <div className={`p-2.5 rounded-lg ${subCardBg} border`}>
              <div className={`text-[10px] ${textMuted}`}>Dip Azimuth</div>
              <div className={`text-sm font-bold ${textPrimary} mt-0.5`}>{dipDirection}°</div>
            </div>
            <div className={`p-2.5 rounded-lg ${subCardBg} border`}>
              <div className={`text-[10px] ${textMuted}`}>Strike Bearing</div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{strikeDirection}°</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
