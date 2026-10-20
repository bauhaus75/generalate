/* GENERALATE — screens.js
 * All game screens. Each renderX(app, root, ...) builds DOM into root.
 * app provides: Engine, state, esc(), sound(), save(), go(), debug helpers.
 */

import * as Dispositions from '../dispositions.js';
import { DOMESTIC_ROLES } from '../rules.js';
import * as Playtest from './playtest.js';

export function kindLabel(kind) {
  if (kind === 'fictional') return 'Letter';
  if (kind === 'abridged') return 'Abridged from the historical letter';
  if (kind === 'historical') return 'Historical letter';
  return 'Letter';
}
export function kindBadge(kind) {
  const cls = kind === 'fictional' ? 'kind-fict' : 'kind-hist';
  return `<span class="kind-badge ${cls}">${esc(kindLabel(kind))}</span>`;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders a clickable person name that opens their profile (inspector).
 * Use this for EVERY mention of a person's name in the UI.
 */
function nameLink(app, petitionerId, name) {
  const displayName = name || (app.Engine.personName ? app.Engine.personName(app.state, petitionerId) : null) || petitionerId;
  // Don't show raw hist- IDs; fall back to a generic label
  const clean = String(displayName).startsWith('hist-') ? 'A petitioner' : displayName;
  return `<button class="name-link" data-pid="${esc(petitionerId)}" data-name="${esc(clean)}">${esc(clean)}</button>`;
}

// Attach name-link handlers (call after rendering any screen with names)
function attachNameLinks(app, root) {
  root.querySelectorAll('.name-link').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showInspector(app, btn.dataset.pid, btn.dataset.name || 'The petitioner');
    });
  });
}

/* ---------------- dispositions (Phase 2) ---------------- */
function dispDots(v) {
  v = Math.max(1, Math.min(5, v || 3));
  return '●'.repeat(v) + '○'.repeat(5 - v);
}
/** Compact voyage-relevant traits for cards and lists. */
function dispLine(app, petitionerId) {
  const d = app.Engine.ensureDisposition(app.state, petitionerId);
  const t = (id) => {
    const tr = Dispositions.TRAITS.find((x) => x.id === id);
    return `${tr.name} ${dispDots(d.current[id])}`;
  };
  return `${t('zeal')} · ${t('prudence')}`;
}
function gradeChip(app, petitionerId) {
  // Vows stage takes precedence: shows the man's actual rank in the formation system.
  const entry = (app.state.europeanLabor || []).find((e) => e.petitionerId === petitionerId);
  if (entry && entry.vows && entry.vows.stage) {
    const stageLabels = { novice: 'Novice', scholastic: 'Scholastic', brother: 'Brother', ordained: 'Ordained scholastic', coadjutor: 'Spiritual coadjutor', professed: 'Professed' };
    const label = stageLabels[entry.vows.stage] || entry.vows.stage;
    const suffix = app.Engine.rankSuffix ? app.Engine.rankSuffix(app.state, petitionerId) : '';
    // Distinguish novice vocation tracks: brother-track vs scholastic-track.
    let trackNote = '';
    if (entry.vows.stage === 'novice' && app.Engine.vowsTrackFor) {
      const track = app.Engine.vowsTrackFor(app.state, petitionerId);
      if (track === 'brother') trackNote = ' (brother track)';
    }
    return `<span class="grade-chip" title="Formation rank">${esc(label)}${esc(trackNote)} ${esc(suffix)}</span>`;
  }
  const g = app.Engine.gradeFor(app.state, petitionerId);
  const ord = g.ordained === true ? 'ordained priest'
    : g.ordained === false ? 'not ordained' : 'ordination not specified in the source';
  return `<span class="grade-chip" title="${esc(ord)}">${esc(Dispositions.gradeLabel(g.grade))}</span>`;
}
/** Formation & Mission history panel for one man (read-only). */
export function historyPanelHTML(app, petitionerId) {
  if (!app.Engine.personHistory) return '<p class="insp-noev">History unavailable.</p>';
  const h = app.Engine.personHistory(app.state, petitionerId);
  const sm = h.summary;
  const yrs = (n) => `${n} ${n === 1 ? 'year' : 'years'}`;
  // Backwards math: true entry year = 1615 - years in Society
  const trueEntryYear = sm.totalYearsInSociety > 0 ? 1615 - sm.totalYearsInSociety : sm.entryYear;
  const summary = `<p class="hist-summary">${esc(yrs(sm.totalYearsInSociety))} in the Society · age in religion ${esc(String(sm.ageInReligion))}` +
    `${sm.paused ? ' <em>(paused: deferred)</em>' : ''}${sm.pausedYears ? ` · ${esc(yrs(sm.pausedYears))} paused by deferral` : ''}` +
    `${trueEntryYear != null ? ` · in the Society since ${esc(String(trueEntryYear))}` : ''}<br>Now: ${esc(sm.location)}</p>`;
  const list = (kind) => {
    const evs = h.events.filter((e) => e.kind === kind);
    if (!evs.length) return '<p class="insp-noev">Nothing recorded yet.</p>';
    return `<ol class="hist-list">${evs.map((e) =>
      `<li><span class="hist-year">${esc(String(e.year))}</span> <span class="hist-ev">${esc(e.label || e.event)}</span>` +
      `${e.destinationName ? ` <span class="hist-loc">· ${esc(e.destinationName)}</span>` : ''}` +
      `${e.text ? `<br><span class="hist-text">${esc(e.text)}</span>` : ''}</li>`).join('')}</ol>`;
  };
  return `${summary}<h3 class="sect">Formation</h3>${list('formation')}<h3 class="sect">Mission</h3>${list('mission')}`;
}

/**
 * The man's indipetae letter, shown ONLY inside the inspector (Tran
 * 2026-10-19): cards stay compact; the full letter is read by inspecting.
 */
function letterSectionHTML(app, petitionerId) {
  const cards = (app.state.currentTerna && app.state.currentTerna.cards) || [];
  const c = cards.find((x) => x.id === petitionerId);
  if (!c || !c.letter) return '';
  const L = c.letter;
  return `<h3 class="sect">His letter</h3>
    <p class="letter-meta">${esc(L.place || '')}, ${esc(L.date || '')}<br>
      <span class="archival">${esc(L.archival || '')}</span></p>
    <p>${kindBadge(L.kind)}</p>
    <div class="letter-text">${(L.full_paras || []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
    <p class="letter-dossier">${esc(c.dossier || '')}</p>`;
}

/** Four-layer inspector: evidence / seeded initial / current / observed. */
export function showInspector(app, petitionerId, name) {
  const d = app.Engine.ensureDisposition(app.state, petitionerId);
  const g = app.Engine.gradeFor(app.state, petitionerId);
  const ordNote = g.ordained === true ? 'Ordained priest.'
    : g.ordained === false ? 'Not ordained.'
    : 'Ordination not specified in the source.';
  const attested = Dispositions.TRAITS.filter((t) => d.evidence[t.id]);
  const unattested = Dispositions.TRAITS.filter((t) => !d.evidence[t.id]);
  const rows = Dispositions.TRAITS.map((t) => {
    const init = d.initial[t.id], cur = d.current[t.id];
    const diff = cur - init;
    const bubble = diff > 0 ? `<span class="trait-bubble up">+${diff}</span>`
      : diff < 0 ? `<span class="trait-bubble down">${diff}</span>` : '';
    return `<div class="insp-row">
      <span class="insp-tname" title="${esc(t.blurb)}">${esc(t.name)}${bubble}</span>
      <span class="insp-scale"><span class="insp-lab">at first</span> ${dispDots(init)} <span class="insp-word">${esc(Dispositions.traitLabel(init))}</span></span>
      <span class="insp-scale"><span class="insp-lab">now</span> ${dispDots(cur)} <span class="insp-word">${esc(Dispositions.traitLabel(cur))}</span></span>
    </div>`;
  }).join('');
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
  <div class="overlay-card inspector" role="dialog" aria-modal="true" aria-label="Disposition of ${esc(name)}">
    <button class="overlay-close" aria-label="Close">✕</button>
    <h2 class="px">${esc(name)}</h2>
    <p class="insp-grade">${gradeChip(app, petitionerId)} <span class="insp-ord">${esc(ordNote)}</span></p>
    ${letterSectionHTML(app, petitionerId)}
    <div class="insp-actions">
      ${app.Engine.ordinationEligible(app.state, petitionerId) ? `<button class="gbtn small" id="insp-ordain">Ordain to priesthood</button>` : ''}
      <label class="form-pick">Formation focus:
        <select id="insp-form-focus">
          ${Dispositions.FORMATIONS.map((f) => `<option value="${f.id}" title="${esc(f.blurb)}">${esc(f.name)}</option>`).join('')}
        </select></label>
      <button class="gbtn small" id="insp-formation">Assign formation</button>
    </div>
    <div class="insp-tabs" role="tablist">
      <button class="insp-tab active" role="tab" aria-selected="true" data-tab="disp">Disposition</button>
      <button class="insp-tab" role="tab" aria-selected="false" data-tab="hist">Formation &amp; Mission history</button>
    </div>
    <div class="insp-pane" data-pane="hist" role="tabpanel" hidden>${historyPanelHTML(app, petitionerId)}</div>
    <div class="insp-pane" data-pane="disp" role="tabpanel">
    <h3 class="sect">What his letters attest</h3>
    ${attested.length ? `<ul class="insp-evlist">${attested.map((t) => {
      const ev = d.evidence[t.id];
      return `<li><strong>${esc(t.name)}:</strong> “${esc(ev.quote)}” <em>(Letter ${ev.letter})</em></li>`;
    }).join('')}</ul>` : `<p class="insp-noev">His letters attest no trait directly.</p>`}
    ${unattested.length ? `<p class="insp-noev">Not attested in his letters: ${unattested.map((t) => esc(t.name.toLowerCase())).join(', ')} — uncertainty, not deficiency.</p>` : ''}
    <h3 class="sect">Disposition</h3>
    <div class="insp-traits">${rows}</div>
    <h3 class="sect">Observed</h3>
    ${d.observed.length ? `<ul class="insp-obs">${d.observed.map((o) => `<li>${esc(o.text)}</li>`).join('')}</ul>`
      : `<p class="insp-noev">Nothing observed yet.</p>`}
    <p class="insp-foot">Evidence is documentary; initial disposition is seeded; the rest is the game's imagining — formation changes what is present without rewriting what was attested.</p>
    </div>
  </div>`;
  ov.querySelectorAll('.insp-tab').forEach((tb) => tb.addEventListener('click', () => {
    ov.querySelectorAll('.insp-tab').forEach((x) => {
      const on = x === tb;
      x.classList.toggle('active', on);
      x.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ov.querySelectorAll('.insp-pane').forEach((pn) => { pn.hidden = pn.dataset.pane !== tb.dataset.tab; });
    app.sound('page');
  }));
  const ordBtn = ov.querySelector('#insp-ordain');
  if (ordBtn) {
    ordBtn.addEventListener('click', () => {
      try {
        if (!confirm(`Ordain ${name} to the priesthood? This is irreversible.`)) return;
        app.Engine.ordainPriest(app.state, petitionerId);
        app.save();
        app.sound('coin');
        ov.remove();
        showInspector(app, petitionerId, name); // refresh
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  }
  const formBtn = ov.querySelector('#insp-formation');
  if (formBtn) {
    formBtn.addEventListener('click', () => {
      try {
        const sel = ov.querySelector('#insp-form-focus');
        const focusId = sel ? sel.value : 'exercises';
        app.Engine.assignFormation(app.state, petitionerId, focusId);
        app.save();
        app.sound('coin');
        ov.remove();
        showInspector(app, petitionerId, name); // refresh
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  }
  ov.querySelector('.overlay-close').addEventListener('click', () => { app.sound('page'); ov.remove(); });
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  app.sound('page');
}

function destName(app, id) {
  const d = app.destInfo(id);
  return d ? d.name : id;
}


/* ---------------- provincial draft (pre-game) ---------------- */
export function renderDraft(app, root) {
  const draft = app.state.draft;
  if (!draft || draft.done || draft.skipped) { app.go('briefing'); return; }
  const E = app.Engine;
  const picked = Object.keys(draft.picks).length;
  const hqs = app.state.provinceHQs || {};
  const hqPicked = Object.keys(hqs).length;
  const dests = E.openDestinations(app.state);
  const destName = (id) => (dests.find((d) => d.id === id) || {}).name || id;

  const candCard = (region, c) => {
    const sel = draft.picks[region.id] === c.id;
    return `
      <article class="pcard draft-cand${sel ? ' approved-pick' : ''}" data-region="${esc(region.id)}" data-id="${esc(c.id)}" tabindex="0" role="button" aria-pressed="${sel}">
        <h3 class="pcard-name">${nameLink(app, c.id, c.name)}</h3>
        <p class="pcard-meta">${c.age} years old &middot; ${c.yearsInSociety} years in the Society</p>
        <ul class="draft-traits">
          ${Dispositions.TRAITS.map((t) => {
            const v = Math.max(1, Math.min(5, c.traits[t.id] || 3));
            return `<li><span class="insp-dots" aria-label="${v} of 5">${dispDots(v)}</span> <strong>${esc(t.name)}</strong></li>`;
          }).join('')}
        </ul>
        <p class="draft-note">${esc(c.note)}</p>
        ${sel ? '<p class="team-tag">named provincial</p>' : ''}
      </article>`;
  };

  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">THE GENERAL TAKES OFFICE &middot; ANNO ${app.state.year}</p>
    <p class="desk-instr">Before the first indipetae are read, name your provincials &mdash; one for each of the Generalate&apos;s four strategic jurisdictions. Four ternas of candidates await your choice (${picked} of 4 named).</p>
    ${draft.regions.map((region) => `
      <h2 class="px draft-region">${esc(region.name)}</h2>
      <div class="desk draft-terna">
        ${region.candidates.map((c) => candCard(region, c)).join('')}
      </div>`).join('')}
    <h2 class="px draft-region">PROVINCE HEADQUARTERS</h2>
    <p class="desk-instr">Name the city where each provincial will reside during his reign.</p>
    ${E.PROVINCIAL_REGIONS.map((r) => r.id === 'europe' ? `
      <p><span class="dest-redirect">${esc(r.name)} HQ: <strong>Rome</strong></span></p>` : `
      <p><label class="dest-redirect">${esc(r.name)} HQ:
        <select data-hq="${esc(r.id)}" aria-label="HQ for ${esc(r.name)}">
          <option value="">— choose —</option>
          ${E.hqOptionsForRegion(app.state, r.id).map((d) => `<option value="${esc(d.id)}"${hqs[r.id] === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
        </select>
      </label></p>`).join('')}
    <div class="btn-row">
      <button class="gbtn primary" id="take-office" ${picked === 4 && hqPicked === 4 ? '' : 'disabled'}>Seal the decision</button>
    </div>
  </section>`;

  root.querySelectorAll('.draft-cand').forEach((el) => {
    const pick = () => {
      try { E.chooseProvincial(app.state, el.dataset.region, el.dataset.id); app.sound('seal'); }
      catch (e) { app.sound('error'); return; }
      app.save();
      renderDraft(app, root);
    };
    el.addEventListener('click', pick);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  root.querySelectorAll('select[data-hq]').forEach((sel) => {
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      try { E.chooseProvinceHQ(app.state, sel.dataset.hq, sel.value); app.sound('seal'); }
      catch (e) { app.sound('error'); return; }
      app.save();
      renderDraft(app, root);
    });
  });
  const take = root.querySelector('#take-office');
  if (take) {
    // Enable if draft is done, regardless of count variables
    if (app.state.draft && app.state.draft.done) take.disabled = false;
    take.addEventListener('click', () => {
      if (take.disabled) return;
      app.sound('seal');
      try {
        playSealAnimation(app, () => app.go('briefing'));
      } catch (e) {
        app.go('briefing');
      }
    });
  }
}

/**
 * The sealing: fade to black, the IHS Christogram, the globe, then the game.
 * Tap to skip.
 */
export function playSealAnimation(app, done) {
  try {
    const ov = document.createElement('div');
    ov.className = 'seal-overlay';
    ov.innerHTML = `
      <div class="seal-stage">
        <div class="seal-ihs">
          <div class="seal-cross">†</div>
          <div class="seal-letters">IHS</div>
          <div class="seal-nails"><span></span><span></span><span></span></div>
        </div>
        <div class="seal-globe">🌍</div>
        <div class="seal-caption px">AD MAJOREM DEI GLORIAM</div>
      </div>`;
    const host = document.getElementById('generalate-app') || document.body;
    host.appendChild(ov);
    // force reflow so the fade-in transition runs
    void ov.offsetWidth;
    // next frame: start the fade
    requestAnimationFrame(() => ov.classList.add('on'));

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { ov.classList.add('out'); } catch (e) {}
      setTimeout(() => { try { ov.remove(); } catch (e) {} done(); }, 900);
    };
    ov.addEventListener('click', finish);

    // staged reveals
    setTimeout(() => { try { ov.classList.add('show-ihs'); } catch (e) {} }, 900);
    setTimeout(() => { try { ov.classList.add('show-globe'); } catch (e) {} }, 2600);
    setTimeout(() => { try { ov.classList.add('show-caption'); } catch (e) {} }, 3400);
    setTimeout(finish, 5200);
    // absolute fallback: never trap the player
    setTimeout(finish, 8000);
  } catch (e) {
    done();
  }
}

/* ---------------- title ---------------- */
export function renderTitle(app, root) {
  root.innerHTML = `
  <section class="gscreen title-screen">
    <div class="title-seal" aria-hidden="true">✠</div>
    <h1 class="game-title px">GENERALATE</h1>
    <p class="game-sub">You are the Superior General of the Society of Jesus.<br>
    Every year, three petitioners beg to be sent to the missions.<br>
    Approve any, deny the rest. The sea will judge the rest.</p>
    <div class="seed-row">
      <label for="seed">Seed</label>
      <input id="seed" class="seed-input" value="${esc(app.ui.seed)}" spellcheck="false" autocomplete="off">
      <button class="gbtn small" id="reseed" title="Randomize seed">⚄</button>
    </div>
    <div class="title-buttons">
      <button class="gbtn primary" id="new-campaign">New Historical Campaign</button>
      <button class="gbtn primary" id="new-endless">New Endless Generalate</button>
      ${app.hasSave() ? `<button class="gbtn" id="continue">Continue — anno ${esc(app.saveMeta().year || '')}</button>` : ''}
      <button class="gbtn ghost" id="howto">How to Play</button>
    </div>
    <p class="title-note">Campaign: 1615–1645, the generalate of Mutio Vitelleschi.<br>
    Letters are abridged from the real <em>indipetae</em>; fictional letters are labeled as such.</p>
    ${app.ui.notice ? `<p class="title-error" role="alert">${esc(app.ui.notice)}</p>` : ''}
  </section>`;

  root.querySelector('#reseed').addEventListener('click', () => {
    app.ui.seed = String(Math.floor(Math.random() * 900000) + 100000);
    root.querySelector('#seed').value = app.ui.seed;
    app.sound('tick');
  });
  const seedVal = () => root.querySelector('#seed').value.trim() || String(Date.now());
  const newGame = (mode) => {
    const start = () => { app.ui.seed = seedVal(); app.newGame(mode, app.ui.seed); };
    if (app.hasSave()) app.confirmOverwrite(start); else start();
  };
  root.querySelector('#new-campaign').addEventListener('click', () => newGame('campaign'));
  root.querySelector('#new-endless').addEventListener('click', () => newGame('endless'));
  const c = root.querySelector('#continue');
  if (c) c.addEventListener('click', () => app.continueGame());
  root.querySelector('#howto').addEventListener('click', () => showHowTo(app));
}

/* ---------------- how to play ---------------- */
export function showHowTo(app) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
  <div class="overlay-card howto" role="dialog" aria-modal="true" aria-label="How to play">
    <button class="overlay-close" aria-label="Close">✕</button>
    <h2 class="px">HOW TO PLAY</h2>
    <div class="howto-body">
      <p><strong>1. The briefing.</strong> Each year opens with the state of the Society: funds, free berths, ships, news from the missions, and rumors of what is coming.</p>
      <p><strong>2. The indipetae.</strong> Ten petitioners lay their letters on your desk. The card shows the man; tap his name to read the full letter and his dossier. No choice is marked; the weight is yours.</p>
      <p><strong>3. The decision.</strong> Select one petitioner, review your choice, and confirm. The seal falls: <em>APPROVED</em> on one, <em>DENIED</em> on two.</p>
      <p><strong>4. The year turns.</strong> Your chosen man sails. Storms, war, plague, and politics decide what your seal began. The ledger records everything.</p>
      <p><strong>5. The account.</strong> Your SCORE starts at 50. You are judged by fruit, not dispatches: score moves when voyage news arrives and through lasting foundations. Approvals cost nothing; men cost when they sail. Campaign ends in 1645; in Endless mode, you lay down the office when you choose.</p>

    </div>
  </div>`;
  ov.querySelector('.overlay-close').addEventListener('click', () => { app.sound('page'); ov.remove(); });
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  app.sound('page');
}

