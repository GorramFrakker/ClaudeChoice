// main.js — wires the engine, renderer, input and UI together and runs the loop.

import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { SAND, WALL, EMPTY, WATER, STONE, WOOD, PLANT } from './elements.js';

const GRID_W = 320;
const GRID_H = 200;
const SAVE_KEY = 'alchemy-sandbox.save.v1';

const canvas = document.getElementById('canvas');
const sim = new Simulation(GRID_W, GRID_H);
const renderer = new Renderer(canvas, sim);

const app = {
  sim,
  renderer,
  selected: SAND,
  brush: 5,
  paused: false,
  speed: 2,
  borders: true,
  mouse: { x: 0, y: 0, inside: false },
  onFirstPaint: () => document.getElementById('hint')?.classList.add('hidden'),
};

const input = new Input(canvas, sim, app);

// ---------------------------------------------------------------------------
// Actions that need the simulation / canvas, handed to the UI.
// ---------------------------------------------------------------------------
function setBorders(on) {
  const w = sim.width, h = sim.height;
  const put = (x, y) => {
    const i = sim.idx(x, y);
    if (on) { sim.type[i] = WALL; sim.life[i] = 0; }
    else if (sim.type[i] === WALL) { sim.type[i] = EMPTY; }
  };
  for (let x = 0; x < w; x++) put(x, h - 1);          // floor
  for (let y = 0; y < h; y++) { put(0, y); put(w - 1, y); } // side walls
}

const handlers = {
  stepOnce: () => sim.step(),
  clear: () => {
    sim.clear(false);
    if (app.borders) setBorders(true);
    document.getElementById('hint')?.classList.remove('hidden');
  },
  setBorders,
  save: () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(sim.serialize()));
      flash('Saved');
    } catch { flash('Save failed'); }
  },
  load: () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return flash('Nothing saved yet');
      sim.load(JSON.parse(raw)) ? flash('Loaded') : flash('Save was incompatible');
    } catch { flash('Load failed'); }
  },
  exportPng: () => {
    const scale = 4;
    const off = document.createElement('canvas');
    off.width = sim.width * scale;
    off.height = sim.height * scale;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(canvas, 0, 0, off.width, off.height);
    const a = document.createElement('a');
    a.download = 'alchemy-sandbox.png';
    a.href = off.toDataURL('image/png');
    a.click();
    flash('Exported PNG');
  },
};

const ui = new UI(app, handlers);

// Transient toast in the status bar.
let flashTimer = null;
function flash(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

// ---------------------------------------------------------------------------
// A gentle starting scene so the canvas greets you with something alive.
// ---------------------------------------------------------------------------
function seedScene() {
  const W = sim.width, H = sim.height;
  setBorders(true);
  // A stone basin near the bottom.
  for (let x = 40; x < W - 40; x++) {
    sim.set(x, H - 30, STONE);
    if (x < 70 || x > W - 70) for (let y = H - 30; y < H - 1; y++) sim.set(x, y, STONE);
  }
  // Water resting in the basin.
  for (let x = 72; x < W - 72; x++)
    for (let y = H - 28; y < H - 6; y++) sim.set(x, y, WATER);
  // A wood frame with a sprig of plant by the water.
  for (let y = H - 60; y < H - 30; y++) { sim.set(96, y, WOOD); sim.set(W - 96, y, WOOD); }
  for (let x = 96; x <= W - 96; x++) sim.set(x, H - 60, WOOD);
  sim.set(74, H - 27, PLANT);
  sim.set(W - 74, H - 27, PLANT);
  // A mound of sand up top that will pour down when unpaused.
  for (let i = 0; i < 1400; i++) {
    const x = (W / 2 + (sim.rand() - 0.5) * 80) | 0;
    const y = (40 + sim.rand() * 30) | 0;
    sim.set(x, y, SAND);
  }
}

// ---------------------------------------------------------------------------
// Main loop: optional physics steps, render, brush cursor, stats.
// ---------------------------------------------------------------------------
let frames = 0;
let fpsClock = performance.now();
let statClock = 0;

function tick(now) {
  if (!app.paused) {
    for (let s = 0; s < app.speed; s++) sim.step();
  }
  renderer.render(sim.frame);
  if (app.mouse.inside) renderer.drawCursor(app.mouse.x, app.mouse.y, app.brush);

  frames++;
  if (now - fpsClock >= 500) {
    const fps = Math.round((frames * 1000) / (now - fpsClock));
    frames = 0;
    fpsClock = now;
    if (now - statClock >= 250) {
      statClock = now;
      let n = 0;
      const t = sim.type;
      for (let i = 0; i < t.length; i++) if (t[i] !== EMPTY && t[i] !== WALL) n++;
      ui.setStatus(fps, n);
    }
  }
  requestAnimationFrame(tick);
}

seedScene();
requestAnimationFrame(tick);

// Expose for debugging in the console.
window.AlchemySandbox = { app, sim, renderer, ui };
