/* GENERALATE — map.js
 * Canvas pixel-art world map "as known in 1615". Deliberately rough.
 * Renders land from seeded ellipse blobs + edge noise, ports, dotted routes,
 * animates a small ship sprite along routes for fresh departures (~3s each).
 * Click a port → onSelectPort(destId) shows the destination panel.
 */

const GW = 96, GH = 48;

// Land blobs: [cx, cy, rx, ry]
const BLOBS = [
  [15, 10, 14, 7], [9, 5, 6, 3.5],      // North America
  [20, 19, 3.5, 3],                     // Central America
  [27, 32, 6.5, 10], [29, 42, 3.5, 5],  // South America
  [31, 2.5, 4.5, 2.5],                  // Greenland
  [52, 8, 6, 4.5], [47.5, 12.5, 3.5, 2.5], // Europe + Iberia
  [49, 5.5, 1.8, 2.6],                  // Britain
  [54.5, 14, 1.6, 3],                   // Italy
  [54, 28, 7.5, 10.5], [56, 40, 4.5, 5],// Africa
  [61.5, 37.5, 1.6, 3.2],               // Madagascar
  [74, 10.5, 14, 7.5],                  // Asia
  [70, 21.5, 4.5, 5.5],                 // India
  [80, 24.5, 4.5, 3.5],                 // SE Asia
  [90, 14, 1.8, 3.6], [88.5, 18.5, 1.2, 1.6], // Japan
  [86, 27, 1.8, 2.8],                   // Philippines
  [82, 33, 5.5, 1.8], [88.5, 34.5, 3.5, 1.6], // Indonesia
];
// Sea carves: [x0, y0, x1, y1] — force water (Mediterranean etc.)
const CARVES = [
  [46, 15.5, 58, 17.5],   // Mediterranean
  [76, 27, 84, 30],       // South China Sea easing
];

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}
function isLand(x, y) {
  for (const [x0, y0, x1, y1] of CARVES) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return false;
  let inside = 0, nearEdge = false;
  for (const [cx, cy, rx, ry] of BLOBS) {
    if (inEllipse(x, y, cx, cy, rx * 0.92, ry * 0.92)) { inside++; break; }
    if (inEllipse(x, y, cx, cy, rx, ry)) nearEdge = true;
  }
  if (inside) return true;
  if (nearEdge) return hash2(x, y) > 0.45; // rough coastline
  return false;
}

// Ports: grid coords. destId -> port
export const PORTS = [
  { id: 'london',    label: 'London',    x: 49, y: 5,  dest: 'england' },
  { id: 'lisbon',    label: 'Lisbon',    x: 46, y: 12, dest: null },        // home port
  { id: 'seville',   label: 'Seville',   x: 48, y: 13, dest: null },        // home port
  { id: 'rome',      label: 'Rome',      x: 54, y: 13, dest: null },        // the Generalate
  { id: 'goa',       label: 'Goa',       x: 70, y: 25, dest: 'india' },
  { id: 'malacca',   label: 'Malacca',   x: 80, y: 29, dest: 'east-indies' },
  { id: 'macau',     label: 'Macau',     x: 83, y: 21, dest: 'china' },
  { id: 'nagasaki',  label: 'Nagasaki',  x: 90, y: 15, dest: 'japan' },
  { id: 'manila',    label: 'Manila',    x: 86, y: 27, dest: null },
  { id: 'bahia',     label: 'Bahia',     x: 32, y: 35, dest: 'brazil' },
  { id: 'lima',      label: 'Lima',      x: 25, y: 37, dest: 'peru' },
  { id: 'asuncion',  label: 'Asunción',  x: 29, y: 41, dest: 'paraguay' },
  { id: 'mozambique',label: 'Mozambique',x: 60, y: 41, dest: 'aethiopia' },
  { id: 'havana',    label: 'Havana',    x: 18, y: 22, dest: 'west-indies' },
];

