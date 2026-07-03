'use strict';

/* =========================================================
 * TOWER CONTROL — a Flight-Control-style ATC game
 * Drag flight paths from aircraft to their matching runway.
 * Features: iconic airports + random generator, stage mode,
 * TCAS collision prediction, per-plane & game speed control.
 * ========================================================= */

const TAU = Math.PI * 2;
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const COLORS = { jet: '#e0503c', prop: '#efa63c', heli: '#3fa7e0' };
const DARK = { jet: '#a83322', prop: '#b8771e', heli: '#22729e' };
const PTS = { jet: 120, prop: 90, heli: 70 };
const SPEED = { jet: 66, prop: 48, heli: 35 };
const CRASH_D = 24;
const WARN_D = 70;
const PICK_D = 34;
const WATER_FRAC = 0.22;

/* ---------------- airports ---------------- */

const AIRPORT_ORDER = ['SFO', 'JFK', 'LHR', 'CDG', 'RND'];

const AIRPORTS = {
  SFO: {
    code: 'SFO', name: 'San Francisco International', water: 'right',
    strips: [
      { type: 'jet',  x: 0.40, y: 0.62, angle: -0.12, lenF: 0.50, num: '28L' },
      { type: 'prop', x: 0.44, y: 0.46, angle: -0.12, lenF: 0.36, num: '28R' },
      { type: 'jet',  x: 0.56, y: 0.55, angle: 1.45,  lenF: 0.42, num: '1R' },
    ],
    pad: { x: 0.18, y: 0.24 },
  },
  JFK: {
    code: 'JFK', name: 'New York John F. Kennedy', water: 'bottom',
    strips: [
      { type: 'jet',  x: 0.38, y: 0.48, angle: -0.55, lenF: 0.48, num: '31L' },
      { type: 'prop', x: 0.47, y: 0.25, angle: -0.55, lenF: 0.32, num: '31R' },
      { type: 'jet',  x: 0.62, y: 0.52, angle: 0.98,  lenF: 0.40, num: '4L' },
    ],
    pad: { x: 0.82, y: 0.20 },
  },
  LHR: {
    code: 'LHR', name: 'London Heathrow', water: null,
    strips: [
      { type: 'jet',  x: 0.50, y: 0.63, angle: 0.02, lenF: 0.52, num: '27L' },
      { type: 'prop', x: 0.50, y: 0.35, angle: 0.02, lenF: 0.40, num: '27R' },
    ],
    pad: { x: 0.14, y: 0.50 },
  },
  CDG: {
    code: 'CDG', name: 'Paris Charles de Gaulle', water: null,
    strips: [
      { type: 'jet',  x: 0.50, y: 0.20, angle: 0.06, lenF: 0.46, num: '9L' },
      { type: 'prop', x: 0.45, y: 0.33, angle: 0.06, lenF: 0.32, num: '9R' },
      { type: 'jet',  x: 0.52, y: 0.74, angle: 0.06, lenF: 0.46, num: '8R' },
      { type: 'prop', x: 0.57, y: 0.61, angle: 0.06, lenF: 0.32, num: '8L' },
    ],
    pad: { x: 0.14, y: 0.47 },
  },
};

const RAND_N1 = ['Aurora', 'Pacifica', 'Kowloon', 'Nimbus', 'Redwood', 'Falcon', 'Harbour', 'Summit', 'Mirage', 'Cyclone', 'Verde', 'Atlas'];
const RAND_N2 = ['International', 'Regional', 'Field', 'Airpark', 'Bay'];

function randomAirport() {
  const pick = a => a[Math.random() * a.length | 0];
  const n1 = pick(RAND_N1), n2 = pick(RAND_N2);
  const name = `${n1} ${n2}`;
  const code = (n1.slice(0, 2) + n2[0]).toUpperCase();
  const types = ['jet', 'prop'];
  if (Math.random() < 0.5) types.push(pick(['jet', 'prop']));
  const strips = [];
  for (const t of types) {
    for (let tries = 0; tries < 50; tries++) {
      const c = { x: rand(0.3, 0.68), y: rand(0.28, 0.72) };
      if (strips.every(s => Math.hypot(s.x - c.x, s.y - c.y) > 0.19)) {
        strips.push({
          type: t, x: c.x, y: c.y,
          angle: rand(-1.35, 1.35),
          lenF: t === 'jet' ? rand(0.42, 0.5) : rand(0.28, 0.36),
          num: '' + (1 + Math.random() * 35 | 0),
        });
        break;
      }
    }
  }
  let pad = { x: 0.15, y: 0.25 };
  for (let tries = 0; tries < 50; tries++) {
    const c = { x: rand(0.15, 0.8), y: rand(0.18, 0.8) };
    if (strips.every(s => Math.hypot(s.x - c.x, s.y - c.y) > 0.22)) { pad = c; break; }
  }
  const water = pick([null, null, null, 'left', 'right', 'bottom']);
  return { code, name, water, strips, pad };
}

function instantiateAirport(key) {
  const def = key === 'RND' ? randomAirport() : AIRPORTS[key];
  return { key, ...def };
}

/* ---------------- state ---------------- */

let W = 0, H = 0, DPR = 1;
let state = 'menu'; // menu | play | paused | crash | over | stagec
let planes = [], popups = [], explosions = [], clouds = [], runways = [];
let tcasPairs = [];
let score = 0, stageLanded = 0, totalLanded = 0, elapsed = 0, spawnT = 1.0, crashT = 0;
let best = +(localStorage.getItem('atc-best') || 0);
let active = null;
let shake = 0, flash = 0, lastBeep = -9;
let field = null;

// config (persisted)
let cfg = { apt: 'SFO', mode: 'endless', target: 200, tcas: true, practice: false };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('atc-cfg') || '{}')); } catch (e) {}
let airport = null;
let airportIdx = Math.max(0, AIRPORT_ORDER.indexOf(cfg.apt));
let stage = 1;
let timeScale = 1;

