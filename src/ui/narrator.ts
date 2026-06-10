import type { WorldStats } from '../sim/world';

const pick = (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)]!;

/**
 * A David-Attenborough-style voiceover. Each "scene" it watches the world's stats and events
 * (storms, lightning, the rise of predators, the first flight, population booms and crashes,
 * the deepening of generations) and narrates what is unfolding, in measured, reverent prose.
 */
export class Narrator {
  private body: HTMLElement;
  private lines: HTMLElement[] = [];
  private nextAt = 5;
  private prevPop = -1;
  private prevSevere = false;
  private prevFlyers = 0;
  private prevPredators = 0;
  private prevGenTier = 0;
  private prevBiome = '';
  private lastLightning = -999;

  constructor() {
    const b = document.getElementById('narration-body');
    if (!b) throw new Error('missing #narration-body');
    this.body = b;
  }

  update(s: WorldStats, biome: string, weather: number, lightning: boolean): void {
    if (lightning) this.lastLightning = s.age;
    if (this.prevPop < 0) { this.prevPop = s.population; this.prevBiome = biome; }
    if (s.age < this.nextAt) return;

    const line = this.compose(s, biome, weather);
    this.emit(line);
    this.nextAt = s.age + 9 + Math.random() * 7;

    this.prevPop = s.population;
    this.prevSevere = weather >= 0.8;
    this.prevFlyers = s.flyers;
    this.prevPredators = s.predators;
    this.prevGenTier = Math.floor(s.generation / 5);
    this.prevBiome = biome;
  }

  private compose(s: WorldStats, biome: string, weather: number): string {
    const fill = (t: string): string => t
      .replace('{biome}', biome).replace('{pop}', String(s.population))
      .replace('{pred}', String(s.predators)).replace('{gen}', String(s.generation))
      .replace('{flyers}', String(s.flyers));

    // --- highest-priority: a notable change since the last scene ---
    if (biome !== this.prevBiome) return fill(pick([
      'And so we arrive in the {biome} — a new land, with new rules for survival.',
      'Here, in the {biome}, life must begin its patient work all over again.',
    ]));

    if (weather >= 0.8 && !this.prevSevere) return fill(pick([
      'The skies darken. A storm of terrible power now gathers over the {biome}.',
      'And now, the great test arrives. Those who cannot reach the trees in time will not endure it.',
    ]));

    if (s.age - this.lastLightning < 6) return fill(pick([
      'A bolt of lightning splits the air — and in an instant, the exposed are gone.',
      'The storm shows no mercy. Only those huddled beneath the trees will see the morning.',
    ]));

    if (s.flyers > 0 && this.prevFlyers === 0) return fill(pick([
      'Extraordinary. For the first time, a creature has taken to the air — and the ground is no longer the only refuge.',
      'Watch closely. Wings have appeared, and with them, escape from the jaws waiting below.',
    ]));
    if (s.flyers === 0 && this.prevFlyers > 0) return fill(pick([
      'And as quickly as it began, the experiment with flight is over. Here, the earth-bound prevail.',
    ]));
    if (s.population > 0 && s.flyers > s.population * 0.4) return fill(pick([
      'The skies themselves now teem with life. In this world, to fly is simply to survive.',
    ]));

    if (this.prevPop > 12 && s.population < this.prevPop * 0.6) return fill(pick([
      'Their numbers collapse. Life, it seems, has overreached — as it so often does.',
      'A reckoning. The world can feed only so many, and today it has fed too few.',
    ]));
    if (this.prevPop > 5 && s.population > this.prevPop * 1.4) return fill(pick([
      'A population explosion. Abundance, while it lasts, is a glorious thing.',
    ]));

    if (s.population > 0 && s.predators > s.population * 0.4 && this.prevPredators <= this.prevPop * 0.4) {
      return fill(pick([
        'The hunters are ascendant now. The herds grow nervous — and rightly so.',
        'Red of tooth, the predators multiply. For the prey, every moment is a gamble.',
      ]));
    }

    if (Math.floor(s.generation / 5) > this.prevGenTier && s.generation >= 5) return fill(pick([
      'Generation upon generation has passed. These are no longer the creatures we first met — evolution has quietly remade them.',
      '{gen} generations deep. Every instinct you now see was earned, slowly, at great cost.',
    ]));

    // --- ambient flavor ---
    return fill(pick([
      'Across the {biome}, {pop} small lives go quietly about the business of staying alive.',
      'To us, a game of coloured shapes. To them, it is everything.',
      'Each carries the instructions of its ancestors — and a few small mistakes that may yet prove its salvation.',
      'They gather, they scatter, they feed. The oldest story there is, told once more.',
      'Notice how purposefully they move. Their small minds have learned the shape of this world.',
      'In the struggle for food and safety, nothing is wasted, and nothing is forgiven.',
    ]));
  }

  private emit(text: string): void {
    const p = document.createElement('p');
    p.textContent = text;
    this.body.appendChild(p);
    this.lines.push(p);
    while (this.lines.length > 5) this.lines.shift()?.remove();
    const n = this.lines.length;
    this.lines.forEach((el, i) => { el.style.opacity = String(0.28 + 0.72 * ((i + 1) / n)); });
  }
}
