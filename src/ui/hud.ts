import { GENE_RANGES, SPECIES } from '../config';
import type { WorldStats } from '../sim/world';
import type { Creature } from '../sim/creature';

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const norm = (v: number, [lo, hi]: readonly [number, number]): number =>
  Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

// distinct legend colours for the five species (Pebble, Foxling, Hopkin, Slink, Beetlebug) —
// used for both the species-panel labels and their lines on the population-over-time graph
const SPECIES_COLORS = ['#6ec6ff', '#ff9e54', '#6ee7a8', '#b794f6', '#ff7eb6'];

// average heritable traits tracked over time (normalised to their gene range, so they share one axis)
const TRAITS = [
  { key: 'size' as const, label: 'size', color: '#fbbf24', range: GENE_RANGES.size },
  { key: 'speed' as const, label: 'speed', color: '#60a5fa', range: GENE_RANGES.speed },
  { key: 'sense' as const, label: 'sense', color: '#4ade80', range: GENE_RANGES.sense },
];

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
  private socialEl = $('s-social');
  private predEl = $('s-pred');
  private flyEl = $('s-fly');
  private speciesEls: HTMLElement[] = [];

  private selPanel = $('hud-selected');
  private selTitle = $('sel-title');
  private selBody = $('sel-body');
  private selId = -1;
  private dyn: SelRefs | null = null;

  private graph = $('graph') as HTMLCanvasElement;
  private gctx = this.graph.getContext('2d')!;
  private history: number[] = [];
  private speciesHistory: number[][] = SPECIES.map(() => []); // per-species count over time
  private tgraph = $('tgraph') as HTMLCanvasElement;
  private tgctx = this.tgraph.getContext('2d')!;
  private traitHistory: Record<'size' | 'speed' | 'sense', number[]> = { size: [], speed: [], sense: [] };
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

    // build the per-species count rows once
    const cont = document.getElementById('s-species');
    if (cont) {
      SPECIES.forEach((sp, i) => {
        const row = document.createElement('div'); row.className = 'stat';
        const label = document.createElement('span'); label.textContent = sp.name;
        label.style.color = SPECIES_COLORS[i] ?? '#cbd5e1'; // legend colour matching its graph line
        const val = document.createElement('span'); val.textContent = '0';
        row.append(label, val); cont.appendChild(row);
        this.speciesEls.push(val);
      });
    }

    // trait-graph legend (colours match the lines drawn in drawTraitGraph)
    const legend = document.getElementById('tgraph-legend');
    if (legend) legend.innerHTML = TRAITS.map((t) => `<span style="color:${t.color}">■ ${t.label}</span>`).join('');

    this.resizeGraph();
    window.addEventListener('resize', () => this.resizeGraph());
  }

  private resizeGraph(): void {
    const r = this.graph.getBoundingClientRect();
    this.graph.width = Math.max(120, r.width);
    this.graph.height = Math.max(60, r.height);
    const tr = this.tgraph.getBoundingClientRect();
    this.tgraph.width = Math.max(120, tr.width);
    this.tgraph.height = Math.max(40, tr.height);
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
    this.socialEl.textContent = `${(s.avgSocial * 100).toFixed(0)}%`;
    this.predEl.textContent = `${s.predators} / ${s.population}`;
    this.flyEl.textContent = `${s.flyers} / ${s.population}`;
    for (let i = 0; i < this.speciesEls.length; i++) {
      this.speciesEls[i]!.textContent = String(s.speciesCounts[i] ?? 0);
    }

    if (this.frame++ % 12 === 0) {
      this.history.push(s.population);
      if (this.history.length > 240) this.history.shift();
      for (let i = 0; i < this.speciesHistory.length; i++) {
        const hist = this.speciesHistory[i]!;
        hist.push(s.speciesCounts[i] ?? 0);
        if (hist.length > 240) hist.shift();
      }
      this.traitHistory.size.push(norm(s.avgSize, GENE_RANGES.size));
      this.traitHistory.speed.push(norm(s.avgSpeed, GENE_RANGES.speed));
      this.traitHistory.sense.push(norm(s.avgSense, GENE_RANGES.sense));
      for (const k of ['size', 'speed', 'sense'] as const) {
        if (this.traitHistory[k].length > 240) this.traitHistory[k].shift();
      }
      this.drawGraph();
      this.drawTraitGraph();
    }
  }

  private drawTraitGraph(): void {
    const { width: w, height: h } = this.tgraph;
    const ctx = this.tgctx;
    ctx.clearRect(0, 0, w, h);
    for (const t of TRAITS) {
      const series = this.traitHistory[t.key];
      if (series.length < 2) continue;
      ctx.beginPath();
      series.forEach((v, i) => {
        const x = (i / (series.length - 1)) * w;
        const y = h - v * (h - 6) - 3; // values are already 0..1 (normalised to the gene range)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = t.color; ctx.lineWidth = 1.6; ctx.stroke();
    }
  }

  private drawGraph(): void {
    const { width: w, height: h } = this.graph;
    const ctx = this.gctx;
    ctx.clearRect(0, 0, w, h);
    if (this.history.length < 2) return;
    const max = Math.max(10, ...this.history); // scale to total population, so species read as shares of it
    const plot = (series: number[], color: string, width: number): void => {
      if (series.length < 2) return;
      ctx.beginPath();
      series.forEach((v, i) => {
        const x = (i / (series.length - 1)) * w;
        const y = h - (v / max) * (h - 6) - 3;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    };
    plot(this.history, 'rgba(255,255,255,0.28)', 1); // faint total
    for (let i = 0; i < this.speciesHistory.length; i++) {
      plot(this.speciesHistory[i]!, SPECIES_COLORS[i] ?? '#fff', 1.6); // the species race
    }
    ctx.fillStyle = '#8b98a8';
    ctx.font = '10px ui-sans-serif, system-ui';
    ctx.fillText(`peak ${max}`, 4, 11);
  }

  /**
   * Build the panel ONCE per selected creature, then update only the live values each frame.
   * (Rebuilding innerHTML every frame forced a full DOM re-parse + layout 60×/sec — the cause of
   * the jank while following.)
   */
  showSelected(c: Creature | null): void {
    if (!c) { this.selPanel.classList.remove('show'); this.selId = -1; this.dyn = null; return; }
    this.selPanel.classList.add('show');
    if (c.id !== this.selId) { this.buildSelected(c); this.selId = c.id; }
    this.updateSelected(c);
  }

  private buildSelected(c: Creature): void {
    const g = c.genome;
    const hueColor = `hsl(${(g.hue * 360).toFixed(0)}, 65%, 60%)`;
    this.selTitle.innerHTML = `Following <span style="color:${hueColor}">${c.name}</span>`;
    this.selBody.innerHTML = `
      ${row('Generation', String(c.generation))}
      ${row('Species', SPECIES[g.species]?.name ?? '—')}
      ${row('Lineage', `clan #${g.clan}`)}
      ${row('Type', c.isPredator ? '🥩 predator' : '🌿 prey')}
      ${barId('Energy', 'sb-energy', '#4ade80')}
      ${barId('Stamina', 'sb-stam', '#f87171')}
      ${barId('Age', 'sb-age', '#f59e0b')}
      ${bar('Size', norm(g.size, GENE_RANGES.size) * 100, hueColor)}
      ${bar('Speed', norm(g.speed, GENE_RANGES.speed) * 100, hueColor)}
      ${bar('Sense', norm(g.sense, GENE_RANGES.sense) * 100, hueColor)}
      ${bar('Sociability', g.social * 100, '#34d399')}
      ${bar('Wings', g.wings * 100, '#7dd3fc')}
      <div class="stat" style="margin-top:8px"><span>🕊 Flight</span><span id="sv-flight"></span></div>
      <div class="stat"><span>📣 Social</span><span id="sv-signal"></span></div>
      <div class="stat"><span>🧠 Brain</span><span id="sv-brain"></span></div>
      ${barId('↻ Turn', 'sb-turn', '#60a5fa')}
      ${barId('» Throttle', 'sb-throttle', '#a78bfa')}
    `;
    const q = (sel: string): HTMLElement => this.selBody.querySelector(sel) as HTMLElement;
    const pair = (id: string): [HTMLElement, HTMLElement] => [q(`#${id} .pct`), q(`#${id} i`)];
    const [eV, eB] = pair('sb-energy'), [sV, sB] = pair('sb-stam'), [aV, aB] = pair('sb-age');
    const [tV, tB] = pair('sb-turn'), [thV, thB] = pair('sb-throttle');
    this.dyn = {
      energyV: eV, energyB: eB, stamV: sV, stamB: sB, ageV: aV, ageB: aB,
      flight: q('#sv-flight'), signal: q('#sv-signal'), brain: q('#sv-brain'),
      turnV: tV, turnB: tB, throttleV: thV, throttleB: thB,
    };
  }

  private updateSelected(c: Creature): void {
    const d = this.dyn;
    if (!d) return;
    setBar(d.energyV, d.energyB, Math.max(0, Math.min(1, c.energy / c.maxEnergy)) * 100);
    setBar(d.stamV, d.stamB, Math.max(0, Math.min(1, c.stamina)) * 100);
    setBar(d.ageV, d.ageB, Math.max(0, Math.min(1, c.age / c.maxAge)) * 100);
    setBar(d.turnV, d.turnB, ((c.act[0] + 1) / 2) * 100); // 50% = straight
    setBar(d.throttleV, d.throttleB, ((c.act[1] + 1) / 2) * 100);
    setText(d.flight, c.canFly ? 'can fly' : 'grounded');
    setText(d.signal, c.signalTimer > 0 ? 'calling: found food!' : 'quiet');
    setText(d.brain, c.senseIn[2]! > 0.01 ? 'sees food' : 'searching');
  }
}

/** Cached references to the live (per-frame) elements in the follow panel. */
interface SelRefs {
  energyV: HTMLElement; energyB: HTMLElement;
  stamV: HTMLElement; stamB: HTMLElement;
  ageV: HTMLElement; ageB: HTMLElement;
  flight: HTMLElement; signal: HTMLElement; brain: HTMLElement;
  turnV: HTMLElement; turnB: HTMLElement;
  throttleV: HTMLElement; throttleB: HTMLElement;
}

/** A bar row with a stable id so its value span + fill can be updated in place. */
function barId(label: string, id: string, color: string): string {
  return `<div id="${id}">
    <div class="stat"><span>${label}</span><span class="pct">0%</span></div>
    <div class="bar"><i style="width:0%;background:${color}"></i></div>
  </div>`;
}

function setBar(v: HTMLElement, fill: HTMLElement, pct: number): void {
  const p = `${pct.toFixed(0)}%`;
  if (v.textContent !== p) { v.textContent = p; fill.style.width = p; }
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function row(label: string, value: string): string {
  return `<div class="stat"><span>${label}</span><span>${value}</span></div>`;
}

function bar(label: string, pct: number, color: string): string {
  return `<div class="stat"><span>${label}</span><span>${pct.toFixed(0)}%</span></div>
    <div class="bar"><i style="width:${pct.toFixed(0)}%;background:${color}"></i></div>`;
}
