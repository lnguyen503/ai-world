type Mode = 'off' | 'nature' | 'music';

// Soft, pleasant chords (low octaves) — music picks one at random and drifts between them.
const CHORDS = [
  [130.81, 164.81, 196.00, 246.94], // Cmaj7
  [110.00, 130.81, 164.81, 196.00], // Amin7
  [146.83, 174.61, 220.00, 261.63], // Dmin7
  [98.00, 123.47, 146.83, 185.00], // Gmaj7
  [116.54, 146.83, 174.61, 220.00], // Bbmaj7
  [123.47, 155.56, 185.00, 233.08], // Bmin-ish
];
const randItem = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

/**
 * Procedural ambient audio (Web Audio, fully local — no files). "Nature" = wind that swells with
 * the weather + random birdsong in fair weather. "Music" = a soft, randomized drifting chord.
 * An ominous low drone fades in whenever a predator is on the prowl, whatever mode you're in.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private mode: Mode = 'off';
  private windSrc: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private musicOsc: OscillatorNode[] = [];
  private musicGain: GainNode | null = null;
  private ominousGain: GainNode | null = null;
  private nextBird = 0;
  private nextChord = 0;

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
      this.buildOminous(this.ctx);
    }
    void this.ctx.resume();
    return this.ctx;
  }

  /** A quiet, always-running dissonant low drone whose gain we raise when a predator stalks. */
  private buildOminous(ctx: AudioContext): void {
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    lp.connect(g).connect(this.master!);
    for (const f of [55, 58.27]) { // a low, uneasy minor-second
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      o.connect(lp); o.start();
    }
    this.ominousGain = g;
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
    for (const o of this.musicOsc) { try { o.stop(); } catch { /* already stopped */ } o.disconnect(); }
    this.musicOsc = [];
    this.musicGain?.disconnect(); this.musicGain = null;
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
    const g = ctx.createGain(); g.gain.value = 0; g.connect(this.master!);
    for (const f of randItem(CHORDS)) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = 0.07;
      o.connect(og).connect(g); o.start();
      this.musicOsc.push(o);
    }
    g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3);
    this.musicGain = g;
    this.nextChord = ctx.currentTime + 12 + Math.random() * 8;
  }

  /** Per-frame: wind swells in storms, birds sing in fair weather, music drifts, ominous on prowl. */
  update(weather: number, prowling: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.ominousGain) {
      const target = prowling && this.mode !== 'off' ? 0.5 : 0;
      this.ominousGain.gain.value += (target - this.ominousGain.gain.value) * 0.04; // smooth fade
    }
    if (this.mode === 'nature') {
      if (this.windGain) this.windGain.gain.value = 0.1 + weather * 0.5;
      if (ctx.currentTime >= this.nextBird) {
        if (weather < 0.4 && Math.random() < 0.6) this.chirp(ctx);
        this.nextBird = ctx.currentTime + 2 + Math.random() * 5;
      }
    } else if (this.mode === 'music' && ctx.currentTime >= this.nextChord) {
      const chord = randItem(CHORDS);
      this.musicOsc.forEach((o, i) => o.frequency.linearRampToValueAtTime(chord[i] ?? o.frequency.value, ctx.currentTime + 2.5));
      this.nextChord = ctx.currentTime + 12 + Math.random() * 8;
    }
  }

  private chirp(ctx: AudioContext): void {
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const base = 2000 + Math.random() * 2200; // random "species"
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * (0.5 + Math.random() * 0.3), t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + 0.2);
  }
}
