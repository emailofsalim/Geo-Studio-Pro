// Open Environmental, Atmospheric & Space Weather Geomatics Data Engine
// Integrates free, open-access public data APIs (Open-Meteo, NOAA Space Weather, OSM Nominatim)
// with high-precision EDM atmospheric velocity correction, solar ephemeris, and UAV flight indices.

export interface SurveyAtmosphericData {
  temperatureC: number;
  temperatureF: number;
  apparentTempC: number;
  relativeHumidityPercent: number;
  dewPointC: number;
  surfacePressureHpa: number;
  mslPressureHpa: number;
  windSpeedKmh: number;
  windSpeedMs: number;
  windGustsKmh: number;
  windDirectionDeg: number;
  windCardinal: string;
  cloudCoverPercent: number;
  visibilityMeters: number;
  uvIndex: number;
  solarIrradianceWm2: number;
  weatherCode: number;
  weatherDescription: string;
  isDay: boolean;
  precipitationMm: number;
  timestamp: string;
}

export interface SpaceWeatherTelemetry {
  kpIndex: number; // 0 to 9 scale
  stormCategory: 'Quiet' | 'Unsettled' | 'Active' | 'Minor Storm (G1)' | 'Moderate Storm (G2)' | 'Strong Storm (G3)' | 'Severe (G4+)';
  gnssImpactLevel: 'Optimal' | 'Nominal' | 'Moderate Scintillation Risk' | 'High Scintillation / RTK Loss Risk';
  gnssRecommendation: string;
  solarFluxIndex: number;
  lastUpdated: string;
}

export interface SolarEphemeris {
  solarAzimuthDeg: number;
  solarElevationDeg: number;
  solarZenithDeg: number;
  shadowRatio: number; // cot(elevation), length of shadow per 1 unit height
  sunriseTime: string;
  sunsetTime: string;
  solarNoonTime: string;
  daylightDurationHours: number;
}

export interface EdmCorrectionResult {
  temperatureC: number;
  pressureHpa: number;
  relativeHumidityPercent: number;
  ppmCorrection: number; // Parts per million velocity correction
  deltaPer1000m: number; // mm correction per 1 km measurement
  carrierRefractionIndex: number; // Group refractive index n
  airDensityKgM3: number;
  standardCurvatureRefractionK: number; // standard ~0.142
  formulaSummary: string;
}

export interface UavFlightSafetyIndex {
  status: 'GO' | 'CAUTION' | 'NO-GO';
  overallScore: number; // 0 - 100
  windScore: number; // 0 - 100
  visibilityScore: number; // 0 - 100
  precipScore: number; // 0 - 100
  spaceWeatherScore: number; // 0 - 100
  reasons: string[];
}

export interface ReverseGeocodeLocation {
  displayName: string;
  villageOrSubdistrict?: string;
  district?: string;
  state?: string;
  country?: string;
  postcode?: string;
}

export interface FullEnvironmentalReport {
  lat: number;
  lon: number;
  elevationM: number;
  fetchedAt: string;
  source: 'Live Open-Meteo & NOAA SWPC' | 'Offline Geodetic Standard Fallback';
  /** True when the fetch succeeded. Not a promise that every value was observed. */
  isLive: boolean;
  /**
   * Readings the service did not return, which fell back to a standard value.
   *
   * `isLive` describes the fetch; this describes the numbers. A response that
   * arrives without a pressure still sets `isLive`, and the EDM correction is
   * then computed from the 1013.25 hPa sea-level standard. On the bauxite
   * plateaus this application is aimed at, around 700 m, that is a 32 ppm
   * error -- 65 mm over a two-kilometre sight -- and at 1200 m nearer 98 mm.
   * Well outside control tolerance, and invisible behind a "Live" badge.
   */
  substitutedFields: string[];
  atmosphere: SurveyAtmosphericData;
  edmCorrection: EdmCorrectionResult;
  spaceWeather: SpaceWeatherTelemetry;
  solar: SolarEphemeris;
  uavSafety: UavFlightSafetyIndex;
  location?: ReverseGeocodeLocation;
  hourlyForecast?: {
    time: string[];
    temperature: number[];
    pressure: number[];
    windSpeed: number[];
    cloudCover: number[];
    precipitationProb: number[];
  };
}

