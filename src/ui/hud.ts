import { GENE_RANGES } from '../config';
import type { WorldStats } from '../sim/world';
import type { Creature } from '../sim/creature';

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const norm = (v: number, [lo, hi]: readonly [number, number]): number =>
  Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

export class Hud {
  onSpeedChange: (speed: number) => void = () => {};
  onDeselect: () => void = () => {};

  private pop = $('s-pop');
  private gen = $('s-gen');
  private bd = $('s-bd');
  private foodEl = $('s-food');
  private ageEl = $('s-age');
  private sizeEl = $('s-size');
  private speedEl = $('s-speed');
  private senseEl = $('s-sense');
  private avgAgeEl = $('s-avgage');

  private selPanel = $('hud-selected');
  private selTitle = $('sel-title');
  private selBody = $('sel-body');

  private graph = $('graph') as HTMLCanvasElement;
  private gctx = this.graph.getContext('2d')!;
  private history: number[] = [];
  private frame = 0;

  constructor() {
    for (const btn of document.querySelectorAll<HTMLButtonElement>('#hud-time button')) {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#hud-time button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.onSpeedChange(Number(btn.dataset.speed));
      });
    }
    $('sel-close').addEventListener('click', () => this.onDeselect());
    this.resizeGraph();
    window.addEventListener('resize', () => this.resizeGraph());
  }

  private resizeGraph(): void {
    const r = this.graph.getBoundingClientRect();
    this.graph.width = Math.max(120, r.width);
    this.graph.height = Math.max(60, r.height);
  }

  updateStats(s: WorldStats): void {
    this.pop.textContent = String(s.population);
    this.gen.textContent = String(s.generation);
    this.bd.textContent = `${s.births} / ${s.deaths}`;
    this.foodEl.textContent = String(s.food);
    this.ageEl.textContent = `${s.age.toFixed(0)}s`;
    this.sizeEl.textContent = s.avgSize.toFixed(2);
    this.speedEl.textContent = s.avgSpeed.toFixed(2);
    this.senseEl.textContent = s.avgSense.toFixed(1);
    this.avgAgeEl.textContent = `${s.avgAge.toFixed(0)}s`;

    if (this.frame++ % 12 === 0) {
      this.history.push(s.population);
      if (this.history.length > 240) this.history.shift();
      this.drawGraph();
    }
  }

  private drawGraph(): void {
    const { width: w, height: h } = this.graph;
    const ctx = this.gctx;
    ctx.clearRect(0, 0, w, h);
    if (this.history.length < 2) return;
    const max = Math.max(10, ...this.history);
    ctx.beginPath();
    this.history.forEach((v, i) => {
      const x = (i / (this.history.length - 1)) * w;
      const y = h - (v / max) * (h - 6) - 3;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#8b98a8';
    ctx.font = '10px ui-sans-serif, system-ui';
    ctx.fillText(`peak ${max}`, 4, 11);
  }

  showSelected(c: Creature | null): void {
    if (!c) { this.selPanel.classList.remove('show'); return; }
    this.selPanel.classList.add('show');
    const g = c.genome;
    const energyPct = Math.max(0, Math.min(1, c.energy / c.maxEnergy)) * 100;
    const agePct = Math.max(0, Math.min(1, c.age / c.maxAge)) * 100;
    const hueColor = `hsl(${(g.hue * 360).toFixed(0)}, 65%, 60%)`;
    this.selTitle.innerHTML =
      `Following <span style="color:${hueColor}">creature #${c.id}</span>`;
    const seesFood = c.senseIn[2]! > 0.01;
    const turnPct = ((c.act[0] + 1) / 2) * 100; // 50% = straight
    const throttlePct = ((c.act[1] + 1) / 2) * 100;
    this.selBody.innerHTML = `
      ${row('Generation', String(c.generation))}
      ${row('Diet', 'herbivore')}
      ${bar('Energy', energyPct, '#4ade80')}
      ${bar('Age', agePct, '#f59e0b')}
      ${bar('Size', norm(g.size, GENE_RANGES.size) * 100, hueColor)}
      ${bar('Speed', norm(g.speed, GENE_RANGES.speed) * 100, hueColor)}
      ${bar('Sense', norm(g.sense, GENE_RANGES.sense) * 100, hueColor)}
      <div class="stat" style="margin-top:8px"><span>🧠 Brain</span><span>${seesFood ? 'sees food' : 'searching'}</span></div>
      ${bar('↻ Turn', turnPct, '#60a5fa')}
      ${bar('» Throttle', throttlePct, '#a78bfa')}
    `;
  }
}

function row(label: string, value: string): string {
  return `<div class="stat"><span>${label}</span><span>${value}</span></div>`;
}

function bar(label: string, pct: number, color: string): string {
  return `<div class="stat"><span>${label}</span><span>${pct.toFixed(0)}%</span></div>
    <div class="bar"><i style="width:${pct.toFixed(0)}%;background:${color}"></i></div>`;
}
