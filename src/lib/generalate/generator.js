/**
 * generator.js — procedural fictional petitioners for GENERALATE endless mode.
 *
 * Used only after the campaign timeline diverges ("alternate history"),
 * or when the historical pool cannot fill a terna. Everything here is
 * seeded and deterministic: fictionalPetitioner(seedBase, n, ...) always
 * returns the same record, so identities persist across serialize/
 * deserialize without storing bios in the game state.
 *
 * Every fictional letter carries kind:'fictional', fictional:true, and a
 * visible disclaimer string. The engine never presents fictional text
 * as historical.
 */

import { makeRng } from './rng.js';

export const FICTIONAL_DISCLAIMER = '';

/** Cap on simultaneously active fictional petitioners; resolved ones are archived. */
export const MAX_ACTIVE_FICTIONAL = 120;

const FIRST_NAMES = Object.freeze({
  italian: ['Giovanni', 'Marco', 'Tommaso', 'Francesco', 'Antonio', 'Pietro', 'Paolo', 'Giuseppe', 'Carlo', 'Luca', 'Alessandro', 'Domenico', 'Stefano', 'Filippo', 'Nicola', 'Bartolomeo', 'Giacomo', 'Lorenzo', 'Matteo', 'Andrea', 'Simone', 'Vincenzo', 'Salvatore', 'Raffaele', 'Emanuele', 'Federico', 'Roberto', 'Claudio', 'Enrico', 'Giorgio', 'Ugo', 'Ottavio', 'Fabio', 'Sergio', 'Maurizio', 'Valerio', 'Aldo', 'Bruno', 'Cesare', 'Dario', 'Elio', 'Flavio'],
  spanish: ['Pedro', 'Diego', 'Juan', 'Francisco', 'Antonio', 'Miguel', 'Alonso', 'Cristobal', 'Domingo', 'Esteban', 'Felipe', 'Gabriel', 'Hernando', 'Ignacio', 'Jose', 'Luis', 'Carlos', 'Manuel', 'Rafael', 'Andres', 'Javier', 'Ricardo', 'Eduardo', 'Pablo', 'Ramon', 'Emilio', 'Julio', 'Tomas', 'Vicente', 'Salvador', 'Marcos', 'Nicolas', 'Agustin', 'Baltasar', 'Bernardo', 'Camilo', 'Dionisio', 'Eugenio', 'Fabian', 'Gregorio', 'Isidro', 'Joaquin'],
  portuguese: ['Manuel', 'Joao', 'Antonio', 'Francisco', 'Pedro', 'Diogo', 'Gaspar', 'Miguel', 'Tome', 'Baltasar', 'Cristovao', 'Duarte', 'Fernando', 'Goncalo', 'Henrique', 'Lourenco', 'Afonso', 'Bento', 'Caetano', 'Damiao', 'Estêvão', 'Filipe', 'Geraldo', 'Inacio', 'Jorge', 'Leonardo', 'Martinho', 'Nuno', 'Paulo', 'Rodrigo', 'Sebastiao', 'Tiago', 'Vasco', 'Xavier', 'Zacarias', 'Amaro', 'Bras', 'Cipriano', 'Dionisio', 'Egas', 'Froila', 'Garcia'],
});

const LAST_NAMES = Object.freeze({
  italian: ['Rossi', 'Bianchi', 'Verdi', 'Neri', 'Bellini', 'Sforza', 'Colonna', 'Orsini', 'Ferrari', 'Marini', 'Conti', 'Ricci', 'Moretti', 'Gallo', 'Fontana', 'Serra', 'Rinaldi', 'Barbieri', 'Grassi', 'Pellegrini', 'Farina', 'Sartori', 'Mancini', 'Ruggieri', 'Vitali', 'Orlando', 'Palmieri', 'Testa', 'Gatti', 'Villa', 'Costa', 'Fontana', 'Mariani', 'Barone', 'Santoro', 'Caputo', 'Ferraro', 'Gentile', 'Lombardi', 'Mazza', 'Pugliese', 'Romano'],
  spanish: ['Alvarez', 'Fuentes', 'Garcia', 'Lopez', 'Martinez', 'Sanchez', 'Torres', 'Vargas', 'Castillo', 'Morales', 'Ortega', 'Reyes', 'Cruz', 'Mendoza', 'Aguilar', 'Delgado', 'Navarro', 'Dominguez', 'Vazquez', 'Ramos', 'Gil', 'Serrano', 'Blanco', 'Molina', 'Herrera', 'Medina', 'Guerrero', 'Campos', 'Vidal', 'Soto', 'Luna', 'Marin', 'Roldan', 'Salazar', 'Cardenas', 'Rosales', 'Beltran', 'Correa', 'Flores', 'Gutierrez', 'Herranz', 'Ibanez'],
  portuguese: ['Costa', 'Mendes', 'Silva', 'Santos', 'Ferreira', 'Pereira', 'Carvalho', 'Rocha', 'Dias', 'Nunes', 'Moreira', 'Teixeira', 'Correia', 'Pinto', 'Ribeiro', 'Faria'],
});

