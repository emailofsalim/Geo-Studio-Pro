import { describe, it, expect } from 'vitest';
import { computeDifferentialLeveling, LevelingRow } from '../geodesy';

// A textbook run, worked by hand rather than by this function.
//
//   BM     BS 1.500                       RL 100.000   HI 101.500
//   A      IS 1.200                       RL 100.300
//   CP1    FS 0.800  BS 2.000             RL 100.700   HI 102.700
//   B      FS 1.100                       RL 101.600
//
// Checks: SBS - SFS  = 3.500 - 1.900 = 1.600
//         SRise - SFall = 1.600 - 0.000 = 1.600
//         last RL - first RL = 101.600 - 100.000 = 1.600
const run: LevelingRow[] = [
  { stn: 'BM', bs: 1.5 },
  { stn: 'A', is: 1.2 },
  { stn: 'CP1', fs: 0.8, bs: 2.0 },
  { stn: 'B', fs: 1.1 }
];

describe('differential levelling', () => {
  it('reduces a hand-worked run to the levels a surveyor would book', () => {
    const r = computeDifferentialLeveling(100, run);
    expect(r.rows.map(x => +x.rl.toFixed(3))).toEqual([100.0, 100.3, 100.7, 101.6]);
  });

  it('carries the height of instrument through each change point', () => {
    const r = computeDifferentialLeveling(100, run);
    expect(r.rows[0].hi).toBeCloseTo(101.5, 9);
    expect(r.rows[2].hi).toBeCloseTo(102.7, 9);
  });

  it('books the rises and falls that go with those levels', () => {
    const r = computeDifferentialLeveling(100, run);
    expect(r.rows[1].rise).toBeCloseTo(0.3, 9);
    expect(r.rows[2].rise).toBeCloseTo(0.4, 9);
    expect(r.rows[3].rise).toBeCloseTo(0.9, 9);
    expect(r.rows.every(x => x.fall === undefined)).toBe(true);
  });

  it('agrees on all three arithmetic checks', () => {
    const r = computeDifferentialLeveling(100, run);
    expect(r.sumBS - r.sumFS).toBeCloseTo(1.6, 9);
    expect(r.sumRise - r.sumFall).toBeCloseTo(1.6, 9);
    expect(r.lastRL - r.initialRL).toBeCloseTo(1.6, 9);
  });

  it('books a fall as a fall when the ground drops', () => {
    const down: LevelingRow[] = [
      { stn: 'BM', bs: 0.5 },
      { stn: 'A', is: 1.9 },
      { stn: 'B', fs: 2.4 }
    ];
    const r = computeDifferentialLeveling(50, down);
    expect(r.rows[1].fall).toBeCloseTo(1.4, 9);
    expect(r.rows[2].fall).toBeCloseTo(0.5, 9);
    expect(r.rows.map(x => +x.rl.toFixed(3))).toEqual([50.0, 48.6, 48.1]);
    expect(r.sumRise - r.sumFall).toBeCloseTo(r.lastRL - r.initialRL, 9);
  });

  it('reports the run it was given, not one it invented', () => {
    const r = computeDifferentialLeveling(100, run);
    expect(r.rows).toHaveLength(run.length);
    expect(r.rows[0].rl).toBe(100);
    expect(r.initialRL).toBe(100);
  });

  it('a misread foresight is not an arithmetic error, and is not claimed to be', () => {
    // Worth stating because it is easy to expect otherwise: misreading the
    // foresight at B by 0.050 m shifts all three routes together. The
    // arithmetic checks verify the booking, not the reading, so they pass --
    // correctly. They are not a substitute for a closing run to a known BM.
    const misread: LevelingRow[] = [
      { stn: 'BM', bs: 1.5 },
      { stn: 'A', is: 1.2 },
      { stn: 'CP1', fs: 0.8, bs: 2.0 },
      { stn: 'B', fs: 1.15 }
    ];
    const r = computeDifferentialLeveling(100, misread);
    expect(r.checkBS_FS).toBeCloseTo(r.checkRL, 9);
    expect(r.checkRiseFall).toBeCloseTo(r.checkRL, 9);
    expect(r.checkPassed).toBe(true);
  });

  it('does not book a rise to a station nobody sighted', () => {
    // A row carrying only a backsight has no sighting to reduce. Reading the
    // missing value as zero booked a rise equal to the whole previous reading:
    // station X climbed 1.500 m on the strength of a backsight at the BM.
    const rows: LevelingRow[] = [
      { stn: 'BM', bs: 1.5 },
      { stn: 'X', bs: 2.0 },
      { stn: 'B', fs: 1.1 }
    ];
    const r = computeDifferentialLeveling(100, rows);
    expect(r.rows[1].rl, 'X is not lifted 1.5 m by a reading that does not exist')
      .toBeCloseTo(100, 9);
    expect(r.rows[1].rise).toBeUndefined();
    expect(r.rows[1].fall).toBeUndefined();
    expect(r.rows[1].remarks).toMatch(/not determined/i);
  });

  it('fails the check when the independent rise/fall route disagrees', () => {
    // A station booked with BOTH an intermediate sight and a foresight is a
    // booking error, and it is exactly the error the rise/fall route exists to
    // catch: the reduction takes its level from the foresight while the rise is
    // measured to the intermediate.
    //
    // The verdict used to compare only SBS-SFS against the change in RL. Both
    // are consequences of the same height-of-instrument reduction, so here they
    // agree at 0.100 m while the rise/fall route reads 0.300 -- and the sheet
    // was reported as arithmetically verified.
    const r = computeDifferentialLeveling(100, [
      { stn: 'BM', bs: 1.5 },
      { stn: 'A', is: 1.2, fs: 1.4 }
    ]);
    expect(r.checkBS_FS).toBeCloseTo(0.1, 9);
    expect(r.checkRL).toBeCloseTo(0.1, 9);
    expect(r.checkRiseFall, 'the independent route is adrift').toBeCloseTo(0.3, 9);
    expect(r.checkPassed, 'the verdict must follow the worst of the three, not the two that cannot disagree')
      .toBe(false);
    expect(r.riseFallDiff).toBeCloseTo(0.2, 9);
  });

  it('still passes a run that closes on all three routes', () => {
    // The stricter verdict must not simply refuse everything.
    expect(computeDifferentialLeveling(100, run).checkPassed).toBe(true);
  });

  it('reports each of the three checks so a failure can be located', () => {
    const r = computeDifferentialLeveling(100, run);
    expect(r.checkBS_FS).toBeCloseTo(1.6, 9);
    expect(r.checkRiseFall).toBeCloseTo(1.6, 9);
    expect(r.checkRL).toBeCloseTo(1.6, 9);
    expect(r.riseFallDiff).toBeCloseTo(0, 9);
  });
});
