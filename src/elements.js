// elements.js — element definitions and derived lookup tables.
// This module is intentionally DOM-free so it can be imported by both the
// browser app and the Node test suite.

// ---------------------------------------------------------------------------
// Element ids. Kept small and contiguous so they index Uint8Arrays directly.
// ---------------------------------------------------------------------------
export const EMPTY = 0;
export const WALL = 1;
export const SAND = 2;
export const WATER = 3;
export const OIL = 4;
export const LAVA = 5;
export const STONE = 6;
export const WOOD = 7;
export const FIRE = 8;
export const SMOKE = 9;
export const STEAM = 10;
export const ACID = 11;
export const PLANT = 12;
export const SALT = 13;
export const ICE = 14;
export const GUNPOWDER = 15;

// Movement categories.
export const CAT_EMPTY = 0;
export const CAT_SOLID = 1; // immovable structure
export const CAT_POWDER = 2; // falls + piles
export const CAT_LIQUID = 3; // falls + spreads
export const CAT_GAS = 4; // rises + dissipates

// ---------------------------------------------------------------------------
// The master element table. Order matches the id constants above.
//   cat         movement category
//   color       base RGB; the renderer applies per-cell shade variation
//   density     used for displacement (heavier sinks through lighter)
//   flammable   can be ignited by fire/lava
//   ign         per-frame ignition chance when exposed to flame
//   dissolvable acid can eat it
//   key         keyboard shortcut (set later from PALETTE order)
//   palette     show as a paintable tool
//   label       display name
// ---------------------------------------------------------------------------
export const ELEMENTS = [
  { id: EMPTY,     label: 'Eraser',    cat: CAT_EMPTY,  color: [16, 19, 26],    density: 0,    flammable: false, ign: 0,    dissolvable: false },
  { id: WALL,      label: 'Wall',      cat: CAT_SOLID,  color: [110, 114, 124], density: 1000, flammable: false, ign: 0,    dissolvable: false },
  { id: SAND,      label: 'Sand',      cat: CAT_POWDER, color: [201, 178, 118], density: 60,   flammable: false, ign: 0,    dissolvable: true  },
  { id: WATER,     label: 'Water',     cat: CAT_LIQUID, color: [54, 118, 214],  density: 50,   flammable: false, ign: 0,    dissolvable: false },
  { id: OIL,       label: 'Oil',       cat: CAT_LIQUID, color: [92, 72, 48],    density: 40,   flammable: true,  ign: 0.55, dissolvable: false },
  { id: LAVA,      label: 'Lava',      cat: CAT_LIQUID, color: [222, 82, 28],   density: 85,   flammable: false, ign: 0,    dissolvable: false },
  { id: STONE,     label: 'Stone',     cat: CAT_SOLID,  color: [96, 98, 106],   density: 500,  flammable: false, ign: 0,    dissolvable: true  },
  { id: WOOD,      label: 'Wood',      cat: CAT_SOLID,  color: [124, 86, 48],   density: 500,  flammable: true,  ign: 0.04, dissolvable: true  },
  { id: FIRE,      label: 'Fire',      cat: CAT_GAS,    color: [255, 140, 40],  density: 1,    flammable: false, ign: 0,    dissolvable: false },
  { id: SMOKE,     label: 'Smoke',     cat: CAT_GAS,    color: [58, 58, 64],    density: 1,    flammable: false, ign: 0,    dissolvable: false },
  { id: STEAM,     label: 'Steam',     cat: CAT_GAS,    color: [202, 207, 216], density: 1,    flammable: false, ign: 0,    dissolvable: false },
  { id: ACID,      label: 'Acid',      cat: CAT_LIQUID, color: [128, 214, 52],  density: 45,   flammable: false, ign: 0,    dissolvable: false },
  { id: PLANT,     label: 'Plant',     cat: CAT_SOLID,  color: [58, 158, 72],   density: 500,  flammable: true,  ign: 0.06, dissolvable: true  },
  { id: SALT,      label: 'Salt',      cat: CAT_POWDER, color: [228, 230, 235], density: 55,   flammable: false, ign: 0,    dissolvable: true  },
  { id: ICE,       label: 'Ice',       cat: CAT_SOLID,  color: [160, 206, 236], density: 500,  flammable: false, ign: 0,    dissolvable: true  },
  { id: GUNPOWDER, label: 'Gunpowder', cat: CAT_POWDER, color: [74, 74, 82],    density: 60,   flammable: true,  ign: 0,    dissolvable: true  },
];

export const ELEMENT_COUNT = ELEMENTS.length;

// Tools shown in the palette, in display order. Each maps to a keyboard key.
export const PALETTE = [
  SAND, WATER, OIL, LAVA, FIRE, ACID,
  WALL, STONE, WOOD, PLANT, SALT, ICE,
  GUNPOWDER, EMPTY,
];

const KEYS = '12345678qwertyui';
PALETTE.forEach((id, i) => {
  ELEMENTS[id].key = KEYS[i] || '';
});

// ---------------------------------------------------------------------------
// Derived flat lookup tables. Indexing a typed/plain array by element id in the
// hot simulation loop is far cheaper than property access on objects.
// ---------------------------------------------------------------------------
export const CAT = new Uint8Array(ELEMENT_COUNT);
export const DENSITY = new Float32Array(ELEMENT_COUNT);
export const FLAMMABLE = new Uint8Array(ELEMENT_COUNT);
export const IGN = new Float32Array(ELEMENT_COUNT);
export const DISSOLVABLE = new Uint8Array(ELEMENT_COUNT);
export const COLOR_R = new Uint8Array(ELEMENT_COUNT);
export const COLOR_G = new Uint8Array(ELEMENT_COUNT);
export const COLOR_B = new Uint8Array(ELEMENT_COUNT);

for (const e of ELEMENTS) {
  CAT[e.id] = e.cat;
  DENSITY[e.id] = e.density;
  FLAMMABLE[e.id] = e.flammable ? 1 : 0;
  IGN[e.id] = e.ign;
  DISSOLVABLE[e.id] = e.dissolvable ? 1 : 0;
  COLOR_R[e.id] = e.color[0];
  COLOR_G[e.id] = e.color[1];
  COLOR_B[e.id] = e.color[2];
}

// Background colour the renderer fades transient gases toward.
export const BACKGROUND = [16, 19, 26];

// Approximate maximum life values, used by the renderer for fade ramps.
export const LIFE_FIRE = 90;
export const LIFE_SMOKE = 160;
export const LIFE_STEAM = 210;

// Initial life (countdown) for transient elements when they are created.
export function freshLife(type, rand) {
  switch (type) {
    case FIRE: return (30 + rand() * 60) | 0;
    case SMOKE: return (70 + rand() * 90) | 0;
    case STEAM: return (90 + rand() * 120) | 0;
    default: return 0;
  }
}
