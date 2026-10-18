/* GENERALATE — app.js
 * Boot, screen router, autosave, header + score meter, WebAudio, debug tools.
 * Engine is imported as `import * as Engine from '../engine.js'` per contract.
 */
import * as Engine from '../engine.js';
import { setGameData } from '../data.js';
import './style.css';
import * as Screens from './screens.js';
import { renderMap } from './map.js';

const SAVE_KEY = 'generalate.save.v1';
const MUTE_KEY = 'generalate.mute.v1';

const app = {
  Engine,
  state: null,
  ui: { screen: 'title', seed: String(Math.floor(Math.random() * 900000) + 100000), selectedId: null, brief: null, decision: null, yearRes: null, end: null, mapFrom: null },
  data: null,
  muted: localStorage.getItem(MUTE_KEY) === '1',
  _audio: null,
};

/* ---------------- tiny audio ---------------- */
app.prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ac() {
  if (!app._audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    app._audio = new AC();
  }
  if (app._audio.state === 'suspended') app._audio.resume();
  return app._audio;
}
app.sound = function (name) {
  if (app.muted) return;
  try {
    const ctx = ac(); if (!ctx) return;
    const t = ctx.currentTime;
    if (name === 'thud') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(75, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.3);
    } else if (name === 'tick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(1250, t);
      g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.06);
    } else if (name === 'page') {
      const len = ctx.sampleRate * 0.18;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.25;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
      src.connect(f).connect(ctx.destination); src.start(t);
    }
  } catch (e) { /* audio is garnish; never break the game */ }
};

