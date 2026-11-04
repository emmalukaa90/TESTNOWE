import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, cameraAnchor, clamp, cyl, dampAngle, glow, goldenBone, makeFado, mat, Particles, plane, sphere, spinBob, wrapAngle, type FadoActor } from '../kit';

interface Wall { cx: number; cz: number; hx: number; hz: number }
interface Bush { x: number; z: number; r: number; mesh: THREE.Object3D }
interface Can { x: number; z: number; tipped: boolean; mesh: THREE.Object3D }
interface Guard {
  group: THREE.Group;
  cone: THREE.Mesh;
  pos: THREE.Vector2;
  facing: number;
  route: THREE.Vector2[];
  idx: number;
  wait: number;
  investigate: THREE.Vector2 | null;
  investigateT: number;
  seeing: boolean;
}

const WALLS: Wall[] = [
  { cx: -9, cz: 8, hx: 5, hz: 0.8 }, { cx: 9, cz: 8, hx: 5, hz: 0.8 },
  { cx: 0, cz: -2, hx: 3, hz: 0.8 }, { cx: -11, cz: -2, hx: 3, hz: 0.8 }, { cx: 11, cz: -2, hx: 3, hz: 0.8 },
  { cx: -9, cz: -11, hx: 5, hz: 0.8 }, { cx: 9, cz: -11, hx: 5, hz: 0.8 },
];
const BOUNDS = { x: 15, zMin: -20, zMax: 20 };
const START = new THREE.Vector2(0, 17);
const EXIT = new THREE.Vector2(0, -17);
const SPEED = 4.6;
const CONE_HALF = THREE.MathUtils.degToRad(30);
const CONE_RANGE = 9;

