// A gentle, non-invasive "assistant": every so often a small pill fades in at the top with one fun
// thing the visitor can try, then fades away. It never blocks clicks and hides itself in photo mode.

const TIPS = [
  'Press G to lie back and stargaze at the night sky 🔭',
  'Press H for photo mode — hide all the UI for a clean view 📷',
  'Click any critter to follow it and see its species, genes and brain',
  'Speed up time (5× or 20×) to watch generations evolve in seconds',
  'Drag the ⛈ Weather lever up for storms — or tap 🎲 auto for rolling fronts',
  'Watch the Species panel: smarter, faster critters out-compete the rest over time',
  'Toggle Lineage to colour critters by family instead of their own hue',
  'Turn on Ambience for soft music or nature sounds 🎵',
  'Hit 🎲 New Biome for a fresh world — or Save and Load to keep one',
  'Calm, well-fed critters wander to the ponds for a drink 💧',
  'Crank the weather: storms bring lightning, and the critters shelter under the trees',
  'Enable 🤖 AI narration to let a local LLM describe your world',
  'Predators hunt in packs — they fan out, circle, then dart at their prey',
  'A storm clearing by day can leave a rainbow 🌈',
  'Some nights bring an aurora, shooting stars, and a moon that waxes and wanes',
  'Wings can evolve — watch flyers escape the predators below',
  'Once a clever lineage evolves far enough, the critters start talking 💬',
];

export class Tips {
  private el: HTMLElement;
  private last = -1;

  constructor() {
    const e = document.getElementById('tips');
    if (!e) throw new Error('missing #tips');
    this.el = e;
    window.setTimeout(() => this.cycle(), 9000); // first nudge a few seconds in
  }

  private cycle(): void {
    let i = Math.floor(Math.random() * TIPS.length);
    while (TIPS.length > 1 && i === this.last) i = Math.floor(Math.random() * TIPS.length);
    this.last = i;
    this.el.textContent = `💡 ${TIPS[i]}`;
    this.el.classList.add('show');
    window.setTimeout(() => {
      this.el.classList.remove('show');
      window.setTimeout(() => this.cycle(), 32000 + Math.random() * 16000); // breathe between tips
    }, 9000); // each tip lingers ~9s
  }
}
