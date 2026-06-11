// Emergent "speech": once a lineage has evolved far enough (a high enough generation), the smart,
// mature critters chat. When two evolved critters are near each other they have a short, playful
// back-and-forth (bubbles pop over each in turn); a lone critter just blurts a single line. A local
// LLM writes the lines when AI narration is enabled; otherwise cute canned lines/exchanges are used.
// Deliberately sparse + brief so it stays charming, never spammy.

import { LIFE, SPECIES, params } from '../config';
import type { World } from '../sim/world';
import type { Creature } from '../sim/creature';

const TALK_GEN = 2;        // a lineage must be this many generations deep before any talking begins
const SMART_ENOUGH = 0.85; // most species develop speech now (only the dim Beetlebug stays mute)
const BUBBLE_LIFE = 4.2;   // seconds a bubble lingers
const MAX_BUBBLES = 6;     // never more than this on screen at once
const PARTNER_RADIUS = 12; // how close another critter must be to strike up a conversation
const LINE_GAP = 1.2;      // seconds between the back-and-forth replies

// What's happening to a critter right now, most urgent/dramatic first. Drives which lines it says, so the
// chatter is always about the moment on screen — a plague, a volcano, a hunt — not a random non-sequitur.
type Scene = 'sick' | 'flee' | 'volcano' | 'freeze' | 'radiate' | 'dark' | 'hunted'
  | 'storm' | 'drink' | 'eat' | 'night' | 'predator' | 'hungry' | 'social' | 'idle';

// Short (≤6 words), in-the-moment one-liners, keyed by scenario. Comedy first, relevance always.
const LINES: Record<Scene, string[]> = {
  sick: ['*cough* …i\'m fine', 'is this catching?', 'i feel gross', 'send soup', 'who sneezed on me', 'not my best era'],
  flee: ['RUN!', 'not today!', 'yikes!', 'nope nope nope', 'too slow, sucker!', 'every critter for itself!'],
  volcano: ['hot hot HOT', 'the floor is lava?!', 'i blame the gods', 'who lit the ground?', 'too spicy!', 'medium rare, please'],
  freeze: ['s-s-so cold', 'who turned off the sun?', 'group huddle?', 'i regret everything', 'my little toes!', 'summer was a lie'],
  radiate: ['i feel… different', 'is my tail glowing?', 'evolution, baby!', 'new me, who dis', 'i contain multitudes', 'mutation just dropped'],
  dark: ['why\'s it so dark?', 'did something hit us?', 'ominous…', 'i want my mom', 'this is fine', 'who ordered the apocalypse'],
  hunted: ['something\'s watching…', 'i don\'t like this', 'stay sharp', 'act natural', 'was that a wolf?', 'be cool, be cool'],
  storm: ['weather\'s grim', 'great, rain', 'who ordered thunder?', 'i hate this', 'umbrella? anyone?'],
  drink: ['*sip*', 'ahh, refreshing', 'good water', 'hydrate or diedrate'],
  eat: ['yum!', 'nom nom', 'tasty!', 'snack time', 'munch munch', 'best grass ever'],
  night: ['sleepy…', 'stars are pretty', 'yaaawn', 'goodnight, world', 'five more minutes'],
  predator: ['mmm, lunch', 'here, prey prey prey', 'i\'m not scary, promise', 'just a lil nibble', 'you look delicious'],
  hungry: ['so hungry', 'where\'s the snacks?', 'i could eat a tree', 'food. now.', 'my tummy evolved a growl'],
  social: ['hi friend!', 'hey pal!', 'nice to see ya', 'we are many', 'cousin!', 'squad goals'],
  idle: ['nice day!', 'wheee!', 'zoomies!', 'i think therefore i am?', 'big brain moment', 'is this… life?', 'what a world', 'so many flowers', 'feeling fast today', 'small legs, big dreams'],
};

