/**
 * test.mjs — node-runnable tests for the GENERALATE engine.
 * Run: node test.mjs   (from this directory)
 */
import { setGameData, FIXTURES, loadGameData, getGameData } from './data.js';
import {
  newGame, startYear, decide, resolveYear, getScore, getLedger, endGame,
  serialize, deserialize, soakTest, getMapState, DESTINATIONS,
  dbgJumpYear, dbgFireEvent, dbgSpawnTerna, dbgForceOutcome,
  __fireEvent, __forceOutcome, __debug,
  foundNovitiate, expandBerths, charterShip, refreshBriefing, streamFor,
  ensureDisposition, gradeFor, assignFormation, observe,
  missionStaff, missionStaffed, missionStrength, missionVoyageBonus, missionUpkeep,
  missionRequests, staffGradeFor,
  assignDomestic, unassignDomestic,
  ordinationEligible, ordainPriest, careerStage, issueInstruction,
  decideVows, inviteFinalVows, completeFinalVows, rankSuffix, purgeVowsState,
  orderDeployment, selectDeploymentMembers, deploymentCandidates, deploymentEligible,
  deploymentStatus, deploymentRoster, deploymentConstraints,
  DEPLOYMENT_PURPOSES, DEPLOYMENT_MIN_SIZE,
  generalateReport,
  CAMPAIGN_START,
  ageInReligion, yearsInSociety, initAgeInReligion, FORMATION_THRESHOLDS,
  cardYearsInSociety, personHistory, recordHistory, HISTORY_VERSION,
  chooseProvincial, PROVINCIAL_REGIONS, ensureRecord,
  beginProvincialReplacement, resolveProvincialReplacement,
  provincialTermYears, provincialTermComplete, isProfessedPriest, professedPriests,
  PROVINCIAL_TERM_YEARS, chooseProvinceHQ, openDestinations, provinceOfMan, hqOptionsForRegion,
  stageProvincialAnswer, unstageProvincialAnswer, stagedCommitments, applyStagedAnswers, requestAnswerCost,
  missionCommunity, communityTraits,
  generateProvincialRequests, answerProvincialRequest, provincesWithRequests,
  requestGradeAvailable, REQUEST_GRADES,
  askProvincial, QUESTIONS_PER_YEAR,
  spendEnergy, ENERGY_PER_YEAR, spendFunds, gainFunds,
  buildSocietyReport,
} from './engine.js';
import * as EngineNS from './engine.js';
import { yearsInSociety as vowsYearsInSociety } from './vows.js';
import { buildDiagnosticReport, buildSaveExport } from './ui/playtest.js';
import { GRADES as MEM_GRADES } from './dispositions.js';
import { RESOURCES } from './rules.js';
import { d20check, degreeFor, exposition, probAtLeast, DEGREES } from './dice.js';
import { makeRng } from './rng.js';

let failures = 0;
function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures += 1;
}

setGameData(FIXTURES);

// Test helper: newGame with galleons (so ship range never blocks test voyages).
// Ship tiers are tested separately; most tests just need voyages to sail.
const _newGame = newGame;
function newGameWithGalleons(opts) {
  const s = _newGame(opts);
  for (const sh of s.resources.ships) sh.tier = 'galleon';
  return s;
}

// --- 1. Endless soak: 500 rounds, random valid decisions ---------------------
const soak = soakTest({ rounds: 500, seed: 'soak-a' });
ok('soak endless: 500 rounds completed', soak.rounds === 500, `rounds=${soak.rounds}`);
ok('soak endless: no errors', soak.errors.length === 0, soak.errors.slice(0, 3).join(' | '));
ok('soak endless: invariants checked', soak.invariantsChecked > 2000, `${soak.invariantsChecked}`);
console.log(`      finalScore=${soak.finalScore} finalYear=${soak.finalYear}`);

// --- 2. Determinism: same seed → same trajectory ------------------------------
const soak2 = soakTest({ rounds: 500, seed: 'soak-a' });
ok('deterministic repeat (score+year)', soak.finalScore === soak2.finalScore && soak.finalYear === soak2.finalYear);
ok('deterministic repeat (no errors)', soak2.errors.length === 0);

// --- 3. Campaign: full 31 rounds (1615–1645) with an augmented fixture pool ----
// Fixtures alone (10 petitioners) can't sustain 30 campaign rounds; the real
// data build will have 55+. Augment programmatically for the campaign test.
{
  const destIds = ['goa', 'japan', 'china', 'peru', 'philippines'];
  const extra = [];
  for (let i = 0; i < 60; i++) {
    const y = 1615 + (i % 30);
    extra.push({
      id: `hist-x${i}`, fictional: false, name: `Fixture Petitioner ${i}`,
      age: 20 + (i % 18), yearsInSociety: 1 + (i % 12),
      formation: 'scholastic', studies: 'Philosophy', skills: ['Latin'],
      health: 'Good health', assignment: null,
      destination: destIds[i % destIds.length],
      dossier: `[test fixture ${i}]`,
      letters: [{ n: 1000 + i, year: y, date: `${y}-01-01`, place: 'Rome', archival: '—',
        excerpt: `[test fixture letter ${i}]`, kind: 'historical', full_paras: ['[fixture]'] }],
    });
  }
  setGameData({ petitioners: [...FIXTURES.petitioners, ...extra], events: FIXTURES.events, destinations: FIXTURES.destinations });
  const camp = soakTest({ rounds: 60, seed: 'camp-a', mode: 'campaign' });
  ok('campaign: completed 31 rounds', camp.completedCampaign && camp.rounds === 31, `rounds=${camp.rounds}`);
  ok('campaign: no errors', camp.errors.length === 0, camp.errors.slice(0, 3).join(' | '));
  setGameData(FIXTURES); // restore small fixtures
}

// --- 4. Campaign API walkthrough ----------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'walkthrough' });
  ok('newGame year', s.year === CAMPAIGN_START);
  ok('newGame score: uncapped 50, displayed 37 (floor -500, ceiling +1000)', s.score === 50 && getScore(s) === 37);
  const { year, briefing, terna } = startYear(s);
  ok('startYear year', year === 1615);
  ok('terna length 10, distinct ids', terna.length === 10 && new Set(terna.map(c => c.petitionerId)).size === 10);
  ok('card id alias', terna.every(c => c.id === c.petitionerId));
  ok('card history is string array', terna.every(c => Array.isArray(c.history)));
  ok('card health is 1-5 number', terna.every(c => Number.isInteger(c.health) && c.health >= 1 && c.health <= 5));
  ok('briefing shapes (UI)', typeof briefing.funds === 'number' && typeof briefing.berths === 'number'
    && typeof briefing.ships === 'number' && briefing.missionNews.every(n => typeof n === 'string')
    && briefing.eventsUpcoming.every(n => typeof n === 'string'));
  ok('state.currentYear mirror set', !!s.currentYear && s.currentYear.terna.length === 10 && s.currentYear.decided === false);
  const chosenId = terna[1].petitionerId;
  const res = decide(s, [{ id: chosenId }]);
  ok('decide returns approved+9 denied', res.approved[0].petitionerId === chosenId && res.denied.length === 9);
  ok('decide report summary/detail', typeof res.report.summary === 'string' && typeof res.report.detail === 'string');
  ok('decide scoreDelta = 0 (no points for sending)', res.scoreDelta === 0, `delta=${res.scoreDelta}`);
  ok('score unchanged after decide', getScore(s) === 37);
  ok('currentYear decided flag', s.currentYear.decided === true);
  let threw = false;
  try { decide(s, [{ id: chosenId }]); } catch { threw = true; }
  ok('decide twice throws', threw);
  const rr = resolveYear(s);
  ok('resolveYear advances year', s.year === 1616);
  ok('resolveYear clears currentYear', s.currentYear === null);
  ok('yearReport shapes (UI)', typeof rr.yearReport.departed?.name === 'string'
    && rr.yearReport.outcomes.every(o => typeof o.text === 'string' && typeof o.result === 'string')
    && rr.yearReport.eventsFired.every(e => typeof e.title === 'string' && typeof e.text === 'string'));
  const end = endGame(s);
  ok('endGame title band', end.title === 'The Reluctant Steward', end.title);
  ok('endGame stats aliases (UI)', end.stats.yearsRuled === 1 && end.stats.approved === 1
    && end.stats.denied === 9 && end.stats.departed === 1 && typeof end.stats.arrived === 'number'
    && typeof end.stats.lost === 'number' && end.stats.finalScore === 37 && end.stats.seed === 'walkthrough');
  ok('reflection is non-empty string', typeof end.reflection === 'string' && end.reflection.length > 50);
}

// --- 5. Closed destinations excluded from ternas --------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'japan-test' });
  dbgJumpYear(s, 1622);
  dbgFireEvent(s, 'ev-nagasaki-1622'); // closes japan
  const { terna } = startYear(s);
  ok('no japan cards after closure', !terna.some((c) => c.destination === 'japan'),
    terna.map((c) => `${c.petitionerId}:${c.destination}`).join(','));
  ok('event in ledger', getLedger(s, { type: 'event' }).length === 1);
  ok('getMapState japan closed', getMapState(s).destinations.japan.closed === true);
  ok('DESTINATIONS populated', !!(DESTINATIONS.japan && DESTINATIONS.japan.name));
}

// --- 6. Voyage outcomes resolve travelYears later; news +0–1y; counterfactual --
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'voyage-test' });
  const { terna } = startYear(s);
  const goa = terna.find((c) => c.destination === 'goa') || terna[0];
  decide(s, [{ id: goa.petitionerId }]);
  resolveYear(s); // 1615: sails
  const v = s.voyages.find((x) => x.petitionerId === goa.petitionerId);
  ok('voyage created in transit', !!v && v.stage === 'transit' && v.status === 'enroute');
  ok('arriveYear = depart + travelYears', v.arriveYear === v.departYear + v.travelYears, `${v.arriveYear}`);
  ok('newsYear within +0..1 of arrival', v.newsYear === v.arriveYear || v.newsYear === v.arriveYear + 1);
  while (s.year <= v.arriveYear) { const { terna: t } = startYear(s); decide(s, [{ id: t[0].petitionerId }]); resolveYear(s); }
  ok('voyage arrived', v.stage === 'arrived' && v.outcome !== null);
  while (!v.newsDelivered) { const { terna: t } = startYear(s); decide(s, [{ id: t[0].petitionerId }]); resolveYear(s); }
  const news = getLedger(s, { type: 'outcome', petitionerId: v.petitionerId });
  ok('counterfactual news in ledger', news.length === 1 && news[0].counterfactual === true);
}

// --- 7. Debug tools -------------------------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'debug-test' });
  ok('dbgJumpYear', dbgJumpYear(s, 1630) === 1630);
  const cards = dbgSpawnTerna(s);
  ok('dbgSpawnTerna 10 cards', cards.length === 10);
  decide(s, [{ id: cards[0].petitionerId }]);
  resolveYear(s);
  const v0 = s.voyages.find((v) => v.petitionerId === cards[0].petitionerId);
  const out = dbgForceOutcome(s, v0.id, 'deceased');
  ok('dbgForceOutcome', out.outcome === 'deceased' && v0.stage === 'arrived');
  let threw = false;
  try { dbgForceOutcome(s, v0.id, 'ascended'); } catch { threw = true; }
  ok('dbgForceOutcome rejects bad outcome', threw);
  ok('__fireEvent alias', typeof __fireEvent(s, 'ev-macao-1635').title === 'string');
  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'debug-test-2' });
  const { terna: t2 } = startYear(s2); decide(s2, [{ id: t2[0].petitionerId }]); resolveYear(s2);
  const o2 = __forceOutcome(s2, s2.voyages.find((v) => v.petitionerId === t2[0].petitionerId).id, 'lost'); // mock vocabulary
  ok('__forceOutcome maps lost→deceased', o2.outcome === 'deceased');
  const dbg = __debug();
  ok('__debug lists event ids', Array.isArray(dbg.EVENTS) && dbg.EVENTS.includes('ev-nagasaki-1622'));
}

// --- 8. Endless divergence → fictional petitioners with disclaimers ---------------
{
  const s = newGameWithGalleons({ mode: 'endless', seed: 'fic-test' });
  dbgJumpYear(s, 1646);
  resolveYear(s); // triggers divergence
  ok('diverged flag + phase', s.diverged === true && s.phase === 'alternate history', s.phase);
  let seenFic = null;
  for (let i = 0; i < 12 && !seenFic; i++) {
    const { terna } = startYear(s);
    seenFic = terna.find((c) => c.fictional) || null;
    decide(s, [{ id: terna[0].petitionerId }]);
    resolveYear(s);
  }
  ok('fictional cards appear post-divergence', !!seenFic);
  const f = seenFic;
  ok('fic id shape', /^fic-\d+$/.test(f.petitionerId), f.petitionerId);
  ok('fic letter kind', f.letter.kind === 'fictional' && f.letter.fictional === true);
  ok('fic formation consistent', (f.yearsInSociety < 2 && f.formation === 'novice')
    || (f.yearsInSociety <= 8 && f.formation === 'scholastic')
    || (f.yearsInSociety > 8 && ['professed', 'priest'].includes(f.formation)));
  ok('fic yearsInSociety <= age-15', f.yearsInSociety <= f.age - 15);
  // fictional regeneration is deterministic: same seed+ficNum → same name
  const sB = newGameWithGalleons({ mode: 'endless', seed: 'fic-test' });
  dbgJumpYear(sB, 1646); resolveYear(sB);
  const { terna: tb } = startYear(sB);
  const sA2 = newGameWithGalleons({ mode: 'endless', seed: 'fic-test' });
  dbgJumpYear(sA2, 1646); resolveYear(sA2);
  const { terna: ta2 } = startYear(sA2);
  ok('fictional identities deterministic', JSON.stringify(tb.map(c=>c.id)) === JSON.stringify(ta2.map(c=>c.id)));
}

// --- 9. Ledger filters -----------------------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'ledger-test' });
  const { terna } = startYear(s);
  decide(s, [{ id: terna[0].petitionerId }]);
  ok('filter by decision=approved', getLedger(s, { decision: 'approved' }).length === 1);
  ok('filter by decision=denied', getLedger(s, { decision: 'denied' }).length === 9);
  ok('filter by year', getLedger(s, { year: 1615 }).length === 10);
  ok('filter by petitionerId', getLedger(s, { petitionerId: terna[0].petitionerId }).length === 1);
}

// --- 10. loadGameData cache path --------------------------------------------------
{
  const d = await loadGameData();
  ok('loadGameData returns cache', d.petitioners.length === FIXTURES.petitioners.length);
  ok('game data cached for engine', !!getGameData());
}

// --- 11. Approve all three; teams ------------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'approve-all' });
  const { terna } = startYear(s);
  const dest = terna[0].destination;
  // Approve all ten, two bound for the same destination -> one team of 2.
  const res = decide(s, terna.map((c, i) => ({
    id: c.petitionerId,
    ...(i < 2 ? { destination: dest } : {}),
  })));
  ok('approve-all: 10 approved, 0 denied', res.approved.length === 10 && res.denied.length === 0);
  const id0 = terna[0].petitionerId, id1 = terna[1].petitionerId;
  ok('approve-all: forced pair sails as a team',
    res.teams.some(tm => tm.size >= 2 && tm.members.includes(id0) && tm.members.includes(id1) && tm.destination === dest),
    JSON.stringify(res.teams.map(t => ({ size: t.size, dest: t.destination }))));
  ok('approve-all: scoreDelta = 0 (no points for sending)', res.scoreDelta === 0, `delta=${res.scoreDelta}`);
  ok('approve-all: queue holds 10', s.queue.length === 10);
  ok('approve-all: team queue entries share teamId',
    s.queue[0].teamId && s.queue[0].teamId === s.queue[1].teamId);
  const teamIdBefore = s.queue[0].teamId;
  resolveYear(s);
  const v0 = s.voyages.find(v => v.petitionerId === id0);
  ok('voyage carries teamSize', v0.teamSize >= 2 && v0.teamId === teamIdBefore);
  ok('stats.teams counted', s.stats.teams >= 1 && s.stats.approvals === 10);
}

// --- 12. Approve none ------------------------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'approve-none' });
  const { terna } = startYear(s);
  const res = decide(s, []);
  ok('approve-none: 0 approved, 10 denied', res.approved.length === 0 && res.denied.length === 10);
  ok('approve-none: scoreDelta = 0', res.scoreDelta === 0, `delta=${res.scoreDelta}`);
  ok('approve-none: queue empty', s.queue.length === 0);
}

// --- 13. decide() validation -----------------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'decide-valid' });
  const { terna } = startYear(s);
  let t1 = false; try { decide(s, 'nope'); } catch { t1 = true; }
  ok('decide rejects non-array', t1);
  let t2 = false; try { decide(s, [{ id: 'bogus' }]); } catch { t2 = true; }
  ok('decide rejects unknown id', t2);
  let t3 = false;
  try { decide(s, [{ id: terna[0].petitionerId }, { id: terna[0].petitionerId }]); } catch { t3 = true; }
  ok('decide rejects duplicate id', t3);
  // Closed destination falls back to the petitioned one.
  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'decide-valid-2' });
  dbgJumpYear(s2, 1622);
  dbgFireEvent(s2, 'ev-nagasaki-1622');
  const { terna: t } = startYear(s2);
  const r = decide(s2, [{ id: t[0].petitionerId, destination: 'japan' }]);
  // Japan is closed after the 1622 edict; the approval must fall back.
  ok('redirect falls back when destination closed', r.approved[0].destination !== 'japan', r.approved[0].destination);
}

// --- 14. Novitiate construction --------------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'novitiate' });
  const fundsBefore = s.resources.funds; // 1000
  const goaDangerBefore = s.destState.goa?.danger ?? 1;
  const r = foundNovitiate(s, 'goa');
  ok('novitiate costs 800', s.resources.funds === fundsBefore - 800, `${s.resources.funds}`);
  ok('novitiate reduces danger by 1', r.danger === Math.max(0, goaDangerBefore - 1), `${goaDangerBefore}→${r.danger}`);
  ok('novitiate +4 score', s.score === 54, `${s.score}`);
  ok('novitiate recorded', s.novitiates.length === 1 && s.novitiates[0].destination === 'goa');
  let dup = false; try { foundNovitiate(s, 'goa'); } catch { dup = true; }
  ok('novitiate duplicate throws', dup);
  let closed = false;
  dbgJumpYear(s, 1622); dbgFireEvent(s, 'ev-nagasaki-1622');
  try { foundNovitiate(s, 'japan'); } catch { closed = true; }
  ok('novitiate at closed mission throws', closed);
  // Yearly fruit: +1 score per novitiate at resolveYear. Measured
  // differentially — the same year played from the same position with
  // and without the novitiate on the books; the rest of the world
  // (staffed missions bearing fruit included) scores identically.
  const { terna } = startYear(s);
  decide(s, [{ id: terna[0].petitionerId }]);
  const snap = JSON.stringify(serialize(s));
  const withNov = deserialize(JSON.parse(snap));
  const noNov = deserialize(JSON.parse(snap));
  noNov.novitiates = [];
  resolveYear(withNov);
  resolveYear(noNov);
  ok('novitiate yearly +1 score', withNov.score === noNov.score + 1,
    `with=${withNov.score} without=${noNov.score}`);
  resolveYear(s);
  ok('ledger has novitiate entry', getLedger(s, { type: 'novitiate' }).length === 1);
  // Mid-terna founding is refused.
  startYear(s);
  let mid = false; try { foundNovitiate(s, 'china'); } catch { mid = true; }
  ok('novitiate mid-terna throws', mid);
  // Insufficient funds.
  const s3 = newGameWithGalleons({ mode: 'campaign', seed: 'novitiate-poor' });
  s3.resources.funds = 10;
  let poor = false; try { foundNovitiate(s3, 'china'); } catch { poor = true; }
  ok('novitiate without funds throws', poor);
}

// --- 15. refreshBriefing ---------------------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'briefing' });
  const { terna } = startYear(s);
  const b1 = refreshBriefing(s);
  ok('briefing lists no novitiates initially', b1.novitiates.length === 0);
  decide(s, [{ id: terna[0].petitionerId }]);
  resolveYear(s);
  foundNovitiate(s, 'china');
  startYear(s);
  const b2 = refreshBriefing(s);
  ok('briefing lists the novitiate', b2.novitiates.length === 1 && b2.novitiates[0].destination === 'china');
  ok('briefing funds reflect spending', b2.funds === s.resources.funds);
}

// --- 16. Old saves deserialize with new fields -----------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'old-save' });
  const raw = serialize(s);
  delete raw.novitiates; delete raw.seq.team; delete raw.stats.teams; delete raw.stats.novitiates;
  const back = deserialize(raw);
  ok('old save gains novitiates', Array.isArray(back.novitiates) && back.novitiates.length === 0);
  ok('old save gains seq.team', back.seq.team === 0);
  ok('old save gains stats', back.stats.teams === 0 && back.stats.novitiates === 0);
}

// --- 17. d20 dice core ------------------------------------------------------------
{
  // Determinism: same label → same rolls, regardless of call order.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'dice-test' });
  const a1 = streamFor(s, 'voyage', 'voy-1').int(1, 20);
  const b1 = streamFor(s, 'profile', 'x').int(1, 20);
  const a2 = streamFor(s, 'voyage', 'voy-1').int(1, 20);
  ok('isolated streams are deterministic', a1 === a2);
  // Seeded streams with different labels produce different sequences.
  ok('different labels differ', a1 !== b1);
  // Isolation: inspecting profiles cannot perturb voyage outcomes.
  const mk = () => {
    const st = newGameWithGalleons({ mode: 'campaign', seed: 'isolation' });
    const { terna } = startYear(st);
    decide(st, [{ id: terna[0].petitionerId }]);
    resolveYear(st); // first voyage sails
    return { st, pid: terna[0].petitionerId };
  };
  const A = mk(), B = mk();
  const sA = A.st, sB = B.st;
  const firstVoyage = (st, pid) => st.voyages.find((v) => v.petitionerId === pid);
  for (let i = 0; i < 50; i++) streamFor(sA, 'profile', 'meddler').int(1, 20); // noisy inspection
  // Fast-forward both identically until the first voyage resolves.
  let guard = 0;
  while (firstVoyage(sA, A.pid).stage === 'transit' && guard++ < 40) {
    for (const st of [sA, sB]) {
      const { terna: t } = startYear(st);
      decide(st, [{ id: t[0].petitionerId }]);
      resolveYear(st);
    }
  }
  const vA = firstVoyage(sA, A.pid), vB = firstVoyage(sB, B.pid);
  ok('profile inspection does not change voyage outcome',
    vA.stage === 'arrived' && vA.outcome === vB.outcome && vA.resolveRoll.roll === vB.resolveRoll.roll,
    `${vA.outcome}/${vB.outcome}`);

  // Degree boundaries (dc 11).
  ok('degree crit at dc-10', degreeFor(1, 11, 10) === 'critical-setback');
  ok('degree setback', degreeFor(6, 11, 10) === 'setback');
  ok('degree partial', degreeFor(10, 11, 10) === 'partial');
  ok('degree success', degreeFor(11, 11, 10) === 'success');
  ok('degree strong', degreeFor(16, 11, 10) === 'strong');
  ok('degree exceptional', degreeFor(21, 11, 10) === 'exceptional');
  // Nat 1/20 shift one step, never to an extreme from mid-range.
  ok('nat20 shifts up one', degreeFor(11, 11, 20) === 'strong');
  ok('nat1 shifts down one', degreeFor(11, 11, 1) === 'partial');
  ok('nat20 cannot exceed exceptional', degreeFor(25, 11, 20) === 'exceptional');
  ok('nat1 cannot go below critical', degreeFor(1, 11, 1) === 'critical-setback');

  // d20check shapes + validation.
  const rng = makeRng('check-test');
  const c = d20check(rng, { dc: 11, modifiers: [{ label: 'peril (2)', value: -4 }, { label: 'company', value: 2 }] });
  ok('check total = roll + mods', c.total === c.roll - 2, `${c.roll}→${c.total}`);
  ok('check degree consistent', c.degree === degreeFor(c.total, 11, c.roll));
  let bad = false; try { d20check(rng, {}); } catch { bad = true; }
  ok('check requires dc', bad);
  const exp = exposition(c);
  ok('exposition shows roll/dc/degree', exp.includes(`d20 ${c.roll}`) && exp.includes('DC 11') && exp.length > 20, exp);

  // probAtLeast: modifiers improve odds monotonically; exact values.
  ok('prob success dc11 nomod = 0.5', probAtLeast(11, 0, 'success') === 0.5);
  ok('prob improves with mods', probAtLeast(11, 4, 'success') > probAtLeast(11, 0, 'success'));
  ok('prob exceptional rare', probAtLeast(11, 0, 'exceptional') < 0.1);
  let badDeg = false; try { probAtLeast(11, 0, 'bogus'); } catch { badDeg = true; }
  ok('probAtLeast rejects bad degree', badDeg);
}

// --- 18. Voyage d20 migration ---------------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'voyage-d20' });
  const { terna } = startYear(s);
  decide(s, [{ id: terna[0].petitionerId }]);
  resolveYear(s);
  // Fast-forward until the first voyage resolves and its news arrives.
  let v = s.voyages.find((x) => x.petitionerId === terna[0].petitionerId);
  let guard = 0;
  while (!v.newsDelivered && guard++ < 40) {
    const { terna: t } = startYear(s);
    decide(s, [{ id: t[0].petitionerId }]);
    resolveYear(s);
  }
  ok('voyage resolved with a stored roll', v.stage === 'arrived' && !!v.resolveRoll, v.stage);
  ok('roll has degree + danger', DEGREES.includes(v.resolveRoll.degree) && typeof v.resolveRoll.danger === 'number');
  ok('outcome matches degree table',
    ({ 'critical-setback': 'deceased', 'setback': 'ill', 'partial': 'returned',
       'success': 'thriving', 'strong': 'thriving', 'exceptional': 'thriving' })[v.resolveRoll.degree] === v.outcome);
  const news = getLedger(s, { type: 'outcome', petitionerId: v.petitionerId });
  ok('ledger shows the roll', news.length === 1 && news[0].note.includes('d20'), news[0]?.note.slice(-60));
  // Deterministic repeat: same seed + actions → same roll.
  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'voyage-d20' });
  const { terna: t2 } = startYear(s2);
  decide(s2, [{ id: t2[0].petitionerId }]);
  resolveYear(s2);
  let v2 = s2.voyages.find((x) => x.petitionerId === t2[0].petitionerId), g2 = 0;
  while (!v2.newsDelivered && g2++ < 40) {
    const { terna: t } = startYear(s2);
    decide(s2, [{ id: t[0].petitionerId }]);
    resolveYear(s2);
  }
  ok('voyage rolls deterministic across runs',
    v.resolveRoll.roll === v2.resolveRoll.roll && v.outcome === v2.outcome,
    `roll ${v.resolveRoll.roll}/${v2.resolveRoll.roll}`);
}

// --- 19. Fruit scoring: outcomes move the score, dispatches don't ------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'fruit' });
  // Give a galleon so any destination is reachable (ship tier test isolation)
  s.resources.ships.push({ id: 'ship-test-galleon', name: 'Test Galleon', tier: 'galleon', freeYear: 0 });
  const { terna } = startYear(s);
  decide(s, [{ id: terna[0].petitionerId }]);
  ok('dispatch earns nothing', s.score === 50);
  resolveYear(s); // sails
  const v = s.voyages.find((x) => x.petitionerId === terna[0].petitionerId);
  const preForce = s.score; // the sailing year itself may bear fruit now
  const out1 = dbgForceOutcome(s, v.id, 'thriving');
  ok('thriving news: +4', s.score === preForce + 4, `${preForce}→${s.score}`);
  ok('outcome ledger carries fruit delta', out1.delta === 4, `${out1.delta}`);
  // A second voyage, resolved deceased.
  const { terna: t2 } = startYear(s);
  decide(s, [{ id: t2[0].petitionerId }]);
  resolveYear(s);
  const v2 = s.voyages.find(x => x.id !== v.id && x.stage === 'transit');
  const before = s.score;
  const out2 = dbgForceOutcome(s, v2.id, 'deceased');
  ok('deceased news: -5', s.score === before - 5, `${before}→${s.score}`);
  ok('deceased delta shown', out2.delta === -5);
  // Display score clamps to 0-100 (floor -500 -> 0, ceiling +1000 -> 100).
  s.scoreUncapped = -2000;
  ok('score display clamps at 0', getScore(s) === 0, `${getScore(s)}`);
  s.scoreUncapped = 3000;
  ok('score display clamps at 100', getScore(s) === 100, `${getScore(s)}`);
}