/* ---------------- persistence ---------------- */
app.save = function () {
  if (!app.state) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, savedAt: Date.now(),
      engine: Engine.serialize(app.state),
      ui: { seed: app.ui.seed, screen: app.ui.screen },
    }));
  } catch (e) { /* storage full/blocked — game continues in memory */ }
};
app.hasSave = function () {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
};
app.saveMeta = function () {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    return { year: s && s.engine && s.engine.year };
  } catch (e) { return {}; }
};
app.clearSave = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };
app.continueGame = function () {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || !s.engine) return;
    app.state = Engine.deserialize(s.engine);
    app.ui.seed = (s.ui && s.ui.seed) || app.ui.seed;
    app.ui.selectedId = null;
    const cy = app.state.currentYear;
    if (app.state.draft && !app.state.draft.done && !app.state.draft.skipped) app.go('draft');
    else if (cy && cy.decided && cy.decisionResult) { app.ui.decision = cy.decisionResult; app.go('decision'); }
    else if (cy && cy.terna) { app.go('desk'); }
    else app.go('briefing');
    app.sound('page');
  } catch (e) { app.go('title'); }
};
app.confirmOverwrite = function (cb) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="overlay-card confirm-card" role="dialog" aria-modal="true">
      <h2 class="px">BURN THE OLD LEDGER?</h2>
      <p>A saved generalate exists. Beginning anew will overwrite it.</p>
      <div class="btn-row">
        <button class="gbtn ghost" id="cf-no">Keep it</button>
        <button class="gbtn primary" id="cf-yes">Begin anew</button>
      </div>
    </div>`;
  ov.querySelector('#cf-no').addEventListener('click', () => ov.remove());
  ov.querySelector('#cf-yes').addEventListener('click', () => { ov.remove(); cb(); });
  document.body.appendChild(ov);
};

/* ---------------- header + score ---------------- */
function renderFooter() {
  let f = document.getElementById('gfooter');
  if (!f) {
    f = document.createElement('footer');
    f.id = 'gfooter';
    f.innerHTML = `
      <button class="gf-cost" id="gf-cost" title="Year cost — tap for details"></button>
      <button class="gbtn primary" id="gf-close">Close the year &rarr;</button>
      <div class="gf-detail" id="gf-detail" hidden></div>`;
    document.getElementById('generalate-app').appendChild(f);
    f.querySelector('#gf-close').addEventListener('click', () => {
      app.sound('page'); app.closeYear();
    });
    f.querySelector('#gf-cost').addEventListener('click', () => {
      const d = f.querySelector('#gf-detail');
      d.hidden = !d.hidden;
      if (!d.hidden) renderCostDetail();
    });
  }
}

/** Line-by-line cost breakdown for the details popup. */
function renderCostDetail() {
  const f = document.getElementById('gfooter');
  const d = f && f.querySelector('#gf-detail');
  if (!d || !app.state) return;
  const y = app.state.year;
  const fy = (app.state.financeYears || {})[y] || { income: {}, expenses: {} };
  const lines = [];
  // Staged (not yet spent)
  for (const [rid, sa] of Object.entries(app.state.stagedAnswers || {})) {
    const region = (app.Engine.PROVINCIAL_REGIONS || []).find((r) => r.id === rid);
    const parts = (app.Engine.REQUEST_GRADES || []).filter((c) => sa.mix[c] > 0)
      .map((c) => `${sa.mix[c]} ${c}`).join(', ');
    lines.push(`<li><span>${region ? region.name : rid}: ${parts || 'no men'} (staged)</span><span>${(sa.cost || 0).toLocaleString('en-US')}</span></li>`);
  }
  // Spent this year
  for (const [cat, amt] of Object.entries(fy.expenses || {})) {
    if (amt > 0) lines.push(`<li><span>${cat}</span><span>${amt.toLocaleString('en-US')}</span></li>`);
  }
  // Pending (shared with syncFooter — single source of truth)
  const pendingSeal = app._pendingSeal || 0;
  const pendingComps = app._pendingComp || 0;
  if (pendingSeal > 0) lines.push(`<li><span>seals (pending)</span><span>${pendingSeal.toLocaleString('en-US')}</span></li>`);
  if (pendingComps > 0) lines.push(`<li><span>companions (pending)</span><span>${pendingComps.toLocaleString('en-US')}</span></li>`);
  if (app._projUpkeep > 0) lines.push(`<li><span>upkeep (projected)</span><span>${app._projUpkeep.toLocaleString('en-US')}</span></li>`);
  d.innerHTML = lines.length
    ? `<ul>${lines.join('')}</ul>`
    : `<p class="disp-mini">Nothing spent or staged yet this year.</p>`;
}

function syncFooter() {
  const f = document.getElementById('gfooter');
  if (!f) return;
  if (!app.state || !app.state.year) { f.style.display = 'none'; return; }
  f.style.display = 'flex';
  const y = app.state.year;
  const fy = (app.state.financeYears || {})[y] || { expenses: {} };
  const spent = Object.values(fy.expenses || {}).reduce((a, b) => a + b, 0);
  const staged = app.Engine.stagedCommitments(app.state).scudi;
  let pendingSeal = 0, pendingComp = 0;
  try {
    const decisions = (app.ui && app.ui.decisions) || {};
    const gradeCost = (app.Engine.RESOURCES && app.Engine.RESOURCES.COMPANION_GRADE_COST) || {};
    const flatCost = (app.Engine.RESOURCES && app.Engine.RESOURCES.COMPANION_COST) || 40;
    for (const d of Object.values(decisions)) {
      if (d && d.verdict === 'approve') {
        pendingSeal += (app.Engine.RESOURCES && app.Engine.RESOURCES.SEAL_COST) || 30;
        const comps = d.companions;
        if (typeof comps === 'number' && comps > 0) {
          pendingComp += comps * flatCost;
        } else if (comps && typeof comps === 'object') {
          for (const [g, v] of Object.entries(comps)) {
            if (typeof v === 'number' && v > 0) pendingComp += v * (gradeCost[g] || flatCost);
          }
        }
      }
    }
  } catch (e) {}
  let projUpkeep = 0;
  try {
    if (app.Engine.missionUpkeep && app.state.missions) {
      for (const mid of Object.keys(app.state.missions)) {
        const st = app.state.missions[mid];
        if (st) projUpkeep += app.Engine.missionUpkeep(st);
      }
    }
  } catch (e) {}
  const pending = pendingSeal + pendingComp;
  const total = spent + staged + pending + projUpkeep;
  app._pendingSeal = pendingSeal;
  app._pendingComp = pendingComp;
  app._projUpkeep = projUpkeep;
  f.querySelector('#gf-cost').innerHTML =
    `<span class="px">YEAR COST</span> 🪙 ${total.toLocaleString('en-US')}`;
  const closeBtn = f.querySelector('#gf-close');
  const canClose = app.state.currentYear && app.state.currentYear.decided;
  closeBtn.disabled = !canClose;
  closeBtn.title = canClose ? 'Turn the year' : 'Seal the indipetae first';
  // refresh details if open
  const d = f.querySelector('#gf-detail');
  if (d && !d.hidden) renderCostDetail();
}

function renderHeader() {
  let h = document.getElementById('gheader');
  if (!h) {
    h = document.createElement('header');
    h.id = 'gheader';
    h.innerHTML = `
      <button class="gbtn small ghost" id="gh-menu" title="Menu" style="font-size:1.2rem;padding:0.3rem 0.6rem;">☰</button>
      <div class="gh-left"><span class="gh-title px">GENERALATE</span><span class="gh-year" id="gh-year"></span></div>
      <div class="gh-score" title="Your standing as General">
        <span class="gh-score-label px">SCORE</span>
        <div class="gh-bar"><div class="gh-fill" id="gh-fill"></div></div>
        <span class="gh-num" id="gh-num">50</span>
      </div>
      <button class="gh-coins" id="gh-coins-btn" title="The mission chest — tap for details" style="background:none;border:none;cursor:pointer;padding:0;">
        <span class="gh-coins-label px">🪙</span><span class="gh-num" id="gh-funds">0</span>
      </button>
      <div class="gh-energy" title="The General's energy this year">
        <span class="gh-energy-label px">⚡</span><span class="gh-num" id="gh-energy">5</span>
      </div>
      <div class="gh-stat" title="Berths in port">
        <span class="gh-stat-label">Berths</span><span class="gh-num" id="gh-berths">3</span>
      </div>
      <div class="gh-stat" title="Hulls free">
        <span class="gh-stat-label">Hulls</span><span class="gh-num" id="gh-hulls">3/3</span>
      </div>
      <div class="gh-stat" title="Men available for mission">
        <span class="gh-stat-label">Men</span><span class="gh-num" id="gh-men">131</span>
      </div>
      <button class="gbtn small ghost" id="gh-music" title="Allegri's Miserere (harp)">🎵</button>
      <button class="gbtn small ghost" id="gh-export" title="Export game state">📥</button>
      <button class="gbtn small ghost" id="gh-inbox" title="Notifications">🔔<span class="gh-badge" id="gh-badge-inbox" hidden></span></button>
      <audio id="gh-audio" loop preload="auto">
        <source src="miserere-harp.mp3" type="audio/mpeg">
      </audio>
      <nav class="gh-nav">
        <button class="gbtn small ghost" id="gh-briefing">Briefing<span class="gh-badge" id="gh-badge-briefing" hidden></span></button>
        <button class="gbtn small ghost" id="gh-indipetae">Indipetae<span class="gh-badge" id="gh-badge-indipetae" hidden></span></button>
        <button class="gbtn small ghost" id="gh-house">House</button>
        <button class="gbtn small ghost" id="gh-missions">Missions</button>
        <button class="gbtn small ghost" id="gh-governance">Governance<span class="gh-badge" id="gh-badge-governance" hidden></span></button>
        <button class="gbtn small ghost" id="gh-map">Map</button>
        <button class="gbtn small ghost" id="gh-ledger">Ledger</button>
        <button class="gbtn small ghost" id="gh-treasury">Treasury</button>
        <button class="gbtn small ghost" id="gh-sound" aria-label="Toggle sound">🔊</button>
        <button class="gbtn small ghost" id="gh-end" hidden>End office</button>
        <button class="gbtn small ghost" id="gh-debug" hidden>Debug</button>
      </nav>
      <div id="gh-drawer" hidden>
        <div id="gh-drawer-panel">
          <button class="gbtn small ghost" id="gh-d-briefing">Briefing<span class="gh-badge" id="gh-d-badge-briefing" hidden></span></button>
          <button class="gbtn small ghost" id="gh-d-indipetae">Indipetae<span class="gh-badge" id="gh-d-badge-indipetae" hidden></span></button>
          <button class="gbtn small ghost" id="gh-d-house">House</button>
          <button class="gbtn small ghost" id="gh-d-missions">Missions</button>
          <button class="gbtn small ghost" id="gh-d-governance">Governance<span class="gh-badge" id="gh-d-badge-governance" hidden></span></button>
          <button class="gbtn small ghost" id="gh-d-map">Map</button>
          <button class="gbtn small ghost" id="gh-d-ledger">Ledger</button>
          <button class="gbtn small ghost" id="gh-d-treasury">Treasury</button>
          <button class="gbtn small ghost" id="gh-d-logistics">Logistics</button>
        </div>
      </div>
      <div id="gh-inbox-panel" hidden>
        <div id="gh-inbox-list"></div>
      </div>`;
    document.getElementById('generalate-app').prepend(h);
    h.querySelector('#gh-briefing').addEventListener('click', () => { app.sound('page'); app.go('briefing'); });
    // Hamburger drawer
    const drawer = h.querySelector('#gh-drawer');
    const closeDrawer = () => { if (drawer) drawer.hidden = true; };
    h.querySelector('#gh-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      if (drawer) drawer.hidden = !drawer.hidden;
    });
    if (drawer) drawer.addEventListener('click', (e) => { if (e.target === drawer) closeDrawer(); });
    const drawerGo = (id, fn) => {
      const b = h.querySelector(id);
      if (b) b.addEventListener('click', () => { app.sound('page'); closeDrawer(); fn(); });
    };
    drawerGo('#gh-d-briefing', () => app.go('briefing'));
    drawerGo('#gh-d-indipetae', () => app.go('indipetae'));
    drawerGo('#gh-d-house', () => { app.ui.houseFrom = app.ui.screen; app.go('house'); });
    drawerGo('#gh-d-missions', () => { app.ui.missionsFrom = app.ui.screen; app.go('missions'); });
    drawerGo('#gh-d-governance', () => app.go('governance'));
    drawerGo('#gh-d-map', () => app.go('map', { from: app.ui.screen }));
    drawerGo('#gh-d-ledger', () => Screens.showLedgerOverlay(app));
    drawerGo('#gh-d-treasury', () => app.go('treasury'));
    drawerGo('#gh-d-logistics', () => app.go('logistics'));
    // Notification inbox
    const inboxPanel = h.querySelector('#gh-inbox-panel');
    const inboxList = h.querySelector('#gh-inbox-list');
    const inboxBtn = h.querySelector('#gh-inbox');
    const renderInbox = () => {
      if (!inboxList || !app.state) return;
      const items = [];
      const cy = app.state.currentYear;
      // Indipetae awaiting seal
      if (cy && !cy.decided && (cy.terna || []).length) {
        const n = (cy.terna || []).length;
        items.push({
          title: 'INDIPETAE AWAIT SEAL',
          blurb: `${n} letter${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} your decision — approve or deny, then seal.`,
          go: () => app.go('indipetae'),
        });
      }
      // Provincial requests
      try {
        const reqs = Engine.provincesWithRequests ? Engine.provincesWithRequests(app.state) : [];
        if (reqs.length) {
          items.push({
            title: 'PROVINCIAL REQUESTS',
            blurb: `${reqs.length} province${reqs.length === 1 ? '' : 's'} ask${reqs.length === 1 ? 's' : ''} for men — review in Governance.`,
            go: () => app.go('governance'),
          });
        }
      } catch (e) {}
      // Close the year
      if (cy && cy.decided) {
        items.push({
          title: 'CLOSE THE YEAR',
          blurb: 'The seal has fallen — close the year to turn to ' + (app.state.year + 1) + '.',
          go: () => { closeInbox(); app.closeYear(); },
        });
      }
      if (!items.length) {
        inboxList.innerHTML = '<div class="gh-inbox-empty">No tasks — the Society rests.</div>';
      } else {
        inboxList.innerHTML = '';
        for (const it of items) {
          const b = document.createElement('button');
          b.className = 'gh-inbox-item';
          b.innerHTML = `<div class="inbox-title">${it.title}</div><div class="inbox-blurb">${it.blurb}</div>`;
          b.addEventListener('click', () => { closeInbox(); app.sound('page'); it.go(); });
          inboxList.appendChild(b);
        }
      }
      // Update badge
      const badge = h.querySelector('#gh-badge-inbox');
      if (badge) { badge.hidden = !items.length; badge.textContent = items.length > 9 ? '9+' : String(items.length); }
    };
    const closeInbox = () => { if (inboxPanel) inboxPanel.hidden = true; };
    if (inboxBtn) inboxBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (inboxPanel.hidden) renderInbox();
      inboxPanel.hidden = !inboxPanel.hidden;
    });
    if (inboxPanel) inboxPanel.addEventListener('click', (e) => { if (e.target === inboxPanel) closeInbox(); });
    app.renderInbox = renderInbox;
    h.querySelector('#gh-house').addEventListener('click', () => { app.sound('page'); app.ui.houseFrom = app.ui.screen; app.go('house'); });
    h.querySelector('#gh-missions').addEventListener('click', () => { app.sound('page'); app.ui.missionsFrom = app.ui.screen; app.go('missions'); });
    h.querySelector('#gh-indipetae').addEventListener('click', () => { app.sound('page'); app.go('desk'); });
    h.querySelector('#gh-governance').addEventListener('click', () => { app.sound('page'); app.go('governance'); });
    h.querySelector('#gh-map').addEventListener('click', () => { app.sound('page'); app.go('map', { from: app.ui.screen }); });
    h.querySelector('#gh-ledger').addEventListener('click', () => Screens.showLedgerOverlay(app));
    h.querySelector('#gh-treasury').addEventListener('click', () => { app.sound('page'); app.go('treasury'); });
    const coinsBtn = h.querySelector('#gh-coins-btn');
    if (coinsBtn) {
      coinsBtn.addEventListener('click', () => {
        const f = document.getElementById('gfooter');
        const costBtn = f && f.querySelector('#gf-cost');
        if (costBtn) costBtn.click();
      });
    }
    const exportBtn = h.querySelector('#gh-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify({ state: app.state }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'generalate-state.json';
        a.click();
      });
    }
    const musicBtn = h.querySelector('#gh-music');
    const audio = h.querySelector('#gh-audio');
    if (musicBtn && audio) {
      musicBtn.addEventListener('click', () => {
        if (audio.paused) {
          audio.play().then(() => { musicBtn.textContent = '\U0001F3B6'; }).catch(() => {});
        } else {
          audio.pause();
          musicBtn.textContent = '\U0001F3B5';
        }
      });
    }
    h.querySelector('#gh-sound').addEventListener('click', (e) => {
      app.muted = !app.muted;
      localStorage.setItem(MUTE_KEY, app.muted ? '1' : '0');
      e.currentTarget.textContent = app.muted ? '🔇' : '🔊';
      if (!app.muted) app.sound('tick');
    });
    h.querySelector('#gh-end').addEventListener('click', () => {
      if (app.state && app.state.mode === 'endless' && !app.state.ended) {
        app.confirmEndOffice();
      }
    });
    h.querySelector('#gh-debug').addEventListener('click', () => toggleDebug());
    if (app.muted) h.querySelector('#gh-sound').textContent = '🔇';
  }
  return h;
}
app.syncFooter = function () { syncFooter(); };
app.syncHeader = function () {
  const h = document.getElementById('gheader');
  if (!h || !app.state) return;
  h.querySelector('#gh-year').textContent = app.state.ended ? '—' : 'anno ' + app.state.year;
  h.querySelector('#gh-end').hidden = !(app.state.mode === 'endless' && !app.state.ended);
  const s = Engine.getScore(app.state);
  h.querySelector('#gh-num').textContent = s;
  try {
    h.querySelector('#gh-funds').textContent = (app.state.resources?.funds ?? 0).toLocaleString('en-US');
    const eMax = Engine.ENERGY_PER_YEAR || 6;
    h.querySelector('#gh-energy').textContent = `${app.state.energy ?? eMax}/${eMax}`;
    h.querySelector('#gh-berths').textContent = app.state.resources?.berths ?? 0;
    const ships = app.state.resources?.ships || [];
    const free = ships.filter(s => (s.freeYear || 0) <= app.state.year).length;
    h.querySelector('#gh-hulls').textContent = `${free}/${ships.length}`;
    h.querySelector('#gh-men').textContent = (app.state.available || 0).toLocaleString('en-US');
  } catch (e) { /* garnish */ }
  h.querySelector('#gh-fill').style.width = Math.max(0, Math.min(100, s)) + '%';
  // notification badges: indipetae awaiting seal, pending reports, year ready to close
  try {
    const cy = app.state.currentYear;
    const setBadge = (sel, show, text) => {
      for (const s of [sel, sel.replace('#gh-badge-', '#gh-d-badge-')]) {
        const b = h.querySelector(s);
        if (b) { b.hidden = !show; if (text !== undefined) b.textContent = text; }
      }
    };
    setBadge('#gh-badge-indipetae', !!(cy && !cy.decided && (cy.terna || []).length));
    let n = 0;
    try { n = Engine.provincesWithRequests ? Engine.provincesWithRequests(app.state).length : 0; } catch (e) { n = 0; }
    setBadge('#gh-badge-governance', !!n, n > 9 ? '9+' : String(n));
    // Inbox badge: count of tasks
    try {
      let inboxN = 0;
      if (cy && !cy.decided && (cy.terna || []).length) inboxN++;
      if (n) inboxN++;
      if (cy && cy.decided) inboxN++;
      const ib = h.querySelector('#gh-badge-inbox');
      if (ib) { ib.hidden = !inboxN; ib.textContent = inboxN > 9 ? '9+' : String(inboxN); }
    } catch (e) {}
  } catch (e) { /* badges are garnish; never break the header */ }
};
app.bumpScore = function () {
  // animate number + bar toward the true score
  const h = document.getElementById('gheader');
  if (!h || !app.state) return;
  const target = Engine.getScore(app.state);
  const numEl = h.querySelector('#gh-num'), fillEl = h.querySelector('#gh-fill');
  const from = parseInt(numEl.textContent, 10) || 0;
  if (from === target || app.prefersReducedMotion()) { app.syncHeader(); syncFooter(); return; }
  const t0 = performance.now(), dur = 700;
  function frame(t) {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    const v = Math.round(from + (target - from) * e);
    numEl.textContent = v;
    fillEl.style.width = Math.max(0, Math.min(100, v)) + '%';
    if (p < 1) requestAnimationFrame(frame); else { app.syncHeader(); syncFooter(); }
  }
  requestAnimationFrame(frame);
};
app.confirmEndOffice = function () {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="overlay-card confirm-card" role="dialog" aria-modal="true">
      <h2 class="px">LAY DOWN THE OFFICE?</h2>
      <p>Your generalate will end here, and the account will be rendered.</p>
      <div class="btn-row">
        <button class="gbtn ghost" id="eo-no">Continue ruling</button>
        <button class="gbtn primary" id="eo-yes">End it</button>
      </div>
    </div>`;
  ov.querySelector('#eo-no').addEventListener('click', () => ov.remove());
  ov.querySelector('#eo-yes').addEventListener('click', () => { ov.remove(); app.finishGame(); });
  document.body.appendChild(ov);
};

