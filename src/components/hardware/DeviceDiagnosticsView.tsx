import React from 'react';
import {
  Smartphone,
  Laptop,
  Monitor,
  Tablet,
  Cpu,
  Zap,
  BatteryCharging,
  Wifi,
  Radio,
  CheckCircle2,
  XCircle,
  HardDrive,
  Activity
} from 'lucide-react';
import {
  detectDeviceHardwareProfile,
  DeviceProfile,
  NetworkTelemetry
} from '../../lib/hardwareComms';

interface DeviceDiagnosticsViewProps {
  networkInfo: NetworkTelemetry;
  batteryLevel: number | null;
  isCharging: boolean | null;
  accel: { x: number; y: number; z: number; mag: number };
}

export const DeviceDiagnosticsView: React.FC<DeviceDiagnosticsViewProps> = ({
  networkInfo,
  batteryLevel,
  isCharging,
  accel
}) => {
  const profile: DeviceProfile = detectDeviceHardwareProfile();

  const getDeviceIcon = () => {
    switch (profile.deviceType) {
      case 'mobile': return Smartphone;
      case 'tablet': return Tablet;
      case 'laptop': return Laptop;
      default: return Monitor;
    }
  };
  const DeviceIcon = getDeviceIcon();

  const capabilities = [
    { name: 'Web Bluetooth LE (GNSS / Disto)', supported: profile.bleSupported, category: 'Wireless' },
    { name: 'Web NFC (Cadastral Monument Tags)', supported: profile.nfcSupported, category: 'Wireless' },
    { name: 'Web Serial (USB-OTG Total Stations)', supported: profile.serialSupported, category: 'Wired I/O' },
    { name: 'WebHID (3D SpaceMouse / Pedals)', supported: profile.hidSupported, category: 'Wired I/O' },
    { name: 'WebUSB (Raw GNSS Hardware)', supported: profile.usbSupported, category: 'Wired I/O' },
    { name: 'Gamepad API (Survey Joysticks)', supported: profile.gamepadSupported, category: 'Input' },
    { name: 'Motion / IMU Gyroscope (Tilt & Level)', supported: profile.sensorsSupported, category: 'Sensors' },
    { name: 'Web Speech (Hands-Free Voice Surveyor)', supported: profile.speechSupported, category: 'Audio' },
    { name: 'Screen Capture (Live Office Broadcast)', supported: profile.screenShareSupported, category: 'Display' },
    { name: 'Tactile Haptics (Vibration Actuator)', supported: profile.vibrationSupported, category: 'Actuators' },
    { name: 'Battery Telemetry API', supported: profile.batterySupported, category: 'Power' },
    { name: 'Multi-Touch Digitizer', supported: profile.touchScreen, category: 'Input' }
  ];

  return (
    <div className="space-y-6">
      {/* Device Overview Hero Card */}
      <div className="p-6 bg-[#111111] rounded-2xl border border-white/[0.08] grid grid-cols-1 md:grid-cols-4 gap-4 font-mono">
        <div className="flex items-center gap-3 md:col-span-2">
          <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#c9a063]">
            <DeviceIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-bold text-white uppercase">{profile.deviceType} Workstation</div>
            <div className="text-xs text-white/50">{profile.browser} on {profile.os}</div>
          </div>
        </div>

        <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-xs">
          <div className="text-[10px] text-white/40">Screen & Touch</div>
          <div className="text-white font-bold mt-0.5">{profile.screenResolution} ({profile.colorDepth}-bit)</div>
          <div className="text-[10px] text-white/50">{profile.maxTouchPoints} Touch Points</div>
        </div>

        <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-xs">
          <div className="text-[10px] text-white/40">Compute & Cores</div>
          <div className="text-white font-bold mt-0.5">{profile.hardwareConcurrencyCores} Logical CPU Cores</div>
          <div className="text-[10px] text-white/50">{profile.deviceMemoryGb ? `${profile.deviceMemoryGb} GB RAM` : 'Standard Memory'}</div>
        </div>
      </div>

      {/* Cross-Platform Hardware Feature Matrix */}
      <div className="bg-[#111111] p-6 rounded-2xl border border-white/[0.08] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Cross-Platform Hardware Capabilities Matrix</h3>
            <p className="text-xs text-white/50">Automatic detection of supported hardware subsystems on this device.</p>
          </div>
          <span className="px-2.5 py-1 rounded text-xs font-mono bg-white/[0.04] text-white/70 border border-white/[0.08]">
            {capabilities.filter(c => c.supported).length} / {capabilities.length} Available
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {capabilities.map((cap, i) => (
            <div
              key={i}
              className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
                cap.supported
                  ? 'bg-emerald-500/[0.03] border-emerald-500/20 text-white'
                  : 'bg-white/[0.01] border-white/[0.04] text-white/40'
              }`}
            >
              <div className="space-y-0.5 pr-2">
                <div className="font-sans font-medium text-xs truncate">{cap.name}</div>
                <div className="text-[10px] text-white/40">{cap.category}</div>
              </div>
              {cap.supported ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-white/20 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Real-time Hardware Telemetry */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
        {/* Accelerometer 3-Axis */}
        <div className="p-4 bg-[#111111] rounded-2xl border border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between text-white/60 font-sans">
            <span>3-Axis Accelerometer</span>
            <Activity className="w-4 h-4 text-[#c9a063]" />
          </div>
          <div className="grid grid-cols-3 gap-1 text-center pt-1">
            <div className="p-2 bg-white/[0.02] rounded">
              <div className="text-[10px] text-white/40">X</div>
              <div className="font-bold text-white">{accel.x}</div>
            </div>
            <div className="p-2 bg-white/[0.02] rounded">
              <div className="text-[10px] text-white/40">Y</div>
              <div className="font-bold text-white">{accel.y}</div>
            </div>
            <div className="p-2 bg-white/[0.02] rounded">
              <div className="text-[10px] text-white/40">Z</div>
              <div className="font-bold text-white">{accel.z}</div>
            </div>
          </div>
        </div>

        {/* Network / Hotspot */}
        <div className="p-4 bg-[#111111] rounded-2xl border border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between text-white/60 font-sans">
            <span>Network & Hotspot</span>
            <Wifi className="w-4 h-4 text-blue-400" />
          </div>
          <div className="pt-1 space-y-1 text-white/80">
            <div>Type: <span className="text-white capitalize">{networkInfo.type}</span></div>
            <div>Effective Band: <span className="text-[#c9a063] uppercase">{networkInfo.effectiveType}</span></div>
            {networkInfo.downlinkMbps && <div>Speed: <span className="text-white">{networkInfo.downlinkMbps} Mbps</span></div>}
          </div>
        </div>

        {/* Power / Battery */}
        <div className="p-4 bg-[#111111] rounded-2xl border border-white/[0.08] space-y-2">
          <div className="flex items-center justify-between text-white/60 font-sans">
            <span>Battery & Power</span>
            <BatteryCharging className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="pt-1 space-y-1 text-white/80">
            <div>Level: <span className="text-emerald-400 font-bold">{batteryLevel !== null ? `${batteryLevel}%` : 'AC Powered'}</span></div>
            <div>Status: <span className="text-white">{isCharging ? 'Charging' : 'Discharging / Plugged'}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};