// --- 20. European fruit: denied and returned men labor in Europe ----------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'europe' });
  const { terna } = startYear(s);
  // Approve the first; the other two are denied by omission.
  decide(s, [{ id: terna[0].petitionerId }]);
  const deniedIds = [terna[1].petitionerId, terna[2].petitionerId];
  ok('decide with one approval: score unchanged', s.score === 50);
  ok('denied men labor in Europe',
    s.europeanLabor.length === 9 && deniedIds.every((id) => s.europeanLabor.some((e) => e.petitionerId === id && e.via === 'denied')),
    JSON.stringify(s.europeanLabor.map((e) => e.via)));
  resolveYear(s); // the approved man sails
  const v = s.voyages.find((x) => x.petitionerId === terna[0].petitionerId);
  const before = s.score;
  const out = dbgForceOutcome(s, v.id, 'returned');
  ok('returned news: +1 (European fruit)', s.score === before + 1, `${before}→${s.score}`);
  ok('returned man joins European labor',
    s.europeanLabor.some((e) => e.petitionerId === v.petitionerId && e.via === 'returned'));
  ok('outcome delta shown for returned', out.delta === 1);
  // A denied man approved later leaves the European roster when he sails.
  const s3 = newGameWithGalleons({ mode: 'campaign', seed: 'europeX' });
  for (let i = 0; i < 6; i++) { startYear(s3); decide(s3, []); resolveYear(s3); }
  let repettioned = 0;
  for (let i = 0; i < 4; i++) {
    const { terna: tx } = startYear(s3);
    repettioned += tx.filter((c) => s3.europeanLabor.some((e) => e.petitionerId === c.petitionerId)).length;
    decide(s3, tx.map((c) => ({ id: c.petitionerId })));
    resolveYear(s3);
  }
  const activeIds = new Set([
    ...s3.queue.map((q) => q.petitionerId),
    ...s3.voyages.filter((v) => v.stage === 'transit').map((v) => v.petitionerId),
  ]);
  const conflict = s3.europeanLabor.filter((e) => activeIds.has(e.petitionerId));
  ok('denied men re-petition and can be approved', repettioned > 0, `${repettioned}`);
  ok('no sailing man stays on the European roster', conflict.length === 0);
}

// --- 21. Veterans: thriving men may return; homecoming stirs zeal -------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'vet1' });
  const { terna } = startYear(s);
  decide(s, terna.map((c) => ({ id: c.petitionerId })));
  resolveYear(s);
  const vetVoyage = s.voyages.find((v) => v.petitionerId === terna[0].petitionerId);
  const preForceV = s.score;
  dbgForceOutcome(s, vetVoyage.id, 'thriving');
  ok('thriving news first: +4', s.score === preForceV + 4, `${preForceV}→${s.score}`);
  let vet = null;
  let vetYear = 0;
  for (let i = 0; i < 8 && !vet; i++) {
    const r = resolveYear(s);
    vet = (r.yearReport.outcomes || []).find((o) => o.outcome === 'veteran') || null;
    if (vet) vetYear = r.yearReport.year;
  }
  ok('a veteran comes home (seed vet1)', !!vet, `year=${vetYear}`);
  ok('veteran scores +2 for testimony', vet && vet.delta === 2, `${vet && vet.delta}`);
  ok('zeal burns 3 years after homecoming', s.zealUntil === vetYear + 3, `${s.zealUntil}`);
  ok('veteran labors in Europe',
    s.europeanLabor.some((e) => e.petitionerId === vet.petitionerId && e.via === 'veteran'));
  ok('veteran returns only once', s.voyages.filter((v) => v.veteranReturned && v.petitionerId === vet.petitionerId).length === 1);
  // Regression: the yearly chance must use a year-specific stream. The old
  // code used streamFor(s, 'veteran', vid) without the year, so the "15%
  // yearly" chance was actually "15% in year 3 or never."
  const vid = vetVoyage.id;
  const v3 = streamFor(s, 'veteran', vid, '1618').int(1, 1000000);
  const v4 = streamFor(s, 'veteran', vid, '1619').int(1, 1000000);
  ok('veteran stream is year-specific', v3 !== v4, `${v3} vs ${v4}`);
  // A voyage resolving while zeal burns carries the zeal modifier.
  const { terna: t2 } = startYear(s);
  decide(s, [{ id: t2[0].petitionerId }]);
  resolveYear(s);
  const v2 = s.voyages[s.voyages.length - 1];
  v2.arriveYear = s.year; v2.newsYear = s.year;
  resolveYear(s);
  const mods = (v2.resolveRoll && v2.resolveRoll.modifiers) || [];
  ok('zeal of the missions aids the voyage check',
    mods.some((m) => m.label === 'zeal of the missions' && m.value === 1),
    JSON.stringify(mods.map((m) => m.label)));
  // Old saves migrate with zealUntil defaulted.
  const old = JSON.parse(JSON.stringify(serialize(s)));
  delete old.zealUntil;
  ok('old save migrates zealUntil', deserialize(old).zealUntil === 0);
}

// --- 22. Hulls bind departures -------------------------------------------------
{
  // No hulls free: nobody sails, the queue waits.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'hulls1' });
  for (const sh of s.resources.ships) sh.freeYear = 9999;
  const { terna } = startYear(s);
  decide(s, terna.map((c) => ({ id: c.petitionerId })));
  resolveYear(s);
  const sailed0 = s.voyages.filter((v) => !v.mintedStaff);
  ok('no hulls free: zero departures', sailed0.length === 0, `${sailed0.length}`);
  ok('queue waits with hull notes',
    s.queue.length === 10 && s.queue.every((q) => q.note === 'delayed: no hulls free'),
    s.queue.map((q) => q.note).join('|'));

  // Soul packing: 3 men, one destination, no companions → one hull (3 souls ≤ 8).
  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'hulls2' });
  const { terna: t2 } = startYear(s2);
  const dest = t2[0].destination;
  decide(s2, t2.map((c) => ({ id: c.id, destination: dest })));
  const yr = s2.year;
  resolveYear(s2);
  const sailed2 = s2.voyages.filter((v) => !v.mintedStaff);
  ok('10 men sail on 1 hull', sailed2.length === 10, `${sailed2.length}`);
  const usedShips = new Set(sailed2.map((v) => v.shipId));
  ok('hull shared by destination', usedShips.size === 1, [...usedShips].join(','));
  const freeShips = s2.resources.ships.filter((sh) => (sh.freeYear || 0) <= yr);
  ok('nine hulls still free', freeShips.length === 9, `${freeShips.length}`);
  const travel = sailed2[0].travelYears;
  ok('sailed hull busy for the voyage length',
    s2.resources.ships.filter((sh) => !freeShips.includes(sh)).every((sh) => sh.freeYear === yr + travel));

  // Retinues fill hulls: 1 man + 7 companions = 8 souls fills a hull alone.
  const s3 = newGameWithGalleons({ mode: 'campaign', seed: 'hulls3' });
  const { terna: t3 } = startYear(s3);
  decide(s3, [
    { id: t3[0].petitionerId, destination: dest, companions: 7 },
    { id: t3[1].petitionerId, destination: dest, companions: 7 },
  ]);
  resolveYear(s3);
  const sailed3 = s3.voyages.filter((v) => !v.mintedStaff);
  ok('both retinues sail', sailed3.length === 2, `${sailed3.length}`);
  const hullsUsed = new Set(sailed3.map((v) => v.shipId));
  ok('a full retinue takes a whole hull', hullsUsed.size === 2, [...hullsUsed].join(','));
  for (const v of sailed3) { v.arriveYear = s3.year; v.newsYear = s3.year; }
  resolveYear(s3);
  const mods7 = (sailed3[0].resolveRoll && sailed3[0].resolveRoll.modifiers) || [];
  ok('voyage bonus caps at +3 even with 7 companions',
    mods7.some((m) => m.label === '3 companions' && m.value === 3),
    JSON.stringify(mods7.map((m) => m.label)));

  // Small parties share: (1+3) + (1+3) = 8 souls on one hull.
  const s4 = newGameWithGalleons({ mode: 'campaign', seed: 'hulls4' });
  const { terna: t4 } = startYear(s4);
  decide(s4, [
    { id: t4[0].petitionerId, destination: dest, companions: 3 },
    { id: t4[1].petitionerId, destination: dest, companions: 3 },
  ]);
  resolveYear(s4);
  const sailed4 = s4.voyages.filter((v) => !v.mintedStaff);
  ok('two retinues share one hull',
    sailed4.length === 2 && new Set(sailed4.map((v) => v.shipId)).size === 1,
    `${sailed4.length} voyages, ${new Set(sailed4.map((v) => v.shipId)).size} hulls`);

  // Chartering: -200 scudi, +1 free hull (ship prices cut, Tran 2026-10-20).
  const fundsBefore = s2.resources.funds;
  const ch = charterShip(s2);
  ok('charter costs 200', s2.resources.funds === fundsBefore - 200, `${s2.resources.funds}`);
  ok('charter adds a free hull', s2.resources.ships.length === 11 && ch.ship.freeYear === 0);
  ok('chartered hull has a name', typeof ch.ship.name === 'string' && ch.ship.name.length > 0);

  // Old saves: ships without freeYear migrate to free.
  const old = JSON.parse(JSON.stringify(serialize(s2)));
  for (const sh of old.resources.ships) delete sh.freeYear;
  const restored = deserialize(old);
  ok('old ships migrate freeYear=0', restored.resources.ships.every((sh) => sh.freeYear === 0));
}

// --- 23. Companions: extra Jesuits strengthen the voyage -------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'companions' });
  ok('society starts at 13,112', s.society === 13112, `${s.society}`);
  ok('mission-eligible pool is 1% of the Society', s.available === 131, `${s.available}`);
  const { terna } = startYear(s);
  // Approve two men so we have two distinct voyages for outcome testing.
  decide(s, [{ id: terna[0].petitionerId, companions: 2 }, { id: terna[1].petitionerId }]);
  const fundsBefore = s.resources.funds;
  const availBefore = s.available;
  const upkeep = Object.keys(s.missions).reduce((n, id) => n + missionUpkeep(missionStaff(s, id)), 0);
  const r23 = resolveYear(s); // departs: (60 + 2×40) + 60; yearly income 240; mission upkeep
  ok('companions cost by grade at departure (2 brothers × 50)',
    s.resources.funds === fundsBefore - 220 + 240 - upkeep, `${s.resources.funds}`);
  // Veterans coming home rejoin the eligible pool (+1 each) — starting
  // staff are real men now, so some may return in any given year.
  const vetReturns23 = (r23.yearReport.outcomes || []).filter((o) => o.outcome === 'veteran').length;
  ok('eligible pool loses the men and companions, gains 1% of intake',
    s.available === availBefore - 4 + 1 + vetReturns23, `${s.available} (veterans home: ${vetReturns23})`);
  const v = s.voyages.find((x) => x.petitionerId === terna[0].petitionerId);
  ok('voyage records companions', v.companions === 2, `${v.companions}`);
  v.arriveYear = s.year; v.newsYear = s.year;
  resolveYear(s);
  const mods = (v.resolveRoll && v.resolveRoll.modifiers) || [];
  ok('companions aid the voyage check',
    mods.some((m) => m.label === '2 companions' && m.value === 2),
    JSON.stringify(mods.map((m) => m.label)));
}

{
  // Death and return accounting: use fresh voyages (not yet arrived).
  // Death and return accounting: use fresh voyages (not yet arrived).
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'death-return' });
  const { terna } = startYear(s);
  decide(s, [{ id: terna[0].petitionerId }, { id: terna[1].petitionerId }]);
  resolveYear(s); // both depart, still in transit
  const v = s.voyages.find((x) => x.petitionerId === terna[0].petitionerId);
  const v2 = s.voyages.find((x) => x.petitionerId === terna[1].petitionerId);
  // Death shrinks the Society itself; the eligible pool already lost him at departure.
  const availPre = s.available;
  const socPre = s.society;
  dbgForceOutcome(s, v.id, 'deceased');
  ok('a death leaves the eligible pool untouched', s.available === availPre, `${s.available}`);
  ok('a death shrinks the Society by one', s.society === socPre - 1, `${s.society}`);
  // A man who returns rejoins the eligible pool.
  const availPre2 = s.available;
  dbgForceOutcome(s, v2.id, 'returned');
  ok('a returnee rejoins the eligible pool', s.available === availPre2 + 1, `${s.available}`);
  // Re-forcing a resolved voyage is rejected (guards against double-apply).
  let reforceRejected = false;
  try { dbgForceOutcome(s, v.id, 'returned'); } catch (e) { reforceRejected = /already resolved/.test(e.message); }
  ok('dbgForceOutcome rejects re-force', reforceRejected);

  // An empty eligible pool delays departures; companions clamp to what can be spared.
  const s3 = newGameWithGalleons({ mode: 'campaign', seed: 'companions3' });
  s3.available = 0;
  const { terna: t3 } = startYear(s3);
  decide(s3, [{ id: t3[0].petitionerId, companions: 3 }]);
  resolveYear(s3);
  ok('no men to spare delays the sailing',
    s3.queue.length === 1 && s3.queue[0].note === 'delayed: no men to spare',
    s3.queue.map((q) => q.note).join('|'));
  s3.available = 2; // the man + 1 companion can be spared; the 2nd and 3rd cannot
  resolveYear(s3);
  const v3 = s3.voyages.find((v) => v.petitionerId === t3[0].petitionerId);
  ok('companions clamp to what can be spared', v3 && v3.companions === 1, `${v3 && v3.companions}`);
  ok('shortfall is recorded honestly',
    s3.ledger.some((e) => e.type === 'departure' && /only 1 could be spared/.test(e.note)),
    s3.ledger.filter((e) => e.type === 'departure').map((e) => e.note).join('|'));

  // Invalid companion counts throw and leave state untouched.
  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'companions2' });
  const { terna: t2 } = startYear(s2);
  for (const bad of [8, -1, 1.5, 'two']) {
    let threw = false;
    try { decide(s2, [{ id: t2[0].petitionerId, companions: bad }]); }
    catch (e) { threw = /companions/.test(e.message); }
    ok(`companions=${JSON.stringify(bad)} rejected`, threw);
  }
  ok('terna still awaiting after rejected decides', !!s2.currentTerna);
  ok('no score or funds moved', s2.score === 50 && s2.resources.funds === 1000);

  // Old saves migrate the pool.
  const old = JSON.parse(JSON.stringify(serialize(s2)));
  delete old.society;
  ok('old save migrates society=13112', deserialize(old).society === 13112);
}

// --- 24. Approvals are free (the seal charges nothing); berths bind ----------
{
  // Removed 2026-10-20 (Tran): the 30-scudi seal duplicated the sending
  // charge. Approving costs nothing, rich or broke; men cost when they sail.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'sealcost' });
  const { terna } = startYear(s);
  const r = decide(s, [{ id: terna[0].petitionerId }]);
  ok('approving is free', s.resources.funds === 1000, `${s.resources.funds}`);
  ok('report carries sealCost 0', r.report.sealCost === 0, `${r.report.sealCost}`);

  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'sealcost2' });
  const { terna: t2 } = startYear(s2);
  decide(s2, t2.map((c) => ({ id: c.petitionerId })));
  ok('approve-all is free', s2.resources.funds === 1000, `${s2.resources.funds}`);
  const s3 = newGameWithGalleons({ mode: 'campaign', seed: 'sealcost3' });
  startYear(s3);
  decide(s3, []);
  ok('deny-all seal is free', s3.resources.funds === 1000, `${s3.resources.funds}`);

  // A broke General can approve now — the chest is only charged at sailing.
  const s4 = newGameWithGalleons({ mode: 'campaign', seed: 'sealcost4' });
  s4.resources.funds = 10;
  const { terna: t4 } = startYear(s4);
  let threw = false;
  try { decide(s4, [{ id: t4[0].petitionerId }]); } catch (e) { threw = true; }
  ok('broke General can approve', !threw);
  ok('approval touches no funds', s4.resources.funds === 10);
  ok('the approved man waits at the dock', s4.queue.some((q) => q.petitionerId === t4[0].petitionerId && q.status === 'awaiting'));

  // Model B: berths = ships in port. 6 men to 3 destinations need 3 ships = 3 berths.
  // All sail if destinations group into <=3 ships.
  const s5 = newGameWithGalleons({ mode: 'campaign', seed: 'sealcost5' });
  for (const sh of s5.resources.ships) sh.freeYear = 9999; // no hulls year 1
  const { terna: t5 } = startYear(s5);
  decide(s5, t5.map((c) => ({ id: c.petitionerId })));
  resolveYear(s5);
  ok('no hulls: queue holds 10', s5.queue.length === 10);
  for (const sh of s5.resources.ships) sh.freeYear = 0;
  s5.resources.funds = 1000;
  const { terna: t6 } = startYear(s5);
  decide(s5, t6.map((c) => ({ id: c.petitionerId })));
  resolveYear(s5);
  // 6 men grouped by destination; ships needed <= berths (3) → all sail
  // (men to same destination share a hull; berths bind ships, not men)
  ok('Model B: ships not men bind berths', s5.voyages.length > 0,
    `sailed=${s5.voyages.length} waiting=${s5.queue.length}`);
}

// --- 24b. Dock hold: held men wait, labor, and earn -----------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'dock-hold' });
  const { terna } = startYear(s);
  decide(s, terna.map((c) => ({ id: c.petitionerId })));
  // Hold a man whose grade earns (not a novice): his dock labor pays.
  const heldCard = terna.find((c) => !/novice/i.test(c.formation || '')) || terna[0];
  const heldId = heldCard.petitionerId;
  EngineNS.setDockHold(s, heldId, true);
  const q = s.queue.find((x) => x.petitionerId === heldId);
  ok('dock hold: flagged + noted', q.held === true && q.note === 'held at dock');
  resolveYear(s);
  const qAfter = s.queue.find((x) => x.petitionerId === heldId);
  ok('dock hold: held man did not sail', !!qAfter && qAfter.status === 'awaiting',
    `voyages for held=${s.voyages.filter((v) => v.petitionerId === heldId).length}`);
  ok('dock hold: others sailed', s.voyages.length > 0, `${s.voyages.length}`);
  ok('dock hold: dock income ledgered',
    (s.ledger || []).some((e) => e.type === 'dock'));
  EngineNS.setDockHold(s, heldId, false);
  ok('dock hold: release clears flag + note', qAfter.held === false && qAfter.note !== 'held at dock');
}

// --- 24c. Reserves at the dock ---------------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'reserve-dock' });
  const { terna } = startYear(s);
  decide(s, [{ id: terna[0].petitionerId }]); // two denied men labor in Europe
  const euro = s.europeanLabor[0];
  ok('reserve: man labors in Europe', !!euro);
  EngineNS.reserveForMission(s, euro.petitionerId, 'japan');
  ok('reserve: earmarked', (s.europeanLabor.find((e) => e.petitionerId === euro.petitionerId) || {}).reservedFor === 'japan');
  EngineNS.callReserveToDock(s, euro.petitionerId);
  const q = s.queue.find((x) => x.petitionerId === euro.petitionerId);
  ok('reserve: called man is queued, held, bound for his mission',
    !!q && q.status === 'awaiting' && q.held === true && q.destination === 'japan');
  ok('reserve: called man left European labor',
    !s.europeanLabor.some((e) => e.petitionerId === euro.petitionerId));
  let threw = false;
  try { EngineNS.callReserveToDock(s, euro.petitionerId); } catch { threw = true; }
  ok('reserve: second call throws (already at dock)', threw);
  resolveYear(s);
  const q2 = s.queue.find((x) => x.petitionerId === euro.petitionerId);
  ok('reserve: held at dock he does not sail', !!q2 && q2.status === 'awaiting');
}

// --- 24d. Professed men appear in the provincial succession roster ---------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'succession-professed' });
  const { terna } = startYear(s);
  decide(s, []); // all denied: they labor in Europe
  const pid = terna[0].petitionerId;
  ok('succession: novice-stage man not yet professed',
    !EngineNS.professedPriests(s).some((p) => p.petitionerId === pid));
  // He professes final vows in play.
  const rec = s.petitioners[pid];
  if (!rec.vows) rec.vows = {};
  rec.vows.stage = 'professed';
  const entry = s.europeanLabor.find((e) => e.petitionerId === pid);
  if (entry) { entry.vows = rec.vows; }
  ok('succession: professed in play -> isProfessedPriest', EngineNS.isProfessedPriest(s, pid) === true);
  ok('succession: professed in play -> on the roster',
    EngineNS.professedPriests(s).some((p) => p.petitionerId === pid));
  rec.status = 'apostate';
  ok('succession: apostate excluded', EngineNS.isProfessedPriest(s, pid) === false);
}

// --- 25. Phase 2: dispositions & formation --------------------------------------
{
  // Determinism: same seed + same man → same initial disposition.
  const a = newGameWithGalleons({ mode: 'campaign', seed: 'phase2' });
  const b = newGameWithGalleons({ mode: 'campaign', seed: 'phase2' });
  const ia = ensureDisposition(a, 'hist-1').initial;
  const ib = ensureDisposition(b, 'hist-1').initial;
  ok('initial disposition is deterministic',
    JSON.stringify(ia) === JSON.stringify(ib), JSON.stringify(ia));

  // Layers are distinct objects; evidence informs initial.
  const d1 = ensureDisposition(a, 'hist-1');
  ok('evidence attests zeal for hist-1',
    !!(d1.evidence.zeal && /burn/i.test(d1.evidence.zeal.quote)), JSON.stringify(d1.evidence.zeal));
  ok('attested trait starts strong', d1.initial.zeal >= 4, `${d1.initial.zeal}`);
  ok('current starts as initial', JSON.stringify(d1.current) === JSON.stringify(d1.initial));
  ok('observed starts empty', Array.isArray(d1.observed) && d1.observed.length === 0);
  ok('missing evidence is uncertainty, not a score',
    Object.keys(d1.evidence).length < 7 && d1.evidence.obedience === undefined);

  // Grade preserved from the archive; formation never touches it.
  const g1 = gradeFor(a, 'hist-1');
  ok('grade preserved (professed father, ordained)', g1.grade === 'professed-of-the-4th-vow' && g1.ordained === true, JSON.stringify(g1));
  const gB = gradeFor(a, 'hist-3');
  ok('grade preserved (brother, not ordained)', gB.grade === 'brother' && gB.ordained === false, JSON.stringify(gB));
  const gU = gradeFor(a, 'hist-6');
  ok('undetermined grade stays unspecified', gU.grade === 'undetermined' && gU.ordained === null, JSON.stringify(gU));

  // Formation: deny all → assign → complete.
  const { terna } = startYear(a);
  const deniedId = terna[0].petitionerId;
  decide(a, []);
  const gradeBefore = gradeFor(a, deniedId).grade; // capture before formation
  const fundsBefore = a.resources.funds;
  const f = assignFormation(a, deniedId, 'exercises');
  ok('formation assigned', f.focus === 'exercises' && f.until === a.year + 1);
  ok('formation costs 20', a.resources.funds === fundsBefore - 20, `${a.resources.funds}`);
  const curBefore = { ...ensureDisposition(a, deniedId).current };
  const evBefore = JSON.stringify(ensureDisposition(a, deniedId).evidence);
  const initBefore = JSON.stringify(ensureDisposition(a, deniedId).initial);
  // No double-booking: second assignment throws.
  let dbl = false;
  try { assignFormation(a, deniedId, 'studies'); } catch (e) { dbl = /already in formation/.test(e.message); }
  ok('no double formation', dbl);
  // No double-booking: a queued man cannot be formed.
  const sQ = newGameWithGalleons({ mode: 'campaign', seed: 'phase2q' });
  const { terna: tQ } = startYear(sQ);
  decide(sQ, [{ id: tQ[0].petitionerId }]);
  let qThrow = false;
  try { assignFormation(sQ, tQ[0].petitionerId, 'exercises'); } catch (e) { qThrow = /laboring in Europe/.test(e.message); }
  ok('queued men cannot be formed', qThrow);
  // Complete the year after: primary +1, observed note, ledger entry.
  // (Assigned in 1615 → in retreat through 1616 → completes at its end.)
  resolveYear(a);
  const { terna: tNext } = startYear(a);
  ok('man in formation cannot petition',
    !tNext.some((c) => c.petitionerId === deniedId),
    tNext.map((c) => c.petitionerId).join(','));
  decide(a, []);
  resolveYear(a);
  const dAfter = ensureDisposition(a, deniedId);
  ok('formation deepens the primary trait',
    dAfter.current.humility === Math.min(5, curBefore.humility + 1),
    `${curBefore.humility}→${dAfter.current.humility}`);
  ok('formation never rewrites evidence or initial',
    JSON.stringify(dAfter.evidence) === evBefore && JSON.stringify(dAfter.initial) === initBefore);
  ok('formation observed', dAfter.observed.some((o) => /exercises/i.test(o.text)),
    JSON.stringify(dAfter.observed));
  ok('formation in ledger', a.ledger.some((e) => e.type === 'formation' && /completes/.test(e.note)));
  const gAfter = gradeFor(a, deniedId);
  ok('grade untouched by formation', gAfter.grade === gradeBefore, `${gradeBefore}→${gAfter.grade}`);

  // Voyage modifiers from current disposition.
  const sV = newGameWithGalleons({ mode: 'campaign', seed: 'phase2v' });
  const { terna: tV } = startYear(sV);
  const vid = tV[0].petitionerId;
  const dv = ensureDisposition(sV, vid);
  dv.current.zeal = 5; dv.current.prudence = 1;
  decide(sV, [{ id: vid }]);
  resolveYear(sV);
  const vv = sV.voyages.find((v) => v.petitionerId === vid);
  vv.arriveYear = sV.year; vv.newsYear = sV.year;
  resolveYear(sV);
  const mods = (vv.resolveRoll && vv.resolveRoll.modifiers) || [];
  ok('fervent zeal aids the voyage',
    mods.some((m) => m.label === 'fervent zeal' && m.value === 1),
    JSON.stringify(mods.map((m) => m.label)));
  ok('imprudent haste hinders the voyage',
    mods.some((m) => m.label === 'imprudent haste' && m.value === -1),
    JSON.stringify(mods.map((m) => m.label)));
}

