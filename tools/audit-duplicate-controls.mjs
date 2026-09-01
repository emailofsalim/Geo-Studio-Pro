// ============================================================================
// Duplicate-control audit
// ----------------------------------------------------------------------------
// Visits every application screen, enumerates the controls actually rendered,
// and groups them by label to find the same control offered twice.
//
// WHY THIS RUNS AGAINST THE RENDERED SCREEN, NOT THE SOURCE
//
// Grepping the source is misleading in both directions. Several tabs contain
// seven download calls but never show more than one or two at a time, so the
// source over-reports; and two controls can carry the same label from entirely
// different files, which the source under-reports.
//
// A repeated label is not automatically a defect. Three "Delete Layer" buttons
// beside three different layers are correct. So instances are classified: if
// each one sits in its own structurally identical parent, it is a rendered
// list; otherwise the same control is genuinely on screen twice.
//
// Usage:
//   npm run build && npx vite preview --port 4200 --strictPort &
//   node tools/audit-duplicate-controls.mjs [port]
// ============================================================================

import { chromium } from 'playwright-core';
const TABS = ['My Projects (Home)','Project Dashboard','GNSS Field Survey','GIS Map Studio',
  'Cadastral Land Mapper','Borehole Stratigraphy','GPS Map Camera','Coordinate Converter',
  'Survey Calculator','Field Sensors & Theodolite','Geofence Sentinel','BhuNaksha Digitizer',
  'Universal Converter','Merge & Split Polygons','Boundary Offset & Buffer','Tutorials & Guides',
  'Mining Studio','Reports','Help & Documentation'];

const PORT = process.argv[2] || '4200';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:1500,height:1000}});
await p.route('**://*', r => /localhost/.test(r.request().url()) ? r.continue() : r.abort());
await p.goto('http://localhost:4202/',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(3000);
const go=async n=>{for(let i=0;i<4;i++){const ok=await p.evaluate(x=>{const e=[...document.querySelectorAll('button,a,[role=button]')];
  const t=e.find(y=>(y.textContent||'').trim().startsWith(x)); if(t){t.click();return true;}
  const m=e.find(y=>/MORE TOOLS/i.test(y.textContent||'')); if(m)m.click(); return false;},n);
  await p.waitForTimeout(650); if(ok) return true;} return false;};

// A repeated list action shares a grandparent whose siblings look alike.
// A true duplicate does not: its instances sit in structurally different places.
const scan = () => p.evaluate(() => {
  const norm = t => (t||'').trim().replace(/\s+/g,' ');
  const vis = el => { const r=el.getBoundingClientRect(), s=getComputedStyle(el);
    return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
  const nav = document.querySelector('aside, nav');
  const all=[...document.querySelectorAll('button,[role=button]')].filter(vis)
    .filter(el=>!(nav&&nav.contains(el)));
  const key = el => norm(el.textContent) || norm(el.getAttribute('aria-label')) || norm(el.getAttribute('title'));
  const groups={};
  for (const el of all){ const k=key(el); if(k) (groups[k] ||= []).push(el); }

  const out=[];
  for (const [k,els] of Object.entries(groups)){
    if (els.length<2) continue;
    // Are they siblings in one repeated container? -> list action, not a duplicate.
    const parents = els.map(e=>e.parentElement);
    const grandparents = els.map(e=>e.parentElement?.parentElement);
    const sameParent = new Set(parents).size===1;
    const sameGrandparent = new Set(grandparents).size===1;
    // Repeated rows: each instance has a DIFFERENT parent but those parents
    // share one container and have identical tag+class -> a rendered list.
    const parentSigs = new Set(parents.map(x=>x? x.tagName+'|'+(x.className||'') : ''));
    const parentsAlike = parentSigs.size===1 && new Set(parents).size===els.length;
    const listLike = parentsAlike || (sameGrandparent && new Set(parents).size===els.length);
    out.push({ label:k, n:els.length, kind: listLike ? 'list-repeat' : 'DUPLICATE',
      sameParent, positions: els.map(e=>{const r=e.getBoundingClientRect();return `${Math.round(r.x)},${Math.round(r.y)}`;}) });
  }
  return out;
});

for (const tab of TABS){
  await go('My Projects (Home)'); await go(tab); await p.waitForTimeout(1000);
  const r=await scan();
  const real=r.filter(x=>x.kind==='DUPLICATE');
  const lists=r.filter(x=>x.kind==='list-repeat');
  if (real.length||lists.length)
    console.log(`${tab.padEnd(28)} true-duplicates=${real.length} ${real.length?JSON.stringify(real.map(x=>`${x.label||'(icon)'} x${x.n} @${x.positions.join(' ')}`)):''}  [list-repeats: ${lists.length}]`);
  else console.log(`${tab.padEnd(28)} clean`);
}
await b.close();
