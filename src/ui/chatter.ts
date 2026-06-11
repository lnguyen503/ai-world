// Emergent "speech": once a lineage has evolved far enough (a high enough generation), the smart,
// mature critters chat. When two evolved critters are near each other they have a short, playful
// back-and-forth (bubbles pop over each in turn); a lone critter just blurts a single line. Lines react
// to what's actually happening (a hunt, a plague, a volcano), each species has its own comedy voice, and
// — when nothing's going on — they get a little meta about being tiny creatures watched by a giant. A
// local LLM writes the lines when AI narration is enabled; otherwise the (big, anti-repeating) canned
// pools are used. Paced so it's lively but never spammy.

import { LIFE, SPECIES, params } from '../config';
import type { World } from '../sim/world';
import type { Creature } from '../sim/creature';

const TALK_GEN = 2;        // a lineage must be this many generations deep before any talking begins
const SMART_ENOUGH = 0.85; // most species develop speech now (only the dim Beetlebug stays mute)
const BUBBLE_LIFE = 4.2;   // seconds a bubble lingers
const MAX_BUBBLES = 8;     // never more than this on screen at once
const PARTNER_RADIUS = 12; // how close another critter must be to strike up a conversation
const LINE_GAP = 1.0;      // seconds between the back-and-forth replies

// What's happening to a critter right now, most urgent/dramatic first. Drives which lines it says, so the
// chatter is always about the moment on screen — a plague, a volcano, a hunt — not a random non-sequitur.
type Scene = 'sick' | 'flee' | 'volcano' | 'freeze' | 'radiate' | 'dark' | 'hunted'
  | 'storm' | 'drink' | 'eat' | 'night' | 'predator' | 'hungry' | 'social' | 'idle';

// Short, in-the-moment one-liners, keyed by scenario. Comedy first, relevance always. Big pools so it
// doesn't repeat; deadpan / absurd / a little meta beats merely "cute".
const LINES: Record<Scene, string[]> = {
  sick: ["*cough* …i'm fine", "is this catching?", "i feel gross", "send soup", "who sneezed on me", "not my best era", "my resistance gene said 'nah'", "i regret the group hug", "patient zero was probably Greg", "*sneezes in three directions*"],
  flee: ["RUN!", "not today!", "yikes!", "nope nope nope", "too slow, sucker!", "every critter for itself!", "legs, do your thing!", "this is why i did cardio", "i'm too cute to die!", "see you NEVER!"],
  volcano: ["hot hot HOT", "the floor is LAVA?!", "i blame the giant", "who lit the ground??", "too spicy! too spicy!", "medium rare, please", "this meadow has issues", "i did NOT sign up for this", "well that's a new feature"],
  freeze: ["s-s-so cold", "who turned off the sun?", "group huddle, NOW", "i regret everything", "my little toes!!", "summer was a lie", "i can see my breath. neat. awful.", "evolve a coat, cowards", "winter came. personally."],
  radiate: ["i feel… DIFFERENT", "is my tail glowing??", "evolution, baby!!", "new me, who dis", "i contain multitudes now", "mutation just dropped", "a new era?? i wasn't ready", "i think i'm the upgrade", "ascending. brb."],
  dark: ["why's it so dark?", "did something HIT us?", "ominous… very ominous", "i want my mom", "this is fine. this is fine.", "who ordered the apocalypse", "the sky used to be nicer", "i don't like the new sky", "bad vibes. cosmic bad vibes."],
  hunted: ["something's watching…", "i don't like this", "stay sharp, look snacky", "act natural. ACT NATURAL.", "was that a wolf or my anxiety", "be cool, be cool, be— RUN", "i volunteer literally anyone else", "nobody move. nobody breathe."],
  storm: ["weather's grim", "great, sky tears", "who ordered thunder?", "i hate this for me", "umbrella? anyone? anyone?", "the sky is yelling again", "rude weather. very rude."],
  drink: ["*sip*", "ahh, refreshing", "good water. great water.", "hydrate or diedrate", "pond water hits different", "don't tell me what's in it"],
  eat: ["yum!", "nom nom", "tasty!", "snack o'clock", "munch munch", "best grass ever", "ten outta ten, would graze", "don't mind if i do", "this one's mine. and that one.", "grass: still undefeated"],
  night: ["sleepy…", "the stars are showing off", "yaaawn", "goodnight, weird world", "five more minutes", "who scheduled the dark", "counting… other… critters…", "is it bedtime or vibe time"],
  predator: ["mmm, lunch", "here, prey prey prey", "i'm not scary, promise", "just a lil nibble", "you look delicious", "don't run, it's rude", "here for the cardio (and you)", "smile, you're dinner"],
  hungry: ["so hungry", "where's the snacks??", "i could eat a tree", "food. now. please.", "my tummy evolved a growl", "running on fumes and spite", "is anyone gonna eat that", "i'd trade a gene for a snack"],
  social: ["hi friend!", "hey pal!", "oh good, witnesses", "we are many, we are smol", "cousin! …probably", "squad goals, herd vibes", "you again! love that", "safety in numbers, baby", "i don't know you but i trust you"],
  idle: ["nice day!", "wheee!", "zoomies!", "i think therefore i… snack", "big brain moment", "is this life? or just grass?", "what a world, huh", "so many flowers, so little time", "feeling fast today", "small legs, big dreams", "living the grass dream", "i'm thriving, probably", "existence: surprisingly okay", "just a guy. just vibing."],
};

