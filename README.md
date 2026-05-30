# ⚗️ Alchemy Sandbox

A **falling-sand physics playground** that runs entirely in your browser. Drop
sand, pour water, melt rock into lava, set wood ablaze, dissolve stone with
acid, grow plants, freeze water into ice, and blow it all up with gunpowder —
then watch thousands of pixels obey simple rules and produce surprisingly
lifelike behaviour.

It's a [cellular automaton](https://en.wikipedia.org/wiki/Cellular_automaton):
every cell is one of 16 elements, and on each frame every cell looks at its
neighbours and decides what to do. No game engine, no framework, **no
dependencies** — just modern JavaScript, an HTML canvas, and a few hundred
lines of carefully ordered rules.

```
   sand falls and piles      water finds its level      fire spreads through wood
   lava + water → stone      acid eats matter           gunpowder detonates 💥
```

---

## Quick start

**The fastest way:** open [`standalone.html`](standalone.html) directly in your
browser. It's the whole app — every module and the stylesheet — inlined into a
single file, so there's nothing to install, no server, and no network. Just
double-click it.

**For development**, run it as separate ES modules via a tiny static server
(modules can't be loaded over `file://`). You need [Node.js](https://nodejs.org)
18+ — only to serve the files; the app itself is pure browser JavaScript.

```bash
npm run dev      # starts a tiny static server (zero dependencies)
# → open http://localhost:5173   (set PORT=8080 to change the port)
```

No Node? Any static server works, e.g. `python3 -m http.server 5173`.

Rebuild the single-file version after changing anything in `src/`:

```bash
npm run build    # regenerates standalone.html from index.html + src/*
```

Run the engine's unit tests with:

```bash
npm test
```

---

## How to play

- **Pick an element** from the palette (or press its number/letter key).
- **Click and drag** on the canvas to paint it.
- **Right-click drag** to erase. The eraser tool does the same with the left button.
- **Scroll** over the canvas — or use `[` / `]` — to change the brush size.
- **Space** pauses; while paused, `.` advances a single frame.
- **C** clears the canvas. Toggle the bordered container to let things spill over the edges.
- **📷 PNG** downloads a snapshot; **💾 / 📂** save & load your creation in the browser.

### Things to try

| Recipe | What happens |
| --- | --- |
| Pour **water** onto **lava** | lava freezes into **stone**, water flashes to **steam** |
| Touch **wood** with **fire** | flames spread, leaving **smoke** behind |
| Drip **acid** on **sand**/**stone**/**wood** | it dissolves away (but walls are acid-proof) |
| Put **plant** next to **water** | it grows and creeps along the water |
| Ignite **gunpowder** | a chain-reacting explosion |
| Drop **sand** into **water** | the denser sand sinks; water floats up |
| Sprinkle **salt** on **ice** | the ice melts back to water |
| Place **oil** on **water** | the lighter oil floats — then set it alight |

---

## The elements

| Element | Behaves like | Notable reactions |
| --- | --- | --- |
| Sand | powder | sinks through liquids |
| Salt | powder | dissolves in water; melts ice |
| Gunpowder | powder | **explodes** near fire/lava |
| Water | liquid | + lava → stone & steam; douses fire; grows plants |
| Oil | liquid | floats on water; highly flammable |
| Acid | liquid | dissolves most solids & powders |
| Lava | liquid | ignites flammables; melts ice; cools to stone |
| Wall / Stone | solid | structural (stone is dissolvable, wall is not) |
| Wood | solid | flammable |
| Plant | solid | grows into adjacent water; flammable |
| Ice | solid | melts near heat; slowly freezes nearby water |
| Fire / Smoke / Steam | gas | rise, flicker and fade; steam condenses back to water |

---

## How it works

The whole simulation lives in three parallel `Uint8Array`s indexed by
`y * width + x`:

- `type[]` — which of the 16 elements occupies each cell
- `life[]` — a countdown for transient elements (fire, smoke, steam)
- `shade[]` — per-cell randomness the renderer uses for colour variation

Each `step()`:

1. Scans rows **bottom-to-top** so falling resolves in a single pass.
2. **Alternates** left-to-right / right-to-left each frame to avoid directional bias.
3. Dispatches each cell to its element's update rule.

Movement is built from a few primitives — `powderFall`, `liquidFlow`,
`gasRise` — that share a **density-based displacement** check, so heavier
things sink through lighter ones (sand through water, water under oil). A
`moved` bitmap stops a particle from being processed twice in one frame.

Randomness comes from a small **seedable PRNG** (mulberry32), which means the
engine is fully deterministic — handy for the test suite, while still feeling
organic in play.

Rendering writes directly into an `ImageData` buffer (one pixel per cell) and
blits it with `putImageData`; CSS then scales the canvas up with
`image-rendering: pixelated` for crisp retro pixels. That's dramatically faster
than per-cell `fillRect` calls.

### Project layout

```
index.html            markup + layout (module entry point, for dev)
standalone.html       generated single-file build — open this directly
build.js              inlines src/* + styles into standalone.html
server.js             zero-dependency static dev server
src/
  elements.js         element table + derived lookup arrays   (DOM-free)
  simulation.js       the cellular-automata engine            (DOM-free)
  renderer.js         ImageData rendering + brush cursor
  input.js            pointer / touch painting
  ui.js               palette, controls, keyboard shortcuts
  main.js             wires it together + the render loop
  styles.css          dark, glassy theme
test/
  simulation.test.js  18 engine tests (node --test)
```

`elements.js` and `simulation.js` are intentionally free of any browser APIs,
which is why the engine can be unit-tested under plain Node with the built-in
test runner.

---

## Tests

The engine is covered by 18 deterministic tests — falling, density
displacement, conservation of matter, every major reaction (water+lava, acid,
fire, gunpowder), serialization, and a fuzz test that hammers a randomly filled
grid to make sure nothing ever corrupts state.

```bash
npm test
```

---

## License

MIT — do whatever you like with it. Built as a self-contained demo of what a
small, dependency-free cellular automaton can do.
