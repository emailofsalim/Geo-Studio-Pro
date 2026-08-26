import React, { useState, useEffect } from 'react';
import {
  Crosshair,
  Database,
  Radio,
  Clock,
  Compass,
  Cpu,
  Layers,
  Sparkles,
  ShieldCheck,
  Maximize2
} from 'lucide-react';

interface DesktopStatusBarProps {
  workingZone: string;
  distanceUnit: 'm' | 'ft';
  activeTab: string;
}

export const DesktopStatusBar: React.FC<DesktopStatusBarProps> = ({
  workingZone,
  distanceUnit,
  activeTab
}) => {
  const [utcTime, setUtcTime] = useState('');
  const [localTime, setLocalTime] = useState('');
  const [simCursor, setSimCursor] = useState({ E: 254820.35, N: 2605240.18, Z: 142.6 });

  useEffect(() => {
    const updateTimes = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().slice(17, 25) + ' UTC');
      setLocalTime(now.toLocaleTimeString([], { hour12: false }));
    };
    updateTimes();
    const interval = setInterval(updateTimes, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="hidden md:flex items-center justify-between px-3 py-1.5 bg-[#080808] border-t border-white/10 text-[11px] text-white/60 font-mono select-none z-20">
      {/* Left: Geodetic Coordinate Inspector */}
      <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-1.5 text-white/80">
          <Crosshair className="w-3 h-3 text-[#c9a063]" />
          <span className="text-white/40">Grid:</span>
          <span className="text-white font-bold">UTM {workingZone}</span>
        </div>

        <div className="flex items-center gap-1 text-white/70">
          <span className="text-white/40">E:</span>
          <span className="text-emerald-400 font-semibold">{simCursor.E.toFixed(2)}</span>
          <span className="text-white/40">m</span>
        </div>

        <div className="flex items-center gap-1 text-white/70">
          <span className="text-white/40">N:</span>
          <span className="text-emerald-400 font-semibold">{simCursor.N.toFixed(2)}</span>
          <span className="text-white/40">m</span>
        </div>

        <div className="flex items-center gap-1 text-white/70">
          <span className="text-white/40">Z (RL):</span>
          <span className="text-sky-400 font-semibold">{simCursor.Z.toFixed(2)}</span>
          <span className="text-white/40">m</span>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 text-white/40">
          <span>•</span>
          <span>γ: -0°24'12"</span>
          <span>•</span>
          <span>k₀: 0.999600</span>
          <span>•</span>
          <span>Geoid N: -41.2m</span>
        </div>
      </div>

      {/* Right: Engine Telemetry & Time */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden xl:flex items-center gap-1.5 text-emerald-400">
          <Radio className="w-3 h-3 animate-pulse" />
          <span>18 Sats (GPS/GLO/GAL/BDS)</span>
          <span className="text-white/30">|</span>
          <span>PDOP: 1.2</span>
        </div>

        <div className="flex items-center gap-1.5 text-white/50">
          <Database className="w-3 h-3 text-[#c9a063]" />
          <span>Local IndexedDB OK</span>
        </div>

        <div className="flex items-center gap-1.5 text-white/70 border-l border-white/10 pl-3">
          <Clock className="w-3 h-3 text-white/40" />
          <span className="text-white">{localTime}</span>
          <span className="text-white/40">({utcTime})</span>
        </div>
      </div>
    </footer>
  );
};
