/** engine.js — GENERALATE simulation engine. Pure logic: no DOM, no network.
 * All randomness is seeded and serialized; playthroughs are reproducible. */

import { makeRng } from './rng.js';
import { getGameData } from './data.js';
import * as rules from './rules.js';
import * as dice from './dice.js';
import * as dispositions from './dispositions.js';
import { fictionalPetitioner, archiveFictional, MAX_ACTIVE_FICTIONAL, FIRST_NAMES, LAST_NAMES } from './generator.js';
import { SCRIPTURE_BANK } from './scripture-bank.js';

/**
 * Select the year's virtue for the Mass of the Holy Spirit opening.
 * Seeded deterministic: same (seed, year) → same virtue and verse.
 * Returns { virtue, verse, ref }.
 */
export function yearVirtue(seed, year) {
  const rng = makeRng(`${seed}:virtue:${year}`);
  const virtues = ['zeal', 'obedience', 'prudence', 'humility', 'patience', 'adaptability', 'stability'];
  const virtue = rng.pick(virtues);
  const candidates = SCRIPTURE_BANK.filter(e => e.virtue === virtue);
  const pick = rng.pick(candidates);
  return { virtue, verse: pick.reference, ref: pick.reference, theme: pick.theme, id: pick.id, text: pick.text };
}
import {decideVows,inviteFinalVows,completeFinalVows,rankSuffix,checkVowsMilestones,ensureVows,purgeVowsState,vowsTrackFor,FORMATION_THRESHOLDS} from './vows.js';
export {decideVows,inviteFinalVows,completeFinalVows,rankSuffix,purgeVowsState,vowsTrackFor,FORMATION_THRESHOLDS};

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
  for (const d of destinations) ds[d.id] = { danger: d.danger ?? 1, access: d.frontier ? 'closed' : 'open' };
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
function initMissions(destinations, petitioners) {
  const ms = {};
  const list = destinations || Object.keys(rules.MISSION_CAPACITY).map((id) => ({ id }));
  for (const d of list) {
    const id = d.id || d;
    const capacity = rules.MISSION_CAPACITY[id] ?? 5;
    const total = Math.max(2, Math.round(capacity * 0.35)); // min 2 men, avoids <25% trap
    const fathers = Math.round(total * 0.2);
    const coadjutors = Math.round(total * 0.3);
    // Starting counts only: newGame mints a real named man (profile +
    // backdated arrival) behind every one of these counts — every man a
    // profile (Tran 2026-10-20). Real petitioner ids are never dealt out
    // as starting staff (the old phantom bug: men still in Europe were
    // rolled for disease at missions they had never visited).
    ms[id] = {
      fathers,
      coadjutors,
      brothers: Math.max(0, total - fathers - coadjutors),
      staffIds: [],
      capacity,
      fragileYears: 0,
      fragile: false,
      thrivingCount: 0,
      // Historical founding year from destination data (for native vocations)
      foundedYear: typeof d.foundedYear === 'number' ? d.foundedYear : undefined,
    };
  }
  return ms;
}

/** Get-or-create the staffing record for a mission. */
export function missionStaff(state, destId) {
  if (!state.missions || typeof state.missions !== 'object') state.missions = initMissions();
  let st = state.missions[destId];
  if (!st) {
    st = { fathers: 0, coadjutors: 0, brothers: 0, capacity: rules.MISSION_CAPACITY[destId] ?? 5, fruits: 0 };
    state.missions[destId] = st;
  }
  if (typeof st.fruits !== 'number' || st.fruits < 0) st.fruits = 0;
  for (const gid of rules.MISSION_GRADE_IDS) if (typeof st[gid] !== 'number' || st[gid] < 0) st[gid] = 0;
  if (typeof st.capacity !== 'number' || st.capacity < 1) st.capacity = rules.MISSION_CAPACITY[destId] ?? 5;
  if (typeof st.fragileYears !== 'number' || st.fragileYears < 0) st.fragileYears = 0;
  if (typeof st.fragile !== 'boolean') st.fragile = st.fragileYears >= 5;
  if (typeof st.thrivingCount !== 'number' || st.thrivingCount < 0) st.thrivingCount = 0;
  return st;
}

/** Total souls stationed at a mission. */
export function missionStaffed(st) {
  return rules.MISSION_GRADE_IDS.reduce((n, gid) => n + (st[gid] || 0), 0);
}

// ---------------------------------------------------------------------------
// Every man a profile (Tran 2026-10-20): no count at a mission may exist
// without a named man behind it. Men who were stationed before the game
// (starting staff, legacy abstract arrivals, roster placeholders) are
// minted as real fictional men — a profile, a disposition, and a voyage
// record showing an arrival in a past year — so the fruit system, the
// roster, disease and persecution all see the same person the counts
// describe. Minting is deterministic per man (seeded from his own id)
// and never touches the grade counts: callers own the counts.
// ---------------------------------------------------------------------------
const STAFF_CULTURES = ['italian', 'spanish', 'portuguese'];
const STAFF_STAGE = { fathers: 'professed', coadjutors: 'scholastic', brothers: 'brother' };

/** Create one real man stationed at a mission, arrived in `arriveYear`.
 *  Adds his profile, his arrival voyage, and his name to the roster.
 *  Does NOT change the mission's grade counts. Returns his id. */
export function mintMissionMan(state, destId, bucket, arriveYear) {
  if (!state._staffSeq) state._staffSeq = 0;
  const pid = `staff-${destId}-${++state._staffSeq}`;
  const rng = makeRng(`${state.seed}:staff:${pid}`);
  const culture = rng.pick(STAFF_CULTURES);
  const name = `${rng.pick(FIRST_NAMES[culture])} ${rng.pick(LAST_NAMES[culture])}`;
  const g = ensureData();
  const dest = (g.destinations || []).find((d) => d.id === destId);
  const travel = (dest && dest.travelYears) || 2;
  const entryYear = arriveYear - rng.int(3, 22);
  const voyage = {
    id: `voy-${pid}`, petitionerId: pid, name, destination: destId,
    stage: 'arrived', outcome: 'thriving', staffGrade: bucket,
    departYear: arriveYear - travel, arriveYear,
    companions: 0, companionIds: [], mintedStaff: true,
  };
  state.voyages.push(voyage);
  const rec = {
    id: pid, name, fictional: true, culture,
    status: 'active', history: [], historyV: HISTORY_VERSION,
    voyages: [voyage.id],
    entryYear, genYear: entryYear, staffMinted: true,
    trueEntryYear: entryYear,
    totalYearsInSociety: Math.max(0, state.year - entryYear),
    ageInReligion: Math.max(0, state.year - entryYear),
    vows: { stage: STAFF_STAGE[bucket] || 'brother', firstVows: true },
    age: rng.int(17, 27) + Math.max(0, state.year - entryYear),
  };
  rec.history.push({ year: arriveYear, kind: 'mission', event: 'arrival',
    text: `${name} arrived at ${(dest && dest.name) || destId} in ${arriveYear}.` });
  state.petitioners[pid] = rec;
  const st = missionStaff(state, destId);
  if (!st.staffIds) st.staffIds = [];
  if (!st.staffIds.includes(pid)) st.staffIds.push(pid);
  return pid;
}

/** Give a profile to a rostered id that has none (legacy placeholder ids
 *  like "dispatched-<dest>-<year>-<n>" from before this rule). The man
 *  keeps his id; he gains a name, a record, and an arrival voyage. */
function profileRosteredId(state, destId, pid, bucket) {
  const rng = makeRng(`${state.seed}:staff:${pid}`);
  const culture = rng.pick(STAFF_CULTURES);
  const name = `${rng.pick(FIRST_NAMES[culture])} ${rng.pick(LAST_NAMES[culture])}`;
  const g = ensureData();
  const dest = (g.destinations || []).find((d) => d.id === destId);
  const travel = (dest && dest.travelYears) || 2;
  const arriveYear = Math.max((dest && dest.foundedYear) || 1615, state.year - rng.int(0, 6));
  const entryYear = arriveYear - rng.int(3, 22);
  const voyage = {
    id: `voy-${pid}`, petitionerId: pid, name, destination: destId,
    stage: 'arrived', outcome: 'thriving', staffGrade: bucket,
    departYear: arriveYear - travel, arriveYear,
    companions: 0, companionIds: [], mintedStaff: true,
  };
  state.voyages.push(voyage);
  state.petitioners[pid] = {
    id: pid, name, fictional: true, culture,
    status: 'active', history: [{ year: arriveYear, kind: 'mission', event: 'arrival',
      text: `${name} arrived at ${(dest && dest.name) || destId} in ${arriveYear}.` }],
    historyV: HISTORY_VERSION,
    voyages: [voyage.id],
    entryYear, genYear: entryYear, staffMinted: true,
    trueEntryYear: entryYear,
    totalYearsInSociety: Math.max(0, state.year - entryYear),
    ageInReligion: Math.max(0, state.year - entryYear),
    vows: { stage: STAFF_STAGE[bucket] || 'brother', firstVows: true },
    age: rng.int(17, 27) + Math.max(0, state.year - entryYear),
  };
  return pid;
}

/**
 * Bring every open mission's roster into line with its counts: any count
 * without a named man behind it gets one (minted), and any rostered id
 * without a profile gets one. Idempotent — once names match counts there
 * is nothing to do. Runs at newGame (starting staff) and on save load
 * (legacy saves whose staff were counts or placeholders). Closed
 * (never-founded frontier) fields are skipped: their counts are a field
 * not yet gathered, and their first real men arrive with the founding.
 * Returns the number of men minted or profiled.
 */
export function mintUnnamedStaff(state) {
  let made = 0;
  for (const destId of Object.keys(state.missions || {})) {
    const dst = (state.destState || {})[destId] || {};
    if (dst.access === 'closed') continue;
    const st = missionStaff(state, destId);
    const named = { fathers: 0, coadjutors: 0, brothers: 0 };
    for (const pid of [...(st.staffIds || [])]) {
      const bucket = stationedGradeFor(state, destId, pid);
      if (!state.petitioners[pid]) {
        profileRosteredId(state, destId, pid, bucket);
        made += 1;
      }
      if (named[bucket] != null) named[bucket] += 1;
    }
    for (const bucket of rules.MISSION_GRADE_IDS) {
      let gap = (st[bucket] || 0) - (named[bucket] || 0);
      while (gap > 0) {
        gap -= 1;
        const rng = makeRng(`${state.seed}:staffback:${destId}:${bucket}:${gap}:${state._staffSeq || 0}`);
        const founded = typeof st.foundedYear === 'number' ? st.foundedYear : 1606;
        const span = Math.max(0, state.year - Math.max(1606, founded - 5));
        const arriveYear = state.year - (span > 0 ? rng.int(0, Math.min(9, span)) : 0);
        mintMissionMan(state, destId, bucket, arriveYear);
        made += 1;
      }
    }
  }
  return made;
}

/**
 * Remove a named man from a mission's stationed strength.
 * The name leaves the roster AND the matching grade bucket loses one man,
 * so counts can never drift from the names. (Previously removals always
 * subtracted from "fathers" first, whatever the man's actual grade.)
 * Also drops any pending illness entry for him.
 */
export function removeStationedMan(state, st, petitionerId) {
  if (Array.isArray(st.staffIds)) {
    const idx = st.staffIds.indexOf(petitionerId);
    if (idx >= 0) st.staffIds.splice(idx, 1);
  }
  // His count lives in his arrival bucket (see stationedGradeFor).
  let bucket = null;
  for (const [destId, m] of Object.entries(state.missions || {})) {
    if (m === st) { bucket = stationedGradeFor(state, destId, petitionerId); break; }
  }
  if (!bucket) bucket = staffGradeFor(state, petitionerId);
  if (st[bucket] > 0) st[bucket] -= 1;
  else if (st.fathers > 0) st.fathers -= 1;
  else if (st.coadjutors > 0) st.coadjutors -= 1;
  else if (st.brothers > 0) st.brothers -= 1;
  if (state.sickMen) delete state.sickMen[petitionerId];
}

/**
 * Release a voyage's stationed strength: the man and the companions who
 * sailed with him leave a mission's roster — names and counts together.
 * Used when he comes home a veteran and when he dies in the field.
 * Companions are identified by the ids recorded on the voyage at arrival;
 * voyages from older saves carry no list, so fall back to the companion
 * ids minted for that mission in his arrival year.
 */
export function releaseVoyageStation(state, v) {
  const mst = missionStaff(state, v.destination);
  if (Array.isArray(mst.staffIds)) {
    const idx = mst.staffIds.indexOf(v.petitionerId);
    if (idx >= 0) mst.staffIds.splice(idx, 1);
  }
  const grade = v.staffGrade || staffGradeFor(state, v.petitionerId);
  if (grade) mst[grade] = Math.max(0, (mst[grade] || 0) - 1);
  if (state.sickMen) delete state.sickMen[v.petitionerId];
  if (v.staffCompanions) {
    let cids = Array.isArray(v.companionIds) ? [...v.companionIds] : [];
    if (!cids.length && Array.isArray(mst.staffIds)) {
      const prefix = `companion-${v.destination}-${v.arriveYear}-`;
      cids = mst.staffIds.filter((id) => String(id).startsWith(prefix)).slice(0, v.staffCompanions);
    }
    for (const cid of cids.slice(0, v.staffCompanions)) {
      if (Array.isArray(mst.staffIds) && mst.staffIds.includes(cid)) {
        removeStationedMan(state, mst, cid);
      }
    }
  }
}

/**
 * The grade bucket a stationed man's COUNT lives in at a mission: the
 * bucket stamped on his arrival voyage. A man's current grade can drift
 * (a scholastic is ordained in the field), but his count stays in the
 * bucket it arrived in — removals and roster accounting must use the
 * stamp, not the man's present grade.
 */
export function stationedGradeFor(state, destId, petitionerId) {
  for (const v of state.voyages || []) {
    if (v.petitionerId === petitionerId && v.destination === destId && v.staffGrade) {
      return v.staffGrade;
    }
  }
  return staffGradeFor(state, petitionerId);
}

/** Mission strength: grade-weighted station strength (fathers 3, coadjutors 2, brothers 1). */
export function missionStrength(st) {
  return rules.MISSION_GRADE_IDS.reduce((n, gid) => n + (st[gid] || 0) * rules.MISSION_GRADES[gid].strength, 0);
}

/** Voyage bonus from a strengthened mission: +1 per 6 strength, capped. */
/**
 * The Engine of the Society (Tran 2026-10-19): the old Society held that the
 * Masses of its priests — offered for the missions and the Father General —
 * were the engine of the whole enterprise. Strength = living ordained priests
 * (mission fathers + ordained men in Europe) + the martyrs, who intercede
 * from heaven. Bonus: +0.15 per unit of strength, uncapped.
 * The General sets ONE intention: a mission (voyage bonus there) or the
 * Society as a whole (+zeal to all men that year).
 */
export function engineStrength(state) {
  let priests = 0;
  for (const destId of Object.keys(state.missions || {})) {
    priests += missionStaff(state, destId).fathers || 0;
  }
  for (const e of state.europeanLabor || []) {
    const st = e.vows?.stage;
    if (st === 'ordained' || st === 'professed' || st === 'coadjutor') priests += 1;
  }
  return { priests, martyrs: state.stats?.martyrs || 0, total: priests + (state.stats?.martyrs || 0) };
}
export function engineBonus(state) {
  // Tran 2026-10-19: +0.15 per martyr (and per priest's Mass), uncapped.
  return Math.round(engineStrength(state).total * 0.15 * 100) / 100;
}
export function setIntention(state, target) {
  state.intention = { target: target || 'society', year: state.year };
  return state.intention;
}
export function intentionVoyageMod(state, destId) {
  if (!state.intention || state.intention.target !== destId) return 0;
  return engineBonus(state);
}

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
// ---------------------------------------------------------------------------
// Provincial manpower requests: each provincial may ask for men by grade —
// professed, fathers, brothers. The General sends no men, agrees, or sends
// his own mix. One pending request per province at a time.
// ---------------------------------------------------------------------------

/** Request grade categories (the General's words). */
export const REQUEST_GRADES = ['professed', 'fathers', 'brothers'];

/** Map a request grade to the mission-staffing bucket it fills. */
/**
 * Maps a provincial request grade to the staff grade actually sent.
 * A request for "fathers" is filled by coadjutors (priests not yet professed)
 * at the coadjutor rate (80), not by professed fathers (120). The professed
 * are 4th-vow men, reserved for requests explicitly naming them.
 */
function requestGradeToStaffGrade(cat) {
  return cat === 'professed' ? 'fathers' : cat === 'fathers' ? 'coadjutors' : 'brothers';
}

/** Does a European labor entry count for a request grade? */
function entryMatchesRequestGrade(state, entry, cat) {
  const id = entry.petitionerId;
  if (cat === 'brothers') return staffGradeFor(state, id) === 'brothers';
  if (cat === 'professed') return isProfessedPriest(state, id);
  return staffGradeFor(state, id) === 'fathers' && !isProfessedPriest(state, id);
}

/** European labor entries available for a request grade (not ill, free). */
export function requestGradePool(state, cat) {
  return (state.europeanLabor || []).filter((e) =>
    !e.ill && !e.assignment && !(e.formation && e.formation.until > state.year)
    && entryMatchesRequestGrade(state, e, cat));
}

/** How many men in Europe can fill a request grade (for the UI). */
export function requestGradeAvailable(state, cat) {
  return requestGradePool(state, cat).length;
}

/** Region ids with a pending manpower request. */
export function provincesWithRequests(state) {
  return Object.keys(state.provincialRequests || {}).filter((rid) => state.provincialRequests[rid]);
}

/**
 * Each provincial may issue a manpower request. Seeded; roughly two in three
 * provinces ask per year; one pending request per province at a time.
 * Deliberately sometimes conflicts with the Society's other needs.
 */
export function generateProvincialRequests(state, y) {
  if (!state.provincialRequests) state.provincialRequests = {};
  if (!state.provincials) return;
  for (const r of PROVINCIAL_REGIONS) {
    const prov = state.provincials[r.id];
    if (!prov || prov.vacant) continue;
    if (state.provincialRequests[r.id]) continue;
    const rng = streamFor(state, 'prov-request', r.id, String(y));
    // Patience: patient provincials wait (50%), impatient demand (80%).
    const pd = prov.petitionerId ? ensureDisposition(state, prov.petitionerId).current : null;
    const patience = pd ? (pd.patience || 3) : 3;
    const reqChance = patience === 5 ? 0.40 : patience === 4 ? 0.50 : patience === 2 ? 0.80 : patience === 1 ? 0.90 : 0.65;
    if (!rng.chance(reqChance)) continue;
    const prudence = pd ? (pd.prudence || 3) : 3;
    const humility = pd ? (pd.humility || 3) : 3;
    let req;
    if (prudence >= 4) {
      // Prudent: requests match actual regional capacity gaps.
      req = { regionId: r.id, year: y, professed: 0, fathers: 0, brothers: 0 };
      const g = getGameData();
      for (const d of (g.destinations || [])) {
        const dr = d.region;
        if ((DEST_REGION_TO_PROVINCE[dr] || 'europe') !== r.id) continue;
        const st = missionStaff(state, d.id);
        const gap = Math.max(0, st.capacity - ((st.fathers || 0) + (st.coadjutors || 0) + (st.brothers || 0)));
        req.fathers = Math.min(3, req.fathers + gap);
      }
      if (!req.professed && !req.fathers && !req.brothers) req.fathers = 1;
    } else {
      req = {
        regionId: r.id, year: y,
        professed: rng.int(0, 2),
        fathers: rng.int(1, 3),
        brothers: rng.int(0, 2),
      };
      if (!req.professed && !req.fathers && !req.brothers) req.fathers = 1;
    }
    // Humility: humble provincials don't presume to ask for professed.
    if (humility >= 4 && req.professed > 0) {
      req.fathers += req.professed;
      req.professed = 0;
    }
    // Low prudence: imprudent provincials over-request (+1 to each).
    // Low humility: proud provincials demand professed (+1).
    if (prudence <= 2) {
      req.professed += 1; req.fathers += 1; req.brothers += 1;
    }
    if (humility <= 2) {
      req.professed += 1;
    }
    state.provincialRequests[r.id] = req;
  }
}

/**
 * Answer a provincial's manpower request.
 * mix: { professed, fathers, brothers } — the numbers to send. All zeros =
 * "send no men". Must not exceed the named men free in Europe per grade.
 * The men are named from Europe and queued for the provincial's HQ
 * mission; they sail on the fleet and cost the usual departure charge
 * when they sail — answering itself is free.
 */
/** Scudi cost of a request answer mix, without executing it. Answering
 *  costs nothing (Tran 2026-10-20, ships only): the men wait at the dock
 *  and pay the usual departure charge when they sail. Kept as a named
 *  zero so the UI and staged answers have one honest figure to show. */
export function requestAnswerCost(mix) {
  return 0;
}

/** Validate a request answer mix against the current Europe pool. Returns normalized counts. */
function validateRequestMix(state, regionId, mix) {
  const req = (state.provincialRequests || {})[regionId];
  if (!req) throw new Error(`no pending request for "${regionId}".`);
  const prov = (state.provincials || {})[regionId];
  if (!prov || prov.vacant) throw new Error(`no provincial for "${regionId}".`);
  const n = {};
  for (const cat of REQUEST_GRADES) {
    const v = mix[cat] ?? 0;
    if (!Number.isInteger(v) || v < 0) throw new Error(`"${cat}" must be a whole number ≥ 0.`);
    const pool = requestGradePool(state, cat);
    // Named men only (Tran 2026-10-20): a request can only be filled by
    // men who actually stand in Europe — no abstract pool covers the rest.
    const maxAvail = pool.length;
    if (v > maxAvail) throw new Error(`only ${maxAvail} ${cat} free in Europe.`);
    n[cat] = v;
  }
  return n;
}

/**
 * Stage a provincial request answer. Nothing moves until the year closes —
 * the General decides during the year, the chest opens at year-end.
 * mix of all zeros = decline. Overwrites any earlier staged answer.
 */
export function stageProvincialAnswer(state, regionId, mix) {
  const n = validateRequestMix(state, regionId, mix);
  // Earmark the actual men: first N free from each grade pool. These are real
  // people, not numbers — the UI shows exactly who is committed.
  const men = {};
  for (const cat of REQUEST_GRADES) {
    men[cat] = requestGradePool(state, cat).slice(0, n[cat]).map((e) => e.petitionerId);
  }
  if (!state.stagedAnswers) state.stagedAnswers = {};
  state.stagedAnswers[regionId] = { regionId, mix: n, men, year: state.year, cost: requestAnswerCost(n) };
  return state.stagedAnswers[regionId];
}

/** Withdraw a staged answer. */
export function unstageProvincialAnswer(state, regionId) {
  if (state.stagedAnswers) delete state.stagedAnswers[regionId];
}

/** Totals across all staged answers: {scudi, men, count}. */
export function stagedCommitments(state) {
  const out = { scudi: 0, men: 0, count: 0 };
  for (const sa of Object.values(state.stagedAnswers || {})) {
    out.scudi += sa.cost || 0;
    out.men += Object.values(sa.mix || {}).reduce((a, b) => a + b, 0);
    out.count += 1;
  }
  return out;
}

/**
 * Execute a staged (or immediate) provincial request answer: men leave Europe,
 * the chest pays, the mission is staffed. Called at year close for staged answers.
 */
export function answerProvincialRequest(state, regionId, mix, earmarked = null) {
  const req = (state.provincialRequests || {})[regionId];
  if (!req) throw new Error(`answerProvincialRequest: no pending request for "${regionId}".`);
  const prov = (state.provincials || {})[regionId];
  if (!prov || prov.vacant) throw new Error(`answerProvincialRequest: no provincial for "${regionId}".`);
  const n = validateRequestMix(state, regionId, mix);
  const total = Object.values(n).reduce((a, b) => a + b, 0);
  const region = PROVINCIAL_REGIONS.find((r) => r.id === regionId);
  const hq = prov.hq || (state.provinceHQs || {})[regionId];
  const g = ensureData();
  const hqDest = hq && g.destinations.some((d) => d.id === hq) ? hq : null;

  if (total === 0) {
    delete state.provincialRequests[regionId];
    addLedger(state, { year: state.year, type: 'provincial-request', decision: 'declined',
      text: `${prov.name} (${region ? region.name : regionId}) asked for men; the General sends none.` });
    return { sent: 0, cost: 0 };
  }

  // Ships only (Tran 2026-10-20): the men sent are named men from Europe
  // who wait at the dock and sail to the provincial's HQ mission. Nothing
  // is charged until they sail, like any other men in the queue.
  if (regionId === 'europe') {
    // The European provincial resides at Rome; there is no mission to
    // receive his men. Answering leaves the men at their posts in Europe.
    delete state.provincialRequests[regionId];
    addLedger(state, { year: state.year, type: 'provincial-request', decision: 'answered',
      text: `${prov.name} (${region ? region.name : regionId}) asked for men; the General leaves the European men at their posts.` });
    return { sent: 0, cost: 0 };
  }
  if (!hqDest) {
    throw new Error(`answerProvincialRequest: ${region ? region.name : regionId} has no mission HQ to receive men — set an HQ for the province first.`);
  }
  if (!isDestOpen(state, hqDest)) {
    throw new Error(`answerProvincialRequest: the HQ mission is closed to new men.`);
  }

  const chosen = [];
  for (const cat of REQUEST_GRADES) {
    if (!n[cat]) continue;
    const pool = requestGradePool(state, cat);
    if (earmarked && earmarked[cat]) {
      // The staged men, by name — verify each is still free in Europe.
      for (const pid of earmarked[cat]) {
        const e = pool.find((x) => x.petitionerId === pid);
        if (!e) throw new Error(`answerProvincialRequest: ${pid} is no longer free in Europe.`);
        chosen.push(e);
      }
    } else {
      chosen.push(...pool.slice(0, n[cat]));
    }
  }
  const men = queueLaborMen(state, chosen, hqDest,
    `sent at the request of the ${region ? region.name : regionId} provincial`);
  const sent = men.length;
  if (!state.stats) state.stats = {};
  state.stats.missionDispatches = (state.stats.missionDispatches || 0) + sent;
  if (!state.stats.missionDispatchDests) state.stats.missionDispatchDests = {};
  state.stats.missionDispatchDests[hqDest] = (state.stats.missionDispatchDests[hqDest] || 0) + sent;

  delete state.provincialRequests[regionId];
  const parts = REQUEST_GRADES.filter((c) => n[c] > 0).map((c) => `${n[c]} ${c}`);
  const hqName = (g.destinations.find((d) => d.id === hqDest) || {}).name || hqDest;
  addLedger(state, { year: state.year, type: 'provincial-request', decision: 'answered',
    text: `${prov.name} (${region ? region.name : regionId}) asked for men; the General sends ${parts.join(', ')} — they wait at the dock for a ship to ${hqName}.` });
  return { sent, cost: 0, men };
}

/**
 * Execute all staged provincial answers at year close. Each is re-validated —
 * men may have died or been sent elsewhere since the decision was staged.
 * Shortfalls are logged, not half-applied.
 */
export function applyStagedAnswers(state) {
  const staged = state.stagedAnswers || {};
  for (const regionId of Object.keys(staged)) {
    const sa = staged[regionId];
    try {
      answerProvincialRequest(state, regionId, sa.mix, sa.men);
    } catch (e) {
      const prov = (state.provincials || {})[regionId];
      const name = prov ? prov.name : regionId;
      addLedger(state, { year: state.year, type: 'provincial-request', decision: 'staged-failed',
        text: `${name}'s staged answer could not be carried out: ${e.message}` });
      delete state.provincialRequests[regionId];
    }
  }
  state.stagedAnswers = {};
}

// ---------------------------------------------------------------------------
// The General's energy: 5 points per year, no rollover. Judgment (indipetae,
// closing the year, answering requests) is free; deliberate interventions cost.
// ---------------------------------------------------------------------------

export const ENERGY_PER_YEAR = 6;

/** Spend energy; throws if the General has none left. */
export function spendEnergy(state, n = 1, action = 'act') {
  // Energy mechanic REMOVED per Tran 2026-10-19. No-op.
  return;
}

/** Reset the year's energy (called when the year turns). */
export function resetEnergy(state) {
  state.energy = ENERGY_PER_YEAR;
  state.questionsAsked = 0;
}

// ---------------------------------------------------------------------------
// Asking a provincial: 3 questions per year across all provinces. Each costs
// 1 energy. Returns the man's petitionerId; the UI renders his dossier.
// ---------------------------------------------------------------------------

export const QUESTIONS_PER_YEAR = 3;

/**
 * Ask a provincial about one of his men. The man must serve in that province.
 * Limited: 3 questions per year, 1 energy each.
 */
export function askProvincial(state, regionId, petitionerId) {
  const prov = (state.provincials || {})[regionId];
  if (!prov || prov.vacant) throw new Error(`askProvincial: no provincial for "${regionId}".`);
  if ((state.questionsAsked || 0) >= QUESTIONS_PER_YEAR) {
    throw new Error('askProvincial: the provincials have answered three questions this year.');
  }
  if (provinceOfMan(state, petitionerId) !== regionId) {
    throw new Error('askProvincial: he does not serve in that province.');
  }
  spendEnergy(state, 1, 'asking a provincial');
  state.questionsAsked = (state.questionsAsked || 0) + 1;
  return { petitionerId, regionId, questionsLeft: QUESTIONS_PER_YEAR - state.questionsAsked };
}

// ---------------------------------------------------------------------------
// Treasury: every movement of scudi is logged by category for the Treasury tab.
// ---------------------------------------------------------------------------

/** Log a funds movement: { income: {cat: amt}, expenses: {cat: amt} }, lifetime + per-year. */
function logFunds(state, dir, category, amount) {
  if (!amount) return;
  if (!state.finance) state.finance = { income: {}, expenses: {} };
  const book = dir === 'in' ? state.finance.income : state.finance.expenses;
  book[category] = (book[category] || 0) + amount;
  if (!state.financeYears) state.financeYears = {};
  const y = state.financeYears[state.year] || (state.financeYears[state.year] = { income: {}, expenses: {} });
  const ybook = dir === 'in' ? y.income : y.expenses;
  ybook[category] = (ybook[category] || 0) + amount;
}

/** Spend scudi, logged under a category. */
export function spendFunds(state, amount, category) {
  if (amount < 0) throw new Error('spendFunds: negative amount.');
  state.resources.funds -= amount;
  logFunds(state, 'out', category, amount);
}

/** Gain scudi, logged under a category. */
export function gainFunds(state, amount, category) {
  if (amount < 0) throw new Error('gainFunds: negative amount.');
  state.resources.funds += amount;
  logFunds(state, 'in', category, amount);
}

/**
 * Found a frontier mission. Costs 1000 scudi + 3 energy + at least 1 man.
 * The founding company is named men from Europe, queued to sail for it;
 * the mission opens at once, its men arrive by ship.
 */
export function foundMission(state, destId, counts = {}) {
  const g = ensureData();
  const dest = g.destinations.find((d) => d.id === destId);
  if (!dest) throw new Error(`foundMission: unknown destination "${destId}"`);
  const dst = state.destState[destId] || {};
  const isRebuild = !!dst.collapsed;
  if (!dest.frontier && !isRebuild) throw new Error(`foundMission: ${dest.name || destId} is not a frontier mission`);
  if (dst.access === 'open' && !isRebuild) throw new Error(`foundMission: ${dest.name || destId} is already founded`);
  const FOUND_COST = 1000;
  const FOUND_ENERGY = 3;
  if (state.resources.funds < FOUND_COST) {
    throw new Error(`foundMission: ${FOUND_COST} scudi needed, the chest holds ${state.resources.funds}`);
  }
  const n = {};
  let total = 0;
  for (const gid of rules.MISSION_GRADE_IDS) {
    const v = counts[gid] ?? 0;
    if (!Number.isInteger(v) || v < 0) throw new Error(`foundMission: "${gid}" must be a whole number ≥ 0`);
    n[gid] = v;
    total += v;
  }
  if (total <= 0) throw new Error('foundMission: send at least one man to found the mission');
  // The founding company is named men from Europe who wait at the dock
  // and sail — ships only (Tran 2026-10-20). Picked (and the shortfall
  // thrown) BEFORE any money moves, so a failed founding changes nothing.
  const { men } = queueNamedMen(state, destId, n, 'founding company');
  if (!state.stats) state.stats = {};
  state.stats.missionDispatches = (state.stats.missionDispatches || 0) + total;
  if (!state.stats.missionDispatchDests) state.stats.missionDispatchDests = {};
  state.stats.missionDispatchDests[destId] = (state.stats.missionDispatchDests[destId] || 0) + total;
  spendFunds(state, FOUND_COST, 'foundations');
  spendEnergy(state, FOUND_ENERGY, 'founding a mission');
  // Clear collapsed flag if rebuilding
  if (state.destState[destId]) {
    delete state.destState[destId].collapsed;
  }
  if (!state.destState[destId]) state.destState[destId] = {};
  state.destState[destId].access = 'open';
  const st = missionStaff(state, destId);
  st.fragileYears = 0; // a (re)foundation starts with a clean fragility clock
  st.fragile = false;
  const parts = rules.MISSION_GRADE_IDS.filter((gid) => n[gid] > 0)
    .map((gid) => `${n[gid]} ${rules.MISSION_GRADES[gid].short.toLowerCase()}`);
  addLedger(state, { year: state.year, type: 'foundation',
    text: `Founded the ${dest.name || destId} mission — ${parts.join(', ')} named from Europe wait at the dock to sail for it. ${FOUND_COST} scudi from the chest.` });
  return { destId, ...n, total, cost: FOUND_COST, men };
}

/**
 * Disband a mission. Stationed men return to Europe (available pool).
 * Costs 1 energy. The mission closes and can be re-founded later.
 */
export function disbandMission(state, destId) {
  const g = ensureData();
  const dest = g.destinations.find((d) => d.id === destId);
  if (!dest) throw new Error(`disbandMission: unknown destination "${destId}"`);
  const dst = state.destState[destId] || {};
  if (dst.access === 'closed') throw new Error(`disbandMission: ${dest.name || destId} is already closed`);
  if (dest.frontier && dst.access !== 'open') throw new Error(`disbandMission: ${dest.name || destId} was never founded`);
  const st = missionStaff(state, destId);
  const total = (st.fathers || 0) + (st.coadjutors || 0) + (st.brothers || 0);
  spendEnergy(state, 1, 'disbanding a mission');
  state.available = (state.available || 0) + total;
  // Named men come home as themselves, not just as a number in the pool:
  // each rostered man (natives excepted — their home is the mission) is
  // back laboring in Europe.
  for (const pid of [...(st.staffIds || [])]) {
    if (String(pid).startsWith('native-')) continue;
    const rec = state.petitioners[pid];
    if (!rec || rec.status === STATUS.DECEASED || rec.status === STATUS.DISMISSED || rec.status === 'apostate') continue;
    if ((state.europeanLabor || []).some((e) => e.petitionerId === pid)) continue;
    addEuropeanLabor(state, pid, rec.name || personName(state, pid), 'returned');
  }
  st.fathers = 0; st.coadjutors = 0; st.brothers = 0;
  st.staffIds = [];
  st.fragileYears = 0; // a closed mission carries no fragility clock
  st.fragile = false;
  if (!state.destState[destId]) state.destState[destId] = {};
  state.destState[destId].access = 'closed';
  addLedger(state, { year: state.year, type: 'disband',
    text: `Disbanded the ${dest.name || destId} mission; ${total} men return to Europe.` });
  return { destId, returned: total };
}

