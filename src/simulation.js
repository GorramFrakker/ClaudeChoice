// simulation.js — the cellular-automata engine.
//
// Pure logic, no DOM: the browser app and the Node test suite both import this.
// State lives in three parallel Uint8Arrays indexed by `y * width + x`:
//   type[]   the element id occupying each cell
//   life[]   countdown for transient elements (fire/smoke/steam)
//   shade[]  per-cell randomness, used by the renderer for colour variation
//
// Each step scans the grid bottom-to-top (so falling resolves in one pass) and
// alternates horizontal scan direction each frame to avoid a left/right bias.

import {
  EMPTY, WALL, SAND, WATER, OIL, LAVA, STONE, WOOD, FIRE, SMOKE, STEAM,
  ACID, PLANT, SALT, ICE, GUNPOWDER,
  CAT, CAT_SOLID, CAT_POWDER, DENSITY, FLAMMABLE, IGN, DISSOLVABLE,
  ELEMENT_COUNT, freshLife,
} from './elements.js';

// Small, fast, seedable PRNG (mulberry32) so the engine is deterministic in
// tests while still feeling random in the app.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Simulation {
  constructor(width, height, seed = (Date.now() & 0x7fffffff)) {
    this.width = width;
    this.height = height;
    this.size = width * height;
    this.type = new Uint8Array(this.size);
    this.life = new Uint8Array(this.size);
    this.shade = new Uint8Array(this.size);
    this.moved = new Uint8Array(this.size); // guards against double-moving
    this.rand = mulberry32(seed);
    this.frame = 0;
  }

  // --- coordinate helpers -------------------------------------------------
  idx(x, y) { return y * this.width + x; }
  inBounds(x, y) { return x >= 0 && x < this.width && y >= 0 && y < this.height; }

  // Out-of-bounds reads return WALL, turning the grid edges into a closed box.
  get(x, y) { return this.inBounds(x, y) ? this.type[this.idx(x, y)] : WALL; }

  set(x, y, type) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.type[i] = type;
    this.life[i] = freshLife(type, this.rand);
    this.shade[i] = (this.rand() * 256) | 0;
  }

  count(type) {
    let n = 0;
    for (let i = 0; i < this.size; i++) if (this.type[i] === type) n++;
    return n;
  }

  clear(keepWalls = false) {
    for (let i = 0; i < this.size; i++) {
      if (keepWalls && this.type[i] === WALL) continue;
      this.type[i] = EMPTY;
      this.life[i] = 0;
      this.shade[i] = 0;
    }
  }

  // Paint a filled circle of `type`. With overwrite off, only empty cells and
  // (for the eraser) any cell are affected — used by the brush.
  paintCircle(cx, cy, radius, type, overwrite = true) {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx, y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        if (this.type[i] === WALL && type !== EMPTY && type !== WALL) {
          // walls are only removed by the eraser or overwritten by walls
          if (!overwrite) continue;
        }
        if (!overwrite && this.type[i] !== EMPTY && type !== EMPTY) continue;
        // Gentle scatter for powders/liquids so brushes look granular.
        if (type !== EMPTY && type !== WALL && this.rand() < 0.12) continue;
        this.type[i] = type;
        this.life[i] = freshLife(type, this.rand);
        this.shade[i] = (this.rand() * 256) | 0;
      }
    }
  }

  // --- low level cell ops -------------------------------------------------
  _setCell(i, type) {
    this.type[i] = type;
    this.life[i] = freshLife(type, this.rand);
    this.shade[i] = (this.rand() * 256) | 0;
    this.moved[i] = 1;
  }

  _swap(i, j) {
    let t = this.type[i]; this.type[i] = this.type[j]; this.type[j] = t;
    t = this.life[i]; this.life[i] = this.life[j]; this.life[j] = t;
    t = this.shade[i]; this.shade[i] = this.shade[j]; this.shade[j] = t;
    this.moved[i] = 1;
    this.moved[j] = 1;
  }

  // Can element `a` move into the cell currently holding `b`?
  _canDisplace(a, b) {
    const cb = CAT[b];
    if (cb === CAT_SOLID || cb === CAT_POWDER) return false; // can't shove solids/powders
    return DENSITY[a] > DENSITY[b]; // heavier sinks through lighter liquid/gas
  }

  // Try to move the particle at index `i` into cell (nx, ny). Returns success.
  _move(i, nx, ny) {
    if (!this.inBounds(nx, ny)) return false;
    const j = this.idx(nx, ny);
    if (this.moved[j]) return false;
    const target = this.type[j];
    if (target === EMPTY || this._canDisplace(this.type[i], target)) {
      this._swap(i, j);
      return true;
    }
    return false;
  }

  // --- neighbourhood queries ---------------------------------------------
  _hasNeighbor(x, y, type) {
    return (
      this.get(x, y - 1) === type || this.get(x, y + 1) === type ||
      this.get(x - 1, y) === type || this.get(x + 1, y) === type ||
      this.get(x - 1, y - 1) === type || this.get(x + 1, y - 1) === type ||
      this.get(x - 1, y + 1) === type || this.get(x + 1, y + 1) === type
    );
  }

  _hasHeatNeighbor(x, y) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const t = this.get(x + dx, y + dy);
        if (t === FIRE || t === LAVA) return true;
      }
    }
    return false;
  }

  // --- step ---------------------------------------------------------------
  step() {
    this.frame++;
    this.moved.fill(0);
    const W = this.width, H = this.height;
    const ltr = (this.frame & 1) === 0;
    for (let y = H - 1; y >= 0; y--) {
      if (ltr) {
        for (let x = 0; x < W; x++) this._update(x, y);
      } else {
        for (let x = W - 1; x >= 0; x--) this._update(x, y);
      }
    }
  }

  _update(x, y) {
    const i = this.idx(x, y);
    if (this.moved[i]) return;
    switch (this.type[i]) {
      case SAND: this._powderFall(i, x, y); break;
      case SALT: this._updateSalt(i, x, y); break;
      case GUNPOWDER: this._updateGunpowder(i, x, y); break;
      case WATER: this._updateWater(i, x, y); break;
      case OIL: this._updateOil(i, x, y); break;
      case LAVA: this._updateLava(i, x, y); break;
      case ACID: this._updateAcid(i, x, y); break;
      case FIRE: this._updateFire(i, x, y); break;
      case SMOKE: this._updateGasDecay(i, x, y, SMOKE); break;
      case STEAM: this._updateSteam(i, x, y); break;
      case PLANT: this._updatePlant(i, x, y); break;
      case ICE: this._updateIce(i, x, y); break;
      // WALL, STONE, WOOD, EMPTY have no self-driven behaviour.
    }
  }

  // --- movement primitives ------------------------------------------------
  _powderFall(i, x, y) {
    if (this._move(i, x, y + 1)) return true;
    const d = this.rand() < 0.5 ? -1 : 1;
    if (this._move(i, x + d, y + 1)) return true;
    if (this._move(i, x - d, y + 1)) return true;
    return false;
  }

  _liquidFlow(i, x, y) {
    if (this._move(i, x, y + 1)) return true;
    const d = this.rand() < 0.5 ? -1 : 1;
    if (this._move(i, x + d, y + 1)) return true;
    if (this._move(i, x - d, y + 1)) return true;
    if (this._move(i, x + d, y)) return true;
    if (this._move(i, x - d, y)) return true;
    return false;
  }

  _gasRise(i, x, y) {
    if (this._move(i, x, y - 1)) return true;
    const d = this.rand() < 0.5 ? -1 : 1;
    if (this._move(i, x + d, y - 1)) return true;
    if (this._move(i, x - d, y - 1)) return true;
    if (this._move(i, x + d, y)) return true;
    if (this._move(i, x - d, y)) return true;
    return false;
  }

  // --- element behaviours -------------------------------------------------
  _updateWater(i, x, y) {
    // React with the four orthogonal neighbours.
    if (this._reactWater(x, y, x, y - 1, i)) return;
    if (this._reactWater(x, y, x, y + 1, i)) return;
    if (this._reactWater(x, y, x - 1, y, i)) return;
    if (this._reactWater(x, y, x + 1, y, i)) return;
    this._liquidFlow(i, x, y);
  }

  _reactWater(x, y, nx, ny, i) {
    if (!this.inBounds(nx, ny)) return false;
    const j = this.idx(nx, ny);
    const nt = this.type[j];
    if (nt === LAVA) {
      this._setCell(j, STONE);      // lava chills into stone
      this._setCell(i, STEAM);      // water flashes to steam
      return true;
    }
    if (nt === FIRE) {
      this._setCell(j, this.rand() < 0.5 ? STEAM : EMPTY); // douse the flame
      return false; // water survives; keep checking other neighbours
    }
    return false;
  }

  _updateOil(i, x, y) {
    if (this._hasHeatNeighbor(x, y) && this.rand() < IGN[OIL]) {
      this._setCell(i, FIRE);
      return;
    }
    this._liquidFlow(i, x, y);
  }

  _updateAcid(i, x, y) {
    // Dissolve one dissolvable neighbour per frame; acid is sometimes consumed.
    const dirs = [[0, 1], [0, -1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const j = this.idx(nx, ny);
      if (DISSOLVABLE[this.type[j]]) {
        this._setCell(j, EMPTY);
        if (this.rand() < 0.35) { this._setCell(i, EMPTY); return; }
        break;
      }
    }
    this._liquidFlow(i, x, y);
  }

  _updateLava(i, x, y) {
    // Cool against water: lava solidifies to stone, the water flashes to steam.
    // Mirrors the water reaction so the outcome is independent of scan order.
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const j = this.idx(nx, ny);
      if (this.type[j] === WATER) {
        this._setCell(j, STEAM);
        this._setCell(i, STONE);
        return;
      }
    }
    // Ignite flammables and melt ice in the 8-neighbourhood.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const j = this.idx(nx, ny);
        const nt = this.type[j];
        if (nt === GUNPOWDER) { this._explode(nx, ny, 4); }
        else if (FLAMMABLE[nt] && this.rand() < 0.5) { this._setCell(j, FIRE); }
        else if (nt === ICE) { this._setCell(j, WATER); }
      }
    }
    // Occasionally belch fire upward for ambience.
    if (this.get(x, y - 1) === EMPTY && this.rand() < 0.04) {
      this._setCell(this.idx(x, y - 1), FIRE);
    }
    // Lava is viscous: it only flows some frames.
    if (this.rand() < 0.65) this._liquidFlow(i, x, y);
  }

  _updateFire(i, x, y) {
    // Water (orthogonal) snuffs it out.
    if (this.get(x, y - 1) === WATER || this.get(x, y + 1) === WATER ||
        this.get(x - 1, y) === WATER || this.get(x + 1, y) === WATER) {
      this._setCell(i, this.rand() < 0.3 ? STEAM : EMPTY);
      return;
    }
    // Spread to flammable neighbours, melt ice.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const j = this.idx(nx, ny);
        const nt = this.type[j];
        if (nt === GUNPOWDER) { this._explode(nx, ny, 4); }
        else if (FLAMMABLE[nt] && this.rand() < IGN[nt]) { this._setCell(j, FIRE); }
        else if (nt === ICE && this.rand() < 0.25) { this._setCell(j, WATER); }
      }
    }
    // Burn down, then turn to smoke or vanish.
    const l = this.life[i] - 1;
    if (l <= 0) {
      this._setCell(i, this.rand() < 0.35 ? SMOKE : EMPTY);
      return;
    }
    this.life[i] = l;
    if (this.rand() < 0.85) this._gasRise(i, x, y);
  }

  _updateGasDecay(i, x, y, type) {
    const l = this.life[i] - 1;
    if (l <= 0) { this._setCell(i, EMPTY); return; }
    this.life[i] = l;
    this._gasRise(i, x, y);
  }

  _updateSteam(i, x, y) {
    const l = this.life[i] - 1;
    if (l <= 0) {
      this._setCell(i, this.rand() < 0.25 ? WATER : EMPTY); // condense
      return;
    }
    this.life[i] = l;
    this._gasRise(i, x, y);
  }

  _updatePlant(i, x, y) {
    if (this._hasHeatNeighbor(x, y) && this.rand() < 0.5) {
      this._setCell(i, FIRE);
      return;
    }
    // Creep into adjacent water.
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (this.get(nx, ny) === WATER && this.rand() < 0.08) {
        this._setCell(this.idx(nx, ny), PLANT);
      }
    }
    // Plant is structural: no movement.
  }

  _updateSalt(i, x, y) {
    const dirs = [[0, 1], [0, -1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nt = this.type[this.idx(nx, ny)];
      if (nt === WATER && this.rand() < 0.22) { this._setCell(i, EMPTY); return; } // dissolves
      if (nt === ICE) { this._setCell(this.idx(nx, ny), WATER); } // melts ice
    }
    this._powderFall(i, x, y);
  }

  _updateIce(i, x, y) {
    if (this._hasHeatNeighbor(x, y)) { this._setCell(i, WATER); return; }
    // Slowly freeze adjacent water.
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (this.get(nx, ny) === WATER && this.rand() < 0.015) {
        this._setCell(this.idx(nx, ny), ICE);
      }
    }
  }

  _updateGunpowder(i, x, y) {
    if (this._hasHeatNeighbor(x, y)) { this._explode(x, y, 4); return; }
    this._powderFall(i, x, y);
  }

  // Convert a disc of cells into fire (walls survive). Chains through other
  // gunpowder because the blast leaves fire that ignites neighbours next frame.
  _explode(cx, cy, radius) {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx, y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        const j = this.idx(x, y);
        if (this.type[j] === WALL) continue;
        this._setCell(j, FIRE);
        this.life[j] = (20 + this.rand() * 50) | 0;
      }
    }
  }

  // --- serialization (for save/load) -------------------------------------
  serialize() {
    return { w: this.width, h: this.height, type: Array.from(this.type) };
  }

  load(data) {
    if (!data || data.w !== this.width || data.h !== this.height) return false;
    for (let i = 0; i < this.size; i++) {
      const t = data.type[i] | 0;
      this.type[i] = t >= 0 && t < ELEMENT_COUNT ? t : EMPTY;
      this.life[i] = freshLife(this.type[i], this.rand);
      this.shade[i] = (this.rand() * 256) | 0;
    }
    return true;
  }
}
