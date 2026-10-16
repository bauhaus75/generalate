import lettersRaw from '../data/letters.json';
import peopleRaw from '../data/people.json';
import placesRaw from '../data/places.json';
import topicsRaw from '../data/topics.json';
import edgesRaw from '../data/edges.json';
import linkIndexRaw from '../data/link_index.json';
import aboutRaw from '../data/about.json';
import discrepanciesRaw from '../data/discrepancies.json';
import destinationsRaw from '../data/destinations.json';
import modelsRaw from '../data/models.json';
import gradesRaw from '../data/grades.json';
import letterFacetsRaw from '../data/letter_facets.json';

export interface Letter {
  number: number;
  status?: string;
  byline_raw: string | null;
  author_raw: string | null;
  place_raw: string | null;
  date_raw: string | null;
  date_only: string | null;
  year: number | null;
  month: number | null;
  day: number | null;
  date_note: string | null;
  book_page_start: number | null;
  language: string | null;
  archival_ref: string | null;
  salutation: string[];
  body: string[];
  signoff: string[];
  editorial_notes: string[];
  missing_note?: string;
}

export interface Person {
  id: string;
  name: string;
  display_name: string;
  role: 'author' | 'recipient' | 'mentioned';
  aliases: string[];
  life_dates: string | null;
  bio: string | null;
  bio_source: string | null;
  note: string | null;
  letters_written: number[];
  letters_mentioned_in: number[];
  letters_received: number[];
}

export interface Place {
  id: string;
  name: string;
  kind: 'city' | 'region' | 'country' | 'mission';
  modern_name: string | null;
  description: string | null;
  aliases: string[];
  note: string | null;
  letters_written_from: number[];
  letters_mentioning: number[];
  letters_desiring: number[];
}

export interface Topic {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  letters: number[];
}

export interface Edge {
  letter: number;
  type: string;
  target: string;
  evidence: string[];
  count: number;
}

export interface LinkEntry {
  text: string;
  kind: 'person' | 'place';
  id: string;
  label: string;
}

export interface Destination {
  id: string;
  name: string;
  modern_name: string | null;
  letters: number[];
}

export interface Model {
  id: string;
  name: string;
  life_dates: string | null;
  letters: number[];
}

export interface Grade {
  id: string;
  name: string;
  letters: number[];
}

export interface LetterFacets {
  destinations: string[];
  models: string[];
  grades: string[];
}

export const letters = lettersRaw as unknown as Record<string, Letter>;
export const people = peopleRaw as unknown as Record<string, Person>;
export const places = placesRaw as unknown as Record<string, Place>;
export const topics = topicsRaw as unknown as Record<string, Topic>;
export const edges = edgesRaw as unknown as Edge[];
export const linkIndex = linkIndexRaw as unknown as LinkEntry[];
export const about = aboutRaw as unknown as {
  title: string; years: string; note_on_text: string; source: string;
  letters_translated: number; letters_total: number;
  missing: Record<string, string>;
};
export const discrepancies = discrepanciesRaw as unknown as
  { letter: number; place: string; topic: string; note: string }[];

export const letterNumbers = Object.keys(letters).map(Number).sort((a, b) => a - b);
export const personList = Object.values(people).sort((a, b) => a.name.localeCompare(b.name));
export const placeList = Object.values(places).sort((a, b) => a.name.localeCompare(b.name));
export const topicList = Object.values(topics).sort((a, b) => a.name.localeCompare(b.name));
export const destinations = destinationsRaw as unknown as Record<string, Destination>;
export const models = modelsRaw as unknown as Record<string, Model>;
export const grades = gradesRaw as unknown as Record<string, Grade>;
export const letterFacets = letterFacetsRaw as unknown as Record<string, LetterFacets>;
export const destinationList = Object.values(destinations).sort((a, b) => b.letters.length - a.letters.length || a.name.localeCompare(b.name));
export const modelList = Object.values(models).sort((a, b) => b.letters.length - a.letters.length || a.name.localeCompare(b.name));
export const gradeList = Object.values(grades).sort((a, b) => b.letters.length - a.letters.length || a.name.localeCompare(b.name));
export function facetsForLetter(n: number): LetterFacets {
  return letterFacets[String(n)] ?? { destinations: [], models: [], grades: [] };
}

export function getLetter(n: number): Letter {
  return letters[String(n)];
}

/** Edges grouped for quick lookup: `${letter}:${type}` -> Edge[] */
const edgeIndex = new Map<string, Edge[]>();
for (const e of edges) {
  const k = `${e.letter}:${e.type}`;
  const arr = edgeIndex.get(k);
  if (arr) arr.push(e);
  else edgeIndex.set(k, [e]);
}
export function letterEdges(n: number, type: string): Edge[] {
  return edgeIndex.get(`${n}:${type}`) ?? [];
}

/** Human-readable date, e.g. "January 3, 1616", "December 1618", "1617". */
export function formatDate(l: Letter): string {
  if (l.date_only) return l.date_only;
  if (l.date_raw) return l.date_raw;
  return 'Not specified in the source';
}

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Years present in the collection, ascending. */
export const years: number[] = Array.from(
  new Set(letterNumbers.map((n) => getLetter(n).year).filter((y): y is number => y != null)),
).sort((a, b) => a - b);

export function lettersInYear(y: number): number[] {
  return letterNumbers.filter((n) => getLetter(n).year === y);
}

/** Short preview of a letter's opening, for listings. Never invents text. */
export function letterPreview(n: number, maxLen = 170): string {
  const l = getLetter(n);
  if (l.status === 'not_translated' || !l.body.length) {
    return 'Translation unavailable — the database transcription is placeholder text.';
  }
  const first = l.body[0].replace(/\s+/g, ' ').trim();
  if (first.length <= maxLen) return first;
  const cut = first.slice(0, maxLen);
  const sp = cut.lastIndexOf(' ');
  return (sp > maxLen * 0.6 ? cut.slice(0, sp) : cut) + '…';
}