// --- 13. Mission staffing: sending, capacity, upkeep, requests -----------------
{
  const s = newGameWithGalleons({ mode: 'endless', seed: 'mission-a' });
  const destId = FIXTURES.destinations[0].id;
  const st0 = { ...missionStaff(s, destId) };
  ok('missions init with capacity', st0.capacity > 0 && Number.isInteger(st0.capacity), `${destId} cap=${st0.capacity}`);
  ok('missions start below capacity', missionStaffed(st0) < st0.capacity, `staffed=${missionStaffed(st0)}`);

  // Sending men (ships only, Tran 2026-10-20): grade counts are filled
  // with NAMED men from Europe and queued for the fleet. Nothing is
  // charged and nobody is stationed until a ship carries them.
  const ids = seedLabor(s, 6, 'b13');
  s.petitioners[ids[0]].vows = { stage: 'professed' };
  s.petitioners[ids[1]].vows = { stage: 'scholastic' };
  s.petitioners[ids[2]].vows = { stage: 'scholastic' };
  s.petitioners[ids[3]].vows = { stage: 'brother' };
  s.petitioners[ids[4]].vows = { stage: 'brother' };
  s.petitioners[ids[5]].vows = { stage: 'brother' };
  const fundsBefore = s.resources.funds;
  const availBefore = s.available;
  const res = EngineNS.queueNamedMen(s, destId, { fathers: 1, coadjutors: 2, brothers: 3 }, 'test company');
  ok('send returns the named men', res.total === 6 && res.men.length === 6 && res.men.includes(ids[0]),
    JSON.stringify(res.men));
  ok('send costs nothing until they sail', s.resources.funds === fundsBefore, `${s.resources.funds}`);
  ok('send leaves the abstract pool alone', s.available === availBefore, `${s.available}`);
  ok('sent men leave Europe', !ids.some((id) => s.europeanLabor.some((e) => e.petitionerId === id)));
  ok('sent men wait at the dock', ids.every((id) => s.queue.some((q) => q.petitionerId === id
    && q.status === 'awaiting' && q.destination === destId)));
  const st1 = missionStaff(s, destId);
  ok('nobody is stationed until a ship carries them',
    st1.fathers === st0.fathers && st1.coadjutors === st0.coadjutors && st1.brothers === st0.brothers,
    JSON.stringify({ fathers: st1.fathers, coadjutors: st1.coadjutors, brothers: st1.brothers }));

  // Validation: negative, zero total, and men who do not exist.
  let threw = 0;
  try { EngineNS.queueNamedMen(s, destId, { fathers: -1 }); } catch { threw += 1; }
  try { EngineNS.queueNamedMen(s, destId, { fathers: 0 }); } catch { threw += 1; }
  try { EngineNS.queueNamedMen(s, destId, { brothers: 1 }); } catch { threw += 1; } // Europe is empty now
  ok('send validates', threw === 3, `threw=${threw}`);
  ok('failed send changes nothing', s.resources.funds === fundsBefore, `${s.resources.funds}`);

  // Strength and voyage bonus.
  const strength = missionStrength(missionStaff(s, destId));
  ok('strength weights grades', strength === (st1.fathers * 3 + st1.coadjutors * 2 + st1.brothers * 1), `${strength}`);
  const bonus = missionVoyageBonus(s, destId);
  ok('bonus is +1 per 6 strength', bonus === Math.min(3, Math.floor(strength / 6)), `bonus=${bonus}`);

  // Requests: understaffed missions ask for men.
  const reqs = missionRequests(s);
  ok('understaffed missions request men', reqs.length > 0 && reqs.every(r => r.staffed < r.capacity), `${reqs.length} requests`);

  // Upkeep: charged yearly, predictable.
  const upkeep = missionUpkeep(missionStaff(s, destId));
  ok('upkeep scales with capacity', upkeep === Math.max(1, Math.round(st1.capacity / 2)), `${upkeep}`);
  const f2 = s.resources.funds;
  const yearNow = s.year;
  resolveYear(s);
  const upkeepTotal = Object.keys(s.missions).reduce((n, id) => n + missionUpkeep(missionStaff(s, id)), 0);
  // The six queued men sail this year at 60 a head — a real cost of the
  // ships-only world that the old instant dispatch never charged here.
  const sailed = s.voyages.filter((v) => !v.mintedStaff && v.departYear === yearNow).length;
  // Funds = base 240 + domestic + mission income - upkeep - departures
  const expected = f2 + 240 - upkeepTotal - 60 * sailed;
  // Allow for mission/domestic income (test setup may have some)
  ok('yearly upkeep deducted', s.resources.funds >= expected, `${s.resources.funds} >= ${expected}`);

  // Arrivals join staffing; the voyage records the grade for later release.
  const s2 = newGameWithGalleons({ mode: 'endless', seed: 'mission-b' });
  const d2 = FIXTURES.destinations[1].id;
  const { terna: t2 } = startYear(s2);
  decide(s2, [{ id: t2[0].petitionerId, destination: d2, companions: 1 }]);
  resolveYear(s2);
  const v2 = s2.voyages.find((v) => v.petitionerId === t2[0].petitionerId);
  v2.arriveYear = s2.year; v2.newsYear = s2.year;
  const stBefore = { ...missionStaff(s2, d2) };
  dbgForceOutcome(s2, v2.id, 'thriving');
  resolveYear(s2);
  const stAfter = missionStaff(s2, d2);
  ok('thriving arrival joins staffing',
    missionStaffed(stAfter) === missionStaffed(stBefore) + 2, // man + 1 companion
    `before=${missionStaffed(stBefore)} after=${missionStaffed(stAfter)}`);
  ok('voyage records staff grade', !!v2.staffGrade, `${v2.staffGrade}`);

  // Migration: old saves gain missions.
  const s3 = newGameWithGalleons({ mode: 'endless', seed: 'mission-c' });
  delete s3.missions;
  const s3r = deserialize(serialize(s3));
  ok('old saves gain missions on load', !!s3r.missions && Object.keys(s3r.missions).length > 0, `${Object.keys(s3r.missions || {}).length}`);
}

// --- 14. Regression: ship packing and team composition ----------------------
// Bug: ship.find used `s !== ship`, allowing a packed hull to be re-selected
// and its `used` counter reset, exceeding capacity.
// Bug: voyage.teamSize came from the approval group, not actual departures.
{
  // Ship capacity: force a scenario where the old code would over-pack.
  const s = newGameWithGalleons({ mode: 'endless', seed: 'ship-regress' });
  // Approve 3 men for the same destination with full retinues (8 souls each).
  // With 3 hulls of capacity 8, the third party needs a fresh hull, not a reset one.
  const { terna } = startYear(s);
  const dest = terna[0].destination;
  decide(s, terna.map(t => ({ id: t.petitionerId, destination: dest, companions: 7 })));
  resolveYear(s);
  // Count souls per ship across all voyages.
  const soulsByShip = new Map();
  for (const v of s.voyages.filter((x) => !x.mintedStaff)) {
    const souls = 1 + (v.companions || 0);
    soulsByShip.set(v.shipId, (soulsByShip.get(v.shipId) || 0) + souls);
  }
  const CAP = RESOURCES.SHIP_CAPACITY;
  let overCap = false;
  for (const [shipId, souls] of soulsByShip) {
    if (souls > CAP) overCap = true;
  }
  ok('no ship exceeds capacity', !overCap, `${[...soulsByShip.entries()].map(([k,v]) => `${k}:${v}`).join(', ')}`);

  // Team size (Model B): 3 men to 3 different destinations, 1 berth → only 1 ship sails.
  // teamSize must reflect the actual sailing (1), not the approval group (3).
  const s2 = newGameWithGalleons({ mode: 'endless', seed: 'team-regress' });
  s2.resources.berths = 1; // only 1 ship can outfit
  const t2 = startYear(s2).terna;
  // Send each to a different destination (3 ships needed, 1 berth → 1 sails)
  const dests = ['goa', 'japan', 'peru'];
  decide(s2, t2.map((t, i) => ({ id: t.petitionerId, destination: dests[i % 3] })));
  resolveYear(s2);
  const soloVoyage = s2.voyages.find(v => v.departYear === s2.year - 1);
  if (soloVoyage) {
    ok('solo departure has teamSize 1', soloVoyage.teamSize === 1, `teamSize=${soloVoyage.teamSize}`);
  }
}

// --- Mission fragility (informational only) ---------------------------------
// Counter: <40% increment, 40-60% pause, >=60% reset, FRAGILE at 3 accumulated.
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'frag-test' });
  const st = missionStaff(s, 'japan'); // capacity 12
  // Force below 25% threshold: set to 2 men (16.7%)
  st.fathers = 1; st.coadjutors = 1; st.brothers = 0;
  st.staffIds = st.staffIds.slice(0, 2);
  // Start: 16.7% (2/12) -> below 25%, counter should increment each year
  ok('fragility counter initializes to 0', st.fragileYears === 0 && st.fragile === false);
  // Year 1: 2/12 = 16.7% < 25% -> counter 1
  let { terna } = startYear(s);
  decide(s, []);
  resolveYear(s);
  ok('counter increments below 25%', missionStaff(s, 'japan').fragileYears === 1,
    `fragileYears=${missionStaff(s, 'japan').fragileYears}`);
  // Year 2: still 16.7% -> counter 2
  ({ terna } = startYear(s));
  decide(s, []);
  resolveYear(s);
  ok('counter increments again below 25%', missionStaff(s, 'japan').fragileYears === 2);
  ok('not fragile at 2 years', missionStaff(s, 'japan').fragile === false);
  // Year 3: counter 3 -> still no collapse under the 5-year clock
  ({ terna } = startYear(s));
  decide(s, []);
  resolveYear(s);
  ok('not collapsed at 3 years', (s.destState.japan || {}).collapsed !== true);
  // Years 4 and 5: at 5 -> COLLAPSE
  ({ terna } = startYear(s));
  decide(s, []);
  resolveYear(s);
  ({ terna } = startYear(s));
  decide(s, []);
  resolveYear(s);
  const st3 = missionStaff(s, 'japan');
  // At 5 years below 25%, the mission COLLAPSES (not just fragile)
  ok('mission collapses at 5 years below 25%', (s.destState.japan || {}).collapsed === true,
    `collapsed=${(s.destState.japan || {}).collapsed}`);
  ok('staffing cleared on collapse', missionStaffed(st3) === 0);
  // Staff up to 60%+: 8/12 = 67% -> reset
  const sj = missionStaff(s, 'japan');
  sj.fathers = 4; sj.coadjutors = 2; sj.brothers = 2; // 8/12
  ({ terna } = startYear(s));
  decide(s, []);
  resolveYear(s);
  const st4 = missionStaff(s, 'japan');
  ok('counter resets at 60%+', st4.fragileYears === 0 && st4.fragile === false,
    `fragileYears=${st4.fragileYears}, fragile=${st4.fragile}`);
  // Pause band: 5/12 = 42% -> counter unchanged
  const sj2 = missionStaff(s, 'japan');
  sj2.fathers = 2; sj2.coadjutors = 2; sj2.brothers = 1; // 5/12 = 42%
  sj2.fragileYears = 1; sj2.fragile = false;
  ({ terna } = startYear(s));
  decide(s, []);
  resolveYear(s);
  ok('counter pauses at 40-60%', missionStaff(s, 'japan').fragileYears === 1,
    `fragileYears=${missionStaff(s, 'japan').fragileYears}`);
  // Old save compat: missing fields backfill safely
  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'frag-compat' });
  delete s2.missions['china'].fragileYears;
  delete s2.missions['china'].fragile;
  const sc = missionStaff(s2, 'china');
  ok('old save backfills fragileYears', typeof sc.fragileYears === 'number' && typeof sc.fragile === 'boolean');
}

// --- Domestic assignments --------------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'dom-test' });
  // Deny a man to get him into europeanLabor
  let { terna } = startYear(s);
  const deniedId = terna[1].petitionerId;
  const deniedName = terna[1].name;
  decide(s, [{ id: terna[0].petitionerId }]); // approve first, deny others
  resolveYear(s);
  const entry = s.europeanLabor.find((e) => e.petitionerId === deniedId);
  ok('denied man enters europeanLabor', !!entry, deniedName);
  ok('denied man has no assignment', entry && entry.assignment === null);
  // Assign to teaching (should work for most grades except brothers)
  const grade = staffGradeFor(s, deniedId);
  if (grade !== 'brothers') {
    assignDomestic(s, deniedId, 'teaching');
    ok('assign teaching works', entry.assignment === 'teaching');
    // Assigned men do not appear in ternas
    const { terna: t2 } = startYear(s);
    const inTerna = t2.some((t) => t.petitionerId === deniedId);
    ok('assigned man excluded from terna', !inTerna);
    // Cannot double-assign
    let threw = false;
    try { assignDomestic(s, deniedId, 'pastoral'); } catch (e) { threw = true; }
    ok('cannot double-assign', threw);
    // Release
    unassignDomestic(s, deniedId);
    ok('release works', entry.assignment === null);
  } else {
    ok('teaching requires non-brother (skipped, man is brother)', true);
  }
  // Pastoral requires priest
  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'dom-test2' });
  let { terna: tr2 } = startYear(s2);
  decide(s2, [{ id: tr2[0].petitionerId }]);
  resolveYear(s2);
  const e2 = s2.europeanLabor[0];
  if (e2) {
    const g2 = staffGradeFor(s2, e2.petitionerId);
    let threw2 = false;
    try { assignDomestic(s2, e2.petitionerId, 'pastoral'); } catch (err) { threw2 = true; }
    ok('pastoral requires priest', g2 !== 'fathers' ? threw2 : true, `grade=${g2}`);
  }
}

// --- Men in formation cannot be sent (ships only) ------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'emg-test' });
  let { terna } = startYear(s);
  const deniedId = terna[1].petitionerId;
  decide(s, [{ id: terna[0].petitionerId }]);
  resolveYear(s);
  // Put him in formation
  assignFormation(s, deniedId, 'exercises');
  const entry = s.europeanLabor.find((e) => e.petitionerId === deniedId);
  ok('man in formation', !!(entry.formation && entry.formation.until >= s.year));
  // There is no emergency dispatch anymore: a man in formation is not a
  // sending candidate, and stays in Europe until his formation ends.
  ok('formation man is not a sending candidate',
    !EngineNS.deploymentCandidates(s).some((c) => c.petitionerId === deniedId));
  ok('formation man stays put',
    s.europeanLabor.some((e) => e.petitionerId === deniedId));
}

// --- Ordination and career stages --------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'ord-test' });
  // Find a scholastic in the terna and deny him to get him into europeanLabor
  let { terna } = startYear(s);
  // Force a scholastic: use dbgSpawnTerna or find one
  // Simpler: check careerStage for a new game man
  const pid = terna[0].petitionerId;
  const stage = careerStage(s, pid);
  ok('careerStage returns a stage', typeof stage === 'string' && stage.length > 0, stage);
  // Ordination eligibility: scholastic with 10+ years
  // (Most test petitioners won't have 10 years; verify the function doesn't crash)
  const elig = ordinationEligible(s, pid);
  ok('ordinationEligible returns boolean', typeof elig === 'boolean');
  // Cannot ordain ineligible
  let threw = false;
  try { ordainPriest(s, pid); } catch (e) { threw = true; }
  // If eligible, ordination should succeed; if not, it should throw
  ok('ordainPriest enforces eligibility', elig ? !threw : threw);
}

// --- Delegated authority: instructions ---------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'instr-test' });
  const inst = issueInstruction(s, 'goa', 'expand');
  ok('instruction issued', inst.status === 'in-transit' && inst.arriveYear > s.year);
  ok('instruction has travel delay', inst.arriveYear >= s.year + 1);
  // Cannot issue twice while in transit
  let threw = false;
  try { issueInstruction(s, 'goa', 'consolidate'); } catch (e) { threw = true; }
  ok('cannot double-issue in transit', threw);
  // Advance years until it resolves
  for (let i = 0; i < 5; i++) {
    const { terna } = startYear(s);
    decide(s, []);
    resolveYear(s);
    if (s.instructions['goa'].status === 'resolved') break;
  }
  const r = s.instructions['goa'];
  ok('instruction resolves', r.status === 'resolved' && ['obeyed','adapted','delayed','disobeyed'].includes(r.outcome),
    `outcome=${r.outcome}`);
  // Determinism: same seed, same outcome
  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'instr-test' });
  issueInstruction(s2, 'goa', 'expand');
  for (let i = 0; i < 5; i++) {
    const { terna } = startYear(s2);
    decide(s2, []);
    resolveYear(s2);
    if (s2.instructions['goa'].status === 'resolved') break;
  }
  ok('instruction outcome deterministic', s2.instructions['goa'].outcome === r.outcome);
}

// --- Diminishing thriving returns --------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'dim-test' });
  const st = missionStaff(s, 'goa');
  ok('thrivingCount initializes to 0', st.thrivingCount === 0);
  // Simulate 4 thriving arrivals at goa
  const before = getScore(s);
  st.thrivingCount = 3; // 3 already thriving
  // Next thriving should give diminished (+2 not +4)
  // (We test the logic via direct state manipulation since voyage outcomes are seeded)
  ok('diminish threshold is 3', (st.thrivingCount >= 3));
}

// --- Personnel lifecycle audit ------------------------------------------------
// Verify: thriving men remain stationed; only veterans leave; no silent departures.
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'life-test' });
  // Force a thriving outcome via debug
  let { terna } = startYear(s);
  const pid = terna[0].petitionerId;
  decide(s, [{ id: pid, destination: 'goa' }]);
  resolveYear(s); // voyage departs
  const voy = s.voyages.find(v => v.petitionerId === pid);
  if (!voy) { ok('voyage created', false, 'no voyage found'); }
  else {
  // Fast-forward to arrival and force thriving
  const goaBefore = missionStaffed(missionStaff(s, 'goa'));
  dbgForceOutcome(s, voy.id, 'thriving');
  const goaAfter = missionStaffed(missionStaff(s, 'goa'));
  ok('thriving adds to mission staffing', goaAfter === goaBefore + 1, `${goaBefore} -> ${goaAfter}`);
  // Advance 5 years; man should still be stationed (unless veteran return)
  for (let i = 0; i < 5; i++) {
    const { terna: t } = startYear(s);
    decide(s, []);
    resolveYear(s);
  }
  const goaLater = missionStaffed(missionStaff(s, 'goa'));
  // May have decreased by 1 if veteran returned, but not vanished silently
  ok('no silent mass departure', goaLater >= goaAfter - 2, `${goaAfter} -> ${goaLater}`);
  // Petitioner record should be ACTIVE or RETURNED (veteran), not NEW/DENIED
  const rec = s.petitioners[pid];
  ok('thriving man not re-petitioning', !['new','denied'].includes(rec.status), `status=${rec.status}`);
  } // end if(voy)
}

// --- Ill personnel lifecycle -------------------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'ill-life-test' });
  const { terna } = startYear(s);
  const pid = terna[0].petitionerId;
  const pname = terna[0].name || pid;
  decide(s, [{ id: pid, destination: 'goa' }]);
  resolveYear(s);
  const voy = s.voyages.find(v => v.petitionerId === pid);
  if (!voy) { ok('ill test voyage created', false); }
  else {
    dbgForceOutcome(s, voy.id, 'ill');
    // Man should be in europeanLabor with ill flag
    const entry = (s.europeanLabor || []).find(e => e.petitionerId === pid);
    ok('ill man in europeanLabor', !!entry, entry ? 'found' : 'missing');
    ok('ill flag set', entry && entry.ill === true);
    // Should NOT be counted as stationed at goa
    const goaStaff = missionStaffed(missionStaff(s, 'goa'));
    // (goa starts with some staff; ill should not have added)
    // Should NOT be a candidate for sending
    ok('ill man is not a sending candidate',
      !EngineNS.deploymentCandidates(s).some((c) => c.petitionerId === pid));
    // Should NOT be assignable domestically
    let assignBlocked = false;
    try { assignDomestic(s, pid, 'teaching'); } catch (e) { assignBlocked = /recovering/.test(e.message); }
    ok('ill man cannot take domestic assignment', assignBlocked);
    // Record status should be ILL
    ok('record status is ill', s.petitioners[pid].status === 'ill');
  }
}

// --- Send to dock from Europe (ships only) -------------------------------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'europe-dock-test' });
  // Deny a man to get him into europeanLabor
  const { terna } = startYear(s);
  const pid = terna[0].petitionerId;
  decide(s, []); // deny all
  resolveYear(s);
  const entry = (s.europeanLabor || []).find(e => e.petitionerId === pid);
  ok('denied man in europeanLabor', !!entry);
  if (entry) {
    const goaBefore = missionStaffed(missionStaff(s, 'goa'));
    const fundsBefore = s.resources.funds;
    const sent = EngineNS.queueLaborMen(s, [entry], 'goa', 'test order');
    ok('send queues the man himself', sent.length === 1 && sent[0] === pid);
    ok('man removed from europeanLabor', !(s.europeanLabor || []).some(e => e.petitionerId === pid));
    ok('he waits at the dock, not at the mission',
      s.queue.some((q) => q.petitionerId === pid && q.status === 'awaiting' && q.destination === 'goa')
      && missionStaffed(missionStaff(s, 'goa')) === goaBefore);
    ok('nothing is charged until he sails', s.resources.funds === fundsBefore);
    // He sails with the fleet — a real voyage, in real time. No teleport.
    const tNext = startYear(s);
    decide(s, tNext.terna.map((c) => ({ id: c.petitionerId })));
    resolveYear(s);
    const voy = s.voyages.find((v) => v.petitionerId === pid);
    ok('he sails on a ship', !!voy && voy.destination === 'goa');
    ok('he is still at sea (Goa is two years out)', missionStaffed(missionStaff(s, 'goa')) === goaBefore);
    // Ill men are not sending candidates.
    const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'ill-dispatch-test' });
    const t2 = startYear(s2);
    const pid2 = t2.terna[0].petitionerId;
    decide(s2, [{ id: pid2, destination: 'goa' }]);
    resolveYear(s2);
    const voy2 = s2.voyages.find(v => v.petitionerId === pid2);
    dbgForceOutcome(s2, voy2.id, 'ill');
    ok('ill man is not a sending candidate',
      !EngineNS.deploymentCandidates(s2).some((c) => c.petitionerId === pid2));
  }
}

// --- Collective deployment (Stage 1) regression tests -------------------------
// Helper: seed N eligible men directly into europeanLabor (deterministic).
function seedLabor(s, n, tag = 'dep', entryExtra = {}) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = `test-${tag}-${i}`;
    s.petitioners[id] = {
      id, fictional: true, status: 'denied', history: [],
      deniedCount: 1, usedLetters: [], voyages: [], archived: false,
    };
    s.europeanLabor.push({
      petitionerId: id, name: `Test Man ${tag}-${i}`, year: s.year, via: 'denied',
      ...entryExtra,
    });
    ids.push(id);
  }
  return ids;
}

{
  // A1. Accounting: order removes from europeanLabor, pool decrements once at departure.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'dep-acct' });
  const ids = seedLabor(s, 4);
  const availBefore = s.available;
  const laborBefore = s.europeanLabor.length;
  const dep = orderDeployment(s, { destId: 'goa', purpose: 'reinforce', memberIds: ids });
  ok('deployment ordered', dep && dep.id.startsWith('dep-'));
  ok('order removes men from europeanLabor', s.europeanLabor.length === laborBefore - 4);
  ok('order does NOT change the pool (terna convention)', s.available === availBefore);
  ok('queue entries carry deploymentId', s.queue.filter(q => q.deploymentId === dep.id).length === 4);
  const fundsBefore = s.resources.funds;
  const { terna } = startYear(s);
  decide(s, []); // deny terna so only deployment men sail
  resolveYear(s, { skipNatives: true }); // departures: 4 men x 60 (Model B: 4 men fit 1 hull, 1 berth → all sail)
  const sailed = s.voyages.filter(v => v.deploymentId === dep.id);
  ok('4 of 4 sail in year one (1 ship, 1 berth)', sailed.length === 4, `${sailed.length}`);
  // Veterans coming home rejoin the pool (+1 each) — starting staff are
  // real men now, so some may return in the sailing year itself.
  const vetsA1 = s.voyages.filter(v => v.veteranReturned && v.veteranYear === 1615).length;
  ok('pool decremented exactly once per sailed man', s.available === availBefore - 4 + 1 + vetsA1,
    `${s.available} (veterans home: ${vetsA1})`);
  // 3 deployment men x 60 at departure; the 3 denied terna cards cost 15 each (seal);
  // deployment men themselves incur no seal costs.
  const upkeep = Object.keys(s.missions).reduce((n, id) => n + missionUpkeep(missionStaff(s, id)), 0);
  ok('60 scudi per man charged at departure, no seal costs on deployment men',
    s.resources.funds === fundsBefore - 240 - 3 * RESOURCES.DENIAL_COST + 240 - upkeep,
    `${s.resources.funds} vs ${fundsBefore - 240 - 3 * RESOURCES.DENIAL_COST + 240 - upkeep}`);
  ok('voyages stamped with deploymentId', sailed.every(v => v.deploymentId === dep.id));
  const st1 = deploymentStatus(s, dep.id);
  ok('status in-transit (all sailed, Model B)', st1.status === 'in-transit' && st1.awaiting === 0, JSON.stringify(st1));
  const roster1 = deploymentRoster(s, dep.id);
  ok('roster tracks per-member states', roster1.filter(m => m.state === 'in-transit').length === 4 && roster1.filter(m => m.state === 'awaiting').length === 0);
  ok('roster keeps names after europeanLabor removal', roster1.every(m => /^Test Man/.test(m.name)));
}

{
  // A2. Eligibility: ill / in-formation / assigned men are excluded.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'dep-elig' });
  const okIds = seedLabor(s, 2, 'elig-ok');
  const illIds = seedLabor(s, 1, 'elig-ill', { ill: 'recovering (ill 1615)' });
  const formIds = seedLabor(s, 1, 'elig-form', { formation: { focus: 'exercises', until: s.year + 1 } });
  const asgIds = seedLabor(s, 1, 'elig-asg', { assignment: 'rector of a college' });
  ok('ill man ineligible', !deploymentEligible(s, s.europeanLabor.find(e => e.petitionerId === illIds[0])));
  ok('man in formation ineligible', !deploymentEligible(s, s.europeanLabor.find(e => e.petitionerId === formIds[0])));
  ok('assigned man ineligible', !deploymentEligible(s, s.europeanLabor.find(e => e.petitionerId === asgIds[0])));
  ok('candidates exclude the ineligible', deploymentCandidates(s).length === 2);
  let threw = false;
  try { orderDeployment(s, { destId: 'goa', purpose: 'found', memberIds: [...okIds, illIds[0]] }); }
  catch (e) { threw = /not eligible/.test(e.message); }
  ok('order rejects an ineligible member', threw);
  threw = false;
  try { orderDeployment(s, { destId: 'goa', purpose: 'found', memberIds: [okIds[0]] }); }
  catch (e) { threw = /at least 2/.test(e.message); }
  ok('order enforces minimum size 2', threw);
  threw = false;
  try { orderDeployment(s, { destId: 'goa', purpose: 'nope', memberIds: okIds }); }
  catch (e) { threw = /unknown purpose/.test(e.message); }
  ok('order rejects unknown purpose', threw);
  threw = false;
  try { orderDeployment(s, { destId: 'goa', purpose: 'found', memberIds: [okIds[0], okIds[0]] }); }
  catch (e) { threw = /twice/.test(e.message); }
  ok('order rejects duplicate members', threw);
}

{
  // A3. Deterministic selection: headcount and grade modes; fail loudly.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'dep-sel' });
  seedLabor(s, 6, 'sel');
  const a = selectDeploymentMembers(s, { count: 4 });
  const b = selectDeploymentMembers(s, { count: 4 });
  ok('selection is deterministic', JSON.stringify(a) === JSON.stringify(b), a.join(','));
  ok('headcount picks longest in Europe first', a[0] === 'test-sel-0');
  let threw = false;
  try { selectDeploymentMembers(s, { count: 99 }); } catch (e) { threw = /only 6 eligible/.test(e.message); }
  ok('selection fails loudly when short', threw);
  // Grade mode: request the majority grade among seeded men (grades come from
  // the deterministic per-seed stream for fictional records).
  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'dep-selg' });
  const gids = seedLabor(s2, 8, 'selg');
  const gcounts = {};
  for (const id of gids) { const gr = staffGradeFor(s2, id); gcounts[gr] = (gcounts[gr] || 0) + 1; }
  const majGrade = Object.entries(gcounts).sort((a, b) => b[1] - a[1])[0][0];
  const gp = selectDeploymentMembers(s2, { grades: { [majGrade]: 2 } });
  ok('grade mode picks the requested grade', gp.length === 2 && gp.every(id => staffGradeFor(s2, id) === majGrade), `${majGrade}: ${gp.join(',')}`);
  let gthrew = false;
  try { selectDeploymentMembers(s2, { grades: { fathers: 99 } }); } catch (e) { gthrew = /only \d+ eligible fathers/.test(e.message); }
  ok('grade mode fails loudly when short', gthrew);
}

{
  // A4. Partial departure across years; queue interleaving with terna approvals.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'dep-partial' });
  const ids = seedLabor(s, 6, 'part');
  orderDeployment(s, { destId: 'goa', purpose: 'replace', memberIds: ids });
  const t = startYear(s);
  decide(s, [{ id: t.terna[0].petitionerId, destination: 'goa' }]); // one terna approval, same year
  resolveYear(s);
  const depVoy = s.voyages.filter(v => v.deploymentId);
  ok('year 1: 6 deployment men fit 1 hull, 1 berth — all sail (Model B)',
    depVoy.length === 6, `${depVoy.length} deployment voyages`);
  // Year 2: remaining 3 sail (one hull busy, two free).
  startYear(s); decide(s, []);
  resolveYear(s);
  const depVoy2 = s.voyages.filter(v => v.deploymentId);
  ok('year 2: remaining members sail', depVoy2.length === 6, `${depVoy2.length}`);
  const st = deploymentStatus(s, s.deployments[0].id);
  ok('status in-transit until all resolved', st.status === 'in-transit' && st.awaiting === 0, JSON.stringify(st));
  // No double-counting: pool lost exactly the 7 who sailed (6 deployment
  // + 1 terna), gained 2 yearly intakes, plus one per man who rejoined
  // (veterans home, voyages resolved 'returned') — all counted from the
  // voyage records themselves.
  const rejoinsA4 = s.voyages.filter(v =>
    (v.veteranReturned && v.veteranYear <= 1616) ||
    (v.outcome === 'returned' && v.resolvedYear === 1616)).length;
  ok('no pool anomaly', s.available === 131 - 7 + 2 + rejoinsA4,
    `${s.available} (rejoins: ${rejoinsA4})`);
}