const $ = id => document.getElementById(id);
const scoreEl = $('score'), bestHudEl = $('bestHud'), landedEl = $('landedHud'), stageHudEl = $('stageHud');

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

function saveCfg() { localStorage.setItem('atc-cfg', JSON.stringify(cfg)); }

/* ---------------- layout & ground ---------------- */

function layoutAirport() {
  const s = Math.min(W, H);
  runways = [];
  for (const st of airport.strips) {
    runways.push({
      kind: 'strip', type: st.type, color: COLORS[st.type],
      x: st.x * W, y: st.y * H, angle: st.angle,
      len: Math.min(s * st.lenF, 430),
      wid: st.type === 'jet' ? 36 : 27,
      num: st.num,
    });
  }
  runways.push({
    kind: 'pad', type: 'heli', color: COLORS.heli,
    x: airport.pad.x * W, y: airport.pad.y * H,
    r: Math.max(24, s * 0.045),
  });
}

function inWater(x, y) {
  const w = airport && airport.water;
  if (!w) return false;
  if (w === 'right') return x > W * (1 - WATER_FRAC);
  if (w === 'left') return x < W * WATER_FRAC;
  if (w === 'bottom') return y > H * (1 - WATER_FRAC);
  if (w === 'top') return y < H * WATER_FRAC;
  return false;
}

function drawWater(g) {
  const side = airport.water;
  if (!side) return;
  const vertical = side === 'left' || side === 'right';
  g.save();
  const shore = [];
  if (vertical) {
    const shoreX = side === 'right' ? W * (1 - WATER_FRAC) : W * WATER_FRAC;
    const edgeX = side === 'right' ? W + 12 : -12;
    const gr = g.createLinearGradient(shoreX, 0, edgeX, 0);
    gr.addColorStop(0, '#63aecf');
    gr.addColorStop(1, '#3d7fa6');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(edgeX, -12);
    for (let y = -12; y <= H + 12; y += 22) {
      shore.push([shoreX + Math.sin(y * 0.02) * 11, y]);
    }
    g.lineTo(shore[0][0], shore[0][1]);
    for (const [sx, sy] of shore) g.lineTo(sx, sy);
    g.lineTo(edgeX, H + 12);
    g.closePath();
    g.fill();
  } else {
    const shoreY = side === 'bottom' ? H * (1 - WATER_FRAC) : H * WATER_FRAC;
    const edgeY = side === 'bottom' ? H + 12 : -12;
    const gr = g.createLinearGradient(0, shoreY, 0, edgeY);
    gr.addColorStop(0, '#63aecf');
    gr.addColorStop(1, '#3d7fa6');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-12, edgeY);
    for (let x = -12; x <= W + 12; x += 22) {
      shore.push([x, shoreY + Math.sin(x * 0.02) * 11]);
    }
    g.lineTo(shore[0][0], shore[0][1]);
    for (const [sx, sy] of shore) g.lineTo(sx, sy);
    g.lineTo(W + 12, edgeY);
    g.closePath();
    g.fill();
  }
  // sandy shoreline
  g.strokeStyle = 'rgba(228, 212, 168, 0.85)';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(shore[0][0], shore[0][1]);
  for (const [sx, sy] of shore) g.lineTo(sx, sy);
  g.stroke();
  // little wave arcs
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 10; i++) {
    let wx, wy;
    if (vertical) {
      wx = side === 'right' ? rand(W * (1 - WATER_FRAC * 0.8), W - 20) : rand(20, W * WATER_FRAC * 0.8);
      wy = rand(20, H - 20);
    } else {
      wx = rand(20, W - 20);
      wy = side === 'bottom' ? rand(H * (1 - WATER_FRAC * 0.8), H - 20) : rand(20, H * WATER_FRAC * 0.8);
    }
    g.beginPath();
    g.arc(wx, wy, rand(6, 14), Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  }
  g.restore();
}

function makeClouds() {
  clouds = [];
  for (let i = 0; i < 4; i++) {
    clouds.push({
      x: rand(0, W), y: rand(0, H),
      s: rand(0.7, 1.5),
      vx: rand(6, 14),
      blobs: [[0, 0, 42], [34, 8, 30], [-32, 10, 28], [12, -14, 30], [-8, 16, 26]],
    });
  }
}

function renderField() {
  field = document.createElement('canvas');
  field.width = Math.ceil(W * DPR);
  field.height = Math.ceil(H * DPR);
  const g = field.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);

  // grass base
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#8cab61');
  grad.addColorStop(1, '#7a9a52');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // mowing stripes
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(-0.3);
  g.fillStyle = 'rgba(255,255,255,0.045)';
  const span = Math.max(W, H) * 1.5;
  for (let x = -span; x < span; x += 150) g.fillRect(x, -span, 75, span * 2);
  g.restore();

  // speckle texture
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    g.fillRect(rand(0, W), rand(0, H), rand(1, 3), rand(1, 3));
  }

  drawWater(g);

  // tree clusters tucked into corners (kept off the water)
  const spots = [[W * 0.06, H * 0.85], [W * 0.9, H * 0.9], [W * 0.93, H * 0.12], [W * 0.08, H * 0.08]];
  for (const [cx, cy] of spots) {
    if (inWater(cx, cy)) continue;
    for (let i = 0; i < 7; i++) {
      const tx = cx + rand(-46, 46), ty = cy + rand(-30, 30), tr = rand(8, 15);
      if (inWater(tx, ty)) continue;
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.beginPath(); g.ellipse(tx + 3, ty + 4, tr, tr * 0.8, 0, 0, TAU); g.fill();
      g.fillStyle = `rgb(${70 + (Math.random() * 24 | 0)},${115 + (Math.random() * 24 | 0)},64)`;
      g.beginPath(); g.arc(tx, ty, tr, 0, TAU); g.fill();
    }
  }

  // taxiways connecting the facilities
  const strips = runways.filter(r => r.kind === 'strip');
  const pad = runways.find(r => r.kind === 'pad');
  g.strokeStyle = '#a8a89d';
  g.lineWidth = 11;
  g.lineCap = 'round';
  g.globalAlpha = 0.8;
  g.beginPath();
  for (let i = 1; i < strips.length; i++) {
    g.moveTo(strips[0].x, strips[0].y);
    g.quadraticCurveTo(
      (strips[0].x + strips[i].x) / 2 + 30, (strips[0].y + strips[i].y) / 2 + 30,
      strips[i].x, strips[i].y);
  }
  if (pad) {
    g.moveTo(strips[0].x, strips[0].y);
    g.quadraticCurveTo(
      (strips[0].x + pad.x) / 2 - 20, (strips[0].y + pad.y) / 2 + 20,
      pad.x, pad.y);
  }
  g.stroke();
  g.globalAlpha = 1;

  for (const rw of runways) {
    if (rw.kind === 'strip') drawStrip(g, rw);
    else drawPad(g, rw);
  }

  // airport name plate
  g.save();
  g.font = '900 15px system-ui';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = 5;
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText(`${airport.code} · ${airport.name.toUpperCase()}`, 14, H - 16);
  g.restore();
}

