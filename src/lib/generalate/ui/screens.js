/* GENERALATE — screens.js
 * All game screens. Each renderX(app, root, ...) builds DOM into root.
 * app provides: Engine, state, esc(), sound(), save(), go(), debug helpers.
 */

import * as Dispositions from '../dispositions.js';
import { DOMESTIC_ROLES } from '../rules.js';

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
  const g = app.Engine.gradeFor(app.state, petitionerId);
  const ord = g.ordained === true ? 'ordained priest'
    : g.ordained === false ? 'not ordained' : 'ordination not specified in the source';
  return `<span class="grade-chip" title="${esc(ord)}">${esc(Dispositions.gradeLabel(g.grade))}</span>`;
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
  </div>`;
  ov.querySelector('.overlay-close').addEventListener('click', () => { app.sound('page'); ov.remove(); });
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  app.sound('page');
}

function destName(app, id) {
  const d = app.destInfo(id);
  return d ? d.name : id;
}

/* ---------------- title ---------------- */
export function renderTitle(app, root) {
  root.innerHTML = `
  <section class="gscreen title-screen">
    <div class="title-seal" aria-hidden="true">✠</div>
    <h1 class="game-title px">GENERALATE</h1>
    <p class="game-sub">You are the Superior General of the Society of Jesus.<br>
    Every year, three petitioners beg to be sent to the missions.<br>
    Choose one. The sea will judge the rest.</p>
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
      <p><strong>2. The terna.</strong> Three petitioners lay their letters on your desk. Read each letter — the full text, the dossier, the man's history. No choice is marked; the weight is yours.</p>
      <p><strong>3. The decision.</strong> Select one petitioner, review your choice, and confirm. The seal falls: <em>APPROVED</em> on one, <em>DENIED</em> on two.</p>
      <p><strong>4. The year turns.</strong> Your chosen man sails. Storms, war, plague, and politics decide what your seal began. The ledger records everything.</p>
      <p><strong>5. The account.</strong> Your SCORE starts at 50: each terna gives +3 for the man you approve and −2 for each man you deny. Campaign ends in 1645; in Endless mode, you lay down the office when you choose.</p>
      <p class="howto-note">Letters marked <strong>fictional</strong> were written for this game. Outcomes marked <strong>counterfactual</strong> are the game's imagining, not history. The map is drawn as a 1615 cartographer might draw it — roughly, and with sea monsters.</p>
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
    items.push({ cat: 'required', text: `Terna of ${n} petitioners awaits your judgment.`,
      action: '<button class="gbtn small primary desk-terna">Judge the terna →</button>' });
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
      <div class="brief-stat"><span class="bs-num">${b.funds}</span><span class="bs-label">scudi in the mission chest</span></div>
      <div class="brief-stat"><span class="bs-num">${b.berths}</span><span class="bs-label">free berths this year</span></div>
      <div class="brief-stat"><span class="bs-num">${app.state.resources.ships.filter(s => (s.freeYear || 0) <= start.year).length}/${app.state.resources.ships.length}</span><span class="bs-label">hulls free</span></div>
      <div class="brief-stat"><span class="bs-num">${(app.state.available || 0).toLocaleString('en-US')}</span><span class="bs-label">available for mission (1% of the Society)</span></div>
      <div class="brief-stat"><span class="bs-num">${(app.state.society || 0).toLocaleString('en-US')}</span><span class="bs-label">Jesuits in the Society</span></div>
    </div>
    ${generalDeskHTML(app, start.year)}
    ${euroCount ? `
    <p class="howto-note">🕯️ ${euroCount} ${euroCount === 1 ? 'man labors' : 'men labor'} in Europe — denied at your desk or returned from the sea. Visit the <button class="linklike" id="brief-to-house">House of Formation</button> to form them or send them to the missions.</p>` : ''}
    ${(app.state.zealUntil || 0) >= start.year ? `
    <p class="howto-note">🔥 Zeal for the missions burns — a veteran's testimony aids every voyage (+1) through ${app.state.zealUntil}.</p>` : ''}
    ${requests.length ? `
    <h3 class="sect">The missions ask for men</h3>
    <ul class="news-list">${requests.slice(0, 4).map(r => `<li>✉️ <strong>${esc(r.name)}</strong> (${r.staffed}/${r.capacity}) asks for ${r.want === 1 ? 'one more man' : r.want + ' more men'} — send them by the <button class="linklike" data-goto="desk">terna</button> or from the <button class="linklike" data-goto="missions">Missions</button> tab.</li>`).join('')}</ul>
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
      <button class="gbtn" id="expand-berths">Commission +2 berths (400 scudi)</button>
      <button class="gbtn" id="charter-ship">Charter a hull (300 scudi)</button>
      <label class="dest-redirect">Novitiate at:
        <select id="novitiate-dest" aria-label="Novitiate destination">
          ${openDests.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}
        </select>
      </label>
      <button class="gbtn" id="found-novitiate" ${openDests.length ? '' : 'disabled'}>Found a novitiate (800 scudi)</button>
      <button class="gbtn primary" id="to-desk">Receive the terna →</button>
    </div>
  </section>`;
  root.querySelector('#to-desk').addEventListener('click', () => { app.sound('page'); app.go('desk'); });
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
      app.Engine.charterShip(app.state);
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
  const list = app.state.europeanLabor || [];
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
    return `<li class="formation-row">
      <strong>${esc(e.name)}</strong> ${gradeChip(app, e.petitionerId)}
      <span class="form-via">${esc(e.via)} ${e.year}</span>
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
        <button class="gbtn small warn emg-dispatch" data-id="${esc(e.petitionerId)}" title="Interrupt formation (forfeits progress) and dispatch directly. Normal dispatch cost applies.">Dispatch</button>`
        : `<label class="form-pick">Dispatch to mission:
          <select class="europe-dest" data-id="${esc(e.petitionerId)}" aria-label="Dispatch destination for ${esc(e.name)}">
            ${(app.Engine.DESTINATIONS ? Object.values(app.Engine.DESTINATIONS) : []).filter(d => d && d.id && (app.state.destState[d.id] || {}).access !== 'closed').map(d => `<option value="${d.id}">${esc(d.name || d.id)}</option>`).join('')}
          </select></label>
        <button class="gbtn small primary europe-dispatch" data-id="${esc(e.petitionerId)}" title="Send this man directly to a mission. Normal dispatch cost applies.">Dispatch</button><br>
        <label class="form-pick">Domestic:
          <select class="domestic-role" data-id="${esc(e.petitionerId)}" aria-label="Domestic assignment for ${esc(e.name)}">
            <option value="">— available —</option>${roleOpts}
          </select></label>
          <button class="gbtn small domestic-assign" data-id="${esc(e.petitionerId)}">Assign</button>
        ${ordElig ? `<button class="gbtn small warn ordain-btn" data-id="${esc(e.petitionerId)}" title="Ordain this scholastic as a priest. Irreversible.">Ordain</button>` : ''}
        <label class="form-pick">Focus:
          <select class="form-focus" data-id="${esc(e.petitionerId)}" aria-label="Formation focus for ${esc(e.name)}">
            ${Dispositions.FORMATIONS.map((f) => `<option value="${f.id}" title="${esc(f.blurb)}">${esc(f.name)}</option>`).join('')}
          </select></label>
          <button class="gbtn small form-assign" data-id="${esc(e.petitionerId)}" data-name="${esc(e.name)}">Form (20)</button>`}
      <button class="gbtn small ghost inspect-btn" data-id="${esc(e.petitionerId)}" data-name="${esc(e.name)}">Inspect</button>
    </li>`;
  }).join('')}</ul>`;
}

