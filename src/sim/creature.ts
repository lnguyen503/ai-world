import { LIFE, FOOD, BRAIN, params } from '../config';
import { type Genome, mutate } from './genome';
import { think } from './brain';
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
  senseIn: number[] = [0, 0, 0, 0, 1]; // last brain inputs (for the follow panel)
  act: [number, number] = [0, 0]; // last brain outputs [turn, throttle]

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

    // --- sense: build the brain's inputs (food direction is heading-relative) ---
    const food = ctx.findNearestFood(this.x, this.z, g.sense);
    let fSin = 0, fCos = 0, fClose = 0;
    if (food) {
      const ang = Math.atan2(food.z - this.z, food.x - this.x) - this.heading;
      fSin = Math.sin(ang);
      fCos = Math.cos(ang);
      const d = Math.hypot(food.x - this.x, food.z - this.z);
      fClose = 1 - Math.min(1, d / g.sense); // 1 = right on top of it, 0 = at sense edge
    }
    const energy01 = Math.max(0, Math.min(1, this.energy / this.maxEnergy));
    this.senseIn = [fSin, fCos, fClose, energy01, 1];

    // --- think & act: the evolved neural net decides turn + throttle ---
    this.act = think(g.brain, this.senseIn);
    this.heading += this.act[0] * BRAIN.maxTurn * dt;
    const throttle = BRAIN.minThrottle + (1 - BRAIN.minThrottle) * (this.act[1] + 1) / 2;
    const speed = g.speed * throttle;

    // --- move ---
    this.x += Math.cos(this.heading) * speed * dt;
    this.z += Math.sin(this.heading) * speed * dt;
    this.bounceOffEdges(ctx.half);

    // --- metabolism: baseline + movement cost (uses ACTUAL speed, so throttling saves energy) ---
    const moveCost = LIFE.moveCostK * g.size * speed * speed;
    this.energy -= (LIFE.baseMetabolism + moveCost) * params.metabolism * dt;

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

export function newCreature(genome: Genome, x: number, z: number, generation = 0, energy = LIFE.startEnergy): Creature {
  return new Creature(genome, x, z, generation, energy);
}