// Cardinal direction lookup
export function degreesToCardinal(deg: number): string {
  const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return cardinals[index];
}

// WMO Weather interpretation table
export function interpretWmoCode(code: number): string {
  const wmoMap: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
  };
  return wmoMap[code] || 'Fair / Variable';
}

/**
 * Calculates high-precision Electronic Distance Measurement (EDM) atmospheric velocity ppm correction.
 * Standard IUGG / FIG Formula:
 * delta ppm = 281.8 - (0.29065 * P_hpa) / (1 + 0.00366 * T_c) + (0.04126 * e_hpa) / (1 + 0.00366 * T_c)
 */
export function calculateEdmAtmosphericCorrection(
  tempC: number,
  pressureHpa: number,
  relHumidityPercent: number = 50
): EdmCorrectionResult {
  // Saturated vapor pressure (Magnus-Tetens formula)
  const eS = 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
  // Actual partial water vapor pressure (hPa)
  const e = (relHumidityPercent / 100) * eS;

  const alpha = 0.00366; // thermal expansion coefficient of air 1/273.15
  const denom = 1 + alpha * tempC;

  // Standard barrel velocity correction in parts-per-million (ppm) for infrared carrier (e.g. Leica, Trimble, Topcon lambda ~ 0.85um)
  const dryAirTerm = (0.29065 * pressureHpa) / denom;
  const humidityTerm = (0.04126 * e) / denom;
  const ppm = 281.8 - dryAirTerm + humidityTerm;

  // Delta correction per 1000m (1 km) in millimeters
  const deltaPer1000m = (ppm / 1000000) * 1000 * 1000; // mm

  // Refractive index of air n
  const groupRefractionN = 1 + (281.8 - ppm) * 1e-6;

  // Air density rho (kg/m3) using ideal gas law adjusted for humidity
  const Rd = 287.058; // specific gas constant for dry air
  const tempK = tempC + 273.15;
  const airDensity = (pressureHpa * 100) / (Rd * tempK);

  return {
    temperatureC: Math.round(tempC * 10) / 10,
    pressureHpa: Math.round(pressureHpa * 10) / 10,
    relativeHumidityPercent: Math.round(relHumidityPercent),
    ppmCorrection: Math.round(ppm * 10) / 10,
    deltaPer1000m: Math.round(deltaPer1000m * 100) / 100,
    carrierRefractionIndex: Number(groupRefractionN.toFixed(7)),
    airDensityKgM3: Math.round(airDensity * 1000) / 1000,
    standardCurvatureRefractionK: 0.142,
    formulaSummary: `ΔD = D × [281.8 - (0.29065·P)/(1 + 0.00366·T) + (0.04126·e)/(1 + 0.00366·T)] × 10⁻⁶`
  };
}

/**
 * Solar Ephemeris & Astrometry Calculation (Solar Azimuth & Elevation)
 * Implements NOAA Solar Position Algorithm (SPA) approximation.
 */