/**
 * Map a petitioner's grade/ordination to a mission-staffing grade bucket.
 * Fictional and unattested grades land with the brothers (honest default).
 */
export function staffGradeFor(state, petitionerId) {
  // Vows stage takes precedence: it reflects the man's actual rank in the formation system.
  // The petitioner's own record carries his vows wherever he is (a stationed
  // man or companion has no europeanLabor entry to read).
  const ownRec = state.petitioners ? state.petitioners[petitionerId] : null;
  // Native vocations carry their grade on the record (no vows, no Europe entry).
  if (ownRec && ownRec.native && typeof ownRec.grade === 'string') {
    const gl = ownRec.grade.toLowerCase();
    if (gl === 'professed' || gl === 'father') return 'fathers';
    if (gl === 'scholastic') return 'coadjutors';
    if (gl === 'brother') return 'brothers';
  }
  const ownStage = ownRec && ownRec.vows && ownRec.vows.stage;
  if (ownStage) {
    if (ownStage === 'ordained' || ownStage === 'coadjutor' || ownStage === 'professed' || ownStage === 'father') return 'fathers';
    if (ownStage === 'scholastic' || ownStage === 'novice') return 'coadjutors';
    if (ownStage === 'brother') return 'brothers';
  }
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
export function staffArrival(state, v) {
  const sg = staffGradeFor(state, v.petitionerId);
  const mst = missionStaff(state, v.destination);
  mst[sg] += 1;
  if (!mst.staffIds) mst.staffIds = [];
  if (!mst.staffIds.includes(v.petitionerId)) mst.staffIds.push(v.petitionerId);
  const comps = Math.max(0, v.companions || 0);
  if (comps > 0) {
    // Distribute companions into staffing buckets by their ticker grade
    const grades = v.companionGrades || {};
    const fathersN = (grades.professed || 0) + (grades.father || 0);
    const scholN = grades.scholastic || 0;
    const brothN = grades.brother || 0;
    const accounted = fathersN + scholN + brothN;
    if (accounted > 0) {
      mst.fathers += fathersN;
      mst.coadjutors += scholN;
      mst.brothers += brothN + Math.max(0, comps - accounted);
    } else {
      mst.brothers += comps;
    }
    // Companions are real men: generate them as fictional petitioners with names
    if (!state._companionSeq) state._companionSeq = 0;
    if (!Array.isArray(v.companionIds)) v.companionIds = [];
    for (let i = 0; i < comps; i++) {
      const cid = `companion-${v.destination}-${state.year}-${++state._companionSeq}`;
      if (!mst.staffIds.includes(cid)) mst.staffIds.push(cid);
      if (!v.companionIds.includes(cid)) v.companionIds.push(cid);
      // Create a full petitioner record so they have names, dispositions, etc.
      // Grade comes from the ticker selection (companionGrades), not hardcoded.
      if (!state.petitioners[cid]) {
        try {
          const g = getGameData();
          const rng = makeRng(`${state.seed}:companion:${cid}`);
          const culture = rng.pick(['italian', 'spanish', 'portuguese']);
          const name = `${rng.pick(FIRST_NAMES[culture])} ${rng.pick(LAST_NAMES[culture])}`;
          // Determine grade from companionGrades (in order: professed, father, scholastic, brother)
          const grades = v.companionGrades || {};
          let grade = 'brother';
          // Assign based on position i among companions
          const gradeOrder = [];
          for (const [gname, count] of Object.entries(grades)) {
            for (let k = 0; k < (count || 0); k++) gradeOrder.push(gname);
          }
          if (gradeOrder[i]) {
            const gn = gradeOrder[i];
            grade = gn === 'professed' ? 'professed' : gn === 'father' ? 'father' : gn === 'scholastic' ? 'scholastic' : 'brother';
          }
          const vowStage = grade === 'professed' ? 'professed' : grade === 'father' ? 'father' : grade === 'scholastic' ? 'scholastic' : 'brother';
          state.petitioners[cid] = {
            id: cid, fictional: true, status: 'active',
            name, culture, history: [], historyV: HISTORY_VERSION,
            disposition: { initial: {}, current: {}, evidence: {}, observed: [] },
            entryYear: state.year, genYear: state.year,
            vows: { stage: vowStage, firstVows: true },
            age: 25 + Math.floor(rng.random() * 20),
          };
          ensureDisposition(state, cid);
        } catch (e) { /* fallback: leave as ID-only */ }
      }
    }
  }
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
      historyV: HISTORY_VERSION,
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
  const added = state.ledger[state.ledger.length - 1];
  const ev = historyEventFromLedger(added);
  if (ev) recordHistory(state, added.petitionerId, ev);
  return added;
}

// ---------------------------------------------------------------------------
// Per-man Formation & Mission history (rec.history)
// ---------------------------------------------------------------------------
// rec.history holds two kinds of entries, kept in year order:
//   legacy desk/dispatch entries  {year, decision, destination, ...}   (no `kind`)
//   life events                   {year, kind:'formation'|'mission', event, text, ...}
// Life events are recorded as they happen (most via addLedger, the rest at
// their engine call sites). Saves from before this (no rec.historyV) are
// backfilled from the ledger, voyages, entry year and vows on deserialize.
export const HISTORY_VERSION = 1;

// Ledger types already mirrored into rec.history by legacy entries.
const LEDGER_SKIP = new Set(['decision', 'dispatch', 'deployment']);

function historyEventFromLedger(e) {
  if (!e || !e.petitionerId || LEDGER_SKIP.has(e.type)) return null;
  const text = e.text || e.note || '';
  const base = { year: e.year, text, ledgerSeq: e.seq };
  if (e.destination) base.destination = e.destination;
  switch (e.type) {
    case 'vows': return { ...base, kind: 'formation', event: e.decision === 'dismissed' ? 'dismissal' : e.decision };
    case 'ordination': return { ...base, kind: 'formation', event: 'ordination' };
    case 'formation': return { ...base, kind: 'formation', event: e.decision === 'completed' ? 'study-completed' : 'study-assigned' };
    case 'domestic': return { ...base, kind: 'mission', event: e.decision === 'released' ? 'assignment-ended' : 'assignment' };
    case 'departure': return { ...base, kind: 'mission', event: 'departure' };
    case 'outcome': return { ...base, kind: 'mission', event: 'news', outcome: e.status };
    case 'veteran': return { ...base, kind: 'mission', event: 'veteran-return' };
    default: return { ...base, kind: 'mission', event: e.type };
  }
}

/** Insert a life event into a man's rec.history (year-ordered, stable). */
export function recordHistory(state, petitionerId, ev) {
  const rec = state && state.petitioners ? state.petitioners[petitionerId] : null;
  if (!rec) return null;
  if (!Array.isArray(rec.history)) rec.history = [];
  const entry = { year: typeof ev.year === 'number' ? ev.year : state.year, kind: ev.kind || 'mission', event: ev.event, text: ev.text || '' };
  const front = !!ev.front; // place before other same-year entries (e.g. entry onto the rolls)
  for (const k of Object.keys(ev)) if (!(k in entry) && k !== 'front' && ev[k] !== undefined) entry[k] = ev[k];
  let i = rec.history.length;
  while (i > 0 && ((rec.history[i - 1].year ?? 0) > entry.year || (front && (rec.history[i - 1].year ?? 0) === entry.year))) i--;
  rec.history.splice(i, 0, entry);
  rec.historyV = HISTORY_VERSION;
  return entry;
}

const HISTORY_LABELS = {
  'novitiate-entry': 'Entered the novitiate', 'novitiate-completed': 'Novitiate completed',
  entry: 'Entered the rolls', 'first-vows': 'First vows', philosophy: 'Philosophy completed', regency: 'Regency completed',
  theology: 'Theology completed', ordination: 'Ordination', tertianship: 'Tertianship', 'final-vows': 'Final vows',
  deferred: 'Deferred', 'deferral-ended': 'Deferral ended', dismissal: 'Dismissed', death: 'Death',
  'news-arrived': 'Word reaches Rome', 'study-assigned': 'Formation study begun', 'study-completed': 'Formation study completed',
  assignment: 'Domestic assignment', 'assignment-ended': 'Assignment ended', departure: 'Departure', arrival: 'Arrival',
  news: 'News of the mission', 'veteran-return': 'Veteran homecoming',
};

function legacyHistoryEvent(g, h) {
  const dn = h.destination ? destName(g, h.destination) : '';
  const map = {
    approved: ['Indies petition approved', `Petition for the Indies approved: ${dn}.`],
    denied: ['Indies petition denied', `Petition for ${dn} denied; he remains to labor in Europe.`],
    'emergency-dispatch': ['emergency dispatch', `Dispatched from formation (${h.fromFormation || 'formation'}) to ${dn}.`],
    'dispatch-europe': ['dispatch', `Dispatched from Europe to ${dn}.`],
    deployment: ['deployment', `Named to a collective deployment for ${dn}.`],
  };
  const m = map[h.decision] || [h.decision, `${h.decision}${dn ? ` (${dn})` : ''}`];
  return { year: h.year, kind: 'mission', event: h.decision, label: m[0], text: m[1], destination: h.destination || null, legacy: true };
}

/** Where the man is now, for the history panel. */
function currentLocation(state, g, petitionerId) {
  const rec = state.petitioners[petitionerId];
  if (!rec) return 'unknown';
  if (rec.status === STATUS.DECEASED) return 'deceased';
  if (rec.status === STATUS.DISMISSED) return 'dismissed from the Society';
  const e = (state.europeanLabor || []).find((x) => x.petitionerId === petitionerId);
  if (e) return e.assignment ? `Europe (${e.assignment})` : (e.formation && e.formation.until > state.year ? 'Europe (in formation)' : 'Europe');
  const vs = (state.voyages || []).filter((v) => v.petitionerId === petitionerId);
  const last = vs[vs.length - 1];
  if (last && last.stage === 'transit') return `at sea, bound for ${destName(g, last.destination)}`;
  if (last && last.stage === 'arrived' && !last.veteranReturned) return destName(g, last.destination);
  if ((state.queue || []).some((q) => q.petitionerId === petitionerId)) return 'awaiting passage';
  return 'unknown';
}

/**
 * Chronological Formation & Mission history for one man (read-only).
 * Returns { petitionerId, events:[{year, kind, event, label, text, destination}], summary }.
 */
export function personHistory(state, petitionerId) {
  const g = ensureData();
  const rec = state.petitioners[petitionerId];
  const events = [];
  for (const h of (rec && rec.history) || []) {
    if (!h || typeof h !== 'object') continue;
    if (h.kind) events.push({ label: h.label || HISTORY_LABELS[h.event] || String(h.event || '').replace(/-/g, ' '), ...h });
    else if (h.decision) events.push(legacyHistoryEvent(g, h));
  }
  const rank = (e) => (e.event === 'novitiate-entry' || e.event === 'novitiate-completed') ? 0 : e.event === 'entry' ? 1 : 2;
  events.sort((a, b) => ((a.year ?? 0) - (b.year ?? 0)) || (rank(a) - rank(b)));
  for (const ev of events) if (ev.destination) ev.destinationName = destName(g, ev.destination);
  return {
    petitionerId,
    events,
    summary: {
      totalYearsInSociety: yearsInSociety(state, petitionerId),
      ageInReligion: ageInReligion(state, petitionerId),
      pausedYears: (rec && rec.pausedYears) || 0,
      paused: formationPaused(state, petitionerId),
      entryYear: displayEntryYear(state, petitionerId),
      status: rec ? rec.status : null,
      location: currentLocation(state, g, petitionerId),
    },
  };
}

/** Backfill rec.history for a save made before HISTORY_VERSION. */
function backfillHistory(state, id) {
  const rec = state.petitioners[id];
  if (!rec || rec.historyV) return;
  if (!Array.isArray(rec.history)) rec.history = [];
  const g = ensureData();
  const add = (ev) => recordHistory(state, id, { backfilled: true, ...ev });
  if (typeof rec.entryYear === 'number') {
    // Backwards math: true entry = 1615 - years in Society
    const yrsInSoc = yearsInSociety(state, id);
    let ty;
    if (typeof rec.trueEntryYear === 'number') {
      ty = rec.trueEntryYear;
    } else if (yrsInSoc > 0) {
      ty = 1615 - yrsInSoc;
    } else {
      ty = rec.entryYear;
    }
    add({ year: ty, front: true, kind: 'formation', event: 'entry', text: `Entered the Society (backfilled).` });
  }
  const led = (state.ledger || []).filter((e) => e.petitionerId === id).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const seen = new Set();
  for (const e of led) {
    const ev = historyEventFromLedger(e);
    if (ev) { add(ev); if (ev.kind === 'formation') seen.add(ev.event); }
  }
  const vw = rec.vows;
  if (vw && typeof vw === 'object') {
    const ms = { firstVows: 'first-vows', philosophy: 'philosophy', regency: 'regency', theology: 'theology' };
    // Backwards math: if the man has years in Society before 1615, date formation events accordingly.
    // Typical timeline: entry Year 0, first vows +2, philosophy +5, regency +8, theology +11.
    const yrsInSociety = yearsInSociety(state, id);
    const gameStart = 1615;
    // Use the same trueEntry as the entry event above (recalculate to ensure consistency)
    const rec2 = state.petitioners[id];
    let trueEntry;
    if (rec2 && typeof rec2.trueEntryYear === 'number') {
      trueEntry = rec2.trueEntryYear;
    } else if (yrsInSociety > 0) {
      trueEntry = gameStart - yrsInSociety;
    } else if (rec2 && typeof rec2.entryYear === 'number') {
      trueEntry = rec2.entryYear;
    } else {
      trueEntry = gameStart;
    }
    const offsets = { firstVows: 2, philosophy: 5, regency: 8, theology: 11 };
    for (const [k, evName] of Object.entries(ms)) {
      if (!vw[k] || seen.has(evName)) continue;
      let yr;
      if (typeof vw[k] === 'number') {
        yr = vw[k];
      } else if (yrsInSociety > 0) {
        // Backdate based on years in Society
        yr = trueEntry + (offsets[k] || 0);
      } else {
        yr = typeof rec.trueEntryYear === 'number' ? rec.trueEntryYear : typeof rec.entryYear === 'number' ? rec.entryYear : state.year;
      }
      const backdated = yrsInSociety > 0 && typeof vw[k] !== 'number';
      add({ year: yr, kind: 'formation', event: evName, text: `${k} recorded${backdated ? ` in ${yr}` : typeof vw[k] === 'number' ? '' : ' before he entered the rolls'} (backfilled).` });
    }
  }
  for (const v of (state.voyages || []).filter((x) => x.petitionerId === id && x.stage === 'arrived')) {
    const yr = v.resolvedYear ?? v.arriveYear ?? state.year;
    add({ year: yr, kind: 'mission', event: 'arrival', destination: v.destination, outcome: v.outcome,
      text: `Voyage to ${destName(g, v.destination)} ended: ${v.outcome} (backfilled).` });
    if (v.outcome === 'deceased') add({ year: yr, kind: 'formation', event: 'death', text: `Died on the mission to ${destName(g, v.destination)} (backfilled).` });
    if (v.veteranReturned && v.veteranYear && !led.some((e) => e.type === 'veteran')) {
      add({ year: v.veteranYear, kind: 'mission', event: 'veteran-return', destination: v.destination, text: `Returned to Europe from ${destName(g, v.destination)} (backfilled).` });
    }
  }
  rec.historyV = HISTORY_VERSION;
}

/** Record a voyage's arrival (and a death, if any) in the man's history. */
function recordArrival(state, g, v) {
  const dn = destName(g, v.destination);
  const words = { thriving: 'arrives and labors fruitfully', reassigned: 'arrives and is reassigned', returned: 'turns back for Europe',
    ill: 'falls gravely ill and is sent back to Europe', deceased: 'dies on the voyage' };
  recordHistory(state, v.petitionerId, { kind: 'mission', event: 'arrival', destination: v.destination, outcome: v.outcome,
    voyageId: v.id, text: `Voyage to ${dn}: ${words[v.outcome] || v.outcome}.` });
  if (v.outcome === 'deceased') {
    recordHistory(state, v.petitionerId, { kind: 'formation', event: 'death', destination: v.destination,
      text: `Dies in the service of the mission to ${dn} (age in religion ${ageInReligion(state, v.petitionerId)}, ${yearsInSociety(state, v.petitionerId)} years in the Society).` });
  }
}

/** Log novitiate entry and completion (at the mission novitiate) in his history. */
function recordNovitiate(state, petitionerId, nv, backfilled) {
  const g = ensureData();
  const dn = destName(g, nv.destination);
  const extra = backfilled ? { backfilled: true } : {};
  recordHistory(state, petitionerId, { year: nv.startYear, kind: 'formation', event: 'novitiate-entry', destination: nv.destination,
    text: `Enters the novitiate at the ${dn} mission.`, ...extra });
  recordHistory(state, petitionerId, { year: nv.endYear, kind: 'formation', event: 'novitiate-completed', destination: nv.destination,
    years: nv.years, text: `Completes ${nv.years} ${nv.years === 1 ? 'year' : 'years'} of novitiate at the ${dn} mission (counted toward age in religion).`, ...extra });
}

/**
 * Persist a novitiate man's grade/track once (old saves). Uses the value set at
 * completion (scholastic; or the in-memory table if this session still has it),
 * but respects a vows stage already recorded as 'brother' so a man is never
 * moved off the track the save shows him on. Idempotent.
 */
function persistNovitiateGrade(state, id) {
  const r = state.petitioners[id];
  if (!r || !(r.novitiate || novitiateInfoFromId(id))) return;
  const onBrother = r.vows && r.vows.stage === 'brother';
  if (!r.savedGrade) {
    const mem = dispositions.GRADES[id];
    r.savedGrade = onBrother ? { grade: 'brother', ordained: false }
      : mem ? { grade: mem.grade, ordained: mem.ordained ?? false }
      : { grade: 'scholastic', ordained: false };
  }
  if (!r.vowsTrack) r.vowsTrack = onBrother || String(r.savedGrade.grade).toLowerCase() === 'brother' ? 'brother' : 'scholastic';
}

/** Mission-novitiate ids look like nov-<destination>-<startYear>-<n>. */
function novitiateInfoFromId(id) {
  const m = /^nov-(.+)-(\d{4})-\d+$/.exec(String(id));
  return m ? { destination: m[1], startYear: parseInt(m[2], 10) } : null;
}

/**
 * Old-save migration for men who came from a mission novitiate: record the
 * novitiate, credit its years to both counters (once), and log it.
 */
function migrateNovitiate(state, id) {
  const r = state.petitioners[id];
  if (!r || r.novitiateCounted) return;
  const inf = r.novitiate || novitiateInfoFromId(id);
  if (!inf) return;
  const e = (state.europeanLabor || []).find((x) => x.petitionerId === id);
  const end = typeof inf.endYear === 'number' ? inf.endYear
    : typeof r.entryYear === 'number' ? r.entryYear
    : (e && typeof e.year === 'number') ? e.year : inf.startYear + 2;
  const years = Math.max(0, end - inf.startYear);
  r.novitiate = { destination: inf.destination, startYear: inf.startYear, endYear: end, years };
  if (typeof r.yearsInSociety !== 'number') r.yearsInSociety = years;
  // Saves that already seeded counters without the novitiate: credit it now.
  if (typeof r.ageInReligion === 'number') {
    if (typeof r.totalYearsInSociety !== 'number') r.totalYearsInSociety = r.ageInReligion;
    r.ageInReligion += years;
    r.totalYearsInSociety += years;
  }
  r.novitiateCounted = true;
  persistNovitiateGrade(state, id);
  const hv = r.historyV;
  recordNovitiate(state, id, r.novitiate, true);
  if (!hv) delete r.historyV; // let backfillHistory still fill the rest
}

/** First entry into the General's rolls: seed counters and log it once. */
function enterSociety(state, petitionerId, via) {
  const rec = state.petitioners[petitionerId];
  if (!rec) return;
  const fresh = typeof rec.ageInReligion !== 'number';
  initAgeInReligion(state, petitionerId);
  if (fresh) {
    const viaText = { approved: 'approved for the Indies at the desk', denied: 'denied at the desk; laboring in Europe',
      returned: 'returned from the missions', veteran: 'returned a veteran', vocation: 'from a mission novitiate', ill: 'returned ill' }[via] || via;
    recordHistory(state, petitionerId, { kind: 'formation', event: 'entry', via,
      text: `Enters the General's rolls (${viaText}) with ${rec.totalYearsInSociety} ${rec.totalYearsInSociety === 1 ? 'year' : 'years'} in the Society.` });
  }
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
    enterSociety(state, petitionerId, via);
    existing.vows = ensureVows(state, petitionerId);
    return existing;
  }
  const rec = { petitionerId, name, year: state.year, via, assignment: null };
  // entryYear must precede ensureVows (it auto-resolves past milestones by years).
  const pr0 = state.petitioners[petitionerId];
  if (pr0 && pr0.entryYear == null) pr0.entryYear = state.year;
  seedTrueEntryYear(state, petitionerId, state.year);
  enterSociety(state, petitionerId, via);
  rec.vows = ensureVows(state, petitionerId);
  state.europeanLabor.push(rec);
  return rec;
}

/**
 * Whether a man is eligible for ordination: a scholastic whose age in religion
 * has reached the ordination threshold (12). Eligibility does not confer
 * ordination; the General must decide.
 */
export function ordinationEligible(state, petitionerId) {
  if (staffGradeFor(state, petitionerId) !== 'coadjutors') return false;
  return ageInReligion(state, petitionerId) >= FORMATION_THRESHOLDS.ordination;
}

// ---------------------------------------------------------------------------
// Age in religion (two counters)
// ---------------------------------------------------------------------------
// Each man who has entered the Society carries two counters, both seeded at
// entry (approved at the desk, or added to europeanLabor) from his historical
// years plus any years elapsed since rec.entryYear:
//
//   rec.totalYearsInSociety  VISIBLE. Whole years in the Society; +1 every
//                            year-advance, deferred or not. UI/diagnostics show it.
//   rec.ageInReligion        BACKGROUND. The counter every formation threshold
//                            reads. +1 every year-advance EXCEPT years in which
//                            the man is under an active deferral
//                            (vows.deferredUntil > the year being resolved).
//
// rec.entryYear is kept as a historical record only; nothing reads it after seeding.

/**
 * Seed rec.trueEntryYear: the man's actual year of entry into the Society.
 * rec.entryYear is the formula anchor (campaign start for historical men) and
 * must not move; the true entry year is anchorYear minus the historical years
 * already credited at seeding. Display and history use the true year; the
 * counters and their formula never read it.
 */
function seedTrueEntryYear(state, petitionerId, anchorYear) {
  const rec = (state && state.petitioners) ? state.petitioners[petitionerId] : null;
  if (!rec || typeof rec.trueEntryYear === 'number') return rec ? rec.trueEntryYear : null;
  const g = getGameData();
  const pet = g ? (g.petitioners || []).find((p) => p.id === petitionerId) : null;
  const base = (typeof rec.yearsInSociety === 'number') ? rec.yearsInSociety
    : (pet && typeof pet.yearsInSociety === 'number') ? pet.yearsInSociety : 0;
  rec.trueEntryYear = anchorYear - Math.max(0, base);
  return rec.trueEntryYear;
}

/** The display/history entry year: true entry when known, else the anchor. */
function displayEntryYear(state, petitionerId) {
  const rec = (state && state.petitioners) ? state.petitioners[petitionerId] : null;
  if (rec && typeof rec.trueEntryYear === 'number') return rec.trueEntryYear;
  if (rec && typeof rec.entryYear === 'number') return rec.entryYear;
  return null;
}

/** Legacy derivation: historical years + (current year - entry year). Pure. */
function legacyAgeInReligion(state, petitionerId) {
  const g = getGameData();
  const pet = g ? (g.petitioners || []).find((p) => p.id === petitionerId) : null;
  const rec = (state && state.petitioners) ? state.petitioners[petitionerId] : null;
  const yearNow = (state && typeof state.year === 'number') ? state.year : 0;
  const base = (rec && typeof rec.yearsInSociety === 'number') ? rec.yearsInSociety
    : (pet && typeof pet.yearsInSociety === 'number') ? pet.yearsInSociety
    : (cardYearsInSociety(state, petitionerId) ?? 0);
  const labor = ((state && state.europeanLabor) || []).find((e) => e.petitionerId === petitionerId);
  const entryYear = (rec && typeof rec.entryYear === 'number') ? rec.entryYear
    : (pet && typeof pet.entryYear === 'number') ? pet.entryYear
    : (labor && typeof labor.year === 'number') ? labor.year
    : yearNow;
  return Math.max(0, base + (yearNow - entryYear));
}

/**
 * The years-in-Society figure the desk card shows for this man, using the same
 * deterministic seeding as the card: enrichPetitioner() for historical men whose
 * record is silent (null), fictionalPetitioner() for generated men. Null if unknown.
 */
export function cardYearsInSociety(state, petitionerId) {
  try {
    const g = getGameData();
    const pet = g ? (g.petitioners || []).find((p) => p.id === petitionerId) : null;
    if (pet) {
      const ep = enrichPetitioner(pet, state.seed);
      return typeof ep.yearsInSociety === 'number' ? ep.yearsInSociety : null;
    }
    const rec = state.petitioners ? state.petitioners[petitionerId] : null;
    if (rec && rec.fictional && rec.ficNum != null && g) {
      const fp = fictionalData(state, g, rec);
      return typeof fp.yearsInSociety === 'number' ? fp.yearsInSociety : null;
    }
  } catch (e) { /* fall through */ }
  return null;
}

function recOf(state, petitionerId) {
  return (state && state.petitioners) ? state.petitioners[petitionerId] : null;
}

/**
 * BACKGROUND counter used by all progression thresholds. Pauses during
 * deferrals. Unseeded records fall back to the legacy derivation.
 * Never mutates state and never throws.
 */
export function ageInReligion(state, petitionerId) {
  try {
    const rec = recOf(state, petitionerId);
    if (rec && typeof rec.ageInReligion === 'number') return rec.ageInReligion;
    return legacyAgeInReligion(state, petitionerId);
  } catch (e) {
    return 0;
  }
}

/**
 * VISIBLE counter: total years in the Society, never paused. This is what the
 * UI and diagnostics display. Unseeded records fall back to the legacy derivation.
 */
export function yearsInSociety(state, petitionerId) {
  try {
    const rec = recOf(state, petitionerId);
    if (rec && typeof rec.totalYearsInSociety === 'number') return rec.totalYearsInSociety;
    return legacyAgeInReligion(state, petitionerId);
  } catch (e) {
    return 0;
  }
}

/** Seed both counters if missing (entry into the Society, or old-save migration). */
export function initAgeInReligion(state, petitionerId) {
  const rec = recOf(state, petitionerId);
  if (!rec) return null;
  const hasAir = typeof rec.ageInReligion === 'number';
  const hasTot = typeof rec.totalYearsInSociety === 'number';
  if (!hasAir || !hasTot) {
    const legacy = legacyAgeInReligion(state, petitionerId);
    if (!hasTot) rec.totalYearsInSociety = hasAir ? Math.max(rec.ageInReligion, legacy) : legacy;
    if (!hasAir) rec.ageInReligion = legacy;
  }
  return rec.ageInReligion;
}

/** Whether the man is under an active deferral during year y. */
export function formationPaused(state, petitionerId, y = state && state.year) {
  const rec = recOf(state, petitionerId);
  const vw = rec && rec.vows;
  return !!(vw && typeof vw.deferredUntil === 'number' && vw.deferredUntil > y);
}

/**
 * Year-advance step for both counters. Only men who have entered the Society
 * (entryYear set) count; the dismissed and the dead stop. Unseeded members are
 * seeded at the current year first, so old saves migrate transparently.
 * The total always moves; ageInReligion skips years under active deferral
 * (only for the normal +1 step; debug jumps move both counters).
 */
function advanceAgeInReligion(state, years = 1, { honorDeferral = true } = {}) {
  for (const id of Object.keys(state.petitioners || {})) {
    const rec = state.petitioners[id];
    if (!rec || rec.status === STATUS.DISMISSED || rec.status === STATUS.DECEASED) continue;
    if (typeof rec.ageInReligion !== 'number' || typeof rec.totalYearsInSociety !== 'number') {
      if (typeof rec.entryYear !== 'number' && typeof rec.ageInReligion !== 'number') continue; // not (yet) in the Society
      initAgeInReligion(state, id);
    }
    rec.totalYearsInSociety = Math.max(0, rec.totalYearsInSociety + years);
    if (honorDeferral && formationPaused(state, id, state.year)) {
      rec.pausedYears = (rec.pausedYears || 0) + years;
      rec.deferralPause = (rec.deferralPause || 0) + years;
      continue;
    }
    if (rec.deferralPause) {
      const n = rec.deferralPause;
      recordHistory(state, id, { kind: 'formation', event: 'deferral-ended', pausedYears: n,
        text: `Deferral ends; formation resumes after ${n} ${n === 1 ? 'year' : 'years'} paused (age in religion ${rec.ageInReligion}, ${rec.totalYearsInSociety - years} years in the Society).` });
      rec.deferralPause = 0;
    }
    rec.ageInReligion = Math.max(0, rec.ageInReligion + years);
  }
}


// ---------------------------------------------------------------------------
// Mortality: every man carries a hidden death age (65-70); the ill may
// recover or worsen each year. Invisible to the General.
// ---------------------------------------------------------------------------

/** Seed a man's hidden death age and his current age. */
function initMortality(state, petitionerId) {
  const rec = (state.petitioners || {})[petitionerId];
  if (!rec || typeof rec.deathAge === 'number') return;
  const g = getGameData();
  const pet = g ? (g.petitioners || []).find((p) => p.id === petitionerId) : null;
  const age = typeof rec.age === 'number' ? rec.age
    : (pet && typeof pet.age === 'number') ? pet.age : 30;
  rec.age = age;
  const roll = 65 + streamFor(state, 'deathAge', petitionerId).int(0, 5);
  rec.deathAge = Math.max(age + 1, roll); // never instant death at seeding
}

/** Record a non-voyage death (old age, illness). */
function dieOf(state, petitionerId, cause, text) {
  const rec = (state.petitioners || {})[petitionerId];
  if (!rec || rec.status === STATUS.DECEASED) return;
  const g = getGameData();
  const pet = g ? (g.petitioners || []).find((p) => p.id === petitionerId) : null;
  const name = rec.name || (pet && pet.name) || petitionerId;
  rec.status = STATUS.DECEASED;
  purgeVowsState(state, petitionerId);
  if (Array.isArray(state.europeanLabor)) {
    state.europeanLabor = state.europeanLabor.filter((e) => e.petitionerId !== petitionerId);
  }
  state.stats.deaths = (state.stats.deaths || 0) + 1;
  state.society = Math.max(0, (state.society || 0) - 1);
  // Release his stationed strength if he died in the field — his name
  // leaves the roster too, not just the headcount.
  let stationReleased = false;
  for (const v of state.voyages || []) {
    if (v.petitionerId === petitionerId && v.outcome === 'thriving' && !v.veteranReturned && v.staffGrade) {
      releaseVoyageStation(state, v);
      v.veteranReturned = true;
      stationReleased = true;
    }
  }
  if (!stationReleased) {
    // No voyage carried him (he was dispatched): still strike his name
    // from whichever mission roster holds it.
    for (const destId of Object.keys(state.missions || {})) {
      const mst = state.missions[destId];
      if (mst && Array.isArray(mst.staffIds) && mst.staffIds.includes(petitionerId)) {
        removeStationedMan(state, mst, petitionerId);
      }
    }
  }
  // Witnesses: men stationed at the same mission are shaped by the death.
  // Find the destination from voyages.
  let deathDest = null;
  for (const v of state.voyages || []) {
    if (v.petitionerId === petitionerId && v.destination) { deathDest = v.destination; break; }
  }
  if (deathDest) {
    const witnesses = missionCommunity(state, deathDest).filter(
      (id) => id !== petitionerId && !isProvincial(state, id));
    for (const wid of witnesses) {
      const d = ensureDisposition(state, wid);
      const stab = d.current.stability || 3;
      const hum = d.current.humility || 3;
      if (stab >= 4 && d.current.patience < 5) {
        d.current.patience += 1;
        recordHistory(state, wid, { kind: 'formation', event: 'witness',
          text: `Witnessed ${name}'s death; his patience is deepened by grief.` });
      } else if (stab <= 2 && d.current.zeal > 1) {
        // Humility shields zeal: the humble are not shaken.
        if (hum >= 4) {
          recordHistory(state, wid, { kind: 'formation', event: 'witness',
            text: `Witnessed ${name}'s death; his humility steadies him.` });
        } else {
          d.current.zeal -= 1;
          recordHistory(state, wid, { kind: 'formation', event: 'witness',
            text: `Witnessed ${name}'s death; his zeal is shaken.` });
        }
      }
    }
  }
  addLedger(state, { year: state.year, type: 'death', decision: cause, petitionerId,
    text: `${name}: ${text}` });
  recordHistory(state, petitionerId, { kind: 'formation', event: 'death', text });
  // a provincial who dies leaves his region vacant
  for (const [rid, prov] of Object.entries(state.provincials || {})) {
    if (prov && !prov.vacant && prov.petitionerId === petitionerId) {
      const region = (PROVINCIAL_REGIONS.find((r) => r.id === rid) || {}).name || rid;
      state.provincials[rid] = { vacant: true, name: 'Vacant', appointedYear: state.year, hq: prov.hq };
      addLedger(state, { year: state.year, type: 'provincial', decision: 'died',
        text: `The provincial of ${region} has died; name a successor.` });
    }
  }
}

/**
 * Yearly mortality step: men age; the ill recover (1-3), linger (4-5), or
 * die (6) on 1d6; those who reach their hidden death age die of old age.
 */
