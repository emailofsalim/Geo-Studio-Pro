import { BoreholeHole, BoreInterval, CadastralProfile, CutoffCondition, MineProfile } from '../types';
import { lonLatToUtm, utmToLonLat } from './geodesy';
import { csvEnc, toCSVtext, xmlesc } from './formats';

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
        { param: 'Al2O3', op: 'ge', v: 30 },
        { param: 'SiO2', op: 'le', v: 7 },
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
      conds: [{ param: 'Fe', op: 'ge', v: 55 }]
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
        { param: 'Ash', op: 'le', v: 34 }
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
        { param: 'CaO', op: 'ge', v: 44 },
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

export function boreCardHTML(hole: BoreholeHole, profile: MineProfile) {
  const u = lonLatToUtm(hole.lon, hole.lat, hole.zone, hole.south);
  const S = boreSummary(hole, profile);
  const bBg = S.positive ? (profile.pos || '#1B5E20') : (profile.neg || '#b3261e');
  const bTxt = S.positive ? 'POSITIVE' : 'NEGATIVE';
  const params = profile.params || [];

  const chip = (bg: string, label: string, val: string) => `
    <td style="padding:0 5px 5px 0">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-radius:4px;overflow:hidden">
        <tr>
          <td style="background:${bg};padding:4px 8px;color:#fff;font-size:8px;font-weight:bold;white-space:nowrap">${label}</td>
          <td style="background:#DCE4EA;padding:4px 9px;color:#12395C;font-size:10px;font-weight:bold;white-space:nowrap">${val}</td>
        </tr>
      </table>
    </td>`;

  let h = `
  <div style="font-family:Segoe UI,Calibri,Arial,sans-serif;width:${Math.max(520, 300 + params.length * 60)}px;max-width:720px;color:#1B2A38;background:#fff">
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
      <tr>
        <td style="background:#12395C;padding:8px 11px">
          <div style="color:#fff;font-size:15px;font-weight:bold">BOREHOLE ${xmlesc(hole.id)}</div>
          <div style="color:#9FC3DC;font-size:8px;margin-top:1px">${xmlesc(hole.project || profile.name || '')}</div>
        </td>
        <td style="background:${bBg};padding:8px 11px;text-align:right;white-space:nowrap">
          <span style="color:#fff;font-size:10px;font-weight:bold;letter-spacing:1px">${bTxt}</span>
        </td>
      </tr>
    </table>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#DDE4EA;border-bottom:2px solid #12395C">
      <tr>
        <td style="padding:4px 9px;border-right:1px solid #fff"><div style="font-size:7px;color:#4A6274">EASTING (m)</div><div style="font-size:10px;color:#12395C;font-weight:bold">${u.E.toFixed(3)}</div></td>
        <td style="padding:4px 9px;border-right:1px solid #fff"><div style="font-size:7px;color:#4A6274">NORTHING (m)</div><div style="font-size:10px;color:#12395C;font-weight:bold">${u.N.toFixed(3)}</div></td>
        <td style="padding:4px 9px;border-right:1px solid #fff"><div style="font-size:7px;color:#4A6274">COLLAR RL</div><div style="font-size:10px;color:#12395C;font-weight:bold">${hole.rl != null ? hole.rl.toFixed(2) + ' m' : '-'}</div></td>
        <td style="padding:4px 9px;"><div style="font-size:7px;color:#4A6274">END OF HOLE</div><div style="font-size:10px;color:#12395C;font-weight:bold">${hole.eoh != null ? hole.eoh.toFixed(2) + ' m' : '-'}</div></td>
      </tr>
    </table>
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top:7px">
      <tr>
        ${chip('#A1795A', 'OVERBURDEN', S.ob.toFixed(2) + ' m')}
        ${chip(bBg, 'ORE', S.oreThk.toFixed(2) + ' m')}
        ${chip('#78909C', 'INTERBURDEN', S.ib.toFixed(2) + ' m')}
        ${chip('#37474F', 'SEAMS', String(S.seams))}
      </tr>
      <tr>
        ${params.map(p => {
          const v = S.wmeans[p.key];
          return chip('#2E7D32', `WT.${String(p.key).toUpperCase()}`, v != null ? v.toFixed(2) + (p.unit ? ` ${p.unit}` : '') : '-');
        }).join('')}
      </tr>
      <tr>
        ${chip('#5D4037', 'STRIP RATIO', S.strip != null ? S.strip.toFixed(2) + ' : 1' : '-')}
        ${chip('#6A1B9A', 'LON / LAT', `${hole.lon.toFixed(5)}, ${hole.lat.toFixed(5)}`)}
      </tr>
    </table>
    <div style="margin-top:11px;font-size:10px;font-weight:bold;color:#12395C;border-bottom:2px solid #12395C;padding-bottom:3px">COMPOSITE CORE LOG</div>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:3px;border-collapse:collapse">
      <tr>
        <td style="background:#12395C;color:#fff;font-size:8px;font-weight:bold;padding:5px 6px;text-align:left">FROM - TO m</td>
        <td style="background:#12395C;color:#fff;font-size:8px;font-weight:bold;padding:5px 6px;text-align:left">LITHOLOGY</td>
        <td style="background:#12395C;color:#fff;font-size:8px;font-weight:bold;padding:5px 6px;text-align:right">THK</td>
        ${params.map(p => `<td style="background:#12395C;color:#fff;font-size:8px;font-weight:bold;padding:5px 6px;text-align:right">${xmlesc(p.key.toUpperCase() + (p.unit ? ' ' + p.unit : ''))}</td>`).join('')}
        <td style="background:#12395C;color:#fff;font-size:8px;font-weight:bold;padding:5px 6px;text-align:left">ORE LOGIC</td>
      </tr>`;

  hole.intervals.forEach(iv => {
    const thk = ((iv.to - iv.from) || 0).toFixed(2);
    const rail = iv.isOre ? bBg : '#E7EDF1';
    const bg = '#F3F7FA';
    h += `
      <tr>
        <td style="border-left:4px solid ${rail};border-bottom:1px solid #CBD5DC;padding:5px 6px;font-size:9px;text-align:right;background:${bg}">
          <b style="color:#12395C">${iv.from.toFixed(2)}</b> - ${iv.to.toFixed(2)}
        </td>
        <td style="border-bottom:1px solid #CBD5DC;padding:5px 6px;font-size:9px;color:#33485A;background:${bg}">${xmlesc(iv.lith || '-')}</td>
        <td style="border-bottom:1px solid #CBD5DC;padding:5px 6px;font-size:9px;text-align:right;background:${bg}">${thk}</td>
        ${params.map(p => `<td style="border-bottom:1px solid #CBD5DC;padding:5px 6px;font-size:9px;text-align:right;background:${bg}">${iv.vals[p.key] != null ? (iv.vals[p.key] as number).toFixed(2) : '-'}</td>`).join('')}
        <td style="border-bottom:1px solid #CBD5DC;padding:5px 6px;font-size:8px;color:${iv.isOre ? '#1B5E20' : '#617584'};background:${bg}">${xmlesc(iv.logic)}</td>
      </tr>`;
  });

  h += `
    </table>
    <div style="margin-top:8px;padding-top:5px;border-top:1px solid #C3CDD4;font-size:7px;color:#617584;line-height:11px">
      Profile: ${xmlesc(profile.name)} | BhuNex Studio | UTM ${hole.zone}${hole.south ? 'S' : 'N'} / WGS84
    </div>
  </div>`;

  return h;
}

