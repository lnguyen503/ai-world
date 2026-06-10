import { SIM, params } from './config';
import { Biome } from './biome';
import { World } from './sim/world';
import { Scene3D } from './render/scene';
import { Hud } from './ui/hud';
import { Controls } from './ui/controls';
import { Narrator } from './ui/narrator';
import { Speaker } from './ui/tts';

const container = document.getElementById('app');
if (!container) throw new Error('missing #app');

const biome = new Biome();
let world = new World(biome);
const scene = new Scene3D(container, biome);
const hud = new Hud();
const controls = new Controls();
const narrator = new Narrator();
const speaker = new Speaker();
narrator.onLine = (text) => speaker.speak(text);

const biomeEl = document.getElementById('s-biome');
const showBiome = (): void => { if (biomeEl) biomeEl.textContent = biome.name; };
showBiome();
scene.setTrees(world.trees);

hud.onSpeedChange = (s) => { params.timeSpeed = s; };
hud.onDeselect = () => scene.setSelected(null);

controls.onNewBiome = () => {
  biome.reseed();
  scene.buildTerrain();
  scene.buildTrees();
  showBiome();
};
controls.onReset = () => {
  world = new World(biome);
  scene.setSelected(null);
  scene.setTrees(world.trees);
};

let last = performance.now();

function frame(now: number): void {
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const simDt = realDt * params.timeSpeed;
  if (simDt > 0) {
    const steps = Math.min(SIM.maxSubStepsPerFrame, Math.max(1, Math.ceil(simDt / SIM.maxStep)));
    const stepDt = simDt / steps;
    for (let i = 0; i < steps; i++) world.step(stepDt);
    if (world.creatures.length === 0) { world = new World(biome); scene.setSelected(null); scene.setTrees(world.trees); }
  }

  world.computeLinks();
  scene.sync(world);
  scene.follow(world);

  const stats = world.stats();
  hud.updateStats(stats);
  const sel = scene.getSelected();
  hud.showSelected(sel != null ? (world.creatures.find((c) => c.id === sel) ?? null) : null);
  narrator.update(stats, biome.name, params.weather, world.lightningFlash > 0);

  scene.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
