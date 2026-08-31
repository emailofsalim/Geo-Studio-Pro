// Hardware Communication Drivers & Cross-Platform Peripheral Protocols
// Supports Mobile, Tablet, Laptop, and Desktop Workstations

// 1. Web Bluetooth Support & Known Geomatics BLE UUIDs
export const BLE_SERVICES = {
  LOCATION_NAVIGATION: 0x1819,
  ENVIRONMENTAL_SENSING: 0x181A,
  BATTERY_SERVICE: 0x180F,
  DEVICE_INFORMATION: 0x180A,
  NORDIC_UART_SERVICE: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  NORDIC_UART_RX: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  NORDIC_UART_TX: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  LEICA_DISTO_SERVICE: '3ab10100-f831-4395-b29d-570977d5bf94',
  LEICA_DISTO_DISTANCE: '3ab10101-f831-4395-b29d-570977d5bf94'
};

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator && typeof (navigator as any).bluetooth?.requestDevice === 'function';
}

// 2. Web NFC Support (Mobile Android)
export function isNfcSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

// 3. Web Serial Support (USB-OTG, RS-232, Total Stations, GPS - Desktop & Android)
export function isSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

// 4. WebHID Support (SpaceMouse, Survey Pedals, Robotic Total Station controllers - Desktop)
export function isHidSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator;
}

// 5. WebUSB Support (Direct USB GNSS dongles, RTK base receivers - Desktop & Android)
export function isUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

// 6. Gamepad / Survey Joystick Controller Support (Desktop, Laptop, Mobile)
export function isGamepadSupported(): boolean {
  return typeof navigator !== 'undefined' && 'getGamepads' in navigator;
}

// 7. Web Speech API (Voice Commander & Text-to-Speech Field Announcer)
export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speakVoiceAnnouncement(text: string, rate: number = 1.0, pitch: number = 1.0) {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel(); // Stop any pending speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.debug('Speech synthesis error:', err);
  }
}

// 8. Screen Capture & Live Broadcast (Desktop, Laptop, Mobile)
export function isDisplayMediaSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
}

// 9. Network Telemetry (Wi-Fi, Hotspot, Cellular)
export interface NetworkTelemetry {
  online: boolean;
  type: string;
  effectiveType: string;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean;
}

export function getNetworkTelemetry(): NetworkTelemetry {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const conn = typeof navigator !== 'undefined' ? ((navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection) : null;

  return {
    online,
    type: conn?.type || (online ? 'wifi/hotspot' : 'offline'),
    effectiveType: conn?.effectiveType || (online ? '4g/wifi' : 'offline'),
    downlinkMbps: conn?.downlink ?? null,
    rttMs: conn?.rtt ?? null,
    saveData: conn?.saveData ?? false
  };
}

// 10. Device Hardware Archetype Profiler (Detects Desktop / Laptop / Tablet / Mobile Phone)
export interface DeviceProfile {
  deviceType: 'mobile' | 'tablet' | 'laptop' | 'desktop';
  os: string;
  browser: string;
  touchScreen: boolean;
  maxTouchPoints: number;
  screenResolution: string;
  colorDepth: number;
  deviceMemoryGb: number | null;
  hardwareConcurrencyCores: number;
  batterySupported: boolean;
  vibrationSupported: boolean;
  sensorsSupported: boolean;
  bleSupported: boolean;
  nfcSupported: boolean;
  serialSupported: boolean;
  hidSupported: boolean;
  usbSupported: boolean;
  gamepadSupported: boolean;
  speechSupported: boolean;
  screenShareSupported: boolean;
}

export function detectDeviceHardwareProfile(): DeviceProfile {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));
  
  let deviceType: 'mobile' | 'tablet' | 'laptop' | 'desktop' = 'desktop';
  if (isMobile) deviceType = 'mobile';
  else if (isTablet) deviceType = 'tablet';
  else if (navigator.maxTouchPoints > 0) deviceType = 'laptop'; // Touchscreen laptop
  else deviceType = 'desktop';

  let os = 'Unknown OS';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/iOS|iPhone|iPad/i.test(ua)) os = 'iOS';

  let browser = 'Modern Browser';
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Google Chrome';
  else if (/Edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/Firefox/i.test(ua)) browser = 'Mozilla Firefox';

  return {
    deviceType,
    os,
    browser,
    touchScreen: typeof navigator !== 'undefined' ? navigator.maxTouchPoints > 0 : false,
    maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
    screenResolution: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '1920x1080',
    colorDepth: typeof window !== 'undefined' ? window.screen.colorDepth : 24,
    deviceMemoryGb: typeof navigator !== 'undefined' ? ((navigator as any).deviceMemory || null) : null,
    hardwareConcurrencyCores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4,
    batterySupported: typeof navigator !== 'undefined' && 'getBattery' in navigator,
    vibrationSupported: typeof navigator !== 'undefined' && 'vibrate' in navigator,
    sensorsSupported: typeof window !== 'undefined' && ('DeviceOrientationEvent' in window || 'DeviceMotionEvent' in window),
    bleSupported: isBluetoothSupported(),
    nfcSupported: isNfcSupported(),
    serialSupported: isSerialSupported(),
    hidSupported: isHidSupported(),
    usbSupported: isUsbSupported(),
    gamepadSupported: isGamepadSupported(),
    speechSupported: isSpeechRecognitionSupported() || isSpeechSynthesisSupported(),
    screenShareSupported: isDisplayMediaSupported()
  };
}