function advanceMortality(state, years = 1) {
  for (let n = 0; n < years; n++) {
    for (const id of Object.keys(state.petitioners || {})) {
      const rec = state.petitioners[id];
      if (!rec || rec.status === STATUS.DISMISSED || rec.status === STATUS.DECEASED) continue;
      initMortality(state, id);
      rec.age += 1;
      const labor = (state.europeanLabor || []).find((e) => e.petitionerId === id);
      if (labor && labor.ill) {
        const r = streamFor(state, 'illness', id, String(state.year)).int(1, 6);
        if (r <= 3) {
          labor.ill = false;
          // Suffering purifies the humble, embitters the proud.
          const d = ensureDisposition(state, id);
          const hum = d.current.humility || 3;
          let traitNote = '';
          if (hum >= 4 && d.current.zeal < 5) {
            d.current.zeal += 1;
            traitNote = ' His zeal is deepened by suffering.';
          } else if (hum <= 2 && d.current.zeal > 1) {
            d.current.zeal -= 1;
            traitNote = ' The trial has diminished his zeal.';
          }
          recordHistory(state, id, { kind: 'formation', event: 'recovered',
            text: 'Recovers from his illness and may labor again.' + traitNote });
        } else if (r === 6) {
          dieOf(state, id, 'illness', 'Succumbs to his illness in Europe.');
          continue;
        }
      }
      if (rec.age >= rec.deathAge) {
        dieOf(state, id, 'old age', `Dies of old age at ${rec.age}.`);
      }
    }
  }
}

/**
 * Ordain an eligible scholastic as a priest. The General's decision, not automatic.
 * Sets an override so staffGradeFor returns 'fathers'. Cannot be undone.
 */
export function ordainPriest(state, petitionerId) {
  if (!ordinationEligible(state, petitionerId)) {
    throw new Error('Ordination requires an eligible scholastic (12+ years in the Society).');
  }
  spendEnergy(state, 1, 'ordaining a priest');
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
  // A grade persisted on the record (e.g. novitiate men) wins over in-memory tables.
  if (rec0 && rec0.savedGrade && typeof rec0.savedGrade.grade === 'string') {
    return { grade: rec0.savedGrade.grade, ordained: rec0.savedGrade.ordained ?? null };
  }
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
  // Year's virtue (Mass of the Holy Spirit): +1 if man has 4+ in the year's virtue
  try {
    const yv = yearVirtue(state.seed, state.year);
    if (yv && yv.virtue && cur[yv.virtue] >= 4) {
      const vname = yv.virtue.charAt(0).toUpperCase() + yv.virtue.slice(1);
      mods.push({ label: `Spirit's guidance (${vname})`, value: 1 });
    }
  } catch (e) { /* virtue unavailable */ }
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
    throw new Error(`${entry.name} is already in formation until
  spendEnergy(state, 1, 'assigning formation'); ${entry.formation.until}.`);
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
  spendFunds(state, cost, 'formation');
  entry.formation = { focus: focusId, until: state.year + 1 };
  ensureDisposition(state, petitionerId);
  addLedger(state, {
    year: state.year, type: 'formation',
    petitionerId, decision: 'assigned', status: 'in-formation',
    note: `${entry.name} begins a year of ${focus.name.toLowerCase()}.`,
  });
  return entry.formation;
}

/**
 * Assign a man laboring in Europe to a domestic apostolate.
 * The man must be in europeanLabor, unassigned, and meet the role's requirements.
 * Assigned men do not petition in ternas (opportunity cost).
 * Returns the assignment record.
 */
export function assignDomestic(state, petitionerId, roleId) {
  const role = rules.DOMESTIC_ROLES[roleId];
  if (!role) throw new Error(`assignDomestic: unknown role "${roleId}".`);
  const entry = (state.europeanLabor || []).find((e) => e.petitionerId === petitionerId);
  if (!entry) throw new Error('Domestic assignment is for men laboring in Europe.');
  if (entry.ill) throw new Error(`${entry.name} is recovering from illness and cannot take an assignment.`);
  if (entry.assignment) throw new Error(`${entry.name} already holds a domestic assignment (${entry.assignment}). Release him first.`);
  if (entry.formation && entry.formation.until >= state.year) {
    throw new Error(`${entry.name} is in formation until ${entry.formation.until}; interrupt formation or wait.`);
  }
  // Qualification checks
  const grade = staffGradeFor(state, petitionerId); // 'fathers'|'coadjutors'|'brothers'
  const disp = ensureDisposition(state, petitionerId);
  if (roleId === 'teaching') {
    if (grade === 'brothers') throw new Error('Teaching requires a scholastic or priest, not a brother.');
  } else if (roleId === 'pastoral') {
    if (grade !== 'fathers') throw new Error('Pastoral ministry requires an ordained priest.');
  } else if (roleId === 'formationAid') {
    if (grade !== 'fathers') throw new Error('Formation service requires an ordained priest.');
    if ((disp.current?.prudence ?? 3) < 4) throw new Error('Formation service requires proven prudence (4+).');
  } else if (roleId === 'studies') {
    if (grade !== 'coadjutors') throw new Error('Continued studies are for scholastics.');
  }
  entry.assignment = roleId;
  entry.assignedYear = state.year;
  addLedger(state, {
    year: state.year, type: 'domestic', petitionerId, decision: 'assigned',
    note: `${entry.name} assigned to ${role.name.toLowerCase()}.`,
  });
  return { role: roleId, sinceYear: state.year };
}

/**
 * Release a man from his domestic assignment. He becomes available again
 * (may petition in future ternas, subject to existing eligibility).
 */
export function unassignDomestic(state, petitionerId) {
  const entry = (state.europeanLabor || []).find((e) => e.petitionerId === petitionerId);
  if (!entry) throw new Error('No such man laboring in Europe.');
  if (!entry.assignment) throw new Error(`${entry.name} holds no domestic assignment.`);
  const role = rules.DOMESTIC_ROLES[entry.assignment];
  entry.assignment = null;
  delete entry.assignedYear;
  addLedger(state, {
    year: state.year, type: 'domestic', petitionerId, decision: 'released',
    note: `${entry.name} released from ${role ? role.name.toLowerCase() : 'domestic service'}.`,
  });
  return true;
}

/**
 * Reserve a man laboring in Europe for a foreign mission.
 * He stays in European labor (visible in Logistics) until assigned to a ship.
 */
export function reserveForMission(state, petitionerId, destId) {
  const entry = (state.europeanLabor || []).find((e) => e.petitionerId === petitionerId);
  if (!entry) throw new Error('No such man laboring in Europe.');
  if (entry.assignment) throw new Error(`${entry.name} holds a domestic assignment; release him first.`);
  if (entry.formation && entry.formation.until >= state.year) {
    throw new Error(`${entry.name} is in formation until ${entry.formation.until}.`);
  }
  const g = ensureData();
  const destName = g.destinations.find((d) => d.id === destId)?.name || destId;
  entry.reservedFor = destId;
  entry.reservedForName = destName;
  addLedger(state, {
    year: state.year, type: 'decision', petitionerId, destination: destId,
    decision: 'reserved',
    note: `${entry.name} reserved for ${destName} — laboring in Europe until a ship is ready.`,
  });
  return true;
}

/**
 * Clear a man's mission reservation (he returns to the unassigned pool).
 */
export function unreserve(state, petitionerId) {
  const entry = (state.europeanLabor || []).find((e) => e.petitionerId === petitionerId);
  if (!entry) throw new Error('No such man laboring in Europe.');
  delete entry.reservedFor;
  delete entry.reservedForName;
  addLedger(state, {
    year: state.year, type: 'decision', petitionerId,
    decision: 'unreserved',
    note: `${entry.name} released from mission reserve.`,
  });
  return true;
}

/**
 * Put a man in the departure queue. One man, one queue entry: any existing
 * 'awaiting' entry for him is replaced (the newest order governs where he
 * sails). Callers that should fail loudly on a duplicate instead (a direct
 * "call to dock" click) check before calling.
 */
export function enqueueAwaiting(state, entry) {
  if (!Array.isArray(state.queue)) state.queue = [];
  state.queue = state.queue.filter(
    (q) => !(q.petitionerId === entry.petitionerId && q.status === 'awaiting'),
  );
  state.queue.push(entry);
  return entry;
}

/**
 * Call a reserved man to the dock (Tran 2026-10-19): he leaves European
 * labor and joins the departure queue for his reserved mission — HELD at
 * dock, so he waits (and earns dock income) until the General releases
 * him onto a ship. Reserves belong at the dock alongside the queue.
 */
export function callReserveToDock(state, petitionerId) {
  const idx = (state.europeanLabor || []).findIndex((e) => e.petitionerId === petitionerId);
  if (idx < 0) throw new Error('No such man laboring in Europe.');
  const entry = state.europeanLabor[idx];
  if (!entry.reservedFor) throw new Error(`${entry.name} is not reserved for a mission.`);
  if ((state.queue || []).some((q) => q.petitionerId === petitionerId && q.status === 'awaiting')) {
    throw new Error(`${entry.name} is already at the dock.`);
  }
  state.europeanLabor.splice(idx, 1);
  if (!Array.isArray(state.queue)) state.queue = [];
  state.queue.push({
    petitionerId,
    petitionerName: entry.name,
    approvedYear: state.year,
    destination: entry.reservedFor,
    status: 'awaiting',
    held: true,
    note: 'held at dock',
    teamId: null,
    teamSize: 1,
    companions: 0,
    companionGrades: {},
  });
  addLedger(state, {
    year: state.year, type: 'decision', petitionerId, destination: entry.reservedFor,
    decision: 'called-to-dock',
    note: `${entry.name} called to the dock for ${entry.reservedForName || entry.reservedFor} — held until released.`,
  });
  return true;
}


// ---------------------------------------------------------------------------
// Collective deployment (Stage 1)
//
// Moves a group of eligible European Jesuits to a mission without an
// individual terna decision for every man. The order commits named men from
// europeanLabor into the departure queue; they sail via the existing
// departure loop (berths → men to spare → funds → hulls), costing
// DEPARTURE_COST per man at departure, and their voyages resolve through
// the existing seeded mechanics. Deployment purpose is informational only.
// ---------------------------------------------------------------------------

/**
 * Deployment purposes are recorded intent only (Stage 1). They have no
 * mechanical effect on costs, voyages, staffing, scoring, or outcomes.
 */
export const DEPLOYMENT_PURPOSES = Object.freeze({
  reinforce: 'Reinforce an established mission',
  found: 'Establish a new work',
  replace: 'Replace losses / strengthen a fragile community',
  college: 'Support an expanding college or institution',
});

/** Minimum men for a collective deployment (a single man uses terna/dispatch). */
export const DEPLOYMENT_MIN_SIZE = 2;

/**
 * Whether a europeanLabor entry may be selected for a collective deployment.
 * Same guards as direct dispatch from Europe: the man must be present in
 * Europe, healthy, out of formation, and free of domestic assignment.
 */
export function deploymentEligible(state, entry) {
  if (!entry) return false;
  if (entry.ill) return false;
  if (entry.formation && entry.formation.until >= state.year) return false;
  if (entry.assignment) return false;
  return true;
}

/** Men currently selectable for a deployment, with grades attached. */
export function deploymentCandidates(state) {
  return (state.europeanLabor || [])
    .filter((e) => deploymentEligible(state, e))
    .map((e) => ({ ...e, staffGrade: staffGradeFor(state, e.petitionerId) }));
}

function sortCandidates(a, b) {
  return (a.year - b.year) || (a.petitionerId < b.petitionerId ? -1 : a.petitionerId > b.petitionerId ? 1 : 0);
}

/**
 * Deterministically select deployment members from the eligible pool.
 * Sort: longest in Europe (earliest labor year), then petitionerId. No RNG:
 * same state + request selects the same contingent.
 * Mode: { count } for a headcount, or { grades: { fathers, coadjutors, brothers } }
 * for grade composition (keys from rules.MISSION_GRADE_IDS).
 * Throws when fewer than requested are eligible — never silently shrinks.
 */
export function selectDeploymentMembers(state, sel = {}) {
  const cands = deploymentCandidates(state);
  let picked = [];
  if (sel.grades) {
    for (const gid of rules.MISSION_GRADE_IDS) {
      const want = sel.grades[gid] ?? 0;
      if (!Number.isInteger(want) || want < 0) {
        throw new Error(`selectDeploymentMembers: grade "${gid}" count must be a whole number ≥ 0`);
      }
      const have = cands.filter((c) => c.staffGrade === gid).sort(sortCandidates);
      if (have.length < want) {
        throw new Error(`selectDeploymentMembers: only ${have.length} eligible ${gid}, ${want} requested`);
      }
      picked = picked.concat(have.slice(0, want));
    }
  } else {
    const count = sel.count ?? 0;
    if (!Number.isInteger(count) || count < 0) {
      throw new Error('selectDeploymentMembers: count must be a whole number ≥ 0');
    }
    const sorted = [...cands].sort(sortCandidates);
    if (sorted.length < count) {
      throw new Error(`selectDeploymentMembers: only ${sorted.length} eligible men, ${count} requested`);
    }
    picked = sorted.slice(0, count);
  }
  return picked.map((c) => c.petitionerId);
}

/**
 * Move specific European-labor entries into the departure queue for a
 * destination. The men sail on the fleet like any approved men — there
 * is no other way overseas (Tran 2026-10-20: dispatched men don't exist;
 * every man travels by ship, with his profile). Returns the men's ids.
 */
export function queueLaborMen(state, entries, destId, note) {
  const sent = [];
  for (const entry of entries) {
    state.europeanLabor = (state.europeanLabor || []).filter((e) => e !== entry);
    enqueueAwaiting(state, {
      petitionerId: entry.petitionerId, petitionerName: entry.name,
      destination: destId, status: 'awaiting', approvedYear: state.year,
      companions: 0, note: note || null,
    });
    const rec = ensureRecord(state, entry.petitionerId, false);
    if (rec) rec.history.push({ year: state.year, decision: 'queued', destination: destId });
    sent.push(entry.petitionerId);
  }
  return sent;
}

/**
 * Fill grade counts with named men from Europe and queue them for a
 * destination. Deterministic pick: deployment-eligible men, longest in
 * Europe first, then by id (the deployment convention). Throws BEFORE
 * mutating when the men do not exist — counts are never fulfilled by
 * abstract men. Returns { men: [ids], total }.
 */
export function queueNamedMen(state, destId, counts = {}, note) {
  const picked = [];
  for (const gid of rules.MISSION_GRADE_IDS) {
    const want = counts[gid] ?? 0;
    if (!Number.isInteger(want) || want < 0) {
      throw new Error(`queueNamedMen: "${gid}" must be a whole number ≥ 0`);
    }
    if (!want) continue;
    const have = deploymentCandidates(state)
      .filter((c) => c.staffGrade === gid)
      .sort(sortCandidates);
    if (have.length < want) {
      throw new Error(`only ${have.length} ${gid} free in Europe, ${want} requested — the men must be named men in Europe (deny letters, recall assignments, or wait).`);
    }
    picked.push(...have.slice(0, want));
  }
  if (!picked.length) {
    throw new Error('queueNamedMen: no men requested — a sending must name at least one man.');
  }
  const entries = picked.map((c) => (state.europeanLabor || [])
    .find((e) => e.petitionerId === c.petitionerId));
  const men = queueLaborMen(state, entries, destId, note);
  return { men, total: men.length };
}

/** Order a collective deployment of named eligible men to a destination. */
export function orderDeployment(state, { destId, purpose, memberIds }) {
  const g = ensureData();
  const dest = g.destinations.find((d) => d.id === destId);
  if (!dest) throw new Error(`orderDeployment: unknown destination "${destId}"`);
  const dst = state.destState[destId];
  if (dst && dst.access === 'closed') {
    throw new Error(`orderDeployment: ${dest.name || destId} is closed to new men`);
  }
  if (!DEPLOYMENT_PURPOSES[purpose]) {
    throw new Error(`orderDeployment: unknown purpose "${purpose}"`);
  }
  if (!Array.isArray(memberIds) || memberIds.length < DEPLOYMENT_MIN_SIZE) {
    throw new Error(`orderDeployment: a deployment needs at least ${DEPLOYMENT_MIN_SIZE} men`);
  }
  const seen = new Set();
  for (const id of memberIds) {
    if (seen.has(id)) throw new Error(`orderDeployment: "${id}" is listed twice`);
    seen.add(id);
  }
  // Re-validate eligibility at order time: the UI's candidate list may be stale.
  const entries = new Map((state.europeanLabor || []).map((e) => [e.petitionerId, e]));
  for (const id of memberIds) {
    const e = entries.get(id);
    if (!e) throw new Error(`orderDeployment: "${id}" is not laboring in Europe`);
    if (!deploymentEligible(state, e)) {
      throw new Error(`orderDeployment: "${e.name || id}" is not eligible (ill, in formation, or assigned)`);
    }
    if ((state.queue || []).some((q) => q.petitionerId === id && q.status === 'awaiting')) {
      throw new Error(`orderDeployment: "${e.name || id}" is already awaiting departure`);
    }
  }
  // Fail early on funds: the loop would otherwise strand the men in the queue.
  const estCost = memberIds.length * rules.RESOURCES.DEPARTURE_COST;
  if ((state.resources.funds || 0) < estCost) {
    throw new Error(`orderDeployment: ${estCost} scudi needed to embark ${memberIds.length} men; the chest holds ${state.resources.funds || 0}`);
  }
  if (!Array.isArray(state.deployments)) state.deployments = [];
  if (!state.seq || typeof state.seq.deployment !== 'number') {
    state.seq = state.seq || {};
    state.seq.deployment = state.seq.deployment || 0;
  }
  const depId = `dep-${state.year}-${++state.seq.deployment}`;
  const teamId = `deploy-team-${depId}`;
  const destName = dest.name || destId;
  for (const id of memberIds) {
    const e = entries.get(id);
    state.europeanLabor = state.europeanLabor.filter((x) => x.petitionerId !== id);
    const rec = ensureRecord(state, id, false);
    rec.status = STATUS.APPROVED;
    rec.history.push({ year: state.year, decision: 'deployment', destination: destId, deploymentId: depId });
    state.queue.push({
      petitionerId: id,
      petitionerName: e.name || id, // europeanLabor name; voyage records prefer this over cardName
      approvedYear: state.year,
      destination: destId,
      status: 'awaiting',
      teamId,
      teamSize: memberIds.length,
      companions: 0,
      deploymentId: depId,
    });
  }
  const dep = {
    id: depId, year: state.year, destId, destName,
    purpose, memberIds: [...memberIds], voyageIds: [],
    // Names are snapshotted here: members leave europeanLabor at order time,
    // and their voyage record (with the name) only exists once they sail.
    memberNames: Object.fromEntries(memberIds.map((id) => [id, entries.get(id).name || id])),
  };
  state.deployments.push(dep);
  addLedger(state, {
    year: state.year, type: 'deployment', destination: destId,
    text: `Collective deployment ordered: ${memberIds.map((id) => (entries.get(id).name || id)).join(', ')} for ${destName} — ${DEPLOYMENT_PURPOSES[purpose].toLowerCase()} (${memberIds.length} men, ${estCost} scudi to embark).`,
  });
  return dep;
}

/**
 * Record a deployment voyage on its registry entry when the departure loop
 * creates it. Called by the departure loop only.
 */
function recordDeploymentVoyage(state, voyage) {
  if (!voyage || !voyage.deploymentId) return;
  const dep = (state.deployments || []).find((d) => d.id === voyage.deploymentId);
  if (dep && !dep.voyageIds.includes(voyage.id)) dep.voyageIds.push(voyage.id);
}

/**
 * Derive a deployment's status from its members' voyage states.
 * 'ordered' = no member has sailed yet; 'in-transit' = at least one sailed
 * and at least one voyage unresolved; 'arrived' = every member's voyage
 * resolved (any outcome). Descriptive only — it never drives resolution.
 */
export function deploymentStatus(state, depId) {
  const dep = (state.deployments || []).find((d) => d.id === depId);
  if (!dep) return null;
  const byMember = new Map();
  for (const v of (state.voyages || [])) {
    if (v.deploymentId === depId) byMember.set(v.petitionerId, v);
  }
  let awaiting = 0, transit = 0, resolved = 0;
  for (const id of dep.memberIds) {
    const v = byMember.get(id);
    if (v && v.outcome) resolved++;
    else if (v) transit++;
    else awaiting++;
  }
  const status = awaiting === dep.memberIds.length ? 'ordered'
    : resolved === dep.memberIds.length ? 'arrived' : 'in-transit';
  return { status, awaiting, transit, resolved, total: dep.memberIds.length };
}

/**
 * Constraint analysis for a prospective deployment of `count` men.
 * Reports each of the four departure constraints separately and names the
 * binding one in planning order: funds (which gates the order itself),
 * then men to spare, berths, hulls. Pure: no mutation.
 * Model B: berths = static port capacity (ships outfitting simultaneously).
 */
export function deploymentConstraints(state, count) {
  const berths = state.resources.berths || 0;
  const freeHulls = (state.resources.ships || []).filter((s) => (s.freeYear || 0) <= state.year);
  const cost = count * rules.RESOURCES.DEPARTURE_COST;
  const avail = state.available || 0;
  const funds = state.resources.funds || 0;
  const CAP = rules.RESOURCES.SHIP_CAPACITY;
  const shipsNeeded = Math.ceil(count / CAP);
  let bottleneck = null;
  if (funds < cost) bottleneck = 'funds';
  else if (avail < count) bottleneck = 'men';
  else if (freeHulls.length < shipsNeeded) bottleneck = 'hulls';
  else if (berths < shipsNeeded) bottleneck = 'berths';
  return {
    count, cost,
    berthsNeeded: shipsNeeded, berths, shipsNeeded,
    hullMen: count, hullCapacity: rules.RESOURCES.SHIP_CAPACITY, hullsFree: freeHulls.length,
    menNeeded: count, menAvailable: avail,
    fundsNeeded: cost, funds,
    bottleneck, // null when the whole contingent can sail this year
  };
}

/**
 * Per-member roster for a deployment: each member's name, grade, and current
 * state — 'awaiting' (in the departure queue), 'in-transit' (voyage en route),
 * or the resolved voyage outcome ('thriving', 'returned', 'ill', 'deceased').
 * Used by the UI status list and tests.
 */
export function deploymentRoster(state, depId) {
  const dep = (state.deployments || []).find((d) => d.id === depId);
  if (!dep) return null;
  const byMember = new Map();
  for (const v of (state.voyages || [])) {
    if (v.deploymentId === depId) byMember.set(v.petitionerId, v);
  }
  const names = new Map((state.europeanLabor || []).map((e) => [e.petitionerId, e.name]));
  return dep.memberIds.map((id) => {
    const v = byMember.get(id);
    return {
      petitionerId: id,
      name: (v && (v.petitionerName || v.name)) || names.get(id) || (dep.memberNames && dep.memberNames[id]) || id,
      grade: staffGradeFor(state, id),
      state: v && v.outcome ? v.outcome : v ? 'in-transit' : 'awaiting',
      voyageId: v ? v.id : null,
      arriveYear: v ? v.arriveYear : null,
    };
  });
}

/**
 * Instruction types the General may issue to a mission superior.
 * Instructions travel by the same delays as voyages; they do not take effect before arrival.
 */
const INSTRUCTION_TYPES = Object.freeze({
  expand: Object.freeze({ id: 'expand', name: 'Expand the mission', desc: 'Seek growth: new stations, more baptisms.' }),
  consolidate: Object.freeze({ id: 'consolidate', name: 'Consolidate', desc: 'Be cautious: strengthen what exists.' }),
  report: Object.freeze({ id: 'report', name: 'Send full account', desc: 'Request a detailed report of the mission\'s state.' }),
  encourage: Object.freeze({ id: 'encourage', name: 'Encourage the brethren', desc: 'Praise their labors; strengthen resolve.' }),
  admonish: Object.freeze({ id: 'admonish', name: 'Admonish', desc: 'Correct faults; demand amendment.' }),
});

/**
 * Issue an instruction to a mission superior. The instruction travels by sea;
 * it arrives after the destination's travel time and is then resolved by seeded
 * mechanics using the mission's leadership (fathers present).
 * Returns the instruction record.
 */
export function issueInstruction(state, destId, typeId) {
  const type = INSTRUCTION_TYPES[typeId];
  if (!type) throw new Error(`issueInstruction: unknown instruction "${typeId}".`);
  const g = ensureData();
  const dest = g.destinations.find((d) => d.id === destId);
  if (!dest) throw new Error(`issueInstruction: unknown destination "${destId}"`);
  const dst = state.destState[destId];
  if (dst && dst.access === 'closed') throw new Error
  spendEnergy(state, 1, 'issuing an instruction');(`issueInstruction: ${dest.name || destId} is closed`);
  if (!state.instructions) state.instructions = {};
  if (state.instructions[destId] && state.instructions[destId].status === 'in-transit') {
    throw new Error(`An instruction to ${dest.name || destId} is already in transit.`);
  }
  const travelYears = Math.max(1, Math.min(3, Math.round(dest.travelYears || 2)));
  const rec = {
    type: typeId, issuedYear: state.year,
    arriveYear: state.year + travelYears,
    status: 'in-transit', outcome: null,
  };
  state.instructions[destId] = rec;
  addLedger(state, {
    year: state.year, type: 'instruction', decision: 'issued',
    text: `Instruction to ${dest.name || destId}: ${type.name.toLowerCase()} (arrives ${rec.arriveYear}).`,
  });
  return rec;
}

// ---------------------------------------------------------------------------
// Provincial draft (pre-game): one terna per region; the General names a
// provincial for each. Organizational for now — no mechanical weight yet.
// ---------------------------------------------------------------------------
export const PROVINCIAL_REGIONS = Object.freeze([
  { id: 'east', name: 'The East' },
  { id: 'newworld', name: 'the New World' },
  { id: 'africa', name: 'Africa' },
  { id: 'europe', name: 'Europe' },
]);

const DRAFT_FIRST = ['Alessandro', 'Baldassare', 'Camillo', 'Domenico', 'Eustachio', 'Fabio',
  'Gaspare', 'Ippolito', 'Lodovico', 'Marcello', 'Niccolo', 'Ottavio', 'Pompeo', 'Scipione',
  'Teodoro', 'Urbano', 'Vincenzo', 'Girolamo', 'Bernardino', 'Costantino', 'Flaminio', 'Ruggiero'];
const DRAFT_LAST = ['Orsini', 'Colonna', 'Aldobrandini', 'Borghese', 'Caetani', 'Farnese',
  'Gonzaga', 'Este', 'Medici', 'Pallavicini', 'Spinola', 'Doria', 'Barberini', 'Chigi',
  'Altieri', 'Rospigliosi', 'Pamphilj', 'Ludovisi', 'Montalto', 'Gesualdo', 'Carafa', 'Pignatelli'];

function makeProvincialDraft(state) {
  const rng = streamFor(state, 'provincial-draft');
  const used = new Set();
  const pickName = () => {
    let n;
    do { n = `${rng.pick(DRAFT_FIRST)} ${rng.pick(DRAFT_LAST)}`; } while (used.has(n));
    used.add(n);
    return n;
  };
  const regions = PROVINCIAL_REGIONS.map((r) => ({
    id: r.id,
    name: r.name,
    candidates: [0, 1, 2].map((i) => {
      const traits = {};
      for (const t of dispositions.TRAITS) traits[t.id] = rng.int(1, 5);
      // give each candidate a distinct standout so the choice is legible
      const standout = dispositions.TRAITS[(i * 3) % dispositions.TRAITS.length].id;
      traits[standout] = Math.max(traits[standout], 4);
      const label = dispositions.TRAITS.find((t) => t.id === standout);
      return {
        id: `prov-${r.id}-${i}`,
        name: pickName(),
        age: rng.int(38, 62),
        yearsInSociety: rng.int(15, 35),
        traits,
        note: `Noted for ${label.name.toLowerCase()} — ${label.blurb}`,
      };
    }),
  }));
  return { regions, picks: {} };
}

/** Name one candidate provincial of a region. Completes the draft at 4/4. */
export function chooseProvincial(state, regionId, candidateId) {
  const draft = state.draft;
  if (!draft || draft.done) throw new Error('chooseProvincial: no active draft.');
  const region = draft.regions.find((r) => r.id === regionId);
  if (!region) throw new Error(`chooseProvincial: unknown region "${regionId}".`);
  const cand = region.candidates.find((c) => c.id === candidateId);
  if (!cand) throw new Error(`chooseProvincial: "${candidateId}" is not a candidate for ${region.name}.`);
  for (const [rid, cid] of Object.entries(draft.picks)) {
    if (cid === candidateId && rid !== regionId) throw new Error('chooseProvincial: this man already governs another region.');
  }
  draft.picks[regionId] = candidateId;
  if (PROVINCIAL_REGIONS.every((r) => draft.picks[r.id]) && PROVINCIAL_REGIONS.every((r) => (state.provinceHQs || {})[r.id])) {
    state.provincials = {};
    for (const r of draft.regions) {
      state.provincials[r.id] = { ...r.candidates.find((x) => x.id === draft.picks[r.id]),
        appointedYear: state.year, hq: state.provinceHQs[r.id] };
    }
    draft.done = true;
    addLedger(state, {
      year: state.year, type: 'provincial', decision: 'appointed',
      text: `Provincials take office: ${PROVINCIAL_REGIONS.map((r) => `${state.provincials[r.id].name} for ${r.name}`).join('; ')}.`,
    });
  }
  return draft;
}

export const PROVINCIAL_TERM_YEARS = 6;

/** Years the current provincial of a region has been in office. */
export function provincialTermYears(state, regionId) {
  const p = (state.provincials || {})[regionId];
  if (!p || typeof p.appointedYear !== 'number') return 0;
  return Math.max(0, state.year - p.appointedYear);
}

/** Whether a provincial's term is complete (eligible for replacement). */
export function provincialTermComplete(state, regionId) {
  return provincialTermYears(state, regionId) >= PROVINCIAL_TERM_YEARS;
}

/** A professed priest: ordained and professed, alive, not dismissed. */
export function isProfessedPriest(state, petitionerId) {
  const rec = (state.petitioners || {})[petitionerId];
  if (!rec || rec.status === STATUS.DISMISSED || rec.status === STATUS.DECEASED || rec.status === 'apostate') return false;
  // The formation system (vows stage) is the rank of record: men who reached
  // the professed stage in play ARE professed priests, even where gradeFor's
  // static table predates their profession. (Tran 2026-10-19: professed men
  // were missing from the provincial succession roster.)
  if (rec.vows && rec.vows.stage === 'professed') return true;
  if (staffGradeFor(state, petitionerId) !== 'fathers') return false;
  const gr = gradeFor(state, petitionerId);
  const grade = gr && gr.grade;
  return grade === 'professed-of-the-4th-vow' || grade === 'professed';
}

