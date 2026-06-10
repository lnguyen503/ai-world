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
  private galaxies: THREE.Group[] = [];
  private meteors!: THREE.Points;
  private meteorPos!: Float32Array;
  private meteorCol!: Float32Array;
  private meteorState: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number }[] = [];
  private meteorTimer = 4;
  private lastT = 0;
  private aurora!: THREE.Mesh;
  private auroraMat!: THREE.ShaderMaterial;

  private static readonly METEORS = 4;
  private static readonly TRAIL = 10;

  constructor() {
    this.stars = this.makeStars();
    this.starMat = this.stars.material as THREE.ShaderMaterial;
    this.group.add(this.stars);
    this.makeNebulae();
    this.makeGalaxy(DOME * 0.95, 0.9, 1.0, 0xfff0d8);   // a big golden spiral overhead
    this.makeGalaxy(DOME * 0.9, 2.7, 0.42, 0xcfe0ff);   // a small bluish companion, off to the side
    this.makeMeteors();
    this.makeAurora();
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

  private softDot(): THREE.CanvasTexture {
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

  /** A log-spiral galaxy of points with a glowing core, tilted and parked far up in the dome. */
  private makeGalaxy(dist: number, around: number, scaleMul: number, coreHex: number): void {
    const arms = 3, n = 5200;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    const radius = DOME * 0.42 * scaleMul;
    let s = (around * 1000 + dist) % 233280;
    const rnd = (): number => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < n; i++) {
      const r = Math.pow(rnd(), 0.6);                 // denser toward the core
      const arm = Math.floor(rnd() * arms);
      const spin = r * 5.5 + (arm / arms) * Math.PI * 2;
      const spread = (1 - r) * 0.55 + 0.04;
      const ang = spin + (rnd() - 0.5) * spread;
      const rr = r * radius;
      pos[i * 3] = Math.cos(ang) * rr + (rnd() - 0.5) * spread * radius * 0.3;
      pos[i * 3 + 1] = (rnd() - 0.5) * radius * 0.05 * (1 - r); // thin disk, bulging core
      pos[i * 3 + 2] = Math.sin(ang) * rr + (rnd() - 0.5) * spread * radius * 0.3;
      // colour: warm core → blue arms, with occasional pink HII knots
      if (rnd() < 0.06 && r > 0.3) c.setHSL(0.95, 0.7, 0.7);
      else c.setHSL(0.58 + (1 - r) * 0.05, 0.55, 0.5 + (1 - r) * 0.4);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.1, vertexColors: true, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    const disk = new THREE.Points(geo, mat);
    disk.frustumCulled = false;

    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.softDot(), color: coreHex, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    core.scale.setScalar(radius * 0.5);

    const g = new THREE.Group();
    g.add(disk, core);
    // place on the dome and tilt the disk so we see the spiral at an angle
    const el = 0.55 + (scaleMul < 0.6 ? 0.18 : 0);
    const ring = Math.sqrt(Math.max(0, 1 - el * el));
    g.position.set(Math.cos(around) * ring * dist, el * dist, Math.sin(around) * ring * dist);
    g.rotation.set(Math.PI * 0.32, around, Math.PI * 0.1);
    g.userData = { disk: mat, core: core.material as THREE.SpriteMaterial, baseOpacity: scaleMul < 0.6 ? 0.7 : 0.9, spin: scaleMul < 0.6 ? 0.012 : 0.006 };
    this.galaxies.push(g);
    this.group.add(g);
  }

  /** A pool of meteors, each a short fading point-trail that streaks across the sky in 3D. */
  private makeMeteors(): void {
    const total = Cosmos.METEORS * Cosmos.TRAIL;
    this.meteorPos = new Float32Array(total * 3);
    this.meteorCol = new Float32Array(total * 3);
    for (let m = 0; m < Cosmos.METEORS; m++) {
      this.meteorState.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.meteorPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.meteorCol, 3));
    this.meteors = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 2.2, vertexColors: true, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.meteors.frustumCulled = false;
    this.group.add(this.meteors);
  }

  private launchMeteor(m: number): void {
    const st = this.meteorState[m]!;
    const a = Math.random() * Math.PI * 2;
    const el = 0.45 + Math.random() * 0.4;
    const ring = Math.sqrt(Math.max(0, 1 - el * el));
    st.x = Math.cos(a) * ring * DOME; st.y = el * DOME; st.z = Math.sin(a) * ring * DOME;
    // a mostly-horizontal sweep with a downward bias
    const dir = a + Math.PI / 2 + (Math.random() - 0.5);
    const sp = DOME * (0.9 + Math.random() * 0.7);
    st.vx = Math.cos(dir) * sp; st.vz = Math.sin(dir) * sp; st.vy = -DOME * (0.2 + Math.random() * 0.3);
    st.max = 0.7 + Math.random() * 0.6; st.life = st.max;
  }

  private updateMeteors(dt: number, night: number): void {
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0 && night > 0.5) {
      const free = this.meteorState.findIndex((s) => s.life <= 0);
      if (free >= 0) this.launchMeteor(free);
      this.meteorTimer = 2.5 + Math.random() * 7;
    }
    const T = Cosmos.TRAIL;
    for (let m = 0; m < Cosmos.METEORS; m++) {
      const st = this.meteorState[m]!;
      const base = m * T;
      if (st.life > 0) {
        st.life -= dt;
        st.x += st.vx * dt; st.y += st.vy * dt; st.z += st.vz * dt;
        const fade = Math.max(0, st.life / st.max) * night;
        for (let i = 0; i < T; i++) {
          const back = (i / T) * 0.05; // trail stretches behind the head
          const o = (base + i) * 3;
          this.meteorPos[o] = st.x - st.vx * back;
          this.meteorPos[o + 1] = st.y - st.vy * back;
          this.meteorPos[o + 2] = st.z - st.vz * back;
          const tail = (1 - i / T) * fade; // bright head → dim tail
          this.meteorCol[o] = tail; this.meteorCol[o + 1] = tail * 0.95; this.meteorCol[o + 2] = tail * 0.8;
        }
      } else {
        for (let i = 0; i < T; i++) {
          const o = (base + i) * 3;
          this.meteorCol[o] = this.meteorCol[o + 1] = this.meteorCol[o + 2] = 0;
        }
      }
    }
    (this.meteors.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.meteors.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** A waving aurora curtain near the horizon — shows on clear, calm nights. */
  private makeAurora(): void {
    const h = DOME * 0.5;
    const geo = new THREE.CylinderGeometry(DOME * 0.72, DOME * 0.72, h, 80, 1, true);
    this.auroraMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uCalm: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform float uNight; uniform float uCalm; varying vec2 vUv;
        float h1(float x){ return fract(sin(x * 12.9898) * 43758.5453); }
        float nz(float x){ float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), smoothstep(0.0, 1.0, f)); }
        void main(){
          // stacked, slowly drifting vertical curtains
          float drift = uTime * 0.06;
          float band = 0.5 + 0.5 * sin(vUv.x * 38.0 + drift * 6.0 + nz(vUv.x * 7.0 + drift) * 7.0);
          band = pow(band, 3.0);
          // brightest near the horizon, fading up into space; soft wavy lower edge
          float lo = 0.05 + 0.06 * sin(vUv.x * 14.0 + uTime * 0.4);
          float vfade = smoothstep(0.95, 0.1, vUv.y) * smoothstep(lo, lo + 0.12, vUv.y);
          float a = band * vfade * uNight * uCalm * 0.55;
          vec3 col = mix(vec3(0.18, 1.0, 0.55), vec3(0.65, 0.3, 1.0), 0.5 + 0.5 * sin(vUv.x * 5.0 + uTime * 0.25));
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.aurora = new THREE.Mesh(geo, this.auroraMat);
    this.aurora.position.y = DOME * 0.05 + h * 0.5; // sit the curtain on the horizon
    this.aurora.frustumCulled = false;
    this.group.add(this.aurora);
  }

  /** Calm weather (0 stormy .. 1 clear) gates the aurora — storms wash it out. */
  setCalm(calm: number): void {
    if (this.auroraMat) this.auroraMat.uniforms.uCalm!.value = calm;
  }

  /** 0 = full daylight (sky hidden) .. 1 = deep night (sky at full brightness). */
  setNight(night: number): void {
    this.starMat.uniforms.uNight!.value = night;
    if (this.auroraMat) this.auroraMat.uniforms.uNight!.value = night;
    this.group.visible = night > 0.02;
    for (const n of this.nebulae) {
      (n.material as THREE.SpriteMaterial).opacity = (n.userData.baseOpacity as number) * night;
    }
    for (const g of this.galaxies) {
      const base = g.userData.baseOpacity as number;
      (g.userData.disk as THREE.PointsMaterial).opacity = base * night;
      (g.userData.core as THREE.SpriteMaterial).opacity = base * 0.6 * night;
    }
  }

  update(t: number): void {
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const night = this.starMat.uniforms.uNight!.value as number;
    this.updateMeteors(dt, night);
    if (!this.group.visible) return;
    this.starMat.uniforms.uTime!.value = t;
    this.auroraMat.uniforms.uTime!.value = t;
    for (const g of this.galaxies) g.rotateY((g.userData.spin as number) * 0.016);
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
