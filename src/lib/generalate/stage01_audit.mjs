// Stage 0 + Stage 1 audit harness for GENERALATE.
// Stage 0: validates the scoreUncapped engine instrumentation; reports capped
//   + uncapped scores, milestone years, yearly trajectories, and score
//   attribution; regresses capped results against balance_audit.mjs.
// Stage 1: six fixed policies (incl. full-toolkit terna) x 20 seeds, natural
//   operating levels, with matched-volume analysis.
// Development-only. No production mechanics are modified by this file.
// Run: node stage01_audit.mjs
import { setGameData, FIXTURES } from './data.js';
import {
  newGame, startYear, decide, resolveYear,
  ensureDisposition,
  orderDeployment, selectDeploymentMembers, deploymentCandidates,
  deploymentEligible,
  assignFormation,
  dispatchMission, foundNovitiate, issueInstruction,
  missionStaff, missionStaffed,
  DEPLOYMENT_MIN_SIZE,
} from './engine.js';
import { SCORE } from './rules.js';

setGameData(FIXTURES);

const YEARS = 30;
const SEEDS = Array.from({ length: 20 }, (_, i) => `s1-${String(i + 1).padStart(2, '0')}`);
// Same seed family as the previous audit, for the capped-score regression.
const OLD_SEEDS = Array.from({ length: 20 }, (_, i) => `bal-${String(i + 1).padStart(2, '0')}`);

// ---------------------------------------------------------------- helpers
function traitsOf(state, id) {
  return ensureDisposition(state, id).current || {};
}
function bestFirst(state, terna) {
  return [...terna].sort((a, b) => {
    const ta = traitsOf(state, a.petitionerId), tb = traitsOf(state, b.petitionerId);
    return ((tb.zeal ?? 3) + (tb.prudence ?? 3)) - ((ta.zeal ?? 3) + (ta.prudence ?? 3));
  });
}
/** Men laboring in Europe who may receive formation, longest-waiting first. */
function formationCands(s) {
  return (s.europeanLabor || [])
    .filter((e) => deploymentEligible(s, e))
    .sort((a, b) => (a.year - b.year) || (a.petitionerId < b.petitionerId ? -1 : 1));
}
/** Destination with the most voyages (or thriving outcomes when byThriving). */
function topDestination(s, byThriving = false) {
  const counts = new Map();
  for (const v of (s.voyages || [])) {
    if (byThriving && v.outcome !== 'thriving') continue;
    counts.set(v.destination, (counts.get(v.destination) || 0) + 1);
  }
  let best = null, n = 0;
  for (const [d, c] of counts) if (c > n) { n = c; best = d; }
  return best;
}
function mostStaffed(s) {
  let best = null, n = 0;
  for (const id of Object.keys(s.missions || {})) {
    const k = missionStaffed(missionStaff(s, id));
    if (k > n) { n = k; best = id; }
  }
  return best;
}
function tryDeploy(s, count, destId = 'goa', purpose = 'reinforce') {
  const n = Math.min(count, deploymentCandidates(s).length);
  if (n < DEPLOYMENT_MIN_SIZE) return 0;
  try {
    const ids = selectDeploymentMembers(s, { count: n });
    orderDeployment(s, { destId, purpose, memberIds: ids });
    return ids.length;
  } catch (e) { return 0; }
}

