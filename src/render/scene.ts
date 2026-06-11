import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { WORLD, FOOD, SOCIAL, WEATHER, FLIGHT, LIFE, PRED, SPECIES, params } from '../config';
import type { World } from '../sim/world';
import type { Creature } from '../sim/creature';
import type { Biome, SkyState } from '../biome';
import { Cosmos } from './cosmos';

const MAX_PULSES = 256; // max simultaneous "found food!" signal rings drawn
const RAIN_HEIGHT = 60; // how high rain spawns above the ground
const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();
const TMP3 = new THREE.Vector3();
const STORM = new THREE.Color(0x2a2e36);
const FLASH = new THREE.Color(0xe6f0ff);
const FOLIAGE_SUMMER = new THREE.Color(0x3f8f4a);
const FOLIAGE_AUTUMN = new THREE.Color(0xc8772e);
const BLOSSOM_PINK = new THREE.Color(0xffb7d5); // spring blossom on the broadleaf trees
const FRUIT_RED = new THREE.Color(0xe2402c); // late-season fruit
const toVec3 = (hex: number): THREE.Color => new THREE.Color(hex);

/** A soft round dot sprite, tinted via material color — used for tree blossom/fruit accents. */
function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 24;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(12, 12, 0, 12, 12, 12);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.arc(12, 12, 12, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

/** 4-step grayscale ramp that turns standard lighting into flat cel/toon bands. */
function toonGradient(): THREE.DataTexture {
  const c = new Uint8Array([95, 95, 95, 255, 165, 165, 165, 255, 220, 220, 220, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(c, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** A small "z z z" sprite texture drawn on a canvas, billboarded above sleeping creatures. */
function zzzTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const x = c.getContext('2d')!;
  x.font = 'bold 30px Georgia, serif';
  x.fillStyle = 'rgba(255,255,255,0.92)';
  x.textBaseline = 'middle';
  x.fillText('z', 18, 46); x.fillText('z', 50, 33); x.fillText('z', 84, 20);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

/** Draw a rounded rectangle path. */
function roundRectPath(x: CanvasRenderingContext2D, rx: number, ry: number, w: number, h: number, r: number): void {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + w, ry, rx + w, ry + h, r);
  x.arcTo(rx + w, ry + h, rx, ry + h, r);
  x.arcTo(rx, ry + h, rx, ry, r);
  x.arcTo(rx, ry, rx + w, ry, r);
  x.closePath();
}

/** Word-wrap text into up to two centred lines. */
function wrapLines(x: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (x.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    if (lines.length >= 1 && x.measureText(cur).width > maxW) break; // cap at 2 lines
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

/** A soft round speck (for pollen motes + glowing fireflies, instead of hard square points). */
function softDotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true;
  return t;
}

/** A bright "!" sprite, billboarded above startled prey. */
function bangTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.font = 'bold 52px Georgia, serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 7; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText('!', 32, 34);
  x.fillStyle = '#ffe14d'; x.fillText('!', 32, 34);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true;
  return t;
}

/** The cosmetic mesh rig for one creature (built once, reused via the pool). */
interface CreatureRig {
  body: THREE.Mesh;
  mat: THREE.MeshToonMaterial;
  eyes: THREE.Mesh[];
  earRound: THREE.Mesh[];
  earPointy: THREE.Mesh[];
  antenna: THREE.Mesh[];
  tail: THREE.Mesh;
  mouth: THREE.Mesh;
  wings: THREE.Mesh[];
  zzz: THREE.Sprite;
  alarm: THREE.Sprite;
  outline: THREE.Mesh;
  lastHeading: number;
}

/** A small pool of instanced spheres for transient particle bursts (births, deaths, etc.). */
class BurstField {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private px: Float32Array; private py: Float32Array; private pz: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private life: Float32Array; private max: Float32Array;
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();

  constructor(n = 440) {
    this.n = n;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n);
    const geo = new THREE.SphereGeometry(0.16, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.dummy.scale.set(0, 0, 0); this.dummy.updateMatrix();
    for (let i = 0; i < n; i++) { this.mesh.setMatrixAt(i, this.dummy.matrix); this.mesh.setColorAt(i, this.col.set(0xffffff)); }
  }

  emit(x: number, y: number, z: number, hex: number, count: number, rise: number): void {
    for (let k = 0; k < count; k++) {
      let i = -1;
      for (let j = 0; j < this.n; j++) if (this.life[j]! <= 0) { i = j; break; }
      if (i < 0) return;
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.3;
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.vx[i] = Math.cos(a) * sp; this.vz[i] = Math.sin(a) * sp; this.vy[i] = rise * (0.7 + Math.random() * 0.9);
      this.life[i] = 0.9; this.max[i] = 0.9;
      this.mesh.setColorAt(i, this.col.set(hex));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      this.px[i]! += this.vx[i]! * dt; this.py[i]! += this.vy[i]! * dt; this.pz[i]! += this.vz[i]! * dt;
      this.vy[i]! -= 1.5 * dt;
      const s = Math.max(0, this.life[i]! / this.max[i]!) * 0.5;
      this.dummy.position.set(this.px[i]!, this.py[i]!, this.pz[i]!);
      this.dummy.scale.set(s, s, s); this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A small pool of expanding flat rings — ripples spreading across the water. */
class RippleField {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private px: Float32Array; private py: Float32Array; private pz: Float32Array;
  private life: Float32Array; private max: Float32Array;
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();

  constructor(n = 30) {
    this.n = n;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n);
    const geo = new THREE.RingGeometry(0.55, 0.72, 24); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.dummy.scale.set(0, 0, 0); this.dummy.updateMatrix();
    for (let i = 0; i < n; i++) { this.mesh.setMatrixAt(i, this.dummy.matrix); this.mesh.setColorAt(i, this.col.set(0x000000)); }
  }

  emit(x: number, y: number, z: number): void {
    for (let j = 0; j < this.n; j++) if (this.life[j]! <= 0) { this.px[j] = x; this.py[j] = y; this.pz[j] = z; this.life[j] = this.max[j] = 1.4; return; }
  }

  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      const f = Math.max(0, this.life[i]! / this.max[i]!); // 1 → 0
      const s = 0.5 + (1 - f) * 3.6; // expand outward
      this.dummy.position.set(this.px[i]!, this.py[i]!, this.pz[i]!);
      this.dummy.scale.set(s, 1, s); this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      const b = f * 0.55;
      this.mesh.setColorAt(i, this.col.setRGB(b * 0.7, b * 0.9, b));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private clock = new THREE.Clock();
  private biome: Biome;

  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private skyMat: THREE.ShaderMaterial;
  private skyMesh!: THREE.Mesh;
  private cosmos = new Cosmos();
  private terrain!: THREE.Mesh;

  private toonGrad = toonGradient();
  private bodyGeo = new THREE.SphereGeometry(0.5, 18, 14);
  private eyeGeo = new THREE.SphereGeometry(0.17, 12, 12);
  private pupilGeo = new THREE.SphereGeometry(0.085, 10, 10);
  private hiGeo = new THREE.SphereGeometry(0.038, 6, 6);
  private earRoundGeo = new THREE.SphereGeometry(0.17, 10, 10);
  private earPointyGeo = new THREE.ConeGeometry(0.14, 0.36, 8);
  private antStemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.32, 6);
  private antBallGeo = new THREE.SphereGeometry(0.08, 8, 8);
  private tailGeo = new THREE.SphereGeometry(0.14, 8, 8);
  private mouthGeo = new THREE.SphereGeometry(0.09, 8, 8);
  private wingGeo = new THREE.ConeGeometry(0.32, 0.62, 4);
  private wingMat = new THREE.MeshToonMaterial({ color: 0xeaf2ff, gradientMap: this.toonGrad, transparent: true, opacity: 0.82 });
  private zzzMat = new THREE.SpriteMaterial({ map: zzzTexture(), transparent: true, depthWrite: false });
  private bangMat = new THREE.SpriteMaterial({ map: bangTexture(), transparent: true, depthWrite: false, depthTest: false });
  private softDotTex = softDotTexture();
  private whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private darkMat = new THREE.MeshBasicMaterial({ color: 0x232334 });
  private mouthMat = new THREE.MeshBasicMaterial({ color: 0x3a2030 });
  private outlineMat = new THREE.MeshBasicMaterial({ color: 0x15121f, side: THREE.BackSide });
  private redOutlineMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, side: THREE.BackSide });
  private groups = new Map<number, THREE.Group>();

  // unit tree parts (base sitting at local y=0) — scaled per tree so every tree is shaped differently
  private trunkGeo = new THREE.CylinderGeometry(0.7, 1.0, 1, 7).translate(0, 0.5, 0);
  private branchGeo = new THREE.CylinderGeometry(0.06, 0.16, 1, 5).translate(0, 0.5, 0);
  private coneGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  private foliageGeo = new THREE.IcosahedronGeometry(2.5, 1);
  private trunkMat = new THREE.MeshToonMaterial({ color: 0x6b4a2b, gradientMap: this.toonGrad });
  private foliageMat = new THREE.MeshToonMaterial({ color: 0x3f8f4a, gradientMap: this.toonGrad });
  private shroomStemGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.4, 6);
  private shroomCapGeo = new THREE.SphereGeometry(0.22, 8, 6);
  private glowMats: THREE.MeshToonMaterial[] = [];
  private treeGroup = new THREE.Group();
  private treePositions: { x: number; z: number }[] = [];
  // each tree sways as a whole from its base: rz/rx are its resting lean, amp scales the wind
  private treeSway: { grp: THREE.Group; rx: number; rz: number; phase: number; amp: number }[] = [];
  private bushGroup = new THREE.Group();
  // blossom (spring) / fruit (late season) accents on the broadleaf trees — colour set by season
  private accentMat = new THREE.PointsMaterial({ map: dotTexture(), size: 0.5, transparent: true, opacity: 0, depthWrite: false, fog: true });
  private treeAccentGeos: THREE.BufferGeometry[] = [];
  private horizonGroup = new THREE.Group();
  private horizonGeo = new THREE.ConeGeometry(1, 1, 5);
  private horizonMat = new THREE.MeshToonMaterial({ gradientMap: this.toonGrad });
  private pondGroup = new THREE.Group();
  private pondData: { x: number; z: number; r: number }[] = [];
  private waterMat!: THREE.ShaderMaterial;
  private lilyMat = new THREE.MeshToonMaterial({ color: 0x3f7a3a, gradientMap: this.toonGrad });
  private lilies: { mesh: THREE.Mesh; baseY: number; phase: number }[] = [];
  private ripples = new RippleField();
  private pool: THREE.Group[] = [];
  private pickables: THREE.Mesh[] = [];

  private foodMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  private bondLines!: THREE.LineSegments;
  private bondPos!: Float32Array;
  private pulseMesh!: THREE.InstancedMesh;
  private pulseDummy = new THREE.Object3D();

  private rain!: THREE.Points;
  private rainPos!: Float32Array;
  private beam!: THREE.Mesh;
  private rainbow!: THREE.Mesh;
  private rainbowMat!: THREE.ShaderMaterial;
  private rainbowLife = 0;
  private prevWeather = 0;
  private static readonly RAINBOW_LIFE = 16;

  private nameSprite!: THREE.Sprite;
  private nameCanvas = document.createElement('canvas');
  private nameTex!: THREE.CanvasTexture;
  private lastNameId = -1;

  private bubbleSprites: THREE.Sprite[] = [];
  private bubbleCanvas: HTMLCanvasElement[] = [];
  private bubbleTex: THREE.CanvasTexture[] = [];
  private bubbleText: string[] = [];

  private fireflies!: THREE.Points;
  private fireflyBase!: Float32Array;
  private fireflyCur!: Float32Array;
  private moon!: THREE.Mesh;
  private moonMat!: THREE.ShaderMaterial;
  private lastAge = 0;
  private prevNightForAurora = false;
  private bloodMoon = false; // a rare red-moon night
  onBloodMoon: () => void = () => {}; // fired when a blood moon rises
  private lastSky!: SkyState;
  private motes!: THREE.Points;
  private motesBase!: Float32Array;
  private motesCur!: Float32Array;
  private butterflies: { sp: THREE.Sprite; bx: number; bz: number; phase: number; speed: number }[] = [];
  private dragonflies: { sp: THREE.Sprite; phase: number; speed: number }[] = [];
  // fish circling just under the pond surface, and the dawn/dusk sun-shaft glare
  private fish: { mesh: THREE.Mesh; cx: number; cz: number; r: number; ang: number; speed: number; y: number; phase: number; dart: number }[] = [];
  private fishGeo = new THREE.SphereGeometry(1, 8, 6);
  private fishMats: THREE.MeshToonMaterial[] = [];
  private sunShafts?: THREE.Sprite;
  private clouds: { sprite: THREE.Sprite; shadow: THREE.Mesh; x: number; z: number; speed: number }[] = [];
  private flocks: { group: THREE.Group; birds: THREE.Sprite[]; speed: number }[] = [];
  private mist: { sprite: THREE.Sprite; x: number; z: number; speed: number }[] = [];
  private flowers!: THREE.Points;
  private flowerCount = 420;
  private grass!: THREE.Points; // scattered grass tufts
  private pebbles!: THREE.Points; // scattered pebbles
  private grassN = 700;
  private pebbleN = 150;
  private leaves!: THREE.Points;
  private leafSpeed!: Float32Array;
  private petals!: THREE.Points; // spring blossom petals (the counterpart to autumn leaves)
  private petalSpeed!: Float32Array;
  private bursts = new BurstField();
  private lastT = 0;

  private selectedId: number | null = null;
  onSelect: (id: number | null) => void = () => {};
  // god mode: when a tool is active, ground clicks apply it instead of selecting a creature
  private godTool: string | null = null;
  onGround: (x: number, z: number, tool: string) => void = () => {};
  // cinematic director: when nobody is manually selected, the camera glides from critter to critter
  private autoFollowId: number | null = null;
  private autoTimer = 0;
  private autoMode: 'follow' | 'orbit' = 'orbit';
  private autoCam = true; // when off, the camera just drifts in a slow gentle orbit (no auto-follow)
  // highlight reel: occasionally swoop to a fresh dramatic event (a kill, a striking birth)
  private highlightT = 0;
  private highlightX = 0;
  private highlightZ = 0;
  private highlightCdMs = -99999;

  private lastDt = 0;
  private dramaTimer = 0;
  private dramaX = 0;
  private dramaZ = 0;
  private stargaze = false;
  private savedView: {
    target: THREE.Vector3; maxPolar: number; minDist: number; maxDist: number;
    autoRotate: boolean; autoSpeed: number; enablePan: boolean;
  } | null = null;

  constructor(container: HTMLElement, biome: Biome) {
    this.biome = biome;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // cap the render resolution: on hi-DPI screens, 2× pixel ratio quadruples the pixels (esp. costly
    // through the bloom passes) and is a common cause of frame-time variance / tearing — 1.5 is plenty
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.Fog(0x0a0e14, WORLD.half * 1.4, WORLD.half * 3.4);
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, WORLD.half * 0.8, WORLD.half * 1.15);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 3;
    this.controls.maxDistance = WORLD.half * 2.6;
    this.controls.autoRotateSpeed = 0.22; // slow, relaxing drift when not following anyone

    this.hemi = new THREE.HemisphereLight(0xbcd7ff, 0x20301a, 0.6);
    this.scene.add(this.hemi);
    this.sun = this.makeSun();
    this.scene.add(this.sun, this.sun.target);

    this.skyMat = this.makeSkyMaterial();
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(WORLD.half * 3.2, 32, 16), this.skyMat);
    this.scene.add(this.skyMesh);
    this.scene.add(this.cosmos.group);

    this.buildTerrain();
    this.scene.add(this.horizonGroup);

    this.foodMesh = this.makeFoodMesh();
    this.scene.add(this.foodMesh);
    this.makeSocialViz();
    this.scene.add(this.treeGroup);
    this.scene.add(this.bushGroup);
    this.makeWater();
    this.scene.add(this.pondGroup);
    this.scene.add(this.ripples.mesh);
    this.makeWeather();
    this.makeRainbow();
    this.makeNameTag();
    this.makeBubbles();
    this.makeNight();
    this.makeButterflies();
    this.makeClouds();
    this.makeBirds();
    this.makeMist();
    this.makeFlowers();
    this.makeLeaves();
    this.makePetals();
    this.makeDragonflies();
    this.makeSunShafts();
    this.scene.add(this.bursts.mesh);

    const renderPass = new RenderPass(this.scene, this.camera);
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.5, 0.62);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(bloom);

    window.addEventListener('resize', () => this.onResize());
    this.wireSelection();
  }

  private makeSun(): THREE.DirectionalLight {
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -WORLD.half; c.right = WORLD.half; c.top = WORLD.half; c.bottom = -WORLD.half;
    c.near = 1; c.far = WORLD.half * 4;
    return sun;
  }

  private makeSkyMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTop: { value: new THREE.Color(0x244a78) }, uBottom: { value: new THREE.Color(0xbfe0ff) } },
      vertexShader: `varying float vH; void main(){ vH = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; varying float vH; void main(){ float t = smoothstep(-0.1, 0.55, vH); gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0); }`,
    });
  }

  /** Build (or rebuild, after a biome reseed) the displaced, vertex-colored terrain. */
  buildTerrain(): void {
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); }
    const size = WORLD.half * 2;
    const seg = 110;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i), wz = -pos.getY(i);
      const h = this.biome.height(wx, wz);
      pos.setZ(i, h);
      const h01 = Math.max(0, Math.min(1, (h + this.biome.amplitude * 0.5) / (this.biome.amplitude)));
      const [r, g, b] = this.biome.groundColorRgb(h01);
      colors[i * 3] = r / 255; colors[i * 3 + 1] = g / 255; colors[i * 3 + 2] = b / 255;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.rotation.x = -Math.PI / 2;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    this.fillFlowers(); // re-seat the wildflowers on the new terrain
    this.makeBushes(); // re-scatter the understory shrubs
    this.makeGroundDetail(); // grass tufts + pebbles
    this.buildHorizon(); // re-tint the distant hills to the new palette
  }

  /** A small green-blade texture for grass-tuft sprites. */
  private grassTexture(): THREE.CanvasTexture {
    const cv = document.createElement('canvas'); cv.width = cv.height = 16;
    const x = cv.getContext('2d')!;
    x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const bx = 5 + i * 3;
      x.beginPath(); x.moveTo(bx, 15); x.quadraticCurveTo(bx + (i - 1) * 2, 8, bx + (i - 1) * 3, 2); x.stroke();
    }
    const t = new THREE.CanvasTexture(cv); t.needsUpdate = true; return t;
  }

  /** Scatter grass tufts + pebbles across the terrain (rebuilt per biome; dim at night). */
  private makeGroundDetail(): void {
    if (!this.grass) {
      const tuft = (n: number, map: THREE.Texture, size: number, op: number): THREE.Points => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map, size, vertexColors: true, transparent: true, opacity: op, depthWrite: true, alphaTest: 0.4, fog: true }));
        pts.frustumCulled = false; this.scene.add(pts); return pts;
      };
      this.grass = tuft(this.grassN, this.grassTexture(), 0.7, 0.8);
      this.pebbles = tuft(this.pebbleN, dotTexture(), 0.5, 0.7);
    }
    this.fillGroundDetail();
  }

  private fillGroundDetail(): void {
    const H = WORLD.half - 2;
    const c = new THREE.Color();
    const gp = this.grass.geometry.getAttribute('position') as THREE.BufferAttribute;
    const gc = this.grass.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < this.grassN; i++) {
      const x = (Math.random() * 2 - 1) * H, z = (Math.random() * 2 - 1) * H;
      gp.setXYZ(i, x, this.biome.height(x, z) + 0.25, z);
      c.setHSL(0.26 + Math.random() * 0.08, 0.45, 0.3 + Math.random() * 0.13); // mossy greens
      gc.setXYZ(i, c.r, c.g, c.b);
    }
    gp.needsUpdate = true; gc.needsUpdate = true;
    const pp = this.pebbles.geometry.getAttribute('position') as THREE.BufferAttribute;
    const pc = this.pebbles.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < this.pebbleN; i++) {
      const x = (Math.random() * 2 - 1) * H, z = (Math.random() * 2 - 1) * H;
      pp.setXYZ(i, x, this.biome.height(x, z) + 0.12, z);
      const v = 0.38 + Math.random() * 0.26; c.setRGB(v, v * 0.97, v * 0.92); // greys
      pc.setXYZ(i, c.r, c.g, c.b);
    }
    pp.needsUpdate = true; pc.needsUpdate = true;
  }

  /** Scatter low shrubs across the meadow (rebuilt per biome; share the seasonal foliage material). */
  private makeBushes(): void {
    this.bushGroup.clear();
    const h = WORLD.half - 4;
    for (let i = 0; i < 46; i++) {
      const x = (Math.random() * 2 - 1) * h, z = (Math.random() * 2 - 1) * h;
      const bush = new THREE.Group();
      bush.position.set(x, this.biome.height(x, z), z);
      bush.rotation.y = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.55;
      const lobes = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < lobes; k++) {
        const blob = new THREE.Mesh(this.foliageGeo, this.foliageMat);
        blob.scale.setScalar((r * (0.7 + Math.random() * 0.5)) / 2.5);
        blob.position.set((Math.random() * 2 - 1) * r, r * 0.5 + Math.random() * 0.3, (Math.random() * 2 - 1) * r);
        blob.castShadow = true;
        bush.add(blob);
      }
      this.bushGroup.add(bush);
    }
  }

  /** A ring of hazy low-poly hills around the arena, fog-faded for a sense of distance and depth. */
  private buildHorizon(): void {
    this.horizonGroup.clear();
    const [r, g, b] = this.biome.groundColorRgb(0.82);
    this.horizonMat.color.setRGB(r / 255, g / 255, b / 255);
    const n = 30, R = 135;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.12;
      const rr = R + (Math.random() - 0.5) * 30;
      const h = 14 + Math.random() * 26, w = 18 + Math.random() * 22;
      const hill = new THREE.Mesh(this.horizonGeo, this.horizonMat);
      hill.position.set(Math.cos(a) * rr, h * 0.5 - 4, Math.sin(a) * rr);
      hill.scale.set(w, h, w);
      this.horizonGroup.add(hill);
    }
  }

  private makeFoodMesh(): THREE.InstancedMesh {
    const geo = new THREE.SphereGeometry(FOOD.radius, 6, 6);
    // soft sprout-green, barely emissive so bloom doesn't turn the field into glowing orbs
    const mat = new THREE.MeshStandardMaterial({ color: 0x86c46a, emissive: 0x2e6b33, emissiveIntensity: 0.35, roughness: 0.85 });
    const mesh = new THREE.InstancedMesh(geo, mat, WORLD.foodMax);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = WORLD.foodMax;
    return mesh;
  }

  private acquireGroup(): THREE.Group {
    const g = this.pool.pop();
    if (g) { g.visible = true; return g; }
    const group = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({ gradientMap: this.toonGrad });
    const body = new THREE.Mesh(this.bodyGeo, mat);
    body.castShadow = true;
    const outline = new THREE.Mesh(this.bodyGeo, this.outlineMat);
    outline.scale.setScalar(1.08);

    const eye = (z: number): THREE.Mesh => { const m = new THREE.Mesh(this.eyeGeo, this.whiteMat); m.position.set(0.34, 0.16, z); return m; };
    const pupil = (z: number): THREE.Mesh => { const m = new THREE.Mesh(this.pupilGeo, this.darkMat); m.position.set(0.46, 0.16, z); return m; };
    const hi = (z: number): THREE.Mesh => { const m = new THREE.Mesh(this.hiGeo, this.whiteMat); m.position.set(0.5, 0.23, z); return m; };
    const eyeL = eye(0.2), eyeR = eye(-0.2);

    const round = (z: number): THREE.Mesh => { const m = new THREE.Mesh(this.earRoundGeo, mat); m.position.set(-0.04, 0.48, z); return m; };
    const pointy = (z: number): THREE.Mesh => { const m = new THREE.Mesh(this.earPointyGeo, mat); m.position.set(-0.04, 0.56, z); return m; };
    const earRL = round(0.26), earRR = round(-0.26);
    const earPL = pointy(0.22), earPR = pointy(-0.22);

    const ant = (z: number): THREE.Mesh[] => {
      const stem = new THREE.Mesh(this.antStemGeo, this.darkMat); stem.position.set(0, 0.62, z);
      const ball = new THREE.Mesh(this.antBallGeo, mat); ball.position.set(0, 0.8, z);
      return [stem, ball];
    };
    const antL = ant(0.12), antR = ant(-0.12);
    const tail = new THREE.Mesh(this.tailGeo, mat); tail.position.set(-0.5, -0.02, 0);
    const mouth = new THREE.Mesh(this.mouthGeo, this.mouthMat);
    mouth.position.set(0.49, -0.08, 0); mouth.scale.set(0.7, 0.5, 1.4);

    const wing = (z: number, dir: number): THREE.Mesh => {
      const m = new THREE.Mesh(this.wingGeo, this.wingMat);
      m.position.set(-0.1, 0.18, z);
      m.rotation.x = dir * Math.PI / 2; // splay outward along ±z
      m.visible = false;
      return m;
    };
    const wingL = wing(0.2, 1), wingR = wing(-0.2, -1);
    const zzz = new THREE.Sprite(this.zzzMat);
    zzz.scale.set(1.4, 0.7, 1); zzz.position.set(0.1, 1.2, 0); zzz.visible = false;
    const alarm = new THREE.Sprite(this.bangMat);
    alarm.scale.set(0.9, 0.9, 1); alarm.position.set(0, 1.3, 0); alarm.visible = false; alarm.renderOrder = 998;

    group.add(body, outline, eyeL, eyeR, pupil(0.2), pupil(-0.2), hi(0.16), hi(-0.16),
      earRL, earRR, earPL, earPR, ...antL, ...antR, tail, mouth, wingL, wingR, zzz, alarm);
    const rig: CreatureRig = {
      body, mat, eyes: [eyeL, eyeR], earRound: [earRL, earRR],
      earPointy: [earPL, earPR], antenna: [...antL, ...antR], tail, mouth, wings: [wingL, wingR], zzz, alarm, outline,
      lastHeading: 0,
    };
    group.userData.rig = rig;
    this.scene.add(group);
    return group;
  }

  sync(world: World): void {
    const t = this.clock.getElapsedTime();
    const dt = Math.min(0.1, t - this.lastT); this.lastT = t;
    this.lastDt = dt;
    // the sky is infinitely far: keep its dome centred on the viewer so there's no parallax
    // when you orbit — it reads as a real planetary sky, not a nearby curved wall.
    this.skyMesh.position.copy(this.camera.position);
    this.cosmos.group.position.copy(this.camera.position);
    const seen = new Set<number>();
    this.pickables.length = 0;
    for (const c of world.creatures) {
      seen.add(c.id);
      let g = this.groups.get(c.id);
      if (!g) { g = this.acquireGroup(); this.groups.set(c.id, g); }
      const rig = g.userData.rig as CreatureRig;
      rig.body.userData.creatureId = c.id;
      this.pickables.push(rig.body);

      // appearance + motion derived from the heritable SPECIES archetype
      const pred = c.isPredator;
      const sp = SPECIES[c.genome.species] ?? SPECIES[0]!;
      const look = c.genome.look | 0;
      const earType = pred ? 1 : sp.ear; // predators always get pointy ears
      const hasTail = sp.tail;
      const eyeScale = sp.eye * (1 + ((look >> 3) & 1) * 0.08); // species eye size + a touch of variation
      const growth = Math.min(1, 0.4 + 0.6 * Math.min(1, c.age / LIFE.matureAge)); // babies start small, grow up
      const bodyScale = c.genome.size * (pred ? 1.28 : 1) * growth;
      const flying = c.canFly;
      const asleep = c.asleep;

      const baseY = this.biome.height(c.x, c.z) + bodyScale * 0.5 * sp.scale[1] + 0.05;
      let gy = baseY;
      let pitch = 0;
      let roll = asleep ? 0.42 : 0; // tip over to sleep
      if (flying) {
        const swoop = Math.sin(t * 1.1 + c.id * 0.7); // slow, big elevation changes
        gy = baseY + FLIGHT.altitude + swoop * 1.9 + Math.sin(t * 3.0 + c.id) * 0.25;
        pitch = -Math.cos(t * 1.1 + c.id * 0.7) * 0.38; // nose up climbing, down diving
        let dh = c.heading - rig.lastHeading; // bank into turns
        dh = ((dh + Math.PI) % (Math.PI * 2)) - Math.PI; if (dh < -Math.PI) dh += Math.PI * 2;
        roll = Math.max(-0.6, Math.min(0.6, dh * 9));
      } else if (asleep) {
        gy = baseY + Math.sin(t * 1.0 + c.id) * 0.03 * c.genome.size;
      } else {
        // species locomotion: a gentle bob, an optional springy hop, and a side-to-side wobble
        const m = sp.bob;
        const ph = t * (m.freq + c.genome.speed * 0.25) + c.id;
        const hop = m.hop > 0 ? Math.abs(Math.sin(ph)) * m.hop * (0.6 + 0.4 * c.genome.size) : 0;
        gy = baseY + Math.sin(ph) * m.amp * c.genome.size + hop;
        roll += Math.sin(ph * 0.5) * m.wobble;
      }
      rig.lastHeading = c.heading;

      // cartoon pounce: predators stretch forward + squash + hop mid-dart, then punch-scale on a kill
      let sx = sp.scale[0], sy = sp.scale[1], sz = sp.scale[2];
      if (pred && c.lungeTimer > 0) {
        const k = Math.sin((c.lungeTimer / PRED.lungeDuration) * Math.PI); // 0 → 1 → 0
        sx = sp.scale[0] * (1 + 0.5 * k); // stretch along travel (local +x = forward)
        sy = sp.scale[1] * (1 - 0.28 * k); // flatten down
        sz = sp.scale[2] * (1 - 0.12 * k);
        gy += k * 0.6;               // a springy pounce arc
        pitch += 0.42 * k;           // lean into the dive
      }
      if (pred && c.justKilled > 0) {
        const punch = 1 + 0.38 * Math.sin((c.justKilled / 0.4) * Math.PI); // pop, then settle
        sx *= punch; sy *= punch; sz *= punch;
      }
      if (!pred && c.startleTimer > 0 && !asleep) {
        const s = c.startleTimer / PRED.startleTime; // 1 → 0
        gy += Math.abs(Math.sin(s * Math.PI * 4)) * 0.35 * s; // quick panicked hops, fading out
      }
      if (!pred && c.drinkTimer > 0 && !asleep) { pitch += 0.55; gy -= 0.04; } // head dipped to drink
      g.position.set(c.x, gy, c.z);
      g.scale.set(bodyScale * sx, bodyScale * sy, bodyScale * sz);
      g.rotation.set(pitch, -c.heading, roll);
      rig.zzz.visible = asleep;
      if (asleep) rig.zzz.position.y = 1.2 + Math.sin(t * 2 + c.id) * 0.12;
      // startled prey flash a bobbing "!" above their head
      const startled = !pred && c.startleTimer > 0 && !asleep;
      rig.alarm.visible = startled;
      if (startled) {
        const pulse = 0.85 + Math.sin(t * 22 + c.id) * 0.18;
        rig.alarm.scale.set(0.9 * pulse, 0.9 * pulse, 1);
        rig.alarm.position.y = 1.35 + Math.sin(t * 10 + c.id) * 0.08;
      }

      const vigor = Math.max(0.06, Math.min(1, c.energy / c.maxEnergy));
      const lineageHue = (c.genome.clan * 0.61803) % 1; // golden-ratio hash → spread-out family colors
      if (pred && !params.colorByLineage) {
        rig.mat.color.setHSL(0.015, 0.72, 0.5); // menacing red carnivore
        rig.mat.emissive.setHSL(0.02, 0.9, 0.18 * vigor);
      } else {
        const hue = params.colorByLineage ? lineageHue : c.genome.hue;
        rig.mat.color.setHSL(hue, 0.55, 0.68);
        rig.mat.emissive.setHSL(hue, 0.7, 0.14 * vigor);
      }
      // bioluminescence: a high-glow critter shimmers at night, tinted to its own colour
      const night = 1 - (this.lastSky ? this.lastSky.dayFactor : 1);
      const glowGene = c.genome.glow ?? 0;
      if (glowGene > 0.1 && night > 0.05) {
        const shimmer = 0.55 + 0.25 * Math.sin(t * 2.5 + c.id);
        const ghue = pred && !params.colorByLineage ? 0.02 : params.colorByLineage ? lineageHue : c.genome.hue;
        rig.mat.emissive.setHSL(ghue, 0.85, Math.min(0.62, 0.14 * vigor + glowGene * night * 0.7 * shimmer));
      }

      rig.earRound[0]!.visible = rig.earRound[1]!.visible = earType === 0;
      rig.earPointy[0]!.visible = rig.earPointy[1]!.visible = earType === 1;
      for (const a of rig.antenna) a.visible = earType === 2;
      rig.tail.visible = hasTail;
      rig.mouth.scale.set(pred ? 1.1 : 0.7, pred ? 0.85 : 0.5, pred ? 1.9 : 1.4);
      rig.outline.material = pred ? this.redOutlineMat : this.outlineMat; // predators always red-rimmed

      // wings: visible + flapping only for flyers
      rig.wings[0]!.visible = rig.wings[1]!.visible = flying;
      if (flying) {
        const flap = 0.35 + Math.sin(t * 16 + c.id) * 0.75; // bigger, faster wingbeats
        rig.wings[0]!.rotation.z = flap;
        rig.wings[1]!.rotation.z = -flap;
      }

      // big cute eyes that blink; closed when asleep; narrower for predators
      const blink = Math.sin(t * 3 + c.id * 1.7) > 0.97 ? 0.12 : 1;
      const eyeY = (pred ? 0.62 : 1) * (asleep ? 0.06 : 1);
      for (const e of rig.eyes) e.scale.set(eyeScale, eyeScale * blink * eyeY, eyeScale);

      // a freshly-born striking mutant keeps shimmering for a few seconds
      if (c.novelTimer > 0 && Math.random() < dt * 5) {
        this.bursts.emit(c.x, this.biome.height(c.x, c.z) + bodyScale * 0.7, c.z, 0xfff0b0, 2, 1.3);
      }

      // a drinking critter sends ripples across the pond
      if (c.drinkTimer > 0 && Math.random() < dt * 1.5) {
        const pd = this.nearestPondData(c.x, c.z);
        if (pd) {
          const dx = c.x - pd.x, dz = c.z - pd.z, d = Math.hypot(dx, dz) || 1;
          this.ripples.emit(pd.x + (dx / d) * pd.r, this.biome.height(pd.x, pd.z) + 0.08, pd.z + (dz / d) * pd.r);
        }
      }
    }
    for (const [id, g] of this.groups) {
      if (!seen.has(id)) { g.visible = false; this.pool.push(g); this.groups.delete(id); }
    }
    this.waterMat.uniforms.uTime!.value = t;
    for (const L of this.lilies) { // lily pads bob and tilt gently on the water
      L.mesh.position.y = L.baseY + Math.sin(t * 0.8 + L.phase) * 0.04;
      L.mesh.rotation.z = Math.sin(t * 0.5 + L.phase) * 0.06;
    }
    this.syncFood(world);
    this.syncSocial(world);
    this.updateSky(world.age);
    this.syncWeather(world);
    this.updateRainbow(dt);
    this.updateClouds(dt, this.lastSky ? this.lastSky.dayFactor : 1, params.weather);
    this.updateMist(dt, this.lastSky ? this.lastSky.dayFactor : 1);
    this.updateBirds(t, dt, this.lastSky ? this.lastSky.dayFactor : 1);
    this.updateLeaves(t, dt, this.lastSky ? this.lastSky.dayFactor : 1, world.age);
    this.updatePetals(t, dt, this.lastSky ? this.lastSky.dayFactor : 1, world.age);
    this.updateTrees(t);
    this.updateNight(t);

    // birth / death particle bursts
    const ev = world.events;
    const drain = Math.min(ev.length, 40);
    for (let i = 0; i < drain; i++) {
      const e = ev[i]!;
      const y = this.biome.height(e.x, e.z) + 0.6;
      if (e.t === 0) this.bursts.emit(e.x, y, e.z, 0xffd479, 8, 2.2); // birth: rising gold sparkle
      else if (e.t === 2) { // kill impact: a punchy white/orange "POW" star-burst
        this.bursts.emit(e.x, y, e.z, 0xfff2c2, 14, 2.8);
        this.bursts.emit(e.x, y, e.z, 0xff8a3a, 8, 1.6);
      } else if (e.t === 3) { // novelty: a bright magical burst marks a striking new mutant
        this.bursts.emit(e.x, y, e.z, 0xfff0b0, 18, 3.0);
        this.bursts.emit(e.x, y, e.z, 0x9af0ff, 10, 2.0);
      } else this.bursts.emit(e.x, y, e.z, 0x9aa0aa, 7, 0.6); // death: grey poof
    }
    ev.length = 0;
    this.bursts.update(dt);
    this.ripples.update(dt);
  }

  private syncFood(world: World): void {
    const n = Math.min(world.food.length, WORLD.foodMax);
    for (let i = 0; i < n; i++) {
      const f = world.food[i]!;
      this.dummy.position.set(f.x, this.biome.height(f.x, f.z) + 0.26, f.z);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.foodMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.dummy.scale.setScalar(0); this.dummy.updateMatrix();
    for (let i = n; i < WORLD.foodMax; i++) this.foodMesh.setMatrixAt(i, this.dummy.matrix);
    this.foodMesh.instanceMatrix.needsUpdate = true;
  }

  private makeSocialViz(): void {
    this.bondPos = new Float32Array(SOCIAL.maxLinks * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.bondPos, 3));
    geo.setDrawRange(0, 0);
    this.bondLines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x9fe7ff, transparent: true, opacity: 0.22 }),
    );
    this.bondLines.frustumCulled = false;
    this.scene.add(this.bondLines);

    const ring = new THREE.RingGeometry(0.5, 0.64, 22);
    ring.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff0a0, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    });
    this.pulseMesh = new THREE.InstancedMesh(ring, mat, MAX_PULSES);
    this.pulseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pulseMesh.frustumCulled = false;
    this.scene.add(this.pulseMesh);
  }

  /** Draw community bond lines + expanding "found food!" signal rings. */
  private syncSocial(world: World): void {
    const links = world.socialLinks;
    const nLinks = Math.min(SOCIAL.maxLinks, Math.floor(links.length / 4));
    for (let i = 0; i < nLinks; i++) {
      const ax = links[i * 4]!, az = links[i * 4 + 1]!, bx = links[i * 4 + 2]!, bz = links[i * 4 + 3]!;
      const o = i * 6;
      this.bondPos[o] = ax; this.bondPos[o + 1] = this.biome.height(ax, az) + 0.35; this.bondPos[o + 2] = az;
      this.bondPos[o + 3] = bx; this.bondPos[o + 4] = this.biome.height(bx, bz) + 0.35; this.bondPos[o + 5] = bz;
    }
    this.bondLines.geometry.setDrawRange(0, nLinks * 2);
    (this.bondLines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    let p = 0;
    for (const c of world.creatures) {
      if (p >= MAX_PULSES) break;
      if (c.signalTimer <= 0) continue;
      const grow = 1 - c.signalTimer / SOCIAL.signalTime; // 0 just-ate -> 1 fading
      const s = (0.6 + grow * 3.2) * c.genome.size;
      this.pulseDummy.position.set(c.x, this.biome.height(c.x, c.z) + 0.2, c.z);
      this.pulseDummy.scale.set(s, s, s);
      this.pulseDummy.updateMatrix();
      this.pulseMesh.setMatrixAt(p++, this.pulseDummy.matrix);
    }
    this.pulseDummy.scale.set(0, 0, 0); this.pulseDummy.updateMatrix();
    for (let i = p; i < MAX_PULSES; i++) this.pulseMesh.setMatrixAt(i, this.pulseDummy.matrix);
    this.pulseMesh.instanceMatrix.needsUpdate = true;
  }

  private makeWeather(): void {
    const n = 4500;
    this.rainPos = new Float32Array(n * 3);
    const h = WORLD.half;
    for (let i = 0; i < n; i++) {
      this.rainPos[i * 3] = (Math.random() * 2 - 1) * h;
      this.rainPos[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
      this.rainPos[i * 3 + 2] = (Math.random() * 2 - 1) * h;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xaecbe6, size: 0.25, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 44, 8),
      new THREE.MeshBasicMaterial({ color: 0xeaf2ff, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.beam.visible = false;
    this.scene.add(this.beam);
  }

  /** A big rainbow arch (a half-torus) that springs up opposite the sun when a storm clears by day. */
  private makeRainbow(): void {
    const R = WORLD.half * 2.0;
    const geo = new THREE.TorusGeometry(R, R * 0.05, 16, 120, Math.PI); // upper half-ring
    this.rainbowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uOpacity; varying vec2 vUv;
        vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
        void main(){
          float hue = mix(0.0, 0.78, vUv.y);        // red outer edge → violet inner
          vec3 col = hsv2rgb(vec3(hue, 0.85, 1.0));
          float band = 1.0 - smoothstep(0.8, 1.0, abs(vUv.y - 0.5) * 2.0); // soft tube edges
          float ends = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.9, vUv.x); // fade where it meets the ground
          gl_FragColor = vec4(col, uOpacity * band * ends * 0.6);
        }`,
    });
    this.rainbow = new THREE.Mesh(geo, this.rainbowMat);
    this.rainbow.visible = false;
    this.scene.add(this.rainbow);
  }

  /** Spawn / fade the rainbow as storms clear in daylight. */
  private updateRainbow(dt: number): void {
    const w = params.weather;
    const day = this.lastSky ? this.lastSky.dayFactor : 1;
    // a clearing front (was stormy, now easing down) on a bright day → rainbow!
    if (this.prevWeather > 0.5 && w <= 0.5 && day > 0.45 && this.rainbowLife <= 0) {
      this.rainbowLife = Scene3D.RAINBOW_LIFE;
      const d = this.lastSky ? this.lastSky.sunDir : [0.4, 0.6, 0.3];
      this.rainbow.position.set(-d[0] * WORLD.half * 1.6, -WORLD.half * 0.35, -d[2] * WORLD.half * 1.6);
      this.rainbow.lookAt(0, 0, 0);
    }
    this.prevWeather = w;
    if (this.rainbowLife > 0) {
      this.rainbowLife -= dt;
      const e = Scene3D.RAINBOW_LIFE - this.rainbowLife; // elapsed
      const fadeIn = Math.min(1, e / 2.5);
      const fadeOut = Math.min(1, this.rainbowLife / 4);
      this.rainbowMat.uniforms.uOpacity!.value = Math.min(fadeIn, fadeOut) * Math.min(1, day);
      this.rainbow.visible = true;
    } else {
      this.rainbow.visible = false;
    }
  }

  /** Rain, storm darkening, and lightning flashes — all driven by params.weather + world.lightningFlash. */
  private syncWeather(world: World): void {
    const w = params.weather;
    const fog = this.scene.fog as THREE.Fog;
    this.cosmos.setCalm(1 - Math.min(1, w)); // storms wash out the aurora

    const snow = this.biome.snowy; // cold biomes get snow instead of rain
    const showPrecip = w > WEATHER.startAt;
    this.rain.visible = showPrecip;
    if (showPrecip) {
      const fall = snow ? 0.16 + w * 0.45 : 0.7 + w * 1.8; // snow drifts down slowly
      const pos = this.rainPos;
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] -= fall;
        if (snow) pos[i - 1] += Math.sin(pos[i] * 0.12) * 0.05; // gentle sideways flutter
        if (pos[i] < 0) pos[i] += RAIN_HEIGHT;
        if (snow && pos[i - 1] > WORLD.half) pos[i - 1] -= WORLD.half * 2;
        else if (snow && pos[i - 1] < -WORLD.half) pos[i - 1] += WORLD.half * 2;
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      const rm = this.rain.material as THREE.PointsMaterial;
      rm.color.set(snow ? 0xffffff : 0xaecbe6);
      rm.opacity = snow ? 0.5 + w * 0.4 : 0.25 + w * 0.5;
      rm.size = snow ? 0.5 + w * 0.3 : 0.22 + w * 0.2;
    }

    // seasonal foliage colour drifts green -> autumn -> green
    const sp = (world.age / Math.max(1, params.seasonLengthSec)) % 1;
    this.foliageMat.color.copy(FOLIAGE_SUMMER).lerp(FOLIAGE_AUTUMN, (Math.sin(sp * Math.PI * 2) + 1) / 2);
    // blossom in spring (sp≈0), fruit toward the autumn turn — both fade out in deep summer/winter
    const phase = sp * Math.PI * 2;
    const bloom = Math.max(0, Math.cos(phase));
    const fruit = Math.max(0, Math.sin(phase));
    const df = this.lastSky ? this.lastSky.dayFactor : 1;
    this.accentMat.opacity = Math.max(bloom, fruit) * 0.8 * (0.4 + 0.55 * df);
    this.accentMat.color.copy(BLOSSOM_PINK).lerp(FRUIT_RED, fruit / (bloom + fruit + 0.001));

    const storm = Math.min(1, w);
    fog.far = WORLD.half * (3.4 - storm * 1.9);
    if (storm > 0.05) {
      fog.color.lerp(STORM, storm * 0.7);
      (this.skyMat.uniforms.uTop!.value as THREE.Color).lerp(STORM, storm * 0.7);
      (this.skyMat.uniforms.uBottom!.value as THREE.Color).lerp(STORM, storm * 0.55);
      this.sun.intensity *= 1 - storm * 0.6;
    }

    if (world.lightningFlash > 0) {
      const f = Math.min(1, world.lightningFlash / 0.35);
      this.hemi.intensity += f * 2.6;
      fog.color.lerp(FLASH, f * 0.6);
      this.beam.visible = true;
      this.beam.position.set(world.lightningX, this.biome.height(world.lightningX, world.lightningZ) + 22, world.lightningZ);
      (this.beam.material as THREE.MeshBasicMaterial).opacity = f;
    } else {
      this.beam.visible = false;
    }
  }

  private makeNameTag(): void {
    this.nameCanvas.width = 256; this.nameCanvas.height = 64;
    this.nameTex = new THREE.CanvasTexture(this.nameCanvas);
    const mat = new THREE.SpriteMaterial({ map: this.nameTex, transparent: true, depthWrite: false, depthTest: false });
    this.nameSprite = new THREE.Sprite(mat);
    this.nameSprite.scale.set(7, 1.75, 1);
    this.nameSprite.renderOrder = 999;
    this.nameSprite.visible = false;
    this.scene.add(this.nameSprite);
  }

  private drawName(name: string): void {
    const c = this.nameCanvas;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    x.font = 'bold 34px ui-sans-serif, system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(name, 128, 34);
    x.fillStyle = '#ffe9a8'; x.fillText(name, 128, 34);
    this.nameTex.needsUpdate = true;
  }

  private makeWater(): void {
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uOpacity: { value: 0.85 },
        uDeep: { value: new THREE.Color(0x183b6e) }, uShallow: { value: new THREE.Color(0x4aa6d6) },
        uSky: { value: new THREE.Color(0xbfe0ff) }, uSun: { value: new THREE.Color(0xfff2d0) },
      },
      vertexShader: `varying vec2 vUv; varying vec2 vW;
        void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform float uOpacity; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSun;
        varying vec2 vUv; varying vec2 vW;
        void main(){
          float d = distance(vUv, vec2(0.5)) * 2.0; // 0 centre .. 1 rim
          float r = sin(vW.x * 0.6 + uTime * 1.3) * 0.5 + sin(vW.y * 0.7 - uTime * 1.05) * 0.5;
          float spark = smoothstep(0.72, 1.0, r) * (1.0 - d);
          vec3 col = mix(uDeep, uShallow, d);
          // sky reflection: stronger toward the rim (grazing angle), like a real water surface
          float fres = mix(0.16, 0.72, pow(d, 1.5));
          col = mix(col, uSky, fres);
          // a broad sun glint streak drifting with the ripples
          float glint = smoothstep(0.84, 1.0, sin(vW.y * 0.5 + uTime * 0.6) * 0.5 + r * 0.5) * (1.0 - d) * 0.85;
          col += uSun * glint + spark * 0.4;
          float a = uOpacity * (1.0 - smoothstep(0.82, 1.0, d));
          gl_FragColor = vec4(col, a);
        }`,
    });
  }

  private nearestPondData(x: number, z: number): { x: number; z: number; r: number } | null {
    let best = Infinity, found: { x: number; z: number; r: number } | null = null;
    for (const p of this.pondData) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; found = p; } }
    return found;
  }

  /** Provide the world's pond positions; lays flat shimmering water discs into the basins. */
  setPonds(ponds: { x: number; z: number; r: number }[]): void {
    this.pondData = ponds;
    this.buildPonds();
  }

  private buildPonds(): void {
    this.pondGroup.clear();
    this.lilies = [];
    this.fish = [];
    if (!this.fishMats.length) {
      this.fishMats = [0xd9824a, 0xc8ccd2, 0x5b86a6].map((c) => new THREE.MeshToonMaterial({ gradientMap: this.toonGrad, color: c }));
    }
    for (const p of this.pondData) {
      const waterY = this.biome.height(p.x, p.z) + 0.06;
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40), this.waterMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, waterY, p.z);
      this.pondGroup.add(mesh);

      // a few fish circling and darting just below the surface
      const nFish = 1 + Math.floor(p.r * 0.5);
      for (let k = 0; k < nFish; k++) {
        const fm = new THREE.Mesh(this.fishGeo, this.fishMats[Math.floor(Math.random() * this.fishMats.length)]!);
        fm.scale.set(0.18, 0.12, 0.42);
        this.pondGroup.add(fm);
        this.fish.push({
          mesh: fm, cx: p.x, cz: p.z, r: p.r * (0.3 + Math.random() * 0.45),
          ang: Math.random() * Math.PI * 2, speed: (0.3 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1),
          y: waterY - 0.14, phase: Math.random() * Math.PI * 2, dart: 1 + Math.random() * 3,
        });
      }

      // a few floating lily pads, scattered within the pond
      const pads = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < pads; k++) {
        const pr = p.r * 0.7 * Math.sqrt(Math.random());
        const pa = Math.random() * Math.PI * 2;
        const pad = new THREE.Mesh(new THREE.CircleGeometry(0.55 + Math.random() * 0.65, 14), this.lilyMat);
        pad.rotation.x = -Math.PI / 2;
        const y = waterY + 0.05;
        pad.position.set(p.x + Math.cos(pa) * pr, y, p.z + Math.sin(pa) * pr);
        this.pondGroup.add(pad);
        this.lilies.push({ mesh: pad, baseY: y, phase: Math.random() * Math.PI * 2 });
      }
    }
  }

  /** Swim the pond fish in lazy circles, with occasional darts, facing their direction of travel. */
  private updateFish(t: number): void {
    const dt = this.lastDt;
    for (const f of this.fish) {
      f.dart -= dt;
      if (f.dart <= 0) { f.dart = 2 + Math.random() * 4; f.speed = (0.3 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -1); }
      f.ang += f.speed * dt;
      const rad = f.r * (0.92 + Math.sin(t * 0.6 + f.phase) * 0.08);
      f.mesh.position.set(f.cx + Math.cos(f.ang) * rad, f.y + Math.sin(t * 1.5 + f.phase) * 0.03, f.cz + Math.sin(f.ang) * rad);
      const s = Math.sign(f.speed);
      f.mesh.rotation.y = Math.atan2(-Math.sin(f.ang) * s, Math.cos(f.ang) * s); // face the tangent
    }
  }

  /** A soft sun-disc with radiating streaks, for the dawn/dusk god-ray glare. */
  private sunRayTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d')!;
    x.translate(128, 128);
    const core = x.createRadialGradient(0, 0, 0, 0, 0, 128);
    core.addColorStop(0, 'rgba(255,247,224,0.5)');
    core.addColorStop(0.2, 'rgba(255,240,200,0.12)');
    core.addColorStop(1, 'rgba(255,240,200,0)');
    x.fillStyle = core; x.beginPath(); x.arc(0, 0, 128, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.12;
      const len = 88 + Math.random() * 40;
      const g = x.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      g.addColorStop(0, 'rgba(255,245,210,0.5)');
      g.addColorStop(1, 'rgba(255,245,210,0)');
      x.strokeStyle = g; x.lineWidth = 2 + Math.random() * 4;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * len, Math.sin(a) * len); x.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true; return tex;
  }

  private makeSunShafts(): void {
    const mat = new THREE.SpriteMaterial({
      map: this.sunRayTexture(), transparent: true, opacity: 0, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    this.sunShafts = new THREE.Sprite(mat);
    this.sunShafts.scale.setScalar(WORLD.half * 1.6);
    this.scene.add(this.sunShafts);
  }

  /** Anchor the sun-shaft glare at the sun and fade it in when the sun is low and the sky is clear. */
  private updateSunShafts(): void {
    if (!this.sunShafts || !this.lastSky) return;
    const d = this.lastSky.sunDir;
    const cam = this.camera.position;
    const dist = WORLD.half * 1.5;
    this.sunShafts.position.set(cam.x + d[0] * dist, cam.y + d[1] * dist, cam.z + d[2] * dist);
    const low = Math.max(0, 1 - d[1] * 2.0); // strongest near the horizon (dawn / dusk)
    const clear = 1 - Math.min(1, params.weather * 1.4);
    const mat = this.sunShafts.material as THREE.SpriteMaterial;
    mat.opacity = low * this.lastSky.dayFactor * clear * 0.55;
    this.sunShafts.visible = mat.opacity > 0.01;
  }

  /** A small pool of speech-bubble sprites for critter chatter. */
  private makeBubbles(): void {
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 150;
      const tex = new THREE.CanvasTexture(c);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      sp.scale.set(8, 4.7, 1); sp.renderOrder = 1000; sp.visible = false;
      this.scene.add(sp);
      this.bubbleSprites.push(sp); this.bubbleCanvas.push(c); this.bubbleTex.push(tex); this.bubbleText.push('');
    }
  }

  private drawBubble(i: number, text: string): void {
    const cv = this.bubbleCanvas[i]!; const x = cv.getContext('2d')!;
    x.clearRect(0, 0, cv.width, cv.height);
    x.fillStyle = 'rgba(15,20,30,0.85)'; x.strokeStyle = 'rgba(255,255,255,0.28)'; x.lineWidth = 3;
    roundRectPath(x, 12, 10, 232, 96, 20); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(112, 104); x.lineTo(128, 132); x.lineTo(144, 104); x.closePath(); x.fill(); // tail
    x.fillStyle = '#eaf2ff'; x.font = '600 27px ui-sans-serif, system-ui, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const lines = wrapLines(x, text, 208);
    const y0 = 58 - (lines.length - 1) * 16;
    lines.forEach((ln, k) => x.fillText(ln, 128, y0 + k * 32));
    this.bubbleTex[i]!.needsUpdate = true;
  }

  /** Position a speech bubble over each talking creature (built once, redrawn only when the text changes). */
  syncBubbles(world: World, dialogs: { id: number; text: string }[]): void {
    for (let i = 0; i < this.bubbleSprites.length; i++) {
      const sp = this.bubbleSprites[i]!;
      const d = dialogs[i];
      const c = d ? world.creatures.find((x) => x.id === d.id) : undefined;
      if (!d || !c) { sp.visible = false; continue; }
      if (this.bubbleText[i] !== d.text) { this.drawBubble(i, d.text); this.bubbleText[i] = d.text; }
      const y = this.biome.height(c.x, c.z) + c.genome.size * 1.9 + (c.canFly ? FLIGHT.altitude : 0) + 1.9;
      sp.position.set(c.x, y, c.z);
      sp.visible = true;
    }
  }

  /** Provide the world's shelter-tree positions; builds the tree meshes on the terrain. */
  setTrees(trees: { x: number; z: number }[]): void {
    this.treePositions = trees;
    this.buildTrees();
  }

  buildTrees(): void {
    for (const geo of this.treeAccentGeos) geo.dispose(); // per-tree accent clouds are the only per-tree geo
    this.treeAccentGeos = [];
    this.treeGroup.clear();
    this.treeSway = [];
    this.glowMats = [];
    const glowHues = [0.5, 0.78, 0.33, 0.95];
    for (const t of this.treePositions) {
      const y = this.biome.height(t.x, t.z);
      const tree = this.makeTree();
      const lean = (Math.random() * 2 - 1) * 0.06;
      tree.position.set(t.x, y, t.z);
      tree.rotation.y = Math.random() * Math.PI * 2; // face a random way
      tree.rotation.z = lean;
      this.treeGroup.add(tree);
      this.treeSway.push({ grp: tree, rx: 0, rz: lean, phase: Math.random() * Math.PI * 2, amp: 0.5 + Math.random() * 0.6 });

      // a cluster of little mushrooms at the base that glow softly after dark
      const shrooms = Math.floor(Math.random() * 3);
      for (let k = 0; k < shrooms; k++) {
        const ang = Math.random() * Math.PI * 2, dist = 1.2 + Math.random() * 1.6;
        const mx = t.x + Math.cos(ang) * dist, mz = t.z + Math.sin(ang) * dist, my = this.biome.height(mx, mz);
        const stem = new THREE.Mesh(this.shroomStemGeo, this.trunkMat);
        stem.position.set(mx, my + 0.2, mz);
        const capMat = new THREE.MeshToonMaterial({ gradientMap: this.toonGrad, color: 0xcfd6e0 });
        capMat.emissive = new THREE.Color().setHSL(glowHues[Math.floor(Math.random() * glowHues.length)]!, 0.8, 0.55);
        capMat.emissiveIntensity = 0;
        const cap = new THREE.Mesh(this.shroomCapGeo, capMat);
        cap.position.set(mx, my + 0.42, mz); cap.scale.set(1, 0.7, 1);
        this.treeGroup.add(stem, cap);
        this.glowMats.push(capMat);
      }
    }
  }

  /**
   * Build one randomized tree as a group whose base sits at the local origin: a tapered trunk of
   * random height/girth, a few angled branches each tipped with a leaf tuft, and either a cluster of
   * rounded canopy blobs (broadleaf) or stacked cones (conifer). Parts share scaled geometry + the
   * seasonal foliage material, so trees stay cheap and still drift green->autumn together.
   */
  private makeTree(): THREE.Group {
    const g = new THREE.Group();
    const conifer = Math.random() < 0.28;
    const th = (conifer ? 3.2 : 3.0) + Math.random() * (conifer ? 2.6 : 3.2); // trunk height
    const tr = 0.32 + Math.random() * 0.34; // trunk radius

    const trunk = new THREE.Mesh(this.trunkGeo, this.trunkMat);
    trunk.scale.set(tr, th, tr);
    trunk.castShadow = true;
    g.add(trunk);

    // a few limbs forking out from the trunk, each ending in a leaf clump — visible below the crown
    const branches = conifer ? 0 : 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < branches; i++) {
      const yaw = new THREE.Group();
      yaw.position.y = th * (0.42 + Math.random() * 0.32);
      yaw.rotation.y = (i / branches) * Math.PI * 2 + Math.random() * 0.8; // fan around the trunk
      const limb = new THREE.Group();
      limb.rotation.z = 0.7 + Math.random() * 0.5; // angle well out so it clears the crown
      const len = 1.6 + Math.random() * 1.8;
      const br = new THREE.Mesh(this.branchGeo, this.trunkMat);
      br.scale.set(tr * (0.4 + Math.random() * 0.22), len, tr * 0.4);
      br.castShadow = true;
      limb.add(br);
      const tuft = new THREE.Mesh(this.foliageGeo, this.foliageMat);
      tuft.scale.setScalar((0.6 + Math.random() * 0.55) / 2.5);
      tuft.position.y = len * (0.92 + Math.random() * 0.1); // sit at the limb tip, leaving woody branch visible
      tuft.castShadow = true;
      limb.add(tuft);
      yaw.add(limb);
      g.add(yaw);
    }

    if (conifer) {
      const tiers = 3 + Math.floor(Math.random() * 2);
      const spread = 1.6 + Math.random() * 0.8;
      for (let i = 0; i < tiers; i++) {
        const f = i / tiers;
        const cone = new THREE.Mesh(this.coneGeo, this.foliageMat);
        const r = spread * (1 - f * 0.55);
        cone.scale.set(r, 1.6 + Math.random() * 0.4, r);
        cone.position.y = th * 0.45 + f * th * 0.6;
        cone.castShadow = true;
        g.add(cone);
      }
    } else {
      // a modest crown of 1-2 blobs sitting above the limbs (small enough that the branches read)
      const blobs = 1 + Math.floor(Math.random() * 2);
      const canopyR = 1.4 + Math.random() * 1.0;
      for (let i = 0; i < blobs; i++) {
        const blob = new THREE.Mesh(this.foliageGeo, this.foliageMat);
        blob.scale.setScalar((canopyR * (0.7 + Math.random() * 0.5)) / 2.5);
        const spread = i === 0 ? 0 : 1; // first blob caps the trunk; the rest scatter around it
        blob.position.set(
          (Math.random() * 2 - 1) * canopyR * 0.7 * spread,
          th + canopyR * 0.25 + (Math.random() * 2 - 1) * 0.5 * spread,
          (Math.random() * 2 - 1) * canopyR * 0.7 * spread,
        );
        blob.castShadow = true;
        g.add(blob);
      }
      // seasonal blossom/fruit accents scattered through the crown (colour animated by season)
      if (Math.random() < 0.72) {
        const n = 8 + Math.floor(Math.random() * 9);
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const rr = canopyR * (0.5 + Math.random() * 0.6);
          const a = Math.random() * Math.PI * 2;
          const b = Math.acos(Math.random() * 2 - 1);
          arr[i * 3] = Math.sin(b) * Math.cos(a) * rr;
          arr[i * 3 + 1] = th + canopyR * 0.2 + Math.cos(b) * rr * 0.7;
          arr[i * 3 + 2] = Math.sin(b) * Math.sin(a) * rr;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        this.treeAccentGeos.push(geo);
        const pts = new THREE.Points(geo, this.accentMat);
        pts.frustumCulled = false;
        g.add(pts);
      }
    }
    return g;
  }

  /** Sway each whole tree from its base on the breeze — gentle when calm, whipping in a storm. */
  private updateTrees(t: number): void {
    const wind = 0.04 + params.weather * 0.10;
    for (const s of this.treeSway) {
      const w = wind * s.amp;
      s.grp.rotation.z = s.rz + Math.sin(t * 0.8 + s.phase) * w;
      s.grp.rotation.x = s.rx + Math.cos(t * 0.6 + s.phase) * w * 0.7;
    }
  }

  private updateSky(simTime: number): void {
    this.lastAge = simTime;
    const s = this.biome.sky(simTime);
    (this.skyMat.uniforms.uTop!.value as THREE.Color).copy(toVec3(s.top));
    (this.skyMat.uniforms.uBottom!.value as THREE.Color).copy(toVec3(s.bottom));
    (this.scene.fog as THREE.Fog).color.copy(toVec3(s.fog));
    const dist = WORLD.half * 1.6;
    this.sun.position.set(s.sunDir[0] * dist, s.sunDir[1] * dist, s.sunDir[2] * dist);
    this.sun.color.copy(toVec3(s.sunColor));
    this.sun.intensity = s.sunIntensity;
    this.hemi.intensity = s.ambIntensity;
    this.cosmos.setNight(s.starAlpha);
    // roll a fresh aurora each nightfall — most nights none/faint, occasionally a real show
    const isNight = s.starAlpha > 0.5;
    if (isNight && !this.prevNightForAurora) {
      const r = Math.random();
      const strength = r < 0.45 ? 0 : r < 0.8 ? 0.2 + Math.random() * 0.25 : 0.55 + Math.random() * 0.45;
      this.cosmos.setAuroraStrength(strength);
      // a rare blood moon: the moon runs deep red for the night
      this.bloodMoon = Math.random() < 0.09;
      (this.moonMat.uniforms.uTint!.value as THREE.Color).setHSL(this.bloodMoon ? 0.0 : 0.6, this.bloodMoon ? 0.85 : 0.0, this.bloodMoon ? 0.5 : 1.0);
      if (this.bloodMoon) this.onBloodMoon();
    }
    this.prevNightForAurora = isNight;
    // water reflects the sky colour + dims at night
    (this.waterMat.uniforms.uSky!.value as THREE.Color).copy(toVec3(s.bottom));
    (this.waterMat.uniforms.uSun!.value as THREE.Color).copy(toVec3(s.sunColor));
    this.waterMat.uniforms.uOpacity!.value = 0.5 + 0.4 * s.dayFactor;
    this.lastSky = s;
  }

  private makeNight(): void {
    const n = 280;
    const base = new Float32Array(n * 3);
    const h = WORLD.half;
    for (let i = 0; i < n; i++) {
      base[i * 3] = (Math.random() * 2 - 1) * h;
      base[i * 3 + 1] = 1 + Math.random() * 8;
      base[i * 3 + 2] = (Math.random() * 2 - 1) * h;
    }
    this.fireflyBase = base;
    this.fireflyCur = base.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.fireflyCur, 3));
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xfff2a0, size: 1.0, map: this.softDotTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);

    // a moon that waxes and wanes — a shader terminator sweeps across the disk with the phase
    this.moonMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uPhase: { value: 0 }, uOpacity: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uPhase; uniform float uOpacity; uniform vec3 uTint; varying vec3 vN;
        void main(){
          // light direction sweeps around the moon as the phase advances (view space)
          float a = uPhase * 6.28318;
          vec3 L = vec3(sin(a), 0.0, -cos(a));
          float lit = smoothstep(-0.12, 0.12, dot(normalize(vN), L));
          vec3 day = vec3(0.93, 0.94, 1.0);
          vec3 night = vec3(0.06, 0.07, 0.12); // faint earthshine on the dark limb
          vec3 col = mix(night, day, lit) * uTint;
          float a2 = uOpacity * (0.18 + 0.82 * lit);
          gl_FragColor = vec4(col, a2);
        }`,
    });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(7, 32, 32), this.moonMat);
    this.scene.add(this.moon);

    // daytime motes (drifting pollen / tiny insects) — sparse + soft so they don't speckle the meadow
    const m = 80;
    const mb = new Float32Array(m * 3);
    for (let i = 0; i < m; i++) {
      mb[i * 3] = (Math.random() * 2 - 1) * WORLD.half;
      mb[i * 3 + 1] = 2 + Math.random() * 10;
      mb[i * 3 + 2] = (Math.random() * 2 - 1) * WORLD.half;
    }
    this.motesBase = mb;
    this.motesCur = mb.slice();
    const mgeo = new THREE.BufferGeometry();
    mgeo.setAttribute('position', new THREE.BufferAttribute(this.motesCur, 3));
    this.motes = new THREE.Points(mgeo, new THREE.PointsMaterial({
      color: 0xfff6d0, size: 0.7, map: this.softDotTex, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  /** A pair-of-wings texture (white, so the sprite's colour tints it). */
  private butterflyTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = '#ffffff';
    const wing = (cx: number, cy: number, rx: number, ry: number): void => { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill(); };
    wing(24, 26, 12, 15); wing(40, 26, 12, 15);   // upper wings
    wing(26, 42, 9, 11); wing(38, 42, 9, 11);     // lower wings
    x.fillStyle = '#2a2030'; x.fillRect(31, 20, 2, 30); // body
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
    return tex;
  }

  /** Scattered butterflies that flutter low over the meadow by day and vanish at night. */
  private makeButterflies(): void {
    const tex = this.butterflyTexture();
    const hues = [0.08, 0.14, 0.55, 0.78, 0.95, 0.0];
    const col = new THREE.Color();
    for (let i = 0; i < 26; i++) {
      col.setHSL(hues[i % hues.length]!, 0.7, 0.62);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col.clone(), transparent: true, depthWrite: false, opacity: 0 }));
      sp.scale.set(1.2, 1.2, 1);
      this.scene.add(sp);
      this.butterflies.push({
        sp, bx: (Math.random() * 2 - 1) * WORLD.half * 0.9, bz: (Math.random() * 2 - 1) * WORLD.half * 0.9,
        phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.6,
      });
    }
  }

  private updateButterflies(t: number, day: number): void {
    const show = day > 0.15;
    for (const b of this.butterflies) {
      b.sp.visible = show;
      if (!show) continue;
      // slow looping wander around the drifting base point
      b.bx += Math.cos(t * 0.3 + b.phase) * b.speed * 0.05;
      b.bz += Math.sin(t * 0.27 + b.phase * 1.3) * b.speed * 0.05;
      const x = b.bx + Math.sin(t * b.speed * 1.6 + b.phase) * 3;
      const z = b.bz + Math.cos(t * b.speed * 1.4 + b.phase) * 3;
      const y = this.biome.height(x, z) + 2 + Math.sin(t * 3 + b.phase) * 0.8; // bobbing flutter
      b.sp.position.set(x, y, z);
      const flap = 0.6 + Math.abs(Math.sin(t * 12 + b.phase)) * 0.7; // wing-flap squash
      b.sp.scale.set(1.2 * flap, 1.2, 1);
      (b.sp.material as THREE.SpriteMaterial).opacity = day * 0.95;
    }
  }

  /** A small tilted leaf shape (white, so per-leaf colour tints it). */
  private leafTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d')!;
    x.fillStyle = '#ffffff';
    x.beginPath(); x.ellipse(16, 16, 6, 11, Math.PI / 5, 0, Math.PI * 2); x.fill();
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  /** Autumn leaves that drift down (only when the season turns the foliage brown). */
  private makeLeaves(): void {
    const n = 150;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.leafSpeed = new Float32Array(n);
    const c = new THREE.Color();
    const H = WORLD.half - 3;
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * 2 - 1) * H, z = (Math.random() * 2 - 1) * H;
      pos[i * 3] = x; pos[i * 3 + 1] = this.biome.height(x, z) + 1 + Math.random() * 9; pos[i * 3 + 2] = z;
      this.leafSpeed[i] = 2.4 + Math.random() * 3;
      c.setHSL(0.03 + Math.random() * 0.07, 0.7, 0.45 + Math.random() * 0.15); // autumn reds / ambers
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.leaves = new THREE.Points(geo, new THREE.PointsMaterial({
      map: this.leafTexture(), size: 0.7, vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.leaves.frustumCulled = false;
    this.scene.add(this.leaves);
  }

  /** Pink blossom petals that drift down in spring — the bright counterpart to the autumn leaves. */
  private makePetals(): void {
    const n = 140;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.petalSpeed = new Float32Array(n);
    const c = new THREE.Color();
    const H = WORLD.half - 3;
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * 2 - 1) * H, z = (Math.random() * 2 - 1) * H;
      pos[i * 3] = x; pos[i * 3 + 1] = this.biome.height(x, z) + 1 + Math.random() * 9; pos[i * 3 + 2] = z;
      this.petalSpeed[i] = 1.2 + Math.random() * 1.6; // gentler than leaves
      c.setHSL(0.93 + Math.random() * 0.05, 0.45 + Math.random() * 0.2, 0.82); // soft pink / blossom-white
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.petals = new THREE.Points(geo, new THREE.PointsMaterial({
      map: this.leafTexture(), size: 0.6, vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
    }));
    this.petals.frustumCulled = false;
    this.scene.add(this.petals);
  }

  /** Drift the petals; visible in spring (when the trees are in blossom). */
  private updatePetals(t: number, dt: number, day: number, age: number): void {
    const bloom = Math.max(0, Math.cos((age / Math.max(1, params.seasonLengthSec)) % 1 * Math.PI * 2)); // peaks in spring
    const op = bloom * day * 0.7;
    this.petals.visible = op > 0.02;
    (this.petals.material as THREE.PointsMaterial).opacity = op;
    if (!this.petals.visible) return;
    const pos = this.petals.geometry.getAttribute('position') as THREE.BufferAttribute;
    const H = WORLD.half - 3;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) + Math.sin(t * 1.2 + i) * 0.08; // a lazy flutter
      const z = pos.getZ(i) + Math.cos(t * 0.9 + i * 0.7) * 0.06;
      let y = pos.getY(i) - this.petalSpeed[i]! * dt;
      if (y < this.biome.height(x, z) + 0.2) {
        x = (Math.random() * 2 - 1) * H; y = this.biome.height(x, z) + 7 + Math.random() * 5;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  /** Fall + flutter the leaves, recycling them to the canopy; visible only deep in autumn. */
  private updateLeaves(t: number, dt: number, day: number, age: number): void {
    const autumn = (Math.sin((age / Math.max(1, params.seasonLengthSec)) % 1 * Math.PI * 2) + 1) / 2;
    const op = Math.max(0, (autumn - 0.3) / 0.7) * day * 0.9;
    this.leaves.visible = op > 0.02;
    (this.leaves.material as THREE.PointsMaterial).opacity = op;
    if (!this.leaves.visible) return;
    const pos = this.leaves.geometry.getAttribute('position') as THREE.BufferAttribute;
    const H = WORLD.half - 3;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) + Math.sin(t * 1.5 + i) * 0.06; // flutter
      let z = pos.getZ(i) + Math.cos(t * 1.2 + i * 0.7) * 0.04;
      let y = pos.getY(i) - this.leafSpeed[i]! * dt;
      if (y < this.biome.height(x, z) + 0.2) { // landed → drift down again from the canopy
        x = (Math.random() * 2 - 1) * H; z = (Math.random() * 2 - 1) * H;
        y = this.biome.height(x, z) + 7 + Math.random() * 5;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  /** A simple 5-petal flower (white petals + yellow heart) for the meadow. */
  private flowerTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d')!;
    x.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      x.beginPath(); x.ellipse(16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, 5, 5, 0, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = '#ffd24a'; x.beginPath(); x.arc(16, 16, 4.5, 0, Math.PI * 2); x.fill();
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  /** Scatter soft wildflowers across the meadow (rebuilt to match new terrain). */
  private makeFlowers(): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.flowerCount * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.flowerCount * 3), 3));
    this.flowers = new THREE.Points(geo, new THREE.PointsMaterial({
      map: this.flowerTexture(), size: 0.95, vertexColors: true, transparent: true,
      opacity: 0.9, depthWrite: true, alphaTest: 0.45, fog: true,
    }));
    this.flowers.frustumCulled = false;
    this.scene.add(this.flowers);
    this.fillFlowers();
  }

  private fillFlowers(): void {
    if (!this.flowers) return;
    const pos = this.flowers.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.flowers.geometry.getAttribute('color') as THREE.BufferAttribute;
    const hues = [0.0, 0.07, 0.13, 0.55, 0.78, 0.92]; // red, orange, yellow, blue, violet, pink
    const c = new THREE.Color();
    const h = WORLD.half - 3;
    for (let i = 0; i < this.flowerCount; i++) {
      const x = (Math.random() * 2 - 1) * h, z = (Math.random() * 2 - 1) * h;
      pos.setXYZ(i, x, this.biome.height(x, z) + 0.35, z);
      c.setHSL(hues[Math.floor(Math.random() * hues.length)]!, 0.68, 0.72);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }

  /** A soft white puff texture for cloud billboards. */
  private cloudTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    for (let i = 0; i < 16; i++) {
      const cx = 64 + (Math.random() - 0.5) * 72, cy = 60 + (Math.random() - 0.5) * 44, r = 18 + Math.random() * 30;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.20)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  /** A soft dark disc texture for the cloud shadow on the ground. */
  private softShadowTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  /** Big soft clouds that drift overhead and cast travelling shadows on the meadow (daytime). */
  private makeClouds(): void {
    const tex = this.cloudTexture();
    const shadowTex = this.softShadowTexture();
    const W = WORLD.half * 1.4;
    for (let i = 0; i < 9; i++) {
      const scale = 22 + Math.random() * 28;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xf4f8ff, transparent: true, depthWrite: false, opacity: 0 }));
      sprite.scale.set(scale, scale * 0.58, 1);
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(scale * 0.42, 24),
        new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x000000, transparent: true, depthWrite: false, opacity: 0 }),
      );
      shadow.rotation.x = -Math.PI / 2;
      this.scene.add(sprite, shadow);
      this.clouds.push({ sprite, shadow, x: (Math.random() * 2 - 1) * W, z: (Math.random() * 2 - 1) * W, speed: 1.4 + Math.random() * 2.2 });
    }
  }

  /** Drift the clouds on the wind; fade them out at night; trail their shadows across the ground. */
  private updateClouds(dt: number, day: number, weather: number): void {
    const W = WORLD.half * 1.4;
    const alt = WORLD.half * 1.1;
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > W) c.x -= 2 * W;
      c.sprite.position.set(c.x, alt, c.z);
      (c.sprite.material as THREE.SpriteMaterial).opacity = day * (0.26 + 0.5 * weather) * 0.85;
      c.sprite.visible = day > 0.08;
      const overArena = Math.abs(c.x) < WORLD.half && Math.abs(c.z) < WORLD.half;
      c.shadow.visible = overArena && day > 0.25;
      if (c.shadow.visible) {
        c.shadow.position.set(c.x, this.biome.height(c.x, c.z) + 0.2, c.z);
        (c.shadow.material as THREE.MeshBasicMaterial).opacity = day * 0.16 * (1 - weather * 0.5);
      }
    }
  }

  /** A small dark gull silhouette (two humps) for distant birds. */
  private birdTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const x = c.getContext('2d')!;
    x.strokeStyle = '#000'; x.lineWidth = 5; x.lineCap = 'round';
    x.beginPath();
    x.moveTo(6, 22); x.quadraticCurveTo(20, 6, 32, 18); x.quadraticCurveTo(44, 6, 58, 22);
    x.stroke();
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  /** Two flocks of birds in loose V-formation, drifting across the sky (seen at dawn/dusk). */
  private makeBirds(): void {
    const tex = this.birdTexture();
    for (let f = 0; f < 2; f++) {
      const group = new THREE.Group();
      const birds: THREE.Sprite[] = [];
      const n = 9 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x232a33, transparent: true, depthWrite: false, opacity: 0, fog: false }));
        sp.scale.set(2.4, 1.2, 1);
        const rank = Math.ceil(i / 2);
        const side = i === 0 ? 0 : (i % 2 === 0 ? 1 : -1);
        sp.position.set(-rank * 2.0, (Math.random() - 0.5) * 0.6, side * rank * 1.7); // V trailing behind the leader
        group.add(sp); birds.push(sp);
      }
      group.position.set((Math.random() * 2 - 1) * WORLD.half, WORLD.half * (0.85 + f * 0.12), (Math.random() * 2 - 1) * WORLD.half);
      this.scene.add(group);
      this.flocks.push({ group, birds, speed: 5 + Math.random() * 3 });
    }
  }

  /** Low banks of mist that gather near dawn and burn off as the sun climbs. */
  private makeMist(): void {
    const tex = this.cloudTexture();
    const W = WORLD.half;
    for (let i = 0; i < 12; i++) {
      const w = 30 + Math.random() * 32;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xdde8f2, transparent: true, depthWrite: false, opacity: 0 }));
      sprite.scale.set(w, w * 0.32, 1);
      this.scene.add(sprite);
      this.mist.push({ sprite, x: (Math.random() * 2 - 1) * W, z: (Math.random() * 2 - 1) * W, speed: 0.6 + Math.random() * 1.2 });
    }
  }

  private updateMist(dt: number, day: number): void {
    const band = Math.max(0, 1 - Math.abs(day - 0.32) / 0.28); // thickest at dawn, gone by midday & night
    const W = WORLD.half + 10;
    for (const m of this.mist) {
      m.x += m.speed * dt;
      if (m.x > W) m.x -= 2 * W;
      m.sprite.position.set(m.x, this.biome.height(m.x, m.z) + 3.5, m.z);
      (m.sprite.material as THREE.SpriteMaterial).opacity = band * 0.4;
      m.sprite.visible = band > 0.02;
    }
  }

  /** Drift the flocks across the sky and flap their wings; visible only around dawn and dusk. */
  private updateBirds(t: number, dt: number, day: number): void {
    const band = Math.max(0, 1 - Math.abs(day - 0.38) / 0.26); // peaks at dawn/dusk, zero by midday/deep night
    const W = WORLD.half * 1.5;
    for (let f = 0; f < this.flocks.length; f++) {
      const fl = this.flocks[f]!;
      fl.group.position.x += fl.speed * dt;
      if (fl.group.position.x > W) fl.group.position.x -= 2 * W;
      const op = band * 0.85;
      fl.group.visible = op > 0.02;
      for (let i = 0; i < fl.birds.length; i++) {
        const b = fl.birds[i]!;
        b.scale.y = 1.2 * (0.45 + 0.55 * Math.abs(Math.sin(t * 8 + i * 0.7 + f))); // wing flap
        (b.material as THREE.SpriteMaterial).opacity = op;
      }
    }
  }

  /** A thin dragonfly: slender body + two pairs of wings (white, tinted by the sprite colour). */
  private dragonflyTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 16;
    const x = c.getContext('2d')!;
    x.fillStyle = '#ffffff';
    x.fillRect(15, 3, 2, 11); // body
    for (const [wx, wy] of [[9, 5], [23, 5], [9, 10], [23, 10]] as const) {
      x.beginPath(); x.ellipse(wx, wy, 6, 2.4, 0, 0, Math.PI * 2); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }

  /** Dragonflies that hover and dart low over the ponds by day. */
  private makeDragonflies(): void {
    const tex = this.dragonflyTexture();
    const hues = [0.5, 0.55, 0.42, 0.62];
    const col = new THREE.Color();
    for (let i = 0; i < 14; i++) {
      col.setHSL(hues[i % hues.length]!, 0.7, 0.6);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col.clone(), transparent: true, depthWrite: false, opacity: 0 }));
      sp.scale.set(1.7, 0.75, 1);
      this.scene.add(sp);
      this.dragonflies.push({ sp, phase: Math.random() * Math.PI * 2, speed: 0.7 + Math.random() * 0.6 });
    }
  }

  private updateDragonflies(t: number, day: number): void {
    const ponds = this.pondData;
    const show = day > 0.15 && ponds.length > 0;
    for (let i = 0; i < this.dragonflies.length; i++) {
      const d = this.dragonflies[i]!;
      d.sp.visible = show;
      if (!show) continue;
      const a = ponds[i % ponds.length]!;
      const px = a.x + Math.sin(t * 0.8 * d.speed + d.phase) * a.r * 0.7 + Math.cos(t * 4 + d.phase) * 1.6;
      const pz = a.z + Math.cos(t * 0.7 * d.speed + d.phase * 1.3) * a.r * 0.7 + Math.sin(t * 4.5 + d.phase) * 1.6;
      const py = this.biome.height(a.x, a.z) + 1.7 + Math.sin(t * 3 + d.phase) * 0.5;
      d.sp.position.set(px, py, pz);
      d.sp.scale.set(1.7 * (0.8 + 0.4 * Math.abs(Math.sin(t * 22 + d.phase))), 0.75, 1); // wing shimmer
      (d.sp.material as THREE.SpriteMaterial).opacity = day * 0.9;
    }
  }

  /** Fireflies drift and the moon glows as night deepens. */
  private updateNight(t: number): void {
    if (!this.lastSky) return;
    const night = 1 - this.lastSky.dayFactor;
    this.cosmos.update(t);
    this.updateButterflies(t, this.lastSky.dayFactor);
    this.updateDragonflies(t, this.lastSky.dayFactor);
    this.updateFish(t);
    this.updateSunShafts();
    (this.flowers.material as THREE.PointsMaterial).opacity = 0.4 + 0.55 * this.lastSky.dayFactor; // dim at night
    (this.grass.material as THREE.PointsMaterial).opacity = 0.3 + 0.5 * this.lastSky.dayFactor;
    (this.pebbles.material as THREE.PointsMaterial).opacity = 0.25 + 0.45 * this.lastSky.dayFactor;
    const shroomGlow = night * 1.8; // mushrooms bioluminesce after dark
    for (const m of this.glowMats) m.emissiveIntensity = shroomGlow;
    const ff = this.fireflies.material as THREE.PointsMaterial;
    ff.opacity = night * 0.9;
    this.fireflies.visible = night > 0.03;
    if (this.fireflies.visible) {
      const b = this.fireflyBase, c = this.fireflyCur;
      for (let i = 0; i < b.length; i += 3) {
        const p = i * 0.7;
        c[i] = b[i]! + Math.sin(t * 0.5 + p) * 2.2;
        c[i + 1] = b[i + 1]! + Math.sin(t * 0.9 + p) * 1.3;
        c[i + 2] = b[i + 2]! + Math.cos(t * 0.4 + p) * 2.2;
      }
      (this.fireflies.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    // the moon sits at a fixed direction relative to the viewer (also infinitely far)
    const d = this.lastSky.sunDir;
    const cam = this.camera.position;
    this.moon.position.set(cam.x - d[0] * WORLD.half * 2, cam.y + 30 + (1 - d[1]) * 38, cam.z - d[2] * WORLD.half * 2);
    this.moonMat.uniforms.uOpacity!.value = night;
    this.moonMat.uniforms.uPhase!.value = (this.lastAge / (params.dayLengthSec * 8)) % 1; // a lunar month ≈ 8 days
    this.moon.visible = night > 0.03;

    // daytime motes drift on the breeze
    const day = this.lastSky.dayFactor;
    const mm = this.motes.material as THREE.PointsMaterial;
    mm.opacity = day * 0.22;
    this.motes.visible = day > 0.1;
    if (this.motes.visible) {
      const b = this.motesBase, c = this.motesCur;
      for (let i = 0; i < b.length; i += 3) {
        const p = i * 0.5;
        c[i] = b[i]! + Math.sin(t * 0.3 + p) * 3;
        c[i + 1] = b[i + 1]! + Math.sin(t * 0.45 + p) * 1.5;
        c[i + 2] = b[i + 2]! + Math.cos(t * 0.25 + p) * 3;
      }
      (this.motes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  follow(world: World): void {
    if (this.stargaze) { this.nameSprite.visible = false; this.controls.update(); return; }
    const sel = this.selectedId != null ? world.creatures.find((x) => x.id === this.selectedId) : undefined;
    if (this.selectedId != null && !sel) this.setSelected(null); // the creature we followed died

    // highlight reel: every so often, gently swoop the camera to a fresh kill or striking birth
    this.highlightT = Math.max(0, this.highlightT - this.lastDt);
    if (this.autoCam && !sel && this.highlightT <= 0 && performance.now() - this.highlightCdMs > 16000) {
      if (world.killFlash > 0.9) this.startHighlight(world.lastKillX, world.lastKillZ);
      else if (world.noveltyFlash > 1.2) this.startHighlight(world.lastNoveltyX, world.lastNoveltyZ);
    }
    if (this.highlightT > 0 && !sel) {
      this.controls.autoRotate = false;
      this.nameSprite.visible = false;
      TMP.set(this.highlightX, this.biome.height(this.highlightX, this.highlightZ) + 1.2, this.highlightZ);
      this.controls.target.lerp(TMP, 0.06); // gentle drift onto the action
      const desired = 11;
      if (this.camera.position.distanceTo(this.controls.target) > desired * 1.6) {
        const dir = TMP2.copy(this.camera.position).sub(this.controls.target).normalize();
        this.camera.position.lerp(TMP3.copy(this.controls.target).addScaledVector(dir, desired), 0.04);
      }
      this.controls.update();
      return;
    }

    // when nobody is manually selected (and auto-cam is on), let the director glide between critters
    const auto = this.selectedId == null && this.autoCam ? this.updateDirector(world) : undefined;
    const followed = sel ?? auto;

    // floating name tag above whoever the camera is watching (manual pick or auto subject)
    if (followed) {
      if (followed.id !== this.lastNameId) { this.drawName(followed.name); this.lastNameId = followed.id; }
      const ny = this.biome.height(followed.x, followed.z) + followed.genome.size * 1.6 + (followed.canFly ? FLIGHT.altitude : 0) + 1.1;
      this.nameSprite.position.set(followed.x, ny, followed.z);
      this.nameSprite.visible = true;
    } else {
      this.nameSprite.visible = false;
      this.lastNameId = -1;
    }

    if (followed) {
      this.controls.autoRotate = false;
      this.followCreature(followed);
      this.controls.update();
      return;
    }

    // free roam: a gentle cinematic orbit that drifts toward a fresh kill, then eases back to centre
    this.controls.autoRotate = true;
    if (world.killFlash > 0.001 && this.dramaTimer <= 0) {
      this.dramaTimer = 6; this.dramaX = world.lastKillX; this.dramaZ = world.lastKillZ;
    }
    this.dramaTimer = Math.max(0, this.dramaTimer - this.lastDt);
    const f = this.dramaTimer > 0 ? 0.35 : 0; // fraction of the way from centre to the action
    TMP.set(this.dramaX * f, 2, this.dramaZ * f);
    this.controls.target.lerp(TMP, 0.012);
    this.controls.update();
  }

  /**
   * Cinematic director. With no creature manually selected, the camera spends most of its time
   * gliding from one critter to another — a "random follow" — broken up by short orbit interludes,
   * so the view is never just spinning in place. Returns the creature currently being auto-followed,
   * or undefined while orbiting between subjects.
   */
  private updateDirector(world: World): Creature | undefined {
    this.autoTimer -= this.lastDt;
    let cur = this.autoFollowId != null ? world.creatures.find((c) => c.id === this.autoFollowId && c.alive) : undefined;
    if (this.autoTimer <= 0 || (this.autoMode === 'follow' && !cur)) {
      if (this.autoMode === 'follow') {
        this.autoMode = 'orbit'; this.autoFollowId = null; cur = undefined;
        this.autoTimer = 10 + Math.random() * 7; // a calm orbit between subjects
      } else {
        const next = this.pickAutoTarget(world);
        if (next) { this.autoMode = 'follow'; this.autoFollowId = next.id; cur = next; this.autoTimer = 20 + Math.random() * 14; }
        else { this.autoTimer = 4; } // nobody to follow yet — keep orbiting
      }
    }
    return this.autoMode === 'follow' ? cur : undefined;
  }

  /** Pick the next critter to settle on — a calm, awake grazer (no startled sprinters or hunters). */
  private pickAutoTarget(world: World): Creature | undefined {
    const calm = world.creatures.filter((c) => c.alive && !c.asleep && c.startleTimer <= 0 && !c.isPredator);
    const pool = calm.length ? calm : world.creatures.filter((c) => c.alive);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : undefined;
  }

  /** Ease the orbit target onto a creature. On auto-cam it hangs back farther and drifts in gently
   *  (so tracking a wandering critter never whips the view around); a manual follow stays closer. */
  private followCreature(c: Creature): void {
    const manual = this.selectedId != null;
    TMP.set(c.x, this.biome.height(c.x, c.z) + c.radius + 0.5, c.z);
    this.controls.target.lerp(TMP, manual ? 0.12 : 0.035); // gentle, lagging ease on auto
    const desired = (manual ? 5 : 9) + c.genome.size * 3; // hang back farther when auto-following
    if (this.camera.position.distanceTo(this.controls.target) > desired * (manual ? 1.6 : 2.0)) {
      const dir = TMP2.copy(this.camera.position).sub(this.controls.target).normalize(); // reuse temps (no per-frame GC)
      const goal = TMP3.copy(this.controls.target).addScaledVector(dir, desired);
      this.camera.position.lerp(goal, manual ? 0.08 : 0.025);
    }
  }

  private startHighlight(x: number, z: number): void {
    this.highlightT = 4 + Math.random() * 1.5;
    this.highlightX = x; this.highlightZ = z;
    this.highlightCdMs = performance.now();
  }

  /** Turn the cinematic auto-follow on/off. Off → the camera just drifts in a slow, gentle orbit. */
  setAutoCam(on: boolean): void {
    this.autoCam = on;
    if (!on) { this.autoMode = 'orbit'; this.autoFollowId = null; }
  }
  isAutoCam(): boolean { return this.autoCam; }

  setSelected(id: number | null): void { this.selectedId = id; this.onSelect(id); }
  getSelected(): number | null { return this.selectedId; }

  /** Camera position + look-direction on the ground plane, for the mini-map's "you are here" wedge. */
  cameraInfo(): { x: number; z: number; yaw: number } {
    const p = this.camera.position, t = this.controls.target;
    return { x: p.x, z: p.z, yaw: Math.atan2(t.z - p.z, t.x - p.x) };
  }

  isStargazing(): boolean { return this.stargaze; }

  /** Stargaze mode: free the camera to tilt up and pan across the night sky. */
  setStargaze(on: boolean): void {
    if (on === this.stargaze) return;
    this.stargaze = on;
    if (on) {
      this.setSelected(null);
      this.savedView = {
        target: this.controls.target.clone(),
        maxPolar: this.controls.maxPolarAngle, minDist: this.controls.minDistance,
        maxDist: this.controls.maxDistance, autoRotate: this.controls.autoRotate,
        autoSpeed: this.controls.autoRotateSpeed, enablePan: this.controls.enablePan,
      };
      this.controls.maxPolarAngle = Math.PI; // allow looking all the way up
      this.controls.minPolarAngle = 0;
      this.controls.minDistance = 5;
      this.controls.maxDistance = 500;
      this.controls.enablePan = false;
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 0.18; // a slow drift across the stars
      // aim the view up-and-forward from where the camera is now
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd); fwd.y = 0;
      if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
      fwd.normalize();
      this.controls.target.copy(this.camera.position).addScaledVector(fwd, 35);
      this.controls.target.y += 48;
      this.controls.update();
    } else if (this.savedView) {
      const s = this.savedView;
      this.controls.maxPolarAngle = s.maxPolar; this.controls.minPolarAngle = 0;
      this.controls.minDistance = s.minDist; this.controls.maxDistance = s.maxDist;
      this.controls.enablePan = s.enablePan; this.controls.autoRotate = s.autoRotate;
      this.controls.autoRotateSpeed = s.autoSpeed;
      this.controls.target.copy(s.target);
      this.controls.update();
      this.savedView = null;
    }
  }

  render(): void {
    if (params.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private wireSelection(): void {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0, downY = 0;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
    el.addEventListener('pointerup', (e) => {
      if (this.stargaze) return; // no creature-picking while gazing at the sky
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      if (this.godTool) { // wielding a god-mode tool: apply it at the clicked ground point
        const hit = this.terrain ? ray.intersectObject(this.terrain, false)[0] : undefined;
        if (hit) this.onGround(hit.point.x, hit.point.z, this.godTool);
        return;
      }
      const hits = ray.intersectObjects(this.pickables, false);
      const id = hits.length ? (hits[0]!.object.userData.creatureId as number | undefined) : undefined;
      this.setSelected(id ?? null);
    });
  }

  /** Activate a god-mode tool (or null to go back to selecting creatures). */
  setGodTool(tool: string | null): void {
    this.godTool = tool;
    this.renderer.domElement.style.cursor = tool ? 'crosshair' : '';
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }
}