/* ---------------- briefing ---------------- */
/**
 * General's Desk: decisions requiring the General's judgment.
 * Three categories: decision required, action available, status update.
 */
function generalDeskHTML(app, year) {
  const E = app.Engine;
  const items = [];
  
  // 1. Terna awaiting judgment (decision required)
  if (app.state.currentTerna) {
    const n = (app.state.currentTerna.cards || []).length;
    items.push({ cat: 'required', text: `Indipetae of ${n} petitioners await your judgment.`,
      action: '<button class="gbtn small primary desk-terna">Judge the indipetae →</button>' });
  }
  
  // 1b. Provincials whose term is complete (action available)
  const termDone = (E.PROVINCIAL_REGIONS || []).filter((r) => {
    try {
      const p = app.state.provincials && app.state.provincials[r.id];
      return p && (p.vacant || E.provincialTermComplete(app.state, r.id));
    } catch { return false; }
  });
  if (termDone.length) {
    items.push({ cat: 'available',
      text: `${termDone.length} provincial see${termDone.length === 1 ? ' needs' : 's need'} attention: ${termDone.map((r) => esc(r.name)).join(', ')}.`,
      action: '<button class="gbtn small ghost desk-governance">Name successors →</button>' });
  }

  // 2. Ordination eligible (action available)
  const eligible = (app.state.europeanLabor || []).filter(e => {
    try { return E.ordinationEligible && E.ordinationEligible(app.state, e.petitionerId); }
    catch { return false; }
  });
  if (eligible.length) {
    items.push({ cat: 'available',
      text: `${eligible.length} scholastic${eligible.length === 1 ? ' is' : 's are'} eligible for ordination: ${eligible.slice(0,3).map(e => esc(e.name)).join(', ')}${eligible.length > 3 ? '…' : ''}.`,
      action: '<button class="gbtn small ghost desk-house">Review in House →</button>' });
  }
  
  // 3. Instructions in transit (status update)
  const inTransit = Object.entries(app.state.instructions || {}).filter(([_, i]) => i.status === 'in-transit');
  if (inTransit.length) {
    items.push({ cat: 'status',
      text: `${inTransit.length} instruction${inTransit.length === 1 ? '' : 's'} in transit.` });
  }
  
  // 4. Men in formation (status update)
  const inForm = (app.state.europeanLabor || []).filter(e => e.formation && e.formation.until > year);
  if (inForm.length) {
    items.push({ cat: 'status',
      text: `${inForm.length} man${inForm.length === 1 ? ' is' : ' are'} in formation.` });
  }
  
  // 5. Fragile missions (action available - informational)
  const fragile = Object.keys(app.state.missions || {}).filter(id => {
    try { return E.missionStaff(app.state, id).fragile === true; } catch { return false; }
  });
  if (fragile.length) {
    items.push({ cat: 'available',
      text: `${fragile.length} mission${fragile.length === 1 ? ' is' : 's are'} FRAGILE (institutional presence at risk): ${fragile.slice(0,3).map(id => { const d = (E.DESTINATIONS || {})[id]; return esc(d ? d.name || id : id); }).join(', ')}${fragile.length > 3 ? '…' : ''}.`,
      action: '<button class="gbtn small ghost desk-missions">View missions →</button>' });
  }
  
  if (!items.length) return '';
  
  const catLabel = { required: 'Decision required', available: 'Action available', status: 'Status update' };
  const catClass = { required: 'desk-required', available: 'desk-available', status: 'desk-status' };
  return `<div class="general-desk">
    <h3 class="sect">General's Desk — Decisions awaiting judgment</h3>
    <ul class="desk-list">${items.map(it => `
      <li class="desk-item ${catClass[it.cat]}">
        <span class="desk-cat">${catLabel[it.cat]}</span>
        <span class="desk-text">${it.text}</span>
        ${it.action || ''}
      </li>`).join('')}</ul>
  </div>`;
}

export function renderBriefing(app, root, start) {
  const b = start.briefing;
  const openDests = Object.entries(app.Engine.DESTINATIONS)
    .filter(([did]) => {
      const st = app.state.destState[did];
      return (!st || st.access !== 'closed') && !(b.novitiates || []).some(n => n.destination === did);
    })
    .map(([did, d]) => ({ id: did, name: d.name || did }));
  const euroCount = (app.state.europeanLabor || []).length;
  const requests = (b.missionRequests || []).filter(r => {
    const st = app.state.destState[r.destId];
    return !st || st.access !== 'closed';
  });
  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">BRIEFING</p>
    <h2 class="year-head px">ANNO ${start.year}</h2>
    <div class="brief-grid">
      <div class="brief-stat"><span class="bs-num">${(app.state.society || 0).toLocaleString('en-US')}</span><span class="bs-label">Jesuits in the Society</span></div>
    </div>
    ${generalDeskHTML(app, start.year)}
    ${euroCount ? `
    <p class="howto-note">🕯️ ${euroCount} ${euroCount === 1 ? 'man labors' : 'men labor'} in Europe — denied at your desk or returned from the sea. Visit the <button class="linklike" id="brief-to-house">House of Formation</button> to form them or send them to the missions.</p>` : ''}
    ${(app.state.zealUntil || 0) >= start.year ? `
    <p class="howto-note">🔥 Zeal for the missions burns — a veteran's testimony aids every voyage (+1) through ${app.state.zealUntil}.</p>` : ''}
    ${requests.length ? `
    <h3 class="sect">Mission alerts</h3>
    <ul class="news-list">${requests.slice(0, 4).map(r => {
      const st = app.state.destState[r.destId];
      const isFragile = st && st.fragile;
      const alertText = isFragile
        ? `⚠️ <strong>${esc(r.name)}</strong> is fragile (${r.staffed}/${r.capacity})`
        : `⚠️ <strong>${esc(r.name)}</strong> is understaffed (${r.staffed}/${r.capacity})`;
      return `<li>${alertText}</li>`;
    }).join('')}</ul>
    ${requests.length > 4 ? `<p class="howto-note">…and ${requests.length - 4} more. See the Missions tab.</p>` : ''}` : ''}
    ${(b.novitiates && b.novitiates.length) ? `
    <h3 class="sect">Novitiates</h3>
    <ul class="news-list">${b.novitiates.map(n => `<li>⛪ A novitiate stands at ${esc(n.name)} (founded ${n.foundedYear}); the mission is steadied.</li>`).join('')}</ul>` : ''}
    <h3 class="sect">Mission news</h3>
    <ul class="news-list">${b.missionNews.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    ${b.eventsUpcoming.length ? `
    <h3 class="sect">Rumors of what is coming</h3>
    <ul class="news-list rumors">${b.eventsUpcoming.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <div class="btn-row">
      <button class="gbtn" id="expand-berths" data-energy="1">Commission +1 berth (400 scudi)</button>
      <label class="dest-redirect">Charter:
        <select id="charter-tier" aria-label="Ship tier">
          <option value="caravel">Caravel — range 1, 4 men, 150 scudi</option>
          <option value="carrack" selected>Carrack — range 2, 8 men, 300 scudi</option>
          <option value="galleon">Galleon — range 3, 12 men, 600 scudi</option>
        </select>
        <button class="gbtn" id="charter-ship" data-energy="1">Charter</button>
      </label>
      <button class="gbtn" id="exhort-missions" data-energy="1">Exhort the missions (+1 voyage rolls this year)</button>
      <label class="dest-redirect">Novitiate at:
        <select id="novitiate-dest" aria-label="Novitiate destination">
          ${openDests.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}
        </select>
      </label>
      <button class="gbtn" id="found-novitiate" ${openDests.length ? '' : 'disabled'}>Found a novitiate (800 scudi)</button>
      <button class="gbtn primary" id="to-desk">Receive the indipetae →</button>
    </div>
    ${app.state.currentYear && app.state.currentYear.decided ? `
    <div class="btn-row"><button class="gbtn primary" id="close-year">Close the year →</button></div>
    <p class="howto-note">The indipetae are sealed. Close the year when your other duties are done — pending reports carry over.</p>` : ''}
  </section>`;
  root.querySelector('#to-desk').addEventListener('click', () => { app.sound('page'); app.go('desk'); });
  const closeYear = root.querySelector('#close-year');
  if (closeYear) closeYear.addEventListener('click', () => app.closeYear());
  const toHouse = root.querySelector('#brief-to-house');
  if (toHouse) toHouse.addEventListener('click', () => { app.sound('page'); app.go('house'); });
  // General's Desk navigation
  root.querySelectorAll('.desk-terna').forEach(btn => {
    btn.addEventListener('click', () => { app.sound('page'); app.go('desk'); });
  });
  root.querySelectorAll('.desk-house').forEach(btn => {
    btn.addEventListener('click', () => { app.sound('page'); app.go('house'); });
  });
  root.querySelectorAll('.desk-missions').forEach(btn => {
    btn.addEventListener('click', () => { app.sound('page'); app.go('missions'); });
  });
  root.querySelectorAll('.desk-governance').forEach(btn => {
    btn.addEventListener('click', () => { app.sound('page'); app.go('governance'); });
  });
  root.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => { app.sound('page'); app.go(btn.dataset.goto); });
  });
  root.querySelectorAll('.inspect-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      app.save();
      showInspector(app, btn.dataset.id, btn.dataset.name || 'The petitioner');
    });
  });
  root.querySelector('#exhort-missions').addEventListener('click', () => {
    try {
      app.Engine.exhortMissions(app.state);
      app.Engine.refreshBriefing(app.state);
      app.save();
      app.sound('coin');
      app.go('briefing');
    } catch (e) {
      app.sound('error');
      app.toast(e.message);
    }
  });
  root.querySelector('#expand-berths').addEventListener('click', () => {
    try {
      app.Engine.expandBerths(app.state);
      app.Engine.refreshBriefing(app.state);
      app.save();
      app.sound('coin');
      // Refresh the briefing display
      app.go('briefing');
    } catch (e) {
      app.sound('error');
      alert(e.message);
    }
  });
  root.querySelector('#charter-ship').addEventListener('click', () => {
    try {
      const tier = root.querySelector('#charter-tier')?.value || 'carrack';
      app.Engine.charterShip(app.state, tier);
      app.Engine.refreshBriefing(app.state);
      app.save();
      app.sound('coin');
      app.go('briefing');
    } catch (e) {
      app.sound('error');
      alert(e.message);
    }
  });
  root.querySelector('#found-novitiate').addEventListener('click', () => {
    try {
      const destId = root.querySelector('#novitiate-dest').value;
      app.Engine.foundNovitiate(app.state, destId);
      app.Engine.refreshBriefing(app.state);
      app.save();
      app.sound('coin');
      app.go('briefing');
    } catch (e) {
      app.sound('error');
      alert(e.message);
    }
  });
}

/* ---------------- house of formation ---------------- */

/** Men laboring in Europe who may receive a year of formation. */
function formationListHTML(app, year) {
  // Formation tab: show men in formation or available (not those with domestic assignments)
  const list = (app.state.europeanLabor || []).filter(e => !e.assignment);
  if (!list.length) {
    return `<p class="howto-note">No men labor in Europe yet. Those you deny at the desk, and those who return from the sea, will gather here — and a year of formation can deepen them before they are sent.</p>`;
  }
  const roles = DOMESTIC_ROLES;
  const roleOpts = Object.values(roles).map(r =>
    `<option value="${r.id}" title="${esc(r.desc)}">${esc(r.name)} — ${esc(r.requires)}</option>`).join('');
  return `<ul class="formation-list">${list.map((e) => {
    const inForm = e.formation && e.formation.until > year;
    const fName = inForm ? (Dispositions.formationById(e.formation.focus) || {}).name : null;
    const asg = e.assignment ? roles[e.assignment] : null;
    const stage = app.Engine.careerStage ? app.Engine.careerStage(app.state, e.petitionerId) : '';
    const ordElig = app.Engine.ordinationEligible ? app.Engine.ordinationEligible(app.state, e.petitionerId) : false;
    const reserveTag = e.reservedFor ? `<span class="disp-mini reserve-badge" title="Reserved for ${esc(e.reservedForName || e.reservedFor)}">reserved: ${esc(e.reservedForName || e.reservedFor)}</span>` : '';
    return `<li class="formation-row">
      <strong>${esc(e.name)}</strong> ${gradeChip(app, e.petitionerId)}
      <span class="form-via">${esc(e.via)} ${e.year}</span>
      ${reserveTag}
      ${e.ill ? `<span class="disp-mini ill-badge" title="Recovering from illness suffered on voyage. Not available for assignment.">🤒 recovering (ill ${e.illYear})</span>` : ''}
      ${stage ? `<span class="disp-mini">${esc(stage)}</span>` : ''}
      <span class="disp-mini">${dispLine(app, e.petitionerId)}</span>
      ${e.ill ? `<span class="disp-mini">No actions available while recovering.</span>`
      : asg ? `<span class="form-active">Assigned: ${esc(asg.name)} (since ${e.assignedYear || year})</span>
        <button class="gbtn small ghost domestic-release" data-id="${esc(e.petitionerId)}">Release</button>`
      : inForm ? `<span class="form-active">In formation: ${esc(fName)} until ${e.formation.until}</span>`
        : `<label class="form-pick">Send to dock for:
          <select class="europe-dest" data-id="${esc(e.petitionerId)}" aria-label="Destination for ${esc(e.name)}">
            ${(app.Engine.DESTINATIONS ? Object.values(app.Engine.DESTINATIONS) : []).filter(d => d && d.id && (app.state.destState[d.id] || {}).access !== 'closed').map(d => `<option value="${d.id}">${esc(d.name || d.id)}</option>`).join('')}
          </select></label>
        <button class="gbtn small primary europe-todock" data-id="${esc(e.petitionerId)}" title="He waits at the dock and sails on the fleet — every man travels by ship.">Send to dock</button><br>
        <label class="form-pick">Domestic:
          <select class="domestic-role" data-id="${esc(e.petitionerId)}" aria-label="Domestic assignment for ${esc(e.name)}">
            <option value="">— available —</option>${roleOpts}
          </select></label>
          <button class="gbtn small domestic-assign" data-id="${esc(e.petitionerId)}">Assign</button>

        `}
      <button class="gbtn small ghost inspect-btn" data-id="${esc(e.petitionerId)}" data-name="${esc(e.name)}">Inspect</button>
    </li>`;
  }).join('')}</ul>`;
}

