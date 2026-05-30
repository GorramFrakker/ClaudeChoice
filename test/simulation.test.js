// Unit tests for the DOM-free simulation engine.
// Run with: npm test   (uses the built-in Node test runner)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Simulation } from '../src/simulation.js';
import {
  EMPTY, WALL, SAND, WATER, OIL, LAVA, STONE, FIRE, SMOKE, STEAM, ACID,
  GUNPOWDER, ELEMENT_COUNT,
} from '../src/elements.js';

// Fixed seed everywhere so behaviour is deterministic.
const SEED = 12345;
const newSim = (w = 40, h = 30) => new Simulation(w, h, SEED);

test('constructor allocates parallel state arrays of the right size', () => {
  const sim = newSim(10, 8);
  assert.equal(sim.size, 80);
  assert.equal(sim.type.length, 80);
  assert.equal(sim.life.length, 80);
  assert.equal(sim.shade.length, 80);
});

test('an empty grid stays empty', () => {
  const sim = newSim();
  for (let i = 0; i < 20; i++) sim.step();
  assert.equal(sim.count(EMPTY), sim.size);
});

test('out-of-bounds reads behave like walls (closed box)', () => {
  const sim = newSim();
  assert.equal(sim.get(-1, 0), WALL);
  assert.equal(sim.get(0, -1), WALL);
  assert.equal(sim.get(sim.width, 0), WALL);
  assert.equal(sim.get(0, sim.height), WALL);
});

test('a single sand grain falls to the floor', () => {
  const sim = newSim();
  const x = 5;
  sim.set(x, 0, SAND);
  for (let i = 0; i < sim.height + 5; i++) sim.step();
  assert.equal(sim.get(x, sim.height - 1), SAND, 'grain should rest on the floor');
  assert.equal(sim.count(SAND), 1, 'no sand created or destroyed');
});

test('inert powder is conserved over many steps', () => {
  const sim = newSim();
  for (let n = 0; n < 50; n++) {
    const x = (n * 7) % sim.width;
    const y = (n * 3) % (sim.height / 2 | 0);
    sim.set(x, y, SAND);
  }
  const before = sim.count(SAND);
  for (let i = 0; i < 60; i++) sim.step();
  assert.equal(sim.count(SAND), before, 'sand count is invariant');
});

test('water flows downward and spreads sideways', () => {
  const sim = newSim();
  // A vertical stack of water near the top-centre.
  for (let y = 0; y < 6; y++) sim.set(20, y, WATER);
  const total = sim.count(WATER);
  for (let i = 0; i < 40; i++) sim.step();
  assert.equal(sim.count(WATER), total, 'water is conserved');

  // Measure the widest row occupied by water — it should have spread.
  let widest = 0;
  for (let y = 0; y < sim.height; y++) {
    let min = sim.width, max = -1;
    for (let x = 0; x < sim.width; x++) {
      if (sim.get(x, y) === WATER) { if (x < min) min = x; if (x > max) max = x; }
    }
    if (max >= 0) widest = Math.max(widest, max - min + 1);
  }
  assert.ok(widest > 1, `water should puddle outward, got width ${widest}`);
});

test('sand sinks through water (density displacement)', () => {
  const sim = newSim();
  const x = 10;
  // Build a sealed one-wide well so water cannot escape sideways; the only
  // way the system can resolve is for the denser sand to sink beneath it.
  for (let y = sim.height - 12; y < sim.height; y++) {
    sim.set(x - 1, y, WALL);
    sim.set(x + 1, y, WALL);
  }
  for (let y = sim.height - 6; y < sim.height; y++) sim.set(x, y, WATER);
  sim.set(x, sim.height - 11, SAND); // dropped in from the top of the well
  for (let i = 0; i < 60; i++) sim.step();
  assert.equal(sim.count(SAND), 1, 'sand is conserved');
  assert.equal(sim.get(x, sim.height - 1), SAND, 'sand settles on the bottom');
  assert.equal(sim.get(x, sim.height - 2), WATER, 'water floats above the sand');
});

