// God Mode — a toolbar of tools you wield directly on the world. Selecting a tool puts the cursor in
// "apply" mode; clicking the ground applies it (the scene reports the world point). Click the active
// tool again to put it away. More tools and the cataclysm buttons are added in later iterations.

interface Tool { id: string; label: string }

const TOOLS: Tool[] = [
  { id: 'feed', label: '🌾 Feed' },
  { id: 'smite', label: '⚡ Smite' },
  { id: 'hatch', label: '🌿 Hatch' },
  { id: 'predator', label: '🐺 Predator' },
  { id: 'bloom', label: '🌸 Bloom' },
  { id: 'drought', label: '🌵 Drought' },
  { id: 'raise', label: '⛰ Raise' },
  { id: 'dig', label: '🕳 Dig' },
];

// Cataclysms fire immediately on click (world-scale disasters), unlike the brush tools above.
const ACTIONS: Tool[] = [
  { id: 'asteroid', label: '☄️ Asteroid' },
];

export class GodMode {
  onTool: (tool: string | null) => void = () => {};
  onAction: (id: string) => void = () => {};
  private active: string | null = null;
  private buttons = new Map<string, HTMLButtonElement>();

  constructor() {
    const cont = document.getElementById('godmode-tools');
    if (!cont) return;
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.textContent = t.label; b.className = 'god-btn';
      b.addEventListener('click', () => this.select(t.id));
      cont.appendChild(b);
      this.buttons.set(t.id, b);
    }
    for (const a of ACTIONS) {
      const b = document.createElement('button');
      b.textContent = a.label; b.className = 'god-btn cataclysm';
      b.addEventListener('click', () => this.onAction(a.id));
      cont.appendChild(b);
    }
  }

  private select(id: string): void {
    this.active = this.active === id ? null : id; // re-clicking the active tool puts it away
    for (const [tid, b] of this.buttons) b.classList.toggle('on', tid === this.active);
    this.onTool(this.active);
  }
}