export function renderUnassigned(app, root) {
  const year = app.state.currentYear ? app.state.currentYear.year : app.state.year;
  const list = (app.state.europeanLabor || []).filter((e) =>
    !e.assignment && !(e.formation && e.formation.until > year) && !e.reservedFor && !e.ill);
  const roles = DOMESTIC_ROLES;
  const roleOpts = Object.values(roles).map(r =>
    `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  const destOpts = (app.Engine.DESTINATIONS ? Object.values(app.Engine.DESTINATIONS) : [])
    .filter(d => d && d.id && (app.state.destState[d.id] || {}).access !== 'closed')
    .map(d => `<option value="${d.id}">${esc(d.name || d.id)}</option>`).join('');
  const formOpts = (app.Engine.DISPOSITIONS ? Object.values(app.Engine.DISPOSITIONS) : [])
    .map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">UNASSIGNED MEN</p>
    <h2 class="year-head px">ANNO ${year}</h2>
    <p class="howto-note">Men in Europe with no posting. Send them to formation, give them domestic work, or reserve them for a foreign mission.</p>
    <ul class="formation-list">${list.map((e) => `
      <li class="formation-row">
        <strong>${esc(e.name)}</strong> ${gradeChip(app, e.petitionerId)}
        <span class="disp-mini">${dispLine(app, e.petitionerId)}</span>
        <div class="unassigned-actions">
          <label class="form-pick">Formation:
            <select class="unassigned-form-focus" data-id="${esc(e.petitionerId)}">${formOpts}</select></label>
          <button class="gbtn small ghost unassigned-to-formation" data-id="${esc(e.petitionerId)}">To Formation</button>
          <label class="form-pick">Domestic:
            <select class="unassigned-domestic-role" data-id="${esc(e.petitionerId)}">
              <option value="">— choose —</option>${roleOpts}
            </select></label>
          <button class="gbtn small ghost unassigned-to-domestic" data-id="${esc(e.petitionerId)}">To Domestic</button>
          <label class="form-pick">Reserve for:
            <select class="unassigned-reserve-dest" data-id="${esc(e.petitionerId)}">
              <option value="">— choose —</option>${destOpts}
            </select></label>
          <button class="gbtn small ghost unassigned-to-reserve" data-id="${esc(e.petitionerId)}">Reserve</button>
        </div>
        <button class="gbtn small ghost inspect-btn" data-id="${esc(e.petitionerId)}" data-name="${esc(e.name)}">Inspect</button>
      </li>`).join('') || '<p class="disp-mini">No unassigned men. All are posted.</p>'}</ul>
    <div class="btn-row">
      <button class="gbtn ghost" id="unassigned-back">← Back</button>
    </div>
  </section>`;
  root.querySelectorAll('.unassigned-to-formation').forEach(btn => {
    btn.addEventListener('click', () => {
      const sel = root.querySelector(`.unassigned-form-focus[data-id="${btn.dataset.id}"]`);
      try {
        app.Engine.assignFormation(app.state, btn.dataset.id, sel ? sel.value : 'exercises');
        app.save(); app.go('unassigned');
      } catch (e) { alert(e.message); }
    });
  });
  root.querySelectorAll('.unassigned-to-domestic').forEach(btn => {
    btn.addEventListener('click', () => {
      const sel = root.querySelector(`.unassigned-domestic-role[data-id="${btn.dataset.id}"]`);
      const roleId = sel ? sel.value : '';
      if (!roleId) { app.toast('Choose a domestic role first.'); return; }
      try {
        app.Engine.assignDomestic(app.state, btn.dataset.id, roleId);
        app.save(); app.go('unassigned');
      } catch (e) { alert(e.message); }
    });
  });
  root.querySelectorAll('.unassigned-to-reserve').forEach(btn => {
    btn.addEventListener('click', () => {
      const sel = root.querySelector(`.unassigned-reserve-dest[data-id="${btn.dataset.id}"]`);
      const destId = sel ? sel.value : '';
      if (!destId) { app.toast('Choose a mission first.'); return; }
      try {
        app.Engine.reserveForMission(app.state, btn.dataset.id, destId);
        app.save(); app.go('unassigned');
      } catch (e) { alert(e.message); }
    });
  });
  root.querySelectorAll('.inspect-btn').forEach(btn => {
    btn.addEventListener('click', () => app.showInspector(btn.dataset.id));
  });
  const back = root.querySelector('#unassigned-back');
  if (back) back.addEventListener('click', () => app.go('briefing'));
}

export function renderDomesticMissions(app, root) {
  const year = app.state.currentYear ? app.state.currentYear.year : app.state.year;
  const list = (app.state.europeanLabor || []).filter(e => e.assignment || (!e.assignment && !e.formation));
  const roles = DOMESTIC_ROLES;
  const roleOpts = Object.values(roles).map(r =>
    `<option value="${r.id}" title="${esc(r.desc)}">${esc(r.name)} — ${esc(r.requires)}</option>`).join('');
  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">DOMESTIC MISSIONS</p>
    <h2 class="year-head px">ANNO ${year}</h2>
    <p class="howto-note">Men laboring in Europe — teaching, preaching, serving in colleges and parishes. Assign them to domestic work, or release them for the missions.</p>
    <ul class="formation-list">${list.map((e) => {
      const asg = e.assignment ? roles[e.assignment] : null;
      const reserveTag = e.reservedFor ? `<span class="disp-mini reserve-badge">reserved: ${esc(e.reservedForName || e.reservedFor)}</span>` : '';
      return `<li class="formation-row">
        <strong>${esc(e.name)}</strong> ${gradeChip(app, e.petitionerId)}
        ${reserveTag}
        ${asg ? `<span class="form-active">Assigned: ${esc(asg.name)} (since ${e.assignedYear || year})</span>
          <button class="gbtn small ghost domestic-release" data-id="${esc(e.petitionerId)}">Release</button>`
        : `<label class="form-pick">Domestic:
            <select class="domestic-role" data-id="${esc(e.petitionerId)}">
              <option value="">— available —</option>${roleOpts}
            </select></label>
            <button class="gbtn small domestic-assign" data-id="${esc(e.petitionerId)}">Assign</button>`}
        <button class="gbtn small ghost inspect-btn" data-id="${esc(e.petitionerId)}" data-name="${esc(e.name)}">Inspect</button>
      </li>`;
    }).join('') || '<p class="disp-mini">No men in domestic missions.</p>'}</ul>
    <div class="btn-row">
      <button class="gbtn ghost" id="domestic-back">← Back</button>
    </div>
  </section>`;
  // Wire domestic assign/release
  root.querySelectorAll('.domestic-assign').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.id;
      const sel = root.querySelector(`.domestic-role[data-id="${pid}"]`);
      const roleId = sel ? sel.value : '';
      if (!roleId) { app.toast('Choose a role first.'); return; }
      try {
        app.Engine.assignDomestic(app.state, pid, roleId);
        app.save(); app.go('domestic');
      } catch (e) { alert(e.message); }
    });
  });
  root.querySelectorAll('.domestic-release').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        app.Engine.unassignDomestic(app.state, btn.dataset.id);
        app.save(); app.go('domestic');
      } catch (e) { alert(e.message); }
    });
  });
  root.querySelectorAll('.inspect-btn').forEach(btn => {
    btn.addEventListener('click', () => app.showInspector(btn.dataset.id));
  });
  const back = root.querySelector('#domestic-back');
  if (back) back.addEventListener('click', () => app.go('briefing'));
}

export function renderHouse(app, root) {
  const year = app.state.currentYear ? app.state.currentYear.year : app.state.year;
  const inForm = (app.state.europeanLabor || []).filter(e => e.formation && e.formation.until > year);
  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">THE HOUSE OF FORMATION</p>
    <h2 class="year-head px">ANNO ${year}</h2>
    <p class="howto-note">Here the men laboring in Europe are formed. From here the General may also send a man to the dock for a chosen mission — he sails on the fleet like everyone else.</p>
    ${inForm.length ? `<p class="howto-note">🕯️ ${inForm.length} ${inForm.length === 1 ? 'man is' : 'men are'} in formation now.</p>` : ''}
    <h3 class="sect">Formation</h3>
    <p class="howto-note">A year of formation (20 scudi) deepens a man's disposition. He must be laboring in Europe and free — no double-booking. A formed man sits out one year's indipetae, then may petition again.</p>
    ${formationListHTML(app, year)}
    <div class="btn-row">
      <button class="gbtn ghost" id="house-back">← Back</button>
    </div>
    ${Playtest.playtestSectionHTML(app)}
  </section>`;
  root.querySelector('#house-back').addEventListener('click', () => {
    app.sound('page');
    app.go(app.ui.houseFrom && app.ui.houseFrom !== 'house' ? app.ui.houseFrom : 'briefing');
  });
  Playtest.attachPlaytestHandlers(app, root);
  root.querySelectorAll('.form-assign').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const sel = root.querySelector(`.form-focus[data-id="${btn.dataset.id}"]`);
        app.Engine.assignFormation(app.state, btn.dataset.id, sel ? sel.value : 'exercises');
        app.Engine.refreshBriefing(app.state);
        app.save();
        app.sound('coin');
        app.go('house');
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  });
  root.querySelectorAll('.domestic-assign').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const sel = root.querySelector(`.domestic-role[data-id="${btn.dataset.id}"]`);
        const role = sel ? sel.value : '';
        if (!role) { alert('Choose a domestic assignment first.'); return; }
        app.Engine.assignDomestic(app.state, btn.dataset.id, role);
        app.Engine.refreshBriefing(app.state);
        app.save();
        app.sound('coin');
        app.go('house');
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  });
  root.querySelectorAll('.domestic-release').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        app.Engine.unassignDomestic(app.state, btn.dataset.id);
        app.Engine.refreshBriefing(app.state);
        app.save();
        app.sound('page');
        app.go('house');
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  });
  root.querySelectorAll('.europe-todock').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const sel = root.querySelector(`.europe-dest[data-id="${btn.dataset.id}"]`);
        const dest = sel ? sel.value : '';
        if (!dest) { alert('Choose a destination first.'); return; }
        const entry = (app.state.europeanLabor || []).find((e) => e.petitionerId === btn.dataset.id);
        if (!entry) { alert('That man is no longer laboring in Europe.'); return; }
        app.Engine.queueLaborMen(app.state, [entry], dest, 'sent from Europe at the General’s order');
        app.Engine.refreshBriefing(app.state);
        app.save();
        app.sound('page');
        app.go('house');
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  });
  root.querySelectorAll('.ordain-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const name = btn.closest('.formation-row')?.querySelector('strong')?.textContent || 'This man';
        if (!confirm(`Ordain ${name} to the priesthood? This is irreversible and makes him eligible for priestly ministry.`)) return;
        app.Engine.ordainPriest(app.state, btn.dataset.id);
        app.Engine.refreshBriefing(app.state);
        app.save();
        app.sound('coin');
        app.go('house');
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  });
  root.querySelectorAll('.inspect-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      app.save();
      showInspector(app, btn.dataset.id, btn.dataset.name || 'The petitioner');
    });
  });
}

/* ---------------- the missions ---------------- */

function missionCardHTML(app, d, year) {
  const E = app.Engine;
  const st = E.missionStaff(app.state, d.id);
  const staffed = E.missionStaffed(st);
  const strength = E.missionStrength(st);
  const bonus = E.missionVoyageBonus(app.state, d.id);
  const upkeep = E.missionUpkeep(st);
  const closed = (app.state.destState[d.id] || {}).access === 'closed';
  const pct = st.capacity > 0 ? Math.min(100, Math.round((staffed / st.capacity) * 100)) : 0;
  const grades = E.MISSION_GRADE_IDS || ['fathers', 'coadjutors', 'brothers'];
  // Six-grade breakdown from staffIds (P, S*, S, F, nS, nF)
  const gradeCounts = { P: 0, 'S*': 0, S: 0, F: 0, nS: 0, nF: 0 };
  for (const pid of (st.staffIds || [])) {
    const dg = E.detailedGradeFor ? E.detailedGradeFor(app.state, pid) : 'F';
    if (gradeCounts.hasOwnProperty(dg)) gradeCounts[dg] += 1;
  }
  const gradeBits = ['P', 'S*', 'S', 'F', 'nS', 'nF'].map((g) => `${g}: ${gradeCounts[g]}`).join(' || ');
  const fragFlag = st.fragile
    ? '<span class="mflag fragile-flag">FRAGILE</span>'
    : (st.fragileYears > 0 ? `<span class="mflag understaffed-flag">understaffed (${st.fragileYears}/3 years)</span>` : '');
  // Mission tier: Frontier (0-10), Established (11-30), Core (31+)
  const tier = staffed >= 31 ? 'Core' : staffed >= 11 ? 'Established' : 'Frontier';
  const tierClass = tier.toLowerCase();
  return `<article class="mission-card${closed ? ' closed' : ''}${staffed < st.capacity && !closed ? ' wants-men' : ''}${st.fragile ? ' is-fragile' : ''}">
    <div class="mission-head mission-toggle" data-dest="${esc(d.id)}" style="cursor:pointer;"><strong>${esc(d.name || d.id)}</strong> <span class="tier-badge tier-${tierClass}">${tier}</span> <span class="toggle-hint">(tap to expand)</span>
      ${closed ? '<span class="mflag closed-flag">closed</span>'
        : staffed < st.capacity ? `<span class="mflag want-flag">asks for ${st.capacity - staffed} more</span>`
        : '<span class="mflag full-flag">at strength</span>'}${fragFlag}</div>
    <div class="mission-details" data-details="${esc(d.id)}" hidden>
    <div class="cap-bar" aria-hidden="true"><div class="cap-fill" style="width:${pct}%"></div></div>
    <p class="mission-staff">${esc(gradeBits)} — <button class="staff-toggle" data-dest="${esc(d.id)}"><strong>${staffed}/${st.capacity}</strong> (tap for roster)</button></p>
    <div class="mission-roster" data-roster="${esc(d.id)}" hidden>
      ${(() => {
        const gradeOrder = { 'P': 0, 'S*': 1, 'S': 2, 'F': 3, 'nS': 4, 'nF': 5 };
        const sorted = [...(st.staffIds || [])].sort((a, b) => {
          const ga = app.Engine.detailedGradeFor ? app.Engine.detailedGradeFor(app.state, a) : 'F';
          const gb = app.Engine.detailedGradeFor ? app.Engine.detailedGradeFor(app.state, b) : 'F';
          return (gradeOrder[ga] ?? 99) - (gradeOrder[gb] ?? 99);
        });
        return sorted.map((pid) => {
          const name = app.Engine.personName ? app.Engine.personName(app.state, pid) : pid;
          const deeds = app.Engine.personDeeds ? app.Engine.personDeeds(app.state, pid) : '';
          return `<div class="roster-person">${nameLink(app, pid, name)}${deeds ? `<div class="roster-deeds">${esc(deeds)}</div>` : ''}</div>`;
        }).join('') || '<p class="disp-mini">No staff records.</p>';
      })()}
    </div>
    <p class="mission-meta">strength ${strength}${bonus > 0 ? ` → +${bonus} to voyages` : ''} · upkeep ${upkeep} scudi/yr</p>
    ${(st.fruits || 0) > 0 ? `<p class="mission-fruits">Harvest: <strong>${(st.fruits || 0).toLocaleString('en-US')}</strong> souls</p>` : ''}
    ${(() => {
      // Named roster: thriving voyages not yet returned as veterans
      const stationed = (app.state.voyages || []).filter(v =>
        v.destination === d.id && v.outcome === 'thriving' && !v.veteranReturned);
      // Incoming: voyages in transit to this mission
      const incoming = (app.state.voyages || []).filter(v =>
        v.destination === d.id && v.stage === 'transit');
      let html = '';
      if (stationed.length) {
        html += `<p class="mission-roster"><strong>Stationed:</strong> ${stationed.map(v =>
          nameLink(app, v.petitionerId, v.petitionerName || v.petitionerId)).join(', ')}</p>`;
      }
      if (incoming.length) {
        html += `<p class="mission-roster incoming"><strong>Incoming:</strong> ${incoming.map(v =>
          nameLink(app, v.petitionerId, v.petitionerName || v.petitionerId)).join(', ')} (arriving ${incoming[0].arriveYear})</p>`;
      }
      // The community's character: top 3 traits among stationed men.
      const traits = E.communityTraits(app.state, d.id);
      if (traits.length) {
        const dots = (v) => {
          const n = Math.max(0, Math.min(5, Math.round(v || 0)));
          return '●'.repeat(n) + '○'.repeat(5 - n);
        };
        html += `<p class="mission-traits"><strong>The community:</strong> ${traits.map((t) =>
          `${esc(t.name)} ${dots(t.avg)}`).join(' · ')}</p>`;
      }
      return html;
    })()}
    ${(() => {
      const inst = (app.state.instructions || {})[d.id];
      const instText = inst ? (inst.status === 'in-transit' ? `<span class="disp-mini">Instruction in transit (${inst.type}, arrives ${inst.arriveYear})</span>`
        : inst.outcome ? `<span class="disp-mini">Last instruction: ${inst.outcome}</span>` : '') : '';
      return `${instText}
      <div class="instr-row"><label class="form-pick">Instruct:
        <select class="instr-type" data-id="${esc(d.id)}">
          <option value="expand">Expand the mission</option>
          <option value="consolidate">Consolidate</option>
          <option value="report">Send full account</option>
          <option value="encourage">Encourage the brethren</option>
          <option value="admonish">Admonish</option>
        </select></label>
        <button class="gbtn small ghost instr-send" data-id="${esc(d.id)}">Send</button></div>
      <p class="disp-mini instr-caption">Expand the mission adds 5 places to its capacity when the order arrives. It is the General's direct order and is never disobeyed. Men beyond capacity bear half fruit and cost +2 upkeep and −5 score each, yearly.</p>`;
    })()}
    ${!closed ? `<div class="btn-row"><button class="gbtn small warn mission-disband" data-id="${esc(d.id)}" data-energy="1">Disband mission</button></div>` : ''}
    </div>
  </article>`;
}

/* ---------------- collective deployment (Stage 1) ---------------- */

function deployState(app) {
  const E = app.Engine;
  if (!app.ui.deploy) app.ui.deploy = { destId: null, purpose: 'reinforce', count: 4, mustered: null };
  const openDests = Object.values(E.DESTINATIONS || {}).filter(d => d && d.id && (app.state.destState[d.id] || {}).access !== 'closed');
  const dp = app.ui.deploy;
  if (!dp.destId || !openDests.some(d => d.id === dp.destId)) dp.destId = openDests.length ? openDests[0].id : null;
  if (!E.DEPLOYMENT_PURPOSES[dp.purpose]) dp.purpose = 'reinforce';
  return dp;
}

function deploymentConstraintsHTML(app, count) {
  const E = app.Engine;
  const c = E.deploymentConstraints(app.state, count);
  const row = (label, text, binding) =>
    `<div class="dc-row${binding ? ' binding' : ''}"><span class="dc-label">${label}</span><span class="dc-val">${text}</span>${binding ? '<span class="dc-flag">binding</span>' : ''}</div>`;
  const hullText = c.hullMen <= c.hullCapacity
    ? `${c.hullMen} men — fits in one ship (capacity ${c.hullCapacity})`
    : `${c.hullMen} men — needs ${Math.ceil(c.hullMen / c.hullCapacity)} ships (capacity ${c.hullCapacity} each)`;
  const berthText = c.berths >= c.berthsNeeded
    ? `${c.shipsNeeded} ship${c.shipsNeeded === 1 ? '' : 's'} needed · ${c.berths} berths in port — sails this year`
    : `${c.shipsNeeded} ship${c.shipsNeeded === 1 ? '' : 's'} needed · only ${c.berths} berths in port — delayed`;
  let html = `<div class="dc-rows">`
    + row('Berths', berthText, c.bottleneck === 'berths')
    + row('Ships', `${hullText} · ${c.hullsFree} free now`, c.bottleneck === 'hulls')
    + row('Men to spare', `${c.menNeeded} from the pool · ${c.menAvailable} to spare`, c.bottleneck === 'men')
    + row('Funds', `${c.fundsNeeded} scudi to embark · ${c.funds} in the chest`, c.bottleneck === 'funds')
    + `</div>`;
  if (c.bottleneck === 'berths') {
    html += `<p class="howto-note dc-note">Not enough berths in port — each ship outfitting needs one berth. Expand the docks or charter fewer ships.</p>`;
  } else if (!c.bottleneck) {
    html += `<p class="howto-note dc-note">No constraint binds: the whole contingent can sail this year.</p>`;
  }
  return html;
}

function deploymentPreviewHTML(app) {
  const E = app.Engine;
  const dp = deployState(app);
  const mustered = dp.mustered;
  if (!mustered || !mustered.length) return '';
  const dest = (E.DESTINATIONS || {})[dp.destId] || {};
  const travel = dest.travelYears || 2;
  const st = E.missionStaff(app.state, dp.destId);
  const staffed = E.missionStaffed(st);
  const overCap = st.capacity > 0 && staffed + mustered.length > st.capacity;
  const names = mustered.map(m => {
    const gr = E.MISSION_GRADES[m.staffGrade];
    return `<li>${esc(m.name)} <span class="dg-meta">${esc(gr ? gr.short : m.staffGrade)}</span></li>`;
  }).join('');
  return `<div class="deploy-preview">
    <h4 class="sect">The contingent — ${mustered.length} men for ${esc(dest.name || dp.destId)}</h4>
    <p class="howto-note">Purpose (informational only): ${esc(E.DEPLOYMENT_PURPOSES[dp.purpose])}. Voyage ~${travel} year${travel === 1 ? '' : 's'}; sailing in company steadies the crossing.</p>
    <ul class="deploy-names">${names}</ul>
    ${deploymentConstraintsHTML(app, mustered.length)}
    ${overCap ? `<p class="howto-note dc-warn">⚠ ${esc(dest.name || dp.destId)} stands at ${staffed}/${st.capacity}; these men would bring it to ${staffed + mustered.length}. Capacity is a target, not a cap — this changes nothing mechanically.</p>` : ''}
    <div class="btn-row">
      <button class="gbtn ghost" id="deploy-clear">Disband</button>
      <button class="gbtn primary" id="deploy-order">Order the deployment</button>
    </div>
    <p class="howto-note">The order is irreversible — there is no recall in Stage 1. The men enter the departure queue and sail as berths, men to spare, funds, and ships allow, oldest first alongside indipetae approvals.</p>
  </div>`;
}

function deploymentPanelHTML(app) {
  const E = app.Engine;
  const dp = deployState(app);
  const openDests = Object.values(E.DESTINATIONS || {}).filter(d => d && d.id && (app.state.destState[d.id] || {}).access !== 'closed');
  const eligible = E.deploymentCandidates(app.state).length;
  const min = E.DEPLOYMENT_MIN_SIZE;
  const maxCount = Math.max(min, eligible);
  if (dp.count < min) dp.count = min;
  if (dp.count > maxCount) dp.count = maxCount;
  return `<h3 class="sect">Collective deployment</h3>
  <div class="dispatch-panel deploy-panel">
    <p class="howto-note">Send a company of formed men from Europe to a mission in a single order — no indipetae, no seal. 60 scudi per man at departure, one berth per man, drawn from the same pool as indipetae sailors. The men must already labor in Europe and be free: not ill, not in formation, holding no domestic assignment.</p>
    <div class="deploy-form">
      <label class="dest-redirect">Destination:
        <select id="deploy-dest" aria-label="Deployment destination">
          ${openDests.map(d => `<option value="${d.id}"${d.id === dp.destId ? ' selected' : ''}>${esc(d.name || d.id)}</option>`).join('')}
        </select>
      </label>
      <label class="dest-redirect">Purpose:
        <select id="deploy-purpose" aria-label="Deployment purpose">
          ${Object.entries(E.DEPLOYMENT_PURPOSES).map(([k, v]) => `<option value="${k}"${k === dp.purpose ? ' selected' : ''}>${esc(v)}</option>`).join('')}
        </select>
      </label>
      <div class="dispatch-grade">
        <div class="dg-info"><strong>Men</strong>
          <span class="dg-meta">${eligible} eligible in Europe · min ${min}</span></div>
        <div class="dg-step">
          <button class="gbtn small ghost" id="deploy-dec" aria-label="Fewer men">−</button>
          <span class="dg-count" id="deploy-count">${dp.count}</span>
          <button class="gbtn small ghost" id="deploy-inc" aria-label="More men">+</button>
        </div>
      </div>
    </div>
    <div class="btn-row">
      <button class="gbtn" id="deploy-muster" ${eligible >= min && dp.destId ? '' : 'disabled'}>Muster the contingent</button>
    </div>
    <div id="deploy-preview">${deploymentPreviewHTML(app)}</div>
  </div>`;
}

function deploymentListHTML(app) {
  const E = app.Engine;
  const deps = [...(app.state.deployments || [])].reverse();
  if (!deps.length) return '';
  const stateLabel = (s) => ({
    'awaiting': 'awaiting berths', 'in-transit': 'at sea', 'thriving': 'thriving',
    'returned': 'returned', 'ill': 'ill', 'deceased': '† deceased',
  }[s] || s);
  const cards = deps.map(dep => {
    const st = E.deploymentStatus(app.state, dep.id);
    const roster = E.deploymentRoster(app.state, dep.id) || [];
    const statusText = st.status === 'ordered' ? 'ordered — awaiting berths'
      : st.status === 'in-transit' ? `at sea — ${st.resolved}/${st.total} arrived`
      : `complete — ${st.resolved}/${st.total} arrived`;
    return `<article class="mission-card deploy-card">
      <div class="mission-head"><strong>Deployment to ${esc(dep.destName || dep.destId)}</strong>
        <span class="mflag ${st.status === 'arrived' ? 'full-flag' : 'want-flag'}">${esc(statusText)}</span></div>
      <p class="mission-meta">ordered anno ${dep.year} · ${esc(E.DEPLOYMENT_PURPOSES[dep.purpose] || dep.purpose)} · ${dep.memberIds.length} men</p>
      <ul class="deploy-names">${roster.map(m =>
        `<li>${nameLink(app, m.petitionerId, m.name)} <span class="dg-meta">${esc((E.MISSION_GRADES[m.grade] || {}).short || m.grade)}</span> — ${esc(stateLabel(m.state))}${m.arriveYear && m.state === 'in-transit' ? ` (arriving ${m.arriveYear})` : ''}</li>`
      ).join('')}</ul>
    </article>`;
  }).join('');
  return `<h3 class="sect">Deployments ordered</h3><div class="mission-list">${cards}</div>`;
}

function wireDeploymentPanel(app, root) {
  const E = app.Engine;
  const dp = deployState(app);
  const eligible = E.deploymentCandidates(app.state).length;
  const min = E.DEPLOYMENT_MIN_SIZE;
  const maxCount = Math.max(min, eligible);

  const refreshCount = () => {
    root.querySelector('#deploy-count').textContent = dp.count;
    const musterBtn = root.querySelector('#deploy-muster');
    if (musterBtn) musterBtn.disabled = !(eligible >= min && dp.destId);
  };

  const destSel = root.querySelector('#deploy-dest');
  if (destSel) destSel.addEventListener('change', (e) => {
    dp.destId = e.target.value; dp.mustered = null;
    root.querySelector('#deploy-preview').innerHTML = '';
    app.sound('tick');
  });
  const purpSel = root.querySelector('#deploy-purpose');
  if (purpSel) purpSel.addEventListener('change', (e) => {
    dp.purpose = e.target.value; dp.mustered = null;
    root.querySelector('#deploy-preview').innerHTML = '';
    app.sound('tick');
  });
  const dec = root.querySelector('#deploy-dec');
  if (dec) dec.addEventListener('click', () => {
    dp.count = Math.max(min, dp.count - 1); dp.mustered = null;
    root.querySelector('#deploy-preview').innerHTML = '';
    app.sound('tick'); refreshCount();
  });
  const inc = root.querySelector('#deploy-inc');
  if (inc) inc.addEventListener('click', () => {
    dp.count = Math.min(maxCount, dp.count + 1); dp.mustered = null;
    root.querySelector('#deploy-preview').innerHTML = '';
    app.sound('tick'); refreshCount();
  });

  const renderPreview = () => {
    root.querySelector('#deploy-preview').innerHTML = deploymentPreviewHTML(app);
    const clear = root.querySelector('#deploy-clear');
    if (clear) clear.addEventListener('click', () => {
      dp.mustered = null;
      root.querySelector('#deploy-preview').innerHTML = '';
      app.sound('page');
    });
    const order = root.querySelector('#deploy-order');
    if (order) order.addEventListener('click', () => {
      try {
        const names = dp.mustered.map(m => m.name).join(', ');
        const dest = (E.DESTINATIONS || {})[dp.destId] || {};
        if (!confirm(`Order ${dp.mustered.length} men — ${names} — to ${dest.name || dp.destId}? This cannot be recalled; they will sail as berths, men to spare, funds, and ships allow.`)) return;
        const dep = E.orderDeployment(app.state, {
          destId: dp.destId, purpose: dp.purpose,
          memberIds: dp.mustered.map(m => m.petitionerId),
        });
        E.refreshBriefing(app.state);
        app.save();
        app.sound('coin');
        app.ui.notice = `Deployment ordered: ${dep.memberIds.length} men for ${dep.destName}.`;
        dp.mustered = null; dp.count = min;
        app.go('missions');
      } catch (e) {
        app.sound('error');
        alert(`The order could not be given: ${e.message}`);
      }
    });
  };

  const musterBtn = root.querySelector('#deploy-muster');
  if (musterBtn) musterBtn.addEventListener('click', () => {
    try {
      const ids = E.selectDeploymentMembers(app.state, { count: dp.count });
      const cands = new Map(E.deploymentCandidates(app.state).map(c => [c.petitionerId, c]));
      dp.mustered = ids.map(id => ({ petitionerId: id, name: cands.get(id).name, staffGrade: cands.get(id).staffGrade }));
      app.sound('page');
      renderPreview();
    } catch (e) {
      app.sound('error');
      alert(`Could not muster the contingent: ${e.message}`);
    }
  });
}

/* ---------------- governance: provincial reports & staged decisions ---------------- */

const GOV_KIND_LABEL = { fragile: 'Fragile mission', request: 'Asks for men', account: 'Full account', voyage: 'Death reported' };

function govReportFactsHTML(facts) {
  const rows = [];
  if (facts.staffed != null) rows.push(['Staffed', `${facts.staffed} of ${facts.capacity}`]);
  if (facts.fathers != null) rows.push(['Fathers / coadjutors / brothers', `${facts.fathers} / ${facts.coadjutors} / ${facts.brothers}`]);
  if (facts.fragile != null) rows.push(['Fragile', facts.fragile ? `yes (${facts.fragileYears}y)` : 'no']);
  if (facts.strength != null) rows.push(['Mission strength', String(facts.strength)]);
  if (facts.danger != null) rows.push(['Danger', '●'.repeat(facts.danger) + '○'.repeat(Math.max(0, 4 - facts.danger))]);
  if (facts.petitionerId) rows.push(['Soul', esc(facts.petitionerId)]);
  if (!rows.length) return '';
  return `<dl class="dossier-list">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function provincialsHTML(app) {
  const E = app.Engine;
  const provs = app.state.provincials || {};
  const hqs = app.state.provinceHQs || {};
  const regions = E.PROVINCIAL_REGIONS || [];
  if (!regions.length || !Object.keys(provs).length) return '';
  const destName = (id) => { const d = (E.openDestinations(app.state) || []).find((x) => x.id === id); return d ? d.name : id; };
  return `
    <h3 class="sect">Provincials</h3>
    ${regions.map((r) => {
      const p = provs[r.id];
      if (!p) return '';
      const hq = p.hq || hqs[r.id];
      const hasReq = !!(app.state.provincialRequests || {})[r.id];
      if (p.vacant) {
        return `<div class="gov-prov gov-provincial" data-region="${esc(r.id)}" role="button" tabindex="0">
          <strong>${esc(r.name)}</strong> — <strong>vacant</strong>${hasReq ? ' <span class="gh-badge" style="position:static">!</span>' : ''}
          ${hq ? `<span class="disp-mini">at ${esc(destName(hq))}</span>` : ''}
          <span class="disp-mini">the provincial has died</span>
          <div class="btn-row"><button class="gbtn small primary gov-replace" data-region="${esc(r.id)}">Name a successor</button></div>
        </div>`;
      }
      const yrs = E.provincialTermYears(app.state, r.id);
      const complete = E.provincialTermComplete(app.state, r.id);
      return `<div class="gov-prov gov-provincial" data-region="${esc(r.id)}" role="button" tabindex="0">
        <strong>${esc(r.name)}</strong> — ${esc(p.name)}${hasReq ? ' <span class="gh-badge" style="position:static">!</span>' : ''}
        ${hq ? `<span class="disp-mini">at ${esc(destName(hq))}</span>` : ''}
        <span class="disp-mini">${yrs} of ${E.PROVINCIAL_TERM_YEARS} years${complete ? ' · <strong>term complete</strong>' : ''}</span>
        <div class="btn-row"><button class="gbtn small ${complete ? 'primary' : 'ghost'} gov-replace" data-region="${esc(r.id)}">${complete ? 'Name a successor' : 'Recall'}</button></div>
      </div>`;
    }).join('')}`;
}

