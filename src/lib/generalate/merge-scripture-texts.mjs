/**
 * merge-scripture-texts.mjs — one-shot integration helper.
 *
 * Tran asked (2026-10-19 ~17:11 PDT, live thread) for the actual
 * Douay-Rheims quotations for all 350 scripture-bank verses, "without
 * the explanation" (i.e. show the quotation in the Mass overlay instead
 * of the theme line).
 *
 * This script injects `text` into every entry of scripture-bank.js from
 * scripture-texts.json (350 verbatim DR (Challoner) quotations, extracted
 * 2026-10-19 from Project Gutenberg ebook #1581; 44 passages had inline
 * Challoner annotations stripped — see scripture-cleaning-log.json).
 *
 * Usage:  node src/lib/generalate/merge-scripture-texts.mjs
 * Then:   node src/lib/generalate/test.mjs   (scripture-bank tests must pass)
 *         node src/lib/generalate/audit-ui.mjs   (Tran's pre-push rule)
 *
 * UI follow-up (live thread): showMassOverlay in ui/screens.js should
 * render entry.text (the quotation) with entry.reference, and drop the
 * theme line per Tran's "without the explanation".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const bankPath = join(dir, "scripture-bank.js");
const textsPath = join(dir, "scripture-texts.json");

const texts = JSON.parse(readFileSync(textsPath, "utf8"));
let src = readFileSync(bankPath, "utf8");

let injected = 0;
for (const [id, entry] of Object.entries(texts)) {
  // insert "text" after the "reference" line of the matching entry
  const re = new RegExp(
    `("id":\\s*"${id}"[\\s\\S]*?"reference":\\s*"${entry.reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}",\\n)`,
  );
  const m = src.match(re);
  if (!m) {
    console.error(`NO MATCH for ${id} (${entry.reference})`);
    continue;
  }
  const textLine = `    "text": ${JSON.stringify(entry.text)},\n`;
  src = src.replace(re, m[1] + textLine);
  injected++;
}

writeFileSync(bankPath, src);
console.log(`injected text into ${injected}/${Object.keys(texts).length} entries`);

// sanity: every entry now has a text field
const count = (src.match(/"text":/g) || []).length;
console.log(`"text" fields in bank: ${count}`);
if (count !== 350) {
  console.error("EXPECTED 350 text fields — do not ship until this is 350");
  process.exit(1);
}
