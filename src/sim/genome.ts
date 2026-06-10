import { GENE_RANGES, params } from '../config';
import { type Brain, randomBrain, mutateBrain } from './brain';

/** The heritable traits of a creature. Color (hue) is a visible lineage marker; brain is its neural net. */
export interface Genome {
  size: number;
  speed: number;
  sense: number;
  hue: number;
  brain: Brain;
  /** Cosmetic appearance seed (ears/tail/eye-size/body-shape derived from its bits). Inherited; rarely rerolls. */
  look: number;
  /** 0 = loner, 1 = highly social. Drives how strongly the creature herds with neighbors. */
  social: number;
  /** > 0.5 = carnivore (hunts other creatures); otherwise a plant-eating prey animal. */
  predator: number;
  /** > 0.5 = can fly: escapes ground predators + roams freely, but burns more energy and can't shelter. */
  wings: number;
}

type Range = readonly [number, number];

function clamp(v: number, [lo, hi]: Range): number {
  return Math.min(hi, Math.max(lo, v));
}

function lerp(t: number, [lo, hi]: Range): number {
  return lo + t * (hi - lo);
}

/** Approx. standard normal via sum of uniforms (Irwin–Hall), mean 0, ~unit spread. */
function gaussian(): number {
  return (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 1.0;
}

export function randomGenome(): Genome {
  return {
    size: lerp(Math.random(), GENE_RANGES.size),
    speed: lerp(Math.random(), GENE_RANGES.speed),
    sense: lerp(Math.random(), GENE_RANGES.sense),
    hue: Math.random(),
    brain: randomBrain(),
    look: Math.floor(Math.random() * 0x7fffffff),
    social: Math.random(),
    // ~12% of the starting population are predators; the rest are prey.
    predator: Math.random() < 0.12 ? 0.6 + Math.random() * 0.4 : Math.random() * 0.45,
    // ~10% can already fly; flight spreads (or dies out) depending on the world's conditions.
    wings: Math.random() < 0.1 ? 0.55 + Math.random() * 0.45 : Math.random() * 0.45,
  };
}

/** Produce a mutated copy of a genome. Each gene mutates with MUTATION.rate probability. */
export function mutate(g: Genome): Genome {
  const jitter = (value: number, range: Range): number => {
    if (Math.random() > params.mutationRate) return value;
    const span = range[1] - range[0];
    return clamp(value + gaussian() * params.mutationStep * span, range);
  };
  return {
    size: jitter(g.size, GENE_RANGES.size),
    speed: jitter(g.speed, GENE_RANGES.speed),
    sense: jitter(g.sense, GENE_RANGES.sense),
    // hue wraps around the color wheel and drifts slowly.
    hue: ((g.hue + (Math.random() > params.mutationRate ? 0 : gaussian() * 0.06)) % 1 + 1) % 1,
    brain: mutateBrain(g.brain),
    // appearance is mostly inherited (lineages look alike) and rarely rerolls into a new "species" look.
    look: Math.random() < params.mutationRate * 0.25 ? Math.floor(Math.random() * 0x7fffffff) : g.look,
    social: jitter(g.social, [0, 1] as const),
    predator: jitter(g.predator, [0, 1] as const),
    wings: jitter(g.wings, [0, 1] as const),
  };
}
