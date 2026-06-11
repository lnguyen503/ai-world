type Mode = 'off' | 'nature' | 'music' | 'both';

// Pentatonic / modal scales — any random pick of notes from these sounds pleasant (never dissonant).
const SCALES = [
  [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25], // C major pentatonic
  [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 659.25], // A minor pentatonic
  [196.0, 246.94, 293.66, 349.23, 392.0, 493.88, 587.33], // G-based
  [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99], // D major pentatonic
  [164.81, 196.0, 220.0, 246.94, 293.66, 329.63, 392.0, 440.0], // E minor pentatonic
  [174.61, 220.0, 261.63, 329.63, 349.23, 440.0, 523.25], // F-based, airy
];
const randItem = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Procedural ambient audio (Web Audio, fully local) that reacts to the time of day and the weather.
 *
 * "Nature" is a living soundscape: a wind bed that swells with the weather, daytime birdsong (several
 * different call shapes), night-time crickets / owl hoots / frog croaks, and — as storms build — a
 * rain hiss and distant rolling thunder. "Music" is a calm, randomized music-box: notes drawn from a
 * pentatonic scale through a soft echo, whose tempo, loudness, octave and brightness shift with the
 * mood of the world (bright by day, a slow lullaby at night, sparse and hushed in a storm), with the
 * occasional gentle arpeggio and a warm pad swell. "Nature + Music" layers both.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private mode: Mode = 'off';
  private natureOn = false;
  private musicOn = false;

  // nature layers
  private noise: AudioBuffer | null = null;
  private windSrc: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private rainSrc: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private rainLp: BiquadFilterNode | null = null;
  private nextBird = 0;
  private nextCricket = 0;
  private nextNight = 0;
  private nextThunder = 0;

  // spatial audio: a listener that rides the camera, so positioned sounds pan + fade as you move/zoom
  private closeness = 0; // 0 = zoomed far out (a wide wash) … 1 = right down among the critters

  // music layers
  private musicMaster: GainNode | null = null;
  private musicNodes: AudioNode[] = [];
  private scale: number[] = SCALES[0]!;
  private nextNote = 0;
  private nextPad = 0;

  constructor() {
    const sel = document.getElementById('c-sound') as HTMLSelectElement | null;
    if (sel) sel.addEventListener('change', () => this.setMode(sel.value as Mode));
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    void this.ctx.resume();
    return this.ctx;
  }

  /** A reusable 2-second white-noise buffer (shared by the wind and rain sources). */
  private noiseBuf(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return this.noise;
  }

  /** Drive the Web Audio listener from the camera each frame: every positioned sound then pans + fades
   *  relative to where you're looking and how close you are. `dist` (camera→target) sets the "closeness"
   *  that swells the nearby-critter chatter when you zoom in and thins it to a murmur when you pull back. */
  setCamera(f: {
    px: number; py: number; pz: number; fx: number; fy: number; fz: number;
    ux: number; uy: number; uz: number; dist: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener as AudioListener & {
      setPosition?: (x: number, y: number, z: number) => void;
      setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
    };
    if (L.positionX) { // modern AudioParam interface
      L.positionX.value = f.px; L.positionY.value = f.py; L.positionZ.value = f.pz;
      L.forwardX.value = f.fx; L.forwardY.value = f.fy; L.forwardZ.value = f.fz;
      L.upX.value = f.ux; L.upY.value = f.uy; L.upZ.value = f.uz;
    } else { // deprecated fallback (older Safari)
      L.setPosition?.(f.px, f.py, f.pz);
      L.setOrientation?.(f.fx, f.fy, f.fz, f.ux, f.uy, f.uz);
    }
    // close, low zoom (dist ~20) → 1; pulled far back (dist ~115) → 0
    this.closeness = Math.max(0, Math.min(1, (115 - f.dist) / 95));
  }

  /** How "down among the critters" the camera is (0..1) — main.ts uses it to pace the chatter density. */
  get proximity(): number { return this.closeness; }

  /** A 3D-positioned panner at a world point, with gentle distance attenuation. Short-lived emitters
   *  (creature voices, kill thuds) connect through one of these so they sit where they happen in space. */
  private makePanner(ctx: AudioContext, x: number, y: number, z: number): PannerNode {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 10;
    p.maxDistance = 170;
    p.rolloffFactor = 1.1;
    const pp = p as PannerNode & { setPosition?: (x: number, y: number, z: number) => void };
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else pp.setPosition?.(x, y, z);
    return p;
  }

  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.stopAmbience();
    this.mode = mode;
    this.natureOn = mode === 'nature' || mode === 'both';
    this.musicOn = mode === 'music' || mode === 'both';
    if (mode === 'off') return;
    const ctx = this.ensureCtx();
    if (this.natureOn) this.startNature(ctx);
    if (this.musicOn) this.startMusic(ctx);
  }

  private stopAmbience(): void {
    for (const s of [this.windSrc, this.rainSrc]) {
      if (s) { try { s.stop(); } catch { /* already stopped */ } s.disconnect(); }
    }
    this.windSrc = this.rainSrc = null;
    this.windGain?.disconnect(); this.windGain = null;
    this.rainGain?.disconnect(); this.rainGain = null;
    this.rainLp?.disconnect(); this.rainLp = null;
    for (const n of this.musicNodes) n.disconnect();
    this.musicNodes = [];
    this.musicMaster?.disconnect(); this.musicMaster = null; // cuts any ringing note tails
  }

  // ── Nature ───────────────────────────────────────────────────────────────

  private startNature(ctx: AudioContext): void {
    const buf = this.noiseBuf(ctx);
    // wind bed
    const wsrc = ctx.createBufferSource(); wsrc.buffer = buf; wsrc.loop = true;
    const wlp = ctx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 480 + Math.random() * 360;
    const wg = ctx.createGain(); wg.gain.value = 0.12;
    wsrc.connect(wlp).connect(wg).connect(this.master!);
    wsrc.start();
    this.windSrc = wsrc; this.windGain = wg;
    // rain bed (starts silent; swells in only as the weather turns)
    const rsrc = ctx.createBufferSource(); rsrc.buffer = buf; rsrc.loop = true;
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 1400;
    const rg = ctx.createGain(); rg.gain.value = 0.0001;
    rsrc.connect(rlp).connect(rg).connect(this.master!);
    rsrc.start();
    this.rainSrc = rsrc; this.rainGain = rg; this.rainLp = rlp;
    const t = ctx.currentTime;
    this.nextBird = t + 1.5; this.nextCricket = t + 1; this.nextNight = t + 4; this.nextThunder = t + 3;
  }

  private updateNature(ctx: AudioContext, weather: number, dayFactor: number): void {
    const t = ctx.currentTime;
    const day = dayFactor > 0.55;
    const night = dayFactor < 0.3;
    const calm = weather < 0.4;

    // wind rises with the weather; rain hiss fades in past a threshold and brightens with intensity
    if (this.windGain) this.windGain.gain.value = lerp(this.windGain.gain.value, 0.1 + weather * 0.5, 0.05);
    if (this.rainGain) {
      const target = weather > 0.45 ? (weather - 0.45) * 0.6 : 0.0001;
      this.rainGain.gain.value = lerp(this.rainGain.gain.value, target, 0.04);
      if (this.rainLp) this.rainLp.frequency.value = 1400 + weather * 2600;
    }

    if (weather > 0.7 && t >= this.nextThunder) {
      if (Math.random() < 0.5) this.thunder(ctx, weather);
      this.nextThunder = t + 5 + Math.random() * 13;
    }
    if (t >= this.nextBird) {
      if (day && calm && Math.random() < 0.6) this.birdCall(ctx);
      this.nextBird = t + 1.8 + Math.random() * 4.5;
    }
    if (t >= this.nextCricket) {
      if (dayFactor < 0.4 && weather < 0.5) this.cricket(ctx);
      this.nextCricket = t + 0.5 + Math.random() * 1.1;
    }
    if (t >= this.nextNight) {
      if (night) (Math.random() < 0.5 ? this.owl(ctx) : this.frog(ctx));
      this.nextNight = t + 9 + Math.random() * 15;
    }
  }

  /** A randomly-chosen birdsong: a single chirp, a two-note call, or a quick warble. */
  private birdCall(ctx: AudioContext): void {
    const kind = Math.floor(Math.random() * 3);
    const base = 1900 + Math.random() * 2300;
    if (kind === 0) {
      this.blip(ctx, base, base * (0.5 + Math.random() * 0.3), 0.14, 0.1);
    } else if (kind === 1) {
      this.blip(ctx, base, base * 0.9, 0.1, 0.09);
      this.blip(ctx, base * 0.8, base * 0.7, 0.1, 0.08, 0.16);
    } else {
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain(); const t = ctx.currentTime;
      o.frequency.setValueAtTime(base, t);
      for (let i = 1; i <= 5; i++) o.frequency.setValueAtTime(base * (i % 2 ? 1.12 : 0.9), t + i * 0.05);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(this.master!); o.start(t); o.stop(t + 0.32);
    }
  }

  /** One swept sine "blip" (the building block for bird calls). */
  private blip(ctx: AudioContext, from: number, to: number, dur: number, vel: number, delay = 0): void {
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain(); const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(60, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);
    o.connect(g).connect(this.master!); o.start(t); o.stop(t + dur + 0.06);
  }

  /** A soft rhythmic cricket trill — a few fast band-passed pulses, kept quiet. */
  private cricket(ctx: AudioContext): void {
    const t = ctx.currentTime; const freq = 4200 + Math.random() * 900;
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const o = ctx.createOscillator(); o.type = 'square';
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 14;
      const g = ctx.createGain(); const w = t + i * 0.05;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, w);
      g.gain.exponentialRampToValueAtTime(0.03, w + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, w + 0.03);
      o.connect(bp).connect(g).connect(this.master!); o.start(w); o.stop(w + 0.04);
    }
  }

  /** A low two-note owl hoot. */
  private owl(ctx: AudioContext): void {
    const t = ctx.currentTime; const f = 360 + Math.random() * 80;
    for (const d of [0, 0.42]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain(); const w = t + d;
      o.frequency.setValueAtTime(f * 1.08, w);
      o.frequency.exponentialRampToValueAtTime(f, w + 0.18);
      g.gain.setValueAtTime(0.0001, w);
      g.gain.exponentialRampToValueAtTime(0.07, w + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, w + 0.32);
      o.connect(g).connect(this.master!); o.start(w); o.stop(w + 0.34);
    }
  }

  /** A short frog croak — a buzzy low tone. */
  private frog(ctx: AudioContext): void {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = ctx.createGain(); const t = ctx.currentTime;
    o.frequency.setValueAtTime(150, t);
    o.frequency.linearRampToValueAtTime(110, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(lp).connect(g).connect(this.master!); o.start(t); o.stop(t + 0.24);
  }

  /** Distant rolling thunder — a long, filtered noise rumble that grows with the storm. */
  private thunder(ctx: AudioContext, weather: number): void {
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf(ctx); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 130;
    const g = ctx.createGain(); const t = ctx.currentTime;
    const peak = 0.12 + weather * 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    src.connect(lp).connect(g).connect(this.master!); src.start(t); src.stop(t + 2.6);
  }

  // ── Music ────────────────────────────────────────────────────────────────

  private startMusic(ctx: AudioContext): void {
    const m = ctx.createGain(); m.gain.value = 0.5;
    m.connect(this.master!);
    // a subtle feedback-delay "echo" gives the notes a little space (gentle reverb feel)
    const delay = ctx.createDelay(); delay.delayTime.value = 0.19;
    const fb = ctx.createGain(); fb.gain.value = 0.24;
    const wet = ctx.createGain(); wet.gain.value = 0.25;
    m.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(this.master!);
    this.musicMaster = m;
    this.musicNodes = [delay, fb, wet];
    this.scale = randItem(SCALES); // a fresh key each time the mode starts
    const t = ctx.currentTime;
    this.nextNote = t + 0.3; this.nextPad = t + 4;
  }

  private updateMusic(ctx: AudioContext, weather: number, dayFactor: number): void {
    const t = ctx.currentTime;
    const night = dayFactor < 0.3;
    const storm = weather > 0.6;
    // mood shapes tempo, loudness and register without changing key (which would jar)
    const vel = storm ? 0.09 : night ? 0.11 : 0.16;
    const gap = (0.55 + Math.random() * 0.95) * (night ? 1.5 : 1) * (storm ? 1.4 : 1);
    const oct = night ? 0.5 : 1; // an octave lower at night for a lullaby warmth

    if (t >= this.nextNote) {
      if (!storm && Math.random() < 0.12) {
        this.arpeggio(ctx, t, vel, oct);
      } else {
        this.playNote(ctx, randItem(this.scale) * oct, t, 1.7, vel, 'triangle'); // melody
        if (Math.random() < 0.4) this.playNote(ctx, randItem(this.scale) * oct, t + 0.02, 1.9, vel * 0.55, 'sine'); // harmony
        if (Math.random() < 0.3) this.playNote(ctx, this.scale[0]! * 0.5 * oct, t, 2.6, vel * 0.8, 'sine'); // bass
      }
      this.nextNote = t + gap;
    }
    // an occasional slow pad swell underneath for warmth (not during storms)
    if (t >= this.nextPad) {
      if (!storm) this.playNote(ctx, this.scale[0]! * oct, t, 3.4, vel * 0.5, 'sine', 0.5);
      this.nextPad = t + 7 + Math.random() * 9;
    }
  }

  /** A gentle ascending run of 3–4 scale notes. */
  private arpeggio(ctx: AudioContext, t: number, vel: number, oct: number): void {
    const n = 3 + Math.floor(Math.random() * 2);
    const start = Math.floor(Math.random() * (this.scale.length - n));
    for (let i = 0; i < n; i++) {
      this.playNote(ctx, this.scale[start + i]! * oct, t + i * 0.13, 1.2, vel * 0.85, 'triangle');
    }
  }

  /** One soft note with a gentle attack and a long release — a music-box / soft-bell sound. */
  private playNote(ctx: AudioContext, freq: number, when: number, dur: number, vel: number, type: OscillatorType, attack = 0.04): void {
    if (!this.musicMaster) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vel, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(this.musicMaster);
    o.start(when); o.stop(when + dur + 0.05);
  }

  /** Per-frame driver — runs whichever layers are active, reacting to weather + time of day. */
  update(weather: number, dayFactor: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.natureOn) this.updateNature(ctx, weather, dayFactor);
    if (this.musicOn) this.updateMusic(ctx, weather, dayFactor);
  }

  /**
   * A short creature vocalization, emitted from the speaker's world position (x, z) through a 3D panner,
   * so it pans + fades by where the critter is relative to your camera — fly or zoom and it shifts. Only
   * sounds when the Nature layer is on. 'alarm' is a sharp rising squeak, 'chirp' a friendly call, 'hum'
   * a soft contented graze.
   */
  voice(kind: 'alarm' | 'chirp' | 'hum', x: number, z: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.natureOn) return;
    const t = ctx.currentTime;
    const panner = this.makePanner(ctx, x, 1.2, z); // just above the ground, at the critter
    panner.connect(this.master!);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (kind === 'hum') {
      o.type = 'sine';
      const base = 200 + Math.random() * 80;
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.06, t + 0.25);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g).connect(panner); o.start(t); o.stop(t + 0.46);
    } else {
      o.type = 'triangle';
      const base = kind === 'alarm' ? 1400 + Math.random() * 500 : 760 + Math.random() * 420;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (kind === 'alarm' ? 1.5 : 0.7), t + 0.12);
      const vel = kind === 'alarm' ? 0.085 : 0.055;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(panner); o.start(t); o.stop(t + 0.18);
    }
    o.onended = () => panner.disconnect();
  }

  /** A short musical cue tied to a dramatic moment (plays only when some ambience is on). A kill can pass
   *  its world (x, z) so the thud sounds from where it happened — louder and placed when you're close. */
  stinger(kind: 'birth' | 'kill' | 'milestone', x?: number, z?: number): void {
    const ctx = this.ctx;
    if (!ctx || this.mode === 'off') return;
    const t = ctx.currentTime;
    const tone = (freq: number, when: number, dur: number, vel: number, type: OscillatorType): void => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vel, when + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g).connect(this.master!); o.start(when); o.stop(when + dur + 0.05);
    };
    if (kind === 'kill') {
      // place the thud in space when we know where the kill was; otherwise play it flat at the master
      const dest: AudioNode = x != null && z != null ? this.makePanner(ctx, x, 1.2, z) : this.master!;
      if (dest !== this.master!) { dest.connect(this.master!); }
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain();
      o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(68, t + 0.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.11, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(dest); o.start(t); o.stop(t + 0.65); // a low ominous thud
      if (dest !== this.master!) o.onended = () => dest.disconnect();
    } else if (kind === 'birth') {
      [523.25, 659.25, 783.99].forEach((f, i) => tone(f, t + i * 0.09, 0.5, 0.075, 'triangle')); // bright rising chime
    } else {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.12, 0.7, 0.08, 'sine')); // shimmering arpeggio
    }
  }
}
