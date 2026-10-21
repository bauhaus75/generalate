/**
 * dispositions.js — Phase 2: persistent dispositions & formation.
 *
 * Every petitioner carries seven traits (1–5), kept in four strictly
 * separate layers:
 *
 *   evidence — what his LETTERS attest, verbatim. Hand-curated; a missing
 *              entry means "not attested in his letters", NEVER a low score.
 *   initial  — the seeded starting disposition (informed by evidence where
 *              it exists: an attested trait starts at 4–5).
 *   current  — the living disposition. Formation moves this; nothing else
 *              rewrites evidence or initial.
 *   observed — behavior noted along the way (voyages, formation, returns).
 *              Simulated observations, labeled as such — never confused
 *              with documentary evidence.
 *
 * Grade (priesthood vs. other states) is preserved from the archive's
 * cataloging and never altered by game systems; "undetermined" stays
 * "Not specified in the source".
 */
export const TRAITS = [
  { id: 'zeal',         name: 'Zeal',         latin: 'zelus',
    blurb: 'Burning desire for the missions; carries a man through hardship.' },
  { id: 'obedience',    name: 'Obedience',    latin: 'oboedientia',
    blurb: 'Readiness to be sent, recalled, or refused without bitterness.' },
  { id: 'prudence',      name: 'Prudence',     latin: 'prudentia',
    blurb: 'Foresight and preparation; the careful packing of the soul.' },
  { id: 'humility',      name: 'Humility',     latin: 'humilitas',
    blurb: 'Knowledge of his own unworthiness; the ground of all the rest.' },
  { id: 'patience',      name: 'Patience',     latin: 'patientia',
    blurb: 'Endurance under delay, rebuff, and suffering.' },
  { id: 'adaptability',  name: 'Adaptability', latin: 'accommodatio',
    blurb: 'Suppleness toward new tongues, customs, and climates.' },
  { id: 'stability',     name: 'Stability',    latin: 'stabilitas',
    blurb: 'Constancy over the years; not wavering when fervor cools.' },
];

/** 1–5 scale labels. */
export const TRAIT_SCALE = ['wanting', 'weak', 'sound', 'strong', 'singular'];

export function traitLabel(v) {
  return TRAIT_SCALE[Math.max(1, Math.min(5, v)) - 1] || 'sound';
}
/**
 * Formation focuses. A year under one raises the primary trait by 1
 * (always) and the secondary by 1 on a seeded fifty-fifty. Costs 20 scudi
 * and the man's year; he must be laboring in Europe and not already
 * in formation — no double-booking.
 */
export const FORMATIONS = [
  { id: 'exercises',  name: 'The Spiritual Exercises', primary: 'humility',     secondary: 'patience',
    blurb: 'A year of the Exercises under a director.' },
  { id: 'studies',    name: 'Sacred Studies',          primary: 'prudence',     secondary: 'stability',
    blurb: 'Theology and cases of conscience; the mind formed for hard places.' },
  { id: 'tongues',    name: 'Tongues & Customs',       primary: 'adaptability', secondary: 'patience',
    blurb: 'Languages, manners, and the art of becoming all things to all men.' },
  { id: 'labor',      name: 'Manual Labor',            primary: 'humility',     secondary: 'obedience',
    blurb: 'The kitchen, the infirmary, the garden — greatness in littleness.' },
  { id: 'master',     name: 'Under a Master',          primary: 'obedience',    secondary: 'zeal',
    blurb: 'A year at the side of a seasoned missionary lately returned.' },
  { id: 'retreat',    name: 'Solitary Retreat',        primary: 'stability',    secondary: 'zeal',
    blurb: 'Silence and prayer; constancy tried and tempered.' },
];

export const FORMATION_COST = 20;

export function formationById(id) {
  return FORMATIONS.find((f) => f.id === id) || null;
}

