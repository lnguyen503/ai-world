import { SIM, params } from './config';
import { Biome } from './biome';
import { World, type WorldSnapshot } from './sim/world';
import { Scene3D } from './render/scene';
import { Hud } from './ui/hud';
import { Controls } from './ui/controls';
import { Narrator } from './ui/narrator';
import { Speaker } from './ui/tts';
import { SoundManager } from './ui/sound';

const container = document.getElementById('app');
if (!container) throw new Error('missing #app');

const biome = new Biome();
let world = new World(biome);
const scene = new Scene3D(container, biome);
const hud = new Hud();
const controls = new Controls();
const narrator = new Narrator();
const speaker = new Speaker();
const sound = new SoundManager();
narrator.onLine = (text) => speaker.speak(text);

const biomeEl = document.getElementById('s-biome');
const showBiome = (): void => { if (biomeEl) biomeEl.textContent = biome.name; };
showBiome();
scene.setTrees(world.trees);
scene.setPonds(world.ponds);

hud.onSpeedChange = (s) => { params.timeSpeed = s; };
hud.onDeselect = () => scene.setSelected(null);

// photo mode — hide all UI for a clean cinematic frame (button or the H key)
const photoBtn = document.getElementById('photo-btn');
const togglePhoto = (): void => {
  const on = document.body.classList.toggle('photo');
  if (photoBtn) photoBtn.textContent = on ? '📷 Show UI' : '📷 Photo';
};
photoBtn?.addEventListener('click', togglePhoto);
window.addEventListener('keydown', (e) => {
  if ((e.key === 'h' || e.key === 'H') && !(e.target instanceof HTMLInputElement)) togglePhoto();
});

controls.onNewBiome = () => {
  biome.reseed();
  scene.buildTerrain();
  scene.buildTrees();
  world.placePonds(); // re-settle ponds into the new terrain's basins
  scene.setPonds(world.ponds);
  showBiome();
};
controls.onReset = () => {
  world = new World(biome);
  scene.setSelected(null);
  scene.setTrees(world.trees);
  scene.setPonds(world.ponds);
};
controls.onSave = () => {
  const text = world.serialize();
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ai-world-gen${world.stats().generation}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
controls.onLoadFile = (text) => {
  try {
    const data = JSON.parse(text) as WorldSnapshot;
    biome.reseed(data.biomeSeed);
    world.loadSnapshot(data);
    world.placePonds(); // ponds aren't saved — re-settle them into the loaded biome
    scene.buildTerrain();
    scene.setTrees(world.trees);
    scene.setPonds(world.ponds);
    scene.setSelected(null);
    showBiome();
  } catch {
    // ignore an invalid or corrupt save file
  }
};

let last = performance.now();
let weatherTarget = 0;
let weatherRetarget = 0; // sim-seconds until the next weather front rolls in

function frame(now: number): void {
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const simDt = realDt * params.timeSpeed;
  if (simDt > 0) {
    // 🎲 auto-weather: slow random fronts ease through (weighted toward calm spells)
    if (params.autoWeather) {
      weatherRetarget -= simDt;
      if (weatherRetarget <= 0) {
        weatherTarget = Math.random() < 0.55 ? Math.random() * 0.2 : Math.random();
        weatherRetarget = 12 + Math.random() * 30;
      }
      const ease = 1 - Math.pow(0.5, simDt / 6); // ~6 sim-second half-life toward the target
      params.weather += (weatherTarget - params.weather) * ease;
      controls.setWeather(params.weather);
    }
    const steps = Math.min(SIM.maxSubStepsPerFrame, Math.max(1, Math.ceil(simDt / SIM.maxStep)));
    const stepDt = simDt / steps;
    for (let i = 0; i < steps; i++) world.step(stepDt);
    if (world.creatures.length === 0) { world = new World(biome); scene.setSelected(null); scene.setTrees(world.trees); scene.setPonds(world.ponds); }
  }

  world.computeLinks();
  scene.sync(world);
  scene.follow(world);

  const stats = world.stats();
  hud.updateStats(stats);
  const sel = scene.getSelected();
  hud.showSelected(sel != null ? (world.creatures.find((c) => c.id === sel) ?? null) : null);
  const hunt = world.killFlash > 0 ? 'kill' : world.prowling > 0 ? 'chase' : 'none';
  narrator.update(stats, biome.name, params.weather, world.lightningFlash > 0, world.dayFactor, world.prowling > 0, hunt);
  sound.update(params.weather);

  scene.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
