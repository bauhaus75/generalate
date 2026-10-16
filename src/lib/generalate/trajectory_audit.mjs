// Trajectory audit for the Stage 1 post-implementation review.
// Records 5-year snapshots per policy x seed: score, funds, thriving, deaths,
// deployed, pool. Read-only analysis — no tuning, no mechanics changes.
// Run: node trajectory_audit.mjs
import { setGameData, FIXTURES } from './data.js';
import {
  newGame, startYear, decide, resolveYear,
  ensureDisposition,
  orderDeployment, selectDeploymentMembers, deploymentCandidates,
  DEPLOYMENT_MIN_SIZE,
} from './engine.js';

setGameData(FIXTURES);

function traitsOf(state, petitionerId) {
  const d = ensureDisposition(state, petitionerId);
  return d.current || {};
}
function ternaFocused(state, terna) {
  const approved = [];
  for (const t of terna) {
    if (approved.length >= 2) break;
    const tr = traitsOf(state, t.petitionerId);
    if ((tr.zeal ?? 3) >= 4 || (tr.prudence ?? 3) >= 4) approved.push({ id: t.petitionerId });
  }
  return { decisions: approved, deploy: null };
}
function deploymentHeavy(state, terna, yearIdx) {
  let deploy = null;
  if (yearIdx % 3 === 2) {
    const n = Math.min(6, deploymentCandidates(state).length);
    if (n >= DEPLOYMENT_MIN_SIZE) deploy = { destId: 'goa', purpose: 'reinforce', count: n };
  }
  return { decisions: [], deploy };
}
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

function runTrajectory(seed, policyFn, years = 30) {
  const s = newGame({ mode: 'campaign', seed });
  const snaps = [];
  let thriving = 0, deaths = 0, deployed = 0, deploys = 0, approved = 0;
  for (let y = 0; y < years; y++) {
    const { terna } = startYear(s);
    const { decisions, deploy } = policyFn(s, terna, y);
    const result = decide(s, decisions);
    approved += result.approved.length;
    if (deploy) {
      try {
        const ids = selectDeploymentMembers(s, { count: deploy.count });
        orderDeployment(s, { destId: deploy.destId, purpose: deploy.purpose, memberIds: ids });
        deployed += ids.length; deploys += 1;
      } catch (e) { /* skip */ }
    }
    const r = resolveYear(s);
    for (const o of (r.yearReport?.outcomes || [])) {
      if (o.outcome === 'deceased') deaths++;
      if (o.outcome === 'thriving') thriving++;
    }
    if ((y + 1) % 5 === 0 || y === years - 1) {
      snaps.push({
        year: 1615 + y, score: s.score, funds: s.resources.funds,
        thriving, deaths, deployed, deploys, approved, pool: s.available,
      });
    }
    if (s.ended) break;
  }
  return snaps;
}

const seeds = ['dep-a', 'dep-b', 'dep-c', 'dep-d', 'dep-e'];
const policies = { 'terna-focused': ternaFocused, 'deployment-heavy': deploymentHeavy, 'mixed': mixed };
for (const [name, fn] of Object.entries(policies)) {
  console.log(`\n### ${name}`);
  console.log('seed  | year | score | funds | thrive | dead | depld | #dep | appr | pool');
  for (const seed of seeds) {
    for (const sn of runTrajectory(seed, fn)) {
      console.log(
        `${seed} | ${sn.year} | ${String(sn.score).padStart(5)} | ${String(sn.funds).padStart(5)} | ` +
        `${String(sn.thriving).padStart(6)} | ${String(sn.deaths).padStart(4)} | ${String(sn.deployed).padStart(5)} | ` +
        `${String(sn.deploys).padStart(4)} | ${String(sn.approved).padStart(4)} | ${String(sn.pool).padStart(4)}`
      );
    }
  }
}
