import React, { useState, useMemo } from 'react';
import { Mountain, AlertTriangle, Layers, Bomb, Boxes, Scale } from 'lucide-react';
import {
  benchGeometry,
  drillPattern,
  blastDesign,
  layoutDrillHoles,
  conicalStockpile,
  frustumStockpile,
  blockReserve
} from '../engines/mining';
import { buildTin, planArea, surfaceArea3D, volumeToDatum } from '../engines/tin';
import { parseSurfacePoints, parseBreaklines } from '../lib/surfacePointText';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { crsLabelFor, isValidZone } from '../lib/crsIdentity';

interface MiningStudioTabProps {
  workingZone: string;
}

type Section = 'bench' | 'blast' | 'stockpile' | 'reserve';

/**
 * Result of a calculation that may reject its inputs.
 *
 * A discriminated union, so reading `.value` on a failure or `.error` on a
 * success is a compile error rather than a runtime `undefined`.
 */
type Calc<T> = { ok: true; value: T } | { ok: false; error: string };

/** Renders the message of a failed calculation, and nothing for a successful one. */
const CalcError: React.FC<{ result: Calc<unknown> }> = ({ result }) =>
  result.ok ? null : (
    <div className="rounded-lg border border-red-600/40 bg-red-500/10 px-3 py-2 text-xs">{result.error}</div>
  );

function safe<T>(fn: () => T): Calc<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

const num = (v: string, fallback = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const fmt = (v: number, dp = 2) =>
  Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '—';

/** A labelled numeric input. */
const Field: React.FC<{
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}> = ({ label, unit, value, onChange, step = 'any' }) => (
  <label className="flex flex-col gap-1">
    <span className="text-[11px] uppercase tracking-wider opacity-60">
      {label}
      {unit ? <span className="ml-1 normal-case opacity-70">({unit})</span> : null}
    </span>
    <input
      type="number"
      step={step}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm font-mono focus:outline-none focus:border-teal-600/60"
    />
  </label>
);

/** A result row. */
const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex justify-between gap-4 py-1 border-b border-black/5 dark:border-white/5 last:border-0">
    <span className="text-xs opacity-70">{label}</span>
    <span className={`text-xs font-mono tabular-nums ${strong ? 'font-bold' : ''}`}>{value}</span>
  </div>
);

const Warnings: React.FC<{ items: string[] }> = ({ items }) =>
  items.length === 0 ? null : (
    <div className="mt-3 rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 space-y-1.5">
      {items.map((w, i) => (
        <div key={i} className="flex gap-2 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
          <span className="opacity-90">{w}</span>
        </div>
      ))}
    </div>
  );