// ---------------------------------------------------------------- policies
// Every policy below is fixed before running. All use only engine functions
// reachable from the production UI (companions steppers, formation list,
// mission dispatch panel, novitiate founding, instruction sending) and only
// information visible to the player (card traits, funds, mission panels).
// No policy receives extra knowledge, resources, or initial conditions.
const STAGE1_POLICIES = {
  // 1. Terna baseline: approve the single most promising man each year
  //    (highest zeal+prudence); no companions, no formation, no investment.
  'terna-baseline': {
    run: (s, terna) => ({
      decisions: terna.length ? [{ id: bestFirst(s, terna)[0].petitionerId, companions: 0 }] : [],
    }),
  },
  // 2. Terna full toolkit: trait-selected approvals with companions on the
  //    top candidate, yearly formation, periodic mission-strength
  //    reinforcement, one novitiate, yearly encouragement of the
  //    best-staffed mission. Thresholds are deliberately permissive (small
  //    solvency buffer only): the point is to exercise every preparation
  //    lever the rules permit. Shortfalls delay gracefully via existing
  //    mechanics; upkeep can never drive funds negative.
  'terna-toolkit': {
    run: (s, terna, y, ctx) => {
      const funds = s.resources.funds;
      const ranked = bestFirst(s, terna);
      const decisions = ranked.slice(0, 2).map((c, i) => ({
        id: c.petitionerId,
        companions: i === 0 && funds >= 600 ? 2 : 0,
      }));
      const formations = funds >= 400 ? formationCands(s).slice(0, 1).map((e) => e.petitionerId) : [];
      const dispatches = [];
      if (y % 10 === 9 && funds >= 1200) {
        const d = topDestination(s);
        if (d) dispatches.push({ destId: d, counts: { fathers: 2 } });
      }
      const novitiates = [];
      if (!ctx.novFounded && funds >= 1500) {
        const d = topDestination(s, true) || topDestination(s);
        if (d) novitiates.push(d);
      }
      const instructions = [];
      const md = mostStaffed(s);
      if (md && !(s.instructions[md] && s.instructions[md].status === 'in-transit')) {
        instructions.push({ destId: md, type: 'encourage' });
      }
      return { decisions, formations, dispatches, novitiates, instructions };
    },
  },
  // 2b. Terna volume control: two trait-selected approvals per year, but NO
  //    preparation spending (no companions, formation, investment). Isolates
  //    the throughput effect from the preparation effect in terna-toolkit.
  'terna-volume': {
    run: (s, terna) => ({
      decisions: bestFirst(s, terna).slice(0, 2).map((c) => ({ id: c.petitionerId, companions: 0 })),
    }),
  },
  // 2c. Terna patient investor: one trait-selected approval per year, no
  //    companions/formation; saves the chest for institutional investment —
  //    one novitiate and periodic mission-strength reinforcement. Tests
  //    whether the investment levers (never affordable under the spendthrift
  //    toolkit policy) can compete with raw throughput.
  'terna-patient': {
    run: (s, terna, y, ctx) => {
      const funds = s.resources.funds;
      const ranked = bestFirst(s, terna);
      const dispatches = [];
      if (y % 5 === 4 && funds >= 1500) {
        const d = topDestination(s);
        if (d) dispatches.push({ destId: d, counts: { fathers: 2 } });
      }
      const novitiates = [];
      if (!ctx.novFounded && funds >= 2000) {
        const d = topDestination(s, true) || topDestination(s);
        if (d) novitiates.push(d);
      }
      return {
        decisions: ranked.length ? [{ id: ranked[0].petitionerId, companions: 0 }] : [],
        dispatches, novitiates,
      };
    },
  },
  // 3. Deployment-only: deny every terna; deploy up to 6 every 3rd year.
  'deployment-only': {
    run: (s, terna, y) => ({ decisions: [], deploys: y % 3 === 2 ? [{ count: 6 }] : [] }),
  },
  // 4. Mixed: prepared terna channel (top-1 + companions + light formation)
  //    plus deployments of up to 4 every 4th year.
  'mixed': {
    run: (s, terna, y) => {
      const funds = s.resources.funds;
      const ranked = bestFirst(s, terna);
      return {
        decisions: ranked.length
          ? [{ id: ranked[0].petitionerId, companions: funds >= 600 ? 2 : 0 }]
          : [],
        formations: funds >= 400 ? formationCands(s).slice(0, 1).map((e) => e.petitionerId) : [],
        deploys: y % 4 === 3 ? [{ count: 4 }] : [],
      };
    },
  },
  // 5. Conservative: deny every terna; deploy up to 5 every 5th year
  //    (~30 men total, volume-matched to terna-baseline).
  'conservative': {
    run: (s, terna, y) => ({ decisions: [], deploys: y % 5 === 4 ? [{ count: 5 }] : [] }),
  },
  // 6. No-dispatch control.
  'no-dispatch': { run: () => ({ decisions: [] }) },
};

// Exact copies of the previous audit's five policies, for the Stage 0
// capped-score regression (identical seeds, identical policies, new engine).
const REGRESSION_POLICIES = {
  'terna-only': (s, terna) => ({ decisions: terna.length ? [{ id: bestFirst(s, terna)[0].petitionerId }] : [], deploys: [] }),
  'deployment-only': (s, terna, yi) => ({ decisions: [], deploys: yi % 3 === 2 ? [{ count: 6 }] : [] }),
  'mixed': (s, terna, yi) => ({
    decisions: terna.length ? [{ id: bestFirst(s, terna)[0].petitionerId }] : [],
    deploys: yi % 4 === 3 ? [{ count: 4 }] : [],
  }),
  'conservative': (s, terna, yi) => ({ decisions: [], deploys: yi % 5 === 4 ? [{ count: 5 }] : [] }),
  'no-dispatch': (s) => ({ decisions: [], deploys: [] }),
};