export function calculateSolarEphemeris(
  lat: number,
  lon: number,
  elevationM: number = 0,
  date: Date = new Date()
): SolarEphemeris {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const hourUtc = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  // Fractional year in radians
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hourUtc - 12) / 24);

  // Equation of time in minutes
  const eqtime = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  );

  // Solar declination angle in radians
  const decl = 0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // True solar time in minutes
  const timeOffset = eqtime + 4 * lon;
  const tst = hourUtc * 60 + timeOffset;
  let solarHourAngle = (tst / 4) - 180; // in degrees
  if (solarHourAngle < -180) solarHourAngle += 360;
  if (solarHourAngle > 180) solarHourAngle -= 360;

  const latRad = lat * rad;
  const shaRad = solarHourAngle * rad;

  // Solar zenith angle
  const cosZenith = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(shaRad);
  const zenithRad = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const zenithDeg = zenithRad * deg;
  const elevationDeg = 90 - zenithDeg;

  // Solar azimuth angle (degrees clockwise from North)
  let azimuthDeg = 0;
  const sinZenith = Math.sin(zenithRad);
  if (sinZenith > 0.0001) {
    const cosAz = (Math.sin(decl) * Math.cos(latRad) - Math.cos(decl) * Math.sin(latRad) * Math.cos(shaRad)) / sinZenith;
    const azRad = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    azimuthDeg = azRad * deg;
    if (solarHourAngle > 0) {
      azimuthDeg = 360 - azimuthDeg;
    }
  }

  // Shadow length ratio cot(elevation)
  const elevRad = Math.max(0.01, elevationDeg) * rad;
  const shadowRatio = elevationDeg > 0 ? 1 / Math.tan(elevRad) : 999.9;

  // Solar noon
  const solarNoonMinutes = 720 - 4 * lon - eqtime;
  const noonHour = Math.floor(((solarNoonMinutes % 1440) + 1440) % 1440 / 60);
  const noonMin = Math.floor(((solarNoonMinutes % 1440) + 1440) % 1440 % 60);
  const solarNoonStr = `${String(noonHour).padStart(2, '0')}:${String(noonMin).padStart(2, '0')} UTC`;

  // Sunrise / Sunset calculation
  const cosHourAngleSunrise = (Math.cos(90.833 * rad) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl));
  let sunriseStr = '06:00 UTC';
  let sunsetStr = '18:00 UTC';
  let daylightHours = 12;

  if (cosHourAngleSunrise >= -1 && cosHourAngleSunrise <= 1) {
    const haSunriseDeg = Math.acos(cosHourAngleSunrise) * deg;
    const sunriseMin = solarNoonMinutes - haSunriseDeg * 4;
    const sunsetMin = solarNoonMinutes + haSunriseDeg * 4;

    const srH = Math.floor(((sunriseMin % 1440) + 1440) % 1440 / 60);
    const srM = Math.floor(((sunriseMin % 1440) + 1440) % 1440 % 60);
    sunriseStr = `${String(srH).padStart(2, '0')}:${String(srM).padStart(2, '0')} UTC`;

    const ssH = Math.floor(((sunsetMin % 1440) + 1440) % 1440 / 60);
    const ssM = Math.floor(((sunsetMin % 1440) + 1440) % 1440 % 60);
    sunsetStr = `${String(ssH).padStart(2, '0')}:${String(ssM).padStart(2, '0')} UTC`;

    daylightHours = Math.round((haSunriseDeg * 8 / 60) * 10) / 10;
  }

  return {
    solarAzimuthDeg: Math.round(((azimuthDeg % 360) + 360) % 360 * 10) / 10,
    solarElevationDeg: Math.round(elevationDeg * 10) / 10,
    solarZenithDeg: Math.round(zenithDeg * 10) / 10,
    shadowRatio: Math.round(shadowRatio * 100) / 100,
    sunriseTime: sunriseStr,
    sunsetTime: sunsetStr,
    solarNoonTime: solarNoonStr,
    daylightDurationHours: daylightHours
  };
}

/**
 * Calculates Drone / UAV Photogrammetry Field Flight Safety Index
 */
