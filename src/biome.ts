import { WORLD, params } from './config';

// ---- seeded RNG + value-noise (no dependencies, THREE-free) -----------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number): number => t * t * (3 - 2 * t);
function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = smooth(x - x0), fz = smooth(z - z0);
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}
function fbm(x: number, z: number, seed: number, oct = 4): number {
  let v = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * valueNoise(x * freq, z * freq, seed + i * 1013);
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return v / norm;
}

// ---- color helpers ----------------------------------------------------------
export type RGB = [number, number, number];
const hexToRgb = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

interface Preset {
  name: string;
  groundLow: number; groundHigh: number; rock: number;
  skyTop: number; skyBottom: number; fog: number; sun: number;
}
const PRESETS: Preset[] = [
  { name: 'Verdant Meadow', groundLow: 0x2e4d22, groundHigh: 0x7fae4b, rock: 0x8a8270, skyTop: 0x2a5d9c, skyBottom: 0xbfe0ff, fog: 0xbfe0ff, sun: 0xfff2d0 },
  { name: 'Amber Savanna', groundLow: 0x5a4322, groundHigh: 0xc7a23e, rock: 0x9c8a6a, skyTop: 0x3a6ea5, skyBottom: 0xffe6b0, fog: 0xf2d39a, sun: 0xffe0a0 },
  { name: 'Frost Tundra', groundLow: 0x3a4a5a, groundHigh: 0xdfeaf2, rock: 0x9fb0bf, skyTop: 0x244a78, skyBottom: 0xcfe6ff, fog: 0xcfe0ee, sun: 0xeaf4ff },
  { name: 'Crimson Mesa', groundLow: 0x4a1f17, groundHigh: 0xc1572f, rock: 0x7a4030, skyTop: 0x5a2a4a, skyBottom: 0xffb27a, fog: 0xe89a6a, sun: 0xffcf9a },
  { name: 'Alien Cyan', groundLow: 0x113a3a, groundHigh: 0x2fae9c, rock: 0x4a6a78, skyTop: 0x1a2f5a, skyBottom: 0x7fffe0, fog: 0x4fd0c0, sun: 0xd0fff4 },
  { name: 'Violet Heath', groundLow: 0x2a2440, groundHigh: 0x8a64c0, rock: 0x6a5a7a, skyTop: 0x2a1f4a, skyBottom: 0xc9b0ff, fog: 0xb09add, sun: 0xf0e0ff },
];

const NIGHT_TOP: RGB = [6, 9, 24];
const NIGHT_BOTTOM: RGB = [14, 20, 44];

export interface SkyState {
  top: number; bottom: number; fog: number;
  sunColor: number; sunIntensity: number; ambIntensity: number;
  sunDir: [number, number, number];
  dayFactor: number; // 0 night .. 1 midday
  starAlpha: number;
}

/** A procedurally generated, drifting, seasonal biome. Reseed for a brand-new world. */
export class Biome {
  preset!: Preset;
  name = '';
  seed = 0;
  private terrainSeed = 1;
  private fertSeed = 2;
  private terrainFreq = 0.02;
  amplitude = 6;

  constructor(seed?: number) {
    this.reseed(seed);
  }

  reseed(seed?: number): void {
    const s = seed ?? Math.floor(Math.random() * 1e9);
    this.seed = s;
    const rng = mulberry32(s);
    this.preset = PRESETS[Math.floor(rng() * PRESETS.length)]!;
    this.name = this.preset.name;
    this.terrainSeed = Math.floor(rng() * 1e6);
    this.fertSeed = Math.floor(rng() * 1e6);
    this.terrainFreq = 0.012 + rng() * 0.02;
    this.amplitude = 4 + rng() * 6;
  }

  /** Terrain height at a world (x,z). Edges sink slightly so the arena reads as an island. */
  height(x: number, z: number): number {
    const n = fbm(x * this.terrainFreq, z * this.terrainFreq, this.terrainSeed, 4);
    const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD.half;
    const falloff = 1 - smooth(Math.min(1, Math.max(0, (edge - 0.7) / 0.3)));
    return (n - 0.35) * this.amplitude * falloff;
  }

  /** 0..1 fertility used to bias where food grows. Patches drift slowly over time. */
  fertility(x: number, z: number, t: number): number {
    const dx = Math.sin(t * 0.03) * 40;
    const dz = Math.cos(t * 0.024) * 40;
    return fbm((x + dx) * 0.018, (z + dz) * 0.018, this.fertSeed, 3);
  }

  /** Seasonal multiplier on food regrowth (waxes and wanes on its own). */
  seasonFood(t: number): number {
    if (params.seasonStrength <= 0) return 1;
    const phase = (t / Math.max(1, params.seasonLengthSec)) * Math.PI * 2;
    return 1 + Math.sin(phase) * params.seasonStrength * 0.7;
  }

  /** Terrain vertex color for a normalized height (0 low .. 1 high). */
  groundColorRgb(h01: number): RGB {
    const low = hexToRgb(this.preset.groundLow);
    const high = hexToRgb(this.preset.groundHigh);
    const rock = hexToRgb(this.preset.rock);
    if (h01 < 0.6) return mix(low, high, h01 / 0.6);
    return mix(high, rock, (h01 - 0.6) / 0.4);
  }

  /** Sky / sun / ambient for the current time, driving the day-night cycle. */
  sky(t: number): SkyState {
    const p = this.preset;
    let dayFactor = 1;
    let sunDir: [number, number, number] = [0.4, 0.85, 0.3];
    if (params.dayNight) {
      const phase = (t / Math.max(1, params.dayLengthSec)) % 1;
      const ang = phase * Math.PI * 2;
      const elevation = Math.sin(ang); // -1 .. 1
      dayFactor = Math.max(0, Math.min(1, elevation * 1.4 + 0.25));
      sunDir = [Math.cos(ang) * 0.9, Math.max(0.05, elevation), 0.25];
    }
    const dayTop = hexToRgb(p.skyTop);
    const dayBottom = hexToRgb(p.skyBottom);
    const top = mix(NIGHT_TOP, dayTop, dayFactor);
    const bottom = mix(NIGHT_BOTTOM, dayBottom, dayFactor);
    const fogRgb = mix(NIGHT_BOTTOM, hexToRgb(p.fog), dayFactor);
    // sun warms toward the horizon (golden hour)
    const horizon = 1 - Math.min(1, sunDir[1] / 0.5);
    const sunRgb = mix(hexToRgb(p.sun), [255, 150, 80], horizon * 0.6);
    return {
      top: packRgb(top),
      bottom: packRgb(bottom),
      fog: packRgb(fogRgb),
      sunColor: packRgb(sunRgb),
      sunIntensity: 0.35 + dayFactor * 1.5,
      ambIntensity: 0.25 + dayFactor * 0.7,
      sunDir,
      dayFactor,
      starAlpha: 1 - dayFactor,
    };
  }
}

const packRgb = ([r, g, b]: RGB): number => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