// ---------------------------------------------------------------- campaign
function runCampaign(seed, policy, years = YEARS) {
  const s = newGame({ mode: 'campaign', seed });
  const ctx = {};
  const m = {
    seed,
    milestones: {},
    traj: [],
    thriving: 0, returned: 0, ill: 0, deceased: 0, reassigned: 0,
    voyages: 0, souls: 0, deployVoyages: 0, approved: 0, deployed: 0,
    destinations: new Set(),
    formations: 0, companions: 0, instructions: 0, novitiates: 0,
    instYearly: 0,
    spend: { seal: 0, departures: 0, formation: 0, mission: 0, novitiate: 0 },
  };
  const spendWrap = (key, fn) => {
    const f0 = s.resources.funds;
    const r = fn();
    m.spend[key] += Math.max(0, f0 - s.resources.funds);
    return r;
  };
  for (let y = 0; y < years; y++) {
    const { terna } = startYear(s);
    const a = policy.run(s, terna || [], y, ctx) || {};
    // 1. formation (uses europeanLabor; must precede departures)
    for (const pid of (a.formations || [])) {
      try {
        spendWrap('formation', () => assignFormation(s, pid, 'studies'));
        m.formations += 1;
      } catch (e) { /* ineligible by now; skip */ }
    }
    // 2. terna decision (seal + companion commitments)
    const r0 = spendWrap('seal', () => decide(s, a.decisions || []));
    m.approved += r0.approved.length;
    // 3. collective deployments
    for (const d of (a.deploys || [])) {
      const n = tryDeploy(s, d.count || 0, d.destId || 'goa', d.purpose || 'reinforce');
      m.deployed += n;
    }
    // 4. mission-strength dispatch
    for (const d of (a.dispatches || [])) {
      try {
        spendWrap('mission', () => dispatchMission(s, d.destId, d.counts || {}));
      } catch (e) { /* unaffordable/closed; skip */ }
    }
    // 5. novitiate founding (once)
    for (const destId of (a.novitiates || [])) {
      try {
        spendWrap('novitiate', () => foundNovitiate(s, destId));
        m.novitiates += 1;
        ctx.novFounded = true;
      } catch (e) { /* unaffordable/closed; retry next year */ }
    }
    // 6. instructions
    for (const ins of (a.instructions || [])) {
      try {
        issueInstruction(s, ins.destId, ins.type);
        m.instructions += 1;
      } catch (e) { /* in transit/closed; skip */ }
    }
    // 7. resolve the year; attribute new voyages' departure spend
    const v0 = s.voyages.length;
    const r = resolveYear(s);
    for (const v of s.voyages.slice(v0)) {
      m.voyages += 1;
      const souls = 1 + (v.companions || 0);
      m.souls += souls;
      m.spend.departures += 60 + 40 * (v.companions || 0);
      m.companions += v.companions || 0;
      if (v.deploymentId) m.deployVoyages += 1;
      if (v.destination) m.destinations.add(v.destination);
    }
    for (const o of (r.yearReport?.outcomes || [])) {
      if (o.outcome === 'thriving') m.thriving++;
      else if (o.outcome === 'returned') m.returned++;
      else if (o.outcome === 'ill') m.ill++;
      else if (o.outcome === 'deceased') m.deceased++;
      else if (o.outcome === 'reassigned') m.reassigned++;
    }
    m.instYearly += (s.novitiates || []).length; // engine awards +1 each per resolveYear
    for (const t of [75, 90, 100]) {
      if (!(t in m.milestones) && s.score >= t) m.milestones[t] = 1615 + y;
    }
    m.traj.push({
      y: 1615 + y, score: s.score, uncapped: Math.round(s.scoreUncapped),
      funds: s.resources.funds, avail: s.available,
    });
    if (s.ended) break;
  }
  // ---- score attribution (independent of the counter) ----
  let fruit = 0, instFound = 0;
  for (const e of (s.ledger || [])) {
    if ((e.type === 'outcome' || e.type === 'veteran') && typeof e.delta === 'number') fruit += e.delta;
    if (e.type === 'novitiate') instFound += 4; // NOVITIATE_FOUND_BONUS, deterministic
  }
  const instructions = (s.scoreUncapped - SCORE.START) - fruit - instFound - m.instYearly;
  m.attrib = {
    fruitfulness: fruit,
    institutionalFounding: instFound,
    institutionalYearly: m.instYearly,
    instructions: Math.round(instructions * 100) / 100,
    // internal-consistency check: categories must rebuild the counter exactly
    rebuildsCounter: Math.abs(50 + fruit + instFound + m.instYearly + instructions - s.scoreUncapped) < 1e-9,
  };
  return {
    ...m,
    destinations: [...m.destinations],
    nDestinations: m.destinations.size,
    finalScore: s.score,
    uncapped: Math.round(s.scoreUncapped * 100) / 100,
    finalFunds: s.resources.funds,
    pool: s.available,
  };
}

