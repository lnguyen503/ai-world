import type { World } from '../sim/world';

/**
 * A tiny "Hall of Fame" — the world's current standout individuals, so there are named characters to
 * root for: the eldest soul, the most prolific parent, and the biggest creature alive. Updated a
 * couple of times a second (cheap), it gives a long watch some living stories to follow.
 */
export class HallOfFame {
  private eldest = document.getElementById('hof-eldest');
  private kids = document.getElementById('hof-kids');
  private big = document.getElementById('hof-big');
  private frame = 0;

  update(world: World): void {
    if (this.frame++ % 30 !== 0) return; // ~twice a second is plenty
    let old = null, pro = null, bg = null;
    for (const c of world.creatures) {
      if (!old || c.age > old.age) old = c;
      if (!pro || c.offspring > pro.offspring) pro = c;
      if (!bg || c.genome.size > bg.genome.size) bg = c;
    }
    if (this.eldest) this.eldest.textContent = old ? `${old.name} · ${old.age.toFixed(0)}s` : '—';
    if (this.kids) this.kids.textContent = pro && pro.offspring > 0 ? `${pro.name} · ${pro.offspring}` : '—';
    if (this.big) this.big.textContent = bg ? `${bg.name} · ${bg.genome.size.toFixed(2)}×` : '—';
  }
}
