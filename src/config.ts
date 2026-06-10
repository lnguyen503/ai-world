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
};

