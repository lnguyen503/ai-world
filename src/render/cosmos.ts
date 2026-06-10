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

  constructor() {
    this.stars = this.makeStars();
    this.starMat = this.stars.material as THREE.ShaderMaterial;
    this.group.add(this.stars);
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

  /** 0 = full daylight (sky hidden) .. 1 = deep night (sky at full brightness). */
  setNight(night: number): void {
    this.starMat.uniforms.uNight!.value = night;
    this.group.visible = night > 0.02;
  }

  update(t: number): void {
    if (!this.group.visible) return;
    this.starMat.uniforms.uTime!.value = t;
  }
}
