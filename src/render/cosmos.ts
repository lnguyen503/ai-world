import * as THREE from 'three';
import { WORLD } from '../config';

const DOME = WORLD.half * 2.9; // radius of the celestial dome

/**
 * The night sky: a deep twinkling starfield (and, in later iterations, nebulae, galaxies and
 * meteors). Everything lives on a big dome and fades in as night falls (`setNight`). Kept separate
 * from Scene3D so the render hub stays manageable.
 */
export class Cosmos {
  readonly group = new THREE.Group();
  private stars: THREE.Points;
  private starMat: THREE.ShaderMaterial;
  private nebulae: THREE.Sprite[] = [];

  constructor() {
    this.stars = this.makeStars();
    this.starMat = this.stars.material as THREE.ShaderMaterial;
    this.group.add(this.stars);
    this.makeNebulae();
    this.group.renderOrder = -1; // behind everything
  }

  /** A dense field of stars with varied size, colour temperature and a slow individual twinkle. */
  private makeStars(): THREE.Points {
    const n = 3600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      // upper-hemisphere dome
      const u = Math.random();              // 0..1 → elevation
      const a = Math.random() * Math.PI * 2;
      const el = u * u;                     // bias toward the horizon for a fuller sky
      const y = 0.04 + el * 0.96;
      const ring = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * ring * DOME;
      pos[i * 3 + 1] = y * DOME;
      pos[i * 3 + 2] = Math.sin(a) * ring * DOME;

      // colour: mostly white, some blue giants, some warm golds
      const r = Math.random();
      const hue = r < 0.62 ? 0.58 : r < 0.82 ? 0.6 : 0.1;
      const sat = r < 0.62 ? 0.05 : r < 0.82 ? 0.45 : 0.5;
      const lum = 0.7 + Math.random() * 0.3;
      c.setHSL(hue, sat, lum);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;

      size[i] = 0.8 + Math.random() * Math.random() * 3.2; // a few bright ones, many faint
      phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aPhase;
        uniform float uTime; varying vec3 vColor; varying float vTw;
        void main() {
          vColor = aColor;
          float tw = 0.65 + 0.35 * sin(uTime * 1.6 + aPhase);
          vTw = tw;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * tw * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uNight; varying vec3 vColor; varying float vTw;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float core = smoothstep(0.5, 0.0, r);
          float glow = core * core;
          gl_FragColor = vec4(vColor, glow * vTw * uNight);
        }`,
    });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    return p;
  }

  /** A wispy cloud texture (overlapping soft radial blobs) for nebula billboards. */
  private nebulaTexture(seed: number): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d')!;
    // pseudo-random from seed (no Math.random dependence on call order)
    let s = seed * 9301 + 49297;
    const rnd = (): number => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 22; i++) {
      const cx = 128 + (rnd() - 0.5) * 150;
      const cy = 128 + (rnd() - 0.5) * 150;
      const rad = 30 + rnd() * 80;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const a = 0.05 + rnd() * 0.12;
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  /** A few large, faint, slowly-drifting colour clouds parked high in the night sky. */
  private makeNebulae(): void {
    const hues = [0.62, 0.78, 0.52, 0.92, 0.05]; // blue, violet, teal, magenta, rose
    const col = new THREE.Color();
    for (let i = 0; i < 5; i++) {
      const tex = this.nebulaTexture(i * 137 + 3);
      col.setHSL(hues[i]!, 0.6, 0.55);
      const mat = new THREE.SpriteMaterial({
        map: tex, color: col.clone(), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0,
      });
      const sp = new THREE.Sprite(mat);
      // scatter around the upper dome
      const a = (i / 5) * Math.PI * 2 + 0.6;
      const el = 0.3 + (i % 3) * 0.2;
      const ring = Math.sqrt(1 - el * el);
      sp.position.set(Math.cos(a) * ring * DOME * 0.92, el * DOME * 0.92, Math.sin(a) * ring * DOME * 0.92);
      const sc = DOME * (0.5 + (i % 3) * 0.18);
      sp.scale.set(sc, sc, 1);
      sp.userData.baseOpacity = 0.16 + (i % 2) * 0.08;
      sp.userData.phase = i * 1.3;
      this.nebulae.push(sp);
      this.group.add(sp);
    }
  }

  /** 0 = full daylight (sky hidden) .. 1 = deep night (sky at full brightness). */
  setNight(night: number): void {
    this.starMat.uniforms.uNight!.value = night;
    this.group.visible = night > 0.02;
    for (const n of this.nebulae) {
      (n.material as THREE.SpriteMaterial).opacity = (n.userData.baseOpacity as number) * night;
    }
  }

  update(t: number): void {
    if (!this.group.visible) return;
    this.starMat.uniforms.uTime!.value = t;
    for (const n of this.nebulae) {
      const ph = n.userData.phase as number;
      const base = n.userData.baseOpacity as number;
      // gentle breathing so the clouds feel alive
      const mat = n.material as THREE.SpriteMaterial;
      const breathe = 0.8 + 0.2 * Math.sin(t * 0.07 + ph);
      mat.opacity = base * breathe * this.starMat.uniforms.uNight!.value;
    }
  }
}
