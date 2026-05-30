// renderer.js — paints the simulation grid onto a canvas.
//
// The canvas backing store is exactly grid-sized (one device pixel per cell);
// CSS scales it up with `image-rendering: pixelated` for crisp, chunky pixels.
// We write straight into an ImageData buffer each frame — far faster than
// thousands of fillRect calls.

import {
  COLOR_R, COLOR_G, COLOR_B,
  EMPTY, FIRE, LAVA, SMOKE, STEAM,
  BACKGROUND, LIFE_FIRE, LIFE_SMOKE, LIFE_STEAM,
} from './elements.js';

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const lerp = (a, b, t) => (a + (b - a) * t) | 0;

export class Renderer {
  constructor(canvas, sim) {
    this.sim = sim;
    canvas.width = sim.width;
    canvas.height = sim.height;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.image = this.ctx.createImageData(sim.width, sim.height);
    this.buf = this.image.data;
    for (let p = 3; p < this.buf.length; p += 4) this.buf[p] = 255; // opaque
  }

  render(frame) {
    const { type, life, shade, size } = this.sim;
    const buf = this.buf;
    const bg0 = BACKGROUND[0], bg1 = BACKGROUND[1], bg2 = BACKGROUND[2];

    for (let i = 0; i < size; i++) {
      const t = type[i];
      let r, g, b;

      if (t === EMPTY) {
        r = bg0; g = bg1; b = bg2;
      } else if (t === FIRE) {
        // White-hot when young, deep red as it dies, with a fast flicker.
        const k = life[i] / LIFE_FIRE;
        const flick = ((shade[i] + frame * 7) & 31) - 16;
        r = 255;
        g = clamp(70 + k * 150 + flick);
        b = clamp(k * 60 + (flick > 0 ? flick : 0));
      } else if (t === LAVA) {
        // Slow molten pulse, each cell offset by its shade.
        const pulse = Math.sin(frame * 0.12 + shade[i] * 0.1) * 22;
        r = clamp(228 + pulse);
        g = clamp(72 + pulse * 0.6 + (shade[i] & 15));
        b = clamp(20 + (shade[i] & 7));
      } else if (t === SMOKE) {
        const k = life[i] / LIFE_SMOKE; // fades toward background as it thins
        r = lerp(bg0, 72, k); g = lerp(bg1, 74, k); b = lerp(bg2, 80, k);
      } else if (t === STEAM) {
        const k = life[i] / LIFE_STEAM;
        r = lerp(bg0, 206, k); g = lerp(bg1, 211, k); b = lerp(bg2, 220, k);
      } else {
        // Static elements: base colour with a little per-cell brightness jitter.
        const f = 0.82 + (shade[i] / 255) * 0.36;
        r = clamp(COLOR_R[t] * f);
        g = clamp(COLOR_G[t] * f);
        b = clamp(COLOR_B[t] * f);
      }

      const p = i << 2;
      buf[p] = r; buf[p + 1] = g; buf[p + 2] = b;
    }

    this.ctx.putImageData(this.image, 0, 0);
  }

  // A thin ring showing the brush footprint. Drawn in grid coordinates, so CSS
  // scaling enlarges it along with everything else.
  drawCursor(cx, cy, radius) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(cx + 0.5, cy + 0.5, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
