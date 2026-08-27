import React, { useState, useEffect } from 'react';
import { Database, CheckCircle2 } from 'lucide-react';

interface DesktopStatusBarProps {
  workingZone: string;
  distanceUnit: 'm' | 'ft';
  activeTab: string;
  lastAutoSaveTime?: string;
  isAutoSaving?: boolean;
}

export const DesktopStatusBar: React.FC<DesktopStatusBarProps> = ({
  workingZone,
  distanceUnit,
  activeTab,
  lastAutoSaveTime,
  isAutoSaving
}) => {
  const [localTime, setLocalTime] = useState('');

  useEffect(() => {
    const updateTimes = () => {
      const now = new Date();
      setLocalTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    };
    updateTimes();
    const interval = setInterval(updateTimes, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="hidden md:flex items-center justify-between h-7 px-4 bg-[#0a0a0a] border-t border-white/[0.06] text-[11px] text-white/50 font-mono select-none z-20">
      {/* Left: Datum & Coordinate Reference */}
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-white/70">
          <span className="text-white/40">Datum:</span>
          <span>UTM {workingZone} (WGS84)</span>
        </span>
        <span className="text-white/20">•</span>
        <span className="text-white/70">
          <span className="text-white/40">Units:</span> {distanceUnit === 'm' ? 'Meters' : 'Feet'}
        </span>
      </div>

      {/* Right: Storage & Sync Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-white/60">
          <Database className={`w-3 h-3 ${isAutoSaving ? 'text-[#c9a063] animate-spin' : 'text-white/40'}`} />
          <span>
            {isAutoSaving
              ? 'Saving...'
              : lastAutoSaveTime
              ? `Saved ${lastAutoSaveTime}`
              : 'Local storage active'}
          </span>
        </div>
        <span className="text-white/20">•</span>
        <span className="text-white/50">{localTime}</span>
      </div>
    </footer>
  );
};
