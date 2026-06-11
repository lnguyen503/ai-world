import * as THREE from 'three';

/**
 * Transient 3D set-pieces for the god-mode cataclysms: a fireball that streaks from the sky and bursts
 * on impact (asteroid), and a roaring lava fountain at the vent (volcano). Each effect is a small closure
 * that animates its own meshes/particles and reports when it's finished, so the manager can dispose it.
 * Kept separate from Scene3D so the render hub stays manageable.
 */
interface Effect { update: (dt: number) => boolean } // returns false when finished

function softSprite(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

export class CataclysmFx {
  readonly group = new THREE.Group();
  private fx: Effect[] = [];
  private dot = softSprite();

  constructor() { this.group.renderOrder = 2; }

  /** A fireball screams in at an angle and slams into (x, groundY, z), then bursts. */
  asteroid(x: number, groundY: number, z: number): void {
    const dur = 0.6;
    const start = new THREE.Vector3(x - 42, groundY + 96, z - 26); // streak in from high up, off to one side
    const end = new THREE.Vector3(x, groundY + 0.6, z);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(2.3, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
    );
    ball.position.copy(start);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color: 0xff8a3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.setScalar(13); ball.add(glow);
    const light = new THREE.PointLight(0xff7a30, 8, 90, 2); light.position.copy(start);
    this.group.add(ball, light);
    // a short streak-trail of fading embers behind the head
    const T = 14;
    const trailPos = new Float32Array(T * 3);
    for (let i = 0; i < T; i++) { trailPos[i * 3] = start.x; trailPos[i * 3 + 1] = start.y; trailPos[i * 3 + 2] = start.z; }
    const tgeo = new THREE.BufferGeometry(); tgeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Points(tgeo, new THREE.PointsMaterial({ color: 0xffb060, size: 3.4, map: this.dot, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    trail.frustumCulled = false; this.group.add(trail);

    let t = 0;
    this.fx.push({ update: (dt) => {
      t += dt;
      const k = Math.min(1, t / dur);
      ball.position.lerpVectors(start, end, k * k); // accelerate in
      light.position.copy(ball.position);
      light.intensity = 8 + 10 * k;
      // shuffle the trail down toward the head
      for (let i = T - 1; i > 0; i--) { trailPos[i * 3] = trailPos[(i - 1) * 3]; trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1]; trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2]; }
      trailPos[0] = ball.position.x; trailPos[1] = ball.position.y; trailPos[2] = ball.position.z;
      tgeo.attributes.position!.needsUpdate = true;
      if (k >= 1) {
        this.impact(end.x, end.y, end.z);
        this.group.remove(ball, light, trail);
        ball.geometry.dispose(); (ball.material as THREE.Material).dispose();
        (glow.material as THREE.Material).dispose();
        tgeo.dispose(); (trail.material as THREE.Material).dispose();
        return false;
      }
      return true;
    } });
  }

  /** The impact moment: a flash, an expanding ground shockwave, a debris burst, and a light pop. */
  private impact(x: number, y: number, z: number): void {
    // flash sphere
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flash.position.set(x, y + 1.2, z); this.group.add(flash);
    let ft = 0; const fdur = 0.4;
    this.fx.push({ update: (dt) => {
      ft += dt; const k = ft / fdur;
      if (k >= 1) { this.group.remove(flash); flash.geometry.dispose(); (flash.material as THREE.Material).dispose(); return false; }
      flash.scale.setScalar(2 + k * 18); (flash.material as THREE.MeshBasicMaterial).opacity = 1 - k; return true;
    } });
    // ground shockwave ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0xffcaa0, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, y + 0.2, z); this.group.add(ring);
    let rt = 0; const rdur = 0.85;
    this.fx.push({ update: (dt) => {
      rt += dt; const k = rt / rdur;
      if (k >= 1) { this.group.remove(ring); ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); return false; }
      const s = 2 + k * 36; ring.scale.set(s, s, s); (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k); return true;
    } });
    this.debris(x, y, z, 0xffae6a, 48, 20);
    // a bright light pop
    const L = new THREE.PointLight(0xfff0d0, 34, 150, 2); L.position.set(x, y + 7, z); this.group.add(L);
    let lt = 0;
    this.fx.push({ update: (dt) => { lt += dt; const k = lt / 0.5; if (k >= 1) { this.group.remove(L); return false; } L.intensity = 34 * (1 - k); return true; } });
  }

  private debris(x: number, y: number, z: number, color: number, n: number, speed: number): void {
    const pos = new Float32Array(n * 3); const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y + 0.5; pos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2; const sp = speed * (0.4 + Math.random() * 0.7);
      vel[i * 3] = Math.cos(a) * sp; vel[i * 3 + 1] = speed * (0.6 + Math.random() * 0.9); vel[i * 3 + 2] = Math.sin(a) * sp;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 1.7, map: this.dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pts.frustumCulled = false; this.group.add(pts);
    let t = 0; const dur = 0.95;
    this.fx.push({ update: (dt) => {
      t += dt; const k = t / dur;
      if (k >= 1) { this.group.remove(pts); geo.dispose(); (pts.material as THREE.Material).dispose(); return false; }
      for (let i = 0; i < n; i++) { vel[i * 3 + 1] -= 42 * dt; pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt; }
      geo.attributes.position!.needsUpdate = true; (pts.material as THREE.PointsMaterial).opacity = 1 - k; return true;
    } });
  }

  /** A sustained lava fountain at the vent for `dur` seconds, with a flickering red glow. */
  volcano(x: number, groundY: number, z: number, dur: number): void {
    const N = 150;
    const pos = new Float32Array(N * 3); const vel = new Float32Array(N * 3); const life = new Float32Array(N);
    const launch = (i: number): void => {
      pos[i * 3] = x + (Math.random() - 0.5) * 2.4; pos[i * 3 + 1] = groundY + 0.5; pos[i * 3 + 2] = z + (Math.random() - 0.5) * 2.4;
      const a = Math.random() * Math.PI * 2; const out = Math.random() * 7; const up = 15 + Math.random() * 17;
      vel[i * 3] = Math.cos(a) * out; vel[i * 3 + 1] = up; vel[i * 3 + 2] = Math.sin(a) * out;
      life[i] = 0.7 + Math.random() * 1.2;
    };
    for (let i = 0; i < N; i++) { launch(i); life[i] *= Math.random(); } // stagger the first launches
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const col = new Float32Array(N * 3); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, map: this.dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pts.frustumCulled = false; this.group.add(pts);
    const light = new THREE.PointLight(0xff5520, 14, 95, 2); light.position.set(x, groundY + 3, z); this.group.add(light);
    const hot = new THREE.Color(1.0, 0.85, 0.4), cool = new THREE.Color(0.7, 0.12, 0.03);
    let t = 0; const total = dur + 1.6;
    this.fx.push({ update: (dt) => {
      t += dt;
      const emitting = t < dur;
      for (let i = 0; i < N; i++) {
        life[i] -= dt;
        if (life[i] <= 0) { if (emitting) launch(i); else { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; } }
        vel[i * 3 + 1] -= 34 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < groundY) { if (emitting) launch(i); else { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; } }
        const f = Math.max(0, Math.min(1, vel[i * 3 + 1] * 0.03 + 0.4)); // hotter on the way up
        col[i * 3] = cool.r + (hot.r - cool.r) * f; col[i * 3 + 1] = cool.g + (hot.g - cool.g) * f; col[i * 3 + 2] = cool.b + (hot.b - cool.b) * f;
      }
      geo.attributes.position!.needsUpdate = true; geo.attributes.color!.needsUpdate = true;
      light.intensity = emitting ? 12 + Math.sin(t * 28) * 3 : Math.max(0, 12 * (1 - (t - dur) / 1.6));
      if (t >= total) { this.group.remove(pts, light); geo.dispose(); (pts.material as THREE.Material).dispose(); return false; }
      return true;
    } });
  }

  update(dt: number): void {
    if (!this.fx.length) return;
    const d = Math.min(0.05, dt); // physics-friendly step even if a frame hitched
    this.fx = this.fx.filter((e) => e.update(d));
  }
}
