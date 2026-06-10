import { params } from '../config';

const el = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
};

/** Wires the LEVERS panel to the live `params` object + biome/world callbacks. */
export class Controls {
  onNewBiome: () => void = () => {};
  onReset: () => void = () => {};
  onSave: () => void = () => {};
  onLoadFile: (text: string) => void = () => {};

  constructor() {
    this.slider('c-mrate', 'v-mrate', () => params.mutationRate, (v) => (params.mutationRate = v), (v) => v.toFixed(2));
    this.slider('c-mstep', 'v-mstep', () => params.mutationStep, (v) => (params.mutationStep = v), (v) => v.toFixed(2));
    this.slider('c-food', 'v-food', () => params.foodAbundance, (v) => (params.foodAbundance = v), (v) => `×${v.toFixed(2)}`);
    this.slider('c-metab', 'v-metab', () => params.metabolism, (v) => (params.metabolism = v), (v) => `×${v.toFixed(2)}`);
    this.slider('c-day', 'v-day', () => params.dayLengthSec, (v) => (params.dayLengthSec = v), (v) => `${v.toFixed(0)}s`);
    this.slider('c-season', 'v-season', () => params.seasonStrength, (v) => (params.seasonStrength = v), (v) => v.toFixed(2));
    this.slider('c-weather', 'v-weather', () => params.weather, (v) => (params.weather = v),
      (v) => (v < 0.18 ? 'calm' : v < 0.5 ? 'rain' : v < 0.8 ? 'storm' : 'severe'));

    this.toggle('c-daynight', () => params.dayNight, (v) => (params.dayNight = v));
    this.toggle('c-bloom', () => params.bloom, (v) => (params.bloom = v));
    this.toggle('c-lineage', () => params.colorByLineage, (v) => (params.colorByLineage = v));

    el<HTMLButtonElement>('c-newbiome').addEventListener('click', () => this.onNewBiome());
    el<HTMLButtonElement>('c-reset').addEventListener('click', () => this.onReset());
    el<HTMLButtonElement>('c-save').addEventListener('click', () => this.onSave());
    const file = el<HTMLInputElement>('c-load-file');
    el<HTMLButtonElement>('c-load').addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { if (typeof r.result === 'string') this.onLoadFile(r.result); file.value = ''; };
      r.readAsText(f);
    });
  }

  private slider(
    inputId: string, valId: string,
    get: () => number, set: (v: number) => void, fmt: (v: number) => string,
  ): void {
    const input = el<HTMLInputElement>(inputId);
    const label = el<HTMLSpanElement>(valId);
    input.value = String(get());
    label.textContent = fmt(get());
    input.addEventListener('input', () => {
      const v = Number(input.value);
      set(v);
      label.textContent = fmt(v);
    });
  }

  private toggle(inputId: string, get: () => boolean, set: (v: boolean) => void): void {
    const input = el<HTMLInputElement>(inputId);
    input.checked = get();
    input.addEventListener('change', () => set(input.checked));
  }
}
