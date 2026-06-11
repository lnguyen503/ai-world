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
  // meteor-shower bursts (radiating from a common point) + a rare slow comet
  private showerTimer = 50;
  private shower = 0;
  private radiantA = 0;
  private radiantEl = 0.6;
  private comet!: THREE.Points;
  private cometPos!: Float32Array;
  private cometCol!: Float32Array;
  private cometState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 };
  private cometTimer = 25;
  private lastT = 0;
  private constellations: THREE.Group[] = [];

  private static readonly METEORS = 14;
  private static readonly TRAIL = 10;
  private static readonly COMET_TRAIL = 30;

  constructor() {
    this.stars = this.makeStars();
    this.starMat = this.stars.material as THREE.ShaderMaterial;
    this.group.add(this.stars);
    this.makeNebulae();
    this.makeGalaxy(DOME * 0.95, 1.0, 0xfff0d8, true);   // a big spiral, always present
    this.makeGalaxy(DOME * 0.9, 0.42, 0xcfe0ff, false);  // a smaller companion (some nights it's gone)
    this.makeConstellations();
    this.makeMeteors();
    this.makeComet();
    this.group.renderOrder = -1; // behind everything
    this.newNight(); // roll the first night's sky (positions, tints, which patterns are out)
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
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uClear: { value: 1 } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aPhase;
        uniform float uTime; varying vec3 vColor; varying float vTw; varying float vB;
        void main() {
          vColor = aColor;
          float tw = 0.65 + 0.35 * sin(uTime * 1.6 + aPhase);
          vTw = tw;
          vB = clamp((aSize - 0.8) / 3.2, 0.0, 1.0); // 0 = faint star … 1 = bright giant
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * tw * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uNight; uniform float uClear; varying vec3 vColor; varying float vTw; varying float vB;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float core = smoothstep(0.5, 0.0, r);
          float glow = core * core;
          // a clear sky shows the whole field; under cloud the faint stars fade out first, leaving the giants
          float vis = clamp(uClear + vB * 0.7, 0.0, 1.0);
          gl_FragColor = vec4(vColor, glow * vTw * uNight * vis);
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
        blending: THREE.AdditiveBlending, opacity: 0, fog: false,
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
      sp.userData.nightVis = 1; // newNight() decides which clouds are out + repositions/recolours them
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

  /** A log-spiral galaxy of soft points with a glowing core + halo, tilted and parked far up in the dome.
   *  Position, tilt and tint are re-rolled each night by newNight(); only the disk geometry is fixed. */
  private makeGalaxy(dist: number, scaleMul: number, coreHex: number, primary: boolean): void {
    const arms = 3, n = 7200;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    const radius = DOME * 0.42 * scaleMul;
    let s = (scaleMul * 1000 + dist) % 233280;
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
    // soft round point sprites (not hard squares) blend into a smooth glow instead of looking pixelated
    const mat = new THREE.PointsMaterial({
      size: radius * 0.05, map: this.softDot(), vertexColors: true, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
    });
    const disk = new THREE.Points(geo, mat);
    disk.frustumCulled = false;

    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.softDot(), color: coreHex, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    core.scale.setScalar(radius * 0.55);
    // a big faint halo fills the gaps between arm points so the whole disk reads as a soft cloud
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.softDot(), color: coreHex, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    halo.scale.setScalar(radius * 2.4);

    const g = new THREE.Group();
    g.add(disk, halo, core);
    const baseOpacity = primary ? 0.9 : 0.7;
    g.userData = {
      dist, primary, baseOpacity, spin: primary ? 0.006 : 0.012, nightVis: 1,
      mats: [
        { m: mat, f: 1 },
        { m: halo.material as THREE.SpriteMaterial, f: 0.16 },
        { m: core.material as THREE.SpriteMaterial, f: 0.6 },
      ],
    };
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
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.meteors.frustumCulled = false;
    this.group.add(this.meteors);
  }

  private launchMeteor(m: number, shower = false): void {
    const st = this.meteorState[m]!;
    if (shower) {
      // a random start, with velocity directed AWAY from the radiant, so trails point back to it
      const a = Math.random() * Math.PI * 2, el = 0.3 + Math.random() * 0.55;
      const ring = Math.sqrt(Math.max(0, 1 - el * el));
      st.x = Math.cos(a) * ring * DOME; st.y = el * DOME; st.z = Math.sin(a) * ring * DOME;
      const rr = Math.sqrt(Math.max(0, 1 - this.radiantEl * this.radiantEl));
      const rx = Math.cos(this.radiantA) * rr * DOME, ry = this.radiantEl * DOME, rz = Math.sin(this.radiantA) * rr * DOME;
      const dx = st.x - rx, dy = st.y - ry, dz = st.z - rz, dl = Math.hypot(dx, dy, dz) || 1;
      const sp = DOME * (1.0 + Math.random() * 0.8);
      st.vx = (dx / dl) * sp; st.vy = (dy / dl) * sp; st.vz = (dz / dl) * sp;
      st.max = 0.6 + Math.random() * 0.5; st.life = st.max;
      return;
    }
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
    // occasionally a whole SHOWER: a burst of fast meteors radiating from one point in the sky
    this.showerTimer -= dt;
    if (this.shower > 0) this.shower -= dt;
    if (this.showerTimer <= 0 && night > 0.5) {
      if (this.shower <= 0 && Math.random() < 0.5) {
        this.shower = 14 + Math.random() * 22;
        this.radiantA = Math.random() * Math.PI * 2;
        this.radiantEl = 0.55 + Math.random() * 0.35;
      }
      this.showerTimer = 70 + Math.random() * 150;
    }
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0 && night > 0.5) {
      const free = this.meteorState.findIndex((s) => s.life <= 0);
      if (free >= 0) this.launchMeteor(free, this.shower > 0);
      this.meteorTimer = this.shower > 0 ? 0.16 + Math.random() * 0.35 : 2.5 + Math.random() * 7;
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

  /** A rare, slow comet with a long glowing tail that drifts across the night sky. */
  private makeComet(): void {
    const T = Cosmos.COMET_TRAIL;
    this.cometPos = new Float32Array(T * 3);
    this.cometCol = new Float32Array(T * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.cometPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.cometCol, 3));
    this.comet = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 3.4, vertexColors: true, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.comet.frustumCulled = false;
    this.group.add(this.comet);
  }

  private updateComet(dt: number, night: number): void {
    const T = Cosmos.COMET_TRAIL;
    const st = this.cometState;
    this.cometTimer -= dt;
    if (st.life <= 0 && this.cometTimer <= 0 && night > 0.5) {
      const a = Math.random() * Math.PI * 2, el = 0.5 + Math.random() * 0.35;
      const ring = Math.sqrt(Math.max(0, 1 - el * el));
      st.x = Math.cos(a) * ring * DOME; st.y = el * DOME; st.z = Math.sin(a) * ring * DOME;
      const dir = a + Math.PI / 2 + (Math.random() - 0.5) * 0.6;
      const sp = DOME * 0.07; // slow drift
      st.vx = Math.cos(dir) * sp; st.vz = Math.sin(dir) * sp; st.vy = -DOME * 0.012;
      st.max = 55 + Math.random() * 45; st.life = st.max;
      this.cometTimer = 90 + Math.random() * 170; // and rare
    }
    if (st.life > 0) {
      st.life -= dt;
      st.x += st.vx * dt; st.y += st.vy * dt; st.z += st.vz * dt;
      const fade = Math.min(1, (st.max - st.life) / 4, st.life / 5) * night;
      const vlen = Math.hypot(st.vx, st.vy, st.vz) || 1;
      const ux = st.vx / vlen, uy = st.vy / vlen, uz = st.vz / vlen;
      const tailLen = DOME * 0.32;
      for (let i = 0; i < T; i++) {
        const d = (i / T) * tailLen;
        const o = i * 3;
        this.cometPos[o] = st.x - ux * d; this.cometPos[o + 1] = st.y - uy * d; this.cometPos[o + 2] = st.z - uz * d;
        const tail = (1 - i / T) * fade;
        this.cometCol[o] = tail * 0.8; this.cometCol[o + 1] = tail * 0.95; this.cometCol[o + 2] = tail; // bluish-white
      }
    } else {
      this.cometCol.fill(0);
    }
    (this.comet.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.comet.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** A faint label drawn under each constellation. */
  private starLabel(text: string): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const x = c.getContext('2d')!;
    x.font = '600 26px ui-sans-serif, system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(180,205,255,0.85)';
    x.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0, fog: false }));
    sp.scale.set(DOME * 0.16, DOME * 0.04, 1);
    return sp;
  }

  /** A library of named star patterns. Each is baked centred on the zenith; newNight() then rotates a
   *  random subset out to random spots on the dome, so different constellations show on different nights. */
  private makeConstellations(): void {
    const patterns: { name: string; v: [number, number][]; e: [number, number][]; scale: number }[] = [
      { name: 'The Critter', v: [[-0.8, 0.3], [-0.3, 0.6], [0.2, 0.5], [0.6, 0.2], [0.3, -0.4], [-0.2, -0.3], [-0.6, -0.5]],
        e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [5, 1]], scale: 0.5 },
      { name: 'The Wing', v: [[-0.9, 0], [-0.4, 0.4], [0, 0.1], [0.4, 0.4], [0.9, 0], [0, -0.3]],
        e: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5]], scale: 0.46 },
      { name: 'The Drop', v: [[0, 0.7], [-0.4, 0], [0, -0.6], [0.4, 0]],
        e: [[0, 1], [1, 2], [2, 3], [3, 0]], scale: 0.34 },
      { name: 'The Hunter', v: [[-0.6, 0.5], [-0.2, 0.2], [0.2, 0.4], [0.5, 0.1], [0.1, -0.2], [-0.3, -0.5], [0.4, -0.6]],
        e: [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [4, 6]], scale: 0.5 },
      { name: 'The Serpent', v: [[-0.9, -0.2], [-0.5, 0.2], [-0.1, -0.1], [0.3, 0.25], [0.7, -0.05], [0.95, 0.35]],
        e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]], scale: 0.5 },
      { name: 'The Crown', v: [[-0.8, -0.3], [-0.5, 0.3], [-0.1, 0.0], [0.2, 0.45], [0.5, 0.0], [0.8, 0.3]],
        e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]], scale: 0.46 },
      { name: 'The Twins', v: [[-0.5, 0.6], [-0.5, -0.5], [0.5, 0.6], [0.5, -0.5], [-0.5, 0.05], [0.5, 0.05]],
        e: [[0, 1], [2, 3], [4, 5]], scale: 0.44 },
      { name: 'The Anchor', v: [[0, 0.7], [0, -0.1], [0, -0.6], [-0.5, -0.35], [0.5, -0.35], [-0.3, 0.45], [0.3, 0.45]],
        e: [[0, 1], [1, 2], [2, 3], [2, 4], [0, 5], [0, 6]], scale: 0.46 },
      { name: 'The Lantern', v: [[-0.35, 0.6], [0.35, 0.6], [-0.45, -0.1], [0.45, -0.1], [-0.3, -0.6], [0.3, -0.6]],
        e: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5]], scale: 0.42 },
      { name: 'The Spark', v: [[0, 0.7], [0.5, 0.2], [0.3, -0.5], [-0.3, -0.5], [-0.5, 0.2]],
        e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]], scale: 0.4 },
    ];
    // bake every pattern around the zenith (0,1,0); a per-night quaternion sends it to its place
    const center = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3(1, 0, 0);
    const top = new THREE.Vector3(0, 0, 1);
    for (const p of patterns) {
      const g = new THREE.Group();
      const pts3: THREE.Vector3[] = p.v.map(([u, w]) =>
        center.clone().add(right.clone().multiplyScalar(u * p.scale)).add(top.clone().multiplyScalar(w * p.scale)).normalize().multiplyScalar(DOME * 0.97));

      // bright marker stars
      const starPos = new Float32Array(pts3.length * 3);
      pts3.forEach((v, i) => { starPos[i * 3] = v.x; starPos[i * 3 + 1] = v.y; starPos[i * 3 + 2] = v.z; });
      const sgeo = new THREE.BufferGeometry();
      sgeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const smat = new THREE.PointsMaterial({ color: 0xeaf2ff, map: this.softDot(), size: 6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
      const stars = new THREE.Points(sgeo, smat);
      stars.frustumCulled = false;

      // connecting lines
      const linePos = new Float32Array(p.e.length * 2 * 3);
      p.e.forEach(([a, b], i) => {
        const va = pts3[a]!, vb = pts3[b]!;
        linePos.set([va.x, va.y, va.z, vb.x, vb.y, vb.z], i * 6);
      });
      const lgeo = new THREE.BufferGeometry();
      lgeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
      const lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: 0x9fb8e6, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      lines.frustumCulled = false;

      const label = this.starLabel(p.name);
      const lowest = pts3.reduce((a, b) => (b.y < a.y ? b : a));
      label.position.copy(lowest).multiplyScalar(0.98);

      g.add(stars, lines, label);
      g.userData = { star: smat, line: lines.material as THREE.LineBasicMaterial, label: label.material as THREE.SpriteMaterial, nightVis: 0 };
      this.constellations.push(g);
      this.group.add(g);
    }
  }

  /** Roll a fresh sky for a new night: scatter a random subset of constellations across the dome, move +
   *  re-tint the galaxies and nebulae, and decide which of the dimmer deep-space objects are out tonight. */
  newNight(): void {
    const up = new THREE.Vector3(0, 1, 0);
    const dirAt = (az: number, el: number): THREE.Vector3 => {
      const ring = Math.sqrt(Math.max(0, 1 - el * el));
      return new THREE.Vector3(Math.cos(az) * ring, el, Math.sin(az) * ring);
    };

    // constellations: shuffle, show 3–4 of them at random orientations, hide the rest
    const idx = this.constellations.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j]!, idx[i]!]; }
    const shown = 3 + Math.floor(Math.random() * 2);
    this.constellations.forEach((g) => { g.userData.nightVis = 0; });
    for (let i = 0; i < shown && i < idx.length; i++) {
      const g = this.constellations[idx[i]!]!;
      g.quaternion.setFromUnitVectors(up, dirAt(Math.random() * Math.PI * 2, 0.4 + Math.random() * 0.45));
      g.userData.nightVis = 1;
    }

    // galaxies: a new place, tilt and gentle tint each night; the companion is gone on some nights
    const tints = [0xfff0d8, 0xcfe0ff, 0xe8d8ff, 0xd8ffe8, 0xffe0ea, 0xfff7e0];
    for (const g of this.galaxies) {
      const dist = g.userData.dist as number;
      const el = 0.45 + Math.random() * 0.4;
      const d = dirAt(Math.random() * Math.PI * 2, el).multiplyScalar(dist);
      g.position.copy(d);
      g.rotation.set(Math.PI * (0.18 + Math.random() * 0.3), Math.random() * Math.PI * 2, Math.PI * (Math.random() * 0.5 - 0.25));
      const tint = new THREE.Color(tints[Math.floor(Math.random() * tints.length)]!);
      for (const { m } of g.userData.mats as { m: THREE.Material & { color: THREE.Color } }[]) m.color.copy(tint);
      g.userData.nightVis = (g.userData.primary as boolean) ? 1 : (Math.random() < 0.6 ? 1 : 0);
    }

    // nebulae: reposition, recolour, and show ~3 of the 5 each night
    for (const sp of this.nebulae) {
      const el = 0.28 + Math.random() * 0.5;
      sp.position.copy(dirAt(Math.random() * Math.PI * 2, el).multiplyScalar(DOME * 0.92));
      const sc = DOME * (0.45 + Math.random() * 0.4);
      sp.scale.set(sc, sc, 1);
      (sp.material as THREE.SpriteMaterial).color.setHSL(Math.random(), 0.55 + Math.random() * 0.2, 0.55);
      sp.userData.baseOpacity = 0.13 + Math.random() * 0.1;
      sp.userData.nightVis = Math.random() < 0.62 ? 1 : 0;
    }
  }

  /** Clear sky (0 = thick cloud .. 1 = crystal clear) — fades out the faint stars when it clouds over. */
  setClarity(clear: number): void {
    this.starMat.uniforms.uClear!.value = Math.max(0, Math.min(1, clear));
  }

  /** 0 = full daylight (sky hidden) .. 1 = deep night (sky at full brightness). */
  setNight(night: number): void {
    this.starMat.uniforms.uNight!.value = night;
    this.group.visible = night > 0.02;
    for (const n of this.nebulae) {
      (n.material as THREE.SpriteMaterial).opacity = (n.userData.baseOpacity as number) * night * (n.userData.nightVis as number);
    }
    for (const g of this.galaxies) {
      const base = g.userData.baseOpacity as number;
      const vis = g.userData.nightVis as number;
      for (const { m, f } of g.userData.mats as { m: THREE.Material; f: number }[]) m.opacity = base * f * night * vis;
    }
    // constellations only emerge in proper darkness (and stay subtle), and only those out tonight
    const cn = Math.max(0, (night - 0.45) / 0.55);
    for (const g of this.constellations) {
      const vis = g.userData.nightVis as number;
      (g.userData.star as THREE.PointsMaterial).opacity = cn * vis;
      (g.userData.line as THREE.LineBasicMaterial).opacity = cn * 0.32 * vis;
      (g.userData.label as THREE.SpriteMaterial).opacity = cn * 0.6 * vis;
    }
  }

  update(t: number): void {
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const night = this.starMat.uniforms.uNight!.value as number;
    this.updateMeteors(dt, night);
    this.updateComet(dt, night);
    if (!this.group.visible) return;
    this.starMat.uniforms.uTime!.value = t;
    for (const g of this.galaxies) g.rotateY((g.userData.spin as number) * 0.016);
    for (const n of this.nebulae) {
      const ph = n.userData.phase as number;
      const base = n.userData.baseOpacity as number;
      // gentle breathing so the clouds feel alive
      const mat = n.material as THREE.SpriteMaterial;
      const breathe = 0.8 + 0.2 * Math.sin(t * 0.07 + ph);
      mat.opacity = base * breathe * this.starMat.uniforms.uNight!.value * (n.userData.nightVis as number);
    }
  }
}