/** All professed priests in the Society, for the replacement roster. */
export function professedPriests(state) {
  const g = getGameData();
  return Object.keys(state.petitioners || {})
    .filter((id) => isProfessedPriest(state, id))
    .map((id) => {
      const rec = state.petitioners[id];
      const pet = g ? (g.petitioners || []).find((p) => p.id === id) : null;
      return { petitionerId: id, name: rec.name || (pet && pet.name) || id,
        years: yearsInSociety(state, id), location: currentLocation(state, g, id) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Nearest provinces, in order, for the short-bench rule.
const PROVINCE_PROXIMITY = {
  east: ['europe', 'africa', 'newworld'],
  newworld: ['europe', 'africa', 'east'],
  africa: ['europe', 'east', 'newworld'],
  europe: ['africa', 'east', 'newworld'],
};

// Game-data destination region -> province.
const DEST_REGION_TO_PROVINCE = {
  'Asia': 'east', 'Americas': 'newworld', 'South America': 'newworld',
  'Africa': 'africa', 'Europe': 'europe',
};

/** Which province a man belongs to, by his current location. */
export function provinceOfMan(state, petitionerId) {
  const g = getGameData();
  const loc = currentLocation(state, g, petitionerId);
  if (!loc || loc === 'Europe') return 'europe';
  const dest = g ? (g.destinations || []).find((d) => d.id === loc || d.name === loc) : null;
  const dr = dest && dest.region;
  return DEST_REGION_TO_PROVINCE[dr] || 'europe';
}

/**
 * Men currently stationed at a mission (arrived, not returned, living).
 * @returns {string[]} petitionerIds
 */
export function missionCommunity(state, destId) {
  const g = getGameData();
  const out = [];
  for (const id of Object.keys(state.petitioners || {})) {
    const rec = state.petitioners[id];
    if (!rec || rec.status === STATUS.DECEASED || rec.status === STATUS.DISMISSED) continue;
    const vs = (state.voyages || []).filter((v) => v.petitionerId === id);
    const last = vs[vs.length - 1];
    if (last && last.stage === 'arrived' && !last.veteranReturned && last.destination === destId) {
      out.push(id);
    }
  }
  return out;
}

/**
 * The collective character of a mission community: average current dispositions
 * across stationed men, top 3 traits by average. Empty array if no community.
 * @returns {{trait: string, name: string, avg: number}[]}
 */
export function communityTraits(state, destId) {
  const men = missionCommunity(state, destId);
  if (!men.length) return [];
  const sums = {};
  for (const t of dispositions.TRAITS) sums[t.id] = 0;
  for (const id of men) {
    const d = ensureDisposition(state, id);
    for (const t of dispositions.TRAITS) sums[t.id] += d.current[t.id] || 3;
  }
  return dispositions.TRAITS.map((t) => ({
      trait: t.id, name: t.name, avg: sums[t.id] / men.length,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);
}

/** Open destinations in a province's region — the real HQ options for that province.
 * Excludes catch-alls like "asia" (a valid mission field, not a place to reside). */
const NOT_HQ = new Set(['asia']);
export function hqOptionsForRegion(state, regionId) {
  const g = getGameData();
  return openDestinations(state).filter((d) => {
    if (NOT_HQ.has(d.id)) return false;
    const dest = g ? (g.destinations || []).find((x) => x.id === d.id) : null;
    const dr = dest && dest.region;
    return (DEST_REGION_TO_PROVINCE[dr] || 'europe') === regionId;
  });
}

/** Open destinations (for HQ and posting pickers). */
export function openDestinations(state) {
  const g = getGameData();
  return (g.destinations || [])
    .filter((d) => { const st = (state.destState || {})[d.id]; return !st || st.access !== 'closed'; })
    .map((d) => ({ id: d.id, name: d.name || d.id }));
}

/** Name the HQ of a province (draft phase, or later). */
export function chooseProvinceHQ(state, regionId, destId) {
  const region = PROVINCIAL_REGIONS.find((r) => r.id === regionId);
  if (!region) throw new Error(`chooseProvinceHQ: unknown region "${regionId}".`);
  if (regionId === 'europe') throw new Error('chooseProvinceHQ: the European provincial resides at Rome.');
  if (!openDestinations(state).some((d) => d.id === destId)) {
    throw new Error(`chooseProvinceHQ: "${destId}" is not an open destination.`);
  }
  if (!hqOptionsForRegion(state, regionId).some((d) => d.id === destId)) {
    throw new Error(`chooseProvinceHQ: "${destId}" is not in ${regionId}'s region.`);
  }
  if (!state.provinceHQs) state.provinceHQs = {};
  state.provinceHQs[regionId] = destId;
  const draft = state.draft;
  if (draft && !draft.done && PROVINCIAL_REGIONS.every((r) => draft.picks[r.id])
      && PROVINCIAL_REGIONS.every((r) => state.provinceHQs[r.id])) {
    state.provincials = {};
    for (const r of draft.regions) {
      state.provincials[r.id] = { ...r.candidates.find((x) => x.id === draft.picks[r.id]),
        appointedYear: state.year, hq: state.provinceHQs[r.id] };
    }
    draft.done = true;
    addLedger(state, {
      year: state.year, type: 'provincial', decision: 'appointed',
      text: `Provincials take office: ${PROVINCIAL_REGIONS.map((r) => `${state.provincials[r.id].name} for ${r.name}`).join('; ')}.`,
    });
  }
  return destId;
}

/**
 * Draw the replacement terna: three eligible professed priests by seeded lot,
 * excluding the incumbent. Short bench: men of the province first, then the
 * nearest provinces in order. Stored so the UI shows a stable list.
 */
export function beginProvincialReplacement(state, regionId) {
  const prov = (state.provincials || {})[regionId];
  if (!prov) throw new Error(`beginProvincialReplacement: no provincial for "${regionId}".`);
  if (!prov.vacant) spendEnergy(state, 1, 'naming a successor'); // a vacant see is duty, not discretion
  const region = PROVINCIAL_REGIONS.find((r) => r.id === regionId);
  const incumbentId = prov.vacant ? null : (prov.petitionerId || prov.id);
  const pool = professedPriests(state).filter((p) => p.petitionerId !== incumbentId);
  const byProv = {};
  for (const p of pool) {
    const pv = provinceOfMan(state, p.petitionerId);
    (byProv[pv] = byProv[pv] || []).push(p.petitionerId);
  }
  const rng = streamFor(state, 'provincial-terna', regionId, String(state.year));
  const order = [regionId, ...(PROVINCE_PROXIMITY[regionId] || [])];
  const candidates = [];
  for (const pv of order) {
    for (const id of rng.shuffle(byProv[pv] || [])) {
      if (candidates.length >= 3) break;
      candidates.push(id);
    }
    if (candidates.length >= 3) break;
  }
  if (!state.provincialTernas) state.provincialTernas = {};
  state.provincialTernas[regionId] = { year: state.year, candidates, incumbent: incumbentId };
  return { region, incumbent: prov.vacant ? null : prov, candidates };
}

/**
 * Resolve a replacement. choiceId is a petitionerId, or 'incumbent' to keep
 * the current provincial for a fresh term. outgoingTo ('europe' or a
 * destination id) decides where a replaced real man goes next; a draft
 * placeholder simply retires. Free.
 */
export function resolveProvincialReplacement(state, regionId, choiceId, outgoingTo = 'europe') {
  const prov = (state.provincials || {})[regionId];
  if (!prov) throw new Error(`resolveProvincialReplacement: no provincial for "${regionId}".`);
  const region = PROVINCIAL_REGIONS.find((r) => r.id === regionId);
  if (choiceId === 'incumbent') {
    prov.appointedYear = state.year;
    addLedger(state, { year: state.year, type: 'provincial', decision: 'retained',
      text: `${prov.name} is confirmed as provincial of ${region.name} for another term.` });
  } else {
    if (!isProfessedPriest(state, choiceId)) {
      throw new Error(`resolveProvincialReplacement: "${choiceId}" is not an eligible professed priest.`);
    }
    const g = getGameData();
    const pet = g ? (g.petitioners || []).find((p) => p.id === choiceId) : null;
    const rec = state.petitioners[choiceId];
    const name = (rec && rec.name) || (pet && pet.name) || choiceId;
    // the outgoing provincial goes where the General sends him
    let postingText = '';
    if (prov.petitionerId && state.petitioners[prov.petitionerId]) {
      const orec = state.petitioners[prov.petitionerId];
      // Governance matures a man: +1 prudence for having borne the office.
      // He returns to the labor force more effective than he left it.
      const od = ensureDisposition(state, prov.petitionerId);
      if (od.current.prudence < 5) {
        od.current.prudence += 1;
        recordHistory(state, prov.petitionerId, { kind: 'formation', event: 'provincial',
          text: 'His years governing the province have matured his prudence.' });
      }
      if (outgoingTo === 'europe') {
        addEuropeanLabor(state, prov.petitionerId, prov.name, 'recalled');
        postingText = ` ${prov.name} returns to labor in Europe.`;
      } else {
        const dest = (g.destinations || []).find((d) => d.id === outgoingTo);
        if (!dest) throw new Error(`resolveProvincialReplacement: unknown destination "${outgoingTo}".`);
        const dst = (state.destState || {})[outgoingTo];
        if (dst && dst.access === 'closed') throw new Error(`resolveProvincialReplacement: ${dest.name} is closed.`);
        if (!Array.isArray(state.europeanLabor)) state.europeanLabor = [];
        if (!state.europeanLabor.some((e) => e.petitionerId === prov.petitionerId)) {
          addEuropeanLabor(state, prov.petitionerId, prov.name, 'recalled');
        }
        state.europeanLabor = state.europeanLabor.filter((e) => e.petitionerId !== prov.petitionerId);
        orec.status = STATUS.APPROVED;
        enqueueAwaiting(state, { petitionerId: prov.petitionerId, approvedYear: state.year,
          destination: outgoingTo, status: 'awaiting', teamId: null, teamSize: 1, companions: 0 });
        postingText = ` ${prov.name} sails for ${dest.name || outgoingTo}.`;
      }
    }
    const hq = (state.provinceHQs || {})[regionId];
    state.provincials[regionId] = { petitionerId: choiceId, name, appointedYear: state.year, hq };
    addLedger(state, { year: state.year, type: 'provincial', decision: 'replaced',
      text: `${name} succeeds ${prov.name} as provincial of ${region.name}${hq ? `, residing at ${(g.destinations || []).find((d) => d.id === hq)?.name || hq}` : ''}.${postingText}` });
  }
  if (state.provincialTernas) delete state.provincialTernas[regionId];
  return state.provincials[regionId];
}

// ---------------------------------------------------------------------------
// Governance: provincial reports & staged decisions
// ---------------------------------------------------------------------------
// Provincial reports are communications from the missions to the Generalate,
// generated from actual mission conditions (never invented). Each report
// distinguishes: the communication, the reported facts, recommendations,
// the decision required, the General's decision, its implementation, and the
// historical record. Reports persist in state.reports; staged recommendations
// persist in state.staged until applied or discarded.

/** Report kinds. */
export const REPORT_KINDS = Object.freeze({
  fragile: 'fragile',     // mission newly fragile (autonomous)
  request: 'request',     // mission understaffed, asks for men (autonomous)
  account: 'account',     // full account requested via instruction, now arrived
  voyage: 'voyage',       // notable voyage outcome: a death at sea or mission
});

/** Report lifecycle statuses. */
export const REPORT_STATUS = Object.freeze({
  PENDING: 'pending',
  ACKNOWLEDGED: 'acknowledged',
  DECLINED: 'declined',
  DEFERRED: 'deferred',
  ACTED: 'acted',
});

/** Decisions the General may record on a report. */
const REPORT_DECISIONS = ['acknowledge', 'decline', 'defer'];

function nextReportId(state) {
  if (!state.seq) state.seq = {};
  if (typeof state.seq.report !== 'number') state.seq.report = 0;
  return `rep-${state.year}-${++state.seq.report}`;
}

function destRegion(g, destId) {
  const d = (g.destinations || []).find((x) => x.id === destId);
  return (d && d.region) || '';
}

function destDisplayName(g, destId) {
  const d = (g.destinations || []).find((x) => x.id === destId);
  return (d && (d.name || destId)) || destId;
}

/**
 * Queue a provincial report. Deduplicates: at most one pending report per
 * (destId, kind). Pure state transition; returns the report or the existing
 * pending one.
 */
export function queueReport(state, { kind, destId, year, title, body, facts, recommendations, dedupeKey }) {
  if (!REPORT_KINDS[kind]) throw new Error(`queueReport: unknown kind "${kind}".`);
  if (!Array.isArray(state.reports)) state.reports = [];
  const g = ensureData();
  const key = dedupeKey || `${destId}::${kind}`;
  const existing = state.reports.find((r) => r.dedupeKey === key && r.status === REPORT_STATUS.PENDING);
  if (existing) return existing;
  const rep = {
    id: nextReportId(state),
    dedupeKey: key,
    year: year ?? state.year,
    kind,
    destId,
    destName: destDisplayName(g, destId),
    region: destRegion(g, destId),
    title: title || `${REPORT_KINDS[kind]} — ${destDisplayName(g, destId)}`,
    body: body || '',
    facts: facts && typeof facts === 'object' ? facts : {},
    recommendations: Array.isArray(recommendations) ? recommendations.map((r, i) => ({
      id: r.id || `rec-${i + 1}`,
      text: r.text || '',
      action: r.action && typeof r.action === 'object' ? r.action : null,
    })) : [],
    status: REPORT_STATUS.PENDING,
    decision: null,
    appliedActions: [],
  };
  state.reports.push(rep);
  addLedger(state, {
    year: rep.year, type: 'report', decision: 'received', destId,
    text: `Report received: ${rep.title}.`,
  });
  return rep;
}

/** Pending reports, newest first. */
export function pendingReports(state) {
  return (state.reports || [])
    .filter((r) => r.status === REPORT_STATUS.PENDING)
    .sort((a, b) => b.year - a.year);
}

function reportFacts(state, g, destId) {
  const st = missionStaff(state, destId);
  const staffed = missionStaffed(st);
  return {
    staffed, capacity: st.capacity,
    fathers: st.fathers || 0, coadjutors: st.coadjutors || 0, brothers: st.brothers || 0,
    fragile: !!st.fragile, fragileYears: st.fragileYears || 0,
    strength: missionStrength(st),
    upkeep: missionUpkeep(st),
    access: (state.destState[destId] || {}).access || 'open',
    danger: (state.destState[destId] || {}).danger ?? null,
  };
}

/**
 * Recover death reports lost by the pre-73a8300 implementation, which marked a
 * voyage deathReported before confirming a distinct report was queued and which
 * deduplicated death reports per destination. For every deceased voyage flagged
 * as reported, if no report represents that death — matched by voyage id for
 * new-format reports, or by petitioner+destination for legacy reports — a
 * report is reconstructed from the voyage record alone. Idempotent: recovered
 * reports carry the voyage dedupeKey, so re-running creates nothing. Never
 * invents: every field comes from the voyage; a voyage with no destination
 * cannot be filed as a provincial report and is left untouched.
 * @returns {number} reports recovered
 */
function migrateDeathReports(state) {
  if (!Array.isArray(state.reports)) state.reports = [];
  const g = ensureData();
  let recovered = 0;
  for (const v of state.voyages || []) {
    if (v.outcome !== 'deceased' || !v.deathReported) continue;
    const key = `voyage:${v.id}`;
    const represented = state.reports.some((r) =>
      r.dedupeKey === key ||
      (r.kind === 'voyage' && r.facts && r.facts.petitionerId === v.petitionerId && r.destId === v.destination));
    if (represented || !v.destination) continue;
    const d = (g.destinations || []).find((x) => x.id === v.destination);
    const dName = d ? (d.name || v.destination) : v.destination;
    queueReport(state, {
      kind: 'voyage', destId: v.destination, year: v.resolvedYear ?? state.year, dedupeKey: key,
      title: `Death reported: ${v.petitionerName || v.petitionerId}`,
      body: `Recovered from the voyage record: ${v.petitionerName || v.petitionerId} died ` +
        `in the service of the mission to ${dName}. An earlier version marked this death reported ` +
        `without filing a distinct report; it is restored here so the General may review it.`,
      facts: { petitionerId: v.petitionerId, voyageId: v.id, destination: v.destination, departYear: v.departYear, recovered: true },
      recommendations: [
        { id: 'encourage', text: 'Send instruction: Encourage the brethren', action: { type: 'instruct', destId: v.destination, instructionType: 'encourage' } },
      ],
    });
    recovered += 1;
  }
  return recovered;
}

/**
 * Generate autonomous provincial reports from actual mission conditions.
 * Called once per resolved year. Deterministic: text derives from facts;
 * any randomness uses a seeded stream. Never invents people or events.
 */
export function generateReports(state, y) {
  if (!Array.isArray(state.reports)) state.reports = [];
  const g = ensureData();
  for (const d of g.destinations) {
    const st = missionStaff(state, d.id);
    const facts = reportFacts(state, g, d.id);
    // 1. Newly fragile mission: fragileYears just reached 3.
    if (st.fragile && (st.fragileYears || 0) === 5) {
      queueReport(state, {
        kind: 'fragile', destId: d.id, year: y,
        title: `The mission at ${facts.destName || d.name} is fragile`,
        body: `Word from ${d.name || d.id}: ${facts.staffed} of ${facts.capacity} places filled, ` +
          `three years running below strength. The mission's institutional presence is at risk. ` +
          `Fragility is reported, not decreed: it changes no mechanics, but the General must decide whether to answer it.`,
        facts,
        recommendations: [
          { id: 'reinforce', text: `Reinforce with ${Math.min(2, facts.capacity - facts.staffed)} men`, action: { type: 'dispatch', destId: d.id, counts: { fathers: 0, coadjutors: Math.min(2, facts.capacity - facts.staffed), brothers: 0 } } },
          { id: 'instruct-consolidate', text: 'Send instruction: Consolidate', action: { type: 'instruct', destId: d.id, instructionType: 'consolidate' } },
        ],
      });
    }
    // 2. Understaffed mission asking for men (below 60% staffed, not fragile-reporting).
    const ratio = facts.staffed / (facts.capacity || 5);
    if (ratio < 0.6 && !(st.fragile && (st.fragileYears || 0) === 5) && facts.access !== 'closed') {
      const want = facts.capacity - facts.staffed;
      if (want > 0) {
        queueReport(state, {
          kind: 'request', destId: d.id, year: y,
          title: `${d.name || d.id} asks for men`,
          body: `The mission at ${d.name || d.id} reports ${facts.staffed} of ${facts.capacity} places filled ` +
            `and asks the Generalate for reinforcement. The request is recorded; answering it is the General's decision.`,
          facts,
          recommendations: [
            { id: 'reinforce', text: `Reinforce with ${Math.min(2, want)} men`, action: { type: 'dispatch', destId: d.id, counts: { fathers: 0, coadjutors: Math.min(2, want), brothers: 0 } } },
          ],
        });
      }
    }
  }
  // 3. Deaths: every death is reported individually and traceably, even when
  // several occur at one destination before the inbox is reviewed. Dedupe is
  // per voyage, never per destination, so no death is ever silently absorbed.
  for (const v of state.voyages || []) {
    if (v.outcome === 'deceased' && v.resolvedYear === y && !v.deathReported) {
      const key = `voyage:${v.id}`;
      const already = (state.reports || []).some((r) => r.dedupeKey === key && r.status === REPORT_STATUS.PENDING);
      if (already) continue; // a pending report already carries this death; do not mark
      const d = (g.destinations || []).find((x) => x.id === v.destination);
      queueReport(state, {
        kind: 'voyage', destId: v.destination, year: y, dedupeKey: key,
        title: `Death reported: ${v.petitionerName || v.petitionerId}`,
        body: `Word has reached Rome: ${v.petitionerName || v.petitionerId} died ${v.destination === d?.id ? `in the service of the mission to ${d.name || d.id}` : 'at sea'}. ` +
          `The General is asked to commend the soul to God and consider encouraging the brethren who remain.`,
        facts: { petitionerId: v.petitionerId, voyageId: v.id, destination: v.destination, departYear: v.departYear },
        recommendations: [
          { id: 'encourage', text: 'Send instruction: Encourage the brethren', action: { type: 'instruct', destId: v.destination, instructionType: 'encourage' } },
        ],
      });
      v.deathReported = true;
    }
  }
}

/**
 * Record the General's decision on a report. Decisions that change nothing
 * (acknowledge/decline/defer) are recorded honestly in the ledger.
 * Accepting a recommendation stages it via stageRecommendation instead.
 */
export function decideReport(state, reportId, decision, note) {
  if (!REPORT_DECISIONS.includes(decision)) {
    throw new Error(`decideReport: unknown decision "${decision}". Use acknowledge, decline, or defer — or stage a recommendation.`);
  }
  const rep = (state.reports || []).find((r) => r.id === reportId);
  if (!rep) throw new Error(`decideReport: unknown report "${reportId}".`);
  if (rep.status !== REPORT_STATUS.PENDING) {
    throw new Error(`decideReport: report "${reportId}" is already ${rep.status}; it cannot be decided twice.`);
  }
  const status = decision === 'acknowledge' ? REPORT_STATUS.ACKNOWLEDGED
    : decision === 'decline' ? REPORT_STATUS.DECLINED : REPORT_STATUS.DEFERRED;
  rep.status = status;
  rep.decision = { decision, year: state.year, note: note || null };
  const verb = decision === 'acknowledge' ? 'acknowledged' : decision === 'decline' ? 'declined' : 'deferred';
  addLedger(state, {
    year: state.year, type: 'report', decision: verb, destId: rep.destId, reportId: rep.id,
    text: `Report ${verb}: ${rep.title}.${note ? ` ${note}` : ''}`,
  });
  return rep;
}

/**
 * Return a deferred report to the pending inbox for reconsideration.
 */
export function reopenReport(state, reportId) {
  const rep = (state.reports || []).find((r) => r.id === reportId);
  if (!rep) throw new Error(`reopenReport: unknown report "${reportId}".`);
  if (rep.status !== REPORT_STATUS.DEFERRED) {
    throw new Error(`reopenReport: report "${reportId}" is ${rep.status}; only deferred reports can be reopened.`);
  }
  rep.status = REPORT_STATUS.PENDING;
  rep.decision = null;
  addLedger(state, {
    year: state.year, type: 'report', decision: 'reopened', destId: rep.destId, reportId: rep.id,
    text: `Deferred report reopened: ${rep.title}.`,
  });
  return rep;
}

/**
 * Stage a report recommendation for later batch application. Staging never
 * mutates authoritative state, spends nothing, and triggers nothing.
 */
export function stageRecommendation(state, reportId, recId) {
  const rep = (state.reports || []).find((r) => r.id === reportId);
  if (!rep) throw new Error(`stageRecommendation: unknown report "${reportId}".`);
  if (rep.status !== REPORT_STATUS.PENDING) {
    throw new Error(`stageRecommendation: report "${reportId}" is ${rep.status}; only pending reports can be acted on.`);
  }
  const rec = (rep.recommendations || []).find((r) => r.id === recId);
  if (!rec) throw new Error(`stageRecommendation: unknown recommendation "${recId}".`);
  if (!rec.action) throw new Error(`stageRecommendation: recommendation "${recId}" carries no executable action.`);
  if (!Array.isArray(state.staged)) state.staged = [];
  const dup = state.staged.find((s) => s.reportId === reportId && s.recId === recId && s.status === 'staged');
  if (dup) throw new Error(`stageRecommendation: this recommendation is already staged.`);
  if (typeof state.seq.staged !== 'number') state.seq.staged = 0;
  const sa = {
    id: `stg-${++state.seq.staged}`,
    reportId, recId, destId: rep.destId,
    label: rec.text, action: JSON.parse(JSON.stringify(rec.action)),
    stagedYear: state.year, status: 'staged',
  };
  // Validate now so obviously invalid actions never reach the review list.
  validateStagedAction(state, sa);
  state.staged.push(sa);
  return sa;
}

/** Remove a staged action without applying it. */
export function discardStaged(state, stagedId) {
  const ix = (state.staged || []).findIndex((s) => s.id === stagedId);
  if (ix < 0) throw new Error(`discardStaged: unknown staged action "${stagedId}".`);
  state.staged.splice(ix, 1);
  return true;
}

function stagedDispatchCost(state, action) {
  // Ships only (Tran 2026-10-20): a staged "dispatch" sends named men
  // from Europe to the dock; nothing is charged until they sail. What
  // validation must prove is that the men exist.
  let total = 0;
  const cands = deploymentCandidates(state);
  for (const gid of rules.MISSION_GRADE_IDS) {
    const v = (action.counts || {})[gid] ?? 0;
    if (!Number.isInteger(v) || v < 0) throw new Error(`staged dispatch: "${gid}" must be a whole number ≥ 0.`);
    total += v;
    const have = cands.filter((c) => c.staffGrade === gid).length;
    if (have < v) throw new Error(`staged dispatch: only ${have} ${gid} free in Europe, ${v} requested.`);
  }
  if (total <= 0) throw new Error('staged dispatch: choose at least one man to send.');
  return { cost: 0, total };
}

/**
 * Dry-run validation of a staged action against CURRENT state.
 * Throws on invalid; never mutates.
 */
export function validateStagedAction(state, sa) {
  const a = sa.action || {};
  const g = ensureData();
  // A declined report is a final judgment: its recommendations may not be
  // executed, even if they were staged while the report was pending. This is
  // checked at apply time (and in the UI validity badge) because the report's
  // status can change after staging.
  const rep = (state.reports || []).find((r) => r.id === sa.reportId);
  if (rep && rep.status === REPORT_STATUS.DECLINED) {
    throw new Error(`staged action "${sa.id}" comes from the report "${rep.title}", which was declined; discard it before applying.`);
  }
  if (a.type === 'dispatch') {
    const dest = g.destinations.find((d) => d.id === a.destId);
    if (!dest) throw new Error(`staged dispatch: unknown destination "${a.destId}".`);
    if (!isDestOpen(state, a.destId)) throw new Error(`staged dispatch: ${dest.name || a.destId} is closed to new men.`);
    const { cost, total } = stagedDispatchCost(state, a);
    return { ok: true, cost, total };
  }
  if (a.type === 'instruct') {
    const dest = g.destinations.find((d) => d.id === a.destId);
    if (!dest) throw new Error(`staged instruction: unknown destination "${a.destId}".`);
    if (!isDestOpen(state, a.destId)) throw new Error(`staged instruction: ${dest.name || a.destId} is closed.`);
    const known = ['expand', 'consolidate', 'report', 'encourage', 'admonish'];
    if (!known.includes(a.instructionType)) throw new Error(`staged instruction: unknown instruction "${a.instructionType}".`);
    const cur = (state.instructions || {})[a.destId];
    if (cur && cur.status === 'in-transit') throw new Error(`staged instruction: one is already in transit to ${dest.name || a.destId}.`);
    return { ok: true };
  }
  throw new Error(`validateStagedAction: unknown action type "${a.type}".`);
}

function applyStagedAction(state, sa) {
  const a = sa.action;
  if (a.type === 'dispatch') {
    const res = queueNamedMen(state, a.destId, a.counts || {}, 'sent by the General’s order');
    if (!state.stats) state.stats = {};
    state.stats.missionDispatches = (state.stats.missionDispatches || 0) + res.total;
    if (!state.stats.missionDispatchDests) state.stats.missionDispatchDests = {};
    state.stats.missionDispatchDests[a.destId] = (state.stats.missionDispatchDests[a.destId] || 0) + res.total;
    return `Sent ${res.total} named men to wait for a ship to ${a.destId}.`;
  }
  if (a.type === 'instruct') {
    issueInstruction(state, a.destId, a.instructionType);
    return `Instruction sent to ${a.destId}: ${a.instructionType}.`;
  }
  throw new Error(`applyStagedAction: unknown action type "${a.type}".`);
}

/**
 * Apply all staged actions as one batch. Every action is re-validated against
 * current state first; then all are applied. If any application throws, the
 * whole batch is rolled back to the pre-apply snapshot and nothing is
 * recorded as applied. Reports whose recommendations were applied are marked
 * acted, with a ledger entry describing what actually happened.
 */
export function applyStaged(state) {
  const staged = (state.staged || []).filter((s) => s.status === 'staged');
  if (!staged.length) throw new Error('applyStaged: no staged actions to apply.');
  // Snapshot the ENTIRE authoritative state (resources, missions, instructions,
  // reports, ledger, sequence counters, RNG state — all JSON-serializable).
  const backup = JSON.stringify(state);
  const applied = [];
  try {
    // Validate each action against CURRENT state — including the effects of
    // earlier actions in this batch — then apply it immediately. Any failure
    // rolls the whole batch back, so conflicts between batched actions are
    // caught with a clear message and never half-applied.
    for (const sa of staged) {
      validateStagedAction(state, sa);
      const note = applyStagedAction(state, sa);
      sa.status = 'applied';
      sa.appliedYear = state.year;
      applied.push({ id: sa.id, note });
      const rep = (state.reports || []).find((r) => r.id === sa.reportId);
      if (rep) {
        if (!Array.isArray(rep.appliedActions)) rep.appliedActions = [];
        rep.appliedActions.push({ stagedId: sa.id, recId: sa.recId, label: sa.label, note, year: state.year });
        const labels = rep.appliedActions.map((a) => a.label).join('; ');
        // Any report that has actions applied from it was acted on, whatever its
        // prior non-declined status (declined reports are rejected at validation).
        rep.status = REPORT_STATUS.ACTED;
        rep.decision = { decision: 'acted', year: state.year, note: labels };
        addLedger(state, {
          year: state.year, type: 'report', decision: 'acted', destId: rep.destId, reportId: rep.id,
          text: `Report acted on: ${rep.title} — ${sa.label}. ${note}`,
        });
      }
    }
  } catch (e) {
    const restored = JSON.parse(backup);
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, restored);
    throw new Error(`applyStaged: batch failed and was rolled back unchanged: ${e.message}`);
  }
  state.staged = (state.staged || []).filter((s) => s.status !== 'applied');
  return applied;
}

/**
 * Instrumentation only (Stage 0): parallel uncapped score. Every site that
 * moves the capped score calls trackScoreDelta with the IDENTICAL delta.
 * This never affects rules, the cap, voyage resolution, or any mechanic —
 * it is a measurement counter for balance simulations.
 * @param {object} state
 * @param {number} delta the exact delta applied to the capped score
 */
function trackScoreDelta(state, delta) {
  if (typeof state.scoreUncapped !== 'number') state.scoreUncapped = rules.SCORE.START;
  state.scoreUncapped += delta;
}

/**
 * Resolve instructions arriving this year. Uses the mission's fathers as a proxy
 * for leadership quality. Outcomes: obeyed, adapted, delayed, disobeyed.
 * All seeded and reproducible.
 */
function resolveInstructions(state, y) {
  if (!state.instructions) return;
  for (const [destId, inst] of Object.entries(state.instructions)) {
    if (inst.status !== 'in-transit' || inst.arriveYear > y) continue;
    const st = missionStaff(state, destId);
    const fathers = st.fathers || 0;
    // Leadership quality: more fathers = better odds, but never guaranteed.
    const obedienceBase = 0.55 + Math.min(0.3, fathers * 0.1);
    const rng = streamFor(state, 'instruction', destId, String(y));
    const roll = rng.float();
    let outcome;
    if (roll < obedienceBase * 0.7) outcome = 'obeyed';
    else if (roll < obedienceBase) outcome = 'adapted';
    else if (roll < obedienceBase + 0.15) outcome = 'delayed';
    else outcome = 'disobeyed';
    inst.status = 'resolved';
    inst.outcome = outcome;
    inst.resolvedYear = y;
    const g = ensureData();
    const dest = g.destinations.find((d) => d.id === destId);
    const dName = dest ? dest.name || destId : destId;
    // Effects depend on instruction type and outcome.
    let effectText = '';
    if (inst.type === 'expand') {
      if (outcome === 'obeyed') {
        // Growth: small chance of a new vocation joining the mission
        const vrng = streamFor(state, 'instruction-voc', destId, String(y));
        if (vrng.chance(0.3) && st.brothers < 10) {
          st.brothers += 1;
          effectText = ' A new brother joins the mission.';
        }
      } else if (outcome === 'disobeyed') {
        // Reckless overreach: costs score
        state.score = rules.addScore(state.score, -1);
        trackScoreDelta(state, -1);
        effectText = ' Reckless overreach causes scandal (-1 score).';
      } else if (outcome === 'adapted') {
        effectText = ' The superior adapts prudently to local conditions.';
      }
    } else if (inst.type === 'consolidate') {
      if (outcome === 'disobeyed') {
        state.score = rules.addScore(state.score, -1);
        trackScoreDelta(state, -1);
        effectText = ' The superior ignores caution and overextends (-1 score).';
      } else {
        effectText = outcome === 'obeyed' ? ' The mission steadies.' : ' The superior adapts prudently.';
      }
    } else if (inst.type === 'report') {
      // Reports inform; no mechanical effect, but the General learns.
      // A cooperative mission now delivers a real, reviewable account.
      effectText = outcome === 'obeyed' ? ' A full account arrives.' :
        outcome === 'disobeyed' ? ' The account is evasive and incomplete.' :
        ' A partial account arrives.';
      if (outcome === 'obeyed' || outcome === 'adapted') {
        const facts = reportFacts(state, g, destId);
        queueReport(state, {
          kind: 'account', destId, year: y,
          title: `Full account from ${dName}`,
          body: outcome === 'obeyed'
            ? `The account requested of ${dName} has arrived: ${facts.staffed} of ${facts.capacity} places filled ` +
              `(${facts.fathers} fathers, ${facts.coadjutors} coadjutors, ${facts.brothers} brothers)` +
              `${facts.fragile ? '; the mission reports itself fragile' : ''}. It awaits the General's reading.`
            : `A partial account arrives from ${dName}: ${facts.staffed} of ${facts.capacity} places filled. ` +
              `The superior begs the General's patience for what is missing.`,
          facts,
          recommendations: [],
        });
      }
    } else if (inst.type === 'encourage') {
      // Encouragement may improve future cooperation: small chance of +1 score.
      if (outcome === 'obeyed') {
        const erng = streamFor(state, 'instruction-enc', destId, String(y));
        if (erng.chance(0.4)) {
          state.score = rules.addScore(state.score, 1);
          trackScoreDelta(state, 1);
          effectText = ' The brethren take heart; their fervor bears fruit (+1 score).';
        } else {
          effectText = ' The brethren receive the encouragement gladly.';
        }
      } else {
        effectText = ' The encouragement arrives but changes little.';
      }
    } else if (inst.type === 'admonish') {
      // Admonishment may improve compliance or have little effect.
      if (outcome === 'obeyed') {
        effectText = ' The superior receives the correction humbly.';
      } else if (outcome === 'disobeyed') {
        state.score = rules.addScore(state.score, -1);
        trackScoreDelta(state, -1);
        effectText = ' The admonition is resented; discipline suffers (-1 score).';
      } else {
        effectText = ' The admonition produces a partial amendment.';
      }
    }
    state.ledger.unshift({
      seq: ++state.seq.ledger, year: y, type: 'instruction',
      text: `From ${dName}: instruction ${outcome}.${effectText}`,
    });
  }
}

/**
 * Resolve novitiate vocations. Each functioning novitiate (mission with 2+ fathers)
 * has a 20% yearly chance to receive a candidate. Candidates mature after 2 years
 * and enter European labor as scholastics. Seeded and reproducible.
 * These are new vocations, distinct from the abstract annual Society intake.
 */
function resolveVocations(state, y) {
  if (!state.novices) state.novices = [];
  for (const nov of state.novitiates || []) {
    const st = missionStaff(state, nov.destination);
    if ((st.fathers || 0) < 2) continue; // understaffed: no vocations
    const rng = streamFor(state, 'vocation', nov.destination, String(y));
    if (rng.chance(0.20)) {
      const nid = `nov-${nov.destination}-${y}-${state.novices.length}`;
      // Simple name generation from destination
      const names = ['Paolo', 'Giovanni', 'Antonio', 'Francesco', 'Pietro', 'Giuseppe'];
      const name = rng.pick(names) + ' (novice)';
      state.novices.push({
        id: nid, name, destination: nov.destination,
        startYear: y, readyYear: y + 2,
      });
      const g = ensureData();
      const dest = g.destinations.find((d) => d.id === nov.destination);
      state.ledger.unshift({
        seq: ++state.seq.ledger, year: y, type: 'vocation',
        text: `A candidate presents himself at the ${dest ? dest.name : nov.destination} novitiate.`,
      });
    }
  }
  // Mature novices enter European labor
  const ready = state.novices.filter((n) => n.readyYear <= y);
  for (const n of ready) {
    // Create a petitioner record as scholastic
    const rec = ensureRecord(state, n.id, true);
    rec.fictional = true;
    rec.status = STATUS.DENIED; // available in Europe, may petition
    rec.deniedCount = 0;
    // Set grade via dispositions override
    // Grade and track are persisted on the record (saved with the game), not in
    // the in-memory dispositions.GRADES table, so they survive save/reload.
    rec.savedGrade = { grade: 'scholastic', ordained: false };
    rec.vowsTrack = 'scholastic';
    // Novitiate years count toward both counters: seed his historical years with
    // the time actually spent in the mission novitiate (normally 2), then enter.
    const novYears = Math.max(0, y - (typeof n.startYear === 'number' ? n.startYear : y - 2));
    rec.yearsInSociety = novYears;
    if (rec.entryYear == null) rec.entryYear = y;
    seedTrueEntryYear(state, n.id, y);
    rec.novitiate = { destination: n.destination, startYear: y - novYears, endYear: y, years: novYears };
    rec.novitiateCounted = true;
    recordNovitiate(state, n.id, rec.novitiate, false);
    addEuropeanLabor(state, n.id, n.name, 'vocation');
    state.ledger.unshift({
      seq: ++state.seq.ledger, year: y, type: 'vocation',
      text: `${n.name} completes initial formation and is available for assignment.`,
    });
  }
  state.novices = state.novices.filter((n) => n.readyYear > y);
}

/** Yearly funds from domestic assignments. Called during resolveYear.
 *  Income depends on the man's grade (six-grade system), not the role.
 *  The role is the type of work; the grade determines how much it yields. */
function domesticYearlyFunds(state) {
  // Grade-based income per Tran 2026-10-19: P 12, S* 10, S 5, F 5, Novices 0
  const GRADE_INCOME = { 'P': 12, 'S*': 10, 'S': 5, 'F': 5, 'nS': 0, 'nF': 0 };
  let total = 0;
  for (const e of state.europeanLabor || []) {
    if (!e.assignment) continue;
    const dg = detailedGradeFor(state, e.petitionerId);
    total += GRADE_INCOME[dg] ?? 0;
  }
  return total;
}

/** Yearly funds from men held at dock (Tran 2026-10-19): a man waiting
 *  for his ship labors in the port — teaching, preaching, serving the
 *  college — and earns his grade income, same as domestic service.
 *  CAPPED (Tran 2026-10-20): only the first DOCK_WAGE_CAP paid men in the
 *  queue earn — the dock pays a waiting party, not a workforce. Men whose
 *  grade pays nothing (novices) never draw on the cap. */
export function dockYearlyFunds(state) {
  const GRADE_INCOME = { 'P': 12, 'S*': 10, 'S': 5, 'F': 5, 'nS': 0, 'nF': 0 };
  const cap = rules.RESOURCES.DOCK_WAGE_CAP ?? 8;
  let total = 0;
  let paid = 0;
  for (const q of state.queue || []) {
    if (q.status !== 'awaiting' || !q.held) continue;
    const wage = GRADE_INCOME[detailedGradeFor(state, q.petitionerId)] ?? 0;
    if (wage <= 0) continue;
    if (paid >= cap) break;
    paid += 1;
    total += wage;
  }
  return total;
}

/**
 * Mission income: thriving missions (60%+ staffed) generate funds by grade.
 * Full rate (P 12, S* 10, S 5, F 5): England, Far East, West Indies.
 * Half rate: everywhere else.
 * Zero: danger 3 (persecution).
 */
function missionYearlyFunds(state) {
  const FULL = { 'P': 12, 'S*': 10, 'S': 5, 'F': 5, 'nS': 0, 'nF': 0 };
  const HALF = { 'P': 6, 'S*': 5, 'S': 2.5, 'F': 2.5, 'nS': 0, 'nF': 0 };
  const FULL_RATE_IDS = new Set([
    'england',
    // Far East
    'japan', 'china', 'india', 'east-indies', 'philippines',
    // West Indies
    'west-indies',
  ]);
  const g = ensureData();
  let total = 0;
  for (const destId of Object.keys(state.missions || {})) {
    const st = missionStaff(state, destId);
    const dst = state.destState[destId] || {};
    if (dst.collapsed || dst.access === 'closed') continue;
    const ratio = missionStaffed(st) / (st.capacity || 5);
    if (ratio < 0.6) continue; // only thriving missions
    const dest = g.destinations.find((d) => d.id === destId);
    const danger = dst.danger ?? dest?.danger ?? 1;
    if (danger >= 3) continue; // persecution: no income
    const rates = FULL_RATE_IDS.has(destId) ? FULL : HALF;
    // Count by grade from staffIds
    for (const pid of st.staffIds || []) {
      const dg = detailedGradeFor(state, pid);
      total += rates[dg] ?? 0;
    }
  }
  return Math.floor(total);
}

/** Whether any formation aide is serving (reduces formation cost). */
function hasFormationAide(state) {
  return (state.europeanLabor || []).some((e) => e.assignment === 'formationAid');
}

/** Complete formations due this year: primary +1 always, secondary +1 on a seeded fifty-fifty. */
function completeFormations(state, g, y, outcomes) {
  for (const entry of state.europeanLabor || []) {
    const f = entry.formation;
    if (!f || f.until > y) continue;
    const focus = dispositions.formationById(f.focus);
    entry.formation = null;
    const d = ensureDisposition(state, entry.petitionerId);
    const gains = [];
    if (d.current[focus.primary] < 5) {
      d.current[focus.primary] = Math.min(5, d.current[focus.primary] + 2);
      gains.push(focus.primary);
    }
    if (d.current[focus.secondary] < 5
        && streamFor(state, 'formation', entry.petitionerId, String(y)).chance(0.5)) {
      d.current[focus.secondary] += 1;
      gains.push(focus.secondary);
    }
    const gainText = gains.length
      ? ` His ${gains.map((t) => t).join(' and ')} has deepened.`
      : ' He is as he was; the year was not wasted.';
    observe(state, entry.petitionerId, `Completed a year of ${focus.name.toLowerCase()} (observed ${y}).`);
    const note = `${entry.name} completes a year of ${focus.name.toLowerCase()}.${gainText}`;
    addLedger(state, {
      year: y, type: 'formation', petitionerId: entry.petitionerId,
      decision: 'completed', status: 'in-europe', counterfactual: true, delta: 0, note,
    });
    outcomes.push(note);
  }
}

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a new game state.
 * @param {{mode?:'campaign'|'endless', seed?:string, data?:object}} opts
 *   data: optional inline game data (overrides the data.js cache) — for tests.
 * @returns {object} serializable game state
 */
export function newGame({ mode = 'campaign', seed = 'generalate', data = null } = {}) {
  if (mode !== 'campaign' && mode !== 'endless') {
    throw new Error(`newGame: mode must be 'campaign' or 'endless', got "${mode}"`);
  }
  const g = ensureData(data);
  const rng = makeRng(`${seed}:main`);
  const endlessRng = makeRng(`${seed}:endless`);
  const state = {
    version: 1,
    seed: String(seed),
    mode,
    year: CAMPAIGN_START,
    finance: { income: {}, expenses: {} },
    financeYears: {},
    phase: 'campaign',
    diverged: false,
    ended: false,
    score: rules.SCORE.START,
    scoreUncapped: rules.SCORE.START, // Stage 0 instrumentation: parallel uncapped score
    society: rules.RESOURCES.SOCIETY_START, // the whole Society (13,112 in 1615)
    available: Math.round(rules.RESOURCES.SOCIETY_START * rules.RESOURCES.MISSION_PCT), // men the General can spare: 1%
    petitioners: {},   // id → record {status, history, deniedCount, usedLetters, voyages, archived}
    queue: [],         // approved, awaiting departure
    voyages: [],       // sailing / resolved
    ledger: [],        // every decision, departure, outcome, event
    resources: {
      funds: rules.RESOURCES.START_FUNDS,
      berths: rules.RESOURCES.BERTHS,
      ships: rules.RESOURCES.STARTING_FLEET.map((tier, i) => ({
        id: `ship-${i + 1}`,
        name: rules.RESOURCES.SHIP_NAMES[i] || `Hull ${i + 1}`,
        tier,
        freeYear: 0,
      })),
    },
    destState: initDestState(g.destinations),
    missions: initMissions(g.destinations, g.petitioners), // per-mission staffing with staffIds
    missionTransit: {}, // destId -> [{arrivalYear, grades:{fathers,coadjutors,brothers}}] — men at sea
    novitiates: [],   // {destination, foundedYear} — houses of formation at missions
    europeanLabor: [], // men working in Europe: {petitionerId, name, year, via:'denied'|'returned'|'veteran'}
    pendingVows: [],
    vowsNewsInTransit: [],
    deployments: [], // collective deployment orders (Stage 1): {id, year, destId, destName, purpose, memberIds, voyageIds}
    zealUntil: 0,     // year through which veteran zeal aids voyage checks
    exhortUntil: 0,    // year through which the General's exhortation aids voyages
    currentTerna: null, // {year, cards:[...]} while awaiting decide()
    instructions: {}, // destId -> {type, issuedYear, arriveYear, status, outcome}
    reports: [],      // provincial reports: {id, year, kind, destId, title, body, facts, recommendations[], status, decision}
    staged: [],       // staged governance actions awaiting batch application
    draft: null,      // pre-game provincial draft (set below)
    provincials: {},  // regionId -> chosen provincial (organizational for now)
    provinceHQs: {},  // regionId -> destination id where the provincial resides
    provincialRequests: {}, // regionId -> pending manpower request
    stagedAnswers: {}, // regionId -> staged request answer, executed at year close
    provincialTernas: {}, // active replacement ternas by region
    novices: [], // {id, name, destination, startYear, readyYear} - candidates in formation
    currentYear: null,  // UI-facing mirror: {year, briefing, terna, decided, decisionResult}
    stats: {
      ternas: 0, approvals: 0, denials: 0,
      departures: 0, arrivals: 0, deaths: 0,
      returns: 0, illnesses: 0, reassignments: 0, thriving: 0,
      teams: 0, novitiates: 0,
      missionDispatches: 0, missionDispatchDests: {}, // report-card instrumentation (additive)
    },
    firedEvents: [],
    seq: { ledger: 0, voyage: 0, fic: 0, team: 0, deployment: 0, report: 0, staged: 0 },
    rngState: rng.getState(),
    endlessRngState: endlessRng.getState(),
  };
  state.draft = makeProvincialDraft(state);
  state.energy = ENERGY_PER_YEAR;
  state.questionsAsked = 0;
  state.provinceHQs = { europe: 'Rome' }; // the European provincial resides at Rome
  // Every man a profile: the starting staff are real named men with
  // arrivals in past years, not bare counts.
  mintUnnamedStaff(state);
  return state;
}

// ---------------------------------------------------------------------------
// Terna assembly
// ---------------------------------------------------------------------------

/**
 * Letters of a petitioner usable in the given game year. Campaign prefers
 * letters of year <= current game year ("prefer", not "require"): when no
 * letter is that old yet, the earliest letters stand in, flagged fromFuture
 * so the UI can present them honestly.
 * @returns {{letters:object[], fromFuture:boolean}}
 */
function candidateLetters(pet, year) {
  const all = (pet.letters || [])
    .filter((l) => l && l.year != null)
    .sort((a, b) => a.year - b.year || a.n - b.n);
  const past = all.filter((l) => l.year <= year);
  return past.length > 0 ? { letters: past, fromFuture: false } : { letters: all, fromFuture: true };
}

/**
 * Featured letter: earliest unused letter of the year-or-earlier; else the
 * latest available. Never consumes a future letter's "unused" slot.
 * @returns {{letter:object, fromFuture:boolean}|null}
 */
function featuredLetter(pet, rec, year) {
  const { letters, fromFuture } = candidateLetters(pet, year);
  if (letters.length === 0) return null;
  const unused = letters.filter((l) => !rec.usedLetters.includes(l.n));
  return { letter: unused.length > 0 ? unused[0] : letters[letters.length - 1], fromFuture };
}

function isDestOpen(state, destId) {
  return (state.destState[destId]?.access ?? 'open') !== 'closed';
}

/** Human-readable history lines for a card. */
function historyLines(g, rec) {
  return rec.history.filter((h) => h && !h.kind && h.decision)
    .map((h) => `${h.year} — ${h.decision} (${destName(g, h.destination)})`);
}

/**
 * Enrich a historical petitioner with deterministic game attributes where
 * the historical record is silent. Seeded by petitioner ID so the same
 * man always has the same constitution. These are gameplay attributes,
 * not historical claims — the archive itself records "not specified."
 */
function enrichPetitioner(pet, seedBase) {
  if (pet.fictional) return pet; // fictional already have full data
  if (pet._enriched) return pet;
  const rng = makeRng(`${seedBase}:constitution:${pet.id}`);
  const enriched = { ...pet };
  if (enriched.age == null) enriched.age = rng.int(20, 45);
  if (enriched.yearsInSociety == null) {
    enriched.yearsInSociety = rng.int(1, Math.min(enriched.age - 16, 28));
  }
  if (!enriched.formation) {
    const yis = enriched.yearsInSociety;
    const grade = String(enriched.grade || '').toLowerCase();
    const isBrother = grade === 'brother';
    // Brothers never go through scholastic formation (priest track only).
    // A brother is novice (<2yrs) then brother; never 'scholastic'.
    if (isBrother) {
      enriched.formation = yis < 2 ? 'novice' : 'brother';
    } else {
      enriched.formation = yis < 2 ? 'novice' : yis <= 8 ? 'scholastic' : rng.pick(['priest', 'professed', 'priest']);
    }
  }
  if (!enriched.studies) {
    enriched.studies = enriched.formation === 'novice' ? 'Humanities'
      : enriched.formation === 'scholastic' ? rng.pick(['Philosophy', 'Theology'])
      : 'Theology';
  }
  if (!enriched.skills || enriched.skills.length === 0) {
    const pool = ['Latin', 'preaching', 'teaching', 'music', 'languages', 'rhetoric', 'medicine', 'mathematics'];
    enriched.skills = rng.shuffle(pool).slice(0, rng.int(1, 3));
  }
  if (!enriched.health) {
    enriched.health = rng.pick(['Good health', 'Good health', 'Good health', 'Delicate constitution', 'Robust health', 'Recovering from illness']);
  }
  enriched._enriched = true;
  return enriched;
}

/** Build the UI-facing card for a petitioner + featured letter. */
function buildCard(g, state, pet, letter, fromFuture = false) {
  const rec = ensureRecord(state, pet.id, pet.fictional);
  const ep = enrichPetitioner(pet, state.seed);
  const destination = letter.destination || ep.destination;
  return {
    id: ep.id,                    // UI primary key (alias of petitionerId)
    petitionerId: ep.id,
    name: ep.name,
    age: ep.age,
    yearsInSociety: typeof rec.totalYearsInSociety === 'number' ? rec.totalYearsInSociety : ep.yearsInSociety,
    formation: ep.formation,
    studies: ep.studies,
    skills: ep.skills || [],
    health: healthRating(ep.health),
    healthNote: ep.health || null,
    destination,
    destinationName: destName(g, destination),
    dossier: ep.dossier,
    letter,
    /** True when the featured letter is dated after the current game year (shown early). */
    letterFromFuture: fromFuture,
    history: historyLines(g, rec),
    fictional: !!ep.fictional,
    deniedCount: rec.deniedCount,
    status: rec.status,
  };
}

/** Regenerate a fictional petitioner's full data deterministically from the seed. */
function fictionalData(state, g, rec) {
  // Men write for missions that exist: draw from OPEN destinations only
  // (Tran 2026-10-19). Petitioning a closed frontier is archived-at-birth
  // waste; a returning man's destination may shift as the map changes.
  const openDestIds = new Set();
  for (const [did, ds] of Object.entries(state.destState || {})) {
    if (ds.access === 'open' && !ds.collapsed) openDestIds.add(did);
  }
  const open = g.destinations.filter((d) => openDestIds.has(d.id));
  const ids = (open.length ? open : g.destinations).map((d) => d.id);
  const names = (open.length ? open : g.destinations).map((d) => d.name);
  // Collect used names to ensure uniqueness
  const usedNames = new Set();
  for (const pid of Object.keys(state.petitioners || {})) {
    const r = state.petitioners[pid];
    if (r && r.name) usedNames.add(r.name);
  }
  // Also include historical petitioners
  const g2 = getGameData();
  if (g2 && g2.petitioners) {
    for (const p of g2.petitioners) if (p.name) usedNames.add(p.name);
  }
  // Open missions for native territory restriction
  return fictionalPetitioner(state.seed, rec.ficNum, ids, names, rec.genYear, usedNames, openDestIds);
}

/**
 * Spawn one fictional petitioner into the pool (endless mode).
 * Returns {pet, letter, fromFuture} or null when the active cap is reached
 * and no archived denied petitioner can be reactivated.
 *
 * Petitioners generated for a currently-closed destination are archived at
 * birth (they never enter the pool, so they can't clog it or the cap).
 */
function spawnFictional(state, g, rng) {
  const tryRec = (rec) => {
    const pet = fictionalData(state, g, rec);
    const feat = featuredLetter(pet, rec, state.year);
    if (!feat) return null;
    const dest = feat.letter.destination || pet.destination;
    if (!isDestOpen(state, dest)) return null;
    return { pet, letter: feat.letter, fromFuture: feat.fromFuture };
  };
  const activeFic = Object.values(state.petitioners).filter(
    (r) => r.fictional && !r.archived && [STATUS.NEW, STATUS.DENIED, STATUS.APPROVED].includes(r.status)
  ).length;
  if (activeFic >= MAX_ACTIVE_FICTIONAL) {
    // Reactivate archived denied fictional instead of growing; skip any
    // whose destination is (still) closed.
    const candidates = Object.values(state.petitioners)
      .filter((r) => r.fictional && r.archived && r.status === STATUS.DENIED && r.deniedCount < FIC_DENIAL_RETIREMENT)
      .sort((a, b) => a.ficNum - b.ficNum);
    for (const rec of candidates) {
      rec.archived = false;
      const got = tryRec(rec);
      if (got) return got;
      rec.archived = true;
    }
    return null;
  }
  for (let attempt = 0; attempt < 25; attempt++) {
    const n = ++state.seq.fic;
    const rec = ensureRecord(state, `fic-${n}`, true);
    rec.ficNum = n;
    rec.genYear = state.year;
    const got = tryRec(rec);
    if (got) return got;
    rec.archived = true; // born for a closed mission — never enters the pool
  }
  return null;
}

export const TERNA_SIZE = 10;

/**
 * Assemble the year's indipetae: 10 distinct eligible petitioners (Tran
 * 2026-10-19 — the game is a vocation-promotion instrument, not a ration):
 * a mix of new historical and returning denied. Campaign prefers letters of
 * year <= current game year, unused first. Closed destinations excluded.
 */
function assembleTerna(state, g, rng) {
  const year = state.year;
  const newC = [];   // {pet, letter, fromFuture, dest}
  const retC = [];
  // Men in formation are in retreat: they cannot petition until their year ends.
  // Men holding domestic assignments are occupied: they do not petition.
  const inFormation = new Set(
    (state.europeanLabor || [])
      .filter((e) => e.formation && e.formation.until >= year)
      .map((e) => e.petitionerId));
  const assignedDomestic = new Set(
    (state.europeanLabor || [])
      .filter((e) => e.assignment)
      .map((e) => e.petitionerId));
  const consider = (pet, rec, status) => {
    if (inFormation.has(pet.id)) return;
    if (assignedDomestic.has(pet.id)) return;
    const feat = featuredLetter(pet, rec, year);
    if (!feat) return;
    const dest = feat.letter.destination || pet.destination;
    if (!dest || !isDestOpen(state, dest)) return;
    const entry = { pet, letter: feat.letter, fromFuture: feat.fromFuture, dest };
    if (status === STATUS.DENIED) retC.push(entry);
    else newC.push(entry);
  };
  // A man already awaiting passage (in the departure queue, held at dock
  // included) is committed to a ship — he does not petition at the desk
  // again. (Dock-held reserved men keep status 'denied', so without this
  // exclusion they resurfaced in the next stack and an approval created a
  // SECOND queue entry for the same man.)
  const atDock = new Set(
    (state.queue || []).filter((q) => q.status === 'awaiting').map((q) => q.petitionerId),
  );
  for (const pet of g.petitioners) {
    if (pet.fictional) continue; // historical pool here; fictional below
    if (atDock.has(pet.id)) continue;
    const rec = state.petitioners[pet.id];
    const status = rec ? rec.status : STATUS.NEW;
    if (!TERNA_ELIGIBLE.includes(status) || rec?.archived) continue;
    consider(pet, rec || { usedLetters: [] }, status);
  }
  // Returning fictional petitioners keep id + history and re-petition.
  for (const rec of Object.values(state.petitioners)) {
    if (!rec.fictional || rec.archived || !TERNA_ELIGIBLE.includes(rec.status)) continue;
    if (atDock.has(rec.id)) continue;
    consider(fictionalData(state, g, rec), rec, rec.status);
  }
  // Unused letters first, then earliest letter year; shuffle within for variety.
  const rankNew = (c) => [
    c.letter && state.petitioners[c.pet.id]?.usedLetters.includes(c.letter.n) ? 1 : 0,
    c.letter.year,
  ];
  const newS = rng.shuffle(newC).sort((a, b) => rankNew(a)[0] - rankNew(b)[0] || rankNew(a)[1] - rankNew(b)[1]);
  const retS = rng.shuffle(retC);

  const picks = [];
  picks.push(...newS.slice(0, 7), ...retS.slice(0, 3)); // the intended mix (7 new + 3 returning)
  const rest = [...newS.slice(7), ...retS.slice(3)];
  while (picks.length < TERNA_SIZE && rest.length > 0) picks.push(rest.shift());

  // Supplement with fictional petitioners when history runs dry
  // (endless mode, or campaign mode once the historical pool is exhausted).
  while (picks.length < TERNA_SIZE) {
    const fic = spawnFictional(state, g, rng);
    if (!fic) break;
    picks.push(fic);
    // In campaign mode, only use fictional as a last resort to fill the terna;
    // in endless mode they are a regular source.
    if (state.mode === 'campaign' && picks.length >= TERNA_SIZE) break;
  }

  // Last resort: relax the closed-destination exclusion rather than fail,
  // and note it in the briefing.
  let relaxedClosed = false;
  if (picks.length < TERNA_SIZE) {
    const seen = new Set(picks.map((p) => p.pet.id));
    for (const pet of rng.shuffle(g.petitioners.filter((p) => !p.fictional))) {
      if (picks.length >= TERNA_SIZE) break;
      if (seen.has(pet.id)) continue;
      if (atDock.has(pet.id)) continue;
      const rec = state.petitioners[pet.id];
      const status = rec ? rec.status : STATUS.NEW;
      if (!TERNA_ELIGIBLE.includes(status) || rec?.archived) continue;
      const feat = featuredLetter(pet, rec || { usedLetters: [] }, year);
      if (!feat) continue;
      picks.push({ pet, letter: feat.letter, fromFuture: feat.fromFuture, dest: feat.letter.destination || pet.destination });
      relaxedClosed = true;
      seen.add(pet.id);
    }
  }

  // A thin year lays a thin stack: never crash for 1..TERNA_SIZE-1 writers.
  // Only a year with NO letters at all is an error.
  if (picks.length === 0) {
    throw new Error(`Cannot assemble the indipetae: no eligible petitioners in ${year}.`);
  }
  const cards = picks.slice(0, TERNA_SIZE).map(({ pet, letter, fromFuture }) => buildCard(g, state, pet, letter, fromFuture));
  return { cards, relaxedClosed };
}

/** Year briefing for the UI: resources, recent news, upcoming events. */
function buildBriefing(state, g, relaxedClosed) {
  const news = state.ledger
    .filter((e) => e.type === 'outcome' || e.type === 'event')
    .slice(-5)
    .reverse()
    .map((e) => e.note);
  if (!news.length) news.push('No word yet from those at sea. The General commends them to St. Francis Xavier.');
  const eventsUpcoming = g.events
    .filter((e) => e.year > state.year && e.year <= state.year + 3 && !state.firedEvents.includes(e.id))
    .sort((a, b) => a.year - b.year)
    .map((e) => `${e.year} — ${e.title}`);
  return {
    funds: state.resources.funds,
    berths: state.resources.berths,
    ships: state.resources.ships.length,
    shipNames: state.resources.ships.map((s) => s.name),
    missionNews: news,
    eventsUpcoming,
    relaxedClosed: !!relaxedClosed,
    missionRequests: missionRequests(state),
    novitiates: (state.novitiates || []).map((n) => ({
      destination: n.destination,
      name: destName(g, n.destination),
      foundedYear: n.foundedYear,
      danger: state.destState[n.destination]?.danger ?? null,
    })),
  };
}

/**
 * Rebuild the current year's briefing in place (e.g. after the General
 * spends from the mission chest between ternas). Does not touch the terna.
 * @param {object} state
 * @returns {object} the refreshed briefing
 */
export function refreshBriefing(state) {
  const g = ensureData();
  const briefing = buildBriefing(state, g, false);
  if (state.currentYear) state.currentYear.briefing = briefing;
  return briefing;
}

/**
 * Begin a year: produce the briefing and a terna of exactly 3 distinct
 * eligible petitioners.
 * @param {object} state
 * @returns {{year:number, briefing:object, terna:object[]}}
 */
export function startYear(state) {
  if (state.ended) throw campaignCompleteError();
  if (state.mode === 'campaign' && state.year > CAMPAIGN_END) {
    state.ended = true;
    throw campaignCompleteError();
  }
  if (state.currentTerna) {
    throw new Error('The indipetae are already awaiting your decision.');
  }
  const g = ensureData();
  const rng = mainRng(state);
  const { cards, relaxedClosed } = assembleTerna(state, g, rng);
  saveRng(state, rng);
  const briefing = buildBriefing(state, g, relaxedClosed);
  state.currentTerna = { year: state.year, cards };
  state.currentYear = { year: state.year, briefing, terna: cards, decided: false, decisionResult: null };
  return { year: state.year, briefing, terna: cards };
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

/** Grades for companion retinues: professed, father, scholastic, brother. */
export const COMPANION_GRADES = ['professed', 'father', 'scholastic', 'brother'];

/** Seal the current terna: approve any subset (0-3), redirect destinations.
 * @param {object} state @param {Array} approvals ({id, destination?, companions?}).
 * companions may be a number (legacy, counted as brothers) or {professed, father, scholastic, brother}.
 * @returns {{approved, denied, teams, report, scoreDelta}} */
export function decide(state, approvals) {
  const t = state.currentTerna;
  if (!t) throw new Error('No terna is awaiting decision.');
  if (!Array.isArray(approvals)) {
    throw new Error('decide: approvals must be an array of {id, destination}.');
  }
  const g = ensureData();
  const scoreBefore = state.score;
  const byId = new Map(t.cards.map((c) => [c.petitionerId, c]));
  const seen = new Set();
  const normalized = approvals.map((a) => {
    const id = a && a.id;
    const shipId = a && a.shipId ? String(a.shipId) : null;
    if (!id || !byId.has(id)) {
      throw new Error(`decide: "${id}" is not in the current terna.`);
    }
    if (seen.has(id)) throw new Error(`decide: "${id}" is listed twice.`);
    seen.add(id);
    const card = byId.get(id);
    const destination = (a.destination && isDestOpen(state, a.destination)) ? a.destination : card.destination;
    const companions = { professed: 0, father: 0, scholastic: 0, brother: 0 };
    let companionTotal = 0;
    if (a.companions != null) {
      if (typeof a.companions !== 'number' && typeof a.companions !== 'object') {
        throw new Error(`decide: companions for "${id}" must be a number or a grade breakdown.`);
      }
      if (typeof a.companions === 'number') {
        if (!Number.isInteger(a.companions) || a.companions < 0 || a.companions > rules.RESOURCES.COMPANION_MAX) {
          throw new Error(`decide: companions for "${id}" must be 0–${rules.RESOURCES.COMPANION_MAX}.`);
        }
        companions.brother = a.companions;
        companionTotal = a.companions;
      } else {
        for (const g of COMPANION_GRADES) {
          const v = a.companions[g] ?? 0;
          if (!Number.isInteger(v) || v < 0) throw new Error(`decide: companions.${g} for "${id}" must be a whole number ≥ 0.`);
          companions[g] = v;
          companionTotal += v;
        }
        if (companionTotal > rules.RESOURCES.COMPANION_MAX) {
          throw new Error(`decide: companions for "${id}" must total 0–${rules.RESOURCES.COMPANION_MAX}.`);
        }
      }
    }
    return { card, destination, companions, companionTotal, shipId };
  });

  // The seal: 30 scudi per approval. A missioning event draws on the chest.
  // Each approval also costs 1 energy: the General's attention is finite.
  const sealCost = normalized.length * rules.RESOURCES.SEAL_COST;
  if (normalized.length > 0) {
    spendEnergy(state, normalized.length, 'sealing approvals');
  }
  if (sealCost > 0) {
    if (state.resources.funds < sealCost) {
      throw new Error(`decide: the seal needs ${sealCost} scudi; the chest holds ${state.resources.funds}.`);
    }
    spendFunds(state, sealCost, 'seals');
  }

  // Mark featured letters as used (denied petitioners will bring a new letter next time).
  // A letter dated after the current year is shown early and does not consume the "unused" slot.
  for (const card of t.cards) {
    const rec = ensureRecord(state, card.petitionerId, card.fictional);
    if (card.letter && card.letter.year <= state.year && !rec.usedLetters.includes(card.letter.n)) {
      rec.usedLetters.push(card.letter.n);
    }
  }

  // Teams: approvals sharing a destination sail in company.
  const destGroups = new Map();
  for (const n of normalized) {
    if (!destGroups.has(n.destination)) destGroups.set(n.destination, []);
    destGroups.get(n.destination).push(n);
  }
  const teams = [];
  for (const [dest, members] of destGroups) {
    if (members.length >= rules.RESOURCES.TEAM_MIN_SIZE) {
      const teamId = `team-${state.year}-${++state.seq.team}`;
      teams.push({
        id: teamId,
        destination: dest,
        destinationName: destName(g, dest),
        members: members.map((m) => m.card.petitionerId),
        size: members.length,
      });
      for (const m of members) m.teamId = teamId;
    }
  }

  const approved = [];
  for (const n of normalized) {
    const { card, destination } = n;
    const finalDestName = destName(g, destination);
    const redirected = destination !== card.destination;
    const teamSize = destGroups.get(destination).length;
    const cRec = getRecord(state, card.petitionerId);
    cRec.status = STATUS.APPROVED;
    // entryYear baseline for years-in-Society.
    if (cRec.entryYear == null) cRec.entryYear = state.year;
    seedTrueEntryYear(state, card.petitionerId, state.year);
    enterSociety(state, card.petitionerId, 'approved');
    cRec.history.push({ year: state.year, decision: 'approved', destination });
    // He sails: no longer laboring in Europe.
    if (Array.isArray(state.europeanLabor)) {
      state.europeanLabor = state.europeanLabor.filter(
        (e) => e.petitionerId !== card.petitionerId);
    }
    if (!n.shipId && n.reserve === true) {
      // Reserved: explicitly held from Crew Review. Man labors in Europe, earmarked for the mission.
      if (!state.europeanLabor) state.europeanLabor = [];
      // Remove if already there (avoid duplicates)
      state.europeanLabor = state.europeanLabor.filter((e) => e.petitionerId !== card.petitionerId);
      state.europeanLabor.push({
        petitionerId: card.petitionerId,
        name: card.name,
        year: state.year,
        via: 'reserved',
        reservedFor: destination,
        reservedForName: finalDestName,
      });
    } else {
      enqueueAwaiting(state, {
        petitionerId: card.petitionerId,
        approvedYear: state.year,
        destination,
        status: 'awaiting',
        teamId: n.teamId || null,
        teamSize,
        companions: n.companionTotal || 0,
        companionGrades: n.companions,
        shipId: n.shipId || null,
      });
    }
    const reserveNote = (!n.shipId && n.reserve === true) ? `${card.name} is approved for ${finalDestName} and reserved — laboring in Europe until a ship is ready.` : null;
    addLedger(state, {
      year: state.year, type: 'decision',
      petitionerId: card.petitionerId, destination,
      decision: 'approved', status: STATUS.APPROVED,
      note: reserveNote || (redirected
        ? `${card.name} is approved and redirected to ${finalDestName} (petitioned for ${card.destinationName})${n.companionTotal ? `, taking ${n.companionTotal} ${n.companionTotal === 1 ? 'companion' : 'companions'}` : ''}.`
        : n.teamId
          ? `${card.name} is approved for ${finalDestName}, sailing in company with ${teamSize - 1} ${teamSize - 1 === 1 ? 'other' : 'others'}${n.companionTotal ? ` and ${n.companionTotal} ${n.companionTotal === 1 ? 'companion' : 'companions'}` : ''}.`
          : `${card.name} is approved for ${finalDestName} and enters the departure queue${n.companionTotal ? ` with ${n.companionTotal} ${n.companionTotal === 1 ? 'companion' : 'companions'}` : ''}.`),
    });
    approved.push({
      ...card,
      destination,
      destinationName: finalDestName,
      redirected,
      teamId: n.teamId || null,
      teamSize,
    });
  }

  const denied = [];
  for (const card of t.cards) {
    if (seen.has(card.petitionerId)) continue;
    const dRec = getRecord(state, card.petitionerId);
    dRec.status = STATUS.DENIED;
    dRec.deniedCount += 1;
    dRec.history.push({ year: state.year, decision: 'denied', destination: card.destination });
    // Fictional petitioners denied repeatedly lay down the petition and
    // leave the active pool (id + history persist; rolling population cap).
    let retired = '';
    if (dRec.fictional && dRec.deniedCount >= FIC_DENIAL_RETIREMENT) {
      archiveFictional(dRec);
      retired = ' He lays down his petition.';
    }
    addLedger(state, {
      year: state.year, type: 'decision',
      petitionerId: card.petitionerId, destination: card.destination,
      decision: 'denied', status: STATUS.DENIED,
      note: `${card.name} is denied${dRec.deniedCount > 1 ? ` (denied ${dRec.deniedCount} times)` : ''}; he remains to labor in Europe.${retired}`,
    });
    addEuropeanLabor(state, card.petitionerId, card.name, 'denied');
    denied.push(card);
  }

  // No points for sending men: the General is judged by fruit, not dispatches.
  // Score moves when voyage news arrives (see deliverNews) and through
  // lasting foundations (see foundNovitiate / resolveYear).
  state.stats.ternas += 1;
  state.stats.approvals += approved.length;
  state.stats.denials += denied.length;
  state.stats.teams += teams.length;
  state.currentTerna = null;

  const teamPhrases = teams.map((tm) => {
    const names = tm.members.map((id) => cardName(state, g, id));
    return `${names.join(', ')} sail in company for ${tm.destinationName}`;
  });
  const soloPhrases = approved
    .filter((c) => !c.teamId)
    .map((c) => `${c.name} sails for ${c.destinationName}`);
  const report = {
    year: state.year,
    approvedIds: approved.map((c) => c.petitionerId),
    deniedIds: denied.map((d) => d.petitionerId),
    teams: teams.map((tm) => ({
      ...tm,
      memberNames: tm.members.map((id) => cardName(state, g, id)),
    })),
    queueLength: state.queue.length,
    score: state.score,
    sealCost,
    funds: state.resources.funds,
    summary: approved.length === 0
      ? 'All three are denied; they may petition again.'
      : [...teamPhrases, ...soloPhrases].join('; ') + '.',
    detail:
      `${denied.length ? denied.map((d) => d.name).join(' and ') + (denied.length > 1 ? ' are' : ' is') + ' denied and may petition again. ' : ''}` +
      `The approved enter the departure queue; sailing depends on free hulls, berths, and the mission chest. ` +
      sealCost > 0 ? `The seal: ${sealCost} scudi.` : `The seal costs nothing.`,
  };
  const result = { approved, denied, teams: report.teams, report, scoreDelta: state.score - scoreBefore };
  if (state.currentYear) {
    state.currentYear.decided = true;
    state.currentYear.decisionResult = result;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Year resolution
// ---------------------------------------------------------------------------

/**
 * Commission additional sailing berths: spend from the mission chest to
 * expand yearly capacity. The General may do this at any time between
 * ternas (not mid-terna).
 * @param {object} state
 * @returns {{berths:number, funds:number, cost:number}}
 */
/**
 * Exhort the missions: the General's letter stirs zeal across the Society.
 * Costs 1 energy. All voyages departing this year get +1 to their d20 roll.
 * The bonus applies to the current year's departures only.
 */
export function exhortMissions(state) {
  spendEnergy(state, 1, 'exhorting the missions');
  if (state.currentTerna) {
    throw new Error('Finish deciding on the current terna first.');
  }
  state.exhortUntil = state.year;
  addLedger(state, {
    year: state.year, type: 'exhortation',
    note: 'The General writes to all missions, exhorting them to zeal (+1 to voyage rolls this year).',
  });
  return { exhortUntil: state.exhortUntil };
}

export function expandBerths(state) {
  spendEnergy(state, 1, 'expanding berths');
  if (state.currentTerna) {
    throw new Error('Finish deciding on the current terna first.');
  }
  const cost = rules.RESOURCES.BERTH_EXPANSION_COST;
  if (state.resources.funds < cost) {
    throw new Error(`Insufficient funds: need ${cost} ducats, have ${state.resources.funds}.`);
  }
  spendFunds(state, cost, 'berths');
  state.resources.berths += rules.RESOURCES.BERTH_EXPANSION_AMOUNT;
  addLedger(state, {
    year: state.year, type: 'expansion',
    note: `The General commissions an additional berth (+${rules.RESOURCES.BERTH_EXPANSION_AMOUNT} dock space, ${cost} ducats). Port capacity is now ${state.resources.berths} ships.`,
  });
  return {
    berths: state.resources.berths,
    funds: state.resources.funds,
    cost,
  };
}

/**
 * Charter an additional hull for the mission trade. A chartered ship joins
 * the pool permanently and is free to sail at once. The General may do this
 * at any time between ternas (not mid-terna).
 * @param {object} state
 * @returns {{ship:{id:string,name:string}, ships:number, funds:number, cost:number}}
 */
export function charterShip(state, tier = 'carrack') {
  const tierInfo = rules.RESOURCES.SHIP_TIERS[tier];
  if (!tierInfo) throw new Error(`charterShip: unknown tier "${tier}".`);
  spendEnergy(state, 1, `chartering a ${tierInfo.label.toLowerCase()}`);
  if (state.currentTerna) {
    throw new Error('Finish deciding on the current terna first.');
  }
  if (state.ended) throw campaignCompleteError();
  const cost = tierInfo.cost;
  if (state.resources.funds < cost) {
    throw new Error(`Insufficient funds: need ${cost} ducats, have ${state.resources.funds}.`);
  }
  spendFunds(state, cost, 'ships');
  const used = new Set(state.resources.ships.map((s) => s.name));
  const name = rules.RESOURCES.SPARE_SHIP_NAMES.find((n) => !used.has(n))
    || `Chartered ${tierInfo.label.toLowerCase()} ${state.resources.ships.length + 1}`;
  const ship = { id: `ship-${state.resources.ships.length + 1}`, name, tier, freeYear: 0 };
  state.resources.ships.push(ship);
  addLedger(state, {
    year: state.year, type: 'expansion',
    note: `The General charters a ${tierInfo.label.toLowerCase()}, the ${name} (${cost} ducats, range ${tierInfo.range}, capacity ${tierInfo.capacity}). ${state.resources.ships.length} hulls now serve the missions.`,
  });
  return { ship, ships: state.resources.ships.length, funds: state.resources.funds, cost };
}

/**
 * Assign a queued man to a specific ship for departure.
 * The ship must be free (in port) and have range for the man's destination.
 * If the ship is over capacity at departure, excess men (by assignment order)
 * stay in the queue. Assignment is just a preference, not a guarantee.
 * @param {object} state
 * @param {string} petitionerId
 * @param {string} shipId
 */
export function assignToShip(state, petitionerId, shipId) {
  const q = (state.queue || []).find((x) => x.petitionerId === petitionerId && x.status === 'awaiting');
  if (!q) throw new Error('Man is not in the departure queue.');
  const ship = (state.resources.ships || []).find((s) => s.id === shipId);
  if (!ship) throw new Error(`No ship with id "${shipId}".`);
  if ((ship.freeYear || 0) > state.year) throw new Error(`${ship.name} is at sea.`);
  // Check range
  const g = getGameData();
  const dest = g.destinations.find((d) => d.id === q.destination);
  const travel = dest?.travelYears ?? 2;
  const tierInfo = rules.RESOURCES.SHIP_TIERS[ship.tier || 'carrack'] || rules.RESOURCES.SHIP_TIERS.carrack;
  if (tierInfo.range < travel) {
    throw new Error(`${ship.name} (${tierInfo.label}, range ${tierInfo.range}) cannot reach ${dest?.name || q.destination} (needs range ${travel}).`);
  }
  q.shipId = shipId;
  q.assignedAt = state.year;
  return { petitionerId, shipId, shipName: ship.name };
}

/**
 * Auto-assign all unassigned queued men to ships.
 * Groups by destination, assigns to the smallest ship with sufficient range
 * that has capacity. Best-effort: men who don't fit stay unassigned.
 */
export function autoAssignShips(state) {
  const queue = (state.queue || []).filter((q) => q.status === 'awaiting' && !q.shipId && !q.held);
  if (!queue.length) return;
  const ships = (state.resources.ships || []).filter((s) => (s.freeYear || 0) <= state.year);
  const g = getGameData();
  const tiers = rules.RESOURCES.SHIP_TIERS;
  
  // Track used capacity per ship
  const used = {};
  for (const s of ships) used[s.id] = 0;
  // Count already-assigned
  for (const q of (state.queue || []).filter((x) => x.status === 'awaiting' && x.shipId)) {
    const size = 1 + (q.companions || 0);
    used[q.shipId] = (used[q.shipId] || 0) + size;
  }
  
  const partySize = (q) => {
    let n = 1;
    if (q.companionGrades && typeof q.companionGrades === 'object') {
      n += Object.values(q.companionGrades).reduce((a, b) => a + (b || 0), 0);
    } else {
      n += q.companions || 0;
    }
    return n;
  };
  
  const getTravel = (destId) => {
    let dest = null;
    if (g?.destinations) {
      dest = Array.isArray(g.destinations)
        ? g.destinations.find((d) => d.id === destId)
        : g.destinations[destId];
    }
    return dest?.travelYears ?? 2;
  };
  
  // Sort ships by capacity (smallest first) for efficient packing
  const sortedShips = [...ships].sort((a, b) => {
    const ta = tiers[a.tier || 'carrack'] || tiers.carrack;
    const tb = tiers[b.tier || 'carrack'] || tiers.carrack;
    return ta.capacity - tb.capacity;
  });
  
  for (const q of queue) {
    const travel = getTravel(q.destination);
    const size = partySize(q);
    // Find smallest ship with range and capacity
    for (const s of sortedShips) {
      const ti = tiers[s.tier || 'carrack'] || tiers.carrack;
      if (ti.range < travel) continue;
      if ((used[s.id] || 0) + size <= ti.capacity) {
        q.shipId = s.id;
        used[s.id] = (used[s.id] || 0) + size;
        break;
      }
    }
    // If no ship fits, q.shipId stays null (unassigned)
  }
}

/**
 * Remove a man's ship assignment (returns to auto-pack pool).
 */
export function unassignFromShip(state, petitionerId) {
  const q = (state.queue || []).find((x) => x.petitionerId === petitionerId && x.status === 'awaiting');
  if (!q) throw new Error('Man is not in the departure queue.');
  delete q.shipId;
  delete q.assignedAt;
  return { petitionerId };
}

/**
 * Hold a queued man at the dock (Tran 2026-10-19): he does not board even
 * when a ship is free — the General, not the queue order, decides who
 * waits. A held man labors in the port and earns his grade income until
 * released. Holding clears any ship assignment.
 */
export function setDockHold(state, petitionerId, held) {
  const q = (state.queue || []).find((x) => x.petitionerId === petitionerId && x.status === 'awaiting');
  if (!q) throw new Error('Man is not in the departure queue.');
  q.held = !!held;
  if (q.held) {
    delete q.shipId;
    delete q.assignedAt;
    q.note = 'held at dock';
  } else if (q.note === 'held at dock') {
    delete q.note;
  }
  return q;
}

/**
 * Found a novitiate — a house of formation — at an open mission.
 * A costly foundation, but formation steadies the mission: its danger
 * falls by one (never below 0). The foundation honors the General
 * (+score), and each operating novitiate yields +1 score every year.
 * The General may do this at any time between ternas (not mid-terna).
 * @param {object} state
 * @param {string} destinationId
 * @returns {{destination:string, destinationName:string, danger:number, funds:number, score:number}}
 */
export function foundNovitiate(state, destinationId) {
  if (state.currentTerna) {
    throw new Error('Finish deciding on the current terna first.');
  }
  if (state.ended) throw campaignCompleteError();
  const g = ensureData();
  const dest = g.destinations.find((d) => d.id === destinationId);
  if (!dest) throw new Error(`Unknown destination "${destinationId}".`);
  if (!isDestOpen(state, destinationId)) {
    throw new Error(`${dest.name || destinationId} is closed to missions.`);
  }
  if ((state.novitiates || []).some((n) => n.destination === destinationId)) {
    throw new Error(`A novitiate already stands at ${dest.name || destinationId}.`);
  }
  const cost = rules.RESOURCES.NOVITIATE_COST;
  if (state.resources.funds < cost) {
    throw new Error(`The mission chest holds ${state.resources.funds} scudi; a novitiate requires ${cost}.`);
  }
  spendFunds(state, cost, 'novitiates');
  if (!state.destState[destinationId]) state.destState[destinationId] = { danger: 1, access: 'open' };
  const st = state.destState[destinationId];
  st.danger = Math.max(0, (st.danger ?? dest.danger ?? 1) - 1);
  state.novitiates.push({ destination: destinationId, foundedYear: state.year });
  state.score = rules.addScore(state.score, rules.SCORE.NOVITIATE_FOUND_BONUS);
  trackScoreDelta(state, rules.SCORE.NOVITIATE_FOUND_BONUS);
  state.stats.novitiates += 1;
  addLedger(state, {
    year: state.year, type: 'novitiate', destination: destinationId,
    note: `A novitiate is founded at ${dest.name || destinationId}; formation steadies the mission (danger now ${st.danger}).`,
  });
  return {
    destination: destinationId,
    destinationName: dest.name || destinationId,
    danger: st.danger,
    funds: state.resources.funds,
    score: state.score,
  };
}

function applyEvent(state, g, ev) {
  for (const [destId, fx] of Object.entries(ev.effects || {})) {
    if (!state.destState[destId]) state.destState[destId] = { danger: 1, access: 'open' };
    if (typeof fx.danger === 'number') state.destState[destId].danger = fx.danger;
    if (fx.access) state.destState[destId].access = fx.access;
  }
  const parts = Object.entries(ev.effects || {}).map(
    ([destId, fx]) => `${destName(g, destId)}: danger ${fx.danger ?? '—'}, ${fx.access ?? '—'}`
  );
  addLedger(state, {
    year: state.year, type: 'event', eventId: ev.id,
    note: `${ev.year} — ${ev.title}.${parts.length ? ' ' + parts.join('; ') + '.' : ''}`,
  });
}

function deliverNews(state, g, voyage, outcomes) {
  const rec = getRecord(state, voyage.petitionerId);
  const petName = voyage.petitionerName || voyage.petitionerId;
  const dName = destName(g, voyage.destination);
  voyage.newsDelivered = true;
  // Transparent dice: the player sees the roll, DC, modifiers and degree.
  const rollNote = voyage.resolveRoll
    ? ' ' + dice.exposition({ ...voyage.resolveRoll, modifiers: voyage.resolveRoll.modifiers || [] })
    : '';
  const note = rules.counterfactualNote(voyage.outcome, petName, dName) + rollNote;
  // Fruit, not dispatches: the General's score moves when word comes back.
  // Diminishing returns: thriving beyond THRIVING_DIMINISH_AFTER at a single
  // mission gives reduced score. Encourages spreading men across missions.
  let fruitDelta = rules.SCORE.FRUIT[voyage.outcome] ?? 0;
  let diminishNote = '';
  if (voyage.outcome === 'thriving') {
    const st = missionStaff(state, voyage.destination);
    const priorThriving = st.thrivingCount || 0;
    if (priorThriving >= rules.SCORE.THRIVING_DIMINISH_AFTER) {
      fruitDelta = rules.SCORE.THRIVING_DIMINISHED;
      diminishNote = ` (diminishing returns: ${priorThriving + 1}th thriving at ${dName}, +${fruitDelta} instead of +${rules.SCORE.FRUIT.thriving})`;
    }
    st.thrivingCount = priorThriving + 1;
  }
  state.score = rules.addScore(state.score, fruitDelta);
  trackScoreDelta(state, fruitDelta);
  let returnNote = '';
  if (voyage.outcome === 'returned') {
    // The word of a return travels slowly: the man may have died of old
    // age while it was still at sea (mortality does not wait for news).
    // His death is already recorded — he does not take up labor in Europe.
    const recNow = (state.petitioners || {})[voyage.petitionerId];
    const gone = recNow && (recNow.status === STATUS.DECEASED || recNow.status === STATUS.DISMISSED);
    if (!gone) {
      addEuropeanLabor(state, voyage.petitionerId, petName, 'returned');
      // A failed voyage humbles or discourages, per the man's humility.
      const d = ensureDisposition(state, voyage.petitionerId);
      const hum = d.current.humility || 3;
      if (hum >= 4 && d.current.prudence < 5) {
        d.current.prudence += 1;
        returnNote = ' The failure has taught him caution.';
      } else if (hum <= 2 && d.current.zeal > 1) {
        d.current.zeal -= 1;
        returnNote = ' The failure has cooled his zeal.';
      }
    }
  }
  const entry = addLedger(state, {
    year: state.year, type: 'outcome',
    petitionerId: voyage.petitionerId, destination: voyage.destination,
    decision: 'approved', status: voyage.outcome,
    counterfactual: true, delta: fruitDelta,
    note: note + diminishNote + returnNote,
  });
  outcomes.push({
    voyageId: voyage.id,
    petitionerId: voyage.petitionerId,
    name: petName,
    destination: voyage.destination,
    destinationName: dName,
    outcome: voyage.outcome,
    result: voyage.outcome, // UI alias
    outcomeLabel: rules.OUTCOME_LABELS[voyage.outcome],
    text: note,
    delta: fruitDelta,
    historical: false,
    counterfactual: true,
    ledgerSeq: entry.seq,
    resolveRoll: voyage.resolveRoll || null,
  });
  // Resolved fictional petitioners leave the active pool (identity + history persist).
  if (rec.fictional) archiveFictional(rec);
}

/** Cap stored voyage detail: keep full records for unresolved + newest 150 resolved. */
function archiveVoyages(state) {
  const resolved = state.voyages
    .filter((v) => v.stage === 'arrived')
    .sort((a, b) => (b.resolvedYear || 0) - (a.resolvedYear || 0) || (a.id < b.id ? 1 : -1));
  for (const v of resolved.slice(150)) {
    if (!v.summarized) {
      v.summarized = true;
      delete v.petitionerName; // drop display detail; ids + outcome suffice
    }
  }
  // Bound the store itself: a summarized voyage whose man is gone (dead
  // or dismissed, rostered nowhere, his news long delivered) is pure
  // history — the ledger and the man's own record keep his story, so the
  // stub can go. Living men's voyages are never dropped: a stationed
  // man's arrival record is his place in the mission community.
  if (state.voyages.length > 1000) {
    const rostered = new Set();
    for (const st of Object.values(state.missions || {})) {
      for (const id of st.staffIds || []) rostered.add(id);
    }
    const droppable = state.voyages
      .filter((v) => {
        if (v.stage !== 'arrived' || !v.summarized || !v.newsDelivered) return false;
        if (rostered.has(v.petitionerId)) return false;
        const rec = (state.petitioners || {})[v.petitionerId];
        return rec && (rec.status === STATUS.DECEASED || rec.status === STATUS.DISMISSED || rec.status === 'apostate');
      })
      .sort((a, b) => (a.resolvedYear || a.arriveYear || 0) - (b.resolvedYear || b.arriveYear || 0));
    let excess = state.voyages.length - 1000;
    const drop = new Set();
    for (const v of droppable) {
      if (excess <= 0) break;
      drop.add(v);
      excess -= 1;
    }
    if (drop.size) state.voyages = state.voyages.filter((v) => !drop.has(v));
  }
}

/**
 * Resolve the current year: fire events, sail due departures, resolve
 * arrived voyages (outcomes), deliver delayed news, update resources.
 * @param {object} state
 * @returns {{outcomes:object[], eventsFired:object[], yearReport:object, score:number}}
 */
// ---------------------------------------------------------------------------
// State of the Society: a yearly report stored in the ledger. Four parts —
// the condition of the body, the consequences of decisions, the condition of
// governance, the burden of stewardship. A report, not a score.
// ---------------------------------------------------------------------------

/** Build and store the year's state-of-the-Society report. */
/**
 * Is this man currently serving as a provincial? Provincials are
 * administrators, not field laborers — they don't harvest fruits.
 */
export function isProvincial(state, petitionerId) {
  for (const prov of Object.values(state.provincials || {})) {
    if (prov && !prov.vacant && prov.petitionerId === petitionerId) return true;
  }
  return false;
}

/**
 * A man's fruit capacity from his disposition: 25 × (zeal + prudence).
 * Range: 50 (zeal 1, prudence 1) to 250 (zeal 5, prudence 5).
 * To whom much is given, much is expected.
 */
export function fruitCapacity(state, petitionerId, destId = null) {
  const cur = ensureDisposition(state, petitionerId).current;
  const zeal = cur.zeal || 3;
  const prudence = cur.prudence || 3;
  const mult = destId ? rules.fruitMultiplierFor(destId) : 1.0;
  return Math.round(25 * (zeal + prudence) * mult);
}

/**
 * Yearly fruit production. Each man's output = capacity × yearly variance
 * (60%-100%, seeded). Quota = 50% of capacity per man (Tran 2026-10-19,
 * was 75%), and it applies ONLY to Established and Core missions (capacity
 * 6+); Frontier missions, collapsed missions, and never-opened fields are
 * exempt. Miss quota after 2-year grace → -2 score.
 */
/**
 * The provincial governing a destination's region, if any.
 */
function provincialForDest(state, destId) {
  const g = getGameData();
  const dest = g ? (g.destinations || []).find((d) => d.id === destId) : null;
  if (!dest) return null;
  const regionId = DEST_REGION_TO_PROVINCE[dest.region] || 'europe';
  const prov = (state.provincials || {})[regionId];
  return (prov && !prov.vacant) ? prov : null;
}

export function produceFruits(state) {
  const byMission = {};
  let totalNew = 0;
  let quotaPenalty = 0;
  const GRACE_YEARS = 2;
  const PENALTY_PER_MISS = 2;
  const QUOTA_RATIO = 0.50;
  for (const destId of Object.keys(state.missions || {})) {
    const st = missionStaff(state, destId);
    // Quota tier (Tran 2026-10-19): only Established (capacity 6-8) and Core
    // (capacity 9+) missions answer for a quota. Frontier fields (capacity
    // <=5), collapsed missions, and never-opened fields are exempt.
    const dst = state.destState[destId] || {};
    const quotaApplies = (st.capacity || 5) >= 6 && !dst.collapsed && dst.access !== 'closed';
    // Provincials administer; they don't labor in the harvest.
    const men = missionCommunity(state, destId).filter((id) => !isProvincial(state, id));
    // Provincial execution virtues: zeal inspires (+10%), stability preserves (-5% decay),
    // adaptability boosts frontier (+15%).
    const prov = provincialForDest(state, destId);
    const pdis = prov && prov.petitionerId ? ensureDisposition(state, prov.petitionerId).current : null;
    const provZeal = pdis ? (pdis.zeal || 3) : 3;
    const provStab = pdis ? (pdis.stability || 3) : 3;
    const provAdapt = pdis ? (pdis.adaptability || 3) : 3;
    const g = getGameData();
    const dest = g ? (g.destinations || []).find((d) => d.id === destId) : null;
    const isFrontier = dest && dest.frontier;
    if (typeof st.foundedYear !== 'number') st.foundedYear = state.year;
    const age = state.year - st.foundedYear;
    if (!men.length) {
      if (quotaApplies && age >= GRACE_YEARS) {
        quotaPenalty += PENALTY_PER_MISS;
        byMission[destId] = { harvest: 0, decayed: 0, total: st.fruits, missedQuota: true };
      }
      continue;
    }
    let harvest = 0;
    let expected = 0;
    let prudenceSum = 0;
    for (const id of men) {
      const cap = fruitCapacity(state, id, destId);
      const variance = 0.6 + streamFor(state, 'fruits', id, String(state.year)).float() * 0.4;
      harvest += Math.round(cap * variance);
      expected += Math.round(cap * QUOTA_RATIO);
      const dcur = ensureDisposition(state, id).current;
      prudenceSum += dcur.prudence || 3;
      // Long field service: 5+ years at the mission tests patience.
      // Provincials administer; the field does not test them the same way.
      const v = (state.voyages || []).filter((x) => x.petitionerId === id).pop();
      const yearsInField = v && v.arriveYear ? state.year - v.arriveYear : 0;
      if (yearsInField >= 5 && !dcur._fieldTested && !isProvincial(state, id)) {
        dcur._fieldTested = true; // once per man, not yearly
        const pat = dcur.patience || 3;
        if (pat >= 4 && dcur.humility < 5) {
          dcur.humility += 1;
          recordHistory(state, id, { kind: 'formation', event: 'field',
            text: 'Five years in the field have humbled him.' });
        } else if (pat <= 2 && dcur.zeal > 1) {
          // Humility shields zeal from burnout.
          const fhum = dcur.humility || 3;
          if (fhum >= 4) {
            recordHistory(state, id, { kind: 'formation', event: 'field',
              text: 'Five years in the field have tested him; his humility sustains him.' });
          } else {
            dcur.zeal -= 1;
            recordHistory(state, id, { kind: 'formation', event: 'field',
              text: 'Five years in the field have worn down his zeal.' });
          }
        }
      }
    }
    const scaleMult = men.length >= 6 ? 1.5 : men.length >= 3 ? 1.2 : 1.0;
    harvest = Math.round(harvest * scaleMult);
    // Zeal: graduated — 5 inspires most, 1 demoralizes most.
    if (provZeal === 5) harvest = Math.round(harvest * 1.15);
    else if (provZeal === 4) harvest = Math.round(harvest * 1.10);
    else if (provZeal === 2) harvest = Math.round(harvest * 0.90);
    else if (provZeal === 1) harvest = Math.round(harvest * 0.85);
    // Adaptability: graduated frontier impact.
    if (isFrontier && provAdapt === 5) harvest = Math.round(harvest * 1.22);
    else if (isFrontier && provAdapt === 4) harvest = Math.round(harvest * 1.15);
    else if (isFrontier && provAdapt === 2) harvest = Math.round(harvest * 0.85);
    else if (isFrontier && provAdapt === 1) harvest = Math.round(harvest * 0.78);
    const avgPrudence = prudenceSum / men.length;
    let decayRate = avgPrudence >= 4 ? 0.05 : avgPrudence <= 2 ? 0.20 : 0.10;
    // Stability: graduated preservation.
    if (provStab === 5) decayRate = Math.max(0, decayRate - 0.075);
    else if (provStab === 4) decayRate = Math.max(0, decayRate - 0.05);
    else if (provStab === 2) decayRate = Math.min(1, decayRate + 0.05);
    else if (provStab === 1) decayRate = Math.min(1, decayRate + 0.075);
    const decayed = Math.round(st.fruits * decayRate);
    st.fruits = Math.max(0, st.fruits - decayed + harvest);
    const missedQuota = quotaApplies && age >= GRACE_YEARS && harvest < expected;
    if (missedQuota) quotaPenalty += PENALTY_PER_MISS;
    byMission[destId] = { harvest, decayed, total: st.fruits, missedQuota, expected };
    totalNew += harvest;
  }
  return { totalNew, byMission, quotaPenalty };
}

export function buildSocietyReport(state, y, outcomes, statsBefore, fruits = null) {
  const deaths = (state.stats?.deaths || 0) - (statsBefore.deaths || 0);
  const illnesses = (state.stats?.illnesses || 0) - (statsBefore.illnesses || 0);
  const voyageOutcomes = {};
  for (const o of outcomes || []) {
    if (o && o.outcome) voyageOutcomes[o.outcome] = (voyageOutcomes[o.outcome] || 0) + 1;
  }
  const inTransit = (state.voyages || []).filter((v) => v.stage === 'transit').length;
  const awaiting = (state.queue || []).length;
  const inEurope = (state.europeanLabor || []).length;
  const inFormation = (state.europeanLabor || []).filter((e) => e.formation && e.formation.until > y).length;
  let stationed = 0;
  for (const d of (getGameData()?.destinations || [])) {
    const mst = missionStaff(state, d.id);
    stationed += (mst.fathers || 0) + (mst.coadjutors || 0) + (mst.brothers || 0);
  }
  const reqLedger = (state.ledger || []).filter((e) => e.year === y && e.type === 'provincial-request');
  const answered = reqLedger.filter((e) => e.decision === 'answered').length;
  const declined = reqLedger.filter((e) => e.decision === 'declined').length;
  const pendingReqs = Object.keys(state.provincialRequests || {}).length;
  const vacantSees = PROVINCIAL_REGIONS.filter((r) => state.provincials?.[r.id]?.vacant).length;
  const successions = (state.ledger || []).filter((e) => e.year === y && e.type === 'provincial'
    && /take office|has died/.test(e.text || '')).length;
  const fin = (state.financeYears || {})[y] || { income: {}, expenses: {} };
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);

  const lines = [
    `The Society numbers ${state.society || 0} souls; ${state.available || 0} men can be spared for the missions.`,
    `${inEurope} labor in Europe (${inFormation} in formation); ${stationed} stand at the missions; ${inTransit} are at sea and ${awaiting} await passage.`,
  ];
  const cons = [];
  if (voyageOutcomes.thriving) cons.push(`${voyageOutcomes.thriving} reached their missions`);
  if (voyageOutcomes.returned) cons.push(`${voyageOutcomes.returned} turned back`);
  if (voyageOutcomes.ill) cons.push(`${voyageOutcomes.ill} came home ill`);
  if (deaths) cons.push(`${deaths} died`);
  if (illnesses) cons.push(`${illnesses} fell ill`);
  lines.push(cons.length ? `This year's voyages: ${cons.join('; ')}.` : 'No voyages resolved this year.');
  const gov = [];
  if (answered) gov.push(`${answered} provincial request${answered === 1 ? '' : 's'} answered`);
  if (declined) gov.push(`${declined} declined`);
  if (pendingReqs) gov.push(`${pendingReqs} awaiting answer`);
  if (successions) gov.push(`${successions} provincial succession${successions === 1 ? '' : 's'}`);
  if (vacantSees) gov.push(`${vacantSees} see${vacantSees === 1 ? '' : 's'} vacant`);
  lines.push(gov.length ? `Governance: ${gov.join('; ')}.` : 'Governance: quiet.');
  lines.push(`The chest took in ${sum(fin.income)} scudi and paid out ${sum(fin.expenses)}; ${state.resources?.funds || 0} remain.`);

  const report = {
    year: y, type: 'society-report',
    text: `State of the Society, anno ${y}: ${lines.join(' ')}`,
    detail: { deaths, illnesses, voyageOutcomes, inTransit, awaiting, inEurope, inFormation,
      stationed, answered, declined, pendingReqs, vacantSees, successions,
      income: fin.income, expenses: fin.expenses, funds: state.resources?.funds || 0,
      score: state.score },
  };
  addLedger(state, { year: y, type: 'society-report', text: report.text, detail: report.detail });
  return report;
}

export function resolveYear(state, opts = {}) {
  if (state.currentTerna) {
    throw new Error('An undecided terna is pending.');
  }
  if (state.ended) throw campaignCompleteError();
  const g = ensureData();
  const rng = mainRng(state);
  const y = state.year;
  const statsBefore = { deaths: state.stats?.deaths || 0, illnesses: state.stats?.illnesses || 0 };

  // 0. Mission transit arrivals: men sent in prior years reach their missions.
  if (state.missionTransit) {
    for (const destId of Object.keys(state.missionTransit)) {
      const arrivals = state.missionTransit[destId] || [];
      const arrived = arrivals.filter((t) => t.arrivalYear <= y);
      const pending = arrivals.filter((t) => t.arrivalYear > y);
      if (arrived.length) {
        const mst = missionStaff(state, destId);
        for (const t of arrived) {
          for (const [grade, n] of Object.entries(t.grades || {})) {
            mst[grade] = (mst[grade] || 0) + n;
            // Every man a profile (Tran 2026-10-20): legacy abstract
            // arrivals (men sent before the ships-only rule) step ashore
            // as real named men with profiles and arrival records.
            for (let i = 0; i < n; i++) mintMissionMan(state, destId, grade, y);
          }
        }
        const totalArrived = arrived.reduce((s, t) => s + Object.values(t.grades || {}).reduce((a, b) => a + b, 0), 0);
        addLedger(state, { year: y, type: 'transit-arrival',
          text: `${totalArrived} men arrive at ${(getGameData().destinations.find((d) => d.id === destId) || {}).name || destId}.` });
      }
      if (pending.length) state.missionTransit[destId] = pending;
      else delete state.missionTransit[destId];
    }
  }

  // 1. Historical events fire on their dates and mutate destState.
  const eventsFired = [];
  for (const ev of g.events.filter((e) => e.year === y && !state.firedEvents.includes(e.id))) {
    applyEvent(state, g, ev);
    state.firedEvents.push(ev.id);
    eventsFired.push({
      id: ev.id, year: ev.year, title: ev.title, effects: ev.effects,
      text: ev.description || ev.title, historical: true, counterfactual: false,
    });
  }

  // 2. Departures from the queue, oldest approval first.
  //    Binding constraints, in order: free hulls, berths, men to spare, funds.
  //    Each hull carries up to SHIP_CAPACITY men for ONE destination per
  //    sailing, then is busy for the voyage's travel years. Men bound for the
  //    same mission share hulls — teams sail together.
  const departures = [];
  // Model B: berths = static port capacity (ships that can outfit simultaneously)
  let berths = state.resources.berths || 0;
  const ships = Array.isArray(state.resources.ships) ? state.resources.ships : [];
  for (const q of state.queue) {
    if (q.status === 'awaiting' && q.held) q.note = 'held at dock';
  }
  const awaiting = state.queue
    .filter((q) => q.status === 'awaiting' && !q.held)
    .sort((a, b) => a.approvedYear - b.approvedYear);
  // Group by destination, preserving oldest-approval order of first appearance.
  const groups = new Map();
  for (const q of awaiting) {
    if (!groups.has(q.destination)) groups.set(q.destination, []);
    groups.get(q.destination).push(q);
  }
  // Ships sail to ONE destination per year. The packed set is shared across
  // all destinations so a ship can't be assigned twice.
  const packed = new Set(); // ships given a sailing this year (all destinations)
  for (const [destId, men] of groups) {
    const dest = g.destinations.find((d) => d.id === destId);
    const travel = dest?.travelYears ?? rules.defaultTravelYears();
    // Ship tiers: filter by range, use per-tier capacity
    const tierInfo = (ship) => rules.RESOURCES.SHIP_TIERS[ship.tier || 'carrack'] || rules.RESOURCES.SHIP_TIERS.carrack;
    const shipRange = (ship) => tierInfo(ship).range;
    const shipCap = (ship) => tierInfo(ship).capacity;
    let idx = 0;
    let ship = null; // ship currently being packed for this destination
    const aboard = []; // {q, ship, comps}
    while (idx < men.length) {
      if (berths <= 0) {
        for (; idx < men.length; idx++) men[idx].note = 'delayed: no berths free';
        break;
      }
      const q = men[idx];
      const avail = state.available || 0;
      if (avail < 1) {
        q.note = 'delayed: no men to spare';
        idx += 1;
        continue;
      }
      // Companions are capped by what can be spared AND by the hull — never
      // by an arbitrary per-man rule. The shortfall is honest: the voyage
      // sails with fewer and the record says so.
      const comps = Math.min(q.companions || 0, rules.RESOURCES.COMPANION_MAX, avail - 1);
      const party = 1 + comps; // souls this retinue needs aboard
      // Companion cost by grade (from the approved breakdown)
      let compCost = 0;
      const grades = q.companionGrades || {};
      const gradeCost = rules.RESOURCES.COMPANION_GRADE_COST || {};
      for (const [g, n] of Object.entries(grades)) {
        compCost += (n || 0) * (gradeCost[g] || rules.RESOURCES.COMPANION_COST);
      }
      // Fallback: if no grade breakdown, use flat rate for the count
      if (compCost === 0 && comps > 0) compCost = comps * rules.RESOURCES.COMPANION_COST;
      const cost = rules.RESOURCES.DEPARTURE_COST + compCost;
      if (state.resources.funds < cost) {
        q.note = 'delayed: insufficient funds';
        idx += 1;
        continue;
      }
      const curCap = ship ? shipCap(ship) : 0;
      if (!ship || (ship.used || 0) + party > curCap) {
        // Model B: each ship packed occupies one berth. Check before selecting.
        if (berths <= 0) {
          for (; idx < men.length; idx++) men[idx].note = 'delayed: no berths free';
          break;
        }
        // If the man has a ship assignment, try that ship first.
        // (If it doesn't fit, the man stays in queue — assignment is a preference.)
        if (q.shipId) {
          const assigned = ships.find((s) => s.id === q.shipId && (s.freeYear || 0) <= y && !packed.has(s)); // range not checked: punching up allowed (penalty at voyage)
          // A ship not yet packed THIS year starts empty — s.used is last
          // voyage's load and must not be read as current occupancy.
          const assignedLoad = packed.has(assigned) ? (assigned?.used || 0) : 0;
          if (assigned && assignedLoad + party <= shipCap(assigned)) {
            ship = assigned;
            if (!packed.has(ship)) {
              ship.used = 0;
              packed.add(ship);
              berths -= 1;
            }
          } else if (assigned) {
            // Assigned ship doesn't have room — man stays in queue
            q.note = `delayed: ${assigned.name} full`;
            idx += 1;
            continue;
          }
          // If assigned ship not available, fall through to auto-pack
        }
        // Select a ship not already packed this year. Using !packed.has(s)
        // (not s !== ship) prevents re-selecting a ship that was already
        // filled earlier in this packing operation, which would reset its
        // used counter and exceed capacity.
        if (!ship || (ship.used || 0) + party > shipCap(ship)) {
          ship = ships.find((s) => (s.freeYear || 0) <= y && !packed.has(s) && shipRange(s) >= travel);
        }
        if (!ship) {
          // Last resort (Tran 2026-10-19): punch up. If no free hull can
          // reach, the best-ranged free hull sails beyond its reach — the
          // voyage takes the standing -3-per-step penalty and the sinking
          // risk — rather than men waiting forever for a ship the fleet
          // does not own. Only a port with no free hull at all still waits.
          const free = ships.filter((s) => (s.freeYear || 0) <= y && !packed.has(s));
          if (free.length) {
            ship = free.sort((a, b) => shipRange(b) - shipRange(a) || shipCap(b) - shipCap(a))[0];
          }
        }
        if (!ship) {
          for (; idx < men.length; idx++) men[idx].note = 'delayed: no hulls free';
          break;
        }
        ship.used = 0;
        packed.add(ship);
        berths -= 1; // one berth per ship outfitting
      }
      spendFunds(state, cost, 'voyages');
      // The man and his companions leave the mission-eligible pool.
      state.available = avail - (1 + comps);
      if (comps < (q.companions || 0)) q.spareShortfall = (q.companions || 0) - comps;
      q.embarked = comps; // companions who actually sailed (may be fewer than requested)
      ship.used += party;
      packed.add(ship);
      aboard.push({ q, ship, comps });
      idx += 1;
    }
    for (const s of packed) {
      s.freeYear = y + travel;
      s.lastDestination = destId;
    }
    if (aboard.length) {
      // Team size reflects ACTUAL departure composition: men sailing on the
      // same hull are truly "in company." The approval-group size (q.teamSize)
      // is wrong when departures split across ships or years.
      const shipmates = new Map();
      for (const { ship } of aboard) {
        shipmates.set(ship.id, (shipmates.get(ship.id) || 0) + 1);
      }
      for (const { q, ship: hull, comps } of aboard) {
        // Prefer the queue entry's name (deployment members carry their
        // europeanLabor name); terna sailors fall back to the card name.
        const pname = q.petitionerName || cardName(state, g, q.petitionerId);
        const actualTeamSize = shipmates.get(hull.id) || 1;
        const voyage = {
          id: `voy-${++state.seq.voyage}`,
          petitionerId: q.petitionerId,
          petitionerName: pname,
          name: pname, // UI alias
          destination: q.destination,
          departYear: y,
          travelYears: travel,
          arriveYear: y + travel,
          newsYear: y + travel + (rng.chance(0.5) ? 1 : 0), // news arrives +0–1 years after arrival
          stage: 'transit',
          status: 'enroute', // UI alias for the debug panel
          outcome: null,
          resolvedYear: null,
          newsDelivered: false,
          teamId: q.teamId || null,
          teamSize: actualTeamSize,
          companions: comps,
          companionGrades: q.companionGrades || {},
          shipId: hull.id,
          shipName: hull.name,
          shipTier: hull.tier || 'carrack',
          deploymentId: q.deploymentId || null, // collective deployment lineage, if any
        };
        state.voyages.push(voyage);
        recordDeploymentVoyage(state, voyage);
        q.status = 'departed';
        q.voyageId = voyage.id;
        const rec = getRecord(state, q.petitionerId);
        rec.status = STATUS.IN_TRANSIT;
        rec.voyages.push(voyage.id);
        state.stats.departures += 1;
        const inCompany = actualTeamSize >= rules.RESOURCES.TEAM_MIN_SIZE;
        const compNote = comps ? `, with ${comps} ${comps === 1 ? 'companion' : 'companions'}` : '';
        const shortNote = q.spareShortfall ? ` (only ${comps} could be spared)` : '';
        addLedger(state, {
          year: y, type: 'departure',
          petitionerId: q.petitionerId, destination: q.destination,
          decision: 'approved', status: STATUS.IN_TRANSIT,
          note: inCompany
            ? `${pname} sails for ${destName(g, q.destination)} aboard the ${hull.name}${compNote}${shortNote}, in company with ${actualTeamSize - 1} ${actualTeamSize - 1 === 1 ? 'other' : 'others'} (voyage ${voyage.id}, ~${travel} years).`
            : `${pname} sails for ${destName(g, q.destination)} aboard the ${hull.name}${compNote}${shortNote} (voyage ${voyage.id}, ~${travel} years).`,
        });
        departures.push({
          voyageId: voyage.id, petitionerId: q.petitionerId,
          name: pname, destination: q.destination,
          destinationName: destName(g, q.destination), arriveYear: voyage.arriveYear,
          teamId: q.teamId || null, teamSize: q.teamSize || 1,
          shipName: hull.name,
        });
      }
    }
  }
  state.queue = state.queue.filter((q) => q.status === 'awaiting');

  // The Engine's intention for the Society (Tran 2026-10-19): the Masses
  // raise every man's zeal for ONE year only. Last year's blessing lifts
  // first; this year's is then laid on if the intention is still the Society.
  // Lift last year's blessing exactly (each man lost only what he gained).
  if (state.appliedSocietyZeal && state.appliedSocietyZeal.added) {
    for (const [pid, added] of Object.entries(state.appliedSocietyZeal.added)) {
      const rec = state.petitioners[pid];
      if (!rec || rec.status === 'deceased' || rec.status === 'dismissed' || rec.status === 'apostate') continue;
      const d = ensureDisposition(state, pid);
      if (d && d.current && typeof d.current.zeal === 'number') {
        d.current.zeal = Math.max(1, d.current.zeal - added);
      }
    }
    state.appliedSocietyZeal = null;
  }
  if (state.intention && state.intention.target === 'society') {
    const zb = engineBonus(state);
    if (zb > 0) {
      const added = {};
      for (const pid of Object.keys(state.petitioners || {})) {
        const rec = state.petitioners[pid];
        if (rec.status === 'deceased' || rec.status === 'dismissed' || rec.status === 'apostate') continue;
        const d = ensureDisposition(state, pid);
        if (d && d.current && typeof d.current.zeal === 'number') {
          const gain = Math.min(6, d.current.zeal + zb) - d.current.zeal;
          if (gain > 0) {
            d.current.zeal += gain;
            added[pid] = gain;
          }
        }
      }
      state.appliedSocietyZeal = { year: state.year, added };
    }
  }
  // 3. Voyages due this year arrive; outcomes resolve; news delivered when due.
  const outcomes = [];
  for (const v of state.voyages.filter((v) => v.stage === 'transit' && v.arriveYear <= y)) {
    const danger = Math.max(0, Math.min(3, Math.round(state.destState[v.destination]?.danger ?? 1)));
    const inCompany = (v.teamSize || 1) >= rules.RESOURCES.TEAM_MIN_SIZE;
    const compMod = Math.min(v.companions || 0, rules.RESOURCES.COMPANION_MOD_CAP);
    const staffBonus = missionVoyageBonus(state, v.destination);
    const staffStrength = staffBonus > 0 ? missionStrength(missionStaff(state, v.destination)) : 0;
    // Isolated stream: resolving this voyage can never perturb any other roll.
    // Punching up: ship going beyond its range takes a penalty
    let punchUpMod = 0;
    if (v.shipTier) {
      const tierRange = (rules.RESOURCES.SHIP_TIERS[v.shipTier] || {}).range || 2;
      const dest = g.destinations.find ? g.destinations.find((d) => d.id === v.destination) : g.destinations[v.destination];
      const travel = dest?.travelYears ?? 2;
      const over = travel - tierRange;
      if (over > 0) {
        punchUpMod = over * -3; // -3 per range step over
      }
    }
    const check = dice.d20check(streamFor(state, 'voyage', v.id), {
      dc: rules.VOYAGE_DC,
      modifiers: [
        ...(punchUpMod < 0 ? [{ label: `punching above range (${v.shipTier})`, value: punchUpMod }] : []),
        ...(danger > 0 ? [{ label: `peril of ${destName(g, v.destination)} (${danger})`, value: danger * rules.VOYAGE_DANGER_MOD }] : []),
        ...(inCompany ? [{ label: 'sailing in company', value: rules.VOYAGE_TEAM_MOD }] : []),
        ...((state.zealUntil || 0) >= y ? [{ label: 'zeal of the missions', value: rules.VETERAN.ZEAL_MOD }] : []),
        ...((state.exhortUntil || 0) >= y ? [{ label: "the General's exhortation", value: 1 }] : []),
        ...(compMod > 0 ? [{ label: `${compMod} ${compMod === 1 ? 'companion' : 'companions'}`, value: compMod }] : []),
        ...(staffBonus > 0 ? [{ label: `a strengthened mission (${staffStrength} strength)`, value: staffBonus }] : []),
        ...(intentionVoyageMod(state, v.destination) > 0 ? [{ label: 'the Masses of the Society', value: intentionVoyageMod(state, v.destination) }] : []),
        ...dispositionVoyageMods(state, v.petitionerId),
      ],
    });
    let outcome = rules.VOYAGE_DEGREE_OUTCOMES[check.degree];
    // A man who died aboard (old age, disease) cannot arrive, return, or
    // fall ill — his voyage resolves as deceased (he died at sea).
    const preRec = state.petitioners[v.petitionerId];
    if (preRec && preRec.status === STATUS.DECEASED && outcome !== 'deceased') {
      outcome = 'deceased';
    }
    v.resolveRoll = {
      roll: check.roll, total: check.total, dc: check.dc,
      modifiers: check.modifiers, degree: check.degree, danger,
    };
    v.stage = 'arrived';
    v.status = 'arrived';
    v.outcome = outcome;
    v.resolvedYear = y;
    const rec = getRecord(state, v.petitionerId);
    recordArrival(state, g, v);
    rec.status =
      outcome === 'deceased' ? STATUS.DECEASED
      : outcome === 'returned' ? STATUS.RETURNED
      : outcome === 'ill' ? STATUS.ILL
      : STATUS.ACTIVE;
    if (outcome === 'deceased') purgeVowsState(state, v.petitionerId);
    state.stats.arrivals += 1;
    if (outcome === 'deceased') {
      state.stats.deaths += 1;
      state.society = Math.max(0, (state.society || 0) - 1);
      // Ship sinks if it was punching above its range
      if (punchUpMod < 0 && v.shipId) {
        const shipIdx = (state.resources.ships || []).findIndex((s) => s.id === v.shipId);
        if (shipIdx >= 0) {
          const sunk = state.resources.ships[shipIdx];
          sunk.sunk = true;
          sunk.sunkYear = y;
          // Remove from active fleet (keep record)
          state.resources.ships.splice(shipIdx, 1);
          v.shipSunk = true;
          // Add to news/log
          if (!state.sunkenShips) state.sunkenShips = [];
          state.sunkenShips.push({ name: sunk.name, tier: sunk.tier, year: y, destination: v.destination });
        }
      }
    }
    if (outcome === 'returned') {
      state.stats.returns += 1;
      state.available = (state.available || 0) + 1;
    }
    if (outcome === 'ill') {
      state.stats.illnesses += 1;
      // Ill survivors remain in the personnel system: they are in Europe
      // recovering, not stationed at the mission, not available for dispatch.
      const illName = v.petitionerName || cardName(state, g, v.petitionerId);
      const illRec = addEuropeanLabor(state, v.petitionerId, illName, 'ill');
      illRec.ill = true;
      illRec.illYear = y;
    }
    if (outcome === 'reassigned') state.stats.reassignments += 1;
    if (outcome === 'thriving') {
      state.stats.thriving += 1;
      staffArrival(state, v);
    }
    // Observed behavior — simulated, labeled as such, never as evidence.
    const pname = v.petitionerName || cardName(state, g, v.petitionerId);
    const dName = destName(g, v.destination);
    if (outcome === 'ill') observe(state, v.petitionerId, `Bore a grievous illness on the voyage to ${dName} (observed ${y}).`);
    else if (outcome === 'thriving') observe(state, v.petitionerId, `Reached ${dName} and labored fruitfully (observed ${y}).`);
    else if (outcome === 'returned') observe(state, v.petitionerId, `Turned back from ${dName}; his account moves the brethren (observed ${y}).`);
    if (y >= v.newsYear) deliverNews(state, g, v, outcomes);
  }
  for (const v of state.voyages.filter((v) => v.stage === 'arrived' && !v.newsDelivered && v.newsYear <= y)) {
    deliverNews(state, g, v, outcomes);
  }

  // 3b. Veteran returns: a man thriving in the mission may come home after
  // years of service. His homecoming stirs zeal for the missions — a bonus
  // to voyage checks for a few years — and scores for the fruit of testimony.
  // Isolated stream per voyage: unrelated rolls never perturb a homecoming.
  for (const v of state.voyages.filter((v) => v.outcome === 'thriving' && !v.veteranReturned)) {
    const vrec = (state.petitioners || {})[v.petitionerId];
    if (vrec && (vrec.status === STATUS.DECEASED || vrec.status === STATUS.DISMISSED)) {
      v.veteranReturned = true; // he died or left in the field; no homecoming
      continue;
    }
    const yearsServed = y - (v.resolvedYear ?? v.arriveYear);
    if (yearsServed < rules.VETERAN.MIN_YEARS) continue;
    // Include the year in the stream label: a fresh stream per call would
    // otherwise return the same draw every year (15% in year 3 or never).
    if (!streamFor(state, 'veteran', v.id, String(y)).chance(rules.VETERAN.YEARLY_CHANCE)) continue;
    v.veteranReturned = true;
    v.veteranYear = y;
    const pname = v.petitionerName || cardName(state, g, v.petitionerId);
    const dName = destName(g, v.destination);
    state.score = rules.addScore(state.score, rules.VETERAN.SCORE);
    trackScoreDelta(state, rules.VETERAN.SCORE);
    state.zealUntil = Math.max(state.zealUntil || 0, y + rules.VETERAN.ZEAL_YEARS);
    // He leaves the mission's stationed strength (and his companions with
    // him) — names as well as counts. Previously only the counts moved, so
    // a veteran was simultaneously home in Europe and still rostered at
    // his mission, where he kept facing its disease and persecution.
    releaseVoyageStation(state, v);
    addEuropeanLabor(state, v.petitionerId, pname, 'veteran');
    state.available = (state.available || 0) + 1; // he rejoins the mission-eligible pool
    observe(state, v.petitionerId, `Came home a veteran after ${yearsServed} years in ${dName}; his testimony kindles zeal (observed ${y}).`);
    const rec = getRecord(state, v.petitionerId);
    rec.status = STATUS.RETURNED;
    const note = `${pname} has returned to Europe after ${yearsServed} years laboring in ${dName}; his account of the harvest stirs zeal for the missions.`;
    const entry = addLedger(state, {
      year: y, type: 'veteran',
      petitionerId: v.petitionerId, destination: v.destination,
      decision: 'approved', status: 'veteran',
      counterfactual: true, delta: rules.VETERAN.SCORE,
      note,
    });
    outcomes.push({
      voyageId: v.id,
      petitionerId: v.petitionerId,
      name: pname,
      destination: v.destination,
      destinationName: dName,
      outcome: 'veteran',
      result: 'thriving', // UI alias: rendered with the thriving style
      outcomeLabel: 'Veteran homecoming',
      text: note,
      delta: rules.VETERAN.SCORE,
      historical: false,
      counterfactual: true,
      ledgerSeq: entry.seq,
      resolveRoll: null,
    });
  }

  // 4. Resources: yearly income, Society intake, and each operating novitiate bears fruit.
  gainFunds(state, rules.RESOURCES.YEARLY_INCOME, 'subsidy');
  // Domestic assignments contribute to the chest.
  const domesticFunds = domesticYearlyFunds(state);
  if (domesticFunds > 0) {
    gainFunds(state, domesticFunds, 'domestic');
    state.ledger.unshift({
      seq: ++state.seq.ledger, year: y, type: 'domestic',
      text: `Domestic service contributed ${domesticFunds} scudi to the chest.`,
    });
  }
  const missionFunds = missionYearlyFunds(state);
  if (missionFunds > 0) {
    gainFunds(state, missionFunds, 'missions');
    state.ledger.unshift({
      seq: ++state.seq.ledger, year: y, type: 'missions',
      text: `The missions remitted ${missionFunds} scudi to the chest.`,
    });
  }
  const dockFunds = dockYearlyFunds(state);
  if (dockFunds > 0) {
    gainFunds(state, dockFunds, 'dock');
    state.ledger.unshift({
      seq: ++state.seq.ledger, year: y, type: 'dock',
      text: `The men held at dock earned ${dockFunds} scudi laboring in the port.`,
    });
  }
  state.society = (state.society || 0) + rules.RESOURCES.SOCIETY_YEARLY_INTAKE;
  state.available = (state.available || 0)
    + Math.round(rules.RESOURCES.SOCIETY_YEARLY_INTAKE * rules.RESOURCES.MISSION_PCT);
  if ((state.novitiates || []).length) {
    const novYearly = state.novitiates.length * rules.SCORE.NOVITIATE_YEARLY;
    state.score = rules.addScore(state.score, novYearly);
    trackScoreDelta(state, novYearly);
  }

  // 4a. Mission upkeep: a high-capacity mission costs scudi every year to sustain.
  let upkeep = 0;
  for (const id of Object.keys(state.missions || {})) upkeep += missionUpkeep(missionStaff(state, id));
  if (upkeep > 0) {
    const paid = Math.min(upkeep, state.resources.funds);
    spendFunds(state, paid, 'upkeep');
    state.ledger.unshift({
      seq: ++state.seq.ledger, year: y, type: 'upkeep',
      text: paid >= upkeep
        ? `Sustained the missions: ${upkeep} scudi of provisions and stipends.`
        : `The missions wanted ${upkeep} scudi; the chest could bear only ${paid}.`,
    });
  }

  // 4b. Formation: men whose year of formation ends now complete it.
  completeFormations(state, g, y, outcomes);

  archiveVoyages(state);
  saveRng(state, rng);
  state.currentYear = null;

  const firstDeparture = departures[0] || null;
  const yearReport = {
    year: y,
    eventsFired,
    departures,
    departed: firstDeparture, // UI: singular (one sailing per year in practice)
    outcomes,
    arrivals: outcomes.map((o) => ({ voyageId: o.voyageId, name: o.name, destinationName: o.destinationName, outcome: o.outcome, outcomeLabel: o.outcomeLabel })),
    delayedDepartures: state.queue.length,
    funds: state.resources.funds,
    berthsUsed: (state.resources.berths || 0) - berths,
  };

  // Mission fragility (informational only): track accumulated years each mission
  // spends below 40% staffing. 40-60% pauses the counter; 60%+ resets it.
/**
 * Native vocations: each year, thriving missions (60%+ staffing) in native
 * territories have a 20% chance of gaining a native novice. 90% Brother
 * track (nF), 10% Scholastic (nS). They spawn directly in the mission,
 * bypassing the terna and Europe.
 */
function spawnNativeVocations(state, mainRng, opts = {}) {
  if (opts.skipNatives) return;
  // Natives only appear in missions established 10+ years
  // Use a separate RNG stream so native rolls don't shift the main sequence
  const rng = makeRng(`${state.seed}:natives:${state.year}`);
  const NATIVE_MISSIONS = {
    japan: 'japanese',
    china: 'chinese',
    india: 'indian',
    brazil: 'brazilian',
  };
  const g = ensureData();
  for (const [destId, culture] of Object.entries(NATIVE_MISSIONS)) {
    const dst = state.destState[destId] || {};
    if (dst.collapsed || dst.access === 'closed') continue;
    const st = missionStaff(state, destId);
    if (!st) continue;
    const staffed = missionStaffed(st);
    const capacity = st.capacity || 5;
    // Must be thriving: 60%+ staffing
    if (staffed < capacity * 0.6) continue;
    if (staffed >= capacity) continue;
    // Must be established 10+ years
    const foundedYear = typeof st.foundedYear === 'number' ? st.foundedYear : state.year;
    if (state.year - foundedYear < 10) continue;
    // 20% chance per year
    if (rng.int(1, 100) > 20) continue;
    // 90% nF (Brother track), 10% nS (Scholastic)
    const isScholastic = rng.int(1, 100) <= 10;
    const firstArr = FIRST_NAMES[culture];
    const lastArr = LAST_NAMES[culture];
    const first = firstArr ? firstArr[rng.int(0, firstArr.length - 1)] : 'Paulo';
    const last = lastArr ? lastArr[rng.int(0, lastArr.length - 1)] : 'Silva';
    const name = `${first} ${last}`;
    const pid = `native-${destId}-${state.year}-${staffed}`;
    if (!st.staffIds) st.staffIds = [];
    st.staffIds.push(pid);
    if (isScholastic) {
      st.coadjutors = (st.coadjutors || 0) + 1;
    } else {
      st.brothers = (st.brothers || 0) + 1;
    }
    if (!state.petitioners[pid]) {
      // A complete record, like every other man: history and status are
      // read all over the engine and must exist from birth.
      state.petitioners[pid] = {
        id: pid, name, fictional: true, native: true, culture,
        grade: isScholastic ? 'scholastic' : 'brother',
        status: 'active', history: [], historyV: HISTORY_VERSION,
        voyages: [],
        genYear: state.year, nativeTo: destId,
      };
    }
    // He is home, not a traveler — but the mission community is reckoned
    // by arrivals, so his joining is recorded as an arrival at his own
    // mission (Tran 2026-10-20: every man a profile, counted like any
    // other). Without this he bore no fruit all his life.
    {
      const rec = state.petitioners[pid];
      const hasArrival = (state.voyages || []).some((v) => v.petitionerId === pid && v.destination === destId && v.stage === 'arrived');
      if (!hasArrival) {
        const voyage = {
          id: `voy-${pid}`, petitionerId: pid, name, destination: destId,
          stage: 'arrived', outcome: 'thriving',
          staffGrade: isScholastic ? 'coadjutors' : 'brothers',
          departYear: state.year, arriveYear: state.year,
          companions: 0, companionIds: [], nativeJoining: true,
        };
        state.voyages.push(voyage);
        if (!Array.isArray(rec.voyages)) rec.voyages = [];
        if (!rec.voyages.includes(voyage.id)) rec.voyages.push(voyage.id);
      }
    }
    const destName = (g.destinations || []).find((d) => d.id === destId)?.name || destId;
    addLedger(state, {
      year: state.year, type: 'native', destination: destId,
      text: `A native vocation, ${name}, has joined the mission at ${destName}.`,
    });
  }
}

/**
 * Annual martyrdom and disease rolls for stationed men.
 * Martyrdom: d20 vs danger (0=safe, 1=die on 1, 2=die on 1-2, 3=die on 1-3).
 * Disease: separate d20, die on 1 (5%), or 1-2 (10%) in tropics.
 * When a martyrdom occurs, survivors react based on Zeal:
 *   Zeal 4+: private vow (+2 Zeal, immune to flee)
 *   Zeal 1-2: flees (joins return ship queue)
 *   Else: stays neutral
 * All survivors get +1 Zeal (martyrs inspire).
 */
function resolveMartyrdomAndDisease(state, rng) {
  const g = ensureData();
  // Tran 2026-10-19: the ill die the NEXT year. Men who fell ill in a prior
  // year now succumb.
  if (!state.sickMen) state.sickMen = {};
  for (const [pid, info] of Object.entries(state.sickMen)) {
    if (info.since >= state.year) continue;
    const st = missionStaff(state, info.destId);
    const idx = (st.staffIds || []).indexOf(pid);
    if (idx >= 0) {
      const dest = (g.destinations || []).find((d) => d.id === info.destId);
      const destName = dest?.name || info.destId;
      const name = personName(state, pid);
      removeStationedMan(state, st, pid);
      // A man who dies of disease is dead in his record too — before this,
      // his status stayed 'active' and he went on living in other systems.
      const dRec = state.petitioners[pid];
      if (dRec) {
        dRec.status = STATUS.DECEASED;
        recordHistory(state, pid, { kind: 'mission', event: 'death',
          text: `Died of disease at ${destName}, after a year's illness.` });
      }
      state.stats.deaths = (state.stats.deaths || 0) + 1;
      addLedger(state, {
        year: state.year, type: 'death', destination: info.destId, petitionerId: pid,
        text: `${name} died of disease at ${destName}, after a year's illness.`,
      });
    }
    delete state.sickMen[pid];
  }
  for (const destId of Object.keys(state.missions || {})) {
    const st = missionStaff(state, destId);
    const dst = state.destState[destId] || {};
    if (dst.collapsed || dst.access === 'closed') continue;
    if (!st.staffIds || !st.staffIds.length) continue;
    
    const dest = g.destinations.find((d) => d.id === destId);
    const danger = dst.danger ?? dest?.danger ?? 1;
    const tropical = !!dest?.tropical;
    const destName = dest?.name || destId;
    
    const martyred = [];

    // Disease rolls (two-stage: sicken this year, die the next)
    for (const pid of [...st.staffIds]) {
      if (state.sickMen[pid]) continue;
      const roll = rng.int(1, 100);
      const threshold = tropical ? 6 : 3;
      if (roll <= threshold) {
        state.sickMen[pid] = { since: state.year, destId };
        state.stats.illnesses = (state.stats.illnesses || 0) + 1;
        const name = personName(state, pid);
        addLedger(state, {
          year: state.year, type: 'ill', destination: destId,
          text: `${name} has fallen ill at ${destName}.`,
        });
      }
    }

    // Persecution (Tran 2026-10-19): replaces the flat martyrdom roll.
    // PER MAN at danger 2-3: 15% seized at danger 3, 10% at danger 2.
    // His fate turns on zeal + prudence (zelus non secundum scientiam is bad):
    // >=8 crown, 5-7 confessor, <=4 apostate.
    if (danger >= 2 && st.staffIds.length > 0) {
      const chance = danger >= 3 ? 0.15 : 0.10;
      for (const pid of [...st.staffIds]) {
        if (!rng.chance(chance)) continue;
        const d = ensureDisposition(state, pid);
        const zeal = d?.current?.zeal ?? 3;
        const prud = d?.current?.prudence ?? 3;
        const sum = zeal + prud;
        const name = personName(state, pid);
        const removeMan = () => removeStationedMan(state, st, pid);
        if (sum >= 8) {
          // The glorious crown
          removeMan();
          martyred.push(pid);
          state.stats.martyrs = (state.stats.martyrs || 0) + 1;
          // A martyr is dead in his record too, exactly like a voyage death.
          // This is safe now that starting staff no longer deal real
          // petitioners into missions: a stationed man's status is 'active',
          // never a terna-eligible 'new'/'denied', so he cannot resurface
          // at the desk and crash addEuropeanLabor the way phantom-staffed
          // men once did.
          const mRec = state.petitioners[pid];
          if (mRec) {
            mRec.status = STATUS.DECEASED;
            recordHistory(state, pid, { kind: 'mission', event: 'martyrdom',
              text: `Seized at ${destName} and won the glorious crown of the martyrs.` });
          }
          addLedger(state, {
            year: state.year, type: 'martyrdom', destination: destId, petitionerId: pid,
            text: `${name} was seized at ${destName} and won the glorious crown of the martyrs.`,
          });
        } else if (sum >= 5) {
          // Confessor: suffers, survives, body broken, virtues perfected
          state.stats.confessors = (state.stats.confessors || 0) + 1;
          const rec = state.petitioners[pid];
          if (rec) {
            rec.confessor = state.year;
            rec.health = Math.max(1, (typeof rec.health === 'number' ? rec.health : 4) - 2);
          }
          if (d && d.current) {
            for (const t of Object.keys(d.current)) d.current[t] = 6;
          }
          recordHistory(state, pid, { kind: 'vow', event: 'confessor',
            text: `Seized at ${destName}, he confessed the faith under threat of death and was released, broken in body.` });
          addLedger(state, {
            year: state.year, type: 'confessor', destination: destId, petitionerId: pid,
            text: `${name} was seized at ${destName} and confessed the faith — he lives, broken in body, perfected in virtue.`,
          });
        } else {
          // Apostasy under threat of death
          removeMan();
          state.stats.apostates = (state.stats.apostates || 0) + 1;
          if (state.petitioners[pid]) state.petitioners[pid].status = 'apostate';
          addLedger(state, {
            year: state.year, type: 'apostasy', destination: destId, petitionerId: pid,
            text: `${name} was seized at ${destName} and apostasized under threat of death. The mission is scandalized.`,
          });
        }
      }
    }
    
    // Survivors react to martyrdom
    if (martyred.length > 0) {
      for (const pid of st.staffIds) {
        const d = ensureDisposition(state, pid);
        if (!d || !d.current) continue;
        const zeal = d.current.zeal || 3;
        const name = personName(state, pid);
        if (zeal >= 4) {
          // Private vow
          d.current.zeal = Math.min(6, zeal + 2);
          recordHistory(state, pid, { kind: 'vow', event: 'martyr-vow',
            text: `Took a private vow accepting martyrdom after witnessing death at ${destName}.` });
        } else if (zeal <= 2) {
          // Flees
          removeStationedMan(state, st, pid);
          if (!state.returnTransit) state.returnTransit = {};
          if (!state.returnTransit[destId]) state.returnTransit[destId] = [];
          state.returnTransit[destId].push(pid);
          addLedger(state, {
            year: state.year, type: 'fled', destination: destId,
            text: `${name} fled ${destName} after the martyrdom.`,
          });
        } else {
          // Inspired: +1 Zeal
          d.current.zeal = Math.min(6, zeal + 1);
        }
      }
    }
  }
}

/**
 * Collapse a mission: sustained understaffing destroys it.
 * All stationed men are lost. -20 score. Mission can be re-founded.
 */
function collapseMission(state, destId) {
  const st = missionStaff(state, destId);
  const g = ensureData();
  const destName = g.destinations.find((d) => d.id === destId)?.name || destId;
  const lost = missionStaffed(st);
  st.fathers = 0;
  st.coadjutors = 0;
  st.brothers = 0;
  st.staffIds = [];
  st.fragileYears = 0;
  st.fragile = false;
  if (!state.destState[destId]) state.destState[destId] = {};
  state.destState[destId].access = 'closed';
  state.destState[destId].collapsed = true;
  state.score = Math.max(0, (state.score || 0) - 10);
  if (state.scoreUncapped != null) state.scoreUncapped -= 10;
  addLedger(state, {
    year: state.year, type: 'collapse', destination: destId,
    text: `The mission at ${destName} has collapsed. ${lost} men lost. (-10 score)`,
  });
}

  // Native vocations: thriving missions gain native novices.
  spawnNativeVocations(state, rng, opts);

  // Martyrdom and disease: annual rolls for stationed men.
  resolveMartyrdomAndDisease(state, rng);

  // Sustained understaffing destroys missions. Below 25% staffing for 3 years,
  // the mission collapses: all men lost, -20 score. It can be re-founded.
  for (const destId of Object.keys(state.missions || {})) {
    const st = missionStaff(state, destId);
    const dst = state.destState[destId] || {};
    if (dst.collapsed) continue;
    // A closed mission (disbanded by the General, or a frontier never
    // founded) is not understaffed — it is shut. It must not gather
    // fragility years, warn, or "collapse" a second time.
    if (dst.access === 'closed') continue;
    const ratio = missionStaffed(st) / (st.capacity || 5);
    if (ratio < 0.25) {
      st.fragileYears += 1;
      if (st.fragileYears === 4) {
        // Warning: one year from collapse
        const g2 = ensureData();
        const dName = (g2.destinations || []).find((d) => d.id === destId)?.name || destId;
        addLedger(state, {
          year: state.year, type: 'warning', destination: destId,
          text: `Collapse imminent: the mission at ${dName} will collapse next year unless reinforced (${missionStaffed(st)} of ${st.capacity || 5} places filled).`,
        });
      }
      if (st.fragileYears >= 5) {
        st.fragile = true;
        collapseMission(state, destId);
      }
    } else if (ratio >= 0.6) {
      st.fragileYears = 0;
      st.fragile = false;
    }
    // 25%-60%: pause (counter unchanged)
  }

  // Resolve instructions arriving this year.
  resolveInstructions(state, y);

  // Staged provincial answers take effect at year close.
  applyStagedAnswers(state);

  // Provincial reports: autonomous reports from actual mission conditions.
  generateProvincialRequests(state, y);

  // Novitiate vocations.
  resolveVocations(state, y);

  checkVowsMilestones(state, y);

  // Year-advance: total years +1 for every member; ageInReligion +1 unless deferred.
  advanceAgeInReligion(state, 1);
  // Mortality: aging, illness, old age.
  advanceMortality(state, 1);
  resetEnergy(state);
  const fruits = produceFruits(state);
  const fruitScore = Math.floor(fruits.totalNew / 500);
  if (fruitScore > 0) {
    state.score = rules.addScore(state.score, fruitScore);
    trackScoreDelta(state, fruitScore);
  }
  if (fruits.quotaPenalty > 0) {
    state.score = rules.addScore(state.score, -fruits.quotaPenalty);
    trackScoreDelta(state, -fruits.quotaPenalty);
  }
  buildSocietyReport(state, y, outcomes, statsBefore, fruits);
  state.year = y + 1;
  if (state.mode === 'campaign' && state.year > CAMPAIGN_END) state.ended = true;
  if (state.mode === 'endless' && state.year > CAMPAIGN_END && !state.diverged) {
    state.diverged = true;
    state.phase = 'alternate history';
  }
  return { outcomes, eventsFired, yearReport, score: state.score };
}

/** Best-effort display name for a petitioner id (historical data or regenerated fictional). */
/**
 * Get a person's display name from their ID. Never returns a raw hist- ID.
 */
export function personName(state, petitionerId) {
  const pid = String(petitionerId);
  if (pid.startsWith('dispatched-')) return 'A missionary';
  // Companions are real men with names on their records — use the name.
  // Only a companion with no record at all falls back to the generic label.
  if (pid.startsWith('companion-')) {
    const cRec = state.petitioners ? state.petitioners[pid] : null;
    if (cRec && cRec.name) return cRec.name;
    return 'A companion';
  }
  const g = getGameData();
  if (!g) return 'A petitioner';
  const name = cardName(state, g, petitionerId);
  if (name === petitionerId && pid.startsWith('hist-')) return 'A petitioner';
  return name;
}

/**
 * Generate a one-line "deeds" summary for a person.
 */
export function personDeeds(state, petitionerId) {
  const pid = String(petitionerId);
  if (pid.startsWith('dispatched-')) return 'Dispatched from Rome';
  const deeds = [];
  const g = getGameData();
  const grade = staffGradeFor(state, petitionerId);
  const gradeLabel = grade === 'fathers' ? 'Father' : grade === 'brothers' ? 'Brother' : 'Scholastic';
  deeds.push(gradeLabel);
  const yrs = yearsInSociety(state, petitionerId);
  if (yrs > 0) deeds.push(`${yrs} yrs in Society`);
  const voyages = (state.voyages || []).filter((v) => v.petitionerId === petitionerId && v.outcome === 'thriving');
  if (voyages.length > 0) {
    const dests = [...new Set(voyages.map((v) => {
      const d = g?.destinations ? (Array.isArray(g.destinations) ? g.destinations.find((x) => x.id === v.destination) : g.destinations[v.destination]) : null;
      return d?.name || v.destination;
    }))];
    if (dests.length > 0) {
      deeds.push(`served in ${dests.slice(0, 2).join(', ')}${dests.length > 2 ? ` +${dests.length - 2} more` : ''}`);
    }
  }
  if (voyages.length >= 3) deeds.push('veteran of 3+ voyages');
  else if (voyages.length >= 2) deeds.push('veteran of 2 voyages');
  return deeds.join(' · ');
}

/**
 * Get a person's detailed grade for display (six grades).
 * Returns: 'P', 'S*', 'S', 'F', 'nS', 'nF'
 */
export function detailedGradeFor(state, petitionerId) {
  const pid = String(petitionerId);
  if (pid.startsWith('dispatched-')) return 'F'; // default to Brother for placeholders
  if (pid.startsWith('companion-')) return 'F'; // companions are Brothers
  
  const rec = state.petitioners[petitionerId];
  // Check if professed
  if (isProfessedPriest(state, petitionerId)) return 'P';
  
  // Check ordination
  const gr = gradeFor(state, petitionerId);
  const grade = String(gr.grade || '').toLowerCase();
  
  // Novice check
  const entry = (state.europeanLabor || []).find((e) => e.petitionerId === petitionerId);
  if (entry?.vows?.stage === 'novice') {
    const track = rec?.noviceTrack || 'scholastic';
    return track === 'brother' ? 'nF' : 'nS';
  }
  if (grade === 'novice') {
    return 'nS'; // default novice to scholastic track
  }
  
  // Ordained scholastic
  if (gr.ordained === true || grade === 'father') return 'S*';
  
  // Scholastic
  if (grade === 'scholastic') return 'S';
  
  // Brother
  if (grade === 'brother') return 'F';
  
  // Default based on staffGradeFor
  const sg = staffGradeFor(state, petitionerId);
  if (sg === 'fathers') return 'S*'; // ordained but not professed
  if (sg === 'coadjutors') return 'S';
  return 'F';
}

export function cardName(state, g, id) {
  const hist = g.petitioners.find((p) => p.id === id);
  if (hist) return String(hist.name || '').replace(/\s*\(\d{4}-\d{4}\)\s*/g, ' ').trim();
  const rec = state.petitioners[id];
  if (rec?.name) return rec.name;
  if (rec?.fictional) {
    const ids = g.destinations.map((d) => d.id);
    const names = g.destinations.map((d) => d.name);
    return fictionalPetitioner(state.seed, rec.ficNum, ids, names, rec.genYear).name;
  }
  return id;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** @param {object} state @returns {number} 0..100 */
export function getScore(state) {
  // Display normalization (Tran 2026-10-19, option B): the shown score
  // stretches the UNCAPPED tally (state.scoreUncapped — state.score itself
  // is clamped to [0,100] by rules.addScore and cannot carry the scale):
  // -500 -> 0 (total ruin), +1000 -> 100 (a great reign).
  const FLOOR = -500;
  const CEILING = 1000;
  const raw = typeof state.scoreUncapped === 'number' ? state.scoreUncapped : state.score;
  const t = (raw - FLOOR) / (CEILING - FLOOR);
  return Math.max(0, Math.min(100, Math.round(t * 100)));
}

/**
 * Query the ledger.
 * @param {object} state
 * @param {{year?:number,petitionerId?:string,destination?:string,decision?:string,status?:string,type?:string}} [filter]
 * @returns {object[]} matching entries, oldest first
 */
export function getLedger(state, filter = {}) {
  return state.ledger.filter((e) => {
    for (const [k, v] of Object.entries(filter)) {
      if (v !== undefined && e[k] !== v) return false;
    }
    return true;
  });
}

/**
 * Map-screen state for the UI: year, voyage copies, and per-destination
 * rollups (name, port, access, danger, missions sent, arrived, lost).
 * @param {object} state
 * @returns {{year:number, voyages:object[], destinations:object}}
 */
export function getMapState(state) {
  const g = getGameData();
  const dests = {};
  const ids = g ? g.destinations.map((d) => d.id) : Object.keys(state.destState);
  for (const id of ids) {
    const info = DESTINATIONS[id] || { name: id, port: id };
    const st = state.destState[id] || { danger: 1, access: 'open' };
    const vs = state.voyages.filter((v) => v.destination === id);
    dests[id] = {
      id,
      name: info.name,
      port: info.port,
      access: st.access,
      danger: st.danger,
      closed: st.access === 'closed',
      missions: vs.length,
      arrived: vs.filter((v) => v.stage === 'arrived' && v.outcome !== 'deceased').length,
      lost: vs.filter((v) => v.outcome === 'deceased').length,
    };
  }
  return {
    year: state.year,
    voyages: state.voyages.map((v) => ({ ...v })),
    destinations: dests,
  };
}

// ---------------------------------------------------------------------------
// End of game
// ---------------------------------------------------------------------------

const REFLECTIONS = Object.freeze({
  'The Failed Generalate': [
    'The letters kept coming, and the answers kept missing their mark. Somewhere between Rome and the far missions, the thread of trust wore thin — a reminder that stewardship is not only about saying yes or no, but about seeing clearly enough to choose well.',
    'Year after year the ternas were weighed and found wanting in the outcome. The Society endured; the General did not. Yet even a failed generalate leaves its record: every denial, every lost voyage, a lesson for whoever takes up the seal next.',
  ],
  'The Reluctant Steward': [
    'He governed, but his heart was never quite in the sending. The missions received too little and too late, and the ledger shows it. Reluctance, too, is a kind of answer — the petitioners learned to read it.',
    'Caution has its virtues, and its costs. The ships sailed half-empty some years while fervent men waited at home. The Church asks her stewards for prudence, but prudence without courage is only delay.',
  ],
  'The Steady General': [
    'Neither brilliant nor ruinous: the ternas were weighed, the ships sailed, the news came home in its season. Most of the men he sent are names in a ledger now — but a ledger, kept honestly, is itself a kind of fidelity.',
    'He did the work set before him without fanfare. Some missionaries thrived, some returned, some rest in unmarked graves across the sea. The steady hand does not make history; it makes the history of others possible.',
  ],
  'The Ardent General': [
    'He loved the missions and it showed — in full berths, in prompt answers, in letters that carried hope across oceans. Not every voyage returned, but none was sent carelessly. Zeal, governed by prayer, built more than ships could carry.',
    'The petitioners called him a father before Rome called him anything else. He sent them with blessing and received their news — glad or grievous — as a father receives word of his sons. The Indies are richer for his ardor.',
  ],
  'The Great Missionary Steward': [
    'Thirty years of ternas, and history will remember the choosing. He sent the right men to the hard places, bore the losses without flinching, and kept the Society’s gaze fixed on the far shore. Xavier himself would have recognized the hand.',
    'Rare is the General under whom both the missions and the men flourish. His ledger reads like a litany: sent, arrived, labored, and — for some — crowned. The Society’s greatest age of missions bears his fingerprints.',
  ],
});

/**
 * End the game and summarize.
 * @param {object} state
 * @returns {{stats:object, title:string, reflection:string}}
 */
// ---------------------------------------------------------------------------
// End-of-generalate report card (Stage 2)
// ---------------------------------------------------------------------------

/** Build the end-of-generalate report card (plain-data summary). */
export function generalateReport(state) {
  const g = ensureData();
  const s = state.stats || {};
  const startYear = CAMPAIGN_START;
  const endYear = (typeof state.year === 'number' ? state.year : startYear) - 1;
  const fundsStart = rules.RESOURCES.START_FUNDS;
  const fundsEnd = state.resources && typeof state.resources.funds === 'number'
    ? state.resources.funds : null;

  let souls = 0, deployVoyages = 0;
  for (const v of (state.voyages || [])) {
    souls += 1 + (v.companions || 0);
    if (v.deploymentId) deployVoyages += 1;
  }

  const novitiates = (state.novitiates || [])
    .map((n) => ({
      destination: n.destination,
      name: destName(g, n.destination),
      foundedYear: n.foundedYear,
    }))
    .sort((a, b) => a.foundedYear - b.foundedYear);

  // Mission-strengthening investments are tracked only in saves created
  // after the tracking was introduced; older saves report it as unknown.
  const hasDispatchData = !!s && typeof s.missionDispatches === 'number';
  const strengthened = hasDispatchData
    ? Object.entries(s.missionDispatchDests || {})
      .map(([destId, men]) => ({ destId, name: destName(g, destId), men }))
      .sort((a, b) => b.men - a.men)
    : null;

  const events = [];
  for (const id of (state.firedEvents || [])) {
    const ev = (g.events || []).find((e) => e.id === id);
    if (ev) {
      events.push({
        year: ev.year,
        title: ev.title,
        description: ev.description || ev.title,
        effects: summarizeEventEffects(g, ev.effects),
      });
    }
  }
  events.sort((a, b) => a.year - b.year);

  const score = getScore(state);
  const report = {
    startYear,
    endYear,
    yearsRuled: Math.max(0, endYear - startYear + 1),
    score,
    scoreTitle: rules.titleForScore(score),
    outcomes: {
      thriving: s.thriving || 0,
      returned: s.returns || 0,
      ill: s.illnesses || 0,
      deceased: s.deaths || 0,
      reassigned: s.reassignments || 0,
    },
    personnel: {
      dispatched: s.departures || 0,
      souls,
      viaDeployment: deployVoyages,
      available: typeof state.available === 'number' ? state.available : null,
    },
    treasury: {
      start: fundsStart,
      end: fundsEnd,
      net: fundsEnd === null ? null : fundsEnd - fundsStart,
    },
    institutions: {
      novitiates,
      strengthened,
      strengthenedTotal: hasDispatchData ? s.missionDispatches : null,
      strengthenedUnknown: !hasDispatchData,
    },
    events,
  };
  report.narrative = reportNarrative(report);
  return report;
}

/** One-line human summary of a historical event's mechanical effects. */
function summarizeEventEffects(g, effects) {
  const parts = [];
  for (const [destId, fx] of Object.entries(effects || {})) {
    const bits = [];
    if (typeof fx.danger === 'number') bits.push(`peril ${fx.danger}`);
    if (fx.access === 'closed') bits.push('closed to new men');
    else if (fx.access === 'restricted') bits.push('sailings restricted');
    else if (fx.access === 'open') bits.push('opened to new men');
    if (bits.length) parts.push(`${destName(g, destId)}: ${bits.join(', ')}`);
  }
  return parts.join('; ');
}

/**
 * Descriptive closing narrative: what happened, in plain words. No grades,
 * no judgments, no attribution of divine favor or disfavor to the outcomes.
 */
function reportNarrative(r) {
  const o = r.outcomes, p = r.personnel, t = r.treasury, ins = r.institutions;
  const sents = [];
  const menWord = p.dispatched === 1 ? 'man' : 'men';
  sents.push(
    `From ${r.startYear} to ${r.endYear}, ${p.dispatched} ${menWord} embarked for the missions` +
    (p.souls > p.dispatched ? ` (${p.souls} souls counting the companions who sailed with them)` : '') +
    '.',
  );
  if (p.dispatched > 0) {
    const bits = [];
    if (o.thriving) bits.push(`${o.thriving} reported thriving in their stations`);
    if (o.returned) bits.push(`${o.returned} returned to Europe`);
    if (o.ill) bits.push(`${o.ill} fallen gravely ill`);
    if (o.deceased) bits.push(`${o.deceased} dead in the missions`);
    sents.push(
      bits.length
        ? `Word has come back of ${bits.join('; ')}.`
        : 'No word has yet come back from those who sailed.',
    );
    if (o.thriving > 0) {
      const per10 = Math.round((o.thriving / p.dispatched) * 10);
      sents.push(`Roughly ${per10} in ten of those embarked are thriving.`);
    }
  }
  if (t.end !== null) {
    const dir = t.net > 0 ? 'more' : t.net < 0 ? 'less' : 'no more nor less';
    sents.push(
      t.net === 0
        ? `The mission chest holds ${t.end} scudi, as at the election.`
        : `The mission chest, which held ${t.start} scudi at the election, now holds ${t.end} — ${Math.abs(t.net)} scudi ${dir} than at the beginning.`,
    );
  }
  const found = [];
  if (ins.novitiates.length) {
    found.push(
      `${ins.novitiates.length} ${ins.novitiates.length === 1 ? 'novitiate' : 'novitiates'} founded` +
      ` (${ins.novitiates.map((n) => `${n.name} ${n.foundedYear}`).join(', ')})`,
    );
  }
  if (ins.strengthenedUnknown) {
    found.push('earlier mission reinforcements are not recorded in this account');
  } else if (ins.strengthenedTotal > 0) {
    found.push(
      `${ins.strengthenedTotal} ${ins.strengthenedTotal === 1 ? 'man' : 'men'} dispatched to strengthen the missions` +
      ` (${ins.strengthened.map((m) => `${m.name}: ${m.men}`).join(', ')})`,
    );
  }
  if (found.length) sents.push(`The Society's foundations grew by ${found.join('; ')}.`);
  return sents.join(' ');
}

export function endGame(state) {
  const s = state.stats;
  const unresolved =
    state.queue.length +
    state.voyages.filter((v) => v.stage === 'transit').length +
    state.voyages.filter((v) => v.stage === 'arrived' && !v.newsDelivered).length;
  const score = getScore(state);
  const stats = {
    ternas: s.ternas,
    approvals: s.approvals,
    approved: s.approvals,   // UI alias
    denials: s.denials,
    denied: s.denials,       // UI alias
    departures: s.departures,
    departed: s.departures,  // UI alias
    arrivals: s.arrivals,
    arrived: s.arrivals,     // UI alias
    deaths: s.deaths,
    lost: s.deaths,          // UI alias
    returns: s.returns,
    returned: s.returns,     // UI alias
    illnesses: s.illnesses,
    reassignments: s.reassignments,
    thriving: s.thriving,
    unresolved,
    yearsPlayed: state.year - CAMPAIGN_START,
    yearsRuled: state.year - CAMPAIGN_START, // UI alias
    finalYear: state.year - 1,
    score,
    finalScore: score,       // UI alias
    seed: state.seed,
    mode: state.mode,
    phase: state.phase,
  };
  const title = rules.titleForScore(score);
  const variants = REFLECTIONS[title];
  const r = makeRng(`${state.seed}:reflection`);
  const reflection = variants[r.int(0, variants.length - 1)];
  return { stats, title, reflection, report: generalateReport(state) };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Deep-clone the state into a JSON-safe object. RNG states are already
 * stored as plain arrays inside state.
 * @param {object} state
 * @returns {object}
 */
export function serialize(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Restore a state object from serialize(). Validates minimally.
 * Handles older saves lacking currentYear by defaulting it to null.
 * @param {object} obj
 * @returns {object}
 */
/**
 * Repair roster integrity in saves written before the one-man-one-place
 * fixes. Old saves can contain: duplicate queue entries for one man, real
 * petitioners dealt into mission staff lists they never sailed to (the old
 * initMissions behavior), dead men still rostered, and closed missions
 * carrying fragility years. Idempotent; safe to run on every load.
 * Counts are left alone except where a rostered man is provably elsewhere:
 * phantom names never added to the counts, so removing them cannot unbalance
 * a mission — genuine arrivals (who did add to the counts) are kept by
 * their evidence: a thriving voyage, a dispatch record, or a companion /
 * native id minted for that very mission.
 */
function repairRosterIntegrity(state) {
  // Every man's record carries the fields the engine reads everywhere.
  for (const rec of Object.values(state.petitioners || {})) {
    if (!rec || typeof rec !== 'object') continue;
    if (!Array.isArray(rec.history)) rec.history = [];
    if (rec.native && !rec.status) rec.status = 'active';
  }
  // Native vocations stationed at a mission count as arrived there (their
  // joining IS their arrival); older saves recorded no arrival for them,
  // leaving them invisible to the mission community. Backfill it.
  for (const [destId, st] of Object.entries(state.missions || {})) {
    for (const pid of (st && st.staffIds) || []) {
      const rec = (state.petitioners || {})[pid];
      if (!rec || !rec.native) continue;
      const hasArrival = (state.voyages || []).some((v) => v.petitionerId === pid && v.destination === destId && v.stage === 'arrived');
      if (hasArrival) continue;
      const voyage = {
        id: `voy-${pid}`, petitionerId: pid, name: rec.name || pid, destination: destId,
        stage: 'arrived', outcome: 'thriving', staffGrade: staffGradeFor(state, pid),
        departYear: rec.genYear || state.year, arriveYear: rec.genYear || state.year,
        companions: 0, companionIds: [], nativeJoining: true,
      };
      state.voyages.push(voyage);
      if (!Array.isArray(rec.voyages)) rec.voyages = [];
      if (!rec.voyages.includes(voyage.id)) rec.voyages.push(voyage.id);
    }
  }
  // One queue entry per man.
  if (Array.isArray(state.queue)) {
    const seenQ = new Set();
    state.queue = state.queue.filter((q) => {
      if (!q || q.status !== 'awaiting') return true;
      if (seenQ.has(q.petitionerId)) return false;
      seenQ.add(q.petitionerId);
      return true;
    });
  }
  const inEurope = new Set((state.europeanLabor || []).map((e) => e.petitionerId));
  const atDock = new Set(
    (state.queue || []).filter((q) => q.status === 'awaiting').map((q) => q.petitionerId),
  );
  const reached = (pid, destId) => {
    if (pid.startsWith(`companion-${destId}-`) || pid.startsWith(`native-${destId}-`)) return true;
    for (const v of state.voyages || []) {
      if (v.petitionerId === pid && v.destination === destId && v.outcome === 'thriving') return true;
    }
    const rec = state.petitioners ? state.petitioners[pid] : null;
    for (const h of (rec && rec.history) || []) {
      if (h.destination === destId
        && (h.decision === 'dispatch-europe' || h.decision === 'emergency-dispatch' || h.event === 'arrival')) {
        return true;
      }
    }
    return false;
  };
  const rosteredElsewhere = new Map(); // pid -> destId that keeps him
  for (const destId of Object.keys(state.missions || {})) {
    const st = state.missions[destId];
    if (!st || !Array.isArray(st.staffIds)) continue;
    st.staffIds = st.staffIds.filter((pid) => {
      if (rosteredElsewhere.has(pid)) return false; // already kept at one mission
      const rec = state.petitioners ? state.petitioners[pid] : null;
      if (rec && (rec.status === STATUS.DECEASED || rec.status === STATUS.DISMISSED || rec.status === 'apostate')) return false;
      if (inEurope.has(pid) || atDock.has(pid)) return false; // he is provably not there
      if (!reached(pid, destId)) return false; // no evidence he ever arrived
      rosteredElsewhere.set(pid, destId);
      return true;
    });
    // A closed mission's fragility clock is FROZEN, not erased: the live
    // engine never advances it (and a refounding resets it), so repair
    // leaves the counter as the save recorded it.
  }
  // Illness entries for men no longer stationed anywhere are void.
  if (state.sickMen) {
    for (const [pid, info] of Object.entries(state.sickMen)) {
      const st = state.missions ? state.missions[info.destId] : null;
      if (!st || !Array.isArray(st.staffIds) || !st.staffIds.includes(pid)) delete state.sickMen[pid];
    }
  }
}

export function deserialize(obj) {
  if (!obj || typeof obj !== 'object' || obj.version !== 1) {
    throw new Error('deserialize: not a GENERALATE state object');
  }
  const state = JSON.parse(JSON.stringify(obj));
  if (!('currentYear' in state)) state.currentYear = null;
  if (!state.finance) state.finance = { income: {}, expenses: {} };
  if (!state.financeYears) state.financeYears = {};
  if (!state.missionTransit) state.missionTransit = {};
  if (!('novitiates' in state)) state.novitiates = [];
  if (!state.missions || typeof state.missions !== 'object') state.missions = initMissions();
  else for (const id of Object.keys(state.missions)) missionStaff(state, id); // normalize shape
  // Every man a profile (Tran 2026-10-20): profile any roster placeholder
  // and mint men for counts that have none — then repair prunes true
  // ghosts (men provably elsewhere), and a second pass fills their slots.
  mintUnnamedStaff(state);
  repairRosterIntegrity(state);
  mintUnnamedStaff(state);
  if (!('europeanLabor' in state)) state.europeanLabor = [];
  if(!Array.isArray(state.pendingVows))state.pendingVows=[];
  if(!Array.isArray(state.vowsNewsInTransit))state.vowsNewsInTransit=[];
  // Migration: entryYear first, then seed both counters, then vows (ensureVows reads ageInReligion).
  for(const e of state.europeanLabor){const r=state.petitioners[e.petitionerId];if(r&&r.entryYear==null){if(e.year!=null)r.entryYear=e.year;else{const hy=(r.history||[]).find(h=>/denied/i.test(h));const hym=hy&&hy.match(/16\d\d/);r.entryYear=hym?parseInt(hym[0]):state.year-2;}}}
  for (const id of Object.keys(state.petitioners || {})) {
    const r = state.petitioners[id];
    if (r && typeof r.entryYear === 'number' && typeof r.trueEntryYear !== 'number') seedTrueEntryYear(state, id, r.entryYear);
  }
  for (const id of Object.keys(state.petitioners || {})) { migrateNovitiate(state, id); persistNovitiateGrade(state, id); }
  for (const id of Object.keys(state.petitioners || {})) {
    const r = state.petitioners[id];
    if (r && typeof r.entryYear === 'number') initAgeInReligion(state, id);
  }
  // Formation & Mission history: backfill pre-history saves from ledger/voyages/vows
  // (before ensureVows, which records any milestones it auto-resolves).
  for (const id of Object.keys(state.petitioners || {})) backfillHistory(state, id);
  for(const e of state.europeanLabor){const r=state.petitioners[e.petitionerId];e.vows=(r&&r.vows&&typeof r.vows==='object')?r.vows:ensureVows(state,e.petitionerId);}
  if (!('instructions' in state) || typeof state.instructions !== 'object') state.instructions = {};
  if (!Array.isArray(state.reports)) state.reports = [];
  for (const r of state.reports) {
    if (!r.dedupeKey) r.dedupeKey = `${r.destId}::${r.kind}`;
    if (!Array.isArray(r.appliedActions)) r.appliedActions = [];
  }
  if (!Array.isArray(state.staged)) state.staged = [];
  if (!state.draft) state.draft = { regions: [], picks: {}, done: true, skipped: true };
  if (!state.provincials || typeof state.provincials !== 'object') state.provincials = {};
  if (!state.provinceHQs || typeof state.provinceHQs !== 'object') state.provinceHQs = {};
  if (!state.provincialTernas || typeof state.provincialTernas !== 'object') state.provincialTernas = {};
  migrateDeathReports(state);
  if (!('report' in (state.seq || {}))) state.seq.report = 0;
  if (!('staged' in (state.seq || {}))) state.seq.staged = 0;
  if (!('novices' in state) || !Array.isArray(state.novices)) state.novices = [];
  if (!('zealUntil' in state)) state.zealUntil = 0;
  // Stage 0 instrumentation: pre-instrumentation saves have no uncapped history;
  // seed from the capped score (a floor, documented approximation).
  if (!('scoreUncapped' in state)) state.scoreUncapped = state.score;
  if (typeof state.society !== 'number') state.society = rules.RESOURCES.SOCIETY_START;
  if (typeof state.available !== 'number') {
    state.available = Math.round((state.society || rules.RESOURCES.SOCIETY_START) * rules.RESOURCES.MISSION_PCT);
  }
  if (Array.isArray(state.resources && state.resources.ships)) {
    for (const sh of state.resources.ships) {
      if (sh.freeYear == null) sh.freeYear = 0;
    }
  }
  if (!('team' in (state.seq || {}))) state.seq.team = 0;
  if (!('deployment' in (state.seq || {}))) state.seq.deployment = 0; // collective deployments (Stage 1)
  if (!('deployments' in state) || !Array.isArray(state.deployments)) state.deployments = []; // Stage 1 registry
  if (!('teams' in (state.stats || {}))) state.stats.teams = 0;
  if (!('novitiates' in (state.stats || {}))) state.stats.novitiates = 0;
  // Validate RNG states are restorable.
  const r = makeRng('generalate:main');
  r.setState(state.rngState);
  const e = makeRng('generalate:endless');
  e.setState(state.endlessRngState);
  return state;
}

// ---------------------------------------------------------------------------
// Debug tools
// ---------------------------------------------------------------------------

/** Jump the game clock (debug). */
export function dbgJumpYear(state, y) {
  if (!Number.isInteger(y)) throw new Error('dbgJumpYear: year must be an integer');
  if (typeof state.year === 'number' && y !== state.year) {
    advanceAgeInReligion(state, y - state.year, { honorDeferral: false });
    advanceMortality(state, y - state.year);
  }
  state.year = y;
  state.currentYear = null;
  return state.year;
}

/**
 * Force a historical event to fire now (debug): applies its destState
 * effects and records it as fired.
 */
export function dbgFireEvent(state, eventId) {
  const g = ensureData();
  const ev = g.events.find((e) => e.id === eventId);
  if (!ev) throw new Error(`dbgFireEvent: unknown event "${eventId}"`);
  applyEvent(state, g, ev);
  if (!state.firedEvents.includes(ev.id)) state.firedEvents.push(ev.id);
  return { id: ev.id, year: ev.year, title: ev.title, effects: ev.effects };
}

/** Force-assemble a terna for the current year, replacing any pending one (debug). */
export function dbgSpawnTerna(state) {
  const g = ensureData();
  const rng = mainRng(state);
  const { cards } = assembleTerna(state, g, rng);
  saveRng(state, rng);
  state.currentTerna = { year: state.year, cards };
  state.currentYear = { year: state.year, briefing: buildBriefing(state, g, false), terna: cards, decided: false, decisionResult: null, debug: true };
  return cards;
}

/**
 * Force a voyage's outcome (debug). Posts the (counterfactual) news immediately.
 */
export function dbgForceOutcome(state, voyageId, outcome) {
  if (!rules.TERMINAL_OUTCOMES.includes(outcome)) {
    throw new Error(`dbgForceOutcome: outcome must be one of ${rules.TERMINAL_OUTCOMES.join(', ')}`);
  }
  const g = ensureData();
  const v = state.voyages.find((x) => x.id === voyageId);
  if (!v) throw new Error(`dbgForceOutcome: unknown voyage "${voyageId}"`);
  // Guard against re-forcing: the normal path filters by stage === 'transit'.
  // Re-running on an arrived voyage would double-apply staffing, score, and news.
  if (v.stage === 'arrived' && v.outcome) {
    throw new Error(`dbgForceOutcome: voyage "${voyageId}" already resolved as ${v.outcome}`);
  }
  v.stage = 'arrived';
  v.status = 'arrived';
  v.outcome = outcome;
  v.resolvedYear = state.year;
  if (outcome === 'thriving') staffArrival(state, v);
  if (outcome === 'deceased') {
    state.stats.deaths += 1;
    state.society = Math.max(0, (state.society || 0) - 1);
  }
  if (outcome === 'returned') state.available = (state.available || 0) + 1; // rejoins the mission-eligible pool
  if (outcome === 'ill') {
    state.stats.illnesses += 1;
    const illName = v.petitionerName || cardName(state, g, v.petitionerId);
    const illRec = addEuropeanLabor(state, v.petitionerId, illName, 'ill');
    illRec.ill = true;
    illRec.illYear = state.year;
  }
  const rec = getRecord(state, v.petitionerId);
  recordArrival(state, g, v);
  rec.status =
    outcome === 'deceased' ? STATUS.DECEASED
    : outcome === 'returned' ? STATUS.RETURNED
    : outcome === 'ill' ? STATUS.ILL
    : STATUS.ACTIVE;
  if (outcome === 'deceased') purgeVowsState(state, v.petitionerId);
  const outcomes = [];
  deliverNews(state, g, v, outcomes);
  return outcomes[0];
}

// UI-compat debug aliases (the UI was coded against the mock's __ names).
/** @deprecated alias of dbgFireEvent for the UI debug panel */
export const __fireEvent = dbgFireEvent;
/**
 * UI-compat alias of dbgForceOutcome. Accepts the mock's outcome vocabulary:
 * 'arrived' → thriving, 'lost' → deceased, 'returned' → returned.
 */
export function __forceOutcome(state, voyageId, outcome) {
  const map = { arrived: 'thriving', lost: 'deceased', returned: 'returned' };
  return dbgForceOutcome(state, voyageId, map[outcome] || outcome);
}
/** UI debug panel data: {EVENTS: [event ids], DESTINATIONS: [{id, name}]} */
export function __debug() {
  const g = getGameData();
  return {
    EVENTS: g ? g.events.map((e) => e.id) : [],
    DESTINATIONS: g ? g.destinations.map((d) => ({ id: d.id, name: d.name || d.id })) : [],
  };
}

// ---------------------------------------------------------------------------
// Soak test
// ---------------------------------------------------------------------------

/**
 * Headless soak test: plays N rounds with random valid decisions,
 * asserting the engine invariants every round.
 * @param {{rounds?:number, seed?:string, mode?:'campaign'|'endless'}} opts
 * @returns {{rounds:number, errors:string[], invariantsChecked:number, finalScore:number|null, finalYear:number|null, completedCampaign:boolean}}
 */
export function soakTest({ rounds = 100, seed = 'soak', mode = 'endless' } = {}) {
  const errors = [];
  let invariantsChecked = 0;
  const check = (name, cond) => {
    invariantsChecked += 1;
    if (!cond) errors.push(`INVARIANT FAILED: ${name}`);
  };
  const decider = makeRng(`${seed}:soak-decider`);

  let state;
  try {
    state = newGame({ mode, seed });
  } catch (e) {
    return { rounds: 0, errors: [`newGame threw: ${e.message}`], invariantsChecked, finalScore: null, finalYear: null, completedCampaign: false };
  }

  let completed = 0;
  let completedCampaign = false;
  for (let i = 0; i < rounds; i++) {
    try {
      // --- startYear ---
      const { terna } = startYear(state);
      // Invariant 1: exactly 3 distinct petitioner ids per terna.
      check(`round ${i}: terna has 1..10 cards`, terna.length >= 1 && terna.length <= TERNA_SIZE);
      check(`round ${i}: terna ids distinct`, new Set(terna.map((c) => c.petitionerId)).size === terna.length);
      check(`round ${i}: card id alias`, terna.every((c) => c.id === c.petitionerId));

      // Invariant 2: decide() validates its approvals; anything else throws.
      if (i === 2) {
        let threw = false;
        try { decide(state, [{ id: 'bogus-id' }]); } catch { threw = true; }
        check('decide rejects unknown id', threw);
        let threw2 = false;
        try { decide(state, [{ id: terna[0].petitionerId + '-nope' }]); } catch { threw2 = true; }
        check('decide rejects near-miss id', threw2);
        let threw3 = false;
        try { decide(state, 'not-an-array'); } catch { threw3 = true; }
        check('decide rejects non-array approvals', threw3);
        let threw4 = false;
        try { decide(state, [{ id: terna[0].petitionerId }, { id: terna[0].petitionerId }]); } catch { threw4 = true; }
        check('decide rejects duplicate id', threw4);
      }

      // Approve a random subset (0–3) of the terna; sometimes redirect one.
      // Approve ~half, but never more than the chest can seal (30/man) —
      // a real General denies more when the treasury is thin.
      const approvals = terna.filter(() => decider.chance(0.5)).map((c) => ({ id: c.petitionerId }));
      if (approvals.length && decider.chance(0.25)) {
        const openDests = Object.keys(state.destState).filter((d) => isDestOpen(state, d));
        if (openDests.length) approvals[0].destination = decider.pick(openDests);
      }
      const res = decide(state, approvals);
      // Invariant 5: approved + denied partition the terna; no double role.
      const approvedIds = new Set(res.approved.map((c) => c.petitionerId));
      check(`round ${i}: partition covers terna`, res.approved.length + res.denied.length === terna.length);
      check(`round ${i}: no double role`, !res.denied.some((d) => approvedIds.has(d.petitionerId)));
      check(`round ${i}: teams consistent`,
        res.teams.every((tm) => tm.size >= 2 && tm.members.every((id) => approvedIds.has(id))));
      // Invariant 3: displayed score within [0,100] (state.score is the
      // uncapped tally and may roam; getScore normalizes it).
      check(`round ${i}: score in range after decide`, getScore(state) >= 0 && getScore(state) <= 100);

      // A real General rebuilds: reopen a collapsed mission when the chest
      // allows, with a small company of whichever named men Europe can
      // actually spare (the world otherwise decays shut).
      const collapsedDest = Object.entries(state.destState || {}).find(([, ds]) => ds && ds.collapsed);
      if (collapsedDest && state.resources.funds >= 1100) {
        for (const mix of [{ fathers: 1, coadjutors: 1, brothers: 1 }, { fathers: 1 }, { coadjutors: 1 }, { brothers: 1 }]) {
          try { foundMission(state, collapsedDest[0], mix); break; } catch { /* try another mix */ }
        }
      }
      // A real General keeps the fleet sailing: when men crowd the dock
      // and the chest allows, charter another hull and a berth for it —
      // otherwise the queue strangles every mission's reinforcement.
      const awaitingNow = (state.queue || []).filter((q) => q.status === 'awaiting').length;
      if (awaitingNow > 12 && state.resources.funds >= 900) {
        try { expandBerths(state); } catch { /* no room */ }
        try { charterShip(state); } catch { /* ignore */ }
      }
      const r = resolveYear(state);
      check(`round ${i}: score in range after resolve`, getScore(state) >= 0 && getScore(state) <= 100);
      check(`round ${i}: outcomes is array`, Array.isArray(r.outcomes));
      check(`round ${i}: eventsFired is array`, Array.isArray(r.eventsFired));
      // Invariant 4: returning petitioners keep id + history (year-ordered).
      let histOk = true;
      for (const rec of Object.values(state.petitioners)) {
        if (rec.history.length > 1) {
          const years = rec.history.map((h) => h.year);
          if (!years.every((y2, k) => k === 0 || y2 >= years[k - 1])) { histOk = false; break; }
        }
      }
      check(`round ${i}: histories ordered`, histOk);

      // Invariant 6: serialize → deserialize round-trips identically.
      if (i % 25 === 24) {
        const a = JSON.stringify(serialize(state));
        const b = JSON.stringify(serialize(deserialize(serialize(state))));
        check(`round ${i}: serialize round-trip identical`, a === b);
      }

      // Invariant 7: bounded growth (voyage detail capped; ledger sane).
      check(`round ${i}: voyages bounded`, state.voyages.length <= 1200);
      check(`round ${i}: ledger sane`, state.ledger.length <= 100000);
      const resolved = state.voyages.filter((v) => v.stage === 'arrived' && !v.summarized).length;
      check(`round ${i}: voyage detail capped`, resolved <= 160);

      completed += 1;
    } catch (e) {
      if (e && e.code === 'CAMPAIGN_COMPLETE') {
        completedCampaign = true;
        break;
      }
      errors.push(`round ${i}: ${e.message}`);
      break;
    }
  }
  return {
    rounds: completed,
    errors,
    invariantsChecked,
    finalScore: state ? getScore(state) : null,
    finalYear: state ? state.year : null,
    completedCampaign,
  };
}

// ---------------------------------------------------------------------------
// Node self-test (also runnable via test.mjs)
// ---------------------------------------------------------------------------

if (typeof process !== 'undefined' && process.argv[1]?.endsWith('engine.js')) {
  const { setGameData, FIXTURES } = await import('./data.js');
  setGameData(FIXTURES);
  const r = soakTest({ rounds: 60, seed: 'engine-selftest' });
  console.log(JSON.stringify(r, null, 2));
  if (r.errors.length > 0) process.exit(1);
}