function drawStrip(g, rw) {
  g.save();
  g.translate(rw.x, rw.y);
  g.rotate(rw.angle);
  const L = rw.len, Wd = rw.wid;

  g.shadowColor = 'rgba(0,0,0,0.3)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 4;
  g.fillStyle = '#53565c';
  g.fillRect(-L / 2, -Wd / 2, L, Wd);
  g.shadowColor = 'transparent';

  g.strokeStyle = rw.color;
  g.lineWidth = 3.5;
  g.strokeRect(-L / 2 + 1.5, -Wd / 2 + 1.5, L - 3, Wd - 3);

  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2.5;
  g.setLineDash([14, 12]);
  g.beginPath();
  g.moveTo(-L / 2 + 26, 0);
  g.lineTo(L / 2 - 26, 0);
  g.stroke();
  g.setLineDash([]);

  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const side of [-1, 1]) {
    const x0 = side * (L / 2 - 16);
    for (let i = -2; i <= 2; i++) {
      g.fillRect(x0 - 3, i * (Wd / 6) - 2, 6, 4.5);
    }
  }

  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = `900 ${Math.round(Wd * 0.42)}px system-ui`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(-L / 2 + 38, 0);
  g.rotate(Math.PI / 2);
  g.fillText(rw.num, 0, 0);
  g.restore();
  g.restore();
}

function drawPad(g, rw) {
  g.shadowColor = 'rgba(0,0,0,0.3)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 4;
  g.fillStyle = '#53565c';
  g.beginPath(); g.arc(rw.x, rw.y, rw.r, 0, TAU); g.fill();
  g.shadowColor = 'transparent';

  g.strokeStyle = rw.color;
  g.lineWidth = 4;
  g.beginPath(); g.arc(rw.x, rw.y, rw.r - 2.5, 0, TAU); g.stroke();

  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(rw.x, rw.y, rw.r - 9, 0, TAU); g.stroke();

  g.fillStyle = '#fff';
  g.font = `900 ${Math.round(rw.r * 0.95)}px system-ui`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('H', rw.x, rw.y + 1);
}

/* ---------------- aircraft ---------------- */

function spawnPlane() {
  const r = Math.random();
  const type = r < 0.45 ? 'jet' : r < 0.8 ? 'prop' : 'heli';
  const m = 46;
  const side = Math.random() * 4 | 0;
  let x, y;
  if (side === 0) { x = -m; y = rand(H * 0.12, H * 0.88); }
  else if (side === 1) { x = W + m; y = rand(H * 0.12, H * 0.88); }
  else if (side === 2) { x = rand(W * 0.12, W * 0.88); y = -m; }
  else { x = rand(W * 0.12, W * 0.88); y = H + m; }

  for (const p of planes) {
    if (!p.done && Math.hypot(p.x - x, p.y - y) < 110) { spawnT = 0.6; return; }
  }

  const tx = W * 0.5 + rand(-W * 0.22, W * 0.22);
  const ty = H * 0.5 + rand(-H * 0.22, H * 0.22);
  const heading = Math.atan2(ty - y, tx - x);
  planes.push({
    type, x, y, heading, dispHeading: heading,
    speed: SPEED[type], spdMod: 1,
    path: [], trail: [], trailT: 0,
    scale: 1, alert: null, done: false,
    landing: null, landProgress: 0, hover: 0, age: 0,
  });
  SFX.blip();
}

function spawnInterval() {
  return Math.max(1.15, 5.0 - totalLanded * 0.09 - elapsed * 0.004 - (stage - 1) * 0.4);
}

function effSpeed(p) {
  let sp = p.speed * (p.spdMod || 1);
  if (p.landing && p.landing.kind === 'strip' && p.path.length <= 1) {
    sp *= 1 - 0.45 * p.landProgress;
  }
  return sp;
}

function tryLand(p) {
  const end = p.path.length ? p.path[p.path.length - 1] : { x: p.x, y: p.y };
  for (const rw of runways) {
    if (rw.type !== p.type) continue;
    if (rw.kind === 'pad') {
      if (Math.hypot(end.x - rw.x, end.y - rw.y) < rw.r + 12) {
        p.path.push({ x: rw.x, y: rw.y });
        p.landing = { rw, kind: 'pad' };
        return true;
      }
    } else {
      const dx = end.x - rw.x, dy = end.y - rw.y;
      const ca = Math.cos(-rw.angle), sa = Math.sin(-rw.angle);
      const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
      if (Math.abs(lx) < rw.len / 2 + 8 && Math.abs(ly) < rw.wid / 2 + 12) {
        const dirx = Math.cos(rw.angle), diry = Math.sin(rw.angle);
        const sign = lx > 0 ? 1 : -1;
        const t0 = { x: rw.x + dirx * sign * rw.len / 2, y: rw.y + diry * sign * rw.len / 2 };
        const t1 = { x: rw.x - dirx * sign * rw.len * 0.38, y: rw.y - diry * sign * rw.len * 0.38 };
        p.path.push(t0, t1);
        p.landing = { rw, kind: 'strip', t0, t1, len: Math.hypot(t1.x - t0.x, t1.y - t0.y) };
        return true;
      }
    }
  }
  return false;
}

