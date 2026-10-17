/* GENERALATE — ui/playtest.js
 * Playtest Tools: save export + formation diagnostics. Strictly read-only:
 * nothing here mutates app.state. No network transmission.
 */

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const DEFAULT_THRESHOLDS = { firstVows: 2, philosophy: 5, regency: 8, theology: 12, ordination: 12 };

/** Mirror of the milestone eligibility in checkVowsMilestones (vows.js), on age in religion. */
function nextEligibleMilestone(vw, air, T) {
  if (['ordained', 'coadjutor', 'professed'].includes(vw.stage)) return null;
  const br = vw.stage === 'brother';
  if (air >= T.firstVows && !vw.firstVows) return 'firstVows';
  if (!br && air >= T.philosophy && !vw.philosophy) return 'philosophy';
  if (!br && air >= T.regency && !vw.regency) return 'regency';
  if (!br && air >= T.theology && !vw.theology) return 'theology';
  if (!br && air >= T.ordination && vw.theology && !vw.ordination) return 'ordination';
  return null;
}

function milestoneLabel(k, T) {
  const names = { firstVows: 'first vows', philosophy: 'philosophy', regency: 'regency', theology: 'theology', ordination: 'ordination' };
  return `${names[k] || k} (${T[k]}y)`;
}

/**
 * Read-only formation diagnostics. Returns { men: [...], warnings: [...] }.
 * E is the Engine namespace (needs ageInReligion or yearsInSociety, vowsTrackFor).
 */
export function buildDiagnostics(E, state) {
  const T = E.FORMATION_THRESHOLDS || DEFAULT_THRESHOLDS;
  const airOf = E.ageInReligion || E.yearsInSociety;
  const men = [];
  const warnings = [];
  const pending = Array.isArray(state.pendingVows) ? state.pendingVows : [];
  const labor = Array.isArray(state.europeanLabor) ? state.europeanLabor : [];
  const laborIds = new Set(labor.map((e) => e.petitionerId));

  for (const e of labor) {
    const pid = e.petitionerId;
    const rec = (state.petitioners || {})[pid] || {};
    const vw = (e.vows && typeof e.vows === 'object') ? e.vows
      : (rec.vows && typeof rec.vows === 'object' ? rec.vows : null);
    if (!vw) {
      warnings.push({ level: 'warning', petitionerId: pid, name: e.name, text: 'no vows object' });
      continue;
    }
    const track = E.vowsTrackFor ? E.vowsTrackFor(state, pid) : '?';
    const yrs = airOf(state, pid); // BACKGROUND age in religion (progression)
    const total = E.yearsInSociety ? E.yearsInSociety(state, pid) : yrs; // VISIBLE total
    const stored = typeof rec.ageInReligion === 'number' && typeof rec.totalYearsInSociety === 'number';
    const paused = !!(vw.deferredUntil && vw.deferredUntil > state.year);
    const entryYear = (rec.entryYear != null ? rec.entryYear : e.year);
    const histYrs = rec.yearsInSociety;
    const flags = {
      firstVows: vw.firstVows || null, philosophy: vw.philosophy || null,
      regency: vw.regency || null, theology: vw.theology || null, ordination: vw.ordination || null,
    };
    const mine = pending.filter((p) => p.petitionerId === pid).map((p) => p.type);
    men.push({
      petitionerId: pid, name: e.name, stage: vw.stage, track, entryYear,
      yearsInSociety: total, totalYearsInSociety: total,
      ageInReligion: yrs, ageInReligionPaused: paused, ageInReligionStored: stored,
      histYears: histYrs, flags,
      deferredUntil: vw.deferredUntil || null, tertianshipUntil: vw.tertianshipUntil || null,
      pending: mine,
    });

    const elig = nextEligibleMilestone(vw, yrs, T);
    if (elig && !mine.includes(elig)) {
      if (vw.deferredUntil && vw.deferredUntil <= state.year) {
        warnings.push({ level: 'warning', petitionerId: pid, name: e.name,
          text: `deferral overdue: ${milestoneLabel(elig, T)} was deferred until ${vw.deferredUntil}, no decision re-queued` });
      } else if (!vw.deferredUntil || vw.deferredUntil <= state.year) {
        warnings.push({ level: 'warning', petitionerId: pid, name: e.name,
          text: `eligible milestone with no decision queued: ${milestoneLabel(elig, T)} (age in religion ${yrs}y)` });
      }
    }
    if (vw.stage === 'novice' && yrs > T.firstVows && !vw.firstVows && !mine.includes('firstVows')) {
      warnings.push({ level: 'warning', petitionerId: pid, name: e.name,
        text: `past novice threshold: stage=novice at age in religion ${yrs}y` });
    }
    if (!stored && rec.entryYear != null) {
      warnings.push({ level: 'warning', petitionerId: pid, name: e.name,
        text: 'year counters not stored yet (derived from entryYear); it will be seeded on load or next year-advance' });
    }
  }

  for (const p of pending) {
    if (!laborIds.has(p.petitionerId)) {
      warnings.push({ level: 'warning', petitionerId: p.petitionerId, name: p.name || p.petitionerId,
        text: `orphaned decision: pending ${p.type} for a man not in europeanLabor` });
    }
  }
  return { men, warnings };
}

