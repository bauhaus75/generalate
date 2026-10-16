// Strategy comparison: approve-all vs selective vs conservative.
// Run with: node strategy_sim.mjs
import { setGameData, FIXTURES } from './data.js';
import {
  newGame, startYear, decide, resolveYear,
  missionStaff, missionStaffed,
  ensureDisposition, gradeFor,
} from './engine.js';

setGameData(FIXTURES);

function getTraits(state, petitionerId) {
  const d = ensureDisposition(state, petitionerId);
  return d.current || {};
}

function getHealth(state, petitionerId, terna) {
  // Health is on the terna card (numeric 1-5)
  const card = terna.find(t => t.petitionerId === petitionerId);
  return card?.health ?? 3;
}

// Strategy: approve all 3, no companions
function approveAll(state, terna) {
  return terna.map(t => ({ id: t.petitionerId }));
}

// Strategy: selective — reject only the clearly unfit (zeal<=2 AND prudence<=2),
// approve the rest; 2 companions if destination danger >= 2
function selective(state, terna, destDanger) {
  const approved = [];
  for (const t of terna) {
    const traits = getTraits(state, t.petitionerId);
    const z = traits.zeal ?? 3;
    const p = traits.prudence ?? 3;
    // Reject only if BOTH zeal and prudence are poor
    if (z <= 2 && p <= 2) continue;
    const danger = destDanger(t.destination) ?? 0;
    approved.push({
      id: t.petitionerId,
      companions: danger >= 2 ? 2 : 0,
    });
  }
  return approved;
}

// Strategy: conservative — approve only men with a clear strength (zeal>=4 OR prudence>=4),
// max 2/year, no companions (save pool and funds)
function conservative(state, terna) {
  const approved = [];
  for (const t of terna) {
    if (approved.length >= 2) break;
    const traits = getTraits(state, t.petitionerId);
    const z = traits.zeal ?? 3;
    const p = traits.prudence ?? 3;
    if (z >= 4 || p >= 4) {
      approved.push({ id: t.petitionerId });
    }
  }
  return approved;
}

function destDanger(state, destId) {
  // Get danger from game data or destState
  const dst = state.destState?.[destId];
  if (dst && typeof dst.danger === 'number') return dst.danger;
  return 0;
}

function runCampaign(seed, strategyFn, years = 30) {
  const s = newGame({ mode: 'campaign', seed });
  const metrics = {
    seed,
    scores: [],
    funds: [],
    deaths: 0,
    thriving: 0,
    approved: 0,
    denied: 0,
  };

  for (let y = 0; y < years; y++) {
    const { terna } = startYear(s);
    const decisions = strategyFn(s, terna, (d) => destDanger(s, d));
    const result = decide(s, decisions);
    metrics.approved += result.approved.length;
    metrics.denied += result.denied.length;
    const r = resolveYear(s);
    metrics.scores.push(s.score);
    metrics.funds.push(s.resources.funds);
    // Count outcomes from year report
    for (const o of (r.yearReport?.outcomes || [])) {
      if (o.outcome === 'deceased') metrics.deaths++;
      if (o.outcome === 'thriving') metrics.thriving++;
    }
    if (s.ended) break;
  }

  // Final state
  let totalStaffed = 0;
  for (const destId of Object.keys(s.missions || {})) {
    totalStaffed += missionStaffed(missionStaff(s, destId));
  }

  return {
    seed,
    finalScore: s.score,
    finalFunds: s.resources.funds,
    deaths: metrics.deaths,
    thriving: metrics.thriving,
    approved: metrics.approved,
    denied: metrics.denied,
    totalStaffed,
    pool: s.available,
    society: s.society,
    scoreTrajectory: metrics.scores,
  };
}

const seeds = ['sim-a', 'sim-b', 'sim-c', 'sim-d', 'sim-e'];
const strategies = {
  'approve-all': approveAll,
  'selective': selective,
  'conservative': conservative,
};

console.log('Strategy comparison over 30-year campaigns (1615-1644)\n');
console.log('Seed      | Strategy     | Score | Funds | Dead | Thrive | Appr | Staff | Pool');
console.log('----------|--------------|-------|-------|------|--------|------|-------|-----');

for (const seed of seeds) {
  for (const [name, fn] of Object.entries(strategies)) {
    const r = runCampaign(seed, fn);
    console.log(
      `${seed.padEnd(9)} | ${name.padEnd(12)} | ${String(r.finalScore).padStart(5)} | ` +
      `${String(r.finalFunds).padStart(5)} | ${String(r.deaths).padStart(4)} | ` +
      `${String(r.thriving).padStart(6)} | ${String(r.approved).padStart(4)} | ` +
      `${String(r.totalStaffed).padStart(5)} | ${String(r.pool).padStart(4)}`
    );
  }
  console.log('');
}

// Averages
console.log('\n=== AVERAGES (5 seeds) ===');
for (const [name, fn] of Object.entries(strategies)) {
  const runs = seeds.map(seed => runCampaign(seed, fn));
  const avg = (arr) => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
  console.log(`${name}:`);
  console.log(`  Score: ${avg(runs.map(r => r.finalScore))} | Funds: ${avg(runs.map(r => r.finalFunds))} | ` +
    `Deaths: ${avg(runs.map(r => r.deaths))} | Thriving: ${avg(runs.map(r => r.thriving))} | ` +
    `Approved: ${avg(runs.map(r => r.approved))} | Staffed: ${avg(runs.map(r => r.totalStaffed))} | ` +
    `Pool: ${avg(runs.map(r => r.pool))}`);
}
