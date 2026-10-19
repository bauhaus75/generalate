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
        <h3 class="pcard-name">${esc(c.name)}</h3>
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
      <p><strong>2. The indipetae.</strong> Three petitioners lay their letters on your desk. Read each letter — the full text, the dossier, the man's history. No choice is marked; the weight is yours.</p>
      <p><strong>3. The decision.</strong> Select one petitioner, review your choice, and confirm. The seal falls: <em>APPROVED</em> on one, <em>DENIED</em> on two.</p>
      <p><strong>4. The year turns.</strong> Your chosen man sails. Storms, war, plague, and politics decide what your seal began. The ledger records everything.</p>
      <p><strong>5. The account.</strong> Your SCORE starts at 50. You are judged by fruit, not dispatches: score moves when voyage news arrives and through lasting foundations. Each approval costs 30 scudi for the seal. Campaign ends in 1645; in Endless mode, you lay down the office when you choose.</p>

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
      ${e.ill ? `<span class="disp-mini ill-badge" title="Recovering from illness suffered on voyage. Not available for assignment or dispatch.">🤒 recovering (ill ${e.illYear})</span>` : ''}
      ${stage ? `<span class="disp-mini">${esc(stage)}</span>` : ''}
      <span class="disp-mini">${dispLine(app, e.petitionerId)}</span>
      ${e.ill ? `<span class="disp-mini">No actions available while recovering.</span>`
      : asg ? `<span class="form-active">Assigned: ${esc(asg.name)} (since ${e.assignedYear || year})</span>
        <button class="gbtn small ghost domestic-release" data-id="${esc(e.petitionerId)}">Release</button>`
      : inForm ? `<span class="form-active">In formation: ${esc(fName)} until ${e.formation.until}</span>
        <label class="form-pick">Emergency dispatch:
          <select class="emg-dest" data-id="${esc(e.petitionerId)}" aria-label="Emergency dispatch destination for ${esc(e.name)}">
            ${(app.Engine.DESTINATIONS ? Object.values(app.Engine.DESTINATIONS) : []).filter(d => d && d.id && (app.state.destState[d.id] || {}).access !== 'closed').map(d => `<option value="${d.id}">${esc(d.name || d.id)}</option>`).join('')}
          </select></label>
        <button class="gbtn small warn emg-dispatch" data-energy="1" data-id="${esc(e.petitionerId)}" title="Interrupt formation (forfeits progress) and dispatch directly. Normal dispatch cost applies.">Dispatch</button>`
        : `<label class="form-pick">Dispatch to mission:
          <select class="europe-dest" data-id="${esc(e.petitionerId)}" aria-label="Dispatch destination for ${esc(e.name)}">
            ${(app.Engine.DESTINATIONS ? Object.values(app.Engine.DESTINATIONS) : []).filter(d => d && d.id && (app.state.destState[d.id] || {}).access !== 'closed').map(d => `<option value="${d.id}">${esc(d.name || d.id)}</option>`).join('')}
          </select></label>
        <button class="gbtn small primary europe-dispatch" data-energy="1" data-id="${esc(e.petitionerId)}" title="Send this man directly to a mission. Normal dispatch cost applies.">Dispatch</button><br>
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
    <p class="howto-note">Here the men laboring in Europe are formed — and from here the General may send formed men straight to the missions, with the indipetae or by direct dispatch (see the Missions tab).</p>
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
  root.querySelectorAll('.emg-dispatch').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const sel = root.querySelector(`.emg-dest[data-id="${btn.dataset.id}"]`);
        const dest = sel ? sel.value : '';
        if (!dest) { alert('Choose a destination first.'); return; }
        const name = btn.closest('.formation-row')?.querySelector('strong')?.textContent || 'This man';
        if (!confirm(`${name} is in formation. Emergency dispatch will INTERRUPT formation (forfeiting progress and the 20 scudi cost) and send him directly to the mission at normal dispatch cost. Proceed?`)) return;
        app.Engine.dispatchFromFormation(app.state, btn.dataset.id, dest);
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
  root.querySelectorAll('.europe-dispatch').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const sel = root.querySelector(`.europe-dest[data-id="${btn.dataset.id}"]`);
        const dest = sel ? sel.value : '';
        if (!dest) { alert('Choose a destination first.'); return; }
        const name = btn.closest('.formation-row')?.querySelector('strong')?.textContent || 'This man';
        if (!confirm(`Send ${name} directly to the mission? Normal dispatch cost applies. Proceed?`)) return;
        app.Engine.dispatchFromEurope(app.state, btn.dataset.id, dest);
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
          esc(v.petitionerName || v.petitionerId)).join(', ')}</p>`;
      }
      if (incoming.length) {
        html += `<p class="mission-roster incoming"><strong>Incoming:</strong> ${incoming.map(v =>
          esc(v.petitionerName || v.petitionerId)).join(', ')} (arriving ${incoming[0].arriveYear})</p>`;
      }
      // The community's character: top 3 traits among stationed men.
      const traits = E.communityTraits(app.state, d.id);
      if (traits.length) {
        const dots = (v) => '●'.repeat(Math.round(v)) + '○'.repeat(5 - Math.round(v));
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
        <button class="gbtn small ghost instr-send" data-id="${esc(d.id)}">Send</button></div>`;
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
        `<li>${esc(m.name)} <span class="dg-meta">${esc((E.MISSION_GRADES[m.grade] || {}).short || m.grade)}</span> — ${esc(stateLabel(m.state))}${m.arriveYear && m.state === 'in-transit' ? ` (arriving ${m.arriveYear})` : ''}</li>`
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
      <p class="howto-note">Frontier fields await the Society — 1000 scudi and men to send. Collapsed missions can be rebuilt.</p>
      <div class="frontier-list">
        ${frontier.map((d) => `
        <div class="frontier-item">
          <strong>${esc(d.name)}</strong>
          <span class="disp-mini">${esc(d.blurb || '')}</span>
          <button class="gbtn small primary frontier-found" data-id="${esc(d.id)}" data-energy="1">${(app.state.destState[d.id] || {}).collapsed ? 'Rebuild' : 'Found'} — 1000 scudi</button>
        </div>`).join('')}
      </div>`;
    })()}
  </section>`;

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
      const specific = E.requestGradeAvailable(app.state, c);
      const abstract = Math.max(0, app.state.available || 0);
      avail[c] = specific + abstract;
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
    <p class="howto-note">In Europe: ${E.REQUEST_GRADES.map((c) => `${avail[c]} ${c}`).join(', ')}. Cost to agree: ${E.requestAnswerCost({ professed: req.professed, fathers: req.fathers, brothers: req.brothers })} scudi.</p>
    ${staged ? `
    <p class="howto-note"><strong>Staged:</strong> ${staged.mix && Object.values(staged.mix).every((v) => v === 0) ? 'send no men' : `send ${E.REQUEST_GRADES.filter((c) => staged.mix[c] > 0).map((c) => plural(staged.mix[c], c === 'brothers' ? 'brother' : c.slice(0, -1), c)).join(', ')}`} — ${staged.cost} scudi. Takes effect at year close.</p>
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
    <p class="pcard-excerpt">“${esc(L.excerpt)}”</p>
    <p class="pcard-disposition"><span class="disp-line">${dispLine(app, c.id)}</span>
      <button class="gbtn small ghost inspect-btn" data-id="${esc(c.id)}" data-name="${esc(c.name)}">Inspect</button></p>
    <button class="gbtn small read-letter" data-id="${esc(c.id)}">Read letter</button>
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
      const sealTotal = approved.length * ((app.Engine.RESOURCES && app.Engine.RESOURCES.SEAL_COST) || 30);
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

  root.querySelectorAll('.read-letter').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = terna.find(x => x.id === btn.dataset.id);
      showLetterOverlay(app, c);
    });
  });

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
    return `<div class="queue-row">
      <span class="queue-name">${esc(q.petitionerName || q.petitionerId)}</span>
      <span class="queue-dest">→ ${esc(destName(q.destination))}</span>
      <select class="queue-ship" data-pid="${esc(q.petitionerId)}" aria-label="Assign ship">
        <option value="">Auto</option>
        ${options}
      </select>
      ${assignedShip ? `<span class="queue-assigned">on ${esc(assignedShip.name)}</span>` : ''}
    </div>`;
  }).join('');
  
  return `<div class="queue-list">${rows}</div>
    <p class="disp-mini">Assign men to ships, or leave on Auto. If a ship is full at departure, excess men wait.</p>`;
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
    const destName = voy ? ((app.Engine.DESTINATIONS?.[voy.destination]?.name) || voy.destination) : null;
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
          return `<li class="formation-row"><strong>${esc(name)}</strong> <span class="disp-mini reserve-badge">reserved: ${esc(e.reservedForName || e.reservedFor)}</span></li>`;
        }).join('')}</ul>`;
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
      <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCAUKBT8DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8i6KKK0PYCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD1n9lr9hn9qr9tL+2/+Gafhf/wkn/CN/Z/7b/4ndjZ/Z/tHmeT/AMfE6f8APOvW/wDhxp/wVJ/6NZ/8vHRP/kuvrP8A4Ndfu/HP/uWf/crX601+McU+IGa5LnVTCUIR5Y/5Hv4LK6GIw3NI/nj/AOHGn/BUn/o1n/y8dE/+S6P+HGn/AAVJ/wCjWf8Ay8dE/wDkuv6HKK+dXitnr+xH8Tt/sTDH8rfxz+BnxV/Zp+KGqfBn4zeEv7H8TaH5X9paR/aMFz5fnQeanzxSP/z0rk6+tP8AguX/AMpSfif/ANwT/wBMllXyXX7xlGNnj8so4iX2oo+Zr0lCvOIUUUV6JiFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB+s//Brr9345/wDcs/8AuWr9aa/Jb/g11+78c/8AuWf/AHLV+tNfy3x//wAlRW+X5H2eU/7nEKKKK+IW56J/PH/wXL/5Sk/E/wD7gn/pksq+S6+tP+C5f/KUn4n/APcE/wDTJZV8l1/XvDP/ACIcN/hj+R8Jjf8AephRRRXvHMFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB+s//Brr9345/wDcs/8AuWr9aa/Jb/g11+78c/8AuWf/AHLV+tNfy34g/wDJT1vl+SPs8p/3OIUUUV8Qtz0T+eP/AILl/wDKUn4n/wDcE/8ATJZV8l19af8ABcv/AJSk/E//ALgn/pksq+S6/r3hn/kQ4b/DH8j4TG/71MKKKK945gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKLoAooopXQBRRRRdAFFFFF0B+s/wDwa6/d+Of/AHLP/uWr9aa/Jb/g11+78c/+5Z/9y1frTX8t8f8A/JT1vl+R9nlP+5xCiiiviVueifzx/wDBcv8A5Sk/E/8A7gn/AKZLKvkuvrT/AILl/wDKUn4n/wDcE/8ATJZV8l1/XnDLSyHDf4Y/kfCY1P61MKKKK966OezCiiii6EFFFFF0AUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAr+hz/hxn/wAEsP8Ao1o/+Flrf/yXX88df1oV+P8AijmWYZd9X+rVZR32PfySlQq35o8x8l/8OM/+CWH/AEa0f/Cy1v8A+S6P+HGf/BLD/o1o/wDhZa3/APJdfWlFfj/+s2f/APQTL/wJnu/UsL/IfJf/AA4z/wCCWH/RrR/8LLW//kuj/hxn/wAEsP8Ao1o/+Flrf/yXX1pRR/rNn/8A0Ey/8CY/qWF/kPkv/hxn/wAEsP8Ao1o/+Flrf/yXR/w4z/4JYf8ARrR/8LLW/wD5Lr60oo/1mz//AKCZf+BMj6lhf5Dx/wDZp/Ye/Zg/Yu/tv/hmP4Yf8I3/AMJP9n/tv/id3V59o+z+Z5P/AB8Tv/z0r1TzZf8AnqKkv/4P+B1Xr57G43FYrE+2rT5pHfSpUoQ5Yknmy/8APUUebL/z1FR0Vyc8zbkpHz38cv8Aglf+wV+0r8VdU+M3xr+Bv9seJtbMX9pat/wk2qW3meTB5X/LK7T/AJ51yX/Dj7/gl3/0a/8A+Xtrf/yXX1jRXr0eJs9pQ9nHEy93+8znlgsLKXwHyd/w49/4Jd/9Gv8A/l763/8AJdH/AA49/wCCXf8A0a//AOXvrf8A8l19Y0VquKc/v/vNT72L6jhf5D5b/wCHGf8AwSw/6NaP/hZa3/8AJdH/AA4z/wCCWH/RrR/8LLW//kuvrSivQXE2f/8AQTL/AMCZzfUsL/IfJf8Aw4z/AOCWH/RrR/8ACy1v/wCS6+eP+CrH/BKH9gX9mr9gbx58bPgn8Av7H8TaP/Zn9m6t/wAJNqlz5fnapZW//LW7r9O6+S/+C5n/ACi1+KH00T/092Vezw9xDnGIzijGdaXxR+0+5yYrC4WGGnywP546KKK/qZbHxoUUUUwCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKxrV6FHRyCzYUUUVCxuF/5+IdmFFFFbKoqyuhBRRRVgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFf1oV/JfX9aFfi3i1QrVvq9l3PochaXMFFFFfiv1TE/8+2fQc6Ciiil9UxP/AD7Yc6Ciiij6pif+fbDnRXv/AOD/AIHVerF//B/wOq9eViKbpzszqo/CFFFFYGoUUUV0LC4hq6psn2gUUUU1hMV/z7Ye2iaFFFFen9UxNv4bOLnQV8l/8FzP+UWvxQ+mif8Ap7sq+tK+S/8AguZ/yi1+KH00T/092Ve5wzhcSs8wz9m/ij+Zy4yonhpn88dFFFf1utj4gKKKKYBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRXN9aoJ2dRDswooopLF4X/n4gswooorqEFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB9e/8EHf+Ur3wq/7j3/pg1Gv6N6/nI/4IO/8pXvhV/3Hv/TBqNf0b1/N3i1Xr0c+p8kvsfqe9lyXsAooor8p+uYr/n4z1bI/IX/g6t/5oP8A9zT/AO4WvyFr9ev+Dq3p8CD/ANjT/wC4WvyFr+rfDlurwnRb8/zPmcd/vMgooor7o4gooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooorKdCjW/iod2gooorP6rhv+faH7R9wooopfVcN/z7Qe0fcKKKKPquG/59oPaPufrB/wa/f81w/7ln/3K1+sFfk//wAGv3/NcP8AuWf/AHLV+sFfyp4jJLiusl5fkfd5N/yL0FFFFfCrc9Nn8+H/AAXDJP8AwVE+KAJ6f2J/6ZLKvk6vrH/guF/ylF+KH/cE/wDTJZV8nV/ZHDGFw0uH8M3D/l3H8j8+xlaf1yYUUUV7v1TC/wDPpHF7R9woooo+q4b/AJ9oPaPuFFFFUsNhU7qIc77hRRRXQSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFD2Gtz+jf8A4IPDH/BKH4Vf9x7/ANP+o19e18hf8EHf+UUPwq/7j3/p/wBRr69r+NuKcVilxDiEpv45fmfV4VL2UQooorzcJi8V9ap/vHubtKx/IXRRRX9p4HXCUz417hRRRXQIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAPr3/gg7/wApXvhX/wBx7/0wajX9G9fzof8ABAbS7rWv+CtHwo03Tf8AqPf+mDUa/pJ/4Vz4xPTSP/IyV/Pnink2Z5jndOphqMpR5fsrzPZwGKw9CPLUmYtFbn/CtfGv/QGH/f6Oj/hWvjX/AKAw/wC/0dfmX+qvEH/QNU+5nb/aWA/nPxp/4OrenwI/7mn/ANwtfkLX7Ef8HYvh7U9CX4Bf2hY8f8VT/wC4Wvx3r+m+AsLisFwxRo14cstfzPDxk4VcTzR2CiiivtTlCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD9YP+DX7/muH/cs/wDuWr9YK/J//g1+/wCa4f8Acs/+5av1gr+TfEf/AJKyv8vyPvcl/wCRcgooor4FbnpvY/nw/wCC4X/KUX4of9wT/wBMllXydX1j/wAFwv8AlKL8UP8AuCf+mSyr5Or+0OFP+Sfw3/XuP5H51jf98mFFFFfQHIFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFJ7Af0b/wDBCH/lFL8Kv+49/wCn7Ua+va+Wf+CBng7xFqn/AASY+E+o2emdf7e4P/Ye1GvsI/DnxkOToo/7/R1/JnEnDmeYrPcTUp4eXxS+y+59Dh8fg4UIxczDorc/4Vr41PTRh/3+jo/4Vr41PTRh/wB/o68nC8L5+sVTbw1Tf+VmrzLA2+M/jvooor+wcEmsPTTPmXuFFFFdIBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB9tf8ABuh/ymU+D3/cw/8AqO6jX9SqAYBxX8tX/Buh/wAplPg9/wBzD/6juo1/Uqn3RUySODFfxRcD0owPSiiosjmPxG/4PFun7On18Wf+4WvxIr9uP+Dxbp+zn9fFn/uFr8R60Wx6WH/ghRRRTNgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/WD/AINfv+a4f9yz/wC5av1gr8n/APg1+/5rh/3LP/uWr9YK/k3xH/5Kyv8AL8j73Jf+Regooor4FbnpvY/nw/4Lhf8AKUX4of8AcE/9MllXydX1j/wXC/5Si/FD/uCf+mSyr5Or+0OFP+Sfw3/XuP5H51jf98mFFFFfQHIFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH9SP/Buf/wAob/g7/wBzD/6kWpV9v4HTFfEP/Buf/wAocfg7/wBzD/6kWpV9vVlZHjy+MMAdBSEDB4paG6H6UWQH8R9FFFansLYKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD7a/wCDdD/lMp8Hv+5h/wDUd1Gv6lU+6K/lq/4N0P8AlMp8Hv8AuYf/AFHdRr+pVPuipkcGK/ii0UUVJzH4j/8AB4t0/Zz+viz/ANwtfiPX7cf8Hi3T9nP6+LP/AHC1+I9aLY9LD/wQooooNgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/WD/g1+/5rh/3LP8A7lq/WCvyk/4Ne+vxz+vhv/3LV+sf2D/Z/Sv5P8R6Up8VVvl+R93k04xy+JXoqx9g/wBn9KPsH+z+lfBqhK56LlA/no/4Lhf8pRfih/3BP/TJZV8nV9Y/8Fyf+UovxQ/7gf8A6ZLKvk6v7O4W9zIMN/17j+R+f4//AHmYUUUV7xxhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/Ul/wAG6H/KHL4O/wDcw/8AqRalX29XxD/wbof8ocvg79fEP/qRalX29WczyZ/EFDdD9KKG6H6UEn8R9FFFaHsLYKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD7a/4N0P+Uynwe/7mH/1HdRr+pVPuiv5av+DdD/lMp8Hv+5h/9R3Ua/qVT7oqZHBiv4otFFFScx+I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fbf/AAcZf8plvjD/ANy9/wCo7p1fElaLY9Sj8EAooooNAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP21/4M5fvftGf9yj/AO5qv27r8RP+DOX737Rn/co/+5qv27rOZ5lf+IFDdD9KKG6H6U1uYvY/n3/4LUf8pOfif/vaN/6ZbGvluvqT/gtR/wApOfif/vaN/wCmWxr5br8px/8Av1X/ABS/Nn98cEf8kZlv/Xij/wCm4hRRRXIfUliiiiszQKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigBsv8Aqj9RUNTS/wCqP1FQ1UdiZbhRRRVEn6n/APBsv/x9/Gz/AHfDn/uUr9XD94V+Uf8AwbL/APH38bP93w5/7lK/Vw/eFfo+Q/8AIop/P/0pn8R+LP8AycPHetP/ANM0xaKKK9k/Oz+Wr/g4y/5TLfGH/uXv/Ud06viSvtv/AIOMv+Uy3xh/7l7/ANR3Tq+JK0Wx6lH4IBRRRQaBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAftr/wZy/e/aM/7lH/3NV+3dfiJ/wAGcv3v2jP+5R/9zVft3WczzK/8QKDyMUUUGR/Pz/wWuhMX/BTX4lT7WKsujbm7A/2PZD/Cvld5IcctWz/wcZf8plvjD/3L3/qO6dXxJXzGL4YWJxEqsaluZ3ta+vXqj934V8Y8dkeQ0Mvr4ONX2UVFS9o4e6tIprknqlpe+vZH2GTjqrcdflPv/gfypScdVbjr8p9/8D+VfHdFY/6p/wDT38P+Ceo/HbM0r/UIf+DH/wDIH2ZRVZPuj6UtfFcp/S3tCxRVenRf6wUco+fUmoooqSgooooAKKKKAClRHkYJGhYnoAMmhiuwYHPev2I/4JWc/sD+Bf8Ae1P/ANOl1XgcSZ9T4cy363ODkrpWWm9/8j5DjbietwpllPE0qKqSqTUEnLlSbjOXM9He3Ltpe+6Px2or+gyivgP+It4P/oFl/wCBL/I/Pf8AiMlf/oXr/wAHP/5Ufz50V/QZRR/xFvB/9Asv/Al/kH/EZK//AEL1/wCDn/8AKj+fOiv6DKKP+It4P/oFl/4Ev8g/4jJX/wChev8Awc//AJUfz50V/QZRR/xFvB/9Asv/AAJf5B/xGSv/ANC9f+Dn/wDKj+fOiv6DKKP+It4P/oFl/wCBL/IP+IyV/wDoXr/wc/8A5Ufz50V/QZRR/wARbwf/AECy/wDAl/kH/EZK/wD0L1/4Of8A8qP586K/oMoo/wCIt4P/AKBZf+BL/IP+IyV/+hev/Bz/APlR/PnRX9BlFH/EW8H/ANAsv/Al/kH/ABGSv/0L1/4Of/yo/nzor+gyij/iLeD/AOgWX/gS/wAg/wCIyV/+hev/AAc//lR/PnRX9BlFH/EW8H/0Cy/8CX+Qf8Rkr/8AQvX/AIOf/wAqP586MV/QZXz9/wAFTdn/AAwV47Eibgf7NGM45/tO1wfwPNejlfiXhM0zGnhI4dpzko35k9/kjowXi9WxeNo4b6h/EqQhpVu/fko3SdOKdr7OST6tbn46UUUV+mn7SFFFFABRRRQAUqI8jBI0LE9ABk0MV2DA571+xH/BKzn9gfwL/van/wCnS6rwOJM+p8OZb9bnByV0rLTe/wDkfIcbcT1uFMsp4mlRVSVSagk5cqTcZy5no725dtL33R+O1Ff0GUV8B/xFvB/9Asv/AAJf5H57/wARkr/9C9f+Dn/8qP586K/oMoo/4i3g/wDoFl/4Ev8AIP8AiMlf/oXr/wAHP/5Ufz50V/QZRR/xFvB/9Asv/Al/kH/EZK//AEL1/wCDn/8AKj+fOiv6DKKP+It4P/oFl/4Ev8g/4jJX/wChev8Awc//AJUfz50V/QZRR/xFvB/9Asv/AAJf5B/xGSv/ANC9f+Dn/wDKj+fOiv6DKKP+It4P/oFl/wCBL/IP+IyV/wDoXr/wc/8A5Ufz50V/QZRR/wARbwf/AECy/wDAl/kH/EZK/wD0L1/4Of8A8qP586K/oMoo/wCIt4P/AKBZf+BL/IP+IyV/+hev/Bz/APlR/PnRX9BlFH/EW8H/ANAsv/Al/kH/ABGSv/0L1/4Of/yo/nzor+gyij/iLeD/AOgWX/gS/wAg/wCIyV/+hev/AAc//lR/PnRX9BlFH/EW8H/0Cy/8CX+Qf8Rkr/8AQvX/AIOf/wAqP586K/oMoo/4i3g/+gWX/gS/yD/iMlf/AKF6/wDBz/8AlR/PmGIyAfrQOT1r+gyvz6/4LvFf+LWKU+bOtkNnoP8AQcj+X5V7vD3H+G4gzGOEhQcG03dyT2V+yPX4f8UK+d51h8A8Dy+1bXMqnNa0XK9nCKe2vvJ22Tdk/wA+KKKK/QT9aCiiigAooooAKUDIOFPAyT6UsYQuvmsQpYbiOoHev6Cq+V4o4opcM06c503Pnv1ta1vJnwHGnHFThPEUKMMN7V1FJ3cnBLlcdE+WV27u+3Lo9bn8+dFf0GUV8X/xFvB/9Asv/Al/kfG/8Rkr/wDQvX/g5/8Ayo/nzor+gyij/iLeD/6BZf8AgS/yD/iMlf8A6F6/8HP/AOVH8+dFf0GUUf8AEW8H/wBAsv8AwJf5B/xGSv8A9C9f+Dn/APKj+fOiv6DKKP8AiLeD/wCgWX/gS/yD/iMlf/oXr/wc/wD5Ufz50V/QZRR/xFvB/wDQLL/wJf5B/wARkr/9C9f+Dn/8qP586K/oMoo/4i3g/wDoFl/4Ev8AIP8AiMlf/oXr/wAHP/5Ufz50V/QZRR/xFvB/9Asv/Al/kH/EZK//AEL1/wCDn/8AKj+fOiv6DKKP+It4P/oFl/4Ev8g/4jJX/wChev8Awc//AJUfz50V/QZRR/xFvB/9Asv/AAJf5B/xGSv/ANC9f+Dn/wDKj+fOiv6DKKP+It4P/oFl/wCBL/IP+IyV/wDoXr/wc/8A5Ufz5hiMgH60Dk9a/oMr8+v+C7xX/i1ilPmzrZDZ6D/Qcj+X5V7vD3H+G4gzGOEhQcG03dyT2V+yPX4f8UK+d51h8A8Dy+1bXMqnNa0XK9nCKe2vvJ22Tdk/z4ooor9BP1oKKKKACiiigAooqvTSuKUrFiiq9FPlFzE1wVWMkn0qv5q43c4BxnFcf8fFDfCjWCw+6luR7H7VEP618219DleQyzGh7Tntrba/6o/HONfFefCuevLaWD9q4xjJydTl+K+iXJLp1utXtZa/YZOOqtx1+U+/+B/KlG4naEYn02n3/wAD+VfHdFeouE1f+J+H/BPi5eOuaOL5cDC//Xx//In9C/8AwbMQSK3xondSN/8AwjoCken9pc/rX6sEA9a/Ef8A4M4xz+0X/wByh/7mq/bWvo8HhIYLDRox2X/Dn4bxHnWN4gzyvmOLSU6jTaWySSjFL0ikr9dyQcDFFFFdR4x/LV/wcZf8plvjD/3L3/qO6dXxJX23/wAHGX/KZb4w/wDcvf8AqO6dXxJWi2PUo/BAKKKKDQKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD9tf+DOX737Rn/co/wDuar9u6/ET/gzl+9+0Z/3KP/uar9u6zmeZX/iBRRRQZH8tX/Bxl/ymW+MP/cvf+o7p1fElfbf/AAcZf8plvjD/ANy9/wCo7p1fElaLY9Sl8EAooooew6n8Fn2FF9ynU2L7lOr8bP8AQmPwhSxf60fQ0lLF/rR9DSexXUnoooqDQKKKKACiiigFuFfsT/wSt/5MI8C/72p/+nS6r8dq/Yn/AIJW/wDJhHgX/e1P/wBOl1X514n/APJNL/r5H8pH5T4v/wDJP4b/AK/x/wDTdU+g6KKK/nQ/n0KKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAK+ff8Agqh/yYT46/3tM/8ATna19BV8+/8ABVD/AJMJ8df72mf+nO1r6LhL/kpMJ/18j+Z6vDv/ACUGB/6/0v8A07E/HWiiiv6uP7DCiiigAooooBbhX7E/8Erf+TCPAv8Avan/AOnS6r8dq/Yn/glb/wAmEeBf97U//TpdV+deJ/8AyTS/6+R/KR+U+L//ACT+G/6/x/8ATdU+g6KKK/nQ/n0KKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiihbgFfn1/wXd+/wDCz/d1z+dhX6C1+fX/AAXd+/8ACz/d1z+dhX3/AIb/APJWU/Sf/pJ9f4ef8ltgvWp/6aqH58UUUV/SJ/VIUUUUAFFFFABX9Blfz51/QZX5D4t/7nhf8UvyR+HeMn8fL/St+dIKKKK/DT8YCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKFuAV+fX/Bd37/AMLP93XP52FfoLX59f8ABd37/wALP93XP52Fff8Ahv8A8lZT9J/+kn1/h5/yW2C9an/pqofnxRRRX9In9UhRRRQAUUUUAFV6sVXqokyCiiiqJOL/AGgP+SUan/vQf+lEdfN9fSH7QH/JKNT/AN6D/wBKI6+b6+94U/3Kf+J/kj+VfGv/AJLCl/14h/6cqhRRRX05+Qn7a/8ABnL979oz/uUf/c1X7d1+In/BnL979oz/ALlH/wBzVft3Wczy6/8AECiiigzP5av+DjL/AJTLfGH/ALl7/wBR3Tq+JK+2/wDg4y/5TLfGH/uXv/Ud06viStFsepR+CAUUUUGgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH7a/8ABnL979oz/uUf/c1X7d1+In/BnL979oz/ALlH/wBzVft3WczzK/8AECiiigyP5av+DjL/AJTLfGH/ALl7/wBR3Tq+JK+2/wDg4y/5TLfGH/uXv/Ud06viStFsepR+CAUUUUPYqp/BZ9hRfcp1Ni+5Tq/Gz/QiPwhSxf60fQ0lLF/rR9DSexXUnoooqDQKKKKACiiigFuFfsT/AMErf+TCPAv+9qf/AKdLqvx2r9if+CVv/JhHgX/e1P8A9Ol1X514n/8AJNL/AK+R/KR+U+L/APyT+G/6/wAf/TdU+g6KKK/nQ/n0K+e5P+CqX7B0T7H+PuDj/oWNR/8AkSvoSv57H2yFmYDJOSK/TeAuEcr4ioVqmLcny8q0dt/+GPseCuE1xZja0KtWVOnSjF+7a7lJvl3TVlyu+mumqP2N/wCHq37Bf/RfD/4S2pf/ACJR/wAPVv2DP+i+H/wltS/+RK/HGiv0H/iF/DH9/wD8CX/yJ+mf8Qh4f/6Ca/30/wD5Ufsd/wAPVv2DP+i+H/wltS/+RKP+Hq37Bn/RfD/4S2pf/IlfjjRR/wAQv4Y/v/8AgS/+RD/iEOQf9BNf76f/AMqP2O/4erfsGf8ARfD/AOEtqX/yJR/w9W/YM/6L4f8AwltS/wDkSvxxoo/4hfwx/f8A/Al/8iH/ABCHIP8AoJr/AH0//lR+x3/D1b9gz/ovh/8ACW1L/wCRKP8Ah6t+wZ/0Xw/+EtqX/wAiV+ONFH/EL+GP7/8A4Ev/AJEP+IQ5B/0E1/vp/wDyo/Y7/h6t+wZ/0Xw/+EtqX/yJR/w9W/YM/wCi+H/wltS/+RK/HGij/iF/DH9//wACX/yIf8QhyD/oJr/fT/8AlR+x3/D1b9gz/ovh/wDCW1L/AORKP+Hq37Bn/RfD/wCEtqX/AMiV+ONFH/EL+GP7/wD4Ev8A5EP+IQ5B/wBBNf76f/yo/Y7/AIerfsGf9F8P/hLal/8AIlOT/gqn+wdI21fj5z2z4X1IfztK/G+kJbsv60Pwv4a5Xyuaf+Jf/ImdfwiyZwfssVVUujfs2k/NKEW//Al6n9CtFFFfzxiqaoYmVJH4JSd6CYV8+/8ABVD/AJMJ8df72mf+nO1r6Cr59/4Kof8AJhPjr/e0z/052te5wl/yUmE/6+R/M9fh3/koMD/1/pf+nYn460UUV/Vp/YYUUUUAFFFFALcK/Yn/AIJW/wDJhHgX/e1P/wBOl1X47V+xP/BK3/kwjwL/AL2p/wDp0uq/OvE//kml/wBfI/lI/KfF/wD5J/Df9f4/+m6p9B0UUV/Oh/PoV89yf8FUv2Don2P8fcHH/Qsaj/8AIlfQlfz2PtkLMwGSckV+m8BcI5XxFQrVMW5Pl5Vo7b/8MfY8FcJrizG1oVasqdOlGL9213KTfLumrLld9NdNUfsb/wAPVv2C/wDovh/8JbUv/kSj/h6t+wZ/0Xw/+EtqX/yJX440V+g/8Qv4Y/v/APgS/wDkT9M/4hDw/wD9BNf76f8A8qP2O/4erfsGf9F8P/hLal/8iUf8PVv2DP8Aovh/8JbUv/kSvxxoo/4hfwx/f/8AAl/8iH/EIcg/6Ca/30//AJUfsd/w9W/YM/6L4f8AwltS/wDkSj/h6t+wZ/0Xw/8AhLal/wDIlfjjRR/xC/hj+/8A+BL/AORD/iEOQf8AQTX++n/8qP2O/wCHq37Bn/RfD/4S2pf/ACJR/wAPVv2DP+i+H/wltS/+RK/HGij/AIhfwx/f/wDAl/8AIh/xCHIP+gmv99P/AOVH7Hf8PVv2DP8Aovh/8JbUv/kSj/h6t+wZ/wBF8P8A4S2pf/IlfjjRR/xC/hj+/wD+BL/5EP8AiEOQf9BNf76f/wAqP2O/4erfsGf9F8P/AIS2pf8AyJR/w9W/YM/6L4f/AAltS/8AkSvxxoo/4hfwx/f/APAl/wDIh/xCHIP+gmv99P8A+VH7Hf8AD1b9gz/ovh/8JbUv/kSj/h6t+wZ/0Xw/+EtqX/yJX440Uf8AEL+GP7//AIEv/kQ/4hDkH/QTX++n/wDKj9jv+Hq37Bn/AEXw/wDhLal/8iUf8PVv2C/+i+H/AMJbUv8A5Er8caKf/EL+GP7/AP4Ev/kQ/wCIQ5B/0E1/vp//ACo/Y8f8FVf2DGOP+F+4z3PhfUh/7aV0fwr/AOCgH7Jnx08b2Hwx+FvxcGo65qe/7FZDw7fQ/dhMn35YE7g1+JjDIxivof8A4JTJn9vXwKWGNo1MjH/YNuxXDmfhtw9hsurVabmpRjJ3unra/ZHz/EnhnlWS5PiMdSxNT93HmipKDTlfZ2jHR6LSzj8V2vdP2Oooor+fmrOx+RIK/Pn/AILvf6z4V/TXP52FfoNX58/8F3v9Z8K/prn87CvvvDb/AJKun6T/APST67w9/wCS4wXrU/8ATMz8+aKKK/pI/qoKKKKACiiigAr+gyv586/oMr8h8W/9zwv+KX5I/DvGT+Pl/pW/OkFFFFfhp+MGB8UPir4D+C3gO/8Aid8Tte/s/Q9L2fbb77JPN5e6fyk+SKNnkrxr/h6n+wbt3f8AC/fw/wCEY1HP5fZM0n/BVYKf2DPHm4440zH1/tGyx+tfjhX69wTwRlGfZQ8Xi3JycmtGltbyfc+/4K4Jw3FuFq4ivWlTdOahaKVnHlTfvNP3ndf4bXalzK37Hf8AD1b9gz/ovh/8JbUv/kSj/h6t+wZ/0Xw/+EtqX/yJX440V9h/xC/hj+//AOBL/wCRPvv+IQ5B/wBBNf76f/yo/Y7/AIerfsGf9F8P/hLal/8AIlH/AA9W/YM/6L4f/CW1L/5Er8caKP8AiF/DH9//AMCX/wAiH/EIcg/6Ca/30/8A5Ufsd/w9W/YM/wCi+H/wltS/+RKP+Hq37Bn/AEXw/wDhLal/8iV+ONFH/EL+GP7/AP4Ev/kQ/wCIQ5B/0E1/vp//ACo/Y7/h6t+wZ/0Xw/8AhLal/wDIlH/D1b9gz/ovh/8ACW1L/wCRK/HGij/iF/DH9/8A8CX/AMiH/EIcg/6Ca/30/wD5Ufsd/wAPVv2DP+i+H/wltS/+RKP+Hq37Bn/RfD/4S2pf/IlfjjRR/wAQv4Y/v/8AgS/+RD/iEOQf9BNf76f/AMqP2O/4erfsGf8ARfD/AOEtqX/yJR/w9W/YL/6L4f8AwltS/wDkSvxxop/8Qv4Y/v8A/gS/+RD/AIhDkH/QTX++n/8AKj9jx/wVV/YMY4/4X7jPc+F9SH/tpXR/Cv8A4KAfsmfHTxvYfDH4W/Fwajrmp7/sVkPDt9D92EyfflgTuDX4mMMjGK+h/wDglMmf29fApYY2jUyMf9g27FcOZ+G3D2Gy6tVpualGMne6etr9kfP8SeGeVZLk+Ix1LE1P3ceaKkoNOV9naMdHotLOPxXa90/Y6iiiv5+as7H5Egr8+f8Agu9/rPhX9Nc/nYV+g1fnz/wXe/1nwr+mufzsK++8Nv8Akq6fpP8A9JPrvD3/AJLjBetT/wBMzPz5ooor+kj+qgooooAKKKKACq9WKr1USZBRRRVEnF/tAf8AJKNT/wB6D/0ojr5vr6Q/aA/5JRqf+9B/6UR18319/wAK/wDItn/if5RP5V8a/wDksKX/AF4h/wCnKoUUUV9KfkJ+2v8AwZy/e/aM/wC5R/8Ac1X7d1+In/BnL979oz/uUf8A3NV+3dZzPMr/AMQKKKKDI/lq/wCDjL/lMt8Yf+5e/wDUd06viSvtv/g4y/5TLfGH/uXv/Ud06viStFsepR+CAUUUUGgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH7a/wDBnL979oz/ALlH/wBzVft3X4if8Gcv3v2jP+5R/wDc1X7d1nM8yv8AxAooooMj+Wr/AIOMv+Uy3xh/7l7/ANR3Tq+JK+2/+DjL/lMt8Yf+5e/9R3Tq+JK0Wx6lH4IBRRRQ9iqn8Fn2FF9ynU2L7lOr8bP9CI/CFLF/rR9DSUsX+tH0NJ7FdSeiiioNAooooAKKKKACv2J/4JW/8mEeBf8Ae1P/ANOl1X47V+xP/BK3/kwjwL/van/6dLqvzvxP/wCSaX+OP5SPynxf/wCSfw3/AF/j/wCm6p9B0UUV/OZ/PoV/PXX9Clfz11+6+EX+4Yn/ABR/Jn7H4O/x8f6UfzqhRRRX6+fuIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQT0R/QpRRRX8a43/f6nqfxLQ/gRCvn3/gqh/yYT46/wB7TP8A052tfQVfPv8AwVQ/5MJ8df72mf8Apzta9jhD/ko8J/18j+Z7vDv/ACUGB/6/0v8A07E/HWiiiv6uP7DCiiigAooooAK/Yn/glb/yYR4F/wB7U/8A06XVfjtX7E/8Erf+TCPAv+9qf/p0uq/O/E//AJJpf44/lI/KfF//AJJ/Df8AX+P/AKbqn0HRRRX85n8+hX89df0KV/PXX7r4Rf7hif8AFH8mfsfg7/Hx/pR/OqFFFFfr5+4hRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAV9Cf8EqP+T9vAX11T/02XlfPdfQn/BKj/k/bwF9dU/9Nl5Xm5x/yKMR/wBe5/8ApLPnuK/+SXx//Xmr/wCkM/ZCiiiv4+e5/Ji2Cvz5/wCC73+s+Ff01z+dhX6DV+fP/Bd7/WfCv6a5/Owr73w2/wCSrp+k/wD0k+u8Pf8AkuMF61P/AEzM/Pmiiiv6SP6qCiiigAooooAK/oMr+fOv6DK/IfFv/c8L/il+SPw7xk/j5f6VvzpBRRRX4afjB89f8FV/+TC/Hf10v/05WNfjhX7H/wDBVf8A5ML8d/XS/wD05WNfjhX9HeF//JM/9vy/KJ+++EX/ACIMR/1/l/6bpBRRRX6Mfq4UUUUAFFFFABRRRQAUUUUAFFFFABX0J/wSo/5P28BfXVP/AE2XlfPdfQn/AASo/wCT9vAX11T/ANNl5Xm5x/yKMR/17n/6Sz57iv8A5JfH/wDXmr/6Qz9kKKKK/j57n8mLYK/Pn/gu9/rPhX9Nc/nYV+g1fnz/AMF3v9Z8K/prn87CvvfDb/kq6fpP/wBJPrvD3/kuMF61P/TNQ/Pmiiiv6SP6qCiiigAooooAKr1YqvVRJkFFFFUScX+0B/ySjU/96D/0ojr5vr6Q/aA/5JRqf+9B/wClEdfN9ff8K/8AItn/AIn+UT+VfGv/AJLCl/14h/6cqhRRRX0p+Qn7a/8ABnL979oz/uUf/c1X7d1+In/BnL979oz/ALlH/wBzVft3WczzK/8AECiiigyP5av+DjL/AJTLfGH/ALl7/wBR3Tq+JK+2/wDg4y/5TLfGH/uXv/Ud06viStFsepR+CAUUUUGgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH7a/8ABnL979oz/uUf/c1X7d1+In/BnL979oz/ALlH/wBzVft3WczzK/8AECiiigyP5av+DjL/AJTLfGH/ALl7/wBR3Tq+JK+2/wDg4y/5TLfGH/uXv/Ud06viStFsepR+CAUUUUPYqp/BZ9hRfcp1Ni+5Tq/Gz/QiPwhSxf60fQ0lLF/rR9DSexXUnoooqDQKKKKACiiigAr9dv8AgmFrbaZ+wx4Gt3tcnGqHPsdSuSK/Imv1p/4Jrf8AJk/gj/rlf/8ApwuK/O/Ex/8AGPRX99fkz8h8YK0vqGDw72lUcvO8YNL5e87/ACPoz/hLh/z4D/v/AEf8JcP+fAf9/wCsaiv555T8O5Ymz/wlw/58B/3/AK/ANlKsVYcg4NfvHX4OSNvdnxjJJxX7j4S3+p4n/FH8mfq3hH7WGY42MF+7cad31T5p8q36pyvp0Wq6pRRRX66fuoqLuYLmn+QP736UyL/Wj6Gp6ltpjgk0ReQf7wo8g/3hUtFK7KsiLyD/AHhR5B/vCpaKLsLIi8g/3hR5B/vCpaKLsLIgddrFc0lLL/rT9BSVaM3owooooF0R/QpRRRX8a43/AH6p6n8S0P4EQr59/wCCqH/JhPjr/e0z/wBOdrX0FXz7/wAFUP8Akwnx1/vaZ/6c7WvX4Q/5KPCf9fI/me7w7/yUGB/6/wBL/wBOxPx1ooor+rz+wwooooAKKKKACv12/wCCYWttpn7DHga3e1ycaoc+x1K5Ir8ia/Wn/gmt/wAmT+CP+uV//wCnC4r878TH/wAY9Ff31+TPyHxgrS+oYPDvaVRy87xg0vl7zv8AI+jP+EuH/PgP+/8AR/wlw/58B/3/AKxqK/nnlPw7libP/CXD/nwH/f8Ar8A2UqxVhyDg1+8dfg5I292fGMknFfuPhLf6nif8UfyZ+reEftYZjjYwX7txp3fVPmnyrfqnK+nRarqlFFFfrp+6iou5guaf5A/vfpTIv9aPoanqW2mOCTRF5B/vCjyD/eFS0UrsqyIvIP8AeFHkH+8KloouwsiLyD/eFHkH+8KloouwsiLyD/eFHkH+8KloouwsiPyP9v8ASjyP9v8ASpKKLsLIr0UUVZAV9Cf8EqP+T9vAX11T/wBNl5Xz3X0J/wAEqP8Ak/bwF9dU/wDTZeV5ucf8ijEf9e5/+ks+e4r/AOSXx/8A15q/+kM/ZCiiiv4+e5/Ji2Cvz5/4Lvf6z4V/TXP52FfoNX58/wDBd7/WfCv6a5/Owr73w2/5Kun6T/8AST67w9/5LjBetT/0zM/Pmiiiv6SP6qCiiigAooooAK/oMr+fOv6DK/IfFv8A3PC/4pfkj8O8ZP4+X+lb86QUUUV+Gn4wfPX/AAVX/wCTC/Hf10v/ANOVjX44V+x//BVf/kwvx39dL/8ATlY1+OFf0d4X/wDJM/8Ab8vyifvvhF/yIMR/1/l/6bpBRRRX6Mfq45E355p3kf7X6UQd6kqW3cuMU0ReQf7wo8g/3hUtFK7CyIvIP94UeQf7wqWii7CyI/I/2/0o8j/b/SpKKLsLIr0UUVZAV75/wS9uPs37dngWfbnb/afH/cMuq8Dr3j/gmT/yfH4H/wB7Uf8A023VednH/IpxH+Cf/pLPn+Kv+SYx3/Xmr/6RI/YX/hLh/wA+A/7/ANH/AAlw/wCfAf8Af+saiv5DcdT+VFGNjZ/4S4f8+A/7/wBfAn/BcXVzqrfDB9mMf21/7YV9xV8I/wDBbDr8NPrrX/tjX3nhtGK4ng12l/6SfXcAxUeNcFbvP/01UPhGiiiv6NP6hCiiigAooooAKr1YqvVRJkFFFFUScX+0B/ySjU/96D/0ojr5vr6Q/aA/5JRqf+9B/wClEdfN9ff8K/8AItn/AIn+UT+VfGv/AJLCl/14h/6cqhRRRX0p+Qn7a/8ABnL979oz/uUf/c1X7d1+In/BnL979oz/ALlH/wBzVft3WczzK/8AECiiigyP5av+DjL/AJTLfGH/ALl7/wBR3Tq+JK+2/wDg4y/5TLfGH/uXv/Ud06viStFsepR+CAUUUUGgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH7a/8ABnL979oz/uUf/c1X7d1+In/BnL979oz/ALlH/wBzVft3WczzK/8AECiiigyP5av+DjL/AJTLfGH/ALl7/wBR3Tq+JK+2/wDg4y/5TLfGH/uXv/Ud06viStFsepR+CAUUUUPYqp/BZ9hRfcp1Ni+5Tq/Gz/QiPwhSxf60fQ0lLF/rR9DSexXUnoooqDQKKKKACiiigAr9ZP8AgmV/yZD4K/7if/pyua/Juv1k/wCCZX/JkPgr/uJ/+nK5r898S/8AknF/18j+Uj8s8Xf+RBh/+vy/9N1T3iiiiv55PwYK/B2f/Xv/AL5/nX7xV+Ds/wDr3/3z/Ov23wm/3XE+sfyP0nwo/wCShxH/AF6X/pY2iiiv18/fxYv9aPoanqCL/Wj6Gp6iW5UNgooopFBRRRQAUUUUAQS/60/QUlLL/rT9BSVa2Ie4UUUUyOiP6FKKKK/jXG/79U9T+JaH8CIV8+/8FUP+TCfHX+9pn/pzta+gq+ff+CqH/JhPjr/e0z/052tevwh/yUeE/wCvkfzPd4d/5KDA/wDX+l/6difjrRRRX9Xn9hhRRRQAUUUUAFfrJ/wTK/5Mh8Ff9xP/ANOVzX5N1+sn/BMr/kyHwV/3E/8A05XNfnviX/yTi/6+R/KR+WeLv/Igw/8A1+X/AKbqnvFFFFfzyfgwV+Ds/wDr3/3z/Ov3ir8HZ/8AXv8A75/nX7b4Tf7rifWP5H6T4Uf8lDiP+vS/9LG0UUV+vn7+LF/rR9DU9QRf60fQ1PUS3KhsFFFFIoKKKKACiiigAooooAKKKKAK9FFFaGYV9Cf8EqP+T9vAX11T/wBNl5Xz3X0J/wAEqP8Ak/bwF9dU/wDTZeV5ucf8ijEf9e5/+ks+e4r/AOSXx/8A15q/+kM/ZCiiiv4+e5/Ji2Cvz5/4Lvf6z4V/TXP52FfoNX58/wDBd7/WfCv6a5/Owr73w2/5Kun6T/8AST67w+/5LjBetT/0zUPz5ooor+kj+qgooooAKKKKACv6DK/nzr+gyvyHxb/3PC/4pfkj8O8ZP4+X+lb86QUUUV+Gn4wfPX/BVf8A5ML8d/XS/wD05WNfjhX7H/8ABVf/AJML8d/XS/8A05WNfjhX9HeF/wDyTP8A2/L8on774Rf8iDEf9f5f+m6QUUUV+jH6uSQd6kqODvUlQ9y4/CgooopDCiiigAooooAr0UUVoZhXvP8AwTI/5Ph8D/72o/8Aptuq8Gr3n/gmR/yfD4H/AN7Uf/TbdV52cf8AIpxH+Cf/AKSz5/iv/kl8d/15q/8ApEj9a6KKK/kR7n8rrYK+Ef8Agth1+Gn11r/2xr7ur4R/4LYdfhp9da/9sa+68Of+Sopek/8A0k+t4C/5LTB+s/8A01UPhGiiiv6OP6fCiiigAooooAKr1YqvVRJkFFFFUScX+0B/ySjU/wDeg/8ASiOvm+vpD9oD/klGp/70H/pRHXzfX3/Cv/Itn/if5RP5V8a/+Swpf9eIf+nKoUUUV9KfkJ+2v/BnL979oz/uUf8A3NV+3dfiJ/wZy/e/aM/7lH/3NV+3dZzPMr/xAooooMj+Wr/g4y/5TLfGH/uXv/Ud06viSvtv/g4y/wCUy3xh/wC5e/8AUd06viStFsepR+CAUUUUGgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH7a/8Gcv3v2jP+5R/wDc1X7d1+In/BnL979oz/uUf/c1X7d1nM8yv/ECiiigyP5av+DjL/lMt8Yf+5e/9R3Tq+JK+2/+DjL/AJTLfGH/ALl7/wBR3Tq+JK0Wx6lH4IBRRRQ9iqn8Fn2FF9ynU2L7lOr8bP8AQiPwhSxf60fQ0lLF/rR9DSexXUnoooqDQKKKKACiiigAr9ZP+CZX/JkPgr/uJ/8Apyua/Juv1l/4JmKy/sReCQykcakeR/1Ermvz3xL/AOScX+OP5SPyvxda/sLDR6+2X/puoe70UUV/PJ+DhX4Oz/69/wDfP86/eKvwdn/17/75/nX7b4Tf7rifWP5H6T4Uf8lDiP8Ar0v/AEsbRRRX6+fv4sX+tH0NT1DF/rR+NTVEtyobBRRRSKCiiigAooooAgl/1p+gpKWX/Wn6Ckq1sQ9wooopkdEf0KUUUV/GuN/36p6n8S0P4EQr59/4Kof8mE+Ov97TP/Tna19BV8+/8FUP+TCfHX+9pn/pzta9fhD/AJKPCf8AXyP5nu8O/wDJQYH/AK/0v/TkD8daKKK/q8/sMKKKKACiiigAr9ZP+CZX/JkPgr/uJ/8Apyua/Juv1k/4Jlf8mQ+Cv+4n/wCnK5r898S/+ScX/XyP5SPyzxd/5EGH/wCvy/8ATdU94ooor+eT8GCvwdn/ANe/++f51+8Vfg7P/r3/AN8/zr9t8Jv91xPrH8j9J8KP+ShxH/Xpf+ljaKKK/Xz9/Fi/1o+hqeoIv9aPoanqJblQ2CiiikUFFFFABRRRQAUUUUAFFFFAFeiiitDMK97/AOCYNwbb9ufwNPG+CP7T/wDTbdV4JXvP/BMj/k+HwP8A72o/+m26rzs4/wCRTiP8E/8A0lnz/FX/ACS+O/681f8A0iR+u/8AbOs/8/X/AJCT/wCN0f2zrP8Az9f+Qk/+N1Tor+QXufyuowsXP7Z1n/n6/wDISf8Axuvgz/gt3dXFz/wrFribcR/beP8AyRr7nr4R/wCC2A5+Gh99a/8AbGvvfDb/AJKen6S/9JPrOAeX/XXB+s//AE1UPhGiiiv6OP6gCiiigAooooAK/oMr+fOv6DK/IfFv/c8L/il+SPw7xk/j5f6VvzpBRRRX4afjB89f8FV/+TC/Hf10v/05WNfjhX7H/wDBVf8A5ML8d/XS/wD05WNfjhX9HeF//JM/9vy/KJ+++EX/ACIMR/1/l/6bpBRRRX6Mfq5JB3qSo4O9SVD3Lj8KCiiikMKKKKACiiigCvRRRWhmFe8/8EyP+T4fA/8Avaj/AOm26rwavef+CZH/ACfD4H/3tR/9Nt1XnZx/yKcR/gn/AOks+f4r/wCSXx3/AF5q/wDpEj9a6KKK/kR7n8rrYK+Ef+C2HX4afXWv/bGvu6vhH/gth1+Gn11r/wBsa+68Of8AkqKXpP8A9JPrOAv+S0wfrP8A9NVD4Rooor+jj+oAooooAKKKKACq9WKr1USZBRRRVEnF/tAf8ko1P/eg/wDSiOvm+vpD9oD/AJJRqf8AvQf+lEdfN9ff8K/8i2f+J/lE/lXxr/5LCl/14h/6cqhRRRX0p+Qn7a/8Gcv3v2jP+5R/9zVft3X4if8ABnL979oz/uUf/c1X7d1nM8yv/ECiiigyP5av+DjL/lMt8Yf+5e/9R3Tq+JK+2/8Ag4y/5TLfGH/uXv8A1HdOr4krRbHqUfggFFFFBoFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB+2v/BnL979oz/uUf/c1X7d1+In/AAZy/e/aM/7lH/3NV+3dZzPMr/xAooooMj+Wr/g4y/5TLfGH/uXv/Ud06viSvtv/AIOMv+Uy3xh/7l7/ANR3Tq+JK0Wx6lH4IBRRRQ9iqn8Fn2FF9ynU2L7lOr8bP9CI/CFLF/rR9DSUsX+tH0NJ7FdSeiiioNAooooAKKKKACv1p/4Jrf8AJk/gj/rlf/8ApwuK/Jav1k/4Jl/8mQ+Cv+4l/wCnK5r8/wDEijVrZAlT351+TPyLxgpqOWYTEuVuWo42/wAUJO9/Lk+d/I94ooor8C+qY3/n2fhPt8N/MFfg5I292fGMknFfvHX4OyhVlZV6BiAK/Z/CqjUoYXExqKzvH8mfq3hJVwk83xaSvPkhZ9EuaXMt92+W2nR6rq2iiiv1o/d7odG37wDHrU1Qxf60H61NUPc0jdoKKKKRQUUUUAFFFFAEEv8ArT9BSUsv+tP0FJVrYh7hRRRTI6I/oUooor+Nsb/v1T1P4nof7tEK+ff+CqH/ACYT46/3tM/9OdrX0FXz7/wVQ/5MJ8df72mf+nO1r1+EP+Sjwn/XyP5nu8Of8j/A/wDX+l/6cifjrRRRX9XH9ghRRRQAUUUUAFfrJ/wTK/5Mh8Ff9xP/ANOVzX5N1+sn/BMr/kyHwV/3E/8A05XNfnviX/yTi/6+R/KR+WeLv/Igw/8A1+X/AKbqnvFFFFfzyfgwV+Ds/wDr3/3z/Ov3ir8HZ/8AXv8A75/nX7b4Tf7rifWP5H6T4Uf8lDiP+vS/9LG0UUV+vn7+LF/rR9DU9QRf60fQ1PUS3KhsFFFFIoKKKKACiiigAooooAKKKKAK9FFFaGYV7z/wTI/5Ph8D/wC9qP8A6bbqvBq95/4Jkf8AJ8Pgf/e1H/023VednH/IpxH+Cf8A6Sz5/iv/AJJfHf8AXmr/AOkSP1rooor+RHufyutgr4R/4LYdfhp9da/9sa+7q+Ef+C2HX4afXWv/AGxr7rw5/wCSopek/wD0k+t4C/5LTB+s/wD01UPhGiiiv6OP6fCiiigAooooAK/oMr+fOv6DK/IfFv8A3PC/4pfkj8O8ZP4+X+lb86QUUUV+Gn4wfPX/AAVX/wCTC/Hf10v/ANOVjX44V+x3/BVf/kwvx3/3C/8A05WNfjjX9HeF/wDyTP8A2/L8on774Rf8iDEf9f5f+m6QUUUV+jH6uSQd6kqODvUlQ9y4/CgooopDCiiigAooooAr0UUVoY+6GOc17z/wTIH/ABnD4H/3tR/9Nt1Xg3OTXvX/AATDTd+2/wCCmYZ2jUSCOx/s+5/+vXnZxb+ycRf+SX/pLPmONMTSwnCeNnPZ05x+c1yr8Wv0ufrVRRRX8oPCY2/8Nn8sLEYa3xBXwj/wWw+98NPrrX/tjX3dXwj/AMFr+vw0+utf+2NfbeHeGxFHiam5QsrS/wDST6/w+rUp8a4JRet5/wDpqofCNFFFf0Mf1KFFFFABRRRQAVXqxVeqiTIKKKKok4v9oD/klGp/70H/AKUR18319IftAf8AJKNT/wB6D/0ojr5vr7/hX/kWz/xP8on8q+Nf/JYUv+vEP/TlUKKKK+lPyE/bX/gzl+9+0Z/3KP8A7mq/buvxE/4M5fvftGf9yj/7mq/bus5nmV/4gUUUUGR/LV/wcZf8plvjD/3L3/qO6dXxJX23/wAHGX/KZb4w/wDcvf8AqO6dXxJWi2PUo/BAKKKKDQKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD9tf+DOX737Rn/co/wDuar9u6/ET/gzl+9+0Z/3KP/uar9u6zmeZX/iBRRRQZH8tX/Bxl/ymW+MP/cvf+o7p1fElfbf/AAcZf8plvjD/ANy9/wCo7p1fElaLY9Sj8EAooooexVT+Cz7Ci+5TqbF9ynV+Nn+hEfhCli/1o+hpKWL/AFo+hpPYrqT0UUVBoFFFFABRRRQAUUUUFWa2CiiigLIAzKdyEgjkEdq/dyvwjJwM1+7lflPinWq0MLhpU3Z3l+SPw7xhpUp4nAcy6VfzpBRRRX4usbjf+fr+8/HPquG/lPB/+CmYJ/Yi8agf9Q3/ANOVtX5N1+s//BS6Pzf2JPGy7sYTTj09NRtj/SvyYr9/8N61Wtw83UevPL8on7x4PSoxyXFUIv3lVu15Sp00n215X9wUUUV9+frQUUUUAFFFFAEEv+tP0FJSy/60/QUlWtiHuFFFFMmWx+8lFFFfx9i/99qerP4wwv8AAiFeD/8ABTT/AJMh8a/9wz/05W1e8V4P/wAFNf8AkyHxr/3DP/TlbV6vCX/JRYT/AK+R/M9zIv8AkoMH/wBfqX/pyJ+TdFFFf1Qf1wFFFFABRRRQAV+sn/BMr/kyHwV/3E//AE5XNfk3X6yf8Eyv+TIfBX/cT/8ATlc1+e+Jf/JOL/r5H8pH5Z4u/wDIgw//AF+X/puqe8UUUV/PJ+DBX4Oz/wCvf/fP86/eKvwdn/17/wC+f51+2+E3+64n1j+R+k+FH/JQ4j/r0v8A0sbRRRX6+fv4sX+tH0NT1BF/rR9DU9RLcqGwUUUUigooooAKKKKACiiigAooooAr0UUVoZhXvP8AwTI/5Ph8D/72o/8Aptuq8Gr3n/gmR/yfD4H/AN7Uf/TbdV52cf8AIpxH+Cf/AKSz5/iv/kl8d/15q/8ApEj9a6KKK/kR7n8rrYK+Ef8Agth1+Gn11r/2xr7ur4R/4LYdfhp9da/9sa+68Of+Sopek/8A0k+t4C/5LTB+s/8A01UPhGiiiv6OP6fCiiigAooooAD0Nfu5X4RN0P0r93a/JPFj/dML/il+SPxPxe/3jAelX86QUUUV+JH4+eE/8FNQD+xD43BGfk0/r/2ELavyRr9bv+Cmn/JkPjj/AHLD/wBOFvX5I1/Q/hj/AMk6/wDG/wAkfsXhBJ/V8cr6c8P/AEkKKKK/RT9mJIO9SVHB3qSoe5cfhQUUUUhhRRRQAUUUUFfZP3cooor+S8VjcasVU/ePc/iPD0MN9Wj7oV4V/wAFLw5/Yl8bCPOdunE4Pb+0bbP6V7rXhf8AwUrdU/Ym8bFjgGPTx+J1C3Ar1OFcXiqvEGGUqjf7yP5no5dTjRzLD1KUFKSqQaVr3anGystXd6W6n5L0UUV/UB/ZWgUUUUBZBRRRQIKKKKACiiigAqvViq9VEmQUUUVRJxf7QP8AySjU/wDeg/8ASiKvm+vpH9oH/klGp/W3/wDSiKvm6vv+FP8AkXT/AMT/ACifyr41/wDJYUv+vEP/AE5VCiiivpT8hP21/wCDOX737Rn/AHKP/uar9u6/ET/gzl+9+0Z/3KP/ALmq/bus5nmV/wCIFFFFBkfy1f8ABxl/ymW+MP8A3L3/AKjunV8SV9t/8HGX/KZb4w/9y9/6junV8SVotj1KPwQCiiig0CiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/bX/AIM5fvftGf8Aco/+5qv27r8RP+DOX737Rn/co/8Auar9u6zmeZX/AIgUUUUGR/LV/wAHGX/KZb4w/wDcvf8AqO6dXxJX23/wcZf8plvjD/3L3/qO6dXxJWi2PUo/BAKKKKGOvrRPsGEoV+X8afXGt8efhJEPk8XB+ccWVyPx5jpB8f8A4TkgHxRjnr9iuOP/AByvyiWW5hGXK6Uvub/E/tzD8ecF16HtY5hRS7Smoy/8BlaX4HZ06LPmj8a40/Hz4TAE/wDCXxnA4Asbn/41Vzw38ZPh34n1iLQtE8QrPdTBjHELeVSQFyeoHapq5fjqUW505W9DTAcc8HZlWjSoY+k5NqKi5qMm27JRUrNtvRWT10OsopvnJ/e/Sjzo/wC9+lcFmfYe6Oopvmx/3v0pQ6nOD060C0YtFFFABRRRQAUUUUAI3Q/Sv3dr8Im6H6V+7tfknix/umF/xS/JH4n4vf7xgPSr+dIKKKK/Ej8fPB/+Cmv/ACZD41/7hn/pytq/Juv1j/4KZqzfsR+NQqk/8eB4H/UStq/Joyrgc/pX9D+Gd/8AVx/45flE/d/CKUf7BxKvr7Z/+m6Y6im+bH/e/SjzY/736V+g2Z+q6DqKb5sf979KPNj/AL36UWYaDqKb5sf979KPNj/vfpRZhoRS/wCtP0FJSuwZyw6GkrRbGb3CiiigUtj95KKKK/j7F/77U9Wfxjhf4EfQK8I/4KZ/8mReNfrpn/pztq93rwj/AIKZ/wDJkXjX66Z/6c7avV4S/wCSiwn/AF8j+Z7eQf8AI+wf/X+l/wCnIn5NUUUV/VB/XAUUUUAFFFFABX6yf8Eyv+TIfBX/AHE//Tlc1+TdfrJ/wTK/5Mh8Ff8AcT/9OVzX574l/wDJOL/r5H8pH5Z4u/8AIgw//X5f+m6p7xRRRX88n4MFfg7P/r3/AN8/zr94q/B2f/Xv/vn+dftvhN/uuJ9Y/kfpPhR/yUOI/wCvS/8ASxtFFFfr5+/ixf60fQ1PUMbKrgnoKk85B/F+lS9yoWS1HUU3zY/736UebH/e/SpsytB1FN82P+9+lHmx/wB79KLMNB1FN82P+9+lHmx/3v0osw0HUU3zY/736UebH/e/SizDQdRTfNj/AL36UebH/e/SizDQhooorQzCvef+CZH/ACfD4H/3tR/9Nt1Xg1e8/wDBMj/k+HwP/vaj/wCm26rzs4/5FOI/wT/9JZ8/xX/yS+O/681f/SJH610UUV/Ij3P5XWwV8I/8FsOvw0+utf8AtjX3dXwj/wAFsOvw0+utf+2NfdeHP/JUUvSf/pJ9bwF/yWmD9Z/+mqh8I0UUV/Rx/T4UUUUAFFFFACN0P0r93a/CJuh+lfu7X5J4sf7phf8AFL8kfifi9/vGA9Kv50gooor8SPx88J/4Kaf8mQ+OP9yw/wDThb1+SNfrd/wU0/5Mh8cf7lh/6cLevyRr+h/DH/knX/jf5I/YfCD+Bjv8UP8A0kKKKK/RT9nJIO9SVFE4UncetP8ANj/vfpUNO5cWuUdRTfNj/vfpR5sf979KVmPQdRTfNj/vfpR5sf8Ae/SizDQdRTRKnY/pQZVz979KLMd1Y/d6iiiv5Cxf++1fU/irC/wIhXg//BTX/kyHxr/3DP8A05W1e8V4P/wU1/5Mh8a/9wz/ANOVtXq8Jf8AJRYT/r5H8z3Mi/5KDB/9fqX/AKcifk3RRRX9UH9cBRRRQAUUUUAFFFNaRFOCaBppbjqKb5sf979KPNj/AL36UWYtB1V6le4RVzn/AMdrh1+Pnwocn/irVT/esrnn8o66cPhsRiZNUot+h4udcQ5HkFOM8xxMKXNe3NJJyta/Kt5Wur2TtfU7OiuMPx/+E4OB4ozjuLK45/8AHKP+GgPhP/0M3/kncf8AxFbPL8en/Cl/4C/8jzY8acHSimsxof8Ag2H/AMkH7QP/ACSnU/rb/wDpRHXzdXt/xc+Lfw68UfDnUdH0fxKJ72dYvIt/sk6FiJlbq0ft+teIV93w3ha2GwbVVWbbdvkl+h/Mviln2WZ/xZ9Yy+aqU4Uowcls5KU5Oz6pKSV+90FFFFe8fnJ+2v8AwZy/e/aM/wC5R/8Ac1X7d1+In/BnL979oz/uUf8A3NV+3dZzPMr/AMQKKKKDI/lq/wCDjL/lMt8Yf+5e/wDUd06viSvtv/g4y/5TLfGH/uXv/Ud06viStFsepR+CAUUUUGgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH7a/wDBnL979oz/ALlH/wBzVft3X4if8Gcv3v2jP+5R/wDc1X7d1nM8yv8AxAooooMj+Wr/AIOMv+Uy3xh/7l7/ANR3Tq+JK+2/+DjL/lMt8Yf+5e/9R3Tq+JK0Wx6lH4IBRRRQaBRRRQFkFdn+z6qt8WtMDAH5bk8/9estcZXafs9/8lb0z/cuv/SSWubFpPBS9H+R1Zc3HMaMlo1OH/pSPpCiiivyQ/v5bBUkHeo6kg70nsOPxIkoooqCwooooAKKKKAEbofpX7u1+ETdD9K/d2vyTxY/3TC/4pfkj8T8Xv8AeMB6VfzpBRRRX4kfj54V/wAFM/8AkyLxv/uWH/pwt6/JCv1u/wCCmf8AyZF43/3LD/04W9fkjX9EeGX/ACTr/wAb/JH7B4QfwMd/ih/6SFFFFfoh+0IKKKKACiiigAooooAKKKKCZbH7yUUUV/H2L/32p6s/jLDfwI+gV4R/wUz/AOTIvGv10z/0521e714R/wAFM/8AkyLxr9dM/wDTnbV6vCX/ACUWE/6+R/M9vIP+R9g/+v8AS/8ATkT8mqKKK/qg/rgKKKKACiiigAr9ZP8AgmV/yZD4K/7if/pyua/Juv1k/wCCZX/JkPgr/uJ/+nK5r898S/8AknF/18j+Uj8s8Xf+RBh/+vy/9N1T3iiiiv55PwYK/B2f/Xv/AL5/nX7xV+DsxBmcg5BY4NftvhN/uuJ9Y/kz9K8KIy/t/Eytp7Nf+ljaKKK/Xz9+CiiigAooooAKKKKACiiigAooooAKKKKACiiigAr3n/gmR/yfD4H/AN7Uf/TbdV4NXvP/AATI/wCT4fA/+9qP/ptuq83OP+RRiP8Ar3P/ANJZ8/xV/wAkvjv+vNX/ANIZ+tdFFFfyK9z+V1sFfCP/AAWw6/DT661/7Y193V8I/wDBbDr8NPrrX/tjX3Xhz/yVFL0n/wCkn1vAX/JaYP1n/wCmqh8I0UUV/Rx/T4UUUUAFFFFACN0P0r93a/CJuh+lfu7X5J4sf7phf8UvyR+J+L3+8YD0q/nSCiiivxI/Hzwr/gpn/wAmReN/9yw/9OFvX5IV+t3/AAUz/wCTIvG/+5Yf+nC3r8ka/ojwy/5J1/43+SP2Dwg/gY7/ABQ/9JCiiiv0Q/aEFFFFABRRRQAUUUUAFFFFBMtj95KKKK/j7F/77U9Wfxlhv4EfQK8I/wCCmf8AyZF41+umf+nO2r3evCP+Cmf/ACZF41+umf8Apztq9XhL/kosJ/18j+Z7eQf8j7B/9f6X/pyJ+TVFFFf1Qf1wFFFFABRRRQAVBL/rT9BU9QS/60/QU47ilsJRRRVkDJvufjXx9X2DN9z8a+Pq+w4S+Or/ANu/qfzr48/7xlvpW/8AcQUUUV9ofgNkFFFFABRRRQB+2v8AwZy/e/aM/wC5R/8Ac1X7d1+In/BnL979oz/uUf8A3NV+3dZzPMr/AMQKKKKDI/lq/wCDjL/lMt8Yf+5e/wDUd06viSvtv/g4y/5TLfGH/uXv/Ud06viStFsepR+CAUUUUGgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH7af8Gcoyf2if8AuUP/AHNV+3gGBiv5Zv8Agjt/wWI/4dPH4in/AIZ5/wCE/Pj/APsf/mcRpX2P7D9t4/49Jf8An7r7e/4jGm/6R0/+Zd/+9NJq5wVaNWUz9ud/tQHycYr8Rv8AiMab/pHR/wCZd/8AvTR/xGNN/wBI6P8AzLv/AN6afKY/V658S/8ABxjz/wAFlvjD/wBy9/6junV8SV7Z/wAFFv2wf+G+P2xvGX7XB+H/APwin/CV/Yf+JCdW+3+R9n062sv9d9ni/wCfevE6D06S5IRCiiigoKKKKACu0/Z7/wCSt6Z/uXX/AKSS1xddp+z3/wAlb0z/AHLr/wBJJa5sX/uUvRnVgP8Af6P+OH/pSPpCiiivyQ/v5bBUkHeo6kg70nsOPxIkoooqCwooooAKKKKAEbofpX7u1+ETdD9K/d2vyTxY/wB0wv8Ail+SPxPxe/3jAelX86QUUUV+JH4+eEf8FNmC/sQ+Nye408ce+o2wr8ktvINftT+0x8FF/aF+CmtfBZ/EX9kDWhbg6j9k+0+WIbqOX/non/POvksf8ER7fBB/aUcnsf8AhEOn/k3X7XwDxPkeWZK8PiayjJSe6fZeR95wPxhlHCtHEU8VSqOVSUZJxSacbJbXVuXVvunom1Z/BVFfeZ/4IjnJ2/tM4HbPgz/7so/4cjN/0cyP/CM/+7K+4/114X/6CV90v8j9Rj4k8GuKbxDX/cOr/wDIHwZRX3n/AMORm/6OZH/hGf8A3ZR/w5Gb/o5kf+EZ/wDdlH+uvC//AEEx+6X+Q/8AiJHBv/QS/wDwXV/+QPgyivvP/hyM3/RzI/8ACM/+7KP+HIzf9HMj/wAIz/7so/114X/6CY/dL/IP+IkcG/8AQS//AAXV/wDkD4Mor7z/AOHIzf8ARzI/8Iz/AO7KP+HIzf8ARzI/8Iz/AO7KP9duFv8AoKj90v8AIP8AiJHBv/QS/wDwXV/+QPgygkDqa+9X/wCCJEZH7v8AaWYH/a8HZ/8AbuhP+CJEQA8z9pRmPfHg/AP/AJN1D444WUXL6ytPJ/5HE/FDhX2CnFzcv5eR83rd2j/5NfXY+76KKK/mbFVlWxVRrufz1QTVBIK8I/4KZ/8AJkXjX66Z/wCnO2r3evCP+Cmf/JkXjX66Z/6c7avZ4S/5KLCf9fI/mexkH/I+wf8A1/pf+nIn5NUUUV/VB/XAUUUUAFFFFABX6yf8Eyv+TIfBX/cT/wDTlc1+TdfrJ/wTK/5Mh8Ff9xP/ANOVzX574l/8k4v+vkfykflni7/yIMP/ANfl/wCm6p7xRRRX88n4MFfg3X7yV8ISf8ESY3JZP2lWUk5x/wAIdwP/ACbr9Z8Os+yfJsPXhiqvI5OL1v2fb1PuuAuJ8u4axdeON5uWqoJSjFytyud7pa296+ie2x8FUV95/wDDkZv+jmR/4Rn/AN2Uf8ORm/6OZH/hGf8A3ZX6T/rtwt/0FR+6X+R+qf8AESODf+gl/wDgur/8gfBlFfef/DkZv+jmR/4Rn/3ZR/w5Gb/o5kf+EZ/92U/9deF/+gqP3S/yD/iJHBv/AEEv/wAF1f8A5A+DKK+8/wDhyM3/AEcyP/CM/wDuyj/hyM3/AEcyP/CM/wDuyj/XXhf/AKCY/dL/ACD/AIiRwb/0Ev8A8F1f/kD4Mor7z/4cjN/0cyP/AAjP/uyj/hyM3/RzI/8ACM/+7KP9deF/+gmP3S/yD/iJHBv/AEEv/wAF1f8A5A+DKK+8/wDhyM3/AEcyP/CM/wDuyj/hyM3/AEcyP/CM/wDuyj/XXhf/AKCY/dL/ACD/AIiRwb/0Ev8A8F1f/kD4Mor7z/4cjN/0cyP/AAjP/uyj/hyM3/RzI/8ACM/+7KP9deF/+gmP3S/yD/iJHBv/AEEv/wAF1f8A5A+DKK+8/wDhyM3/AEcyP/CM/wDuyj/hyM3/AEcyP/CM/wDuyj/XXhf/AKCY/dL/ACD/AIiRwb/0Ev8A8F1f/kD4Mor7z/4cjN/0cyP/AAjP/uyj/hyM3/RzI/8ACM/+7KP9duFv+gqP3S/yD/iJHBv/AEEv/wAF1f8A5A+DVJAPzV7x/wAEw2Zf23/BO453f2iPp/xLrk/0r3of8ERjn5v2meO+PBn/AN2V3n7M3/BLRf2dPjdovxjX45f2yNGFx/xLW8Ni2aTzrWWHr9rb/npXn5pxjw1Wy2vThiE24S6S3t6HgcS8dcKZrkmIwVKpKcqlOSj7lRJz+wruKt71nr7tlq+j+taKKK/mx6s/EFsFfCP/AAWw6/DT661/7Y193V8I/wDBbDr8NPrrX/tjX3Xhz/yVFL0n/wCkn1vAX/JaYP1n/wCmqh8I0UUV/Rx/T4UUUUAFFFFACN0P0r93a/CJuh+lfu7X5J4sf7phf8UvyR+J+L3+8YD0q/nSCiiivxI/Hzwj/gpswX9iHxuT3Gnjj31G2Ffklt5Br9qf2mPgov7QvwU1r4LP4i/sga0LcHUfsn2nyxDdRy/89E/5518lj/giPb4IP7Sjk9j/AMIh0/8AJuv2vgHifI8syV4fE1lGSk90+y8j7zgfjDKOFaOIp4qlUcqkoyTik042S2urcurfdPRNqz+CqK+8z/wRHOTt/aZwO2fBn/3ZR/w5Gb/o5kf+EZ/92V9x/rrwv/0Er7pf5H6jHxJ4NcU3iGv+4dX/AOQPgyivvP8A4cjN/wBHMj/wjP8A7so/4cjN/wBHMj/wjP8A7so/114X/wCgmP3S/wAh/wDESODf+gl/+C6v/wAgfBlFfef/AA5Gb/o5kf8AhGf/AHZR/wAORm/6OZH/AIRn/wB2Uf668L/9BMful/kH/ESODf8AoJf/AILq/wDyB8GUV95/8ORm/wCjmR/4Rn/3ZR/w5Gb/AKOZH/hGf/dlH+u3C3/QVH7pf5B/xEjg3/oJf/gur/8AIHwZQSB1Nfer/wDBEiMj93+0swP+14Oz/wC3dCf8ESIgB5n7SjMe+PB+Af8AybqHxxwsouX1laeT/wAjifihwr7BTi5uX8vI+b1u7R/8mvrsfd9FFFfzNiqyrYqo13P56oJqgkFeEf8ABTP/AJMi8a/XTP8A0521e714R/wUz/5Mi8a/XTP/AE521ezwl/yUWE/6+R/M9jIP+R9g/wDr/S/9ORPyaooor+qD+uAooooAKKKKACoJf9afoKnqCX/Wn6CnHcUthKKKKsgZN9z8a+Pq+wZvufjXx9X2HCXx1f8At39T+dfHj/eMt9K3/uIKKKK+0PwEKKKKACiiigD9tP8AgzlGT+0T/wByh/7mq/bwDAxX8s3/AAR2/wCCxH/Dp4/EU/8ADPP/AAn58f8A9j/8ziNK+x/YftvH/HpL/wA/dfb3/EY03/SOn/zLv/3ppNXOCrRqymftzv8AagPk4xX4jf8AEY03/SOj/wAy7/8Aemj/AIjGm/6R0f8AmXf/AL00+Ux+r1z4l/4OMef+Cy3xh/7l7/1HdOr4kr2z/got+2D/AMN8ftjeMv2uD8P/APhFP+Er+w/8SE6t9v8AI+z6dbWX+u+zxf8APvXidB6dJckIhRRRQUFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABXafs9/8AJW9M/wBy6/8ASSWuLrtP2e/+St6Z/uXX/pJLXNi/9yl6M6sB/v8AR/xw/wDSkfSFFFFfkh/fy2CpIO9R1JB3pPYcfiRJRRRUFhRRRQAUUUUAI3Q/Sv3dr8Im6H6V+7tfknix/umF/wAUvyR+J+L3+8YD0q/nSCiiivxI/HwooooAKKKKACiiigAooooAKKKKACiiigAooooAK8I/4KZ/8mReNfrpn/pztq93rwj/AIKZ/wDJkXjX66Z/6c7avoOEv+Siwn/XyP5nqZB/yPsH/wBfqX/pyJ+TVFFFf1Qf1wFFFFABRRRQAV+sn/BMr/kyHwV/3E//AE5XNfk3X6yf8Ey/+TIfBX/cS/8ATlc1+e+Jf/JOL/HH8pH5Z4u/8iDD/wDX5f8Apuqe8UUUV/PJ+DBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFfCP/BbDr8NPrrX/tjX3dXwj/wWw6/DT661/wC2NfdeHP8AyVFL0n/6Sz63gL/ktMH6z/8ATVQ+EaKKK/o4/p8KKKKACiiigBG6H6V+7tfhE3Q/Sv3dr8k8WP8AdML/AIpfkj8T8Xv94wHpV/OkFFFFfiR+PhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAV4R/wUz/5Mi8a/XTP/TnbV7vXhH/BTP8A5Mi8a/XTP/TnbV9Bwl/yUWE/6+R/M9TIP+R9g/8Ar9S/9ORPyaooor+qD+uAooooAKKKKACoJf8AWn6Cp6gl/wBafoKcdxS2EoooqyBk33Pxr4+r7Bm+5+NfH1fYcJfHV/7d/U/nXx4/3jLfSt/7iCiiivtD8BCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigArtP2e/8Akremf7l1/wCkktcXXafs9/8AJW9M/wBy6/8ASSWubF/7lL0Z1YD/AH+j/jh/6Uj6Qooor8kP7+WwVJB3qOpIO9J7Dj8SJKKKKgsKKKKACiiigB8Pleannfd3jf8ASv3Zr8I697X/AIKZfttogQ/GFGOfvN4d0/8ApBXxXGfDOJ4ko0o0ZJODfxedj8s8R+Fc9z7EYbEZclPkUoyjKXLbmcWpRTVuj59b2UbJ6n6w0V+TH/Dy/wDbd/6Lcf8Awm9N/wDkaj/h5f8Atu/9FuP/AITem/8AyNXwH/EKc1/5/wBP7pf5Hxn/ABCviv8Ano/+B1P/AJUfrPRX5Mf8PL/23f8Aotx/8JvTf/kaj/h5f+27/wBFuP8A4Tem/wDyNR/xCrNf+f8AT+6X+Qf8Qr4r/no/+B1P/lR+s9Ffkx/w8v8A23f+i3H/AMJvTf8A5Go/4eX/ALbv/Rbj/wCE3pv/AMjUf8QqzX/n/T+6X+Qf8Qr4r/no/wDgdT/5UfrPRX5Mf8PL/wBt3/otx/8ACb03/wCRqP8Ah5f+27/0W4/+E3pv/wAjUf8AEKs1/wCf9P7pf5B/xCviv+ej/wCB1P8A5UfrPRX5Mf8ADy/9t3/otx/8JvTf/kaj/h5f+27/ANFuP/hN6b/8jUf8QqzX/n/T+6X+Qf8AEK+K/wCej/4HU/8AlR+s9Ffkx/w8v/bd/wCi3H/wm9N/+RqP+Hl/7bv/AEW4/wDhN6b/API1H/EKs1/5/wBP7pf5B/xCviv+ej/4HU/+VH6z0V+TH/Dy/wDbd/6Lcf8Awm9N/wDkaj/h5f8Atu/9FuP/AITem/8AyNR/xCrNf+f9P7pf5B/xCviv+ej/AOB1P/lR+s9Ffk7/AMPN/wBtj/osEX/hO6f/APGKP+Hm/wC2x/0WCL/wndP/APjFT/xCvNv+f0PxPN/4hzxp/wBA8f8AwYj9Yq8J/wCCmCM/7EnjUKM4Gmn8BqVsa+Eh/wAFM/22ivln4zr/AL//AAjmnZ/9EY/Sue+J/wC3F+1F8Y/A138NPiR8UP7R0W+aNr2z/sezh8wpKJEJeOFX4YA8EV62TeHGZZbmlLFzrRfJJO2vQ9bLPDfi3D5lQrT9nGNOrBt88npCSlzJKKunayV4ybeqirteT0UUV+wH9BBRRRQAUUUUABAB4NfrP/wTRj8v9iXwSuc5XUW6euo3J/rX5MAZOK9b+F37cn7UPwY8DWfw0+HPxIFjothJI9nZtpFpLs3y+Y/zvCznLZPXufbHzHFuR1+IMq+q0pKL5k9dtD8+8RsgzniDLaFPL0pOFTmcW0rrlcbqT/lvt1TfVJP9gaK/Jj/h5f8Atu/9FuP/AITem/8AyNR/w8v/AG3f+i3H/wAJvTf/AJGr8y/4hTmv/P8Ap/dL/I/Ov+IV8V/z0f8AwOp/8qP1nor8mP8Ah5f+27/0W4/+E3pv/wAjUf8ADy/9t3/otx/8JvTf/kaj/iFWa/8AP+n90v8AIP8AiFfFf89H/wADqf8Ayo/WeivyY/4eX/tu/wDRbj/4Tem//I1H/Dy/9t3/AKLcf/Cb03/5Go/4hVmv/P8Ap/dL/IP+IV8V/wA9H/wOp/8AKj9Z6K/Jj/h5f+27/wBFuP8A4Tem/wDyNR/w8v8A23f+i3H/AMJvTf8A5Go/4hVmv/P+n90v8g/4hXxX/PR/8Dqf/Kj9Z6K/Jj/h5f8Atu/9FuP/AITem/8AyNR/w8v/AG3f+i3H/wAJvTf/AJGo/wCIVZr/AM/6f3S/yD/iFfFf89H/AMDqf/Kj9Z6K/Jj/AIeX/tu/9FuP/hN6b/8AI1H/AA8v/bd/6Lcf/Cb03/5Go/4hVmv/AD/p/dL/ACD/AIhXxX/PR/8AA6n/AMqP1nor8mP+Hl/7bv8A0W4/+E3pv/yNR/w8v/bd/wCi3H/wm9N/+RqP+IVZr/z/AKf3S/yD/iFfFf8APR/8Dqf/ACo/WeivyY/4eX/tu/8ARbj/AOE3pv8A8jUf8PL/ANt3/otx/wDCb03/AORqP+IVZr/z/p/dL/IP+IV8V/z0f/A6n/yo/WeivyY/4eX/ALbv/Rbj/wCE3pv/AMjUf8PL/wBt3/otx/8ACb03/wCRqP8AiFWa/wDP+n90v8g/4hXxX/PR/wDA6n/yo/WeivyY/wCHl/7bv/Rbj/4Tem//ACNR/wAPL/23f+i3H/wm9N/+RqP+IVZr/wA/6f3S/wAg/wCIV8V/z0f/AAOp/wDKj9Z6K/Jj/h5f+27/ANFuP/hN6b/8jUf8PL/23f8Aotx/8JvTf/kaj/iFWa/8/wCn90v8g/4hXxX/AD0f/A6n/wAqP1nor8mP+Hl/7bv/AEW4/wDhN6b/API1H/Dy/wDbd/6Lcf8Awm9N/wDkaj/iFOa/8/6f3S/yD/iFfFf89H/wOp/8qP1nr4T/AOC14cxfDUgjb5ms5Hv/AKFj+teDxf8ABTH9tpCS/wAaA/HRvDmnf0txXBfGz9pX41/tFyaZJ8ZPG/8AbJ0cTDTv+Jba2wh84qZP9RGmc+WvXPTivo+F+A8dkWbRxVWrGSimrK/VW6nq8O+HfEeXcQ4bFYl0vZ0Zczak5XvGStGLgtU2tXa3xRu1Y4Siiiv1E/cQooooAKKKKAHw+V5qed93eN/0r92a/COve1/4KZfttogQ/GFGOfvN4d0/+kFfFcZ8M4niSjSjRkk4N/F52PyzxH4Vz3PsRhsRlyU+RSjKMpctuZxalFNW6Pn1vZRsnqfrDRX5Mf8ADy/9t3/otx/8JvTf/kaj/h5f+27/ANFuP/hN6b/8jV8B/wAQpzX/AJ/0/ul/kfGf8Qr4r/no/wDgdT/5UfrPRX5Mf8PL/wBt3/otx/8ACb03/wCRqP8Ah5f+27/0W4/+E3pv/wAjUf8AEKs1/wCf9P7pf5B/xCviv+ej/wCB1P8A5UfrPRX5Mf8ADy/9t3/otx/8JvTf/kaj/h5f+27/ANFuP/hN6b/8jUf8QqzX/n/T+6X+Qf8AEK+K/wCej/4HU/8AlR+s9Ffkx/w8v/bd/wCi3H/wm9N/+RqP+Hl/7bv/AEW4/wDhN6b/API1H/EKs1/5/wBP7pf5B/xCviv+ej/4HU/+VH6z0V+TH/Dy/wDbd/6Lcf8Awm9N/wDkaj/h5f8Atu/9FuP/AITem/8AyNR/xCrNf+f9P7pf5B/xCviv+ej/AOB1P/lR+s9Ffkx/w8v/AG3f+i3H/wAJvTf/AJGo/wCHl/7bv/Rbj/4Tem//ACNR/wAQqzX/AJ/0/ul/kH/EK+K/56P/AIHU/wDlR+s9Ffkx/wAPL/23f+i3H/wm9N/+RqP+Hl/7bv8A0W4/+E3pv/yNR/xCrNf+f9P7pf5B/wAQr4r/AJ6P/gdT/wCVH6z0V+Tv/Dzf9tj/AKLBF/4Tun//ABij/h5v+2x/0WCL/wAJ3T//AIxU/wDEK82/5/Q/E83/AIhzxp/0Dx/8GI/WKvCf+CmCM/7EnjUKM4Gmn8BqVsa+Eh/wUz/baK+WfjOv+/8A8I5p2f8A0Rj9K574n/txftRfGPwNd/DT4kfFD+0dFvmja9s/7Hs4fMKSiRCXjhV+GAPBFetk3hxmWW5pSxc60XySTtr0PWyzw34tw+ZUK0/ZxjTqwbfPJ6QkpcySirp2sleMm3qoq7Xk9FFFfsB/QQUUUUAFFFFABUEv+tP0FT1BL/rT9BTjuKWwlFFFWQMm+5+NfH1fYM33Pxr4+r7DhL46v/bv6n86+PH+8Zb6Vv8A3EFFFFfaH4CFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABXafs9/8lb0z/cuv/SSWuLrtP2e/+St6Z/uXX/pJLXNi/wDcpejOrAf7/R/xw/8ASkfSFFFFfkh/fy2CpIO9R1JB3pPYcfiRJRRRUFhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABUEv8ArT9BU9QS/wCtP0FOO4pbCUUUVZAyb7n418fV9gzfc/Gvj6vsOEvjq/8Abv6n86+PH+8Zb6Vv/cQUUUV9ofgIUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFdp+z3/AMlb0z/cuv8A0klri67P9n1lX4taYWIHy3I5/wCvWWubFtLBS9GdeXRlLMaKSu3On/6Uj6Rooor8kP79WwVJB3qOik9QWjuWKKr0UuUrmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFFV6KOUOYsUVXoo5Q5ixRVeijlDmLFQS/wCtP0FJRTSsJyugooopiGTfc/Gvj6vsGb7n418fV9hwl8dX/t39T+dfHj/eMt9K3/uIKKKK+0PwEKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACuv+A3/JVtL/3p/wD0neuQrr/gN/yVbS/96f8A9J3rhzL/AJFdX/DL8j3uF/8AkqsB/wBfqH/p2J9K0UUV+Un91LYKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAGTfc/Gvj6vsKUFl2qMkngCvj2vseEvjq/wDbv6n86ePEovE5bG+tq3/uIKKKK+zPwIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAn0vS7/AFm/TTNNtfMnk3+VF5yJ/BWz/wAKq8ef9AUf9/YP/jlHwu/5Hyw/4F/6Ir2CuHFYqdKZ6+AwFLEUuaR4/wD8Kq8ef9AUf9/YP/jlH/CqvHn/AEBR/wB/YP8A45XsFFc/1+udv9j4U8f/AOFVePP+gKP+/sH/AMco/wCFVePP+gKP+/sH/wAcr2Cij6/XD+x8KeP/APCqvHn/AEBR/wB/YP8A45R/wqrx5/0BR/39g/8AjlewUUfX64f2PhTx/wD4VV48/wCgKP8Av7B/8co/4VV48/6Ao/7+wf8AxyvYKKPr9cP7Hwp4/wD8Kq8ef9AUf9/YP/jlH/CqvHn/AEBR/wB/YP8A45XsFFH1+uH9j4U8f/4VV48/6Ao/7+wf/HKP+FVePP8AoCj/AL+wf/HK9goo+v1w/sfDHj//AAqrx5/0BR/39g/+OV0vwd8EeIfDPxG0/WfEGn/Z7CDzfMl81H8otDIo+5Xd0VnVxVWtScJK6ejNoZYqU41aUnGpCSlFrdSi0015pq52n/CT6H/0FE/78Sf/ABNH/CT6H/0FU/78Sf8AxNcXRXhf2Rguz+8/RP8AiIvGn/P+P/gtHaf8JPof/QVT/vxJ/wDE0f8ACT6H/wBBVP8AvxJ/8TXF0Uf2Rguz+8f/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtP+En0P/oKp/34k/8AiaP+En0P/oKp/wB+JP8A4muLoo/sjBdn94f8RE40/wCf8f8AwWjtP+En0P8A6Cqf9+JP/iaP+En0P/oKp/34k/8Aia4uij+yMF2f3h/xETjT/n/H/wAFo7T/AISfQ/8AoKp/34k/+Jo/4SfQ/wDoKp/34k/+Jri6KP7IwXZ/eH/ERONP+f8AH/wWjtP+En0P/oKp/wB+JP8A4mj/AISfQ/8AoKp/34k/+Jri6KP7IwXZ/eH/ABETjT/n/H/wWjtU8TaB5il9XCgHOVt5Cf1Wvmr/AIVV48/6Ao/7+wf/AByvYKK9DARpZemqa3Pk8/x2YcU4qGIzKpzSppxjyxUdG7vbV/N2XRK7v4//AMKq8ef9AUf9/YP/AI5R/wAKq8ef9AUf9/YP/jlewUV6P1+ueB/Y+FPH/wDhVXjz/oCj/v7B/wDHKP8AhVXjz/oCj/v7B/8AHK9goo+v1w/sfCnj/wDwqrx5/wBAUf8Af2D/AOOUf8Kq8ef9AUf9/YP/AI5XsFFH1+uH9j4U8f8A+FVePP8AoCj/AL+wf/HKP+FVePP+gKP+/sH/AMcr2Cij6/XD+x8KeP8A/CqvHn/QFH/f2D/45R/wqrx5/wBAUf8Af2D/AOOV7BRR9frh/Y+FPH/+FVePP+gKP+/sH/xyj/hVXjz/AKAo/wC/sH/xyvYKKPr9cP7Hwp4//wAKq8ef9AUf9/YP/jlH/CqvHn/QFH/f2D/45XsFFNY6vcHlOGSPn+iiivVR849GFFFFAgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA6D4Xf8j5Yf8C/9EV7BXj/AMLv+R8sP+Bf+iK9grycf/FPp8n/AIIUUUVwnqhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQtyZ7Hz/RRRX0i2Ph57hRRRQSFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAGj4X17/hHNeg1j7L5nl7/wB19zzPkk/+OV1//C8h/wBCuf8AwL/+115/RWE6FCcveOmlja9KPLE9A/4XkP8AoVz/AOBf/wBro/4XkP8AoVz/AOBf/wBrrz+io+pUDf8AtHFfznoH/C8h/wBCuf8AwL/+10f8LyH/AEK5/wDAv/7XXn9FH1KgH9o4r+c9A/4XkP8AoVz/AOBf/wBro/4XkP8AoVz/AOBf/wBrrz+ij6lQD+0cV/Oegf8AC8h/0K5/8C//ALXR/wALyH/Qrn/wL/8Atdef0UfUqAf2jiv5z0D/AIXkP+hXP/gX/wDa6P8AheQ/6Fc/+Bf/ANrrz+ij6lQD+0cV/Oegf8LyH/Qrn/wL/wDtdH/C8h/0K5/8C/8A7XXn9FH1KgH9o4r+c9A/4XkP+hXP/gX/APa6P+F5D/oVz/4F/wD2uvP6KPqVAP7RxX856B/wvIf9Cuf/AAL/APtdH/C8h/0K5/8AAv8A+115/RR9SoB/aOK/nPQP+F5D/oVz/wCBf/2uj/heQ/6Fc/8AgX/9rrz+ij6lQD+0cV/Oegf8LyH/AEK5/wDAv/7XR/wvIf8AQrn/AMC//tdef0UfUqAf2jiv5z0D/heQ/wChXP8A4F//AGuj/heQ/wChXP8A4F//AGuvP6KPqVAP7RxX856B/wALyH/Qrn/wL/8AtdH/AAvIf9Cuf/Av/wC115/RR9SoB/aOK/nPQP8AheQ/6Fc/+Bf/ANro/wCF5D/oVz/4F/8A2uvP6KPqVAP7RxX856B/wvIf9Cuf/Av/AO10f8LyH/Qrn/wL/wDtdef0UfUqAf2jiv5z0D/heQ/6Fc/+Bf8A9ro/4XkP+hXP/gX/APa68/oo+pUA/tHFfznoH/C8h/0K5/8AAv8A+10f8LyH/Qrn/wAC/wD7XXn9FH1KgH9o4r+c9A/4XkP+hXP/AIF//a6P+F5D/oVz/wCBf/2uvP6KPqVAP7RxX856B/wvIf8AQrn/AMC//tdH/C8h/wBCuf8AwL/+115/RR9SoB/aOK/nPQP+F5D/AKFc/wDgX/8Aa6P+F5D/AKFc/wDgX/8Aa68/oo+pUA/tHFfznoH/AAvIf9Cuf/Av/wC10f8AC8h/0K5/8C//ALXXn9FH1KgH9o4r+c9A/wCF5D/oVz/4F/8A2uj/AIXkP+hXP/gX/wDa68/oo+pUA/tHFfznoH/C8h/0K5/8C/8A7XR/wvIf9Cuf/Av/AO115/RR9SoB/aOK/nPQP+F5D/oVz/4F/wD2uj/heQ/6Fc/+Bf8A9rrz+ij6lQD+0cV/Oegf8LyH/Qrn/wAC/wD7XR/wvIf9Cuf/AAL/APtdef0UfUqAf2jiv5z0D/heQ/6Fc/8AgX/9ro/4XkP+hXP/AIF//a68/oo+pUA/tHFfznoH/C8h/wBCuf8AwL/+10f8LyH/AEK5/wDAv/7XXn9FH1KgH9o4r+c9A/4XkP8AoVz/AOBf/wBro/4XkP8AoVz/AOBf/wBrrz+ij6lQD+0cV/Oegf8AC8h/0K5/8C//ALXR/wALyH/Qrn/wL/8Atdef0UfUqAf2jiv5z0D/AIXkP+hXP/gX/wDa6P8AheQ/6Fc/+Bf/ANrrz+ij6lQD+0cV/Oegf8LyH/Qrn/wL/wDtdH/C8h/0K5/8C/8A7XXn9FH1KgH9o4r+c9A/4XkP+hXP/gX/APa6P+F5D/oVz/4F/wD2uvP6KPqVAP7RxX856B/wvIf9Cuf/AAL/APtdH/C8h/0K5/8AAv8A+115/RR9SoB/aOK/nPQP+F5D/oVz/wCBf/2uj/heQ/6Fc/8AgX/9rrz+ij6lQD+0cV/Oegf8LyH/AEK5/wDAv/7XR/wvIf8AQrn/AMC//tdef0UfUqAf2jiv5z0D/heQ/wChXP8A4F//AGuj/heQ/wChXP8A4F//AGuvP6KPqVAP7RxX856B/wALyH/Qrn/wL/8AtdH/AAvIf9Cuf/Av/wC115/RR9SoB/aOK/nPQP8AheQ/6Fc/+Bf/ANro/wCF5D/oVz/4F/8A2uvP6KPqVAP7RxX856B/wvIf9Cuf/Av/AO10f8LyH/Qrn/wL/wDtdef0UfUqAf2jiv5z0D/heQ/6Fc/+Bf8A9ro/4XkP+hXP/gX/APa68/oo+pUA/tHFfznoH/C8h/0K5/8AAv8A+10f8LyH/Qrn/wAC/wD7XXn9FH1KgH9o4r+c9A/4XkP+hXP/AIF//a6P+F5D/oVz/wCBf/2uvP6KPqVAP7RxX856B/wvIf8AQrn/AMC//tdH/C8h/wBCuf8AwL/+115/RR9SoB/aOK/nPQP+F5D/AKFc/wDgX/8Aa6P+F5D/AKFc/wDgX/8Aa68/oo+pUA/tHFfznoH/AAvIf9Cuf/Av/wC10f8AC8h/0K5/8C//ALXXn9FH1KgH9o4r+c9A/wCF5D/oVz/4F/8A2uj/AIXkP+hXP/gX/wDa68/oo+pUA/tHFfznoH/C8h/0K5/8C/8A7XR/wvIf9Cuf/Av/AO115/RR9SoB/aOK/nPQP+F5D/oVz/4F/wD2uj/heQ/6Fc/+Bf8A9rrz+ij6lQD+0cV/Oegf8LyH/Qrn/wAC/wD7XR/wvIf9Cuf/AAL/APtdef0UfUqAf2jiv5z0D/heQ/6Fc/8AgX/9ro/4XkP+hXP/AIF//a68/oo+pUA/tHFfznoH/C8h/wBCuf8AwL/+10f8LyH/AEK5/wDAv/7XXn9FH1KgH9o4r+c9A/4XkP8AoVz/AOBf/wBro/4XkP8AoVz/AOBf/wBrrz+ij6lQD+0cV/Oegf8AC8h/0K5/8C//ALXR/wALyH/Qrn/wL/8Atdef0UfUqAf2jiv5z0D/AIXkP+hXP/gX/wDa6P8AheQ/6Fc/+Bf/ANrrz+ij6lQD+0cV/Oegf8LyH/Qrn/wL/wDtdH/C8h/0K5/8C/8A7XXn9FH1KgH9o4r+c9A/4XkP+hXP/gX/APa6P+F5D/oVz/4F/wD2uvP6KPqVAP7RxX856B/wvIf9Cuf/AAL/APtdH/C8h/0K5/8AAv8A+115/RR9SoB/aOK/nPQP+F5D/oVz/wCBf/2uj/heQ/6Fc/8AgX/9rrz+ij6lQD+0cV/Oegf8LyH/AEK5/wDAv/7XR/wvIf8AQrn/AMC//tdef0UfUqAf2jiv5z0D/heQ/wChXP8A4F//AGuj/heQ/wChXP8A4F//AGuvP6KPqVAP7RxX856B/wALyH/Qrn/wL/8AtdH/AAvIf9Cuf/Av/wC115/RR9SoB/aOK/nPQP8AheQ/6Fc/+Bf/ANro/wCF5D/oVz/4F/8A2uvP6KPqVAP7RxX856B/wvIf9Cuf/Av/AO10f8LyH/Qrn/wL/wDtdef0UfUqAf2jiv5z0D/heQ/6Fc/+Bf8A9ro/4XkP+hXP/gX/APa68/oo+pUA/tHFfznoH/C8h/0K5/8AAv8A+10f8LyH/Qrn/wAC/wD7XXn9FH1KgH9o4r+c9A/4XkP+hXP/AIF//a6P+F5D/oVz/wCBf/2uvP6Kf1OgH9o4r+cKKKK6TzwooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/Z" alt="High altar in red for the Mass of the Holy Spirit" class="mass-altar-img">
    </div>
    <blockquote class="mass-verse">
      <p>"${esc(yv.verse)}"</p>
      <cite>— ${esc(yv.ref)} (Douay-Rheims)</cite>
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
  const years = [...new Set(entries.map(e => e.year))].sort((a, b) => b - a);
  const dests = [...new Set(entries.map(e => e.destination).filter(Boolean))].sort();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
  <div class="overlay-card ledger-card" role="dialog" aria-modal="true" aria-label="Ledger">
    <button class="overlay-close" aria-label="Close ledger">✕</button>
    <h2 class="px">THE LEDGER</h2>
    <p class="ledger-sub">Every indipetae, decision, departure, outcome, and event — as the Generalate records them.</p>
    <div class="ledger-filters">
      <input id="lf-q" type="search" placeholder="Search petitioner…" aria-label="Search petitioner">
      <select id="lf-year" aria-label="Filter by year"><option value="">All years</option>${years.map(y => `<option>${y}</option>`).join('')}</select>
      <select id="lf-dest" aria-label="Filter by destination"><option value="">All destinations</option>${dests.map(d => `<option value="${esc(d)}">${esc(destName(app, d))}</option>`).join('')}</select>
      <select id="lf-dec" aria-label="Filter by decision"><option value="">Any decision</option><option value="approved">approved</option><option value="denied">denied</option></select>
      <select id="lf-status" aria-label="Filter by status"><option value="">Any status</option>${['departed','blocked','arrived','lost','returned','fired'].map(s => `<option>${s}</option>`).join('')}</select>
    </div>
    <div class="ledger-rows" id="ledger-rows" role="table" aria-label="Ledger entries"></div>
  </div>`;

  const render = () => {
    const f = {
      petitioner: ov.querySelector('#lf-q').value,
      year: ov.querySelector('#lf-year').value || undefined,
      destination: ov.querySelector('#lf-dest').value || undefined,
      decision: ov.querySelector('#lf-dec').value || undefined,
      status: ov.querySelector('#lf-status').value || undefined,
    };
    const rows = app.Engine.getLedger(app.state, f);
    const host = ov.querySelector('#ledger-rows');
    host.innerHTML = rows.length ? rows.map(e => `
      <div class="lrow" role="row">
        <span class="lrow-year">${e.year}</span>
        <span class="lrow-type">${esc(e.type)}</span>
        <span class="lrow-text">${esc(e.text)}
          ${e.fictional ? '<span class="badge fict">fictional</span>' : ''}
        </span>
        ${e.delta ? `<span class="delta ${e.delta >= 0 ? 'pos' : 'neg'}">${e.delta >= 0 ? '+' : ''}${e.delta}</span>` : '<span></span>'}
      </div>`).join('')
      : `<p class="gmap-hint">No entries match these filters.</p>`;
  };
  ['#lf-q', '#lf-year', '#lf-dest', '#lf-dec', '#lf-status'].forEach(sel => {
    ov.querySelector(sel).addEventListener('input', render);
    ov.querySelector(sel).addEventListener('change', render);
  });
  render();
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
      <button class="gbtn ghost" id="to-title">Title</button>
    </div>
  </section>`;
  root.querySelector('#again-campaign').addEventListener('click', () => app.newGame('campaign'));
  root.querySelector('#again-endless').addEventListener('click', () => app.newGame('endless'));
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