/* ---------------- destinations ---------------- */
const FALLBACK_DESTS = {
  japan: 'Japan', china: 'China', 'east-indies': 'East Indies', india: 'India',
  paraguay: 'Paraguay', brazil: 'Brazil', aethiopia: 'Aethiopia', england: 'England',
  'west-indies': 'West Indies', peru: 'Peru',
};
app.destInfo = function (id) {
  if (Engine.DESTINATIONS && Engine.DESTINATIONS[id]) return Engine.DESTINATIONS[id];
  return { id, name: FALLBACK_DESTS[id] || id };
};
app.getMapState = function () {
  if (Engine.getMapState) return Engine.getMapState(app.state);
  // fallback: read documented state fields directly
  const dests = {};
  for (const id of Object.keys(FALLBACK_DESTS)) {
    const d = (app.state.destState && app.state.destState[id]) || {};
    dests[id] = { name: FALLBACK_DESTS[id], port: id, access: '', danger: d.danger || 0,
      closed: !!d.closed, missions: d.missions || 0, arrived: d.arrived || 0, lost: d.lost || 0 };
  }
  return { year: app.state.year, voyages: (app.state.voyages || []).map(v => ({ ...v })), destinations: dests };
};
app.clearJustDeparted = function () {
  for (const v of app.state.voyages) v.justDeparted = false;
  app.save();
};
app.drawMap = function (host, mapState, onSelectPort) {
  renderMap(host, app, mapState, { onSelectPort });
};