export function renderHouse(app, root) {
  const year = app.state.currentYear ? app.state.currentYear.year : app.state.year;
  const inForm = (app.state.europeanLabor || []).filter(e => e.formation && e.formation.until > year);
  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">THE HOUSE OF FORMATION</p>
    <h2 class="year-head px">ANNO ${year}</h2>
    <p class="howto-note">Here the men laboring in Europe are formed — and from here the General may send formed men straight to the missions, by the terna or by direct dispatch (see the Missions tab).</p>
    ${inForm.length ? `<p class="howto-note">🕯️ ${inForm.length} ${inForm.length === 1 ? 'man is' : 'men are'} in formation now.</p>` : ''}
    <h3 class="sect">Formation</h3>
    <p class="howto-note">A year of formation (20 scudi) deepens a man's disposition. He must be laboring in Europe and free — no double-booking. A formed man sits out one terna, then may petition again.</p>
    ${formationListHTML(app, year)}
    <div class="btn-row">
      <button class="gbtn ghost" id="house-back">← Back</button>
    </div>
  </section>`;
  root.querySelector('#house-back').addEventListener('click', () => {
    app.sound('page');
    app.go(app.ui.houseFrom && app.ui.houseFrom !== 'house' ? app.ui.houseFrom : 'briefing');
  });
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
  const gradeBits = grades.map(gid => `${st[gid]} ${E.MISSION_GRADES[gid].short.toLowerCase()}`).join(' · ');
  const fragFlag = st.fragile
    ? '<span class="mflag fragile-flag">FRAGILE</span>'
    : (st.fragileYears > 0 ? `<span class="mflag understaffed-flag">understaffed (${st.fragileYears}/3 years)</span>` : '');
  return `<article class="mission-card${closed ? ' closed' : ''}${staffed < st.capacity && !closed ? ' wants-men' : ''}${st.fragile ? ' is-fragile' : ''}">
    <div class="mission-head"><strong>${esc(d.name || d.id)}</strong>
      ${closed ? '<span class="mflag closed-flag">closed</span>'
        : staffed < st.capacity ? `<span class="mflag want-flag">asks for ${st.capacity - staffed} more</span>`
        : '<span class="mflag full-flag">at strength</span>'}${fragFlag}</div>
    <div class="cap-bar" aria-hidden="true"><div class="cap-fill" style="width:${pct}%"></div></div>
    <p class="mission-staff">${esc(gradeBits)} — <strong>${staffed}/${st.capacity}</strong></p>
    <p class="mission-meta">strength ${strength}${bonus > 0 ? ` → +${bonus} to voyages` : ''} · upkeep ${upkeep} scudi/yr</p>
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
  const hullText = c.hullSouls <= c.hullCapacity
    ? `${c.hullSouls} souls — fits in one hull (capacity ${c.hullCapacity})`
    : `${c.hullSouls} souls — needs ${Math.ceil(c.hullSouls / c.hullCapacity)} hulls (capacity ${c.hullCapacity} each)`;
  const berthText = c.berthsPerYear >= c.berthsNeeded
    ? `${c.berthsNeeded} berths needed · ${c.berthsPerYear}/year — sails this year`
    : `${c.berthsNeeded} berths needed · ${c.berthsPerYear}/year — expect ~${c.sailingYears} sailing years`;
  let html = `<div class="dc-rows">`
    + row('Berths', berthText, c.bottleneck === 'berths')
    + row('Hulls', `${hullText} · ${c.hullsFree} free now`, c.bottleneck === 'hulls')
    + row('Men to spare', `${c.menNeeded} from the pool · ${c.menAvailable} to spare`, c.bottleneck === 'men')
    + row('Funds', `${c.fundsNeeded} scudi to embark · ${c.funds} in the chest`, c.bottleneck === 'funds')
    + `</div>`;
  if (c.bottleneck === 'berths' && c.hullSouls <= c.hullCapacity) {
    html += `<p class="howto-note dc-note">The contingent fits in a single hull, but berths — not hulls — govern when it sails: one berth per man, ${c.berthsPerYear} a year.</p>`;
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
    <p class="howto-note">The order is irreversible — there is no recall in Stage 1. The men enter the departure queue and sail as berths, men to spare, funds, and hulls allow, oldest first alongside terna approvals.</p>
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
    <p class="howto-note">Send a company of formed men from Europe to a mission in a single order — no terna, no seal. 60 scudi per man at departure, one berth per man, drawn from the same pool as terna sailors. The men must already labor in Europe and be free: not ill, not in formation, holding no domestic assignment.</p>
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
        if (!confirm(`Order ${dp.mustered.length} men — ${names} — to ${dest.name || dp.destId}? This cannot be recalled; they will sail as berths, men to spare, funds, and hulls allow.`)) return;
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

export function renderMissions(app, root) {
  const E = app.Engine;
  const year = app.state.currentYear ? app.state.currentYear.year : app.state.year;
  const dests = Object.values(E.DESTINATIONS || {}).filter(d => d && d.id);
  const openDests = dests.filter(d => (app.state.destState[d.id] || {}).access !== 'closed');
  if (!app.ui.dispatch || !openDests.some(d => d.id === app.ui.dispatch.destId)) {
    app.ui.dispatch = { destId: openDests.length ? openDests[0].id : null, fathers: 0, coadjutors: 0, brothers: 0 };
  }
  const disp = app.ui.dispatch;
  const grades = E.MISSION_GRADE_IDS || ['fathers', 'coadjutors', 'brothers'];

  const dispatchCost = () => grades.reduce((n, gid) => n + (disp[gid] || 0) * E.MISSION_GRADES[gid].cost, 0);
  const dispatchTotal = () => grades.reduce((n, gid) => n + (disp[gid] || 0), 0);

  root.innerHTML = `
  <section class="gscreen">
    <p class="kicker px">THE MISSIONS</p>
    <h2 class="year-head px">ANNO ${year}</h2>
    <p class="howto-note">Each mission keeps a stationed strength, by grade. Below capacity, a mission asks the General for more men — answer by the terna, or dispatch them straight from Rome. A strengthened mission steadies new arrivals (+1 to their voyage for every 6 strength, up to +3). A great station costs scudi every year to sustain.</p>
    <h3 class="sect">Dispatch from Rome</h3>
    <div class="dispatch-panel">
      <label class="dest-redirect">Mission:
        <select id="dispatch-dest" aria-label="Mission to reinforce">
          ${openDests.map(d => `<option value="${d.id}"${d.id === disp.destId ? ' selected' : ''}>${esc(d.name || d.id)}</option>`).join('')}
        </select>
      </label>
      ${grades.map(gid => { const gr = E.MISSION_GRADES[gid]; return `
      <div class="dispatch-grade">
        <div class="dg-info"><strong>${esc(gr.name)}</strong>
          <span class="dg-meta">${gr.cost} scudi to send · strength ${gr.strength}</span></div>
        <div class="dg-step">
          <button class="gbtn small ghost dg-dec" data-gid="${gid}" aria-label="Fewer ${esc(gr.short)}">−</button>
          <span class="dg-count" data-gid="${gid}">${disp[gid] || 0}</span>
          <button class="gbtn small ghost dg-inc" data-gid="${gid}" aria-label="More ${esc(gr.short)}">+</button>
        </div>
      </div>`; }).join('')}
      <div class="dispatch-foot">
        <span id="dispatch-summary">${dispatchTotal()} men · ${dispatchCost()} scudi · ${(app.state.available || 0).toLocaleString('en-US')} to spare</span>
        <button class="gbtn primary" id="dispatch-send" ${dispatchTotal() > 0 && disp.destId ? '' : 'disabled'}>Dispatch</button>
      </div>
      <p class="howto-note">Professed fathers are ordained men of the fourth vow — costly, and the strongest pillars of a mission. Spiritual coadjutors are ordained priests of simple vows. Brothers sustain the mission by labor.</p>
    </div>
    ${deploymentPanelHTML(app)}
    <h3 class="sect">The stations</h3>
    <div class="mission-list">
      ${dests.map(d => missionCardHTML(app, d, year)).join('')}
    </div>
    ${deploymentListHTML(app)}
    <div class="btn-row">
      <button class="gbtn ghost" id="missions-back">← Back</button>
    </div>
  </section>`;

  const refreshSummary = () => {
    root.querySelector('#dispatch-summary').textContent =
      `${dispatchTotal()} men · ${dispatchCost()} scudi · ${(app.state.available || 0).toLocaleString('en-US')} to spare`;
    root.querySelector('#dispatch-send').disabled = !(dispatchTotal() > 0 && disp.destId);
  };
  root.querySelector('#dispatch-dest').addEventListener('change', (e) => {
    disp.destId = e.target.value; app.sound('tick');
  });
  root.querySelectorAll('.dg-inc, .dg-dec').forEach(btn => {
    btn.addEventListener('click', () => {
      const gid = btn.dataset.gid;
      const delta = btn.classList.contains('dg-inc') ? 1 : -1;
      disp[gid] = Math.max(0, Math.min(30, (disp[gid] || 0) + delta));
      root.querySelector(`.dg-count[data-gid="${gid}"]`).textContent = disp[gid];
      app.sound('tick');
      refreshSummary();
    });
  });
  root.querySelector('#dispatch-send').addEventListener('click', () => {
    try {
      const res = E.dispatchMission(app.state, disp.destId, { fathers: disp.fathers, coadjutors: disp.coadjutors, brothers: disp.brothers });
      E.refreshBriefing(app.state);
      app.save();
      app.sound('coin');
      app.ui.notice = `${res.total} men dispatched — the mission is strengthened.`;
      disp.fathers = disp.coadjutors = disp.brothers = 0;
      app.go('missions');
    } catch (e) {
      app.sound('error');
      alert(e.message);
    }
  });
  // ---- collective deployment wiring ----
  wireDeploymentPanel(app, root);
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
}

/* ---------------- terna desk ---------------- */
function cardHTML(app, c) {
  const L = c.letter;
  const hist = (c.history && c.history.length)
    ? `<p class="card-hist">${c.history.map(esc).join('<br>')}</p>`
    : `<p class="card-hist none">No prior petitions on record.</p>`;
  return `
  <article class="pcard" data-id="${esc(c.id)}" tabindex="0"
      aria-label="Petitioner ${esc(c.name)}, ${esc(destName(app, c.destination))}">
    <div class="pcard-top">
      <span class="pcard-n">№ ${L.n}</span>
      ${kindBadge(L.kind)}
    </div>
    <h3 class="pcard-name">${esc(c.name)}</h3>
    <p class="pcard-meta">aet. ${c.age} · ${c.yearsInSociety} yrs in the Society · ${esc(c.formation)}</p>
    <p class="pcard-dest">⛵ ${esc(destName(app, c.destination))}</p>
    <p class="pcard-dossier">${esc(c.dossier)}</p>
    <div class="pcard-skills">${c.skills.map(s => `<span class="skill">${esc(s)}</span>`).join('')}
      <span class="health" title="Health">♥${'●'.repeat(c.health)}${'○'.repeat(5 - c.health)}</span></div>
    ${hist}
    <p class="pcard-excerpt">“${esc(L.excerpt)}”</p>
    <p class="pcard-disposition">${gradeChip(app, c.id)} <span class="disp-line">${dispLine(app, c.id)}</span>
      <button class="gbtn small ghost inspect-btn" data-id="${esc(c.id)}" data-name="${esc(c.name)}">Inspect</button></p>
    <button class="gbtn small read-letter" data-id="${esc(c.id)}">Read letter</button>
    <div class="verdict-row" role="group" aria-label="Decision for ${esc(c.name)}">
      <button class="gbtn small verdict approve-btn" data-id="${esc(c.id)}" data-verdict="approve" aria-pressed="false">Approve</button>
      <button class="gbtn small ghost verdict deny-btn" data-id="${esc(c.id)}" data-verdict="deny" aria-pressed="false">Deny</button>
    </div>
    <label class="dest-redirect card-dest" data-id="${esc(c.id)}" hidden>Send to:
      <select class="card-dest-select" data-id="${esc(c.id)}" aria-label="Destination for ${esc(c.name)}"></select>
    </label>
    <div class="companion-row" data-id="${esc(c.id)}" hidden>
      <span class="companion-label">Companions <span class="companion-cost">(40 scudi each · ${(app.state.available || 0).toLocaleString('en-US')} to spare · +1 voyage each up to +3 · hull-limited)</span>:</span>
      <button class="gbtn small ghost comp-dec" data-id="${esc(c.id)}" aria-label="Fewer companions">−</button>
      <span class="companion-count" data-id="${esc(c.id)}">0</span>
      <button class="gbtn small ghost comp-inc" data-id="${esc(c.id)}" aria-label="More companions">+</button>
    </div>
    <div class="stamp" aria-hidden="true"></div>
  </article>`;
}

export function renderDesk(app, root, terna) {
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
    <p class="kicker px">THE TERNA · ANNO ${app.state.year}</p>
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
  </section>`;

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
      const parts = approved.map(id => {
        const c = terna.find(x => x.id === id);
        const dn = (openDests.find(d => d.id === ds[id].destination) || {}).name || ds[id].destination;
        const comps = ds[id].companions || 0;
        return `${c.name} → ${dn}${comps ? ` (+${comps} companion${comps === 1 ? '' : 's'})` : ''}`;
      });
      text = `Approving ${approved.length}: ${parts.join('; ')}.`;
      const totalComps = approved.reduce((n, id) => n + (ds[id].companions || 0), 0);
      if (totalComps) {
        text += ` Companions embark at 40 scudi each (+${totalComps * 40} scudi).`;
      }
      if (teams.length) {
        text += ' ' + teams.map(([did, ns]) => {
          const dn = (openDests.find(d => d.id === did) || {}).name || did;
          return `⛪ ${ns.join(' & ')} sail as a team for ${dn}.`;
        }).join(' ');
      }
    }
    if (done) {
      const deniedCount = ids.length - approved.length;
      const sealCost = approved.length * 30 + deniedCount * 15;
      text += ` Seal cost: ${sealCost} scudi.`;
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
      card.querySelector('.companion-count').textContent = d.companions || 0;
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
    });
  });

  root.querySelectorAll('.card-dest-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      e.stopPropagation();
      const id = sel.dataset.id;
      if (app.ui.decisions[id]) app.ui.decisions[id].destination = sel.value;
      app.sound('tick');
      refresh();
    });
    sel.addEventListener('click', (e) => e.stopPropagation());
  });

  root.querySelectorAll('.comp-inc, .comp-dec').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const d = app.ui.decisions[id];
      if (!d || d.verdict !== 'approve') return;
      const max = app.Engine.RESOURCES.COMPANION_MAX;
      d.companions = Math.max(0, Math.min(max, (d.companions || 0) + (btn.classList.contains('comp-inc') ? 1 : -1)));
      const card = root.querySelector(`.pcard[data-id="${CSS.escape(id)}"]`);
      card.querySelector('.companion-count').textContent = d.companions;
      app.sound('tick');
      refresh();
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
      <div class="btn-row"><button class="gbtn primary" id="close-year">Let the year turn →</button></div>
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

  root.querySelector('#close-year').addEventListener('click', () => app.closeYear());
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

/* ---------------- map screen ---------------- */
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
    <p class="ledger-sub">Every terna, decision, departure, outcome, and event — as the Generalate records them.</p>
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
  const soulsNote = p.souls > p.dispatched ? ` <span class="rep-sub">(${p.souls} souls with companions)</span>` : '';
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
