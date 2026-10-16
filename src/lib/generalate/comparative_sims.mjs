// comparative_sims.mjs — comparative GENERALATE campaign simulations.
// Runs 5 policies x 30 seeds through the actual production engine.
// Read-only w.r.t. production files: imports engine.js, never modifies it.
// Run: node comparative_sims.mjs
import { setGameData, FIXTURES } from './data.js';
import * as eng from './engine.js';
import * as rules from './rules.js';

setGameData(FIXTURES);

// --- deterministic PRNG for policy E (mulberry32) ---
function prng(seedStr) {
  let h = 1779033703;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- helpers ---
function openMissions(state) {
  return Object.keys(state.missions || {}).filter(
    (id) => (state.destState[id] || {}).access !== 'closed'
  );
}

function missionRatio(state, id) {
  const st = eng.missionStaff(state, id);
  return eng.missionStaffed(st) / (st.capacity || 5);
}

function lowestStaffedMission(state) {
  const open = openMissions(state);
  if (!open.length) return null;
  return open.reduce((a, b) => (missionRatio(state, a) <= missionRatio(state, b) ? a : b));
}

function fragileMissions(state) {
  return Object.keys(state.missions || {}).filter(
    (id) => eng.missionStaff(state, id).fragile === true
  );
}

function zealOf(state, petitionerId) {
  try {
    return eng.ensureDisposition(state, petitionerId).current?.zeal ?? 3;
  } catch { return 3; }
}

// Uncapped score delta for one resolved year (avoids the 0-100 display cap).
function yearUncappedDelta(state, r, year) {
  let d = 0;
  for (const o of (r.yearReport?.outcomes || [])) {
    if (o.outcome === 'thriving') d += rules.SCORE.FRUIT.thriving;
    else if (o.outcome === 'deceased') d += rules.SCORE.FRUIT.deceased;
    else if (o.outcome === 'ill') d += rules.SCORE.FRUIT.ill;
    else if (o.outcome === 'returned' || o.outcome === 'reassigned') d += 1;
    else if (o.outcome === 'veteran') d += rules.VETERAN.SCORE;
  }
  d += (state.novitiates || []).length * rules.SCORE.NOVITIATE_YEARLY;
  for (const e of eng.getLedger(state)) {
    if (e.year === year && e.type === 'instruction' && typeof e.text === 'string') {
      if (e.text.includes('(+1 score)')) d += 1;
      if (e.text.includes('(-1 score)')) d -= 1;
    }
  }
  return d;
}

// --- policies ---
// Each policy: { decide(state, terna) -> decisions[], postDecide(state, result, terna) -> void }

const policies = {
  A: {
    name: 'A baseline',
    decide(state, terna) {
      return terna.length ? [{ id: terna[0].petitionerId }] : [];
    },
  },
  B: {
    name: 'B mission-first',
    decide(state, terna) {
      return terna.map((t) => ({ id: t.petitionerId }));
    },
    postDecide(state) {
      const target = lowestStaffedMission(state);
      if (target) {
        try { eng.issueInstruction(state, target, 'expand'); } catch { /* in transit/closed */ }
      }
    },
  },
  C: {
    name: 'C domestic-first',
    decide(state, terna) {
      return terna.length ? [{ id: terna[0].petitionerId }] : [];
    },
    postDecide(state, result) {
      for (const d of (result.denied || [])) {
        for (const role of ['teaching', 'pastoral']) {
          try { eng.assignDomestic(state, d.petitionerId, role); break; }
          catch { /* ineligible or already assigned */ }
        }
      }
      if (state.resources.funds > 1000 && !(state.novitiates || []).length) {
        const first = openMissions(state)[0];
        if (first) {
          try { eng.foundNovitiate(state, first); } catch { /* funds/closed */ }
        }
      }
    },
  },
  D: {
    name: 'D balanced',
    decide(state, terna) {
      return terna
        .filter((t) => zealOf(state, t.petitionerId) >= 4)
        .map((t) => ({ id: t.petitionerId }));
    },
    postDecide(state, result) {
      for (const d of (result.denied || [])) {
        for (const role of ['teaching', 'pastoral', 'formationAid', 'studies']) {
          try { eng.assignDomestic(state, d.petitionerId, role); break; }
          catch { /* ineligible or already assigned */ }
        }
      }
      for (const mid of fragileMissions(state)) {
        if ((state.destState[mid] || {}).access === 'closed') continue;
        try { eng.issueInstruction(state, mid, 'consolidate'); } catch { /* in transit */ }
      }
    },
  },
  E: {
    name: 'E poor',
    decide(state, terna) {
      if (!terna.length) return [];
      const rand = prng(state.seed + ':' + state.year);
      const pick = terna[Math.floor(rand() * terna.length)];
      return [{ id: pick.petitionerId }];
    },
  },
};

function runCampaign(policyKey, seed) {
  const policy = policies[policyKey];
  const s = eng.newGame({ mode: 'campaign', seed });
  const m = {
    policy: policyKey, seed,
    uncapped: 50, thriving: 0, deaths: 0,
    ill: 0, returned: 0, veterans: 0,
    novitiatesFounded: 0,
    error: null,
  };
  try {
    for (let y = 0; y < 30; y++) {
      const { terna } = eng.startYear(s);
      const decisions = policy.decide(s, terna);
      const result = eng.decide(s, decisions);
      if (policy.postDecide) {
        try { policy.postDecide(s, result, terna); } catch (e) {
          m.error = (m.error ? m.error + ' | ' : '') + 'postDecide: ' + e.message;
        }
        // track novitiate foundings by this policy
        if (policyKey === 'C') m.novitiatesFounded = (s.novitiates || []).length;
      }
      const r = eng.resolveYear(s);
      m.uncapped += yearUncappedDelta(s, r, s.year - 1);
      for (const o of (r.yearReport?.outcomes || [])) {
        if (o.outcome === 'thriving') m.thriving++;
        else if (o.outcome === 'deceased') m.deaths++;
        else if (o.outcome === 'ill') m.ill++;
        else if (o.outcome === 'returned' || o.outcome === 'reassigned') m.returned++;
        else if (o.outcome === 'veteran') m.veterans++;
      }
      if (s.ended) break;
    }
  } catch (e) {
    m.error = (m.error ? m.error + ' | ' : '') + 'campaign: ' + e.message;
  }
  // final state metrics
  try {
    m.pool = s.available;
    m.funds = s.resources.funds;
    m.domesticAssigned = (s.europeanLabor || []).filter((e) => e.assignment).length;
    m.instructionsIssued = eng.getLedger(s, { type: 'instruction', decision: 'issued' }).length;
    m.vocations = eng.getLedger(s, { type: 'vocation' }).length;
    m.fragileMissions = fragileMissions(s).length;
    m.cappedScore = eng.getScore(s);
    m.yearsCompleted = s.year - 1615;
  } catch (e) {
    m.error = (m.error ? m.error + ' | ' : '') + 'metrics: ' + e.message;
  }
  return m;
}

// --- run ---
const SEEDS = [];
for (let i = 1; i <= 30; i++) SEEDS.push('cmp' + i);

const results = [];
const t0 = Date.now();
for (const pkey of Object.keys(policies)) {
  for (const seed of SEEDS) {
    results.push(runCampaign(pkey, seed));
  }
  console.log(`Policy ${pkey} done (${Date.now() - t0}ms elapsed)`);
}

// --- aggregate ---
function stats(arr) {
  const xs = arr.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!xs.length) return { n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const mid = Math.floor(xs.length / 2);
  const median = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  return { n: xs.length, mean: +mean.toFixed(2), median: +median.toFixed(2), min: xs[0], max: xs[xs.length - 1] };
}

const summary = {};
for (const pkey of Object.keys(policies)) {
  const rs = results.filter((r) => r.policy === pkey);
  summary[pkey] = {
    name: policies[pkey].name,
    score: stats(rs.map((r) => r.uncapped)),
    thriving: stats(rs.map((r) => r.thriving)),
    deaths: stats(rs.map((r) => r.deaths)),
    pool: stats(rs.map((r) => r.pool)),
    funds: stats(rs.map((r) => r.funds)),
    domesticAssigned: stats(rs.map((r) => r.domesticAssigned)),
    instructionsIssued: stats(rs.map((r) => r.instructionsIssued)),
    vocations: stats(rs.map((r) => r.vocations)),
    fragileMissions: stats(rs.map((r) => r.fragileMissions)),
    errors: rs.filter((r) => r.error).map((r) => ({ seed: r.seed, error: r.error })),
  };
}

const out = {
  generatedAt: new Date().toISOString(),
  seeds: SEEDS.length,
  yearsPerCampaign: 30,
  summary,
  campaigns: results,
};

import { writeFileSync } from 'fs';
writeFileSync(
  new URL('./comparative_results.json', import.meta.url),
  JSON.stringify(out, null, 2)
);
console.log('Wrote comparative_results.json');
console.log(JSON.stringify(summary, null, 2));