const CULTURES = ['italian', 'spanish', 'portuguese'];
const PLACES = ['Rome', 'Lisbon', 'Seville', 'Naples', 'Milan', 'Coimbra', 'Genoa', 'Evora'];
const SKILLS = ['Latin', 'Greek', 'preaching', 'teaching', 'medicine', 'music', 'astronomy', 'languages', 'rhetoric', 'mathematics'];
const HEALTHS = ['Good health', 'Good health', 'Good health', 'Delicate constitution', 'Recovering from a fever'];

const OPENINGS = [
  'Most Reverend Father in Christ, peace of Christ be with Your Paternity.',
  'Reverend Father, I write on my knees, begging a grace I have long desired.',
  'Most Reverend Father, after prayer and counsel I dare to set down my petition.',
];

const BODIES = [
  'For {years} years I have lived in the Society, and the desire grows in me daily to spend what remains of my life {destPhrase}. I am unworthy, yet I cannot be silent.',
  'The Indies are ever before my eyes, {destPhrase}. If Your Paternity judges me fit, send me; if not, I shall obey with a quiet heart.',
  'I have little to offer but a willing body and {skill}. {destCap} calls to me in prayer, and I lay the call at Your Paternity’s feet.',
  'Others are sent and I remain; I do not complain, but the longing {destPhrase} will not leave me. Dispose of me as God inspires you.',
];

const CLOSINGS = [
  'Your Paternity’s unworthy servant in Christ,',
  'Begging Your Paternity’s blessing, your least servant,',
  'In obedience and hope, your servant in Christ,',
];

/**
 * Build a deterministic fictional petitioner. Same (seedBase, n) → same record.
 * @param {string} seedBase the game's seed
 * @param {number} n fictional serial number (id will be `fic-${n}`)
 * @param {string[]} destIds destination ids to choose from
 * @param {string[]} destNames parallel display names
 * @param {number} genYear the game year this petitioner enters the pool
 * @returns {object} petitioner record in the petitioners.json shape (fictional:true)
 */
export function fictionalPetitioner(seedBase, n, destIds, destNames, genYear, usedNames) {
  const rng = makeRng(`${seedBase}:fic:${n}`);
  const culture = rng.pick(CULTURES);
  let name = `${rng.pick(FIRST_NAMES[culture])} ${rng.pick(LAST_NAMES[culture])}`;
  // Ensure uniqueness: if name is taken, try alternatives deterministically
  if (usedNames && usedNames.has(name)) {
    // Try with middle name or epithet
    const middleNames = FIRST_NAMES[culture];
    for (let i = 0; i < 10; i++) {
      const altRng = makeRng(`${seedBase}:fic:${n}:alt:${i}`);
      const altName = `${altRng.pick(FIRST_NAMES[culture])} ${altRng.pick(middleNames)} ${altRng.pick(LAST_NAMES[culture])}`;
      if (!usedNames.has(altName)) {
        name = altName;
        break;
      }
    }
    // If still taken, append roman numeral based on n
    if (usedNames.has(name)) {
      const numerals = ['II', 'III', 'IV', 'V'];
      name = `${name} ${numerals[n % numerals.length]}`;
    }
  }
  const age = rng.int(18, 40);
  const yearsInSociety = rng.int(0, Math.min(age - 15, 25));
  const formation =
    yearsInSociety < 2 ? 'novice'
    : yearsInSociety <= 8 ? 'scholastic'
    : rng.pick(['professed', 'priest']);
  const studies =
    formation === 'novice' ? 'Humanities and rhetoric'
    : formation === 'scholastic' ? rng.pick(['Philosophy', 'Theology (in progress)'])
    : 'Theology (completed)';
  const skills = rng.shuffle(SKILLS).slice(0, rng.int(1, 3));
  const health = rng.pick(HEALTHS);
  const di = rng.int(0, destIds.length - 1);
  const destination = destIds[di];
  const destName = destNames[di] || destination;
  const place = rng.pick(PLACES);
  const skill = skills[0].toLowerCase();

  const destPhrase = `to labor in ${destName}`;
  const letter = {
    n: 1,
    year: genYear,
    date: `${genYear}-06-01`,
    place,
    archival: '—',
    kind: 'fictional',
    fictional: true,
    excerpt: `${name} begs to be sent to ${destName}.`,
    full_paras: [
      rng.pick(OPENINGS),
      rng.pick(BODIES)
        .replaceAll('{years}', String(yearsInSociety))
        .replaceAll('{destPhrase}', destPhrase)
        .replaceAll('{destCap}', destName)
        .replaceAll('{skill}', skill),
      rng.pick(CLOSINGS),
      `${name}, ${place}`,
    ],
  };

  return {
    id: `fic-${n}`,
    fictional: true,
    name,
    age,
    yearsInSociety,
    formation,
    studies,
    skills,
    health,
    assignment: null,
    destination,
    dossier:
      `${name}, ${age}, ${formation}; ${yearsInSociety} years in the Society. ` +
      `Studies: ${studies}. Health: ${health.toLowerCase()}. Desires the ${destName} mission.`,
    letters: [letter],
  };
}

/**
 * Archive a resolved fictional petitioner: identity + history persist in the
 * id registry, but they leave the active pool (rolling population cap).
 * @param {object} record the state.petitioners[id] record
 */
export function archiveFictional(record) {
  record.archived = true;
}
