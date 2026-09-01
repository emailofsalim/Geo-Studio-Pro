// ============================================================================
// Centralized Hardware & Sensor Resource Manager (BhuNex Studio Suite)
// ----------------------------------------------------------------------------
// Enforces strictly On-Demand / Feature-Required lifecycle for:
// - Camera (Video streams, torch, multi-tier constraints)
// - Microphone (Audio capture, FFT sound meters, Web Speech recognition)
// - Location / GNSS (One-shot fix vs continuous survey-grade tracking)
// - Motion & IMU Sensors (DeviceOrientation, DeviceMotion, Magnetometer, Gyro)
// - Bluetooth / BLE (GATT servers, UART streams, Laser rangefinders)
// - Screen WakeLock (Display retention)
// 
// Lifecycle Guarantees:
// 1. Zero global listeners registered on app launch (Privacy by Default).
// 2. Automatic suspension on background/tab hidden (visibilitychange / blur / pagehide).
// 3. Guaranteed unmount & teardown cleanup per consumer token.
// 4. Centralized audit log and emergency "Kill All Sensors" safety kill-switch.
// ============================================================================

export type HardwareResourceType =
  | 'camera'
  | 'microphone'
  | 'geolocation'
  | 'orientation'
  | 'motion'
  | 'bluetooth'
  | 'nfc'
  | 'serial'
  | 'hid'
  | 'wakelock';

export interface ResourceConsumer {
  id: string;
  featureName: string;
  resourceType: HardwareResourceType;
  acquiredAt: number;
  metadata?: Record<string, any>;
}

export interface ResourceAuditEntry {
  id: string;
  timestamp: number;
  resourceType: HardwareResourceType;
  action: 'ACQUIRE' | 'RELEASE' | 'SUSPEND' | 'RESUME' | 'DENIED' | 'ERROR' | 'KILL_ALL';
  consumerId: string;
  featureName: string;
  details?: string;
}

export interface HardwareResourceSnapshot {
  camera: {
    active: boolean;
    consumerCount: number;
    consumers: ResourceConsumer[];
    stream: MediaStream | null;
  };
  microphone: {
    active: boolean;
    consumerCount: number;
    consumers: ResourceConsumer[];
    stream: MediaStream | null;
  };
  geolocation: {
    active: boolean;
    consumerCount: number;
    consumers: ResourceConsumer[];
    mode: 'off' | 'single' | 'continuous';
    lastFixTimestamp: number | null;
  };
  orientation: {
    active: boolean;
    consumerCount: number;
    consumers: ResourceConsumer[];
  };
  motion: {
    active: boolean;
    consumerCount: number;
    consumers: ResourceConsumer[];
  };
  bluetooth: {
    active: boolean;
    consumerCount: number;
    consumers: ResourceConsumer[];
    connectedDeviceName: string | null;
  };
  nfc: {
    active: boolean;
    consumerCount: number;
    consumers: ResourceConsumer[];
    scanning: boolean;
  };
  serial: {
    active: boolean;
    consumerCount: number;
    consumers: ResourceConsumer[];
    portName: string | null;
  };
  hid: {
    active: boolean;
    consumerCount: number;
    consumers: ResourceConsumer[];
    deviceName: string | null;
  };
  wakelock: {
    active: boolean;
    consumerCount: number;
    consumers: ResourceConsumer[];
  };
  isAppForeground: boolean;
  totalActiveResources: number;
  batteryTelemetry?: {
    level: number | null;
    charging: boolean | null;
  };
}

export type ResourceStateListener = (snapshot: HardwareResourceSnapshot) => void;

class HardwareResourceManager {
  private static instance: HardwareResourceManager;

  // Active consumer registries
  private cameraConsumers = new Map<string, ResourceConsumer>();
  private micConsumers = new Map<string, ResourceConsumer>();
  private locationConsumers = new Map<string, { consumer: ResourceConsumer; callback: (pos: GeolocationPosition) => void; errorCb?: (err: GeolocationPositionError) => void; options?: PositionOptions }>();
  private orientationConsumers = new Map<string, { consumer: ResourceConsumer; listener: (e: DeviceOrientationEvent) => void }>();
  private motionConsumers = new Map<string, { consumer: ResourceConsumer; listener: (e: DeviceMotionEvent) => void }>();
  private bluetoothConsumers = new Map<string, { consumer: ResourceConsumer; device?: any; server?: any; disconnectHandler?: () => void }>();
  private nfcConsumers = new Map<string, { consumer: ResourceConsumer; abort?: AbortController }>();
  private serialConsumers = new Map<string, { consumer: ResourceConsumer; port?: any; portName?: string }>();
  private hidConsumers = new Map<string, { consumer: ResourceConsumer; device?: any; deviceName?: string }>();
  private wakelockConsumers = new Map<string, ResourceConsumer>();