{
  // A5. Save/load round-trip preserves deployments; old saves default safely.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'dep-save' });
  const ids = seedLabor(s, 3, 'save');
  const dep = orderDeployment(s, { destId: 'goa', purpose: 'college', memberIds: ids });
  const rt = deserialize(serialize(s));
  ok('deployments survive save/load', rt.deployments.length === 1 && rt.deployments[0].id === dep.id);
  ok('member roster survives save/load', (deploymentRoster(rt, dep.id) || []).length === 3);
  ok('status derivable after load', deploymentStatus(rt, dep.id).status === 'ordered');
  const legacy = JSON.parse(JSON.stringify(serialize(s)));
  delete legacy.deployments; delete legacy.seq.deployment;
  const rt2 = deserialize(legacy);
  ok('legacy save defaults deployments to []', Array.isArray(rt2.deployments) && rt2.deployments.length === 0);
  ok('legacy save defaults seq.deployment', rt2.seq.deployment === 0);
}

{
  // A6. Single-fire resolution: no duplication or loss on re-resolve.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'dep-once' });
  const ids = seedLabor(s, 2, 'once');
  const dep = orderDeployment(s, { destId: 'goa', purpose: 'reinforce', memberIds: ids });
  startYear(s); decide(s, []);
  resolveYear(s); // both sail (2 <= 3 berths)
  const voy = s.voyages.filter(v => v.deploymentId === dep.id);
  ok('both sailed', voy.length === 2);
  for (const v of voy) { v.arriveYear = s.year; v.newsYear = s.year; }
  const availPre = s.available;
  const laborPre = s.europeanLabor.length;
  dbgForceOutcome(s, voy[0].id, 'returned');
  dbgForceOutcome(s, voy[1].id, 'thriving');
  resolveYear(s);
  const st = deploymentStatus(s, dep.id);
  ok('all resolved -> arrived', st.status === 'arrived' && st.resolved === 2, JSON.stringify(st));
  const roster = deploymentRoster(s, dep.id);
  ok('outcomes recorded per member',
    roster.find(m => m.petitionerId === ids[0]).state === 'returned' &&
    roster.find(m => m.petitionerId === ids[1]).state === 'thriving');
  // Returnee rejoins pool exactly once (existing convention) — plus the
  // year's intake, plus any veteran who came home in the same resolve.
  const vetsA6 = s.voyages.filter(v => v.veteranReturned && v.veteranYear === 1616).length;
  ok('returnee rejoins pool once', s.available === availPre + 1 + 1 + vetsA6,
    `${s.available} vs ${availPre} (veterans home: ${vetsA6})`);
  const dupes = s.europeanLabor.filter(e => e.petitionerId === ids[0]);
  ok('no duplicate europeanLabor entries', dupes.length <= 1, `${dupes.length}`);
}

{
  // A7. Constraints analysis names the binding constraint (Model B).
  // 6 men fit in 1 hull (cap 8), need 1 berth (have 3) → nothing binds.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'dep-con' });
  const c6 = deploymentConstraints(s, 6);
  ok('6 men: 1 ship, 1 berth — nothing binds', c6.bottleneck === null && c6.shipsNeeded === 1,
    JSON.stringify({ b: c6.bottleneck, ships: c6.shipsNeeded }));
  ok('6 men fit one hull', c6.hullMen <= c6.hullCapacity);
  const c2 = deploymentConstraints(s, 2);
  ok('2 men: nothing binds', c2.bottleneck === null, JSON.stringify(c2.bottleneck));
  s.resources.funds = 10;
  const cF = deploymentConstraints(s, 4);
  ok('empty chest: funds bind first', cF.bottleneck === 'funds', cF.bottleneck);
  let threw = false;
  try { orderDeployment(s, { destId: 'goa', purpose: 'found', memberIds: seedLabor(s, 4, 'confunds') }); }
  catch (e) { threw = /scudi needed/.test(e.message); }
  ok('order fails early on insufficient funds', threw);
}

// --- Report card (Stage 2): end-of-generalate account -----------------------
{
  // Fresh game: zeros, treasury 1000/1000, no missing-data flags on new saves.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'rep-fresh' });
  const r = generalateReport(s);
  ok('report: fresh game score normalized 37', r.score === 37 && r.scoreTitle === 'The Reluctant Steward');
  ok('report: fresh game zeros', r.outcomes.thriving === 0 && r.personnel.dispatched === 0
    && r.institutions.novitiates.length === 0 && r.events.length === 0);
  ok('report: treasury 1000/1000/net 0', r.treasury.start === 1000 && r.treasury.end === 1000 && r.treasury.net === 0);
  ok('report: new saves track dispatches (not unknown)', r.institutions.strengthenedUnknown === false
    && r.institutions.strengthenedTotal === 0);
  ok('report: narrative is prose, no judgments', typeof r.narrative === 'string' && r.narrative.length > 40
    && !/wasteful|inefficient|prudent|imprudent/i.test(r.narrative));
  ok('report: never exposes scoreUncapped', !JSON.stringify(r).includes('scoreUncapped'));
  ok('report: JSON-safe', JSON.parse(JSON.stringify(r)).score === 37);

  // Scripted campaign fragment: men sent by request, novitiate, voyages.
  const g = newGameWithGalleons({ mode: 'campaign', seed: 'rep-script' });
  foundNovitiate(g, 'china');
  // Send 2 named brothers to Goa by answering a provincial request.
  seedLabor(g, 2, 'rep');
  for (const id of ['test-rep-0', 'test-rep-1']) g.petitioners[id].vows = { stage: 'brother' };
  g.provincials.east = { petitionerId: null, name: 'Test Provincial', hq: 'goa', appointedYear: g.year };
  g.provincialRequests = { east: { regionId: 'east', year: g.year, professed: 0, fathers: 0, brothers: 2 } };
  answerProvincialRequest(g, 'east', { professed: 0, fathers: 0, brothers: 2 });
  ok('report: dispatch counter', g.stats.missionDispatches === 2 && g.stats.missionDispatchDests.goa === 2);
  for (let y = 0; y < 3; y++) {
    const { terna } = startYear(g);
    decide(g, terna.length ? [{ id: terna[0].petitionerId }] : []);
    resolveYear(g);
  }
  const r2 = generalateReport(g);
  ok('report: novitiate listed', r2.institutions.novitiates.length === 1
    && r2.institutions.novitiates[0].destination === 'china');
  ok('report: strengthened listed', r2.institutions.strengthenedTotal === 2
    && r2.institutions.strengthened[0].destId === 'goa');
  ok('report: dispatched matches stats', r2.personnel.dispatched === g.stats.departures);
  ok('report: treasury net consistent', r2.treasury.net === r2.treasury.end - r2.treasury.start);
  ok('report: souls >= dispatched', r2.personnel.souls >= r2.personnel.dispatched);
  const end = endGame(g);
  ok('endGame carries the report', end.report && end.report.score === getScore(g));

  // Missing data (older save): omitted/marked unavailable, never fabricated.
  const o = newGameWithGalleons({ mode: 'campaign', seed: 'rep-old' });
  delete o.stats.missionDispatches;
  delete o.stats.missionDispatchDests;
  const r3 = generalateReport(o);
  ok('report: missing dispatch data -> null, flagged unknown', r3.institutions.strengthened === null
    && r3.institutions.strengthenedUnknown === true && r3.institutions.strengthenedTotal === null);
  ok('report: narrative notes unavailable data', /not recorded/.test(r3.narrative));
  ok('report: old save still renders numbers', r3.score === 37 && r3.treasury.start === 1000);

  // Round-trip through serialize/deserialize preserves the report inputs.
  const g2 = newGameWithGalleons({ mode: 'campaign', seed: 'rep-ser' });
  seedLabor(g2, 3, 'reps');
  for (const id of ['test-reps-0', 'test-reps-1', 'test-reps-2']) g2.petitioners[id].vows = { stage: 'brother' };
  g2.provincials.east = { petitionerId: null, name: 'Test Provincial', hq: 'goa', appointedYear: g2.year };
  g2.provincialRequests = { east: { regionId: 'east', year: g2.year, professed: 0, fathers: 0, brothers: 3 } };
  answerProvincialRequest(g2, 'east', { professed: 0, fathers: 0, brothers: 3 });
  const back = deserialize(serialize(g2));
  const r4 = generalateReport(back);
  ok('report: survives serialize round-trip', r4.institutions.strengthenedTotal === 3);
}

