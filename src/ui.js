// ui.js — builds the element palette and wires up the control bar + keyboard.
//
// The UI mutates shared `app` state directly for cheap settings (selected
// element, brush, speed, pause) and calls back into `handlers` for actions
// that need the simulation or canvas (clear, save, load, export, borders).

import { ELEMENTS, PALETTE, EMPTY } from './elements.js';

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

export class UI {
  constructor(app, handlers) {
    this.app = app;
    this.h = handlers;
    this.buttons = new Map();
    this.keymap = new Map();

    this._buildPalette();
    this._bindControls();
    this._bindKeyboard();
    this.setSelected(app.selected);
    this.setBrush(app.brush);
    this.setSpeed(app.speed);
  }

  _el(id) { return document.getElementById(id); }

  _buildPalette() {
    const root = this._el('palette');
    for (const id of PALETTE) {
      const e = ELEMENTS[id];
      const btn = document.createElement('button');
      btn.className = 'tool' + (id === EMPTY ? ' tool-eraser' : '');
      btn.type = 'button';
      btn.title = `${e.label}  (key: ${e.key || '—'})`;
      btn.innerHTML =
        `<span class="swatch" style="background:${id === EMPTY ? 'transparent' : rgb(e.color)}"></span>` +
        `<span class="tool-label">${e.label}</span>` +
        `<span class="tool-key">${e.key || ''}</span>`;
      btn.addEventListener('click', () => this.setSelected(id));
      root.appendChild(btn);
      this.buttons.set(id, btn);
      if (e.key) this.keymap.set(e.key, id);
    }
  }

  _bindControls() {
    const brush = this._el('brush');
    brush.addEventListener('input', () => this.setBrush(+brush.value));

    const speed = this._el('speed');
    speed.addEventListener('input', () => this.setSpeed(+speed.value));

    this._el('pause').addEventListener('click', () => this.togglePause());
    this._el('step').addEventListener('click', () => this.h.stepOnce());
    this._el('clear').addEventListener('click', () => this.h.clear());
    this._el('save').addEventListener('click', () => this.h.save());
    this._el('load').addEventListener('click', () => this.h.load());
    this._el('png').addEventListener('click', () => this.h.exportPng());

    const walls = this._el('walls');
    walls.checked = this.app.borders;
    walls.addEventListener('change', () => {
      this.app.borders = walls.checked;
      this.h.setBorders(walls.checked);
    });

    // expose brush setter so the mouse wheel / keyboard can use it too
    this.app.setBrush = (v) => this.setBrush(v);
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (this.keymap.has(k)) { this.setSelected(this.keymap.get(k)); return; }
      switch (k) {
        case ' ': e.preventDefault(); this.togglePause(); break;
        case 'c': this.h.clear(); break;
        case 'e': this.setSelected(EMPTY); break;
        case '[': this.setBrush(this.app.brush - 1); break;
        case ']': this.setBrush(this.app.brush + 1); break;
        case '.': if (this.app.paused) this.h.stepOnce(); break;
      }
    });
  }

  setSelected(id) {
    this.app.selected = id;
    for (const [bid, btn] of this.buttons) btn.classList.toggle('active', bid === id);
    this._el('selName').textContent = ELEMENTS[id].label;
  }

  setBrush(v) {
    v = Math.max(1, Math.min(40, v | 0));
    this.app.brush = v;
    this._el('brush').value = v;
    this._el('brushVal').textContent = v;
  }

  setSpeed(v) {
    v = Math.max(0, Math.min(6, v | 0));
    this.app.speed = v;
    this._el('speed').value = v;
    this._el('speedVal').textContent = v === 0 ? 'paused' : `${v}×`;
  }

  togglePause() {
    this.app.paused = !this.app.paused;
    const btn = this._el('pause');
    btn.textContent = this.app.paused ? '▶ Play' : '⏸ Pause';
    btn.classList.toggle('active', this.app.paused);
  }

  setStatus(fps, particles) {
    this._el('fps').textContent = fps;
    this._el('count').textContent = particles.toLocaleString();
  }
}
