type Mode = 'off' | 'nature' | 'music';

// Pentatonic scales — any random pick of notes from these sounds pleasant (never dissonant).
const SCALES = [
  [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25], // C major pentatonic
  [220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 659.25], // A minor pentatonic
  [196.00, 246.94, 293.66, 349.23, 392.00, 493.88, 587.33], // G-based
];
const randItem = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

/**
 * Procedural ambient audio (Web Audio, fully local). "Nature" = wind that swells with the weather
 * + random birdsong. "Music" = soft, randomized melodic notes from a pentatonic scale (gentle
 * attack/release, occasional harmony + bass) — a calm music-box feel, not a drone.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private mode: Mode = 'off';
  private windSrc: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private musicMaster: GainNode | null = null;
  private scale: number[] = SCALES[0]!;
  private nextBird = 0;
  private nextNote = 0;

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

  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.stopAmbience();
    this.mode = mode;
    if (mode === 'off') return;
    const ctx = this.ensureCtx();
    if (mode === 'nature') this.startNature(ctx);
    else this.startMusic(ctx);
  }

  private stopAmbience(): void {
    if (this.windSrc) { try { this.windSrc.stop(); } catch { /* already stopped */ } this.windSrc.disconnect(); this.windSrc = null; }
    this.windGain?.disconnect(); this.windGain = null;
    this.musicMaster?.disconnect(); this.musicMaster = null; // cuts any ringing note tails
  }

  private startNature(ctx: AudioContext): void {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480 + Math.random() * 360;
    const g = ctx.createGain(); g.gain.value = 0.12;
    src.connect(lp).connect(g).connect(this.master!);
    src.start();
    this.windSrc = src; this.windGain = g;
    this.nextBird = ctx.currentTime + 1.5;
  }

  private startMusic(ctx: AudioContext): void {
    this.musicMaster = ctx.createGain();
    this.musicMaster.gain.value = 0.5;
    this.musicMaster.connect(this.master!);
    this.scale = randItem(SCALES); // a random key each time
    this.nextNote = ctx.currentTime + 0.3;
  }

  /** One soft note with a gentle attack and a long release — a music-box / soft-bell sound. */
  private playNote(ctx: AudioContext, freq: number, when: number, dur: number, vel: number): void {
    if (!this.musicMaster) return;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vel, when + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(this.musicMaster);
    o.start(when); o.stop(when + dur + 0.05);
  }

  /** Per-frame: wind/birds for nature, the note sequencer for music. */
  update(weather: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.mode === 'nature') {
      if (this.windGain) this.windGain.gain.value = 0.1 + weather * 0.5;
      if (ctx.currentTime >= this.nextBird) {
        if (weather < 0.4 && Math.random() < 0.6) this.chirp(ctx);
        this.nextBird = ctx.currentTime + 2 + Math.random() * 5;
      }
    } else if (this.mode === 'music' && ctx.currentTime >= this.nextNote) {
      const t = ctx.currentTime;
      this.playNote(ctx, randItem(this.scale), t, 1.7, 0.16); // melody
      if (Math.random() < 0.4) this.playNote(ctx, randItem(this.scale), t + 0.02, 1.9, 0.09); // soft harmony
      if (Math.random() < 0.3) this.playNote(ctx, this.scale[0]! / 2, t, 2.6, 0.13); // gentle bass
      this.nextNote = t + 0.55 + Math.random() * 0.95; // relaxed, slightly irregular tempo
    }
  }

  private chirp(ctx: AudioContext): void {
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const base = 2000 + Math.random() * 2200;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * (0.5 + Math.random() * 0.3), t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + 0.2);
  }
}
