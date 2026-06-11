import { WORLD, SOCIAL, TREES, PONDS, WEATHER, SPECIES, LIFE, ECO, PLAGUE, params, evo } from '../config';
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
  speciesCounts: number[];
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
  gloom = 0; // 0..1 cataclysm pall: darkens the sky + crashes food (impact winter, ash, freeze)
  volcanoX = 0; volcanoZ = 0; volcanoT = 0; // active eruption: vent location + seconds remaining
  /** 0..1 eruption glow for the renderer (reddens the sky, lava light), ramps down as it ends. */
  get volcanoGlow(): number { return Math.min(1, this.volcanoT / 4); }
  private lavaDebt = 0; // paces the sustained lava kills near the vent
  plagueActive = false; // a contagion is circulating (drives the narrator + HUD)
  infectedCount = 0; // how many creatures are currently sick (for the HUD)
  era = 1; // the world's geological era — bumps after a mass die-off + radiation (punctuated equilibrium)
  radiationT = 0; // seconds of an adaptive-radiation surge remaining (boosted mutation + breeding)
  /** Fired when a new era dawns (a radiation begins) — the UI shows the banner + logs it. */
  onNewEra: (era: number, label: string) => void = () => {};
  /** 0..1 radiation surge for the sim (eases breeding, cranks mutation) + the narrator. */
  get radiationBoost(): number { return Math.min(1, this.radiationT / 8); }
  private popHigh = 0; // a slowly-decaying recent population high-water mark (detects a crash)
  private eraCd = 0; // cooldown so one die-off triggers one era, not a flurry
  coldT = 0; // an ice age: seconds of deep cold remaining (a slow global cataclysm)
  /** 0..1 freeze intensity for the renderer (whiteout) + the sim (food crash, cold drain). */
  get cold(): number { return Math.min(1, this.coldT / 8); } // holds at 1, then thaws over the last 8s
  private freezeDebt = 0; // paces the meadow icing over
  crowding = 1; // ≥1; rises as the population passes the soft cap (brakes reproduction + raises metabolism)
  get camoHue(): number { return this.biome.camoHue; } // the ground hue prey camouflage toward
  prowling = 0; // # of predators currently stalking nearby prey (ominous audio + narration)
  killFlash = 0; // >0 briefly after a kill — lets the narrator call the play-by-play
  lastKillX = 0; lastKillZ = 0; // where the most recent kill happened (cinematic camera drifts there)
  noveltyFlash = 0; // >0 briefly after a striking mutant is born
  lastNovelty: string | null = null; // what the surprise was (for the narrator)
  lastNoveltyX = 0; lastNoveltyZ = 0; // where it was born (camera can swoop there)
  events: { t: 0 | 1 | 2 | 3; x: number; z: number }[] = []; // birth(0)/death(1)/kill(2)/novelty(3) events
  private lightningTimer = 0;

  private biome: Biome;
  private grid = new FoodGrid(WORLD.half);
  private creatureGrid = new CreatureGrid(WORLD.half);
  private pendingChildren: Creature[] = [];
  private foodDebt = 0;
  private bloomDebt = 0;
  /** Painted drought/bloom zones (god-mode brush): drought clears food, bloom keeps it lush, for a while. */
  zones: { x: number; z: number; r: number; drought: boolean; life: number }[] = [];

  constructor(biome: Biome) {
    this.biome = biome;
    for (let i = 0; i < WORLD.initialCreatures; i++) {
      const h = WORLD.half - 4;
      const c = newCreature(randomGenome(), (Math.random() * 2 - 1) * h, (Math.random() * 2 - 1) * h);
      c.age = Math.random() * 35; // stagger founding ages so the cohort doesn't all die of old age at once
      c.energy = LIFE.startEnergy * (0.6 + Math.random() * 0.5);
      this.creatures.push(c);
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

  /** Rain a cluster of food onto a spot (the god-mode Feed tool). */
  addFoodAt(x: number, z: number, n: number, spread = 5): void {
    const h = this.half - 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      const fx = Math.max(-h, Math.min(h, x + Math.cos(a) * r));
      const fz = Math.max(-h, Math.min(h, z + Math.sin(a) * r));
      this.food.push(makeFood(fx, fz));
      if (this.events.length < 300) this.events.push({ t: 0, x: fx, z: fz }); // a little sparkle
    }
  }

  /** Cataclysm — an asteroid slams down: mass death in a wide radius + a lasting impact winter. */
  asteroidImpact(): { x: number; z: number } {
    const h = this.half - 10;
    const cx = (Math.random() * 2 - 1) * h, cz = (Math.random() * 2 - 1) * h;
    const r2 = 22 * 22;
    for (const c of this.creatures) if (c.alive && (c.x - cx) ** 2 + (c.z - cz) ** 2 <= r2) { c.energy = 0; c.alive = false; }
    this.burst(2, cx, cz); // a big impact POW
    this.gloom = 1; this.killFlash = 1.2; this.lastKillX = cx; this.lastKillZ = cz;
    return { x: cx, z: cz };
  }

  /** Cataclysm — a volcano erupts: an initial blast, then a sustained lava field + lingering ashfall. */
  eruptVolcano(): { x: number; z: number } {
    const h = this.half - 12;
    const cx = (Math.random() * 2 - 1) * h, cz = (Math.random() * 2 - 1) * h;
    this.volcanoX = cx; this.volcanoZ = cz; this.volcanoT = 18; // ~18s of active eruption
    const r2 = 13 * 13; // the initial pyroclastic blast
    for (const c of this.creatures) if (c.alive && (c.x - cx) ** 2 + (c.z - cz) ** 2 <= r2) { c.energy = 0; c.alive = false; }
    this.food = this.food.filter((f) => (f.x - cx) ** 2 + (f.z - cz) ** 2 > r2); // scorch the ground
    this.burst(2, cx, cz);
    this.gloom = Math.max(this.gloom, 0.7); // ashfall
    return { x: cx, z: cz };
  }

  /** Cataclysm — a global ice age: a white-out that crashes food and saps the herd, then thaws. */
  iceAge(): void { this.coldT = 38; } // ~30s of deep freeze + an 8s thaw

  /** Begin a new era with an adaptive radiation — a burst of mutation + breeding (the recovery payoff).
   *  Called on demand (the 🌟 Radiation tool) or automatically when the population rebounds from a crash. */
  radiate(label: string): void {
    this.radiationT = 28; // ~20s of surge + an 8s fade
    this.eraCd = 30; // don't immediately re-trigger
    this.era++;
    this.onNewEra(this.era, label);
  }

  /** Cataclysm — a plague: infect a few patient-zeros; it spreads, kills, and selects for resistance. */
  startPlague(): void {
    const alive = this.creatures.filter((c) => c.alive);
    if (!alive.length) return;
    for (let i = 0; i < Math.min(alive.length, PLAGUE.seeds); i++) {
      const c = alive[Math.floor(Math.random() * alive.length)]!;
      c.infected = PLAGUE.duration; c.immune = 0;
    }
    this.plagueActive = true;
  }

  /** Advance the contagion: sick creatures drain (less if resistant), recover into immunity, and infect
   *  susceptible neighbours. Resistance is heritable, so each plague selects the survivors' genes upward. */
  private stepPlague(dt: number): void {
    let infected = 0;
    for (const c of this.creatures) {
      if (!c.alive) continue;
      if (c.immune > 0) c.immune = Math.max(0, c.immune - dt);
      if (c.infected > 0) {
        infected++;
        c.infected = Math.max(0, c.infected - dt);
        const res = c.genome.resistance ?? 0;
        c.energy -= PLAGUE.drain * (1 - 0.85 * res) * dt; // the resistant barely feel it
        if (c.infected <= 0 && c.alive) c.immune = PLAGUE.immunity; // a survivor clears it + is briefly immune
      }
    }
    this.infectedCount = infected;
    this.plagueActive = infected > 0;
    if (!infected) return;
    const r2 = PLAGUE.radius * PLAGUE.radius;
    for (const c of this.creatures) {
      if (!c.alive || c.infected <= 0) continue;
      this.creatureGrid.forEachNear(c.x, c.z, PLAGUE.radius, (o) => {
        if (!o.alive || o.infected > 0 || o.immune > 0) return;
        if ((o.x - c.x) ** 2 + (o.z - c.z) ** 2 > r2) return;
        const res = o.genome.resistance ?? 0;
        if (Math.random() < PLAGUE.spreadPerSec * (1 - res) * dt) o.infected = PLAGUE.duration;
      });
    }
  }

  /** Paint a drought (clears food + suppresses growth) or a bloom (a lush flush) over a spot. */
  addZone(x: number, z: number, drought: boolean): void {
    this.zones.push({ x, z, r: 14, drought, life: 24 });
    if (!drought) this.addFoodAt(x, z, 20, 12); // bloom starts with an instant flush
  }

  /** Drop a fresh creature at a spot (god-mode Spawn tools), as a predator or as prey. */
  spawnAt(x: number, z: number, asPredator: boolean): void {
    const g = randomGenome();
    g.predator = asPredator ? 0.8 : 0.2;
    this.spawnChild(g, x, z, this.generation, LIFE.startEnergy * 1.2);
  }

  /** Strike lightning at a spot (the god-mode Smite tool): a bolt + flash that kills in a radius. */
  smite(x: number, z: number): void {
    this.lightningX = x; this.lightningZ = z; this.lightningFlash = 0.4;
    const r2 = 9 * 9;
    for (const c of this.creatures) {
      if (c.alive && (c.x - x) ** 2 + (c.z - z) ** 2 <= r2) { c.energy = 0; c.alive = false; }
    }
  }

  eatFood(food: Food): void { food.alive = false; }

  burst(type: number, x: number, z: number): void {
    if (this.events.length < 300) this.events.push({ t: type as 0 | 1 | 2 | 3, x, z });
    if (type === 2) { this.killFlash = 1.2; this.lastKillX = x; this.lastKillZ = z; } // a kill just happened
  }

  spawnChild(genome: Genome, x: number, z: number, generation: number, energy: number, novelty: string | null = null, parentId = -1, parentName = ''): void {
    if (this.creatures.length + this.pendingChildren.length >= MAX_CREATURES) return;
    const h = this.half - 1;
    const cx = Math.max(-h, Math.min(h, x)), cz = Math.max(-h, Math.min(h, z));
    const cr = newCreature(genome, cx, cz, generation, energy);
    cr.parentId = parentId; cr.parentName = parentName;
    if (novelty) {
      cr.novelKind = novelty; cr.novelTimer = 5;
      this.lastNovelty = novelty; this.noveltyFlash = 1.5;
      this.lastNoveltyX = cx; this.lastNoveltyZ = cz;
      this.burst(3, cx, cz); // a bright sparkle marks the surprise
    }
    this.pendingChildren.push(cr);
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
    this.gloom = Math.max(0, this.gloom - dt * 0.022); // a cataclysm pall lifts over ~45s
    // adaptive radiation: while it lasts, evolution runs hot (mutation scaled globally via `evo`)
    this.radiationT = Math.max(0, this.radiationT - dt);
    evo.mutationScale = 1 + this.radiationBoost * 2.2;
    // punctuated equilibrium: track a decaying population high-water mark; a hard crash that then
    // has survivors left triggers a fresh era + radiation — the explosive recovery after a die-off
    const pop = this.creatures.length;
    this.popHigh = Math.max(pop, this.popHigh - dt * 0.6);
    this.eraCd = Math.max(0, this.eraCd - dt);
    if (this.eraCd <= 0 && this.radiationT <= 0 && this.popHigh >= 50 && pop > 4 && pop < this.popHigh * 0.4) {
      this.radiate('life rebounds from the brink');
      this.popHigh = pop; // reset the mark to the new baseline
    }
    // an active volcano keeps ash in the sky, spits embers, and roasts anything near the vent
    if (this.volcanoT > 0) {
      this.volcanoT = Math.max(0, this.volcanoT - dt);
      this.gloom = Math.max(this.gloom, 0.6 * this.volcanoGlow); // top up the ashfall while erupting
      const lr2 = 8 * 8;
      for (const c of this.creatures) if (c.alive && (c.x - this.volcanoX) ** 2 + (c.z - this.volcanoZ) ** 2 <= lr2) { c.energy = 0; c.alive = false; }
      this.lavaDebt += 9 * dt; // ember sparks fly from the vent
      while (this.lavaDebt >= 1) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 6;
        this.burst(2, this.volcanoX + Math.cos(a) * r, this.volcanoZ + Math.sin(a) * r);
        this.lavaDebt -= 1;
      }
    }
    // an ice age: the cold saps every creature and the meadow ices over, until it slowly thaws
    if (this.coldT > 0) {
      this.coldT = Math.max(0, this.coldT - dt);
      const cold = this.cold;
      for (const c of this.creatures) if (c.alive) c.energy -= 0.8 * cold * dt; // the chill drains the herd
      this.freezeDebt += this.food.length * 0.05 * cold * dt; // existing food freezes over
      while (this.freezeDebt >= 1 && this.food.length) { this.food.pop(); this.freezeDebt -= 1; }
    }
    // crowding brake: ≥1, climbing as the population passes the soft cap (self-limits before overshoot)
    this.crowding = 1 + Math.max(0, (this.creatures.length - ECO.softCap) / ECO.softCap) * ECO.crowdingK;
    // food regrows toward an abundance- and season-scaled cap, faster when the meadow is grazed bare,
    // and barely at all under a cataclysm pall (impact winter / ash / freeze)
    const targetCap = Math.min(WORLD.foodMax, Math.round(WORLD.initialFood * params.foodAbundance));
    const scarcity = 1 - Math.min(1, this.food.length / Math.max(1, targetCap));
    this.foodDebt += WORLD.foodRegrowPerSec * params.foodAbundance * (1 + scarcity * (ECO.recoveryBoost - 1)) * this.biome.seasonFood(this.age) * (1 - this.gloom * 0.9) * (1 - this.cold * 0.92) * dt;
    while (this.foodDebt >= 1 && this.food.length < targetCap) {
      this.food.push(this.growFood());
      this.foodDebt -= 1;
    }

    // painted zones: bloom keeps adding food, drought clears it; both expire after a while
    if (this.zones.length) {
      for (const zn of this.zones) {
        zn.life -= dt;
        if (!zn.drought) {
          this.bloomDebt += 6 * dt;
          while (this.bloomDebt >= 1 && this.food.length < WORLD.foodMax) { this.addFoodAt(zn.x, zn.z, 1, zn.r * 0.8); this.bloomDebt -= 1; }
        }
      }
      this.zones = this.zones.filter((z) => z.life > 0);
      const dz = this.zones.filter((z) => z.drought);
      if (dz.length) this.food = this.food.filter((f) => !dz.some((z) => (f.x - z.x) ** 2 + (f.z - z.z) ** 2 < z.r * z.r));
    }

    this.grid.rebuild(this.food);
    this.creatureGrid.rebuild(this.creatures);
    this.pendingChildren.length = 0;

    for (const c of this.creatures) if (c.alive) c.update(dt, this);

    if (this.plagueActive || this.infectedCount > 0) this.stepPlague(dt); // contagion spreads + selects

    this.killFlash = Math.max(0, this.killFlash - dt);
    this.noveltyFlash = Math.max(0, this.noveltyFlash - dt);
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
    const speciesCounts = new Array<number>(SPECIES.length).fill(0);
    for (const c of this.creatures) {
      s += c.genome.size; sp += c.genome.speed; se += c.genome.sense; ag += c.age; so += c.genome.social;
      wi += c.genome.wings;
      if (c.isPredator) preds++;
      if (c.canFly) flyers++;
      const si = c.genome.species ?? 0;
      if (si >= 0 && si < speciesCounts.length) speciesCounts[si]!++;
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
      predators: preds, flyers, avgWings: wi / n, speciesCounts,
    };
  }
}
