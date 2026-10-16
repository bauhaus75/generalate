/**
 * data.js — game-data loading for GENERALATE.
 *
 * loadGameData() fetches the three JSON files built by the data worker:
 *   /generalate/petitioners.json — historical petitioners (id "hist-<n>", fictional:false)
 *   /generalate/events.json      — historical events 1615–1645 with destState effects
 *   /generalate/destinations.json — the 12 destinations (travelYears, ports)
 *
 * Results are cached in memory. For tests / offline dev, setGameData()
 * injects data directly (test.mjs uses FIXTURES below).
 *
 * The engine never invents historical text: it only shuffles/selects
 * records from these files. Letter #100 is filtered out defensively
 * even though the data build excludes it.
 */

let cache = null;

/**
 * Fetch and cache the game data. Subsequent calls return the cache.
 * @param {string} [base='/generalate'] URL base for the JSON files
 * @returns {Promise<{petitioners:object[],events:object[],destinations:object[]}>}
 */
export async function loadGameData(base = '/generalate') {
  if (cache) return cache;
  const [p, e, d] = await Promise.all(
    ['petitioners.json', 'events.json', 'destinations.json'].map(async (f) => {
      const res = await fetch(`${base}/${f}`);
      if (!res.ok) throw new Error(`generalate data: failed to fetch ${base}/${f} (${res.status})`);
      return res.json();
    })
  );
  cache = normalize({ petitioners: p, events: e, destinations: d });
  return cache;
}

/** @returns {boolean} */
export function hasGameData() {
  return cache !== null;
}

/** @returns {{petitioners:object[],events:object[],destinations:object[]}|null} */
export function getGameData() {
  return cache;
}

/**
 * Inject game data directly (tests, fixtures, offline dev).
 * @param {{petitioners:object[]|object,events:object[]|object,destinations:object[]|object}} data
 * @returns {{petitioners:object[],events:object[],destinations:object[]}}
 */
export function setGameData(data) {
  cache = normalize(data);
  return cache;
}

/** Clear the in-memory cache (tests). */
export function clearGameData() {
  cache = null;
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

/**
 * Like asArray, but when the input is a keyed object (e.g. destinations.json
 * is {"east-indies": {...}}), inject the key as `id` on entries that lack one.
 */
function asArrayWithKeys(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    return Object.entries(v).map(([k, o]) => ({ id: k, ...(o || {}) }));
  }
  return [];
}

/**
 * Normalize raw data into the engine's expected shape and defensively
 * drop letter #100 (no English text; excluded from play).
 */
function normalize(data) {
  const petitioners = asArray(data.petitioners).map((p) => ({
    ...p,
    letters: (p.letters || []).filter((l) => l && l.n !== 100),
  }));
  const events = asArray(data.events);
  const destinations = asArrayWithKeys(data.destinations);
  return { petitioners, events, destinations };
}

// ---------------------------------------------------------------------------
// Development fixtures (NOT historical data — invented names/dates for engine
// dev only, until the data worker's real files land). The engine treats
// fixture records exactly like real ones: select/shuffle, never invent.
// ---------------------------------------------------------------------------

function fLetter(n, year, destination, place) {
  return {
    n,
    year,
    date: `${year}-03-14`,
    place,
    archival: `ARSI, FG 735, FIXTURE-${n}`,
    excerpt: `[fixture] excerpt of petition letter ${n} (${year}), desiring ${destination}.`,
    kind: 'historical',
    full_paras: [
      'Most Reverend Father in Christ,',
      `[fixture] body paragraph of letter ${n}, written ${year} from ${place}, begging to be sent to ${destination}.`,
      'Your Paternity’s unworthy servant in Christ',
    ],
  };
}

function fPet(id, name, age, yis, formation, studies, skills, destination, dossier, letters) {
  return {
    id, fictional: false, name, age,
    yearsInSociety: yis, formation, studies, skills,
    health: 'Good health', assignment: null,
    destination, dossier, letters,
  };
}

