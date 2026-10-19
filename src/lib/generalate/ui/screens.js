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
    const delta = cur > init ? ' ↑' : cur < init ? ' ↓' : '';
    return `<div class="insp-row">
      <span class="insp-tname" title="${esc(t.blurb)}">${esc(t.name)}</span>
      <span class="insp-scale"><span class="insp-lab">at first</span> ${dispDots(init)} <span class="insp-word">${esc(Dispositions.traitLabel(init))}</span></span>
      <span class="insp-scale"><span class="insp-lab">now</span> ${dispDots(cur)} <span class="insp-word">${esc(Dispositions.traitLabel(cur))}${delta}</span></span>
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
      <p><strong>5. The account.</strong> Your SCORE starts at 50. You are judged by fruit, not dispatches: score moves when voyage news arrives and through lasting foundations. Each approval costs 1 energy and 30 scudi for the seal. Campaign ends in 1645; in Endless mode, you lay down the office when you choose.</p>

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
      <p class="howto-note">Frontier fields await the Society — 1000 scudi, 3 energy, and men to send. Collapsed missions can be rebuilt.</p>
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
      <button class="gbtn small ghost prov-ask" data-id="${esc(id)}" ${questionsLeft > 0 && energy > 0 ? '' : 'disabled'}>Ask about him</button></li>`).join('')}
      ${roster.length > 60 ? `<li class="disp-mini">…and ${roster.length - 60} more.</li>` : ''}</ul>`
      : `<p class="howto-note">No men of his are known to the Generalate.</p>`}
    <p class="howto-note">Questions this year: <strong>${questionsLeft} of ${E.QUESTIONS_PER_YEAR}</strong> remain. Each costs 1 energy.</p>

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
      <button class="gbtn small verdict approve-btn" data-id="${esc(c.id)}" data-verdict="approve" aria-pressed="false" title="Approve (1 energy, 30 scudi seal)">Approve</button>
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
      <p class="disp-mini">Commission +1 berth for 400 scudi and 1 energy (Governance).</p>
    </div>
    <div class="logi-section">
      <h3 class="px">SHIPS (${ships.length})</h3>
      <div class="logi-ships">${shipCards || '<p class="disp-mini">No ships.</p>'}</div>
      <p class="disp-mini">Caravel: 4 men · Carrack: 8 men · Galleon: 12 men. Charter in Governance (1 energy).</p>
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