export const GRADE_NAMES = {
  "father": "Father (priest)",
  "professed-of-the-4th-vow": "Professed Father",
  "brother": "Brother",
  "scholastic": "Scholastic",
  "novice": "Novice",
  "temporal-coadjutor": "Temporal coadjutor",
  "undetermined": "Not specified in the source"
};

/** Human grade label; undetermined stays "Not specified in the source". */
export function gradeLabel(g) { return GRADE_NAMES[g] || GRADE_NAMES.undetermined; }

/** Documentary evidence: petitionerId -> trait -> {letter, quote}. Verbatim excerpts. */
export const EVIDENCE = {
  "hist-1": {
    "zeal": {
      "letter": 1,
      "quote": "The fire that burns within my heart does not permit, Reverend Father in Christ, that I, as a son to so loving a father, should not lay bare the…"
    }
  },
  "hist-3": {
    "zeal": {
      "letter": 3,
      "quote": "Know, Your Paternity, that for no short time the talent of the Second Vocation has burned within my breast, which God has given to me, most…"
    },
    "humility": {
      "letter": 3,
      "quote": "Know, Your Paternity, that for no short time the talent of the Second Vocation has burned within my breast, which God has given to me, most…"
    }
  },
  "hist-4": {
    "humility": {
      "letter": 19,
      "quote": "Know then that my desires, my thoughts, my consolations, and when I can, even my words, are in nothing else than this — holding myself, however,…"
    }
  },
  "hist-8": {
    "zeal": {
      "letter": 17,
      "quote": "My father, for love of God let Your Paternity console me in this alone; for the rest, ure et seca (burn and cut)."
    }
  },
  "hist-22": {
    "zeal": {
      "letter": 47,
      "quote": "All the more so as that first ardent desire has not at all lessened; indeed I believe I may say it, and with truth certainly, that now it burns…"
    }
  },
  "hist-24": {
    "humility": {
      "letter": 63,
      "quote": "I know well — and in the past I have always known — the unfitness I bear for so lofty a Vocation as this of the Indies; and yet the greatness of…"
    }
  },
  "hist-26": {
    "humility": {
      "letter": 26,
      "quote": "Behold, then, I humbly beseech you to grant me the permission to go thither, though unworthy."
    }
  },
  "hist-29": {
    "zeal": {
      "letter": 30,
      "quote": "This is not what the fire I feel required, nor the confidence I must have."
    }
  },
  "hist-57": {
    "zeal": {
      "letter": 132,
      "quote": "I return to Your Paternity to make once more my petition for the Indies, and to recall to you my ardent desires, continued for so long a time."
    },
    "humility": {
      "letter": 101,
      "quote": "Nevertheless, though unworthy and rebuffed, I return to declare my desires once more — desires which will never end but with death."
    }
  },
  "hist-64": {
    "zeal": {
      "letter": 66,
      "quote": "Behold me cast once more at your feet by the most ardent desire which, by His mercy, the Lord God gives me to amplify His Holy Name in aiding the…"
    },
    "patience": {
      "letter": 66,
      "quote": "Behold me cast once more at your feet by the most ardent desire which, by His mercy, the Lord God gives me to amplify His Holy Name in aiding the…"
    }
  },
  "hist-71": {
    "zeal": {
      "letter": 74,
      "quote": "I shall seem troublesome to Your Paternity for so often recalling to you the ardent longing communicated to me by the Lord to shed my blood in…"
    }
  },
  "hist-89": {
    "zeal": {
      "letter": 95,
      "quote": "The heavenly flame cannot be hidden, nor can one act so that its burning is not felt; hence I cannot but trouble Your Paternity with repeated…"
    },
    "humility": {
      "letter": 125,
      "quote": "I think that by now, by God’s grace, the Father Procurator of China has arrived there; wherefore I pray with the warmest affection of my heart…"
    }
  },
  "hist-93": {
    "zeal": {
      "letter": 93,
      "quote": "I, the least of all men, ardently desire to be sent to India."
    },
    "humility": {
      "letter": 97,
      "quote": "I, the vilest of mortals, have nothing in hope, desire, expectation, or love, except to be sent to India."
    }
  },
  "hist-105": {
    "zeal": {
      "letter": 105,
      "quote": "I know not what to do; my heart burns and consumes itself in living flames of desire to suffer for love of our Crucified One."
    },
    "humility": {
      "letter": 115,
      "quote": "I received Your Paternity's letter of the 5th of April, which filled my soul to the brim with unspeakable joy, to see that the memory of me, a…"
    }
  },
  "hist-111": {
    "zeal": {
      "letter": 129,
      "quote": "The present feasts of the most holy Christmas, and the approaching renewal of spirit for which we are preparing, are a most urgent occasion to…"
    }
  },
  "hist-118": {
    "humility": {
      "letter": 118,
      "quote": "For the rest, I am ready all my life to teach school and every other exercise, should the so-desired India mission fail me through my unfitness."
    }
  },
  "hist-133": {
    "zeal": {
      "letter": 137,
      "quote": "Believe me, Your Paternity, that I burn and am consumed with desire, and every moment seems to me a thousand years."
    }
  }
};

