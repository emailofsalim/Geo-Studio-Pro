import { useState, useEffect, useCallback, useRef } from 'react';
import {
  sensorManager,
  HardwareResourceSnapshot,
  HardwareResourceType,
  ResourceAuditEntry
} from '../lib/sensorResourceManager';

export function useHardwareResource() {
  const [snapshot, setSnapshot] = useState<HardwareResourceSnapshot>(() => sensorManager.getSnapshot());
  const [auditLog, setAuditLog] = useState<ResourceAuditEntry[]>(() => sensorManager.getAuditLog());

  useEffect(() => {
    const unsubscribe = sensorManager.subscribe(newSnapshot => {
      setSnapshot(newSnapshot);
      setAuditLog(sensorManager.getAuditLog());
    });
    return unsubscribe;
  }, []);

  const releaseAll = useCallback((reason?: string) => {
    sensorManager.releaseAllHardwareResources(reason);
  }, []);

  const clearAuditLog = useCallback(() => {
    sensorManager.clearAuditLog();
    setAuditLog([]);
  }, []);

  return {
    ...snapshot,
    activeResourcesCount: snapshot.totalActiveResources,
    activeResources: snapshot,
    killAllSensors: releaseAll,
    auditLog,
    releaseAll,
    clearAuditLog,
    manager: sensorManager
  };
}

/**
 * Hook for a specific component to acquire and bind an on-demand hardware resource
 * with guaranteed unmount cleanup.
 */
export function useManagedResource(consumerId: string, featureName: string) {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Guaranteed cleanup on unmount for this consumer token across all subsystems
      sensorManager.releaseCameraStream(consumerId, 'Component unmounted');
      sensorManager.releaseMicrophoneStream(consumerId, 'Component unmounted');
      sensorManager.stopLocationTracking(consumerId, 'Component unmounted');
      sensorManager.unregisterOrientationListener(consumerId, 'Component unmounted');
      sensorManager.unregisterMotionListener(consumerId, 'Component unmounted');
      sensorManager.releaseBluetoothConnection(consumerId, 'Component unmounted');
      sensorManager.releaseWakeLock(consumerId, 'Component unmounted');
    };
  }, [consumerId]);

  const acquireCamera = useCallback(
    async (constraints?: MediaStreamConstraints, _tag?: string) => {
      return sensorManager.acquireCameraStream(consumerId, featureName, constraints);
    },
    [consumerId, featureName]
  );

  const releaseCamera = useCallback(
    (reason?: string) => {
      sensorManager.releaseCameraStream(consumerId, reason);
    },
    [consumerId]
  );

  const acquireMicrophone = useCallback(
    async (constraints?: MediaStreamConstraints, _tag?: string) => {
      return sensorManager.acquireMicrophoneStream(consumerId, featureName, constraints);
    },
    [consumerId, featureName]
  );

  const releaseMicrophone = useCallback(
    (reason?: string) => {
      sensorManager.releaseMicrophoneStream(consumerId, reason);
    },
    [consumerId]
  );

  const requestOneTimeLocation = useCallback(
    async (options?: PositionOptions) => {
      return sensorManager.requestOneTimeLocation(consumerId, featureName, options);
    },
    [consumerId, featureName]
  );

  const getSingleLocationFix = useCallback(
    async (options?: PositionOptions) => {
      return sensorManager.requestOneTimeLocation(consumerId, featureName, options);
    },
    [consumerId, featureName]
  );

  const startLocationTracking = useCallback(
    (callback: (pos: GeolocationPosition) => void, errorCb?: (err: GeolocationPositionError) => void, options?: PositionOptions) => {
      return sensorManager.startLocationTracking(consumerId, featureName, callback, errorCb, options);
    },
    [consumerId, featureName]
  );

  const stopLocationTracking = useCallback(
    (reason?: string) => {
      sensorManager.stopLocationTracking(consumerId, reason);
    },
    [consumerId]
  );

  const registerOrientation = useCallback(
    (listener: (e: DeviceOrientationEvent) => void) => {
      return sensorManager.registerOrientationListener(consumerId, featureName, listener);
    },
    [consumerId, featureName]
  );

  const unregisterOrientation = useCallback(
    (reason?: string) => {
      sensorManager.unregisterOrientationListener(consumerId, reason);
    },
    [consumerId]
  );

  const registerMotion = useCallback(
    (listener: (e: DeviceMotionEvent) => void) => {
      return sensorManager.registerMotionListener(consumerId, featureName, listener);
    },
    [consumerId, featureName]
  );

  const unregisterMotion = useCallback(
    (reason?: string) => {
      sensorManager.unregisterMotionListener(consumerId, reason);
    },
    [consumerId]
  );

  const acquireWakeLock = useCallback(async (_tag?: string) => {
    return sensorManager.acquireWakeLock(consumerId, featureName);
  }, [consumerId, featureName]);

  const releaseWakeLock = useCallback(
    (reason?: string) => {
      sensorManager.releaseWakeLock(consumerId, reason);
    },
    [consumerId]
  );

  return {
    acquireCamera,
    releaseCamera,
    acquireMicrophone,
    releaseMicrophone,
    requestOneTimeLocation,
    getSingleLocationFix,
    startLocationTracking,
    stopLocationTracking,
    registerOrientation,
    unregisterOrientation,
    registerMotion,
    unregisterMotion,
    acquireWakeLock,
    releaseWakeLock
  };
}