/* ---------------- router ---------------- */
const root = () => document.getElementById('gscreen-root');

app.go = function (screen, params = {}) {
  app.ui.screen = screen;
  app.ui.selectedId = null;
  const r = root();
  const h = document.getElementById('gheader');
  if (h) h.style.display = screen === 'title' ? 'none' : '';
  window.scrollTo(0, 0);
  switch (screen) {
    case 'title': Screens.renderTitle(app, r); break;
    case 'draft': app.syncHeader(); Screens.renderDraft(app, r); break;
    case 'briefing': {
      if (!app.state.currentYear) app.ui.brief = Engine.startYear(app.state);
      else app.ui.brief = { year: app.state.currentYear.year, briefing: app.state.currentYear.briefing, terna: app.state.currentYear.terna };
      app.save(); app.syncHeader();
      Screens.renderBriefing(app, r, app.ui.brief);
      break;
    }
    case 'desk': {
      const terna = app.state.currentYear ? app.state.currentYear.terna : [];
      app.syncHeader();
      Screens.renderDesk(app, r, terna);
      break;
    }
    case 'house': app.syncHeader(); Screens.renderHouse(app, r); break;
    case 'missions': app.syncHeader(); Screens.renderMissions(app, r); break;
    case 'governance': app.syncHeader(); Screens.renderGovernance(app, r); break;
    case 'treasury': app.syncHeader(); Screens.renderTreasury(app, r); break;
    case 'logistics': app.syncHeader(); Screens.renderLogistics(app, r); break;
    case 'decision': app.syncHeader(); Screens.renderDecision(app, r, app.ui.decision); break;
    case 'yearreport': app.syncHeader(); Screens.renderYearReport(app, r, app.ui.yearRes); break;
    case 'map': app.syncHeader(); Screens.renderMapScreen(app, r, params.from || app.ui.mapFrom); break;
    case 'ending': { const hh = document.getElementById('gheader'); if (hh) hh.style.display = 'none'; Screens.renderEnding(app, r, app.ui.end); break; }
  }
  if (['briefing', 'desk', 'decision', 'yearreport', 'map', 'house', 'missions', 'governance', 'treasury', 'logistics', 'draft'].includes(screen)) app.save();
  // Energy gating: discretionary buttons go quiet at zero energy.
  try {
    const left = app.state ? (app.state.energy ?? Engine.ENERGY_PER_YEAR) : 0;
    if (left <= 0) {
      r.querySelectorAll('[data-energy]').forEach((b) => {
        b.disabled = true;
        b.title = (b.title ? b.title + ' ' : '') + '(No energy left this year.)';
      });
    }
  } catch (e) { /* garnish */ }
  syncFooter();
};

