// Revised scoring models v2: address Model 1 weaknesses.
// - Don't favor safe destinations automatically
// - Consider mission need and alternatives  
// - Don't expose a single optimizable score
// Run with: node scoring_v2.mjs
import { setGameData, FIXTURES } from './data.js';
import {
  newGame, startYear, decide, resolveYear,
  missionStaff, missionStaffed, missionVoyageBonus,
  ensureDisposition,
} from './engine.js';

setGameData(FIXTURES);

function getMods(state, petitionerId, destination, companions) {
  const disp = ensureDisposition(state, petitionerId);
  const z = disp.current?.zeal ?? 3;
  const p = disp.current?.prudence ?? 3;
  const zealMod = z >= 4 ? 1 : (z <= 2 ? -1 : 0);
  const prudMod = p >= 4 ? 1 : (p <= 2 ? -1 : 0);
  const dst = state.destState?.[destination];
  const danger = (dst && typeof dst.danger === 'number') ? dst.danger : 0;
  const compMod = Math.min(companions || 0, 3);
  const missionMod = missionVoyageBonus(state, destination);
  const st = missionStaff(state, destination);
  const staffed = missionStaffed(st);
  const cap = st.capacity || 5;
  const needRatio = staffed / cap;
  return { zealMod, prudMod, danger, compMod, missionMod, staffed, cap, needRatio };
}

// --- Revised Model A: Need-Weighted Quality ---
// Rewards sending men to needy missions, even dangerous ones.
// Formula: quality = (zeal+prud+comp) - danger + need_bonus + mission_mod
// need_bonus: +3 if <50% capacity, +1 if <75%, else 0
// delta = clamp(round(quality/2), -2, +3)
function modelA_NeedWeighted() {
  let score = 50;
  return {
    onDecide(state, approved) {
      for (const a of approved) {
        const m = getMods(state, a.petitionerId, a.destination, a.companions);
        const base = m.zealMod + m.prudMod + m.compMod;
        const needBonus = m.needRatio < 0.5 ? 3 : (m.needRatio < 0.75 ? 1 : 0);
        const quality = base - m.danger + needBonus + m.missionMod;
        score += Math.max(-2, Math.min(3, Math.round(quality / 2)));
      }
    },
    onOutcome(o) {
      if (o === 'thriving') score += 1;
      if (o === 'deceased') score -= 1;
    },
    get() { return score; },
  };
}

// --- Revised Model B: Comparative Advantage ---
// Rewards picking the RIGHT destination among alternatives.
// Formula: For each approval, compute quality at chosen dest vs best alternative.
// If chosen >= best_alt - 1: +2 (good choice)
// If chosen >= 0: +1 (acceptable)  
// Else: -1 (poor choice, worse than denying)
// Quality = (zeal+prud+comp+mission_mod) - danger (no need bonus; pure fit)
function modelB_Comparative() {
  let score = 50;
  return {
    onDecide(state, approved) {
      // Get all open destinations
      const openDests = Object.keys(state.missions || {}).filter(id => {
        const dst = state.destState?.[id];
        return !dst || dst.access !== 'closed';
      });
      for (const a of approved) {
        const chosen = getMods(state, a.petitionerId, a.destination, a.companions);
        const chosenQ = chosen.zealMod + chosen.prudMod + chosen.compMod + chosen.missionMod - chosen.danger;
        let bestAlt = -Infinity;
        for (const altId of openDests) {
          if (altId === a.destination) continue;
          const alt = getMods(state, a.petitionerId, altId, a.companions);
          const altQ = alt.zealMod + alt.prudMod + alt.compMod + alt.missionMod - alt.danger;
          if (altQ > bestAlt) bestAlt = altQ;
        }
        if (chosenQ >= bestAlt - 1) score += 2;
        else if (chosenQ >= 0) score += 1;
        else score -= 1;
      }
    },
    onOutcome(o) {
      if (o === 'thriving') score += 1;
      if (o === 'deceased') score -= 1;
    },
    get() { return score; },
  };
}

// --- Revised Model C: Apostolic Weighting ---
// REWARDS difficult missions (courage), but punishes unfit men.
// Formula: quality = (zeal+prud+comp+mission_mod) + danger_bonus
// danger_bonus = +danger (not -danger!), but halved if man is unfit (zeal+prud < 0)
// delta = clamp(round(quality/2), -2, +3)
function modelC_Apostolic() {
  let score = 50;
  return {
    onDecide(state, approved) {
      for (const a of approved) {
        const m = getMods(state, a.petitionerId, a.destination, a.companions);
        const base = m.zealMod + m.prudMod + m.compMod + m.missionMod;
        const fit = m.zealMod + m.prudMod;
        // Apostolic courage: difficult missions are worthy, but only for fit men
        const apostolic = fit >= 0 ? m.danger : Math.floor(m.danger / 2);
        const quality = base + apostolic;
        score += Math.max(-2, Math.min(3, Math.round(quality / 2)));
      }
    },
    onOutcome(o) {
      if (o === 'thriving') score += 1;
      if (o === 'deceased') score -= 1;
    },
    get() { return score; },
  };
}

// --- Strategies ---
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
    approved.push({ id: t.petitionerId, companions: 0 });
  }
  return approved;
}

function conservative(state, terna) {
  const approved = [];
  for (const t of terna) {
    if (approved.length >= 2) break;
    const disp = ensureDisposition(state, t.petitionerId);
    if ((disp.current?.zeal ?? 3) >= 4 || (disp.current?.prudence ?? 3) >= 4) {
      approved.push({ id: t.petitionerId });
    }
  }
  return approved;
}

