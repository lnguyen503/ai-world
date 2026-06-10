import { LIFE, FOOD, BRAIN, SOCIAL, PRED, WEATHER, FLIGHT, params } from '../config';
import { type Genome, mutate, crossover } from './genome';
import { think } from './brain';
import type { Food } from './food';

/** Aggregated info about a creature's neighbors, for social + predator/prey steering. */
export interface NeighborInfo {
  count: number;
  cx: number; cz: number;              // centroid of neighbors (cohesion target)
  sepX: number; sepZ: number;          // summed away-from-too-close vector (separation)
  alignSin: number; alignCos: number;  // summed neighbor heading (alignment)
  sigX: number; sigZ: number;          // vector toward the nearest signaling neighbor
  hasSignal: boolean;
  predX: number; predZ: number; hasPredator: boolean;        // nearest predator (prey flees it / predators pack toward it)
  preyX: number; preyZ: number; hasPrey: boolean; preyRef: Creature | null; // nearest prey (predator hunts it)
  mateRef: Creature | null;            // nearest same-type, well-fed neighbor (a mate)
  hasAlarm: boolean; alarmX: number; alarmZ: number;         // an alarmed neighbor's threat (heard alarm call)
}

/** Nearest-tree shelter info for weathering storms. */
export interface TreeInfo { x: number; z: number; hasTree: boolean; sheltered: boolean; }

/** What a creature needs from the world to act, without importing the World class. */
export interface CreatureContext {
  half: number;
  findNearestFood(x: number, z: number, radius: number): Food | null;
  eatFood(food: Food): void;
  spawnChild(genome: Genome, x: number, z: number, generation: number, energy: number): void;
  neighbors(x: number, z: number, radius: number, selfId: number, selfPredator: boolean): NeighborInfo;
  nearestTree(x: number, z: number): TreeInfo;
}

let nextCreatureId = 1;

export class Creature {
  readonly id: number;
  readonly name: string;
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
  signalTimer = 0; // >0 means broadcasting "found food!" to neighbors
  alarmTimer = 0; // >0 means raising the alarm (a predator is near)
  threatX = 0; threatZ = 0; // last sensed predator position (shared via the alarm)

