type Mode = 'off' | 'nature' | 'music';

/**
 * Procedural ambient audio via the Web Audio API — entirely local, no sound files.
 * "Nature" = soft wind (filtered noise) that swells into a roar as the weather worsens, plus
 * occasional birdsong in fair weather. "Music" = a slow ambient drone. A dropdown switches modes
 * (the change is the user gesture browsers need to start audio).
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private mode: Mode = 'off';
  private windSrc: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private musicOsc: OscillatorNode[] = [];
  private musicGain: GainNode | null = null;
  private nextBird = 0;

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
    this.stopAll();
    this.mode = mode;
    if (mode === 'off') return;
    const ctx = this.ensureCtx();
    if (mode === 'nature') this.startNature(ctx);
    else this.startMusic(ctx);
  }

  private stopAll(): void {
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
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
    const g = ctx.createGain(); g.gain.value = 0.12;
    src.connect(lp).connect(g).connect(this.master!);
    src.start();
    this.windSrc = src; this.windGain = g;
    this.nextBird = ctx.currentTime + 1.5;
  }

  private startMusic(ctx: AudioContext): void {
    const g = ctx.createGain(); g.gain.value = 0; g.connect(this.master!);
    for (const f of [110, 164.81, 220, 277.18]) { // a soft A-minor drone
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = 0.07;
      o.connect(og).connect(g); o.start();
      this.musicOsc.push(o);
    }
    g.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 3);
    this.musicGain = g;
  }

  /** Per-frame: rain swells the wind during storms; birds sing only in fair weather. */
  update(weather: number): void {
    if (!this.ctx || this.mode !== 'nature') return;
    if (this.windGain) this.windGain.gain.value = 0.1 + weather * 0.5;
    if (this.ctx.currentTime >= this.nextBird) {
      if (weather < 0.4 && Math.random() < 0.6) this.chirp(this.ctx);
      this.nextBird = this.ctx.currentTime + 2 + Math.random() * 5;
    }
  }

  private chirp(ctx: AudioContext): void {
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const base = 2200 + Math.random() * 1800;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.6, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + 0.2);
  }
}
