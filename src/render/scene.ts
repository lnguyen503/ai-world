import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { WORLD, FOOD, SOCIAL, WEATHER, FLIGHT, params } from '../config';
import type { World } from '../sim/world';
import type { Biome } from '../biome';

const MAX_PULSES = 256; // max simultaneous "found food!" signal rings drawn
const RAIN_HEIGHT = 60; // how high rain spawns above the ground
const TMP = new THREE.Vector3();
const STORM = new THREE.Color(0x2a2e36);
const FLASH = new THREE.Color(0xe6f0ff);
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
  private stars: THREE.Points;
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
  private whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private darkMat = new THREE.MeshBasicMaterial({ color: 0x232334 });
  private mouthMat = new THREE.MeshBasicMaterial({ color: 0x3a2030 });
  private outlineMat = new THREE.MeshBasicMaterial({ color: 0x15121f, side: THREE.BackSide });
  private groups = new Map<number, THREE.Group>();

  private trunkGeo = new THREE.CylinderGeometry(0.5, 0.75, 4.2, 8);
  private foliageGeo = new THREE.IcosahedronGeometry(2.5, 1);
  private trunkMat = new THREE.MeshToonMaterial({ color: 0x6b4a2b, gradientMap: this.toonGrad });
  private foliageMat = new THREE.MeshToonMaterial({ color: 0x3f8f4a, gradientMap: this.toonGrad });
  private treeGroup = new THREE.Group();
  private treePositions: { x: number; z: number }[] = [];
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

    this.hemi = new THREE.HemisphereLight(0xbcd7ff, 0x20301a, 0.6);
    this.scene.add(this.hemi);
    this.sun = this.makeSun();
    this.scene.add(this.sun, this.sun.target);

    this.skyMat = this.makeSkyMaterial();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(WORLD.half * 3.2, 32, 16), this.skyMat);
    this.scene.add(sky);
    this.stars = this.makeStars();
    this.scene.add(this.stars);

    this.buildTerrain();

    this.foodMesh = this.makeFoodMesh();
    this.scene.add(this.foodMesh);
    this.makeSocialViz();
    this.scene.add(this.treeGroup);
    this.makeWeather();

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

  private makeStars(): THREE.Points {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const r = WORLD.half * 2.9;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * s * r;
      pos[i * 3 + 1] = Math.abs(u) * r; // upper hemisphere
      pos[i * 3 + 2] = Math.sin(a) * s * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0, depthWrite: false });
    return new THREE.Points(geo, mat);
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

    group.add(body, outline, eyeL, eyeR, pupil(0.2), pupil(-0.2), hi(0.16), hi(-0.16),
      earRL, earRR, earPL, earPR, ...antL, ...antR, tail, mouth, wingL, wingR);
    const rig: CreatureRig = {
      body, mat, eyes: [eyeL, eyeR], earRound: [earRL, earRR],
      earPointy: [earPL, earPR], antenna: [...antL, ...antR], tail, mouth, wings: [wingL, wingR],
    };
    group.userData.rig = rig;
    this.scene.add(group);
    return group;
  }

  sync(world: World): void {
    const t = this.clock.getElapsedTime();
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
      const bodyScale = c.genome.size * (pred ? 1.28 : 1);
      const flying = c.canFly;

      let gy = this.biome.height(c.x, c.z) + bodyScale * 0.5 * squash + 0.05;
      if (flying) gy += FLIGHT.altitude;
      const bob = Math.sin(t * (1.5 + c.genome.speed * 0.4) + c.id) * (flying ? 0.18 : 0.07) * c.genome.size;
      g.position.set(c.x, gy + bob, c.z);
      g.scale.set(bodyScale, bodyScale * squash, bodyScale);
      g.rotation.y = -c.heading;

      const vigor = Math.max(0.06, Math.min(1, c.energy / c.maxEnergy));
      if (pred) {
        rig.mat.color.setHSL(0.015, 0.72, 0.5); // menacing red carnivore
        rig.mat.emissive.setHSL(0.02, 0.9, 0.18 * vigor);
      } else {
        rig.mat.color.setHSL(c.genome.hue, 0.55, 0.68); // pastel prey
        rig.mat.emissive.setHSL(c.genome.hue, 0.7, 0.14 * vigor);
      }

      rig.earRound[0]!.visible = rig.earRound[1]!.visible = earType === 0;
      rig.earPointy[0]!.visible = rig.earPointy[1]!.visible = earType === 1;
      for (const a of rig.antenna) a.visible = earType === 2;
      rig.tail.visible = hasTail;
      rig.mouth.scale.set(pred ? 1.1 : 0.7, pred ? 0.85 : 0.5, pred ? 1.9 : 1.4);

      // wings: visible + flapping only for flyers
      rig.wings[0]!.visible = rig.wings[1]!.visible = flying;
      if (flying) {
        const flap = Math.sin(t * 14 + c.id) * 0.55;
        rig.wings[0]!.rotation.z = flap;
        rig.wings[1]!.rotation.z = -flap;
      }

      // big cute eyes that occasionally blink (predators have narrowed, meaner eyes)
      const blink = Math.sin(t * 3 + c.id * 1.7) > 0.97 ? 0.12 : 1;
      const eyeY = pred ? 0.62 : 1;
      for (const e of rig.eyes) e.scale.set(eyeScale, eyeScale * blink * eyeY, eyeScale);
    }
    for (const [id, g] of this.groups) {
      if (!seen.has(id)) { g.visible = false; this.pool.push(g); this.groups.delete(id); }
    }
    this.syncFood(world);
    this.syncSocial(world);
    this.updateSky(world.age);
    this.syncWeather(world);
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

  /** Rain, storm darkening, and lightning flashes — all driven by params.weather + world.lightningFlash. */
  private syncWeather(world: World): void {
    const w = params.weather;
    const fog = this.scene.fog as THREE.Fog;

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
    const s = this.biome.sky(simTime);
    (this.skyMat.uniforms.uTop!.value as THREE.Color).copy(toVec3(s.top));
    (this.skyMat.uniforms.uBottom!.value as THREE.Color).copy(toVec3(s.bottom));
    (this.scene.fog as THREE.Fog).color.copy(toVec3(s.fog));
    const dist = WORLD.half * 1.6;
    this.sun.position.set(s.sunDir[0] * dist, s.sunDir[1] * dist, s.sunDir[2] * dist);
    this.sun.color.copy(toVec3(s.sunColor));
    this.sun.intensity = s.sunIntensity;
    this.hemi.intensity = s.ambIntensity;
    (this.stars.material as THREE.PointsMaterial).opacity = s.starAlpha * 0.9;
  }

  follow(world: World): void {
    if (this.selectedId == null) { this.controls.update(); return; }
    const c = world.creatures.find((x) => x.id === this.selectedId);
    if (!c) { this.setSelected(null); this.controls.update(); return; }
    TMP.set(c.x, this.biome.height(c.x, c.z) + c.radius + 0.5, c.z);
    this.controls.target.lerp(TMP, 0.12);
    const desired = 5 + c.genome.size * 3;
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
