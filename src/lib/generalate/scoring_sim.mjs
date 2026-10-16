// Scoring model comparison: test alternative incentive structures.
// Run with: node scoring_sim.mjs
import { setGameData, FIXTURES } from './data.js';
import {
  newGame, startYear, decide, resolveYear,
  missionStaff, missionStaffed, missionVoyageBonus,
  ensureDisposition,
} from './engine.js';
import * as rules from './rules.js';

setGameData(FIXTURES);

// --- Modifier computation (mirrors engine voyage logic) ---
function computeQuality(state, petitionerId, destination, companions) {
  const disp = ensureDisposition(state, petitionerId);
  const z = disp.current?.zeal ?? 3;
  const p = disp.current?.prudence ?? 3;
  const zealMod = z >= 4 ? 1 : (z <= 2 ? -1 : 0);
  const prudMod = p >= 4 ? 1 : (p <= 2 ? -1 : 0);
  const dst = state.destState?.[destination];
  const danger = (dst && typeof dst.danger === 'number') ? dst.danger : 0;
  const dangerMod = danger * -2;
  const compMod = Math.min(companions || 0, 3);
  const missionMod = missionVoyageBonus(state, destination);
  return zealMod + prudMod + dangerMod + compMod + missionMod;
}

// --- Three scoring models ---

// Model 1: Decision-Quality (scores the bet, not the roll)
function scoreModel1_DecisionQuality() {
  let uncapped = 50;
  return {
    onDecide(state, approved) {
      for (const a of approved) {
        const q = computeQuality(state, a.petitionerId, a.destination, a.companions);
        const delta = Math.max(-2, Math.min(3, Math.round(q / 2)));
        uncapped += delta;
      }
    },
    onOutcome(outcome) {
      if (outcome === 'thriving') uncapped += 1;
      if (outcome === 'deceased') uncapped -= 1;
    },
    getUncapped() { return uncapped; },
    getDisplay() { return Math.max(0, Math.min(100, uncapped)); },
  };
}

// Model 2: Risk-Adjusted Outcomes
function scoreModel2_RiskAdjusted() {
  let uncapped = 50;
  return {
    onDecide(state, approved) { /* no decision score */ },
    onOutcome(outcome, danger) {
      const d = danger ?? 0;
      if (outcome === 'thriving') uncapped += 2 + d;
      if (outcome === 'deceased') uncapped -= 2 + (3 - d);
      if (outcome === 'returned') uncapped += 1;
      if (outcome === 'ill') uncapped -= 1;
    },
    getUncapped() { return uncapped; },
    getDisplay() { return Math.max(0, Math.min(100, uncapped)); },
  };
}

// Model 3: Stewardship (mission health)
function scoreModel3_Stewardship() {
  let uncapped = 50;
  return {
    onDecide(state, approved) { /* no decision score */ },
    onOutcome(outcome) {
      if (outcome === 'thriving') uncapped += 1;
      if (outcome === 'deceased') uncapped -= 1;
    },
    onYearEnd(state) {
      for (const destId of Object.keys(state.missions || {})) {
        const st = missionStaff(state, destId);
        const staffed = missionStaffed(st);
        const cap = st.capacity || 5;
        if (staffed >= cap) uncapped += 1;
        else if (staffed < cap * 0.5) uncapped -= 1;
      }
    },
    getUncapped() { return uncapped; },
    getDisplay() { return Math.max(0, Math.min(100, uncapped)); },
  };
}

// --- Strategies (same as before) ---
function approveAll(state, terna) {
  return terna.map(t => ({ id: t.petitionerId }));
}

function selective(state, terna) {
  const approved = [];
  for (const t of terna) {
    const disp = ensureDisposition(state, t.petitionerId);
    const z = disp.current?.zeal ?? 3;
    const p = disp.current?.prudence ?? 3;
    if (z <= 2 && p <= 2) continue;
    const dst = state.destState?.[t.destination];
    const danger = (dst && typeof dst.danger === 'number') ? dst.danger : 0;
    approved.push({ id: t.petitionerId, companions: danger >= 2 ? 2 : 0 });
  }
  return approved;
}

function conservative(state, terna) {
  const approved = [];
  for (const t of terna) {
    if (approved.length >= 2) break;
    const disp = ensureDisposition(state, t.petitionerId);
    const z = disp.current?.zeal ?? 3;
    const p = disp.current?.prudence ?? 3;
    if (z >= 4 || p >= 4) approved.push({ id: t.petitionerId });
  }
  return approved;
}

function runWithModel(seed, strategyFn, modelFn, years = 30) {
  const s = newGame({ mode: 'campaign', seed });
  const model = modelFn();
  
  for (let y = 0; y < years; y++) {
    const { terna } = startYear(s);
    const decisions = strategyFn(s, terna);
    const result = decide(s, decisions);
    model.onDecide(s, result.approved.map(a => ({
      petitionerId: a.petitionerId,
      destination: a.destination,
      companions: a.companions || 0,
    })));
    const r = resolveYear(s);
    for (const o of (r.yearReport?.outcomes || [])) {
      const dst = s.destState?.[o.destination];
      const danger = (dst && typeof dst.danger === 'number') ? dst.danger : 0;
      if (model.onOutcome.length === 2) model.onOutcome(o.outcome, danger);
      else model.onOutcome(o.outcome);
    }
    if (model.onYearEnd) model.onYearEnd(s);
    if (s.ended) break;
  }
  
  return {
    uncapped: model.getUncapped(),
    display: model.getDisplay(),
  };
}

const seeds = ['sim-a', 'sim-b', 'sim-c', 'sim-d', 'sim-e'];
const models = {
  'Decision-Quality': scoreModel1_DecisionQuality,
  'Risk-Adjusted': scoreModel2_RiskAdjusted,
  'Stewardship': scoreModel3_Stewardship,
};
const strategies = {
  'approve-all': approveAll,
  'selective': selective,
  'conservative': conservative,
};

console.log('Scoring Model Comparison (30-year campaigns)\n');

for (const [modelName, modelFn] of Object.entries(models)) {
  console.log(`=== ${modelName} ===`);
  console.log('Strategy     | Uncapped Avg | Display Avg | Range (uncapped)');
  console.log('-------------|--------------|-------------|------------------');
  for (const [stratName, stratFn] of Object.entries(strategies)) {
    const results = seeds.map(seed => runWithModel(seed, stratFn, modelFn));
    const uncapped = results.map(r => r.uncapped);
    const display = results.map(r => r.display);
    const avgU = (uncapped.reduce((a,b) => a+b, 0) / uncapped.length).toFixed(1);
    const avgD = (display.reduce((a,b) => a+b, 0) / display.length).toFixed(1);
    const minU = Math.min(...uncapped).toFixed(0);
    const maxU = Math.max(...uncapped).toFixed(0);
    console.log(`${stratName.padEnd(12)} | ${avgU.padStart(12)} | ${avgD.padStart(11)} | ${minU} to ${maxU}`);
  }
  console.log('');
}
