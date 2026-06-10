import { WORLD, params } from '../config';
import type { Biome } from '../biome';
import { type Genome, randomGenome } from './genome';
import { type Food, makeFood } from './food';
import { Creature, type CreatureContext, newCreature } from './creature';

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

export class World implements CreatureContext {
  readonly half = WORLD.half;
  creatures: Creature[] = [];
  food: Food[] = [];
  age = 0;
  births = 0;
  deaths = 0;
  generation = 0;

  private biome: Biome;
  private grid = new FoodGrid(WORLD.half);
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

  step(dt: number): void {
    // food regrows toward an abundance- and season-scaled cap
    const targetCap = Math.min(WORLD.foodMax, Math.round(WORLD.initialFood * params.foodAbundance));
    this.foodDebt += WORLD.foodRegrowPerSec * params.foodAbundance * this.biome.seasonFood(this.age) * dt;
    while (this.foodDebt >= 1 && this.food.length < targetCap) {
      this.food.push(this.growFood());
      this.foodDebt -= 1;
    }

    this.grid.rebuild(this.food);
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
    let s = 0, sp = 0, se = 0, ag = 0;
    for (const c of this.creatures) { s += c.genome.size; sp += c.genome.speed; se += c.genome.sense; ag += c.age; }
    const n = this.creatures.length || 1;
    return {
      population: this.creatures.length,
      food: this.food.length,
      generation: this.generation,
      births: this.births,
      deaths: this.deaths,
      age: this.age,
      avgSize: s / n, avgSpeed: sp / n, avgSense: se / n, avgAge: ag / n,
    };
  }
}
