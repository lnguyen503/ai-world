import type { WorldStats } from '../sim/world';

const pick = (arr: string[]): string => arr[Math.floor(Math.random() * arr.length)]!;

/** Pull narration text out of a few common local-LLM response shapes (Ollama / OpenAI-style). */
function extractText(d: unknown): string {
  if (typeof d === 'string') return d;
  const o = d as Record<string, unknown>;
  if (typeof o?.['response'] === 'string') return o['response']; // Ollama /api/generate
  const choices = o?.['choices'] as Array<Record<string, unknown>> | undefined;
  const ch = choices?.[0];
  const msg = ch?.['message'] as Record<string, unknown> | undefined;
  if (typeof msg?.['content'] === 'string') return msg['content'];
  if (typeof ch?.['text'] === 'string') return ch['text'];
  return '';
}

/**
 * A David-Attenborough-style voiceover. It is event- and state-driven: it narrates transitions
 * (nightfall, dawn, a gathering storm, a lightning strike, the first flight, a predator on the
 * prowl, booms and crashes) and otherwise mirrors the current mood of the world — never the same
 * line twice in a row, and never a fixed loop.
 */
export class Narrator {
  onLine: ((text: string) => void) | null = null;
  private body: HTMLElement;
  private lines: HTMLElement[] = [];
  private nextAt = 5;
  private prevPop = -1;
  private prevSevere = false;
  private prevFlyers = 0;
  private prevGenTier = 0;
  private prevBiome = '';
  private prevNight = false;
  private prevProwl = false;
  private lastLightning = -999;
  private lastText = '';
  private llmOn: HTMLInputElement | null;
  private llmUrl: HTMLInputElement | null;
  private llmModel: HTMLInputElement | null;
  private busy = false;

  constructor() {
    const b = document.getElementById('narration-body');
    if (!b) throw new Error('missing #narration-body');
    this.body = b;
    this.llmOn = document.getElementById('llm-on') as HTMLInputElement | null;
    this.llmUrl = document.getElementById('llm-url') as HTMLInputElement | null;
    this.llmModel = document.getElementById('llm-model') as HTMLInputElement | null;
    this.llmOn?.addEventListener('change', () => {
      const show = !!this.llmOn?.checked;
      this.llmUrl?.classList.toggle('show', show);
      this.llmModel?.classList.toggle('show', show);
    });
  }

  private llmReady(): boolean {
    return !!this.llmOn?.checked && !!this.llmUrl?.value.trim();
  }

  update(s: WorldStats, biome: string, weather: number, lightning: boolean, dayFactor: number, prowling: boolean): void {
    if (lightning) this.lastLightning = s.age;
    const night = dayFactor < 0.28;
    if (this.prevPop < 0) { this.prevPop = s.population; this.prevBiome = biome; this.prevNight = night; }
    if (s.age < this.nextAt) return;
    this.nextAt = s.age + 11 + Math.random() * 8;

    // a template line is always ready as the fallback (and the non-LLM path)
    let fallback = this.compose(s, biome, weather, night, prowling);
    for (let i = 0; i < 4 && fallback === this.lastText; i++) fallback = this.compose(s, biome, weather, night, prowling);

    if (this.llmReady() && !this.busy) {
      this.busy = true;
      this.fetchLLM(this.buildPrompt(s, biome, weather, night, prowling))
        .then((line) => { this.busy = false; this.show(line.trim() || fallback); })
        .catch(() => { this.busy = false; this.show(fallback); });
    } else {
      this.show(fallback);
    }

    this.prevPop = s.population; this.prevSevere = weather >= 0.8; this.prevFlyers = s.flyers;
    this.prevGenTier = Math.floor(s.generation / 5); this.prevBiome = biome;
    this.prevNight = night; this.prevProwl = prowling;
  }