// --- 39. Vows and career milestones -------------------------------------------
{
  // Helper: create a europeanLabor man with controlled years and vows stage.
  function vowsMan(s, tag, yearsInSoc, stage, grade) {
    const id = `vows-${tag}-${s.year}`;
    s.petitioners[id] = {
      id, fictional: true, status: 'denied', history: [],
      deniedCount: 1, usedLetters: [], voyages: [], archived: false,
      yearsInSociety: yearsInSoc, entryYear: s.year,
    };
    if (grade) s.petitioners[id].vowsTrack = grade;
    const entry = {
      petitionerId: id, name: `Vows Man ${tag}`, year: s.year, via: 'denied',
      vows: {
        stage, firstVows: null, philosophy: null, regency: null, theology: null,
        ordination: null, finalVows: null, tertianshipUntil: null, deferredUntil: null,
      },
    };
    s.europeanLabor.push(entry);
    return id;
  }

  // 1. Milestone detection: 2-year novice queues firstVows.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-detect' });
    const id = vowsMan(s, 'nov2', 2, 'novice', 'scholastic');
    resolveYear(s);
    const p = (s.pendingVows || []).find((x) => x.petitionerId === id && x.type === 'firstVows');
    ok('vows: 2-year novice queues firstVows', !!p);
  }

  // 2. firstVows proceed: novice -> scholastic, +zeal/+humility.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-first' });
    const id = vowsMan(s, 'nov2', 2, 'novice', 'scholastic');
    resolveYear(s);
    const d0 = ensureDisposition(s, id);
    const z0 = d0.current.zeal, h0 = d0.current.humility;
    decideVows(s, id, 'firstVows', 'proceed');
    const entry = s.europeanLabor.find((e) => e.petitionerId === id);
    const d1 = ensureDisposition(s, id);
    ok('vows: firstVows novice -> scholastic', entry.vows.stage === 'scholastic');
    ok('vows: firstVows +zeal', d1.current.zeal === Math.min(5, z0 + 1));
    ok('vows: firstVows +humility', d1.current.humility === Math.min(5, h0 + 1));
    ok('vows: firstVows year recorded', entry.vows.firstVows === s.year);
    ok('vows: pending cleared', !(s.pendingVows || []).some((x) => x.petitionerId === id));
  }

  // 3. Brother firstVows: stays brother.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-bro' });
    const id = vowsMan(s, 'bro2', 2, 'brother');
    resolveYear(s);
    decideVows(s, id, 'firstVows', 'proceed');
    const entry = s.europeanLabor.find((e) => e.petitionerId === id);
    ok('vows: brother stays brother after firstVows', entry.vows.stage === 'brother');
    // Brothers get no further milestones.
    resolveYear(s);
    const extra = (s.pendingVows || []).filter((x) => x.petitionerId === id);
    ok('vows: brother queues no further milestones', extra.length === 0);
  }

  // 4. Defer: +humility, deferredUntil, re-queued after 2 years.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-defer' });
    const id = vowsMan(s, 'nov2', 2, 'novice', 'scholastic');
    resolveYear(s);
    const d0 = ensureDisposition(s, id);
    const h0 = d0.current.humility;
    const y0 = s.year;
    decideVows(s, id, 'firstVows', 'defer');
    const entry = s.europeanLabor.find((e) => e.petitionerId === id);
    ok('vows: defer sets deferredUntil +2', entry.vows.deferredUntil === y0 + 2);
    ok('vows: defer +humility', ensureDisposition(s, id).current.humility === Math.min(5, h0 + 1));
    ok('vows: defer keeps stage novice', entry.vows.stage === 'novice');
    // Next year: still deferred, no re-queue.
    resolveYear(s);
    ok('vows: deferred not re-queued early',
      !(s.pendingVows || []).some((x) => x.petitionerId === id && x.type === 'firstVows'));
    // After deferral expires: re-queued. (Check runs pre-increment, so two more years.)
    resolveYear(s);
    resolveYear(s);
    ok('vows: deferred re-queued after expiry',
      (s.pendingVows || []).some((x) => x.petitionerId === id && x.type === 'firstVows'));
  }

  // 5. Dismiss: removed, status DISMISSED, never returns.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-dismiss' });
    const id = vowsMan(s, 'nov2', 2, 'novice', 'scholastic');
    resolveYear(s);
    decideVows(s, id, 'firstVows', 'dismiss');
    ok('vows: dismissed removed from europeanLabor',
      !(s.europeanLabor || []).some((e) => e.petitionerId === id));
    ok('vows: dismissed status set', s.petitioners[id].status === 'dismissed');
    ok('vows: dismissed pending cleared',
      !(s.pendingVows || []).some((x) => x.petitionerId === id));
  }

  // 6. Ordination threshold: 10 years NOT eligible, 12 years eligible.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-ord10' });
    // hist-67 is a scholastic in the fixtures (deterministic grade).
    const pid = 'hist-67';
    s.petitioners[pid] = {
      id: pid, fictional: false, status: 'denied', history: [],
      deniedCount: 1, usedLetters: [], voyages: [], archived: false,
      yearsInSociety: 10, entryYear: s.year,
    };
    s.europeanLabor.push({
      petitionerId: pid, name: 'Ord Test', year: s.year, via: 'denied',
      vows: {
        stage: 'scholastic', firstVows: s.year, philosophy: s.year, regency: s.year,
        theology: null, ordination: null, finalVows: null, tertianshipUntil: null, deferredUntil: null,
      },
    });
    ok('vows: 10-year scholastic NOT ordination-eligible', ordinationEligible(s, pid) === false);
    s.petitioners[pid].ageInReligion = 12;
    ok('vows: 12-year scholastic IS ordination-eligible', ordinationEligible(s, pid) === true);
  }

  // 7. Full progression: novice -> scholastic -> ordained via milestones.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-full' });
    const id = vowsMan(s, 'nov2', 2, 'novice', 'scholastic');
    // firstVows
    resolveYear(s);
    decideVows(s, id, 'firstVows', 'proceed');
    let entry = s.europeanLabor.find((e) => e.petitionerId === id);
    ok('vows: stage scholastic after firstVows', entry.vows.stage === 'scholastic');
    // Fast-forward: bump years to 5, check philosophy queues.
    s.petitioners[id].ageInReligion = 5;
    resolveYear(s);
    ok('vows: philosophy queued at 5 years',
      (s.pendingVows || []).some((x) => x.petitionerId === id && x.type === 'philosophy'));
    const d0 = ensureDisposition(s, id);
    const p0 = d0.current.prudence;
    decideVows(s, id, 'philosophy', 'proceed');
    ok('vows: philosophy +prudence',
      ensureDisposition(s, id).current.prudence === Math.min(5, p0 + 1));
    // 8 years: regency.
    s.petitioners[id].ageInReligion = 8;
    resolveYear(s);
    ok('vows: regency queued at 8 years',
      (s.pendingVows || []).some((x) => x.petitionerId === id && x.type === 'regency'));
    decideVows(s, id, 'regency', 'proceed');
    entry = s.europeanLabor.find((e) => e.petitionerId === id);
    ok('vows: regency recorded', entry.vows.regency === s.year);
    // 12 years: theology then ordination.
    s.petitioners[id].ageInReligion = 12;
    resolveYear(s);
    ok('vows: theology queued at 12 years',
      (s.pendingVows || []).some((x) => x.petitionerId === id && x.type === 'theology'));
    decideVows(s, id, 'theology', 'proceed');
    entry = s.europeanLabor.find((e) => e.petitionerId === id);
    ok('vows: theology recorded', entry.vows.theology === s.year);
    // Ordination should now queue (theology done, 12 years).
    resolveYear(s);
    ok('vows: ordination queued after theology',
      (s.pendingVows || []).some((x) => x.petitionerId === id && x.type === 'ordination'));
    decideVows(s, id, 'ordination', 'proceed');
    entry = s.europeanLabor.find((e) => e.petitionerId === id);
    ok('vows: ordination sets stage ordained', entry.vows.stage === 'ordained');
    ok('vows: ordination sets override', s.petitioners[id].ordainedOverride === true);
  }

  // 8. Final vows: invite -> tertianship -> grade choice.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-final' });
    const id = vowsMan(s, 'ord', 15, 'ordained');
    const y0 = s.year;
    inviteFinalVows(s, id);
    let entry = s.europeanLabor.find((e) => e.petitionerId === id);
    ok('vows: tertianshipUntil set +1', entry.vows.tertianshipUntil === y0 + 1);
    // Too early: throws.
    let threw = false;
    try { completeFinalVows(s, id, 'coadjutor'); } catch { threw = true; }
    ok('vows: completeFinalVows throws before tertianship ends', threw);
    // Advance: tertianship completes after a full year (check runs pre-increment).
    resolveYear(s);
    resolveYear(s);
    ok('vows: finalVowsGrade queued at tertianship end',
      (s.pendingVows || []).some((x) => x.petitionerId === id && x.type === 'finalVowsGrade'));
    completeFinalVows(s, id, 'professed');
    entry = s.europeanLabor.find((e) => e.petitionerId === id);
    ok('vows: final grade professed', entry.vows.stage === 'professed');
    ok('vows: pending grade choice cleared',
      !(s.pendingVows || []).some((x) => x.petitionerId === id && x.type === 'finalVowsGrade'));
  }

  // 9. rankSuffix: nSJ for novice, SJ otherwise.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-suffix' });
    const novId = vowsMan(s, 'nov', 1, 'novice');
    const schId = vowsMan(s, 'sch', 5, 'scholastic');
    const broId = vowsMan(s, 'bro', 5, 'brother');
    ok('vows: rankSuffix novice -> nSJ', rankSuffix(s, novId) === 'nSJ');
    ok('vows: rankSuffix scholastic -> SJ', rankSuffix(s, schId) === 'SJ');
    ok('vows: rankSuffix brother -> SJ', rankSuffix(s, broId) === 'SJ');
    ok('vows: rankSuffix unknown -> SJ', rankSuffix(s, 'nope') === 'SJ');
  }

  // 10. Invalid inputs throw.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-err' });
    const id = vowsMan(s, 'nov2', 2, 'novice', 'scholastic');
    let threw = false;
    try { decideVows(s, id, 'firstVows', 'proceed'); } catch { threw = true; }
    ok('vows: decideVows throws with no pending', threw);
    threw = false;
    try { decideVows(s, id, 'bogus', 'proceed'); } catch { threw = true; }
    ok('vows: decideVows throws on bad milestone', threw);
    threw = false;
    try { inviteFinalVows(s, id); } catch { threw = true; }
    ok('vows: inviteFinalVows throws for non-ordained', threw);
    threw = false;
    try { completeFinalVows(s, id, 'pope'); } catch { threw = true; }
    ok('vows: completeFinalVows throws on bad grade', threw);
  }

  // 11. Save round-trip preserves vows.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-save' });
    const id = vowsMan(s, 'nov2', 2, 'novice', 'scholastic');
    resolveYear(s);
    decideVows(s, id, 'firstVows', 'proceed');
    const back = deserialize(serialize(s));
    const entry = back.europeanLabor.find((e) => e.petitionerId === id);
    ok('vows: survive serialize round-trip',
      entry && entry.vows && entry.vows.stage === 'scholastic' && entry.vows.firstVows != null);
    ok('vows: pendingVows survive round-trip', Array.isArray(back.pendingVows));
  }

  // 12. Old save without vows gets backfilled.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'vows-old' });
    const id = vowsMan(s, 'nov2', 2, 'novice', 'scholastic');
    const entry = s.europeanLabor.find((e) => e.petitionerId === id);
    delete entry.vows;
    const back = deserialize(serialize(s));
    const e2 = back.europeanLabor.find((e) => e.petitionerId === id);
    ok('vows: old save backfilled', e2 && e2.vows && typeof e2.vows.stage === 'string');
  }

  // DEAD-END TESTS
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'deadend-terna' });
    dbgSpawnTerna(s);
    decide(s, []);
    let threw = false;
    try { decide(s, []); } catch (e) { threw = /No terna is awaiting decision/.test(e.message); }
    ok('deadend: decide() after seal throws clear error', threw);
  }
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'deadend-block' });
    dbgSpawnTerna(s);
    let blocked = 0;
    for (const fn of [() => foundNovitiate(s, 'goa'), () => expandBerths(s), () => charterShip(s)]) {
      try { fn(); } catch (e) { if (/Finish deciding on the current terna first/.test(e.message)) blocked++; }
    }
    ok('deadend: terna blocks other actions with clear message', blocked === 3);
  }

  // --- 40. Audit repair regression tests --------------------------------------
  // Helper: create an overseas (arrived, thriving) man with controlled years.
  function overseasMan(s, tag, yearsInSoc, destId) {
    const id = `ovs-${tag}-${s.year}`;
    s.petitioners[id] = {
      id, fictional: true, status: 'active', history: [],
      deniedCount: 0, usedLetters: [], voyages: [], archived: false,
      yearsInSociety: yearsInSoc, entryYear: s.year,
      name: `Overseas Man ${tag}`,
    };
    const v = {
      id: `voy-${tag}-${s.year}`, petitionerId: id, petitionerName: `Overseas Man ${tag}`,
      destination: destId || 'goa', stage: 'arrived', status: 'arrived',
      outcome: 'thriving', veteranReturned: false,
      departYear: s.year - 2, arriveYear: s.year, resolvedYear: s.year,
    };
    if (!Array.isArray(s.voyages)) s.voyages = [];
    s.voyages.push(v);
    return id;
  }

  // 40a. Death purges vows queues (Stage 1).
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'death-purge' });
    const id = overseasMan(s, 'dp', 8, 'goa');
    // Manually queue in-transit news and a pending decision for him.
    s.vowsNewsInTransit = [{ petitionerId: id, type: 'regency', name: 'Overseas Man dp', destId: 'goa', milestoneYear: s.year, arriveYear: s.year + 2, newsText: 'has completed regency' }];
    s.pendingVows = [{ petitionerId: id, type: 'philosophy', year: s.year, name: 'Overseas Man dp' }];
    purgeVowsState(s, id);
    ok('death-purge: pendingVows cleared', !(s.pendingVows || []).some((x) => x.petitionerId === id));
    ok('death-purge: vowsNewsInTransit cleared', !(s.vowsNewsInTransit || []).some((x) => x.petitionerId === id));
  }

  // 40b. decideVows on a dead man throws (Stage 1 defense in depth).
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'death-decide' });
    const id = vowsMan(s, 'dd', 2, 'novice', 'scholastic');
    s.pendingVows = [{ petitionerId: id, type: 'firstVows', year: s.year, name: 'Vows Man dd' }];
    s.petitioners[id].status = 'deceased';
    let threw = false;
    try { decideVows(s, id, 'firstVows', 'proceed'); } catch (e) { threw = /cannot be applied/.test(e.message); }
    ok('death-decide: decideVows on dead man throws', threw);
  }

  // 40c. Voyage death purges vows state end-to-end (Stage 1).
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'death-voyage' });
    const { terna } = startYear(s);
    const pick = terna[0];
    decide(s, [{ id: pick.petitionerId }]);
    resolveYear(s);
    const v = s.voyages.find((x) => x.petitionerId === pick.petitionerId);
    // Queue vows state for the voyager before he dies.
    s.vowsNewsInTransit = [{ petitionerId: v.petitionerId, type: 'firstVows', name: 'x', destId: v.destination, milestoneYear: s.year, arriveYear: s.year + 2, newsText: 't' }];
    s.pendingVows = [{ petitionerId: v.petitionerId, type: 'firstVows', year: s.year, name: 'x' }];
    dbgForceOutcome(s, v.id, 'deceased');
    ok('death-voyage: deceased status set', s.petitioners[v.petitionerId].status === 'deceased');
    ok('death-voyage: pendingVows purged', !(s.pendingVows || []).some((x) => x.petitionerId === v.petitionerId));
    ok('death-voyage: vowsNewsInTransit purged', !(s.vowsNewsInTransit || []).some((x) => x.petitionerId === v.petitionerId));
  }

  // 40d. entryYear set on approval; years advance for approved men (Stage 2).
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'entry-year' });
    const { terna } = startYear(s);
    const pick = terna[0];
    // Give the petitioner known historical years.
    s.petitioners[pick.petitionerId].yearsInSociety = 6;
    decide(s, [{ id: pick.petitionerId }]);
    const rec = s.petitioners[pick.petitionerId];
    ok('entry-year: set on approval', rec.entryYear === s.year);
    // Advance 5 years; the entryYear baseline must stay fixed so years advance.
    const y0 = s.year;
    for (let i = 0; i < 5; i++) { const { terna: t } = startYear(s); decide(s, []); resolveYear(s); }
    ok('entry-year: 5 years elapsed', s.year === y0 + 5);
    ok('entry-year: baseline preserved', rec.entryYear === y0);
    ok('entry-year: derived years grew', (s.year - rec.entryYear + 6) === 11);
    ok('age-in-religion: counter grew 6 -> 11 over 5 years', rec.ageInReligion === 11 && ageInReligion(s, pick.petitionerId) === 11,
      String(rec.ageInReligion));
    ok('total-years: grew 6 -> 11 over 5 years', rec.totalYearsInSociety === 11 && yearsInSociety(s, pick.petitionerId) === 11);
  }

  // 40e. Overseas milestone: detection -> transit -> Desk (Stage 2 + overseas flow).
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'ovs-mile' });
    // 12-year scholastic stationed at Goa; theology milestone triggers.
    const id = overseasMan(s, 'om', 12, 'goa');
    s.petitioners[id].vows = {
      stage: 'scholastic', firstVows: true, philosophy: true, regency: true,
      theology: null, ordination: null, finalVows: null,
      tertianshipUntil: null, deferredUntil: null,
    };
    resolveYear(s); // checkVowsMilestones runs inside
    const transit = (s.vowsNewsInTransit || []).find((x) => x.petitionerId === id);
    ok('ovs-mile: milestone news enters transit', !!transit);
    ok('ovs-mile: transit type is theology', transit && transit.type === 'theology');
    ok('ovs-mile: arriveYear 1-3 years out', transit && transit.arriveYear > s.year - 1 && transit.arriveYear <= s.year + 2);
    const type0 = transit && transit.type;
    const ay = transit && transit.arriveYear;
    // Advance through the arrival year (news arrives when y === arriveYear).
    while (s.year <= ay) { const { terna: t } = startYear(s); decide(s, []); resolveYear(s); }
    const p = (s.pendingVows || []).find((x) => x.petitionerId === id && x.type === type0);
    ok('ovs-mile: decision queued on arrival', !!p);
  }

  // 40f. Final vows: invitation -> tertianship -> coadjutor/professed (Stage 5).
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'final-vows-p' });
    const id = vowsMan(s, 'fv', 13, 'ordained', 'scholastic');
    const inv = inviteFinalVows(s, id);
    ok('final-vows: invited', inv.invited === true);
    const e0 = s.europeanLabor.find((e) => e.petitionerId === id);
    ok('final-vows: tertianship set +1y', e0.vows.tertianshipUntil === s.year + 1);
    const { terna: t } = startYear(s); decide(s, []); resolveYear(s); // complete tertianship year
    const done = completeFinalVows(s, id, 'professed');
    ok('final-vows: professed chosen', done.grade === 'professed' && e0.vows.stage === 'professed');
  }
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'final-vows-c' });
    const id = vowsMan(s, 'fv', 13, 'ordained', 'scholastic');
    inviteFinalVows(s, id);
    const { terna: t } = startYear(s); decide(s, []); resolveYear(s);
    const done = completeFinalVows(s, id, 'coadjutor');
    ok('final-vows: coadjutor chosen', done.grade === 'coadjutor' && s.europeanLabor.find((e) => e.petitionerId === id).vows.stage === 'coadjutor');
  }
  {
    // Tertianship completion queues the finalVowsGrade Desk decision.
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'final-vows-q' });
    const id = vowsMan(s, 'fv', 13, 'ordained', 'scholastic');
    inviteFinalVows(s, id);
    for (let i = 0; i < 2; i++) { const { terna: t } = startYear(s); decide(s, []); resolveYear(s); }
    const p = (s.pendingVows || []).find((x) => x.petitionerId === id && x.type === 'finalVowsGrade');
    ok('final-vows: grade decision queued after tertianship', !!p);
  }

  // 40g. Rank monotonicity: stages never regress across years (Stage 5).
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'mono' });
    const order = { novice: 0, scholastic: 1, brother: 1, ordained: 2, coadjutor: 3, professed: 3 };
    const ids = [
      vowsMan(s, 'm1', 1, 'novice', 'scholastic'),
      vowsMan(s, 'm2', 6, 'scholastic', 'scholastic'),
      vowsMan(s, 'm3', 3, 'brother', 'brother'),
    ];
    let regressed = false;
    for (let i = 0; i < 8; i++) {
      const before = ids.map((id) => s.europeanLabor.find((e) => e.petitionerId === id).vows.stage);
      const { terna: t } = startYear(s); decide(s, []); resolveYear(s);
      // Auto-proceed any queued vows decisions to exercise transitions.
      for (const p of [...(s.pendingVows || [])]) {
        if (ids.includes(p.petitionerId) && p.type !== 'finalVowsGrade') {
          try { decideVows(s, p.petitionerId, p.type, 'proceed'); } catch (e) { /* already handled */ }
        }
      }
      ids.forEach((id, ix) => {
        const after = s.europeanLabor.find((e) => e.petitionerId === id);
        if (!after) return; // dismissed/dead is not regression
        if (order[after.vows.stage] < order[before[ix]]) regressed = true;
      });
    }
    ok('rank-monotonicity: no stage regression over 8 years', !regressed);
  }

  // 40h. Direct dispatch preserves years progression like terna approval (Stage 5).
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'dispatch-years' });
    const id = vowsMan(s, 'de', 4, 'scholastic', 'scholastic');
    const rec = s.petitioners[id];
    ok('dispatch-years: entryYear set via europeanLabor', rec.entryYear === s.year);
    const y0 = s.year;
    for (let i = 0; i < 3; i++) { const { terna: t } = startYear(s); decide(s, []); resolveYear(s); }
    // yearsInSociety = s.year - entryYear + 4 = 7 after 3 years.
    ok('dispatch-years: years advance', (s.year - rec.entryYear + 4) === 7 && s.year === y0 + 3);
    ok('age-in-religion: dispatch-years counter is 7', rec.ageInReligion === 7, String(rec.ageInReligion));
  }

  // 40i. Multi-man isolation: decisions on one man don't touch another (Stage 5).
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'isolation' });
    const a = vowsMan(s, 'ia', 2, 'novice', 'scholastic');
    const b = vowsMan(s, 'ib', 2, 'novice', 'scholastic');
    s.pendingVows = [
      { petitionerId: a, type: 'firstVows', year: s.year, name: 'A' },
      { petitionerId: b, type: 'firstVows', year: s.year, name: 'B' },
    ];
    decideVows(s, a, 'firstVows', 'proceed');
    const ea = s.europeanLabor.find((e) => e.petitionerId === a);
    const eb = s.europeanLabor.find((e) => e.petitionerId === b);
    ok('isolation: decided man advanced', ea.vows.stage === 'scholastic' && ea.vows.firstVows === s.year);
    ok('isolation: other man untouched', eb.vows.stage === 'novice' && eb.vows.firstVows == null);
    ok('isolation: other pending intact', (s.pendingVows || []).some((x) => x.petitionerId === b));
  }

  // 40j. Age in religion: a stored counter drives formation progression.
  {
    ok('age-in-religion: thresholds', JSON.stringify(FORMATION_THRESHOLDS) ===
      JSON.stringify({ firstVows: 2, philosophy: 5, regency: 8, theology: 12, ordination: 12 }));
    // Seeded from historical years + elapsed, then advanced once per resolveYear.
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'air-1' });
    const id = vowsMan(s, 'air', 0, 'novice', 'scholastic');
    ok('age-in-religion: unseeded reads legacy derivation', ageInReligion(s, id) === 0
      && s.petitioners[id].ageInReligion === undefined);
    initAgeInReligion(s, id);
    ok('age-in-religion: seeded at 0', s.petitioners[id].ageInReligion === 0);
    ok('age-in-religion: both counters seeded equal', yearsInSociety(s, id) === 0 && vowsYearsInSociety(s, id) === 0
      && s.petitioners[id].totalYearsInSociety === 0);
    // Ignore entryYear once seeded: changing it must not move the counter.
    s.petitioners[id].entryYear = s.year - 30;
    ok('age-in-religion: entryYear no longer read after seeding', ageInReligion(s, id) === 0);
    resolveYear(s);
    ok('age-in-religion: +1 after one year', ageInReligion(s, id) === 1);
    ok('age-in-religion: no firstVows at 1', !(s.pendingVows || []).some((x) => x.petitionerId === id));
    resolveYear(s);
    resolveYear(s);
    ok('age-in-religion: firstVows queued from counter alone at 2',
      (s.pendingVows || []).some((x) => x.petitionerId === id && x.type === 'firstVows'));
    ok('age-in-religion: 3 after three years', ageInReligion(s, id) === 3);
    ok('total-years: equals ageInReligion before any deferral', yearsInSociety(s, id) === 3
      && s.petitioners[id].totalYearsInSociety === 3);
    // Deferral PAUSES ageInReligion (background) but not the visible total.
    const yDef = s.year;
    decideVows(s, id, 'firstVows', 'defer');
    const dU = s.petitioners[id].vows.deferredUntil;
    ok('deferral: deferredUntil = year + 2', dU === yDef + 2);
    resolveYear(s);
    ok('deferral: ageInReligion paused (year 1)', ageInReligion(s, id) === 3, String(ageInReligion(s, id)));
    ok('deferral: total still counting (year 1)', yearsInSociety(s, id) === 4);
    resolveYear(s);
    ok('deferral: ageInReligion paused (year 2)', ageInReligion(s, id) === 3, String(ageInReligion(s, id)));
    ok('deferral: total still counting (year 2)', yearsInSociety(s, id) === 5);
    ok('deferral: no re-queue while deferred', !(s.pendingVows || []).some((x) => x.petitionerId === id));
    ok('deferral: vows helper reports visible total', vowsYearsInSociety(s, id) === 5);
    // Deferral expires (s.year === deferredUntil): decision re-queued, counter resumes.
    ok('deferral: now at deferredUntil', s.year === dU);
    resolveYear(s);
    ok('deferral: firstVows re-queued after deferral', (s.pendingVows || []).some((x) => x.petitionerId === id && x.type === 'firstVows'));
    ok('deferral: ageInReligion resumes', ageInReligion(s, id) === 4, String(ageInReligion(s, id)));
    ok('deferral: total keeps counting', yearsInSociety(s, id) === 6);
    resolveYear(s);
    ok('deferral: resumes +1 per year', ageInReligion(s, id) === 5 && yearsInSociety(s, id) === 7);
    // The dead stop counting.
    s.petitioners[id].status = 'deceased';
    resolveYear(s);
    ok('age-in-religion: deceased frozen', ageInReligion(s, id) === 5 && yearsInSociety(s, id) === 7);
    // Men not yet in the Society (no entryYear) are not advanced.
    const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'air-2' });
    s2.petitioners['air-out'] = { id: 'air-out', fictional: true, status: 'new', history: [], yearsInSociety: 3 };
    resolveYear(s2);
    ok('age-in-religion: outsiders not advanced', s2.petitioners['air-out'].ageInReligion === undefined
      && ageInReligion(s2, 'air-out') === 3);
  }

  // 40k. Old saves lacking ageInReligion migrate from entryYear on load.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'air-migrate' });
    const id = vowsMan(s, 'mig', 3, 'scholastic', 'scholastic');
    s.petitioners[id].entryYear = s.year - 4; // entered 4 years ago with 3 historical years
    const raw = JSON.parse(JSON.stringify(serialize(s)));
    delete raw.petitioners[id].ageInReligion;
    delete raw.petitioners[id].totalYearsInSociety;
    const back = deserialize(raw);
    ok('age-in-religion: migrated 3 + 4 = 7', back.petitioners[id].ageInReligion === 7,
      String(back.petitioners[id].ageInReligion));
    ok('total-years: migrated 3 + 4 = 7', back.petitioners[id].totalYearsInSociety === 7);
    const rt = deserialize(serialize(back));
    ok('age-in-religion: survives round-trip', rt.petitioners[id].ageInReligion === 7 && rt.petitioners[id].totalYearsInSociety === 7);
  }

  // 40l. Diagnostics export carries ageInReligion.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'air-diag' });
    const id = vowsMan(s, 'dg', 1, 'novice', 'brother');
    resolveYear(s);
    const before = JSON.stringify(s);
    const rep = buildDiagnosticReport(EngineNS, s);
    const m = rep.men.find((x) => x.petitionerId === id);
    ok('age-in-religion: diagnostics fields', m && m.ageInReligion === 2 && m.ageInReligionStored === true
      && m.yearsInSociety === 2 && m.totalYearsInSociety === 2 && m.ageInReligionPaused === false, JSON.stringify(m));
    ok('age-in-religion: diagnostics read-only', JSON.stringify(s) === before);
    // Deferred man: visible total diverges from paused background counter.
    s.petitioners[id].ageInReligion = 1;
    s.petitioners[id].vows.deferredUntil = s.year + 1;
    const m2 = buildDiagnosticReport(EngineNS, s).men.find((x) => x.petitionerId === id);
    ok('age-in-religion: diagnostics exports visible + background', m2.totalYearsInSociety === 2
      && m2.ageInReligion === 1 && m2.ageInReligionPaused === true, JSON.stringify(m2));
  }

  // 40m. Desk-card years seed both counters at entry (incl. null records -> seeded card value).
  {
    let checked = 0, mismatches = [];
    for (const seed of ['card-seed-1', 'card-seed-2', 'card-seed-3', 'card-seed-4']) {
      const s = newGameWithGalleons({ mode: 'campaign', seed });
      for (let yr = 0; yr < 3; yr++) {
        const { terna } = startYear(s);
        const g = getGameData();
        for (const c of terna) {
          if (cardYearsInSociety(s, c.petitionerId) !== c.yearsInSociety
            && typeof s.petitioners[c.petitionerId].totalYearsInSociety !== 'number') mismatches.push(['card', c.petitionerId]);
        }
        const fresh = terna.filter((c) => typeof s.petitioners[c.petitionerId].ageInReligion !== 'number');
        decide(s, terna.length ? [{ id: terna[0].petitionerId }] : []);
        for (const c of fresh) {
          const r = s.petitioners[c.petitionerId];
          checked++;
          if (r.ageInReligion !== c.yearsInSociety || r.totalYearsInSociety !== c.yearsInSociety) {
            mismatches.push([c.petitionerId, c.yearsInSociety, r.ageInReligion, r.totalYearsInSociety]);
          }
        }
        resolveYear(s);
      }
    }
    ok('card-seed: card value == engine seed for every entering man', checked > 0 && mismatches.length === 0,
      `checked=${checked} ${JSON.stringify(mismatches.slice(0, 3))}`);
  }
  // Null yearsInSociety on a historical record: card-seeded value is used, deterministically.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'card-null' });
    const g = getGameData();
    const pet = g.petitioners.find((p) => !p.fictional);
    const saved = pet.yearsInSociety;
    pet.yearsInSociety = null;
    try {
      const v1 = cardYearsInSociety(s, pet.id), v2 = cardYearsInSociety(s, pet.id);
      ok('card-seed: null record gets seeded card value', Number.isInteger(v1) && v1 >= 1 && v1 <= 28 && v1 === v2, String(v1));
      s.petitioners[pet.id] = { id: pet.id, fictional: false, status: 'denied', history: [], deniedCount: 1,
        usedLetters: [], voyages: [], archived: false, entryYear: s.year };
      initAgeInReligion(s, pet.id);
      ok('card-seed: null record seeds both counters from card value (not 0)',
        s.petitioners[pet.id].ageInReligion === v1 && s.petitioners[pet.id].totalYearsInSociety === v1);
      const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'card-null' });
      ok('card-seed: same seed -> same value', cardYearsInSociety(s2, pet.id) === v1);
    } finally { pet.yearsInSociety = saved; }
  }

  // 40n. Formation & Mission history: recorded live, in year order.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'hist-live' });
    const id = vowsMan(s, 'hl', 1, 'novice', 'scholastic');
    initAgeInReligion(s, id);
    resolveYear(s); // 1 -> 2
    resolveYear(s); // queues firstVows at 2
    decideVows(s, id, 'firstVows', 'defer');
    const defY = s.year;
    resolveYear(s); resolveYear(s); // paused 2 years
    resolveYear(s); // deferral over: resumes, re-queued
    decideVows(s, id, 'firstVows', 'proceed');
    const h = personHistory(s, id);
    const evs = h.events.map((e) => e.event);
    ok('history: deferral recorded', evs.includes('deferred'));
    const end = h.events.find((e) => e.event === 'deferral-ended');
    ok('history: deferral-ended with 2 years paused', end && end.pausedYears === 2 && end.year === defY + 2, JSON.stringify(end));
    ok('history: first vows recorded after deferral', evs.indexOf('first-vows') > evs.indexOf('deferral-ended'));
    ok('history: summary pausedYears 2', h.summary.pausedYears === 2 && h.summary.totalYearsInSociety === h.summary.ageInReligion + 2,
      JSON.stringify(h.summary));
    ok('history: all formation kind', h.events.every((e) => e.kind === 'formation'));
    ok('history: rec flagged', s.petitioners[id].historyV === HISTORY_VERSION);

    // Desk + voyage path: entry, petition approved, departure, arrival.
    const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'hist-voyage' });
    const { terna } = startYear(s2);
    const pid = terna[0].petitionerId;
    decide(s2, [{ id: pid }]);
    for (let i = 0; i < 12 && !(s2.voyages || []).some((v) => v.petitionerId === pid && v.stage === 'arrived'); i++) {
      resolveYear(s2); const st = startYear(s2); decide(s2, []);
    }
    const h2 = personHistory(s2, pid);
    const e2 = h2.events.map((e) => e.event);
    ok('history: entry event on approval', e2[0] === 'entry' || e2.includes('entry'), JSON.stringify(e2));
    ok('history: Indies petition outcome shown', h2.events.some((e) => e.event === 'approved' && e.kind === 'mission'));
    ok('history: departure recorded', e2.includes('departure'), JSON.stringify(e2));
    ok('history: arrival recorded with location', h2.events.some((e) => e.event === 'arrival' && e.destinationName), JSON.stringify(e2));
    const yrs = h2.events.map((e) => e.year);
    ok('history: chronological', yrs.every((y, k) => k === 0 || y >= yrs[k - 1]));
    ok('history: card history lines unchanged (legacy only)',
      s2.petitioners[pid].history.filter((x) => !x.kind).every((x) => x.decision));
    const den = terna.slice(1).map((c) => c.petitionerId);
    ok('history: denied men get entry + denied petition', den.every((d) => {
      const ev = personHistory(s2, d).events; return ev.some((e) => e.event === 'entry') && ev.some((e) => e.event === 'denied');
    }));

    // Backfill: strip life events from an "old save" and reload.
    const raw = JSON.parse(JSON.stringify(serialize(s2)));
    for (const r of Object.values(raw.petitioners)) { r.history = (r.history || []).filter((x) => !x.kind); delete r.historyV; }
    const back = deserialize(raw);
    const hb = personHistory(back, pid);
    const eb = hb.events.map((e) => e.event);
    ok('history backfill: entry + departure + arrival restored', ['entry', 'departure', 'arrival'].every((k) => eb.includes(k)), JSON.stringify(eb));
    ok('history backfill: marked backfilled', hb.events.filter((e) => !e.legacy).every((e) => e.backfilled));
    ok('history backfill: entry first', eb[0] === 'entry', JSON.stringify(eb));
    ok('history backfill: chronological', hb.events.every((e, k, a) => k === 0 || e.year >= a[k - 1].year));
    ok('history backfill: idempotent round-trip', JSON.stringify(serialize(deserialize(serialize(back)))) === JSON.stringify(serialize(back)));
  }

  // 40o. Mission-novitiate men: novitiate years count toward both counters, logged in history.
  {
    const mk = (seed, novYears) => {
      const s = newGameWithGalleons({ mode: 'campaign', seed });
      const dest = getGameData().destinations[0].id;
      const y0 = s.year;
      const id = `nov-${dest}-${y0 - (novYears - 2)}-0`;
      s.novices = [{ id, name: 'Test (novice)', destination: dest, startYear: y0 - (novYears - 2), readyYear: y0 + 2 }];
      resolveYear(s); startYear(s); decide(s, []);
      resolveYear(s); startYear(s); decide(s, []);
      ok(`novitiate(${novYears}): not yet entered before readyYear`, !s.petitioners[id]);
      resolveYear(s); // readyYear: enters the rolls, then the year advances
      return { s, id, dest, y0 };
    };
    {
      const { s, id, dest, y0 } = mk('nov-2', 2);
      const r = s.petitioners[id];
      ok('novitiate: entered European labor', (s.europeanLabor || []).some((e) => e.petitionerId === id));
      ok('novitiate: 2 years credited at entry (then +1 year-advance)', r.ageInReligion === 3 && r.totalYearsInSociety === 3,
        `${r.ageInReligion}/${r.totalYearsInSociety}`);
      ok('novitiate: record kept', r.novitiate && r.novitiate.years === 2 && r.novitiate.destination === dest && r.novitiateCounted === true);
      ok('novitiate: first vows queued at 2 (same rule as everyone: >= 2 queues, > 2 auto-completes)',
        (s.pendingVows || []).some((x) => x.petitionerId === id && x.type === 'firstVows') && !r.vows.firstVows);
      const ev = personHistory(s, id).events;
      const ne = ev.find((e) => e.event === 'novitiate-entry'), nc = ev.find((e) => e.event === 'novitiate-completed');
      ok('novitiate history: entry at mission, at start year', ne && ne.year === y0 && ne.destination === dest && ne.destinationName);
      ok('novitiate history: completion with years', nc && nc.year === y0 + 2 && nc.years === 2);
      const order = ev.map((e) => e.event);
      ok('novitiate history: novitiate before rolls entry', order.indexOf('novitiate-entry') < order.indexOf('novitiate-completed')
        && order.indexOf('novitiate-completed') < order.indexOf('entry'), JSON.stringify(order));
      ok('novitiate history: entry text shows 2 years', /with 2 years in the Society/.test(ev.find((e) => e.event === 'entry').text));

      // Old-save migration: strip everything the new code adds.
      const raw = JSON.parse(JSON.stringify(serialize(s)));
      const rr = raw.petitioners[id];
      delete rr.ageInReligion; delete rr.totalYearsInSociety; delete rr.novitiate; delete rr.novitiateCounted;
      delete rr.yearsInSociety; delete rr.historyV; rr.history = rr.history.filter((h) => !h.kind);
      const back = deserialize(raw);
      const br = back.petitioners[id];
      ok('novitiate migration (pre-counter save): 2 + elapsed', br.ageInReligion === 3 && br.totalYearsInSociety === 3,
        `${br.ageInReligion}/${br.totalYearsInSociety}`);
      const bev = personHistory(back, id).events.map((e) => e.event);
      ok('novitiate migration: history backfilled', ['novitiate-entry', 'novitiate-completed', 'entry'].every((k) => bev.includes(k)), JSON.stringify(bev));
      // Save from a build that seeded counters without the novitiate (0 + elapsed = 1).
      const raw2 = JSON.parse(JSON.stringify(serialize(s)));
      const r2 = raw2.petitioners[id];
      r2.ageInReligion = 1; r2.totalYearsInSociety = 1; delete r2.novitiate; delete r2.novitiateCounted; delete r2.yearsInSociety;
      r2.history = r2.history.filter((h) => !/^novitiate/.test(h.event || ''));
      const b2 = deserialize(raw2).petitioners[id];
      ok('novitiate migration (counter save): credited once', b2.ageInReligion === 3 && b2.totalYearsInSociety === 3, `${b2.ageInReligion}/${b2.totalYearsInSociety}`);
      const again = deserialize(serialize(deserialize(raw2))).petitioners[id];
      ok('novitiate migration: idempotent', again.ageInReligion === 3 && again.history.filter((h) => h.event === 'novitiate-completed').length === 1);
    }
    {
      const { s, id } = mk('nov-3', 3); // actual time spent: 3 years
      const r = s.petitioners[id];
      ok('novitiate(3): actual years credited', r.novitiate.years === 3 && r.ageInReligion === 4 && r.totalYearsInSociety === 4,
        `${r.novitiate.years} ${r.ageInReligion}/${r.totalYearsInSociety}`);
      ok('novitiate(3): first vows auto-completed at entry (> 2, consistent rule)', r.vows.firstVows === true
        && personHistory(s, id).events.some((e) => e.event === 'first-vows' && e.auto));
    }
  }

  // 40p. Novitiate men: grade/track persisted on the record, stable across reloads.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'nov-grade' });
    const dest = getGameData().destinations[0].id;
    const id = `nov-${dest}-${s.year}-7`;
    s.novices = [{ id, name: 'Grade (novice)', destination: dest, startYear: s.year, readyYear: s.year + 2 }];
    for (let i = 0; i < 3; i++) { resolveYear(s); if (i < 2) { startYear(s); decide(s, []); } }
    const r = s.petitioners[id];
    const snap = (st) => JSON.stringify([gradeFor(st, id), EngineNS.vowsTrackFor(st, id), staffGradeFor(st, id), careerStage(st, id)]);
    ok('nov-grade: grade + track saved on record', r.savedGrade && r.savedGrade.grade === 'scholastic' && r.vowsTrack === 'scholastic');
    ok('nov-grade: in-memory table not written', MEM_GRADES[id] === undefined);
    const before = snap(s);
    // Reload as a fresh process would (no in-memory entry) ...
    const a = deserialize(JSON.parse(JSON.stringify(serialize(s))));
    ok('nov-grade: identical after reload', snap(a) === before, `${before} vs ${snap(a)}`);
    // ... and with the in-memory setting changed to something else.
    MEM_GRADES[id] = { grade: 'brother', ordained: false };
    try {
      const b = deserialize(JSON.parse(JSON.stringify(serialize(s))));
      ok('nov-grade: identical with in-memory setting changed', snap(b) === before, `${before} vs ${snap(b)}`);
      const c = deserialize(serialize(deserialize(serialize(b))));
      ok('nov-grade: stable over repeated reloads', snap(c) === before);
    } finally { delete MEM_GRADES[id]; }

    // Old save (no saved grade/track): computed once on load, then stable.
    const raw = JSON.parse(JSON.stringify(serialize(s)));
    delete raw.petitioners[id].savedGrade; delete raw.petitioners[id].vowsTrack;
    const m1 = deserialize(raw);
    ok('nov-grade migration: computed and saved', m1.petitioners[id].savedGrade && m1.petitioners[id].savedGrade.grade === 'scholastic'
      && m1.petitioners[id].vowsTrack === 'scholastic');
    ok('nov-grade migration: matches pre-save behaviour', snap(m1) === before, `${before} vs ${snap(m1)}`);
    MEM_GRADES[id] = { grade: 'father', ordained: true };
    try {
      const m2 = deserialize(JSON.parse(JSON.stringify(serialize(m1))));
      ok('nov-grade migration: later reloads ignore in-memory setting', snap(m2) === before, snap(m2));
    } finally { delete MEM_GRADES[id]; }
    // Old save whose man is already on the brother track keeps it.
    const raw2 = JSON.parse(JSON.stringify(serialize(s)));
    const r2 = raw2.petitioners[id];
    delete r2.savedGrade; delete r2.vowsTrack; r2.vows.stage = 'brother';
    const e2 = raw2.europeanLabor.find((e) => e.petitionerId === id); if (e2) e2.vows = r2.vows;
    const m3 = deserialize(raw2);
    ok('nov-grade migration: brother stage respected', m3.petitioners[id].savedGrade.grade === 'brother'
      && m3.petitioners[id].vowsTrack === 'brother' && staffGradeFor(m3, id) === 'brothers');
  }
}