function provincialReplacementHTML(app, regionId) {
  const E = app.Engine;
  const rep = (app.state.provincialTernas || {})[regionId];
  const prov = (app.state.provincials || {})[regionId];
  const region = (E.PROVINCIAL_REGIONS || []).find((r) => r.id === regionId);
  if (!region || !prov) return '';
  const incumbentId = prov.vacant ? null : (prov.petitionerId || prov.id);
  const roster = E.professedPriests(app.state).filter((p) => p.petitionerId !== incumbentId);
  const dests = E.openDestinations(app.state);
  const hasRecord = !!(!prov.vacant && prov.petitionerId && app.state.petitioners[prov.petitionerId]);
  const candName = (id) => (roster.find((p) => p.petitionerId === id) || {}).name || id;
  return `
    <h3 class="sect">Succession — ${esc(region.name)}</h3>
    ${prov.vacant
      ? `<p class="howto-note">The see is vacant. Name the next provincial of ${esc(region.name)}.</p>`
      : `<p class="howto-note">${esc(prov.name)} has governed ${esc(region.name)} for ${E.provincialTermYears(app.state, regionId)} years. Name his successor — or confirm him for another term.</p>`}
    ${rep ? `
    <p><strong>The terna:</strong> three professed priests drawn by lot${roster.length > rep.candidates.length ? ' (the province first, then the nearest)' : ''}.</p>
    <div class="desk">
      ${rep.candidates.map((id) => `
        <article class="pcard draft-cand" data-pick="${esc(id)}" tabindex="0" role="button">
          <h3 class="pcard-name">${esc(candName(id))}</h3>
          <p class="pcard-meta">${esc((roster.find((p) => p.petitionerId === id) || {}).location || '')}</p>
        </article>`).join('')}
    </div>
    <p><label>Or name another professed priest:
      <select id="rep-roster"><option value="">— choose —</option>
      ${roster.filter((p) => !rep.candidates.includes(p.petitionerId)).map((p) => `<option value="${esc(p.petitionerId)}">${esc(p.name)} (${esc(p.location || '')})</option>`).join('')}
      </select></label></p>
    ${hasRecord ? `<p><label>Where does ${esc(prov.name)} go?
      <select id="rep-outgoing">
        <option value="europe">Labor in Europe</option>
        ${dests.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}
      </select></label></p>` : `<p class="howto-note">${esc(prov.name)} will retire from the game.</p>`}
    <div class="btn-row">
      <button class="gbtn primary" id="rep-confirm" disabled>Confirm the succession</button>
      ${prov.vacant ? '' : `<button class="gbtn ghost" id="rep-keep">Keep ${esc(prov.name)} in office</button>`}
      <button class="gbtn ghost" id="rep-cancel">Cancel</button>
    </div>` : `<p class="howto-note">Drawing the terna…</p>`}`;
}

/** Treasury: where the scudi come from and where they go. */
export function renderTreasury(app, root) {
  const fin = app.state.finance || { income: {}, expenses: {} };
  const fy = (app.state.financeYears || {})[app.state.year] || { income: {}, expenses: {} };
  const funds = app.state.resources?.funds ?? 0;
  const catName = {
    subsidy: 'Yearly subsidy', domestic: 'Domestic service',
    voyages: 'Passages', dispatches: 'Mission dispatches', formation: 'Formation',
    ships: 'Ships', berths: 'Berths', novitiates: 'Novitiates', upkeep: 'Upkeep',
    instructions: 'Instructions', 'provincial-requests': 'Men for provinces',
  };
  const rows = (book) => Object.entries(book || {})
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `<li><strong>${esc(catName[c] || c)}</strong> — ${v.toLocaleString('en-US')} scudi</li>`).join('');
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);

  // Last year P&L
  const lastYear = app.state.year - 1;
  const ly = (app.state.financeYears || {})[lastYear] || { income: {}, expenses: {} };
  const lyIncome = sum(ly.income);
  const lyExpenses = sum(ly.expenses);
  const lyNet = lyIncome - lyExpenses;

  // Pro forma P&L (current year projection)
  const subsidy = app.Engine.RESOURCES?.YEARLY_INCOME || 240;
  let projUpkeep = 0;
  try {
    if (app.Engine.missionUpkeep && app.state.missions) {
      for (const mid of Object.keys(app.state.missions)) {
        const st = app.state.missions[mid];
        if (st) projUpkeep += app.Engine.missionUpkeep(st);
      }
    }
  } catch (e) {}
  const pendingSeal = app._pendingSeal || 0;
  const pendingComp = app._pendingComp || 0;
  let stagedScudi = 0;
  try { stagedScudi = app.Engine.stagedCommitments(app.state).scudi || 0; } catch (e) {}
  const spentSoFar = sum(fy.expenses);
  // Projected total out = spent + pending + staged + upkeep (if not already spent)
  const upkeepAlready = (fy.expenses || {}).upkeep || 0;
  const projOut = spentSoFar + pendingSeal + pendingComp + stagedScudi + Math.max(0, projUpkeep - upkeepAlready);
  const projIn = subsidy; // + domestic (unknown until year close)
  const projNet = projIn - projOut;

  const plRow = (label, val, bold) => `<li${bold ? ' style="font-weight:bold;border-top:1px solid var(--parch-deep);padding-top:0.4rem;margin-top:0.4rem;"' : ''}><span>${label}</span><span>${val.toLocaleString('en-US')}</span></li>`;

  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">TREASURY</p>
    <h2 class="year-head px">🪙 ${funds.toLocaleString('en-US')} <span class="disp-mini">scudi in the chest</span></h2>

    <h3 class="sect">P&L — Anno ${lastYear} (actual)</h3>
    <ul class="news-list" style="list-style:none;padding:0;">
      ${rows(ly.income) ? `<li><strong>Income</strong></li>${rows(ly.income)}` : ''}
      ${rows(ly.expenses) ? `<li><strong>Expenses</strong></li>${rows(ly.expenses)}` : ''}
      ${plRow('Net', lyNet, true)}
    </ul>
    ${!lyIncome && !lyExpenses ? '<p class="howto-note">No records for last year.</p>' : ''}

    <h3 class="sect">P&L — Anno ${app.state.year} (pro forma)</h3>
    <ul class="news-list" style="list-style:none;padding:0;">
      <li><span>Projected income (subsidy)</span><span>${projIn.toLocaleString('en-US')}</span></li>
      <li><span>Spent so far</span><span>${spentSoFar.toLocaleString('en-US')}</span></li>
      ${pendingSeal ? `<li><span>Pending seals</span><span>${pendingSeal.toLocaleString('en-US')}</span></li>` : ''}
      ${pendingComp ? `<li><span>Pending companions</span><span>${pendingComp.toLocaleString('en-US')}</span></li>` : ''}
      ${stagedScudi ? `<li><span>Staged commitments</span><span>${stagedScudi.toLocaleString('en-US')}</span></li>` : ''}
      ${projUpkeep > upkeepAlready ? `<li><span>Projected upkeep</span><span>${Math.max(0, projUpkeep - upkeepAlready).toLocaleString('en-US')}</span></li>` : ''}
      ${plRow('Projected net', projNet, true)}
    </ul>

    <h3 class="sect">Anno ${app.state.year} — detail in (${sum(fy.income).toLocaleString('en-US')})</h3>
    ${sum(fy.income) ? `<ul class="news-list">${rows(fy.income)}</ul>` : '<p class="howto-note">Nothing yet this year.</p>'}
    <h3 class="sect">Anno ${app.state.year} — detail out (${sum(fy.expenses).toLocaleString('en-US')})</h3>
    ${sum(fy.expenses) ? `<ul class="news-list">${rows(fy.expenses)}</ul>` : '<p class="howto-note">Nothing yet this year.</p>'}
  </section>`;
}

export function renderGovernance(app, root) {
  // A provincial's page takes over the tab.
  if (app.ui.provincialPage) { renderProvincialPage(app, root, app.ui.provincialPage); return; }
  const E = app.Engine;
  const reqs = app.state.provincialRequests || {};

  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">GOVERNANCE</p>
    <h2 class="year-head px">The provinces — anno ${app.state.year}</h2>
    <p class="howto-note">The General governs through his provincials. Choose one to see his men, his requests, and to ask about a man.</p>
    ${provincialsHTML(app)}
    ${app.ui.provReplacement ? provincialReplacementHTML(app, app.ui.provReplacement) : ''}
    ${formationDecisionsHTML(app)}
    ${engineHTML(app)}
    ${(() => {
      const E2 = app.Engine;
      const destList = E2.DESTINATIONS ? Object.values(E2.DESTINATIONS) : [];
      const frontier = destList.filter((d) => {
        const ds = app.state.destState[d.id] || {};
        // Show frontier not yet founded, OR collapsed missions (re-foundable)
        return (d.frontier && ds.access !== 'open') || ds.collapsed;
      });
      if (!frontier.length) return '';
      return `<h3 class="sect">Found a mission</h3>
      <p class="howto-note">Frontier fields await the Society — founding costs no coin; the price is the company: a brother laboring in Europe to sail as the founding company. He is named from Europe and waits at the dock for a ship. Collapsed missions can be rebuilt the same way.</p>
      <div class="frontier-list">
        ${frontier.map((d) => `
        <div class="frontier-item">
          <strong>${esc(d.name)}</strong>
          <span class="disp-mini">${esc(d.blurb || '')}</span>
          <button class="gbtn small primary frontier-found" data-id="${esc(d.id)}" data-energy="1">${(app.state.destState[d.id] || {}).collapsed ? 'Rebuild' : 'Found'}</button>
        </div>`).join('')}
      </div>`;
    })()}
  </section>`;

  attachVowsHandlers(app, root);
  root.querySelectorAll('.engine-intention').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        app.Engine.setIntention(app.state, btn.dataset.target);
        app.save();
        app.sound('page');
        app.go('governance');
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  });
  root.querySelectorAll('.gov-provincial').forEach((el) => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('button')) return; // let Replace/Recall buttons work
      app.ui.provincialPage = el.dataset.region;
      app.sound('page'); renderGovernance(app, root);
    });
  });
  // provincial replacement wiring
  const E2 = app.Engine;
  root.querySelectorAll('.gov-replace').forEach((b) => b.addEventListener('click', () => {
    try { E2.beginProvincialReplacement(app.state, b.dataset.region); }
    catch (e) { app.sound('error'); alert(e.message); return; }
    app.ui.provReplacement = b.dataset.region;
    app.ui.provChoice = null;
    app.save(); app.sound('page');
    renderGovernance(app, root);
  }));
  const repCancel = root.querySelector('#rep-cancel');
  if (repCancel) repCancel.addEventListener('click', () => {
    if (app.state.provincialTernas) delete app.state.provincialTernas[app.ui.provReplacement];
    app.ui.provReplacement = null; app.ui.provChoice = null;
    app.sound('page'); renderGovernance(app, root);
  });
  // Frontier founding
  root.querySelectorAll('.frontier-found').forEach((btn) => btn.addEventListener('click', () => {
    const destId = btn.dataset.id;
    try {
      const res = app.Engine.foundMission(app.state, destId, { fathers: 0, coadjutors: 0, brothers: 1 });
      app.Engine.refreshBriefing(app.state);
      app.save();
      app.sound('coin');
      app.ui.notice = `Mission founded.`;
      app.go('governance');
    } catch (e) {
      app.sound('error');
      alert(e.message);
    }
  }));
  const repKeep = root.querySelector('#rep-keep');
  if (repKeep) repKeep.addEventListener('click', () => {
    try { E2.resolveProvincialReplacement(app.state, app.ui.provReplacement, 'incumbent'); app.sound('seal'); }
    catch (e) { app.sound('error'); alert(e.message); return; }
    app.ui.provReplacement = null; app.ui.provChoice = null;
    app.save(); renderGovernance(app, root);
  });
  const repConfirm = root.querySelector('#rep-confirm');
  const pickCard = (id) => {
    app.ui.provChoice = id;
    root.querySelectorAll('.draft-cand[data-pick]').forEach((el) => el.classList.toggle('approved-pick', el.dataset.pick === id));
    const btn = root.querySelector('#rep-confirm');
    if (btn) btn.disabled = !id;
  };
  root.querySelectorAll('.draft-cand[data-pick]').forEach((el) => {
    el.addEventListener('click', () => pickCard(el.dataset.pick));
  });
  if (repConfirm) repConfirm.addEventListener('click', () => {
    const regionId = app.ui.provReplacement;
    const choiceId = app.ui.provChoice;
    const outgoingTo = (root.querySelector('#rep-outgoing') || {}).value || 'europe';
    try { E2.resolveProvincialReplacement(app.state, regionId, choiceId, outgoingTo); app.sound('seal'); }
    catch (e) { app.sound('error'); alert(e.message); return; }
    app.ui.provReplacement = null; app.ui.provChoice = null;
    app.save(); renderGovernance(app, root);
  });
}

