import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Camera,
  Mic,
  MapPin,
  Compass,
  Bluetooth,
  Battery,
  BatteryCharging,
  Activity,
  Trash2,
  Download,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Power,
  Eye,
  Info,
  Layers
} from 'lucide-react';
import { useHardwareResource } from '../hooks/useHardwareResource';
import { useIsDarkMode } from '../hooks/useIsDarkMode';
import { useToast } from '../context/ToastContext';
import { triggerHaptic } from '../lib/haptics';
import { downloadBlob } from '../lib/zip';

interface SensorPrivacyMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SensorPrivacyMonitorModal: React.FC<SensorPrivacyMonitorModalProps> = ({
  isOpen,
  onClose
}) => {
  const isDark = useIsDarkMode();
  const toast = useToast();
  const {
    camera,
    microphone,
    geolocation,
    orientation,
    motion,
    bluetooth,
    nfc,
    serial,
    hid,
    wakelock,
    isAppForeground,
    totalActiveResources,
    batteryTelemetry,
    auditLog,
    releaseAll,
    clearAuditLog
  } = useHardwareResource();

  const [activeTab, setActiveTab] = useState<'status' | 'audit' | 'permissions'>('status');

  if (!isOpen) return null;

  const handleKillAll = () => {
    releaseAll('Surveyor manually executed Emergency Hardware Kill Switch');
    triggerHaptic([40, 30, 60]);
    toast.showSuccess('All hardware sensors, cameras, mics, and GPS watchers forcefully stopped.');
  };

  const handleExportAuditCSV = () => {
    if (auditLog.length === 0) {
      toast.showInfo('No audit entries recorded yet.');
      return;
    }

    let csv = 'Timestamp_ISO,Timestamp_Local,Resource_Type,Action,Consumer_ID,Feature_Name,Details\n';
    auditLog.forEach(item => {
      const iso = new Date(item.timestamp).toISOString();
      const local = new Date(item.timestamp).toLocaleString();
      const det = (item.details || '').replace(/"/g, '""');
      csv += `${iso},"${local}",${item.resourceType},${item.action},${item.consumerId},"${item.featureName}","${det}"\n`;
    });

    downloadBlob(csv, `BhuNexStudio_Sensor_Audit_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
    toast.showSuccess(`Exported ${auditLog.length} sensor audit log events.`);
  };

  const cardBg = isDark ? 'bg-[#111111] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm';
  const subCardBg = isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-slate-200/80';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-white/60' : 'text-slate-600';
  const textMuted = isDark ? 'text-white/40' : 'text-slate-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className={`relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border ${cardBg} shadow-2xl overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-white/[0.01]">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${totalActiveResources > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'}`}>
              {totalActiveResources > 0 ? <Activity className="w-5 h-5 animate-pulse" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-base font-bold ${textPrimary}`}>Hardware & Sensor Resource Manager</h2>
                <span className={`px-2 py-0.5 text-[11px] font-mono rounded-full border ${
                  totalActiveResources > 0
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                }`}>
                  {totalActiveResources > 0 ? `${totalActiveResources} Resource(s) Active` : 'All Sensors Standby (0% Drain)'}
                </span>
              </div>
              <p className={`text-xs ${textSecondary}`}>Strict On-Demand Hardware Allocation & Background Lifecycle Sentinel</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {totalActiveResources > 0 && (
              <button
                type="button"
                onClick={handleKillAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-600 dark:text-red-400 border border-red-500/30 transition-all cursor-pointer"
                title="Immediately stop all active cameras, microphones, GPS, and motion listeners"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Kill All Sensors</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-white/[0.06] bg-white/[0.005]">
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'status'
                ? 'border-[#c9a063] text-[#c9a063]'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            Hardware Resource Grid
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-[#c9a063] text-[#c9a063]'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <span>Live Audit Log</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/10 font-mono">
              {auditLog.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('permissions')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'permissions'
                ? 'border-[#c9a063] text-[#c9a063]'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            Privacy Model & Guarantees
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {activeTab === 'status' && (
            <div className="space-y-6">
              {/* App Visibility & Battery Bar */}
              <div className={`p-4 rounded-xl border ${subCardBg} flex flex-wrap items-center justify-between gap-4 text-xs`}>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${isAppForeground ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span className={`font-medium ${textPrimary}`}>
                    App State: <span className="font-mono">{isAppForeground ? 'Foreground (Active View)' : 'Background (Auto-Suspended)'}</span>
                  </span>
                </div>
                {batteryTelemetry && batteryTelemetry.level !== null && (
                  <div className="flex items-center gap-2 text-white/70">
                    {batteryTelemetry.charging ? (
                      <BatteryCharging className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Battery className="w-4 h-4 text-white/60" />
                    )}
                    <span>Battery: <span className="font-mono font-bold text-white">{batteryTelemetry.level}%</span> {batteryTelemetry.charging ? '(Charging)' : ''}</span>
                  </div>
                )}
                <div className="text-white/50 text-[11px]">
                  Policy: <span className="text-[#c9a063] font-medium">Privacy by Default / Zero Idle Background Polling</span>
                </div>
              </div>

              {/* 6-Card Resource Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Camera */}
                <div className={`p-4 rounded-xl border ${cardBg} ${camera.active ? 'border-amber-500/40 ring-1 ring-amber-500/20' : ''} flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${camera.active ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-white/40'}`}>
                          <Camera className="w-4 h-4" />
                        </div>
                        <span className={`text-sm font-semibold ${textPrimary}`}>Camera Stream</span>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full ${camera.active ? 'bg-amber-500/20 text-amber-400 font-bold' : 'bg-white/5 text-white/40'}`}>
                        {camera.active ? 'ACTIVE' : 'STANDBY (OFF)'}
                      </span>
                    </div>
                    <p className={`text-xs ${textSecondary} mb-3`}>
                      On-demand for Theodolite, AR Stakeout, and Landmark Studio. Closed immediately when navigating away.
                    </p>
                  </div>
                  <div className={`pt-3 border-t border-white/[0.06] text-[11px] font-mono ${textMuted} space-y-1`}>
                    <div className="flex justify-between">
                      <span>Consumers:</span>
                      <span className="text-white">{camera.consumerCount}</span>
                    </div>
                    {camera.consumers.length > 0 && (
                      <div className="text-[10px] text-[#c9a063] truncate">
                        {camera.consumers.map(c => c.featureName).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Microphone */}
                <div className={`p-4 rounded-xl border ${cardBg} ${microphone.active ? 'border-amber-500/40 ring-1 ring-amber-500/20' : ''} flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${microphone.active ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-white/40'}`}>
                          <Mic className="w-4 h-4" />
                        </div>
                        <span className={`text-sm font-semibold ${textPrimary}`}>Microphone / Audio</span>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full ${microphone.active ? 'bg-amber-500/20 text-amber-400 font-bold' : 'bg-white/5 text-white/40'}`}>
                        {microphone.active ? 'RECORDING' : 'STANDBY (OFF)'}
                      </span>
                    </div>
                    <p className={`text-xs ${textSecondary} mb-3`}>
                      Triggered exclusively during acoustic decibel surveys or voice turn-by-turn prompts. Zero background capture.
                    </p>
                  </div>
                  <div className={`pt-3 border-t border-white/[0.06] text-[11px] font-mono ${textMuted} space-y-1`}>
                    <div className="flex justify-between">
                      <span>Consumers:</span>
                      <span className="text-white">{microphone.consumerCount}</span>
                    </div>
                    {microphone.consumers.length > 0 && (
                      <div className="text-[10px] text-[#c9a063] truncate">
                        {microphone.consumers.map(c => c.featureName).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Location / GNSS */}
                <div className={`p-4 rounded-xl border ${cardBg} ${geolocation.active ? 'border-blue-500/40 ring-1 ring-blue-500/20' : ''} flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${geolocation.active ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40'}`}>
                          <MapPin className="w-4 h-4" />
                        </div>
                        <span className={`text-sm font-semibold ${textPrimary}`}>GNSS Geolocation</span>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full ${geolocation.active ? 'bg-blue-500/20 text-blue-400 font-bold' : 'bg-white/5 text-white/40'}`}>
                        {geolocation.active ? 'TRACKING' : 'IDLE (OFF)'}
                      </span>
                    </div>
                    <p className={`text-xs ${textSecondary} mb-3`}>
                      High-accuracy WGS84 GPS watcher. Automatically throttles or stops when surveyor leaves GPS modes.
                    </p>
                  </div>
                  <div className={`pt-3 border-t border-white/[0.06] text-[11px] font-mono ${textMuted} space-y-1`}>
                    <div className="flex justify-between">
                      <span>Active Watchers:</span>
                      <span className="text-white">{geolocation.consumerCount}</span>
                    </div>
                    {geolocation.lastFixTimestamp && (
                      <div className="flex justify-between text-[10px]">
                        <span>Last Fix:</span>
                        <span>{new Date(geolocation.lastFixTimestamp).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Orientation / Compass */}
                <div className={`p-4 rounded-xl border ${cardBg} ${orientation.active ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : ''} flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${orientation.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/40'}`}>
                          <Compass className="w-4 h-4" />
                        </div>
                        <span className={`text-sm font-semibold ${textPrimary}`}>Orientation / Gyro</span>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full ${orientation.active ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'bg-white/5 text-white/40'}`}>
                        {orientation.active ? 'STREAMING' : 'STANDBY (OFF)'}
                      </span>
                    </div>
                    <p className={`text-xs ${textSecondary} mb-3`}>
                      3-Axis Electronic Compass, Theodolite pitch/roll, and Circular Spirit Level. Zero event overhead when idle.
                    </p>
                  </div>
                  <div className={`pt-3 border-t border-white/[0.06] text-[11px] font-mono ${textMuted} space-y-1`}>
                    <div className="flex justify-between">
                      <span>Consumers:</span>
                      <span className="text-white">{orientation.consumerCount}</span>
                    </div>
                    {orientation.consumers.length > 0 && (
                      <div className="text-[10px] text-emerald-400 truncate">
                        {orientation.consumers.map(c => c.featureName).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. Motion / Pedometer */}
                <div className={`p-4 rounded-xl border ${cardBg} ${motion.active ? 'border-purple-500/40 ring-1 ring-purple-500/20' : ''} flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${motion.active ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-white/40'}`}>
                          <Activity className="w-4 h-4" />
                        </div>
                        <span className={`text-sm font-semibold ${textPrimary}`}>Accelerometer</span>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full ${motion.active ? 'bg-purple-500/20 text-purple-400 font-bold' : 'bg-white/5 text-white/40'}`}>
                        {motion.active ? 'STREAMING' : 'STANDBY (OFF)'}
                      </span>
                    </div>
                    <p className={`text-xs ${textSecondary} mb-3`}>
                      Surveyor pacing distance dead-reckoning and seismic vibration sampling. Only engaged during active pacing calibration.
                    </p>
                  </div>
                  <div className={`pt-3 border-t border-white/[0.06] text-[11px] font-mono ${textMuted} space-y-1`}>
                    <div className="flex justify-between">
                      <span>Consumers:</span>
                      <span className="text-white">{motion.consumerCount}</span>
                    </div>
                  </div>
                </div>

                {/* 6. Bluetooth & WakeLock */}
                <div className={`p-4 rounded-xl border ${cardBg} ${bluetooth.active ? 'border-cyan-500/40 ring-1 ring-cyan-500/20' : ''} flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${bluetooth.active ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-white/40'}`}>
                          <Bluetooth className="w-4 h-4" />
                        </div>
                        <span className={`text-sm font-semibold ${textPrimary}`}>Bluetooth / WakeLock</span>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full ${bluetooth.active ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'bg-white/5 text-white/40'}`}>
                        {bluetooth.active ? 'CONNECTED' : 'STANDBY (OFF)'}
                      </span>
                    </div>
                    <p className={`text-xs ${textSecondary} mb-3`}>
                      External GNSS RTK Rovers (Emlid / Leica Disto Laser). Screen WakeLock prevents field timeout during surveys.
                    </p>
                  </div>
                  <div className={`pt-3 border-t border-white/[0.06] text-[11px] font-mono ${textMuted} space-y-1`}>
                    <div className="flex justify-between">
                      <span>Connected Device:</span>
                      <span className="text-white truncate max-w-[120px]">{bluetooth.connectedDeviceName || 'None'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Screen WakeLock:</span>
                      <span className={wakelock.active ? 'text-emerald-400' : 'text-white/40'}>{wakelock.active ? 'Active' : 'Released'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Short-range radios and wired links. These previously reached the
                  device APIs directly, so nothing here was reportable. */}
              <div className={`mt-4 p-4 rounded-xl border ${cardBg}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-semibold ${textPrimary}`}>Tag &amp; Wired Device Links</span>
                  <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full ${
                    nfc.active || serial.active || hid.active
                      ? 'bg-amber-500/20 text-amber-400 font-bold'
                      : 'bg-white/5 text-white/40'
                  }`}>
                    {nfc.active || serial.active || hid.active ? 'ACTIVE' : 'STANDBY (OFF)'}
                  </span>
                </div>
                <div className={`text-[11px] font-mono ${textMuted} space-y-1`}>
                  <div className="flex justify-between">
                    <span>NFC antenna:</span>
                    <span className={nfc.active ? 'text-amber-400' : 'text-white/40'}>
                      {nfc.active ? `Scanning (${nfc.consumerCount})` : 'Off'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Serial port:</span>
                    <span className={serial.active ? 'text-amber-400' : 'text-white/40'}>
                      {serial.active ? serial.portName || 'Open' : 'Closed'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>HID device:</span>
                    <span className={hid.active ? 'text-amber-400' : 'text-white/40'}>
                      {hid.active ? hid.deviceName || 'Claimed' : 'Released'}
                    </span>
                  </div>
                </div>
                {(nfc.active || serial.active || hid.active) && (
                  <div className={`mt-2 pt-2 border-t border-white/[0.06] text-[11px] ${textMuted}`}>
                    {[...nfc.consumers, ...serial.consumers, ...hid.consumers].map(c => c.featureName).join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-white/60">
                  Showing all hardware allocations, background suspensions, and teardowns in real-time.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportAuditCSV}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${subCardBg} border hover:bg-white/10 text-white transition-colors cursor-pointer`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={clearAuditLog}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors cursor-pointer`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              {auditLog.length === 0 ? (
                <div className="py-12 text-center text-xs text-white/40">
                  No hardware resource events recorded yet. Resources are allocated on demand when launching specific tools.
                </div>
              ) : (
                <div className="border border-white/[0.08] rounded-xl overflow-hidden">
                  <div className="max-h-[360px] overflow-y-auto divide-y divide-white/[0.04] text-xs font-mono">
                    {auditLog.map(item => (
                      <div key={item.id} className="p-3 flex items-start justify-between gap-3 hover:bg-white/[0.02] transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${
                              item.action === 'ACQUIRE'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : item.action === 'RELEASE'
                                ? 'bg-blue-500/20 text-blue-400'
                                : item.action === 'SUSPEND'
                                ? 'bg-amber-500/20 text-amber-400'
                                : item.action === 'RESUME'
                                ? 'bg-teal-500/20 text-teal-400'
                                : item.action === 'KILL_ALL'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-white/10 text-white/60'
                            }`}>
                              {item.action}
                            </span>
                            <span className="text-white font-semibold">{item.resourceType.toUpperCase()}</span>
                            <span className="text-white/40">•</span>
                            <span className="text-white/70 font-sans">{item.featureName}</span>
                          </div>
                          {item.details && (
                            <div className="text-[11px] text-white/50 pl-1">{item.details}</div>
                          )}
                        </div>
                        <div className="text-[10px] text-white/40 text-right shrink-0">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="space-y-4 text-xs text-white/70 leading-relaxed">
              <div className={`p-4 rounded-xl border ${subCardBg} space-y-3`}>
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Privacy by Default Architecture</span>
                </div>
                <p>
                  In accordance with high-security geomatics protocols, no hardware sensor, camera feed, microphone capture, Bluetooth scanner, or continuous GPS listener is ever started simply because the application was loaded or navigated.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-white/80">
                  <li><strong>Zero Global Listeners:</strong> All sensor listeners are attached on-demand and unmounted cleanly.</li>
                  <li><strong>Automatic Background Pause:</strong> If you minimize the browser or switch tabs, camera video streams and high-frequency motion sampling are immediately suspended.</li>
                  <li><strong>Granular Teardown:</strong> Every single camera track, audio stream, and GNSS watch ID is strictly released when closing the feature.</li>
                  <li><strong>Master Kill Switch:</strong> Surveyors can click "Kill All Sensors" at any point to instantly release all physical hardware.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-white/[0.08] bg-white/[0.01] text-xs text-white/50">
          <div>BhuNex Studio Hardware Resource Manager v3.7</div>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg font-medium ${subCardBg} border hover:bg-white/10 text-white transition-colors cursor-pointer`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
