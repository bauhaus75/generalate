import { linkIndex } from './data';

/**
 * Linkify letter text at build time: wrap the first occurrence of each
 * known entity (person / place) in a letter in an <a> to its page.
 * Longest aliases match first; matching is case-sensitive with word
 * boundaries so "China" doesn't match "Chinese".
 */

const SKIP = new Set(['Your Paternity']); // too common as an honorific to link

interface Match {
  start: number;
  end: number;
  kind: 'person' | 'place';
  id: string;
  label: string;
}

function entityUrl(kind: 'person' | 'place', id: string): string {
  return kind === 'person' ? `/people/${id}/` : `/places/${id}/`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

export function linkifyParagraph(text: string): string {
  const matches: Match[] = [];
  const used = new Set<string>(); // entity ids already linked in this paragraph
  const occupied: [number, number][] = [];

  for (const entry of linkIndex) {
    if (SKIP.has(entry.text)) continue;
    const key = `${entry.kind}:${entry.id}`;
    if (used.has(key)) continue;
    const needle = entry.text;
    let from = 0;
    let placed = false;
    while (!placed) {
      const i = text.indexOf(needle, from);
      if (i === -1) break;
      const before = i === 0 ? '' : text[i - 1];
      const after = i + needle.length >= text.length ? '' : text[i + needle.length];
      const okBefore = i === 0 || !/[A-Za-z0-9à-ÿ]/.test(before);
      const okAfter =
        i + needle.length >= text.length || !/[A-Za-z0-9à-ÿ]/.test(after);
      if (okBefore && okAfter && !occupied.some(([s, e]) => i < e && i + needle.length > s)) {
        matches.push({ start: i, end: i + needle.length, kind: entry.kind, id: entry.id, label: entry.label });
        occupied.push([i, i + needle.length]);
        used.add(key);
        placed = true; // first occurrence only
      } else {
        from = i + 1;
      }
    }
  }

  if (!matches.length) return escapeHtml(text);
  matches.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const m of matches) {
    out += escapeHtml(text.slice(pos, m.start));
    const url = entityUrl(m.kind, m.id);
    out += `<a class="el" data-kind="${m.kind}" href="${url}" title="${escapeAttr(m.label)}">${escapeHtml(text.slice(m.start, m.end))}</a>`;
    pos = m.end;
  }
  out += escapeHtml(text.slice(pos));
  return out;
}

/** Linkify every paragraph of a letter; returns HTML strings. */
export function linkifyParagraphs(paras: string[]): string[] {
  return paras.map(linkifyParagraph);
}
