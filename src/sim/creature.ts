import { LIFE, FOOD, BRAIN, SOCIAL, PRED, WEATHER, FLIGHT, PONDS, STAMINA, SPECIES, params } from '../config';
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

/** Nearest-pond info, so creatures can walk around open water. */
export interface PondInfo { x: number; z: number; r: number; hasPond: boolean; dist: number; }

/** What a creature needs from the world to act, without importing the World class. */
export interface CreatureContext {
  half: number;
  findNearestFood(x: number, z: number, radius: number): Food | null;
  eatFood(food: Food): void;
  spawnChild(genome: Genome, x: number, z: number, generation: number, energy: number, novelty?: string | null): void;
  neighbors(x: number, z: number, radius: number, selfId: number, selfPredator: boolean): NeighborInfo;
  nearestTree(x: number, z: number): TreeInfo;
  nearestPond(x: number, z: number): PondInfo;
  burst(type: number, x: number, z: number): void; // queue a particle burst (2 = kill impact)
  dayFactor: number; // 0 = deep night, 1 = midday
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
  asleep = false; // resting through the night
  lungeTimer = 0; // >0 means mid-dart (a committed burst at prey) — drives the pounce animation
  lungeCd = 0; // cooldown before the next dart
  justKilled = 0; // >0 briefly after a successful kill — drives the cartoon impact
  startleTimer = 0; // >0 means a prey is spooked (fright sprint + startle hop + "!" pop)
  stamina = 1; // 0..1 sprint reserve — drains while darting/bolting, recovers at rest
  drinkTimer = 0; // >0 means pausing at a pond's edge for a drink (head-dip)
  drinkCd = 0; // cooldown before wanting another drink
  novelKind: string | null = null; // set if born a striking mutant (drives the narrator + shimmer)
  novelTimer = 0; // >0 = freshly-born novelty still shimmering

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
    const smarts = (SPECIES[g.species] ?? SPECIES[0]!).smarts; // species intelligence (sense + steering)
    this.signalTimer = Math.max(0, this.signalTimer - dt);
    this.alarmTimer = Math.max(0, this.alarmTimer - dt);
    this.lungeTimer = Math.max(0, this.lungeTimer - dt);
    this.lungeCd = Math.max(0, this.lungeCd - dt);
    this.justKilled = Math.max(0, this.justKilled - dt);
    this.startleTimer = Math.max(0, this.startleTimer - dt);
    this.drinkTimer = Math.max(0, this.drinkTimer - dt);
    this.drinkCd = Math.max(0, this.drinkCd - dt);
    this.novelTimer = Math.max(0, this.novelTimer - dt);

    const ni = ctx.neighbors(this.x, this.z, SOCIAL.radius, this.id, predator);
    const tree = ctx.nearestTree(this.x, this.z);
    const sheltered = tree.sheltered && !flying; // flyers are aloft — no shelter from the storm

    // --- sleep: prey rest at night when safe; predators stay on the nocturnal prowl ---
    const threatened = ni.hasPredator || ni.hasAlarm;
    if (threatened) this.drinkTimer = 0; // no time for a drink with a predator about
    this.asleep = ctx.dayFactor < 0.28 && !predator && !flying && !threatened;
    if (this.asleep) {
      this.energy -= LIFE.baseMetabolism * params.metabolism * 0.35 * dt; // resting burns little
      if (weather > WEATHER.startAt && !sheltered) this.energy -= WEATHER.damagePerSec * (weather - WEATHER.startAt) * dt;
      this.age += dt;
      if (this.energy <= 0 || this.age >= this.maxAge) this.alive = false;
      return;
    }