/** Archive grade per historical petitioner: {grade, ordained}. */
export const GRADES = {
 "hist-1": {
  "grade": "professed-of-the-4th-vow",
  "ordained": true
 },
 "hist-3": {
  "grade": "brother",
  "ordained": false
 },
 "hist-4": {
  "grade": "brother",
  "ordained": false
 },
 "hist-5": {
  "grade": "brother",
  "ordained": false
 },
 "hist-6": {
  "grade": "brother",
  "ordained": false
 },
 "hist-7": {
  "grade": "father",
  "ordained": true
 },
 "hist-8": {
  "grade": "brother",
  "ordained": false
 },
 "hist-12": {
  "grade": "brother",
  "ordained": false
 },
 "hist-14": {
  "grade": "brother",
  "ordained": false
 },
 "hist-15": {
  "grade": "brother",
  "ordained": false
 },
 "hist-20": {
  "grade": "father",
  "ordained": true
 },
 "hist-21": {
  "grade": "brother",
  "ordained": false
 },
 "hist-22": {
  "grade": "brother",
  "ordained": false
 },
 "hist-23": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-24": {
  "grade": "brother",
  "ordained": false
 },
 "hist-25": {
  "grade": "brother",
  "ordained": false
 },
 "hist-26": {
  "grade": "brother",
  "ordained": false
 },
 "hist-27": {
  "grade": "brother",
  "ordained": false
 },
 "hist-29": {
  "grade": "brother",
  "ordained": false
 },
 "hist-31": {
  "grade": "brother",
  "ordained": false
 },
 "hist-36": {
  "grade": "brother",
  "ordained": false
 },
 "hist-40": {
  "grade": "brother",
  "ordained": false
 },
 "hist-57": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-64": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-65": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-67": {
  "grade": "scholastic",
  "ordained": false
 },
 "hist-71": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-72": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-75": {
  "grade": "scholastic",
  "ordained": false
 },
 "hist-76": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-81": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-82": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-83": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-86": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-89": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-93": {
  "grade": "father",
  "ordained": true
 },
 "hist-105": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-106": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-108": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-110": {
  "grade": "brother",
  "ordained": false
 },
 "hist-111": {
  "grade": "father",
  "ordained": true
 },
 "hist-112": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-114": {
  "grade": "brother",
  "ordained": false
 },
 "hist-117": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-118": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-119": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-122": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-128": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-130": {
  "grade": "brother",
  "ordained": false
 },
 "hist-131": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-133": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-147": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-159": {
  "grade": "undetermined",
  "ordained": null
 },
 "hist-169": {
  "grade": "scholastic",
  "ordained": false
 }
};