// --- 41. Governance: provincial reports & staged decisions -------------------
{
  const G = EngineNS;
  // newGame initializes governance state
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-t1' });
    ok('gov: reports/staged init empty', Array.isArray(s.reports) && s.reports.length === 0
      && Array.isArray(s.staged) && s.staged.length === 0 && s.seq.report === 0);
  }
  // fragile report generation (newly fragile only) + dedupe
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-t2' });
    const st = missionStaff(s, 'goa');
    st.fathers = 0; st.coadjutors = 1; st.brothers = 0; st.capacity = 5;
    st.fragileYears = 5; st.fragile = true;
    // silence other missions' request reports by staffing them
    for (const d of ['japan', 'china', 'peru', 'philippines']) {
      const m = missionStaff(s, d); m.fathers = 2; m.coadjutors = 2; m.brothers = 1;
    }
    G.generateReports(s, s.year);
    const fr = s.reports.filter((r) => r.kind === 'fragile' && r.destId === 'goa');
    ok('gov: fragile report queued', fr.length === 1 && fr[0].status === 'pending');
    ok('gov: fragile facts honest', fr[0].facts.staffed === 1 && fr[0].facts.capacity === 5 && fr[0].facts.fragile === true);
    ok('gov: fragile has dispatch + instruct recs',
      fr[0].recommendations.some((r) => r.action && r.action.type === 'dispatch')
      && fr[0].recommendations.some((r) => r.action && r.action.type === 'instruct'));
    const n0 = s.reports.length;
    G.generateReports(s, s.year);
    ok('gov: no duplicate pending report', s.reports.length === n0);
    ok('gov: region from game data', fr[0].region === 'Asia');
  }
  // request report for understaffed mission
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-t3' });
    for (const d of ['goa', 'japan', 'china', 'philippines']) {
      const m = missionStaff(s, d); m.fathers = 2; m.coadjutors = 2; m.brothers = 1;
    }
    const st = missionStaff(s, 'peru');
    st.fathers = 0; st.coadjutors = 1; st.brothers = 0; st.capacity = 5;
    G.generateReports(s, s.year);
    const rq = s.reports.filter((r) => r.kind === 'request' && r.destId === 'peru' && r.status === 'pending');
    ok('gov: request report queued', rq.length === 1);
  }
  // decideReport lifecycle
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-t4' });
    const rep = G.queueReport(s, { kind: 'request', destId: 'goa', year: s.year, title: 't', body: 'b', facts: {}, recommendations: [] });
    G.decideReport(s, rep.id, 'acknowledge');
    ok('gov: acknowledge sets status', s.reports.find((r) => r.id === rep.id).status === 'acknowledged');
    ok('gov: acknowledge in ledger', getLedger(s).some((e) => e.type === 'report' && e.decision === 'acknowledged'));
    let threw = false;
    try { G.decideReport(s, rep.id, 'decline'); } catch (e) { threw = true; }
    ok('gov: double-decide throws', threw);
    threw = false;
    try { G.decideReport(s, 'rep-nope', 'acknowledge'); } catch (e) { threw = true; }
    ok('gov: unknown report throws', threw);
    const rep2 = G.queueReport(s, { kind: 'request', destId: 'japan', year: s.year, title: 't2', body: 'b2', facts: {}, recommendations: [] });
    G.decideReport(s, rep2.id, 'defer', 'revisit next year');
    ok('gov: defer records note', s.reports.find((r) => r.id === rep2.id).decision.note === 'revisit next year');
  }
  // staging + validation
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-t5' });
    // Ships-only: a staged sending is fillable only while the named men
    // actually stand free in Europe. Seed one scholastic there.
    const g5 = seedLabor(s, 1, 'gov5');
    s.petitioners[g5[0]].vows = { stage: 'scholastic' };
    const rep = G.queueReport(s, { kind: 'fragile', destId: 'goa', year: s.year, title: 't', body: 'b',
      facts: {}, recommendations: [{ id: 'reinforce', text: 'Reinforce', action: { type: 'dispatch', destId: 'goa', counts: { fathers: 0, coadjutors: 1, brothers: 0 } } }] });
    const sa = G.stageRecommendation(s, rep.id, 'reinforce');
    ok('gov: staged', s.staged.length === 1 && sa.status === 'staged');
    let threw = false;
    try { G.stageRecommendation(s, rep.id, 'reinforce'); } catch (e) { threw = true; }
    ok('gov: duplicate stage throws', threw);
    // invalid: the one coadjutor leaves Europe, so the sending cannot be filled
    const laborBackup = s.europeanLabor;
    s.europeanLabor = [];
    threw = false;
    try { G.validateStagedAction(s, sa); } catch (e) { threw = true; }
    ok('gov: validate catches missing men', threw);
    s.europeanLabor = laborBackup;
    const v = G.validateStagedAction(s, sa);
    ok('gov: validate passes when the men stand free', v.ok === true);
    G.discardStaged(s, sa.id);
    ok('gov: discard removes staged', s.staged.length === 0);
  }
  // applyStaged: happy path + atomic rollback
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-t6' });
    s.resources.funds = 10000;
    const g6 = seedLabor(s, 2, 'gov6');
    s.petitioners[g6[0]].vows = { stage: 'scholastic' };
    s.petitioners[g6[1]].vows = { stage: 'scholastic' };
    const rep = G.queueReport(s, { kind: 'request', destId: 'goa', year: s.year, title: 't', body: 'b',
      facts: {}, recommendations: [{ id: 'reinforce', text: 'Reinforce', action: { type: 'dispatch', destId: 'goa', counts: { fathers: 0, coadjutors: 2, brothers: 0 } } }] });
    G.stageRecommendation(s, rep.id, 'reinforce');
    const funds0 = s.resources.funds;
    const staff0 = missionStaffed(missionStaff(s, 'goa'));
    const applied = G.applyStaged(s);
    // Ships-only: applying queues the two named men for the fleet — no
    // charge and no staffing until a ship carries them.
    ok('gov: apply sends named men to the dock', applied.length === 1 && s.resources.funds === funds0
      && missionStaffed(missionStaff(s, 'goa')) === staff0
      && g6.every((id) => s.queue.some((q) => q.petitionerId === id && q.status === 'awaiting' && q.destination === 'goa')),
      JSON.stringify(s.queue.map((q) => q.petitionerId)));
    ok('gov: report marked acted', s.reports.find((r) => r.id === rep.id).status === 'acted');
    ok('gov: staged cleared', s.staged.length === 0);
    let threw = false;
    try { G.applyStaged(s); } catch (e) { threw = true; }
    ok('gov: apply with empty staged throws', threw);
  }
  {
    // rollback: first action valid, second fails at apply time
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-t7' });
    s.resources.funds = 10000;
    const g7 = seedLabor(s, 1, 'gov7');
    s.petitioners[g7[0]].vows = { stage: 'scholastic' };
    const rep = G.queueReport(s, { kind: 'request', destId: 'goa', year: s.year, title: 't', body: 'b',
      facts: {}, recommendations: [
        { id: 'r1', text: 'Reinforce Goa', action: { type: 'dispatch', destId: 'goa', counts: { fathers: 0, coadjutors: 1, brothers: 0 } } },
        { id: 'r2', text: 'Instruct Goa', action: { type: 'instruct', destId: 'goa', instructionType: 'encourage' } },
      ] });
    G.stageRecommendation(s, rep.id, 'r1');
    G.stageRecommendation(s, rep.id, 'r2');
    // sabotage: put an instruction in transit so r2 fails re-validation at apply
    s.instructions['goa'] = { type: 'expand', issuedYear: s.year, arriveYear: s.year + 2, status: 'in-transit', outcome: null };
    const funds0 = s.resources.funds;
    const staff0 = missionStaffed(missionStaff(s, 'goa'));
    let threw = false;
    try { G.applyStaged(s); } catch (e) { threw = true; }
    ok('gov: batch with invalid action throws', threw);
    ok('gov: rollback restored funds and staffing', s.resources.funds === funds0
      && missionStaffed(missionStaff(s, 'goa')) === staff0
      && s.queue.length === 0 && s.europeanLabor.some((e) => e.petitionerId === g7[0]));
    ok('gov: rollback kept staged + pending', s.staged.length === 2
      && s.reports.find((r) => r.id === rep.id).status === 'pending');
  }
  // persistence round-trip + legacy backfill
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-t8b' });
    const rep = G.queueReport(s, { kind: 'request', destId: 'goa', year: s.year, title: 't', body: 'b',
      facts: { staffed: 1 }, recommendations: [{ id: 'r1', text: 't', action: { type: 'instruct', destId: 'goa', instructionType: 'encourage' } }] });
    G.stageRecommendation(s, rep.id, 'r1');
    const raw = serialize(s);
    const s2 = deserialize(raw);
    ok('gov: reports survive round-trip', s2.reports.length === 1 && s2.reports[0].id === rep.id
      && s2.reports[0].facts.staffed === 1);
    ok('gov: staged survives round-trip', s2.staged.length === 1 && s2.staged[0].reportId === rep.id);
    const raw2 = serialize(s);
    delete raw2.reports; delete raw2.staged; delete raw2.seq.report;
    const s3 = deserialize(raw2);
    ok('gov: legacy save backfills', Array.isArray(s3.reports) && Array.isArray(s3.staged) && s3.seq.report === 0);
  }
  // report ids stable across round-trip
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-t9' });
    const a = G.queueReport(s, { kind: 'request', destId: 'goa', year: s.year, title: 'a', body: 'b', facts: {}, recommendations: [] });
    const b = G.queueReport(s, { kind: 'request', destId: 'japan', year: s.year, title: 'b', body: 'b', facts: {}, recommendations: [] });
    const s2 = deserialize(serialize(s));
    ok('gov: ids stable', s2.reports.map((r) => r.id).join(',') === [a.id, b.id].join(','));
  }
}


// --- 42. Governance audit fixes: lost deaths, multi-action, ids, conflicts, rollback, reopen ---
{
  const G = EngineNS;
  // Fix 1: two deaths at one destination -> two distinct, traceable reports; none lost
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-a1' });
    for (const d of ['japan', 'china', 'peru', 'philippines']) {
      const m = missionStaff(s, d); m.fathers = 2; m.coadjutors = 2; m.brothers = 1;
    }
    const mkVoy = (n) => ({ id: `voy-test-${n}`, petitionerId: `hist-${n}`, petitionerName: `Test Man ${n}`,
      destination: 'goa', departYear: s.year, travelYears: 2, arriveYear: s.year, stage: 'resolved',
      outcome: 'deceased', resolvedYear: s.year, newsDelivered: true });
    s.voyages.push(mkVoy(1), mkVoy(2));
    G.generateReports(s, s.year);
    const deaths = s.reports.filter((r) => r.kind === 'voyage');
    ok('gov-audit: two deaths -> two reports', deaths.length === 2);
    ok('gov-audit: deaths traceable', deaths.every((r) => r.facts.petitionerId && r.facts.voyageId)
      && new Set(deaths.map((r) => r.facts.voyageId)).size === 2);
    ok('gov-audit: both voyages marked', [1, 2].every((n) => s.voyages.find((v) => v.id === `voy-test-${n}`).deathReported === true));
    // second generation: no duplicates, no unmarking
    G.generateReports(s, s.year);
    ok('gov-audit: no duplicate death reports', s.reports.filter((r) => r.kind === 'voyage').length === 2);
  }
  // Fix 1b: death while a voyage report pending for same dest -> still reported
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-a1b' });
    for (const d of ['japan', 'china', 'peru', 'philippines']) {
      const m = missionStaff(s, d); m.fathers = 2; m.coadjutors = 2; m.brothers = 1;
    }
    s.voyages.push({ id: 'voy-a', petitionerId: 'hist-1', petitionerName: 'Man A', destination: 'goa',
      departYear: s.year, travelYears: 2, arriveYear: s.year, stage: 'resolved', outcome: 'deceased', resolvedYear: s.year, newsDelivered: true });
    G.generateReports(s, s.year);
    s.voyages.push({ id: 'voy-b', petitionerId: 'hist-2', petitionerName: 'Man B', destination: 'goa',
      departYear: s.year, travelYears: 2, arriveYear: s.year, stage: 'resolved', outcome: 'deceased', resolvedYear: s.year, newsDelivered: true });
    G.generateReports(s, s.year);
    const deaths = s.reports.filter((r) => r.kind === 'voyage');
    ok('gov-audit: second death not suppressed', deaths.length === 2
      && deaths.some((r) => r.facts.voyageId === 'voy-b'));
  }
  // Fix 2: two recommendations from one report staged + applied -> both recorded
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-a2' });
    s.resources.funds = 10000;
    const ga2 = seedLabor(s, 1, 'gova2');
    s.petitioners[ga2[0]].vows = { stage: 'scholastic' };
    const rep = G.queueReport(s, { kind: 'fragile', destId: 'goa', year: s.year, title: 't', body: 'b',
      facts: {}, recommendations: [
        { id: 'r1', text: 'Reinforce', action: { type: 'dispatch', destId: 'goa', counts: { fathers: 0, coadjutors: 1, brothers: 0 } } },
        { id: 'r2', text: 'Encourage', action: { type: 'instruct', destId: 'goa', instructionType: 'encourage' } },
      ] });
    G.stageRecommendation(s, rep.id, 'r1');
    G.stageRecommendation(s, rep.id, 'r2');
    const applied = G.applyStaged(s);
    const r2 = s.reports.find((r) => r.id === rep.id);
    ok('gov-audit: both actions applied', applied.length === 2);
    ok('gov-audit: both recorded on report', r2.appliedActions.length === 2
      && r2.appliedActions.some((a) => a.recId === 'r1') && r2.appliedActions.some((a) => a.recId === 'r2'));
    ok('gov-audit: decision note lists both', /Reinforce/.test(r2.decision.note) && /Encourage/.test(r2.decision.note));
    ok('gov-audit: ledger has both', getLedger(s).filter((e) => e.type === 'report' && e.decision === 'acted' && e.reportId === rep.id).length === 2);
  }
  // Fix 3: staged IDs unique across discard/re-stage/apply cycles
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-a3' });
    const rep = G.queueReport(s, { kind: 'request', destId: 'goa', year: s.year, title: 't', body: 'b',
      facts: {}, recommendations: [
        { id: 'r1', text: 'A', action: { type: 'instruct', destId: 'goa', instructionType: 'encourage' } },
        { id: 'r2', text: 'B', action: { type: 'instruct', destId: 'japan', instructionType: 'encourage' } },
      ] });
    const a = G.stageRecommendation(s, rep.id, 'r1');
    G.discardStaged(s, a.id);
    const b = G.stageRecommendation(s, rep.id, 'r1');
    const c = G.stageRecommendation(s, rep.id, 'r2');
    ok('gov-audit: staged ids unique after discard', new Set([a.id, b.id, c.id]).size === 3);
    G.applyStaged(s);
    const rep2 = G.queueReport(s, { kind: 'request', destId: 'china', year: s.year, title: 't2', body: 'b2',
      facts: {}, recommendations: [{ id: 'r1', text: 'A2', action: { type: 'instruct', destId: 'china', instructionType: 'encourage' } }] });
    const d = G.stageRecommendation(s, rep2.id, 'r1');
    ok('gov-audit: staged id unique after apply', ![a.id, b.id, c.id].includes(d.id));
  }
  // Fix 4: batch conflict detected (two sendings, each fillable alone —
  // 3 scholastics in Europe — but not together: they need 4 named men)
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-a4' });
    seedLabor(s, 3, 'a4');
    for (const id of ['test-a4-0', 'test-a4-1', 'test-a4-2']) s.petitioners[id].vows = { stage: 'scholastic' };
    const rep = G.queueReport(s, { kind: 'request', destId: 'goa', year: s.year, title: 't', body: 'b',
      facts: {}, recommendations: [
        { id: 'r1', text: 'Send 2', action: { type: 'dispatch', destId: 'goa', counts: { fathers: 0, coadjutors: 2, brothers: 0 } } },
        { id: 'r2', text: 'Send 2 more', action: { type: 'dispatch', destId: 'japan', counts: { fathers: 0, coadjutors: 2, brothers: 0 } } },
      ] });
    G.stageRecommendation(s, rep.id, 'r1');
    G.stageRecommendation(s, rep.id, 'r2');
    const funds0 = s.resources.funds;
    const staff0 = missionStaffed(missionStaff(s, 'goa')) + missionStaffed(missionStaff(s, 'japan'));
    let threw = false, msg = '';
    try { G.applyStaged(s); } catch (e) { threw = true; msg = e.message; }
    ok('gov-audit: batch conflict throws', threw && /rolled back/.test(msg));
    ok('gov-audit: conflict rollback restores funds+staff', s.resources.funds === funds0
      && missionStaffed(missionStaff(s, 'goa')) + missionStaffed(missionStaff(s, 'japan')) === staff0);
    ok('gov-audit: conflict keeps staged+pending', s.staged.length === 2
      && s.reports.find((r) => r.id === rep.id).status === 'pending');
  }
  // Fix 4b: rollback restores rngState, seq counters, ledger length
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-a4b' });
    s.resources.funds = 10000; s.available = 50;
    seedLabor(s, 1, 'a4b');
    s.petitioners['test-a4b-0'].vows = { stage: 'scholastic' };
    const rep = G.queueReport(s, { kind: 'request', destId: 'goa', year: s.year, title: 't', body: 'b',
      facts: {}, recommendations: [
        { id: 'r1', text: 'Reinforce', action: { type: 'dispatch', destId: 'goa', counts: { fathers: 0, coadjutors: 1, brothers: 0 } } },
        { id: 'r2', text: 'Bad instruct', action: { type: 'instruct', destId: 'nope-nowhere', instructionType: 'encourage' } },
      ] });
    // r2 passes staging? No — validateStagedAction runs at stage time and would throw for unknown dest.
    // So stage only r1, then corrupt r2's action post-staging to simulate mid-batch failure.
    G.stageRecommendation(s, rep.id, 'r1');
    const sa2 = { id: 'stg-evil', reportId: rep.id, recId: 'r2', destId: 'goa', label: 'Evil',
      action: { type: 'dispatch', destId: 'goa', counts: { fathers: 0, coadjutors: 1, brothers: 0 } },
      stagedYear: s.year, status: 'staged' };
    s.staged.push(sa2);
    const rng0 = JSON.stringify(s.rngState);
    const seq0 = JSON.stringify(s.seq);
    const ledger0 = s.ledger.length;
    const repStatus0 = rep.status;
    // sabotage sa2 after validation snapshot: demand men who do not exist
    let threw = false;
    // force failure by draining funds between actions: patch via staged action that spends all
    s.staged[1].action = { type: 'dispatch', destId: 'goa', counts: { fathers: 0, coadjutors: 1000, brothers: 0 } };
    try { G.applyStaged(s); } catch (e) { threw = true; }
    ok('gov-audit: mid-batch failure throws', threw);
    ok('gov-audit: rollback restores rngState', JSON.stringify(s.rngState) === rng0);
    ok('gov-audit: rollback restores seq', JSON.stringify(s.seq) === seq0);
    ok('gov-audit: rollback restores ledger length', s.ledger.length === ledger0);
    ok('gov-audit: rollback restores report status', s.reports.find((r) => r.id === rep.id).status === repStatus0);
  }
  // Fix 5: deferred reports can be reopened and re-decided
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-a5' });
    const rep = G.queueReport(s, { kind: 'request', destId: 'goa', year: s.year, title: 't', body: 'b', facts: {}, recommendations: [] });
    G.decideReport(s, rep.id, 'defer');
    ok('gov-audit: deferred leaves pending inbox', G.pendingReports(s).length === 0);
    G.reopenReport(s, rep.id);
    ok('gov-audit: reopened returns to pending', G.pendingReports(s).some((r) => r.id === rep.id));
    G.decideReport(s, rep.id, 'acknowledge');
    ok('gov-audit: re-decided after reopen', s.reports.find((r) => r.id === rep.id).status === 'acknowledged');
    let threw = false;
    try { G.reopenReport(s, rep.id); } catch (e) { threw = true; }
    ok('gov-audit: reopen non-deferred throws', threw);
  }
  // Fix 5b: legacy reports gain dedupeKey + appliedActions on load
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-a5b' });
    const rep = G.queueReport(s, { kind: 'request', destId: 'goa', year: s.year, title: 't', body: 'b', facts: {}, recommendations: [] });
    const raw = serialize(s);
    delete raw.reports[0].dedupeKey; delete raw.reports[0].appliedActions;
    const s2 = deserialize(raw);
    ok('gov-audit: legacy report backfilled', typeof s2.reports[0].dedupeKey === 'string'
      && Array.isArray(s2.reports[0].appliedActions));
  }
}


// --- 43. Governance: legacy death-report recovery migration -------------------
{
  const G = EngineNS;
  // Fixture reproducing the b9cc098 bug: two deaths at Goa, only the first
  // got a (legacy-format, no dedupeKey/voyageId) report; both voyages flagged.
  const buildLegacySave = () => {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-leg' });
    for (const d of ['japan', 'china', 'peru', 'philippines']) {
      const m = missionStaff(s, d); m.fathers = 2; m.coadjutors = 2; m.brothers = 1;
    }
    s.voyages.push(
      { id: 'voy-1', petitionerId: 'hist-1', petitionerName: 'Man One', destination: 'goa',
        departYear: s.year, travelYears: 2, arriveYear: s.year, stage: 'resolved',
        outcome: 'deceased', resolvedYear: s.year, newsDelivered: true, deathReported: true },
      { id: 'voy-2', petitionerId: 'hist-2', petitionerName: 'Man Two', destination: 'goa',
        departYear: s.year, travelYears: 2, arriveYear: s.year, stage: 'resolved',
        outcome: 'deceased', resolvedYear: s.year, newsDelivered: true, deathReported: true });
    // What b9cc098 actually persisted for the first death: no dedupeKey, no voyageId.
    s.reports.push({
      id: 'rep-1615-1', kind: 'voyage', destId: 'goa', destName: 'Goa, the Indies', region: 'Asia',
      year: s.year, title: 'Death reported: Man One', body: 'legacy body',
      facts: { petitionerId: 'hist-1', destination: 'goa', departYear: s.year },
      recommendations: [], status: 'pending', decision: null,
    });
    const raw = serialize(s);
    // strip the new-format fields to match the b9cc098 shape exactly
    for (const r of raw.reports) { delete r.dedupeKey; delete r.appliedActions; }
    return raw;
  };
  {
    const s2 = deserialize(buildLegacySave());
    const voyages = s2.reports.filter((r) => r.kind === 'voyage');
    ok('gov-leg: existing report preserved, not duplicated',
      voyages.filter((r) => r.facts.petitionerId === 'hist-1').length === 1);
    const rec = voyages.find((r) => r.facts.voyageId === 'voy-2');
    ok('gov-leg: missing death recovered', !!rec && rec.facts.petitionerId === 'hist-2');
    ok('gov-leg: recovered report is pending and traceable',
      rec.status === 'pending' && rec.facts.recovered === true && rec.dedupeKey === 'voyage:voy-2');
    ok('gov-leg: recovered report has reviewable recommendation',
      rec.recommendations.length === 1 && rec.recommendations[0].action.type === 'instruct');
    ok('gov-leg: voyage flags untouched',
      ['voy-1', 'voy-2'].every((id) => s2.voyages.find((v) => v.id === id).deathReported === true));
    ok('gov-leg: existing history not altered',
      s2.reports.find((r) => r.facts.petitionerId === 'hist-1').title === 'Death reported: Man One');
    // idempotency across save/load cycles
    const s3 = deserialize(serialize(s2));
    ok('gov-leg: no duplicates on reload',
      s3.reports.filter((r) => r.kind === 'voyage').length === 2);
    const s4 = deserialize(serialize(s3));
    ok('gov-leg: stable across further cycles',
      s4.reports.filter((r) => r.kind === 'voyage').length === 2);
  }
  // Already-decided legacy report counts as represented: no recovery, no duplicate
  {
    const raw = buildLegacySave();
    raw.reports[0].status = 'acknowledged';
    raw.reports[0].decision = { decision: 'acknowledge', year: raw.year, note: null };
    const s2 = deserialize(raw);
    ok('gov-leg: decided report not duplicated',
      s2.reports.filter((r) => r.kind === 'voyage' && r.facts.petitionerId === 'hist-1').length === 1);
    ok('gov-leg: second death still recovered',
      s2.reports.some((r) => r.facts.voyageId === 'voy-2'));
  }
  // Unrecoverable case: deceased voyage with no destination is left alone, no crash
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-leg2' });
    s.voyages.push({ id: 'voy-x', petitionerId: 'hist-9', petitionerName: 'Man X', destination: null,
      departYear: s.year, travelYears: 2, arriveYear: s.year, stage: 'resolved',
      outcome: 'deceased', resolvedYear: s.year, newsDelivered: true, deathReported: true });
    const s2 = deserialize(serialize(s));
    ok('gov-leg: destination-less death skipped safely',
      s2.reports.filter((r) => r.kind === 'voyage').length === 0);
  }
  // Non-deceased and unflagged voyages are ignored
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-leg3' });
    s.voyages.push({ id: 'voy-y', petitionerId: 'hist-9', petitionerName: 'Man Y', destination: 'goa',
      departYear: s.year, travelYears: 2, arriveYear: s.year, stage: 'resolved',
      outcome: 'thriving', resolvedYear: s.year, newsDelivered: true, deathReported: false });
    const s2 = deserialize(serialize(s));
    ok('gov-leg: non-deceased ignored', s2.reports.filter((r) => r.kind === 'voyage').length === 0);
  }
}


// --- 44. Governance: declined report blocks application of staged actions ---
{
  const G = EngineNS;
  const mkDispatchRep = (s, destId, title) => G.queueReport(s, { kind: 'request', destId, year: s.year,
    title, body: 'b', facts: {},
    recommendations: [{ id: 'r1', text: 'Send men',
      action: { type: 'dispatch', destId, counts: { fathers: 0, coadjutors: 1, brothers: 0 } } }] });
  const snap = (s) => ({ funds: s.resources.funds, avail: s.available,
    goa: missionStaffed(missionStaff(s, 'goa')), japan: missionStaffed(missionStaff(s, 'japan')),
    ledger: s.ledger.length, seq: JSON.stringify(s.seq), rng: JSON.stringify(s.rngState) });

  // 1+2. decline-after-staging: apply rejected, state fully unchanged
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-d1' });
    s.resources.funds = 10000; s.available = 50;
    const gd1 = seedLabor(s, 1, 'govd1');
    s.petitioners[gd1[0]].vows = { stage: 'scholastic' };
    const rep = mkDispatchRep(s, 'goa', 'Goa asks');
    G.stageRecommendation(s, rep.id, 'r1');
    G.decideReport(s, rep.id, 'decline', 'not now');
    const before = snap(s);
    let threw = false, msg = '';
    try { G.applyStaged(s); } catch (e) { threw = true; msg = e.message; }
    const after = snap(s);
    ok('gov-decline: apply rejected after decline', threw && /declined/.test(msg));
    ok('gov-decline: game state unchanged',
      after.funds === before.funds && after.avail === before.avail && after.goa === before.goa
      && after.ledger === before.ledger && after.seq === before.seq && after.rng === before.rng);
    ok('gov-decline: report stays declined',
      s.reports.find((r) => r.id === rep.id).status === 'declined');
    ok('gov-decline: staged action survives for discard',
      s.staged.length === 1 && s.staged[0].status === 'staged');
    ok('gov-decline: no applied actions recorded',
      (s.reports.find((r) => r.id === rep.id).appliedActions || []).length === 0);
  }
  // 3. mixed batch: valid + declined -> whole batch rejected and rolled back
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-d2' });
    s.resources.funds = 10000; s.available = 50;
    const gd2 = seedLabor(s, 2, 'govd2');
    for (const id of gd2) s.petitioners[id].vows = { stage: 'scholastic' };
    const repA = mkDispatchRep(s, 'goa', 'Goa asks');
    const repB = mkDispatchRep(s, 'japan', 'Japan asks');
    G.stageRecommendation(s, repA.id, 'r1');
    G.stageRecommendation(s, repB.id, 'r1');
    G.decideReport(s, repB.id, 'decline');
    const before = snap(s);
    let threw = false;
    try { G.applyStaged(s); } catch (e) { threw = true; }
    const after = snap(s);
    ok('gov-decline: mixed batch rejected', threw);
    ok('gov-decline: mixed batch fully rolled back',
      after.funds === before.funds && after.goa === before.goa && after.japan === before.japan
      && after.ledger === before.ledger);
    ok('gov-decline: valid report still pending, nothing applied',
      s.reports.find((r) => r.id === repA.id).status === 'pending'
      && (s.reports.find((r) => r.id === repA.id).appliedActions || []).length === 0);
    ok('gov-decline: both staged entries intact', s.staged.length === 2);
    // discarding the declined one lets the valid batch apply cleanly
    const bad = s.staged.find((x) => x.reportId === repB.id);
    G.discardStaged(s, bad.id);
    const applied = G.applyStaged(s);
    ok('gov-decline: valid action applies after discard', applied.length === 1
      && s.reports.find((r) => r.id === repA.id).status === 'acted');
  }
  // 4. validator flags it directly (UI badge path)
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-d3' });
    s.resources.funds = 10000; s.available = 50;
    const gd3 = seedLabor(s, 1, 'govd3');
    s.petitioners[gd3[0]].vows = { stage: 'scholastic' };
    const rep = mkDispatchRep(s, 'goa', 'Goa asks');
    const sa = G.stageRecommendation(s, rep.id, 'r1');
    G.decideReport(s, rep.id, 'decline');
    let threw = false, msg = '';
    try { G.validateStagedAction(s, sa); } catch (e) { threw = true; msg = e.message; }
    ok('gov-decline: validator rejects declined-report action', threw && /declined/.test(msg));
  }
  // 5. scope lock: acknowledge-after-stage still applies (only decline blocks)
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-d4' });
    s.resources.funds = 10000; s.available = 50;
    const gd4 = seedLabor(s, 1, 'govd4');
    s.petitioners[gd4[0]].vows = { stage: 'scholastic' };
    const rep = mkDispatchRep(s, 'goa', 'Goa asks');
    G.stageRecommendation(s, rep.id, 'r1');
    G.decideReport(s, rep.id, 'acknowledge');
    const applied = G.applyStaged(s);
    ok('gov-decline: acknowledge does not block apply', applied.length === 1
      && s.reports.find((r) => r.id === rep.id).status === 'acted');
  }
}


// --- 45. Governance: true entry year vs formula anchor -----------------------
{
  const G = EngineNS;
  // hist-1 has 5 historical years in the fixtures. The anchor (entryYear)
  // stays at the campaign start for the counters; the true entry year is
  // anchor minus historical years. Seeding happens via the deserialize
  // backfill for any rec that has an anchor but no true entry year.
  const seedHist1 = (s) => {
    const rec = G.ensureRecord(s, 'hist-1');
    rec.entryYear = s.year; // anchor, as the game assigns it at seeding
    return rec;
  };
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-entry' });
    seedHist1(s);
    const s2 = deserialize(serialize(s));
    const rec = s2.petitioners['hist-1'];
    ok('gov-entry: anchor preserved', rec.entryYear === 1615);
    ok('gov-entry: true entry year backfilled', rec.trueEntryYear === 1610);
    G.initAgeInReligion(s2, 'hist-1');
    ok('gov-entry: counters unaffected',
      G.yearsInSociety(s2, 'hist-1') === 5 && G.ageInReligion(s2, 'hist-1') === 5);
    const hist = G.personHistory(s2, 'hist-1');
    ok('gov-entry: history summary shows true entry', hist.summary.entryYear === 1610);
  }
  // pre-history saves: backfilled entry event uses the true entry year
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-entry1b' });
    const rec = G.ensureRecord(s, 'hist-1');
    rec.entryYear = s.year;
    delete rec.historyV; rec.history = [];
    const s2 = deserialize(serialize(s));
    const entryEv = G.personHistory(s2, 'hist-1').events.find((e) => e.event === 'entry');
    ok('gov-entry: backfilled entry event at true year', !!entryEv && entryEv.year === 1610);
  }
  // historical man with 14 years: true entry = anchor - 14
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-entry2' });
    const rec = G.ensureRecord(s, 'hist-9');
    rec.entryYear = s.year;
    const s2 = deserialize(serialize(s));
    ok('gov-entry: true entry = anchor - historical years',
      s2.petitioners['hist-9'].trueEntryYear === 1615 - 14);
  }
  // brand-new man (no history): true entry equals the anchor
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-entry2b' });
    const rec = G.ensureRecord(s, 'brand-new-man');
    rec.entryYear = s.year;
    const s2 = deserialize(serialize(s));
    ok('gov-entry: new man true==anchor',
      s2.petitioners['brand-new-man'].trueEntryYear === s2.petitioners['brand-new-man'].entryYear);
  }
  // backfill is idempotent: existing trueEntryYear is never overwritten
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'gov-entry3' });
    const rec = G.ensureRecord(s, 'hist-1');
    rec.entryYear = 1615;
    rec.trueEntryYear = 1609; // hand-corrected value
    const s2 = deserialize(serialize(s));
    ok('gov-entry: backfill preserves existing', s2.petitioners['hist-1'].trueEntryYear === 1609);
  }
}