// Routes by destination id: waypoints in grid coords (dotted lines)
export const ROUTES = {
  india:        [[46,12],[43,16],[40,24],[44,32],[50,38],[57,40],[62,36],[66,30],[70,25]],
  'east-indies':[[46,12],[43,16],[40,24],[44,32],[50,38],[57,40],[62,36],[66,30],[70,25],[75,27],[80,29]],
  china:        [[46,12],[43,16],[40,24],[44,32],[50,38],[57,40],[62,36],[66,30],[70,25],[75,27],[80,29],[82,25],[83,21]],
  japan:        [[46,12],[43,16],[40,24],[44,32],[50,38],[57,40],[62,36],[66,30],[70,25],[75,27],[80,29],[82,25],[83,21],[87,18],[90,15]],
  aethiopia:    [[46,12],[50,20],[54,30],[58,36],[60,41]],
  brazil:       [[48,13],[42,16],[36,22],[32,29],[32,35]],
  peru:         [[48,13],[42,16],[36,22],[32,29],[32,35],[30,40],[26,40],[25,37]],
  paraguay:     [[48,13],[42,16],[36,22],[32,29],[32,35],[30,40],[29,41]],
  england:      [[54,13],[51,10],[49,5]],
  'west-indies':[[48,13],[40,15],[30,17],[22,19],[18,22]],
};

const SHIP = [ // 9x7 pixel ship sprite, 1 = sail, 2 = hull
  '..11111..',
  '..11111..',
  '...1.....',
  '..11111..',
  '..11111..',
  '222222222',
  '.2222222.',
];

