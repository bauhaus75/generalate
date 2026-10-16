// Strategic balance audit — 5 policies x 20 seeds, 30-year campaigns.
// Read-only investigation. No mechanics changes, no tuning.
// Run: node balance_audit.mjs
import { setGameData, FIXTURES } from './data.js';
import {
  newGame, startYear, decide, resolveYear,
  ensureDisposition,
  orderDeployment, selectDeploymentMembers, deploymentCandidates,
  DEPLOYMENT_MIN_SIZE,
} from './engine.js';
import { SCORE } from './rules.js';

setGameData(FIXTURES);

function traitsOf(state, id) {
  const d = ensureDisposition(state, id);
  return d.current || {};
}
function bestFirst(state, terna) {
  return [...terna].sort((a, b) => {
    const ta = traitsOf(state, a.petitionerId), tb = traitsOf(state, b.petitionerId);
    return ((tb.zeal ?? 3) + (tb.prudence ?? 3)) - ((ta.zeal ?? 3) + (ta.prudence ?? 3));
  });
}
function tryDeploy(s, count, destId = 'goa') {
  const n = Math.min(count, deploymentCandidates(s).length);
  if (n < DEPLOYMENT_MIN_SIZE) return 0;
  try {
    const ids = selectDeploymentMembers(s, { count: n });
    orderDeployment(s, { destId, purpose: 'reinforce', memberIds: ids });
    return ids.length;
  } catch (e) { return 0; }
}

// Policy definitions (experimental, fixed before running):
const POLICIES = {
  // 1. Terna-only: approve the single most promising man each year; never deploy.
  'terna-only': (s, terna) => ({ decisions: terna.length ? [{ id: bestFirst(s, terna)[0].petitionerId }] : [], deploy: 0 }),
  // 2. Deployment-only: deny every terna; deploy up to 6 every 3rd year.
  'deployment-only': (s, terna, yi) => ({ decisions: [], deploy: yi % 3 === 2 ? 6 : 0 }),
  // 3. Mixed: approve best 1/year AND deploy up to 4 every 4th year.
  'mixed': (s, terna, yi) => ({
    decisions: terna.length ? [{ id: bestFirst(s, terna)[0].petitionerId }] : [],
    deploy: yi % 4 === 3 ? 4 : 0,
  }),
  // 4. Conservative: deny every terna; deploy up to 5 every 5th year (~30 men total,
  //    volume-matched to terna-only; preserves funds/personnel vs deployment-only).
  'conservative': (s, terna, yi) => ({ decisions: [], deploy: yi % 5 === 4 ? 5 : 0 }),
  // 5. No-dispatch control: deny every terna; nothing ever sails.
  'no-dispatch': (s) => ({ decisions: [], deploy: 0 }),
};

function runCampaign(seed, policyFn, years = 30) {
  const s = newGame({ mode: 'campaign', seed });
  const m = {
    seed, uncapped: SCORE.START, milestones: {},
    thriving: 0, returned: 0, ill: 0, deceased: 0,
    deployed: 0, deploys: 0, approved: 0, voyages: 0, deployVoyages: 0,
    missions: new Set(), traj: [],
  };
  for (let y = 0; y < years; y++) {
    const { terna } = startYear(s);
    const { decisions, deploy } = policyFn(s, terna, y);
    const r0 = decide(s, decisions);
    m.approved += r0.approved.length;
    if (deploy > 0) {
      const n = tryDeploy(s, deploy);
      m.deployed += n;
      if (n > 0) m.deploys += 1;
    }
    const r = resolveYear(s);
    for (const o of (r.yearReport?.outcomes || [])) {
      m.uncapped += o.delta || 0; // exact engine-reported score delta per news delivery
      if (o.outcome === 'thriving') m.thriving++;
      else if (o.outcome === 'returned') m.returned++;
      else if (o.outcome === 'ill') m.ill++;
      else if (o.outcome === 'deceased') m.deceased++;
      if (o.destination) m.missions.add(o.destination);
    }
    for (const v of (s.voyages || [])) {
      if (v.veteranReturned && v.veteranYear === s.year) m.uncapped += 2; // VETERAN.SCORE
    }
    for (const t of [75, 90, 100]) {
      if (!(t in m.milestones) && s.score >= t) m.milestones[t] = 1615 + y;
    }
    if ((y + 1) % 5 === 0) m.traj.push({ year: 1615 + y, score: s.score });
    if (s.ended) break;
  }
  m.deployVoyages = (s.voyages || []).filter((v) => v.deploymentId).length;
  m.voyages = (s.voyages || []).length;
  m.nMissions = m.missions.size;
  return {
    ...m, missions: [...m.missions],
    finalScore: s.score, finalFunds: s.resources.funds, pool: s.available,
  };
}

