import { params } from '../config';

/**
 * "Skip ahead" time-lapse: one button cranks the clock right up and plays a few cinematic chapter
 * title cards while generations fly by, then eases back to normal speed — a quick montage of the
 * world's deep time. Click again to stop early.
 */
const CHAPTERS: [string, string][] = [
  ['Chapter I', 'the first fragile generations'],
  ['Chapter II', 'life finds its footing'],
  ['Chapter III', 'the swift inherit the meadow'],
  ['Chapter IV', 'an age of plenty — and of teeth'],
  ['Chapter V', 'they are no longer who they were'],
];
const LAPSE_SPEED = 40;

export class TimeLapse {
  private btn = document.getElementById('timelapse-btn');
  private card = document.getElementById('chapter-card');
  private titleEl = document.querySelector('#chapter-card .cc-title') as HTMLElement | null;
  private subEl = document.querySelector('#chapter-card .cc-sub') as HTMLElement | null;
  private active = false;
  private prevSpeed = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.btn?.addEventListener('click', () => (this.active ? this.finish() : this.start()));
  }

  private start(): void {
    this.active = true;
    this.prevSpeed = params.timeSpeed || 1;
    params.timeSpeed = LAPSE_SPEED;
    this.btn?.classList.add('on');
    this.play(0);
  }

  private play(i: number): void {
    if (!this.active) return;
    if (i >= CHAPTERS.length) { this.finish(); return; }
    this.showCard(CHAPTERS[i]![0], CHAPTERS[i]![1]);
    this.timer = setTimeout(() => this.play(i + 1), 3800);
  }

  private finish(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.showCard('— and the world goes on —', '');
    this.timer = setTimeout(() => this.card?.classList.remove('show'), 2600);
    params.timeSpeed = this.prevSpeed;
    this.active = false;
    this.btn?.classList.remove('on');
  }

  private showCard(title: string, sub: string): void {
    if (this.titleEl) this.titleEl.textContent = title;
    if (this.subEl) this.subEl.textContent = sub;
    this.card?.classList.add('show');
  }
}
