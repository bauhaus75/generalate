/**
 * rules.js — GENERALATE scoring rules, resource constants, and the
 * voyage-outcome probability tables.
 *
 * All simulated voyage outcomes are counterfactual by definition: the
 * engine never asserts a historical fate. Ledger entries for simulated
 * outcomes are always labeled as such (see counterfactualNote()).
 */

/**
 * Score is fruit, not dispatches. The General earns nothing for sending men;
 * score moves when word comes back from the missions — thriving, illness,
 * return, or death — and through lasting foundations.
 *
 * All numbers are gameplay abstractions for balance, not historical statistics.
 */
export const SCORE = Object.freeze({
  START: 50,
  /** Score delta when a voyage's news arrives, by terminal outcome. */
  FRUIT: Object.freeze({
    thriving: 4,
    reassigned: 1,
    returned: 1,   // back in Europe, laboring here — increases fervor
    ill: -2,
    deceased: -5,
  }),
  /** Thriving beyond this many at a single mission gives diminished returns. */
  THRIVING_DIMINISH_AFTER: 3,
  /** Score for thriving when the mission already has many thriving men. */
  THRIVING_DIMINISHED: 2,
  /** Bonus when a novitiate is founded at a mission. */
  NOVITIATE_FOUND_BONUS: 4,
  /** Yearly score per operating novitiate. */
  NOVITIATE_YEARLY: 1,
  MIN: 0,
  MAX: 100,
});

/**
 * Veterans: a man thriving in the mission may return to Europe after years of
 * service. His homecoming stirs zeal for the missions — a temporary bonus to
 * voyage checks — and scores for the fruit of his testimony.
 */
export const VETERAN = Object.freeze({
  /** Minimum full years in the mission before a return is possible. */
  MIN_YEARS: 3,
  /** Yearly chance of return once eligible (isolated deterministic stream). */
  YEARLY_CHANCE: 0.15,
  /** Score when the veteran's homecoming news arrives. */
  SCORE: 2,
  /** Voyage-check bonus while zeal burns. */
  ZEAL_MOD: 1,
  /** Years the zeal bonus lasts after a homecoming. */
  ZEAL_YEARS: 3,
});

/**
 * Add a delta to a score and clamp to [MIN, MAX].
 * @param {number} score
 * @param {number} delta
 * @returns {number}
 */
export function addScore(score, delta) {
  return Math.max(SCORE.MIN, Math.min(SCORE.MAX, Math.round(score + delta)));
}

/** Resource economy constants. */
export const RESOURCES = Object.freeze({
  /** Sailing berths available per year. */
  BERTHS_PER_YEAR: 3,
  /** The seal is not free: every decision costs the mission chest.
   *  An approval commits the Society's resources (advances, dispensations,
   *  letters); a refusal still requires pastoral care and correspondence. */
  APPROVAL_COST: 30,
  DENIAL_COST: 0, // refusing a man is free; only approvals draw on the chest
  /** Hulls: each ship carries up to SHIP_CAPACITY souls per sailing
   *  (petitioners and their companions; one destination per hull), then is
   *  busy for the voyage's travel years. Hulls — not berths — are the
   *  binding constraint on departures, and hull space — not an arbitrary
   *  per-man rule — caps retinue size. */
  SHIP_NAMES: Object.freeze(['Nossa Senhora do Cabo', 'San Pedro de Alcantara', 'Santa Teresa']),
  SPARE_SHIP_NAMES: Object.freeze([
    'Santo António de Lisboa', 'Nossa Senhora da Conceição', 'São Francisco Xavier',
    'Bom Jesus', 'Santa Cruz', 'Nossa Senhora do Rosário',
  ]),
  SHIP_CAPACITY: 8,
  /** Cost to charter an additional hull (permanent). */
  SHIP_CHARTER_COST: 300,
  /** The Society at Vitelleschi's election (Jan 1615): 13,112 members in
   *  32 provinces and 559 houses (Catholic Encyclopedia, s.v. Aquaviva).
   *  Only a percentage can ever be spared for the missions. */
  SOCIETY_START: 13112,
  /** Share of the Society the General can spare for the missions: one in a
   *  hundred. Sets the starting mission-eligible pool and its yearly intake. */
  MISSION_PCT: 0.01,
  /** Yearly intake of new members (gameplay abstraction). */
  SOCIETY_YEARLY_INTAKE: 100,
  /** Cost to fit out one companion sailing with an approved man. */
  COMPANION_COST: 40,
  /** Max companions per approved man: a full hull minus the man himself.
   *  The ship's spare room — shared with other petitioners bound for the
   *  same mission — is the real limit; the voyage-check bonus still caps
   *  at COMPANION_MOD_CAP. */
  COMPANION_MAX: 7,
  /** Max voyage-check bonus from companions. */
  COMPANION_MOD_CAP: 3,
  /** Treasury at game start (ducats, abstract). */
  START_FUNDS: 1000,
  /** Cost to fit out and embark one missionary. */
  DEPARTURE_COST: 60,
  /** Yearly income from benefactors and colleges. */
  YEARLY_INCOME: 240,
  /** Soft cap on the departure queue; older entries sail first. */
  MAX_QUEUE: 40,
  /** Cost to commission +2 berths/year (expand mission capacity). */
  BERTH_EXPANSION_COST: 400,
  BERTH_EXPANSION_AMOUNT: 2,
  /** Cost to found a novitiate (house of formation) at an open mission. */
  NOVITIATE_COST: 800,
  /** Minimum team size for the sailing-in-company voyage bonus. */
  TEAM_MIN_SIZE: 2,
});