const seeds = Array.from({ length: 20 }, (_, i) => `bal-${String(i + 1).padStart(2, '0')}`);
const results = {};
for (const [name, fn] of Object.entries(POLICIES)) {
  results[name] = seeds.map((seed) => runCampaign(seed, fn));
}

function stats(xs) {
  const srt = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((n, x) => n + x, 0) / xs.length;
  const mid = Math.floor(srt.length / 2);
  const median = srt.length % 2 ? srt[mid] : (srt[mid - 1] + srt[mid]) / 2;
  return { mean: mean.toFixed(1), median, min: srt[0], max: srt[srt.length - 1] };
}

console.log('=== FINAL SCORE (capped) ===');
for (const [name, rs] of Object.entries(results)) {
  const st = stats(rs.map((r) => r.finalScore));
  console.log(`${name.padEnd(16)} mean=${st.mean} median=${st.median} min=${st.min} max=${st.max}`);
}
console.log('\n=== UNCAPPED SCORE (exact, from engine deltas) ===');
for (const [name, rs] of Object.entries(results)) {
  const st = stats(rs.map((r) => Math.round(r.uncapped)));
  console.log(`${name.padEnd(16)} mean=${st.mean} median=${st.median} min=${st.min} max=${st.max}`);
}
console.log('\n=== MILESTONES: median year first reaching 75 / 90 / 100 (— = never) ===');
for (const [name, rs] of Object.entries(results)) {
  const line = [75, 90, 100].map((t) => {
    const ys = rs.map((r) => r.milestones[t]).filter((y) => y !== undefined);
    if (!ys.length) return '—';
    ys.sort((a, b) => a - b);
    return ys[Math.floor(ys.length / 2)];
  });
  const reach100 = rs.filter((r) => r.milestones[100] !== undefined).length;
  console.log(`${name.padEnd(16)} 75:${line[0]} 90:${line[1]} 100:${line[2]}  (reached 100: ${reach100}/20)`);
}
console.log('\n=== RESOURCES & ACTIVITY (means) ===');
for (const [name, rs] of Object.entries(results)) {
  const avg = (k) => (rs.reduce((n, r) => n + r[k], 0) / rs.length).toFixed(1);
  console.log(`${name.padEnd(16)} funds=${avg('finalFunds')} pool=${avg('pool')} voyages=${avg('voyages')} (deploy ${avg('deployVoyages')}) appr=${avg('approved')} depld=${avg('deployed')} missions=${avg('nMissions')}`);
}
console.log('\n=== OUTCOMES (means) ===');
for (const [name, rs] of Object.entries(results)) {
  const avg = (k) => (rs.reduce((n, r) => n + r[k], 0) / rs.length).toFixed(1);
  console.log(`${name.padEnd(16)} thriving=${avg('thriving')} returned=${avg('returned')} ill=${avg('ill')} deceased=${avg('deceased')}`);
}
console.log('\n=== REPRESENTATIVE TRAJECTORY (median-by-score seed, 5yr scores) ===');
for (const [name, rs] of Object.entries(results)) {
  const srt = [...rs].sort((a, b) => a.finalScore - b.finalScore);
  const rep = srt[Math.floor(srt.length / 2)];
  console.log(`${name.padEnd(16)} [${rep.seed}] ` + rep.traj.map((t) => `${t.year}:${t.score}`).join(' '));
}
