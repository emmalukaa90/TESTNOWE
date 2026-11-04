import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, cyl, damp, glow, makeFado, mat, Particles, PhysicsSet, plane, sphere, type FadoActor, type PhysItem } from '../kit';

const LAYERS = 7;
const NEEDED = 5;
const CRATE_H = 0.6;

interface Crate {
  item: PhysItem;
  layer: number;
  removed: boolean;
}
interface Jar {
  item: PhysItem;
  startY: number;
  broken: boolean;
  startX: number;
  startZ: number;
  moved: boolean;
}

/** Poziom 8: Jenga ze skrzynek — wysuń je, nie strącając słoików, i zbuduj schody. */
export class Game08Pantry extends BaseMinigame {
  readonly id = 8;

  private fado!: FadoActor;
  private fx!: Particles;
  private phys!: PhysicsSet;
  private crates: Crate[] = [];
  private jars: Jar[] = [];
  private held: { crate: Crate; startPos: THREE.Vector3; startNx: number; startNy: number; id: number } | null = null;
  private removed = 0;
  private brokenJars = 0;
  private raycaster = new THREE.Raycaster();
  private climbing = 0;
  private climbPath: THREE.Vector3[] = [];
  private sausage!: THREE.Group;
  private towerCenter = new THREE.Vector3(-2.5, 0, 0);

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set({ background: '#2a1c14', fogColor: '#2a1c14', fogNear: 18, fogFar: 50 });
    const { dir } = addLighting(ctx, { sky: '#ffd9a8', ground: '#3a2616', hemi: 0.8, sun: '#ffd9a8', sunIntensity: 2.4, sunPos: [-6, 12, 10], shadowRange: 14 });
    const lamp = new THREE.PointLight('#ffb35a', 18, 20, 1.8);
    lamp.position.set(0, 6, 3);
    ctx.root.add(lamp);

    this.phys = new PhysicsSet(ctx.physics);
    // podłoga + półki: ściana z desek
    const floorMesh = plane(40, 24, mat('#6b4a2e', { roughness: 1 }), [0, 0, 0]);
    ctx.root.add(floorMesh);
    this.phys.fixedBox(20, 0.5, 12, { x: 0, y: -0.5, z: 0 }, null, 0.9);
    ctx.root.add(box(40, 14, 0.5, mat('#4a3322'), [0, 7, -5]));
    this.phys.fixedBox(20, 7, 0.25, { x: 0, y: 7, z: -5 }, null, 0.5);
    // półki z dekoracjami
    for (let i = 0; i < 3; i++) {
      ctx.root.add(box(10, 0.15, 0.9, mat('#7b5535'), [6, 3 + i * 2, -4.4]));
      for (let j = 0; j < 4; j++) ctx.root.add(cyl(0.22, 0.22, 0.5, glow(['#ff9f43', '#e17055', '#fdcb6e', '#a29bfe'][j], 0.15), [3 + j * 1.8, 3.35 + i * 2, -4.4], 12));
    }

    // wieża 3x3 na warstwę, warstwy naprzemienne
    const crateMat = [mat('#b98a56'), mat('#a87848'), mat('#c59862')];
    for (let l = 0; l < LAYERS; l++) {
      const alongZ = l % 2 === 0;
      for (let k = 0; k < 3; k++) {
        const off = (k - 1) * 1.0;
        const he = alongZ ? { x: 0.5, z: 1.5 } : { x: 1.5, z: 0.5 };
        const px = this.towerCenter.x + (alongZ ? off : 0);
        const pz = this.towerCenter.z + (alongZ ? 0 : off);
        const mesh = box(he.x * 2 - 0.02, CRATE_H - 0.02, he.z * 2 - 0.02, crateMat[(l + k) % 3]);
        mesh.add(box(he.x * 2 - 0.1, 0.03, he.z * 2 - 0.1, mat('#8a6238'), [0, CRATE_H / 2 - 0.0, 0]));
        ctx.root.add(mesh);
        const item = this.phys.dynamicBox(he.x, CRATE_H / 2, he.z, { x: px, y: CRATE_H / 2 + l * CRATE_H + 0.002 * l, z: pz }, mesh, {
          friction: 0.55, density: 0.8, damping: 0.5, angularDamping: 1.2,
        });
        item.body.sleep();
        this.crates.push({ item, layer: l, removed: false });
      }
    }

