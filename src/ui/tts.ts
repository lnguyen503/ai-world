/**
 * Local text-to-speech for the narrator, using the browser's built-in Web Speech API.
 * This runs on-device through your OS/browser voices — no cloud, no API key. A toggle button
 * enables it (the click is the user gesture browsers require), and a dropdown picks the voice.
 * It prefers a British English male voice for the David Attenborough feel.
 */
export class Speaker {
  private enabled = false;
  private supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private btn: HTMLButtonElement | null;
  private select: HTMLSelectElement | null;
  private urlInput: HTMLInputElement | null;
  private voices: SpeechSynthesisVoice[] = [];
  private voice: SpeechSynthesisVoice | null = null;
  private lastLine = '';
  private speaking = false;
  private pending: string | null = null; // the newest line to say once the current one finishes
  private watchdog: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.btn = document.getElementById('tts-btn') as HTMLButtonElement | null;
    this.select = document.getElementById('tts-voice') as HTMLSelectElement | null;
    this.urlInput = document.getElementById('tts-url') as HTMLInputElement | null;
    if (!this.btn || !this.select) return;
    this.btn.addEventListener('click', () => this.toggle());
    if (this.supported) {
      this.select.addEventListener('change', () => { this.voice = this.voices[this.select!.selectedIndex] ?? null; });
      this.loadVoices();
      window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
    } else {
      this.select.innerHTML = '<option>system voice unavailable</option>';
    }
  }

  /** Optional local neural-TTS server URL (e.g. a Piper/XTTS server). Empty = use the system voice. */
  private endpoint(): string {
    return this.urlInput?.value.trim() ?? '';
  }

  private loadVoices(): void {
    if (!this.select) return;
    const all = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
    if (!all.length) return;
    this.voices = all;
    this.select.innerHTML = '';
    all.forEach((v, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `${v.name} (${v.lang})`;
      this.select!.appendChild(o);
    });
    // score voices: prefer en-GB, then male-sounding / Attenborough-ish names
    const score = (v: SpeechSynthesisVoice): number =>
      (/en-gb/i.test(v.lang) ? 3 : 0)
      + (/(male|george|ryan|daniel|arthur|uk english male|brian|guy)/i.test(v.name) ? 2 : 0)
      + (/google uk english male/i.test(v.name) ? 4 : 0);
    let best = 0;
    let bestScore = -1;
    all.forEach((v, i) => { const sc = score(v); if (sc > bestScore) { bestScore = sc; best = i; } });
    this.voice = all[best] ?? null;
    this.select.selectedIndex = best;
  }

  private toggle(): void {
    if (!this.btn || !this.select) return;
    this.enabled = !this.enabled;
    this.btn.classList.toggle('on', this.enabled);
    this.btn.textContent = this.enabled ? '🔊 voice on' : '🔇 voice off';
    this.select.classList.toggle('show', this.enabled);
    this.urlInput?.classList.toggle('show', this.enabled);
    if (this.enabled) this.utter(this.lastLine || 'Here, life unfolds — one small moment at a time.');
    else this.stop();
  }

  /** Called by the narrator on every new line. Speaks it if TTS is enabled. */
  speak(text: string): void {
    this.lastLine = text;
    if (this.enabled) this.utter(text);
  }

  /**
   * Speak a line. If one is already in progress, remember only the most recent follow-up: a fast
   * burst of narration (a hunt, a flurry of events) then finishes the current sentence and jumps to
   * the latest line, instead of cancelling itself mid-word every time a new line arrives.
   */
  private utter(text: string): void {
    if (!text) return;
    if (this.speaking) { this.pending = text; return; }
    this.speaking = true;
    const url = this.endpoint();
    if (url) this.speakRemote(url, text);
    else this.speakLocal(text);
    // safety net: if the engine never reports completion, recover so narration can't lock up silent
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.finished(), Math.min(15000, 1500 + text.length * 70));
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
    if (this.supported) window.speechSynthesis.cancel();
  }

  private speakLocal(text: string): void {
    if (!this.supported) { this.finished(); return; }
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = 0.86; // slow, measured
    u.pitch = 0.92; // a touch lower
    u.onend = () => this.finished();
    u.onerror = () => this.finished();
    window.speechSynthesis.speak(u); // no cancel(): let the current line complete first
  }

  /** POST {text} to a local neural-TTS server (Piper/XTTS/etc.) and play the audio it returns;
   *  if anything fails, fall back to the system voice so the narration is never silent. */
  private speakRemote(url: string, text: string): void {
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`tts ${r.status}`))))
      .then((blob) => {
        const a = new Audio(URL.createObjectURL(blob));
        a.onended = () => this.finished();
        a.onerror = () => this.finished();
        void a.play().catch(() => this.speakLocal(text)); // playback blocked → fall back to system voice
      })
      .catch(() => this.speakLocal(text));
  }
}
