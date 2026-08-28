import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Gamepad2,
  Mic,
  Volume2,
  Monitor,
  Share2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  HardDrive,
  Copy,
  Check
} from 'lucide-react';
import {
  isSerialSupported,
  isHidSupported,
  isGamepadSupported,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speakVoiceAnnouncement,
  isDisplayMediaSupported
} from '../../lib/hardwareComms';
import { triggerHaptic } from '../../lib/haptics';
import { useIsDarkMode } from '../../hooks/useIsDarkMode';

interface DesktopSerialHidViewProps {
  onVoiceRecordPoint?: (remark: string) => void;
}

export const DesktopSerialHidView: React.FC<DesktopSerialHidViewProps> = ({ onVoiceRecordPoint }) => {
  const isDark = useIsDarkMode();

  // 1. Web Serial State
  const [serialConnected, setSerialConnected] = useState<boolean>(false);
  const [serialBaudRate, setSerialBaudRate] = useState<number>(9600);
  const [serialPort, setSerialPort] = useState<any>(null);
  const [serialLogs, setSerialLogs] = useState<string[]>([]);
  const [serialTx, setSerialTx] = useState<string>('GET /MEAS/ALL');

  // 2. WebHID State (3D SpaceMouse / Foot Pedal)
  const [hidConnected, setHidConnected] = useState<boolean>(false);
  const [hidDeviceName, setHidDeviceName] = useState<string | null>(null);
  const [hidEvents, setHidEvents] = useState<string[]>([]);

  // 3. Gamepad / Joystick Controller State
  const [gamepads, setGamepads] = useState<any[]>([]);
  const [gamepadPollActive, setGamepadPollActive] = useState<boolean>(false);
  const gamepadRafRef = useRef<number | null>(null);

  // 4. Web Speech Voice Surveyor State
  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);
  const [lastSpokenCommand, setLastSpokenCommand] = useState<string>('');
  const speechRecRef = useRef<any>(null);

  // 5. Screen Capture / Field Stream
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  // Setup Web Speech Recognition
  useEffect(() => {
    if (isSpeechRecognitionSupported()) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
          const text = lastResult[0].transcript.trim().toLowerCase();
          setLastSpokenCommand(text);
          triggerHaptic([30, 20, 50]);

          if (text.includes('record') || text.includes('log') || text.includes('store') || text.includes('point')) {
            speakVoiceAnnouncement('Point observation stored.');
            if (onVoiceRecordPoint) onVoiceRecordPoint(`Voice: ${text}`);
          } else if (text.includes('level') || text.includes('tilt')) {
            speakVoiceAnnouncement('Leveling bubble checked.');
          } else {
            speakVoiceAnnouncement(`Command acknowledged: ${text}`);
          }
        }
      };

      rec.onerror = (e: any) => {
        console.debug('Speech recognition error:', e.error);
      };

      rec.onend = () => {
        if (isVoiceListening) {
          try { rec.start(); } catch (err) {}
        }
      };

      speechRecRef.current = rec;
    }
  }, [isVoiceListening, onVoiceRecordPoint]);

  const toggleVoiceListening = () => {
    if (!speechRecRef.current) {
      alert('Web Speech API is not supported on this browser (Chrome / Edge recommended).');
      return;
    }
    if (isVoiceListening) {
      speechRecRef.current.stop();
      setIsVoiceListening(false);
      speakVoiceAnnouncement('Voice surveyor paused.');
    } else {
      try {
        speechRecRef.current.start();
        setIsVoiceListening(true);
        speakVoiceAnnouncement('Voice surveyor active. Say Record Point, Store Benchmark, or Check Tilt.');
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Gamepad Poller
  useEffect(() => {
    const updateGamepads = () => {
      if (typeof navigator !== 'undefined' && 'getGamepads' in navigator) {
        const gpList = Array.from(navigator.getGamepads()).filter(Boolean);
        setGamepads(gpList);
      }
      gamepadRafRef.current = requestAnimationFrame(updateGamepads);
    };

    if (isGamepadSupported()) {
      window.addEventListener('gamepadconnected', () => setGamepadPollActive(true));
      gamepadRafRef.current = requestAnimationFrame(updateGamepads);
    }

    return () => {
      if (gamepadRafRef.current) cancelAnimationFrame(gamepadRafRef.current);
    };
  }, []);

  // Web Serial Total Station Handler
  const handleConnectSerial = async () => {
    if (!isSerialSupported()) {
      alert('Web Serial API is available on desktop Chrome, Edge, Opera, and Android Chrome with USB-OTG.');
      return;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: serialBaudRate });
      setSerialPort(port);
      setSerialConnected(true);
      triggerHaptic([30, 40]);

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      (async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            setSerialLogs(prev => [value.trim(), ...prev.slice(0, 30)]);
          }
        }
      })();
    } catch (err: any) {
      alert(`Serial connection canceled or failed: ${err.message}`);
    }
  };

  const handleSimulateSerial = () => {
    setSerialConnected(true);
    setSerialLogs(prev => [
      '[PORT OPEN] COM3 /dev/ttyUSB0 @ 9600 Baud',
      '<-- LEICA TPS1200 TOTAL STATION ONLINE',
      '<-- %R1Q,21: 104, 184.2340, 89.1240, 148.512 m (SD)',
      ...prev
    ]);
    triggerHaptic([30, 40]);
  };

  // WebHID SpaceMouse & Controller Handler
  const handleConnectHid = async () => {
    if (!isHidSupported()) {
      alert('WebHID API supported on desktop Chrome and Edge.');
      return;
    }
    try {
      const devices = await (navigator as any).hid.requestDevice({ filters: [] });
      if (devices.length > 0) {
        const dev = devices[0];
        await dev.open();
        setHidConnected(true);
        setHidDeviceName(dev.productName || 'HID Controller');
        dev.addEventListener('inputreport', (e: any) => {
          setHidEvents(prev => [`[HID Event] Report ID ${e.reportId} len ${e.data.byteLength}`, ...prev.slice(0, 15)]);
        });
        triggerHaptic([40, 30]);
      }
    } catch (err: any) {
      alert(`HID connection canceled: ${err.message}`);
    }
  };

  // Screen Broadcast
  const handleToggleScreenShare = async () => {
    if (!isDisplayMediaSupported()) {
      alert('Screen Capture API not available on this device.');
      return;
    }
    try {
      if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
        screenStreamRef.current = stream;
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
          screenVideoRef.current.play();
        }
        setIsScreenSharing(true);
        stream.getVideoTracks()[0].addEventListener('ended', () => setIsScreenSharing(false));
      } else {
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(t => t.stop());
          screenStreamRef.current = null;
        }
        setIsScreenSharing(false);
      }
    } catch (err: any) {
      console.debug('Screen share canceled:', err);
    }
  };

  const cardBg = isDark ? 'bg-[#111111] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm';
  const subCardBg = isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-slate-50 border-slate-200/80';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-white/50' : 'text-slate-500';
  const textMuted = isDark ? 'text-white/40' : 'text-slate-400';
  const borderSubtle = isDark ? 'border-white/[0.06]' : 'border-slate-200';
  const btnSecondary = isDark ? 'bg-white/[0.04] hover:bg-white/[0.08] text-white/80 hover:text-white border-white/[0.08]' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200';

  return (
    <div className="space-y-6">
      {/* Voice Surveyor & Audio Announcer Card */}
      <div className={`p-5 ${cardBg} rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono transition-colors`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Mic className={`w-5 h-5 ${isVoiceListening ? 'text-red-500 dark:text-red-400 animate-pulse' : textMuted}`} />
            <h3 className={`text-sm font-semibold ${textPrimary} font-sans`}>Hands-Free Voice Surveyor (Web Speech)</h3>
            <span className={`px-2 py-0.5 rounded text-[10px] border ${
              isVoiceListening
                ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                : isDark ? 'bg-white/[0.04] text-white/40 border-white/[0.08]' : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}>
              {isVoiceListening ? 'LISTENING (CONTINUOUS)' : 'STANDBY'}
            </span>
          </div>
          <p className={`text-xs ${textSecondary} font-sans`}>
            Speak commands while holding the prism pole: <span className="text-[#c9a063] font-medium">"Record Point"</span>, <span className="text-[#c9a063] font-medium">"Store Benchmark"</span>, <span className="text-[#c9a063] font-medium">"Check Level"</span>.
          </p>
        </div>

        <div className="flex items-center gap-2 font-sans">
          <button
            onClick={toggleVoiceListening}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm ${
              isVoiceListening
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-[#c9a063] hover:bg-[#b88f55] text-black'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            {isVoiceListening ? 'Pause Voice Control' : 'Start Voice Control'}
          </button>
          <button
            onClick={() => speakVoiceAnnouncement('Audio telemetry system operational.')}
            className={`px-3 py-2 rounded-lg ${btnSecondary} text-xs border flex items-center gap-1.5 transition-colors`}
            title="Test Voice Synthesizer"
          >
            <Volume2 className="w-3.5 h-3.5 text-[#c9a063]" /> Test Audio
          </button>
        </div>
      </div>

      {/* Grid: USB Serial Total Station & WebHID SpaceMouse / Gamepad */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* USB-OTG Total Station Terminal */}
        <div className={`md:col-span-6 ${cardBg} p-5 rounded-2xl border space-y-4 font-mono transition-colors`}>
          <div className="flex items-center justify-between font-sans">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              <span className={`text-xs font-semibold ${textPrimary}`}>USB-OTG Serial Total Station (Web Serial)</span>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
              serialConnected
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : isDark ? 'bg-white/[0.04] text-white/40 border-white/[0.08]' : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}>
              {serialConnected ? 'PORT OPEN' : 'CLOSED'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={serialBaudRate}
              onChange={e => setSerialBaudRate(parseInt(e.target.value, 10))}
              className={`px-2.5 py-1.5 rounded-lg ${
                isDark ? 'bg-[#161616] border-white/[0.08] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
              } border text-xs focus:outline-none focus:border-[#c9a063]`}
            >
              <option value="4800">4800 Baud</option>
              <option value="9600">9600 Baud (Standard)</option>
              <option value="19200">19200 Baud</option>
              <option value="115200">115200 Baud (High Speed GNSS)</option>
            </select>

            {!serialConnected ? (
              <>
                <button
                  onClick={handleConnectSerial}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors font-sans flex-1 shadow-sm"
                >
                  Open COM Port
                </button>
                <button
                  onClick={handleSimulateSerial}
                  className={`px-2.5 py-1.5 rounded-lg ${btnSecondary} text-xs border font-sans transition-colors`}
                >
                  Simulate
                </button>
              </>
            ) : (
              <button
                onClick={() => setSerialConnected(false)}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 text-xs font-medium transition-colors font-sans"
              >
                Close Port
              </button>
            )}
          </div>

          {/* Serial Terminal View */}
          <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 text-emerald-400 text-xs overflow-y-auto max-h-40 min-h-32 space-y-1 shadow-inner select-text">
            {serialLogs.length > 0 ? (
              serialLogs.map((line, idx) => <div key={idx}>{line}</div>)
            ) : (
              <div className="text-white/40 italic text-center py-6">
                No RS-232 / USB Total Station data. Connect cable or click "Simulate".
              </div>
            )}
          </div>
        </div>

        {/* WebHID 3D SpaceMouse & Gamepad Survey Joystick */}
        <div className={`md:col-span-6 ${cardBg} p-5 rounded-2xl border space-y-4 font-mono transition-colors`}>
          <div className="flex items-center justify-between font-sans">
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-[#c9a063]" />
              <span className={`text-xs font-semibold ${textPrimary}`}>Gamepad & 3D SpaceMouse (WebHID)</span>
            </div>
            <button
              onClick={handleConnectHid}
              className={`px-2.5 py-1 rounded ${btnSecondary} text-xs border transition-colors`}
            >
              Pair HID Device
            </button>
          </div>

          <div className={`p-3 ${subCardBg} border rounded-xl space-y-2`}>
            <div className={`text-xs ${textSecondary} font-sans flex items-center justify-between`}>
              <span>Connected Controllers & Joysticks</span>
              <span className={`text-[10px] ${textMuted}`}>{gamepads.length} active</span>
            </div>

            {gamepads.length > 0 ? (
              gamepads.map((gp, i) => (
                <div key={i} className="text-xs p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-700 dark:text-emerald-300">
                  <div className="font-bold">🎮 {gp.id}</div>
                  <div className={`text-[10px] ${textMuted} mt-1`}>
                    Axes: {gp.axes?.map((a: number) => a.toFixed(2)).join(', ')}
                  </div>
                </div>
              ))
            ) : (
              <div className={`text-xs ${textMuted} italic py-2`}>
                No USB gamepad or drone controller plugged in. Press any button on your controller to activate.
              </div>
            )}
          </div>

          {/* Screen Broadcast to Office */}
          <div className={`pt-2 border-t ${borderSubtle} flex items-center justify-between font-sans`}>
            <div>
              <div className={`text-xs ${textPrimary} font-medium`}>Live CAD / GIS Field Stream</div>
              <div className={`text-[10px] ${textMuted}`}>Share display with desktop engineering office</div>
            </div>
            <button
              onClick={handleToggleScreenShare}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                isScreenSharing
                  ? 'bg-red-600 text-white'
                  : btnSecondary
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>{isScreenSharing ? 'Stop Broadcast' : 'Start Broadcast'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