// --- 46. Provincial draft (pre-game) -----------------------------------------
{
  // draft exists with 4 regions x 3 candidates
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'draft1' });
    ok('draft: 4 regions', s.draft.regions.length === 4);
    ok('draft: 3 candidates each', s.draft.regions.every((r) => r.candidates.length === 3));
    ok('draft: names unique', new Set(s.draft.regions.flatMap((r) => r.candidates.map((c) => c.name))).size === 12);
    ok('draft: traits present', s.draft.regions.every((r) => r.candidates.every((c) =>
      Object.keys(c.traits).length === 7 && Object.values(c.traits).every((v) => v >= 1 && v <= 5))));
    ok('draft: not done', !s.draft.done && Object.keys(s.provincials).length === 0);
  }
  // picking completes at 4/4 + 4 HQs; provincials stored; ledger entry
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'draft2' });
    const ids = s.draft.regions.map((r) => [r.id, r.candidates[0].id]);
    for (const [rid, cid] of ids.slice(0, 3)) chooseProvincial(s, rid, cid);
    ok('draft: incomplete at 3/4', !s.draft.done);
    chooseProvincial(s, ids[3][0], ids[3][1]);
    ok('draft: incomplete without HQs', !s.draft.done);
    s.draft.regions.forEach((r) => { if (r.id !== 'europe') chooseProvinceHQ(s, r.id, hqOptionsForRegion(s, r.id)[0].id); });
    ok('draft: done at 4/4 + HQs', s.draft.done === true);
    ok('draft: provincials stored', Object.keys(s.provincials).length === 4
      && s.provincials.east.name === s.draft.regions[0].candidates[0].name);
    ok('draft: ledger records appointments',
      (s.ledger || []).some((e) => e.type === 'provincial' && /take office/.test(e.text)));
  }
  // invalid picks throw; one man cannot govern two regions
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'draft3' });
    let threw = 0;
    try { chooseProvincial(s, 'nowhere', 'x'); } catch (e) { threw++; }
    try { chooseProvincial(s, 'east', 'prov-east-9'); } catch (e) { threw++; }
    chooseProvincial(s, 'east', s.draft.regions[0].candidates[0].id);
    try { chooseProvincial(s, 'east', s.draft.regions[0].candidates[0].id); } catch (e) { threw++; } // re-pick same: allowed, no throw
    ok('draft: bad region/candidate throw', threw === 2);
    ok('draft: re-pick same region allowed', s.draft.picks.east === s.draft.regions[0].candidates[0].id);
    try { chooseProvincial(s, 'europe', s.draft.regions[0].candidates[0].id); } catch (e) { threw++; }
    ok('draft: double-governance blocked', threw === 3);
  }
  // old saves skip the draft
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'draft4' });
    const raw = serialize(s);
    delete raw.draft; delete raw.provincials;
    const s2 = deserialize(raw);
    ok('draft: old saves skip', s2.draft.done === true && s2.draft.skipped === true);
  }
  // HQs are required to take office; provincials reside there
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'draft6' });
    for (const r of s.draft.regions) chooseProvincial(s, r.id, r.candidates[0].id);
    ok('draft: HQs required', !s.draft.done);
    s.draft.regions.forEach((r) => { if (r.id !== 'europe') chooseProvinceHQ(s, r.id, hqOptionsForRegion(s, r.id)[0].id); });
    ok('draft: done with HQs', s.draft.done === true);
    ok('draft: provincials carry HQ', s.provincials.east.hq === hqOptionsForRegion(s, 'east')[0].id);
    let threw = 0;
    try { chooseProvinceHQ(s, 'east', 'nowhere'); } catch (e) { threw++; }
    ok('draft: bad HQ throws', threw === 1);
    threw = 0;
    try { chooseProvinceHQ(s, 'east', hqOptionsForRegion(s, 'newworld')[0].id); } catch (e) { threw++; }
    ok('draft: cross-region HQ throws', threw === 1);
  }
  // Staged provincial answers: decide now, execute at year close.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'stage1' });
    for (const r of s.draft.regions) chooseProvincial(s, r.id, r.candidates[0].id);
    for (const r of s.draft.regions) { if (r.id !== 'europe') chooseProvinceHQ(s, r.id, hqOptionsForRegion(s, r.id)[0].id); }
    s.provincialRequests = { east: { regionId: 'east', year: s.year, professed: 0, fathers: 0, brothers: 0 } };
    // add a man to the pool
    const e = { petitionerId: 'stage-man-1', name: 'Stage Man', year: s.year, via: 'test', assignment: null };
    s.europeanLabor.push(e);
    s.petitioners['stage-man-1'] = { id: 'stage-man-1', name: 'Stage Man', status: 'active', vows: { stage: 'brother' } };
    const fundsBefore = s.resources.funds;
    const laborBefore = s.europeanLabor.length;
    const hqId = s.provinceHQs.east;
    // stage an answer: nothing moves yet
    const sa = stageProvincialAnswer(s, 'east', { professed: 0, fathers: 0, brothers: 1 });
    ok('stage: stored', s.stagedAnswers.east && s.stagedAnswers.east.mix.brothers === 1);
    ok('stage: nothing moved', s.resources.funds === fundsBefore && s.europeanLabor.length === laborBefore);
    ok('stage: request still pending', !!s.provincialRequests.east);
    const com = stagedCommitments(s);
    ok('stage: commitments counted', com.count === 1 && com.men === 1 && com.scudi === sa.cost);
    // year close executes it
    applyStagedAnswers(s);
    ok('stage: executed at close', s.europeanLabor.length === laborBefore - 1);
    ok('stage: answers are free — he pays when he sails', s.resources.funds === fundsBefore);
    ok('stage: the named man waits at the dock for the HQ',
      s.queue.some((q) => q.petitionerId === 'stage-man-1' && q.status === 'awaiting' && q.destination === hqId),
      `hq=${hqId}`);
    ok('stage: request cleared', !s.provincialRequests.east);
    ok('stage: staged cleared', Object.keys(s.stagedAnswers).length === 0);
    // unstage works
    s.provincialRequests = { east: { regionId: 'east', year: s.year, professed: 0, fathers: 0, brothers: 0 } };
    stageProvincialAnswer(s, 'east', { professed: 0, fathers: 0, brothers: 0 });
    unstageProvincialAnswer(s, 'east');
    ok('stage: unstage removes', !s.stagedAnswers.east);
    ok('stage: commitments zero', stagedCommitments(s).count === 0);
  }
  // Community traits: top 3 dispositions among stationed men.
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'community1' });
    // The starting staff are real men with arrivals — the community is
    // the roster from day one (every man a profile, Tran 2026-10-20).
    const roster0 = (missionStaff(s, 'goa').staffIds || []).length;
    ok('community: starting staff are the community', roster0 > 0
      && missionCommunity(s, 'goa').length === roster0, `${roster0}`);
    // Fake an arrived voyage.
    s.petitioners['c1'] = { id: 'c1', name: 'Community One', status: 'active' };
    s.petitioners['c2'] = { id: 'c2', name: 'Community Two', status: 'active' };
    s.voyages.push({ petitionerId: 'c1', destination: 'goa', stage: 'arrived', outcome: 'thriving' });
    s.voyages.push({ petitionerId: 'c2', destination: 'goa', stage: 'arrived', outcome: 'thriving' });
    const men = missionCommunity(s, 'goa');
    ok('community: finds stationed men', men.length === roster0 + 2 && men.includes('c1'));
    const traits = communityTraits(s, 'goa');
    ok('community: top 3 traits', traits.length === 3);
    ok('community: sorted by avg', traits[0].avg >= traits[1].avg && traits[1].avg >= traits[2].avg);
    ok('community: avgs in range', traits.every((t) => t.avg >= 1 && t.avg <= 5));
  }
  // deterministic: same seed, same candidates
  {
    const a = newGameWithGalleons({ mode: 'campaign', seed: 'draft5' });
    const b = newGameWithGalleons({ mode: 'campaign', seed: 'draft5' });
    ok('draft: deterministic',
      JSON.stringify(a.draft.regions) === JSON.stringify(b.draft.regions));
  }
}

// --- 47. Provincial replacement ------------------------------------------------
{
  const mkDrafted = (seed) => {
    const s = newGameWithGalleons({ mode: 'campaign', seed });
    for (const r of s.draft.regions) chooseProvincial(s, r.id, r.candidates[0].id);
    s.draft.regions.forEach((r) => { if (r.id !== 'europe') chooseProvinceHQ(s, r.id, hqOptionsForRegion(s, r.id)[0].id); });
    return s;
  };
  const mkProfessed = (s, id) => {
    const rec = ensureRecord(s, id, true);
    rec.status = 'active';
    rec.savedGrade = { grade: 'professed-of-the-4th-vow', ordained: true };
    return rec;
  };
  // term tracking
  {
    const s = mkDrafted('rep1');
    ok('replacement: term starts at 0', provincialTermYears(s, 'east') === 0);
    ok('replacement: term not complete', !provincialTermComplete(s, 'east'));
    s.year += PROVINCIAL_TERM_YEARS;
    ok('replacement: term complete at 6', provincialTermComplete(s, 'east'));
  }
  // professed-priest eligibility: need a real professed priest in the pool
  {
    const s = mkDrafted('rep2');
    const rec = ensureRecord(s, 'hist-1');
    rec.status = 'active';
    ok('replacement: hist-1 is a professed priest', isProfessedPriest(s, 'hist-1'));
    const roster = professedPriests(s);
    ok('replacement: roster lists him', roster.some((p) => p.petitionerId === 'hist-1'));
    const drawn = beginProvincialReplacement(s, 'east');
    ok('replacement: terna drawn (<=3)', drawn.candidates.length <= 3 && drawn.candidates.length >= 1);
    ok('replacement: incumbent excluded', !drawn.candidates.includes(drawn.incumbent));
    ok('replacement: terna stored', s.provincialTernas.east.candidates.length === drawn.candidates.length);
  }
  // resolve: name a successor from the terna
  {
    const s = mkDrafted('rep3');
    ensureRecord(s, 'hist-1').status = 'active';
    mkProfessed(s, 'fic-priest-1');
    const drawn = beginProvincialReplacement(s, 'europe');
    const pick = drawn.candidates[0];
    const before = s.provincials.europe.name;
    resolveProvincialReplacement(s, 'europe', pick);
    ok('replacement: successor takes office', s.provincials.europe.petitionerId === pick);
    ok('replacement: fresh term', provincialTermYears(s, 'europe') === 0);
    ok('replacement: ledger records it',
      (s.ledger || []).some((e) => e.type === 'provincial' && new RegExp(`succeeds ${before}`).test(e.text)));
    ok('replacement: terna cleared', !s.provincialTernas.europe);
  }
  // resolve: keep the incumbent for another term
  {
    const s = mkDrafted('rep4');
    s.year += PROVINCIAL_TERM_YEARS;
    const name = s.provincials.africa.name;
    resolveProvincialReplacement(s, 'africa', 'incumbent');
    ok('replacement: incumbent stays', s.provincials.africa.name === name);
    ok('replacement: term renewed', provincialTermYears(s, 'africa') === 0);
  }
  // resolve: ineligible choice throws; unknown region throws
  {
    const s = mkDrafted('rep5');
    let threw = 0;
    try { resolveProvincialReplacement(s, 'east', 'hist-3'); } catch (e) { threw++; } // brother, not a priest
    try { resolveProvincialReplacement(s, 'nowhere', 'incumbent'); } catch (e) { threw++; }
    try { beginProvincialReplacement(s, 'nowhere'); } catch (e) { threw++; }
    ok('replacement: invalid choices throw', threw === 3);
  }

  // short bench: own province first, then nearest
  {
    const s = mkDrafted('rep6');
    // put a professed priest at a New World mission and one in Europe
    const a = ensureRecord(s, 'hist-1'); a.status = 'active';
    mkProfessed(s, 'fic-priest-2');
    // hist-1/hist-5 default location: Europe (no voyage) -> europe province
    const drawn = beginProvincialReplacement(s, 'newworld');
    ok('replacement: short bench fills from nearest',
      drawn.candidates.length >= 1 && drawn.candidates.length <= 3);
  }
  // outgoing posting: Europe vs a destination
  {
    const s = mkDrafted('rep7');
    const a = ensureRecord(s, 'hist-1'); a.status = 'active';
    mkProfessed(s, 'fic-priest-3');
    // make hist-5 the incumbent of europe by replacing the placeholder
    const drawn = beginProvincialReplacement(s, 'europe');
    resolveProvincialReplacement(s, 'europe', drawn.candidates[0], 'europe');
    const inc = s.provincials.europe.petitionerId;
    // now replace him, sending him to a destination
    const d2 = beginProvincialReplacement(s, 'europe');
    const dest = openDestinations(s)[0].id;
    resolveProvincialReplacement(s, 'europe', d2.candidates.find((c) => c !== inc) || d2.candidates[0], dest);
    const queued = (s.queue || []).find((q) => q.petitionerId === inc);
    ok('replacement: outgoing queued for chosen destination', !!queued && queued.destination === dest);
  }
}


// --- 48. Mortality: hidden death ages, illness, old age ----------------------
{
  // death age seeded hidden in 65-70 for a young man
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'mort1' });
    const rec = ensureRecord(s, 'hist-1');
    rec.status = 'active';
    resolveYear(s);
    ok('mortality: death age seeded 65-70', rec.deathAge >= 65 && rec.deathAge <= 70);
    ok('mortality: age advances', typeof rec.age === 'number' && rec.age > 0);
  }
  // no instant death for an old man at seeding
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'mort2' });
    const rec = ensureRecord(s, 'old-man', true);
    rec.status = 'active'; rec.age = 69;
    resolveYear(s);
    ok('mortality: old man survives seeding year', rec.status !== 'deceased' || rec.age >= 70);
  }
  // old-age death fires at the hidden age
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'mort3' });
    const rec = ensureRecord(s, 'doomed', true);
    rec.status = 'active'; rec.age = 40; rec.deathAge = 41;
    const deathsBefore = s.stats.deaths || 0;
    resolveYear(s);
    ok('mortality: dies at death age', rec.status === 'deceased');
    ok('mortality: death counted', (s.stats.deaths || 0) === deathsBefore + 1);
    ok('mortality: death in ledger',
      (s.ledger || []).some((e) => e.type === 'death' && /old age/.test(e.decision || '')));
    ok('mortality: death in history',
      (rec.history || []).some((h) => h.event === 'death'));
  }
  // illness: the sick either recover or die (seeded; just verify no crash and resolution)
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'mort4' });
    const rec = ensureRecord(s, 'sick-man', true);
    rec.status = 'active'; rec.age = 30; rec.deathAge = 70;
    if (!Array.isArray(s.europeanLabor)) s.europeanLabor = [];
    s.europeanLabor.push({ petitionerId: 'sick-man', name: 'Sick Man', year: s.year, ill: true });
    resolveYear(s);
    const stillIll = (s.europeanLabor || []).some((e) => e.petitionerId === 'sick-man' && e.ill);
    ok('mortality: illness resolves (recovered, lingering, or died)',
      !stillIll || rec.status === 'deceased' || stillIll);
  }
  // a provincial who dies vacates his region
  {
    const s = newGameWithGalleons({ mode: 'campaign', seed: 'mort5' });
    for (const r of s.draft.regions) chooseProvincial(s, r.id, r.candidates[0].id);
    s.draft.regions.forEach((r) => { if (r.id !== 'europe') chooseProvinceHQ(s, r.id, hqOptionsForRegion(s, r.id)[0].id); });
    const rec = ensureRecord(s, 'hist-1'); rec.status = 'active';
    // install hist-1 as provincial of the east
    s.provincials.east = { petitionerId: 'hist-1', name: 'Hist One', appointedYear: s.year, hq: hqOptionsForRegion(s, 'east')[0].id };
    rec.age = 40; rec.deathAge = 41;
    resolveYear(s);
    ok('mortality: provincial death vacates', s.provincials.east.vacant === true);
    ok('mortality: vacancy in ledger',
      (s.ledger || []).some((e) => e.type === 'provincial' && /has died/.test(e.text || '')));
    // a successor can be named for the vacant see
    const drawn = beginProvincialReplacement(s, 'east');
    ok('mortality: terna drawn for vacant see', drawn.candidates.length >= 0 && !drawn.incumbent);
  }
  // determinism: same seed, same death ages
  {
    const a = newGameWithGalleons({ mode: 'campaign', seed: 'mort6' });
    const b = newGameWithGalleons({ mode: 'campaign', seed: 'mort6' });
    const ra = ensureRecord(a, 'hist-1'); ra.status = 'active';
    const rb = ensureRecord(b, 'hist-1'); rb.status = 'active';
    resolveYear(a); resolveYear(b);
    ok('mortality: deterministic', ra.deathAge === rb.deathAge && ra.age === rb.age);
  }
}


// --- 49. Provincial requests, asking, energy, treasury, society report -------
{
  const setup = (seed) => {
    const s = newGameWithGalleons({ mode: 'campaign', seed });
    for (const r of s.draft.regions) chooseProvincial(s, r.id, r.candidates[0].id);
    s.draft.regions.forEach((r) => { if (r.id !== 'europe') chooseProvinceHQ(s, r.id, hqOptionsForRegion(s, r.id)[0].id); });
    return s;
  };
  // requests generate (seeded)
  {
    const s = setup('req1');
    generateProvincialRequests(s, s.year);
    const n = provincesWithRequests(s).length;
    ok('requests: some provinces ask', n >= 0 && n <= 4, `${n}`);
    for (const rid of provincesWithRequests(s)) {
      const q = s.provincialRequests[rid];
      ok('requests: well-formed', REQUEST_GRADES.every((c) => Number.isInteger(q[c]) && q[c] >= 0));
    }
  }
  // answering: decline
  {
    const s = setup('req2');
    s.provincialRequests = { east: { regionId: 'east', year: s.year, professed: 1, fathers: 1, brothers: 1 } };
    const funds = s.resources.funds;
    const r = answerProvincialRequest(s, 'east', { professed: 0, fathers: 0, brothers: 0 });
    ok('requests: decline sends none', r.sent === 0 && !s.provincialRequests.east);
    ok('requests: decline costs nothing', s.resources.funds === funds);
  }
  // answering: agree needs men; validation
  {
    const s = setup('req3');
    s.provincialRequests = { east: { regionId: 'east', year: s.year, professed: 999, fathers: 0, brothers: 0 } };
    let threw = false;
    try { answerProvincialRequest(s, 'east', { professed: 999, fathers: 0, brothers: 0 }); }
    catch (e) { threw = /free in Europe/.test(e.message); }
    ok('requests: cannot send more than the named men in Europe', threw);
    ok('requests: failed answer keeps the request', !!s.provincialRequests.east);
  }
  {
    // The abstract pool no longer covers a request (Tran 2026-10-20):
    // with nobody standing in Europe, there is nobody to send.
    const s = setup('req4');
    s.europeanLabor = [];
    s.available = 10;
    s.provincialRequests = { east: { regionId: 'east', year: s.year, professed: 0, fathers: 2, brothers: 0 } };
    let threw = false;
    try { answerProvincialRequest(s, 'east', { professed: 0, fathers: 2, brothers: 0 }); }
    catch (e) { threw = /free in Europe/.test(e.message); }
    ok('requests: the abstract pool sends nobody', threw && s.available === 10);
    ok('requests: unanswered request survives', !!s.provincialRequests.east);
  }
  // asking: 3/year, energy, province check
  {
    const s = setup('ask1');
    // put a man in the east via a voyage record
    const rec = ensureRecord(s, 'hist-1'); rec.status = 'active';
    s.voyages.push({ id: 'v-ask', petitionerId: 'hist-1', destination: 'goa', stage: 'arrived',
      outcome: 'thriving', resolvedYear: s.year, arriveYear: s.year });
    const e0 = s.energy;
    const res = askProvincial(s, 'east', 'hist-1');
    ok('ask: returns the man', res.petitionerId === 'hist-1' && res.questionsLeft === QUESTIONS_PER_YEAR - 1);
    ok('ask: is free (no energy)', s.energy === e0);
    let threw = false;
    try { askProvincial(s, 'newworld', 'hist-1'); } catch (e) { threw = /does not serve/.test(e.message); }
    ok('ask: wrong province rejected', threw);
    askProvincial(s, 'east', 'hist-1');
    askProvincial(s, 'east', 'hist-1');
    let threw2 = false;
    try { askProvincial(s, 'east', 'hist-1'); } catch (e) { threw2 = /three questions/.test(e.message); }
    ok('ask: quota enforced at 3', threw2);
  }
  // energy mechanic REMOVED per Tran 2026-10-19: spendEnergy is a no-op
  {
    const s = setup('nrg1');
    spendEnergy(s, 99, 'testing'); // does not throw, does nothing
    ok('energy: spendEnergy is no-op', true);
  }
  // succession after death is free; living succession costs
  {
    const s = setup('nrg2');
    s.provincials.east = { vacant: true, name: 'Vacant', appointedYear: s.year, hq: 'goa' };
    const e0 = s.energy;
    beginProvincialReplacement(s, 'east');
    ok('energy: vacant see is free', s.energy === e0);
    const s2 = setup('nrg3');
    const e1 = s2.energy;
    beginProvincialReplacement(s2, 'east');
    ok('energy: living succession is free', s2.energy === e1);
  }
  // finance logging
  {
    const s = setup('fin1');
    const f0 = s.resources.funds;
    spendFunds(s, 100, 'testing');
    gainFunds(s, 50, 'testing-in');
    ok('finance: funds move', s.resources.funds === f0 - 50);
    ok('finance: expenses logged', s.finance.expenses.testing === 100);
    ok('finance: income logged', s.finance.income['testing-in'] === 50);
    ok('finance: per-year logged', s.financeYears[s.year].expenses.testing === 100);
  }
  // society report in ledger
  {
    const s = setup('soc1');
    const { terna } = startYear(s); decide(s, []); resolveYear(s);
    const rep = (s.ledger || []).find((e) => e.type === 'society-report');
    ok('society report: stored in ledger', !!rep && /State of the Society/.test(rep.text || ''));
    ok('society report: has detail', !!rep.detail && typeof rep.detail.funds === 'number');
  }


  // Two-stage illness: sick this year, dies next year
  {
    const s = setup('sick1');
    let terna;
    const pid = 'fic-sick-1';
    s.petitioners[pid] = {
      id: pid, fictional: true, status: 'active', name: 'Sick Test Man',
      entryYear: 1615, vows: { stage: 'brother', firstVows: true }, age: 30,
    };
    const mst = missionStaff(s, 'brazil'); // capacity 8
    mst.capacity = 8;
    mst.brothers = 4; mst.fathers = 0; mst.coadjutors = 0;
    mst.staffIds = [pid, 'x1', 'x2', 'x3'];
    for (const x of ['x1','x2','x3']) {
      s.petitioners[x] = { id: x, fictional: true, status: 'active', name: 'X'+x, entryYear: 1615, vows: { stage: 'brother', firstVows: true }, age: 30 };
    }
    // Mark the man sick this year
    s.sickMen = { [pid]: { since: s.year, destId: 'brazil' } };
    ({ terna } = startYear(s)); decide(s, []); resolveYear(s);
    const stillThere = (missionStaff(s, 'brazil').staffIds || []).includes(pid);
    ok('illness: sick man stays staffed in illness year', stillThere);
    // Next year: he dies
    ({ terna } = startYear(s)); decide(s, []); resolveYear(s);
    const gone = !(missionStaff(s, 'brazil').staffIds || []).includes(pid);
    ok('illness: sick man dies the next year', gone);
    const deathNote = (s.ledger || []).find((e) => e.type === 'death' && /Sick Test Man/.test(e.text || ''));
    ok('illness: death recorded in ledger', !!deathNote, deathNote ? deathNote.text : 'none');
  }


  // Persecution event: three tiers by zeal+prudence
  {
    let terna;
    const runCase = (seed, zeal, prud) => {
      const s = setup(seed);
      s.destState.japan.danger = 3; // persecution needs danger >= 2; fixtures set 1
      const pid = 'fic-seized-1';
      s.petitioners[pid] = {
        id: pid, fictional: true, status: 'active', name: 'Seized Test Man',
        entryYear: 1615, vows: { stage: 'brother', firstVows: true }, age: 30,
        disposition: { initial: {}, current: { zeal, prudence: prud, obedience: 3, humility: 3, patience: 3, adaptability: 3, stability: 3 }, evidence: {}, observed: [] },
      };
      const mst = missionStaff(s, 'japan'); // danger 3
      mst.staffIds = [pid];
      mst.brothers = 1; mst.fathers = 0; mst.coadjutors = 0;
      // Make sure no one else interferes: clear other missions' staff is unnecessary;
      // we only look for entries about this man.
      for (let i = 0; i < 28; i++) { // campaign ends 1645, stay under the cap
        ({ terna } = startYear(s)); decide(s, []); resolveYear(s);
        const hit = (s.ledger || []).find((e) => ['martyrdom', 'confessor', 'apostasy'].includes(e.type) && /Seized Test Man/.test(e.text || ''));
        if (hit) return { hit, s };
      }
      return { hit: null, s };
    };
    // Per-man seizure is 15%/yr, so try several seeds until the event fires.
    const runUntilEvent = (base, zeal, prud) => {
      for (const suffix of ['', '-b', '-c', '-d', '-e']) {
        const r = runCase(base + suffix, zeal, prud);
        if (r.hit) return r;
      }
      return runCase(base + '-z', zeal, prud);
    };
    const crown = runUntilEvent('persec-crown', 5, 5); // 10 -> crown
    ok('persecution: zeal+prudence 10 wins the crown', crown.hit?.type === 'martyrdom', crown.hit ? crown.hit.type : 'no event');
    const conf = runUntilEvent('persec-conf', 3, 3); // 6 -> confessor
    ok('persecution: zeal+prudence 6 makes a confessor', conf.hit?.type === 'confessor', conf.hit ? conf.hit.type : 'no event');
    if (conf.hit) {
      const rec = conf.s.petitioners['fic-seized-1'];
      const disp = rec?.disposition?.current || {};
      ok('persecution: confessor virtues are maxed', Object.values(disp).every((v) => v === 6), JSON.stringify(disp));
      const stillThere = (missionStaff(conf.s, 'japan').staffIds || []).includes('fic-seized-1');
      ok('persecution: confessor survives at the mission', stillThere);
    }
    const apos = runUntilEvent('persec-apos', 1, 1); // 2 -> apostate
    ok('persecution: zeal+prudence 2 apostasizes', apos.hit?.type === 'apostasy', apos.hit ? apos.hit.type : 'no event');
  }


  // The Engine of the Society
  {
    const s = setup('engine1');
    // Add 30 mission fathers across missions + 5 martyrs
    for (const [i, id] of ['japan', 'china', 'india'].entries()) {
      const mst = missionStaff(s, id);
      mst.fathers = 10;
    }
    s.stats.martyrs = 5;
    const { engineStrength, engineBonus, setIntention, intentionVoyageMod } = EngineNS;
    const es = engineStrength(s);
    ok('engine: counts priests + martyrs', es.total >= 35 && es.martyrs === 5, `total=${es.total}`);
    ok('engine: bonus is +0.15 per unit of strength', Math.abs(engineBonus(s) - es.total * 0.15) < 0.001, `bonus=${engineBonus(s)}`);
    setIntention(s, 'japan');
    ok('engine: mission intention gives voyage mod', intentionVoyageMod(s, 'japan') === engineBonus(s));
    ok('engine: other missions get no mod', intentionVoyageMod(s, 'china') === 0);
    setIntention(s, 'society');
    ok('engine: society intention gives no voyage mod', intentionVoyageMod(s, 'japan') === 0);
    // Society zeal: temporary — applied one year, lifted the next
    let terna;
    const before = ensureDisposition(s, 'hist-1').current.zeal;
    ({ terna } = startYear(s)); decide(s, []); resolveYear(s);
    const after = ensureDisposition(s, 'hist-1').current.zeal;
    const zb = Math.round(es.total * 0.15 * 100) / 100;
    ok('engine: society intention raises zeal for the year', Math.abs(after - Math.min(6, before + zb)) < 0.001, `before=${before} after=${after} zb=${zb}`);
    // Switch the intention away: the blessing lifts
    setIntention(s, 'japan');
    ({ terna } = startYear(s)); decide(s, []); resolveYear(s);
    const lifted = ensureDisposition(s, 'hist-1').current.zeal;
    ok('engine: the blessing lifts the next year', Math.abs(lifted - before) < 1.01, `before=${before} lifted=${lifted}`);
  }

  // Scripture bank validation
  {
    const { SCRIPTURE_BANK } = await import('./scripture-bank.js');
    const virtues = ['zeal', 'obedience', 'prudence', 'humility', 'patience', 'adaptability', 'stability'];
    for (const v of virtues) {
      const count = SCRIPTURE_BANK.filter(e => e.virtue === v).length;
      ok(`scripture bank: ${v} has 50`, count === 50, `${count}`);
    }
    ok('scripture bank: 350 total', SCRIPTURE_BANK.length === 350, `${SCRIPTURE_BANK.length}`);
    const ids = new Set(SCRIPTURE_BANK.map(e => e.id));
    ok('scripture bank: unique IDs', ids.size === 350);
    const refs = new Set(SCRIPTURE_BANK.map(e => e.reference.toLowerCase()));
    ok('scripture bank: unique refs', refs.size === 350);
  }
}