function collidable(p) {
  if (p.done) return false;
  if (p.landing) {
    if (p.landing.kind === 'strip' && p.path.length <= 1 && p.landProgress > 0.25) return false;
    if (p.landing.kind === 'pad' && p.path.length === 0) return false;
  }
  return true;
}

function finishLanding(p) {
  p.done = true;
  const pts = PTS[p.type];
  score += pts;
  stageLanded++;
  totalLanded++;
  popups.push({ x: p.x, y: p.y - 18, text: '+' + pts, age: 0, color: COLORS[p.type] });
  SFX.chime();
  updateHud();
  if (cfg.mode === 'stages' && stageLanded >= cfg.target && state === 'play') stageClear();
}

function updatePlane(p, dt) {
  p.age += dt;
  if (p.done) return;

  if (p.landing && p.landing.kind === 'strip' && p.path.length <= 1) {
    p.landProgress = clamp(1 - dist(p, p.landing.t1) / p.landing.len, 0, 1);
    p.scale = 1 - 0.5 * p.landProgress;
  }
  const sp = effSpeed(p);

  if (p.path.length) {
    const t = p.path[0];
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    p.heading = Math.atan2(t.y - p.y, t.x - p.x);
    if (d <= sp * dt * 1.4) {
      p.x = t.x; p.y = t.y;
      p.path.shift();
      if (!p.path.length && p.landing && p.landing.kind === 'strip') {
        finishLanding(p);
        return;
      }
    } else {
      p.x += Math.cos(p.heading) * sp * dt;
      p.y += Math.sin(p.heading) * sp * dt;
    }
  } else if (p.landing && p.landing.kind === 'pad') {
    p.hover += dt;
    p.scale = Math.max(0.12, 1 - (p.hover / 0.9));
    if (p.hover >= 0.9) { finishLanding(p); return; }
  } else {
    p.x += Math.cos(p.heading) * sp * dt;
    p.y += Math.sin(p.heading) * sp * dt;
    const m = 50;
    if (p.x < -m) p.x = W + m; else if (p.x > W + m) p.x = -m;
    if (p.y < -m) p.y = H + m; else if (p.y > H + m) p.y = -m;
  }

  p.dispHeading = lerpAngle(p.dispHeading, p.heading, Math.min(1, dt * 8));

  p.trailT += dt;
  if (p.trailT > 0.06) {
    p.trailT = 0;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 10) p.trail.shift();
  }
}

/* ---------------- conflicts & TCAS ---------------- */

function velOf(p) {
  const sp = effSpeed(p);
  return { x: Math.cos(p.heading) * sp, y: Math.sin(p.heading) * sp };
}

// closest point of approach between two aircraft on current headings
function cpa(a, b) {
  const va = velOf(a), vb = velOf(b);
  const dx = b.x - a.x, dy = b.y - a.y;
  const dvx = vb.x - va.x, dvy = vb.y - va.y;
  const dv2 = dvx * dvx + dvy * dvy;
  const t = dv2 > 1e-6 ? clamp(-(dx * dvx + dy * dvy) / dv2, 0, 16) : 0;
  const cx = dx + dvx * t, cy = dy + dvy * t;
  return {
    t, d: Math.hypot(cx, cy),
    px: a.x + va.x * t, py: a.y + va.y * t,
  };
}

const ALERT_RANK = { ta: 1, ra: 2 };
function raiseAlert(p, level) {
  if (!p.alert || ALERT_RANK[level] > ALERT_RANK[p.alert]) p.alert = level;
}

function checkConflicts() {
  tcasPairs = [];
  let anyTa = false, anyRa = false;
  for (const p of planes) p.alert = null;
  for (let i = 0; i < planes.length; i++) {
    const a = planes[i];
    if (!collidable(a)) continue;
    for (let j = i + 1; j < planes.length; j++) {
      const b = planes[j];
      if (!collidable(b)) continue;
      const d = dist(a, b);
      if (d < CRASH_D) {
        crashAt(a, b);
        if (state === 'crash') return;
        break; // practice mode: both planes are gone, move to the next aircraft
      }
      let level = null;
      let px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
      if (d < WARN_D) level = 'ta';
      if (cfg.tcas) {
        const c = cpa(a, b);
        if (c.d < 34 && c.t < 9) { level = 'ra'; px = c.px; py = c.py; }
        else if (!level && c.d < WARN_D && c.t < 14) { level = 'ta'; px = c.px; py = c.py; }
      }
      if (level) {
        tcasPairs.push({ a, b, level, px, py });
        raiseAlert(a, level);
        raiseAlert(b, level);
        if (level === 'ra') anyRa = true; else anyTa = true;
      }
    }
  }
  if (anyRa && elapsed - lastBeep > 0.5) { SFX.raAlert(); lastBeep = elapsed; }
  else if (anyTa && elapsed - lastBeep > 0.95) { SFX.warn(); lastBeep = elapsed; }
}

function crashAt(a, b) {
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
  a.done = b.done = true;
  const parts = [];
  for (let i = 0; i < 26; i++) {
    const ang = rand(0, TAU), v = rand(30, 190);
    parts.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: rand(2, 5.5), hue: rand(12, 45) });
  }
  explosions.push({ x, y, age: 0, parts });
  SFX.crash();
  shake = 0.6;
  flash = 0.5;
  if (cfg.practice) {
    const pen = 150;
    score = Math.max(0, score - pen);
    popups.push({ x, y: y - 34, text: '-' + pen, age: 0 });
    updateHud();
    return;
  }
  state = 'crash';
  crashT = 1.5;
}