// ---------------------------------------------------------------- stats
function stats(xs) {
  const srt = [...xs].sort((a, b) => a - b);
  const n = xs.length;
  const mean = xs.reduce((a, x) => a + x, 0) / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 ? srt[mid] : (srt[mid - 1] + srt[mid]) / 2;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / n);
  return { mean, median, min: srt[0], max: srt[n - 1], sd };
}
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const avg = (rs, k) => rs.reduce((n, r) => n + r[k], 0) / rs.length;
const mean = (xs) => xs.reduce((n, x) => n + x, 0) / xs.length;

// ---------------------------------------------------------------- main
const mode = process.argv[2] || 'all';

if (mode === 'all' || mode === 'regression') {
  console.log('############ STAGE 0: CAPPED-SCORE REGRESSION ############');
  console.log('Old policies x old seeds, new (instrumented) engine.');
  console.log('Previous audit capped means/median/min/max for reference:');
  console.log('  terna-only      85.1 / 90 / 18 / 100');
  console.log('  deployment-only 99.6 / 100 / 94 / 100');
  console.log('  mixed           98.6 / 100 / 93 / 100');
  console.log('  conservative    92.0 / 96.5 / 67 / 100');
  console.log('  no-dispatch     50 / 50 / 50 / 50');
  console.log('Previous audit uncapped means (outcome+veteran deltas only):');
  console.log('  terna-only 86.3, deployment-only 135.5, mixed 129.1, conservative 95.0, no-dispatch 50');
  console.log();
  let regOk = true;
  for (const [name, fn] of Object.entries(REGRESSION_POLICIES)) {
    const rs = OLD_SEEDS.map((seed) => runCampaign(seed, { run: fn }));
    const cs = stats(rs.map((r) => r.finalScore));
    const us = stats(rs.map((r) => r.uncapped));
    // Independent uncapped check: these policies never found novitiates nor
    // issued instructions, so the old outcome+veteran method was complete.
    let indep = 0;
    for (const r of rs) {
      indep += (r.attrib.fruitfulness + r.attrib.institutionalFounding
        + r.attrib.institutionalYearly + r.attrib.instructions);
    }
    const indepMean = indep / rs.length + SCORE.START;
    const rebuildOk = rs.every((r) => r.attrib.rebuildsCounter);
    console.log(`${name.padEnd(16)} capped mean=${f1(cs.mean)} median=${cs.median} min=${cs.min} max=${cs.max} | ` +
      `uncapped(new counter) mean=${f1(us.mean)} | uncapped(independent rebuild) mean=${f1(indepMean)} ` +
      `| rebuild-exact: ${rebuildOk ? 'YES' : 'NO'}`);
    if (!rebuildOk) regOk = false;
  }
  console.log(regOk ? '\nStage 0 regression: capped results reproduced; uncapped counter == independent rebuild on all seeds.'
                    : '\nStage 0 REGRESSION FAILURE: rebuild mismatch — investigate before Stage 1.');
}

