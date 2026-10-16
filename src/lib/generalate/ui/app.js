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
    if (cy && cy.decided && cy.decisionResult) { app.ui.decision = cy.decisionResult; app.go('decision'); }
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
function renderHeader() {
  let h = document.getElementById('gheader');
  if (!h) {
    h = document.createElement('header');
    h.id = 'gheader';
    h.innerHTML = `
      <div class="gh-left"><span class="gh-title px">GENERALATE</span><span class="gh-year" id="gh-year"></span></div>
      <div class="gh-score" title="Your standing as General">
        <span class="gh-score-label px">SCORE</span>
        <div class="gh-bar"><div class="gh-fill" id="gh-fill"></div></div>
        <span class="gh-num" id="gh-num">50</span>
      </div>
      <nav class="gh-nav">
        <button class="gbtn small ghost" id="gh-briefing">Briefing</button>
        <button class="gbtn small ghost" id="gh-house">House</button>
        <button class="gbtn small ghost" id="gh-missions">Missions</button>
        <button class="gbtn small ghost" id="gh-map">Map</button>
        <button class="gbtn small ghost" id="gh-ledger">Ledger</button>
        <button class="gbtn small ghost" id="gh-sound" aria-label="Toggle sound">🔊</button>
        <button class="gbtn small ghost" id="gh-end" hidden>End office</button>
        <button class="gbtn small ghost" id="gh-debug" hidden>Debug</button>
      </nav>`;
    document.getElementById('generalate-app').prepend(h);
    h.querySelector('#gh-briefing').addEventListener('click', () => { app.sound('page'); app.go('briefing'); });
    h.querySelector('#gh-house').addEventListener('click', () => { app.sound('page'); app.ui.houseFrom = app.ui.screen; app.go('house'); });
    h.querySelector('#gh-missions').addEventListener('click', () => { app.sound('page'); app.ui.missionsFrom = app.ui.screen; app.go('missions'); });
    h.querySelector('#gh-map').addEventListener('click', () => { app.sound('page'); app.go('map', { from: app.ui.screen }); });
    h.querySelector('#gh-ledger').addEventListener('click', () => Screens.showLedgerOverlay(app));
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
app.syncHeader = function () {
  const h = document.getElementById('gheader');
  if (!h || !app.state) return;
  h.querySelector('#gh-year').textContent = app.state.ended ? '—' : 'anno ' + app.state.year;
  h.querySelector('#gh-end').hidden = !(app.state.mode === 'endless' && !app.state.ended);
  const s = Engine.getScore(app.state);
  h.querySelector('#gh-num').textContent = s;
  h.querySelector('#gh-fill').style.width = Math.max(0, Math.min(100, s)) + '%';
};
app.bumpScore = function () {
  // animate number + bar toward the true score
  const h = document.getElementById('gheader');
  if (!h || !app.state) return;
  const target = Engine.getScore(app.state);
  const numEl = h.querySelector('#gh-num'), fillEl = h.querySelector('#gh-fill');
  const from = parseInt(numEl.textContent, 10) || 0;
  if (from === target || app.prefersReducedMotion()) { app.syncHeader(); return; }
  const t0 = performance.now(), dur = 700;
  function frame(t) {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    const v = Math.round(from + (target - from) * e);
    numEl.textContent = v;
    fillEl.style.width = Math.max(0, Math.min(100, v)) + '%';
    if (p < 1) requestAnimationFrame(frame); else app.syncHeader();
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
    case 'decision': app.syncHeader(); Screens.renderDecision(app, r, app.ui.decision); break;
    case 'yearreport': app.syncHeader(); Screens.renderYearReport(app, r, app.ui.yearRes); break;
    case 'map': app.syncHeader(); Screens.renderMapScreen(app, r, params.from || app.ui.mapFrom); break;
    case 'ending': { const hh = document.getElementById('gheader'); if (hh) hh.style.display = 'none'; Screens.renderEnding(app, r, app.ui.end); break; }
  }
  if (['briefing', 'desk', 'decision', 'yearreport', 'map', 'house', 'missions'].includes(screen)) app.save();
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
  app.go('briefing');
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
  app.save();
  app.go('decision');
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