app.newGame = function (mode, seed) {
  if (!app.dataReady) {
    app.ui.notice = 'The archive could not be loaded. Check your connection and reload the page.';
    app.go('title');
    return;
  }
  app.state = Engine.newGame({ mode, seed });
  app.ui.seed = seed;
  app.save();
  app.sound('page');
  app.go('draft');
};

app.confirmDecision = function (approvals) {
  if (!app.state.currentYear || !Array.isArray(approvals)) return;
  try {
    app.ui.decision = Engine.decide(app.state, approvals);
  } catch (e) {
    app.sound('error');
    alert(`The seal could not fall: ${e.message}`);
    return;
  }
  app.ui.decisions = {};
  app.save();
  app.go('decision');
  if (app.syncFooter) app.syncFooter();
};

app.closeYear = function () {
  app.ui.yearRes = Engine.resolveYear(app.state);
  app.save();
  if (app.state.ended) app.finishGame();
  else { app.go('yearreport'); app.bumpScore(); }
};

app.nextYear = function () { app.go('briefing'); };

app.finishGame = function () {
  app.ui.end = Engine.endGame(app.state);
  app.clearSave();
  app.sound('page');
  app.go('ending');
};

/* ---------------- debug ---------------- */
const DEBUG_Q = new URLSearchParams(location.search).get('debug') === '1';
let debugPanel = null;
function toggleDebug() {
  if (debugPanel) { debugPanel.remove(); debugPanel = null; return; }
  debugPanel = Screens.renderDebugPanel(app);
  document.body.appendChild(debugPanel);
}
app.debugFireEvent = function (id) {
  if (Engine.__fireEvent) { Engine.__fireEvent(app.state, id); }
  else if (typeof app.state !== 'undefined') { /* real engine should implement __fireEvent */ }
  app.save(); app.syncHeader();
  toggleDebug(); toggleDebug(); // re-render panel
};
app.debugForceOutcome = function (voyageId, outcome) {
  if (Engine.__forceOutcome) Engine.__forceOutcome(app.state, voyageId, outcome);
  app.save(); app.syncHeader();
  toggleDebug(); toggleDebug();
};
app.debugSoak = function (rounds) {
  const t0 = performance.now();
  const st = Engine.newGame({ mode: 'campaign', seed: app.ui.seed + '-soak' });
  let n = 0;
  while (n < rounds && !st.ended) {
    const s = Engine.startYear(st);
    const c = s.terna[Math.floor(Math.random() * s.terna.length)];
    Engine.decide(st, [{ id: c.id }]);
    Engine.resolveYear(st);
    n++;
  }
  return { rounds: n, ms: Math.round(performance.now() - t0), score: Engine.getScore(st),
    arrived: st.stats.arrived, lost: st.stats.lost };
};