export function cadCardHTML(plotNo: string, rec: Record<string, any> | undefined, areaHa: number, profile: CadastralProfile) {
  const accent = profile.accent || '#EA580C';
  const areaTxt = profile.areaUnit === 'acre' ? `${(areaHa * 2.4710538147).toFixed(4)} acre` : `${areaHa.toFixed(4)} ha`;
  let h = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;width:460px;color:#1F2937">
    <div style="background:${accent};color:#fff;padding:8px 12px;border-radius:4px 4px 0 0">
      <div style="font-size:18px;font-weight:700">Plot ${xmlesc(plotNo)}</div>
      <div style="font-size:10px">${xmlesc((rec && (rec.Lease || rec.Project)) || profile.name)}</div>
    </div>
    <div style="background:#F3F4F6;padding:6px 10px;font-weight:700;color:#111827;border-top:2px solid ${accent};font-size:11px">Land Record Details</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <tr>
        <td style="padding:5px 8px;border-bottom:1px solid #E5E7EB;font-weight:600;color:#4B5563;width:44%">Plot No</td>
        <td style="padding:5px 8px;border-bottom:1px solid #E5E7EB"><b>${xmlesc(plotNo)}</b></td>
      </tr>`;

  (profile.fields || []).forEach((f, i) => {
    const v = (rec && rec[f.key] != null && String(rec[f.key]).trim() !== '') ? rec[f.key] : '-';
    h += `
      <tr style="${i % 2 ? 'background:#F9FAFB' : ''}">
        <td style="padding:5px 8px;border-bottom:1px solid #E5E7EB;font-weight:600;color:#4B5563">${xmlesc(f.label)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #E5E7EB">${xmlesc(v)}</td>
      </tr>`;
  });

  h += `
      <tr>
        <td style="padding:5px 8px;border-bottom:1px solid #E5E7EB;font-weight:600;color:#4B5563">Computed Area</td>
        <td style="padding:5px 8px;border-bottom:1px solid #E5E7EB"><b>${areaTxt}</b> (${(areaHa * 10000).toFixed(1)} m²)</td>
      </tr>
    </table>
  </div>`;
  return h;
}

export const MINE_PROFILES = BORE_PRESETS;
export const DEFAULT_PROFILES = BORE_PRESETS;

