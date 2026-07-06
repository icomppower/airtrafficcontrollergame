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

const AIRPORT_ORDER = ['SFO', 'JFK', 'LHR', 'CDG', 'DEN', 'RND'];

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
  DEN: {
    code: 'DEN', name: 'Denver International', water: null,
    // six runways radiating from a shared hub, pinwheel-style — a stylized
    // visual reference, not a literal copy of the real airport's layout
    strips: [
      { type: 'jet',  x: 0.650, y: 0.480, angle: 0,               lenF: 0.42, num: '16R' },
      { type: 'prop', x: 0.558, y: 0.580, angle: Math.PI / 3,     lenF: 0.30, num: '8' },
      { type: 'jet',  x: 0.425, y: 0.610, angle: 2 * Math.PI / 3, lenF: 0.42, num: '34L' },
      { type: 'prop', x: 0.385, y: 0.480, angle: Math.PI,         lenF: 0.30, num: '16L' },
      { type: 'jet',  x: 0.425, y: 0.350, angle: 4 * Math.PI / 3, lenF: 0.42, num: '26' },
      { type: 'prop', x: 0.558, y: 0.380, angle: 5 * Math.PI / 3, lenF: 0.30, num: '34R' },
    ],
    pad: { x: 0.50, y: 0.85 },
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
  return { key, ...def, wind: { ang: rand(0, TAU), spd: rand(3, 9) } };
}

/* ---------------- state ---------------- */

let W = 0, H = 0, DPR = 1;
let PLAY = { l: 0, r: 0, t: 0, b: 0 };
let state = 'menu'; // menu | play | paused | crash | over | stagec
let planes = [], popups = [], explosions = [], clouds = [], runways = [];
let tcasPairs = [];
let score = 0, stageLanded = 0, totalLanded = 0, elapsed = 0, spawnT = 1.0, crashT = 0;
let rushT = 45, burstLeft = 0, burstT = 0, banner = null;
let activeScene = 'day', rain = [];
let emergT = 40, comboN = 0, lastLandT = -99;
let best = +(localStorage.getItem('atc-best') || 0);
let active = null;
let shake = 0, flash = 0, lastBeep = -9;
let field = null;
let closureT = 60, closedRw = null, closuresThisRun = 0, lastClosedRw = null;
let closureCooldown = new WeakMap();
let toastShown = new Set(), toastMsg = null;

// config (persisted)
let cfg = {
  apt: 'SFO', mode: 'endless', target: 200, tcas: true, practice: false,
  pace: 'normal', cb: false, bigTouch: false,
  scene: 'day', emerg: true, assist: false, combo: true, glide: false, closures: false,
};
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

// one-shot in-run explanation the first time an optional toggled-on system
// actually triggers, instead of an upfront wall of help text
function firstTimeToast(key, text) {
  if (toastShown.has(key)) return;
  toastShown.add(key);
  toastMsg = { text, age: 0 };
}

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
  for (const rw of runways) {
    const dirx = Math.cos(rw.angle), diry = Math.sin(rw.angle);
    const corr = rw.len * 1.3; // a short final-approach stretch, not most of the map
    const buildCorridor = sign => {
      const tx = rw.x + dirx * sign * rw.len / 2, ty = rw.y + diry * sign * rw.len / 2;
      const ox = dirx * sign, oy = diry * sign; // outbound unit vector, away from the runway
      const interceptAlong = corr * 0.4; // distance from threshold where the turn rolls out onto centerline
      const ix = tx + ox * interceptAlong, iy = ty + oy * interceptAlong;
      // ILS fix: same distance out from the threshold as the old straight
      // corridor's far point, just rotated to one side — requires a real
      // turn onto final instead of a straight run-in, but stays just as
      // close to the airport as the corridor it replaces
      const theta = 0.85; // ~49 degrees
      const rx = ox * Math.cos(theta) - oy * Math.sin(theta);
      const ry = ox * Math.sin(theta) + oy * Math.cos(theta);
      const fixDist = corr * 0.8;
      const fix = { x: tx + rx * fixDist, y: ty + ry * fixDist };
      const bend = { x: tx + rx * fixDist * 0.55, y: ty + ry * fixDist * 0.55 };
      // sampled points along fix -> curve -> intercept -> threshold, used so
      // a dragged path can capture by touching ANY point along the visible
      // glide path, not just the fix marker itself
      const TURN_SAMPLES = 9;
      const capturePts = [fix];
      for (let i = 1; i <= TURN_SAMPLES; i++) {
        const t = i / TURN_SAMPLES, mt = 1 - t;
        capturePts.push({
          x: mt * mt * fix.x + 2 * mt * t * bend.x + t * t * ix,
          y: mt * mt * fix.y + 2 * mt * t * bend.y + t * t * iy,
        });
      }
      capturePts.push({ x: tx, y: ty });
      return { sign, tx, ty, ix, iy, fix, bend, capturePts };
    };
    // ILS only serves one direction per runway. Pick whichever of the two
    // ends puts its fix furthest inside the screen — edge-of-map runways
    // can't always fit both fully on screen, so this is a screen-fit
    // choice, not tied to which end the runway number is painted on.
    const margin = 20;
    const outOfBounds = c => Math.max(0, margin - c.fix.x, c.fix.x - (W - margin), margin - c.fix.y, c.fix.y - (H - margin));
    const candidates = [buildCorridor(-1), buildCorridor(1)];
    rw.corridors = [candidates.sort((a, b) => outOfBounds(a) - outOfBounds(b))[0]];
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

function resolveScene() {
  activeScene = cfg.scene === 'random'
    ? ['day', 'night', 'rain'][Math.random() * 3 | 0]
    : cfg.scene;
  makeRain();
  renderField();
}

function makeRain() {
  rain = [];
  if (activeScene !== 'rain') return;
  for (let i = 0; i < 130; i++) {
    rain.push({ x: rand(-40, W + 40), y: rand(-20, H), len: rand(9, 18), spd: rand(380, 560) });
  }
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

  // scene tinting on the cached ground layer
  if (activeScene === 'night') {
    g.fillStyle = 'rgba(13, 17, 44, 0.55)';
    g.fillRect(0, 0, W, H);
    drawNightLights(g);
  } else if (activeScene === 'rain') {
    g.fillStyle = 'rgba(70, 82, 104, 0.22)';
    g.fillRect(0, 0, W, H);
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

function drawNightLights(g) {
  for (const rw of runways) {
    if (rw.kind === 'strip') {
      g.save();
      g.translate(rw.x, rw.y);
      g.rotate(rw.angle);
      // edge lights down both sides
      g.fillStyle = '#ffe9a8';
      for (let x = -rw.len / 2 + 10; x <= rw.len / 2 - 10; x += 26) {
        for (const side of [-1, 1]) {
          g.beginPath();
          g.arc(x, side * (rw.wid / 2 + 2.5), 1.7, 0, TAU);
          g.fill();
        }
      }
      // green threshold lights at both ends
      g.fillStyle = '#5aff7e';
      for (const end of [-1, 1]) {
        for (let i = -2; i <= 2; i++) {
          g.beginPath();
          g.arc(end * (rw.len / 2 + 3), i * (rw.wid / 5), 1.7, 0, TAU);
          g.fill();
        }
      }
      g.restore();
    } else {
      g.fillStyle = '#8fd4ff';
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        g.beginPath();
        g.arc(rw.x + Math.cos(a) * (rw.r + 4), rw.y + Math.sin(a) * (rw.r + 4), 1.8, 0, TAU);
        g.fill();
      }
    }
  }
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
  if (cfg.cb) drawTypeBadge(g, rw.type, -L / 2 + 60, 0, 7, 0.85);
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
  if (cfg.cb) drawTypeBadge(g, 'heli', rw.x, rw.y - rw.r * 0.58, 4.5, 0.85);
}

/* ---------------- aircraft ---------------- */

function spawnPlane() {
  const r = Math.random();
  const type = r < 0.45 ? 'jet' : r < 0.8 ? 'prop' : 'heli';
  const m = 46;
  const side = Math.random() * 4 | 0;
  const vRange = () => [PLAY.t + (PLAY.b - PLAY.t) * 0.12, PLAY.t + (PLAY.b - PLAY.t) * 0.88];
  const hRange = () => [PLAY.l + (PLAY.r - PLAY.l) * 0.12, PLAY.l + (PLAY.r - PLAY.l) * 0.88];
  let x, y;
  if (side === 0) { x = PLAY.l - m; y = rand(...vRange()); }
  else if (side === 1) { x = PLAY.r + m; y = rand(...vRange()); }
  else if (side === 2) { x = rand(...hRange()); y = PLAY.t - m; }
  else { x = rand(...hRange()); y = PLAY.b + m; }

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
    scale: 1, alert: null, done: false, hold: false,
    landing: null, landProgress: 0, hover: 0, age: 0,
  });
  SFX.blip();
}

