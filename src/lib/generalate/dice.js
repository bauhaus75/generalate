/**
 * dice.js — transparent deterministic d20 resolution for GENERALATE.
 *
 * Every uncertain outcome resolves as:
 *
 *   total = d20 roll + contextual modifiers, compared against a DC,
 *   with degrees of success/failure rather than binary pass/fail.
 *
 * Determinism contract (per the design brief):
 * - Rolls come from isolated substreams keyed by purpose
 *   (see streamFor() in engine.js): inspecting a profile, adding a
 *   missionary, or resolving an unrelated event NEVER perturbs another
 *   stream. Same seed + same action sequence → same rolls, always.
 * - No Math.random() anywhere in this file.
 * - Modifiers are explicit per check: each check declares which
 *   characteristics matter. Nothing is silently global.
 *
 * Degrees of success:
 *   critical setback / setback / partial success /
 *   success / strong success / exceptional
 * Natural 20 shifts the degree one step up, natural 1 one step down —
 * never an automatic extreme.
 */

export const DEGREES = Object.freeze([
  'critical-setback',
  'setback',
  'partial',
  'success',
  'strong',
  'exceptional',
]);

export const DEGREE_LABELS = Object.freeze({
  'critical-setback': 'critical setback',
  'setback': 'setback',
  'partial': 'partial success',
  'success': 'success',
  'strong': 'strong success',
  'exceptional': 'exceptional result',
});

/**
 * Degree of success for a total vs DC, with nat 1/20 shifting one step.
 * @param {number} total d20 + modifiers
 * @param {number} dc target difficulty
 * @param {number} roll the natural d20 roll (1–20)
 * @returns {string} one of DEGREES
 */
export function degreeFor(total, dc, roll) {
  let idx;
  if (total <= dc - 10) idx = 0;
  else if (total <= dc - 5) idx = 1;
  else if (total < dc) idx = 2;
  else if (total < dc + 5) idx = 3;
  else if (total < dc + 10) idx = 4;
  else idx = 5;
  if (roll === 20) idx = Math.min(5, idx + 1);
  else if (roll === 1) idx = Math.max(0, idx - 1);
  return DEGREES[idx];
}

/**
 * Roll a d20 check on an isolated stream.
 * @param {{int:(a:number,b:number)=>number}} rng isolated substream
 * @param {{dc:number, modifiers?:Array<{label:string, value:number}>}} opts
 * @returns {{roll:number, nat20:boolean, nat1:boolean, dc:number,
 *   modifiers:Array, modTotal:number, total:number, degree:string}}
 */
export function d20check(rng, { dc, modifiers = [] } = {}) {
  if (!Number.isFinite(dc)) throw new Error('d20check: dc must be a number');
  const roll = rng.int(1, 20);
  const mods = modifiers.map((m) => ({ label: String(m.label), value: Number(m.value) || 0 }));
  const modTotal = mods.reduce((a, m) => a + m.value, 0);
  const total = roll + modTotal;
  return {
    roll,
    nat20: roll === 20,
    nat1: roll === 1,
    dc,
    modifiers: mods,
    modTotal,
    total,
    degree: degreeFor(total, dc, roll),
  };
}

/**
 * Compact player-facing exposition of a check, for the ledger/report.
 * e.g. "(d20 14, +2 sailing in company, -6 peril of Japan (3) vs DC 11 → success)"
 * @param {{roll:number, dc:number, modifiers:Array, total:number, degree:string}} check
 * @returns {string}
 */
export function exposition(check) {
  const parts = [`d20 ${check.roll}`];
  for (const m of check.modifiers) {
    parts.push(`${m.value >= 0 ? '+' : ''}${m.value} ${m.label}`);
  }
  const label = DEGREE_LABELS[check.degree] || check.degree;
  return `(${parts.join(', ')} vs DC ${check.dc} → ${label})`;
}

/**
 * Probability that a check with the given modifiers reaches at least
 * `degree` (or better). For tests and UI odds display. Exact, by
 * enumerating all 20 natural rolls.
 * @param {number} dc
 * @param {number} modTotal sum of modifiers
 * @param {string} degree minimum degree, one of DEGREES
 * @returns {number} 0..1
 */
export function probAtLeast(dc, modTotal, degree) {
  const minIdx = DEGREES.indexOf(degree);
  if (minIdx < 0) throw new Error(`probAtLeast: unknown degree "${degree}"`);
  let n = 0;
  for (let roll = 1; roll <= 20; roll++) {
    if (DEGREES.indexOf(degreeFor(roll + modTotal, dc, roll)) >= minIdx) n++;
  }
  return n / 20;
}