// Short, lightly-funny exchanges for a pair — a general pool, plus scenario-specific ones so two critters
// will bicker about whatever's actually happening.
const EXCHANGES: string[][] = [
  ['race you to the food!', 'you always lose'],
  ['is this… life?', 'deep, for a tiny brain'],
  ['i found a snack', 'share? …rude'],
  ['nice day, huh?', "don't jinx it"],
  ['why do we even run?', 'i just like running'],
  ['i think i evolved!', 'use it to dodge that'],
  ['we are many!', 'and yet, so alone'],
  ['watch this!', 'please do not'],
  ['i love this meadow', 'you say that daily'],
  ['hi! do i know you?', 'we are literally cousins'],
  ['zoomies?', 'zoomies.'],
  ["what's for dinner?", 'grass. always grass.'],
  ['i had a strange dream', "critters can't dream", 'this one did'],
  ['do i look smart?', 'you look hungry'],
  ['after you', 'no, after YOU'],
  ['my genes are perfect', 'your tail says otherwise'],
  ['life is short', 'so are you'],
];

// Pair exchanges tied to a scenario — picked when that scene is active so the back-and-forth is on-topic.
const SCENE_EXCHANGES: Partial<Record<Scene, string[][]>> = {
  volcano: [['is that LAVA?', 'walk, don\'t run', 'RUN'], ['hot out, huh?', 'understatement of the era']],
  freeze: [['c-cold enough for ya?', 'cuddle for science?'], ['where\'d summer go?', 'evolution forgot a coat']],
  dark: [['did you see that?', 'pretending i didn\'t'], ['the sky looks angry', 'what did we DO?']],
  hunted: [['predator?', 'run now, ask later'], ['be cool', 'i am the opposite of cool']],
  radiate: [['i feel funny', 'you look funny too'], ['new mutation just dropped', 'flex later, run now']],
  sick: [['you don\'t look good', 'thanks, neither do you'], ['*cough*', 'stand downwind, please']],
  flee: [['was that a predator?!', 'run now, ask later'], ['why are we running?', 'no idea, keep going']],
};

// Quick group reactions: when a predator spooks the herd or someone finds food, a few nearby critters
// blurt at once in a little wave.
const REACT = {
  predator: ['run!', 'behind you!', 'predator!', 'go go go!', 'not me, not me', 'scatter!', 'yikes!'],
  food: ['free food!', 'where?!', 'mine!', 'share?', 'dibs!', 'ooh, snacks', 'over here!'],
};

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

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
interface Queued { id: number; text: string; delay: number; }

export class Chatter {
  private active = new Map<number, Dialog>();
  private queue: Queued[] = []; // upcoming conversation lines, fired as their delay elapses
  private cooldown = 3;
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
    // fire queued conversation lines whose turn has come (skipping any whose speaker has died)
    if (this.queue.length) {
      const still: Queued[] = [];
      for (const q of this.queue) {
        q.delay -= dt;
        if (q.delay > 0) { still.push(q); continue; }
        if (world.creatures.some((c) => c.id === q.id)) this.say(q.id, q.text);
      }
      this.queue = still;
    }

    if (world.generation < TALK_GEN) return;
    this.cooldown -= dt;
    if (this.cooldown > 0 || this.queue.length || this.active.size >= MAX_BUBBLES) return;
    this.cooldown = 2.2 + Math.random() * 2.8; // livelier than before, but still paced so it never spams

    // a group reaction takes priority when something is happening to the herd
    const trig = this.findReactionTrigger(world);
    if (trig && Math.random() < (trig.kind === 'predator' ? 0.7 : 0.3)) { this.herdReact(world, trig.c, trig.kind); return; }

    const speaker = this.pickSpeaker(world);
    if (!speaker) return;
    const partner = this.pickPartner(world, speaker);

    if (partner) {
      // a conversation between the two — about whatever's happening to them right now
      if (this.llmReady() && !this.busy) this.askExchange(speaker, partner, world);
      else {
        const scene = this.sceneTag(world, speaker);
        const pool = SCENE_EXCHANGES[scene];
        this.startConvo(speaker.id, partner.id, [...pick(pool ?? EXCHANGES)]);
      }
    } else if (this.llmReady() && !this.busy) {
      // a lone musing
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
    if (text) this.active.set(id, { id, text, timer: BUBBLE_LIFE });
  }