/* ---------------- leaderboard (local only) ---------------- */

function loadLB() {
  try { return JSON.parse(localStorage.getItem('atc-lb') || '[]'); }
  catch (e) { return []; }
}

function saveScoreToLB() {
  if (score <= 0) return;
  const lb = loadLB();
  lb.push({
    s: score, l: totalLanded, a: airport.code,
    m: cfg.mode === 'stages' ? 'STG ' + stage : 'NON-STOP',
    p: cfg.practice ? 1 : 0,
    d: new Date().toISOString().slice(0, 10),
  });
  lb.sort((x, y) => y.s - x.s);
  localStorage.setItem('atc-lb', JSON.stringify(lb.slice(0, 10)));
}

function renderLB(el, n) {
  const lb = loadLB().slice(0, n || 5);
  if (!lb.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="lb-title">BEST SHIFTS</div>' + lb.map((e, i) =>
    `<div class="lb-row${i === 0 ? ' top' : ''}">` +
    `<span class="rank">${i + 1}</span>` +
    `<span class="pts">${e.s}</span>` +
    `<span class="meta">${e.l}✈ · ${e.a} · ${e.m}${e.p ? ' · PRAC' : ''} · ${e.d.slice(5)}</span>` +
    `</div>`).join('');
}

function gameOver() {
  state = 'over';
  const isBest = score > best;
  if (isBest) {
    best = score;
    localStorage.setItem('atc-best', best);
  }
  saveScoreToLB();
  renderLB($('lbOver'));
  $('finalScore').textContent = score;
  $('finalLanded').textContent = totalLanded;
  $('finalBest').textContent = best;
  $('newBest').classList.toggle('hidden', !isBest);
  $('over').classList.remove('hidden');
  updateHud();
  SFX.setEngine(0);
}

/* ---------------- stages ---------------- */

function stageClear() {
  state = 'stagec';
  SFX.fanfare();
  SFX.setEngine(0);
  const nextKey = AIRPORT_ORDER[(airportIdx + 1) % AIRPORT_ORDER.length];
  const nextName = nextKey === 'RND' ? 'Random field 🎲' : `${nextKey} — ${AIRPORTS[nextKey].name}`;
  $('stageNum').textContent = stage;
  $('nextAptName').textContent = 'Next: ' + nextName;
  $('stageScore').textContent = score;
  $('stageLandedEl').textContent = totalLanded;
  $('stagec').classList.remove('hidden');
}

function nextStage() {
  SFX.click();
  stage++;
  airportIdx = (airportIdx + 1) % AIRPORT_ORDER.length;
  airport = instantiateAirport(AIRPORT_ORDER[airportIdx]);
  layoutAirport();
  renderField();
  planes = []; popups = []; explosions = [];
  active = null;
  stageLanded = 0;
  spawnT = 0.8;
  lastBeep = -9;
  $('stagec').classList.add('hidden');
  updateHud();
  state = 'play';
}

/* ---------------- main update ---------------- */

function update(dt) {
  elapsed += dt;
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnPlane();
    spawnT = spawnInterval();
  }
  for (const p of planes) updatePlane(p, dt);
  planes = planes.filter(p => !p.done);
  if (state === 'play' || state === 'crash') checkConflicts();
  SFX.setEngine(planes.length);
}

function updateFx(dt) {
  for (const c of clouds) {
    c.x += c.vx * dt;
    if (c.x - 120 * c.s > W) { c.x = -120 * c.s; c.y = rand(0, H); }
  }
  for (const pop of popups) pop.age += dt;
  popups = popups.filter(p => p.age < 1.1);
  for (const ex of explosions) {
    ex.age += dt;
    for (const pt of ex.parts) {
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.96; pt.vy *= 0.96;
    }
  }
  explosions = explosions.filter(e => e.age < 1.3);
  shake = Math.max(0, shake - dt);
  flash = Math.max(0, flash - dt);
}

/* ---------------- rendering ---------------- */

function drawShape(g, type, t, flat) {
  const c = flat || COLORS[type];
  const dk = flat || DARK[type];
  g.lineWidth = 1.4;
  g.strokeStyle = dk;
  g.fillStyle = c;

  if (type === 'jet') {
    g.beginPath();
    g.moveTo(5, 2); g.lineTo(-6, 15); g.lineTo(-11, 15); g.lineTo(-4, 2);
    g.lineTo(-4, -2); g.lineTo(-11, -15); g.lineTo(-6, -15); g.lineTo(5, -2);
    g.closePath(); g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(-13, 1.5); g.lineTo(-18, 7.5); g.lineTo(-20.5, 7.5); g.lineTo(-16.5, 1.5);
    g.lineTo(-16.5, -1.5); g.lineTo(-20.5, -7.5); g.lineTo(-18, -7.5); g.lineTo(-13, -1.5);
    g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(0, 0, 18, 4.3, 0, 0, TAU); g.fill(); g.stroke();
    if (!flat) {
      g.fillStyle = '#dff0ff';
      g.beginPath(); g.ellipse(10, 0, 3.4, 2, 0, 0, TAU); g.fill();
    }
  } else if (type === 'prop') {
    g.beginPath();
    if (g.roundRect) g.roundRect(-3, -16, 7, 32, 3); else g.rect(-3, -16, 7, 32);
    g.fill(); g.stroke();
    g.beginPath();
    if (g.roundRect) g.roundRect(-13.5, -6.5, 4, 13, 2); else g.rect(-13.5, -6.5, 4, 13);
    g.fill(); g.stroke();
    g.beginPath(); g.ellipse(0, 0, 14, 4.6, 0, 0, TAU); g.fill(); g.stroke();
    if (!flat) {
      g.fillStyle = '#dff0ff';
      g.beginPath(); g.ellipse(6.5, 0, 3, 2.1, 0, 0, TAU); g.fill();
      g.fillStyle = dk;
      g.beginPath(); g.arc(14.5, 0, 2, 0, TAU); g.fill();
    }
  } else { // heli
    g.strokeStyle = dk;
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(-6, 6.5); g.lineTo(7, 6.5);
    g.moveTo(-6, -6.5); g.lineTo(7, -6.5);
    g.stroke();
    g.fillStyle = c;
    g.beginPath();
    if (g.roundRect) g.roundRect(-17, -1.4, 12, 2.8, 1.4); else g.rect(-17, -1.4, 12, 2.8);
    g.fill(); g.stroke();
    g.beginPath(); g.ellipse(1, 0, 9.5, 5.8, 0, 0, TAU); g.fill(); g.stroke();
    if (!flat) {
      g.fillStyle = '#dff0ff';
      g.beginPath(); g.ellipse(5.5, 0, 3.2, 2.6, 0, 0, TAU); g.fill();
    }
  }
}