/** A provincial's page: his roster, his request, and the ask box. */
function renderProvincialPage(app, root, regionId) {
  const E = app.Engine;
  const region = (E.PROVINCIAL_REGIONS || []).find((r) => r.id === regionId);
  const prov = (app.state.provincials || {})[regionId];
  if (!region || !prov) { app.ui.provincialPage = null; renderGovernance(app, root); return; }
  const hq = prov.hq || (app.state.provinceHQs || {})[regionId];
  const destName = (id) => { const d = (E.openDestinations(app.state) || []).find((x) => x.id === id); return d ? d.name : id; };

  // His men: living men whose province is this region (not himself, not Europe).
  const roster = Object.keys(app.state.petitioners || {}).filter((id) => {
    try {
      const rec = app.state.petitioners[id];
      if (!rec || rec.status === 'deceased' || rec.status === 'dismissed') return false;
      if (id === prov.petitionerId) return false;
      return E.provinceOfMan(app.state, id) === regionId;
    } catch { return false; }
  });
  const manName = (id) => {
    const e = (app.state.europeanLabor || []).find((x) => x.petitionerId === id);
    if (e && e.name) return e.name;
    const rec = app.state.petitioners[id];
    if (rec && rec.name) return rec.name;
    try {
      if (app.data) return E.cardName(app.state, app.data, id);
    } catch { /* fall through */ }
    return id;
  };
  const manGrade = (id) => {
    try { return E.staffGradeFor(app.state, id); } catch { return ''; }
  };

  const req = (app.state.provincialRequests || {})[regionId];
  const staged = (app.state.stagedAnswers || {})[regionId];
  const questionsLeft = E.QUESTIONS_PER_YEAR - (app.state.questionsAsked || 0);
  const energy = app.state.energy ?? E.ENERGY_PER_YEAR;

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const reqLine = req
    ? E.REQUEST_GRADES.filter((c) => req[c] > 0).map((c) => plural(req[c], c === 'brothers' ? 'brother' : c.slice(0, -1), c)).join(', ')
    : '';
  const avail = {};
  for (const c of E.REQUEST_GRADES) {
    try {
      // Named men only — a request can only be filled by men who
      // actually stand in Europe.
      avail[c] = E.requestGradeAvailable(app.state, c);
    } catch { avail[c] = 0; }
  }
  const canAgree = req && E.REQUEST_GRADES.every((c) => (req[c] || 0) <= avail[c]);

  root.innerHTML = `
  <section class="gscreen">
    <p><button class="gbtn small ghost" id="prov-back">&larr; The provinces</button></p>
    <p class="kicker px">${esc(region.name.toUpperCase())}</p>
    <h2 class="year-head px">${esc(prov.name)}</h2>
    <p class="howto-note">${hq ? `Resides at ${esc(destName(hq))}. ` : ''}${prov.vacant ? 'The see is vacant.' : `${E.provincialTermYears(app.state, regionId)} of ${E.PROVINCIAL_TERM_YEARS} years.`}</p>

    ${req ? `
    <h3 class="sect">His request <span class="disp-mini">anno ${req.year}</span></h3>
    <p><strong>Requests ${esc(reqLine)}.</strong></p>
    <p class="howto-note">Free in Europe: ${E.REQUEST_GRADES.map((c) => `${avail[c]} ${c}`).join(', ')}. Agreeing costs nothing now — the men are named from Europe, wait at the dock, and pay the usual 60 scudi each when they sail to his HQ.</p>
    ${staged ? `
    <p class="howto-note"><strong>Staged:</strong> ${staged.mix && Object.values(staged.mix).every((v) => v === 0) ? 'send no men' : `send ${E.REQUEST_GRADES.filter((c) => staged.mix[c] > 0).map((c) => plural(staged.mix[c], c === 'brothers' ? 'brother' : c.slice(0, -1), c)).join(', ')}`}. Takes effect at year close.</p>
    ${staged.men && Object.values(staged.men).some((a) => a.length) ? `
    <ul class="news-list">${E.REQUEST_GRADES.flatMap((c) => (staged.men[c] || []).map((pid) => {
      const e = (app.state.europeanLabor || []).find((x) => x.petitionerId === pid);
      const nm = (e && e.name) || pid;
      return `<li><button class="linklike staged-man" data-pid="${esc(pid)}"><strong>${esc(nm)}</strong></button> <span class="disp-mini">${esc(c)}</span></li>`;
    })).join('')}</ul>` : ''}
    <div class="btn-row">
      <button class="gbtn ghost" id="req-unstage">Withdraw</button>
      <button class="gbtn ghost" id="req-mix">Change the mix</button>
    </div>` : `
    <div class="btn-row">
      <button class="gbtn ghost" id="req-decline">Stage: send no men</button>
      <button class="gbtn primary" id="req-agree" ${canAgree ? '' : 'disabled'}>Stage: agree — ${esc(reqLine)}</button>
      <button class="gbtn ghost" id="req-mix">Stage my own mix</button>
    </div>`}
    <div id="req-mixbox" hidden>
      ${E.REQUEST_GRADES.map((c) => `
        <label class="dest-redirect">${esc(c)} <span class="disp-mini">(have ${avail[c]})</span>
          <input type="number" min="0" max="${avail[c]}" value="${Math.min(req[c] || 0, avail[c])}" data-mix="${esc(c)}" style="width:4rem">
        </label>`).join('')}
      <div class="btn-row"><button class="gbtn primary" id="req-sendmix">Stage the mix</button></div>
    </div>` : `<p class="howto-note">No pending request from ${esc(prov.name)}.</p>`}

    <h3 class="sect">His men <span class="disp-mini">(${roster.length})</span></h3>
    ${roster.length ? `<ul class="news-list">${roster.slice(0, 60).map((id) => `
      <li><strong>${esc(manName(id))}</strong> <span class="disp-mini">${esc(manGrade(id))}</span>
      <button class="gbtn small ghost prov-ask" data-id="${esc(id)}" ${questionsLeft > 0 ? '' : 'disabled'}>Ask about him</button></li>`).join('')}
      ${roster.length > 60 ? `<li class="disp-mini">…and ${roster.length - 60} more.</li>` : ''}</ul>`
      : `<p class="howto-note">No men of his are known to the Generalate.</p>`}
    <p class="howto-note">Questions this year: <strong>${questionsLeft} of ${E.QUESTIONS_PER_YEAR}</strong> remain. Each is free.</p>

    <div id="prov-answer"></div>
  </section>`;

  root.querySelector('#prov-back').addEventListener('click', () => {
    app.ui.provincialPage = null; app.sound('page'); renderGovernance(app, root);
  });
  const done = (msg, ok = true) => {
    app.save(); app.sound(ok ? 'seal' : 'error');
    renderGovernance(app, root);
    if (!ok) alert(msg);
  };
  const rd = root.querySelector('#req-decline');
  if (rd) rd.addEventListener('click', () => {
    try { E.stageProvincialAnswer(app.state, regionId, { professed: 0, fathers: 0, brothers: 0 }); done(); }
    catch (e) { done(e.message, false); }
  });
  const ra = root.querySelector('#req-agree');
  if (ra) ra.addEventListener('click', () => {
    try { E.stageProvincialAnswer(app.state, regionId, { professed: req.professed, fathers: req.fathers, brothers: req.brothers }); done(); }
    catch (e) { done(e.message, false); }
  });
  const ru = root.querySelector('#req-unstage');
  if (ru) ru.addEventListener('click', () => {
    E.unstageProvincialAnswer(app.state, regionId); done();
  });
  root.querySelectorAll('.staged-man').forEach((b) => b.addEventListener('click', () => {
    const pid = b.dataset.pid;
    const e = (app.state.europeanLabor || []).find((x) => x.petitionerId === pid);
    showInspector(app, pid, (e && e.name) || pid);
  }));
  const rm = root.querySelector('#req-mix');
  if (rm) rm.addEventListener('click', () => {
    const box = root.querySelector('#req-mixbox');
    box.hidden = !box.hidden;
  });
  const sm = root.querySelector('#req-sendmix');
  if (sm) sm.addEventListener('click', () => {
    const mix = {};
    root.querySelectorAll('[data-mix]').forEach((inp) => { mix[inp.dataset.mix] = parseInt(inp.value, 10) || 0; });
    try { E.stageProvincialAnswer(app.state, regionId, mix); done(); }
    catch (e) { done(e.message, false); }
  });
  root.querySelectorAll('.prov-ask').forEach((b) => b.addEventListener('click', () => {
    const out = root.querySelector('#prov-answer');
    try {
      const res = E.askProvincial(app.state, regionId, b.dataset.id);
      app.save(); app.sound('page');
      // Show the dossier inline: dispositions + history summary.
      const d = E.ensureDisposition(app.state, b.dataset.id);
      const dots = (v) => '●'.repeat(Math.max(1, Math.min(5, v || 3))) + '○'.repeat(5 - Math.max(1, Math.min(5, v || 3)));
      const traits = Dispositions.TRAITS.map((t) =>
        `<li><span class="insp-dots">${dots(d.current[t.id])}</span> <strong>${esc(t.name)}</strong></li>`).join('');
      out.innerHTML = `<h3 class="sect">${esc(manName(b.dataset.id))} — what ${esc(prov.name)} reports</h3>
        <ul class="draft-traits">${traits}</ul>
        <p class="howto-note">${res.questionsLeft} question${res.questionsLeft === 1 ? '' : 's'} remain this year.</p>`;
    } catch (e) { app.sound('error'); alert(e.message); }
  }));
}

