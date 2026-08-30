import React, { useState, useEffect } from 'react';
import { Database, ShieldCheck, ShieldAlert, Radio } from 'lucide-react';
import { useHardwareResource } from '../hooks/useHardwareResource';

interface DesktopStatusBarProps {
  workingZone: string;
  distanceUnit: 'm' | 'ft';
  activeTab: string;
  lastAutoSaveTime?: string;
  isAutoSaving?: boolean;
  onOpenPrivacyMonitor?: () => void;
}

export const DesktopStatusBar: React.FC<DesktopStatusBarProps> = ({
  workingZone,
  distanceUnit,
  activeTab,
  lastAutoSaveTime,
  isAutoSaving,
  onOpenPrivacyMonitor
}) => {
  const [localTime, setLocalTime] = useState('');
  const { activeResourcesCount, activeResources, killAllSensors } = useHardwareResource();

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

      {/* Center: Hardware Sensor & Privacy Monitor */}
      <div className="flex items-center">
        {onOpenPrivacyMonitor && (
          <button
            onClick={onOpenPrivacyMonitor}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm transition-colors ${
              activeResourcesCount > 0
                ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30'
                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
            }`}
            title="Sensor & Hardware Privacy Manager (Zero Idle Background Usage)"
          >
            {activeResourcesCount > 0 ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="font-semibold">{activeResourcesCount} Sensor{activeResourcesCount > 1 ? 's' : ''} Active</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Sensors Idle (Privacy Mode)</span>
              </>
            )}
          </button>
        )}
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
