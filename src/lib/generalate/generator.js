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
export const MAX_ACTIVE_FICTIONAL = 2000; // High cap for endless mode with low mortality

const FIRST_NAMES = Object.freeze({
  italian: ['Giovanni', 'Marco', 'Tommaso', 'Francesco', 'Antonio', 'Pietro', 'Paolo', 'Giuseppe', 'Carlo', 'Luca', 'Alessandro', 'Domenico', 'Stefano', 'Filippo', 'Nicola', 'Bartolomeo', 'Giacomo', 'Lorenzo', 'Matteo', 'Andrea', 'Simone', 'Vincenzo', 'Salvatore', 'Raffaele', 'Emanuele', 'Federico', 'Roberto', 'Claudio', 'Enrico', 'Giorgio', 'Ugo', 'Ottavio', 'Fabio', 'Sergio', 'Maurizio', 'Valerio', 'Aldo', 'Bruno', 'Cesare', 'Dario', 'Elio', 'Flavio', 'Ignazio', 'Ambrogio', 'Benedetto', 'Clemente', 'Damiano', 'Egidio', 'Fortunato', 'Gaetano', 'Ippolito', 'Leone', 'Massimo', 'Nestore', 'Onofrio', 'Placido', 'Quintino', 'Remigio', 'Silvestro', 'Teodoro', 'Umberto', 'Vittorio', 'Zaccaria', 'Adriano', 'Baldassarre', 'Camillo', 'Desiderio', 'Eligio', 'Ferruccio', 'Gherardo', 'Isidoro', 'Ladislao', 'Marcello', 'Narciso', 'Orazio', 'Panfilo', 'Rinaldo', 'Severino', 'Taddeo', 'Urbano'],
  spanish: ['Pedro', 'Diego', 'Juan', 'Francisco', 'Antonio', 'Miguel', 'Alonso', 'Cristobal', 'Domingo', 'Esteban', 'Felipe', 'Gabriel', 'Hernando', 'Ignacio', 'Jose', 'Luis', 'Carlos', 'Manuel', 'Rafael', 'Andres', 'Javier', 'Ricardo', 'Eduardo', 'Pablo', 'Ramon', 'Emilio', 'Julio', 'Tomas', 'Vicente', 'Salvador', 'Marcos', 'Nicolas', 'Agustin', 'Baltasar', 'Bernardo', 'Camilo', 'Dionisio', 'Eugenio', 'Fabian', 'Gregorio', 'Isidro', 'Joaquin', 'Alvaro', 'Beltran', 'Calixto', 'Damaso', 'Eleuterio', 'Fermin', 'Gonzalo', 'Hermogenes', 'Ildefonso', 'Jacinto', 'Leandro', 'Melchor', 'Narciso', 'Orencio', 'Pascual', 'Quiterio', 'Rosendo', 'Saturnino', 'Teofilo', 'Urbano', 'Valentin', 'Wenceslao', 'Ximeno', 'Zacarias', 'Anselmo', 'Benigno', 'Cecilio', 'Doroteo', 'Eulogio', 'Florencio', 'Gerardo', 'Hilario', 'Isidoro', 'Leoncio', 'Macario', 'Nicomedes', 'Onesimo', 'Pacomio', 'Ruperto'],
  portuguese: ['Manuel', 'Joao', 'Antonio', 'Francisco', 'Pedro', 'Diogo', 'Gaspar', 'Miguel', 'Tome', 'Baltasar', 'Cristovao', 'Duarte', 'Fernando', 'Goncalo', 'Henrique', 'Lourenco', 'Afonso', 'Bento', 'Caetano', 'Damiao', 'Estêvão', 'Filipe', 'Geraldo', 'Inacio', 'Jorge', 'Leonardo', 'Martinho', 'Nuno', 'Paulo', 'Rodrigo', 'Sebastiao', 'Tiago', 'Vasco', 'Xavier', 'Zacarias', 'Amaro', 'Bras', 'Cipriano', 'Dionisio', 'Egas', 'Froila', 'Garcia', 'Heliodoro', 'Isidoro', 'Jacinto', 'Lopo', 'Mendo', 'Nicolau', 'Odoario', 'Pelagio', 'Quintela', 'Ramiro', 'Salvador', 'Teotonio', 'Ursino', 'Valeriano', 'Xisto', 'Zozimo', 'Aleixo', 'Belchior', 'Cosme', 'Dario', 'Eliseu', 'Feliciano', 'Gervasio', 'Hermano', 'Isaque', 'Jeronimo', 'Lucio', 'Mauro', 'Nestor', 'Onofre', 'Pantaleao', 'Querubim', 'Rafael', 'Silvano', 'Tertuliano', 'Urbano'],
  // Native vocations: Christian baptismal name + native family name
  japanese: ['Paulo', 'Miguel', 'Joao', 'Francisco', 'Antonio', 'Domingos', 'Pedro', 'Tome', 'Bento', 'Gaspar', 'Manuel', 'Vicente', 'Aleixo', 'Barnabe', 'Cosme', 'Damiao', 'Estevao', 'Filipe', 'Goncalo', 'Henrique', 'Inacio', 'Jorge', 'Leonardo', 'Marcos', 'Nicolau', 'Pantaleao', 'Roque', 'Simao', 'Tadeu', 'Valentim'],
  chinese: ['Paulo', 'Miguel', 'Joao', 'Francisco', 'Antonio', 'Pedro', 'Jose', 'Tome', 'Manuel', 'Lucas', 'Mateus', 'Marcos', 'Tiago', 'Filipe', 'Bartolomeu', 'Tadeu', 'Simao', 'Andre', 'Tiago', 'Joao', 'Tomé', 'Estevao', 'Cristovao', 'Domingos', 'Gaspar', 'Baltasar', 'Melchior', 'Caspar', 'Ambrosio', 'Bento'],
  indian: ['Paulo', 'Francisco', 'Antonio', 'Joao', 'Pedro', 'Miguel', 'Manuel', 'Jose', 'Domingos', 'Gaspar', 'Tome', 'Bento', 'Vicente', 'Aleixo', 'Cristovao', 'Diogo', 'Duarte', 'Estevao', 'Filipe', 'Goncalo', 'Henrique', 'Inacio', 'Jorge', 'Lourenco', 'Martinho', 'Nicolau', 'Paulo', 'Rodrigo', 'Sebastiao', 'Simao'],
  brazilian: ['Paulo', 'Francisco', 'Antonio', 'Joao', 'Pedro', 'Miguel', 'Manuel', 'Jose', 'Domingos', 'Tome', 'Bento', 'Cristovao', 'Diogo', 'Estevao', 'Felipe', 'Goncalo', 'Henrique', 'Inacio', 'Jorge', 'Leonardo', 'Marcos', 'Nicolau', 'Sebastiao', 'Simao', 'Tiago', 'Vasco', 'Aleixo', 'Barnabe', 'Caetano', 'Damiao'],
});