// Mission-focused: prioritize understaffed missions
function missionFocused(state, terna) {
  // Find neediest open destination
  let neediest = null;
  let lowestRatio = Infinity;
  for (const destId of Object.keys(state.missions || {})) {
    const dst = state.destState?.[destId];
    if (dst && dst.access === 'closed') continue;
    const st = missionStaff(state, destId);
    const ratio = missionStaffed(st) / (st.capacity || 5);
    if (ratio < lowestRatio) {
      lowestRatio = ratio;
      neediest = destId;
    }
  }
  const approved = [];
  for (const t of terna) {
    const disp = ensureDisposition(state, t.petitionerId);
    const z = disp.current?.zeal ?? 3;
    const p = disp.current?.prudence ?? 3;
    if (z <= 2 && p <= 2) continue; // don't send the unfit even to needy missions
    approved.push({
      id: t.petitionerId,
      destination: neediest || t.destination,
      companions: 0,
    });
  }
  return approved;
}

// Danger-seeking: prefer high-danger missions (tests apostolic model)
function dangerSeeking(state, terna) {
  const approved = [];
  for (const t of terna) {
    const disp = ensureDisposition(state, t.petitionerId);
    const z = disp.current?.zeal ?? 3;
    // Only send zealous men to danger; skip others
    if (z < 3) continue;
    // Find highest-danger open destination
    let bestDest = t.destination;
    let bestDanger = -1;
    for (const destId of Object.keys(state.missions || {})) {
      const dst = state.destState?.[destId];
      if (dst && dst.access === 'closed') continue;
      const d = (dst && typeof dst.danger === 'number') ? dst.danger : 0;
      if (d > bestDanger) { bestDanger = d; bestDest = destId; }
    }
    approved.push({ id: t.petitionerId, destination: bestDest, companions: 0 });
  }
  return approved;
}

function runModel(seed, strategyFn, modelFn, years = 30) {
  const s = newGame({ mode: 'campaign', seed });
  const model = modelFn();
  let deaths = 0, thriving = 0, approvedCount = 0;
  
  for (let y = 0; y < years; y++) {
    const { terna } = startYear(s);
    const decisions = strategyFn(s, terna);
    const result = decide(s, decisions);
    approvedCount += result.approved.length;
    model.onDecide(s, result.approved.map(a => ({
      petitionerId: a.petitionerId,
      destination: a.destination,
      companions: a.companions || 0,
    })));
    const r = resolveYear(s);
    for (const o of (r.yearReport?.outcomes || [])) {
      if (o.outcome === 'deceased') deaths++;
      if (o.outcome === 'thriving') thriving++;
      model.onOutcome(o.outcome);
    }
    if (s.ended) break;
  }
  
  let totalStaffed = 0;
  let missionsAtCap = 0;
  for (const destId of Object.keys(s.missions || {})) {
    const st = missionStaff(s, destId);
    const staffed = missionStaffed(st);
    totalStaffed += staffed;
    if (staffed >= (st.capacity || 5)) missionsAtCap++;
  }
  
  return {
    score: model.get(),
    display: Math.max(0, Math.min(100, model.get())),
    deaths, thriving, approved: approvedCount,
    staffed: totalStaffed, atCap: missionsAtCap,
    pool: s.available, funds: s.resources.funds,
  };
}

const seeds = ['sim-a', 'sim-b', 'sim-c', 'sim-d', 'sim-e'];
const models = {
  'A: Need-Weighted': modelA_NeedWeighted,
  'B: Comparative': modelB_Comparative,
  'C: Apostolic': modelC_Apostolic,
};
const strategies = {
  'approve-all': approveAll,
  'selective': selective,
  'conservative': conservative,
  'mission-focused': missionFocused,
  'danger-seeking': dangerSeeking,
};

for (const [modelName, modelFn] of Object.entries(models)) {
  console.log(`\n=== ${modelName} ===`);
  console.log('Strategy        | Score | Dead | Thrive | Appr | Staff | AtCap | Pool');
  console.log('----------------|-------|------|--------|------|-------|-------|-----');
  for (const [stratName, stratFn] of Object.entries(strategies)) {
    const rs = seeds.map(seed => runModel(seed, stratFn, modelFn));
    const avg = (f) => (rs.map(f).reduce((a,b) => a+b, 0) / rs.length).toFixed(1);
    console.log(
      `${stratName.padEnd(15)} | ${avg(r => r.score).padStart(5)} | ` +
      `${avg(r => r.deaths).padStart(4)} | ${avg(r => r.thriving).padStart(6)} | ` +
      `${avg(r => r.approved).padStart(4)} | ${avg(r => r.staffed).padStart(5)} | ` +
      `${avg(r => r.atCap).padStart(5)} | ${avg(r => r.pool).padStart(4)}`
    );
  }
}

// Adversarial: spam to empty missions (tests Model A need bonus)
console.log('\n=== ADVERSARIAL: Spam neediest mission ===');
function spamNeedy(state, terna) {
  // Always approve all, always to neediest (exploits Model A need bonus)
  let neediest = terna[0].destination;
  let lowest = Infinity;
  for (const destId of Object.keys(state.missions || {})) {
    const st = missionStaff(state, destId);
    const ratio = missionStaffed(st) / (st.capacity || 5);
    if (ratio < lowest) { lowest = ratio; neediest = destId; }
  }
  return terna.map(t => ({ id: t.petitionerId, destination: neediest }));
}
for (const [modelName, modelFn] of Object.entries(models)) {
  const rs = seeds.map(seed => runModel(seed, spamNeedy, modelFn));
  const avgScore = (rs.map(r => r.score).reduce((a,b) => a+b, 0) / rs.length).toFixed(1);
  console.log(`${modelName}: spam-needy scores ${avgScore} (vs approve-all baseline)`);
}
