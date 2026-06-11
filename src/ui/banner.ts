import { SPECIES } from '../config';
import type { WorldStats } from '../sim/world';

/**
 * Big cinematic title cards for the world's milestone moments — the first flight, the first predator,
 * a generation milestone, one lineage coming to rule, a thriving population. Fades in centre-screen,
 * holds a few seconds, fades out. Distinct from the running narration: these are the chapter beats.
 * Gated so they stay rare and special, and reset when the world reseeds.
 */
export class EventBanner {
  onShow: (title: string) => void = () => {}; // fired when a banner appears (stinger + discovery log)
  private el = document.getElementById('event-banner');
  private titleEl = document.querySelector('#event-banner .eb-title') as HTMLElement | null;
  private subEl = document.querySelector('#event-banner .eb-sub') as HTMLElement | null;
  private shownAt = 0;
  private lastMs = -99999;
  private prevFlyers = 0;
  private prevPred = 0;
  private prevGen = 0;
  private firedGens = new Set<number>();
  private leader = -1; // species currently flagged as dominant (cleared when its share falls)
  private bestPop = 0;

  update(stats: WorldStats): void {
    if (!this.el) return;
    const now = performance.now();
    if (this.shownAt && now - this.shownAt > 4400) { this.el.classList.remove('show'); this.shownAt = 0; }
    const m = this.detect(stats);
    if (m && now - this.lastMs > 12000) { this.show(m.title, m.sub); this.lastMs = now; }
  }

  private detect(s: WorldStats): { title: string; sub: string } | null {
    if (s.generation < this.prevGen - 1) { this.firedGens.clear(); this.leader = -1; this.bestPop = 0; } // world reseeded
    let m: { title: string; sub: string } | null = null;

    if (s.flyers > 0 && this.prevFlyers === 0) {
      m = { title: '🕊 The Age of Flight', sub: 'a creature lifts into the air, beyond the reach of the jaws below' };
    } else if (s.predators > 0 && this.prevPred === 0) {
      m = { title: 'A Predator Emerges', sub: 'the food chain grows teeth' };
    } else {
      for (const g of [10, 25, 50, 100, 200]) {
        if (s.generation >= g && !this.firedGens.has(g)) {
          this.firedGens.add(g);
          m = { title: `Generation ${g}`, sub: 'no longer the creatures we first met' };
          break;
        }
      }
    }

    if (!m && s.population > 20) {
      let li = -1, lc = 0;
      s.speciesCounts.forEach((c, i) => { if (c > lc) { lc = c; li = i; } });
      const share = lc / s.population;
      if (share >= 0.6 && this.leader !== li && li >= 0) {
        this.leader = li;
        m = { title: `👑 The ${SPECIES[li]?.name ?? 'Unknown'} Reign`, sub: 'one lineage rises above all the rest' };
      } else if (share < 0.45) {
        this.leader = -1;
      }
    }

    if (!m && s.population > this.bestPop + 30 && s.population > 120) {
      this.bestPop = s.population;
      m = { title: 'A Thriving World', sub: `${s.population} small lives, and counting` };
    }

    this.prevFlyers = s.flyers;
    this.prevPred = s.predators;
    this.prevGen = s.generation;
    if (s.population > this.bestPop) this.bestPop = s.population;
    return m;
  }

  /** Show an arbitrary banner immediately (for one-off spectacles like a blood moon). */
  flash(title: string, sub: string): void { this.show(title, sub); }

  private show(title: string, sub: string): void {
    if (!this.el) return;
    if (this.titleEl) this.titleEl.textContent = title;
    if (this.subEl) this.subEl.textContent = sub;
    this.el.classList.add('show');
    this.shownAt = performance.now();
    this.onShow(title);
  }
}