    // słoiki na szczycie wieży
    const glass = new THREE.MeshStandardMaterial({ color: '#d7f0ff', transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 });
    const top = LAYERS * CRATE_H + 0.002 * LAYERS;
    for (const jx of [-1, 0, 1]) {
      const g = new THREE.Group();
      g.add(cyl(0.34, 0.34, 0.7, glass, [0, 0, 0], 14), cyl(0.26, 0.26, 0.5, glow('#ffb400', 0.5), [0, -0.05, 0], 12), cyl(0.3, 0.3, 0.1, mat('#c0392b'), [0, 0.4, 0], 12));
      ctx.root.add(g);
      const pos = { x: this.towerCenter.x + jx * 0.95, y: top + 0.36, z: this.towerCenter.z };
      const item = this.phys.dynamicBox(0.33, 0.36, 0.33, pos, g, { friction: 0.7, density: 0.5, damping: 0.4, angularDamping: 1 });
      item.body.sleep();
      this.jars.push({ item, startY: pos.y, broken: false, startX: pos.x, startZ: pos.z, moved: false });
    }

    // schody (puste, wypełniane wysuniętymi skrzynkami)
    for (let i = 0; i < NEEDED; i++) {
      const ghost = box(1.4, (i + 1) * CRATE_H, 2.2, new THREE.MeshStandardMaterial({ color: '#ffd23f', transparent: true, opacity: 0.12 }), [4.2 + i * 1.5, ((i + 1) * CRATE_H) / 2, 2]);
      ghost.castShadow = false;
      ctx.root.add(ghost);
    }
    // kiełbaski u celu
    this.sausage = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = sphere(0.22, mat('#c0392b'), [i * 0.5, 0, 0], 10);
      s.scale.set(2.1, 0.8, 0.8);
      this.sausage.add(s);
    }
    this.sausage.position.set(4.2 + NEEDED * 1.5 - 0.3, NEEDED * CRATE_H + 0.5, 2);
    ctx.root.add(this.sausage);
    ctx.root.add(box(2, 0.2, 2.2, mat('#7b5535'), [4.2 + NEEDED * 1.5, NEEDED * CRATE_H + 0.0, 2]));

    this.fado = makeFado(ctx, { scale: 0.85, lightDir: dir });
    this.fado.group.position.set(2.8, 0, 3.4);
    this.fado.group.rotation.y = Math.PI / 2;
    this.fx = new Particles(160);
    ctx.root.add(this.fx.points);

    ctx.camera.setTarget(this.makeAnchor(ctx));
    ctx.camera.apply({ offset: [0, 3.5, 12], look: [0, 0.0, 0], fov: 42, bokeh: 0.8, duration: 0 });
    ctx.hud.setObjective(`Wysuń skrzynki: 0 / ${NEEDED}`);
    ctx.hud.showHint('Przeciągnij skrzynkę (w bok lub do siebie). Nie strąć słoików!');
    ctx.hud.setCourage(1);
  }

  private makeAnchor(ctx: GameContext): THREE.Object3D {
    const a = new THREE.Object3D();
    a.position.set(0.8, 2.4, 0);
    ctx.root.add(a);
    return a;
  }

  startGame(): void {
    this.ctx.audio.music('farm');
    this.ctx.audio.setMusicIntensity(0.3);
  }

  handleInput(e: InputEvent): void {
    if (e.type === 'pointer-down' && !this.held && this.climbing === 0) {
      const cam = this.ctx.view.camera;
      if (!cam) return;
      this.raycaster.setFromCamera(new THREE.Vector2(e.nx, e.ny), cam);
      let best: Crate | null = null;
      let bestD = Infinity;
      for (const c of this.crates) {
        if (c.removed) continue;
        const mesh = c.item.mesh;
        if (!mesh) continue;
        const hit = this.raycaster.intersectObject(mesh, false)[0];
        if (hit && hit.distance < bestD) {
          bestD = hit.distance;
          best = c;
        }
      }
      if (best) {
        const t = best.item.body.translation();
        this.held = { crate: best, startPos: new THREE.Vector3(t.x, t.y, t.z), startNx: e.nx, startNy: e.ny, id: e.pointerId };
        this.ctx.audio.sfx('crate', { gain: 0.5 });
        this.ctx.haptics.impact('light');
      }
    } else if (e.type === 'pointer-move' && this.held && e.pointerId === this.held.id) {
      /* cel liczony co klatkę w onUpdate z ostatniej pozycji palca */
      this.lastNx = e.nx;
      this.lastNy = e.ny;
    } else if (e.type === 'pointer-up' && this.held && e.pointerId === this.held.id) {
      this.release();
    }
  }

  private lastNx = 0;
  private lastNy = 0;

  private release(): void {
    const h = this.held;
    this.held = null;
    if (!h) return;
    const t = h.crate.item.body.translation();
    const away = Math.hypot(t.x - this.towerCenter.x, t.z - this.towerCenter.z);
    if (away > 3.1 && t.y < 1.0 + h.crate.layer * CRATE_H) {
      this.collect(h.crate);
    }
  }

  /** Wysunięta skrzynka trafia na stopień schodów. */
  private collect(c: Crate): void {
    const ctx = this.ctx;
    c.removed = true;
    this.phys.remove(c.item);
    const mesh = c.item.mesh as THREE.Mesh;
    const i = this.removed;
    this.removed++;
    const target = new THREE.Vector3(4.2 + i * 1.5, i * CRATE_H + CRATE_H / 2, 2);
    const from = mesh.position.clone();
    const q0 = mesh.quaternion.clone();
    const q1 = new THREE.Quaternion();
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
    const s0 = mesh.scale.clone();
    const s1 = new THREE.Vector3(1.4 / size.x, 1, 2.2 / size.z);
    this.stepAnims.push({ mesh, from, target, q0, q1, s0, s1, t: 0 });
    ctx.audio.sfx('pop');
    ctx.haptics.impact('medium');
    ctx.hud.setObjective(`Wysuń skrzynki: ${this.removed} / ${NEEDED}`);
    ctx.hud.setProgress(this.removed / NEEDED);
    this.fx.emit(from, { count: 14, speed: 3, life: 0.7, size: 0.14, color: '#e8c9a0', gravity: 6 });
    if (this.removed >= NEEDED) this.startClimb();
  }

  private stepAnims: Array<{ mesh: THREE.Mesh; from: THREE.Vector3; target: THREE.Vector3; q0: THREE.Quaternion; q1: THREE.Quaternion; s0: THREE.Vector3; s1: THREE.Vector3; t: number }> = [];

  private startClimb(): void {
    this.climbing = 1;
    this.climbPath = [new THREE.Vector3(this.fado.group.position.x, 0, 3.4)];
    for (let i = 0; i < NEEDED; i++) this.climbPath.push(new THREE.Vector3(4.2 + i * 1.5, (i + 1) * CRATE_H, 2));
    this.climbPath.push(new THREE.Vector3(4.2 + NEEDED * 1.5, NEEDED * CRATE_H + 0.2, 2));
    this.climbIdx = 0;
    this.ctx.hud.showHint('Schody gotowe!');
    this.ctx.audio.sfx('sparkle');
  }
  private climbIdx = 0;

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;

    // trzymana skrzynka podąża za palcem: poziomo i do kamery
    if (this.held) {
      const h = this.held;
      const target = new THREE.Vector3(h.startPos.x + (this.lastNx - h.startNx) * 7, 0, h.startPos.z - (this.lastNy - h.startNy) * 7);
      const cur = h.crate.item.body.translation();
      const vel = h.crate.item.body.linvel();
      const vx = clamp((target.x - cur.x) * 12, -5, 5);
      const vz = clamp((target.z - cur.z) * 12, -5, 5);
      h.crate.item.body.setLinvel({ x: vx, y: vel.y, z: vz } as RAPIER.Vector, true);
      h.crate.item.body.setAngvel({ x: 0, y: 0, z: 0 } as RAPIER.Vector, true);
    }
    this.phys.sync();

    // słoiki: pękają po spadku lub przesunięciu; schody animują się
    for (const j of this.jars) {
      if (j.broken) continue;
      const p = j.item.body.translation();
      const dropped = p.y < j.startY - 0.45;
      if (dropped) this.breakJar(j);
      else if (Math.hypot(p.x - j.startX, p.z - j.startZ) > 0.12 && !j.moved) j.moved = true;
    }
    for (const a of this.stepAnims) {
      a.t = Math.min(1, a.t + dt * 2.2);
      a.mesh.position.lerpVectors(a.from, a.target, a.t);
      a.mesh.position.y += Math.sin(a.t * Math.PI) * 1.2;
      a.mesh.quaternion.slerpQuaternions(a.q0, a.q1, a.t);
      a.mesh.scale.lerpVectors(a.s0, a.s1, a.t);
    }

    // Fado wspina się po schodach
    const m = this.fado.rig.motion;
    if (this.climbing === 1) {
      const next = this.climbPath[this.climbIdx + 1];
      const g = this.fado.group;
      if (!next) {
        this.climbing = 2;
        const intact = this.jars.every((j) => !j.broken && !j.moved);
        if (intact) this.collectGoldenBone();
        ctx.audio.sfx('bark');
        this.win({ stars: this.brokenJars === 0 ? 3 : this.brokenJars === 1 ? 2 : 1 });
      } else {
        const d = next.clone().sub(g.position);
        const dist = d.length();
        if (dist < 0.2) this.climbIdx++;
        else {
          g.position.add(d.multiplyScalar((3.8 * dt) / dist));
          g.rotation.y = damp(g.rotation.y, Math.atan2(d.x, d.z + 1e-4), 10, dt);
        }
        m.speed = 0.8;
        m.expression = 'run';
      }
    } else {
      m.speed = 0;
      m.expression = this.climbing === 2 ? 'happy' : this.held ? 'alert' : 'idle';
    }
    this.fado.rig.update(dt, t);
    this.sausage.rotation.y = Math.sin(t * 2) * 0.3;
    this.fx.update(dt, ctx);
  }

  private breakJar(j: Jar): void {
    const ctx = this.ctx;
    j.broken = true;
    this.brokenJars++;
    const p = j.item.body.translation();
    this.phys.remove(j.item);
    if (j.item.mesh) j.item.mesh.visible = false;
    this.fx.emit(new THREE.Vector3(p.x, p.y, p.z), { count: 40, speed: 4, life: 0.9, size: 0.12, color: '#ffc94a', gravity: 9 });
    ctx.audio.sfx('pop', { gain: 1.2 });
    ctx.audio.sfx('hit');
    ctx.haptics.pattern([60, 30, 100]);
    ctx.camera.shake(0.6, 0.5);
    ctx.hud.setCourage(1 - this.brokenJars / 3);
    ctx.hud.showHint('Słoik się stłukł!');
    if (this.brokenJars >= 2) this.lose();
  }

  protected onCleanup(): void {
    this.phys.dispose();
    this.fado.rig.dispose();
  }
}
