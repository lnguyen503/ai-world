import { SIM } from './config';
import { World } from './sim/world';
import { Scene3D } from './render/scene';
import { Hud } from './ui/hud';

const container = document.getElementById('app');
if (!container) throw new Error('missing #app');

let world = new World();
const scene = new Scene3D(container);
const hud = new Hud();

let simSpeed = 1;
hud.onSpeedChange = (s) => { simSpeed = s; };
hud.onDeselect = () => scene.setSelected(null);

let last = performance.now();

function frame(now: number): void {
  // real seconds since last frame, clamped so a backgrounded tab doesn't jump
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const simDt = realDt * simSpeed;
  if (simDt > 0) {
    const steps = Math.min(SIM.maxSubStepsPerFrame, Math.max(1, Math.ceil(simDt / SIM.maxStep)));
    const stepDt = simDt / steps;
    for (let i = 0; i < steps; i++) world.step(stepDt);

    // repopulate if the lineage goes fully extinct, so the zoo stays alive
    if (world.creatures.length === 0) {
      world = new World();
      scene.setSelected(null);
    }
  }

  scene.sync(world);
  scene.follow(world);

  hud.updateStats(world.stats());
  const sel = scene.getSelected();
  hud.showSelected(sel != null ? (world.creatures.find((c) => c.id === sel) ?? null) : null);

  scene.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
