import { LIFE, FOOD } from '../config';
import { type Genome, mutate } from './genome';
import type { Food } from './food';

/** What a creature needs from the world to act, without importing the World class. */
export interface CreatureContext {
  half: number;
  findNearestFood(x: number, z: number, radius: number): Food | null;
  eatFood(food: Food): void;
  spawnChild(genome: Genome, x: number, z: number, generation: number, energy: number): void;
}

let nextCreatureId = 1;

export class Creature {
  readonly id: number;
  genome: Genome;
  x: number;
  z: number;
  heading: number; // radians on the X/Z plane
  energy: number;
  age = 0;
  generation: number;
  alive = true;

  constructor(genome: Genome, x: number, z: number, generation: number, energy: number) {
    this.id = nextCreatureId++;
    this.genome = genome;
    this.x = x;
    this.z = z;
    this.heading = Math.random() * Math.PI * 2;
    this.generation = generation;
    this.energy = energy;
  }

  get radius(): number {
    return this.genome.size * 0.5;
  }

  get maxEnergy(): number {
    return LIFE.maxEnergyBase + this.genome.size * LIFE.maxEnergyPerSize;
  }

  get maxAge(): number {
    return LIFE.maxAgeBase + this.genome.size * LIFE.maxAgePerSize;
  }

  /** Advance one sim-step. Mutates self; may eat, reproduce, or die. */
  update(dt: number, ctx: CreatureContext): void {
    const g = this.genome;

    // --- sense & steer ---
    const food = ctx.findNearestFood(this.x, this.z, g.sense);
    if (food) {
      const target = Math.atan2(food.z - this.z, food.x - this.x);
      this.heading = steerToward(this.heading, target, 6 * dt);
    } else {
      this.heading += (Math.random() - 0.5) * 2.2 * dt; // wander
    }

    // --- move ---
    const dist = g.speed * dt;
    this.x += Math.cos(this.heading) * dist;
    this.z += Math.sin(this.heading) * dist;
    this.bounceOffEdges(ctx.half);

    // --- metabolism: baseline + movement cost ---
    const moveCost = LIFE.moveCostK * g.size * g.speed * g.speed;
    this.energy -= (LIFE.baseMetabolism + moveCost) * dt;

    // --- eat ---
    if (food) {
      const eatR = this.radius + LIFE.eatRadiusBase + FOOD.radius;
      if (dist2(this.x, this.z, food.x, food.z) <= eatR * eatR && food.alive) {
        ctx.eatFood(food);
        this.energy = Math.min(this.maxEnergy, this.energy + FOOD.energy);
      }
    }

    // --- reproduce ---
    if (this.energy >= LIFE.reproThreshold * this.maxEnergy) {
      const childEnergy = this.energy * 0.5;
      this.energy *= 0.5;
      const a = Math.random() * Math.PI * 2;
      ctx.spawnChild(
        mutate(g),
        this.x + Math.cos(a) * (this.radius + 0.6),
        this.z + Math.sin(a) * (this.radius + 0.6),
        this.generation + 1,
        childEnergy,
      );
    }

    // --- age & death ---
    this.age += dt;
    if (this.energy <= 0 || this.age >= this.maxAge) this.alive = false;
  }

  private bounceOffEdges(half: number): void {
    const m = half - 1;
    if (this.x < -m || this.x > m) {
      this.x = Math.max(-m, Math.min(m, this.x));
      this.heading = Math.PI - this.heading;
    }
    if (this.z < -m || this.z > m) {
      this.z = Math.max(-m, Math.min(m, this.z));
      this.heading = -this.heading;
    }
  }
}

function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** Rotate `from` toward `to` by at most `maxDelta` radians (shortest way). */
function steerToward(from: number, to: number, maxDelta: number): number {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + Math.max(-maxDelta, Math.min(maxDelta, diff));
}

export function newCreature(genome: Genome, x: number, z: number, generation = 0, energy = LIFE.startEnergy): Creature {
  return new Creature(genome, x, z, generation, energy);
}