function spawnInterval() {
  let iv = 5.0 - totalLanded * 0.09 - elapsed * 0.004 - (stage - 1) * 0.4;
  if (cfg.pace === 'relaxed') return Math.max(2.2, iv * 1.5 + 0.6);
  return Math.max(1.15, iv);
}

function effSpeed(p) {
  let sp = p.speed * (p.spdMod || 1) * (cfg.pace === 'relaxed' ? 0.8 : 1);
  if (p.assist > 0) sp *= 0.5; // TCAS auto-avoid resolution
  if (p.landing && p.landing.kind === 'strip' && p.path.length <= 1) {
    sp *= 1 - 0.45 * p.landProgress;
  }
  return sp;
}

function tryLand(p) {
  const end = p.path.length ? p.path[p.path.length - 1] : { x: p.x, y: p.y };
  for (const rw of runways) {
    if (rw.type !== p.type || rw.closed) continue;
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

// generous "near enough" version of tryLand's hit test — used only at
// drag-release to forgive a slightly-missed landing attempt
function findSnapTarget(p, pos) {
  let best = null, bestD = Infinity;
  for (const rw of runways) {
    if (rw.type !== p.type || rw.closed) continue;
    if (rw.kind === 'pad') {
      const d = Math.hypot(pos.x - rw.x, pos.y - rw.y);
      if (d < rw.r + 12 + 55 && d < bestD) { bestD = d; best = { x: rw.x, y: rw.y }; }
    } else {
      const dx = pos.x - rw.x, dy = pos.y - rw.y;
      const ca = Math.cos(-rw.angle), sa = Math.sin(-rw.angle);
      const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
      if (Math.abs(lx) < rw.len / 2 + 8 + 40 && Math.abs(ly) < rw.wid / 2 + 12 + 30) {
        const d = Math.hypot(lx, ly);
        if (d < bestD) {
          const clx = clamp(lx, -(rw.len / 2 + 7), rw.len / 2 + 7);
          const cly = clamp(ly, -(rw.wid / 2 + 11), rw.wid / 2 + 11);
          bestD = d;
          best = {
            x: rw.x + clx * Math.cos(rw.angle) - cly * Math.sin(rw.angle),
            y: rw.y + clx * Math.sin(rw.angle) + cly * Math.cos(rw.angle),
          };
        }
      }
    }
  }
  return best;
}

// released near another same-type aircraft that's already on final glide —
// assign a follow relationship instead of requiring a full manual path
function findFollowTarget(p, pos) {
  let best = null, bestD = 50;
  for (const other of planes) {
    if (other === p || other.done || other.type !== p.type) continue;
    if (!other.landing || other.landing.kind !== 'strip') continue;
    const d = dist(pos, other);
    if (d < bestD) { bestD = d; best = other; }
  }
  return best;
}

// distance from point (px,py) to segment (ax,ay)-(bx,by)
function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// ILS-style capture: touching ANY point along the visible glide path (fix
// marker, curve, or final band) auto-continues the aircraft along the rest
// of that same path into landing — a drawing shortcut only, no collision
// immunity beyond normal landing rules (see checkConflicts / the
// path.length <= 1 dist checks)
const GLIDE_TOL = 20;
const GLIDE_HALFW = 15;
function tryGlideCapture(p) {
  const pos = p.path[p.path.length - 1];
  if (!pos) return false;
  for (const rw of runways) {
    if (rw.kind !== 'strip' || rw.type !== p.type || rw.closed) continue;
    for (const c of rw.corridors) {
      const pts = c.capturePts;
      let hitAt = -1;
      for (let i = 0; i < pts.length - 1; i++) {
        if (pointSegDist(pos.x, pos.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < GLIDE_TOL) { hitAt = i; break; }
      }
      if (hitAt < 0) continue;
      const t1 = {
        x: rw.x - Math.cos(rw.angle) * c.sign * rw.len * 0.38,
        y: rw.y - Math.sin(rw.angle) * c.sign * rw.len * 0.38,
      };
      // continue from wherever along the path it was touched, not from the fix
      const remainder = pts.slice(hitAt + 1);
      p.path.push(...remainder, t1);
      p.landing = { rw, kind: 'strip', t0: { x: c.tx, y: c.ty }, t1, len: Math.hypot(t1.x - c.tx, t1.y - c.ty) };
      popups.push({ x: pos.x, y: pos.y - 22, text: 'ILS PATH CAPTURED ✓', age: 0 });
      SFX.confirm();
      SFX.radioCall();
      firstTimeToast('glide', '🛬 ILS path captured — touch the glide path anywhere to auto-continue onto final.');
      return true;
    }
  }
  return false;
}

// wind-weighted runway closures — an opt-in extra layer, same pattern as the
// fuel/TCAS/combo toggles. Reuses the airport's existing wind data instead of
// building a live weather system: a strip is more likely to be picked the
// stronger its current crosswind component is.
const CLOSURE_CAP = 3;
function maybeCloseRunway() {
  const strips = runways.filter(r => r.kind === 'strip');
  const eligible = strips.filter(rw => {
    if ((closureCooldown.get(rw) || 0) > elapsed) return false;
    const sameTypeOpen = strips.filter(r => r.type === rw.type && r !== rw && !r.closed).length;
    return sameTypeOpen > 0; // never close the last open strip for a type
  });
  if (!eligible.length) return;
  const weights = eligible.map(rw => {
    const cross = Math.abs(Math.sin(airport.wind.ang - rw.angle)) * airport.wind.spd;
    return Math.max(0.05, cross) * (rw === lastClosedRw ? 0.25 : 1);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total, idx = 0;
  for (; idx < weights.length - 1; idx++) { r -= weights[idx]; if (r <= 0) break; }
  const rw = eligible[idx];
  rw.closed = true;
  closedRw = rw;
  rw.closeTimer = rand(20, 45) * (cfg.pace === 'relaxed' ? 1.3 : 1);
  closuresThisRun++;
  lastClosedRw = rw;
  banner = { text: `🚧 RUNWAY ${rw.num} CLOSED`, age: 0 };
  SFX.rush();
  SFX.radioCall();
  firstTimeToast('closures', '🚧 A runway just closed — route traffic to another one until it reopens.');
}

function reopenRunway() {
  if (!closedRw) return;
  closureCooldown.set(closedRw, elapsed + rand(45, 80));
  SFX.radioCall();
  closedRw.closed = false;
  popups.push({ x: closedRw.x, y: closedRw.y - 10, text: 'RUNWAY REOPENED', age: 0 });
  closedRw = null;
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
  let pts = PTS[p.type];
  let label = '';
  if (p.emergency) {
    pts *= 2;
    label = ' ⛽×2';
  }
  if (cfg.combo) {
    comboN = (elapsed - lastLandT < 6) ? comboN + 1 : 1;
    lastLandT = elapsed;
    const mult = Math.min(comboN, 5);
    if (mult > 1) {
      pts *= mult;
      label += ` 🔥×${mult}`;
      if (mult >= 3) banner = { text: `COMBO ×${mult}!`, age: 0 };
      firstTimeToast('combo', '🔥 Land aircraft within 6 seconds of each other to build a score multiplier.');
    }
  }
  score += pts;
  stageLanded++;
  totalLanded++;
  popups.push({ x: p.x, y: p.y - 18, text: '+' + pts + label, age: 0, color: COLORS[p.type] });
  SFX.chime();
  updateHud();
  if (cfg.mode === 'stages' && stageLanded >= cfg.target && state === 'play') stageClear();
}

// chases a point behind the lead aircraft; hands off to a normal strip
// landing (same t0/t1 as the lead) once close enough and the lead has
// started its final glide. Returns true while still chasing (movement
// already applied — skip the rest of updatePlane this frame).
const FOLLOW_GAP = 62;
function updateFollow(p, dt) {
  const lead = p.followTarget;
  if (!lead || lead.done || !planes.includes(lead)) { p.followTarget = null; return false; }
  if (lead.landing && lead.landing.kind === 'strip' && dist(p, lead) < FOLLOW_GAP * 1.4) {
    p.path = [{ x: lead.landing.t0.x, y: lead.landing.t0.y }, lead.landing.t1];
    p.landing = { rw: lead.landing.rw, kind: 'strip', t0: lead.landing.t0, t1: lead.landing.t1, len: lead.landing.len };
    p.followTarget = null;
    popups.push({ x: p.x, y: p.y - 22, text: 'SEQUENCED → LANDING', age: 0 });
    return false;
  }
  const tx = lead.x - Math.cos(lead.dispHeading) * FOLLOW_GAP;
  const ty = lead.y - Math.sin(lead.dispHeading) * FOLLOW_GAP;
  p.heading = Math.atan2(ty - p.y, tx - p.x);
  const sp = effSpeed(p);
  p.x += Math.cos(p.heading) * sp * dt;
  p.y += Math.sin(p.heading) * sp * dt;
  p.dispHeading = lerpAngle(p.dispHeading, p.heading, Math.min(1, dt * 8));
  p.trailT += dt;
  if (p.trailT > 0.06) { p.trailT = 0; p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 10) p.trail.shift(); }
  return true;
}

function updatePlane(p, dt) {
  p.age += dt;
  if (p.done) return;

  if (p.assist > 0) p.assist -= dt;
  else p._assistOn = false;

  if (p.emergency) {
    p.emergency.t -= dt;
    if (p.emergency.t <= 0) {
      // fuel exhausted — the aircraft goes down
      p.done = true;
      const parts = [];
      for (let i = 0; i < 22; i++) {
        const ang = rand(0, TAU), v = rand(30, 170);
        parts.push({ x: p.x, y: p.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: rand(2, 5), hue: rand(12, 45) });
      }
      explosions.push({ x: p.x, y: p.y, age: 0, parts });
      SFX.crash();
      shake = 0.6;
      flash = 0.5;
      comboN = 0;
      if (cfg.practice) {
        score = Math.max(0, score - 300);
        popups.push({ x: p.x, y: p.y - 34, text: '-300 FUEL OUT', age: 0 });
        updateHud();
      } else {
        state = 'crash';
        crashT = 1.5;
      }
      return;
    }
  }

  if (p.followTarget && updateFollow(p, dt)) return;

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
    if (p.hold) p.heading += 1.15 * dt; // circle in the holding pattern
    p.x += Math.cos(p.heading) * sp * dt;
    p.y += Math.sin(p.heading) * sp * dt;
    const m = 50;
    if (p.x < -m) p.x = W + m; else if (p.x > W + m) p.x = -m;
    if (p.y < -m) p.y = H + m; else if (p.y > H + m) p.y = -m;
  }

  // wind drift — planes crab back onto their drawn paths, free flyers get pushed
  if (!p.landing && airport.wind) {
    p.x += Math.cos(airport.wind.ang) * airport.wind.spd * dt;
    p.y += Math.sin(airport.wind.ang) * airport.wind.spd * dt;
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
        // relaxed pace gives earlier, more generous warnings
        const raT = cfg.pace === 'relaxed' ? 12 : 9;
        const taT = cfg.pace === 'relaxed' ? 18 : 14;
        const c = cpa(a, b);
        if (c.d < 34 && c.t < raT) { level = 'ra'; px = c.px; py = c.py; }
        else if (!level && c.d < WARN_D && c.t < taT) { level = 'ta'; px = c.px; py = c.py; }
      }
      if (level) {
        tcasPairs.push({ a, b, level, px, py });
        raiseAlert(a, level);
        raiseAlert(b, level);
        if (level === 'ra') {
          anyRa = true;
          firstTimeToast('tcas', '⚠ Red ring = collision course — reroute or slow one aircraft.');
          if (cfg.assist) {
            // auto-avoid: TCAS slows the faster aircraft of the pair
            const slow = effSpeed(a) >= effSpeed(b) ? a : b;
            slow.assist = 0.8;
            if (!slow._assistOn) {
              slow._assistOn = true;
              popups.push({ x: slow.x, y: slow.y - 24, text: 'TCAS ⬇ SLOW', age: 0.3 });
              firstTimeToast('assist', '🤖 Auto-avoid is slowing an aircraft to break up the conflict.');
            }
          }
        } else anyTa = true;
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
  comboN = 0;
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
  markCleared(airport.key);
  const nextKey = AIRPORT_ORDER[nextUnlockedIdx(airportIdx)];
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
  airportIdx = nextUnlockedIdx(airportIdx);
  airport = instantiateAirport(AIRPORT_ORDER[airportIdx]);
  layoutAirport();
  resolveScene();
  planes = []; popups = []; explosions = [];
  active = null;
  stageLanded = 0;
  spawnT = 0.8;
  lastBeep = -9;
  rushT = rand(35, 60); burstLeft = 0; banner = null;
  emergT = rand(30, 55); comboN = 0; lastLandT = -99;
  closedRw = null; // runways array was just rebuilt; drop the stale reference
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
  // rush hour — scripted traffic burst
  rushT -= dt;
  if (rushT <= 0) {
    rushT = rand(45, 75) * (cfg.pace === 'relaxed' ? 1.5 : 1);
    burstLeft = 3 + (Math.random() < 0.5 ? 1 : 0);
    burstT = 0;
    banner = { text: 'RUSH HOUR!', age: 0 };
    SFX.rush();
    SFX.radioCall();
    firstTimeToast('rush', '🚨 Rush hour — several aircraft incoming at once. Stay ahead of the queue.');
  }
  if (burstLeft > 0) {
    burstT -= dt;
    if (burstT <= 0) {
      spawnPlane();
      burstLeft--;
      burstT = 0.55;
    }
  }
  // low-fuel emergencies
  if (cfg.emerg) {
    emergT -= dt;
    if (emergT <= 0) {
      emergT = rand(50, 85) * (cfg.pace === 'relaxed' ? 1.4 : 1);
      const candidates = planes.filter(p =>
        !p.done && !p.landing && !p.emergency &&
        p.x > 0 && p.x < W && p.y > 0 && p.y < H);
      if (candidates.length) {
        const p = candidates[Math.random() * candidates.length | 0];
        const fuel = cfg.pace === 'relaxed' ? 35 : 25;
        p.emergency = { t: fuel, max: fuel };
        popups.push({ x: p.x, y: p.y - 26, text: '⛽ LOW FUEL!', age: 0 });
        banner = { text: '⛽ EMERGENCY — LAND IT NOW!', age: 0 };
        SFX.emergency();
        firstTimeToast('emerg', '⛽ Low fuel — land this aircraft fast for ×2 points before time runs out.');
      }
    }
  }
  // runway closures — rare, spaced-out, capped per run
  if (cfg.closures) {
    closureT -= dt;
    if (closureT <= 0) {
      closureT = rand(70, 110) * (cfg.pace === 'relaxed' ? 1.3 : 1);
      if (!closedRw && closuresThisRun < CLOSURE_CAP) maybeCloseRunway();
    }
  }
  if (closedRw) {
    closedRw.closeTimer -= dt;
    if (closedRw.closeTimer <= 0) reopenRunway();
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
  for (const d of rain) {
    d.y += d.spd * dt;
    d.x += d.spd * 0.25 * dt;
    if (d.y > H + 20) { d.y = -20; d.x = rand(-40, W + 40); }
  }
  if (banner) {
    banner.age += dt;
    if (banner.age > 2.6) banner = null;
  }
  if (toastMsg) {
    toastMsg.age += dt;
    if (toastMsg.age > 4.2) toastMsg = null;
  }
  shake = Math.max(0, shake - dt);
  flash = Math.max(0, flash - dt);
}

/* ---------------- rendering ---------------- */

// colorblind-safe marker: jet = triangle, prop = square, heli = circle
function drawTypeBadge(g, type, x, y, s, alpha) {
  g.save();
  g.translate(x, y);
  g.globalAlpha = alpha == null ? 0.95 : alpha;
  g.fillStyle = '#fff';
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 1.2;
  g.beginPath();
  if (type === 'jet') {
    g.moveTo(0, -s); g.lineTo(s * 0.95, s * 0.75); g.lineTo(-s * 0.95, s * 0.75);
    g.closePath();
  } else if (type === 'prop') {
    g.rect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6);
  } else {
    g.arc(0, 0, s * 0.85, 0, TAU);
  }
  g.fill();
  g.stroke();
  g.restore();
}

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
  if (!asShadow && activeScene === 'night') {
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
    ctx.restore();
  }
  drawShape(ctx, p.type, p.age, asShadow ? '#000' : null);
  if (!asShadow) drawRotors(ctx, p);
  if (!asShadow && activeScene === 'night' && (p.age % 1) < 0.55) {
    ctx.fillStyle = '#ff5050';
    ctx.beginPath(); ctx.arc(-7, -13, 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4dff6a';
    ctx.beginPath(); ctx.arc(-7, 13, 1.8, 0, TAU); ctx.fill();
  }
  ctx.restore();

  if (!asShadow && cfg.cb && !p.done) {
    drawTypeBadge(ctx, p.type, p.x, p.y, 4.5 * p.scale);
  }

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

function drawEmergency(p) {
  const frac = clamp(p.emergency.t / p.emergency.max, 0, 1);
  const urgent = frac < 0.35;
  const pulse = 1 + 0.1 * Math.sin(elapsed * (urgent ? 16 : 9));
  ctx.save();
  // fuel arc — drains clockwise as time runs out
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = urgent ? '#ff3b28' : '#ffb02e';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 26 * pulse, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 26 * pulse, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = (elapsed % 0.8) < 0.5 ? 1 : 0.35;
  ctx.font = '900 15px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⛽', p.x, p.y - 38);
  ctx.restore();
}

function drawAlert(p) {
  if (p.emergency) return; // the fuel ring takes visual priority
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
  const cx = clamp(p.x, PLAY.l + m, PLAY.r - m), cy = clamp(p.y, PLAY.t + m, PLAY.b - m);
  const ang = Math.atan2(p.y - cy, p.x - cx);
  const pulse = 1 + 0.12 * Math.sin(elapsed * 8);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = COLORS[p.type];
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill(); ctx.stroke();
  if (cfg.cb) {
    ctx.restore();
    drawTypeBadge(ctx, p.type, cx, cy, 5);
    return;
  }
  ctx.rotate(ang);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7.5, 0); ctx.lineTo(1.5, -4); ctx.lineTo(1.5, 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawHoldRing(p) {
  const r = effSpeed(p) / 1.15;
  const cx = p.x + Math.cos(p.heading + Math.PI / 2) * r;
  const cy = p.y + Math.sin(p.heading + Math.PI / 2) * r;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.8;
  ctx.setLineDash([5, 8]);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// draws the ILS fix marker (the actual capture target, off to one side),
// a dashed hint curve showing the turn onto final, and the short final
// approach band from the turn's rollout point to the threshold
function drawGlideCorridors() {
  if (!cfg.glide) return;
  for (const rw of runways) {
    if (rw.kind !== 'strip') continue;
    for (const c of rw.corridors) {
      const dx = c.tx - c.ix, dy = c.ty - c.iy;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      ctx.save();
      // the final-approach band — shows the true capture width of the last leg
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = rw.color;
      ctx.beginPath();
      ctx.moveTo(c.ix + nx * GLIDE_HALFW, c.iy + ny * GLIDE_HALFW);
      ctx.lineTo(c.tx + nx * GLIDE_HALFW, c.ty + ny * GLIDE_HALFW);
      ctx.lineTo(c.tx - nx * GLIDE_HALFW, c.ty - ny * GLIDE_HALFW);
      ctx.lineTo(c.ix - nx * GLIDE_HALFW, c.iy - ny * GLIDE_HALFW);
      ctx.closePath();
      ctx.fill();
      // bright centerline
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = rw.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(c.ix, c.iy);
      ctx.lineTo(c.tx, c.ty);
      ctx.stroke();
      ctx.setLineDash([]);
      // inbound chevron pointing toward the runway threshold
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = rw.color;
      ctx.save();
      ctx.translate((c.ix + c.tx) / 2, (c.iy + c.ty) / 2);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.beginPath();
      ctx.moveTo(7, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // dashed hint curve — shows the turn the aircraft will fly from the
      // fix onto final; NOT a capture zone, just a preview of the maneuver
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = rw.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(c.fix.x, c.fix.y);
      ctx.quadraticCurveTo(c.bend.x, c.bend.y, c.ix, c.iy);
      ctx.stroke();
      ctx.setLineDash([]);
      // the ILS fix marker — a diamond; the whole path (curve + band) is
      // touchable, not just this point, so no separate capture ring is drawn
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = rw.color;
      const r = 7;
      ctx.beginPath();
      ctx.moveTo(c.fix.x, c.fix.y - r);
      ctx.lineTo(c.fix.x + r, c.fix.y);
      ctx.lineTo(c.fix.x, c.fix.y + r);
      ctx.lineTo(c.fix.x - r, c.fix.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

// a small tower + directional arrow beside the threshold, so it's visible at
// a glance which single direction each runway's ILS actually serves
function drawILSTowers() {
  if (!cfg.glide) return;
  for (const rw of runways) {
    if (rw.kind !== 'strip' || !rw.corridors.length) continue;
    const c = rw.corridors[0];
    const dx = c.tx - c.ix, dy = c.ty - c.iy;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    // offset beside the runway edge, level with the threshold it serves
    const tox = c.tx + nx * (rw.wid / 2 + 16) - ux * 10;
    const toy = c.ty + ny * (rw.wid / 2 + 16) - uy * 10;
    ctx.save();
    ctx.translate(tox, toy);
    ctx.fillStyle = '#2b2f36';
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(5, 8); ctx.lineTo(-5, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4);
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.fillStyle = rw.color;
    ctx.beginPath();
    ctx.arc(0, -11, 3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    // arrow along the runway centerline direction, pointing at the served threshold
    ctx.rotate(Math.atan2(uy, ux));
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(5, 5); ctx.lineTo(5, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawClosures() {
  for (const rw of runways) {
    if (rw.kind !== 'strip' || !rw.closed) continue;
    ctx.save();
    ctx.translate(rw.x, rw.y);
    ctx.rotate(rw.angle);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = 'rgba(180, 20, 10, 0.4)';
    ctx.fillRect(-rw.len / 2, -rw.wid / 2, rw.len, rw.wid);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ff3b28';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-rw.len / 2 + 12, -rw.wid / 2 + 4); ctx.lineTo(rw.len / 2 - 12, rw.wid / 2 - 4);
    ctx.moveTo(rw.len / 2 - 12, -rw.wid / 2 + 4); ctx.lineTo(-rw.len / 2 + 12, rw.wid / 2 - 4);
    ctx.stroke();
    ctx.restore();
  }
}

function drawToast() {
  if (!toastMsg) return;
  const t = toastMsg.age / 4.2;
  const a = t < 0.12 ? t / 0.12 : t > 0.8 ? (1 - t) / 0.2 : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a) * 0.95;
  ctx.font = '700 15px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = H - 74;
  const w = Math.min(W - 40, ctx.measureText(toastMsg.text).width + 40);
  ctx.fillStyle = 'rgba(18,24,34,0.82)';
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, y - 20, w, 40, 20); ctx.fill(); }
  else { ctx.fillRect(W / 2 - w / 2, y - 20, w, 40); }
  ctx.fillStyle = '#fff';
  ctx.fillText(toastMsg.text, W / 2, y);
  ctx.restore();
}

function drawFollowLink(p) {
  const lead = p.followTarget;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(lead.x, lead.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawWindsock() {
  const w = airport.wind;
  if (!w) return;
  ctx.save();
  ctx.translate(W - 56, H - 64);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(18,24,34,0.6)';
  ctx.beginPath(); ctx.arc(0, 0, 21, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 21, 0, TAU); ctx.stroke();
  ctx.rotate(w.ang);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-10, 0); ctx.lineTo(9, 0);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(15, 0); ctx.lineTo(6, -5); ctx.lineTo(6, 5);
  ctx.closePath(); ctx.fill();
  ctx.rotate(-w.ang);
  ctx.font = '800 10px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(`WIND ${Math.round(w.spd * 2)} KT`, 0, 26);
  ctx.restore();
}

function drawBanner() {
  if (!banner) return;
  const t = banner.age / 2.6;
  const a = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.font = '900 36px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.fillStyle = '#ffd93c';
  const y = H * 0.2;
  ctx.strokeText(banner.text, W / 2, y);
  ctx.fillText(banner.text, W / 2, y);
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

function drawRain() {
  if (activeScene !== 'rain' || !rain.length) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(200, 220, 245, 0.4)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const d of rain) {
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + d.len * 0.25, d.y + d.len);
  }
  ctx.stroke();
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
    drawGlideCorridors();
    drawILSTowers();
    drawClosures();
    for (const p of planes) if (p.followTarget) drawFollowLink(p);
    for (const p of planes) drawPath(p);
    for (const p of planes) if (p.hold && !p.path.length && !p.landing) drawHoldRing(p);
    for (const p of planes) drawTrail(p);
    drawTcasPairs();
    for (const p of planes) drawPlane(p, true);
    for (const p of planes) drawPlane(p, false);
    for (const p of planes) if (p.alert) drawAlert(p);
    for (const p of planes) if (p.emergency && !p.done) drawEmergency(p);
    if (active) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(active.x, active.y, 26, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (active && active._snapHint) {
      const s = active._snapHint;
      const pulse = 1 + 0.15 * Math.sin(elapsed * 10);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = COLORS[active.type];
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 6]);
      ctx.beginPath(); ctx.arc(s.x, s.y, 16 * pulse, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    for (const p of planes) drawEdgeMarker(p);
    for (const ex of explosions) drawExplosion(ex);
    for (const pop of popups) drawPopup(pop);
  }

  drawClouds();
  drawRain();
  drawWindsock();
  if (inPlay) { drawBanner(); drawToast(); }

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

// a landing plane can still be waved off while it's early in the approach
function canGoAround(p) {
  if (!p.landing) return false;
  if (p.landing.kind === 'strip') return p.path.length > 1 || p.landProgress <= 0.25;
  return p.path.length > 0; // heli not hovering down yet
}

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  SFX.init();
  SFX.resume();
  if (state !== 'play') return;
  const pos = eventPos(e);
  const pickR = cfg.bigTouch ? 56 : PICK_D;
  let bestP = null, bestD = pickR;
  for (const p of planes) {
    if (p.done) continue;
    if (p.landing && !canGoAround(p)) continue;
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
    active.hold = false;
    active.followTarget = null; // a fresh manual drag cancels any auto-follow
    if (active.landing) {
      // go-around: abort the approach and take manual control again
      active.landing = null;
      active.landProgress = 0;
      active.scale = 1;
      popups.push({ x: active.x, y: active.y - 24, text: 'GO-AROUND', age: 0.3 });
      SFX.blip();
    }
  }
  if (active.landing) return; // captured a glide path corridor — riding the rails now
  const last = active.path[active.path.length - 1] || active;
  if (Math.hypot(pos.x - last.x, pos.y - last.y) > 7) {
    active.path.push(pos);
    if (cfg.glide) tryGlideCapture(active);
  }
  if (!active.landing) active._snapHint = findSnapTarget(active, pos);
});

function cycleSpeed(p) {
  p.spdMod = p.spdMod === 1 ? 0.65 : p.spdMod === 0.65 ? 1.35 : 1;
  const label = p.spdMod === 1 ? 'NORMAL' : p.spdMod > 1 ? 'FAST »' : '« SLOW';
  popups.push({ x: p.x, y: p.y - 24, text: label, age: 0.35 });
  SFX.click();
}

function toggleHold(p) {
  p.hold = !p.hold;
  if (p.hold) p.path = [];
  popups.push({ x: p.x, y: p.y - 24, text: p.hold ? 'HOLDING ⟳' : 'RESUME', age: 0.3 });
  SFX.confirm();
}

let lastTap = { p: null, t: 0 };

function endDrag() {
  if (!active) return;
  if (!active._moved) {
    // tap — restore the old route; single tap cycles speed, double-tap holds
    active.path = active._oldPath || [];
    if (!active.landing) {
      const now = performance.now() / 1000;
      if (lastTap.p === active && now - lastTap.t < 0.4) {
        active.spdMod = active._preTapSpd != null ? active._preTapSpd : active.spdMod;
        toggleHold(active);
        lastTap = { p: null, t: 0 };
      } else {
        active._preTapSpd = active.spdMod;
        cycleSpeed(active);
        lastTap = { p: active, t: now };
      }
    }
  } else if (active.landing) {
    // already captured a glide path corridor mid-drag
    SFX.confirm();
  } else if (tryLand(active)) {
    SFX.confirm();
  } else {
    const snap = findSnapTarget(active, active.path[active.path.length - 1] || active);
    if (snap) {
      if (active.path.length) active.path[active.path.length - 1] = { x: snap.x, y: snap.y };
      else active.path.push({ x: snap.x, y: snap.y });
      if (tryLand(active)) SFX.confirm();
    } else {
      const lead = findFollowTarget(active, active.path[active.path.length - 1] || active);
      if (lead) {
        active.followTarget = lead;
        popups.push({ x: active.x, y: active.y - 24, text: 'FOLLOWING ⟶', age: 0.3 });
        SFX.confirm();
        SFX.radioCall();
        firstTimeToast('follow', '🔗 Sequenced — it will auto-follow and land right behind the lead aircraft.');
      }
    }
  }
  active._oldPath = null;
  active._snapHint = null;
  active = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ---------------- menu config ---------------- */

/* airport unlocks — CDG and RANDOM open up after clearing SFO+JFK+LHR stages */

function loadCleared() {
  try { return new Set(JSON.parse(localStorage.getItem('atc-cleared') || '[]')); }
  catch (e) { return new Set(); }
}

function airportLocked(k) {
  if (k !== 'CDG' && k !== 'DEN' && k !== 'RND') return false;
  const c = loadCleared();
  return !['SFO', 'JFK', 'LHR'].every(a => c.has(a));
}

function refreshLocks() {
  for (const b of $('airportSel').querySelectorAll('.sel')) {
    const k = b.dataset.k;
    const locked = airportLocked(k);
    b.classList.toggle('locked', locked);
    b.textContent = (locked ? '🔒 ' : '') + (k === 'RND' ? '🎲 RANDOM' : k);
  }
}

// advances past any still-locked airport so stage progression can never
// hand the player CDG/RND before they've actually cleared SFO+JFK+LHR
function nextUnlockedIdx(fromIdx) {
  let idx = fromIdx;
  for (let i = 0; i < AIRPORT_ORDER.length; i++) {
    idx = (idx + 1) % AIRPORT_ORDER.length;
    if (!airportLocked(AIRPORT_ORDER[idx])) return idx;
  }
  return (fromIdx + 1) % AIRPORT_ORDER.length;
}

function markCleared(code) {
  const c = loadCleared();
  c.add(code);
  localStorage.setItem('atc-cleared', JSON.stringify([...c]));
  refreshLocks();
}

function bindSelector(rowId, attr, onPick) {
  const row = $(rowId);
  row.addEventListener('click', e => {
    const btn = e.target.closest('.sel');
    if (!btn) return;
    if (btn.classList.contains('locked')) {
      $('aptName').textContent = '🔒 Clear SFO, JFK & LHR in Stage mode to unlock';
      SFX.init();
      SFX.warn();
      return;
    }
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
const reflectPace = bindSelector('paceSel', 'pc', pc => {
  cfg.pace = pc;
  saveCfg();
});
const reflectScene = bindSelector('sceneSel', 'sc', sc => {
  cfg.scene = sc;
  saveCfg();
  resolveScene(); // live preview behind the menu
});

function bindToggle(id, key, onChange) {
  $(id).addEventListener('click', () => {
    cfg[key] = !cfg[key];
    $(id).classList.toggle('on', cfg[key]);
    saveCfg();
    SFX.init();
    SFX.click();
    if (onChange) onChange();
  });
}
bindToggle('emergBtn', 'emerg');
bindToggle('assistBtn', 'assist');
bindToggle('comboBtn', 'combo');
bindToggle('glideBtn', 'glide');
bindToggle('closuresBtn', 'closures');

bindToggle('cbBtn', 'cb', renderField); // runway markers live on the cached ground layer
bindToggle('touchBtn', 'bigTouch');

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
  rushT = rand(35, 60); burstLeft = 0; banner = null;
  emergT = rand(30, 55); comboN = 0; lastLandT = -99;
  closureT = rand(60, 90); closedRw = null; closuresThisRun = 0; lastClosedRw = null;
  toastShown = new Set(); toastMsg = null;
  active = null;
  airportIdx = Math.max(0, AIRPORT_ORDER.indexOf(cfg.apt));
  updateHud();
}

function startGame() {
  SFX.init();
  SFX.resume();
  SFX.click();
  reset();
  resolveScene();
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
  active = null; shake = 0; flash = 0; banner = null;
  SFX.setEngine(0);
  SFX.click();
  $('over').classList.add('hidden');
  $('paused').classList.add('hidden');
  $('stagec').classList.add('hidden');
  $('start').classList.remove('hidden');
  renderLB($('lbMenu'));
  updateHud();
}

function applyJustPlay() {
  Object.assign(cfg, {
    pace: 'relaxed', practice: true, tcas: true,
    emerg: false, assist: false, combo: false, closures: false,
    glide: true, bigTouch: true,
  });
  saveCfg();
  reflectPace(cfg.pace);
  reflectPractice(cfg.practice ? 'on' : 'off');
  $('tcasBtn').classList.toggle('on', cfg.tcas);
  $('emergBtn').classList.toggle('on', cfg.emerg);
  $('assistBtn').classList.toggle('on', cfg.assist);
  $('comboBtn').classList.toggle('on', cfg.combo);
  $('closuresBtn').classList.toggle('on', cfg.closures);
  $('glideBtn').classList.toggle('on', cfg.glide);
  $('touchBtn').classList.toggle('on', cfg.bigTouch);
  startGame();
}
$('justPlayBtn').addEventListener('click', applyJustPlay);
$('advToggle').addEventListener('click', () => {
  SFX.init();
  SFX.click();
  const panel = $('cfgPanel');
  panel.classList.toggle('hidden');
  $('advToggle').textContent = panel.classList.contains('hidden') ? '⚙ ADVANCED OPTIONS ▾' : '⚙ ADVANCED OPTIONS ▴';
});

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
const TIME_SCALES = [0.25, 0.5, 1, 2];
$('speedBtn').addEventListener('click', () => {
  const i = TIME_SCALES.indexOf(timeScale);
  timeScale = TIME_SCALES[(i + 1) % TIME_SCALES.length];
  $('speedBtn').textContent = (timeScale < 1 ? String(timeScale).slice(1) : timeScale) + '×';
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

if (airportLocked(cfg.apt)) cfg.apt = 'SFO'; // saved airport may have been from cleared storage
airport = instantiateAirport(cfg.apt);
airportIdx = Math.max(0, AIRPORT_ORDER.indexOf(cfg.apt));

function safeInset(varName) {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName)) || 0;
}

function resize() {
  const vv = window.visualViewport;
  W = vv ? vv.width : window.innerWidth;
  H = vv ? vv.height : window.innerHeight;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.ceil(W * DPR);
  canvas.height = Math.ceil(H * DPR);
  const pad = 8;
  PLAY = {
    l: safeInset('--sal') + pad, r: W - safeInset('--sar') - pad,
    t: safeInset('--sat') + pad, b: H - safeInset('--sab') - pad,
  };
  layoutAirport();
  renderField();
  makeRain();
  if (!clouds.length) makeClouds();
}
window.addEventListener('resize', resize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
resize();

// reflect saved config in the menu
reflectApt(cfg.apt);
reflectMode(cfg.mode);
reflectTarget(cfg.target);
reflectPractice(cfg.practice ? 'on' : 'off');
reflectPace(cfg.pace);
reflectScene(cfg.scene);
$('cbBtn').classList.toggle('on', cfg.cb);
$('touchBtn').classList.toggle('on', cfg.bigTouch);
$('emergBtn').classList.toggle('on', cfg.emerg);
$('assistBtn').classList.toggle('on', cfg.assist);
$('comboBtn').classList.toggle('on', cfg.combo);
$('glideBtn').classList.toggle('on', cfg.glide);
$('closuresBtn').classList.toggle('on', cfg.closures);
refreshLocks();
renderLB($('lbMenu'));
resolveScene();
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
// &apt=JFK forces an airport · &stages=50 forces stage mode · &glide forces
// glide path corridors on · &closures forces runway closures on · &debug → title
const _qs = new URLSearchParams(location.search);
if (_qs.has('apt')) setAirport(_qs.get('apt'));
if (_qs.has('stages')) {
  cfg.mode = 'stages';
  cfg.target = +_qs.get('stages') || 200;
}
if (_qs.has('practice')) cfg.practice = true;
if (_qs.has('relaxed')) cfg.pace = 'relaxed';
if (_qs.has('cb')) { cfg.cb = true; renderField(); }
if (_qs.has('scene')) { cfg.scene = _qs.get('scene'); resolveScene(); }
if (_qs.has('noemerg')) cfg.emerg = false;
if (_qs.has('assist')) cfg.assist = true;
if (_qs.has('glide')) cfg.glide = true;
if (_qs.has('closures')) cfg.closures = true;
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
