/* GENERALATE — Simple mode (prototype, Tran 2026-10-21).
 * One screen, three decisions a year: answer the letters (Send /
 * Redirect / Deny — denied scholastics teach and pay the house),
 * Expand a mission, close the year. Ships, crews, the dock, formation
 * and the colleges run themselves. Same engine, same state shape; this
 * screen keeps its own save and never touches the full game's.
 */
import * as Engine from '../engine.js';
import { setGameData, getGameData } from '../data.js';
import './style.css';

const SAVE_KEY = 'generalate.simple.save.v1';
const root = document.getElementById('generalate-app');

let S = null;              // engine state
let DESTS = [];            // destination records (id, name, travelYears, danger, tropical, frontier)
let picks = {};            // petitionerId -> { mode, dest, companions, picking }
let chronicle = null;      // { year, lines[] } from the last closed year
let msg = '';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');

async function fetchGameData() {
  const files = ['petitioners.json', 'events.json', 'destinations.json'];
  const out = {};
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const rs = await Promise.all(files.map((f) =>
      fetch('/generalate/' + f, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
    clearTimeout(timer);
    files.forEach((f, i) => { if (rs[i]) out[f.replace('.json', '')] = rs[i]; });
  } catch (e) { /* fixtures carry the game if the archive is missing */ }
  return Object.keys(out).length ? out : null;
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(Engine.serialize(S))); } catch (e) { /* storage full/blocked */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return Engine.deserialize(JSON.parse(raw));
  } catch (e) { return null; }
}

/* ---- the numbers a General actually decides by ---- */
function inbound(id) {
  const atSea = (S.voyages || []).filter((v) => v.stage === 'transit' && v.destination === id)
    .reduce((n, v) => n + (v.teamSize || 1), 0);
  const atDock = (S.queue || []).filter((q) => q.destination === id && q.status !== 'departed')
    .reduce((n, q) => n + 1 + (typeof q.companions === 'number' ? q.companions
      : Object.values(q.companionGrades || {}).reduce((a, b) => a + b, 0)), 0);
  return atSea + atDock;
}
function destOf(id) { return DESTS.find((d) => d.id === id) || { id, name: id, travelYears: 2 }; }
function dangerWord(id) {
  const dst = S.destState[id] || {};
  const d = dst.danger ?? destOf(id).danger ?? 1;
  return d >= 3 ? 'danger severe' : d === 2 ? 'danger high' : 'danger low';
}
function isOpen(id) { const d = S.destState[id] || {}; return d.access !== 'closed' && !d.collapsed; }

/* ---- actions ---- */
function newGame() {
  S = Engine.newGame({ mode: 'campaign', seed: 'simple-' + Math.floor(Math.random() * 1e9) });
  picks = {}; chronicle = null; msg = '';
  Engine.startYear(S);
  save(); render();
}
function setPick(id, patch) {
  picks[id] = { mode: 'deny', dest: null, companions: false, picking: false, ...(picks[id] || {}), ...patch };
  render();
}
function expand(id) {
  msg = '';
  try { Engine.issueInstruction(S, id, 'expand'); }
  catch (e) { msg = String(e.message || e); }
  save(); render();
}
function found(id) {
  msg = '';
  try { Engine.foundMission(S, id, { fathers: 1, coadjutors: 1, brothers: 1 }); }
  catch (e) { msg = String(e.message || e); }
  save(); render();
}
function sealYear() {
  msg = '';
  const approvals = [];
  for (const c of S.currentTerna.cards) {
    const p = picks[c.petitionerId];
    if (!p || p.mode === 'deny') continue;
    approvals.push({
      id: c.petitionerId,
      destination: p.mode === 'redirect' && p.dest ? p.dest : c.destination,
      companions: p.companions ? 2 : 0,
    });
  }
  try {
    Engine.decide(S, approvals);
    // The colleges run themselves: every eligible man in Europe teaches.
    for (const e of [...(S.europeanLabor || [])]) {
      if (!e.assignment && !e.reservedFor) {
        try { Engine.assignDomestic(S, e.petitionerId, 'teaching'); } catch (err) { /* not eligible */ }
      }
    }
    const closedYear = S.year;
    Engine.resolveYear(S, {});
    const notable = (S.ledger || []).filter((e) => e.year === closedYear
      && ['death', 'ill', 'recovery', 'collapse', 'native'].includes(e.type)).slice(-10);
    const report = (S.ledger || []).find((e) => e.year === closedYear && e.type === 'society-report');
    chronicle = { year: closedYear, report: report ? report.text : '', lines: notable.map((e) => e.text) };
    picks = {};
    if (!S.ended) Engine.startYear(S);
  } catch (e) { msg = String(e.message || e); }
  save(); render();
}

