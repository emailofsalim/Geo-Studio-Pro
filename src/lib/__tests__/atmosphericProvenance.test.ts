import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchLiveEnvironmentalReport, calculateEdmAtmosphericCorrection } from '../openSurveyData';

// ---------------------------------------------------------------------------
// A standard value must never pass for an observation
// ---------------------------------------------------------------------------
// The atmospheric readings drive the EDM ppm correction, which is a scale
// correction applied to every measured distance. `isLive` described the fetch,
// not the numbers: a response that arrived without a pressure still set it, and
// the correction was then computed from the 1013.25 hPa sea-level standard
// while the screen showed a green "Live" badge.
//
// The magnitude is not academic on the ground this application is aimed at.

const ok = (current: Record<string, unknown>) =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ current })
  } as unknown as Response);

const full = {
  temperature_2m: 32, surface_pressure: 932, relative_humidity_2m: 61,
  wind_speed_10m: 11, wind_direction_10m: 210, weather_code: 0,
  cloud_cover: 20, uv_index: 7, direct_normal_irradiance: 600, is_day: 1,
  precipitation: 0, time: '2026-09-02T02:00'
};

afterEach(() => { vi.unstubAllGlobals(); });

describe('substituted readings are named', () => {
  it('names a pressure the service did not return', async () => {
    const { surface_pressure, ...missing } = full;
    vi.stubGlobal('fetch', ok(missing));
    const r = await fetchLiveEnvironmentalReport(23.54, 84.60, 700);
    expect(r.substitutedFields).toContain('surface pressure');
  });

  it('names a temperature the service did not return', async () => {
    const { temperature_2m, ...missing } = full;
    vi.stubGlobal('fetch', ok(missing));
    const r = await fetchLiveEnvironmentalReport(23.54, 84.60, 700);
    expect(r.substitutedFields).toContain('temperature');
  });

  it('names nothing beyond visibility when every reading arrived', async () => {
    vi.stubGlobal('fetch', ok(full));
    const r = await fetchLiveEnvironmentalReport(23.54, 84.60, 700);
    // Visibility is never requested from the service, so it is always standard
    // and is always declared.
    expect(r.substitutedFields).toEqual(['visibility']);
    expect(r.atmosphere.surfacePressureHpa).toBe(932);
  });

  it('does not let a live fetch imply every reading was observed', async () => {
    const { surface_pressure, ...missing } = full;
    vi.stubGlobal('fetch', ok(missing));
    const r = await fetchLiveEnvironmentalReport(23.54, 84.60, 700);
    // The fetch did succeed, so isLive stays true — but it no longer stands
    // alone as the claim that the numbers were measured.
    expect(r.isLive).toBe(true);
    expect(r.substitutedFields.length).toBeGreaterThan(1);
  });
});

describe('why it matters', () => {
  it('substituting sea-level pressure moves the EDM correction by tens of ppm', () => {
    // A guard on the magnitude, so nobody later decides this is a rounding
    // detail and quietly restores a silent default.
    const standard = calculateEdmAtmosphericCorrection(20, 1013.25, 50).ppmCorrection;
    const plateau = calculateEdmAtmosphericCorrection(32, 932, 50).ppmCorrection;
    const error = plateau - standard;
    expect(error).toBeGreaterThan(25);   // ~32 ppm at about 700 m
    // 32 ppm is 32 mm per kilometre: 65 mm over a two-kilometre sight.
    expect(error * 2).toBeGreaterThan(50);
  });
});