const LAST_NAMES = Object.freeze({
  italian: ['Rossi', 'Bianchi', 'Verdi', 'Neri', 'Bellini', 'Sforza', 'Colonna', 'Orsini', 'Ferrari', 'Marini', 'Conti', 'Ricci', 'Moretti', 'Gallo', 'Fontana', 'Serra', 'Rinaldi', 'Barbieri', 'Grassi', 'Pellegrini', 'Farina', 'Sartori', 'Mancini', 'Ruggieri', 'Vitali', 'Orlando', 'Palmieri', 'Testa', 'Colombo', 'Barone', 'Ferraro', 'Gatti', 'Mariani', 'Bernardi', 'Greco', 'Martini', 'Lombardi', 'Pugliese', 'Siciliano', 'Napolitano', 'Romano', 'Fiorentino', 'Veneziano', 'Genovese', 'Milanese', 'Torinese', 'Bolognese', 'Padovano', 'Veronese', 'Senese', 'Pisano', 'Lucchese', 'Aretino', 'Perugino', 'Anconitano', 'Ferrigno', 'Cattaneo', 'Visconti', 'Borromeo', 'Doria', 'Farnese', 'Medici', 'Pazzi', 'Strozzi', 'Albizzi', 'Capponi', 'Rucellai', 'Pitti', 'Gondi', 'Salviati', 'Ridolfi', 'Guicciardini', 'Vettori', 'Nerli', 'Corsini', 'Antinori', 'Frescobaldi', 'Ricasoli', 'Ginori', 'Pucci', 'Valori'],
  spanish: ['Garcia', 'Fernandez', 'Gonzalez', 'Rodriguez', 'Lopez', 'Martinez', 'Sanchez', 'Perez', 'Gomez', 'Martin', 'Jimenez', 'Ruiz', 'Diaz', 'Moreno', 'Alvarez', 'Romero', 'Alonso', 'Gutierrez', 'Navarro', 'Torres', 'Dominguez', 'Vazquez', 'Ramos', 'Gil', 'Ramirez', 'Serrano', 'Blanco', 'Molina', 'Morales', 'Suarez', 'Ortega', 'Delgado', 'Castillo', 'Ortiz', 'Rubio', 'Marin', 'Sanz', 'Iglesias', 'Medina', 'Cortes', 'Guerrero', 'Mendoza', 'Aguilar', 'Delgado', 'Vargas', 'Castillo', 'Ortiz', 'Rubio', 'Marin', 'Sanz', 'Herrera', 'Medina', 'Aguilar', 'Vargas', 'Herrera', 'Mendoza', 'Aguilar', 'Velazquez', 'Guzman', 'Mendoza', 'Zuniga', 'Arellano', 'Mendoza', 'Toledo', 'Manrique', 'Lara', 'Haros', 'Guzman', 'Ponce', 'Ribera', 'Sandoval', 'Rojas', 'Osorio', 'Fajardo', 'Chacon', 'Avalos', 'Cardenas', 'Leyva', 'Mondragon', 'Navarrete', 'Orellana', 'Padilla', 'Quiroga'],
  portuguese: ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Jesus', 'Sousa', 'Fernandes', 'Goncalves', 'Gomes', 'Lopes', 'Marques', 'Alves', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira', 'Moreira', 'Correia', 'Mendes', 'Nunes', 'Vieira', 'Monteiro', 'Cardoso', 'Rocha', 'Dias', 'Nogueira', 'Correia', 'Moura', 'Barros', 'Freitas', 'Barbosa', 'Pires', 'Azevedo', 'Tavares', 'Barreto', 'Castro', 'Coelho', 'Cunha', 'Faria', 'Lemos', 'Macedo', 'Mota', 'Peixoto', 'Queiros', 'Rezende', 'Sampaio', 'Teles', 'Vasconcelos', 'Xavier', 'Abreu', 'Botelho', 'Cabral', 'Dantas', 'Espinoza', 'Furtado', 'Godinho', 'Holanda', 'Jardim', 'Lacerda', 'Maciel', 'Noronha', 'Pacheco', 'Quental', 'Rabelo', 'Sequeira', 'Tavora', 'Ulhoa', 'Vale', 'Ximenes'],
  // Native family names
  japanese: ['Yamada', 'Tanaka', 'Suzuki', 'Sato', 'Watanabe', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Ito', 'Kato', 'Yoshida', 'Yamaguchi', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Mori', 'Abe', 'Ikeda', 'Hashimoto', 'Ishikawa', 'Yamashita', 'Ogawa', 'Maeda', 'Fujita', 'Okada', 'Hasegawa', 'Murakami', 'Kondo'],
  chinese: ['Li', 'Wang', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Luo', 'Zheng', 'Liang', 'Xie', 'Song', 'Tang', 'Deng', 'Han', 'Feng', 'Cao', 'Peng', 'Zeng', 'Xiao'],
  indian: ['Fernandes', 'D Souza', 'Pereira', 'Rodrigues', 'Gomes', 'Lobo', 'Pinto', 'Sequeira', 'Menezes', 'Noronha', 'Tavora', 'Barreto', 'Coutinho', 'Mascarenhas', 'Saldanha', 'Melo', 'Cunha', 'Braganza', 'Albuquerque', 'Castelo Branco', 'Noronha', 'Mendonca', 'Sa', 'Barbosa', 'Cardoso', 'Dias', 'Freitas', 'Lima', 'Moreira', 'Nunes'],
  brazilian: ['Silva', 'Souza', 'Oliveira', 'Santos', 'Ferreira', 'Almeida', 'Carvalho', 'Araujo', 'Melo', 'Barbosa', 'Cardoso', 'Teixeira', 'Correia', 'Dias', 'Pinto', 'Ribeiro', 'Cavalcanti', 'Albuquerque', 'Mendonca', 'Bandeira', 'Macedo', 'Lacerda', 'Toledo', 'Pires', 'Camargo', 'Taques', 'Dias', 'Fernandes', 'Garcia', 'Leme'],
});

const CULTURES = ['italian', 'spanish', 'portuguese'];
const NATIVE_CULTURES = ['japanese', 'chinese', 'indian', 'brazilian'];
const NATIVE_TERRITORY = { japanese: 'japan', chinese: 'china', indian: 'india', brazilian: 'brazil' };
// 80% European, 20% Native vocations
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
export function fictionalPetitioner(seedBase, n, destIds, destNames, genYear, usedNames, openDestIds) {
  const rng = makeRng(`${seedBase}:fic:${n}`);
  // 80% European, 20% Native (native vocations are rarer)
  let culture;
  if (rng.float() < 0.8) {
    culture = rng.pick(CULTURES);
  } else {
    const native = rng.pick(NATIVE_CULTURES);
    const territory = NATIVE_TERRITORY[native];
    culture = (!openDestIds || openDestIds.has(territory)) ? native : rng.pick(CULTURES);
  }
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