/* ---- rendering ---- */
function render() {
  if (!S) {
    const has = !!loadSave();
    root.innerHTML = `<div class="simple-wrap">
      <h1>GENERALATE — SIMPLE</h1>
      <p class="simple-sub">One screen. Read the letters, send or deny, grow a house, close the year. Everything else runs itself.</p>
      <div class="simple-foot">
        <button class="simple-btn primary" id="s-new">New campaign</button>
        ${has ? '<button class="simple-btn" id="s-continue">Continue the saved campaign</button>' : ''}
      </div></div>`;
    document.getElementById('s-new').onclick = newGame;
    const cont = document.getElementById('s-continue');
    if (cont) cont.onclick = () => { S = loadSave(); picks = {}; if (S && !S.currentTerna && !S.ended) Engine.startYear(S); render(); };
    return;
  }
  if (S.ended) {
    const souls = Object.values(S.missions || {}).reduce((n, st) => n + (st.fruits || 0), 0);
    root.innerHTML = `<div class="simple-wrap">
      <h1>THE REIGN ENDS — ${S.year - 1}</h1>
      <div class="simple-hud"><span>Final score <b>${Engine.getScore(S)}</b></span>
      <span>Souls in the harvest <b>${fmt(souls)}</b></span>
      <span>Deaths <b>${S.stats?.deaths || 0}</b></span></div>
      <div class="simple-foot"><button class="simple-btn primary" id="s-new">New campaign</button></div></div>`;
    document.getElementById('s-new').onclick = () => { localStorage.removeItem(SAVE_KEY); S = null; render(); };
    return;
  }
  const funds = S.resources?.funds ?? 0;
  let html = `<div class="simple-wrap">
    <h1>GENERALATE — SIMPLE</h1>
    <div class="simple-hud"><span>Year <b>${S.year}</b></span>
    <span>Score <b>${Engine.getScore(S)}</b></span>
    <span>Treasury <b>${fmt(funds)} scudi</b></span>
    <span>Men to spare <b>${S.available ?? 0}</b></span></div>
    <p class="simple-msg">${esc(msg)}</p>`;
  if (chronicle) {
    html += `<h2>The year ${chronicle.year} in review</h2><div class="simple-chron">
      ${chronicle.report ? `<p>${esc(chronicle.report)}</p>` : ''}
      ${chronicle.lines.map((t) => `<p>${esc(t)}</p>`).join('')}</div>`;
  }
  // Missions
  html += `<h2>The missions</h2>`;
  for (const d of DESTS) {
    const st = S.missions[d.id]; if (!st) continue;
    const dst = S.destState[d.id] || {};
    if (dst.access === 'closed' && !dst.collapsed) {
      if (d.frontier) html += `<div class="simple-line"><span class="nm">${esc(d.name)}</span><span class="dim">not founded</span>
        <button class="simple-btn" data-found="${d.id}">Found — send a company</button></div>`;
      continue;
    }
    if (dst.collapsed) {
      html += `<div class="simple-line"><span class="nm">${esc(d.name)}</span><span class="warn">collapsed</span>
        <button class="simple-btn" data-found="${d.id}">Refound — send a company</button></div>`;
      continue;
    }
    const staffed = Engine.missionStaffed(st);
    const cap = st.capacity || 5;
    const coming = inbound(d.id);
    const inst = S.instructions && S.instructions[d.id];
    const expanding = inst && inst.status === 'in-transit' && inst.type === 'expand';
    const low = staffed / cap < 0.25;
    html += `<div class="simple-line"><span class="nm">${esc(d.name)}</span>
      <span class="${low ? 'warn' : ''}">${staffed}/${cap} men</span>
      ${coming ? `<span class="dim">${coming} coming</span>` : ''}
      <span class="dim">harvest ${fmt(st.fruits)} souls</span>
      <span class="dim">${dangerWord(d.id)}</span>
      ${expanding ? `<span class="dim">expanding · arrives ${inst.arriveYear}</span>`
        : `<button class="simple-btn" data-expand="${d.id}">Expand +5 · arrives ${S.year + (d.travelYears || 2)}</button>`}
    </div>`;
  }
  // Letters
  const cards = (S.currentTerna && S.currentTerna.cards) || [];
  html += `<h2>Letters — ${cards.length} petitioners</h2>`;
  for (const c of cards) {
    const p = picks[c.petitionerId] || { mode: 'deny', companions: false, picking: false };
    let disp = { zeal: 3, prudence: 3 };
    try { const dd = Engine.ensureDisposition(S, c.petitionerId); if (dd && dd.current) disp = dd.current; } catch (e) { /* defaults */ }
    const letterText = c.letter && c.letter.excerpt ? c.letter.excerpt : (c.dossier || '');
    html += `<div class="simple-card">
      <div class="who">${esc(Engine.displayName(S, c.petitionerId))}</div>
      <div class="meta">${esc(c.formation || '')} · age ${c.age} · ${c.yearsInSociety} yrs in the Society · asks for <b>${esc(c.destinationName || c.destination)}</b> · zeal ${disp.zeal} · prudence ${disp.prudence}</div>
      ${letterText ? `<div class="letter">${esc(String(letterText).slice(0, 220))}</div>` : ''}
      <div class="simple-actions">
        <button class="simple-btn ${p.mode === 'send' ? 'chosen' : ''}" data-send="${c.petitionerId}">Send to ${esc(c.destinationName || c.destination)}</button>
        <button class="simple-btn ${p.mode === 'redirect' ? 'chosen' : ''}" data-redirect="${c.petitionerId}">Redirect</button>
        <button class="simple-btn ${p.mode === 'deny' ? 'chosen' : ''}" data-deny="${c.petitionerId}">Deny</button>
        ${p.mode !== 'deny' ? `<label class="simple-check"><input type="checkbox" data-comp="${c.petitionerId}" ${p.companions ? 'checked' : ''}/> with companions (2 more men)</label>` : ''}
      </div>
      ${p.picking ? `<div class="simple-dests">${DESTS.filter((d) => isOpen(d.id) && d.id !== c.destination)
        .map((d) => `<button class="simple-btn" data-dest="${c.petitionerId}:${d.id}">${esc(d.name)}</button>`).join('')}</div>` : ''}
      ${p.mode === 'redirect' && p.dest ? `<div class="meta">Bound for <b>${esc(destOf(p.dest).name)}</b></div>` : ''}
    </div>`;
  }
  html += `<div class="simple-foot">
    <button class="simple-btn primary" id="s-seal">Seal the year</button>
    <span class="dim">Unanswered letters are denied. Denied scholastics teach, and their colleges pay the house.</span>
    </div></div>`;
  root.innerHTML = html;
  // wire actions
  root.querySelectorAll('[data-expand]').forEach((b) => { b.onclick = () => expand(b.dataset.expand); });
  root.querySelectorAll('[data-found]').forEach((b) => { b.onclick = () => found(b.dataset.found); });
  root.querySelectorAll('[data-send]').forEach((b) => { b.onclick = () => setPick(b.dataset.send, { mode: 'send', picking: false }); });
  root.querySelectorAll('[data-deny]').forEach((b) => { b.onclick = () => setPick(b.dataset.deny, { mode: 'deny', picking: false }); });
  root.querySelectorAll('[data-redirect]').forEach((b) => { b.onclick = () => { const cur = picks[b.dataset.redirect] || {}; setPick(b.dataset.redirect, { picking: !cur.picking }); }; });
  root.querySelectorAll('[data-dest]').forEach((b) => { b.onclick = () => { const [pid, dest] = b.dataset.dest.split(':'); setPick(pid, { mode: 'redirect', dest, picking: false }); }; });
  root.querySelectorAll('[data-comp]').forEach((b) => { b.onchange = () => setPick(b.dataset.comp, { companions: b.checked }); });
  document.getElementById('s-seal').onclick = sealYear;
}

async function boot() {
  root.innerHTML = '<div class="simple-wrap"><p>Consulting the archive…</p></div>';
  const data = await fetchGameData();
  if (data) { try { setGameData(data); } catch (e) { /* fixtures */ } }
  try { DESTS = (getGameData().destinations || []).map((d) => (typeof d === 'object' ? d : { id: d })); } catch (e) { DESTS = []; }
  if (!DESTS.length && data && data.destinations) {
    DESTS = Array.isArray(data.destinations) ? data.destinations
      : Object.entries(data.destinations).map(([id, d]) => ({ id, ...d }));
  }
  render();
}
boot();