function lerpPts(pts) {
  // resample polyline into dense points
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.ceil(d * 4));
    for (let k = 0; k < n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

export function renderMap(root, app, mapState, opts = {}) {
  const { onSelectPort } = opts;
  const reduced = app.prefersReducedMotion();

  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'gmap-wrap';

  const title = document.createElement('div');
  title.className = 'gmap-title';
  title.innerHTML = `<span class="px">THE KNOWN WORLD</span><span class="gmap-sub">as charted in the Generalate, anno ${mapState.year} — inaccuracy is the cartographer\u2019s honest trade</span>`;
  wrap.appendChild(title);

  const canvas = document.createElement('canvas');
  const CELL = 10;
  canvas.width = GW * CELL; canvas.height = GH * CELL;
  canvas.className = 'gmap-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Stylized pixel-art world map with mission ports and sea routes');
  wrap.appendChild(canvas);

  const legend = document.createElement('div');
  legend.className = 'gmap-legend';
  legend.innerHTML = `
    <span><i class="sw port"></i>port / mission</span>
    <span><i class="sw route"></i>sea route</span>
    <span><i class="sw ship"></i>at sea</span>
    <span><i class="sw rome"></i>the Generalate (Rome)</span>`;
  wrap.appendChild(legend);

  const panel = document.createElement('div');
  panel.className = 'gmap-panel';
  panel.innerHTML = `<p class="gmap-hint">Touch a port to inspect its mission.</p>`;
  wrap.appendChild(panel);
  root.appendChild(wrap);

  const ctx = canvas.getContext('2d');
  const landCache = [];
  for (let y = 0; y < GH; y++) { landCache[y] = []; for (let x = 0; x < GW; x++) landCache[y][x] = isLand(x, y); }

  function drawBase() {
    // ocean
    const og = ctx.createLinearGradient(0, 0, 0, canvas.height);
    og.addColorStop(0, '#24424f'); og.addColorStop(1, '#16292f');
    ctx.fillStyle = og; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // faint graticule
    ctx.fillStyle = 'rgba(232,217,176,0.05)';
    for (let x = 0; x < GW; x += 8) ctx.fillRect(x * CELL, 0, 1, canvas.height);
    for (let y = 0; y < GH; y += 8) ctx.fillRect(0, y * CELL, canvas.width, 1);
    // land
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (!landCache[y][x]) continue;
      const h = hash2(x * 3 + 1, y * 5 + 2);
      ctx.fillStyle = h > 0.6 ? '#7d6a44' : h > 0.25 ? '#6e5d3b' : '#635233';
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      if (h > 0.82) { ctx.fillStyle = '#8a774e'; ctx.fillRect(x * CELL + 2, y * CELL + 2, 3, 3); }
    }
    // Terra Australis — unknown, sketched in hope
    ctx.fillStyle = 'rgba(232,217,176,0.75)';
    ctx.font = '8px monospace';
    ctx.fillText('TERRA AVSTRALIS ?', 52 * CELL, 46.5 * CELL);
    ctx.font = '8px monospace';
    ctx.fillText('~ the sea monsters live here ~', 4 * CELL, 44.5 * CELL);
    // routes (dotted)
    ctx.fillStyle = 'rgba(232,217,176,0.55)';
    for (const destId of Object.keys(ROUTES)) {
      const pts = lerpPts(ROUTES[destId]);
      for (let i = 0; i < pts.length; i += 3) {
        const [x, y] = pts[i];
        ctx.fillRect(Math.round(x * CELL), Math.round(y * CELL), 2, 2);
      }
    }
  }

  function drawPorts(voyages) {
    const atSea = {};
    for (const v of voyages) if (v.status === 'enroute') atSea[v.destination] = (atSea[v.destination] || 0) + 1;
    for (const p of PORTS) {
      const px = p.x * CELL, py = p.y * CELL;
      const isRome = p.id === 'rome';
      ctx.fillStyle = isRome ? '#d8b46a' : '#8e2f26';
      ctx.fillRect(px - 3, py - 3, 6, 6);
      ctx.fillStyle = '#e8d9b0';
      ctx.fillRect(px - 1, py - 1, 2, 2);
      if (p.dest && atSea[p.dest]) {
        ctx.fillStyle = '#e8d9b0';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('⚓' , px + 6, py - 4);
      }
      ctx.fillStyle = 'rgba(232,217,176,0.9)';
      ctx.font = '8px monospace';
      const tw = ctx.measureText(p.label).width;
      ctx.fillText(p.label, Math.min(Math.max(px - tw / 2, 2), canvas.width - tw - 2), py + 14);
    }
  }

  function drawShip(gx, gy) {
    const ox = Math.round(gx * CELL) - 22, oy = Math.round(gy * CELL) - 18;
    for (let r = 0; r < SHIP.length; r++) for (let c = 0; c < SHIP[r].length; c++) {
      const ch = SHIP[r][c];
      if (ch === '.') continue;
      ctx.fillStyle = ch === '1' ? '#e8d9b0' : '#3a2a1c';
      ctx.fillRect(ox + c * 5, oy + r * 5, 5, 5);
    }
  }

  drawBase();
  drawPorts(mapState.voyages);

  // --- ship animations for fresh departures ---------------------------------
  const fresh = mapState.voyages.filter(v => v.justDeparted && v.status === 'enroute' && ROUTES[v.destination]);
  if (fresh.length && !reduced) {
    app.sound('page');
    const paths = fresh.map(v => lerpPts(ROUTES[v.destination]));
    const dur = 3000;
    const t0 = performance.now();
    function frame(t) {
      const el = Math.min(1, (t - t0) / dur);
      drawBase(); drawPorts(mapState.voyages);
      fresh.forEach((v, i) => {
        const path = paths[i];
        const stagger = i * 0.15;
        const p = Math.min(1, Math.max(0, (el - stagger) / (1 - stagger || 1)));
        // ease in-out
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const idx = Math.min(path.length - 1, Math.floor(e * (path.length - 1)));
        drawShip(path[idx][0], path[idx][1]);
      });
      if (el < 1) requestAnimationFrame(frame);
      else {
        drawBase(); drawPorts(mapState.voyages);
        app.clearJustDeparted();
      }
    }
    requestAnimationFrame(frame);
  } else if (fresh.length && reduced) {
    app.clearJustDeparted();
  }

  // --- click handling ---------------------------------------------------------
  function portAt(mx, my) {
    const rect = canvas.getBoundingClientRect();
    const gx = (mx - rect.left) / rect.width * GW;
    const gy = (my - rect.top) / rect.height * GH;
    let best = null, bd = 4;
    for (const p of PORTS) {
      const d = Math.hypot(p.x - gx, p.y - gy);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  canvas.style.cursor = 'pointer';
  canvas.addEventListener('click', (ev) => {
    const p = portAt(ev.clientX, ev.clientY);
    if (!p) return;
    app.sound('tick');
    if (onSelectPort) onSelectPort(p, panel);
  });
  // touch: click covers it
}
