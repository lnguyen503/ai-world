import { KokoroVoice } from './kokoro';

/**
 * Narrator voice. Three engines, chosen by the voice dropdown:
 *  - Neural (Kokoro, in-browser): high-quality local TTS, model downloads once. The default.
 *  - System: the browser's built-in Web Speech voices.
 *  - Remote: if a local neural-TTS server URL is filled in, POST {text} there and play the audio.
 * Lines never overlap: while one is speaking, only the newest follow-up is queued (so a burst of
 * narration finishes the current line then jumps to the latest), with a watchdog so it can't lock up.
 */

// A curated set of Kokoro voices (it has ~28; these are the clearest). British males first for the
// documentary feel. Values are the Kokoro voice ids.
const KOKORO_VOICES: [string, string][] = [
  ['bm_george', '🇬🇧 George — British male'],
  ['bm_lewis', '🇬🇧 Lewis — British male'],
  ['bm_daniel', '🇬🇧 Daniel — British male'],
  ['bf_emma', '🇬🇧 Emma — British female'],
  ['am_michael', '🇺🇸 Michael — American male'],
  ['am_onyx', '🇺🇸 Onyx — American male, deep'],
  ['af_heart', '🇺🇸 Heart — American female'],
  ['af_bella', '🇺🇸 Bella — American female'],
];
const DEFAULT_VOICE = 'kokoro:bm_george';

export class Speaker {
  private enabled = false;
  private supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private btn: HTMLButtonElement | null;
  private select: HTMLSelectElement | null;
  private urlInput: HTMLInputElement | null;
  private statusEl: HTMLElement | null;
  private systemVoices: SpeechSynthesisVoice[] = [];
  private kokoro = new KokoroVoice();
  private current: HTMLAudioElement | null = null; // the neural/remote clip currently playing
  private lastLine = '';
  private speaking = false;
  private pending: string | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private userPicked = false; // until the user chooses a voice, default to the instant browser voice

  constructor() {
    this.btn = document.getElementById('tts-btn') as HTMLButtonElement | null;
    this.select = document.getElementById('tts-voice') as HTMLSelectElement | null;
    this.urlInput = document.getElementById('tts-url') as HTMLInputElement | null;
    this.statusEl = document.getElementById('tts-status');
    if (!this.btn || !this.select) return;
    this.btn.addEventListener('click', () => this.toggle());
    this.kokoro.onStatus = (m) => { if (this.statusEl) this.statusEl.textContent = m; };
    this.buildVoiceList();
    if (this.supported) window.speechSynthesis.onvoiceschanged = () => this.buildVoiceList();
    // a real user pick sticks; pre-warm the neural model when they choose a neural voice
    this.select.addEventListener('change', () => { this.userPicked = true; if (this.usingKokoro()) void this.kokoro.load(); });
  }

  /** Build the dropdown: neural (Kokoro) voices first, then the system voices. */
  private buildVoiceList(): void {
    if (!this.select) return;
    const prev = this.select.value;
    this.select.innerHTML = '';
    const group = (label: string): HTMLOptGroupElement => {
      const og = document.createElement('optgroup'); og.label = label; this.select!.appendChild(og); return og;
    };
    const neural = group('Neural — in-browser, downloads once');
    for (const [id, label] of KOKORO_VOICES) {
      const o = document.createElement('option'); o.value = `kokoro:${id}`; o.textContent = label; neural.appendChild(o);
    }
    this.systemVoices = this.supported
      ? window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
      : [];
    if (this.systemVoices.length) {
      const sys = group('System voices');
      this.systemVoices.forEach((v, i) => {
        const o = document.createElement('option'); o.value = `sys:${i}`; o.textContent = `${v.name} (${v.lang})`; sys.appendChild(o);
      });
    }
    // default to the instant browser voice (no download); the neural voices stay one click away. Once the
    // user picks a voice themselves, keep their choice across rebuilds (system voices load asynchronously).
    const preferred = this.preferredSystemValue() ?? DEFAULT_VOICE;
    const want = this.userPicked && prev ? prev : preferred;
    this.select.value = [...this.select.options].some((o) => o.value === want) ? want : preferred;
  }

  /** The dropdown value of a pleasant English system voice (British male if there is one), or null. */
  private preferredSystemValue(): string | null {
    if (!this.systemVoices.length) return null;
    const i = this.systemVoices.findIndex((v) => /en-gb/i.test(v.lang) && /male|george|daniel|arthur|ryan/i.test(v.name));
    if (i >= 0) return `sys:${i}`;
    const gb = this.systemVoices.findIndex((v) => /en-gb/i.test(v.lang));
    return `sys:${gb >= 0 ? gb : 0}`;
  }