/**
 * Lightweight diagnostic report (NOT a full save). Pure function.
 */
export function buildDiagnosticReport(E, state) {
  const d = buildDiagnostics(E, state);
  return {
    kind: 'generalate-diagnostics',
    version: state.version || 1,
    campaignYear: state.year,
    seed: state.seed || null,
    mode: state.mode || null,
    men: d.men,
    pendingVows: Array.isArray(state.pendingVows) ? state.pendingVows : [],
    vowsNewsInTransit: Array.isArray(state.vowsNewsInTransit) ? state.vowsNewsInTransit : [],
    warnings: d.warnings,
  };
}

/** Pure: build the save-export payload without touching state. */
export function buildSaveExport(E, state) {
  const snap = E.serialize(state);
  const json = JSON.stringify(snap, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  return { filename: `generalate-save-${date}-anno${state.year}.json`, json };
}

/** Pure: build the diagnostics-export payload. */
export function buildDiagnosticsExport(E, state) {
  const report = buildDiagnosticReport(E, state);
  return { filename: `generalate-diagnostics-anno${state.year}.json`, json: JSON.stringify(report, null, 2) };
}

/** Trigger a file download in the browser (works in iPhone Safari). */
export function downloadJson(filename, json) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

/** Clipboard fallback for the JSON payload. Returns a promise. */
export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('clipboard unavailable'));
}

function diagTableHTML(d) {
  if (!d.men.length) return '<p class="howto-note">No men laboring in Europe.</p>';
  const rows = d.men.map((m) => {
    const fl = ['firstVows', 'philosophy', 'regency', 'theology', 'ordination']
      .map((k) => `${k === 'firstVows' ? 'FV' : k.slice(0, 2).toUpperCase()}:${m.flags[k] == null ? '—' : esc(String(m.flags[k]))}`).join(' ');
    return `<tr><td>${esc(m.name)}<br><span style="opacity:.6">${esc(String(m.petitionerId).slice(0, 8))}</span></td>` +
      `<td>${esc(m.stage)}<br><span style="opacity:.6">${esc(m.track)} track</span></td>` +
      `<td>${esc(String(m.totalYearsInSociety))}y<br><span style="opacity:.6">rel. ${esc(String(m.ageInReligion))}${m.ageInReligionPaused ? ' (paused)' : ''} · entered ${m.entryYear == null ? '—' : esc(String(m.entryYear))}${m.histYears != null ? ` · hist ${esc(String(m.histYears))}` : ''}</span></td>` +
      `<td style="font-size:.85em">${esc(fl)}</td>` +
      `<td>${m.deferredUntil == null ? '—' : 'def→' + esc(String(m.deferredUntil))}${m.tertianshipUntil == null ? '' : '<br>tert→' + esc(String(m.tertianshipUntil))}</td>` +
      `<td>${m.pending.length ? esc(m.pending.join(', ')) : '—'}</td></tr>`;
  }).join('');
  return `<div style="overflow-x:auto"><table class="diag-table" style="font-size:.8em;border-collapse:collapse;width:100%">` +
    `<thead><tr><th style="text-align:left">Man</th><th style="text-align:left">Grade</th><th style="text-align:left">Yrs in Society</th><th style="text-align:left">Milestones</th><th style="text-align:left">Defer/Tert</th><th style="text-align:left">Pending</th></tr></thead>` +
    `<tbody>${rows}</tbody></table></div>`;
}

