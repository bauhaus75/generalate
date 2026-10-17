/** engine.js — GENERALATE simulation engine. Pure logic: no DOM, no network.
 * All randomness is seeded and serialized; playthroughs are reproducible. */

import { makeRng } from './rng.js';
import { getGameData } from './data.js';
import * as rules from './rules.js';
import * as dice from './dice.js';
import * as dispositions from './dispositions.js';
import { fictionalPetitioner, archiveFictional, MAX_ACTIVE_FICTIONAL } from './generator.js';
import {decideVows,inviteFinalVows,completeFinalVows,rankSuffix,checkVowsMilestones,ensureVows,purgeVowsState,vowsTrackFor} from './vows.js';
export {decideVows,inviteFinalVows,completeFinalVows,rankSuffix,purgeVowsState,vowsTrackFor};

export const CAMPAIGN_START = 1615;
export const CAMPAIGN_END = 1645;
// 1615–1645 inclusive = 31 ternas (the "30 rounds" in the brief is approximate).
export const CAMPAIGN_ROUNDS = CAMPAIGN_END - CAMPAIGN_START + 1; // 31

/** Re-exported so the UI can read tuning constants (e.g. COMPANION_MAX). */
export const RESOURCES = rules.RESOURCES;

/** Re-exported so the UI can read mission grade tuning (costs, strength, upkeep). */
export const MISSION_GRADES = rules.MISSION_GRADES;
export const MISSION_GRADE_IDS = rules.MISSION_GRADE_IDS;

/**
 * Destination lookup for the UI: {id: {id, name, port, region}}.
 * Populated from game data on first use (data loads async via data.js).
 */
export const DESTINATIONS = {};

function refreshDestinations(g) {
  for (const d of g.destinations) {
    DESTINATIONS[d.id] = {
      id: d.id,
      name: d.name || d.id,
      port: (d.ports && d.ports[d.ports.length - 1]) || d.id,
      region: d.region || '',
    };
  }
}

/** Petitioner record statuses. */
export const STATUS = Object.freeze({
  NEW: 'new',           // never appeared in a terna
  DENIED: 'denied',     // denied at least once; may return
  APPROVED: 'approved', // approved; waiting in the departure queue
  IN_TRANSIT: 'in-transit',
  ACTIVE: 'active',     // thriving or reassigned at the mission
  RETURNED: 'returned',
  ILL: 'ill',
  DECEASED: 'deceased',
  DISMISSED: 'dismissed',
});

/** Statuses eligible to appear in a terna. */
const TERNA_ELIGIBLE = [STATUS.NEW, STATUS.DENIED];

/** Fictional petitioners denied this many times lay down the petition (rolling cap). */
const FIC_DENIAL_RETIREMENT = 3;

function campaignCompleteError() {
  const e = new Error(`Campaign complete (${CAMPAIGN_START}–${CAMPAIGN_END}). Call endGame().`);
  e.code = 'CAMPAIGN_COMPLETE';
  return e;
}

export function ensureData(override) {
  const raw = override || getGameData();
  if (!raw) {
    throw new Error('GENERALATE: no game data — call loadGameData() or setGameData() first.');
  }
  refreshDestinations(raw);
  return raw;
}

/** Restore the main RNG from serialized state. */
function mainRng(state) {
  const r = makeRng('generalate:main');
  r.setState(state.rngState);
  return r;
}

/** Persist RNG state back into the state object. */
function saveRng(state, rng) {
  state.rngState = rng.getState();
}

/** Deterministic substream from seed + label only; never perturbs other streams. */
export function streamFor(state, ...parts) {
  return makeRng(`${state.seed}::${parts.join(':')}`);
}

function initDestState(destinations) {
  const ds = {};
  for (const d of destinations) ds[d.id] = { danger: 1, access: 'open' };
  return ds;
}

// ---------------------------------------------------------------------------
// Mission staffing — men stationed at each mission, by Jesuit grade.
// ---------------------------------------------------------------------------

/**
 * Initial staffing per mission. The missions are not empty in 1615 — each
 * begins at roughly half its capacity, split across the three grades in a
 * fixed deterministic ratio. The General's task is to bring them to strength.
 */