function segHitsAabb(a: THREE.Vector2, b: THREE.Vector2, w: Wall): boolean {
  let t0 = 0;
  let t1 = 1;
  const d = b.clone().sub(a);
  const mins = [w.cx - w.hx, w.cz - w.hz];
  const maxs = [w.cx + w.hx, w.cz + w.hz];
  const o = [a.x, a.y];
  const dir = [d.x, d.y];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(dir[i]) < 1e-8) {
      if (o[i] < mins[i] || o[i] > maxs[i]) return false;
    } else {
      let ta = (mins[i] - o[i]) / dir[i];
      let tb = (maxs[i] - o[i]) / dir[i];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** Poziom 13: skradanie się przed hyclem — krzaki, wizjery i przewracane puszki. */
export class Game13Catcher extends BaseMinigame {
  readonly id = 13;

  private fado!: FadoActor;
  private fx!: Particles;
  private guards: Guard[] = [];
  private bushes: Bush[] = [];
  private cans: Can[] = [];
  private pos = START.clone();
  private target: THREE.Vector2 | null = null;
  private fingerId: number | null = null;
  private detect = 0;
  private detections = 0;
  private courage = 1;
  private hidden = false;
  private bone!: THREE.Group;
  private boneTaken = false;
  private bonePos = new THREE.Vector2(-13, 0);
  private noticeCd = 0;
  private exitRing!: THREE.Mesh;

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('dusk');
    const { dir } = addLighting(ctx, { sky: '#b09ac8', ground: '#2a2538', sun: '#ffb27a', sunIntensity: 2, sunPos: [-10, 16, 10], shadowRange: 26 });
    ctx.root.add(plane(36, 48, mat('#4b4a56', { roughness: 1 }), [0, 0, 0]));
    // ceglane ściany i kontenery
    const colors = ['#8a4b3c', '#4c6a8a', '#8a7a3c'];
    WALLS.forEach((w, i) => {
      ctx.root.add(box(w.hx * 2, 2.4, w.hz * 2, mat(colors[i % 3]), [w.cx, 1.2, w.cz]));
      ctx.root.add(box(w.hx * 2 + 0.2, 0.15, w.hz * 2 + 0.2, mat('#2a2a30'), [w.cx, 2.45, w.cz]));
    });
    ctx.root.add(box(0.8, 3, 48, mat('#5a5560'), [-BOUNDS.x - 0.4, 1.5, 0]), box(0.8, 3, 48, mat('#5a5560'), [BOUNDS.x + 0.4, 1.5, 0]));
    for (let z = -19; z <= 19; z += 4) ctx.root.add(sphere(0.18, glow('#ffd27a', 1.2), [-BOUNDS.x + 0.2, 2.6, z], 8), sphere(0.18, glow('#ffd27a', 1.2), [BOUNDS.x - 0.2, 2.6, z], 8));

    // krzaki
    for (const [x, z] of [[-6, 5], [6, 5], [-9, -5], [9, -5], [0, -7.5], [-3, 13], [4, 12]] as const) {
      const g = new THREE.Group();
      g.add(sphere(1.1, mat('#2f6b3a'), [0, 0.9, 0], 12), sphere(0.8, mat('#3d8548'), [0.6, 0.7, 0.4], 10), sphere(0.7, mat('#2a5c33'), [-0.6, 0.65, -0.3], 10));
      g.position.set(x, 0, z);
      ctx.root.add(g);
      this.bushes.push({ x, z, r: 1.4, mesh: g });
    }
    // puszki
    for (const [x, z] of [[-2, 14.5], [4, 4], [-5, -4]] as const) {
      const c = cyl(0.3, 0.3, 0.7, mat('#c9ccd1', { metalness: 0.7, roughness: 0.3 }), [x, 0.35, z], 12);
      ctx.root.add(c);
      this.cans.push({ x, z, tipped: false, mesh: c });
    }

    // strażnicy (hycle) z trasami patrolu
    const routes: Array<[number, number][]> = [
      [[-12, 11.5], [12, 11.5]],
      [[-12, 3], [12, 3]],
      [[-12, -6], [12, -6], [0, -6], [0, -15], [0, -6]],
    ];
    routes.forEach((r, i) => this.spawnGuard(ctx, r.map(([x, z]) => new THREE.Vector2(x, z)), i));

    this.exitRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.1, 8, 28), glow('#7bff9b', 2));
    this.exitRing.rotation.x = Math.PI / 2;
    this.exitRing.position.set(EXIT.x, 0.2, EXIT.y);
    ctx.root.add(this.exitRing);
    this.bone = goldenBone(1.4);
    this.bone.position.set(this.bonePos.x, 0.8, this.bonePos.y);
    ctx.root.add(this.bone);

    this.fado = makeFado(ctx, { scale: 0.8, lightDir: dir });
    this.fado.group.position.set(START.x, 0, START.y);
    this.fx = new Particles(120);
    ctx.root.add(this.fx.points);

    cameraAnchor(ctx, 0, 0, 0);
    ctx.camera.setTarget(this.fado.group);
    ctx.camera.apply({ offset: [0, 17, 8], look: [0, 0, -2], fov: 46, bokeh: 0.6, duration: 0 });
    ctx.hud.setObjective('Przemknij do wyjścia');
    ctx.hud.showHint('Trzymaj palec, by iść · w krzakach jesteś ukryty · stuknij puszkę, by zwabić hycla');
    ctx.hud.setCourage(1);
  }

  private spawnGuard(ctx: GameContext, route: THREE.Vector2[], i: number): void {
    const g = new THREE.Group();
    g.add(cyl(0.38, 0.45, 1.7, mat('#33415c'), [0, 0.95, 0], 10), sphere(0.34, mat('#e0b48a'), [0, 1.95, 0], 10), cyl(0.4, 0.4, 0.14, mat('#1f2a44'), [0, 2.2, 0], 10));
    const net = cyl(0.03, 0.03, 2.2, mat('#6a4a2a'), [0.5, 1.2, 0.3], 6);
    g.add(net, new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 16), mat('#ddd')));
    g.children[g.children.length - 1].position.set(0.5, 2.3, 0.3);
    // wizjer jako wachlarz trójkątów
    const fan = new THREE.BufferGeometry();
    const segs = 20;
    const verts: number[] = [0, 0.05, 0];
    for (let k = 0; k <= segs; k++) {
      const a = -CONE_HALF + (2 * CONE_HALF * k) / segs;
      verts.push(Math.sin(a) * CONE_RANGE, 0.05, Math.cos(a) * CONE_RANGE);
    }
    const idx: number[] = [];
    for (let k = 1; k <= segs; k++) idx.push(0, k, k + 1);
    fan.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    fan.setIndex(idx);
    const cone = new THREE.Mesh(fan, new THREE.MeshBasicMaterial({ color: '#ffe36a', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    g.add(cone);
    const start = route[0].clone();
    g.position.set(start.x, 0, start.y);
    ctx.root.add(g);
    this.guards.push({ group: g, cone, pos: start, facing: 0, route, idx: 1 % route.length, wait: 0, investigate: null, investigateT: 0, seeing: false });
    void i;
  }

  startGame(): void {
    this.ctx.audio.music('tension');
    this.ctx.audio.setMusicIntensity(0.35);
  }

  handleInput(e: InputEvent): void {
    if (e.type === 'pointer-down' && this.fingerId === null) {
      this.fingerId = e.pointerId;
      this.setTarget(e.nx, e.ny);
      // ewentualne przewrócenie puszki (musi być blisko)
      const p = this.ctx.groundPoint(e.nx, e.ny, 0);
      if (p) {
        for (const c of this.cans) {
          if (!c.tipped && Math.hypot(p.x - c.x, p.z - c.z) < 1.4 && Math.hypot(this.pos.x - c.x, this.pos.y - c.z) < 3.4) this.tip(c);
        }
      }
    } else if (e.type === 'pointer-move' && e.pointerId === this.fingerId) {
      this.setTarget(e.nx, e.ny);
    } else if (e.type === 'pointer-up' && e.pointerId === this.fingerId) {
      this.fingerId = null;
      this.target = null;
    }
  }

  private setTarget(nx: number, ny: number): void {
    const p = this.ctx.groundPoint(nx, ny, 0);
    if (p) this.target = new THREE.Vector2(p.x, p.z);
  }

  private tip(c: Can): void {
    const ctx = this.ctx;
    c.tipped = true;
    c.mesh.rotation.z = Math.PI / 2;
    c.mesh.position.y = 0.3;
    ctx.audio.sfx('crate');
    ctx.audio.sfx('hit', { gain: 0.6 });
    ctx.haptics.impact('medium');
    this.fx.emit(new THREE.Vector3(c.x, 0.4, c.z), { count: 12, speed: 3, life: 0.7, size: 0.11, color: '#ffffff', gravity: 5 });
    let best: Guard | null = null;
    let bestD = 18;
    for (const gd of this.guards) {
      const d = gd.pos.distanceTo(new THREE.Vector2(c.x, c.z));
      if (d < bestD) {
        bestD = d;
        best = gd;
      }
    }
    if (best) {
      best.investigate = new THREE.Vector2(c.x, c.z);
      best.investigateT = 0;
      ctx.hud.showHint('Hycel idzie sprawdzić hałas!');
    }
  }

  private blocked(x: number, z: number, r: number): Wall | null {
    for (const w of WALLS) {
      if (Math.abs(x - w.cx) < w.hx + r && Math.abs(z - w.cz) < w.hz + r) return w;
    }
    return null;
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    const g = this.fado.group;
    const m = this.fado.rig.motion;
    this.noticeCd = Math.max(0, this.noticeCd - dt);

    // ruch Fado do punktu palca
    let moved = 0;
    if (this.target) {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.y - this.pos.y;
      const d = Math.hypot(dx, dz);
      if (d > 0.25) {
        const step = Math.min(d, SPEED * dt);
        const nx = this.pos.x + (dx / d) * step;
        const nz = this.pos.y + (dz / d) * step;
        // osie osobno, by ślizgać się po ścianach
        if (!this.blocked(nx, this.pos.y, 0.4)) this.pos.x = nx;
        if (!this.blocked(this.pos.x, nz, 0.4)) this.pos.y = nz;
        this.pos.x = clamp(this.pos.x, -BOUNDS.x + 0.5, BOUNDS.x - 0.5);
        this.pos.y = clamp(this.pos.y, BOUNDS.zMin + 0.5, BOUNDS.zMax - 0.5);
        moved = step / dt;
        g.rotation.y = dampAngle(g.rotation.y, Math.atan2(dx, dz), 12, dt);
      }
    }
    g.position.set(this.pos.x, 0, this.pos.y);
    this.hidden = this.bushes.some((b) => Math.hypot(this.pos.x - b.x, this.pos.y - b.z) < b.r * 0.85);
    m.speed = clamp(moved / SPEED, 0, 1);
    m.expression = this.detect > 0.5 ? 'scared' : this.hidden ? 'sniff' : moved > 0.3 ? 'run' : 'alert';
    g.visible = true;
    this.fado.rig.update(dt, t);

    // strażnicy
    let anySeeing = false;
    const range = CONE_RANGE / (ctx.assist > 1 ? 1.25 : 1);
    for (const gd of this.guards) {
      this.moveGuard(gd, dt);
      gd.group.position.set(gd.pos.x, 0, gd.pos.y);
      gd.group.rotation.y = gd.facing;
      // widoczność
      const to = new THREE.Vector2(this.pos.x - gd.pos.x, this.pos.y - gd.pos.y);
      const dist = to.length();
      let sees = false;
      if (!this.hidden && dist < range) {
        const ang = Math.abs(wrapAngle(Math.atan2(to.x, to.y) - gd.facing));
        if (ang < CONE_HALF && !WALLS.some((w) => segHitsAabb(gd.pos, this.pos, w))) sees = true;
      }
      gd.seeing = sees;
      (gd.cone.material as THREE.MeshBasicMaterial).color.set(sees ? '#ff4a4a' : gd.investigate ? '#ffb347' : '#ffe36a');
      (gd.cone.material as THREE.MeshBasicMaterial).opacity = sees ? 0.4 : 0.2;
      gd.cone.scale.set(1, 1, range / CONE_RANGE);
      if (sees) {
        anySeeing = true;
        const closeness = 1 - dist / range;
        this.detect += dt * (0.9 + closeness * 1.6) / ctx.assist;
      }
    }
    if (!anySeeing) this.detect = Math.max(0, this.detect - dt * 0.6);
    else if (this.noticeCd <= 0) {
      this.noticeCd = 0.8;
      ctx.audio.sfx('tick', { gain: 0.5 });
      ctx.haptics.impact('light');
    }
    ctx.haptics.setHeartbeat(this.detect > 0.2 ? 80 + this.detect * 80 : 0, 0.3 + this.detect * 0.5);
    ctx.audio.setMusicIntensity(0.3 + this.detect * 0.7);
    if (this.detect >= 1) this.caught();

    if (!this.boneTaken) {
      spinBob(this.bone, t, 0.8);
      if (Math.hypot(this.pos.x - this.bonePos.x, this.pos.y - this.bonePos.y) < 1.1) {
        this.boneTaken = true;
        this.bone.visible = false;
        ctx.audio.sfx('bone');
        this.fx.emit(new THREE.Vector3(this.bonePos.x, 0.8, this.bonePos.y), { count: 28, speed: 3, life: 1, size: 0.15, color: '#ffd23f' });
      }
    }
    this.exitRing.rotation.z = t * 2;
    ctx.hud.setProgress(clamp(1 - Math.abs(this.pos.y - EXIT.y) / (START.y - EXIT.y), 0, 1));
    this.fx.update(dt, ctx);

    if (Math.hypot(this.pos.x - EXIT.x, this.pos.y - EXIT.y) < 1.4) {
      if (this.detections === 0) this.collectGoldenBone();
      this.win({ stars: this.detections === 0 ? 3 : this.detections === 1 ? 2 : 1 });
    }
  }

  private moveGuard(gd: Guard, dt: number): void {
    const speed = gd.investigate ? 4.2 : 2.3;
    let goal: THREE.Vector2;
    if (gd.investigate) {
      goal = gd.investigate;
      if (gd.pos.distanceTo(goal) < 0.8) {
        gd.investigateT += dt;
        if (gd.investigateT > 4) {
          gd.investigate = null;
          gd.investigateT = 0;
        }
        gd.facing += dt * 1.6; // rozgląda się
        return;
      }
    } else {
      goal = gd.route[gd.idx];
      if (gd.wait > 0) {
        gd.wait -= dt;
        gd.facing += dt * 0.6 * Math.sin(this.elapsed + gd.pos.x);
        return;
      }
      if (gd.pos.distanceTo(goal) < 0.4) {
        gd.idx = (gd.idx + 1) % gd.route.length;
        gd.wait = 0.8;
        return;
      }
    }
    const dx = goal.x - gd.pos.x;
    const dz = goal.y - gd.pos.y;
    const d = Math.hypot(dx, dz);
    const step = Math.min(d, speed * dt);
    const nx = gd.pos.x + (dx / d) * step;
    const nz = gd.pos.y + (dz / d) * step;
    if (!this.blocked(nx, nz, 0.4)) gd.pos.set(nx, nz);
    gd.facing = dampAngle(gd.facing, Math.atan2(dx, dz), 6, dt);
  }

  private caught(): void {
    const ctx = this.ctx;
    this.detections++;
    this.detect = 0;
    this.courage = clamp(this.courage - 0.34 / ctx.assist, 0, 1);
    ctx.hud.setCourage(this.courage);
    ctx.audio.sfx('lose', { gain: 0.6 });
    ctx.audio.sfx('hit');
    ctx.haptics.pattern([100, 50, 100]);
    ctx.camera.shake(0.8, 0.6);
    ctx.hud.showHint('Zauważył Cię! Wracasz na start.');
    this.pos.copy(START);
    this.target = null;
    for (const gd of this.guards) {
      gd.investigate = null;
      gd.wait = 1.2;
    }
    if (this.courage <= 0.001) this.lose();
  }

  protected onCleanup(): void {
    this.fado.rig.dispose();
  }
}
