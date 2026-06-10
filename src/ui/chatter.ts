// Emergent "speech": once a lineage has evolved far enough (a high enough generation), the smart,
// mature critters occasionally blurt out a short, spontaneous line shown as a bubble over their head.
// A local LLM writes the lines when AI narration is enabled; otherwise a pool of cute canned lines is
// used. Deliberately sparse + brief so it stays fun, never spammy.

import { LIFE, SPECIES } from '../config';
import type { World } from '../sim/world';
import type { Creature } from '../sim/creature';

const TALK_GEN = 4;        // a lineage must be this many generations deep before any talking begins
const SMART_ENOUGH = 0.95; // only the brighter species (Foxling / Hopkin / Slink) develop speech
const BUBBLE_LIFE = 5;     // seconds a bubble lingers
const MAX_BUBBLES = 4;     // never more than this on screen at once

const CANNED = {
  eat: ['yum!', 'nom nom', 'tasty!', 'snack time', 'munch munch'],
  flee: ['RUN!', 'not today!', 'yikes!', 'nope nope nope', 'too slow!'],
  night: ['sleepy…', 'goodnight', 'stars are pretty', 'yaaawn'],
  drink: ['*sip*', 'ahh, refreshing', 'good water'],
  social: ['hi friend!', 'hey pal!', 'nice to see ya', 'we are many'],
  idle: ['nice day!', 'wheee!', 'zoomies!', 'i think… therefore i am?', 'big brain', 'evolution rocks', 'is this… life?', 'what a world', 'so many flowers', 'feeling fast today'],
};
const pick = (a: string[]): string => a[Math.floor(Math.random() * a.length)]!;

/** Pull text out of a local-LLM response (Ollama / OpenAI shapes). */
function extractText(d: unknown): string {
  if (typeof d === 'string') return d;
  const o = d as Record<string, unknown>;
  if (typeof o?.['response'] === 'string') return o['response'];
  const ch = (o?.['choices'] as Array<Record<string, unknown>> | undefined)?.[0];
  const msg = ch?.['message'] as Record<string, unknown> | undefined;
  if (typeof msg?.['content'] === 'string') return msg['content'];
  if (typeof ch?.['text'] === 'string') return ch['text'];
  return '';
}

export interface Dialog { id: number; text: string; timer: number; }

export class Chatter {
  private active = new Map<number, Dialog>();
  private cooldown = 6;
  private busy = false;
  private llmOn = document.getElementById('llm-on') as HTMLInputElement | null;
  private llmUrl = document.getElementById('llm-url') as HTMLInputElement | null;
  private llmModel = document.getElementById('llm-model') as HTMLInputElement | null;

  update(world: World, dt: number): void {
    // age out finished bubbles + drop any whose speaker has died
    for (const [id, d] of this.active) {
      d.timer -= dt;
      if (d.timer <= 0 || !world.creatures.some((c) => c.id === id)) this.active.delete(id);
    }
    if (world.generation < TALK_GEN) return; // not evolved enough to speak yet
    this.cooldown -= dt;
    if (this.cooldown > 0 || this.active.size >= MAX_BUBBLES) return;
    this.cooldown = 4 + Math.random() * 4;

    const speaker = this.pickSpeaker(world);
    if (!speaker) return;
    if (this.llmReady() && !this.busy) {
      this.busy = true;
      this.ask(speaker, world)
        .then((line) => { this.busy = false; this.say(speaker.id, this.clean(line) || this.canned(speaker, world)); })
        .catch(() => { this.busy = false; this.say(speaker.id, this.canned(speaker, world)); });
    } else {
      this.say(speaker.id, this.canned(speaker, world));
    }
  }

  dialogs(): Dialog[] { return [...this.active.values()]; }

  private say(id: number, text: string): void {
    if (text && !this.active.has(id)) this.active.set(id, { id, text, timer: BUBBLE_LIFE });
  }

  /** A random mature, awake, sufficiently-bright critter that isn't already talking. */
  private pickSpeaker(world: World): Creature | null {
    const able = world.creatures.filter((c) =>
      c.alive && !c.asleep && c.age >= LIFE.matureAge &&
      (SPECIES[c.genome.species]?.smarts ?? 0) >= SMART_ENOUGH && !this.active.has(c.id));
    return able.length ? able[Math.floor(Math.random() * able.length)]! : null;
  }

  private canned(c: Creature, world: World): string {
    if (c.startleTimer > 0) return pick(CANNED.flee);
    if (c.drinkTimer > 0) return pick(CANNED.drink);
    if (world.dayFactor < 0.28) return pick(CANNED.night);
    if (c.signalTimer > 0) return pick(CANNED.eat);
    if (Math.random() < 0.3) return pick(CANNED.social);
    return pick(CANNED.idle);
  }

  private llmReady(): boolean { return !!this.llmOn?.checked && !!this.llmUrl?.value.trim(); }

  private ask(c: Creature, world: World): Promise<string> {
    const url = this.llmUrl!.value.trim();
    const model = this.llmModel?.value.trim() || 'llama3.2';
    const def = SPECIES[c.genome.species];
    const sp = def?.name ?? 'creature';
    const smarts = def?.smarts ?? 1;
    // how clever this critter is shapes HOW it talks
    const wit = smarts >= 1.2 ? 'remarkably clever, curious and a little witty'
      : smarts >= 1.0 ? 'of average wits — cheerful and simple'
      : 'a simple, goofy little soul';
    const time = world.dayFactor < 0.28 ? 'night' : 'daytime';
    const hungry = c.energy < 0.35 * c.maxEnergy;
    const doing = c.startleTimer > 0 ? 'fleeing for your life from a predator'
      : c.drinkTimer > 0 ? 'drinking at a pond'
      : c.signalTimer > 0 ? 'happily eating'
      : c.isPredator ? 'stalking your prey'
      : hungry ? 'wandering, hungry, hunting for food'
      : 'wandering the meadow';
    const style = smarts >= 1.2 ? 'up to 8 words, and a touch witty or curious'
      : 'max 5 words, simple and playful';
    const prompt = [
      `You are ${c.name}, a small cute ${sp} in a tiny evolving world.`,
      `You are ${wit} — let that come through in how you speak.`,
      `It is ${time}. Right now you are ${doing}.`,
      `Say ONE short, spontaneous, in-character line (${style}). Cute. No quotation marks.`,
    ].join(' ');
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('llm'))))
      .then((d: unknown) => extractText(d));
  }

  private clean(s: string): string {
    const t = s.replace(/["'\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > 54 ? `${t.slice(0, 52)}…` : t;
  }
}