function initMissions(destinations) {
  const ms = {};
  const list = destinations || Object.keys(rules.MISSION_CAPACITY).map((id) => ({ id }));
  for (const d of list) {
    const id = d.id || d;
    const capacity = rules.MISSION_CAPACITY[id] ?? 5;
    const total = Math.floor(capacity * 0.35);
    const fathers = Math.round(total * 0.2);
    const coadjutors = Math.round(total * 0.3);
    ms[id] = {
      fathers,
      coadjutors,
      brothers: Math.max(0, total - fathers - coadjutors),
      capacity,
      fragileYears: 0,
      fragile: false,
      thrivingCount: 0,
    };
  }
  return ms;
}

/** Get-or-create the staffing record for a mission. */
export function missionStaff(state, destId) {
  if (!state.missions || typeof state.missions !== 'object') state.missions = initMissions();
  let st = state.missions[destId];
  if (!st) {
    st = { fathers: 0, coadjutors: 0, brothers: 0, capacity: rules.MISSION_CAPACITY[destId] ?? 5 };
    state.missions[destId] = st;
  }
  for (const gid of rules.MISSION_GRADE_IDS) if (typeof st[gid] !== 'number' || st[gid] < 0) st[gid] = 0;
  if (typeof st.capacity !== 'number' || st.capacity < 1) st.capacity = rules.MISSION_CAPACITY[destId] ?? 5;
  if (typeof st.fragileYears !== 'number' || st.fragileYears < 0) st.fragileYears = 0;
  if (typeof st.fragile !== 'boolean') st.fragile = st.fragileYears >= 3;
  if (typeof st.thrivingCount !== 'number' || st.thrivingCount < 0) st.thrivingCount = 0;
  return st;
}

/** Total souls stationed at a mission. */
export function missionStaffed(st) {
  return rules.MISSION_GRADE_IDS.reduce((n, gid) => n + (st[gid] || 0), 0);
}

/** Mission strength: grade-weighted station strength (fathers 3, coadjutors 2, brothers 1). */
export function missionStrength(st) {
  return rules.MISSION_GRADE_IDS.reduce((n, gid) => n + (st[gid] || 0) * rules.MISSION_GRADES[gid].strength, 0);
}

/** Voyage bonus from a strengthened mission: +1 per 6 strength, capped. */
export function missionVoyageBonus(state, destId) {
  const strength = missionStrength(missionStaff(state, destId));
  return Math.min(rules.MISSION_BONUS_MAX, Math.floor(strength / rules.MISSION_STRENGTH_PER_BONUS));
}

/** Yearly upkeep (scudi) for one mission: its capacity costs resources to sustain. */
export function missionUpkeep(st) {
  return Math.max(1, Math.round((st.capacity || 5) / 2));
}

/** Missions below capacity, most-needed first — they ask the General for more men. */
export function missionRequests(state) {
  const g = ensureData();
  const out = [];
  for (const d of g.destinations) {
    const st = missionStaff(state, d.id);
    const staffed = missionStaffed(st);
    if (staffed < st.capacity) {
      out.push({ destId: d.id, name: d.name || d.id, staffed, capacity: st.capacity, want: st.capacity - staffed });
    }
  }
  out.sort((a, b) => b.want - a.want);
  return out;
}

/**
 * Dispatch men directly to a mission, choosing the grade mix.
 * Costs scudi per grade and draws each man from the mission-eligible pool.
 * Invalid dispatches throw and change nothing.
 */