export function renderMissions(app, root) {
  const E = app.Engine;
  const year = app.state.currentYear ? app.state.currentYear.year : app.state.year;
  const dests = Object.values(E.DESTINATIONS || {}).filter(d => d && d.id);
  const openDests = dests.filter(d => (app.state.destState[d.id] || {}).access !== 'closed');
  if (!app.ui.dispatch || !openDests.some(d => d.id === app.ui.dispatch.destId)) {
    app.ui.dispatch = { destId: openDests.length ? openDests[0].id : null, fathers: 0, coadjutors: 0, brothers: 0 };
  }
  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">THE MISSIONS</p>
    <h2 class="year-head px">ANNO ${year}</h2>
    <p class="howto-note">Each mission keeps a stationed strength, by grade. Below capacity, a mission is understaffed — answer with the indipetae, or send men from the House of Formation. A strengthened mission steadies new arrivals (+1 to their voyage for every 6 strength, up to +3). A great station costs scudi every year to sustain.</p>
    <!-- Dispatch from Rome REMOVED per Tran 2026-10-19 -->
    <!-- Direct dispatch teleported men; use the terna or House to send men via ships. -->
    <!-- Collective deployment REMOVED per Tran 2026-10-19 -->    <!-- Collective deployment REMOVED per Tran 2026-10-19 -->
    
    <h3 class="sect">The stations</h3>
    <div class="mission-list">
      ${dests.filter((d) => !d.frontier || (app.state.destState[d.id] || {}).access === 'open')
        .map(d => missionCardHTML(app, d, year)).join('')}
    </div>
    ${deploymentListHTML(app)}
    <div class="btn-row">
      <button class="gbtn ghost" id="missions-back">← Back</button>
    </div>
  </section>`;

  // ---- frontier founding ----

  // ---- disband ----
  root.querySelectorAll('.mission-disband').forEach((btn) => btn.addEventListener('click', () => {
    const destId = btn.dataset.id;
    if (!confirm('Disband this mission? Its men return to Europe.')) return;
    try {
      const res = E.disbandMission(app.state, destId);
      E.refreshBriefing(app.state);
      app.save();
      app.sound('page');
      app.ui.notice = `Mission disbanded — ${res.returned} men return to Europe.`;
      app.go('missions');
    } catch (e) {
      app.sound('error');
      alert(e.message);
    }
  }));
  // Collective deployment wiring REMOVED per Tran 2026-10-19
  root.querySelectorAll('.instr-send').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const sel = root.querySelector(`.instr-type[data-id="${btn.dataset.id}"]`);
        const type = sel ? sel.value : 'report';
        E.issueInstruction(app.state, btn.dataset.id, type);
        E.refreshBriefing(app.state);
        app.save();
        app.sound('page');
        app.go('missions');
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  });
  attachNameLinks(app, root);
  wireDeploymentPanel(app, root);
  root.querySelector('#missions-back').addEventListener('click', () => {
    app.sound('page');
    app.go(app.ui.missionsFrom && app.ui.missionsFrom !== 'missions' ? app.ui.missionsFrom : 'briefing');
  });
  // Mission card toggles (collapse/expand)
  root.querySelectorAll('.mission-toggle').forEach((header) => {
    header.addEventListener('click', (e) => {
      // Don't toggle if clicking a button inside
      if (e.target.closest('button')) return;
      const destId = header.dataset.dest;
      const details = root.querySelector(`[data-details="${destId}"]`);
      if (details) {
        details.hidden = !details.hidden;
        const hint = header.querySelector('.toggle-hint');
        if (hint) hint.textContent = details.hidden ? '(tap to expand)' : '(tap to collapse)';
        app.sound('tick');
      }
    });
  });
  // Staff roster toggles
  root.querySelectorAll('.staff-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const destId = btn.dataset.dest;
      const roster = root.querySelector(`[data-roster="${destId}"]`);
      if (roster) {
        roster.hidden = !roster.hidden;
        app.sound('tick');
      }
    });
  });
  // Attach name links for roster
  attachNameLinks(app, root);
}

/* ---------------- terna desk ---------------- */
function cardHTML(app, c) {
  const L = c.letter;
  const hist = (c.history && c.history.length)
    ? `<p class="card-hist">${c.history.map(esc).join('<br>')}</p>`
    : `<p class="card-hist none">No prior petitions on record.</p>`;
  // Track indicator (Option B): the card header derives formation from years,
  // but the vows track comes from historical grade. When they disagree, say so.
  let formationLabel = c.formation;
  // Note: brothers are never 'scholastic' (fixed in enrichPetitioner).
  // This is a safety net only.
  return `
  <article class="pcard" data-id="${esc(c.id)}" tabindex="0"
      aria-label="Petitioner ${esc(c.name)}, ${esc(destName(app, c.destination))}">
    <div class="pcard-top">
      <span class="pcard-n">№ ${L.n}</span>
      ${kindBadge(L.kind)}
    </div>
    <h3 class="pcard-name">${esc(c.name)}</h3>
    <p class="pcard-meta">aet. ${c.age} · ${c.yearsInSociety} yrs in the Society · ${esc(formationLabel)}</p>
    <p class="pcard-dest">⛵ ${esc(destName(app, c.destination))}</p>
    <p class="pcard-dossier">${esc(c.dossier)}</p>
    <div class="pcard-skills">${c.skills.map(s => `<span class="skill">${esc(s)}</span>`).join('')}
      <span class="health" title="Health">♥${'●'.repeat(c.health)}${'○'.repeat(5 - c.health)}</span></div>
    ${hist}
    <p class="pcard-disposition"><span class="disp-line">${dispLine(app, c.id)}</span>
      <button class="gbtn small ghost inspect-btn" data-id="${esc(c.id)}" data-name="${esc(c.name)}">Inspect</button></p>
    <div class="verdict-row" role="group" aria-label="Decision for ${esc(c.name)}">
      <button class="gbtn small verdict approve-btn" data-id="${esc(c.id)}" data-verdict="approve" aria-pressed="false" title="Approve (30 scudi seal)">Approve</button>
      <button class="gbtn small ghost verdict deny-btn" data-id="${esc(c.id)}" data-verdict="deny" aria-pressed="false">Deny</button>
    </div>
    <label class="dest-redirect card-dest" data-id="${esc(c.id)}" hidden>Send to:
      <select class="card-dest-select" data-id="${esc(c.id)}" aria-label="Destination for ${esc(c.name)}"></select>
    </label>

    <div class="companion-row" data-id="${esc(c.id)}" hidden>
      <span class="companion-label">Companions <span class="companion-cost">(professed/father 120 · scholastic 80 · brother 50 · ${(app.state.available || 0).toLocaleString('en-US')} to spare · +1 voyage each up to +3 · ship-limited)</span>:</span>
      ${['professed', 'father', 'scholastic', 'brother'].map((g) => `
      <span class="comp-grade"><span class="comp-grade-name">${g}</span>
        <button class="gbtn small ghost comp-dec" data-id="${esc(c.id)}" data-grade="${g}" aria-label="Fewer ${g} companions">−</button>
        <span class="companion-count" data-id="${esc(c.id)}" data-grade="${g}">0</span>
        <button class="gbtn small ghost comp-inc" data-id="${esc(c.id)}" data-grade="${g}" aria-label="More ${g} companions">+</button>
      </span>`).join('')}
    </div>
    <div class="stamp" aria-hidden="true"></div>
  </article>`;
}

/* ---------------- formation decisions (General's Desk) ---------------- */
const VOWS_MILESTONE_LABELS = {
  firstVows: 'First vows',
  philosophy: 'Philosophy complete — approve regency',
  regency: 'Regency complete — approve theology',
  theology: 'Theology complete — approve ordination',
  ordination: 'Ordination',
  finalVowsGrade: 'Final vows — choose grade',
};

function engineHTML(app) {
  const E = app.Engine;
  const es = E.engineStrength(app.state);
  const bonus = E.engineBonus(app.state);
  const cur = (app.state.intention || {}).target || 'society';
  const openMissions = Object.entries(app.state.missions || {})
    .filter(([id]) => !(app.state.destState[id] || {}).collapsed)
    .map(([id]) => id);
  return `<h3 class="sect">The engine of the Society</h3>
  <p class="howto-note">The old Society held the Masses of its priests — offered for the missions and the Father General — to be the engine of the whole enterprise. ${es.priests} living priests offer Mass; ${es.martyrs} martyrs intercede from heaven. Each gives +0.15 — the Society's blessing is +${bonus}.</p>
  <div class="engine-list">
    <button class="gbtn small ${cur === 'society' ? 'primary' : 'ghost'} engine-intention" data-target="society">The Society — +${bonus} zeal to all men for one year</button>
    ${openMissions.map((id) => {
      const dname = (E.DESTINATIONS?.[id]?.name) || id;
      return `<button class="gbtn small ${cur === id ? 'primary' : 'ghost'} engine-intention" data-target="${esc(id)}">${esc(dname)} — +${bonus} voyage rolls there</button>`;
    }).join('')}
  </div>`;
}

function formationDecisionsHTML(app) {
  // Defense in depth: never render decisions for men who left the Society
  // (death purges these queues in the engine, but stale saves may carry them).
  const alive = (pid) => {
    const r = (app.state.petitioners || {})[pid];
    return !r || (r.status !== 'deceased' && r.status !== 'dismissed');
  };
  const pending = (app.state.pendingVows || []).filter((p) => alive(p.petitionerId));
  if (!pending.length) return '';
  const E = app.Engine;
  const rows = pending.map((p) => {
    const entry = (app.state.europeanLabor || []).find((e) => e.petitionerId === p.petitionerId);
    const name = entry ? entry.name : p.petitionerId;
    const suffix = E.rankSuffix ? E.rankSuffix(app.state, p.petitionerId) : '';
    const label = VOWS_MILESTONE_LABELS[p.type] || p.type;
    if (p.type === 'finalVowsGrade') {
      return `<li class="vows-row">
        <strong>${esc(name)}</strong> <span class="grade-chip">${esc(suffix)}</span>
        <span class="vows-label">${esc(label)}</span>
        <button class="gbtn small primary vows-grade" data-id="${esc(p.petitionerId)}" data-grade="coadjutor">Spiritual coadjutor</button>
        <button class="gbtn small primary vows-grade" data-id="${esc(p.petitionerId)}" data-grade="professed">Professed</button>
      </li>`;
    }
    return `<li class="vows-row">
      <strong>${esc(name)}</strong> <span class="grade-chip">${esc(suffix)}</span>
      <span class="vows-label">${esc(label)}</span>
      <button class="gbtn small primary vows-decide" data-id="${esc(p.petitionerId)}" data-type="${esc(p.type)}" data-decision="proceed">Proceed</button>
      <button class="gbtn small vows-decide" data-id="${esc(p.petitionerId)}" data-type="${esc(p.type)}" data-decision="defer">Defer</button>
      <button class="gbtn small warn vows-decide" data-id="${esc(p.petitionerId)}" data-type="${esc(p.type)}" data-decision="dismiss">Dismiss</button>
    </li>`;
  }).join('');
  // Final vows invitations for ordained men not yet invited
  const invitable = (app.state.europeanLabor || []).filter((e) => {
    const v = e.vows;
    return v && v.stage === 'ordained' && !v.finalVows && !v.tertianshipUntil;
  });
  const invRows = invitable.map((e) => {
    const suffix = E.rankSuffix ? E.rankSuffix(app.state, e.petitionerId) : '';
    return `<li class="vows-row">
      <strong>${esc(e.name)}</strong> <span class="grade-chip">${esc(suffix)}</span>
      <span class="vows-label">Eligible for final vows invitation</span>
      <button class="gbtn small primary vows-invite" data-id="${esc(e.petitionerId)}">Invite to tertianship</button>
    </li>`;
  }).join('');
  if (!rows && !invRows) return '';
  return `<section class="gscreen vows-screen">
    <p class="kicker px">FORMATION DECISIONS</p>
    <p class="desk-instr">These men await your judgment on their formation. Deferral grants humility and reconsideration in two years; dismissal is permanent.</p>
    <ul class="vows-list">${rows}${invRows}</ul>
  </section>`;
}

/** Attach handlers for formation vows decision buttons. Used by both renderDesk paths. */
function attachVowsHandlers(app, root) {
  root.querySelectorAll('.vows-decide').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        const decision = btn.dataset.decision;
        if (decision === 'dismiss' && !confirm('Dismiss this man from the Society? This is permanent.')) return;
        app.Engine.decideVows(app.state, btn.dataset.id, btn.dataset.type, decision);
        app.Engine.refreshBriefing(app.state);
        app.save();
        app.sound(decision === 'dismiss' ? 'error' : 'page');
        app.go('desk');
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  });
  root.querySelectorAll('.vows-invite').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        if (!confirm('Invite this man to tertianship (one year) for final vows?')) return;
        app.Engine.inviteFinalVows(app.state, btn.dataset.id);
        app.Engine.refreshBriefing(app.state);
        app.save();
        app.sound('page');
        app.go('desk');
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  });
  root.querySelectorAll('.vows-grade').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        const grade = btn.dataset.grade;
        if (!confirm(`Assign as ${grade === 'coadjutor' ? 'spiritual coadjutor' : 'professed'}? This is permanent.`)) return;
        app.Engine.completeFinalVows(app.state, btn.dataset.id, grade);
        app.Engine.refreshBriefing(app.state);
        app.save();
        app.sound('coin');
        app.go('desk');
      } catch (e) {
        app.sound('error');
        alert(e.message);
      }
    });
  });
}

function refreshShipOptions(app, selectEl, destId, selectedShipId) {
  const ships = (app.state.resources?.ships || []).filter((s) => (s.freeYear || 0) <= app.state.year);
  const tiers = app.Engine.RESOURCES?.SHIP_TIERS || {};
  const g = app.Engine.getGameData ? app.Engine.getGameData() : null;
  const dest = g?.destinations?.find?.((d) => d.id === destId) || (Array.isArray(g?.destinations) ? g.destinations.find((d) => d.id === destId) : null);
  // Handle destinations as object or array
  let destObj = null;
  if (g?.destinations) {
    if (Array.isArray(g.destinations)) destObj = g.destinations.find((d) => d.id === destId);
    else destObj = g.destinations[destId];
  }
  const travel = destObj?.travelYears ?? 2;
  
  let html = '<option value="">Auto (first available)</option>';
  for (const s of ships) {
    const ti = tiers[s.tier || 'carrack'] || { label: 'Carrack', range: 2, capacity: 8 };
    const canReach = ti.range >= travel;
    const sel = selectedShipId === s.id ? ' selected' : '';
    const dis = canReach ? '' : ' disabled';
    html += `<option value="${s.id}"${sel}${dis}>${esc(s.name)} (${ti.label}, ${ti.capacity} men${canReach ? '' : ' — cannot reach'})</option>`;
  }
  selectEl.innerHTML = html;
  if (selectedShipId) selectEl.value = selectedShipId;
}

export function renderDesk(app, root, terna) {
  // If no terna is awaiting decision (already sealed), show decided state, not interactive UI.
  // This prevents the dead end where SEAL button appears but decide() throws.
  // Formation decisions are always shown below, with or without an active terna.
  if (!app.state.currentTerna) {
    root.innerHTML = `
    <section class="gscreen desk-screen">
      <p class="kicker px">INDIPETAE · ANNO ${app.state.year}</p>
      <p class="desk-instr">The indipetae for this year have been sealed. Receive next year's indipetae from the Briefing tab.</p>
    </section>
    ${formationDecisionsHTML(app)}`;
    attachVowsHandlers(app, root);
    return;
  }
  // decisions: id -> {verdict:'approve'|'deny', destination, companions}.
  // Preserved when the General steps away to the House/Missions tabs mid-terna;
  // reset only when a new terna is dealt.
  const ternaKey = terna.map(c => c.id).sort().join('|');
  if (app.ui.deskTernaKey !== ternaKey) {
    app.ui.decisions = {};
    app.ui.deskTernaKey = ternaKey;
  }
  const openDests = Object.entries(app.Engine.DESTINATIONS)
    .filter(([did]) => {
      const st = app.state.destState[did];
      return !st || st.access !== 'closed';
    })
    .map(([did, d]) => ({ id: did, name: d.name || did }));

  root.innerHTML = `
  <section class="gscreen desk-screen">
    <p class="kicker px">INDIPETAE · ANNO ${app.state.year}</p>
    <p class="desk-instr">Three letters await your seal. Approve any, deny the rest — men bound for the same mission sail as a team. <strong>${(app.state.available || 0).toLocaleString('en-US')}</strong> men can be spared for the missions — one in a hundred of the Society.</p>
    <div class="desk">
      ${terna.map(c => cardHTML(app, c)).join('')}
    </div>
    <div class="review-bar" id="review-bar">
      <span class="review-text" id="review-summary">Mark each man approved or denied.</span>
      <span class="review-actions">
        <button class="gbtn primary" id="confirm" disabled>SEAL THE DECISIONS ⛪</button>
      </span>
    </div>
  </section>
  ${formationDecisionsHTML(app)}`;

  const bar = root.querySelector('#review-bar');
  const summary = root.querySelector('#review-summary');
  const confirmBtn = root.querySelector('#confirm');

  const destOptions = (petitionedId) => openDests.map(d =>
    `<option value="${d.id}"${d.id === petitionedId ? ' selected' : ''}>${esc(d.name)}${d.id === petitionedId ? ' (petitioned)' : ''}</option>`
  ).join('');

  const refresh = () => {
    const ds = app.ui.decisions;
    const ids = terna.map(c => c.id);
    const done = ids.every(id => ds[id] && ds[id].verdict);
    const approved = ids.filter(id => ds[id] && ds[id].verdict === 'approve');
    // Team preview: approvals sharing a destination.
    const byDest = {};
    for (const id of approved) {
      const d = ds[id].destination;
      (byDest[d] = byDest[d] || []).push(terna.find(c => c.id === id).name);
    }
    const teams = Object.entries(byDest).filter(([, ns]) => ns.length >= 2);
    let text;
    if (!done) {
      const remaining = ids.filter(id => !(ds[id] && ds[id].verdict)).length;
      text = `Mark each man approved or denied (${remaining} remaining).`;
    } else if (!approved.length) {
      text = 'All three denied. They may petition again.';
    } else {
      const compTotal = (co) => typeof co === 'object' && co
        ? Object.values(co).reduce((a, b) => a + b, 0)
        : (co || 0);
      const compBreakdown = (co) => {
        if (typeof co !== 'object' || !co) return '';
        const parts = ['professed', 'father', 'scholastic', 'brother']
          .filter((g) => co[g] > 0).map((g) => `${co[g]} ${g}`);
        return parts.length ? ` (${parts.join(', ')})` : '';
      };
      const parts = approved.map(id => {
        const c = terna.find(x => x.id === id);
        const dn = (openDests.find(d => d.id === ds[id].destination) || {}).name || ds[id].destination;
        const comps = compTotal(ds[id].companions);
        return `${c.name} → ${dn}${comps ? ` (+${comps} companion${comps === 1 ? '' : 's'}${compBreakdown(ds[id].companions)})` : ''}`;
      });
      const sealTotal = approved.length * ((app.Engine.RESOURCES && app.Engine.RESOURCES.SEAL_COST) ?? 0);
      // Grade-based companion cost (shared pricing)
      const gradeCost = (app.Engine.RESOURCES && app.Engine.RESOURCES.COMPANION_GRADE_COST) || {};
      const flatCost = (app.Engine.RESOURCES && app.Engine.RESOURCES.COMPANION_COST) || 40;
      let compTotal_ = 0;
      for (const id of approved) {
        const comps = ds[id].companions;
        if (typeof comps === 'number') compTotal_ += comps * flatCost;
        else if (comps && typeof comps === 'object') {
          for (const [g, v] of Object.entries(comps)) {
            if (typeof v === 'number' && v > 0) compTotal_ += v * (gradeCost[g] || flatCost);
          }
        }
      }
      const grandTotal = sealTotal + compTotal_;
      text = grandTotal > 0 ? `${grandTotal} scudi` : `No cost`;
    }
    summary.innerHTML = esc(text);
    confirmBtn.disabled = !done;
    if (done) bar.scrollIntoView({ block: 'nearest', behavior: app.prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  // Apply a saved/chosen verdict to a card's DOM (shared by clicks and restore).
  const applyVerdictToCard = (id) => {
    const d = app.ui.decisions[id];
    if (!d || !d.verdict) return;
    const c = terna.find(x => x.id === id);
    const card = root.querySelector(`.pcard[data-id="${CSS.escape(id)}"]`);
    if (!card) return;
    card.querySelectorAll('.verdict').forEach(b => {
      const on = b.dataset.verdict === d.verdict;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    card.classList.toggle('approved-pick', d.verdict === 'approve');
    card.classList.toggle('denied-pick', d.verdict === 'deny');
    const destLabel = card.querySelector('.card-dest');
    const destSelect = card.querySelector('.card-dest-select');
    const compRow = card.querySelector('.companion-row');
    if (d.verdict === 'approve') {
      destLabel.hidden = false;
      compRow.hidden = false;
      if (!destSelect.options.length) destSelect.innerHTML = destOptions(c.destination);
      destSelect.value = d.destination;

      const co = (d.companions && typeof d.companions === 'object') ? d.companions : {};
      for (const g of ['professed', 'father', 'scholastic', 'brother']) {
        const el = card.querySelector(`.companion-count[data-grade="${g}"]`);
        if (el) el.textContent = co[g] || 0;
      }
    } else {
      destLabel.hidden = true;
      compRow.hidden = true;
    }
  };

  root.querySelectorAll('.verdict').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const verdict = btn.dataset.verdict;
      const c = terna.find(x => x.id === id);
      const prev = app.ui.decisions[id] || {};
      app.ui.decisions[id] = {
        verdict,
        destination: prev.destination || c.destination,
        companions: prev.companions || 0,
      };
      applyVerdictToCard(id);
      app.sound('tick');
      refresh();
      if (app.syncFooter) app.syncFooter();
    });
  });

  root.querySelectorAll('.card-dest-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      e.stopPropagation();
      const id = sel.dataset.id;
      if (app.ui.decisions[id]) {
        app.ui.decisions[id].destination = sel.value;
        // Clear ship if it can't reach the new destination
        app.ui.decisions[id].shipId = null;
      }
      app.sound('tick');
      refresh();
      if (app.syncFooter) app.syncFooter();
    });
    sel.addEventListener('click', (e) => e.stopPropagation());
  });



  root.querySelectorAll('.comp-inc, .comp-dec').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const grade = btn.dataset.grade;
      const d = app.ui.decisions[id];
      if (!d || d.verdict !== 'approve' || !grade) return;
      if (!d.companions || typeof d.companions !== 'object') {
        d.companions = { professed: 0, father: 0, scholastic: 0, brother: 0 };
      }
      const max = app.Engine.RESOURCES.COMPANION_MAX;
      const total = Object.values(d.companions).reduce((a, b) => a + b, 0);
      const delta = btn.classList.contains('comp-inc') ? 1 : -1;
      const nv = (d.companions[grade] || 0) + delta;
      if (nv < 0) return;
      if (delta > 0 && total >= max) return;
      d.companions[grade] = nv;
      const card = root.querySelector(`.pcard[data-id="${CSS.escape(id)}"]`);
      const countEl = card.querySelector(`.companion-count[data-grade="${grade}"]`);
      if (countEl) countEl.textContent = nv;
      app.sound('tick');
      refresh();
      if (app.syncFooter) app.syncFooter();
    });
  });

  attachNameLinks(app, root);

  root.querySelectorAll('.inspect-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      app.save();
      showInspector(app, btn.dataset.id, btn.dataset.name || 'The petitioner');
    });
  });

  confirmBtn.addEventListener('click', () => {
    try {
      const approvals = terna
        .filter(c => app.ui.decisions[c.id] && app.ui.decisions[c.id].verdict === 'approve')
        .map(c => ({
          id: c.id,
          destination: app.ui.decisions[c.id].destination,
          companions: app.ui.decisions[c.id].companions || 0,
          shipId: app.ui.decisions[c.id].shipId || null,
        }));
      app.confirmDecision(approvals);
    } catch (e) {
      app.sound('error');
      alert(`The seal could not fall: ${e.message}`);
    }
  });
  
  // Restore any decisions made before stepping away to the House/Missions tabs.
  for (const c of terna) applyVerdictToCard(c.id);
  refresh();

  // Formation vows decisions
  attachVowsHandlers(app, root);
}

/* ---------------- letter reader overlay ---------------- */
export function showLetterOverlay(app, c) {
  const L = c.letter;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
  <div class="overlay-card letter-card" role="dialog" aria-modal="true" aria-label="Letter of ${esc(c.name)}">
    <button class="overlay-close" aria-label="Close letter">✕</button>
    <p class="kicker px">LITTERA INDIPETA · № ${L.n}</p>
    <h2 class="letter-name">${esc(c.name)}</h2>
    <p class="letter-meta">${esc(L.place)}, ${esc(L.date)}<br>
      <span class="archival">${esc(L.archival)}</span></p>
    <p>${kindBadge(L.kind)}</p>
    <div class="letter-text">
      ${L.full_paras.map(p => `<p>${esc(p)}</p>`).join('')}
    </div>
    <dl class="dossier-list">
      <div><dt>Age</dt><dd>${c.age}</dd></div>
      <div><dt>Years in the Society</dt><dd>${c.yearsInSociety}</dd></div>
      <div><dt>Formation</dt><dd>${esc(c.formation)}</dd></div>
      <div><dt>Studies</dt><dd>${esc(c.studies)}</dd></div>
      <div><dt>Health</dt><dd>${'●'.repeat(c.health)}${'○'.repeat(5 - c.health)}</dd></div>
      <div><dt>Seeks</dt><dd>${esc(destName(app, c.destination))}</dd></div>
    </dl>
    <p class="letter-dossier">${esc(c.dossier)}</p>
  </div>`;
  ov.querySelector('.overlay-close').addEventListener('click', () => { app.sound('page'); ov.remove(); });
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.addEventListener('keydown', function esc2(e) {
    if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', esc2); }
  });
  document.body.appendChild(ov);
  app.sound('page');
}

