// Central tunables for the AI World simulation.
// v0.1 — herbivores foraging under natural selection. Tweak freely; the sim re-balances.

export const WORLD = {
  /** Arena is a square from -HALF..HALF on the X/Z plane. */
  half: 70,
  initialCreatures: 70,
  /** Food carrying capacity and how fast it regrows toward the cap. */
  initialFood: 260,
  foodMax: 360,
  foodRegrowPerSec: 22,
};

export const FOOD = {
  energy: 24, // energy a creature gains by eating one pellet
  radius: 0.45,
};

export const GENE_RANGES = {
  size: [0.45, 2.2] as const, // body scale; bigger = more max energy but costlier
  speed: [0.6, 4.2] as const, // movement units/sec
  sense: [3, 26] as const, // food-detection radius
  hue: [0, 1] as const, // visual marker; drifts with lineage
};

// Distinct creature archetypes ("species"). A heritable gene picks one; it drives body proportions,
// which features show, how the creature MOVES, and how SMART it is (sense + steering finesse).
// Same cuteness, obviously different silhouettes and behaviour.
export interface SpeciesDef {
  name: string;
  scale: readonly [number, number, number]; // body proportions (x wide, y tall, z deep)
  ear: 0 | 1 | 2 | 3;   // 0 round · 1 pointy · 2 antennae · 3 none
  tail: boolean;
  eye: number;          // base eye size
  smarts: number;       // multiplies sense range + steering finesse (food-finding, threat-dodging)
  bob: { freq: number; amp: number; hop: number; wobble: number }; // locomotion feel
}
export const SPECIES: SpeciesDef[] = [
  // round, big-eyed, slow and placid
  { name: 'Pebble', scale: [1.05, 0.95, 1.05], ear: 0, tail: false, eye: 1.3, smarts: 0.85, bob: { freq: 1.3, amp: 0.07, hop: 0, wobble: 0 } },
  // sleek, pointy-eared, quick and clever
  { name: 'Foxling', scale: [1.05, 0.92, 0.95], ear: 1, tail: true, eye: 1.0, smarts: 1.3, bob: { freq: 2.2, amp: 0.05, hop: 0.12, wobble: 0.03 } },
  // tall egg that springs along in big hops
  { name: 'Hopkin', scale: [0.85, 1.3, 0.85], ear: 0, tail: false, eye: 1.15, smarts: 1.0, bob: { freq: 2.6, amp: 0.02, hop: 0.6, wobble: 0 } },
  // long, low, earless — slithers with a side-to-side wobble
  { name: 'Slink', scale: [1.6, 0.6, 0.8], ear: 3, tail: true, eye: 0.85, smarts: 0.95, bob: { freq: 3.2, amp: 0.04, hop: 0, wobble: 0.22 } },
  // small, wide, antennaed — skitters fast and isn't very bright
  { name: 'Beetlebug', scale: [1.15, 0.7, 1.2], ear: 2, tail: false, eye: 0.8, smarts: 0.6, bob: { freq: 8, amp: 0.04, hop: 0.05, wobble: 0.06 } },
];

export const LIFE = {
  startEnergy: 42,
  /** maxEnergy = base + size * perSize */
  maxEnergyBase: 30,
  maxEnergyPerSize: 55,
  /** baseline metabolic drain per second, plus movement cost ~ size*speed^2. */
  baseMetabolism: 1.1,
  moveCostK: 0.16,
  /** reproduce when energy >= threshold * maxEnergy; child gets half, parent keeps half. */
  reproThreshold: 0.72,
  /** seconds; scaled by size so bigger creatures live a bit longer. */
  maxAgeBase: 55,
  maxAgePerSize: 28,
  eatRadiusBase: 0.6, // plus body radius
  matureAge: 12, // seconds before a juvenile grows up and can reproduce
};

export const MUTATION = {
  rate: 0.55, // probability a given gene mutates on reproduction
  step: 0.12, // gaussian step as a fraction of the gene's range
};

export const SIM = {
  /** Largest sim-seconds advanced per physics sub-step (keeps fast-forward stable). */
  maxStep: 0.05,
  /** Hard cap on sub-steps per frame so a slow frame can't freeze the tab. */
  maxSubStepsPerFrame: 40,
};

export const BRAIN = {
  maxTurn: 3.2, // radians/sec the brain can steer
  minThrottle: 0.3, // creatures always move at least this fraction of their speed
};

// Social behavior: communities (boids-style cohesion/separation/alignment, weighted by the
// evolvable `social` gene) and communication (a creature that eats broadcasts a signal that
// nearby creatures are drawn toward — emergent group foraging).
export const SOCIAL = {
  radius: 13, // how far a creature senses its neighbors
  separation: 2.4, // creatures closer than this push apart
  cohesionGain: 1.2, // pull toward the group's center
  separationGain: 2.6, // push out of a crowd
  alignGain: 0.7, // match neighbors' heading
  signalTime: 1.6, // seconds a creature broadcasts after eating
  signalGain: 1.1, // attraction toward a signaling neighbor
  alarmTime: 1.4, // seconds a creature keeps raising the alarm after seeing a predator
  bondRadius: 7.5, // draw a bond line between creatures closer than this
  maxLinks: 1600, // cap on drawn bond lines (perf)
  maxTurn: 5, // clamp on total social+brain steering (rad/sec)
};