  /** Ask a local LLM (Ollama /api/generate shape) for one narration line; rejects on any failure. */
  private fetchLLM(prompt: string): Promise<string> {
    const url = this.llmUrl?.value.trim() ?? '';
    const model = this.llmModel?.value.trim() || 'llama3.2';
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`llm ${r.status}`))))
      .then((d: unknown) => extractText(d).replace(/^["']|["']$/g, ''));
  }

  private buildPrompt(s: WorldStats, biome: string, weather: number, night: boolean, prowling: boolean): string {
    const w = weather < 0.18 ? 'calm and clear' : weather < 0.5 ? 'light rain' : weather < 0.8 ? 'a gathering storm' : 'a violent storm';
    const time = night ? 'night — most prey are asleep' : 'daytime';
    return [
      'You are Sir David Attenborough narrating a tiny artificial-life world of evolving creatures.',
      'Write ONE short, vivid, present-tense sentence of narration (max ~25 words). No preamble, no quotation marks.',
      `Biome: ${biome}. Time: ${time}. Weather: ${w}.`,
      `There are ${s.population} creatures (${s.predators} predators, ${s.flyers} can fly), in generation ${s.generation}.`,
      prowling ? 'Right now, a predator is stalking nearby prey.' : '',
      `Their average sociability is ${(s.avgSocial * 100) | 0}% and they have lived an average of ${s.avgAge | 0} seconds.`,
    ].filter(Boolean).join('\n');
  }

  private show(text: string): void {
    if (!text || text === this.lastText) return;
    this.emit(text);
    this.lastText = text;
  }

  private compose(s: WorldStats, biome: string, weather: number, night: boolean, prowling: boolean): string {
    const fill = (t: string): string => t
      .replace('{biome}', biome).replace('{pop}', String(s.population)).replace('{gen}', String(s.generation));

    // --- transitions, in priority order (these mirror what just changed) ---
    if (biome !== this.prevBiome) return fill(pick([
      'And so we arrive in the {biome} — a new land, with new rules for survival.',
      'Here, in the {biome}, life must begin its patient work anew.',
    ]));
    if (night && !this.prevNight) return fill(pick([
      'As darkness settles over the {biome}, the creatures bed down to sleep — and trust to the night.',
      'Night falls. One by one they close their eyes; only the hunters stay awake.',
    ]));
    if (!night && this.prevNight) return fill(pick([
      'Dawn breaks, and the survivors stir. Another day, another chance, begins.',
      'With the first light the herd wakes — those the night has spared.',
    ]));
    if (prowling && !this.prevProwl) return fill(pick([
      'Quiet now. A predator moves among them, choosing its moment.',
      'A hunter is on the prowl. Somewhere in the herd, a life is about to end.',
    ]));
    if (weather >= 0.8 && !this.prevSevere) return fill(pick([
      'The sky blackens. A storm of real violence is closing over the {biome}.',
      'Now, the great test. The wise make for the trees; the rest must take their chances.',
    ]));
    if (s.age - this.lastLightning < 6) return fill(pick([
      'A bolt of lightning — and the exposed are simply, suddenly, gone.',
      'The storm is merciless. Only the sheltered will greet the dawn.',
    ]));
    if (s.flyers > 0 && this.prevFlyers === 0) return fill(pick([
      'Remarkable. For the first time, a creature lifts into the air — beyond the reach of the jaws below.',
      'Wings, at last. A whole new dimension of escape has opened to them.',
    ]));
    if (s.flyers === 0 && this.prevFlyers > 0) return fill('And the brief age of flight ends. Here, it seems, the earth-bound endure.');
    if (this.prevPop > 12 && s.population < this.prevPop * 0.6) return fill(pick([
      'Their numbers fall away. Life has asked too much of this small world.',
      'A reckoning. The world can feed only so many — and today, too few.',
    ]));
    if (this.prevPop > 5 && s.population > this.prevPop * 1.4) return fill('A surge of new life. For now, at least, there is plenty.');
    if (Math.floor(s.generation / 5) > this.prevGenTier && s.generation >= 5) return fill(pick([
      '{gen} generations have come and gone. These are no longer the creatures we first met.',
      '{gen} generations deep — every instinct here was earned the hard way.',
    ]));

    // --- ambient, chosen to mirror the present mood (so it never reads as a loop) ---
    if (night) return fill(pick([
      'Under the stars, the {biome} lies still — only breathing, and the patience of the dark.',
      'They sleep in scattered clusters, drawing what safety they can from one another.',
    ]));
    if (weather > 0.5) return fill(pick([
      'Rain hammers the {biome}. Every creature is reduced to a single question: where is it dry?',
      'The wind howls, and the small ones huddle. To endure the storm is, today, to win.',
    ]));
    if (prowling || s.predators > s.population * 0.3) return fill(pick([
      'An uneasy calm. The prey graze with one eye always on the horizon.',
      'Predator and prey share this ground — and both know exactly what that means.',
    ]));
    return fill(pick([
      'Across the {biome}, {pop} small lives go quietly about the business of staying alive.',
      'To us, coloured shapes. To them, the whole of existence.',
      'They feed, they gather, they drift apart — the oldest rhythm there is.',
      'Notice how deliberately they move now; their small minds have learned this world.',
    ]));
  }

  private emit(text: string): void {
    this.onLine?.(text);
    const p = document.createElement('p');
    p.textContent = text;
    this.body.appendChild(p);
    this.lines.push(p);
    while (this.lines.length > 5) this.lines.shift()?.remove();
    const n = this.lines.length;
    this.lines.forEach((el, i) => { el.style.opacity = String(0.28 + 0.72 * ((i + 1) / n)); });
  }
}
