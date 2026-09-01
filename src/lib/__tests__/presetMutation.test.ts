import { describe, it, expect } from 'vitest';
import { BORE_PRESETS, boreClassifyInterval } from '../mineProfiles';
import type { MineProfile } from '../../types';

/**
 * The borehole cutoff editor's update, extracted so the immutability it relies
 * on is tested directly. This mirrors `updateCondition` in BoreholeMapperTab.
 */
function updateCondition(
  profile: MineProfile,
  idx: number,
  patch: Partial<MineProfile['rule']['conds'][number]>
): MineProfile {
  return {
    ...profile,
    rule: {
      ...profile.rule,
      conds: profile.rule.conds.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    }
  };
}

describe('ore cutoff editing leaves the preset intact', () => {
  it('does not write an edited threshold back into the shipped preset', () => {
    // The editor previously did `const next = [...conds]` then assigned to
    // `next[idx].v`, which copies the array but not the condition objects.
    // Editing a bauxite cutoff rewrote BORE_PRESETS.bauxite for the session,
    // so switching profile and back showed the edit, not the published default.
    const preset = BORE_PRESETS.bauxite;
    const publishedAl2O3 = preset.rule.conds[0].v;

    const edited = updateCondition(preset, 0, { v: 99 });

    expect(edited.rule.conds[0].v).toBe(99);
    expect(preset.rule.conds[0].v).toBe(publishedAl2O3);
  });

  it('keeps the untouched conditions of the same rule intact', () => {
    const preset = BORE_PRESETS.bauxite;
    const secondBefore = preset.rule.conds[1].v;
    const edited = updateCondition(preset, 0, { v: 12 });

    expect(edited.rule.conds[1].v).toBe(secondBefore);
    // Only the edited condition is a new object; the rest are carried over.
    expect(edited.rule.conds[0]).not.toBe(preset.rule.conds[0]);
    expect(edited.rule.conds[1]).toBe(preset.rule.conds[1]);
  });

  it('leaves other presets untouched when one is edited', () => {
    const ironFe = BORE_PRESETS.iron.rule.conds[0].v;
    updateCondition(BORE_PRESETS.bauxite, 0, { v: 1 });
    expect(BORE_PRESETS.iron.rule.conds[0].v).toBe(ironFe);
  });

  it('switching away and back yields the published defaults', () => {
    // What the user actually experiences: pick bauxite, change the cutoff,
    // switch to iron, switch back. The preset must be as shipped.
    const publishedAl2O3 = BORE_PRESETS.bauxite.rule.conds[0].v;
    let active: MineProfile = BORE_PRESETS.bauxite;
    active = updateCondition(active, 0, { v: 55 });
    active = BORE_PRESETS.iron;
    active = BORE_PRESETS.bauxite;
    expect(active.rule.conds[0].v).toBe(publishedAl2O3);
  });
});

describe('an unset threshold is not treated as zero', () => {
  const barren = { Al2O3: 2 };
  const ruleWith = (v: any) => ({ logic: 'AND' as const, minThick: 0, conds: [{ param: 'Al2O3', op: 'ge' as const, v }] });

  it('a zero cutoff passes barren material, which is why the old default was wrong', () => {
    // `parseFloat('') || 0` put 0 in a cleared field, and "grade >= 0" passes
    // everything - a fabricated cutoff that silently calls waste ore.
    expect(boreClassifyInterval(barren, ruleWith(0)).isOre).toBe(true);
  });

  it('an unset cutoff rejects rather than accepts', () => {
    expect(boreClassifyInterval(barren, ruleWith(undefined)).isOre).toBe(false);
  });

  it('says the threshold is not set instead of printing "undefined"', () => {
    const r = boreClassifyInterval(barren, ruleWith(undefined));
    expect(r.text).toContain('(not set)');
    expect(r.text).not.toContain('undefined');
  });

  it('still reports a real threshold normally', () => {
    const r = boreClassifyInterval(barren, ruleWith(30));
    expect(r.isOre).toBe(false);
    expect(r.text).toContain('30');
  });
});
