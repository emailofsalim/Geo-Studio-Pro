import {
  BoreholeHole,
  CadastralProfile,
  CutoffCondition,
  CutoffOp,
  MineParam,
  MineProfile
} from '../types';

/**
 * Shipped cutoff presets.
 *
 * Bauxite, iron, limestone and coal carry the thresholds from the Indian Bureau
 * of Mines guidelines that the old MiningService encoded: Al2O3 >= 40 with
 * SiO2 <= 5, Fe >= 45 with SiO2 <= 10, CaO >= 42 with SiO2 <= 12, and
 * Ash <= 35. Those were the figures the application was built around, and the
 * looser numbers that had drifted into these presets (Al2O3 >= 30, SiO2 <= 7,
 * Fe >= 55, CaO >= 44, Ash <= 34) called material ore that IBM would not.
 *
 * Conditions the IBM cutoff does not mention are kept rather than dropped --
 * bauxite's TAA presence check, coal's GCV floor and limestone's MgO ceiling --
 * because using a published cutoff is not a reason to discard a constraint the
 * profile already carried.
 *
 * A preset is a starting point, not a ruling: the rule is editable per project
 * and what was actually applied is shown on screen beside the classification.
 */
export const BORE_PRESETS: Record<string, MineProfile> = {

  bauxite: {
    name: 'Bauxite',
    pos: '#1B5E20',
    neg: '#b3261e',
    params: [
      { key: 'Al2O3', label: 'Al₂O₃', unit: '%' },
      { key: 'SiO2', label: 'SiO₂', unit: '%' },
      { key: 'TAA', label: 'TAA', unit: '' }
    ],
    rule: {
      logic: 'AND',
      minThick: 0,
      conds: [
        { param: 'Al2O3', op: 'ge', v: 40 },
        { param: 'SiO2', op: 'le', v: 5 },
        { param: 'TAA', op: 'nz' }
      ]
    }
  },
  iron: {
    name: 'Iron Ore',
    pos: '#8B1A1A',
    neg: '#5b6b80',
    params: [
      { key: 'Fe', label: 'Fe', unit: '%' },
      { key: 'SiO2', label: 'SiO₂', unit: '%' },
      { key: 'Al2O3', label: 'Al₂O₃', unit: '%' },
      { key: 'P', label: 'P', unit: '%' },
      { key: 'LOI', label: 'LOI', unit: '%' }
    ],
    rule: {
      logic: 'AND',
      minThick: 0,
      conds: [
        { param: 'Fe', op: 'ge', v: 45 },
        { param: 'SiO2', op: 'le', v: 10 }
      ]
    }
  },
  coal: {
    name: 'Coal',
    pos: '#222222',
    neg: '#b3261e',
    params: [
      { key: 'Ash', label: 'Ash', unit: '%' },
      { key: 'GCV', label: 'GCV', unit: 'kcal/kg' },
      { key: 'Moisture', label: 'Moisture', unit: '%' },
      { key: 'VM', label: 'VM', unit: '%' }
    ],
    rule: {
      logic: 'AND',
      minThick: 0.5,
      conds: [
        { param: 'GCV', op: 'ge', v: 3000 },
        { param: 'Ash', op: 'le', v: 35 }
      ]
    }
  },
  limestone: {
    name: 'Limestone',
    pos: '#1565C0',
    neg: '#b3261e',
    params: [
      { key: 'CaO', label: 'CaO', unit: '%' },
      { key: 'MgO', label: 'MgO', unit: '%' },
      { key: 'SiO2', label: 'SiO₂', unit: '%' }
    ],
    rule: {
      logic: 'AND',
      minThick: 0,
      conds: [
        { param: 'CaO', op: 'ge', v: 42 },
        { param: 'SiO2', op: 'le', v: 12 },
        { param: 'MgO', op: 'le', v: 3 }
      ]
    }
  },
  manganese: {
    name: 'Manganese',
    pos: '#6A1B9A',
    neg: '#b3261e',
    params: [
      { key: 'Mn', label: 'Mn', unit: '%' },
      { key: 'Fe', label: 'Fe', unit: '%' },
      { key: 'SiO2', label: 'SiO₂', unit: '%' }
    ],
    rule: {
      logic: 'AND',
      minThick: 0,
      conds: [{ param: 'Mn', op: 'ge', v: 30 }]
    }
  },
  chromite: {
    name: 'Chromite',
    pos: '#37474F',
    neg: '#b3261e',
    params: [
      { key: 'Cr2O3', label: 'Cr₂O₃', unit: '%' },
      { key: 'FeO', label: 'FeO', unit: '%' },
      { key: 'SiO2', label: 'SiO₂', unit: '%' },
      { key: 'CrFe', label: 'Cr:Fe', unit: '' }
    ],
    rule: {
      logic: 'AND',
      minThick: 0,
      conds: [{ param: 'Cr2O3', op: 'ge', v: 38 }]
    }
  },
  copper: {
    name: 'Copper',
    pos: '#B87333',
    neg: '#5b6b80',
    params: [
      { key: 'Cu', label: 'Cu', unit: '%' },
      { key: 'Au', label: 'Au', unit: 'g/t' },
      { key: 'Ag', label: 'Ag', unit: 'g/t' },
      { key: 'S', label: 'S', unit: '%' }
    ],
    rule: {
      logic: 'AND',
      minThick: 0,
      conds: [{ param: 'Cu', op: 'ge', v: 0.3 }]
    }
  },
  gold: {
    name: 'Gold',
    pos: '#C9A227',
    neg: '#5b6b80',
    params: [
      { key: 'Au', label: 'Au', unit: 'g/t' },
      { key: 'Ag', label: 'Ag', unit: 'g/t' }
    ],
    rule: {
      logic: 'AND',
      minThick: 1,
      conds: [{ param: 'Au', op: 'ge', v: 0.5 }]
    }
  },
  leadzinc: {
    name: 'Lead-Zinc',
    pos: '#455A64',
    neg: '#b3261e',
    params: [
      { key: 'Pb', label: 'Pb', unit: '%' },
      { key: 'Zn', label: 'Zn', unit: '%' },
      { key: 'Ag', label: 'Ag', unit: 'g/t' }
    ],
    rule: {
      logic: 'OR',
      minThick: 0,
      conds: [
        { param: 'Pb', op: 'ge', v: 2 },
        { param: 'Zn', op: 'ge', v: 3 }
      ]
    }
  },
  nickel: {
    name: 'Nickel (laterite)',
    pos: '#4E8542',
    neg: '#b3261e',
    params: [
      { key: 'Ni', label: 'Ni', unit: '%' },
      { key: 'Co', label: 'Co', unit: '%' },
      { key: 'Fe', label: 'Fe', unit: '%' },
      { key: 'MgO', label: 'MgO', unit: '%' }
    ],
    rule: {
      logic: 'AND',
      minThick: 0,
      conds: [{ param: 'Ni', op: 'ge', v: 0.9 }]
    }
  },
  phosphate: {
    name: 'Phosphate',
    pos: '#7B5E3B',
    neg: '#b3261e',
    params: [
      { key: 'P2O5', label: 'P₂O₅', unit: '%' },
      { key: 'CaO', label: 'CaO', unit: '%' },
      { key: 'SiO2', label: 'SiO₂', unit: '%' }
    ],
    rule: {
      logic: 'AND',
      minThick: 0,
      conds: [{ param: 'P2O5', op: 'ge', v: 20 }]
    }
  },
  lignite: {
    name: 'Lignite',
    pos: '#5D4037',
    neg: '#b3261e',
    params: [
      { key: 'GCV', label: 'GCV', unit: 'kcal/kg' },
      { key: 'Ash', label: 'Ash', unit: '%' },
      { key: 'Moisture', label: 'Moisture', unit: '%' },
      { key: 'Sulphur', label: 'S', unit: '%' }
    ],
    rule: {
      logic: 'AND',
      minThick: 0.5,
      conds: [{ param: 'GCV', op: 'ge', v: 2500 }]
    }
  },
  silica: {
    name: 'Silica Sand',
    pos: '#8fd0ff',
    neg: '#b3261e',
    params: [
      { key: 'SiO2', label: 'SiO₂', unit: '%' },
      { key: 'Fe2O3', label: 'Fe₂O₃', unit: '%' },
      { key: 'Al2O3', label: 'Al₂O₃', unit: '%' }
    ],
    rule: {
      logic: 'AND',
      minThick: 0,
      conds: [
        { param: 'SiO2', op: 'ge', v: 95 },
        { param: 'Fe2O3', op: 'le', v: 0.1 }
      ]
    }
  },
  generic: {
    name: 'Generic',
    pos: '#0e7c86',
    neg: '#b3261e',
    params: [{ key: 'Grade', label: 'Grade', unit: '%' }],
    rule: {
      logic: 'AND',
      minThick: 0,
      conds: [{ param: 'Grade', op: 'ge', v: 0 }]
    }
  }
};