// Meta gags — the critters are dimly aware they're in a simulation being watched. The funniest bits.
const META = [
  "i sense a giant watching us",
  "are we… being observed?",
  "someone keeps speeding up time",
  "i think the sky has a cursor",
  "evolution is trial and error. mostly error.",
  "i was randomly generated, and it shows",
  "is the narrator talking about ME?",
  "pretty sure i'm procedurally adorable",
  "my whole personality is one gene",
  "i peaked at generation four",
  "natural selection, do your worst",
  "i have a neural net. it has two thoughts.",
  "i'd wave at the camera if i had hands",
  "plot twist: i'm the main character",
  "the giant fed us again. simp.",
  "somewhere a fitness function judges me",
];

// Each species talks with its own comedy voice, so lineages feel like characters, not clones.
const SPECIES_VOICE: Record<string, string[]> = {
  Foxling: ["i've run the numbers. grim.", "ah, sweet meaningless existence", "i'm not smug, i'm correct", "evolution's finest, obviously", "thinking is my cardio", "statistically, i'm better than you", "i could outwit a rock. low bar."],
  Hopkin: ["is everyone seeing this?? just me??", "i've made a huge mistake", "why is everyone so CALM", "i don't love the vibes rn", "what was THAT. what was that.", "i need an adult. i AM the adult.", "hopping helps. it doesn't. i'll hop."],
  Slink: ["i am speed", "i licked it. it's mine now.", "no thoughts. just slink.", "i ate something. regret pending.", "rules? don't know her", "wide. i am simply wide.", "i'm gonna do a crime (graze)"],
  Pebble: ["i am a rock. a happy rock.", "today, i simply vibe", "be the pebble you wish to see", "mmm. ground.", "i contain no thoughts. peaceful.", "slow day. good day.", "i like… the green. yes."],
};

// Short, funny back-and-forths for a pair — a general pool, plus scenario-specific ones so two critters
// bicker about whatever's actually happening.
const EXCHANGES: string[][] = [
  ["race you to the food!", "you always lose"],
  ["is this… life?", "deep, for a two-neuron brain"],
  ["i found a snack", "we are sharing", "we are NOT"],
  ["nice day, huh?", "don't you DARE jinx it"],
  ["why do we even run?", "i just like the wind"],
  ["i think i evolved!", "use it to dodge THAT"],
  ["we are many!", "and yet, so alone"],
  ["watch this!", "please. do not."],
  ["i love this meadow", "you say that hourly"],
  ["hi! do i know you?", "we're literally cousins", "small world"],
  ["zoomies?", "zoomies."],
  ["what's for dinner?", "grass.", "again??", "always grass."],
  ["i had a dream", "critters can't dream", "this one did. it was grass."],
  ["do i look smart?", "you look hungry", "fair"],
  ["after you", "no, after YOU", "we'll die here, politely"],
  ["my genes are perfect", "your tail begs to differ"],
  ["life is short", "so are you", "rude. correct, but rude."],
  ["i'm gonna be apex predator", "you eat grass", "apex grazer, then"],
  ["is the giant watching?", "always. wave.", "hi, giant!"],
  ["betcha i reproduce first", "betcha you trip", "…deal"],
  ["the narrator called me majestic", "the narrator lies", "let me HAVE this"],
  ["do you ever think?", "i try not to", "wise"],
];

