import type { World } from '../sim/world';

/**
 * A running log of the world's notable moments this session — striking births (a giant, a new
 * predator, the gift of flight…) and milestone events — each stamped with the in-world time, newest
 * on top. A little history you can scroll back through on a long watch.
 */
const fmt = (age: number): string => `${Math.floor(age / 60)}:${String(Math.floor(age % 60)).padStart(2, '0')}`;

export class DiscoveryLog {
  private body = document.getElementById('discovery-body');
  private lastNoveltyMs = -9999;

  /** Add a line (newest first). Caller supplies the in-world age for the timestamp. */
  add(text: string, age: number): void {
    if (!this.body) return;
    const row = document.createElement('div');
    row.className = 'dlog-row';
    row.innerHTML = `<span style="color:#7f8c9b">${fmt(age)}</span> ${text}`;
    this.body.prepend(row);
    while (this.body.children.length > 40) this.body.lastChild?.remove();
  }

  /** Watch for striking births to log (milestones are pushed in via add() from the banner). */
  update(world: World): void {
    if (world.noveltyFlash > 1.2 && world.lastNovelty && performance.now() - this.lastNoveltyMs > 4000) {
      this.lastNoveltyMs = performance.now();
      this.add(world.lastNovelty, world.age);
    }
  }
}
