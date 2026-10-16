// baseline_sims.mjs — baseline GENERALATE campaign simulations using the
// production engine (read-only; no engine modifications).
// Run with: node baseline_sims.mjs
import { setGameData, FIXTURES } from './data.js';
import {
  newGame, startYear, decide, resolveYear,
  missionStaff, missionStaffed, ensureDisposition,
} from './engine.js';

setGameData(FIXTURES);

// Uncapped score tracking (mirrors rules SCORE.FRUIT): thriving +4,
// reassigned +1, returned +1, ill -2, deceased -5. Start 50.
const FRUIT = { thriving: 4, reassigned: 1, returned: 1, ill: -2, deceased: -5 };

// --- Policies (each receives (state, terna) and returns decisions) ---
const policies = {
  'approve-first': (s, terna) =>
    terna.slice(0, 1).map((t) => ({ id: t.petitionerId })),
  'approve-all': (s, terna) =>
    terna.map((t) => ({ id: t.petitionerId })),
  selective: (s, terna) =>
    terna
      .filter((t) => {
        const d = ensureDisposition(s, t.petitionerId);
        const z = d.current?.zeal ?? 3;
        const p = d.current?.prudence ?? 3;
        return z >= 4 && p >= 4;
      })
      .map((t) => ({ id: t.petitionerId })),
};

function runCampaign(policyFn, seed, years = 30) {
  const s = newGame({ mode: 'campaign', seed });
  let uncapped = 50;
  let thriving = 0, deaths = 0, ill = 0, returned = 0;
  for (let y = 0; y < years; y++) {
    const { terna } = startYear(s);
    decide(s, policyFn(s, terna));
    const r = resolveYear(s);
    for (const o of r.yearReport?.outcomes || []) {
      if (o.outcome === 'thriving') { thriving++; uncapped += FRUIT.thriving; }
      else if (o.outcome === 'deceased') { deaths++; uncapped += FRUIT.deceased; }
      else if (o.outcome === 'ill') { ill++; uncapped += FRUIT.ill; }
      else if (o.outcome === 'returned' || o.outcome === 'reassigned') {
        returned++; uncapped += FRUIT.returned;
      }
    }
    if (s.ended) break;
  }
  let staffed = 0, fragile = 0;
  for (const destId of Object.keys(s.missions || {})) {
    const st = missionStaff(s, destId);
    staffed += missionStaffed(st);
    if ((st.fragileYears || 0) >= 3) fragile++;
  }
  return {
    seed,
    uncapped: Math.round(uncapped * 10) / 10,
    thriving, deaths, ill, returned,
    pool: s.available,
    funds: Math.round(s.resources.funds),
    staffed,
    fragileMissions: fragile,
  };
}

const results = {};
const errors = [];
for (const [name, fn] of Object.entries(policies)) {
  results[name] = [];
  for (let i = 1; i <= 30; i++) {
    const seed = 'base' + i;
    try {
      results[name].push(runCampaign(fn, seed));
    } catch (e) {
      errors.push({ policy: name, seed, error: String(e && e.message || e) });
    }
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  years: 30,
  seeds: Array.from({ length: 30 }, (_, i) => 'base' + (i + 1)),
  results,
  errors,
};

import { writeFileSync } from 'fs';
writeFileSync(
  new URL('./baseline_results.json', import.meta.url),
  JSON.stringify(out, null, 2)
);
console.log('Wrote baseline_results.json');
console.log('Errors:', errors.length);
for (const e of errors) console.log('  ', e.policy, e.seed, e.error);
for (const [name, rows] of Object.entries(results)) {
  const n = rows.length;
  const mean = (f) => (rows.map(f).reduce((a, b) => a + b, 0) / n).toFixed(1);
  console.log(
    `${name}: n=${n} uncapped=${mean((r) => r.uncapped)} thrive=${mean((r) => r.thriving)} ` +
    `deaths=${mean((r) => r.deaths)} ill=${mean((r) => r.ill)} returned=${mean((r) => r.returned)} ` +
    `pool=${mean((r) => r.pool)} funds=${mean((r) => r.funds)} staffed=${mean((r) => r.staffed)} ` +
    `fragile=${mean((r) => r.fragileMissions)}`
  );
}