  /** Queue an exchange's lines, alternating speakers, spaced out so it reads as a back-and-forth. */
  private startConvo(idA: number, idB: number, lines: string[]): void {
    let t = 0;
    for (let i = 0; i < lines.length; i++) {
      this.queue.push({ id: i % 2 === 0 ? idA : idB, text: this.clean(lines[i]!), delay: t });
      t += LINE_GAP + Math.random() * 0.5;
    }
    this.cooldown = Math.max(this.cooldown, t + 5); // let the conversation breathe before the next one
  }

  /** A random mature, awake, sufficiently-bright critter that isn't already talking. */
  private pickSpeaker(world: World): Creature | null {
    const able = world.creatures.filter((c) => this.eligible(c) && !this.active.has(c.id));
    return able.length ? able[Math.floor(Math.random() * able.length)]! : null;
  }

  /** The nearest other eligible critter within chatting range, to converse with. */
  private pickPartner(world: World, speaker: Creature): Creature | null {
    let best: Creature | null = null;
    let bestD = PARTNER_RADIUS * PARTNER_RADIUS;
    for (const c of world.creatures) {
      if (c.id === speaker.id || this.active.has(c.id) || !this.eligible(c)) continue;
      const d = (c.x - speaker.x) ** 2 + (c.z - speaker.z) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /** Find a critter the herd would react to: one startled by a predator, or one calling about food. */
  private findReactionTrigger(world: World): { c: Creature; kind: 'predator' | 'food' } | null {
    let food: Creature | null = null;
    for (const c of world.creatures) {
      if (!this.eligible(c)) continue;
      if (c.startleTimer > 0) return { c, kind: 'predator' };
      if (!food && c.signalTimer > 0) food = c;
    }
    return food ? { c: food, kind: 'food' } : null;
  }

  /** A few nearby critters blurt a quick reaction in a staggered wave. */
  private herdReact(world: World, center: Creature, kind: 'predator' | 'food'): void {
    const pool = kind === 'predator' ? REACT.predator : REACT.food;
    const near = world.creatures
      .filter((c) => this.eligible(c) && (c.x - center.x) ** 2 + (c.z - center.z) ** 2 < 14 * 14)
      .slice(0, 4);
    let t = 0;
    for (const c of near) {
      this.queue.push({ id: c.id, text: pick(pool), delay: t });
      t += 0.25 + Math.random() * 0.4;
    }
    this.cooldown = Math.max(this.cooldown, t + 5);
  }

  private eligible(c: Creature): boolean {
    return c.alive && !c.asleep && c.age >= LIFE.matureAge && (SPECIES[c.genome.species]?.smarts ?? 0) >= SMART_ENOUGH;
  }

  /** The dominant thing happening to this critter right now — drives what it talks about. */
  private sceneTag(world: World, c: Creature): Scene {
    if (c.infected > 0) return 'sick';
    if (c.startleTimer > 0) return 'flee';
    if (world.volcanoGlow > 0.05) return 'volcano';
    if (world.cold > 0.05) return 'freeze';
    if (world.radiationT > 0) return 'radiate';
    if (world.gloom > 0.05) return 'dark'; // asteroid pall / generic darkening
    if (world.plagueActive && Math.random() < 0.6) return 'sick'; // gossip about the outbreak even if healthy
    if (world.prowling > 0 && !c.isPredator) return 'hunted';
    if (params.weather > 0.6) return 'storm';
    if (c.drinkTimer > 0) return 'drink';
    if (c.signalTimer > 0) return 'eat';
    if (world.dayFactor < 0.28) return 'night';
    if (c.isPredator) return 'predator';
    if (c.energy < 0.35 * c.maxEnergy) return 'hungry';
    if (Math.random() < 0.28) return 'social';
    return 'idle';
  }

  private canned(c: Creature, world: World): string {
    return pick(LINES[this.sceneTag(world, c)]);
  }

  private llmReady(): boolean { return !!this.llmOn?.checked && !!this.llmUrl?.value.trim(); }

  /** A one-sentence description of what's happening around a critter, so the LLM lines stay on-topic. */
  private sceneDescription(world: World, c: Creature): string {
    if (c.infected > 0 || world.plagueActive) return 'A plague is spreading and some of you feel sick.';
    if (world.volcanoGlow > 0.05) return 'A volcano is erupting nearby — the ground glows with lava.';
    if (world.cold > 0.05) return 'An ice age has frozen the whole world white.';
    if (world.radiationT > 0) return 'A surge of evolution is rippling through everyone — bodies are changing.';
    if (world.gloom > 0.05) return 'The sky has gone dark and ashen after a disaster struck.';
    if (world.prowling > 0) return 'A predator is on the prowl close by.';
    if (params.weather > 0.6) return 'A storm is raging with rain and thunder.';
    if (world.dayFactor < 0.28) return 'It is night and most of the world is asleep.';
    return '';
  }

  /** Ask the local LLM for a short, witty two-line exchange between two named critters. */
  private askExchange(a: Creature, b: Creature, world: World): void {
    this.busy = true;
    const url = this.llmUrl!.value.trim();
    const model = this.llmModel?.value.trim() || 'llama3.2';
    const aSp = SPECIES[a.genome.species]?.name ?? 'creature';
    const bSp = SPECIES[b.genome.species]?.name ?? 'creature';
    const scene = this.sceneDescription(world, a);
    const prompt = [
      `Two tiny cute creatures in a little evolving world are chatting.`,
      `${a.name} is a ${aSp}; ${b.name} is a ${bSp}.`,
      scene ? `What's happening right now: ${scene} React to it.` : '',
      `Write a SHORT, funny back-and-forth: exactly two lines, format "Name: words", max 6 words per line.`,
      `Playful and a touch witty. No quotation marks.`,
    ].filter(Boolean).join(' ');
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt, stream: false }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('llm'))))
      .then((d: unknown) => {
        this.busy = false;
        const lines = this.parseExchange(extractText(d));
        if (lines.length >= 2) this.startConvo(a.id, b.id, lines);
        else this.startConvo(a.id, b.id, [...pick(EXCHANGES)]);
      })
      .catch(() => { this.busy = false; this.startConvo(a.id, b.id, [...pick(EXCHANGES)]); });
  }

  /** Split an LLM reply into up to two clean lines, stripping any "Name:" prefixes. */
  private parseExchange(raw: string): string[] {
    return raw
      .split(/\n+/)
      .map((l) => l.replace(/^[^:]{1,18}:\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 2);
  }

  private ask(c: Creature, world: World): Promise<string> {
    const url = this.llmUrl!.value.trim();
    const model = this.llmModel?.value.trim() || 'llama3.2';
    const def = SPECIES[c.genome.species];
    const sp = def?.name ?? 'creature';
    const smarts = def?.smarts ?? 1;
    const wit = smarts >= 1.2 ? 'remarkably clever, curious and a little witty'
      : smarts >= 1.0 ? 'of average wits — cheerful and simple'
      : 'a simple, goofy little soul';
    const time = world.dayFactor < 0.28 ? 'night' : 'daytime';
    const hungry = c.energy < 0.35 * c.maxEnergy;
    const doing = c.infected > 0 ? 'sick with a plague and feeling awful'
      : c.startleTimer > 0 ? 'fleeing for your life from a predator'
      : c.drinkTimer > 0 ? 'drinking at a pond'
      : c.signalTimer > 0 ? 'happily eating'
      : c.isPredator ? 'stalking your prey'
      : hungry ? 'wandering, hungry, hunting for food'
      : 'wandering the meadow';
    const scene = this.sceneDescription(world, c);
    const style = smarts >= 1.2 ? 'up to 8 words, and a touch witty or curious'
      : 'max 5 words, simple and playful';
    const prompt = [
      `You are ${c.name}, a small cute ${sp} in a tiny evolving world.`,
      `You are ${wit} — let that come through in how you speak.`,
      `It is ${time}. Right now you are ${doing}.`,
      scene ? `What's happening around you: ${scene} React to it.` : '',
      `Say ONE short, spontaneous, in-character line (${style}). Funny and cute. No quotation marks.`,
    ].filter(Boolean).join(' ');
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