  private endpoint(): string { return this.urlInput?.value.trim() ?? ''; }
  private usingKokoro(): boolean { return !this.endpoint() && (this.select?.value ?? '').startsWith('kokoro:'); }

  private toggle(): void {
    if (!this.btn || !this.select) return;
    this.enabled = !this.enabled;
    this.btn.classList.toggle('on', this.enabled);
    this.btn.textContent = this.enabled ? '🔊 voice on' : '🔇 voice off';
    this.select.classList.toggle('show', this.enabled);
    this.urlInput?.classList.toggle('show', this.enabled);
    this.statusEl?.classList.toggle('show', this.enabled);
    if (this.enabled) {
      if (this.usingKokoro()) void this.kokoro.load();
      this.utter(this.lastLine || 'Here, life unfolds — one small moment at a time.');
    } else {
      this.stop();
    }
  }

  /** Called by the narrator on every new line. Speaks it if TTS is enabled. */
  speak(text: string): void {
    this.lastLine = text;
    if (this.enabled) this.utter(text);
  }

  /** Speak a line, or queue the newest one if we're mid-line (so bursts never cut themselves off). */
  private utter(text: string): void {
    if (!text) return;
    if (this.speaking) { this.pending = text; return; }
    this.speaking = true;
    let watchdogMs = Math.min(15000, 1500 + text.length * 70);
    if (this.endpoint()) {
      this.speakRemote(this.endpoint(), text);
    } else if (this.usingKokoro()) {
      watchdogMs = this.kokoro.ready ? 9000 : 45000; // allow for the one-time model download
      this.speakKokoro(text, (this.select!.value).slice('kokoro:'.length));
    } else {
      this.speakLocal(text);
    }
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.finished(), watchdogMs);
  }

  /** One line finished (or errored / timed out) — speak the latest queued line, if any. */
  private finished(): void {
    if (this.watchdog) { clearTimeout(this.watchdog); this.watchdog = null; }
    this.speaking = false;
    const next = this.pending;
    this.pending = null;
    if (next && this.enabled) this.utter(next);
  }

  /** Stop everything and reset (used when the voice is toggled off). */
  private stop(): void {
    this.pending = null;
    this.speaking = false;
    if (this.watchdog) { clearTimeout(this.watchdog); this.watchdog = null; }
    if (this.current) { try { this.current.pause(); } catch { /* ignore */ } this.current = null; }
    if (this.supported) window.speechSynthesis.cancel();
  }

  /** Neural (Kokoro) synthesis → play the WAV blob. Falls back to the system voice on any failure. */
  private speakKokoro(text: string, voice: string): void {
    this.kokoro.synthBlob(text, voice)
      .then((blob) => this.play(new Audio(URL.createObjectURL(blob))))
      .catch(() => this.speakLocal(text));
  }

  private speakLocal(text: string): void {
    if (!this.supported) { this.finished(); return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = this.selectedSystemVoice();
    if (v) u.voice = v;
    u.rate = 0.86; // slow, measured
    u.pitch = 0.92; // a touch lower
    u.onend = () => this.finished();
    u.onerror = () => this.finished();
    window.speechSynthesis.speak(u); // no cancel(): let the current line complete first
  }

  /** The selected system voice, or a sensible British-male fallback (e.g. when a neural voice failed). */
  private selectedSystemVoice(): SpeechSynthesisVoice | null {
    const val = this.select?.value ?? '';
    if (val.startsWith('sys:')) return this.systemVoices[Number(val.slice(4))] ?? null;
    return this.systemVoices.find((v) => /en-gb/i.test(v.lang) && /male|george|daniel|arthur|ryan/i.test(v.name))
      ?? this.systemVoices.find((v) => /en-gb/i.test(v.lang))
      ?? this.systemVoices[0] ?? null;
  }

  /** POST {text} to a local neural-TTS server (Piper/XTTS/etc.) and play the audio it returns. */
  private speakRemote(url: string, text: string): void {
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`tts ${r.status}`))))
      .then((blob) => this.play(new Audio(URL.createObjectURL(blob))))
      .catch(() => this.speakLocal(text));
  }

  /** Play a synthesized clip, wiring completion back into the queue. */
  private play(a: HTMLAudioElement): void {
    this.current = a;
    a.onended = () => this.finished();
    a.onerror = () => this.finished();
    void a.play().catch(() => this.finished());
  }
}