/** Terminal voyage outcomes. 'arrived' is transient; these are final. */
export const TERMINAL_OUTCOMES = Object.freeze(['thriving', 'reassigned', 'returned', 'ill', 'deceased']);

/** Human-readable labels for terminal outcomes. */
export const OUTCOME_LABELS = Object.freeze({
  thriving: 'thriving in the mission',
  reassigned: 'reassigned to another mission',
  returned: 'returned to Europe',
  ill: 'fallen gravely ill',
  deceased: 'deceased',
});

/**
 * Voyage resolution on the d20 framework (see dice.js).
 *
 * The check: d20 + modifiers vs VOYAGE_DC. Danger applies as a negative
 * modifier (−2 per point); sailing in company applies +2. Degrees map to
 * outcomes below. 'reassigned' is retained in the vocabulary for the
 * correspondence phase (reassignment orders); voyages currently resolve
 * to the other four outcomes.
 *
 * All numbers here are gameplay abstractions for balance, not historical
 * statistics.
 */
export const VOYAGE_DC = 11;
export const VOYAGE_DANGER_MOD = -2; // per point of destination danger
export const VOYAGE_TEAM_MOD = 2;    // sailing in company
export const VOYAGE_DEGREE_OUTCOMES = Object.freeze({
  'critical-setback': 'deceased',
  'setback': 'ill',
  'partial': 'returned',
  'success': 'thriving',
  'strong': 'thriving',
  'exceptional': 'thriving',
});

/** Fallback voyage length when a destination record lacks travelYears. */
export function defaultTravelYears() {
  return 2;
}

/**
 * Ledger note for a voyage outcome.
 * @param {string} outcome one of TERMINAL_OUTCOMES
 * @param {string} name missionary name
 * @param {string} destName destination display name
 * @returns {string}
 */
export function counterfactualNote(outcome, name, destName) {
  const label = OUTCOME_LABELS[outcome] ?? outcome;
  if (outcome === 'deceased') {
    return `Word reaches Rome that ${name} has died ${destName === 'Japan' ? '— the mission there now counts its martyrs' : 'in the mission'}.`;
  }
  if (outcome === 'thriving') {
    return `Letters report ${name} ${label}.`;
  }
  return `${name} is ${label}.`;
}

/** End-game title bands. */
export const TITLE_BANDS = Object.freeze([
  { min: 0, max: 19, title: 'The Failed Generalate' },
  { min: 20, max: 39, title: 'The Reluctant Steward' },
  { min: 40, max: 59, title: 'The Steady General' },
  { min: 60, max: 79, title: 'The Ardent General' },
  { min: 80, max: 100, title: 'The Great Missionary Steward' },
]);

/**
 * @param {number} score
 * @returns {string}
 */
export function titleForScore(score) {
  const band = TITLE_BANDS.find((b) => score >= b.min && score <= b.max);
  return band ? band.title : 'The Steady General';
}

/**
 * Mission staffing — the men stationed at each mission, by Jesuit grade.
 * The General may dispatch men directly to a mission (choosing the grade
 * mix), and petitioners who arrive thriving join the station's strength.
 * Each grade costs differently to send, costs yearly upkeep, and carries
 * a different mission strength.
 */
export const MISSION_GRADES = Object.freeze({
  fathers:    { name: 'Professed fathers',   short: 'Fathers',    cost: 120, strength: 3 },
  coadjutors: { name: 'Spiritual coadjutors', short: 'Coadjutors', cost: 80,  strength: 2 },
  brothers:   { name: 'Brothers',             short: 'Brothers',   cost: 50,  strength: 1 },
});
export const MISSION_GRADE_IDS = Object.freeze(['fathers', 'coadjutors', 'brothers']);

/** Target staffing (souls) per mission. Below this, the mission asks for more men. */
export const MISSION_CAPACITY = Object.freeze({
  'east-indies': 10,
  china: 10,
  japan: 12,
  india: 8,
  paraguay: 8,
  brazil: 8,
  aethiopia: 4,
  england: 3,
  'west-indies': 6,
  peru: 6,
  asia: 4,
  chile: 5,
});

/** +1 voyage bonus per this much mission strength, up to MISSION_BONUS_MAX. */
export const MISSION_STRENGTH_PER_BONUS = 6;
export const MISSION_BONUS_MAX = 3;

/**
 * Domestic apostolates: assignments within the Society's European institutional
 * network for men laboring in Europe (denied at the desk or returned).
 * Each role has a qualification rule and a concrete yearly effect.
 * Assigned men are occupied and do not petition in ternas (opportunity cost).
 * All numbers are gameplay abstractions for balance, not historical statistics.
 */
export const DOMESTIC_ROLES = Object.freeze({
  teaching: Object.freeze({
    id: 'teaching',
    name: 'College teaching',
    requires: 'scholastic or priest',
    desc: 'Teaches in a Jesuit college. The college contributes to the chest.',
    fundsPerYear: 10,
  }),
  pastoral: Object.freeze({
    id: 'pastoral',
    name: 'Pastoral ministry',
    requires: 'ordained priest',
    desc: 'Serves a parish or chaplaincy. Alms and stipends support the missions.',
    fundsPerYear: 8,
  }),
  formationAid: Object.freeze({
    id: 'formationAid',
    name: 'Formation service',
    requires: 'priest of proven prudence (4+)',
    desc: 'Assists in the house of formation. Reduces formation cost for all men.',
    formationDiscount: 5,
  }),
  studies: Object.freeze({
    id: 'studies',
    name: 'Continued studies',
    requires: 'scholastic',
    desc: 'Continues studies. Holds the man in Europe without immediate fruit.',
    fundsPerYear: 0,
  }),
});
