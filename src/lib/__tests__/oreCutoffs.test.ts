import { describe, it, expect } from 'vitest';
import { BORE_PRESETS, boreClassifyInterval, cutoffRuleText } from '../mineProfiles';

const classify = (key: string, vals: Record<string, number | null>) =>
  boreClassifyInterval(vals, BORE_PRESETS[key].rule);

describe('shipped ore cutoffs follow the IBM figures', () => {
  it('bauxite needs Al2O3 at or above 40', () => {
    // The drifted preset called 30% ore. IBM does not.
    expect(classify('bauxite', { Al2O3: 40, SiO2: 4, TAA: 1 }).isOre).toBe(true);
    expect(classify('bauxite', { Al2O3: 39.9, SiO2: 4, TAA: 1 }).isOre).toBe(false);
    expect(classify('bauxite', { Al2O3: 30, SiO2: 4, TAA: 1 }).isOre,
      '30% Al2O3 was ore under the old preset').toBe(false);
  });

  it('bauxite rejects silica above 5', () => {
    expect(classify('bauxite', { Al2O3: 45, SiO2: 5, TAA: 1 }).isOre).toBe(true);
    expect(classify('bauxite', { Al2O3: 45, SiO2: 5.1, TAA: 1 }).isOre).toBe(false);
    expect(classify('bauxite', { Al2O3: 45, SiO2: 7, TAA: 1 }).isOre,
      '7% silica passed under the old preset').toBe(false);
  });

  it('iron needs Fe at or above 45, not 55', () => {
    // This one goes the other way: material between 45 and 55 is ore under IBM
    // and was being called barren.
    expect(classify('iron', { Fe: 45, SiO2: 5 }).isOre).toBe(true);
    expect(classify('iron', { Fe: 50, SiO2: 5 }).isOre,
      '50% Fe was barren under the old preset').toBe(true);
    expect(classify('iron', { Fe: 44.9, SiO2: 5 }).isOre).toBe(false);
  });

  it('iron also carries the silica ceiling of 10', () => {
    // The old preset had no silica condition at all, so high-silica iron was
    // classified on Fe alone.
    expect(classify('iron', { Fe: 60, SiO2: 10 }).isOre).toBe(true);
    expect(classify('iron', { Fe: 60, SiO2: 10.1 }).isOre).toBe(false);
  });

  it('limestone needs CaO at or above 42 and silica at or below 12', () => {
    expect(classify('limestone', { CaO: 42, SiO2: 12, MgO: 2 }).isOre).toBe(true);
    expect(classify('limestone', { CaO: 41.9, SiO2: 12, MgO: 2 }).isOre).toBe(false);
    expect(classify('limestone', { CaO: 45, SiO2: 12.1, MgO: 2 }).isOre).toBe(false);
  });

  it('coal allows ash up to 35', () => {
    expect(classify('coal', { GCV: 4000, Ash: 35 }).isOre).toBe(true);
    expect(classify('coal', { GCV: 4000, Ash: 35.1 }).isOre).toBe(false);
  });

  it('keeps the conditions the IBM cutoff does not mention', () => {
    // Using a published cutoff is not a reason to discard a constraint the
    // profile already carried.
    expect(classify('bauxite', { Al2O3: 50, SiO2: 2, TAA: null }).isOre,
      'bauxite still requires a TAA reading').toBe(false);
    // A recorded zero is a reading, but it is not a presence. Added after a
    // mutation check showed the null case alone could not tell the presence
    // test apart from a "greater than or equal to zero" threshold, which every
    // reading passes.
    expect(classify('bauxite', { Al2O3: 50, SiO2: 2, TAA: 0 }).isOre,
      'a TAA of zero is not a presence').toBe(false);
    expect(classify('bauxite', { Al2O3: 50, SiO2: 2, TAA: 3 }).isOre,
      'a real TAA reading passes').toBe(true);
    expect(classify('coal', { GCV: 2000, Ash: 10 }).isOre,
      'coal still requires its GCV floor').toBe(false);
    expect(classify('limestone', { CaO: 50, SiO2: 5, MgO: 4 }).isOre,
      'limestone still rejects high magnesia').toBe(false);
  });

  it('a missing assay is never ore', () => {
    // An interval with no reading for a parameter the rule needs must not be
    // classified as ore on the strength of the readings that are present.
    expect(classify('iron', { Fe: 60, SiO2: null }).isOre).toBe(false);
    expect(classify('bauxite', { Al2O3: null, SiO2: 2, TAA: 1 }).isOre).toBe(false);
  });

  it('states the rule that was applied, with its numbers', () => {
    // The classification is only meaningful next to the cutoff that produced
    // it, and the screen shows this string beside the verdict.
    expect(cutoffRuleText(BORE_PRESETS.bauxite)).toContain('Al2O3');
    expect(cutoffRuleText(BORE_PRESETS.bauxite)).toContain('40');
    expect(cutoffRuleText(BORE_PRESETS.bauxite)).toContain('5');
    expect(cutoffRuleText(BORE_PRESETS.iron)).toContain('45');
    expect(cutoffRuleText(BORE_PRESETS.limestone)).toContain('42');
    expect(cutoffRuleText(BORE_PRESETS.coal)).toContain('35');
  });

  it('renders a zero or unset threshold as something other than blank', () => {
    // The screen used to build this line itself with `${c.v || ''}`, so a
    // threshold of 0 printed as "Grade >= " -- which reads like a rule. It now
    // uses this helper, which prints the number, and "(not set)" when there is
    // none.
    expect(cutoffRuleText(BORE_PRESETS.generic)).toMatch(/Grade\s*[^\s]+\s*0/);
    const unset = { ...BORE_PRESETS.iron, rule: { logic: 'AND' as const, minThick: 0,
      conds: [{ param: 'Fe', op: 'ge' as const, v: null as any }] } };
    expect(cutoffRuleText(unset)).toContain('(not set)');
  });
});