export function dispatchMission(state, destId, counts = {}) {
  const g = ensureData();
  const dest = g.destinations.find((d) => d.id === destId);
  if (!dest) throw new Error(`dispatchMission: unknown destination "${destId}"`);
  const dst = state.destState[destId];
  if (dst && dst.access === 'closed') throw new Error(`dispatchMission: ${dest.name || destId} is closed to new men`);
  const n = {};
  let total = 0;
  let cost = 0;
  for (const gid of rules.MISSION_GRADE_IDS) {
    const v = counts[gid] ?? 0;
    if (!Number.isInteger(v) || v < 0) throw new Error(`dispatchMission: "${gid}" must be a whole number ≥ 0`);
    n[gid] = v;
    total += v;
    cost += v * rules.MISSION_GRADES[gid].cost;
  }
  if (total <= 0) throw new Error('dispatchMission: choose at least one man to send');
  if (state.resources.funds < cost) {
    throw new Error(`dispatchMission: ${cost} scudi needed, the chest holds ${state.resources.funds}`);
  }
  if ((state.available || 0) < total) {
    throw new Error(`dispatchMission: only ${state.available || 0} men can be spared`);
  }
  state.resources.funds -= cost;
  state.available -= total;
  const st = missionStaff(state, destId);
  for (const gid of rules.MISSION_GRADE_IDS) st[gid] += n[gid];
  // Report-card instrumentation (additive only): record mission-strengthening
  // investments for the end-of-generalate report. Never affects rules.
  if (!state.stats) state.stats = {};
  state.stats.missionDispatches = (state.stats.missionDispatches || 0) + total;
  if (!state.stats.missionDispatchDests || typeof state.stats.missionDispatchDests !== 'object') {
    state.stats.missionDispatchDests = {};
  }
  state.stats.missionDispatchDests[destId] =
    (state.stats.missionDispatchDests[destId] || 0) + total;
  const parts = rules.MISSION_GRADE_IDS.filter((gid) => n[gid] > 0)
    .map((gid) => `${n[gid]} ${rules.MISSION_GRADES[gid].short.toLowerCase()}`);
  state.ledger.unshift({
    seq: ++state.seq.ledger, year: state.year, type: 'dispatch',
    text: `Dispatched ${parts.join(', ')} to ${dest.name || destId} — ${cost} scudi from the chest.`,
  });
  return { destId, ...n, total, cost };
}

/**
 * Map a petitioner's grade/ordination to a mission-staffing grade bucket.
 * Fictional and unattested grades land with the brothers (honest default).
 */
export function staffGradeFor(state, petitionerId) {
  // Vows stage takes precedence: it reflects the man's actual rank in the formation system.
  const entry = (state.europeanLabor || []).find((e) => e.petitionerId === petitionerId);
  if (entry && entry.vows && entry.vows.stage) {
    const stage = entry.vows.stage;
    if (stage === 'ordained' || stage === 'coadjutor' || stage === 'professed') return 'fathers';
    if (stage === 'scholastic' || stage === 'novice') return 'coadjutors';
    if (stage === 'brother') return 'brothers';
  }
  const gr = gradeFor(state, petitionerId);
  const grade = String(gr.grade || '').toLowerCase();
  if (gr.ordained === true || grade === 'father' || grade === 'professed') return 'fathers';
  if (grade === 'scholastic') return 'coadjutors';
  return 'brothers';
}

/**
 * A thriving arrival joins the mission's stationed strength; the companions
 * who sailed with him stay on as brothers. Tracked on the voyage so a later
 * homecoming can release them.
 */
function staffArrival(state, v) {
  const sg = staffGradeFor(state, v.petitionerId);
  const mst = missionStaff(state, v.destination);
  mst[sg] += 1;
  const comps = Math.max(0, v.companions || 0);
  if (comps > 0) mst.brothers += comps;
  v.staffGrade = sg;
  v.staffCompanions = comps;
}

function destName(g, id) {
  return g.destinations.find((d) => d.id === id)?.name || DESTINATIONS[id]?.name || id;
}

/** Get-or-create the engine's per-petitioner record (id → status/history). */
export function ensureRecord(state, id, fictional = false) {
  let rec = state.petitioners[id];
  if (!rec) {
    rec = {
      id, fictional: !!fictional, status: STATUS.NEW,
      history: [], deniedCount: 0, usedLetters: [], voyages: [],
      archived: false, ficNum: null, genYear: null,
    };
    state.petitioners[id] = rec;
  }
  return rec;
}

function getRecord(state, id) {
  const rec = state.petitioners[id];
  if (!rec) throw new Error(`Unknown petitioner id "${id}"`);
  return rec;
}

/** Append a ledger entry with a monotonic sequence number. */
export function addLedger(state, entry) {
  state.ledger.push({ seq: ++state.seq.ledger, ...entry });
  return state.ledger[state.ledger.length - 1];
}

/**
 * Record a man laboring in Europe (denied at the desk, or returned from a
 * voyage). One entry per man; re-denial refreshes the year. European fruit
 * is visible in the briefing; only the returned earn score (+1 on the news).
 */
