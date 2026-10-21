/**
 * verses.js — Douay-Rheims Gospel verses for the yearly Mass of the Holy Spirit.
 *
 * Each year opens with a verse hinting at the year's virtue. The virtue grants
 * a soft boost (+1 to voyage rolls for men with 4+ in that disposition).
 * All quotes from the Douay-Rheims (1582/1609), the English Catholic Bible
 * Vitelleschi would have known.
 */

export const VERSES = {
  zeal: [
    { text: "The zeal of thy house hath eaten me up.", ref: "John 2:17" },
    { text: "I am come to cast fire on the earth; and what will I, but that it be kindled?", ref: "Luke 12:49" },
    { text: "Blessed are they that hunger and thirst after justice: for they shall have their fill.", ref: "Matt 5:6" },
  ],
  obedience: [
    { text: "Not my will, but thine be done.", ref: "Luke 22:42" },
    { text: "He that heareth you, heareth me: and he that despiseth you, despiseth me.", ref: "Luke 10:16" },
    { text: "If thou wilt be perfect, go sell what thou hast, and give to the poor, and come follow me.", ref: "Matt 19:21" },
  ],
  prudence: [
    { text: "Be ye therefore wise as serpents, and simple as doves.", ref: "Matt 10:16" },
    { text: "Which of you having a mind to build a tower, doth not first sit down, and reckon the charges that are necessary, whether he have wherewithal to finish it?", ref: "Luke 14:28" },
    { text: "Blessed is that servant, whom when his lord shall come he shall find so doing.", ref: "Matt 24:46" },
  ],
  humility: [
    { text: "Blessed are the poor in spirit: for theirs is the kingdom of heaven.", ref: "Matt 5:3" },
    { text: "Learn of me, because I am meek, and humble of heart: and you shall find rest to your souls.", ref: "Matt 11:29" },
    { text: "Whosoever shall exalt himself shall be humbled: and he that shall humble himself shall be exalted.", ref: "Matt 23:12" },
  ],
  patience: [
    { text: "In your patience you shall possess your souls.", ref: "Luke 21:19" },
    { text: "Blessed are they that mourn: for they shall be comforted.", ref: "Matt 5:5" },
    { text: "And you shall be hated by all men for my name's sake: but he that shall persevere unto the end, he shall be saved.", ref: "Matt 10:22" },
  ],
  adaptability: [
    { text: "Go ye into the whole world, and preach the gospel to every creature.", ref: "Mark 16:15" },
    { text: "Behold I send you as sheep in the midst of wolves.", ref: "Matt 10:16" },
    { text: "And other sheep I have, that are not of this fold: them also I must bring.", ref: "John 10:16" },
  ],
  stability: [
    { text: "No man putting his hand to the plough, and looking back, is fit for the kingdom of God.", ref: "Luke 9:62" },
    { text: "He that shall persevere unto the end, he shall be saved.", ref: "Matt 24:13" },
    { text: "Blessed are they that suffer persecution for justice' sake: for theirs is the kingdom of heaven.", ref: "Matt 5:10" },
  ],
};

export const VIRTUE_IDS = Object.keys(VERSES);