  // Underlying Hardware Handles
  private activeCameraStream: MediaStream | null = null;
  private activeMicStream: MediaStream | null = null;
  private activeLocationWatchId: number | null = null;
  private activeWakeLockSentinel: any = null;
  private activeBluetoothDevice: any = null;
  private activeBluetoothServer: any = null;

  // Internal Native Event Handlers
  private nativeOrientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  private nativeMotionHandler: ((e: DeviceMotionEvent) => void) | null = null;

  // Lifecycle & Audit State
  private isForeground = true;
  private auditLog: ResourceAuditEntry[] = [];
  private stateListeners = new Set<ResourceStateListener>();
  private lastLocationTimestamp: number | null = null;
  private batteryInfo: { level: number | null; charging: boolean | null } = { level: null, charging: null };

  private constructor() {
    if (typeof window !== 'undefined') {
      this.isForeground = !document.hidden;
      this.initLifecycleListeners();
      this.initBatteryTelemetry();
    }
  }

  public static getInstance(): HardwareResourceManager {
    if (!HardwareResourceManager.instance) {
      HardwareResourceManager.instance = new HardwareResourceManager();
    }
    return HardwareResourceManager.instance;
  }

  // --------------------------------------------------------------------------
  // Lifecycle & Background Handling
  // --------------------------------------------------------------------------
  private initLifecycleListeners() {
    const handleVisibility = () => {
      const hidden = document.hidden;
      this.isForeground = !hidden;

      if (hidden) {
        this.logAudit('camera', 'SUSPEND', 'system', 'App Backgrounded', 'Automatically pausing background camera/mic/sensors');
        this.suspendBackgroundResources();
      } else {
        this.logAudit('camera', 'RESUME', 'system', 'App Foregrounded', 'Resuming active foreground consumer sessions');
        this.resumeForegroundResources();
      }
      this.notifyStateChanged();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', () => {
      this.releaseAllHardwareResources('Page unloaded / navigated away');
    });
    window.addEventListener('beforeunload', () => {
      this.releaseAllHardwareResources('Window closing');
    });
  }

  private initBatteryTelemetry() {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        this.batteryInfo = {
          level: Math.round(battery.level * 100),
          charging: battery.charging
        };
        this.notifyStateChanged();

        battery.addEventListener('levelchange', () => {
          this.batteryInfo.level = Math.round(battery.level * 100);
          this.notifyStateChanged();
        });
        battery.addEventListener('chargingchange', () => {
          this.batteryInfo.charging = battery.charging;
          this.notifyStateChanged();
        });
      }).catch(() => {});
    }
  }

  private suspendBackgroundResources() {
    // 1. Suspend Camera Tracks
    if (this.activeCameraStream) {
      this.activeCameraStream.getVideoTracks().forEach(t => {
        t.enabled = false; // Disable hardware sensor while keeping stream reference
      });
    }

    // 2. Suspend Mic Tracks
    if (this.activeMicStream) {
      this.activeMicStream.getAudioTracks().forEach(t => {
        t.enabled = false;
      });
    }

    // 3. Remove hardware motion listeners during background
    if (this.nativeOrientationHandler) {
      window.removeEventListener('deviceorientation', this.nativeOrientationHandler, true);
    }
    if (this.nativeMotionHandler) {
      window.removeEventListener('devicemotion', this.nativeMotionHandler, true);
    }
  }

  private resumeForegroundResources() {
    // 1. Resume Camera Tracks if consumers still exist
    if (this.activeCameraStream && this.cameraConsumers.size > 0) {
      this.activeCameraStream.getVideoTracks().forEach(t => {
        t.enabled = true;
      });
    }

    // 2. Resume Mic Tracks
    if (this.activeMicStream && this.micConsumers.size > 0) {
      this.activeMicStream.getAudioTracks().forEach(t => {
        t.enabled = true;
      });
    }

    // 3. Re-attach motion listeners if consumers still exist
    if (this.orientationConsumers.size > 0 && this.nativeOrientationHandler) {
      window.addEventListener('deviceorientation', this.nativeOrientationHandler, true);
    }
    if (this.motionConsumers.size > 0 && this.nativeMotionHandler) {
      window.addEventListener('devicemotion', this.nativeMotionHandler, true);
    }
  }

  // --------------------------------------------------------------------------
  // Audit & Notification Helpers
  // --------------------------------------------------------------------------
  private logAudit(
    resourceType: HardwareResourceType,
    action: ResourceAuditEntry['action'],
    consumerId: string,
    featureName: string,
    details?: string
  ) {
    const entry: ResourceAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      resourceType,
      action,
      consumerId,
      featureName,
      details
    };
    this.auditLog.unshift(entry);
    if (this.auditLog.length > 200) this.auditLog.pop();
  }

  public getAuditLog(): ResourceAuditEntry[] {
    return [...this.auditLog];
  }

  public clearAuditLog() {
    this.auditLog = [];
    this.notifyStateChanged();
  }

  public subscribe(listener: ResourceStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getSnapshot());
    return () => this.stateListeners.delete(listener);
  }

  private notifyStateChanged() {
    const snap = this.getSnapshot();
    this.stateListeners.forEach(listener => {
      try {
        listener(snap);
      } catch (err) {
        console.error('Resource state listener error:', err);
      }
    });
  }

  public getSnapshot(): HardwareResourceSnapshot {
    const camList = Array.from(this.cameraConsumers.values());
    const micList = Array.from(this.micConsumers.values());
    const locList = Array.from(this.locationConsumers.values()).map(v => v.consumer);
    const oriList = Array.from(this.orientationConsumers.values()).map(v => v.consumer);
    const motList = Array.from(this.motionConsumers.values()).map(v => v.consumer);
    const bleList = Array.from(this.bluetoothConsumers.values()).map(v => v.consumer);
    const nfcList = Array.from(this.nfcConsumers.values()).map(v => v.consumer);
    const serialList = Array.from(this.serialConsumers.values()).map(v => v.consumer);
    const hidList = Array.from(this.hidConsumers.values()).map(v => v.consumer);
    const wakeList = Array.from(this.wakelockConsumers.values());

    const totalActive =
      (camList.length > 0 ? 1 : 0) +
      (micList.length > 0 ? 1 : 0) +
      (locList.length > 0 ? 1 : 0) +
      (oriList.length > 0 ? 1 : 0) +
      (motList.length > 0 ? 1 : 0) +
      (bleList.length > 0 ? 1 : 0) +
      (nfcList.length > 0 ? 1 : 0) +
      (serialList.length > 0 ? 1 : 0) +
      (hidList.length > 0 ? 1 : 0) +
      (wakeList.length > 0 ? 1 : 0);

    return {
      camera: {
        active: camList.length > 0 && !!this.activeCameraStream,
        consumerCount: camList.length,
        consumers: camList,
        stream: this.activeCameraStream
      },
      microphone: {
        active: micList.length > 0 && !!this.activeMicStream,
        consumerCount: micList.length,
        consumers: micList,
        stream: this.activeMicStream
      },
      geolocation: {
        active: locList.length > 0 && this.activeLocationWatchId !== null,
        consumerCount: locList.length,
        consumers: locList,
        mode: locList.length > 0 ? 'continuous' : 'off',
        lastFixTimestamp: this.lastLocationTimestamp
      },
      orientation: {
        active: oriList.length > 0,
        consumerCount: oriList.length,
        consumers: oriList
      },
      motion: {
        active: motList.length > 0,
        consumerCount: motList.length,
        consumers: motList
      },
      bluetooth: {
        active: bleList.length > 0 || !!this.activeBluetoothDevice,
        consumerCount: bleList.length,
        consumers: bleList,
        connectedDeviceName: this.activeBluetoothDevice?.name || null
      },
      nfc: {
        active: nfcList.length > 0,
        consumerCount: nfcList.length,
        consumers: nfcList,
        scanning: nfcList.length > 0
      },
      serial: {
        active: serialList.length > 0,
        consumerCount: serialList.length,
        consumers: serialList,
        portName: Array.from(this.serialConsumers.values())[0]?.portName ?? null
      },
      hid: {
        active: hidList.length > 0,
        consumerCount: hidList.length,
        consumers: hidList,
        deviceName: Array.from(this.hidConsumers.values())[0]?.deviceName ?? null
      },
      wakelock: {
        active: wakeList.length > 0 && !!this.activeWakeLockSentinel,
        consumerCount: wakeList.length,
        consumers: wakeList
      },
      isAppForeground: this.isForeground,
      totalActiveResources: totalActive,
      batteryTelemetry: this.batteryInfo
    };
  }

  // ==========================================================================
  // 1. CAMERA RESOURCE LIFECYCLE (On-Demand)
  // ==========================================================================
  public async acquireCameraStream(
    consumerId: string,
    featureName: string,
    constraints: MediaStreamConstraints = { video: { facingMode: 'environment' }, audio: false }
  ): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.logAudit('camera', 'ERROR', consumerId, featureName, 'Browser getUserMedia API not supported');
      throw new Error('Camera API is not supported on this platform.');
    }

    // Register consumer
    this.cameraConsumers.set(consumerId, {
      id: consumerId,
      featureName,
      resourceType: 'camera',
      acquiredAt: Date.now()
    });

    // Reuse existing stream if already active, or acquire fresh stream
    if (!this.activeCameraStream || this.activeCameraStream.getVideoTracks().every(t => t.readyState === 'ended')) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.activeCameraStream = stream;
        this.logAudit('camera', 'ACQUIRE', consumerId, featureName, `Camera started with ${stream.getVideoTracks().length} track(s)`);
      } catch (err: any) {
        this.cameraConsumers.delete(consumerId);
        this.logAudit('camera', 'DENIED', consumerId, featureName, err.message || 'Camera permission rejected');
        this.notifyStateChanged();
        throw err;
      }
    } else {
      this.logAudit('camera', 'ACQUIRE', consumerId, featureName, 'Attached to existing active camera stream');
    }

    this.notifyStateChanged();
    return this.activeCameraStream;
  }

  public releaseCameraStream(consumerId: string, reason = 'Feature completed / component unmounted') {
    if (!this.cameraConsumers.has(consumerId)) return;

    const consumer = this.cameraConsumers.get(consumerId)!;
    this.cameraConsumers.delete(consumerId);
    this.logAudit('camera', 'RELEASE', consumerId, consumer.featureName, reason);

    // If zero consumers remaining, immediately stop all camera hardware tracks
    if (this.cameraConsumers.size === 0 && this.activeCameraStream) {
      this.activeCameraStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      this.activeCameraStream = null;
      this.logAudit('camera', 'RELEASE', 'hardware', 'System', 'All camera tracks closed. Hardware light OFF.');
    }

    this.notifyStateChanged();
  }

  // ==========================================================================
  // 2. MICROPHONE RESOURCE LIFECYCLE (On-Demand)
  // ==========================================================================
  public async acquireMicrophoneStream(
    consumerId: string,
    featureName: string,
    constraints: MediaStreamConstraints = { audio: true, video: false }
  ): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.logAudit('microphone', 'ERROR', consumerId, featureName, 'Microphone API not supported');
      throw new Error('Microphone API is not supported on this platform.');
    }

    this.micConsumers.set(consumerId, {
      id: consumerId,
      featureName,
      resourceType: 'microphone',
      acquiredAt: Date.now()
    });

    if (!this.activeMicStream || this.activeMicStream.getAudioTracks().every(t => t.readyState === 'ended')) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.activeMicStream = stream;
        this.logAudit('microphone', 'ACQUIRE', consumerId, featureName, 'Microphone stream started');
      } catch (err: any) {
        this.micConsumers.delete(consumerId);
        this.logAudit('microphone', 'DENIED', consumerId, featureName, err.message || 'Microphone access denied');
        this.notifyStateChanged();
        throw err;
      }
    } else {
      this.logAudit('microphone', 'ACQUIRE', consumerId, featureName, 'Attached to existing microphone stream');
    }

    this.notifyStateChanged();
    return this.activeMicStream;
  }

  public releaseMicrophoneStream(consumerId: string, reason = 'Audio session ended') {
    if (!this.micConsumers.has(consumerId)) return;

    const consumer = this.micConsumers.get(consumerId)!;
    this.micConsumers.delete(consumerId);
    this.logAudit('microphone', 'RELEASE', consumerId, consumer.featureName, reason);

    if (this.micConsumers.size === 0 && this.activeMicStream) {
      this.activeMicStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      this.activeMicStream = null;
      this.logAudit('microphone', 'RELEASE', 'hardware', 'System', 'All audio tracks closed. Mic OFF.');
    }

    this.notifyStateChanged();
  }

  // ==========================================================================
  // 3. LOCATION / GNSS RESOURCE LIFECYCLE (On-Demand)
  // ==========================================================================
  public async requestOneTimeLocation(
    consumerId: string,
    featureName: string,
    options: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  ): Promise<GeolocationPosition> {
    if (!navigator.geolocation) {
      this.logAudit('geolocation', 'ERROR', consumerId, featureName, 'Geolocation API not supported');
      throw new Error('Geolocation is not supported by your browser.');
    }

    this.logAudit('geolocation', 'ACQUIRE', consumerId, featureName, 'One-time position requested');

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          this.lastLocationTimestamp = pos.timestamp;
          this.logAudit('geolocation', 'RELEASE', consumerId, featureName, `One-time fix obtained (Acc: ${pos.coords.accuracy?.toFixed(1)}m). GPS stopped.`);
          this.notifyStateChanged();
          resolve(pos);
        },
        err => {
          this.logAudit('geolocation', 'DENIED', consumerId, featureName, err.message);
          this.notifyStateChanged();
          reject(err);
        },
        options
      );
    });
  }

  public startLocationTracking(
    consumerId: string,
    featureName: string,
    callback: (pos: GeolocationPosition) => void,
    errorCb?: (err: GeolocationPositionError) => void,
    options: PositionOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
  ): () => void {
    if (!navigator.geolocation) {
      this.logAudit('geolocation', 'ERROR', consumerId, featureName, 'Geolocation API not supported');
      if (errorCb) {
        errorCb({
          code: 2,
          message: 'Geolocation not supported',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3
        } as GeolocationPositionError);
      }
      return () => {};
    }

    const consumer: ResourceConsumer = {
      id: consumerId,
      featureName,
      resourceType: 'geolocation',
      acquiredAt: Date.now()
    };

    this.locationConsumers.set(consumerId, { consumer, callback, errorCb, options });
    this.logAudit('geolocation', 'ACQUIRE', consumerId, featureName, 'Continuous GNSS survey tracking started');

    if (this.activeLocationWatchId === null) {
      this.activeLocationWatchId = navigator.geolocation.watchPosition(
        pos => {
          this.lastLocationTimestamp = pos.timestamp;
          // Dispatch fix to all active registered consumers
          this.locationConsumers.forEach(entry => {
            try {
              entry.callback(pos);
            } catch (cbErr) {
              console.error('Location consumer callback error:', cbErr);
            }
          });
          this.notifyStateChanged();
        },
        err => {
          this.locationConsumers.forEach(entry => {
            if (entry.errorCb) entry.errorCb(err);
          });
          this.notifyStateChanged();
        },
        options
      );
    }

    this.notifyStateChanged();
    return () => this.stopLocationTracking(consumerId);
  }

  public stopLocationTracking(consumerId: string, reason = 'Survey session paused/stopped') {
    if (!this.locationConsumers.has(consumerId)) return;

    const entry = this.locationConsumers.get(consumerId)!;
    this.locationConsumers.delete(consumerId);
    this.logAudit('geolocation', 'RELEASE', consumerId, entry.consumer.featureName, reason);

    // If no consumers left, immediately terminate the native browser watchPosition
    if (this.locationConsumers.size === 0 && this.activeLocationWatchId !== null) {
      try {
        navigator.geolocation.clearWatch(this.activeLocationWatchId);
      } catch {}
      this.activeLocationWatchId = null;
      this.logAudit('geolocation', 'RELEASE', 'hardware', 'System', 'All GPS watchers cleared. GNSS polling OFF.');
    }

    this.notifyStateChanged();
  }

  // ==========================================================================
  // 4. MOTION & IMU SENSORS (Orientation, Pitch/Roll, Pedometer)
  // ==========================================================================
  public registerOrientationListener(
    consumerId: string,
    featureName: string,
    listener: (e: DeviceOrientationEvent) => void
  ): () => void {
    const consumer: ResourceConsumer = {
      id: consumerId,
      featureName,
      resourceType: 'orientation',
      acquiredAt: Date.now()
    };

    this.orientationConsumers.set(consumerId, { consumer, listener });
    this.logAudit('orientation', 'ACQUIRE', consumerId, featureName, 'Orientation listener registered');

    // Attach native window listener ONLY if not already attached
    if (!this.nativeOrientationHandler && typeof window !== 'undefined') {
      this.nativeOrientationHandler = (e: DeviceOrientationEvent) => {
        if (!this.isForeground) return; // Skip in background
        this.orientationConsumers.forEach(entry => {
          try {
            entry.listener(e);
          } catch {}
        });
      };
      window.addEventListener('deviceorientation', this.nativeOrientationHandler, true);
    }

    this.notifyStateChanged();
    return () => this.unregisterOrientationListener(consumerId);
  }

  public unregisterOrientationListener(consumerId: string, reason = 'Feature unmounted') {
    if (!this.orientationConsumers.has(consumerId)) return;

    const entry = this.orientationConsumers.get(consumerId)!;
    this.orientationConsumers.delete(consumerId);
    this.logAudit('orientation', 'RELEASE', consumerId, entry.consumer.featureName, reason);

    // If zero consumers, remove window event listener immediately
    if (this.orientationConsumers.size === 0 && this.nativeOrientationHandler && typeof window !== 'undefined') {
      window.removeEventListener('deviceorientation', this.nativeOrientationHandler, true);
      this.nativeOrientationHandler = null;
      this.logAudit('orientation', 'RELEASE', 'hardware', 'System', 'Native orientation listener removed. IMU OFF.');
    }

    this.notifyStateChanged();
  }

  public registerMotionListener(
    consumerId: string,
    featureName: string,
    listener: (e: DeviceMotionEvent) => void
  ): () => void {
    const consumer: ResourceConsumer = {
      id: consumerId,
      featureName,
      resourceType: 'motion',
      acquiredAt: Date.now()
    };

    this.motionConsumers.set(consumerId, { consumer, listener });
    this.logAudit('motion', 'ACQUIRE', consumerId, featureName, 'Device motion/accelerometer listener registered');

    if (!this.nativeMotionHandler && typeof window !== 'undefined') {
      this.nativeMotionHandler = (e: DeviceMotionEvent) => {
        if (!this.isForeground) return;
        this.motionConsumers.forEach(entry => {
          try {
            entry.listener(e);
          } catch {}
        });
      };
      window.addEventListener('devicemotion', this.nativeMotionHandler, true);
    }

    this.notifyStateChanged();
    return () => this.unregisterMotionListener(consumerId);
  }

  public unregisterMotionListener(consumerId: string, reason = 'Pacing / motion stopped') {
    if (!this.motionConsumers.has(consumerId)) return;

    const entry = this.motionConsumers.get(consumerId)!;
    this.motionConsumers.delete(consumerId);
    this.logAudit('motion', 'RELEASE', consumerId, entry.consumer.featureName, reason);

    if (this.motionConsumers.size === 0 && this.nativeMotionHandler && typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this.nativeMotionHandler, true);
      this.nativeMotionHandler = null;
      this.logAudit('motion', 'RELEASE', 'hardware', 'System', 'Native motion listener removed. Accelerometer OFF.');
    }

    this.notifyStateChanged();
  }

  // ==========================================================================
  // 5. BLUETOOTH & BLE RESOURCE LIFECYCLE (On-Demand)
  // ==========================================================================
  public registerBluetoothConnection(
    consumerId: string,
    featureName: string,
    device: any,
    server: any,
    disconnectHandler?: () => void
  ) {
    const consumer: ResourceConsumer = {
      id: consumerId,
      featureName,
      resourceType: 'bluetooth',
      acquiredAt: Date.now()
    };

    this.activeBluetoothDevice = device;
    this.activeBluetoothServer = server;
    this.bluetoothConsumers.set(consumerId, { consumer, device, server, disconnectHandler });
    this.logAudit('bluetooth', 'ACQUIRE', consumerId, featureName, `Connected to BLE device: ${device?.name || 'Peripheral'}`);
    this.notifyStateChanged();
  }

  public releaseBluetoothConnection(consumerId: string, reason = 'Bluetooth session closed') {
    if (!this.bluetoothConsumers.has(consumerId)) return;

    const entry = this.bluetoothConsumers.get(consumerId)!;
    this.bluetoothConsumers.delete(consumerId);
    this.logAudit('bluetooth', 'RELEASE', consumerId, entry.consumer.featureName, reason);

    if (entry.disconnectHandler) {
      try {
        entry.disconnectHandler();
      } catch {}
    }

    if (this.bluetoothConsumers.size === 0) {
      if (this.activeBluetoothServer && this.activeBluetoothServer.connected) {
        try {
          this.activeBluetoothServer.disconnect();
        } catch {}
      }
      this.activeBluetoothDevice = null;
      this.activeBluetoothServer = null;
      this.logAudit('bluetooth', 'RELEASE', 'hardware', 'System', 'Bluetooth GATT connection released.');
    }

    this.notifyStateChanged();
  }

  // ==========================================================================
  // 6. SCREEN WAKELOCK RESOURCE LIFECYCLE
  // ==========================================================================
  public async acquireWakeLock(consumerId: string, featureName: string): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }

    this.wakelockConsumers.set(consumerId, {
      id: consumerId,
      featureName,
      resourceType: 'wakelock',
      acquiredAt: Date.now()
    });

    if (!this.activeWakeLockSentinel) {
      try {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        this.activeWakeLockSentinel = sentinel;
        sentinel.addEventListener('release', () => {
          this.activeWakeLockSentinel = null;
          this.wakelockConsumers.clear();
          this.notifyStateChanged();
        });
        this.logAudit('wakelock', 'ACQUIRE', consumerId, featureName, 'Screen WakeLock active');
      } catch (err: any) {
        this.wakelockConsumers.delete(consumerId);
        this.logAudit('wakelock', 'DENIED', consumerId, featureName, err.message);
        this.notifyStateChanged();
        return false;
      }
    }

    this.notifyStateChanged();
    return true;
  }

  public releaseWakeLock(consumerId: string, reason = 'WakeLock released') {
    if (!this.wakelockConsumers.has(consumerId)) return;

    const consumer = this.wakelockConsumers.get(consumerId)!;
    this.wakelockConsumers.delete(consumerId);
    this.logAudit('wakelock', 'RELEASE', consumerId, consumer.featureName, reason);

    if (this.wakelockConsumers.size === 0 && this.activeWakeLockSentinel) {
      try {
        this.activeWakeLockSentinel.release();
      } catch {}
      this.activeWakeLockSentinel = null;
      this.logAudit('wakelock', 'RELEASE', 'hardware', 'System', 'Screen WakeLock sentinel released.');
    }

    this.notifyStateChanged();
  }

  // ==========================================================================
  // 7. EMERGENCY PRIVACY & BATTERY KILL-SWITCH
  // ==========================================================================
  // ==========================================================================
  // NFC / Serial / HID
  // --------------------------------------------------------------------------
  // These three were reaching the device APIs directly from their views, so
  // an NFC scan, an open serial port or a claimed HID device appeared nowhere
  // in the audit log and survived the master kill switch. They are registered
  // here for the same reason every other resource is: the privacy monitor must
  // be able to tell the user everything that is currently live, and the kill
  // switch must actually stop all of it.
  // ==========================================================================

  /**
   * Begins an NFC scan under management. Returns an AbortController the caller
   * passes to `NDEFReader.scan()`; releasing the consumer aborts the scan.
   */
  public acquireNfcScan(consumerId: string, featureName: string): AbortController {
    const existing = this.nfcConsumers.get(consumerId);
    if (existing?.abort) return existing.abort;

    const abort = new AbortController();
    const consumer: ResourceConsumer = {
      id: consumerId,
      featureName,
      resourceType: 'nfc',
      acquiredAt: Date.now()
    };
    this.nfcConsumers.set(consumerId, { consumer, abort });
    this.logAudit('nfc', 'ACQUIRE', consumerId, featureName, 'NFC scan started.');
    this.notifyStateChanged();
    return abort;
  }

  public releaseNfcScan(consumerId: string, reason = 'NFC scan stopped') {
    const entry = this.nfcConsumers.get(consumerId);
    if (!entry) return;
    this.nfcConsumers.delete(consumerId);
    try {
      entry.abort?.abort();
    } catch {}
    this.logAudit('nfc', 'RELEASE', consumerId, entry.consumer.featureName, reason);
    this.notifyStateChanged();
  }

  public registerSerialPort(consumerId: string, featureName: string, port: any, portName?: string) {
    const consumer: ResourceConsumer = {
      id: consumerId,
      featureName,
      resourceType: 'serial',
      acquiredAt: Date.now()
    };
    this.serialConsumers.set(consumerId, { consumer, port, portName: portName || 'Serial port' });
    this.logAudit('serial', 'ACQUIRE', consumerId, featureName, `Serial port opened${portName ? `: ${portName}` : ''}.`);
    this.notifyStateChanged();
  }

  public releaseSerialPort(consumerId: string, reason = 'Serial session closed') {
    const entry = this.serialConsumers.get(consumerId);
    if (!entry) return;
    this.serialConsumers.delete(consumerId);
    if (entry.port) {
      try {
        const closing = entry.port.close?.();
        if (closing && typeof closing.catch === 'function') closing.catch(() => {});
      } catch {}
    }
    this.logAudit('serial', 'RELEASE', consumerId, entry.consumer.featureName, reason);
    this.notifyStateChanged();
  }

  public registerHidDevice(consumerId: string, featureName: string, device: any, deviceName?: string) {
    const consumer: ResourceConsumer = {
      id: consumerId,
      featureName,
      resourceType: 'hid',
      acquiredAt: Date.now()
    };
    this.hidConsumers.set(consumerId, { consumer, device, deviceName: deviceName || 'HID device' });
    this.logAudit('hid', 'ACQUIRE', consumerId, featureName, `HID device claimed${deviceName ? `: ${deviceName}` : ''}.`);
    this.notifyStateChanged();
  }

  public releaseHidDevice(consumerId: string, reason = 'HID session closed') {
    const entry = this.hidConsumers.get(consumerId);
    if (!entry) return;
    this.hidConsumers.delete(consumerId);
    if (entry.device) {
      try {
        const closing = entry.device.close?.();
        if (closing && typeof closing.catch === 'function') closing.catch(() => {});
      } catch {}
    }
    this.logAudit('hid', 'RELEASE', consumerId, entry.consumer.featureName, reason);
    this.notifyStateChanged();
  }

  public releaseAllHardwareResources(reason = 'Emergency Master Kill Switch / User Request') {
    this.logAudit('camera', 'KILL_ALL', 'user', 'Emergency Kill Switch', reason);

    // 1. Camera
    if (this.activeCameraStream) {
      this.activeCameraStream.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      this.activeCameraStream = null;
    }
    this.cameraConsumers.clear();

    // 2. Microphone
    if (this.activeMicStream) {
      this.activeMicStream.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      this.activeMicStream = null;
    }
    this.micConsumers.clear();

    // 3. Geolocation
    if (this.activeLocationWatchId !== null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(this.activeLocationWatchId); } catch {}
      this.activeLocationWatchId = null;
    }
    this.locationConsumers.clear();

    // 4. Orientation & Motion
    if (this.nativeOrientationHandler && typeof window !== 'undefined') {
      window.removeEventListener('deviceorientation', this.nativeOrientationHandler, true);
      this.nativeOrientationHandler = null;
    }
    this.orientationConsumers.clear();

    if (this.nativeMotionHandler && typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this.nativeMotionHandler, true);
      this.nativeMotionHandler = null;
    }
    this.motionConsumers.clear();

    // 5. Bluetooth
    this.bluetoothConsumers.forEach(entry => {
      if (entry.disconnectHandler) {
        try { entry.disconnectHandler(); } catch {}
      }
    });
    if (this.activeBluetoothServer && this.activeBluetoothServer.connected) {
      try { this.activeBluetoothServer.disconnect(); } catch {}
    }
    this.activeBluetoothDevice = null;
    this.activeBluetoothServer = null;
    this.bluetoothConsumers.clear();

    // 6. WakeLock
    if (this.activeWakeLockSentinel) {
      try { this.activeWakeLockSentinel.release(); } catch {}
      this.activeWakeLockSentinel = null;
    }
    this.wakelockConsumers.clear();

    // 7. NFC, Serial & HID
    Array.from(this.nfcConsumers.values()).forEach(e => {
      try { e.abort?.abort(); } catch {}
    });
    this.nfcConsumers.clear();

    Array.from(this.serialConsumers.values()).forEach(e => {
      try {
        const closing = e.port?.close?.();
        if (closing && typeof closing.catch === 'function') closing.catch(() => {});
      } catch {}
    });
    this.serialConsumers.clear();

    Array.from(this.hidConsumers.values()).forEach(e => {
      try {
        const closing = e.device?.close?.();
        if (closing && typeof closing.catch === 'function') closing.catch(() => {});
      } catch {}
    });
    this.hidConsumers.clear();

    this.notifyStateChanged();
  }
}

export const sensorManager = HardwareResourceManager.getInstance();