function addEuropeanLabor(state, petitionerId, name, via) {
  if (!Array.isArray(state.europeanLabor)) state.europeanLabor = [];
  const r0=state.petitioners[petitionerId];
  if(r0&&(r0.status===STATUS.DISMISSED||r0.status===STATUS.DECEASED))throw new Error(`addEuropeanLabor: "${petitionerId}" is ${r0.status}.`);
  const existing = state.europeanLabor.find((e) => e.petitionerId === petitionerId);
  if (existing) {
    existing.year = state.year;
    existing.via = via;
    existing.vows = ensureVows(state, petitionerId);
    return existing;
  }
  const rec = { petitionerId, name, year: state.year, via, assignment: null };
  // entryYear must precede ensureVows (it auto-resolves past milestones by years).
  const pr0 = state.petitioners[petitionerId];
  if (pr0 && pr0.entryYear == null) pr0.entryYear = state.year;
  rec.vows = ensureVows(state, petitionerId);
  state.europeanLabor.push(rec);
  return rec;
}

/**
 * Whether a man is eligible for ordination: a scholastic with 12+ years in the Society.
 * Eligibility does not confer ordination; the General must decide.
 */
export function ordinationEligible(state, petitionerId) {
  if (staffGradeFor(state, petitionerId) !== 'coadjutors') return false;
  const pet = getGameData().petitioners.find((p) => p.id === petitionerId);
  const rec = state.petitioners[petitionerId];
  const years = (rec && rec.yearsInSociety) ?? (pet ? pet.yearsInSociety : 0) ?? 0;
  // Years increase as the campaign progresses; use entry year + elapsed.
  const entryYear = (rec && rec.entryYear) ?? (pet ? pet.entryYear : state.year) ?? state.year;
  return (state.year - entryYear + years) >= 12;
}

/**
 * Compute a petitioner's effective years in the Society at the current game year.
 * Matches the engine's existing entry-year + base-years calculation used by ordination checks.
 */
export function yearsInSociety(state, petitionerId) {
  const g = getGameData();
  const pet = g ? (g.petitioners || []).find((p) => p.id === petitionerId) : null;
  const rec = state.petitioners ? state.petitioners[petitionerId] : null;
  const years = (rec && typeof rec.yearsInSociety === 'number') ? rec.yearsInSociety : (pet && typeof pet.yearsInSociety === 'number' ? pet.yearsInSociety : 0);
  const entryYear = (rec && typeof rec.entryYear === 'number') ? rec.entryYear : (pet && typeof pet.entryYear === 'number' ? pet.entryYear : (state && typeof state.year === 'number' ? state.year : 0));
  const yearNow = (state && typeof state.year === 'number') ? state.year : 0;
  return years + (yearNow - entryYear);
}

/**
 * Ordain an eligible scholastic as a priest. The General's decision, not automatic.
 * Sets an override so staffGradeFor returns 'fathers'. Cannot be undone.
 */
export function ordainPriest(state, petitionerId) {
  if (!ordinationEligible(state, petitionerId)) {
    throw new Error('Ordination requires an eligible scholastic (12+ years in the Society).');
  }
  const entry = (state.europeanLabor || []).find((e) => e.petitionerId === petitionerId);
  const name = entry ? entry.name : petitionerId;
  const rec = ensureRecord(state, petitionerId, false);
  rec.ordainedOverride = true;
  rec.ordinationYear = state.year;
  addLedger(state, {
    year: state.year, type: 'ordination', petitionerId, decision: 'ordained',
    text: `${name} ordained to the priesthood.`,
  });
  return true;
}

/**
 * Career stage for display: scholastic, ordination-eligible, ordained, veteran.
 */
export function careerStage(state, petitionerId) {
  const grade = staffGradeFor(state, petitionerId);
  if (grade === 'fathers') {
    const rec = state.petitioners[petitionerId];
    const isVeteran = (state.europeanLabor || []).some((e) => e.petitionerId === petitionerId && e.via === 'veteran');
    return isVeteran ? 'veteran priest' : 'ordained priest';
  }
  if (grade === 'coadjutors') {
    return ordinationEligible(state, petitionerId) ? 'ordination-eligible scholastic' : 'scholastic';
  }
  return 'brother';
}

/** Health description → 1–5 dot rating for the UI. */
function healthRating(health) {
  if (/good health/i.test(health || '')) return 4;
  if (/delicate/i.test(health || '')) return 2;
  if (/recovering/i.test(health || '')) return 3;
  return 3;
}

// ---------------------------------------------------------------------------
// Phase 2 — persistent dispositions & formation
// ---------------------------------------------------------------------------

/**
 * Grade for a petitioner. Historical men: the archive's cataloging, never
 * altered by game systems ("undetermined" stays "Not specified in the
 * source"). Fictional men: seeded. Priesthood vs. other states is preserved
 * as {grade, ordained}.
 */