/* ---------------- decision: stamps + report ---------------- */
export function renderDecision(app, root, result) {
  const { approved, denied, teams, report, scoreDelta } = result;
  const approvedIds = new Set(approved.map(c => c.id));
  const teamOf = (id) => teams.find(tm => tm.members.includes(id));
  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">THE SEAL FALLS · ANNO ${app.state.year}</p>
    <div class="desk decided">
      ${[...approved, ...denied].map((c, i) => {
        const isAppr = approvedIds.has(c.id);
        const tm = isAppr ? teamOf(c.id) : null;
        return `
      <article class="pcard ${isAppr ? 'approved' : 'denied'}" data-id="${esc(c.id)}">
        <h3 class="pcard-name">${esc(c.name)}</h3>
        <p class="pcard-dest">⛵ ${esc(destName(app, c.destination || c.destination))}</p>
        ${tm ? `<p class="team-tag">⛪ sails in company (${tm.size})</p>` : ''}
        <div class="stamp ${isAppr ? 'stamp-approved' : 'stamp-denied'}" style="animation-delay:${i * 0.35}s" aria-hidden="true">
          ${isAppr ? 'APPROVED' : 'DENIED'}
        </div>
      </article>`; }).join('')}
    </div>
    <div class="report-card" id="decision-report" hidden>
      <h3 class="px">CONSEQUENCE</h3>
      <p><strong>${esc(report.summary)}</strong></p>
      <p>${esc(report.detail)}</p>
      ${scoreDelta ? `<p class="delta ${scoreDelta >= 0 ? 'pos' : 'neg'}">SCORE ${scoreDelta >= 0 ? '+' : ''}${scoreDelta}</p>` : ''}
      <p class="howto-note">The seal has fallen. Tend to your other duties — then close the year from the Briefing tab.</p>
      <div class="btn-row"><button class="gbtn primary" id="to-briefing">Return to the Briefing →</button></div>
    </div>
  </section>`;

  // stamp animation + thud, staggered; then reveal report
  const stamps = [...root.querySelectorAll('.stamp')];
  app.sound('thud');
  setTimeout(() => app.sound('thud'), 350);
  setTimeout(() => app.sound('thud'), 700);
  const total = app.prefersReducedMotion() ? 100 : 1400;
  setTimeout(() => {
    root.querySelector('#decision-report').hidden = false;
    app.bumpScore();
    app.sound('page');
  }, total);

  const toBrief = root.querySelector('#to-briefing');
  if (toBrief) toBrief.addEventListener('click', () => { app.sound('page'); app.go('briefing'); });
}

/* ---------------- year report ---------------- */
export function renderYearReport(app, root, res) {
  const yr = res.yearReport;
  const badgeFor = (o) => o.historical
    ? '<span class="badge hist">historical</span>'
    : '';
  const ev = (e) => `<li><strong>${esc(e.title)}.</strong> ${esc(e.text)} ${badgeFor(e)}</li>`;
  const deltaFor = (d) => d
    ? ` <span class="delta ${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '+' : ''}${d}</span>`
    : '';
  const oc = (o) => `<li class="oc-${o.result}">${esc(o.text)}${deltaFor(o.delta)} ${badgeFor(o)}</li>`;
  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">THE YEAR TURNS</p>
    <h2 class="year-head px">ANNO ${yr.year} — ACCOUNT RENDERED</h2>
    <div class="report-card">
      ${yr.departed ? `<p>⛵ <strong>${esc(yr.departed.name)}</strong> sailed for ${esc(destName(app, yr.departed.destination))}.</p>` : `<p>No ship sailed this year.</p>`}
      ${yr.outcomes.length ? `<h3 class="sect">At sea</h3><ul class="news-list">${yr.outcomes.map(oc).join('')}</ul>` : ''}
      ${yr.eventsFired.length ? `<h3 class="sect">What befell the world</h3><ul class="news-list">${yr.eventsFired.map(ev).join('')}</ul>` : ''}
      <p class="sim-note">Voyages and their outcomes are simulated for the game.</p>
    </div>
    <div class="btn-row">
      <button class="gbtn" id="view-map">Chart the missions</button>
      <button class="gbtn primary" id="next-year">Begin anno ${yr.year + 1} →</button>
    </div>
  </section>`;
  root.querySelector('#view-map').addEventListener('click', () => { app.sound('page'); app.go('map', { from: 'yearreport' }); });
  root.querySelector('#next-year').addEventListener('click', () => { app.sound('page'); app.nextYear(); });
}

function renderQueueAssignment(app, ships, tiers) {
  const queue = (app.state.queue || []).filter((q) => q.status === 'awaiting');
  if (!queue.length) return '<p class="disp-mini">No men awaiting departure.</p>';
  
  const freeShips = ships.filter((s) => (s.freeYear || 0) <= app.state.year);
  const destName = (id) => app.Engine.DESTINATIONS?.[id]?.name || id;
  
  const rows = queue.map((q) => {
    const assignedShip = q.shipId ? ships.find((s) => s.id === q.shipId) : null;
    const options = freeShips.map((s) => {
      const ti = tiers[s.tier || 'carrack'] || { label: 'Carrack' };
      const sel = q.shipId === s.id ? ' selected' : '';
      return `<option value="${s.id}"${sel}>${esc(s.name)} (${ti.label})</option>`;
    }).join('');
    return `<div class="queue-row${q.held ? ' held' : ''}">
      <span class="queue-name">${nameLink(app, q.petitionerId, q.petitionerName || q.petitionerId)}</span>
      <span class="queue-dest">→ ${esc(destName(q.destination))}</span>
      ${q.held
        ? `<span class="queue-held-note">⚓ held at dock — laboring in the port</span>
           <button class="gbtn small ghost dock-hold-btn" data-pid="${esc(q.petitionerId)}" data-held="1">Release</button>`
        : `<select class="queue-ship" data-pid="${esc(q.petitionerId)}" aria-label="Assign ship">
        <option value="">Auto</option>
        ${options}
      </select>
      ${assignedShip ? `<span class="queue-assigned">on ${esc(assignedShip.name)}</span>` : ''}
      <button class="gbtn small ghost dock-hold-btn" data-pid="${esc(q.petitionerId)}" data-held="0">Hold at dock</button>`}
    </div>`;
  }).join('');

  return `<div class="queue-list">${rows}</div>
    <p class="disp-mini">Assign men to ships, or leave on Auto. If a ship is full at departure, excess men wait. Men held at dock do not board — they labor in the port and earn their grade income until released; the first ${(app.Engine.RESOURCES && app.Engine.RESOURCES.DOCK_WAGE_CAP) ?? 8} held men in the queue are paid, the rest wait unpaid.</p>`;
}

/* ---------------- map screen ---------------- */
function rangeLabel(range) {
  if (range >= 3) return 'Far East';
  if (range >= 2) return 'Ocean';
  return 'Coastal';
}

export function renderCrewReview(app, root) {
  const ships = (app.state.resources?.ships || []).filter((s) => (s.freeYear || 0) <= app.state.year);
  const tiers = app.Engine.RESOURCES?.SHIP_TIERS || {};
  const staged = app.ui.stagedApprovals || [];
  const destName = (id) => app.Engine.DESTINATIONS?.[id]?.name || id;
  
  // Group staged approvals by ship (using the shipId in each approval)
  // Auto-assign any without a ship (smallest sufficient ship first)
  const byShip = {};
  const unassigned = [];
  const partySize = (a) => {
    let n = 1;
    const comp = a.companions;
    if (typeof comp === 'number') n += comp;
    else if (comp && typeof comp === 'object') n += Object.values(comp).reduce((x, y) => x + (y || 0), 0);
    return n;
  };
  // Sort ships by capacity (smallest first) for efficient packing
  const sortedShips = [...ships].sort((a, b) => {
    const ta = tiers[a.tier || 'carrack'] || tiers.carrack;
    const tb = tiers[b.tier || 'carrack'] || tiers.carrack;
    return ta.capacity - tb.capacity;
  });
  for (const a of staged) {
    // Auto-assign if no ship picked (smallest ship with range and capacity)
    if (!a.shipId) {
      const destInfo = app.Engine.DESTINATIONS?.[a.destination];
      const travel = destInfo?.travelYears ?? 2;
      // Track used capacity
      const used = {};
      for (const s of ships) used[s.id] = 0;
      for (const [sid, men] of Object.entries(byShip)) {
        used[sid] = men.reduce((sum, m) => sum + partySize(m), 0);
      }
      const size = partySize(a);
      for (const s of sortedShips) {
        const ti = tiers[s.tier || 'carrack'] || tiers.carrack;
        if (ti.range < travel) continue;
        if ((used[s.id] || 0) + size <= ti.capacity) {
          a.shipId = s.id;
          break;
        }
      }
    }
    if (a.shipId) {
      if (!byShip[a.shipId]) byShip[a.shipId] = [];
      byShip[a.shipId].push(a);
    } else {
      unassigned.push(a);
    }
  }
  
  // Helper to get name from terna card
  const getName = (approval) => {
    const terna = app.state.currentYear?.terna || [];
    const card = terna.find((c) => c.id === approval.id || c.petitionerId === approval.id);
    return card?.name || approval.id;
  };
  const shipCards = ships.map((s) => {
    const ti = tiers[s.tier || 'carrack'] || { label: 'Carrack', range: 2, capacity: 8 };
    const men = byShip[s.id] || [];
    const used = men.reduce((sum, a) => sum + partySize(a), 0);
    const pct = Math.round((used / ti.capacity) * 100);
    const menHtml = men.map((a) => `
      <button class="crew-man" data-pid="${esc(a.id)}" data-ship="${s.id}">
        ${esc(getName(a))} → ${esc(destName(a.destination))} (${partySize(a)})
      </button>`).join('');
    const overbooked = used > ti.capacity;
    return `<div class="crew-ship${overbooked ? ' overbooked' : ''}" data-ship-id="${s.id}">
      <div class="crew-ship-head">${esc(s.name)} <span class="logi-tier">${esc(ti.label)} · ${rangeLabel(ti.range)}</span></div>
      <div class="logi-cap-bar"><div class="logi-cap-fill" style="width:${Math.min(100, pct)}%;${overbooked ? 'background:#c0392b;' : ''}"></div></div>
      <div class="logi-cap-text">${used}/${ti.capacity} men${overbooked ? ' — OVERBOOKED (excess will wait)' : ''}</div>
      <div class="crew-men">${menHtml || '<span class="disp-mini">Empty</span>'}</div>
    </div>`;
  }).join('');
  
  const unassignedHtml = unassigned.length
    ? `<div class="crew-section"><h3 class="px">UNASSIGNED</h3><div class="crew-men">` +
      unassigned.map((a) => `
        <button class="crew-man" data-pid="${esc(a.id)}" data-ship="">
          ${esc(getName(a))} → ${esc(destName(a.destination))} (${partySize(a)})
        </button>`).join('') + `</div></div>`
    : '';
  
  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">CREW REVIEW · ANNO ${app.state.year}</p>
    <h2 class="px">Review the crews</h2>
    <p class="desk-instr">Tap a man, then tap a ship to move him. Tap again to deselect.</p>
    <div class="crew-ships">${shipCards}</div>
    ${unassignedHtml}
    <div class="btn-row">
      <button class="gbtn" id="crew-back">← Back to terna</button>
      <button class="gbtn primary" id="crew-seal">Seal & sail →</button>
    </div>
  </section>`;
  
  // Selection and move logic
  let selectedPid = null;
  root.querySelectorAll('.crew-man').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.pid;
      if (selectedPid === pid) {
        // Deselect
        selectedPid = null;
        root.querySelectorAll('.crew-man').forEach((b) => b.classList.remove('selected'));
      } else {
        // Select
        selectedPid = pid;
        root.querySelectorAll('.crew-man').forEach((b) => b.classList.toggle('selected', b.dataset.pid === pid));
        app.sound('tick');
      }
    });
  });
  
  root.querySelectorAll('.crew-ship').forEach((shipEl) => {
    shipEl.addEventListener('click', (e) => {
      // Don't trigger if clicking a man button
      if (e.target.closest('.crew-man')) return;
      if (!selectedPid) return;
      const shipId = shipEl.dataset.shipId;
      const ship = ships.find((s) => s.id === shipId);
      const approval = staged.find((a) => a.id === selectedPid);
      if (approval && ship) {
        // Validate range
        const ti = tiers[ship.tier || 'carrack'] || tiers.carrack;
        const destInfo = app.Engine.DESTINATIONS?.[approval.destination];
        const travel = destInfo?.travelYears ?? 2;
        if (ti.range < travel) {
          const over = travel - ti.range;
          const penalty = over * 3;
          if (!confirm(`${ship.name} is punching above its range to reach ${destName(approval.destination)}. Voyage roll takes -${penalty}, and the ship will be lost if the voyage ends in death. Proceed?`)) {
            return;
          }
        }
        approval.shipId = shipId;
        app.sound('tick');
        app.go('crew'); // refresh
      }
    });
  });
  
  root.querySelector('#crew-back').addEventListener('click', () => {
    app.sound('page');
    app.go('indipetae'); // back to terna, decisions preserved in app.ui.decisions
  });
  root.querySelector('#crew-seal').addEventListener('click', () => {
    app.sound('page');
    app.sealAndSail();
  });
}

export function renderLogistics(app, root) {
  const ships = app.state.resources?.ships || [];
  const berths = app.state.resources?.berths || 0;
  const year = app.state.year;
  const voyages = (app.state.voyages || []).filter((v) => !v.resolvedYear || v.resolvedYear > year);
  const tiers = app.Engine.RESOURCES?.SHIP_TIERS || {};

  // Count assigned men from the queue (live, updates with staffing changes)
  const queue = app.state.queue || [];
  const shipCards = ships.map((s) => {
    const tierInfo = tiers[s.tier || 'carrack'] || { label: 'Carrack', range: 2, capacity: 8 };
    const capacity = tierInfo.capacity;
    const isFree = (s.freeYear || 0) <= year;
    // For ships in port: count queue assignments. For ships at sea: use voyage data.
    const assigned = queue.filter((q) => q.shipId === s.id && q.status === 'awaiting').length;
    const voy = voyages.find((v) => v.shipId === s.id && !v.resolvedYear);
    const used = isFree ? assigned : (voy?.men || s.used || 0);
    const pct = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
    // A ship at sea on a route carries men for several stops: name the
    // route; a single-stop sailing names its destination.
    const seaDests = [...new Set(voyages.filter((v) => v.shipId === s.id && v.stage === 'transit').map((v) => v.destination))];
    const seaRoute = seaDests.length ? app.Engine.routeName(app.Engine.routeOf(seaDests[0])) : null;
    const destName = seaDests.length > 1 && seaRoute
      ? `${seaRoute} (${seaDests.map((d) => (app.Engine.DESTINATIONS?.[d]?.name) || d).join(', ')})`
      : (voy ? ((app.Engine.DESTINATIONS?.[voy.destination]?.name) || voy.destination) : null);
    // In port, assigned men bound for several stops show their route too.
    const portDests = [...new Set(queue.filter((q) => q.shipId === s.id && q.status === 'awaiting').map((q) => q.destination))];
    const portRoute = isFree && portDests.length > 1 ? app.Engine.routeName(app.Engine.routeOf(portDests[0])) : null;
    // Show assigned men names for ships in port
    const assignedNames = isFree && assigned > 0
      ? queue.filter((q) => q.shipId === s.id && q.status === 'awaiting').map((q) => esc(q.petitionerName || q.petitionerId)).join(', ')
      : '';
    return `
    <div class="logi-ship">
      <div class="logi-ship-info">
        <div class="logi-ship-name">${esc(s.name)} <span class="logi-tier">${esc(tierInfo.label)} · ${rangeLabel(tierInfo.range)}</span></div>
        <div class="logi-ship-status">${isFree ? '<span class="logi-free">In port</span>' : `<span class="logi-away">At sea → ${esc(destName || 'unknown')}</span>`}</div>
        <div class="logi-cap-bar"><div class="logi-cap-fill" style="width:${pct}%"></div></div>
        <div class="logi-cap-text">${used}/${capacity} men${!isFree && s.freeYear ? ` · returns ${s.freeYear}` : ''}</div>
        ${assignedNames ? `<div class="logi-assigned">Aboard: ${assignedNames}</div>` : ''}
        ${portRoute ? `<div class="logi-assigned">Sails the ${esc(portRoute)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  // Berths: used this year (from voyages departed this year)
  const departedThisYear = (app.state.voyages || []).filter((v) => v.departedYear === year).length;

  root.innerHTML = `
  <section class="gscreen">
    <h2 class="px">LOGISTICS</h2>
    <p class="desk-instr">Hulls carry the men; berths are dock space — each ship outfitting needs one. A ship at sea is busy until its return year.</p>
    <div class="logi-section">
      <h3 class="px">BERTHS</h3>
      <p><strong>${berths}</strong> berths in port · <strong>${departedThisYear}</strong> ships outfitting</p>
      <p class="disp-mini">Commission +1 berth for 400 scudi (Governance).</p>
    </div>
    <div class="logi-section">
      <h3 class="px">SHIPS (${ships.length})</h3>
      <div class="logi-ships">${shipCards || '<p class="disp-mini">No ships.</p>'}</div>
      <p class="disp-mini">Caravel: 4 men · Carrack: 8 men · Galleon: 12 men. Charter in Governance.</p>
    </div>
    <div class="logi-section">
      <h3 class="px">DEPARTURE QUEUE</h3>
      ${renderQueueAssignment(app, ships, tiers)}
    </div>
    <div class="logi-section">
      <h3 class="px">RESERVED FOR MISSIONS</h3>
      ${(() => {
        const reserved = (app.state.europeanLabor || []).filter((e) => e.reservedFor);
        if (!reserved.length) return '<p class="disp-mini">No men reserved. Unassign men from ships in Crew Review to reserve them.</p>';
        return `<ul class="formation-list">${reserved.map((e) => {
          const name = app.Engine.personName ? app.Engine.personName(app.state, e.petitionerId) : e.name;
          return `<li class="formation-row">
            ${nameLink(app, e.petitionerId, name)}
            <span class="disp-mini reserve-badge">reserved: ${esc(e.reservedForName || e.reservedFor)}</span>
            <button class="gbtn small" data-reserve-call="${esc(e.petitionerId)}">Call to dock</button>
            <button class="gbtn small ghost" data-reserve-release="${esc(e.petitionerId)}">Release reserve</button>
          </li>`;
        }).join('')}</ul>
        <p class="disp-mini">A man called to the dock waits held, earning dock wages, until you release him onto a ship.</p>`;
      })()}
    </div>
  </section>`;
  
  // Ship assignment handlers
  root.querySelectorAll('.queue-ship').forEach((sel) => {
    sel.addEventListener('change', () => {
      const pid = sel.dataset.pid;
      const shipId = sel.value;
      try {
        if (shipId) {
          app.Engine.assignToShip(app.state, pid, shipId);
        } else {
          app.Engine.unassignFromShip(app.state, pid);
        }
        app.save();
        app.go('logistics'); // refresh
      } catch (e) {
        app.toast(e.message);
        app.go('logistics'); // refresh to reset the select
      }
    });
  });
  root.querySelectorAll('.dock-hold-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        app.Engine.setDockHold(app.state, btn.dataset.pid, btn.dataset.held !== '1');
        app.save();
        app.sound('page');
        app.go('logistics'); // refresh
      } catch (e) {
        app.toast(e.message);
      }
    });
  });

  root.querySelectorAll('[data-reserve-call]').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        app.Engine.callReserveToDock(app.state, btn.dataset.reserveCall);
        app.save();
        app.sound('page');
        app.go('logistics'); // refresh
      } catch (e) {
        app.toast(e.message);
      }
    });
  });
  root.querySelectorAll('[data-reserve-release]').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        app.Engine.unreserve(app.state, btn.dataset.reserveRelease);
        app.save();
        app.sound('page');
        app.go('logistics'); // refresh
      } catch (e) {
        app.toast(e.message);
      }
    });
  });
  attachNameLinks(app, root);
}

export function renderMapScreen(app, root, from) {
  root.innerHTML = `
  <section class="gscreen map-screen">
    <div id="map-host"></div>
    <div class="btn-row"><button class="gbtn" id="map-back">← Back</button></div>
  </section>`;
  const mapState = app.getMapState();
  // lazy-load map module already imported by app; render here via app helper
  app.drawMap(root.querySelector('#map-host'), mapState, (port, panel) => {
    panel.innerHTML = destPanelHTML(app, mapState, port);
  });
  root.querySelector('#map-back').addEventListener('click', () => { app.sound('page'); app.go(from || 'desk'); });
}

function destPanelHTML(app, mapState, port) {
  if (!port.dest) {
    const blurb = {
      lisbon: 'Home port. The carracks of the Carreira da Índia sail hence for Goa.',
      seville: 'Home port. The flotas sail hence for the Indies of the West.',
      rome: 'The Generalate. Your desk; the seals; the weight of every letter.',
      manila: 'No Jesuit mission sails hence yet — the Philippines wait upon Providence.',
    }[port.id] || 'A port on the chart.';
    return `<h3 class="px">${esc(port.label)}</h3><p>${esc(blurb)}</p>`;
  }
  const d = mapState.destinations[port.dest];
  const voyages = mapState.voyages.filter(v => v.destination === port.dest);
  const enroute = voyages.filter(v => v.status === 'enroute');
  const arrived = voyages.filter(v => v.status === 'arrived');
  const status = d.closed ? '<span class="badge danger">CLOSED</span>' : '<span class="badge ok">OPEN</span>';
  return `
    <h3 class="px">${esc(d.name)} ${status}</h3>
    <p class="dp-port">by way of ${esc(d.port)}</p>
    <p>${esc(d.access)}</p>
    <dl class="dossier-list">
      <div><dt>Danger</dt><dd>${'●'.repeat(d.danger)}${'○'.repeat(4 - d.danger)}</dd></div>
      <div><dt>Active missions</dt><dd>${d.missions}</dd></div>
      <div><dt>Arrived</dt><dd>${d.arrived}</dd></div>
      <div><dt>Lost</dt><dd>${d.lost}</dd></div>
    </dl>
    ${enroute.length ? `<h4>At sea now</h4><ul class="news-list">${enroute.map(v => `<li>⛵ ${esc(v.name)} — sailed ${v.departYear}</li>`).join('')}</ul>` : ''}
    ${arrived.length ? `<h4>Labouring there</h4><ul class="news-list">${arrived.map(v => `<li>✠ ${esc(v.name)} — arrived ${v.arriveYear}</li>`).join('')}</ul>` : ''}
    ${!enroute.length && !arrived.length ? `<p class="gmap-hint">No mission assigned yet.</p>` : ''}`;
}

/* ---------------- Collapse imminent popup ---------------- */
export function showCollapseWarning(app, missions) {
  if (!missions || !missions.length) return;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
  <div class="overlay-card collapse-card" role="alertdialog" aria-modal="true" aria-label="Collapse warning">
    <h2 class="px" style="color:#c0392b;">⚠ COLLAPSE IMMINENT</h2>
    ${missions.map(m => `
      <p><strong>${esc(m.name)}</strong> — ${m.staffed} of ${m.capacity} places filled. Below 25% for two years. It will collapse next year unless reinforced.</p>
    `).join('')}
    <button class="btn primary collapse-ack">I understand</button>
  </div>`;
  ov.querySelector('.collapse-ack').addEventListener('click', () => {
    app.sound('page');
    ov.remove();
  });
  document.body.appendChild(ov);
  app.sound('page');
}

/* ---------------- Death notification popup ---------------- */
export function showDeathNotice(app, deaths) {
  if (!deaths || !deaths.length) return;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
  <div class="overlay-card" role="alertdialog" aria-modal="true" aria-label="Deaths">
    <h2 class="px">REQUIESCANT IN PACE</h2>
    ${deaths.map(d => `<p>${esc(d.text)}</p>`).join('')}
    <button class="btn primary death-ack">Requiem aeternam</button>
  </div>`;
  ov.querySelector('.death-ack').addEventListener('click', () => {
    app.sound('page');
    ov.remove();
  });
  document.body.appendChild(ov);
  app.sound('page');
}