export const CAD_PRESETS: Record<string, CadastralProfile> = {
  jharkhand: {
    name: 'Jharkhand (CLR)',
    accent: '#EA580C',
    areaUnit: 'ha',
    fields: [
      { key: 'Village', label: 'Village' },
      { key: 'Thana', label: 'Thana' },
      { key: 'ThanaNo', label: 'Thana No' },
      { key: 'District', label: 'District' },
      { key: 'State', label: 'State' },
      { key: 'Khata', label: 'Khata No' },
      { key: 'Part_Whole', label: 'Part / Whole' },
      { key: 'Land_Class', label: 'Land Class' },
      { key: 'Owner', label: 'Owner Name' },
      { key: 'Ownership', label: 'Ownership' },
      { key: 'Lease', label: 'Lease' },
      { key: 'Remarks', label: 'Remarks' }
    ]
  },
  generic: {
    name: 'Generic Cadastre',
    accent: '#0e7c86',
    areaUnit: 'ha',
    fields: [
      { key: 'Owner', label: 'Owner' },
      { key: 'Khata', label: 'Khata/Survey No' },
      { key: 'Land_Class', label: 'Class' },
      { key: 'Village', label: 'Village/Mouza' },
      { key: 'District', label: 'District' },
      { key: 'State', label: 'State' },
      { key: 'Lease', label: 'Project' },
      { key: 'Remarks', label: 'Remarks' }
    ]
  },
  revenue: {
    name: 'Revenue (Survey/Sub-div)',
    accent: '#1565C0',
    areaUnit: 'acre',
    fields: [
      { key: 'SurveyNo', label: 'Survey No' },
      { key: 'SubDiv', label: 'Sub-division' },
      { key: 'Owner', label: 'Pattadar' },
      { key: 'Village', label: 'Village' },
      { key: 'Mandal', label: 'Mandal/Taluk' },
      { key: 'District', label: 'District' },
      { key: 'Land_Class', label: 'Classification' },
      { key: 'Lease', label: 'Project' },
      { key: 'Remarks', label: 'Remarks' }
    ]
  }
};

