import React, { useState, useRef, useEffect } from 'react';
import {
  Bluetooth,
  Radio,
  Play,
  Pause,
  Terminal,
  Send,
  CheckCircle2,
  HardDrive,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  Info
} from 'lucide-react';
import { BLE_SERVICES, isBluetoothSupported } from '../../lib/hardwareComms';
import { triggerHaptic } from '../../lib/haptics';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

interface BluetoothRtkViewProps {
  onLogDistance?: (distanceM: number) => void;
}

export const BluetoothRtkView: React.FC<BluetoothRtkViewProps> = ({ onLogDistance }) => {
  const isDark = useIsDarkMode();
  const [bleDevice, setBleDevice] = useState<any>(null);
  const [bleConnected, setBleConnected] = useState<boolean>(false);
  const [bleStatus, setBleStatus] = useState<string>('Idle - Ready to pair physical Bluetooth device');
  const [bleErrorType, setBleErrorType] = useState<'iframe_policy' | 'unsupported' | 'user_canceled' | 'general' | null>(null);
  const [bleNmeaStream, setBleNmeaStream] = useState<string[]>([]);
  const [bleLaserDistance, setBleLaserDistance] = useState<number | null>(null);
  const [bleTxCommand, setBleTxCommand] = useState<string>('$PMTK314,1,1,1,1,1,5,0,0,0,0,0,0,0,0,0,0,0,0,0*2C');
  const [copiedStream, setCopiedStream] = useState<boolean>(false);
  const [isInIframe, setIsInIframe] = useState<boolean>(false);

  const bleGattServerRef = useRef<any>(null);
  const bleSimTimerRef = useRef<any>(null);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }
  }, []);

  const handleOpenInNewTab = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  const handleConnectBluetooth = async () => {
    setBleErrorType(null);

    if (!isBluetoothSupported()) {
      setBleErrorType('unsupported');
      setBleStatus('Web Bluetooth API is not supported on this browser (Chrome / Edge on Android or Desktop required).');
      return;
    }

    try {
      setBleStatus('Scanning for Bluetooth GNSS RTK Rovers & Laser Disto Rangefinders...');
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          'battery_service',
          'location_and_navigation',
          'environmental_sensing',
          BLE_SERVICES.NORDIC_UART_SERVICE,
          BLE_SERVICES.LEICA_DISTO_SERVICE
        ]
      });

      setBleDevice(device);
      setBleStatus(`Connecting to ${device.name || 'Bluetooth Peripheral'}...`);
      device.addEventListener('gattserverdisconnected', onBleDisconnected);

      const server = await device.gatt.connect();
      bleGattServerRef.current = server;
      setBleConnected(true);
      setBleStatus(`Connected to ${device.name || 'BLE Device'}`);
      triggerHaptic([40, 20, 60]);

      // Discover UART RX/TX
      try {
        const uartService = await server.getPrimaryService(BLE_SERVICES.NORDIC_UART_SERVICE);
        const txChar = await uartService.getCharacteristic(BLE_SERVICES.NORDIC_UART_TX);
        await txChar.startNotifications();
        txChar.addEventListener('characteristicvaluechanged', (e: any) => {
          const value = new TextDecoder().decode(e.target.value);
          setBleNmeaStream(prev => [value.trim(), ...prev.slice(0, 30)]);
        });
      } catch (uartErr) {
        console.debug('Nordic UART service not present, checking standard BLE services...');
      }

      // Discover Leica Disto
      try {
        const distoService = await server.getPrimaryService(BLE_SERVICES.LEICA_DISTO_SERVICE);
        const distChar = await distoService.getCharacteristic(BLE_SERVICES.LEICA_DISTO_DISTANCE);
        await distChar.startNotifications();
        distChar.addEventListener('characteristicvaluechanged', (e: any) => {
          const view = e.target.value as DataView;
          const dist = view.getFloat32(0, true);
          const rounded = Math.round(dist * 1000) / 1000;
          setBleLaserDistance(rounded);
          if (onLogDistance) onLogDistance(rounded);
          triggerHaptic([30, 20]);
        });
      } catch (distoErr) {
        console.debug('Leica Disto service not present');
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (
        errMsg.toLowerCase().includes('disallowed') ||
        errMsg.toLowerCase().includes('permissions policy') ||
        errMsg.toLowerCase().includes('policy') ||
        err?.name === 'SecurityError'
      ) {
        setBleErrorType('iframe_policy');
        setBleStatus('Bluetooth disallowed in embedded iframe preview. Browser requires opening in a full new tab.');
      } else if (errMsg.toLowerCase().includes('user cancelled') || errMsg.toLowerCase().includes('cancelled')) {
        setBleErrorType('user_canceled');
        setBleStatus('Bluetooth device pairing request was dismissed.');
      } else {
        setBleErrorType('general');
        setBleStatus(`Bluetooth pairing failed: ${errMsg}`);
      }
      setBleConnected(false);
    }
  };

  const onBleDisconnected = () => {
    setBleConnected(false);
    setBleStatus('Device disconnected');
    if (bleSimTimerRef.current) clearInterval(bleSimTimerRef.current);
  };

  const handleDisconnectBle = () => {
    if (bleGattServerRef.current && bleGattServerRef.current.connected) {
      bleGattServerRef.current.disconnect();
    }
    if (bleSimTimerRef.current) {
      clearInterval(bleSimTimerRef.current);
      bleSimTimerRef.current = null;
    }
    setBleConnected(false);
    setBleDevice(null);
    setBleStatus('Disconnected');
  };

  const handleStartSimulatedBle = () => {
    setBleConnected(true);
    setBleDevice({ name: 'Emlid Reach RS2+ (Simulated 10Hz RTK Rover)' });
    setBleStatus('Connected to Emlid Reach RS2+ (GATT 10Hz NMEA RTK Fix)');
    triggerHaptic([30, 40]);

    if (bleSimTimerRef.current) clearInterval(bleSimTimerRef.current);
    let sec = 0;
    bleSimTimerRef.current = setInterval(() => {
      sec++;
      const timeStr = new Date().toISOString().slice(11, 19).replace(/:/g, '');
      const sentences = [
        `$GNGGA,${timeStr}.00,2836.8354,N,07712.5412,E,4,18,0.7,214.35,M,-35.1,M,1.0,0123*4A`,
        `$GNRMC,${timeStr}.00,A,2836.8354,N,07712.5412,E,0.02,184.2,270826,,,D*78`,
        `$GNGST,${timeStr}.00,0.008,0.006,0.005,142.3,0.007,0.006,0.012*5E`,
        `$GNHDT,184.25,T*2B`
      ];
      const randomSentence = sentences[sec % sentences.length];
      setBleNmeaStream(prev => [randomSentence, ...prev.slice(0, 30)]);
      setBleLaserDistance(Math.round((14.825 + Math.sin(sec * 0.5) * 0.04) * 1000) / 1000);
    }, 1000);
  };

  const handleCopyNmea = () => {
    navigator.clipboard.writeText(bleNmeaStream.join('\n'));
    setCopiedStream(true);
    setTimeout(() => setCopiedStream(false), 2000);
  };

  const cardBg = isDark ? 'bg-[#111111] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm';
  const subCardBg = isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-slate-200/80';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-white/50' : 'text-slate-500';
  const textMuted = isDark ? 'text-white/40' : 'text-slate-400';
  const borderSubtle = isDark ? 'border-white/[0.06]' : 'border-slate-200';
  const btnSecondary = isDark ? 'bg-white/[0.06] hover:bg-white/[0.1] text-white/80 hover:text-white border-white/[0.08]' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200';

  return (
    <div className="space-y-5">
      {/* Embedded iframe warning & direct New Tab launcher */}
      {(bleErrorType === 'iframe_policy' || isInIframe) && (
        <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold text-blue-800 dark:text-blue-200">
                Why is Web Bluetooth disallowed in this view?
              </div>
              <p className="text-blue-700/80 dark:text-blue-200/70 text-[11px] leading-relaxed">
                Chromium browser security policies restrict direct Bluetooth scanning inside embedded <code className="px-1 py-0.5 bg-blue-500/15 rounded font-mono">{'<iframe>'}</code> preview sandboxes. To connect to physical GNSS RTK receivers or Leica/Bosch laser distos, open the app in a full browser tab.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              onClick={handleOpenInNewTab}
              className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open in New Tab
            </button>
            <button
              onClick={handleStartSimulatedBle}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-xl ${btnSecondary} text-xs font-medium border flex items-center justify-center gap-1.5 transition-colors`}
            >
              <Radio className="w-3.5 h-3.5 text-[#c9a063]" /> Simulate 10Hz RTK
            </button>
          </div>
        </div>
      )}

      {/* Top BLE Hardware Controller Card */}
      <div className={`p-5 ${cardBg} rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bluetooth className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            <h3 className={`text-sm font-semibold ${textPrimary}`}>Bluetooth LE Hardware Interface</h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
              bleConnected
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : isDark ? 'bg-white/[0.04] text-white/40 border-white/[0.08]' : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}>
              {bleConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
          <p className={`text-xs ${textSecondary}`}>{bleStatus}</p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {!bleConnected ? (
            <>
              <button
                onClick={handleConnectBluetooth}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Bluetooth className="w-3.5 h-3.5" /> Pair Physical BLE Rover / Disto
              </button>
              <button
                onClick={handleStartSimulatedBle}
                className={`px-3 py-2 rounded-lg ${btnSecondary} text-xs font-medium transition-colors border flex items-center gap-1.5`}
              >
                <Radio className="w-3.5 h-3.5 text-[#c9a063]" /> Simulate GNSS Stream
              </button>
            </>
          ) : (
            <button
              onClick={handleDisconnectBle}
              className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              Disconnect {bleDevice?.name || 'Device'}
            </button>
          )}
        </div>
      </div>

      {/* Grid: Laser Disto Rangefinder & NMEA Serial Terminal */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Laser Disto Telemetry */}
        <div className={`md:col-span-4 ${cardBg} p-5 rounded-2xl border space-y-4 font-mono transition-colors`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${textPrimary} font-sans`}>Laser Disto Rangefinder</span>
            <HardDrive className="w-4 h-4 text-[#c9a063]" />
          </div>

          <div className={`p-4 ${subCardBg} border rounded-xl text-center space-y-1`}>
            <div className={`text-[10px] ${textMuted} uppercase tracking-wider`}>Live Measured Distance</div>
            <div className="text-3xl font-bold text-[#c9a063]">
              {bleLaserDistance !== null ? `${bleLaserDistance.toFixed(3)} m` : '--.--- m'}
            </div>
            {bleLaserDistance !== null && (
              <div className={`text-[11px] ${textSecondary}`}>
                {(bleLaserDistance * 3.28084).toFixed(3)} ft | {(bleLaserDistance * 1.09361).toFixed(3)} yd
              </div>
            )}
          </div>

          <div className={`space-y-2 text-[11px] ${textSecondary} font-sans`}>
            <div className={`flex items-center gap-1.5 ${textPrimary} font-medium`}>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> Compatible Models
            </div>
            <ul className={`list-disc list-inside space-y-1 ${textMuted} pl-1`}>
              <li>Leica DISTO D1, D2, X3, X4, S910</li>
              <li>Bosch GLM 50 C, GLM 100 C, GLM 120 C</li>
              <li>Generic BLE Laser Rangefinders</li>
            </ul>
          </div>
        </div>

        {/* NMEA 0183 Live Serial Terminal */}
        <div className={`md:col-span-8 ${cardBg} p-5 rounded-2xl border flex flex-col space-y-3 font-mono transition-colors`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span className={`text-xs font-semibold ${textPrimary} font-sans`}>NMEA 0183 Stream Terminal (RTK 10Hz)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyNmea}
                disabled={!bleNmeaStream.length}
                className={`px-2.5 py-1 rounded ${
                  isDark ? 'bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white border-white/[0.06]' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                } text-[11px] transition-colors flex items-center gap-1 border`}
              >
                {copiedStream ? <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedStream ? 'Copied' : 'Copy Log'}</span>
              </button>
            </div>
          </div>

          {/* Terminal Console View */}
          <div className="flex-1 bg-slate-950 rounded-xl p-3 border border-slate-800 text-emerald-400 text-xs overflow-y-auto max-h-56 min-h-40 space-y-1 select-text shadow-inner">
            {bleNmeaStream.length > 0 ? (
              bleNmeaStream.map((sentence, idx) => (
                <div key={idx} className="leading-tight font-mono hover:text-emerald-300">
                  {sentence}
                </div>
              ))
            ) : (
              <div className="text-white/40 italic text-center py-8">
                No NMEA sentences received yet. Pair a BLE GNSS receiver or click "Simulate GNSS Stream".
              </div>
            )}
          </div>

          {/* Command Transmission Input */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={bleTxCommand}
              onChange={e => setBleTxCommand(e.target.value)}
              placeholder="Send NMEA/Proprietary command (e.g. $PMTK, $PUBX)..."
              className={`flex-1 px-3 py-1.5 rounded-lg ${
                isDark ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
              } border text-xs focus:outline-none focus:border-blue-500`}
            />
            <button
              onClick={() => {
                if (bleTxCommand.trim()) {
                  setBleNmeaStream(prev => [`[TX] ${bleTxCommand.trim()}`, ...prev.slice(0, 30)]);
                  triggerHaptic(20);
                }
              }}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors flex items-center gap-1 shadow-sm"
            >
              <Send className="w-3 h-3" /> Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
