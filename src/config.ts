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

// Flight: an evolvable `wings` gene (> threshold = can fly). Flyers escape GROUND predators and
// roam freely, but burn more energy and CANNOT shelter from weather — so storms favor the grounded.
export const FLIGHT = {
  threshold: 0.5,
  costMult: 1.5, // flyers burn this much more energy
  speedMult: 1.25, // flyers move a bit faster
  altitude: 3.2, // visual hover height above the terrain
};

