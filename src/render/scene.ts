import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { WORLD, FOOD, params } from '../config';
import type { World } from '../sim/world';
import type { Biome } from '../biome';

const TMP = new THREE.Vector3();
const toVec3 = (hex: number): THREE.Color => new THREE.Color(hex);

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

  private bodyGeo = new THREE.IcosahedronGeometry(0.5, 2);
  private noseGeo = new THREE.ConeGeometry(0.2, 0.6, 10);
  private eyeGeo = new THREE.SphereGeometry(0.12, 8, 8);
  private eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, emissiveIntensity: 0.4 });
  private groups = new Map<number, THREE.Group>();
  private pool: THREE.Group[] = [];
  private pickables: THREE.Mesh[] = [];

  private foodMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

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
    const body = new THREE.Mesh(this.bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.5 }));
    body.castShadow = true;
    const nose = new THREE.Mesh(this.noseGeo, body.material);
    nose.rotation.z = -Math.PI / 2; nose.position.set(0.55, 0.02, 0);
    const eyeL = new THREE.Mesh(this.eyeGeo, this.eyeMat); eyeL.position.set(0.34, 0.22, 0.24);
    const eyeR = new THREE.Mesh(this.eyeGeo, this.eyeMat); eyeR.position.set(0.34, 0.22, -0.24);
    group.add(body, nose, eyeL, eyeR);
    group.userData.body = body;
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
      const body = g.userData.body as THREE.Mesh;
      body.userData.creatureId = c.id;
      this.pickables.push(body);

      const gy = this.biome.height(c.x, c.z) + c.radius + 0.05;
      const bob = Math.sin(t * (1.5 + c.genome.speed * 0.4) + c.id) * 0.06 * c.genome.size;
      g.position.set(c.x, gy + bob, c.z);
      g.scale.setScalar(c.genome.size);
      g.rotation.y = -c.heading;

      const mat = body.material as THREE.MeshStandardMaterial;
      mat.color.setHSL(c.genome.hue, 0.65, 0.55);
      const vigor = Math.max(0.06, Math.min(1, c.energy / c.maxEnergy));
      mat.emissive.setHSL(c.genome.hue, 0.8, 0.18 * vigor);
      mat.emissiveIntensity = 0.6 + vigor * 0.8;
    }
    for (const [id, g] of this.groups) {
      if (!seen.has(id)) { g.visible = false; this.pool.push(g); this.groups.delete(id); }
    }
    this.syncFood(world);
    this.updateSky(world.age);
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