    // --- pick a target: prey (predators) or plant food (prey animals) ---
    let tx = 0, tz = 0, hasTarget = false;
    let food: Food | null = null;
    if (predator) {
      if (ni.hasPrey) { tx = ni.preyX; tz = ni.preyZ; hasTarget = true; }
    } else {
      food = ctx.findNearestFood(this.x, this.z, g.sense * smarts); // smarter species spot food sooner
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

    // --- think (smarter species steer with more finesse, dimmer ones are clumsier) ---
    this.act = think(g.brain, this.senseIn);
    let turn = this.act[0] * BRAIN.maxTurn * (0.6 + 0.4 * smarts);

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
      if (ni.hasPrey) {
        const toPrey = Math.atan2(ni.preyZ - this.z, ni.preyX - this.x);
        const dPrey = Math.hypot(ni.preyX - this.x, ni.preyZ - this.z);
        // in range, rested AND with stamina to spare → commit to a dart
        if (dPrey <= PRED.lungeRange && this.lungeTimer <= 0 && this.lungeCd <= 0 && this.stamina >= STAMINA.lungeMin) {
          this.lungeTimer = PRED.lungeDuration; this.lungeCd = PRED.lungeCooldown;
        }
        if (this.lungeTimer > 0) {
          turn += PRED.huntGain * 1.4 * angDelta(this.heading, toPrey); // locked on, darting straight in
        } else if (ni.hasPredator && dPrey > PRED.circleRadius) {
          // pack tactics: whoever is closest to the quarry drives it; the others flank to the far side
          const dChaser = Math.hypot(ni.predX - ni.preyX, ni.predZ - ni.preyZ);
          if (dChaser < dPrey - 1) {
            // ambusher: swing around to the OPPOSITE side so the fleeing prey is driven onto me
            const nx = ni.preyX - ni.predX, nz = ni.preyZ - ni.predZ;
            const nl = Math.hypot(nx, nz) || 1;
            const fx = ni.preyX + (nx / nl) * PRED.ambushDist;
            const fz = ni.preyZ + (nz / nl) * PRED.ambushDist;
            turn += PRED.orbitGain * angDelta(this.heading, Math.atan2(fz - this.z, fx - this.x));
          } else {
            turn += PRED.huntGain * angDelta(this.heading, toPrey); // chaser: drive the quarry forward
          }
        } else {
          turn += PRED.huntGain * angDelta(this.heading, toPrey); // close in / lone hunter
        }
      } else if (ni.hasPredator) {
        turn += SOCIAL.cohesionGain * angDelta(this.heading, Math.atan2(ni.predZ - this.z, ni.predX - this.x)); // regroup
      }
    } else if (ni.hasPredator) {
      turn += PRED.fleeGain * angDelta(this.heading, Math.atan2(this.z - ni.predZ, this.x - ni.predX));
      this.alarmTimer = SOCIAL.alarmTime; this.threatX = ni.predX; this.threatZ = ni.predZ; // sound the alarm
      // a predator right on top of it → panic! (fright sprint + startle)
      if ((ni.predX - this.x) ** 2 + (ni.predZ - this.z) ** 2 < PRED.panicRadius * PRED.panicRadius) {
        this.startleTimer = PRED.startleTime;
      }
    } else if (ni.hasAlarm) {
      turn += PRED.fleeGain * 0.8 * angDelta(this.heading, Math.atan2(this.z - ni.alarmZ, this.x - ni.alarmX)); // heed a neighbor's alarm
      // catch the herd's fright and pass it on — a panic wave ripples outward from the threat
      this.startleTimer = Math.max(this.startleTimer, PRED.startleTime * 0.6);
      this.alarmTimer = SOCIAL.alarmTime; this.threatX = ni.alarmX; this.threatZ = ni.alarmZ;
    }

    // --- as weather worsens, the grounded head for the nearest tree (flyers can't shelter) ---
    if (weather > WEATHER.startAt && tree.hasTree && !flying && !sheltered) {
      turn += weather * WEATHER.shelterSeekGain * angDelta(this.heading, Math.atan2(tree.z - this.z, tree.x - this.x));
    }

