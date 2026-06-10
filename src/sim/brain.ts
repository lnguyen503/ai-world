import { params } from '../config';

// A tiny feed-forward neural network: 5 inputs -> 6 hidden (tanh) -> 2 outputs (tanh).
// Inputs:  [foodDirSin, foodDirCos, foodCloseness, energy, bias]
// Outputs: [turn (-1..1), throttle (-1..1)]
// The weights live in the genome, so the brain is inherited and mutated — behavior evolves.
export const NIN = 5;
export const NHID = 6;
export const NOUT = 2;

export interface Brain {
  w1: number[]; // NHID * NIN
  b1: number[]; // NHID
  w2: number[]; // NOUT * NHID
  b2: number[]; // NOUT
}

function gaussian(): number {
  return Math.random() + Math.random() + Math.random() + Math.random() - 2;
}
const randWeights = (n: number, scale: number): number[] =>
  Array.from({ length: n }, () => (Math.random() * 2 - 1) * scale);

export function randomBrain(): Brain {
  return {
    w1: randWeights(NHID * NIN, 0.8),
    b1: randWeights(NHID, 0.5),
    w2: randWeights(NOUT * NHID, 0.8),
    b2: randWeights(NOUT, 0.5),
  };
}

const clamp4 = (v: number): number => Math.max(-4, Math.min(4, v));

/** Inherit a brain with small random changes. Mutation amount follows the live levers. */
export function mutateBrain(b: Brain): Brain {
  const jitter = (arr: number[]): number[] =>
    arr.map((w) => (Math.random() < params.mutationRate ? clamp4(w + gaussian() * params.mutationStep * 1.6) : w));
  return { w1: jitter(b.w1), b1: jitter(b.b1), w2: jitter(b.w2), b2: jitter(b.b2) };
}

/** Run the network. Returns [turn, throttle], each in -1..1. */
export function think(brain: Brain, input: number[]): [number, number] {
  const h = new Array<number>(NHID);
  for (let j = 0; j < NHID; j++) {
    let sum = brain.b1[j]!;
    for (let i = 0; i < NIN; i++) sum += brain.w1[j * NIN + i]! * input[i]!;
    h[j] = Math.tanh(sum);
  }
  const out: [number, number] = [0, 0];
  for (let k = 0; k < NOUT; k++) {
    let sum = brain.b2[k]!;
    for (let j = 0; j < NHID; j++) sum += brain.w2[k * NHID + j]! * h[j]!;
    out[k] = Math.tanh(sum);
  }
  return out;
}