/* ---------------- boot ---------------- */
async function fetchGameData() {
  // Game data JSON (built in parallel at /generalate/*.json). Best-effort:
  // the engine carries its own fixtures, so missing files are not fatal.
  const files = ['petitioners.json', 'events.json', 'destinations.json'];
  const out = {};
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const rs = await Promise.all(files.map(f =>
      fetch('/generalate/' + f, { signal: ctrl.signal }).then(r => (r.ok ? r.json() : null)).catch(() => null)));
    clearTimeout(timer);
    files.forEach((f, i) => { if (rs[i]) out[f.replace('.json', '')] = rs[i]; });
  } catch (e) { /* offline or missing — fine */ }
  return Object.keys(out).length ? out : null;
}

async function boot() {
  const appEl = document.getElementById('generalate-app');
  const scr = document.createElement('div');
  scr.id = 'gscreen-root';
  appEl.appendChild(scr);
  scr.innerHTML = `<div class="boot"><p class="px">CONSULTING THE ARCHIVE…</p></div>`;

  renderHeader();
  renderFooter();
  const dbgBtn = document.getElementById('gh-debug');
  if (DEBUG_Q && dbgBtn) dbgBtn.hidden = false;

  app.data = await fetchGameData();
  // Hand the archive to the engine (its module cache backs newGame/deserialize).
  if (app.data) {
    try { setGameData(app.data); app.dataReady = true; }
    catch (e) { app.dataReady = false; app.dataError = String((e && e.message) || e); }
  } else { app.dataReady = false; }
  app.go('title');
  app.sound('page');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