    // --- ponds: walk around open water, but a calm prey will pause at the edge for a drink ---
    if (!flying) {
      const pond = ctx.nearestPond(this.x, this.z);
      if (pond.hasPond) {
        // decide to drink: a relaxed, well-fed prey near water now and then dips in for a sip
        if (!predator && !threatened && this.drinkTimer <= 0 && this.drinkCd <= 0 &&
            this.energy > 0.4 * this.maxEnergy && pond.dist < pond.r + 11 && Math.random() < dt * 0.12) {
          this.drinkTimer = 2.6; this.drinkCd = 16 + Math.random() * 22;
        }
        if (this.drinkTimer > 0) {
          turn += 1.5 * angDelta(this.heading, Math.atan2(pond.z - this.z, pond.x - this.x)); // ease toward the water
        }
        const edge = pond.r + this.radius + 1.2;
        if (pond.dist < edge) {
          const away = Math.atan2(this.z - pond.z, this.x - pond.x);
          turn += PONDS.avoidGain * (1 - pond.dist / edge) * angDelta(this.heading, away); // balances at the shoreline
        }
      }
    }

    turn = Math.max(-SOCIAL.maxTurn, Math.min(SOCIAL.maxTurn, turn));
    this.heading += turn * dt;

    // --- move (predators creep while lining up, then explode forward mid-dart) ---
    const throttle = BRAIN.minThrottle + (1 - BRAIN.minThrottle) * (this.act[1] + 1) / 2;
    // stamina: sprinting drains it, resting refills it
    if (predator && this.lungeTimer > 0) this.stamina = Math.max(0, this.stamina - STAMINA.lungeDrain * dt);
    else if (!predator && this.startleTimer > 0) this.stamina = Math.max(0, this.stamina - STAMINA.sprintDrain * dt);
    else this.stamina = Math.min(1, this.stamina + STAMINA.regen * dt);

    let speedMult = 1;
    if (predator && this.lungeTimer > 0) speedMult = PRED.lungeSpeedMult;
    else if (predator && ni.hasPrey) speedMult = PRED.stalkSpeedMult;
    else if (!predator && this.startleTimer > 0) speedMult = 1 + (PRED.frightSpeedMult - 1) * this.stamina; // a tiring bolt slows
    else if (!predator && this.drinkTimer > 0) speedMult = 0.3; // slow right down to sip
    const speed = g.speed * throttle * (flying ? FLIGHT.speedMult : 1) * speedMult;
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
          this.justKilled = 0.4; this.lungeTimer = 0; // pounce lands → cartoon impact
          ctx.burst(2, prey.x, prey.z); // a bright "POW" at the strike point
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

    // --- reproduce (only once grown up) ---
    if (this.age >= LIFE.matureAge && this.energy >= LIFE.reproThreshold * this.maxEnergy) {
      const childEnergy = this.energy * 0.5;
      this.energy *= 0.5;
      const a = Math.random() * Math.PI * 2;
      // mate with a nearby, well-fed same-type neighbor (genome mixing); otherwise reproduce solo
      const mate = ni.mateRef;
      const childGenome = mate && mate.energy > 0.4 * mate.maxEnergy
        ? mutate(crossover(g, mate.genome))
        : mutate(g);
      const novelty = noveltyKind(childGenome, g); // did a bold mutation just appear?
      ctx.spawnChild(childGenome, this.x + Math.cos(a) * (this.radius + 0.6), this.z + Math.sin(a) * (this.radius + 0.6), this.generation + 1, childEnergy, novelty);
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

/** Describe how a child visibly differs from its parent — drives the "evolutionary surprise" callout. */
function noveltyKind(c: Genome, p: Genome): string | null {
  if (c.species !== p.species) return 'a whole new kind of creature';
  const ratio = c.size / p.size;
  if (ratio > 1.55) return 'a giant';
  if (ratio < 0.64) return 'a curious little dwarf';
  let dh = Math.abs(c.hue - p.hue); dh = Math.min(dh, 1 - dh);
  if (dh > 0.3) return 'a striking new colour';
  if (c.predator > PRED.threshold && p.predator <= PRED.threshold) return 'a new predator';
  if (c.wings > FLIGHT.threshold && p.wings <= FLIGHT.threshold) return 'the gift of flight';
  if (c.speed > p.speed * 1.5) return 'remarkable speed';
  if (c.sense > p.sense * 1.5) return 'sharpened new senses';
  return null;
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
