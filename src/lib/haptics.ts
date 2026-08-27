// Vibration API & Mobile Physical Haptic Feedback Engine
// Tailored for Field Surveyors, GNSS RTK Rover, and Geofence Sentinels

export const HAPTIC_PATTERNS = {
  // Physical confirmation when a survey fix or waypoint is stored
  WAYPOINT_ADDED: [50, 35, 75],
  // Quick tactile response on digitizing a vertex or point on map/canvas
  VERTEX_ADDED: [30],
  // Light touch tap on instrument buttons
  BUTTON_CLICK: [18],
  // Proximity approaching a survey beacon or baseline target
  PROXIMITY_CAUTION: [80, 40, 80],
  // Critical proximity alert / within close radius of hazard or stake
  PROXIMITY_ALARM: [160, 50, 160, 50, 220],
  // Geofence buffer warning (approaching boundary)
  GEOFENCE_WARNING: [120, 60, 120],
  // Geofence critical breach (Keep-Out intrusion / Keep-In boundary exit)
  GEOFENCE_CRITICAL_BREACH: [250, 75, 250, 75, 380],
  // Target acquired or stakeout distance within tolerance (< 0.05m)
  TARGET_LOCKED: [60, 30, 120]
} as const;

export type HapticPatternKey = keyof typeof HAPTIC_PATTERNS;

export function isVibrationSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function';
}

/**
 * Triggers a vibration pattern safely on supported mobile devices.
 * Returns true if vibration API was called successfully.
 */
export function triggerHaptic(pattern: number | number[] | readonly number[]): boolean {
  if (!isVibrationSupported()) return false;
  try {
    const pat = Array.isArray(pattern) ? [...pattern] : pattern;
    return navigator.vibrate(pat as any);
  } catch (err) {
    // Some mobile browsers restrict vibration if not triggered by a user gesture
    console.debug('Haptic feedback error:', err);
    return false;
  }
}

/**
 * Cancels any active vibration pulse immediately.
 */
export function cancelHaptic(): void {
  if (isVibrationSupported()) {
    try {
      navigator.vibrate(0);
    } catch {}
  }
}

// Dedicated trigger helpers
export function triggerWaypointAddedHaptic(): boolean {
  return triggerHaptic(HAPTIC_PATTERNS.WAYPOINT_ADDED);
}

export function triggerVertexAddedHaptic(): boolean {
  return triggerHaptic(HAPTIC_PATTERNS.VERTEX_ADDED);
}

export function triggerFieldTapHaptic(): boolean {
  return triggerHaptic(HAPTIC_PATTERNS.BUTTON_CLICK);
}

export function triggerProximityAlertHaptic(severity: 'info' | 'warning' | 'critical' = 'warning'): boolean {
  if (severity === 'critical') {
    return triggerHaptic(HAPTIC_PATTERNS.PROXIMITY_ALARM);
  } else if (severity === 'warning') {
    return triggerHaptic(HAPTIC_PATTERNS.PROXIMITY_CAUTION);
  }
  return triggerHaptic(HAPTIC_PATTERNS.BUTTON_CLICK);
}

export function triggerGeofenceBreachHaptic(severity: 'low' | 'medium' | 'high' | 'critical' | 'info' | string = 'high'): boolean {
  if (severity === 'critical' || severity === 'high') {
    return triggerHaptic(HAPTIC_PATTERNS.GEOFENCE_CRITICAL_BREACH);
  } else if (severity === 'medium') {
    return triggerHaptic(HAPTIC_PATTERNS.GEOFENCE_WARNING);
  } else if (severity === 'low') {
    return triggerHaptic(HAPTIC_PATTERNS.PROXIMITY_CAUTION);
  }
  return triggerHaptic(HAPTIC_PATTERNS.BUTTON_CLICK);
}

export function triggerHapticFeedback(type: 'SUCCESS' | 'ERROR' | 'WARNING' | 'LIGHT' | 'MEDIUM' | 'HEAVY'): boolean {
  switch (type) {
    case 'SUCCESS':
      return triggerHaptic([30, 40, 60]);
    case 'ERROR':
      return triggerHaptic([80, 50, 80, 50, 100]);
    case 'WARNING':
      return triggerHaptic([60, 40, 60]);
    case 'LIGHT':
      return triggerHaptic([15]);
    case 'MEDIUM':
      return triggerHaptic([35]);
    case 'HEAVY':
      return triggerHaptic([70]);
    default:
      return triggerHaptic([20]);
  }
}