// Pair exchanges tied to a scenario — picked when that scene is active so the back-and-forth is on-topic.
const SCENE_EXCHANGES: Partial<Record<Scene, string[][]>> = {
  volcano: [["is that LAVA?", "walk, don't run", "RUN"], ["hot out, huh?", "understatement of the era"], ["the ground's on fire", "ground had a rough day"]],
  freeze: [["c-cold enough for ya?", "cuddle for science?"], ["where'd summer go?", "evolution forgot a coat"], ["i can't feel my legs", "you have legs?"]],
  dark: [["did you see that?", "pretending i didn't"], ["the sky looks angry", "what did we DO?"], ["is this the end?", "it's a tuesday"]],
  hunted: [["predator?", "run now, ask later"], ["be cool", "i am the OPPOSITE of cool"], ["you smell that?", "that's fear. it's me."]],
  radiate: [["i feel funny", "you look funny too"], ["new mutation just dropped", "flex later, run now"], ["am i glowing?", "blindingly. insufferable."]],
  sick: [["you don't look good", "thanks, neither do you"], ["*cough*", "stand downwind, please"], ["am i immune?", "we'll find out together"]],
  flee: [["was that a predator?!", "run now, ask later"], ["why are we running?", "no idea, keep going"], ["i'm getting tired", "tired beats eaten"]],
  eat: [["share?", "define 'share'"], ["this grass is great", "it's the same grass"]],
};

// Quick group reactions: when a predator spooks the herd or someone finds food, a few nearby critters
// blurt at once in a little wave.
const REACT = {
  predator: ["run!", "behind you!", "PREDATOR!", "go go go!", "not me, not me!", "scatter!", "every prey for itself!", "i liked this herd!"],
  food: ["free food!", "where?! WHERE?!", "mine!", "share?? no.", "dibs! dibs!", "ooh, snacks", "over here, idiots!", "first!"],
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
  private recent: string[] = []; // last few lines said, to avoid immediate repeats
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
    // note: a queued conversation no longer blocks new chatter — other critters can chime in while two
    // are mid-exchange, so a busy herd actually feels busy (MAX_BUBBLES still caps what's on screen)
    if (this.cooldown > 0 || this.active.size >= MAX_BUBBLES) return;
    this.cooldown = 0.7 + Math.random() * 1.4; // brisk, lively chatter (still capped by MAX_BUBBLES)

    // a group reaction occasionally fires when something hits the herd — kept rare so it punctuates the
    // chatter rather than drowning it (predators are around a lot; we don't want a constant wall of "run!")
    const trig = this.findReactionTrigger(world);
    if (trig && Math.random() < (trig.kind === 'predator' ? 0.3 : 0.2)) { this.herdReact(world, trig.c, trig.kind); return; }

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
    this.cooldown = Math.max(this.cooldown, 1.2); // a short beat before the next line; others can still chime in
  }

  /** A mature, awake, sufficiently-bright critter that isn't already talking. Most of the time we prefer a
   *  CALM one (not mid-panic): a hunt spreads startle across the whole herd, and without this bias every
   *  speaker would be fleeing and you'd see nothing but "RUN!" — this lets the personality/idle/meta lines
   *  actually surface, while still occasionally picking a panicking critter for reactive flavour. */
  private pickSpeaker(world: World): Creature | null {
    const able = world.creatures.filter((c) => this.eligible(c) && !this.active.has(c.id));
    if (!able.length) return null;
    if (Math.random() < 0.8) {
      const calm = able.filter((c) => c.startleTimer <= 0 && c.alarmTimer <= 0);
      if (calm.length) return calm[Math.floor(Math.random() * calm.length)]!;
    }
    return able[Math.floor(Math.random() * able.length)]!;
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
    for (const c of near.slice(0, 3)) { // a smaller wave, and anti-repeated so it's not the same word x3
      this.queue.push({ id: c.id, text: this.fresh(pool), delay: t });
      t += 0.3 + Math.random() * 0.4;
    }
    this.cooldown = Math.max(this.cooldown, 1.5); // a quick beat after the reaction wave
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
    if (world.plagueActive && Math.random() < 0.5) return 'sick'; // gossip about the outbreak even if healthy
    // a hunt is usually happening somewhere — only let it dominate a fraction of the herd's chatter,
    // so the personality / meta / idle lines still come through instead of a wall of "run!"
    if (world.prowling > 0 && !c.isPredator && Math.random() < 0.3) return 'hunted';
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
    const scene = this.sceneTag(world, c);
    // when nothing dramatic is happening, lean on personality + the meta gags (the funniest material)
    if (scene === 'idle' || scene === 'social') {
      const voice = SPECIES_VOICE[SPECIES[c.genome.species]?.name ?? ''];
      const r = Math.random();
      if (voice && r < 0.4) return this.fresh(voice);
      if (r < 0.6) return this.fresh(META);
    }
    return this.fresh(LINES[scene]);
  }

  /** Pick a line from a pool, avoiding the handful most recently said anywhere (kills the repetition). */
  private fresh(pool: string[]): string {
    let line = pick(pool);
    for (let i = 0; i < 6 && this.recent.includes(line); i++) line = pick(pool);
    this.recent.push(line);
    if (this.recent.length > 16) this.recent.shift();
    return line;
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