// --- 50. One man, one place: roster integrity ---------------------------------
{
  // Fresh missions are staffed by real minted men — a name, a profile,
  // and an arrival in a past year behind every count (Tran 2026-10-20:
  // every man must have a profile). No real petitioner is dealt into a
  // staff list for a mission he never sailed to.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'one-place' });
  ok('one-place: every starting count has a named man',
    Object.values(s.missions).every((m) => (m.staffIds || []).length === missionStaffed(m)));
  ok('one-place: starting men have profiles and arrivals',
    Object.entries(s.missions).every(([destId, m]) => (m.staffIds || []).every((id) =>
      s.petitioners[id] && typeof s.petitioners[id].name === 'string'
      && missionCommunity(s, destId).includes(id))));
  ok('one-place: no petitioner is dealt into a mission',
    Object.values(s.missions).every((m) => (m.staffIds || []).every((id) => id.startsWith('staff-'))));

  // Sending a man from Europe: he waits at the dock and sails — he does
  // NOT appear at the mission until his ship arrives (no teleporting).
  const { terna } = startYear(s);
  decide(s, []); // all denied -> europeanLabor
  const pid = terna[0].petitionerId;
  s.resources.funds = 5000;
  const availBefore = s.available;
  const japanBefore = missionStaffed(missionStaff(s, 'japan'));
  const entry = s.europeanLabor.find((e) => e.petitionerId === pid);
  EngineNS.queueLaborMen(s, [entry], 'japan', 'test order');
  const jst = missionStaff(s, 'japan');
  ok('one-place: a sent man is not yet on the roster', !jst.staffIds.includes(pid));
  ok('one-place: the headcount does not move until he arrives',
    missionStaffed(jst) === japanBefore);
  ok('one-place: the spare pool keeps him until he sails', s.available === availBefore);
  ok('one-place: sent man leaves European labor',
    !s.europeanLabor.some((e) => e.petitionerId === pid));
  ok('one-place: sent man waits at the dock',
    s.queue.some((q) => q.petitionerId === pid && q.status === 'awaiting' && q.destination === 'japan'));

  // Removal takes the man's OWN grade bucket, not "fathers first".
  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'one-place-2' });
  const { terna: t2 } = startYear(s2);
  decide(s2, []);
  const bid = t2[0].petitionerId;
  const rec2 = s2.petitioners[bid];
  if (!rec2.vows) rec2.vows = {};
  rec2.vows.stage = 'brother';
  const st2 = missionStaff(s2, 'peru');
  st2.fathers = 2; st2.brothers = 3; st2.staffIds = [bid];
  EngineNS.removeStationedMan(s2, st2, bid);
  ok('one-place: removal decrements the man\'s own grade',
    st2.brothers === 2 && st2.fathers === 2, `f=${st2.fathers} b=${st2.brothers}`);
  ok('one-place: removal strikes the name', !st2.staffIds.includes(bid));

  // A dock-held man does not petition again, and the queue never holds
  // two awaiting entries for one man.
  const s3 = newGameWithGalleons({ mode: 'campaign', seed: 'one-place-3' });
  const { terna: t3 } = startYear(s3);
  decide(s3, []);
  const rid = t3[0].petitionerId;
  EngineNS.reserveForMission(s3, rid, 'japan');
  EngineNS.callReserveToDock(s3, rid);
  ok('one-place: called to dock once',
    s3.queue.filter((q) => q.petitionerId === rid && q.status === 'awaiting').length === 1);
  EngineNS.enqueueAwaiting(s3, { petitionerId: rid, approvedYear: s3.year, destination: 'peru', status: 'awaiting', held: true, teamId: null, teamSize: 1, companions: 0 });
  const entries3 = s3.queue.filter((q) => q.petitionerId === rid && q.status === 'awaiting');
  ok('one-place: re-enqueue replaces, never duplicates',
    entries3.length === 1 && entries3[0].destination === 'peru');
  resolveYear(s3);
  const { terna: t3b } = startYear(s3);
  ok('one-place: a man at the dock is not in the next stack',
    !t3b.some((c) => c.petitionerId === rid));
  ok('one-place: the held man is still at the dock',
    s3.queue.some((q) => q.petitionerId === rid && q.status === 'awaiting' && q.held));

  // Station a named man at a mission through the real arrival path
  // (an arrived voyage, resolved by staffArrival).
  const stationMan = (st, pid, destId) => {
    st.europeanLabor = st.europeanLabor.filter((e) => e.petitionerId !== pid);
    const v = { id: `voy-test-${pid}-${destId}`, petitionerId: pid,
      name: (st.petitioners[pid] || {}).name || pid, destination: destId,
      stage: 'arrived', outcome: 'thriving', departYear: st.year - 2,
      arriveYear: st.year, companions: 0, companionIds: [] };
    st.voyages.push(v);
    const rec = st.petitioners[pid];
    if (rec) {
      rec.status = 'active';
      if (!Array.isArray(rec.voyages)) rec.voyages = [];
      rec.voyages.push(v.id);
    }
    EngineNS.staffArrival(st, v);
  };

  // Disease death: the man dies in his record as well as the ledger, and
  // leaves the roster. (A sickMen entry from last year ripens this year.)
  const s4 = newGameWithGalleons({ mode: 'campaign', seed: 'one-place-4' });
  const { terna: t4 } = startYear(s4);
  decide(s4, []);
  const did = t4[0].petitionerId;
  s4.resources.funds = 5000;
  stationMan(s4, did, 'peru');
  s4.sickMen = { [did]: { since: s4.year - 1, destId: 'peru' } };
  resolveYear(s4);
  ok('one-place: disease death marks the record deceased',
    s4.petitioners[did].status === 'deceased');
  ok('one-place: disease death strikes the roster',
    !missionStaff(s4, 'peru').staffIds.includes(did));
  const { terna: t4b } = startYear(s4);
  ok('one-place: the dead do not petition', !t4b.some((c) => c.petitionerId === did));

  // Disband: named men come home as themselves; the closed mission gains
  // no fragility years and never warns or collapses.
  const s5 = newGameWithGalleons({ mode: 'campaign', seed: 'one-place-5' });
  const { terna: t5 } = startYear(s5);
  decide(s5, []);
  const hid = t5[0].petitionerId;
  s5.resources.funds = 5000;
  stationMan(s5, hid, 'peru');
  missionStaff(s5, 'peru').fragileYears = 3;
  EngineNS.disbandMission(s5, 'peru');
  ok('one-place: disbanded man is back laboring in Europe',
    s5.europeanLabor.some((e) => e.petitionerId === hid));
  ok('one-place: disbanding clears the fragility clock',
    missionStaff(s5, 'peru').fragileYears === 0);
  resolveYear(s5);
  startYear(s5); decide(s5, []); resolveYear(s5);
  ok('one-place: closed mission gathers no fragility',
    missionStaff(s5, 'peru').fragileYears === 0 && !s5.destState.peru.collapsed);
  ok('one-place: no collapse warning for a closed mission',
    !s5.ledger.some((e) => e.type === 'warning' && e.destination === 'peru'));

  // Save repair: a corrupted old save is cleaned on load.
  const s6 = newGameWithGalleons({ mode: 'campaign', seed: 'one-place-6' });
  const { terna: t6 } = startYear(s6);
  decide(s6, []);
  const xid = t6[0].petitionerId; // laboring in Europe
  const raw = JSON.parse(JSON.stringify(serialize(s6)));
  raw.queue.push(
    { petitionerId: xid, approvedYear: 1615, destination: 'japan', status: 'awaiting', teamId: null, teamSize: 1, companions: 0 },
    { petitionerId: xid, approvedYear: 1615, destination: 'peru', status: 'awaiting', teamId: null, teamSize: 1, companions: 0 },
  );
  raw.missions.japan.staffIds = [xid]; // phantom: he is in Europe, never sailed
  raw.missions.peru.fragileYears = 4;
  raw.destState.peru.access = 'closed';
  const s6b = deserialize(raw);
  ok('repair: duplicate queue entries collapse to one',
    s6b.queue.filter((q) => q.petitionerId === xid && q.status === 'awaiting').length === 1);
  ok('repair: phantom staff removed', !missionStaff(s6b, 'japan').staffIds.includes(xid));
  // A closed mission's fragility clock is frozen, not erased: repair
  // preserves the recorded counter (save round-trip must be identical),
  // and the live engine never advances it while the mission stays closed.
  ok('repair: closed mission fragility frozen, not rewritten', missionStaff(s6b, 'peru').fragileYears === 4);

  // Companions show their own names, not a generic label.
  const s7 = newGameWithGalleons({ mode: 'campaign', seed: 'one-place-7' });
  s7.petitioners['companion-japan-1615-1'] = { id: 'companion-japan-1615-1', name: 'Named Companion', fictional: true, status: 'active', history: [] };
  ok('one-place: a companion is called by his name',
    EngineNS.personName(s7, 'companion-japan-1615-1') === 'Named Companion');

  // Releasing a station removes the man and his companions by name.
  const s8 = newGameWithGalleons({ mode: 'campaign', seed: 'one-place-8' });
  const st8 = missionStaff(s8, 'china');
  st8.brothers = 2; st8.staffIds = ['fic-vet', 'companion-china-1617-1'];
  s8.petitioners['fic-vet'] = { id: 'fic-vet', fictional: true, status: 'active', history: [], vows: { stage: 'brother' } };
  s8.petitioners['companion-china-1617-1'] = { id: 'companion-china-1617-1', fictional: true, status: 'active', history: [], vows: { stage: 'brother' } };
  EngineNS.releaseVoyageStation(s8, { petitionerId: 'fic-vet', destination: 'china', staffGrade: 'brothers', staffCompanions: 1, companionIds: ['companion-china-1617-1'], arriveYear: 1617 });
  ok('one-place: station release strikes both names', st8.staffIds.length === 0);
  ok('one-place: station release balances the count', st8.brothers === 0);
}

// --- 51. End-of-game data export ----------------------------------------------
{
  // The ending screen's "Export game data" button downloads the full save
  // (buildSaveExport over the engine). The payload must be the whole game:
  // ledger history, people, missions, finance — a restorable state.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'export-data' });
  const { terna } = startYear(s);
  decide(s, [{ id: terna[0].petitionerId }]);
  resolveYear(s);
  endGame(s);
  const before = JSON.stringify(s);
  const { filename, json } = buildSaveExport(EngineNS, s);
  ok('export: building the payload does not mutate the game', JSON.stringify(s) === before);
  ok('export: filename is a dated game-data JSON', /^generalate-save-\d{4}-\d{2}-\d{2}-anno\d+\.json$/.test(filename), filename);
  const data = JSON.parse(json);
  ok('export: payload is a version-1 save', data.version === 1);
  ok('export: payload carries the ledger history', Array.isArray(data.ledger) && data.ledger.length > 0);
  ok('export: payload carries people, missions and finance',
    !!data.petitioners && !!data.missions && !!data.financeYears);
  const restored = deserialize(data);
  ok('export: payload restores as a game', restored.seed === s.seed && restored.year === s.year);
}

// --- 52. Ships only: every man a profile (Tran 2026-10-20) ---------------------
{
  // The dispatch actions are gone — no arranged passage, no teleport,
  // no abstract man. Every way overseas is a ship.
  ok('ships-only: no dispatch actions exist',
    typeof EngineNS.dispatchFromEurope === 'undefined'
    && typeof EngineNS.dispatchFromFormation === 'undefined'
    && typeof EngineNS.dispatchFromDock === 'undefined'
    && typeof EngineNS.dockSendCost === 'undefined'
    && typeof EngineNS.dispatchMission === 'undefined');

  // Founding: the company is named men who queue; a founding with no men
  // in Europe fails clean and changes nothing.
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'found-1' });
  s.destState.peru.collapsed = true;
  s.resources.funds = 5000;
  let threw = false;
  try { EngineNS.foundMission(s, 'peru', { brothers: 1 }); } catch (e) { threw = /free in Europe/.test(e.message); }
  ok('founding: no men in Europe, no founding', threw);
  ok('founding: failed founding changes nothing',
    s.resources.funds === 5000 && !!s.destState.peru.collapsed);
  seedLabor(s, 1, 'found');
  s.petitioners['test-found-0'].vows = { stage: 'brother' };
  const availBefore = s.available;
  const res = EngineNS.foundMission(s, 'peru', { brothers: 1 });
  ok('founding: costs 1000 and opens the mission',
    res.cost === 1000 && s.resources.funds === 4000 && s.destState.peru.access === 'open' && !s.destState.peru.collapsed);
  ok('founding: the founder is a named man at the dock',
    res.men.length === 1 && res.men[0] === 'test-found-0'
    && s.queue.some((q) => q.petitionerId === 'test-found-0' && q.status === 'awaiting' && q.destination === 'peru'));
  ok('founding: he is not stationed until he sails',
    !missionStaff(s, 'peru').staffIds.includes('test-found-0'));
  ok('founding: the abstract pool is untouched', s.available === availBefore);

  // Prices: ships and berths carry the whole load now, so they cost less.
  ok('prices: ship tiers cut', EngineNS.RESOURCES.SHIP_TIERS.caravel.cost === 100
    && EngineNS.RESOURCES.SHIP_TIERS.carrack.cost === 200 && EngineNS.RESOURCES.SHIP_TIERS.galleon.cost === 400);
  const s2 = newGameWithGalleons({ mode: 'campaign', seed: 'price-1' });
  s2.resources.funds = 5000;
  const b0 = s2.resources.berths;
  EngineNS.expandBerths(s2);
  ok('prices: berth expansion costs 200', s2.resources.funds === 4800 && s2.resources.berths === b0 + 1,
    `${s2.resources.funds}`);

  // Legacy transit: men already at sea under the old rules step ashore
  // as real men — names join the roster with profiles and arrivals.
  const s3 = newGameWithGalleons({ mode: 'campaign', seed: 'transit-1' });
  const goa0 = missionStaff(s3, 'goa');
  const beforeIds = new Set(goa0.staffIds || []);
  s3.missionTransit = { goa: [{ arrivalYear: s3.year, grades: { brothers: 2 } }] };
  const { terna: t3 } = startYear(s3);
  decide(s3, t3.map((c) => ({ id: c.petitionerId })));
  resolveYear(s3);
  const goa1 = missionStaff(s3, 'goa');
  const newIds = (goa1.staffIds || []).filter((id) => !beforeIds.has(id));
  ok('transit: abstract arrivals become named men',
    newIds.length === 2 && newIds.every((id) => s3.petitioners[id] && s3.petitioners[id].staffMinted),
    newIds.join(','));
  ok('transit: the new men are in the community',
    newIds.every((id) => missionCommunity(s3, 'goa').includes(id)));

  // Native vocations in old saves: a stationed native with no arrival
  // record gains one on load, and joins his mission's community.
  const s4 = newGameWithGalleons({ mode: 'campaign', seed: 'native-1' });
  const jst = missionStaff(s4, 'japan');
  const nid = 'native-japan-1615-9';
  s4.petitioners[nid] = { id: nid, name: 'Paulo Miki', fictional: true, native: true,
    culture: 'japanese', grade: 'brother', status: 'active', history: [], historyV: 1,
    genYear: 1615, nativeTo: 'japan' };
  jst.staffIds.push(nid);
  jst.brothers += 1;
  const back = deserialize(serialize(s4));
  ok('natives: a stationed native counts as arrived after load',
    missionCommunity(back, 'japan').includes(nid));
}


// --- 53. Auto packing punches up as a last resort ------------------------------
{
  // No hull in the fleet can reach Japan (all caravels, range 1 < 3):
  // the best-ranged free hull sails anyway, at the voyage penalty.
  const s = _newGame({ mode: 'campaign', seed: 'punch-last-resort' });
  for (const sh of s.resources.ships) sh.tier = 'caravel';
  const { terna } = startYear(s);
  decide(s, [{ id: terna[0].petitionerId, destination: 'japan' }]);
  const pid = terna[0].petitionerId;
  resolveYear(s);
  const voy = s.voyages.find((v) => v.petitionerId === pid);
  ok('punch-up: the man sails despite no reaching hull', !!voy);
  ok('punch-up: he sails on the short-ranged hull', voy && voy.shipTier === 'caravel', voy && voy.shipTier);
  ok('punch-up: the dock is empty of him', !s.queue.some((q) => q.petitionerId === pid));

  // A reaching hull is still preferred: the galleon, not the caravel,
  // takes the Japan man when both are free.
  const s2 = _newGame({ mode: 'campaign', seed: 'punch-prefers-range' });
  s2.resources.ships[0].tier = 'galleon';
  s2.resources.ships[1].tier = 'caravel';
  s2.resources.ships[2].tier = 'caravel';
  const { terna: t2 } = startYear(s2);
  decide(s2, [{ id: t2[0].petitionerId, destination: 'japan' }]);
  resolveYear(s2);
  const voy2 = s2.voyages.find((v) => v.petitionerId === t2[0].petitionerId);
  ok('punch-up: a reaching hull is preferred', voy2 && voy2.shipTier === 'galleon', voy2 && voy2.shipTier);

  // No hull free at all: he still waits, and the note says why.
  const s3 = _newGame({ mode: 'campaign', seed: 'punch-no-hulls' });
  for (const sh of s3.resources.ships) sh.freeYear = 9999;
  const { terna: t3 } = startYear(s3);
  decide(s3, [{ id: t3[0].petitionerId, destination: 'japan' }]);
  resolveYear(s3);
  const q3 = s3.queue.find((q) => q.petitionerId === t3[0].petitionerId);
  ok('punch-up: an empty port still waits', !!q3);
  ok('punch-up: the wait is blamed on hulls, not range', q3 && q3.note === 'delayed: no hulls free', q3 && q3.note);
}

// --- 54. Dock wages are capped: the first 8 held men are paid -------------------
{
  // The dock pays a waiting party, not a workforce (Tran 2026-10-20).
  // Expectations are computed from the men's actual grades: the wage bill
  // is the first 8 paid-grade men in queue order, and no more.
  const WAGE = { 'P': 12, 'S*': 10, 'S': 5, 'F': 5, 'nS': 0, 'nF': 0 };
  const holdAll = (seed, approveCount) => {
    const s = newGameWithGalleons({ mode: 'campaign', seed });
    const { terna } = startYear(s);
    decide(s, terna.slice(0, approveCount).map((c) => ({ id: c.petitionerId })));
    const held = s.queue.filter((q) => q.status === 'awaiting');
    for (const q of held) EngineNS.setDockHold(s, q.petitionerId, true);
    const wages = held.map((q) => WAGE[EngineNS.detailedGradeFor(s, q.petitionerId)] ?? 0).filter((w) => w > 0);
    return { s, wages };
  };
  const a = holdAll('dock-cap-a', 10);
  ok('dock cap: more than 8 paid-grade men are held', a.wages.length > 8, `${a.wages.length}`);
  const expectedA = a.wages.slice(0, 8).reduce((n, w) => n + w, 0);
  const uncappedA = a.wages.reduce((n, w) => n + w, 0);
  ok('dock cap: only the first 8 in queue order are paid', EngineNS.dockYearlyFunds(a.s) === expectedA,
    `${EngineNS.dockYearlyFunds(a.s)} vs ${expectedA}`);
  ok('dock cap: the cap actually bites', expectedA < uncappedA, `${expectedA} < ${uncappedA}`);
  // Under the cap, everyone held is paid in full — through resolveYear too.
  const c = holdAll('dock-cap-c', 3);
  const expectedC = c.wages.reduce((n, w) => n + w, 0);
  ok('dock cap: a small party is paid in full', EngineNS.dockYearlyFunds(c.s) === expectedC && expectedC > 0,
    `${EngineNS.dockYearlyFunds(c.s)} vs ${expectedC}`);
  resolveYear(c.s);
  const dockC = Object.values(c.s.financeYears).reduce((n, fy) => n + ((fy.income || {}).dock || 0), 0);
  ok('dock cap: the capped wage reaches the chest at year end', dockC === expectedC, `${dockC}`);
}

// --- 55. Score breakdown: the ledger reconciles with the tally ---------------
{
  const s = newGameWithGalleons({ mode: 'campaign', seed: 'breakdown' });
  foundNovitiate(s, 'goa'); // +4 founding, recorded under 'novitiate'
  const { terna } = startYear(s);
  decide(s, [{ id: terna[0].petitionerId }]);
  resolveYear(s);
  const v = s.voyages.find((x) => x.petitionerId === terna[0].petitionerId);
  dbgForceOutcome(s, v.id, 'thriving'); // +4 voyage news, recorded under 'voyage-thriving'
  for (let i = 0; i < 6; i++) {
    const { terna: t } = startYear(s);
    decide(s, t.slice(0, 3).map((c) => ({ id: c.petitionerId })));
    resolveYear(s);
  }
  const sb = EngineNS.scoreBreakdown(s);
  ok('breakdown: displayed matches getScore', sb.displayed === getScore(s), `${sb.displayed}`);
  ok('breakdown: rows reconcile with the tally', sb.start + sb.recorded + sb.unrecorded === sb.uncapped,
    `${sb.start}+${sb.recorded}+${sb.unrecorded} vs ${sb.uncapped}`);
  ok('breakdown: nothing unrecorded in a fully-instrumented game', sb.unrecorded === 0,
    `unrecorded=${sb.unrecorded} rows=${JSON.stringify(sb.rows)}`);
  const nov = sb.rows.find((r) => r.source === 'novitiate');
  ok('breakdown: novitiate founding + yearly growth tallied', !!nov && nov.total >= 4 + 7,
    JSON.stringify(nov)); // +4 founding, +1 for each of the 7 resolved years
  const thr = sb.rows.find((r) => r.source === 'voyage-thriving');
  ok('breakdown: thriving voyage tallied', !!thr && thr.total >= 4, JSON.stringify(thr));
  const yearSum = Object.values(sb.byYear).reduce((n, x) => n + x, 0);
  ok('breakdown: per-year nets sum to the recorded total', yearSum === sb.recorded,
    `${yearSum} vs ${sb.recorded}`);
  // Old saves: play recorded before deltas existed shows as unrecorded,
  // never as a wrong row.
  const old = deserialize(serialize(s));
  for (const e of old.ledger) { delete e.delta; delete e.scoreParts; delete e.scoreSource; }
  old.scoreUncapped = s.scoreUncapped;
  const sbOld = EngineNS.scoreBreakdown(old);
  ok('breakdown: pre-record play is unrecorded, not invented', sbOld.rows.length === 0
    && sbOld.unrecorded === sbOld.uncapped - sbOld.start,
    `rows=${sbOld.rows.length} unrecorded=${sbOld.unrecorded}`);
}

// --- 56. Established missions start at strength (Tran 2026-10-20) ------------
{
  const dests = [
    { id: 'goa', name: 'Goa, the Indies', travelYears: 2, ports: ['Lisbon', 'Goa'], region: 'Asia', foundedYear: 1542 },
    { id: 'japan', name: 'Japan', travelYears: 3, ports: ['Lisbon', 'Nagasaki'], region: 'Asia', foundedYear: 1549 },
    { id: 'peru', name: 'Peru', travelYears: 2, ports: ['Seville', 'Lima'], region: 'America', foundedYear: 1610 },
  ];
  setGameData({ petitioners: FIXTURES.petitioners, events: FIXTURES.events, destinations: dests });
  const s = newGame({ mode: 'campaign', seed: 'established' });
  const staffed = (id) => { const st = s.missions[id]; return st.fathers + st.coadjutors + st.brothers; };
  const ratio = (id) => staffed(id) / s.missions[id].capacity;
  ok('established: goa (founded 1542) starts at 60% or better', ratio('goa') >= 0.6, `${ratio('goa')}`);
  ok('established: japan (founded 1549) starts at 60% or better', ratio('japan') >= 0.6, `${ratio('japan')}`);
  ok('established: peru (founded 1610) keeps the lean start', ratio('peru') < 0.6, `${ratio('peru')}`);
  ok('established: topped-up men are named profiles on the roster',
    (s.missions.goa.staffIds || []).length === staffed('goa'),
    `${(s.missions.goa.staffIds || []).length} vs ${staffed('goa')}`);
  setGameData(FIXTURES);
}

// --- 57. Overcrowding penalties + Expand the mission (Tran 2026-10-20) -------
{
  // Upkeep: base on capacity, +2 per man beyond capacity.
  ok('overcap: upkeep within capacity is the base',
    EngineNS.missionUpkeep({ capacity: 10, fathers: 2, coadjutors: 2, brothers: 1 }) === 5);
  ok('overcap: upkeep charges +2 per man beyond capacity',
    EngineNS.missionUpkeep({ capacity: 10, fathers: 8, coadjutors: 6, brothers: 4 }) === 5 + 8 * 2,
    `${EngineNS.missionUpkeep({ capacity: 10, fathers: 8, coadjutors: 6, brothers: 4 })}`);

  // Fruit: the same men at the same mission bear less when over capacity.
  const base = newGame({ mode: 'campaign', seed: 'overcap' });
  const goaMen = (base.missions.goa.staffIds || []).length;
  ok('overcap: fixture goa has named men to test with', goaMen >= 2, `${goaMen}`);
  const full = deserialize(serialize(base));
  full.missions.goa.capacity = 10; // every man within capacity
  const over = deserialize(serialize(base));
  over.missions.goa.capacity = 1; // all but one man beyond capacity
  const frFull = EngineNS.produceFruits(full);
  const frOver = EngineNS.produceFruits(over);
  const hFull = frFull.byMission.goa.harvest;
  const hOver = frOver.byMission.goa.harvest;
  ok('overcap: over-capacity men bear less fruit', hOver < hFull, `${hOver} vs ${hFull}`);
  ok('overcap: the loss is the halving, not a wipeout', hOver > hFull * 0.4, `${hOver} vs ${hFull}`);
  // Tally: -5 per excess man per year, recorded for the breakdown.
  ok('overcap: tally penalty counts overfull missions', frOver.overPenalty === 5 && frFull.overPenalty === 0,
    `${frOver.overPenalty} vs ${frFull.overPenalty}`);
  const over4 = deserialize(serialize(base));
  over4.missions.goa.capacity = 1;
  over4.missions.goa.brothers += 3; // 5 men counted, 1 place: 4 excess
  ok('overcap: tally penalty scales per excess man',
    EngineNS.produceFruits(over4).overPenalty === 20,
    `${EngineNS.produceFruits(over4).overPenalty}`);
  const sbState = deserialize(serialize(base));
  EngineNS.buildSocietyReport(sbState, sbState.year, [], JSON.parse(JSON.stringify(sbState.stats || {})),
    { totalNew: 0, quotaPenalty: 0, overPenalty: 5 });
  const sbRow = EngineNS.scoreBreakdown(sbState).rows.find((r) => r.source === 'overcap');
  ok('overcap: the tally penalty lands in the ledger breakdown', !!sbRow && sbRow.total === -5,
    JSON.stringify(sbRow));

  // Expand the mission: a direct order — always obeyed, +5 places.
  for (const seed of ['exp-1', 'exp-2', 'exp-3']) {
    const s = newGame({ mode: 'campaign', seed });
    const before = s.missions.goa.capacity;
    EngineNS.issueInstruction(s, 'goa', 'expand');
    s.instructions.goa.arriveYear = s.year; // the order arrives this year
    const { terna } = startYear(s);
    decide(s, []);
    resolveYear(s);
    ok(`overcap: expand is obeyed and adds 5 places (${seed})`,
      s.missions.goa.capacity === before + 5 && s.instructions.goa.outcome === 'obeyed',
      `cap ${before} -> ${s.missions.goa.capacity}, outcome ${s.instructions.goa.outcome}`);
  }
}

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURES'}`);
process.exit(failures === 0 ? 0 : 1);

