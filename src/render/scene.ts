import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { WORLD, FOOD, SOCIAL, WEATHER, FLIGHT, LIFE, PRED, params } from '../config';
import type { World } from '../sim/world';
import type { Biome, SkyState } from '../biome';
import { Cosmos } from './cosmos';

const MAX_PULSES = 256; // max simultaneous "found food!" signal rings drawn
const RAIN_HEIGHT = 60; // how high rain spawns above the ground
const TMP = new THREE.Vector3();
const STORM = new THREE.Color(0x2a2e36);
const FLASH = new THREE.Color(0xe6f0ff);
const FOLIAGE_SUMMER = new THREE.Color(0x3f8f4a);
const FOLIAGE_AUTUMN = new THREE.Color(0xc8772e);
const toVec3 = (hex: number): THREE.Color => new THREE.Color(hex);

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
  private whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private darkMat = new THREE.MeshBasicMaterial({ color: 0x232334 });
  private mouthMat = new THREE.MeshBasicMaterial({ color: 0x3a2030 });
  private outlineMat = new THREE.MeshBasicMaterial({ color: 0x15121f, side: THREE.BackSide });
  private redOutlineMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, side: THREE.BackSide });
  private groups = new Map<number, THREE.Group>();

  private trunkGeo = new THREE.CylinderGeometry(0.5, 0.75, 4.2, 8);
  private foliageGeo = new THREE.IcosahedronGeometry(2.5, 1);
  private trunkMat = new THREE.MeshToonMaterial({ color: 0x6b4a2b, gradientMap: this.toonGrad });
  private foliageMat = new THREE.MeshToonMaterial({ color: 0x3f8f4a, gradientMap: this.toonGrad });
  private treeGroup = new THREE.Group();
  private treePositions: { x: number; z: number }[] = [];
  private pondGroup = new THREE.Group();
  private pondData: { x: number; z: number; r: number }[] = [];
  private waterMat!: THREE.ShaderMaterial;
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

  private fireflies!: THREE.Points;
  private fireflyBase!: Float32Array;
  private fireflyCur!: Float32Array;
  private moon!: THREE.Mesh;
  private moonMat!: THREE.ShaderMaterial;
  private lastAge = 0;
  private lastSky!: SkyState;
  private motes!: THREE.Points;
  private motesBase!: Float32Array;
  private motesCur!: Float32Array;
  private butterflies: { sp: THREE.Sprite; bx: number; bz: number; phase: number; speed: number }[] = [];
  private bursts = new BurstField();
  private lastT = 0;

  private selectedId: number | null = null;
  onSelect: (id: number | null) => void = () => {};

  constructor(container: HTMLElement, biome: Biome) {
    this.biome = biome;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    this.controls.autoRotateSpeed = 0.35; // slow, relaxing drift when not following anyone

    this.hemi = new THREE.HemisphereLight(0xbcd7ff, 0x20301a, 0.6);
    this.scene.add(this.hemi);
    this.sun = this.makeSun();
    this.scene.add(this.sun, this.sun.target);

    this.skyMat = this.makeSkyMaterial();
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(WORLD.half * 3.2, 32, 16), this.skyMat);
    this.scene.add(this.skyMesh);
    this.scene.add(this.cosmos.group);

    this.buildTerrain();

    this.foodMesh = this.makeFoodMesh();
    this.scene.add(this.foodMesh);
    this.makeSocialViz();
    this.scene.add(this.treeGroup);
    this.makeWater();
    this.scene.add(this.pondGroup);
    this.makeWeather();
    this.makeRainbow();
    this.makeNameTag();
    this.makeNight();
    this.makeButterflies();
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
  }

  private makeFoodMesh(): THREE.InstancedMesh {
    const geo = new THREE.SphereGeometry(FOOD.radius, 7, 7);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6dff9e, emissive: 0x1f8f4a, emissiveIntensity: 1.1, roughness: 0.4 });
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

      // appearance derived from the heritable "look" gene
      const pred = c.isPredator;
      const look = c.genome.look | 0;
      const earType = pred ? 1 : look % 3; // predators always get pointy ears
      const hasTail = ((look >> 2) & 1) === 1;
      const eyeScale = 1 + ((look >> 3) & 3) * 0.12;
      const squash = 0.88 + ((look >> 5) & 3) * 0.08;
      const growth = Math.min(1, 0.4 + 0.6 * Math.min(1, c.age / LIFE.matureAge)); // babies start small, grow up
      const bodyScale = c.genome.size * (pred ? 1.28 : 1) * growth;
      const flying = c.canFly;
      const asleep = c.asleep;

      const baseY = this.biome.height(c.x, c.z) + bodyScale * 0.5 * squash + 0.05;
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
      } else {
        gy = baseY + Math.sin(t * (asleep ? 1.0 : 1.5 + c.genome.speed * 0.4) + c.id) * (asleep ? 0.03 : 0.08) * c.genome.size;
      }
      rig.lastHeading = c.heading;

      // cartoon pounce: predators stretch forward + squash + hop mid-dart, then punch-scale on a kill
      let sx = 1, sy = squash, sz = 1;
      if (pred && c.lungeTimer > 0) {
        const k = Math.sin((c.lungeTimer / PRED.lungeDuration) * Math.PI); // 0 → 1 → 0
        sx = 1 + 0.5 * k;            // stretch along travel (local +x = forward)
        sy = squash * (1 - 0.28 * k); // flatten down
        sz = 1 - 0.12 * k;
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
    }
    for (const [id, g] of this.groups) {
      if (!seen.has(id)) { g.visible = false; this.pool.push(g); this.groups.delete(id); }
    }
    this.waterMat.uniforms.uTime!.value = t;
    this.syncFood(world);
    this.syncSocial(world);
    this.updateSky(world.age);
    this.syncWeather(world);
    this.updateRainbow(dt);
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
      } else this.bursts.emit(e.x, y, e.z, 0x9aa0aa, 7, 0.6); // death: grey poof
    }
    ev.length = 0;
    this.bursts.update(dt);
  }

  private syncFood(world: World): void {
    const n = Math.min(world.food.length, WORLD.foodMax);
    for (let i = 0; i < n; i++) {
      const f = world.food[i]!;
      this.dummy.position.set(f.x, this.biome.height(f.x, f.z) + 0.4, f.z);
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

    const showRain = w > WEATHER.startAt;
    this.rain.visible = showRain;
    if (showRain) {
      const fall = 0.7 + w * 1.8;
      const pos = this.rainPos;
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] -= fall;
        if (pos[i] < 0) pos[i] += RAIN_HEIGHT;
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      const rm = this.rain.material as THREE.PointsMaterial;
      rm.opacity = 0.25 + w * 0.5;
      rm.size = 0.22 + w * 0.2;
    }

    // seasonal foliage colour drifts green -> autumn -> green
    const sp = (world.age / Math.max(1, params.seasonLengthSec)) % 1;
    this.foliageMat.color.copy(FOLIAGE_SUMMER).lerp(FOLIAGE_AUTUMN, (Math.sin(sp * Math.PI * 2) + 1) / 2);

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
        uSky: { value: new THREE.Color(0xbfe0ff) },
      },
      vertexShader: `varying vec2 vUv; varying vec2 vW;
        void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform float uOpacity; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky;
        varying vec2 vUv; varying vec2 vW;
        void main(){
          float d = distance(vUv, vec2(0.5)) * 2.0; // 0 centre .. 1 rim
          float r = sin(vW.x * 0.6 + uTime * 1.3) * 0.5 + sin(vW.y * 0.7 - uTime * 1.05) * 0.5;
          float spark = smoothstep(0.72, 1.0, r) * (1.0 - d);
          vec3 col = mix(uDeep, uShallow, d);
          col = mix(col, uSky, 0.22) + spark * 0.45;
          float a = uOpacity * (1.0 - smoothstep(0.82, 1.0, d));
          gl_FragColor = vec4(col, a);
        }`,
    });
  }

  /** Provide the world's pond positions; lays flat shimmering water discs into the basins. */
  setPonds(ponds: { x: number; z: number; r: number }[]): void {
    this.pondData = ponds;
    this.buildPonds();
  }

  private buildPonds(): void {
    this.pondGroup.clear();
    for (const p of this.pondData) {
      const geo = new THREE.CircleGeometry(p.r, 40);
      const mesh = new THREE.Mesh(geo, this.waterMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, this.biome.height(p.x, p.z) + 0.06, p.z);
      this.pondGroup.add(mesh);
    }
  }

  /** Provide the world's shelter-tree positions; builds the tree meshes on the terrain. */
  setTrees(trees: { x: number; z: number }[]): void {
    this.treePositions = trees;
    this.buildTrees();
  }

  buildTrees(): void {
    this.treeGroup.clear();
    for (const t of this.treePositions) {
      const y = this.biome.height(t.x, t.z);
      const trunk = new THREE.Mesh(this.trunkGeo, this.trunkMat);
      trunk.position.set(t.x, y + 2.1, t.z);
      trunk.castShadow = true;
      const foliage = new THREE.Mesh(this.foliageGeo, this.foliageMat);
      foliage.position.set(t.x, y + 5.3, t.z);
      foliage.castShadow = true;
      this.treeGroup.add(trunk, foliage);
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
    // water reflects the sky colour + dims at night
    (this.waterMat.uniforms.uSky!.value as THREE.Color).copy(toVec3(s.bottom));
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
      color: 0xfff2a0, size: 0.7, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);

    // a moon that waxes and wanes — a shader terminator sweeps across the disk with the phase
    this.moonMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uPhase: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uPhase; uniform float uOpacity; varying vec3 vN;
        void main(){
          // light direction sweeps around the moon as the phase advances (view space)
          float a = uPhase * 6.28318;
          vec3 L = vec3(sin(a), 0.0, -cos(a));
          float lit = smoothstep(-0.12, 0.12, dot(normalize(vN), L));
          vec3 day = vec3(0.93, 0.94, 1.0);
          vec3 night = vec3(0.06, 0.07, 0.12); // faint earthshine on the dark limb
          vec3 col = mix(night, day, lit);
          float a2 = uOpacity * (0.18 + 0.82 * lit);
          gl_FragColor = vec4(col, a2);
        }`,
    });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(7, 32, 32), this.moonMat);
    this.scene.add(this.moon);

    // daytime motes (drifting pollen / tiny insects)
    const m = 140;
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
      color: 0xfff6d0, size: 0.45, transparent: true, opacity: 0, depthWrite: false,
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

  /** Fireflies drift and the moon glows as night deepens. */
  private updateNight(t: number): void {
    if (!this.lastSky) return;
    const night = 1 - this.lastSky.dayFactor;
    this.cosmos.update(t);
    this.updateButterflies(t, this.lastSky.dayFactor);
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
    mm.opacity = day * 0.4;
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
    this.controls.autoRotate = this.selectedId == null; // gentle cinematic orbit when free
    const sel = this.selectedId != null ? world.creatures.find((x) => x.id === this.selectedId) : undefined;

    // floating name tag above the selected creature
    if (sel) {
      if (sel.id !== this.lastNameId) { this.drawName(sel.name); this.lastNameId = sel.id; }
      const ny = this.biome.height(sel.x, sel.z) + sel.genome.size * 1.6 + (sel.canFly ? FLIGHT.altitude : 0) + 1.1;
      this.nameSprite.position.set(sel.x, ny, sel.z);
      this.nameSprite.visible = true;
    } else {
      this.nameSprite.visible = false;
      this.lastNameId = -1;
    }

    if (this.selectedId == null) { this.controls.update(); return; }
    if (!sel) { this.setSelected(null); this.controls.update(); return; }
    TMP.set(sel.x, this.biome.height(sel.x, sel.z) + sel.radius + 0.5, sel.z);
    this.controls.target.lerp(TMP, 0.12);
    const desired = 5 + sel.genome.size * 3;
    if (this.camera.position.distanceTo(this.controls.target) > desired * 1.6) {
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      this.camera.position.lerp(this.controls.target.clone().add(dir.multiplyScalar(desired)), 0.08);
    }
    this.controls.update();
  }

  setSelected(id: number | null): void { this.selectedId = id; this.onSelect(id); }
  getSelected(): number | null { return this.selectedId; }

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
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hits = ray.intersectObjects(this.pickables, false);
      const id = hits.length ? (hits[0]!.object.userData.creatureId as number | undefined) : undefined;
      this.setSelected(id ?? null);
    });
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }
}
