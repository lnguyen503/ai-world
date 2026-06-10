import { WORLD } from '../config';
import { type Genome, randomGenome } from './genome';
import { type Food, spawnFood } from './food';
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
}

const MAX_CREATURES = 700; // density ceiling to keep things stable and watchable

/** Simple uniform spatial grid over the arena for fast nearest-food queries. */
class FoodGrid {
  private cell = 8;
  private map = new Map<number, Food[]>();
  private cols: number;
  private half: number;

  constructor(half: number) {
    this.half = half;
    this.cols = Math.ceil((half * 2) / this.cell) + 1;
  }

  private key(cx: number, cz: number): number {
    return cx * 100000 + cz;
  }

  rebuild(food: Food[]): void {
    this.map.clear();
    for (const f of food) {
      if (!f.alive) continue;
      const k = this.key(this.toCell(f.x), this.toCell(f.z));
      const bucket = this.map.get(k);
      if (bucket) bucket.push(f);
      else this.map.set(k, [f]);
    }
  }

  private toCell(v: number): number {
    return Math.floor((v + this.half) / this.cell);
  }

  nearest(x: number, z: number, radius: number): Food | null {
    const r = Math.ceil(radius / this.cell);
    const cx = this.toCell(x);
    const cz = this.toCell(z);
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
  // cols kept for potential future bounds checks
  get _cols(): number { return this.cols; }
}

export class World implements CreatureContext {
  readonly half = WORLD.half;
  creatures: Creature[] = [];
  food: Food[] = [];
  age = 0;
  births = 0;
  deaths = 0;
  generation = 0;

  private grid = new FoodGrid(WORLD.half);
  private pendingChildren: Creature[] = [];
  private foodDebt = 0;

  constructor() {
    for (let i = 0; i < WORLD.initialCreatures; i++) {
      const h = WORLD.half - 4;
      this.creatures.push(
        newCreature(randomGenome(), (Math.random() * 2 - 1) * h, (Math.random() * 2 - 1) * h),
      );
    }
    for (let i = 0; i < WORLD.initialFood; i++) this.food.push(spawnFood());
  }

  // --- CreatureContext ---
  findNearestFood(x: number, z: number, radius: number): Food | null {
    return this.grid.nearest(x, z, radius);
  }

  eatFood(food: Food): void {
    food.alive = false;
  }

  spawnChild(genome: Genome, x: number, z: number, generation: number, energy: number): void {
    if (this.creatures.length + this.pendingChildren.length >= MAX_CREATURES) return;
    const h = this.half - 1;
    const cx = Math.max(-h, Math.min(h, x));
    const cz = Math.max(-h, Math.min(h, z));
    this.pendingChildren.push(newCreature(genome, cx, cz, generation, energy));
    if (generation > this.generation) this.generation = generation;
  }

  /** Advance the simulation by dt sim-seconds. */
  step(dt: number): void {
    // regrow food toward the cap
    this.foodDebt += WORLD.foodRegrowPerSec * dt;
    while (this.foodDebt >= 1 && this.food.length < WORLD.foodMax) {
      this.food.push(spawnFood());
      this.foodDebt -= 1;
    }

    this.grid.rebuild(this.food);
    this.pendingChildren.length = 0;

    for (const c of this.creatures) {
      if (c.alive) c.update(dt, this);
    }

    // reap dead creatures
    const survivors: Creature[] = [];
    for (const c of this.creatures) {
      if (c.alive) survivors.push(c);
      else this.deaths++;
    }
    this.creatures = survivors;

    // add this step's newborns
    if (this.pendingChildren.length) {
      this.births += this.pendingChildren.length;
      for (const child of this.pendingChildren) this.creatures.push(child);
    }

    // remove eaten food
    if (this.food.some((f) => !f.alive)) this.food = this.food.filter((f) => f.alive);

    this.age += dt;
  }

  stats(): WorldStats {
    let s = 0, sp = 0, se = 0;
    for (const c of this.creatures) {
      s += c.genome.size; sp += c.genome.speed; se += c.genome.sense;
    }
    const n = this.creatures.length || 1;
    return {
      population: this.creatures.length,
      food: this.food.length,
      generation: this.generation,
      births: this.births,
      deaths: this.deaths,
      age: this.age,
      avgSize: s / n,
      avgSpeed: sp / n,
      avgSense: se / n,
    };
  }
}