// 11. NFC Survey Monument Record Schema
export interface NfcSurveyMonument {
  pointId: string;
  surveyType: 'Control Point' | 'Cadastral Boundary' | 'Benchmark (TBM)' | 'Borehole Collar' | 'Mining Monument';
  latitude: number;
  longitude: number;
  altitudeM: number;
  utmEasting: number;
  utmNorthing: number;
  utmZone: string;
  datum: string;
  surveyor: string;
  timestamp: string;
  notes: string;
}

export function formatNfcMonumentRecord(data: NfcSurveyMonument): string {
  return JSON.stringify({
    app: 'BhuNexStudio-NFC-Survey',
    ver: '1.0',
    id: data.pointId,
    type: data.surveyType,
    lat: data.latitude,
    lon: data.longitude,
    alt: data.altitudeM,
    E: data.utmEasting,
    N: data.utmNorthing,
    zone: data.utmZone,
    datum: data.datum,
    by: data.surveyor,
    ts: data.timestamp,
    notes: data.notes
  });
}

export function parseNfcMonumentRecord(text: string): NfcSurveyMonument | null {
  try {
    const obj = JSON.parse(text);
    if (obj.app === 'BhuNexStudio-NFC-Survey' || obj.app === 'GeoStudio-NFC-Survey' || obj.id || obj.pointId) {
      return {
        pointId: obj.id || obj.pointId || 'NFC-MARKER',
        surveyType: obj.type || obj.surveyType || 'Control Point',
        latitude: Number(obj.lat || obj.latitude || 0),
        longitude: Number(obj.lon || obj.longitude || 0),
        altitudeM: Number(obj.alt || obj.altitudeM || 0),
        utmEasting: Number(obj.E || obj.utmEasting || 0),
        utmNorthing: Number(obj.N || obj.utmNorthing || 0),
        utmZone: obj.zone || obj.utmZone || '45N',
        datum: obj.datum || 'WGS84',
        surveyor: obj.by || obj.surveyor || 'Field Surveyor',
        timestamp: obj.ts || obj.timestamp || new Date().toISOString(),
        notes: obj.notes || ''
      };
    }
  } catch (err) {
    if (text.includes('GEOSTUDIO') || text.includes('E:') || text.includes('LAT:')) {
      return {
        pointId: 'NFC-TAG',
        surveyType: 'Control Point',
        latitude: 0,
        longitude: 0,
        altitudeM: 0,
        utmEasting: 0,
        utmNorthing: 0,
        utmZone: '45N',
        datum: 'WGS84',
        surveyor: 'Field Surveyor',
        timestamp: new Date().toISOString(),
        notes: text
      };
    }
  }
  return null;
}