/** Small fixture set exercising: multi-letter petitioners, year gating, closed destinations. */
export const FIXTURES = {
  petitioners: [
    fPet('hist-1', 'Marco Bellini', 24, 5, 'scholastic', 'Philosophy', ['Latin', 'teaching'], 'goa',
      'A young scholastic of steady habits, eager for the Indies.',
      [fLetter(1, 1615, 'goa', 'Rome'), fLetter(2, 1619, 'goa', 'Lisbon')]),
    fPet('hist-2', 'Pedro Alvarez', 31, 12, 'priest', 'Theology (completed)', ['preaching'], 'peru',
      'A priest of some experience, sound in doctrine.',
      [fLetter(3, 1615, 'peru', 'Seville')]),
    fPet('hist-3', 'Giovanni Rossi', 19, 1, 'novice', 'Humanities and rhetoric', ['music'], 'japan',
      'A fervent novice; his zeal outruns his years.',
      [fLetter(4, 1618, 'japan', 'Rome'), fLetter(5, 1621, 'japan', 'Nagasaki passage')]),
    fPet('hist-4', 'Manuel Costa', 28, 9, 'scholastic', 'Theology (in progress)', ['Greek', 'astronomy'], 'china',
      'Learned in mathematics; suited to the China mission.',
      [fLetter(6, 1620, 'china', 'Coimbra')]),
    fPet('hist-5', 'Tommaso Verdi', 35, 16, 'professed', 'Theology (completed)', ['medicine', 'languages'], 'philippines',
      'A professed father, skilled with the sick.',
      [fLetter(7, 1622, 'philippines', 'Naples'), fLetter(8, 1628, 'philippines', 'Seville')]),
    fPet('hist-6', 'Diego Fuentes', 22, 4, 'scholastic', 'Philosophy', ['Latin'], 'goa',
      'Diligent in studies; of a mild temper.',
      [fLetter(9, 1625, 'goa', 'Evora')]),
    fPet('hist-7', 'Antonio Bianchi', 27, 8, 'priest', 'Theology (completed)', ['preaching', 'teaching'], 'peru',
      'A zealous preacher, well-liked by the people.',
      [fLetter(10, 1627, 'peru', 'Milan'), fLetter(11, 1631, 'peru', 'Lima passage')]),
    fPet('hist-8', 'Francesco Neri', 20, 2, 'novice', 'Humanities and rhetoric', ['music'], 'japan',
      'Burns to follow Xavier to Japan.',
      [fLetter(12, 1630, 'japan', 'Rome')]),
    fPet('hist-9', 'José Mendes', 33, 14, 'professed', 'Theology (completed)', ['astronomy', 'languages'], 'china',
      'A man of letters; patient in adversity.',
      [fLetter(13, 1633, 'china', 'Macao passage')]),
    fPet('hist-10', 'Carlo Sforza', 26, 7, 'scholastic', 'Theology (in progress)', ['teaching'], 'philippines',
      'Cheerful and obedient; fit for the islands.',
      [fLetter(14, 1636, 'philippines', 'Genoa')]),
  ],
  events: [
    {
      id: 'ev-japan-1619', year: 1619,
      title: 'Persecution intensifies in Japan',
      description: '[fixture] Edicts drive the mission underground; sailings grow perilous.',
      effects: { japan: { danger: 3, access: 'restricted' } },
    },
    {
      id: 'ev-nagasaki-1622', year: 1622,
      title: 'Great Martyrdom of Nagasaki',
      description: '[fixture] The mission is shattered; Japan is closed to new sailings.',
      effects: { japan: { danger: 3, access: 'closed' } },
    },
    {
      id: 'ev-pacific-1630', year: 1630,
      title: 'Pacific storms disrupt the Manila run',
      description: '[fixture] Galleons lost; the Philippines passage is restricted.',
      effects: { philippines: { danger: 2, access: 'restricted' } },
    },
    {
      id: 'ev-macao-1635', year: 1635,
      title: 'Macao trade steadies',
      description: '[fixture] The China passage is safer than it has been in years.',
      effects: { china: { danger: 1, access: 'open' } },
    },
  ],
  destinations: [
    { id: 'goa', name: 'Goa, the Indies', travelYears: 2, ports: ['Lisbon', 'Goa'], region: 'Asia' },
    { id: 'japan', name: 'Japan', travelYears: 3, ports: ['Lisbon', 'Nagasaki'], region: 'Asia' },
    { id: 'china', name: 'China', travelYears: 3, ports: ['Lisbon', 'Macao'], region: 'Asia' },
    { id: 'peru', name: 'Peru', travelYears: 2, ports: ['Seville', 'Callao'], region: 'Americas' },
    { id: 'philippines', name: 'the Philippines', travelYears: 3, ports: ['Seville', 'Manila'], region: 'Asia' },
  ],
};
