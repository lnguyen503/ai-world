import { WORLD, SOCIAL, params } from '../config';
import type { Biome } from '../biome';
import { type Genome, randomGenome } from './genome';
import { type Food, makeFood } from './food';
import { Creature, type CreatureContext, type NeighborInfo, newCreature } from './creature';

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
}

const MAX_CREATURES = 700;

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

  spawnChild(genome: Genome, x: number, z: number, generation: number, energy: number): void {
    if (this.creatures.length + this.pendingChildren.length >= MAX_CREATURES) return;
    const h = this.half - 1;
    this.pendingChildren.push(
      newCreature(genome, Math.max(-h, Math.min(h, x)), Math.max(-h, Math.min(h, z)), generation, energy),
    );
    if (generation > this.generation) this.generation = generation;
  }

  neighbors(x: number, z: number, radius: number, selfId: number): NeighborInfo {
    let count = 0, cxs = 0, czs = 0, sepX = 0, sepZ = 0, aSin = 0, aCos = 0;
    let sigX = 0, sigZ = 0, hasSignal = false, bestSig = Infinity;
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
    });
    if (count > 0) { cxs /= count; czs /= count; }
    return { count, cx: cxs, cz: czs, sepX, sepZ, alignSin: aSin, alignCos: aCos, sigX, sigZ, hasSignal };
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

    const survivors: Creature[] = [];
    for (const c of this.creatures) {
      if (c.alive) survivors.push(c); else this.deaths++;
    }
    this.creatures = survivors;

    if (this.pendingChildren.length) {
      this.births += this.pendingChildren.length;
      for (const child of this.pendingChildren) this.creatures.push(child);
    }

    if (this.food.some((f) => !f.alive)) this.food = this.food.filter((f) => f.alive);

    this.age += dt;
  }

  stats(): WorldStats {
    let s = 0, sp = 0, se = 0, ag = 0, so = 0;
    for (const c of this.creatures) {
      s += c.genome.size; sp += c.genome.speed; se += c.genome.sense; ag += c.age; so += c.genome.social;
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
    };
  }
}
