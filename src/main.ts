import { SIM, WORLD, params } from './config';
import { Biome } from './biome';
import { World, type WorldSnapshot } from './sim/world';
import { Scene3D } from './render/scene';
import { Hud } from './ui/hud';
import { Controls } from './ui/controls';
import { Narrator } from './ui/narrator';
import { Speaker } from './ui/tts';
import { SoundManager } from './ui/sound';
import { Tips } from './ui/tips';
import { Chatter } from './ui/chatter';
import { ModelPicker } from './ui/llm-models';
import { EventBanner } from './ui/banner';
import { HallOfFame } from './ui/hof';
import { MiniMap } from './ui/minimap';
import { TimeLapse } from './ui/timelapse';
import { applyPermalink, setupShare } from './ui/permalink';
import { DiscoveryLog } from './ui/discovery';
import { GodMode } from './ui/godmode';

const container = document.getElementById('app');
if (!container) throw new Error('missing #app');

const biome = new Biome();
applyPermalink(biome); // restore a shared world (seed + levers) from the URL hash, if any
let world = new World(biome);
const scene = new Scene3D(container, biome);
const hud = new Hud();
const controls = new Controls();
const narrator = new Narrator();
const speaker = new Speaker();
const sound = new SoundManager();
new Tips(); // gentle "did you know" nudges
new ModelPicker(); // narration model dropdown (auto-detects installed Ollama models)
const banner = new EventBanner(); // cinematic title cards for milestone moments
const discovery = new DiscoveryLog(); // running log of the world's notable moments
banner.onShow = (title) => { sound.stinger('milestone'); discovery.add(title, world.age); };
scene.onBloodMoon = () => banner.flash('🌑 Blood Moon', 'the moon runs red over the world tonight');
const hof = new HallOfFame(); // the world's standout individuals
const minimap = new MiniMap(); // corner overview map
new TimeLapse(); // ⏩ fast-forward montage with chapter cards
setupShare(biome); // 🔗 copy a link that recreates this exact world

// god mode — wield tools directly on the world
const godmode = new GodMode();
godmode.onTool = (tool) => scene.setGodTool(tool);
scene.onGround = (x, z, tool) => applyGodTool(x, z, tool);
function applyGodTool(x: number, z: number, tool: string): void {
  if (tool === 'feed') world.addFoodAt(x, z, 14);
  else if (tool === 'smite') { world.smite(x, z); sound.stinger('kill'); }
  else if (tool === 'hatch') world.spawnAt(x, z, false);
  else if (tool === 'predator') world.spawnAt(x, z, true);
  else if (tool === 'bloom') world.addZone(x, z, false);
  else if (tool === 'drought') world.addZone(x, z, true);
}
const chatter = new Chatter(); // critters start talking once evolved enough
narrator.onLine = (text) => speaker.speak(text);

const biomeEl = document.getElementById('s-biome');
const showBiome = (): void => { if (biomeEl) biomeEl.textContent = biome.name; };
showBiome();
scene.setTrees(world.trees);
scene.setPonds(world.ponds);

hud.onSpeedChange = (s) => { params.timeSpeed = s; };
hud.onDeselect = () => scene.setSelected(null);
hud.onRelative = (clan, excludeId) => {
  const kin = world.creatures.find((c) => c.genome.clan === clan && c.id !== excludeId)
    ?? world.creatures.find((c) => c.id !== excludeId);
  if (kin) scene.setSelected(kin.id);
};

// photo mode — hide all UI for a clean cinematic frame (button or the H key)
const photoBtn = document.getElementById('photo-btn');
const togglePhoto = (): void => {
  const on = document.body.classList.toggle('photo');
  if (photoBtn) photoBtn.textContent = on ? '📷 Show UI' : '📷 Photo';
};
photoBtn?.addEventListener('click', togglePhoto);

// stargaze mode — free the camera to look up and pan across the night sky (button or the G key)
const gazeBtn = document.getElementById('gaze-btn');
const toggleGaze = (): void => {
  const on = !scene.isStargazing();
  scene.setStargaze(on);
  gazeBtn?.classList.toggle('on', on);
  if (gazeBtn) gazeBtn.textContent = on ? '🔭 Exit sky' : '🔭 Stargaze';
};
gazeBtn?.addEventListener('click', toggleGaze);

// auto-camera — let the view gently glide between critters (button or the C key); off = slow orbit
const autoCamBtn = document.getElementById('autocam-btn');
const toggleAutoCam = (): void => {
  const on = !scene.isAutoCam();
  scene.setAutoCam(on);
  autoCamBtn?.classList.toggle('on', on);
  if (autoCamBtn) autoCamBtn.textContent = on ? '🎥 Auto-cam' : '🎥 Auto-cam off';
};
autoCamBtn?.addEventListener('click', toggleAutoCam);

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'h' || e.key === 'H') togglePhoto();
  if (e.key === 'g' || e.key === 'G') toggleGaze();
  if (e.key === 'c' || e.key === 'C') toggleAutoCam();
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
let voiceCd = 0; // throttle between creature vocalizations
let killStingerMs = -9999; // real-time gates on the event stingers
let birthStingerMs = -9999;

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
  chatter.update(world, simDt);
  scene.syncBubbles(world, chatter.dialogs());

  const stats = world.stats();
  hud.updateStats(stats);
  banner.update(stats); // milestone title cards
  hof.update(world); // current standout individuals
  discovery.update(world); // log striking births
  minimap.update(world, scene.cameraInfo()); // corner overview
  const sel = scene.getSelected();
  hud.showSelected(sel != null ? (world.creatures.find((c) => c.id === sel) ?? null) : null);
  const hunt = world.killFlash > 0 ? 'kill' : world.prowling > 0 ? 'chase' : 'none';
  const novelty = world.noveltyFlash > 0 ? world.lastNovelty : null;
  narrator.update(stats, biome.name, params.weather, world.lightningFlash > 0, world.dayFactor, world.prowling > 0, hunt, novelty);
  sound.update(params.weather, world.dayFactor);

  // give the critters a voice: sample one each tick and chirp/alarm/hum by what it's doing
  voiceCd -= realDt;
  if (simDt > 0 && voiceCd <= 0 && world.creatures.length > 0) {
    const c = world.creatures[Math.floor(Math.random() * world.creatures.length)]!;
    const kind = c.startleTimer > 0 ? 'alarm'
      : c.signalTimer > 0 ? 'chirp'
      : !c.asleep && c.energy > 0.5 * c.maxEnergy && Math.random() < 0.25 ? 'hum'
      : null;
    if (kind) { sound.voice(kind, Math.max(-1, Math.min(1, c.x / WORLD.half))); voiceCd = 0.25 + Math.random() * 0.55; }
    else voiceCd = 0.12;
  }

  // event stingers — a low thud on a kill, a bright chime on a striking birth (real-time gated)
  if (world.killFlash > 0.9 && now - killStingerMs > 4000) { sound.stinger('kill'); killStingerMs = now; }
  if (world.noveltyFlash > 1.2 && now - birthStingerMs > 6000) { sound.stinger('birth'); birthStingerMs = now; }

  scene.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
