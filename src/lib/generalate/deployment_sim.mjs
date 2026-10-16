// Deployment policy comparison (Stage 1): terna-focused vs deployment-heavy vs mixed.
// Verifies the three policies remain meaningfully distinct — NOT a tuning exercise.
// Run with: node deployment_sim.mjs
import { setGameData, FIXTURES } from './data.js';
import {
  newGame, startYear, decide, resolveYear,
  missionStaff, missionStaffed,
  ensureDisposition,
  orderDeployment, selectDeploymentMembers, deploymentCandidates,
  DEPLOYMENT_MIN_SIZE,
} from './engine.js';

setGameData(FIXTURES);

function traitsOf(state, petitionerId) {
  const d = ensureDisposition(state, petitionerId);
  return d.current || {};
}

// Terna-focused: approve up to 2/yr with a clear strength, never deploy.
function ternaFocused(state, terna) {
  const approved = [];
  for (const t of terna) {
    if (approved.length >= 2) break;
    const tr = traitsOf(state, t.petitionerId);
    if ((tr.zeal ?? 3) >= 4 || (tr.prudence ?? 3) >= 4) approved.push({ id: t.petitionerId });
  }
  return { decisions: approved, deploy: null };
}

// Deployment-heavy: deny everything (build the European pool), deploy 6 every 3rd year.
function deploymentHeavy(state, terna, yearIdx) {
  let deploy = null;
  if (yearIdx % 3 === 2) {
    const n = Math.min(6, deploymentCandidates(state).length);
    if (n >= DEPLOYMENT_MIN_SIZE) {
      deploy = { destId: 'goa', purpose: 'reinforce', count: n };
    }
  }
  return { decisions: [], deploy };
}

// Mixed: approve the single best each year, deploy 4 every 4th year when possible.
function mixed(state, terna, yearIdx) {
  const ranked = [...terna].sort((a, b) => {
    const ta = traitsOf(state, a.petitionerId), tb = traitsOf(state, b.petitionerId);
    return ((tb.zeal ?? 3) + (tb.prudence ?? 3)) - ((ta.zeal ?? 3) + (ta.prudence ?? 3));
  });
  let deploy = null;
  if (yearIdx % 4 === 3) {
    const n = Math.min(4, deploymentCandidates(state).length);
    if (n >= DEPLOYMENT_MIN_SIZE) deploy = { destId: 'goa', purpose: 'reinforce', count: n };
  }
  return { decisions: ranked.length ? [{ id: ranked[0].petitionerId }] : [], deploy };
}

function runCampaign(seed, policyFn, years = 30) {
  const s = newGame({ mode: 'campaign', seed });
  const m = { approved: 0, denied: 0, deployed: 0, deployments: 0, deaths: 0, thriving: 0 };
  for (let y = 0; y < years; y++) {
    const { terna } = startYear(s);
    const { decisions, deploy } = policyFn(s, terna, y);
    const result = decide(s, decisions);
    m.approved += result.approved.length;
    m.denied += result.denied.length;
    if (deploy) {
      try {
        const ids = selectDeploymentMembers(s, { count: deploy.count });
        orderDeployment(s, { destId: deploy.destId, purpose: deploy.purpose, memberIds: ids });
        m.deployed += ids.length;
        m.deployments += 1;
      } catch (e) { /* not enough eligible — skip this cycle */ }
    }
    const r = resolveYear(s);
    for (const o of (r.yearReport?.outcomes || [])) {
      if (o.outcome === 'deceased') m.deaths++;
      if (o.outcome === 'thriving') m.thriving++;
    }
    if (s.ended) break;
  }
  let totalStaffed = 0;
  for (const destId of Object.keys(s.missions || {})) {
    totalStaffed += missionStaffed(missionStaff(s, destId));
  }
  return {
    seed, finalScore: s.score, finalFunds: s.resources.funds,
    ...m, totalStaffed, pool: s.available,
  };
}

const seeds = ['dep-a', 'dep-b', 'dep-c', 'dep-d', 'dep-e'];
const policies = { 'terna-focused': ternaFocused, 'deployment-heavy': deploymentHeavy, 'mixed': mixed };

console.log('Deployment policy comparison over 30-year campaigns (1615-1644)\n');
console.log('Seed  | Policy          | Score | Funds | Dead | Thrive | Appr | Depld | Staff | Pool');
console.log('------|-----------------|-------|-------|------|--------|------|-------|-------|-----');
const agg = {};
for (const seed of seeds) {
  for (const [name, fn] of Object.entries(policies)) {
    const r = runCampaign(seed, fn);
    if (!agg[name]) agg[name] = [];
    agg[name].push(r);
    console.log(
      `${seed.padEnd(5)} | ${name.padEnd(15)} | ${String(r.finalScore).padStart(5)} | ` +
      `${String(r.finalFunds).padStart(5)} | ${String(r.deaths).padStart(4)} | ` +
      `${String(r.thriving).padStart(6)} | ${String(r.approved).padStart(4)} | ` +
      `${String(r.deployed).padStart(5)} | ${String(r.totalStaffed).padStart(5)} | ${String(r.pool).padStart(4)}`
    );
  }
}
console.log('\nAverages:');
for (const [name, rs] of Object.entries(agg)) {
  const avg = (k) => (rs.reduce((n, r) => n + r[k], 0) / rs.length).toFixed(1);
  console.log(`  ${name.padEnd(15)} score=${avg('finalScore')} funds=${avg('finalFunds')} dead=${avg('deaths')} thrive=${avg('thriving')} appr=${avg('approved')} depld=${avg('deployed')} staff=${avg('totalStaffed')}`);
}