/**
 * Reads back a cutoff profile saved from a previous session.
 *
 * A cutoff grade decides what counts as ore, so restoring one that is not
 * exactly what was saved would be worse than restoring nothing. Anything that
 * does not validate is refused and the reason returned, so the caller can fall
 * back to a published preset **and say so**. Silently substituting a different
 * rule is the failure this whole path exists to prevent: the numbers would
 * change under the user while the screen still read "Bauxite".
 *
 * Returns `profile: null` with `issue: null` when nothing was saved at all,
 * which is the ordinary first-run case and not worth a warning.
 */
export function restoreMineProfile(raw: string | null | undefined): {
  profile: MineProfile | null;
  issue: string | null;
} {
  if (raw == null || raw.trim() === '') return { profile: null, issue: null };

  const refuse = (why: string) => ({
    profile: null,
    issue: `A saved cutoff rule could not be read (${why}), so the published preset is in use. Check it before classifying.`
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return refuse('it is not readable');
  }
  if (typeof parsed !== 'object' || parsed === null) return refuse('it is not a profile');

  const p = parsed as Record<string, unknown>;
  if (typeof p.name !== 'string' || p.name.trim() === '') return refuse('it has no name');

  if (!Array.isArray(p.params) || p.params.length === 0) return refuse('it lists no parameters');
  const params: MineParam[] = [];
  for (const raw of p.params) {
    if (typeof raw !== 'object' || raw === null) return refuse('a parameter is malformed');
    const q = raw as Record<string, unknown>;
    if (typeof q.key !== 'string' || q.key.trim() === '') return refuse('a parameter has no key');
    params.push({
      key: q.key,
      label: typeof q.label === 'string' ? q.label : q.key,
      unit: typeof q.unit === 'string' ? q.unit : ''
    });
  }

  const rule = p.rule as Record<string, unknown> | undefined;
  if (typeof rule !== 'object' || rule === null) return refuse('it has no rule');
  if (rule.logic !== 'AND' && rule.logic !== 'OR') return refuse('its logic is not AND or OR');
  if (typeof rule.minThick !== 'number' || !isFinite(rule.minThick) || rule.minThick < 0) {
    return refuse('its minimum thickness is not a length');
  }
  if (!Array.isArray(rule.conds) || rule.conds.length === 0) return refuse('it sets no conditions');

  const OPS: CutoffOp[] = ['ge', 'le', 'gt', 'lt', 'eq', 'ne', 'between', 'nz', 'blank'];
  const keys = new Set(params.map(q => q.key));
  const conds: CutoffCondition[] = [];
  for (const raw of rule.conds) {
    if (typeof raw !== 'object' || raw === null) return refuse('a condition is malformed');
    const c = raw as Record<string, unknown>;
    if (typeof c.param !== 'string' || !keys.has(c.param)) {
      return refuse('a condition tests a parameter the profile does not carry');
    }
    if (typeof c.op !== 'string' || !OPS.includes(c.op as CutoffOp)) {
      return refuse('a condition uses an unknown comparison');
    }
    const op = c.op as CutoffOp;

    // Only 'nz' and 'blank' take no threshold. For every other comparison a
    // missing or non-numeric bound would decide ore against a value that is
    // not a number, so it is refused rather than guessed at.
    const needsBound = op !== 'nz' && op !== 'blank';
    if (needsBound && (typeof c.v !== 'number' || !isFinite(c.v))) {
      return refuse('a threshold is missing or is not a number');
    }
    if (op === 'between' && (typeof c.v2 !== 'number' || !isFinite(c.v2))) {
      return refuse('a range is missing its upper bound');
    }
    conds.push({
      param: c.param,
      op,
      v: needsBound ? (c.v as number) : null,
      v2: op === 'between' ? (c.v2 as number) : null
    });
  }

  return {
    profile: {
      name: p.name,
      pos: typeof p.pos === 'string' ? p.pos : '#1B5E20',
      neg: typeof p.neg === 'string' ? p.neg : '#b3261e',
      params,
      rule: { logic: rule.logic, minThick: rule.minThick, conds }
    },
    issue: null
  };
}

/** The active rule in one line, for a report header or an export column. */
export function cutoffRuleText(profile: MineProfile): string {
  const conds = profile.rule?.conds || [];
  if (!conds.length) return 'No rule set';
  const parts = conds.map(c => {
    if (c.op === 'nz' || c.op === 'blank') return `${c.param} ${boreOpSym(c.op)}`;
    const bound = c.v == null ? '(not set)' : String(c.v);
    const upper = c.op === 'between' ? `..${c.v2 == null ? '(not set)' : String(c.v2)}` : '';
    return `${c.param} ${boreOpSym(c.op)} ${bound}${upper}`;
  });
  const joined = parts.join(` ${profile.rule.logic} `);
  const thick = profile.rule.minThick > 0 ? `, minimum thickness ${profile.rule.minThick} m` : '';
  return `${joined}${thick}`;
}

export function boreEval(val: number | null, c: CutoffCondition): boolean {
  const op = c.op;
  if (op === 'nz') return val != null && val !== 0;
  if (op === 'blank') return val == null || val === 0;
  if (val == null) return false;
  const a = parseFloat(String(c.v));
  const b = parseFloat(String(c.v2));
  switch (op) {
    case 'ge': return val >= a;
    case 'le': return val <= a;
    case 'gt': return val > a;
    case 'lt': return val < a;
    case 'eq': return val === a;
    case 'ne': return val !== a;
    case 'between': return val >= Math.min(a, b) && val <= Math.max(a, b);
  }
  return false;
}

export function boreOpSym(op: string): string {
  const map: Record<string, string> = {
    ge: '≥', le: '≤', gt: '>', lt: '<', eq: '=', ne: '≠',
    between: 'between', nz: 'not blank/0', blank: 'blank/0'
  };
  return map[op] || op;
}

export function boreClassifyInterval(vals: Record<string, number | null>, rule: MineProfile['rule']) {
  const conds = rule?.conds || [];
  if (!conds.length) return { isOre: false, text: 'No rule set' };
  const res = conds.map(c => boreEval(vals[c.param], c));
  const isOre = rule.logic === 'OR' ? res.some(Boolean) : res.every(Boolean);
  let text: string;
  if (isOre) {
    text = 'Qualifies';
  } else {
    const fails: string[] = [];
    conds.forEach((c, i) => {
      if (!res[i]) {
        let s = `${c.param} ${boreOpSym(c.op)}`;
        if (c.op !== 'nz' && c.op !== 'blank') {
          // A cleared threshold shows as "not set" rather than the literal
          // "undefined". The interval still fails, which is the safe direction:
          // an unset cutoff must never classify barren material as ore.
          const bound = c.v == null ? '(not set)' : String(c.v);
          const upper = c.op === 'between' ? '..' + (c.v2 == null ? '(not set)' : String(c.v2)) : '';
          s += ` ${bound}${upper}`;
        }
        fails.push(s);
      }
    });
    text = fails.length
      ? rule.logic === 'OR' ? `needs ${fails.join(' or ')}` : `fails ${fails.join('; ')}`
      : 'Not highlighted';
  }
  return { isOre, text };
}

export function boreSummary(hole: BoreholeHole, profile: MineProfile) {
  let ore = 0, ob = 0, ib = 0, seams = 0, prev = false, seen = false;
  const sums: Record<string, number> = {};
  (profile.params || []).forEach(p => { sums[p.key] = 0; });

  hole.intervals.forEach(iv => {
    const thk = iv.to - iv.from || 0;
    if (iv.isOre) {
      ore += thk;
      if (!prev) seams++;
      prev = true;
      seen = true;
      (profile.params || []).forEach(p => {
        const v = iv.vals[p.key];
        if (v != null) sums[p.key] += v * thk;
      });
    } else {
      prev = false;
      if (!seen) ob += thk;
      else ib += thk;
    }
  });

  const wmeans: Record<string, number | null> = {};
  (profile.params || []).forEach(p => {
    wmeans[p.key] = ore > 0 ? sums[p.key] / ore : null;
  });

  const minThk = profile.rule?.minThick || 0;
  return {
    oreThk: ore,
    ob,
    ib,
    seams,
    positive: ore > 0 && ore >= minThk,
    strip: ore > 0 ? ob / ore : null,
    wmeans
  };
}



export const MINE_PROFILES = BORE_PRESETS;
export const DEFAULT_PROFILES = BORE_PRESETS;

