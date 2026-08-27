import { useState, useEffect, useCallback } from 'react';
import {
  isVibrationSupported,
  triggerHaptic,
  triggerWaypointAddedHaptic,
  triggerVertexAddedHaptic,
  triggerFieldTapHaptic,
  triggerProximityAlertHaptic,
  triggerGeofenceBreachHaptic,
  HAPTIC_PATTERNS
} from '../lib/haptics';

export interface UseSurveyHapticsOptions {
  storageKey?: string;
  defaultEnabled?: boolean;
}

export function useSurveyHaptics(options: UseSurveyHapticsOptions = {}) {
  const { storageKey = 'geostudio_haptics_enabled', defaultEnabled = true } = options;

  const [supported, setSupported] = useState<boolean>(false);
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved !== null ? saved === 'true' : defaultEnabled;
    } catch {
      return defaultEnabled;
    }
  });

  useEffect(() => {
    setSupported(isVibrationSupported());
  }, []);

  const toggleHaptics = useCallback((val?: boolean) => {
    setEnabled(prev => {
      const next = val !== undefined ? val : !prev;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {}
      if (next) {
        triggerHaptic(HAPTIC_PATTERNS.BUTTON_CLICK);
      }
      return next;
    });
  }, [storageKey]);

  const onWaypointAdded = useCallback(() => {
    if (!enabled) return false;
    return triggerWaypointAddedHaptic();
  }, [enabled]);

  const onVertexAdded = useCallback(() => {
    if (!enabled) return false;
    return triggerVertexAddedHaptic();
  }, [enabled]);

  const onFieldTap = useCallback(() => {
    if (!enabled) return false;
    return triggerFieldTapHaptic();
  }, [enabled]);

  const onProximityAlert = useCallback((severity: 'info' | 'warning' | 'critical' = 'warning') => {
    if (!enabled) return false;
    return triggerProximityAlertHaptic(severity);
  }, [enabled]);

  const onGeofenceBreach = useCallback((severity: 'low' | 'medium' | 'high' | 'critical' = 'high') => {
    if (!enabled) return false;
    return triggerGeofenceBreachHaptic(severity);
  }, [enabled]);

  const testVibration = useCallback(() => {
    triggerWaypointAddedHaptic();
  }, []);

  return {
    supported,
    enabled,
    setEnabled: toggleHaptics,
    toggleHaptics,
    onWaypointAdded,
    onVertexAdded,
    onFieldTap,
    onProximityAlert,
    onGeofenceBreach,
    testVibration
  };
}
