import { WORLD, SOCIAL, TREES, PONDS, WEATHER, params } from '../config';
import type { Biome } from '../biome';
import { type Genome, randomGenome } from './genome';
import { type Food, makeFood } from './food';
import { Creature, type CreatureContext, type NeighborInfo, type TreeInfo, type PondInfo, newCreature } from './creature';

export interface WorldStats {
  population: number;
  food: number;
  generation: number;
  births: number;
  deaths: number;
  age: number;
  avgSize: number;
  avgSpeed: number;
  avgSense: number;
  avgAge: number;
  avgSocial: number;
  predators: number;
  flyers: number;
  avgWings: number;
}

const MAX_CREATURES = 700;

interface SnapCreature { g: Genome; x: number; z: number; h: number; e: number; a: number; gen: number; }
export interface WorldSnapshot {
  v: number; biomeSeed: number; age: number; births: number; deaths: number; generation: number;
  trees: { x: number; z: number }[];
  creatures: SnapCreature[];
  food: { x: number; z: number }[];
}

class FoodGrid {
  private cell = 8;
  private map = new Map<number, Food[]>();
  private half: number;
  constructor(half: number) { this.half = half; }
  private key(cx: number, cz: number): number { return cx * 100000 + cz; }
  private toCell(v: number): number { return Math.floor((v + this.half) / this.cell); }
  rebuild(food: Food[]): void {
    this.map.clear();
    for (const f of food) {
      if (!f.alive) continue;
      const k = this.key(this.toCell(f.x), this.toCell(f.z));
      const bucket = this.map.get(k);
      if (bucket) bucket.push(f); else this.map.set(k, [f]);
    }
  }
  nearest(x: number, z: number, radius: number): Food | null {
    const r = Math.ceil(radius / this.cell);
    const cx = this.toCell(x), cz = this.toCell(z);
    let best: Food | null = null;
    let bestD = radius * radius;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const bucket = this.map.get(this.key(cx + dx, cz + dz));
        if (!bucket) continue;
        for (const f of bucket) {
          if (!f.alive) continue;
          const d = (f.x - x) ** 2 + (f.z - z) ** 2;
          if (d < bestD) { bestD = d; best = f; }
        }
      }
    }
    return best;
  }
}

/** Uniform spatial grid over creatures for fast neighbor + bond queries. */
class CreatureGrid {
  private cell = 8;
  private map = new Map<number, Creature[]>();
  private half: number;
  constructor(half: number) { this.half = half; }
  private key(cx: number, cz: number): number { return cx * 100000 + cz; }
  private toCell(v: number): number { return Math.floor((v + this.half) / this.cell); }
  rebuild(cs: Creature[]): void {
    this.map.clear();
    for (const c of cs) {
      const k = this.key(this.toCell(c.x), this.toCell(c.z));
      const b = this.map.get(k);
      if (b) b.push(c); else this.map.set(k, [c]);
    }
  }
  forEachNear(x: number, z: number, radius: number, cb: (c: Creature) => void): void {
    const r = Math.ceil(radius / this.cell);
    const cx = this.toCell(x), cz = this.toCell(z);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const b = this.map.get(this.key(cx + dx, cz + dz));
        if (b) for (const c of b) cb(c);
      }
    }
  }
}

export class World implements CreatureContext {
  readonly half = WORLD.half;
  creatures: Creature[] = [];
  food: Food[] = [];
  age = 0;
  births = 0;
  deaths = 0;
  generation = 0;
  /** Flat [ax,az,bx,bz, ...] pairs of nearby creatures, for drawing community bond lines. */
  socialLinks: number[] = [];
  /** Static shelter trees (x,z); render places them on the terrain. */
  trees: { x: number; z: number }[] = [];
  /** Scenic ponds (x,z,r) settled into terrain basins; creatures steer around the water. */
  ponds: { x: number; z: number; r: number }[] = [];
  /** Lightning strike state for the renderer: flash >0 means a bolt is firing at (x,z). */
  lightningFlash = 0;
  lightningX = 0;
  lightningZ = 0;
  dayFactor = 1; // 0 = night, 1 = midday (creatures read this to sleep)
  prowling = 0; // # of predators currently stalking nearby prey (ominous audio + narration)
  events: { t: 0 | 1 | 2; x: number; z: number }[] = []; // transient birth(0)/death(1)/kill-impact(2) events
  private lightningTimer = 0;

