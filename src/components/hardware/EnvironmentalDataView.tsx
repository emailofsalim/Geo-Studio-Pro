import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Sun,
  Wind,
  Compass,
  Gauge,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Zap,
  Globe,
  Sliders,
  Plane,
  Droplets,
  Eye,
  Thermometer,
  Radio,
  MapPin,
  Clock,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check
} from 'lucide-react';
import {
  FullEnvironmentalReport,
  fetchLiveEnvironmentalReport,
  calculateEdmAtmosphericCorrection,
  EdmCorrectionResult
} from '../../lib/openSurveyData';
import { triggerHaptic } from '../../lib/haptics';

interface EnvironmentalDataViewProps {
  gpsFix: { lat: number; lon: number; alt: number | null } | null;
  onLogReading?: (remarks: string) => void;
}

export const EnvironmentalDataView: React.FC<EnvironmentalDataViewProps> = ({
  gpsFix,
  onLogReading
}) => {
  const [report, setReport] = useState<FullEnvironmentalReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [customLat, setCustomLat] = useState<number>(() => gpsFix?.lat || 25.5941);
  const [customLon, setCustomLon] = useState<number>(() => gpsFix?.lon || 85.1376);
  const [customAlt, setCustomAlt] = useState<number>(() => gpsFix?.alt || 53);

  // Manual EDM override state
  const [isManualEdm, setIsManualEdm] = useState<boolean>(false);
  const [overrideTemp, setOverrideTemp] = useState<number>(20);
  const [overridePress, setOverridePress] = useState<number>(1013.25);
  const [overrideRh, setOverrideRh] = useState<number>(50);
  const [copiedPpm, setCopiedPpm] = useState<boolean>(false);

  // Update coordinates when GPS lock updates
  useEffect(() => {
    if (gpsFix) {
      setCustomLat(gpsFix.lat);
      setCustomLon(gpsFix.lon);
      if (gpsFix.alt !== null) setCustomAlt(gpsFix.alt);
    }
  }, [gpsFix]);

  const loadData = async (lat: number, lon: number, alt: number) => {
    setLoading(true);
    try {
      const data = await fetchLiveEnvironmentalReport(lat, lon, alt);
      setReport(data);
      if (!isManualEdm) {
        setOverrideTemp(data.atmosphere.temperatureC);
        setOverridePress(data.atmosphere.surfacePressureHpa);
        setOverrideRh(data.atmosphere.relativeHumidityPercent);
      }
    } catch (e) {
      console.error('Failed to fetch environmental report', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(customLat, customLon, customAlt);
  }, []);

  const handleRefresh = () => {
    triggerHaptic(20);
    loadData(customLat, customLon, customAlt);
  };

  const edmResult: EdmCorrectionResult = isManualEdm
    ? calculateEdmAtmosphericCorrection(overrideTemp, overridePress, overrideRh)
    : report
    ? report.edmCorrection
    : calculateEdmAtmosphericCorrection(20, 1013.25, 50);

  const handleCopyPpm = () => {
    const text = `EDM PPM Correction: ${edmResult.ppmCorrection > 0 ? '+' : ''}${edmResult.ppmCorrection} ppm | Temp: ${edmResult.temperatureC}°C | Press: ${edmResult.pressureHpa} hPa | RH: ${edmResult.relativeHumidityPercent}% | ΔD per 1000m: ${edmResult.deltaPer1000m} mm`;
    navigator.clipboard.writeText(text);
    setCopiedPpm(true);
    triggerHaptic(20);
    setTimeout(() => setCopiedPpm(false), 2000);
  };

  const handleLogAtmosphere = () => {
    if (!report || !onLogReading) return;
    const remark = `Atmo: ${report.atmosphere.temperatureC}°C, ${report.atmosphere.surfacePressureHpa}hPa, RH ${report.atmosphere.relativeHumidityPercent}%, Wind ${report.atmosphere.windSpeedKmh}km/h ${report.atmosphere.windCardinal}, EDM ${edmResult.ppmCorrection}ppm, Kp ${report.spaceWeather.kpIndex}`;
    onLogReading(remark);
    triggerHaptic([30, 40]);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Status & Quick Coordinates Input */}
      <div className="bg-[#111111] p-5 rounded-2xl border border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#c9a063]/10 border border-[#c9a063]/25 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5 text-[#c9a063]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">
                Live Survey Meteorology & Space Weather
              </h2>
              {report?.isLive ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Free API
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Offline Standard Model
                </span>
              )}
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              {report?.location?.displayName || `Lat: ${customLat.toFixed(4)}°, Lon: ${customLon.toFixed(4)}°, Alt: ${customAlt}m`}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          {gpsFix && (
            <button
              onClick={() => {
                setCustomLat(gpsFix.lat);
                setCustomLon(gpsFix.lon);
                if (gpsFix.alt) setCustomAlt(gpsFix.alt);
                loadData(gpsFix.lat, gpsFix.lon, gpsFix.alt || 0);
                triggerHaptic(20);
              }}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white border border-white/[0.08] text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Use current GPS Fix"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>Use GPS Fix</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-lg bg-[#c9a063] hover:bg-[#b88f55] text-black font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Fetching...' : 'Refresh'}</span>
          </button>

          {onLogReading && (
            <button
              onClick={handleLogAtmosphere}
              className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs border border-white/[0.1] flex items-center gap-1.5 transition-colors"
              title="Log observation to Field Ledger"
            >
              <span>+ Log Obs</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid: Main Weather & EDM Corrections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Atmospheric Observations (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Main Weather Card */}
          <div className="bg-[#111111] p-6 rounded-2xl border border-white/[0.08] space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-[#c9a063]" />
                <span className="text-xs font-semibold text-white uppercase tracking-wider">
                  Site Atmospheric Conditions
                </span>
              </div>
              <span className="text-[11px] font-mono text-white/40">
                {report?.fetchedAt ? `Updated ${report.fetchedAt}` : ''}
              </span>
            </div>

            {/* Weather Header Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] text-white/40 uppercase font-mono">Air Temp</div>
                <div className="text-2xl font-bold text-white mt-1 font-mono">
                  {report?.atmosphere.temperatureC ?? '--'}°C
                </div>
                <div className="text-[10px] text-white/40 font-mono mt-0.5">
                  {report?.atmosphere.temperatureF ?? '--'}°F (Apparent: {report?.atmosphere.apparentTempC}°C)
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] text-white/40 uppercase font-mono">Barometric Press.</div>
                <div className="text-2xl font-bold text-[#c9a063] mt-1 font-mono">
                  {report?.atmosphere.surfacePressureHpa ?? '--'}
                </div>
                <div className="text-[10px] text-white/40 font-mono mt-0.5">
                  hPa / mbar (MSL: {report?.atmosphere.mslPressureHpa} hPa)
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] text-white/40 uppercase font-mono">Relative Humidity</div>
                <div className="text-2xl font-bold text-cyan-400 mt-1 font-mono">
                  {report?.atmosphere.relativeHumidityPercent ?? '--'}%
                </div>
                <div className="text-[10px] text-white/40 font-mono mt-0.5">
                  Dew Point: {report?.atmosphere.dewPointC}°C
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] text-white/40 uppercase font-mono">Wind Velocity</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
                  {report?.atmosphere.windSpeedKmh ?? '--'}
                </div>
                <div className="text-[10px] text-white/40 font-mono mt-0.5">
                  km/h {report?.atmosphere.windCardinal} ({report?.atmosphere.windSpeedMs} m/s)
                </div>
              </div>
            </div>

            {/* Secondary Meteorological Telemetry Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 bg-black/40 border border-white/[0.05] rounded-xl flex items-center justify-between">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-white/40" /> Wind Gusts:
                </span>
                <span className="text-white font-medium">{report?.atmosphere.windGustsKmh ?? '--'} km/h</span>
              </div>

              <div className="p-3 bg-black/40 border border-white/[0.05] rounded-xl flex items-center justify-between">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-white/40" /> Wind Azimuth:
                </span>
                <span className="text-white font-medium">{report?.atmosphere.windDirectionDeg ?? '--'}°</span>
              </div>

              <div className="p-3 bg-black/40 border border-white/[0.05] rounded-xl flex items-center justify-between">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-white/40" /> Cloud Cover:
                </span>
                <span className="text-white font-medium">{report?.atmosphere.cloudCoverPercent ?? '--'}%</span>
              </div>

              <div className="p-3 bg-black/40 border border-white/[0.05] rounded-xl flex items-center justify-between">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-[#c9a063]" /> Solar Irradiance:
                </span>
                <span className="text-white font-medium">{report?.atmosphere.solarIrradianceWm2 ?? '--'} W/m²</span>
              </div>

              <div className="p-3 bg-black/40 border border-white/[0.05] rounded-xl flex items-center justify-between">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> UV Index:
                </span>
                <span className="text-white font-medium">{report?.atmosphere.uvIndex ?? '--'} / 11</span>
              </div>

              <div className="p-3 bg-black/40 border border-white/[0.05] rounded-xl flex items-center justify-between">
                <span className="text-white/50 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-white/40" /> Horiz. Visibility:
                </span>
                <span className="text-white font-medium">
                  {report ? `${(report.atmosphere.visibilityMeters / 1000).toFixed(1)} km` : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* 12-Hour Hourly Trend Table */}
          {report?.hourlyForecast && (
            <div className="bg-[#111111] p-5 rounded-2xl border border-white/[0.08] space-y-3 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white font-sans flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-[#c9a063]" /> 12-Hour Field Forecasting Trend
                </span>
                <span className="text-[10px] text-white/40">Open-Meteo Hourly Model</span>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-[11px] text-left">
                  <thead>
                    <tr className="text-white/40 border-b border-white/[0.06]">
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Temp (°C)</th>
                      <th className="py-2 pr-3">Pressure (hPa)</th>
                      <th className="py-2 pr-3">Wind (km/h)</th>
                      <th className="py-2 pr-3">Clouds (%)</th>
                      <th className="py-2">Rain Prob (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {report.hourlyForecast.time.map((timeStr, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-1.5 pr-3 text-white/80 font-medium">{timeStr}</td>
                        <td className="py-1.5 pr-3 text-[#c9a063]">{report.hourlyForecast!.temperature[idx]}°C</td>
                        <td className="py-1.5 pr-3 text-white/70">{report.hourlyForecast!.pressure[idx]}</td>
                        <td className="py-1.5 pr-3 text-emerald-400">{report.hourlyForecast!.windSpeed[idx]}</td>
                        <td className="py-1.5 pr-3 text-white/50">{report.hourlyForecast!.cloudCover[idx]}%</td>
                        <td className="py-1.5 text-cyan-400">{report.hourlyForecast!.precipitationProb[idx]}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: EDM Velocity Correction & Space Weather (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Total Station EDM Atmospheric Velocity Correction Dial */}
          <div className="bg-[#111111] p-6 rounded-2xl border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#c9a063]" />
                <span className="text-xs font-semibold text-white uppercase tracking-wider">
                  Total Station EDM PPM Correction
                </span>
              </div>
              <button
                onClick={() => setIsManualEdm(!isManualEdm)}
                className={`text-[10px] px-2 py-0.5 rounded font-mono border transition-colors ${
                  isManualEdm
                    ? 'bg-[#c9a063]/20 border-[#c9a063]/40 text-[#c9a063]'
                    : 'bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-white'
                }`}
              >
                {isManualEdm ? 'Manual Input Mode' : 'Live Sync Mode'}
              </button>
            </div>

            {/* Big PPM Display Card */}
            <div className="p-4 rounded-xl bg-gradient-to-b from-[#181818] to-[#121212] border border-[#c9a063]/30 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-white/50 uppercase tracking-widest font-mono">
                Atmospheric Velocity Correction
              </span>
              <div className="text-4xl font-extrabold text-[#c9a063] font-mono my-1 tracking-tight">
                {edmResult.ppmCorrection > 0 ? `+${edmResult.ppmCorrection}` : edmResult.ppmCorrection} <span className="text-base font-normal text-white/50">ppm</span>
              </div>
              <div className="text-xs font-mono text-white/80">
                ΔD Correction: <span className="text-emerald-400 font-semibold">{edmResult.deltaPer1000m > 0 ? `+${edmResult.deltaPer1000m}` : edmResult.deltaPer1000m} mm</span> per 1000m baseline
              </div>

              <button
                onClick={handleCopyPpm}
                className="mt-3 px-3 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/80 text-[11px] font-mono flex items-center gap-1.5 border border-white/[0.08] transition-colors"
              >
                {copiedPpm ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedPpm ? 'Copied to Clipboard' : 'Copy EDM Parameters'}</span>
              </button>
            </div>

            {/* Manual Override Controls */}
            {isManualEdm && (
              <div className="p-3.5 bg-black/40 border border-white/[0.08] rounded-xl space-y-3 text-xs font-mono">
                <div className="flex items-center justify-between text-white/70">
                  <span>Temperature (°C):</span>
                  <input
                    type="number"
                    value={overrideTemp}
                    onChange={e => setOverrideTemp(parseFloat(e.target.value) || 0)}
                    className="w-20 px-2 py-1 bg-white/[0.04] border border-white/[0.1] rounded text-right text-white focus:outline-none focus:border-[#c9a063]"
                    step="0.5"
                  />
                </div>
                <div className="flex items-center justify-between text-white/70">
                  <span>Barometric Press. (hPa):</span>
                  <input
                    type="number"
                    value={overridePress}
                    onChange={e => setOverridePress(parseFloat(e.target.value) || 1013.25)}
                    className="w-24 px-2 py-1 bg-white/[0.04] border border-white/[0.1] rounded text-right text-white focus:outline-none focus:border-[#c9a063]"
                    step="0.5"
                  />
                </div>
                <div className="flex items-center justify-between text-white/70">
                  <span>Relative Humidity (%):</span>
                  <input
                    type="number"
                    value={overrideRh}
                    onChange={e => setOverrideRh(parseFloat(e.target.value) || 50)}
                    className="w-20 px-2 py-1 bg-white/[0.04] border border-white/[0.1] rounded text-right text-white focus:outline-none focus:border-[#c9a063]"
                    step="1"
                    min="0"
                    max="100"
                  />
                </div>
              </div>
            )}

            {/* Geodetic Optical Constants */}
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-white/60">
              <div className="p-2.5 bg-white/[0.02] border border-white/[0.04] rounded-lg">
                <div className="text-[9px] text-white/40 uppercase">Refractive Index (n)</div>
                <div className="text-white font-semibold mt-0.5">{edmResult.carrierRefractionIndex}</div>
              </div>
              <div className="p-2.5 bg-white/[0.02] border border-white/[0.04] rounded-lg">
                <div className="text-[9px] text-white/40 uppercase">Air Density (ρ)</div>
                <div className="text-white font-semibold mt-0.5">{edmResult.airDensityKgM3} kg/m³</div>
              </div>
            </div>
          </div>

          {/* Space Weather & Ionospheric Scintillation (NOAA SWPC) */}
          <div className="bg-[#111111] p-6 rounded-2xl border border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#c9a063]" />
                <span className="text-xs font-semibold text-white uppercase tracking-wider">
                  Space Weather & GNSS RTK Scintillation
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-white/50 border border-white/[0.08]">
                NOAA SWPC Open Data
              </span>
            </div>

            {/* Planetary Kp Index Meter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-white/60">Planetary Kp Index:</span>
                <span className={`font-bold ${
                  (report?.spaceWeather.kpIndex || 0) >= 5 ? 'text-red-400' : (report?.spaceWeather.kpIndex || 0) >= 3.5 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  Kp {report?.spaceWeather.kpIndex ?? '2.1'} ({report?.spaceWeather.stormCategory ?? 'Quiet'})
                </span>
              </div>

              {/* Visual 0 - 9 Kp bar */}
              <div className="h-2.5 w-full bg-white/[0.05] rounded-full overflow-hidden flex gap-0.5 p-0.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                  const currentKp = report?.spaceWeather.kpIndex || 2;
                  const isFilled = currentKp >= level;
                  let bg = 'bg-emerald-500';
                  if (level >= 4) bg = 'bg-amber-500';
                  if (level >= 6) bg = 'bg-red-500';
                  return (
                    <div
                      key={level}
                      className={`flex-1 rounded-sm transition-all ${isFilled ? bg : 'bg-white/[0.06]'}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* RTK / GNSS Impact Recommendation Box */}
            <div className="p-3.5 bg-black/40 border border-white/[0.06] rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium text-white">
                {(report?.spaceWeather.kpIndex || 0) < 5 ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span>GNSS Positioning Impact: {report?.spaceWeather.gnssImpactLevel || 'Optimal'}</span>
              </div>
              <p className="text-[11px] text-white/50 font-mono leading-relaxed">
                {report?.spaceWeather.gnssRecommendation || 'Optimal RTK fix conditions with low ionospheric scintillation delay.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Solar Ephemeris & Astrometric Alignment + UAV Flight Index */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Astronomic Solar Ephemeris */}
        <div className="bg-[#111111] p-6 rounded-2xl border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-[#c9a063]" />
              <span className="text-xs font-semibold text-white uppercase tracking-wider">
                Solar Ephemeris & Meridian Alignment
              </span>
            </div>
            <span className="text-[10px] font-mono text-white/40">NOAA SPA Engine</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center font-mono">
            <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
              <div className="text-[10px] text-white/40 uppercase">Solar Azimuth</div>
              <div className="text-lg font-bold text-white mt-1">
                {report?.solar.solarAzimuthDeg ?? '--'}°
              </div>
            </div>

            <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
              <div className="text-[10px] text-white/40 uppercase">Solar Elevation</div>
              <div className="text-lg font-bold text-[#c9a063] mt-1">
                {report?.solar.solarElevationDeg ?? '--'}°
              </div>
            </div>

            <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
              <div className="text-[10px] text-white/40 uppercase">Solar Noon</div>
              <div className="text-sm font-bold text-white mt-1.5">
                {report?.solar.solarNoonTime ?? '--'}
              </div>
            </div>

            <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
              <div className="text-[10px] text-white/40 uppercase">Shadow Ratio</div>
              <div className="text-lg font-bold text-cyan-400 mt-1">
                {report?.solar.shadowRatio ?? '--'}x
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-white/60 pt-1">
            <span>Sunrise: {report?.solar.sunriseTime ?? '--'}</span>
            <span>Sunset: {report?.solar.sunsetTime ?? '--'}</span>
            <span>Daylight: {report?.solar.daylightDurationHours ?? '--'} hrs</span>
          </div>
        </div>

        {/* Drone / UAV Photogrammetry Safety Pre-Flight Index */}
        <div className="bg-[#111111] p-6 rounded-2xl border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Plane className="w-4 h-4 text-[#c9a063]" />
              <span className="text-xs font-semibold text-white uppercase tracking-wider">
                UAV / Drone Mapping Flight Pre-Check
              </span>
            </div>
            {report?.uavSafety.status === 'GO' ? (
              <span className="px-2.5 py-0.5 rounded text-xs font-bold font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> FLIGHT GO
              </span>
            ) : report?.uavSafety.status === 'CAUTION' ? (
              <span className="px-2.5 py-0.5 rounded text-xs font-bold font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> CAUTION
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded text-xs font-bold font-mono bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> NO-GO
              </span>
            )}
          </div>

          <div className="space-y-2 font-mono text-xs">
            {report?.uavSafety.reasons.map((reason, idx) => (
              <div key={idx} className="flex items-start gap-2 text-white/70">
                <span className="text-[#c9a063] mt-0.5">•</span>
                <span className="leading-relaxed">{reason}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono pt-2 border-t border-white/[0.06]">
            <div>
              <div className="text-white/40">Wind</div>
              <div className="text-white font-bold mt-0.5">{report?.uavSafety.windScore ?? 100}%</div>
            </div>
            <div>
              <div className="text-white/40">Precip</div>
              <div className="text-white font-bold mt-0.5">{report?.uavSafety.precipScore ?? 100}%</div>
            </div>
            <div>
              <div className="text-white/40">Visibility</div>
              <div className="text-white font-bold mt-0.5">{report?.uavSafety.visibilityScore ?? 100}%</div>
            </div>
            <div>
              <div className="text-white/40">Space Wx</div>
              <div className="text-white font-bold mt-0.5">{report?.uavSafety.spaceWeatherScore ?? 100}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