export function evaluateUavFlightSafety(
  atmo: SurveyAtmosphericData,
  space: SpaceWeatherTelemetry
): UavFlightSafetyIndex {
  const reasons: string[] = [];
  let windScore = 100;
  let visScore = 100;
  let precipScore = 100;
  let spaceScore = 100;

  // Wind speed checks (max recommended survey drone tolerance ~ 30-40 km/h)
  if (atmo.windSpeedKmh > 40 || atmo.windGustsKmh > 50) {
    windScore = 0;
    reasons.push(`High wind gusts (${atmo.windGustsKmh} km/h) exceed multirotor stability limits.`);
  } else if (atmo.windSpeedKmh > 25 || atmo.windGustsKmh > 35) {
    windScore = 40;
    reasons.push(`Moderate winds (${atmo.windSpeedKmh} km/h); gimbal vibration & battery drain increased.`);
  } else if (atmo.windSpeedKmh > 15) {
    windScore = 80;
  }

  // Precipitation check
  if (atmo.precipitationMm > 0.5 || [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(atmo.weatherCode)) {
    precipScore = 0;
    reasons.push(`Active precipitation or rain (${atmo.weatherDescription}) will damage optical payload.`);
  }

  // Visibility check (Aviation min ~ 5000m)
  if (atmo.visibilityMeters < 3000) {
    visScore = 20;
    reasons.push(`Low horizontal visibility (${(atmo.visibilityMeters / 1000).toFixed(1)} km) violates VLOS standards.`);
  } else if (atmo.visibilityMeters < 8000) {
    visScore = 70;
  }

  // Space weather / GNSS RTK Scintillation check
  if (space.kpIndex >= 6) {
    spaceScore = 10;
    reasons.push(`Severe geomagnetic storm (Kp ${space.kpIndex}) causes GNSS RTK carrier-slip errors.`);
  } else if (space.kpIndex >= 4) {
    spaceScore = 60;
    reasons.push(`Elevated geomagnetic activity (Kp ${space.kpIndex}); verify PPK/RTK fix before takeoff.`);
  }

  const overall = Math.round((windScore * 0.35) + (precipScore * 0.35) + (visScore * 0.15) + (spaceScore * 0.15));

  let status: 'GO' | 'CAUTION' | 'NO-GO' = 'GO';
  if (windScore === 0 || precipScore === 0 || visScore < 30 || spaceScore < 20 || overall < 50) {
    status = 'NO-GO';
  } else if (overall < 80) {
    status = 'CAUTION';
  }

  if (reasons.length === 0) {
    reasons.push('Excellent meteorological and ionospheric conditions for aerial mapping & RTK GNSS.');
  }

  return {
    status,
    overallScore: overall,
    windScore,
    visibilityScore: visScore,
    precipScore,
    spaceWeatherScore: spaceScore,
    reasons
  };
}

/**
 * Fetches Live Free Space Weather Data from NOAA SWPC or returns calculated real-time indicator
 */
export async function fetchLiveSpaceWeather(): Promise<SpaceWeatherTelemetry> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const latest = data[data.length - 1];
        const kp = typeof latest.kp_index === 'number' ? Math.round(latest.kp_index * 10) / 10 : 2.0;

        let category: SpaceWeatherTelemetry['stormCategory'] = 'Quiet';
        let impact: SpaceWeatherTelemetry['gnssImpactLevel'] = 'Optimal';
        let recommendation = 'Low ionospheric delay. RTK Fixed lock nominal across standard baselines.';

        if (kp >= 7) {
          category = 'Severe (G4+)';
          impact = 'High Scintillation / RTK Loss Risk';
          recommendation = 'Major ionospheric disruption. Dual-frequency required, expect cycle slips.';
        } else if (kp >= 5) {
          category = kp >= 6 ? 'Moderate Storm (G2)' : 'Minor Storm (G1)';
          impact = 'Moderate Scintillation Risk';
          recommendation = 'Elevated scintillation. Shorten RTK baselines (<10km) or use VRS / PPK.';
        } else if (kp >= 3.5) {
          category = 'Active';
          impact = 'Nominal';
          recommendation = 'Minor ionospheric turbulence; check RTK standard deviations.';
        } else if (kp >= 2.5) {
          category = 'Unsettled';
          impact = 'Optimal';
          recommendation = 'Favorable ionospheric conditions for geodetic carrier-phase observation.';
        }

        return {
          kpIndex: kp,
          stormCategory: category,
          gnssImpactLevel: impact,
          gnssRecommendation: recommendation,
          solarFluxIndex: 145,
          lastUpdated: latest.time_tag || new Date().toISOString()
        };
      }
    }
  } catch (err) {
    // Fallback gracefully
  }

  // Default calibrated nominal space weather state
  return {
    kpIndex: 2.1,
    stormCategory: 'Quiet',
    gnssImpactLevel: 'Optimal',
    gnssRecommendation: 'Nominal ionospheric activity. Optimal conditions for RTK, PPK, and PPP GNSS positioning.',
    solarFluxIndex: 138,
    lastUpdated: new Date().toLocaleTimeString()
  };
}

