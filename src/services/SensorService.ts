// ============================================================================
// BhuNex Studio — Hardware & Field Sensor Service
// ============================================================================

import { CanonicalSensorStatus, CanonicalGPSObservation } from '../types/canonical';

export class SensorService {
  /**
   * Reads real-time hardware status across GNSS, Orientation, and Camera
   */
  static getHardwareCapability(): {
    hasGeolocation: boolean;
    hasOrientation: boolean;
    hasCamera: boolean;
  } {
    const hasGeolocation = typeof navigator !== 'undefined' && 'geolocation' in navigator;
    const hasOrientation = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    const hasCamera = typeof navigator !== 'undefined' && 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;

    return {
      hasGeolocation,
      hasOrientation,
      hasCamera
    };
  }

  /**
   * Synthesizes a high-precision GPS observation record
   */
  static createGPSObservation(position: GeolocationPosition): CanonicalGPSObservation {
    return {
      id: `gps_obs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      coordinate: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        elevation: position.coords.altitude || 0
      },
      speedKmh: position.coords.speed !== null ? position.coords.speed * 3.6 : undefined,
      headingDeg: position.coords.heading !== null ? position.coords.heading : undefined,
      hdop: position.coords.accuracy ? position.coords.accuracy / 5 : 1.0,
      fixType: position.coords.accuracy < 3 ? 'rtk-fixed' : (position.coords.accuracy < 10 ? 'dgps' : '3d'),
      timestamp: position.timestamp
    };
  }
}