export const MiningStudioTab: React.FC<MiningStudioTabProps> = ({ workingZone }) => {
  const [section, setSection] = useState<Section>('bench');

  // Bench
  const [benchH, setBenchH] = useState('10');
  const [faceAngle, setFaceAngle] = useState('65');
  const [berm, setBerm] = useState('5');
  const [benchCount, setBenchCount] = useState('4');

  // Drill & blast
  const [burden, setBurden] = useState('3');
  const [spacing, setSpacing] = useState('3.5');
  const [area, setArea] = useState('2000');
  const [blastBenchH, setBlastBenchH] = useState('9');
  const [holeDia, setHoleDia] = useState('115');
  const [expDensity, setExpDensity] = useState('800');
  const [rockDensity, setRockDensity] = useState('2600');
  const [stemming, setStemming] = useState('3');

  // Stockpile
  const [pileMethod, setPileMethod] = useState<'cone' | 'frustum' | 'surface'>('cone');
  const [baseR, setBaseR] = useState('12');
  const [topR, setTopR] = useState('4');
  const [pileH, setPileH] = useState('7');
  const [looseDensity, setLooseDensity] = useState('1600');

  // Stockpile from a surveyed surface
  const [surfaceText, setSurfaceText] = useState(
    [
      '# Stockpile pickup: E, N, RL in the project CRS. One point per line.',
      '254800.00, 2605200.00, 100.00',
      '254824.00, 2605200.00, 100.00',
      '254824.00, 2605224.00, 100.00',
      '254800.00, 2605224.00, 100.00',
      '254812.00, 2605212.00, 107.00'
    ].join('\n')
  );
  const [pileBreaklineText, setPileBreaklineText] = useState('');
  const [datumMode, setDatumMode] = useState<'toe' | 'rl'>('toe');
  const [datumRl, setDatumRl] = useState('100');

  // Reserve
  const [resArea, setResArea] = useState('50000');
  const [seamT, setSeamT] = useState('4.5');
  const [oreDensity, setOreDensity] = useState('2400');
  const [obT, setObT] = useState('8');
  const [obDensity, setObDensity] = useState('1800');
  const [recovery, setRecovery] = useState('0.9');

  const bench = useMemo<Calc<ReturnType<typeof benchGeometry>>>(
    () =>
      safe(() =>
        benchGeometry({
          benchHeightM: num(benchH),
          faceAngleDeg: num(faceAngle),
          bermWidthM: num(berm),
          benchCount: Math.round(num(benchCount, 1))
        })
      ),
    [benchH, faceAngle, berm, benchCount]
  );

  const pattern = useMemo<Calc<ReturnType<typeof drillPattern>>>(
    () =>
      safe(() =>
        drillPattern({
          burdenM: num(burden),
          spacingM: num(spacing),
          areaM2: num(area),
          benchHeightM: num(blastBenchH)
        })
      ),
    [burden, spacing, area, blastBenchH]
  );

  const blast = useMemo<Calc<ReturnType<typeof blastDesign>>>(() => {
    if (!pattern.ok) return { ok: false, error: 'Fix the drill pattern first.' };
    return safe(() =>
      blastDesign({
        holeDiameterMm: num(holeDia),
        explosiveDensityKgM3: num(expDensity),
        rockDensityKgM3: num(rockDensity),
        stemmingM: num(stemming),
        pattern: pattern.value
      })
    );
  }, [pattern, holeDia, expDensity, rockDensity, stemming]);

  // A fixed 60 x 12 m sample block, purely to show the pattern shape.
  const holes = useMemo(() => {
    if (!pattern.ok) return null;
    const r = safe(() => layoutDrillHoles(60, 12, num(burden), num(spacing), 'staggered'));
    return r.ok ? r.value : null;
  }, [pattern, burden, spacing]);

  const pile = useMemo<Calc<ReturnType<typeof conicalStockpile>>>(
    () =>
      safe(() =>
        pileMethod === 'frustum'
          ? frustumStockpile(num(baseR), num(topR), num(pileH), num(looseDensity))
          : conicalStockpile(num(baseR), num(pileH), num(looseDensity))
      ),
    [pileMethod, baseR, topR, pileH, looseDensity]
  );

  /**
   * Stockpile measured from its surveyed surface.
   *
   * The datum is stated, never inferred from the shape of the data beyond the
   * explicit "lowest surveyed point" option, because the volume is entirely a
   * function of where the toe is taken to be.
   */
  // Debounced so a large pickup is triangulated once per pause, not per keystroke.
  const surfaceTextSettled = useDebouncedValue(surfaceText, 350);
  const pileBreaklineSettled = useDebouncedValue(pileBreaklineText, 350);

  const surface = useMemo(() => {
    const { pts, rejected } = parseSurfacePoints(surfaceTextSettled);
    if (pts.length < 3) {
      return {
        ok: false as const,
        error: 'A surface needs at least three points, given as E, N, RL on separate lines.',
        rejected
      };
    }

    const bl = parseBreaklines(pileBreaklineSettled);
    const built = safe(() => buildTin(pts, { breaklines: bl.lines }));
    if (!built.ok) return { ok: false as const, error: built.error, rejected };
    const tin = built.value;

    const lowest = Math.min(...tin.points.map(p => p.z));
    const highest = Math.max(...tin.points.map(p => p.z));
    const datumZ = datumMode === 'toe' ? lowest : num(datumRl, lowest);

    const vol = volumeToDatum(tin, datumZ);
    const density = num(looseDensity);

    const warnings: string[] = [];
    if (tin.duplicatesRemoved > 0) {
      warnings.push(
        `${tin.duplicatesRemoved} point${tin.duplicatesRemoved === 1 ? '' : 's'} repeated an easting and northing already used and ${
          tin.duplicatesRemoved === 1 ? 'was' : 'were'
        } dropped. The first observation at each position was kept.`
      );
    }
    for (const issue of tin.breaklineIssues) warnings.push(issue);
    if (bl.rejected.length > 0) {
      warnings.push(`${bl.rejected.length} breakline line${bl.rejected.length === 1 ? '' : 's'} could not be read.`);
    }
    if (rejected.length > 0) {
      warnings.push(`${rejected.length} line${rejected.length === 1 ? '' : 's'} could not be read and ${rejected.length === 1 ? 'was' : 'were'} left out.`);
    }
    if (vol.fillM3 > 0) {
      warnings.push(
        `${fmt(vol.fillM3, 1)} m³ of the surface lies below the datum. That is ground under the toe level, not stockpiled material, so it is reported separately rather than deducted.`
      );
    }
    if (datumMode === 'rl' && (datumZ > highest || datumZ < lowest)) {
      warnings.push(
        `The datum of ${fmt(datumZ, 2)} m is outside the surveyed height range of ${fmt(lowest, 2)} m to ${fmt(highest, 2)} m.`
      );
    }
    warnings.push(
      'The surface spans the convex hull of the points. Material outside the pickup is not counted, and a mis-keyed coordinate stretches the hull across ground that was never surveyed — which adds volume rather than losing it.'
    );
    if (!(density > 0)) {
      warnings.push('Set a loose density to get a tonnage.');
    }

    return {
      ok: true as const,
      tin,
      vol,
      datumZ,
      lowest,
      highest,
      planAreaM2: planArea(tin),
      surfaceAreaM2: surfaceArea3D(tin),
      tonnes: density > 0 ? (vol.cutM3 * density) / 1000 : null,
      warnings,
      breaklineCount: bl.lines.length,
      constraintCount: tin.constraints.length,
      rejected: [...rejected, ...bl.rejected]
    };
  }, [surfaceTextSettled, pileBreaklineSettled, datumMode, datumRl, looseDensity]);

  const reserve = useMemo<Calc<ReturnType<typeof blockReserve>>>(
    () =>
      safe(() =>
        blockReserve({
          areaM2: num(resArea),
          seamThicknessM: num(seamT),
          oreDensityKgM3: num(oreDensity),
          overburdenThicknessM: num(obT),
          overburdenDensityKgM3: num(obDensity),
          recoveryFactor: num(recovery, 1)
        })
      ),
    [resArea, seamT, oreDensity, obT, obDensity, recovery]
  );

  const TABS: { id: Section; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'bench', label: 'Bench & Slope', icon: Layers },
    { id: 'blast', label: 'Drill & Blast', icon: Bomb },
    { id: 'stockpile', label: 'Stockpile', icon: Boxes },
    { id: 'reserve', label: 'Reserves', icon: Scale }
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Mountain className="w-5 h-5" /> Mining Studio
        </h1>
        <p className="text-sm opacity-70 mt-1">
          Bench geometry, drill pattern and blast design, stockpile volumes and block reserves for open-cast work.
        </p>
      </div>

      <div className="rounded-lg border border-teal-600/40 bg-teal-500/10 px-4 py-2.5 text-xs">
        <span className="opacity-60 uppercase tracking-wider text-[10px]">Project coordinate system</span>
        <div className="font-semibold mt-0.5">
          {isValidZone(workingZone) ? crsLabelFor(workingZone) : 'Not set'}
        </div>
        <div className="opacity-70 mt-1">
          These calculations are dimensional and do not depend on the CRS. Positions taken into the pit plan do.
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              section === t.id
                ? 'bg-teal-600/15 border-teal-600/50 text-teal-700 dark:text-teal-300'
                : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* ---------------- Bench ---------------- */}
      {section === 'bench' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
            <h2 className="text-sm font-semibold">Wall configuration</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bench height" unit="m" value={benchH} onChange={setBenchH} />
              <Field label="Face angle" unit="°" value={faceAngle} onChange={setFaceAngle} />
              <Field label="Berm width" unit="m" value={berm} onChange={setBerm} />
              <Field label="Bench count" value={benchCount} onChange={setBenchCount} step="1" />
            </div>
          </div>
          <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Resulting geometry</h2>
            {bench.ok ? (
              <div>
                <Row label="Face run per bench" value={`${fmt(bench.value.faceRunM)} m`} />
                <Row label="Horizontal advance per bench" value={`${fmt(bench.value.horizontalPerBenchM)} m`} />
                <Row label="Total wall height" value={`${fmt(bench.value.totalHeightM)} m`} />
                <Row label="Total run, crest to toe" value={`${fmt(bench.value.totalRunM)} m`} />
                <Row
                  label="Overall slope angle"
                  value={`${fmt(bench.value.overallSlopeAngleDeg)}°`}
                  strong
                />
                <p className="text-[11px] opacity-60 mt-3">
                  The overall slope is flatter than the {fmt(bench.value.faceAngleDeg, 0)}° face angle because each
                  berm steps the wall back. Quote the overall angle for stability, not the face angle.
                </p>
              </div>
            ) : (
              <CalcError result={bench} />
            )}
          </div>
        </div>
      )}

      {/* ---------------- Drill & blast ---------------- */}
      {section === 'blast' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
              <h2 className="text-sm font-semibold">Pattern</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Burden" unit="m" value={burden} onChange={setBurden} />
                <Field label="Spacing" unit="m" value={spacing} onChange={setSpacing} />
                <Field label="Block area" unit="m²" value={area} onChange={setArea} />
                <Field label="Bench height" unit="m" value={blastBenchH} onChange={setBlastBenchH} />
              </div>
              <h2 className="text-sm font-semibold pt-1">Charge</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Hole diameter" unit="mm" value={holeDia} onChange={setHoleDia} />
                <Field label="Explosive density" unit="kg/m³" value={expDensity} onChange={setExpDensity} />
                <Field label="Stemming" unit="m" value={stemming} onChange={setStemming} />
                <Field label="Rock density" unit="kg/m³" value={rockDensity} onChange={setRockDensity} />
              </div>
            </div>

            <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
              <h2 className="text-sm font-semibold mb-2">Design output</h2>
              {pattern.ok ? (
                <>
                  <Row label="Spacing / burden ratio" value={fmt(pattern.value.spacingToBurdenRatio)} />
                  <Row label="Holes required" value={String(pattern.value.holeCount)} strong />
                  <Row label="Hole depth (incl. subdrill)" value={`${fmt(pattern.value.holeDepthM)} m`} />
                  <Row label="Subdrill" value={`${fmt(pattern.value.subdrillM)} m`} />
                  <Row label="Total drilling" value={`${fmt(pattern.value.totalDrillMetres, 1)} m`} />
                  <Row label="Volume broken" value={`${fmt(pattern.value.totalVolumeM3, 1)} m³`} />
                  <Row label="Drill factor" value={`${fmt(pattern.value.drillFactorMPerM3, 4)} m/m³`} />
                  {blast.ok && (
                    <>
                      <Row
                        label="Linear charge density"
                        value={`${fmt(blast.value.linearChargeDensityKgPerM)} kg/m`}
                      />
                      <Row label="Charge length" value={`${fmt(blast.value.chargeLengthM)} m`} />
                      <Row label="Charge per hole" value={`${fmt(blast.value.chargePerHoleKg)} kg`} />
                      <Row label="Total explosive" value={`${fmt(blast.value.totalExplosiveKg, 1)} kg`} strong />
                      <Row label="Rock blasted" value={`${fmt(blast.value.totalTonnes, 1)} t`} />
                      <Row
                        label="Powder factor"
                        value={`${fmt(blast.value.powderFactorKgPerM3, 3)} kg/m³`}
                        strong
                      />
                      <Row
                        label="Powder factor"
                        value={`${fmt(blast.value.powderFactorKgPerTonne, 3)} kg/t`}
                      />
                    </>
                  )}
                  <Warnings items={[...pattern.value.warnings, ...(blast.ok ? blast.value.warnings : [])]} />
                  {!blast.ok && <div className="mt-3"><CalcError result={blast} /></div>}
                </>
              ) : (
                <CalcError result={pattern} />
              )}
            </div>
          </div>

          {/* Pattern preview: a 60 x 12 m sample block, drawn to scale. */}
          {holes && holes.length > 0 && (
            <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
              <h2 className="text-sm font-semibold mb-2">
                Staggered layout — 60 × 12 m sample block ({holes.length} holes)
              </h2>
              <div className="overflow-x-auto">
                <svg viewBox="-2 -2 64 16" className="w-full" style={{ minWidth: 420, height: 130 }}>
                  <rect x="0" y="0" width="60" height="12" fill="none" stroke="currentColor" strokeWidth="0.15" opacity="0.3" />
                  <line x1="0" y1="0" x2="60" y2="0" stroke="currentColor" strokeWidth="0.4" opacity="0.6" />
                  {holes.map((h, i) => (
                    <circle key={i} cx={h.x} cy={h.y} r="0.5" fill="currentColor" opacity="0.75" />
                  ))}
                </svg>
              </div>
              <p className="text-[11px] opacity-60 mt-1">
                The heavier line is the free face. Alternate rows are offset by half a spacing.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------------- Stockpile ---------------- */}
      {section === 'stockpile' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
            <h2 className="text-sm font-semibold">Pile survey</h2>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['cone', 'Conical'],
                  ['frustum', 'Flat-topped'],
                  ['surface', 'Surveyed surface']
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setPileMethod(id)}
                  className={`px-3 py-1 rounded-lg text-xs border ${
                    pileMethod === id
                      ? 'bg-teal-600/15 border-teal-600/50'
                      : 'border-black/10 dark:border-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {pileMethod === 'surface' ? (
              <div className="space-y-3">
                <p className="text-[11px] opacity-70">
                  Paste the pickup as <span className="font-mono">E, N, RL</span> per line, in the project
                  coordinate system. The points are triangulated as surveyed — nothing is smoothed, and no ground is
                  assumed beyond them.
                </p>
                <textarea
                  value={surfaceText}
                  onChange={e => setSurfaceText(e.target.value)}
                  spellCheck={false}
                  rows={8}
                  className="w-full px-2.5 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-mono focus:outline-none focus:border-teal-600/60"
                />
                <div className="space-y-1.5">
                  <span className="text-[11px] uppercase tracking-wider opacity-60">
                    Breaklines <span className="normal-case opacity-70">(optional)</span>
                  </span>
                  <p className="text-[11px] opacity-70">
                    The toe of the pile, or a crest along its top. Blocks of <span className="font-mono">E, N, RL</span>,
                    one blank line between lines, <span className="font-mono">#</span> to name each. Without a toe line
                    the triangulation can span from the pile onto the pad and count ground as stockpile.
                  </p>
                  <textarea
                    value={pileBreaklineText}
                    onChange={e => setPileBreaklineText(e.target.value)}
                    spellCheck={false}
                    rows={5}
                    placeholder={'# Toe\n254800.00, 2605200.00, 100.00\n254824.00, 2605200.00, 100.00'}
                    className="w-full px-2.5 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-mono focus:outline-none focus:border-teal-600/60 placeholder:opacity-40"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] uppercase tracking-wider opacity-60">Datum for the volume</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setDatumMode('toe')}
                      className={`px-3 py-1 rounded-lg text-xs border ${
                        datumMode === 'toe' ? 'bg-teal-600/15 border-teal-600/50' : 'border-black/10 dark:border-white/10'
                      }`}
                    >
                      Lowest surveyed point
                    </button>
                    <button
                      onClick={() => setDatumMode('rl')}
                      className={`px-3 py-1 rounded-lg text-xs border ${
                        datumMode === 'rl' ? 'bg-teal-600/15 border-teal-600/50' : 'border-black/10 dark:border-white/10'
                      }`}
                    >
                      Stated level
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {datumMode === 'rl' && <Field label="Datum level" unit="m RL" value={datumRl} onChange={setDatumRl} />}
                  <Field label="Loose density" unit="kg/m³" value={looseDensity} onChange={setLooseDensity} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Base radius" unit="m" value={baseR} onChange={setBaseR} />
                {pileMethod === 'frustum' && <Field label="Top radius" unit="m" value={topR} onChange={setTopR} />}
                <Field label="Height" unit="m" value={pileH} onChange={setPileH} />
                <Field label="Loose density" unit="kg/m³" value={looseDensity} onChange={setLooseDensity} />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Volume &amp; tonnage</h2>

            {pileMethod === 'surface' ? (
              surface.ok ? (
                <>
                  <Row label="Points used" value={`${surface.tin.points.length}`} />
                  <Row label="Triangles" value={`${surface.tin.triangles.length}`} />
                  {surface.breaklineCount > 0 && (
                    <Row
                      label="Breaklines"
                      value={`${surface.breaklineCount} line${surface.breaklineCount === 1 ? '' : 's'}, ${surface.constraintCount} segment${surface.constraintCount === 1 ? '' : 's'} held`}
                    />
                  )}
                  <Row label="Surveyed range" value={`${fmt(surface.lowest, 2)} – ${fmt(surface.highest, 2)} m RL`} />
                  <Row
                    label="Datum"
                    value={`${fmt(surface.datumZ, 2)} m RL${datumMode === 'toe' ? ' (lowest point)' : ''}`}
                  />
                  <Row label="Plan area" value={`${fmt(surface.planAreaM2, 1)} m²`} />
                  <Row label="Surface area" value={`${fmt(surface.surfaceAreaM2, 1)} m²`} />
                  <Row label="Volume above datum" value={`${fmt(surface.vol.cutM3, 1)} m³`} strong />
                  <Row
                    label="Tonnage"
                    value={surface.tonnes === null ? '—' : `${fmt(surface.tonnes, 1)} t`}
                    strong
                  />
                  <Warnings items={surface.warnings} />
                  {surface.rejected.length > 0 && (
                    <div className="mt-3 rounded-lg border border-red-600/40 bg-red-500/10 p-3 space-y-1">
                      <div className="text-xs font-semibold">Lines left out</div>
                      {surface.rejected.slice(0, 5).map((r, i) => (
                        <div key={i} className="text-[11px] font-mono opacity-80 break-all">
                          {r}
                        </div>
                      ))}
                      {surface.rejected.length > 5 && (
                        <div className="text-[11px] opacity-70">and {surface.rejected.length - 5} more</div>
                      )}
                    </div>
                  )}
                  <p className="text-[11px] opacity-60 mt-3">
                    Tonnage uses the loose density of the surveyed pile. Convert to in-situ with the material's swell
                    factor before comparing against a reserve figure.
                  </p>
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-red-600/40 bg-red-500/10 px-3 py-2 text-xs">
                    {surface.error}
                  </div>
                  {surface.rejected.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {surface.rejected.slice(0, 5).map((r, i) => (
                        <div key={i} className="text-[11px] font-mono opacity-80 break-all">
                          {r}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            ) : pile.ok ? (
              <>
                <Row label="Shape" value={pile.value.shape === 'cone' ? 'Conical' : 'Flat-topped'} />
                <Row label="Volume" value={`${fmt(pile.value.volumeM3, 1)} m³`} strong />
                <Row label="Tonnage" value={`${fmt(pile.value.tonnes, 1)} t`} strong />
                <p className="text-[11px] opacity-60 mt-3">
                  Tonnage uses the loose density of the surveyed pile. Convert to in-situ with the material's swell
                  factor before comparing against a reserve figure. An idealised cone or frustum is only as good as
                  the assumption that the pile is one — measure from the pickup where you have it.
                </p>
              </>
            ) : (
              <CalcError result={pile} />
            )}
          </div>
        </div>
      )}

      {/* ---------------- Reserves ---------------- */}
      {section === 'reserve' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
            <h2 className="text-sm font-semibold">Block</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Block area" unit="m²" value={resArea} onChange={setResArea} />
              <Field label="Seam thickness" unit="m" value={seamT} onChange={setSeamT} />
              <Field label="Ore density" unit="kg/m³" value={oreDensity} onChange={setOreDensity} />
              <Field label="Recovery factor" value={recovery} onChange={setRecovery} step="0.01" />
              <Field label="Overburden thickness" unit="m" value={obT} onChange={setObT} />
              <Field label="Overburden density" unit="kg/m³" value={obDensity} onChange={setObDensity} />
            </div>
          </div>
          <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Estimate</h2>
            {reserve.ok ? (
              <>
                <Row label="In-situ volume" value={`${fmt(reserve.value.inSituVolumeM3, 1)} m³`} />
                <Row label="In-situ tonnage" value={`${fmt(reserve.value.inSituTonnes, 1)} t`} />
                <Row label="Recoverable tonnage" value={`${fmt(reserve.value.recoverableTonnes, 1)} t`} strong />
                <Row label="Overburden" value={`${fmt(reserve.value.overburdenTonnes, 1)} t`} />
                <Row label="Stripping ratio (by mass)" value={`${fmt(reserve.value.strippingRatio, 3)} : 1`} strong />
                <div className="mt-3 rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 text-xs flex gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                  <span className="opacity-90">
                    This is a geometric estimate over a single block, with no confidence category. It is a planning
                    figure, not a statement of reserves.
                  </span>
                </div>
              </>
            ) : (
              <CalcError result={reserve} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
