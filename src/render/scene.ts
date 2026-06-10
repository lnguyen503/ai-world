import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WORLD, FOOD } from '../config';
import type { World } from '../sim/world';

const TMP = new THREE.Vector3();

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;

  private bodyGeo = new THREE.IcosahedronGeometry(0.5, 1);
  private noseGeo = new THREE.ConeGeometry(0.22, 0.7, 8);
  private groups = new Map<number, THREE.Group>();
  private pool: THREE.Group[] = [];
  private pickables: THREE.Mesh[] = [];

  private foodMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  private selectedId: number | null = null;
  onSelect: (id: number | null) => void = () => {};

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0a0e14);
    this.scene.fog = new THREE.Fog(0x0a0e14, WORLD.half * 1.2, WORLD.half * 3.2);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, WORLD.half * 0.9, WORLD.half * 1.15);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0, 0, 0);

    this.addLights();
    this.addGround();

    this.foodMesh = this.makeFoodMesh();
    this.scene.add(this.foodMesh);

    window.addEventListener('resize', () => this.onResize());
    this.wireSelection();
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xbcd7ff, 0x20301a, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(40, 80, 30);
    this.scene.add(sun);
  }

  private addGround(): void {
    const size = WORLD.half * 2;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: 0x1d2b1a, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(size, 40, 0x2f4a2a, 0x223a1f);
    (grid.material as THREE.Material).opacity = 0.35;
    (grid.material as THREE.Material).transparent = true;
    this.scene.add(grid);
  }

  private makeFoodMesh(): THREE.InstancedMesh {
    const geo = new THREE.SphereGeometry(FOOD.radius, 6, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x0c3a1d, emissiveIntensity: 0.6 });
    const mesh = new THREE.InstancedMesh(geo, mat, WORLD.foodMax);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = WORLD.foodMax;
    return mesh;
  }

  private acquireGroup(): THREE.Group {
    const g = this.pool.pop();
    if (g) { g.visible = true; return g; }
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }));
    const nose = new THREE.Mesh(this.noseGeo, body.material);
    nose.rotation.z = -Math.PI / 2; // point along +X
    nose.position.set(0.55, 0, 0);
    group.add(body, nose);
    group.userData.body = body;
    this.scene.add(group);
    return group;
  }

  /** Sync all visuals from the simulation state. */
  sync(world: World): void {
    const seen = new Set<number>();
    this.pickables.length = 0;
    for (const c of world.creatures) {
      seen.add(c.id);
      let g = this.groups.get(c.id);
      if (!g) { g = this.acquireGroup(); this.groups.set(c.id, g); }
      const body = g.userData.body as THREE.Mesh;
      body.userData.creatureId = c.id;
      this.pickables.push(body);

      g.position.set(c.x, c.radius, c.z);
      g.scale.setScalar(c.genome.size);
      g.rotation.y = -c.heading;

      const mat = body.material as THREE.MeshStandardMaterial;
      mat.color.setHSL(c.genome.hue, 0.65, 0.55);
      const vigor = Math.max(0.08, Math.min(1, c.energy / c.maxEnergy));
      mat.emissive.setHSL(c.genome.hue, 0.7, 0.12 * vigor);
    }
    // retire groups whose creature died
    for (const [id, g] of this.groups) {
      if (!seen.has(id)) { g.visible = false; this.pool.push(g); this.groups.delete(id); }
    }
    this.syncFood(world);
  }

  private syncFood(world: World): void {
    const n = Math.min(world.food.length, WORLD.foodMax);
    for (let i = 0; i < n; i++) {
      const f = world.food[i]!;
      this.dummy.position.set(f.x, 0.35, f.z);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.foodMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = n; i < WORLD.foodMax; i++) this.foodMesh.setMatrixAt(i, this.dummy.matrix);
    this.foodMesh.instanceMatrix.needsUpdate = true;
  }

  /** Smoothly follow the selected creature for a close-up; otherwise free orbit. */
  follow(world: World): void {
    if (this.selectedId == null) { this.controls.update(); return; }
    const c = world.creatures.find((x) => x.id === this.selectedId);
    if (!c) { this.setSelected(null); this.controls.update(); return; }
    TMP.set(c.x, c.radius + 0.5, c.z);
    this.controls.target.lerp(TMP, 0.12);
    const desired = 6 + c.genome.size * 3;
    const d = this.camera.position.distanceTo(this.controls.target);
    if (d > desired * 1.6) {
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      const goal = this.controls.target.clone().add(dir.multiplyScalar(desired));
      this.camera.position.lerp(goal, 0.08);
    }
    this.controls.update();
  }

  setSelected(id: number | null): void {
    this.selectedId = id;
    this.onSelect(id);
  }

  getSelected(): number | null {
    return this.selectedId;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private wireSelection(): void {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0, downY = 0;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
    el.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // was a drag
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
  }
}
