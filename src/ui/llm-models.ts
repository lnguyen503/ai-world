// A picker for the local narration model. Because this is open-source and everyone's Ollama has a
// different set of models pulled, it AUTO-DETECTS what's installed (Ollama's /api/tags) and lists
// it, alongside a few recommended tags (with rough VRAM hints) and a free-text "Custom…" entry. The
// chosen model name is written into the hidden #llm-model input that the narrator + chatter read, so
// their code is unchanged. If the server can't be reached (no Ollama / CORS), it just shows the
// recommended list.

interface Reco { tag: string; note: string; }

// Good local narration models, roughly best-quality first. A 24 GB+ GPU (e.g. an RTX 4090 / 5090)
// runs the 27–32B models fully on-GPU; the smaller ones are for more modest cards.
const RECOMMENDED: Reco[] = [
  { tag: 'qwen2.5:32b', note: 'best quality · ~20 GB VRAM' },
  { tag: 'gemma2:27b', note: 'high quality · ~16 GB' },
  { tag: 'mistral-small', note: 'high quality · ~14 GB' },
  { tag: 'qwen2.5:14b', note: 'great + lighter · ~9 GB' },
  { tag: 'llama3.1:8b', note: 'fast + solid · ~5 GB' },
  { tag: 'qwen2.5:7b', note: 'fast + witty · ~5 GB' },
  { tag: 'llama3.2:3b', note: 'very fast + light · ~2 GB' },
];
// if one of these is already installed, prefer it as the default (most capable first)
const PREFERRED = ['qwen2.5:32b', 'gemma2:27b', 'mistral-small:24b', 'mistral-small', 'qwen2.5:14b', 'llama3.1:8b', 'qwen2.5:7b', 'llama3.2:3b'];
const CUSTOM = '__custom__';

export class ModelPicker {
  private url = document.getElementById('llm-url') as HTMLInputElement | null;
  private pick = document.getElementById('llm-model-pick') as HTMLSelectElement | null;
  private custom = document.getElementById('llm-model-custom') as HTMLInputElement | null;
  private hidden = document.getElementById('llm-model') as HTMLInputElement | null; // what the narrator reads
  private on = document.getElementById('llm-on') as HTMLInputElement | null;
  private userPicked = false; // once the user chooses, stop auto-overriding their selection

  constructor() {
    if (!this.pick || !this.hidden) return;
    this.populate([]); // recommended set until/if we detect installed models
    this.pick.addEventListener('change', () => { this.userPicked = true; this.onSelect(); });
    this.custom?.addEventListener('input', () => { if (this.hidden) this.hidden.value = this.custom!.value.trim(); });
    this.on?.addEventListener('change', () => this.toggle());
    this.url?.addEventListener('change', () => this.detect());
    this.detect();
  }

  /** Show/hide the picker with the AI-narration toggle, and refresh the installed-model list. */
  private toggle(): void {
    const show = !!this.on?.checked;
    this.pick?.classList.toggle('show', show);
    this.custom?.classList.toggle('show', show && this.pick?.value === CUSTOM);
    if (show) this.detect();
  }

  private tagsUrl(): string {
    const u = (this.url?.value || 'http://localhost:11434/api/generate').trim();
    return u.replace(/\/api\/generate\/?$/, '/api/tags');
  }

  /** Ask the local server which models are installed and list them (Ollama /api/tags shape). */
  private detect(): void {
    fetch(this.tagsUrl())
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('tags'))))
      .then((d: unknown) => {
        const models = (d as { models?: { name?: string }[] })?.models ?? [];
        this.populate(models.map((m) => m.name ?? '').filter(Boolean));
      })
      .catch(() => undefined); // no server reachable — keep the recommended list
  }

  private populate(installed: string[]): void {
    if (!this.pick) return;
    const keep = this.hidden?.value || '';
    this.pick.innerHTML = '';
    const sep = (label: string): void => {
      const o = document.createElement('option'); o.textContent = label; o.disabled = true; this.pick!.appendChild(o);
    };
    const opt = (value: string, label: string): void => {
      const o = document.createElement('option'); o.value = value; o.textContent = label; this.pick!.appendChild(o);
    };
    const seen = new Set<string>();
    if (installed.length) {
      sep('— installed —');
      for (const m of installed) { opt(m, m); seen.add(m); }
    }
    sep('— recommended —');
    for (const r of RECOMMENDED) if (!seen.has(r.tag)) opt(r.tag, `${r.tag} · ${r.note}`);
    opt(CUSTOM, '✏️ Custom…');

    // default: keep the user's choice if they made one; otherwise pick the best INSTALLED model
    let want = this.userPicked && keep && keep !== CUSTOM ? keep : '';
    if (!want) want = PREFERRED.find((p) => installed.includes(p)) ?? this.bestInstalled(installed) ?? RECOMMENDED[4]!.tag;
    const listed = [...this.pick.options].some((o) => o.value === want && !o.disabled);
    this.pick.value = listed ? want : CUSTOM;
    this.onSelect();
  }

  /** Heuristic "best" installed model for narration: biggest non-embed/coder, local preferred over cloud. */
  private bestInstalled(installed: string[]): string | undefined {
    const usable = installed.filter((m) => !/embed|coder/i.test(m));
    if (!usable.length) return undefined;
    const score = (m: string): number => {
      let s = 0;
      if (/cloud/i.test(m)) s -= 100; // prefer a truly-local model as the default
      if (/r1|reason|think/i.test(m)) s -= 8; // reasoning models leak <think> noise into short lines
      const size = parseFloat((m.match(/(\d+(?:\.\d+)?)\s*b/i) ?? [])[1] ?? '0');
      s += Math.min(size, 70); // bigger = richer prose, up to a point
      return s;
    };
    return [...usable].sort((a, b) => score(b) - score(a))[0];
  }

  /** Mirror the selection into the hidden field the narrator reads; reveal the box for Custom. */
  private onSelect(): void {
    if (!this.pick || !this.hidden) return;
    const isCustom = this.pick.value === CUSTOM;
    this.custom?.classList.toggle('show', !!this.on?.checked && isCustom);
    this.hidden.value = isCustom ? (this.custom?.value.trim() || '') : this.pick.value;
  }
}