function drawRotors(g, p) {
  g.strokeStyle = 'rgba(30,30,30,0.55)';
  g.lineWidth = 1.6;
  if (p.type === 'heli') {
    const a = p.age * 22;
    g.save(); g.translate(1, 0); g.rotate(a);
    g.beginPath();
    g.moveTo(-17, 0); g.lineTo(17, 0);
    g.moveTo(0, -17); g.lineTo(0, 17);
    g.stroke();
    g.restore();
    g.save(); g.translate(-17, 0); g.rotate(a * 1.6);
    g.beginPath(); g.moveTo(0, -4.5); g.lineTo(0, 4.5); g.stroke();
    g.restore();
  } else if (p.type === 'prop') {
    g.save(); g.translate(14.5, 0); g.rotate(p.age * 30);
    g.beginPath(); g.moveTo(0, -7); g.lineTo(0, 7); g.stroke();
    g.restore();
  }
}

function drawPlane(p, asShadow) {
  ctx.save();
  if (asShadow) {
    ctx.translate(p.x + 5 * p.scale, p.y + 8 * p.scale);
    ctx.globalAlpha = 0.16 * p.scale;
  } else {
    ctx.translate(p.x, p.y);
  }
  ctx.rotate(p.dispHeading);
  ctx.scale(p.scale, p.scale);
  drawShape(ctx, p.type, p.age, asShadow ? '#000' : null);
  if (!asShadow) drawRotors(ctx, p);
  ctx.restore();

  // per-plane speed indicator
  if (!asShadow && p.spdMod !== 1 && !p.done) {
    ctx.save();
    ctx.font = '900 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.fillStyle = '#ffffff';
    const txt = p.spdMod > 1 ? '»»' : '«';
    ctx.strokeText(txt, p.x, p.y + 26);
    ctx.fillText(txt, p.x, p.y + 26);
    ctx.restore();
  }
}