/* ---------------- Mass of the Holy Spirit opening ---------------- */
export function showMassOverlay(app, onContinue) {
  const yv = app.Engine.yearVirtue(app.state.seed, app.state.year);
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
  <div class="overlay-card mass-card" role="dialog" aria-modal="true" aria-label="Mass of the Holy Spirit">
    <h2 class="px">MASS OF THE HOLY SPIRIT</h2>
    <p class="mass-sub">Anno ${app.state.year} — The Generalate opens the year in prayer at the Gesù.</p>
    <div class="mass-image">
      <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAUKBT8DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+f+iiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA9x/Y9/4Jw/ti/t8WPiG8/ZN+FEXiw+FpbVNcgHiLT7KS2Fx5vlORdzxAqTE4yD1HGcNj2T/iHb/4LGf9Gdv/AOF74f8A/k+vtf8A4M9un7RP08I/+5qv2wr8n4r8QMw4fzmeDpUoyjFJ3d76pPo13PpssyTD47CKrKTT12t39D+Xj/iHb/4LGf8ARnb/APhe+H//AJPo/wCIdv8A4LGf9Gdv/wCF74f/APk+v6h6K+bj4t5u3/Ah/wCTf5no/wCq+E/nl+H+R/HR+0n+z98av2SviTqv7OX7QGk/2P4o0X7HJqOhJf294LTzIGnRGkhkdUcLcZ2AkHzC2cbS3nVfav8AwcR/8pi/jD9fD/8A6j2m18VV+44DEyxmApV5bzjGX3pP9T47EQVKvKC2Ta+5hRRRXWYhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAftb/wZ7dP2if8AuUv/AHNV+19fih/wZ7dP2if+5S/9zVftfX80+JX/ACVdX0j/AOko/QuHv+RbD1f5sKKKK/P4fEj2j+Xj/g4j/wCUxfxh+vh//wBR7Ta+Kq+1f+DiP/lMX8Yfr4f/APUe02viqv7CyT/kS4b/AK9w/wDSUflmN/3yp/if5sKKKK9Q5gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP2t/4M9un7RP/cpf+5qv2vr8UP8Agz26ftE/9yl/7mq/a+v5o8S/+Sqq+kf/AEmJ+hcPf8i2Hq/zYUUUV8BD4ke0fy8f8HEf/KYv4w/Xw/8A+o9ptfFVfav/AAcR/wDKYv4w/Xw//wCo9ptfFVf2Fkn/ACJcN/17h/6Sj8sxv++VP8T/ADYUUUV6hzBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAftb/wAGe3T9on/uUv8A3NV+19fih/wZ7dP2if8AuUv/AHNV+19fzT4lf8lXV9I/+ko/QuHv+RbD1f5sKKKK/P4/Ej2j+Xj/AIOI/wDlMX8Yfr4f/wDUe02viqvtX/g4j/5TF/GH6+H/AP1HtNr4qr+wsk/5EuG/69w/9JR+WY3/AHyp/if5sKKKK9Q5gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAK/qF/4h2f+CN//AEZ5J/4cDxD/APJ1fy9V/a5X5d4nZtmWVYbDSwdWUG3K/K7Xty7n0vDeHw+Iq1FVgpWtv8z4o/4h2f8Agjf/ANGeSf8AhwPEP/ydR/xDs/8ABG//AKM8k/8ADgeIf/k6vteivxz/AFv4m/6DJ/8AgbPqf7Ky7/n0vuR8Uf8AEOz/AMEb/wDozyT/AMOB4h/+TqP+Idn/AII3/wDRnkn/AIcDxD/8nV9r0Uf638Tf9Bk//A2P+ysu/wCfS+5HxR/xDs/8Eb/+jPJP/DgeIf8A5Oo/4h2f+CN//Rnkn/hwPEP/AMnV9r0Uf638Tf8AQZP/AMDZH9l5d/z6X3I8O/ZI/wCCef7IP7AkOvQfsi/CAeFB4ra3OvE6/eX7XP2fzTAN11cSHAMpIGcAsTjk17L5sv8AfH51Jf8A8H/A6r18zmGY43H4v2+JqOc31buz08PQoUaXJTVkSebL/fH50ebL/fH51HRXDz1Do5KR8y/tHf8ABHj/AIJx/tdfGHUfjp+0P+z43iDxVq6RJf6q3i7WLVHEMJj+5Dexrn5OuM1wv/EPF/wR6/6NBP8A4cHxB/8AJ1falFe/h+L+JcPSVGni5pR6czOGeV5dUnd0k36I+K/+IeP/AII8/wDRoB/8OF4g/wDk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pD/0hH6Zwz/yKY/P82FFFFfnMfiR7b2P5hf+Dhz/AJTC/F/66B/6j+m18W19pf8ABw5/ymF+L/10D/1H9Nr4tr+1cg/5EWF/69w/9JR+RY3/AHyp/il+bCiiivWOUKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP6+f8Ag10Gf+CFnwNH/Yzf+pPqtfoEEA681+f3/Brl/wAoLfgZ9PE//qT6rX6BVPLETb5gwPQUjKuDxS0N0P0o5Y9ilufwB0UUVQgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAPv3/g12/wCU6nwN/wC5m/8AUY1av6/k+6K/kB/4Ndv+U6nwN/7mb/1GNWr+v5Puin0H0FooopCP5/v+D5jr+y7/ALvjX/3A1+Alfv3/AMHzHX9l3/d8a/8AuBr8BKbG9wooopCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD9p/+DP/AK/tDfXwl/7mq/aWvxd/4M+v+biP93wn/LWq/ar7B/s/pX8u+KNJz4uq+kP/AElH6Vw3OMcph6v82V6KsfYP9n9KPsH+z+lfnUaEuZHtOULH8vv/AAcOf8phfi/9dA/9R/Ta+La+1P8Ag4f/AOUxHxf/AO5f/wDUf02viuv7SyFWyPC/9e4f+ko/Jcb/AL5U/wAUvzYUUUV6pyhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/Xz/AMGuX/KC/wCBn08Tf+pPqtfoHX5+f8GuX/KC/wCBn08Tf+pPqtfoHSlsNhQ3Q/Sihuh+lMFufwB0UUUCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA+/f8Ag12/5TqfA3/uZv8A1GNWr+v5Puiv5Af+DXb/AJTqfA3/ALmb/wBRjVq/r+T7op9B9BaKKKQj+f7/AIPmOv7Lv+741/8AcDX4CV+/f/B8x1/Zd/3fGv8A7ga/ASmxvcKKKKQgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/a3/gz26ftE/wDcpf8Auar9r6/FD/gz26ftE/8Acpf+5qv2vr+aPEr/AJKyr6R/9JR+hcPf8i2Hq/zYUUUV8BD4ke0fy8f8HEf/ACmL+MP18P8A/qPabXxVX2r/AMHEf/KYv4w/Xw//AOo9ptfFVf2Fkn/Ilw3/AF7h/wCko/LMb/vlT/E/zYUUUV6hzBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/Xz/wa5f8oL/gZ9PE3/qT6rX6B1+fn/Brl/ygv+Bn08Tf+pPqtfoHSnsVIKG6H6UUN0P0piW5/AHRRRQIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoor9XP+DaL9gD9kb/AIKE6L8aPDn7X3wiPi6z8HyeG5dAX/hJNSsDbvcnVVZd1nMmUym4Ljq7E5yMcGaZlhsowE8XX+CGrt62/U2oUZYiqqcd2flHRX9UH/EN7/wRk/6M4H/hwvEn/wAnUn/EN9/wRk/6M4/8yF4k/wDk6vz/AP4i1wr2qf8AgK/+SPV/sDH+X3v/ACP5YKK/qf8A+Ib7/gjL/wBGb/8AmQ/En/ydX4L/APBcj4H/AAg/Zh/4KX/EP9nX4A+BR4a8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AUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/2Q==" alt="High altar in red for the Mass of the Holy Spirit" class="mass-altar-img">
    </div>
    <blockquote class="mass-verse">
      <p class="mass-text">${esc(yv.text || '')}</p>
      <p class="mass-ref">${esc(yv.ref)} — Douay-Rheims</p>
    </blockquote>
    <p class="mass-hint">The Spirit guides the year's governance. Discern the virtue He commends.</p>
    <button class="btn primary mass-continue">Begin the Year</button>
  </div>`;
  ov.querySelector('.mass-continue').addEventListener('click', () => {
    app.sound('page');
    ov.remove();
    if (onContinue) onContinue();
  });
  document.body.appendChild(ov);
  app.sound('page');
}

/* ---------------- ledger overlay ---------------- */
export function showLedgerOverlay(app) {
  const entries = app.Engine.getLedger(app.state, {});
  // Group by year, newest first
  const byYear = {};
  for (const e of entries) {
    const y = e.year || '?';
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(e);
  }
  const years = Object.keys(byYear).sort((a, b) => b - a);
  // Score breakdown: where the tally came from, by source and by year.
  const sb = app.Engine.scoreBreakdown(app.state);
  const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
  const breakdownHtml = `
    <div class="ledger-score">
      <div class="ledger-score-head">SCORE ${sb.displayed} <span class="ledger-score-uncapped">(${signed(sb.uncapped - sb.start)} on the tally)</span></div>
      ${sb.rows.map(r => `
        <div class="ledger-score-row"><span>${esc(r.label)}</span><span>${signed(r.total)}</span></div>
      `).join('')}
      ${sb.unrecorded !== 0 ? `
        <div class="ledger-score-row"><span>Earlier play (not itemized)</span><span>${signed(sb.unrecorded)}</span></div>
      ` : ''}
    </div>`;

  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
  <div class="overlay-card ledger-book" role="dialog" aria-modal="true" aria-label="Ledger">
    <button class="overlay-close" aria-label="Close ledger">✕</button>
    <h2 class="px">THE LEDGER</h2>
    <p class="ledger-sub">A chronicle of the Generalate, year by year.</p>
    ${breakdownHtml}
    <div class="ledger-pages">
      ${years.map(y => `
        <section class="ledger-year">
          <h3 class="ledger-year-head">Anno ${y}${sb.byYear[y] ? ` <span class="ledger-year-score">score ${signed(sb.byYear[y])}</span>` : ''}</h3>
          <div class="ledger-entries">
            ${byYear[y].map(e => `
              <div class="ledger-entry ledger-${esc(e.type || 'event')}">
                <span class="ledger-entry-type">${esc((e.type || 'event').toUpperCase())}</span>
                <span class="ledger-entry-text">${esc(e.text || e.note || '')}</span>
              </div>
            `).join('')}
          </div>
        </section>
      `).join('') || '<p class="gmap-hint">The pages are blank. No entries yet.</p>'}
    </div>
  </div>`;
  ov.querySelector('.overlay-close').addEventListener('click', () => { app.sound('page'); ov.remove(); });
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  app.sound('page');
}

/* ---------------- Deceased book (martyrology) ---------------- */
export function showDeceasedBook(app) {
  const E = app.Engine;
  const deaths = (app.state.ledger || []).filter(e => e.type === 'martyrdom' || e.type === 'death');
  // Group by year
  const byYear = {};
  for (const d of deaths) {
    const y = d.year || '?';
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(d);
  }
  const years = Object.keys(byYear).sort((a, b) => b - a);

  const getBirthYear = (text) => {
    // Try to find petitioner by name in text
    const m = text.match(/^(.+?) (was martyred|died of disease)/);
    if (!m) return '?';
    const name = m[1];
    for (const [pid, p] of Object.entries(app.state.petitioners || {})) {
      try {
        if (E.personName(app.state, pid) === name && p.entryYear && p.age) {
          return p.entryYear - p.age;
        }
      } catch (e) {}
    }
    return '?';
  };

  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
  <div class="overlay-card ledger-book" role="dialog" aria-modal="true" aria-label="Deceased">
    <button class="overlay-close" aria-label="Close">✕</button>
    <h2 class="px">REQUIESCANT IN PACE</h2>
    <p class="ledger-sub">The fallen of the Society, year by year.</p>
    <div class="ledger-pages">
      ${years.map(y => `
        <section class="ledger-year">
          <h3 class="ledger-year-head">Anno ${y}</h3>
          ${byYear[y].map(d => {
            const isMartyr = d.type === 'martyrdom';
            const birth = getBirthYear(d.text || '');
            const dest = d.destination ? (E.DESTINATIONS?.[d.destination]?.name || d.destination) : '';
            const nm = (d.text || '').split(/ was martyred| died of disease/)[0];
            const link = d.petitionerId
              ? nameLink(app, d.petitionerId, nm)
              : `<span class="deceased-name ${isMartyr ? 'martyr' : 'disease'}">${esc(nm)}</span>`;
            return `
            <div class="ledger-entry">
              <span class="deceased-name ${isMartyr ? 'martyr' : 'disease'}">${link}</span>
              <span class="ledger-entry-text">
                (${birth}–${y}) ${isMartyr ? '☩ martyred' : 'died of disease'}${dest ? ` at ${esc(dest)}` : ''}
              </span>
            </div>`;
          }).join('')}
        </section>
      `).join('') || '<p class="gmap-hint">No deaths recorded.</p>'}
    </div>
  </div>`;
  attachNameLinks(app, ov);
  ov.querySelector('.overlay-close').addEventListener('click', () => { app.sound('page'); ov.remove(); });
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  app.sound('page');
}

/* ---------------- ending ---------------- */
/** End-of-generalate report card. Pure presentation over Engine.generalateReport:
 *  outcomes stated as facts, no grades, no judgments, no uncapped score. */
export function renderReportCard(report) {
  if (!report) return '';
  const o = report.outcomes, p = report.personnel, t = report.treasury, ins = report.institutions;
  const li = (k, v) => `<li><span class="rep-k">${esc(k)}</span><span class="rep-v">${v}</span></li>`;
  const soulsNote = p.souls > p.dispatched ? ` <span class="rep-sub">(${p.souls} men with companions)</span>` : '';
  const availNote = p.available === null ? 'not recorded' : p.available;
  const chestEnd = t.end === null ? 'not recorded' : `${t.end.toLocaleString('en-US')} scudi`;
  const chestNet = t.net === null ? '' : ` <span class="rep-sub">(${t.net >= 0 ? '+' : ''}${t.net.toLocaleString('en-US')})</span>`;
  const novitiateItems = ins.novitiates.length
    ? ins.novitiates.map((n) => `<li><span class="rep-k">${esc(n.name)}</span><span class="rep-v">${n.foundedYear}</span></li>`).join('')
    : `<li><span class="rep-k">None founded</span><span class="rep-v">—</span></li>`;
  const strengthenedBlock = ins.strengthenedUnknown
    ? `<li><span class="rep-k">Earlier reinforcements</span><span class="rep-v">not recorded in this account</span></li>`
    : (ins.strengthenedTotal > 0
      ? ins.strengthened.map((m) => `<li><span class="rep-k">${esc(m.name)}</span><span class="rep-v">${m.men} ${m.men === 1 ? 'man' : 'men'}</span></li>`).join('')
      : `<li><span class="rep-k">None dispatched</span><span class="rep-v">—</span></li>`);
  const eventsBlock = (report.events && report.events.length)
    ? `<div class="rep-block"><h4 class="px">Years of trial</h4><ul>` +
      report.events.map((e) => `<li><span class="rep-k">${e.year} — ${esc(e.title)}</span>` +
        `<span class="rep-v">${esc(e.effects || e.description)}</span></li>`).join('') + `</ul></div>`
    : '';
  return `
  <section class="report-card" aria-label="Account of the generalate">
    <p class="kicker px">THE ACCOUNT OF THE GENERALATE</p>
    <h3 class="px">What these years have yielded</h3>
    <p class="rep-narrative">${esc(report.narrative)}</p>
    <div class="rep-grid">
      <div class="rep-block"><h4 class="px">The missions</h4><ul>
        ${li('Thriving', o.thriving)}
        ${li('Returned to Europe', o.returned)}
        ${li('Fallen ill', o.ill)}
        ${li('Dead in the missions', o.deceased)}
      </ul></div>
      <div class="rep-block"><h4 class="px">The men</h4><ul>
        ${`<li><span class="rep-k">Embarked</span><span class="rep-v">${p.dispatched}${soulsNote}</span></li>`}
        ${li('By collective deployment', p.viaDeployment)}
        ${li('Still to spare', availNote)}
      </ul></div>
      <div class="rep-block"><h4 class="px">The chest</h4><ul>
        ${li('At the election', `${t.start.toLocaleString('en-US')} scudi`)}
        ${`<li><span class="rep-k">At the close</span><span class="rep-v">${chestEnd}${chestNet}</span></li>`}
      </ul></div>
      <div class="rep-block"><h4 class="px">Novitiates founded</h4><ul>${novitiateItems}</ul></div>
      <div class="rep-block"><h4 class="px">Missions strengthened</h4><ul>${strengthenedBlock}</ul></div>
      ${eventsBlock}
    </div>
  </section>`;
}
export function renderEnding(app, root, end) {
  const s = end.stats;
  root.innerHTML = `
  <section class="gscreen ending">
    <p class="kicker px">THE GENERAL LAYS DOWN HIS OFFICE</p>
    <h2 class="game-title px" style="font-size:1.4rem">${esc(end.title)}</h2>
    <div class="stats-grid">
      ${[['Years ruled', s.yearsRuled], ['Approved', s.approved], ['Denied', s.denied],
         ['Departed', s.departed], ['Arrived', s.arrived], ['Lost at sea', s.lost],
         ['Turned back', s.returned], ['Final score', s.finalScore]]
        .map(([k, v]) => `<div class="stat"><span class="bs-num">${v}</span><span class="bs-label">${k}</span></div>`).join('')}
    </div>
    <div class="reflection"><p>${esc(end.reflection)}</p></div>
    ${end.report ? renderReportCard(end.report) : ''}
    <p class="sim-note">Seed ${esc(s.seed)} · ${esc(s.mode)} — replay it exactly, or begin anew.</p>
    <div class="title-buttons">
      <button class="gbtn primary" id="again-campaign">New Historical Campaign</button>
      <button class="gbtn primary" id="again-endless">New Endless Generalate</button>
      <button class="gbtn ghost" id="export-data">Export game data</button>
      <button class="gbtn ghost" id="to-title">Title</button>
    </div>
  </section>`;
  root.querySelector('#again-campaign').addEventListener('click', () => app.newGame('campaign'));
  root.querySelector('#again-endless').addEventListener('click', () => app.newGame('endless'));
  root.querySelector('#export-data').addEventListener('click', () => {
    const { filename, json } = Playtest.buildSaveExport(app.Engine, app.state);
    Playtest.downloadJson(filename, json);
  });
  root.querySelector('#to-title').addEventListener('click', () => { app.clearSave(); app.go('title'); });
}

/* ---------------- debug ---------------- */
export function renderDebugPanel(app) {
  const dbg = app.Engine.__debug ? app.Engine.__debug() : { EVENTS: [], DESTINATIONS: [] };
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.innerHTML = `
    <h3 class="px">DEBUG</h3>
    <div class="debug-row">
      <label>Jump to year <input id="dbg-year" type="number" value="${app.state ? app.state.year : 1616}" min="1616" max="1700"></label>
      <button class="gbtn small" id="dbg-go">Go</button>
    </div>
    <div class="debug-row">
      <label>Fire event <select id="dbg-event">${dbg.EVENTS.map(e => `<option>${e}</option>`).join('')}</select></label>
      <button class="gbtn small" id="dbg-fire">Fire</button>
    </div>
    <div class="debug-row">
      <label>Force outcome <select id="dbg-voy">${(app.state ? app.state.voyages.filter(v => v.status === 'enroute') : []).map(v => `<option value="${v.id}">${esc(v.name)} → ${esc(v.destination)}</option>`).join('') || '<option value="">(none enroute)</option>'}</select>
      <select id="dbg-oc"><option>arrived</option><option>lost</option><option>returned</option></select></label>
      <button class="gbtn small" id="dbg-force">Force</button>
    </div>
    <div class="debug-row">
      <button class="gbtn small" id="dbg-soak">Run 50-round headless soak</button>
      <span id="dbg-soak-out" class="debug-out"></span>
    </div>
    <div class="debug-row"><button class="gbtn small" id="dbg-dump">State inspector</button></div>
    <pre id="dbg-json" class="debug-json" hidden></pre>
  `;
  panel.querySelector('#dbg-go').addEventListener('click', () => {
    const y = Number(panel.querySelector('#dbg-year').value);
    app.state.year = y; app.state.currentYear = null;
    app.save(); app.go('briefing');
  });
  panel.querySelector('#dbg-fire').addEventListener('click', () => {
    const id = panel.querySelector('#dbg-event').value;
    app.debugFireEvent(id);
  });
  panel.querySelector('#dbg-force').addEventListener('click', () => {
    const vid = panel.querySelector('#dbg-voy').value;
    const oc = panel.querySelector('#dbg-oc').value;
    if (vid) app.debugForceOutcome(vid, oc);
  });
  panel.querySelector('#dbg-soak').addEventListener('click', () => {
    const out = panel.querySelector('#dbg-soak-out');
    out.textContent = 'running…';
    setTimeout(() => {
      try {
        const r = app.debugSoak(50);
        out.textContent = `${r.rounds} rounds in ${r.ms}ms · final score ${r.score} · arrived ${r.arrived} · lost ${r.lost}`;
      } catch (e) { out.textContent = 'error: ' + e.message; }
    }, 30);
  });
  panel.querySelector('#dbg-dump').addEventListener('click', () => {
    const pre = panel.querySelector('#dbg-json');
    const { _rng, ...rest } = app.state || {};
    const s = JSON.stringify(rest, null, 1);
    pre.textContent = s.length > 12000 ? s.slice(0, 12000) + '\n…(truncated)' : s;
    pre.hidden = !pre.hidden;
  });
  return panel;
}