test('water + lava => steam + stone', () => {
  const sim = newSim();
  const y = sim.height - 1; // sit on the floor so they stay adjacent
  sim.set(10, y, WATER);
  sim.set(11, y, LAVA);
  sim.step();
  assert.equal(sim.get(11, y), STONE, 'lava chills to stone');
  assert.equal(sim.get(10, y), STEAM, 'water flashes to steam');
});

test('acid dissolves the matter it touches', () => {
  const sim = newSim();
  const y = sim.height - 1;
  sim.set(5, y, SAND);
  sim.set(5, y - 1, ACID); // acid directly above sand
  sim.step();
  assert.equal(sim.get(5, y), EMPTY, 'sand should be dissolved away');
});

test('acid does not eat through walls', () => {
  const sim = newSim();
  const y = sim.height - 1;
  sim.set(5, y, WALL);
  sim.set(5, y - 1, ACID);
  for (let i = 0; i < 10; i++) sim.step();
  assert.equal(sim.get(5, y), WALL, 'walls are acid-proof');
});

test('fire consumes flammable oil', () => {
  const sim = newSim();
  const y = sim.height - 1;
  sim.set(5, y, OIL);
  sim.set(6, y, FIRE);
  let burned = false;
  for (let i = 0; i < 30; i++) {
    sim.step();
    if (sim.count(OIL) === 0) { burned = true; break; }
  }
  assert.ok(burned, 'oil should ignite and burn away within 30 steps');
});

test('gunpowder detonates on contact with flame', () => {
  const sim = newSim();
  const y = sim.height - 1;
  sim.set(10, y, GUNPOWDER);
  sim.set(11, y, FIRE);
  sim.step();
  assert.equal(sim.count(GUNPOWDER), 0, 'gunpowder is consumed by the blast');
  assert.ok(sim.count(FIRE) > 1, 'the blast produces a burst of fire');
});

test('smoke rises away from where it spawned', () => {
  const sim = newSim();
  const x = 8, y = sim.height - 1;
  sim.set(x, y, SMOKE);
  for (let i = 0; i < 6; i++) sim.step();
  assert.notEqual(sim.get(x, y), SMOKE, 'smoke should have left the floor cell');
});

test('clear(keepWalls) wipes everything but the walls', () => {
  const sim = newSim();
  sim.set(0, 0, WALL);
  sim.set(1, 1, SAND);
  sim.set(2, 2, WATER);
  sim.clear(true);
  assert.equal(sim.get(0, 0), WALL);
  assert.equal(sim.get(1, 1), EMPTY);
  assert.equal(sim.get(2, 2), EMPTY);
});

test('paintCircle fills a disc of cells', () => {
  const sim = newSim();
  sim.paintCircle(20, 15, 3, WALL);
  assert.ok(sim.count(WALL) > 5, 'a radius-3 brush should paint several cells');
  assert.equal(sim.get(20, 15), WALL, 'centre cell is painted');
});

test('serialize / load round-trips the grid', () => {
  const sim = newSim();
  sim.set(3, 3, SAND);
  sim.set(4, 4, WATER);
  sim.set(5, 5, WALL);
  const snapshot = sim.serialize();

  const other = newSim();
  assert.ok(other.load(snapshot));
  assert.equal(other.get(3, 3), SAND);
  assert.equal(other.get(4, 4), WATER);
  assert.equal(other.get(5, 5), WALL);
});

test('load rejects a snapshot of mismatched dimensions', () => {
  const sim = newSim(40, 30);
  const snapshot = sim.serialize();
  const other = newSim(20, 20);
  assert.equal(other.load(snapshot), false);
});

test('stepping a densely random grid never corrupts state', () => {
  const sim = newSim(60, 40);
  for (let i = 0; i < sim.size; i++) {
    sim.type[i] = (Math.random() * ELEMENT_COUNT) | 0;
  }
  for (let i = 0; i < 30; i++) sim.step();
  // Every cell still holds a valid element id and the arrays are intact.
  assert.equal(sim.type.length, sim.size);
  for (let i = 0; i < sim.size; i++) {
    assert.ok(sim.type[i] >= 0 && sim.type[i] < ELEMENT_COUNT);
  }
});
