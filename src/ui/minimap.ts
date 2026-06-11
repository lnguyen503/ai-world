import { WORLD } from '../config';
import type { World } from '../sim/world';

/**
 * A small top-down mini-map in the corner: ponds, trees, the herd (pale dots) and predators (red),
 * plus a wedge showing where the camera is and which way it looks. Helps you keep your bearings on a
 * big world and spot where the action is. Drawn every other frame (cheap).
 */
export class MiniMap {
  private canvas = document.getElementById('minimap') as HTMLCanvasElement | null;
  private ctx = this.canvas?.getContext('2d') ?? null;
  private size = 132;
  private frame = 0;

  constructor() {
    if (this.canvas) { this.canvas.width = this.size; this.canvas.height = this.size; }
  }

  update(world: World, cam: { x: number; z: number; yaw: number }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.frame++ % 2 !== 0) return;
    const s = this.size, H = WORLD.half;
    const map = (x: number, z: number): [number, number] => [(x / H * 0.5 + 0.5) * s, (z / H * 0.5 + 0.5) * s];

    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(18,26,22,0.55)';
    ctx.fillRect(0, 0, s, s);

    ctx.fillStyle = 'rgba(90,150,200,0.5)'; // ponds
    for (const p of world.ponds) {
      const [px, pz] = map(p.x, p.z);
      ctx.beginPath(); ctx.arc(px, pz, (p.r / H) * 0.5 * s, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = 'rgba(96,140,84,0.75)'; // trees
    for (const t of world.trees) { const [tx, tz] = map(t.x, t.z); ctx.fillRect(tx - 1, tz - 1, 2, 2); }

    for (const c of world.creatures) { // herd + predators
      const [cx, cz] = map(c.x, c.z);
      if (c.isPredator) { ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(cx, cz, 2.1, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(222,232,212,0.85)'; ctx.fillRect(cx - 0.8, cz - 0.8, 1.6, 1.6); }
    }

    // camera marker + a soft view wedge
    const [mx, mz] = map(cam.x, cam.z);
    ctx.save();
    ctx.translate(mx, mz); ctx.rotate(cam.yaw);
    ctx.fillStyle = 'rgba(120,180,255,0.22)';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s * 0.55, -0.4, 0.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7db8ff';
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
  }
}
