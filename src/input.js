// input.js — pointer (mouse + touch) painting onto the grid.
//
// Uses Pointer Events so mouse, pen and touch all work. Strokes are
// interpolated so fast drags lay down a continuous line instead of dots.
// Right-click (or two-finger / secondary button) erases.

import { EMPTY } from './elements.js';

export class Input {
  constructor(canvas, sim, app) {
    this.canvas = canvas;
    this.sim = sim;
    this.app = app;
    this.drawing = false;
    this.erasing = false;
    this.lastX = 0;
    this.lastY = 0;

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', () => this._up());
    canvas.addEventListener('pointerenter', () => { app.mouse.inside = true; });
    canvas.addEventListener('pointerleave', () => { app.mouse.inside = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Adjust brush size with the wheel for quick tuning.
    canvas.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
  }

  _cell(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * this.sim.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * this.sim.height);
    return [x, y];
  }

  _type() {
    return this.erasing ? EMPTY : this.app.selected;
  }

  _down(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.drawing = true;
    this.erasing = e.button === 2 || (e.buttons & 2) === 2;
    const [x, y] = this._cell(e);
    this.lastX = x; this.lastY = y;
    this.app.mouse.x = x; this.app.mouse.y = y; this.app.mouse.inside = true;
    this.sim.paintCircle(x, y, this.app.brush, this._type(), true);
    this.app.onFirstPaint?.();
    e.preventDefault();
  }

  _move(e) {
    const [x, y] = this._cell(e);
    this.app.mouse.x = x; this.app.mouse.y = y; this.app.mouse.inside = true;
    if (!this.drawing) return;
    this._stroke(this.lastX, this.lastY, x, y, this._type());
    this.lastX = x; this.lastY = y;
  }

  _up() {
    this.drawing = false;
    this.erasing = false;
  }

  _wheel(e) {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    this.app.setBrush?.(this.app.brush + dir);
  }

  // Paint a line of brush stamps between two cells.
  _stroke(x0, y0, x1, y1, type) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps);
      const y = Math.round(y0 + ((y1 - y0) * s) / steps);
      this.sim.paintCircle(x, y, this.app.brush, type, true);
    }
  }
}
