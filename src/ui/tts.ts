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
  private voices: SpeechSynthesisVoice[] = [];
  private voice: SpeechSynthesisVoice | null = null;
  private lastLine = '';

  constructor() {
    this.btn = document.getElementById('tts-btn') as HTMLButtonElement | null;
    this.select = document.getElementById('tts-voice') as HTMLSelectElement | null;
    if (!this.btn || !this.select) return;
    if (!this.supported) {
      this.btn.textContent = '🔇 no voice';
      this.btn.disabled = true;
      return;
    }
    this.btn.addEventListener('click', () => this.toggle());
    this.select.addEventListener('change', () => { this.voice = this.voices[this.select!.selectedIndex] ?? null; });
    this.loadVoices();
    window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
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
    if (this.enabled) this.utter(this.lastLine || 'Here, life unfolds — one small moment at a time.');
    else window.speechSynthesis.cancel();
  }

  /** Called by the narrator on every new line. Speaks it if TTS is enabled. */
  speak(text: string): void {
    this.lastLine = text;
    if (this.enabled) this.utter(text);
  }

  private utter(text: string): void {
    if (!this.supported || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = 0.86; // slow, measured
    u.pitch = 0.92; // a touch lower
    window.speechSynthesis.cancel(); // never overlap lines
    window.speechSynthesis.speak(u);
  }
}