function warningsHTML(d) {
  if (!d.warnings.length) return '<p class="howto-note">✅ No formation warnings.</p>';
  const rows = d.warnings.map((w) =>
    `<li><strong>⚠️ warning</strong> — ${esc(w.name || w.petitionerId)}: ${esc(w.text)}</li>`).join('');
  return `<ul class="diag-warnings" style="font-size:.85em">${rows}</ul>`;
}

/** HTML for the collapsible Playtest Tools section. Read-only. */
export function playtestSectionHTML(app) {
  const d = buildDiagnostics(app.Engine, app.state);
  return `
  <details class="playtest-tools" style="margin-top:1.2em;border-top:1px solid #6b5a3e;padding-top:.8em">
    <summary class="px" style="cursor:pointer">🔧 PLAYTEST TOOLS</summary>
    <p class="howto-note">Read-only debugging aids. Nothing here changes your game.</p>
    <p class="howto-note">⚠️ Private browsing: save data may be lost when the session ends.</p>
    <h3 class="sect">Save export</h3>
    <p class="howto-note"><strong>Full save</strong> = complete backup; restore it later by importing. <strong>Diagnostics</strong> = lightweight bug-report file (no RNG internals).</p>
    <div class="btn-row">
      <button class="gbtn small" id="pt-export-save">Export full save (JSON)</button>
      <button class="gbtn small ghost" id="pt-copy-save">Copy save JSON</button>
    </div>
    <div class="btn-row">
      <button class="gbtn small" id="pt-export-diag">Export diagnostics (JSON)</button>
      <button class="gbtn small ghost" id="pt-copy-diag">Copy diagnostics JSON</button>
    </div>
    <p class="howto-note" id="pt-status" aria-live="polite"></p>
    <h3 class="sect">Formation diagnostics</h3>
    ${warningsHTML(d)}
    ${diagTableHTML(d)}
  </details>`;
}

/** Wire the export buttons. All handlers are read-only. */
export function attachPlaytestHandlers(app, root) {
  const status = (msg) => {
    const el = root.querySelector('#pt-status');
    if (el) el.textContent = msg;
  };
  const q = (id) => root.querySelector(id);
  const doDownload = (builder, label) => {
    try {
      const before = JSON.stringify(app.state);
      const { filename, json } = builder(app.Engine, app.state);
      const after = JSON.stringify(app.state);
      if (before !== after) { status('❌ export mutated state — aborted'); return; }
      downloadJson(filename, json);
      status(`✅ ${label} ready: ${filename}`);
    } catch (e) { status(`❌ ${label} failed: ${e.message}`); }
  };
  const doCopy = (builder, label) => {
    try {
      const before = JSON.stringify(app.state);
      const { json } = builder(app.Engine, app.state);
      const after = JSON.stringify(app.state);
      if (before !== after) { status('❌ copy mutated state — aborted'); return; }
      copyText(json).then(() => status(`✅ ${label} copied to clipboard`))
        .catch((e) => status(`❌ copy failed: ${e.message}`));
    } catch (e) { status(`❌ ${label} failed: ${e.message}`); }
  };
  const b1 = q('#pt-export-save'); if (b1) b1.addEventListener('click', () => doDownload(buildSaveExport, 'full save'));
  const b2 = q('#pt-copy-save'); if (b2) b2.addEventListener('click', () => doCopy(buildSaveExport, 'full save'));
  const b3 = q('#pt-export-diag'); if (b3) b3.addEventListener('click', () => doDownload(buildDiagnosticsExport, 'diagnostics'));
  const b4 = q('#pt-copy-diag'); if (b4) b4.addEventListener('click', () => doCopy(buildDiagnosticsExport, 'diagnostics'));
}