  constructor(genome: Genome, x: number, z: number, generation: number, energy: number) {
    this.id = nextCreatureId++;
    this.name = makeName();
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

  get isPredator(): boolean {
    return this.genome.predator > PRED.threshold;
  }

  get canFly(): boolean {
    return this.genome.wings > FLIGHT.threshold;
  }

  /** Advance one sim-step. Mutates self; may hunt, eat, reproduce, or die. */
  update(dt: number, ctx: CreatureContext): void {
    const g = this.genome;
    const predator = this.isPredator;
    const flying = this.canFly;
    const weather = params.weather;
    this.signalTimer = Math.max(0, this.signalTimer - dt);
    this.alarmTimer = Math.max(0, this.alarmTimer - dt);

    const ni = ctx.neighbors(this.x, this.z, SOCIAL.radius, this.id, predator);
    const tree = ctx.nearestTree(this.x, this.z);
    const sheltered = tree.sheltered && !flying; // flyers are aloft — no shelter from the storm

    // --- pick a target: prey (predators) or plant food (prey animals) ---
    let tx = 0, tz = 0, hasTarget = false;
    let food: Food | null = null;
    if (predator) {
      if (ni.hasPrey) { tx = ni.preyX; tz = ni.preyZ; hasTarget = true; }
    } else {
      food = ctx.findNearestFood(this.x, this.z, g.sense);
      if (food) { tx = food.x; tz = food.z; hasTarget = true; }
    }

    // --- brain inputs (target direction is heading-relative) ---
    let fSin = 0, fCos = 0, fClose = 0;
    if (hasTarget) {
      const ang = Math.atan2(tz - this.z, tx - this.x) - this.heading;
      fSin = Math.sin(ang); fCos = Math.cos(ang);
      fClose = 1 - Math.min(1, Math.hypot(tx - this.x, tz - this.z) / g.sense);
    }
    const energy01 = Math.max(0, Math.min(1, this.energy / this.maxEnergy));
    this.senseIn = [fSin, fCos, fClose, energy01, 1];

    // --- think ---
    this.act = think(g.brain, this.senseIn);
    let turn = this.act[0] * BRAIN.maxTurn;

    // --- social: herd + communicate ---
    if (ni.count > 0) {
      const social = g.social;
      turn += social * SOCIAL.cohesionGain * angDelta(this.heading, Math.atan2(ni.cz - this.z, ni.cx - this.x));
      turn += social * SOCIAL.alignGain * angDelta(this.heading, Math.atan2(ni.alignSin, ni.alignCos));
      if (ni.sepX !== 0 || ni.sepZ !== 0) turn += SOCIAL.separationGain * angDelta(this.heading, Math.atan2(ni.sepZ, ni.sepX));
      if (ni.hasSignal && !predator) turn += SOCIAL.signalGain * angDelta(this.heading, Math.atan2(ni.sigZ, ni.sigX));
    }

    // --- predators hunt prey & pack with other predators; prey flee & raise the alarm ---
    if (predator) {
      if (ni.hasPrey) turn += PRED.huntGain * angDelta(this.heading, Math.atan2(ni.preyZ - this.z, ni.preyX - this.x));
      if (ni.hasPredator) turn += SOCIAL.cohesionGain * angDelta(this.heading, Math.atan2(ni.predZ - this.z, ni.predX - this.x)); // form a pack
    } else if (ni.hasPredator) {
      turn += PRED.fleeGain * angDelta(this.heading, Math.atan2(this.z - ni.predZ, this.x - ni.predX));
      this.alarmTimer = SOCIAL.alarmTime; this.threatX = ni.predX; this.threatZ = ni.predZ; // sound the alarm
    } else if (ni.hasAlarm) {
      turn += PRED.fleeGain * 0.8 * angDelta(this.heading, Math.atan2(this.z - ni.alarmZ, this.x - ni.alarmX)); // heed a neighbor's alarm
    }

    // --- as weather worsens, the grounded head for the nearest tree (flyers can't shelter) ---
    if (weather > WEATHER.startAt && tree.hasTree && !flying && !sheltered) {
      turn += weather * WEATHER.shelterSeekGain * angDelta(this.heading, Math.atan2(tree.z - this.z, tree.x - this.x));
    }

    turn = Math.max(-SOCIAL.maxTurn, Math.min(SOCIAL.maxTurn, turn));
    this.heading += turn * dt;

    // --- move ---
    const throttle = BRAIN.minThrottle + (1 - BRAIN.minThrottle) * (this.act[1] + 1) / 2;
    const speed = g.speed * throttle * (flying ? FLIGHT.speedMult : 1);
    this.x += Math.cos(this.heading) * speed * dt;
    this.z += Math.sin(this.heading) * speed * dt;
    this.bounceOffEdges(ctx.half);

    // --- metabolism (predators and flyers burn more) ---
    const moveCost = LIFE.moveCostK * g.size * speed * speed;
    this.energy -= (LIFE.baseMetabolism + moveCost) * params.metabolism
      * (predator ? PRED.metabolismMult : 1) * (flying ? FLIGHT.costMult : 1) * dt;

    // --- weather: an EXPOSED creature is battered by the storm; shelter protects it ---
    if (weather > WEATHER.startAt && !sheltered) {
      this.energy -= WEATHER.damagePerSec * (weather - WEATHER.startAt) * dt;
    }

    // --- eat: predator kills prey on contact; prey grazes plant food ---
    if (predator) {
      const prey = ni.preyRef;
      // a ground predator can't catch a flyer — only a flying predator can
      if (prey && prey.alive && !(prey.canFly && !flying)) {
        const eatR = this.radius + prey.radius + PRED.eatRadiusBonus;
        if (dist2(this.x, this.z, prey.x, prey.z) <= eatR * eatR) {
          this.energy = Math.min(this.maxEnergy, this.energy + PRED.gain + prey.energy * 0.4);
          prey.energy = 0; prey.alive = false;
          this.signalTimer = SOCIAL.signalTime;
        }
      }
    } else if (food) {
      const eatR = this.radius + LIFE.eatRadiusBase + FOOD.radius;
      if (dist2(this.x, this.z, food.x, food.z) <= eatR * eatR && food.alive) {
        ctx.eatFood(food);
        this.energy = Math.min(this.maxEnergy, this.energy + FOOD.energy);
        this.signalTimer = SOCIAL.signalTime;
      }
    }

    // --- reproduce ---
    if (this.energy >= LIFE.reproThreshold * this.maxEnergy) {
      const childEnergy = this.energy * 0.5;
      this.energy *= 0.5;
      const a = Math.random() * Math.PI * 2;
      // mate with a nearby, well-fed same-type neighbor (genome mixing); otherwise reproduce solo
      const mate = ni.mateRef;
      const childGenome = mate && mate.energy > 0.4 * mate.maxEnergy
        ? mutate(crossover(g, mate.genome))
        : mutate(g);
      ctx.spawnChild(childGenome, this.x + Math.cos(a) * (this.radius + 0.6), this.z + Math.sin(a) * (this.radius + 0.6), this.generation + 1, childEnergy);
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

/** Signed shortest angle (radians, -pi..pi) to rotate from heading `a` toward `b`. */
function angDelta(a: number, b: number): number {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const NAME_A = ['Mo', 'Ka', 'Zi', 'Lu', 'Ta', 'Ne', 'Ro', 'Bi', 'Su', 'Ve', 'Pa', 'Xi', 'Fen', 'Dra', 'Ny', 'Wo', 'Ki', 'Ja', 'Ophe', 'Tum'];
const NAME_B = ['ki', 'na', 'lo', 'sha', 'mi', 'ra', 'to', 'vi', 'don', 'beli', 'sa', 'que', 'rin', 'la', 'ko', 'pu', 'zee', 'fa'];
const NAME_C = ['', '', '', 'a', 'o', 'us', 'ette', 'wyn', 'ix'];

/** A small randomly-assembled name, e.g. "Mokira", "Drashe", "Nyf-ix". */
function makeName(): string {
  const a = NAME_A[Math.floor(Math.random() * NAME_A.length)]!;
  const b = NAME_B[Math.floor(Math.random() * NAME_B.length)]!;
  const c = NAME_C[Math.floor(Math.random() * NAME_C.length)]!;
  return a + b + c;
}

export function newCreature(genome: Genome, x: number, z: number, generation = 0, energy = LIFE.startEnergy): Creature {
  return new Creature(genome, x, z, generation, energy);
}