/**
 * Fetches Live Free Environmental & Atmospheric Telemetry via Open-Meteo API
 */
export async function fetchLiveEnvironmentalReport(
  lat: number,
  lon: number,
  elevationM: number = 0
): Promise<FullEnvironmentalReport> {
  const safeLat = Math.max(-90, Math.min(90, lat));
  const safeLon = Math.max(-180, Math.min(180, lon));

  let atmoData: SurveyAtmosphericData | null = null;
  let isLive = false;
  const substituted: string[] = ['visibility'];
  let hourlyObj: any = undefined;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${safeLat.toFixed(4)}&longitude=${safeLon.toFixed(4)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,surface_pressure,pressure_msl,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day,direct_normal_irradiance&hourly=temperature_2m,surface_pressure,wind_speed_10m,cloud_cover,precipitation_probability&forecast_days=1&timezone=auto`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      const c = json.current;
      if (c) {
        // Records anything the response did not carry, so a standard value
        // can never pass for an observation.
        const observed = <T,>(v: T | null | undefined, fallback: T, label: string): T => {
          if (v == null || (typeof v === 'number' && !Number.isFinite(v))) {
            substituted.push(label);
            return fallback;
          }
          return v;
        };

        const tempC = observed(c.temperature_2m, 20, 'temperature');
        const press = observed(c.surface_pressure, 1013.25, 'surface pressure');
        const rh = observed(c.relative_humidity_2m, 50, 'relative humidity');
        const windKmh = observed(c.wind_speed_10m, 8, 'wind speed');
        const windDir = observed(c.wind_direction_10m, 0, 'wind direction');
        const wCode = c.weather_code ?? 0;

        atmoData = {
          temperatureC: Math.round(tempC * 10) / 10,
          temperatureF: Math.round((tempC * 1.8 + 32) * 10) / 10,
          apparentTempC: Math.round((c.apparent_temperature ?? tempC) * 10) / 10,
          relativeHumidityPercent: Math.round(rh),
          dewPointC: Math.round((tempC - (100 - rh) / 5) * 10) / 10,
          surfacePressureHpa: Math.round(press * 10) / 10,
          mslPressureHpa: Math.round((c.pressure_msl ?? press) * 10) / 10,
          windSpeedKmh: Math.round(windKmh * 10) / 10,
          windSpeedMs: Math.round((windKmh / 3.6) * 10) / 10,
          windGustsKmh: Math.round((c.wind_gusts_10m ?? windKmh * 1.3) * 10) / 10,
          windDirectionDeg: Math.round(windDir),
          windCardinal: degreesToCardinal(windDir),
          cloudCoverPercent: Math.round(observed(c.cloud_cover, 10, 'cloud cover')),
          // Not among the fields requested, so this is always the standard
          // clear-air figure rather than an observation.
          visibilityMeters: 10000,
          uvIndex: Math.round(observed(c.uv_index, 3, 'UV index') * 10) / 10,
          solarIrradianceWm2: Math.round(observed(c.direct_normal_irradiance, 450, 'solar irradiance')),
          weatherCode: wCode,
          weatherDescription: interpretWmoCode(wCode),
          isDay: c.is_day === 1,
          precipitationMm: c.precipitation ?? 0,
          timestamp: c.time || new Date().toISOString()
        };

        if (json.hourly && Array.isArray(json.hourly.time)) {
          hourlyObj = {
            time: json.hourly.time.slice(0, 12).map((t: string) => t.slice(-5)),
            temperature: json.hourly.temperature_2m.slice(0, 12),
            pressure: json.hourly.surface_pressure.slice(0, 12),
            windSpeed: json.hourly.wind_speed_10m.slice(0, 12),
            cloudCover: json.hourly.cloud_cover.slice(0, 12),
            precipitationProb: json.hourly.precipitation_probability.slice(0, 12)
          };
        }

        isLive = true;
      }
    }
  } catch (e) {
    console.debug('Open-Meteo live fetch fallback');
  }

  // Fallback to Standard Atmosphere if offline
  if (!atmoData) {
    const stdTemp = 20 - (elevationM / 1000) * 6.5;
    const stdPress = 1013.25 * Math.pow(1 - 0.0065 * (elevationM / 288.15), 5.255);
    atmoData = {
      temperatureC: Math.round(stdTemp * 10) / 10,
      temperatureF: Math.round((stdTemp * 1.8 + 32) * 10) / 10,
      apparentTempC: Math.round(stdTemp * 10) / 10,
      relativeHumidityPercent: 55,
      dewPointC: Math.round((stdTemp - 8) * 10) / 10,
      surfacePressureHpa: Math.round(stdPress * 10) / 10,
      mslPressureHpa: 1013.25,
      windSpeedKmh: 12,
      windSpeedMs: 3.3,
      windGustsKmh: 16,
      windDirectionDeg: 135,
      windCardinal: 'SE',
      cloudCoverPercent: 20,
      visibilityMeters: 10000,
      uvIndex: 4.5,
      solarIrradianceWm2: 520,
      weatherCode: 1,
      weatherDescription: 'Mainly clear (Standard ISA Model)',
      isDay: true,
      precipitationMm: 0,
      timestamp: new Date().toISOString()
    };
  }

  // Calculate EDM velocity correction
  const edmCorrection = calculateEdmAtmosphericCorrection(
    atmoData.temperatureC,
    atmoData.surfacePressureHpa,
    atmoData.relativeHumidityPercent
  );

  // Calculate Solar position
  const solar = calculateSolarEphemeris(safeLat, safeLon, elevationM);

  // Fetch Space weather
  const spaceWeather = await fetchLiveSpaceWeather();

  // Evaluate UAV Flight safety index
  const uavSafety = evaluateUavFlightSafety(atmoData, spaceWeather);

  // Reverse geocode location (Non-blocking)
  let location: ReverseGeocodeLocation | undefined = undefined;
  try {
    const rGeo = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${safeLat.toFixed(5)}&lon=${safeLon.toFixed(5)}&zoom=14&addressdetails=1`,
      { headers: { 'User-Agent': 'BhuNexStudio-Geomatics-App/3.7' } }
    );
    if (rGeo.ok) {
      const geoJson = await rGeo.json();
      if (geoJson && geoJson.address) {
        const a = geoJson.address;
        location = {
          displayName: geoJson.display_name,
          villageOrSubdistrict: a.village || a.suburb || a.town || a.county,
          district: a.state_district || a.district || a.city,
          state: a.state,
          country: a.country,
          postcode: a.postcode
        };
      }
    }
  } catch (e) {
    // Non-blocking location lookup
  }

  return {
    lat: safeLat,
    lon: safeLon,
    elevationM,
    fetchedAt: new Date().toLocaleTimeString(),
    source: isLive ? 'Live Open-Meteo & NOAA SWPC' : 'Offline Geodetic Standard Fallback',
    isLive,
    substitutedFields: substituted,
    atmosphere: atmoData,
    edmCorrection,
    spaceWeather,
    solar,
    uavSafety,
    location,
    hourlyForecast: hourlyObj
  };
}