if (mode === 'all' || mode === 'stage1') {
  console.log('\n############ STAGE 1: FULL-TOOLKIT COMPARISON (20 seeds) ############');
  const results = {};
  for (const [name, policy] of Object.entries(STAGE1_POLICIES)) {
    results[name] = SEEDS.map((seed) => runCampaign(seed, policy));
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    new URL('./stage01_results.json', import.meta.url),
    JSON.stringify(results, null, 1),
  );
  console.log('wrote stage01_results.json');

  console.log('\n=== CAPPED SCORE ===');
  for (const [name, rs] of Object.entries(results)) {
    const st = stats(rs.map((r) => r.finalScore));
    console.log(`${name.padEnd(16)} mean=${f1(st.mean)} median=${f1(st.median)} min=${st.min} max=${st.max} sd=${f1(st.sd)}`);
  }
  console.log('\n=== UNCAPPED SCORE (instrumented counter) ===');
  for (const [name, rs] of Object.entries(results)) {
    const st = stats(rs.map((r) => r.uncapped));
    const rb = rs.every((r) => r.attrib.rebuildsCounter);
    console.log(`${name.padEnd(16)} mean=${f1(st.mean)} median=${f1(st.median)} min=${st.min} max=${st.max} sd=${f1(st.sd)}  rebuild-exact:${rb ? 'YES' : 'NO'}`);
  }
  console.log('\n=== MILESTONES: median year reaching 75/90/100 (reach counts /20) ===');
  for (const [name, rs] of Object.entries(results)) {
    const line = [75, 90, 100].map((t) => {
      const ys = rs.map((r) => r.milestones[t]).filter((y) => y !== undefined).sort((a, b) => a - b);
      if (!ys.length) return '—(0)';
      return `${ys[Math.floor(ys.length / 2)]}(${ys.length})`;
    });
    console.log(`${name.padEnd(16)} 75:${line[0]} 90:${line[1]} 100:${line[2]}`);
  }
  console.log('\n=== VOLUME & REACH (means) ===');
  for (const [name, rs] of Object.entries(results)) {
    console.log(`${name.padEnd(16)} voyages=${f1(avg(rs, 'voyages'))} souls=${f1(avg(rs, 'souls'))} ` +
      `approved=${f1(avg(rs, 'approved'))} deployed=${f1(avg(rs, 'deployed'))} destinations=${f1(avg(rs, 'nDestinations'))}`);
  }
  console.log('\n=== OUTCOME RATES per voyage (means) ===');
  for (const [name, rs] of Object.entries(results)) {
    const v = avg(rs, 'voyages') || 1;
    console.log(`${name.padEnd(16)} thriving=${f1(avg(rs, 'thriving') / v)} returned=${f1(avg(rs, 'returned') / v)} ` +
      `ill=${f1(avg(rs, 'ill') / v)} deceased=${f1(avg(rs, 'deceased') / v)}`);
  }
  console.log('\n=== RESOURCES: final funds / pool + trajectory means (funds,avail @1624/1634/1644) ===');
  for (const [name, rs] of Object.entries(results)) {
    const at = (yr, k) => f1(mean(rs.map((r) => (r.traj.find((t) => t.y === yr) || {})[k] ?? NaN)));
    console.log(`${name.padEnd(16)} finalFunds=${f1(avg(rs, 'finalFunds'))} pool=${f1(avg(rs, 'pool'))} ` +
      `1624:(${at(1624, 'funds')},${at(1624, 'avail')}) 1634:(${at(1634, 'funds')},${at(1634, 'avail')}) 1644:(${at(1644, 'funds')},${at(1644, 'avail')})`);
  }
  console.log('\n=== PREPARATION USE (means): formations, companions, mission-spend, novitiates, instructions ===');
  for (const [name, rs] of Object.entries(results)) {
    console.log(`${name.padEnd(16)} formations=${f1(avg(rs, 'formations'))} companions=${f1(avg(rs, 'companions'))} ` +
      `missionSpend=${f1(mean(rs.map((r) => r.spend.mission)))} novitiates=${f1(avg(rs, 'novitiates'))} instructions=${f1(avg(rs, 'instructions'))}`);
  }
  console.log('\n=== SPEND BREAKDOWN (means, scudi) ===');
  for (const [name, rs] of Object.entries(results)) {
    const sp = (k) => f1(mean(rs.map((r) => r.spend[k])));
    console.log(`${name.padEnd(16)} seal=${sp('seal')} departures=${sp('departures')} formation=${sp('formation')} mission=${sp('mission')} novitiate=${sp('novitiate')}`);
  }
  console.log('\n=== SCORE ATTRIBUTION (means of uncapped-50) ===');
  for (const [name, rs] of Object.entries(results)) {
    const at = (k) => f1(mean(rs.map((r) => r.attrib[k])));
    console.log(`${name.padEnd(16)} fruit=${at('fruitfulness')} instFound=${at('institutionalFounding')} instYearly=${at('institutionalYearly')} instr=${at('instructions')}`);
  }
}