function drawPath(p) {
  if (!p.path.length) return;
  ctx.save();
  ctx.strokeStyle = COLORS[p.type];
  ctx.globalAlpha = p.landing ? 0.5 : 0.8;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([2, 11]);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  for (const pt of p.path) ctx.lineTo(pt.x, pt.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const end = p.path[p.path.length - 1];
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = COLORS[p.type];
  ctx.beginPath(); ctx.arc(end.x, end.y, 4, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawTrail(p) {
  if (p.trail.length < 2) return;
  ctx.save();
  for (let i = 0; i < p.trail.length; i++) {
    const t = p.trail[i];
    ctx.globalAlpha = (i / p.trail.length) * 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 1.6 + i * 0.14, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawAlert(p) {
  const ra = p.alert === 'ra';
  const col = ra ? '255,50,30' : '255,176,46';
  const pulse = 1 + 0.08 * Math.sin(elapsed * (ra ? 16 : 10));
  ctx.save();
  ctx.strokeStyle = `rgba(${col},0.85)`;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 30 * pulse, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // collision warning icon above the aircraft
  ctx.translate(p.x, p.y - 38);
  ctx.fillStyle = `rgba(${col},0.95)`;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(8.5, 6.5); ctx.lineTo(-8.5, 6.5);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '900 10px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 0, 1.5);
  ctx.restore();
}

function drawTcasPairs() {
  for (const pr of tcasPairs) {
    const col = pr.level === 'ra' ? '#ff3b28' : '#ffb02e';
    ctx.save();
    ctx.strokeStyle = col;
    ctx.globalAlpha = pr.level === 'ra' ? 0.6 : 0.3;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.moveTo(pr.a.x, pr.a.y);
    ctx.lineTo(pr.b.x, pr.b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (pr.level === 'ra' && cfg.tcas) {
      // predicted conflict point
      const pulse = 1 + 0.15 * Math.sin(elapsed * 14);
      ctx.globalAlpha = 0.9;
      ctx.translate(pr.px, pr.py);
      ctx.scale(pulse, pulse);
      ctx.strokeStyle = '#ff3b28';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-6, -6); ctx.lineTo(6, 6);
      ctx.moveTo(6, -6); ctx.lineTo(-6, 6);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawEdgeMarker(p) {
  const m = 18;
  if (p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H) return;
  const cx = clamp(p.x, m, W - m), cy = clamp(p.y, m, H - m);
  const ang = Math.atan2(p.y - cy, p.x - cx);
  const pulse = 1 + 0.12 * Math.sin(elapsed * 8);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = COLORS[p.type];
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.rotate(ang);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7.5, 0); ctx.lineTo(1.5, -4); ctx.lineTo(1.5, 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawExplosion(ex) {
  const t = ex.age / 1.3;
  ctx.save();
  if (ex.age < 0.35) {
    ctx.globalAlpha = 1 - ex.age / 0.35;
    const gr = ctx.createRadialGradient(ex.x, ex.y, 2, ex.x, ex.y, 46);
    gr.addColorStop(0, '#fff6c8');
    gr.addColorStop(0.4, '#ff9b2e');
    gr.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(ex.x, ex.y, 46, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = Math.max(0, 0.7 - t);
  ctx.strokeStyle = '#ffb35e';
  ctx.lineWidth = 3 * (1 - t) + 0.5;
  ctx.beginPath(); ctx.arc(ex.x, ex.y, 12 + t * 90, 0, TAU); ctx.stroke();
  for (const pt of ex.parts) {
    ctx.globalAlpha = Math.max(0, 1 - t * 1.15);
    ctx.fillStyle = `hsl(${pt.hue}, 90%, ${55 - t * 25}%)`;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r * (1 - t * 0.6), 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawPopup(pop) {
  const t = pop.age / 1.1;
  ctx.save();
  ctx.globalAlpha = 1 - t * t;
  ctx.font = '900 19px system-ui';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.fillStyle = '#ffffff';
  const y = pop.y - t * 34;
  ctx.strokeText(pop.text, pop.x, y);
  ctx.fillText(pop.text, pop.x, y);
  ctx.restore();
}

function drawClouds() {
  ctx.save();
  for (const c of clouds) {
    ctx.fillStyle = 'rgba(20,40,20,0.05)';
    for (const [bx, by, br] of c.blobs) {
      ctx.beginPath();
      ctx.arc(c.x + (bx + 34) * c.s, c.y + (by + 50) * c.s, br * c.s, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    for (const [bx, by, br] of c.blobs) {
      ctx.beginPath();
      ctx.arc(c.x + bx * c.s, c.y + by * c.s, br * c.s, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (shake > 0) {
    const s = shake * 9;
    ctx.translate(rand(-s, s), rand(-s, s));
  }

  if (field) ctx.drawImage(field, 0, 0, W, H);

  const inPlay = state === 'play' || state === 'paused' || state === 'crash' || state === 'stagec';
  if (inPlay) {
    for (const p of planes) drawPath(p);
    for (const p of planes) drawTrail(p);
    drawTcasPairs();
    for (const p of planes) drawPlane(p, true);
    for (const p of planes) drawPlane(p, false);
    for (const p of planes) if (p.alert) drawAlert(p);
    if (active) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(active.x, active.y, 26, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    for (const p of planes) drawEdgeMarker(p);
    for (const ex of explosions) drawExplosion(ex);
    for (const pop of popups) drawPopup(pop);
  }

  drawClouds();

  if (flash > 0) {
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = `rgba(255, 40, 20, ${flash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/* ---------------- input ---------------- */

function eventPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  SFX.init();
  SFX.resume();
  if (state !== 'play') return;
  const pos = eventPos(e);
  let bestP = null, bestD = PICK_D;
  for (const p of planes) {
    if (p.done || p.landing) continue;
    const d = dist(p, pos);
    if (d < bestD) { bestD = d; bestP = p; }
  }
  if (bestP) {
    active = bestP;
    active._oldPath = active.path;
    active._downPos = pos;
    active._moved = false;
    active.path = [pos];
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener('pointermove', e => {
  if (!active || state !== 'play') return;
  const pos = eventPos(e);
  if (!active._moved && Math.hypot(pos.x - active._downPos.x, pos.y - active._downPos.y) > 10) {
    active._moved = true;
  }
  const last = active.path[active.path.length - 1] || active;
  if (Math.hypot(pos.x - last.x, pos.y - last.y) > 7) {
    active.path.push(pos);
  }
});

function cycleSpeed(p) {
  p.spdMod = p.spdMod === 1 ? 0.65 : p.spdMod === 0.65 ? 1.35 : 1;
  const label = p.spdMod === 1 ? 'NORMAL' : p.spdMod > 1 ? 'FAST »' : '« SLOW';
  popups.push({ x: p.x, y: p.y - 24, text: label, age: 0.35 });
  SFX.click();
}

function endDrag() {
  if (!active) return;
  if (!active._moved) {
    // treated as a tap — restore the old route and cycle aircraft speed
    active.path = active._oldPath || [];
    cycleSpeed(active);
  } else if (tryLand(active)) {
    SFX.confirm();
  }
  active._oldPath = null;
  active = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ---------------- menu config ---------------- */

function bindSelector(rowId, attr, onPick) {
  const row = $(rowId);
  row.addEventListener('click', e => {
    const btn = e.target.closest('.sel');
    if (!btn) return;
    for (const b of row.querySelectorAll('.sel')) b.classList.remove('on');
    btn.classList.add('on');
    SFX.init();
    SFX.click();
    onPick(btn.dataset[attr]);
  });
  // reflect saved config
  return v => {
    for (const b of row.querySelectorAll('.sel')) {
      b.classList.toggle('on', b.dataset[attr] === String(v));
    }
  };
}

function setAirport(k) {
  cfg.apt = k;
  airportIdx = Math.max(0, AIRPORT_ORDER.indexOf(k));
  airport = instantiateAirport(k);
  layoutAirport();
  renderField();
  $('aptName').textContent = airport.name + (k === 'RND' ? ' (randomized)' : '');
  saveCfg();
}

const reflectApt = bindSelector('airportSel', 'k', setAirport);
const reflectMode = bindSelector('modeSel', 'm', m => {
  cfg.mode = m;
  $('targetSel').classList.toggle('hidden', m !== 'stages');
  saveCfg();
});
const reflectTarget = bindSelector('targetSel', 't', t => {
  cfg.target = +t;
  saveCfg();
});
const reflectPractice = bindSelector('practiceSel', 'p', p => {
  cfg.practice = p === 'on';
  saveCfg();
  updateHud();
});

/* ---------------- flow control ---------------- */

function updateHud() {
  scoreEl.textContent = score;
  bestHudEl.textContent = best;
  landedEl.textContent = cfg.mode === 'stages' ? `${stageLanded}/${cfg.target}` : totalLanded;
  stageHudEl.textContent = stage;
  for (const el of document.querySelectorAll('.stage-ui')) {
    el.classList.toggle('hidden', cfg.mode !== 'stages');
  }
  for (const el of document.querySelectorAll('.practice-ui')) {
    el.classList.toggle('hidden', !cfg.practice);
  }
}

function reset() {
  planes = []; popups = []; explosions = []; tcasPairs = [];
  score = 0; stageLanded = 0; totalLanded = 0; elapsed = 0;
  stage = 1;
  spawnT = 0.6; shake = 0; flash = 0; lastBeep = -9;
  active = null;
  airportIdx = Math.max(0, AIRPORT_ORDER.indexOf(cfg.apt));
  updateHud();
}

function startGame() {
  SFX.init();
  SFX.resume();
  SFX.click();
  reset();
  state = 'play';
  $('start').classList.add('hidden');
  $('over').classList.add('hidden');
  $('paused').classList.add('hidden');
  $('stagec').classList.add('hidden');
}

function togglePause() {
  if (state === 'play') {
    state = 'paused';
    $('paused').classList.remove('hidden');
    SFX.setEngine(0);
  } else if (state === 'paused') {
    state = 'play';
    $('paused').classList.add('hidden');
  }
}

function goToMenu() {
  // abandoning a live run still records it on the local leaderboard
  if (state === 'play' || state === 'paused' || state === 'stagec') {
    if (score > best) { best = score; localStorage.setItem('atc-best', best); }
    saveScoreToLB();
  }
  state = 'menu';
  planes = []; popups = []; explosions = []; tcasPairs = [];
  active = null; shake = 0; flash = 0;
  SFX.setEngine(0);
  SFX.click();
  $('over').classList.add('hidden');
  $('paused').classList.add('hidden');
  $('stagec').classList.add('hidden');
  $('start').classList.remove('hidden');
  renderLB($('lbMenu'));
  updateHud();
}

$('startBtn').addEventListener('click', startGame);
$('restartBtn').addEventListener('click', () => {
  // regenerate a random field for variety on restart
  if (cfg.apt === 'RND') setAirport('RND');
  startGame();
});
$('nextBtn').addEventListener('click', nextStage);
$('paused').addEventListener('click', togglePause);
$('menuBtnOver').addEventListener('click', goToMenu);
$('menuBtnStage').addEventListener('click', goToMenu);
$('menuBtnPause').addEventListener('click', e => {
  e.stopPropagation(); // don't let the paused-overlay resume handler fire
  goToMenu();
});
$('pauseBtn').addEventListener('click', () => {
  SFX.click();
  togglePause();
});
$('soundBtn').addEventListener('click', () => {
  SFX.init();
  SFX.setMuted(!SFX.muted);
  $('soundBtn').textContent = SFX.muted ? '🔇' : '🔊';
  if (!SFX.muted) SFX.click();
});
$('tcasBtn').addEventListener('click', () => {
  cfg.tcas = !cfg.tcas;
  $('tcasBtn').classList.toggle('on', cfg.tcas);
  saveCfg();
  SFX.click();
});
$('speedBtn').addEventListener('click', () => {
  timeScale = timeScale === 1 ? 2 : 1;
  $('speedBtn').textContent = timeScale + '×';
  $('speedBtn').classList.toggle('on', timeScale !== 1);
  SFX.click();
});

window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  if (e.key === 'm' || e.key === 'M') $('soundBtn').click();
  if (e.key === 't' || e.key === 'T') $('tcasBtn').click();
  if (e.key === 'f' || e.key === 'F') $('speedBtn').click();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play') togglePause();
});

/* ---------------- boot ---------------- */

airport = instantiateAirport(cfg.apt);

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.ceil(W * DPR);
  canvas.height = Math.ceil(H * DPR);
  layoutAirport();
  renderField();
  if (!clouds.length) makeClouds();
}
window.addEventListener('resize', resize);
resize();

// reflect saved config in the menu
reflectApt(cfg.apt);
reflectMode(cfg.mode);
reflectTarget(cfg.target);
reflectPractice(cfg.practice ? 'on' : 'off');
renderLB($('lbMenu'));
$('aptName').textContent = airport.name + (cfg.apt === 'RND' ? ' (randomized)' : '');
$('targetSel').classList.toggle('hidden', cfg.mode !== 'stages');
$('tcasBtn').classList.toggle('on', cfg.tcas);
bestHudEl.textContent = best;
updateHud();

let lastTs = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (state === 'play') {
    update(dt * timeScale);
    updateFx(dt * timeScale);
  } else if (state === 'crash') {
    updateFx(dt);
    crashT -= dt;
    if (crashT <= 0) gameOver();
  } else {
    updateFx(dt);
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------------- headless / test hooks ---------------- */
// ?play auto-starts · ?ff=N fast-forwards N seconds · &autoland bot-lands
// &apt=JFK forces an airport · &stages=50 forces stage mode · &debug → title
const _qs = new URLSearchParams(location.search);
if (_qs.has('apt')) setAirport(_qs.get('apt'));
if (_qs.has('stages')) {
  cfg.mode = 'stages';
  cfg.target = +_qs.get('stages') || 200;
}
if (_qs.has('practice')) cfg.practice = true;
if (_qs.has('play')) startGame();
if (_qs.has('ff')) {
  const secs = +_qs.get('ff') || 10;
  const autoland = _qs.has('autoland');
  for (let i = 0; i < secs * 60; i++) {
    if (state === 'play') {
      update(1 / 60);
      updateFx(1 / 60);
      if (autoland && i % 60 === 0) {
        for (const p of planes) {
          if (p.landing || p.done) continue;
          const rw = runways.find(r => r.type === p.type);
          p.path = [{ x: rw.x, y: rw.y }];
          tryLand(p);
        }
      }
    } else if (state === 'crash') { updateFx(1 / 60); crashT -= 1 / 60; if (crashT <= 0) gameOver(); }
  }
}
if (_qs.has('debug')) {
  setInterval(() => {
    document.title = `s=${state} t=${elapsed.toFixed(1)} n=${planes.length} sc=${score} apt=${airport.code} stg=${stage} ld=${stageLanded}`;
  }, 250);
}