  private biome: Biome;
  private grid = new FoodGrid(WORLD.half);
  private creatureGrid = new CreatureGrid(WORLD.half);
  private pendingChildren: Creature[] = [];
  private foodDebt = 0;

  constructor(biome: Biome) {
    this.biome = biome;
    for (let i = 0; i < WORLD.initialCreatures; i++) {
      const h = WORLD.half - 4;
      this.creatures.push(newCreature(randomGenome(), (Math.random() * 2 - 1) * h, (Math.random() * 2 - 1) * h));
    }
    for (let i = 0; i < WORLD.initialFood; i++) this.food.push(this.growFood());
    const th = WORLD.half - 8;
    for (let i = 0; i < TREES.count; i++) {
      this.trees.push({ x: (Math.random() * 2 - 1) * th, z: (Math.random() * 2 - 1) * th });
    }
    this.placePonds();
  }

  /** Drop ponds into the lowest spots we can find, so they read as water pooling in basins. */
  placePonds(): void {
    this.ponds = [];
    const ph = WORLD.half - 12;
    for (let i = 0; i < PONDS.count; i++) {
      let bx = 0, bz = 0, lowest = Infinity;
      for (let attempt = 0; attempt < 14; attempt++) {
        const x = (Math.random() * 2 - 1) * ph, z = (Math.random() * 2 - 1) * ph;
        const h = this.biome.height(x, z);
        if (h < lowest && this.ponds.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > (p.r + PONDS.maxR) ** 2)) {
          lowest = h; bx = x; bz = z;
        }
      }
      if (lowest < Infinity) this.ponds.push({ x: bx, z: bz, r: PONDS.minR + Math.random() * (PONDS.maxR - PONDS.minR) });
    }
  }

  nearestPond(x: number, z: number): PondInfo {
    let bx = 0, bz = 0, br = 0, best = Infinity, has = false;
    for (const p of this.ponds) {
      const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d2 < best) { best = d2; bx = p.x; bz = p.z; br = p.r; has = true; }
    }
    return { x: bx, z: bz, r: br, hasPond: has, dist: Math.sqrt(best) };
  }

  /** Pick a food location biased toward fertile (drifting) patches. */
  private growFood(): Food {
    const h = WORLD.half - 2;
    let x = 0, z = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      x = (Math.random() * 2 - 1) * h;
      z = (Math.random() * 2 - 1) * h;
      const fert = this.biome.fertility(x, z, this.age);
      if (Math.random() < fert * fert) break;
    }
    return makeFood(x, z);
  }

  findNearestFood(x: number, z: number, radius: number): Food | null {
    return this.grid.nearest(x, z, radius);
  }

  eatFood(food: Food): void { food.alive = false; }

  burst(type: number, x: number, z: number): void {
    if (this.events.length < 300) this.events.push({ t: type as 0 | 1 | 2, x, z });
  }

  spawnChild(genome: Genome, x: number, z: number, generation: number, energy: number): void {
    if (this.creatures.length + this.pendingChildren.length >= MAX_CREATURES) return;
    const h = this.half - 1;
    this.pendingChildren.push(
      newCreature(genome, Math.max(-h, Math.min(h, x)), Math.max(-h, Math.min(h, z)), generation, energy),
    );
    if (generation > this.generation) this.generation = generation;
  }

  neighbors(x: number, z: number, radius: number, selfId: number, selfPredator: boolean): NeighborInfo {
    let count = 0, cxs = 0, czs = 0, sepX = 0, sepZ = 0, aSin = 0, aCos = 0;
    let sigX = 0, sigZ = 0, hasSignal = false, bestSig = Infinity;
    let predX = 0, predZ = 0, hasPredator = false, bestPred = Infinity;
    let preyX = 0, preyZ = 0, hasPrey = false, bestPrey = Infinity;
    let preyRef: Creature | null = null;
    let mateRef: Creature | null = null, bestMate = Infinity;
    let hasAlarm = false, alarmX = 0, alarmZ = 0, bestAlarm = Infinity;
    const r2 = radius * radius;
    const sep2 = SOCIAL.separation * SOCIAL.separation;
    this.creatureGrid.forEachNear(x, z, radius, (o) => {
      if (o.id === selfId || !o.alive) return;
      const dx = o.x - x, dz = o.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) return;
      count++;
      cxs += o.x; czs += o.z;
      aSin += Math.sin(o.heading); aCos += Math.cos(o.heading);
      if (d2 < sep2 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        sepX += -dx / d; sepZ += -dz / d; // steer away from a too-close neighbor
      }
      if (o.signalTimer > 0 && d2 < bestSig) { bestSig = d2; sigX = dx; sigZ = dz; hasSignal = true; }
      if (o.isPredator) {
        if (d2 < bestPred) { bestPred = d2; predX = o.x; predZ = o.z; hasPredator = true; }
      } else if (d2 < bestPrey) {
        bestPrey = d2; preyX = o.x; preyZ = o.z; preyRef = o; hasPrey = true;
      }
      if (o.isPredator === selfPredator && d2 < bestMate) { bestMate = d2; mateRef = o; } // a potential mate
      if (o.alarmTimer > 0 && d2 < bestAlarm) { bestAlarm = d2; alarmX = o.threatX; alarmZ = o.threatZ; hasAlarm = true; }
    });
    if (count > 0) { cxs /= count; czs /= count; }
    return {
      count, cx: cxs, cz: czs, sepX, sepZ, alignSin: aSin, alignCos: aCos, sigX, sigZ, hasSignal,
      predX, predZ, hasPredator, preyX, preyZ, hasPrey, preyRef, mateRef, hasAlarm, alarmX, alarmZ,
    };
  }

  nearestTree(x: number, z: number): TreeInfo {
    let bx = 0, bz = 0, best = Infinity, has = false;
    for (const t of this.trees) {
      const d2 = (t.x - x) ** 2 + (t.z - z) ** 2;
      if (d2 < best) { best = d2; bx = t.x; bz = t.z; has = true; }
    }
    const r2 = TREES.shelterRadius * TREES.shelterRadius;
    return { x: bx, z: bz, hasTree: has, sheltered: has && best <= r2 };
  }

  /** Rebuild the bond-line list (call once per frame, after stepping). */
  computeLinks(): void {
    const links = this.socialLinks;
    links.length = 0;
    const bond2 = SOCIAL.bondRadius * SOCIAL.bondRadius;
    const cap = SOCIAL.maxLinks * 4;
    for (const c of this.creatures) {
      if (links.length >= cap) break;
      this.creatureGrid.forEachNear(c.x, c.z, SOCIAL.bondRadius, (o) => {
        if (o.id <= c.id || links.length >= cap) return; // dedup pairs, respect cap
        const dx = o.x - c.x, dz = o.z - c.z;
        if (dx * dx + dz * dz <= bond2) links.push(c.x, c.z, o.x, o.z);
      });
    }
  }

  step(dt: number): void {
    this.dayFactor = this.biome.dayFactor(this.age);
    // food regrows toward an abundance- and season-scaled cap
    const targetCap = Math.min(WORLD.foodMax, Math.round(WORLD.initialFood * params.foodAbundance));
    this.foodDebt += WORLD.foodRegrowPerSec * params.foodAbundance * this.biome.seasonFood(this.age) * dt;
    while (this.foodDebt >= 1 && this.food.length < targetCap) {
      this.food.push(this.growFood());
      this.foodDebt -= 1;
    }

    this.grid.rebuild(this.food);
    this.creatureGrid.rebuild(this.creatures);
    this.pendingChildren.length = 0;

    for (const c of this.creatures) if (c.alive) c.update(dt, this);

    // weather: lightning strikes the exposed at high severity (sheltered creatures are safe)
    this.lightningFlash = Math.max(0, this.lightningFlash - dt);
    if (params.weather > 0.5) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        const hh = WORLD.half - 6;
        this.lightningX = (Math.random() * 2 - 1) * hh;
        this.lightningZ = (Math.random() * 2 - 1) * hh;
        this.lightningFlash = 0.35;
        const kr2 = WEATHER.lightningKillRadius * WEATHER.lightningKillRadius;
        for (const c of this.creatures) {
          if (!c.alive) continue;
          if (this.nearestTree(c.x, c.z).sheltered && !c.canFly) continue; // flyers are exposed aloft
          if ((c.x - this.lightningX) ** 2 + (c.z - this.lightningZ) ** 2 <= kr2) { c.energy = 0; c.alive = false; }
        }
        this.lightningTimer = (WEATHER.lightningMinInterval / params.weather) * (0.6 + Math.random() * 0.9);
      }
    }

    const survivors: Creature[] = [];
    for (const c of this.creatures) {
      if (c.alive) survivors.push(c);
      else { this.deaths++; if (this.events.length < 300) this.events.push({ t: 1, x: c.x, z: c.z }); }
    }
    this.creatures = survivors;

    if (this.pendingChildren.length) {
      this.births += this.pendingChildren.length;
      for (const child of this.pendingChildren) {
        this.creatures.push(child);
        if (this.events.length < 300) this.events.push({ t: 0, x: child.x, z: child.z });
      }
    }

    if (this.food.some((f) => !f.alive)) this.food = this.food.filter((f) => f.alive);

    // a predator is "on the prowl" when it has prey within striking range — drives ominous audio
    let prowl = 0;
    for (const c of this.creatures) {
      if (!c.isPredator) continue;
      let near = false;
      this.creatureGrid.forEachNear(c.x, c.z, 14, (o) => {
        if (near || o === c || !o.alive || o.isPredator) return;
        if ((o.x - c.x) ** 2 + (o.z - c.z) ** 2 <= 196) near = true;
      });
      if (near) prowl++;
    }
    this.prowling = prowl;

    this.age += dt;
  }

  /** Snapshot the whole world to a JSON string (genomes incl. brains, positions, trees, biome seed). */
  serialize(): string {
    const snap: WorldSnapshot = {
      v: 1, biomeSeed: this.biome.seed, age: this.age, births: this.births, deaths: this.deaths,
      generation: this.generation, trees: this.trees,
      creatures: this.creatures.map((c) => ({ g: c.genome, x: c.x, z: c.z, h: c.heading, e: c.energy, a: c.age, gen: c.generation })),
      food: this.food.map((f) => ({ x: f.x, z: f.z })),
    };
    return JSON.stringify(snap);
  }

  /** Restore a world from a snapshot (biome must already be reseeded to snap.biomeSeed by the caller). */
  loadSnapshot(snap: WorldSnapshot): void {
    this.age = snap.age; this.births = snap.births; this.deaths = snap.deaths; this.generation = snap.generation;
    this.trees = snap.trees;
    this.creatures = snap.creatures.map((c) => {
      const cr = newCreature(c.g, c.x, c.z, c.gen, c.e);
      cr.heading = c.h; cr.age = c.a;
      return cr;
    });
    this.food = snap.food.map((f) => makeFood(f.x, f.z));
  }

  stats(): WorldStats {
    let s = 0, sp = 0, se = 0, ag = 0, so = 0, preds = 0, wi = 0, flyers = 0;
    for (const c of this.creatures) {
      s += c.genome.size; sp += c.genome.speed; se += c.genome.sense; ag += c.age; so += c.genome.social;
      wi += c.genome.wings;
      if (c.isPredator) preds++;
      if (c.canFly) flyers++;
    }
    const n = this.creatures.length || 1;
    return {
      population: this.creatures.length,
      food: this.food.length,
      generation: this.generation,
      births: this.births,
      deaths: this.deaths,
      age: this.age,
      avgSize: s / n, avgSpeed: sp / n, avgSense: se / n, avgAge: ag / n, avgSocial: so / n,
      predators: preds, flyers, avgWings: wi / n,
    };
  }
}