export function gradeFor(state, petitionerId) {
  const rec0 = state.petitioners[petitionerId];
  if (rec0 && rec0.ordainedOverride === true) return { grade: 'father', ordained: true };
  const g = dispositions.GRADES[petitionerId];
  if (g) return g;
  const rec = state.petitioners[petitionerId];
  if (rec && rec.fictional) {
    const grade = streamFor(state, 'grade', petitionerId)
      .pick(['brother', 'brother', 'brother', 'scholastic', 'scholastic', 'father']);
    return { grade, ordained: grade === 'father' };
  }
  return { grade: 'undetermined', ordained: null };
}

/**
 * Ensure the four-layer disposition record exists. Deterministic per
 * seed + man: evidence is hand-curated (missing = not attested, never a
 * low score); initial is seeded (attested traits start at 4–5); current
 * begins as a copy of initial; observed accumulates along the way.
 */
export function ensureDisposition(state, petitionerId) {
  const rec = ensureRecord(state, petitionerId);
  if (!rec.disposition) {
    const evidence = dispositions.EVIDENCE[petitionerId] || {};
    const rng = streamFor(state, 'disposition', petitionerId);
    const initial = {};
    for (const t of dispositions.TRAITS) {
      if (evidence[t.id]) {
        initial[t.id] = rng.chance(0.5) ? 5 : 4; // his letters attest it: start strong
      } else {
        const r = rng.float();
        initial[t.id] = r < 0.08 ? 1 : r < 0.25 ? 2 : r < 0.75 ? 3 : r < 0.92 ? 4 : 5;
      }
    }
    rec.disposition = { evidence, initial, current: { ...initial }, observed: [] };
  }
  return rec.disposition;
}

/** Append a simulated observation — labeled observed, never confused with evidence. */
export function observe(state, petitionerId, text) {
  const d = ensureDisposition(state, petitionerId);
  d.observed.push({ year: state.year, text });
}

/** Voyage d20 modifiers from the man's CURRENT disposition (zeal, prudence). */
function dispositionVoyageMods(state, petitionerId) {
  const cur = ensureDisposition(state, petitionerId).current;
  const mods = [];
  if (cur.zeal >= 4) mods.push({ label: 'fervent zeal', value: 1 });
  else if (cur.zeal <= 2) mods.push({ label: 'faltering zeal', value: -1 });
  if (cur.prudence >= 4) mods.push({ label: 'prudent preparation', value: 1 });
  else if (cur.prudence <= 2) mods.push({ label: 'imprudent haste', value: -1 });
  return mods;
}

/**
 * Assign a year of formation to a man laboring in Europe. Costs
 * FORMATION_COST scudi and the man's year. No double-booking: he must be
 * in Europe, not already in formation, and formation never touches his
 * grade — a brother does not become a priest in a year.
 */
export function assignFormation(state, petitionerId, focusId) {
  const focus = dispositions.formationById(focusId);
  if (!focus) throw new Error(`assignFormation: unknown focus "${focusId}".`);
  const entry = (state.europeanLabor || []).find((e) => e.petitionerId === petitionerId);
  if (!entry) throw new Error('Formation is for men laboring in Europe.');
  if (entry.formation && entry.formation.until >= state.year) {
    throw new Error(`${entry.name} is already in formation until ${entry.formation.until}.`);
  }
  if (entry.assignment) {
    throw new Error(`${entry.name} holds a domestic assignment (${entry.assignment}); release him first or interrupt it explicitly.`);
  }
  const cost = hasFormationAide(state)
    ? Math.max(10, dispositions.FORMATION_COST - (rules.DOMESTIC_ROLES.formationAid.formationDiscount || 0))
    : dispositions.FORMATION_COST;
  if (state.resources.funds < cost) {
    throw new Error(`The mission chest cannot bear the formation cost (${cost} scudi).`);
  }
  state.resources.funds -= cost;
  entry.formation = { focus: focusId, until: state.year + 1 };
  ensureDisposition(state, petitionerId);
  addLedger(state, {
    year: state.year, type: 'formation',
    petitionerId, decision: 'assigned', status: 'in-formation',
    note: `${entry.name} begins a year of ${focus.name.toLowerCase()}.`,
  });
  return entry.formation;
}

// ... rest of engine.js unchanged ...
