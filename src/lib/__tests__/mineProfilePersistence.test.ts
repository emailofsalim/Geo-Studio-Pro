import { describe, it, expect } from 'vitest';
import {
  BORE_PRESETS,
  restoreMineProfile,
  cutoffRuleText,
  boreClassifyInterval
} from '../mineProfiles';
import type { MineProfile } from '../../types';

// ---------------------------------------------------------------------------
// Restoring a saved cutoff rule
// ---------------------------------------------------------------------------
// A cutoff grade decides what counts as ore, so a rule that comes back even
// slightly different from the one that was saved is worse than no rule at all:
// the tonnage changes and the screen still shows the same commodity name.
// Everything here is about refusing rather than guessing.

const save = (p: MineProfile) => JSON.stringify(p);

describe('restoreMineProfile', () => {
  it('reports nothing when nothing was ever saved', () => {
    for (const empty of [null, undefined, '', '   ']) {
      const r = restoreMineProfile(empty);
      expect(r.profile).toBeNull();
      // A first run is not a fault, so it must not raise a warning.
      expect(r.issue).toBeNull();
    }
  });

  it.each(Object.keys(BORE_PRESETS))('round trips the %s preset unchanged', key => {
    const original = BORE_PRESETS[key];
    const { profile, issue } = restoreMineProfile(save(original));
    expect(issue).toBeNull();
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe(original.name);
    expect(profile!.rule.logic).toBe(original.rule.logic);
    expect(profile!.rule.minThick).toBe(original.rule.minThick);
    expect(profile!.rule.conds.length).toBe(original.rule.conds.length);
  });

  it('restores a rule that classifies exactly as the saved one did', () => {
    // The real invariant. Shape equality is not the point — a restored rule
    // that admits one interval the original refused is a wrong reserve.
    const edited: MineProfile = JSON.parse(JSON.stringify(BORE_PRESETS.bauxite));
    edited.rule.conds[0].v = 40; // a contract cutoff, not the published one
    edited.rule.minThick = 1.5;

    const { profile } = restoreMineProfile(save(edited));
    expect(profile).not.toBeNull();

    for (let al = 25; al <= 55; al += 0.5) {
      for (const si of [2, 6.9, 7, 7.1, 12]) {
        const vals = { Al2O3: al, SiO2: si, TAA: 1 };
        const before = boreClassifyInterval(vals, edited.rule);
        const after = boreClassifyInterval(vals, profile!.rule);
        expect(after.isOre, `Al2O3 ${al}, SiO2 ${si}`).toBe(before.isOre);
        expect(after.text).toBe(before.text);
      }
    }
  });

  it('refuses anything it cannot read, and says why', () => {
    const bad: [string, string][] = [
      ['not json at all', 'unreadable'],
      ['"a string"', 'not an object'],
      ['null', 'null'],
      ['{}', 'no name'],
      ['{"name":"X"}', 'no params'],
      ['{"name":"X","params":[]}', 'empty params'],
      ['{"name":"X","params":[{"key":"Fe"}]}', 'no rule'],
      ['{"name":"X","params":[{"key":"Fe"}],"rule":{"logic":"MAYBE","minThick":0,"conds":[]}}', 'bad logic'],
      ['{"name":"X","params":[{"key":"Fe"}],"rule":{"logic":"AND","minThick":-1,"conds":[]}}', 'negative thickness'],
      ['{"name":"X","params":[{"key":"Fe"}],"rule":{"logic":"AND","minThick":0,"conds":[]}}', 'no conditions']
    ];
    for (const [raw, label] of bad) {
      const r = restoreMineProfile(raw);
      expect(r.profile, label).toBeNull();
      expect(r.issue, label).toBeTruthy();
      // The warning has to be usable: it names the fallback and the action.
      expect(r.issue, label).toContain('preset');
    }
  });

  it('refuses a threshold that is missing or not a number', () => {
    // The dangerous case. A cutoff of "undefined" compared with >= yields
    // false for every value, so a silent restore would classify a whole
    // deposit as barren while the screen still read "Al2O3 >= 30".
    const base = { name: 'X', params: [{ key: 'Fe', label: 'Fe', unit: '%' }] };
    for (const cond of [
      { param: 'Fe', op: 'ge' },
      { param: 'Fe', op: 'ge', v: null },
      { param: 'Fe', op: 'ge', v: 'fifty' },
      { param: 'Fe', op: 'ge', v: NaN },
      { param: 'Fe', op: 'between', v: 10 }
    ]) {
      const raw = JSON.stringify({ ...base, rule: { logic: 'AND', minThick: 0, conds: [cond] } });
      const r = restoreMineProfile(raw);
      expect(r.profile, JSON.stringify(cond)).toBeNull();
      expect(r.issue, JSON.stringify(cond)).toBeTruthy();
    }
  });

  it('accepts the two operators that legitimately carry no threshold', () => {
    const raw = JSON.stringify({
      name: 'X',
      params: [{ key: 'TAA', label: 'TAA', unit: '' }],
      rule: { logic: 'AND', minThick: 0, conds: [{ param: 'TAA', op: 'nz' }] }
    });
    const r = restoreMineProfile(raw);
    expect(r.issue).toBeNull();
    expect(r.profile!.rule.conds[0].op).toBe('nz');
  });

  it('refuses a condition testing a parameter the profile does not carry', () => {
    // Otherwise the lookup yields undefined, every interval fails, and the
    // deposit reads as barren for a reason nothing on screen explains.
    const raw = JSON.stringify({
      name: 'X',
      params: [{ key: 'Fe', label: 'Fe', unit: '%' }],
      rule: { logic: 'AND', minThick: 0, conds: [{ param: 'Cu', op: 'ge', v: 1 }] }
    });
    const r = restoreMineProfile(raw);
    expect(r.profile).toBeNull();
    expect(r.issue).toContain('preset');
  });
});

describe('cutoffRuleText', () => {
  it('states the shipped bauxite rule in full', () => {
    expect(cutoffRuleText(BORE_PRESETS.bauxite))
      .toBe('Al2O3 ≥ 30 AND SiO2 ≤ 7 AND TAA not blank/0');
  });

  it('includes a minimum thickness when one is set', () => {
    expect(cutoffRuleText(BORE_PRESETS.coal))
      .toBe('GCV ≥ 3000 AND Ash ≤ 34, minimum thickness 0.5 m');
  });

  it('marks a threshold that is not set rather than printing undefined', () => {
    const p: MineProfile = JSON.parse(JSON.stringify(BORE_PRESETS.iron));
    p.rule.conds[0].v = null;
    expect(cutoffRuleText(p)).toBe('Fe ≥ (not set)');
  });

  it('distinguishes two rules that differ only in a threshold', () => {
    // The whole point of putting this in an export: the profile name is the
    // same in both, so the name alone cannot tell them apart.
    const a: MineProfile = JSON.parse(JSON.stringify(BORE_PRESETS.bauxite));
    const b: MineProfile = JSON.parse(JSON.stringify(BORE_PRESETS.bauxite));
    b.rule.conds[0].v = 40;
    expect(a.name).toBe(b.name);
    expect(cutoffRuleText(a)).not.toBe(cutoffRuleText(b));
  });
});