/**
 * Live, user-adjustable knobs (the "levers"). The controls panel writes here and
 * the simulation/render read from here every frame, so changes take effect instantly.
 */
export const params = {
  timeSpeed: 1, // 0 = paused
  mutationRate: MUTATION.rate, // chance a gene mutates on reproduction
  mutationStep: MUTATION.step, // size of a mutation
  foodAbundance: 1, // multiplies food regrow rate + target cap (×0.2 .. ×3)
  metabolism: 1, // multiplies energy drain (harsher world > 1)
  dayLengthSec: 90, // sim-seconds per full day/night cycle
  seasonLengthSec: 80, // sim-seconds per season swing
  seasonStrength: 0.6, // 0 = no seasonal food swing, 1 = strong
  dayNight: true, // animate sun + sky
  bloom: true, // glow post-processing
  weather: 0, // 0 = calm & peaceful .. 1 = storms, hail, lightning that can kill the exposed
  autoWeather: false, // when true, the weather drifts on its own (random fronts roll through)
  colorByLineage: false, // color creatures by family/clan instead of their own hue
};

// Predators hunt prey; prey flee. A creature is a carnivore when its `predator` gene > threshold.
export const PRED = {
  threshold: 0.5,
  gain: 36, // base energy gained from a kill (plus a share of the prey's energy)
  metabolismMult: 1.35, // predators burn energy faster
  eatRadiusBonus: 0.5,
  huntGain: 1.7, // steering pull toward prey
  fleeGain: 2.6, // steering push away from a predator (prey)
  // wolf-pack hunting: when other predators share the quarry, fan out and circle it
  // beyond circleRadius, then commit to a dart once close (see lunge tuning below).
  circleRadius: 9, // orbit the prey while farther than this
  orbitGain: 1.6, // tangential steering that drives the encircling
  ambushDist: 8, // how far past the prey an ambusher swings to flank from the far side
  // stalk → dart rhythm: predators creep, then burst toward prey when in range.
  lungeRange: 7, // a predator commits to a lunge when prey is within this
  lungeCooldown: 2.2, // seconds between lunges
  lungeDuration: 0.55, // seconds a lunge burst lasts
  lungeSpeedMult: 2.6, // speed multiplier during the dart
  stalkSpeedMult: 0.72, // creeps a little slower than full pace while lining up
  // prey panic: a close predator spooks prey into a brief fright sprint (with a startle hop + "!" pop)
  panicRadius: 6, // a predator this close startles the prey
  startleTime: 1, // seconds the prey stays spooked
  frightSpeedMult: 1.7, // adrenaline bolt while fleeing for its life
};

// Stamina: sprinting (a predator's dart, a prey's fright bolt) burns a 0..1 reserve that recovers at
// rest. Empty out and you can't dart / your bolt fades — so chases have an arc and an escape window.
export const STAMINA = {
  regen: 0.18, // per second recovered when not sprinting
  lungeDrain: 1.0, // per second while mid-dart
  sprintDrain: 0.5, // per second while a prey is bolting
  lungeMin: 0.3, // a predator needs at least this much to commit to a dart
};

// Weather severity (params.weather) damages EXPOSED creatures; shelter under a tree protects them.
export const WEATHER = {
  startAt: 0.18, // below this, weather is purely cosmetic
  damagePerSec: 11, // energy/sec drained from an exposed creature at weather = 1
  shelterSeekGain: 2.2, // how hard creatures steer toward shelter as weather rises
  lightningKillRadius: 7,
  lightningMinInterval: 5, // seconds between strikes at weather = 1 (rarer when calmer)
};

export const TREES = {
  count: 16,
  shelterRadius: 6.5, // creatures within this of a tree are sheltered
};

// Ponds: scenic pools that settle into terrain basins. Creatures walk AROUND them (steer away from
// the water) rather than through, so you see them gather and path along the shoreline.
export const PONDS = {
  count: 4,
  minR: 5,
  maxR: 10,
  avoidGain: 3.2, // how hard a creature steers away from open water
};

// Flight: an evolvable `wings` gene (> threshold = can fly). Flyers escape GROUND predators and
// roam freely, but burn more energy and CANNOT shelter from weather — so storms favor the grounded.
export const FLIGHT = {
  threshold: 0.5,
  costMult: 1.5, // flyers burn this much more energy
  speedMult: 1.25, // flyers move a bit faster
  altitude: 3.2, // visual hover height above the terrain
};

