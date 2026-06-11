import { GENE_RANGES, SPECIES, params, evo } from '../config';
import { type Brain, randomBrain, mutateBrain, crossoverBrain } from './brain';

let nextClan = 1;

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
  /** 0..1 bioluminescence — high-glow critters shimmer at night. Heritable, cosmetic. */
  glow: number;
  /** 0..1 innate disease resistance — selected upward by plagues (resistant survive + pass it on). */
  resistance: number;
  /** Founding-lineage id. Inherited unchanged, so a clan = one extended family. Used for lineage coloring. */
  clan: number;
  /** Index into SPECIES — body archetype (look + motion + smartness). Inherited; rarely speciates. */
  species: number;
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
    // ~9% of the starting population are predators; the rest are prey.
    predator: Math.random() < 0.09 ? 0.6 + Math.random() * 0.4 : Math.random() * 0.45,
    // ~18% can already fly; flight spreads (or dies out) depending on the world's conditions.
    wings: Math.random() < 0.18 ? 0.55 + Math.random() * 0.45 : Math.random() * 0.45,
    // ~15% start with a glow; it's heritable so glowing lineages can emerge.
    glow: Math.random() < 0.15 ? 0.5 + Math.random() * 0.5 : Math.random() * 0.3,
    // most start with little disease resistance — a plague then selects the resistant upward.
    resistance: Math.random() * 0.3,
    clan: nextClan++,
    species: Math.floor(Math.random() * SPECIES.length),
  };
}

/** Sexual reproduction: blend two genomes gene-by-gene (then the caller mutates the result). */
export function crossover(a: Genome, b: Genome): Genome {
  const p = <T,>(x: T, y: T): T => (Math.random() < 0.5 ? x : y);
  return {
    size: p(a.size, b.size), speed: p(a.speed, b.speed), sense: p(a.sense, b.sense),
    hue: p(a.hue, b.hue), social: p(a.social, b.social), predator: p(a.predator, b.predator),
    wings: p(a.wings, b.wings), glow: p(a.glow ?? 0, b.glow ?? 0), resistance: p(a.resistance ?? 0, b.resistance ?? 0),
    look: p(a.look, b.look), clan: p(a.clan, b.clan),
    species: p(a.species ?? 0, b.species ?? 0),
    brain: crossoverBrain(a.brain, b.brain),
  };
}

/** Produce a mutated copy of a genome. Each gene mutates with MUTATION.rate probability. */
export function mutate(g: Genome): Genome {
  // an adaptive radiation (evo.mutationScale > 1) cranks both how often genes mutate and how far they leap
  const rate = params.mutationRate * evo.mutationScale;
  const step = params.mutationStep * evo.mutationScale;
  const jitter = (value: number, range: Range): number => {
    if (Math.random() > rate) return value;
    const span = range[1] - range[0];
    return clamp(value + gaussian() * step * span, range);
  };
  const child: Genome = {
    size: jitter(g.size, GENE_RANGES.size),
    speed: jitter(g.speed, GENE_RANGES.speed),
    sense: jitter(g.sense, GENE_RANGES.sense),
    // hue wraps around the color wheel and drifts slowly.
    hue: ((g.hue + (Math.random() > rate ? 0 : gaussian() * 0.06)) % 1 + 1) % 1,
    brain: mutateBrain(g.brain),
    // appearance is mostly inherited (lineages look alike) and rarely rerolls into a new "species" look.
    look: Math.random() < rate * 0.25 ? Math.floor(Math.random() * 0x7fffffff) : g.look,
    social: jitter(g.social, [0, 1] as const),
    predator: jitter(g.predator, [0, 1] as const),
    wings: jitter(g.wings, [0, 1] as const),
    glow: jitter(g.glow ?? 0, [0, 1] as const),
    resistance: jitter(g.resistance ?? 0, [0, 1] as const),
    clan: g.clan, // lineage is inherited unchanged
    // species is inherited; very rarely a lineage speciates into a different archetype
    species: Math.random() < rate * 0.08 ? Math.floor(Math.random() * SPECIES.length) : (g.species ?? 0),
  };
  // a rare "macro-mutation" — a bold genetic leap producing a visibly striking individual (commoner mid-radiation)
  if (Math.random() < 0.03 * evo.mutationScale) macroMutate(child);
  return child;
}

function macroMutate(c: Genome): void {
  const roll = Math.random();
  if (roll < 0.24) c.size = clamp(c.size * (Math.random() < 0.5 ? 1.8 : 0.5), GENE_RANGES.size); // a giant or a dwarf
  else if (roll < 0.44) c.hue = Math.random();                                  // a bold new colour
  else if (roll < 0.60) c.species = Math.floor(Math.random() * SPECIES.length); // speciation into a new form
  else if (roll < 0.74) c.speed = clamp(c.speed * 1.7, GENE_RANGES.speed);      // a sudden sprinter
  else if (roll < 0.86) c.sense = clamp(c.sense * 1.7, GENE_RANGES.sense);      // sharpened senses
  else if (roll < 0.95) c.wings = 0.7 + Math.random() * 0.3;                    // the gift of flight
  else c.predator = 0.7 + Math.random() * 0.3;                                  // a new carnivore
}
