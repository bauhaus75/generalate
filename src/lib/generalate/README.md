# GENERALATE — engine API for the UI worker

Pure-logic ES modules. No DOM, no network, no LLM. All randomness is seeded;
any playthrough is reproducible from its seed.

## Modules

- `rng.js` — `makeRng(seedString)` → `{float(), int(a,b), pick(arr), shuffle(arr), chance(p), getState(), setState()}`. xmur3+sfc32, deterministic.
- `data.js` — `loadGameData()` → `Promise<{petitioners, events, destinations}>` (fetches `/generalate/*.json`, in-memory cache); `getGameData()`, `setGameData(data)`, `hasGameData()`, `clearGameData()`; `FIXTURES` (dev fixtures — invented, not historical).
- `rules.js` — score rules (start 50; +3 approval, −2 denial; clamp 0–100), resource constants, outcome probability tables by destination danger 0–3, `counterfactualNote()`, `titleForScore()`.
- `generator.js` — `fictionalPetitioner(seedBase, n, destIds, destNames, genYear)` — deterministic fictional petitioners (`fic-<n>`); every fictional letter has `kind:'fictional'`, `fictional:true`, and a disclaimer string.
- `engine.js` — the sim (API below).

## Engine API

```js
import { loadGameData } from './data.js';
import { newGame, startYear, decide, resolveYear, getScore, getLedger, endGame, serialize, deserialize } from './engine.js';

await loadGameData();                       // or setGameData(...) in tests
const state = newGame({ mode: 'campaign', seed: 'my-seed' });  // or 'endless'

// One year:
const { year, briefing, terna } = startYear(state);
// briefing: {funds, berths:{total,available}, ships[], missionNews[], eventsUpcoming[], relaxedClosed}
// terna: 3 cards {petitionerId,name,age,yearsInSociety,formation,studies,skills[],health,destination,destinationName,dossier,letter,fictional,deniedCount,status}
const { chosen, denied, report, scoreDelta } = decide(state, terna[i].petitionerId);
const { outcomes, eventsFired, yearReport, score } = resolveYear(state);

// Queries / persistence:
getScore(state);                             // 0..100
getLedger(state, { year, petitionerId, destination, decision, status, type });
const saved = serialize(state);              // JSON-safe
const restored = deserialize(saved);
const { stats, title, reflection } = endGame(state);
```

## Game flow

Campaign: 1615–1645, one terna per year (30 rounds). `startYear` throws
`{code:'CAMPAIGN_COMPLETE'}` when the campaign is over — call `endGame()`.

Endless: starts 1615, runs until the player ends it. After 1645 the state
sets `diverged=true`, `phase='alternate history'`, and new petitioners come
from `generator.js` (earlier decisions keep their consequences).

Turn order per year: `startYear` → `decide` (exactly one of the 3 card ids;
anything else throws) → `resolveYear`. Approved petitioners enter the
departure queue and sail berth/fund-permitting; voyages arrive `travelYears`
later; outcomes resolve at arrival; **news is delivered +0–1 years after
that** (watch `voyage.newsYear`). Simulated outcomes are always labeled
counterfactual in the ledger (`entry.counterfactual === true`).

Events fire on their year and mutate `state.destState[destId] =
{danger 0–3, access: open|restricted|closed}`; closed destinations are
excluded from terna eligibility and affect voyage outcome rolls.

Titles by score: 0–19 "The Failed Generalate", 20–39 "The Reluctant Steward",
40–59 "The Steady General", 60–79 "The Ardent General", 80–100
"The Great Missionary Steward". Reflections are pre-written (2 variants per
band, chosen deterministically by seed) — never generated per player.

## Invariants (asserted by soakTest every round)

1. Every terna: exactly 3 distinct petitioner ids. 2. `decide` accepts only
the current terna's ids. 3. Score ∈ [0,100]. 4. Returning petitioners keep
id + history. 5. No double approved/denied in one terna. 6. serialize→
deserialize round-trips identically. 7. Endless 500 rounds: no exceptions,
bounded growth (voyage detail capped at newest 150 resolved; ledger may grow).

## Debug

`dbgJumpYear(state, y)`, `dbgFireEvent(state, eventId)`,
`dbgSpawnTerna(state)`, `dbgForceOutcome(state, voyageId, outcome)`,
`soakTest({rounds, seed, mode})` → `{rounds, errors[], invariantsChecked,
finalScore, finalYear, completedCampaign}`.

## UI compatibility (for ui/app.js, coded against the mock)

- Cards carry `id` (= petitionerId), `history` (string array), `health`
  (1–5 number) + `healthNote`, `letterFromFuture` (bool).
- `briefing` = `{funds, berths, ships}` (numbers) + `missionNews[]`,
  `eventsUpcoming[]` (strings), `relaxedClosed`, `shipNames[]`.
- `state.currentYear` mirrors `{year, briefing, terna, decided,
  decisionResult}` (set by startYear, flagged by decide, cleared by
  resolveYear); `state.ended` ends the game.
- `decide` report has `summary` + `detail`; `yearReport` has `departed`
  (first sailing), `outcomes[]` with `{text, result, delta,
  counterfactual}`, `eventsFired[]` with `{title, text}`.
- `endGame().stats` includes UI aliases: `yearsRuled, approved, denied,
  departed, arrived, lost, returned, finalScore, seed`.
- `getMapState(state)` → `{year, voyages[], destinations:{id:{name,
  port, access, danger, closed, missions, arrived, lost}}}`;
  `DESTINATIONS` export maps id → `{id, name, port, region}`.
- Debug aliases: `__fireEvent`, `__forceOutcome` (accepts the mock's
  'arrived'/'lost'/'returned' vocabulary), `__debug()` →
  `{EVENTS:[ids], DESTINATIONS:[{id,name}]}`.
- Voyages carry `status: 'enroute'|'arrived'` and `name` aliases for the
  debug panel.

## Tests

`node test.mjs` — soak (500 endless rounds), determinism, full 30-round
campaign, closed-destination exclusion, delayed counterfactual news, debug
tools, fictional-petitioner disclaimers, ledger filters.
