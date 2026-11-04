import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, cameraAnchor, clamp, cone, damp, faceDirection, glow, goldenBone, makeFado, mat, Particles, plane, spinBob, type FadoActor } from '../kit';

const N = 7;
const CELL = 2.6;
const R = 0.38;

interface Gate {
  a: number;
  b: number;
  mesh: THREE.Group;
  open: number;
  midX: number;
  midZ: number;
}

const idx = (cx: number, cz: number) => cz * N + cx;

/** Poziom 3: labirynt z ciernistymi bramami — jeden palec trzyma bramy, drugi prowadzi Fado. */
export class Game03Thorns extends BaseMinigame {
  readonly id = 3;

  private fado!: FadoActor;
  private fx!: Particles;
  /** otwarte przejścia między komórkami (klucz "a-b", a<b) */
  private open = new Set<string>();
  private gates: Gate[] = [];
  private pos = new THREE.Vector3();
  private bone!: THREE.Group;
  private boneCell = 0;
  private boneTaken = false;
  private goal = new THREE.Vector3();
  private holdId: number | null = null;
  private steerId: number | null = null;
  private steerOrigin = new THREE.Vector2();
  private steerVec = new THREE.Vector2();
  private courage = 1;
  private pricks = 0;
  private invulnerable = 0;
  private goalRing!: THREE.Mesh;

  private key(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }

  private cellCenter(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const cx = i % N;
    const cz = Math.floor(i / N);
    return out.set((cx - (N - 1) / 2) * CELL, 0, (cz - (N - 1) / 2) * CELL);
  }

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set({ background: '#274c36', fogColor: '#274c36', fogNear: 30, fogFar: 80 });
    const { dir } = addLighting(ctx, { sky: '#cfe8c8', ground: '#2a3a22', sunIntensity: 2.6, sunPos: [-6, 18, 8], shadowRange: 18 });
    ctx.root.add(plane(60, 60, mat('#3f6b3c', { roughness: 1 }), [0, 0, 0]));
    this.generate(ctx);
    this.buildWalls(ctx);

    this.goalRing = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.09, 8, 28), glow('#ffd23f', 2));
    this.goalRing.rotation.x = Math.PI / 2;
    this.cellCenter(N * N - 1, this.goal);
    this.goalRing.position.copy(this.goal).setY(0.15);
    ctx.root.add(this.goalRing);
    ctx.scent.addTrail({ id: 'maze-goal', kind: 'klara', points: [this.goal.clone().add(new THREE.Vector3(0, 0.05, 0.5)), this.goal.clone().setY(0.05), this.goal.clone().add(new THREE.Vector3(0, 0.05, -0.5))], width: 0.5 });

    this.bone = goldenBone(1.2);
    this.cellCenter(this.boneCell, this.bone.position);
    this.bone.position.y = 0.7;
    ctx.root.add(this.bone);

    this.fado = makeFado(ctx, { scale: 0.8, lightDir: dir });
    this.cellCenter(0, this.pos);
    this.fx = new Particles(120);
    ctx.root.add(this.fx.points);

    cameraAnchor(ctx, 0, 0, 0.8);
    ctx.camera.apply({ offset: [0, 24, 9.5], look: [0, 0, 0], fov: 44, bokeh: 0.5, duration: 0 });
    ctx.hud.setObjective('Dotrzyj do tropu Klary');
    ctx.hud.showHint('Lewa strona: trzymaj bramy · prawa strona: prowadź Fado');
  }

  /** Generator labiryntu (DFS) + wybór bram na ścieżce rozwiązania i kości w ślepym zaułku. */
  private generate(ctx: GameContext): void {
    const visited = new Array<boolean>(N * N).fill(false);
    const stack = [0];
    visited[0] = true;
    while (stack.length > 0) {
      const cur = stack[stack.length - 1];
      const cx = cur % N;
      const cz = Math.floor(cur / N);
      const nbrs: number[] = [];
      if (cx > 0) nbrs.push(idx(cx - 1, cz));
      if (cx < N - 1) nbrs.push(idx(cx + 1, cz));
      if (cz > 0) nbrs.push(idx(cx, cz - 1));
      if (cz < N - 1) nbrs.push(idx(cx, cz + 1));
      const free = nbrs.filter((n) => !visited[n]);
      if (free.length === 0) {
        stack.pop();
        continue;
      }
      const next = free[Math.floor(ctx.random() * free.length)];
      visited[next] = true;
      this.open.add(this.key(cur, next));
      stack.push(next);
    }
    // kilka dodatkowych przejść, by labirynt nie był „drzewem”
    for (let i = 0; i < 6; i++) {
      const cx = Math.floor(ctx.random() * (N - 1));
      const cz = Math.floor(ctx.random() * N);
      this.open.add(this.key(idx(cx, cz), idx(cx + 1, cz)));
    }

    const path = this.solve(0, N * N - 1);
    // trzy bramy na trasie (nie na samym początku)
    const picks = [Math.floor(path.length * 0.25), Math.floor(path.length * 0.5), Math.floor(path.length * 0.75)];
    for (const p of picks) {
      const a = path[p];
      const b = path[p + 1];
      if (b === undefined) continue;
      const ca = this.cellCenter(a);
      const cb = this.cellCenter(b);
      const mesh = new THREE.Group();
      const bushMat = mat('#2c6b2f');
      const spike = mat('#6b3b22');
      mesh.add(box(0.5, 1.3, CELL * 0.85, bushMat, [0, 0.65, 0]));
      for (let i = 0; i < 7; i++) {
        const c = cone(0.1, 0.55, spike, [(i % 2 ? 0.28 : -0.28), 0.4 + (i / 7) * 0.9, (i / 6 - 0.5) * CELL * 0.8]);
        c.rotation.z = (i % 2 ? -1 : 1) * Math.PI / 2;
        mesh.add(c);
      }
      const mx = (ca.x + cb.x) / 2;
      const mz = (ca.z + cb.z) / 2;
      mesh.position.set(mx, 0, mz);
      if (ca.x !== cb.x) mesh.rotation.y = 0;
      else mesh.rotation.y = Math.PI / 2;
      ctx.root.add(mesh);
      this.gates.push({ a, b, mesh, open: 0, midX: mx, midZ: mz });
    }

    // kość w najdalszym ślepym zaułku od ścieżki
    const onPath = new Set(path);
    let best = -1;
    let bestScore = -1;
    for (let i = 1; i < N * N - 1; i++) {
      if (onPath.has(i)) continue;
      const deg = this.neighbors(i).length;
      if (deg !== 1) continue;
      const score = this.solve(0, i).length;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    this.boneCell = best > 0 ? best : Math.floor((N * N) / 2);
  }

  private neighbors(i: number): number[] {
    const cx = i % N;
    const cz = Math.floor(i / N);
    const out: number[] = [];
    const tryAdd = (n: number) => {
      if (this.open.has(this.key(i, n))) out.push(n);
    };
    if (cx > 0) tryAdd(idx(cx - 1, cz));
    if (cx < N - 1) tryAdd(idx(cx + 1, cz));
    if (cz > 0) tryAdd(idx(cx, cz - 1));
    if (cz < N - 1) tryAdd(idx(cx, cz + 1));
    return out;
  }

  private solve(from: number, to: number): number[] {
    const prev = new Map<number, number>([[from, -1]]);
    const queue = [from];
    while (queue.length > 0) {
      const cur = queue.shift() as number;
      if (cur === to) break;
      for (const n of this.neighbors(cur)) {
        if (!prev.has(n)) {
          prev.set(n, cur);
          queue.push(n);
        }
      }
    }
    const path: number[] = [];
    let c: number | undefined = to;
    while (c !== undefined && c !== -1) {
      path.push(c);
      c = prev.get(c);
    }
    return path.reverse();
  }

  private buildWalls(ctx: GameContext): void {
    const wallMat = mat('#1f4d2a');
    const edgeMat = mat('#2a6a35');
    const count = N * (N + 1) * 2;
    const horiz = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL + 0.4, 1.2, 0.4), wallMat, count);
    const dummy = new THREE.Object3D();
    let n = 0;
    const half = (N * CELL) / 2;
    // ściany poziome (wzdłuż X) między wierszami i ściany pionowe (obrócone)
    for (let cz = 0; cz <= N; cz++) {
      for (let cx = 0; cx < N; cx++) {
        const closed = cz === 0 || cz === N || !this.open.has(this.key(idx(cx, cz - 1), idx(cx, cz)));
        if (!closed) continue;
        dummy.position.set((cx - (N - 1) / 2) * CELL, 0.6, cz * CELL - half);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        horiz.setMatrixAt(n++, dummy.matrix);
      }
    }
    for (let cx = 0; cx <= N; cx++) {
      for (let cz = 0; cz < N; cz++) {
        const closed = cx === 0 || cx === N || !this.open.has(this.key(idx(cx - 1, cz), idx(cx, cz)));
        if (!closed) continue;
        dummy.position.set(cx * CELL - half, 0.6, (cz - (N - 1) / 2) * CELL);
        dummy.rotation.set(0, Math.PI / 2, 0);
        dummy.updateMatrix();
        horiz.setMatrixAt(n++, dummy.matrix);
      }
    }
    horiz.count = n;
    horiz.castShadow = true;
    horiz.receiveShadow = true;
    horiz.instanceMatrix.needsUpdate = true;
    ctx.root.add(horiz);
    // kępy liści na ścianach dla „puszystego” wyglądu
    const tuft = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.35, 0), edgeMat, n * 2);
    let t = 0;
    for (let i = 0; i < n; i++) {
      horiz.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      const along = new THREE.Vector3(1, 0, 0).applyQuaternion(dummy.quaternion);
      for (const s of [-0.45, 0.45]) {
        const m = new THREE.Matrix4().makeTranslation(dummy.position.x + along.x * s * CELL, 1.25, dummy.position.z + along.z * s * CELL);
        tuft.setMatrixAt(t++, m);
      }
    }
    tuft.count = t;
    tuft.instanceMatrix.needsUpdate = true;
    ctx.root.add(tuft);
  }

  startGame(): void {
    this.ctx.audio.music('forest');
    this.ctx.hud.setCourage(1);
  }

  handleInput(e: InputEvent): void {
    if (e.type === 'pointer-down') {
      if (e.nx < 0 && this.holdId === null) {
        this.holdId = e.pointerId;
        this.ctx.audio.sfx('rustle');
        this.ctx.haptics.impact('light');
      } else if (e.nx >= 0 && this.steerId === null) {
        this.steerId = e.pointerId;
        this.steerOrigin.set(e.nx, e.ny);
        this.steerVec.set(0, 0);
      }
    } else if (e.type === 'pointer-move' && e.pointerId === this.steerId) {
      this.steerVec.set(e.nx - this.steerOrigin.x, e.ny - this.steerOrigin.y);
    } else if (e.type === 'pointer-up') {
      if (e.pointerId === this.holdId) {
        this.holdId = null;
        this.ctx.audio.sfx('rustle');
      }
      if (e.pointerId === this.steerId) {
        this.steerId = null;
        this.steerVec.set(0, 0);
      }
    }
  }

  /** Czy przejście między sąsiednimi komórkami jest teraz drożne? */
  private passable(a: number, b: number): boolean {
    if (!this.open.has(this.key(a, b))) return false;
    const gate = this.gates.find((g) => this.key(g.a, g.b) === this.key(a, b));
    return !gate || gate.open > 0.85;
  }

  private cellOf(x: number, z: number): { cx: number; cz: number } {
    return {
      cx: clamp(Math.floor(x / CELL + N / 2), 0, N - 1),
      cz: clamp(Math.floor(z / CELL + N / 2), 0, N - 1),
    };
  }

  private move(dx: number, dz: number): void {
    // ruch osiami osobno, z blokadą na ścianach (zamknięte przejścia) i marginesem R
    const half = (N * CELL) / 2;
    for (const axis of ['x', 'z'] as const) {
      const delta = axis === 'x' ? dx : dz;
      if (delta === 0) continue;
      const { cx, cz } = this.cellOf(this.pos.x, this.pos.z);
      const cur = idx(cx, cz);
      let nx = this.pos.x + (axis === 'x' ? delta : 0);
      let nz = this.pos.z + (axis === 'z' ? delta : 0);
      const minX = (cx - N / 2) * CELL;
      const minZ = (cz - N / 2) * CELL;
      const lim = (v: number, lo: number, hi: number) => clamp(v, lo, hi);
      if (axis === 'x') {
        if (delta > 0 && nx > minX + CELL - R) {
          if (cx === N - 1 || !this.passable(cur, idx(cx + 1, cz))) nx = minX + CELL - R;
        } else if (delta < 0 && nx < minX + R) {
          if (cx === 0 || !this.passable(cur, idx(cx - 1, cz))) nx = minX + R;
        }
        // przy przechodzeniu do sąsiedniej komórki trzymaj się osi korytarza
        const cxn = this.cellOf(nx, nz).cx;
        if (cxn !== cx) nz = lim(nz, minZ + R + 0.05, minZ + CELL - R - 0.05);
        this.pos.x = lim(nx, -half + R, half - R);
        this.pos.z = nz;
      } else {
        if (delta > 0 && nz > minZ + CELL - R) {
          if (cz === N - 1 || !this.passable(cur, idx(cx, cz + 1))) nz = minZ + CELL - R;
        } else if (delta < 0 && nz < minZ + R) {
          if (cz === 0 || !this.passable(cur, idx(cx, cz - 1))) nz = minZ + R;
        }
        const czn = this.cellOf(nx, nz).cz;
        if (czn !== cz) nx = lim(nx, minX + R + 0.05, minX + CELL - R - 0.05);
        this.pos.z = lim(nz, -half + R, half - R);
        this.pos.x = nx;
      }
    }
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    // bramy: otwarte, gdy lewy palec jest na ekranie
    const holding = this.holdId !== null;
    for (const g of this.gates) {
      g.open = damp(g.open, holding ? 1 : 0, 7, dt);
      g.mesh.scale.y = Math.max(0.04, 1 - g.open * 0.96);
      g.mesh.position.y = 0;
    }

    // sterowanie wirtualnym drążkiem
    const len = this.steerVec.length();
    let vx = 0;
    let vz = 0;
    if (len > 0.03) {
      const speed = clamp(len / 0.22, 0, 1) * 3.4;
      vx = (this.steerVec.x / len) * speed;
      vz = (-this.steerVec.y / len) * speed;
    }
    const before = this.pos.clone();
    this.move(vx * dt, vz * dt);

    // ukłucie: ktoś stoi w zamkniętej bramie (puścił lewy palec za wcześnie)
    for (const g of this.gates) {
      if (g.open < 0.5 && this.invulnerable <= 0) {
        const near = Math.hypot(this.pos.x - g.midX, this.pos.z - g.midZ) < 0.75;
        const towards = vx * (g.midX - before.x) + vz * (g.midZ - before.z) > 0;
        if (near && (towards || len > 0.03)) {
          this.prick(g);
          break;
        }
      }
    }

    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-4);
    const m = this.fado.rig.motion;
    m.speed = clamp(moved / 3.4, 0, 1);
    m.expression = this.courage < 0.4 ? 'scared' : moved > 0.3 ? 'run' : 'idle';
    faceDirection(this.fado.group, this.pos.x - before.x, this.pos.z - before.z, 12, dt);
    this.fado.group.position.copy(this.pos);
    this.fado.group.visible = this.invulnerable <= 0 || Math.floor(t * 14) % 2 === 0;
    this.fado.rig.update(dt, t);

    // kość i meta
    if (!this.boneTaken) {
      spinBob(this.bone, t, 0.7);
      if (this.pos.distanceTo(new THREE.Vector3(this.bone.position.x, 0, this.bone.position.z)) < 0.9) {
        this.boneTaken = true;
        this.bone.visible = false;
        ctx.audio.sfx('bone');
        ctx.haptics.impact('medium');
        this.fx.emit(this.pos.clone().setY(0.8), { count: 30, speed: 3, life: 1, size: 0.16, color: '#ffd23f' });
      }
    }
    this.goalRing.rotation.z = t * 2;
    this.goalRing.scale.setScalar(1 + Math.sin(t * 4) * 0.08);

    // postęp liczony jako odległość po ścieżce do mety (prosto: odległość euklidesowa)
    const total = this.goal.distanceTo(this.cellCenter(0));
    ctx.hud.setProgress(1 - clamp(this.pos.distanceTo(this.goal) / total, 0, 1));
    ctx.haptics.setProximity(1 - clamp(this.pos.distanceTo(this.goal) / 8, 0, 1));

    if (this.pos.distanceTo(this.goal) < 0.9) {
      const stars = this.pricks === 0 ? 3 : this.pricks === 1 ? 2 : 1;
      if (this.pricks === 0 && this.boneTaken) this.collectGoldenBone();
      this.win({ stars });
    }
    this.fx.update(dt, ctx);
  }

  private prick(g: Gate): void {
    const ctx = this.ctx;
    this.pricks++;
    this.invulnerable = 1.2;
    this.courage = clamp(this.courage - 0.34 / ctx.assist, 0, 1);
    ctx.hud.setCourage(this.courage);
    ctx.audio.sfx('hit');
    ctx.haptics.pattern([50, 40, 70]);
    ctx.camera.shake(0.5, 0.4);
    this.fx.emit(this.pos.clone().setY(0.6), { count: 20, speed: 3, life: 0.6, size: 0.12, color: '#ff6b4a', gravity: 6 });
    // odrzut do komórki, z której przyszedł Fado
    const back = this.cellOf(this.pos.x, this.pos.z);
    const a = idx(back.cx, back.cz) === g.a ? g.a : g.b;
    const aPos = this.cellCenter(a);
    const bPos = this.cellCenter(a === g.a ? g.b : g.a);
    const useA = Math.hypot(this.pos.x - aPos.x, this.pos.z - aPos.z) < Math.hypot(this.pos.x - bPos.x, this.pos.z - bPos.z);
    this.pos.copy(useA ? aPos : bPos);
    if (this.courage <= 0.001) this.lose();
  }

  protected onCleanup(): void {
    this.ctx.scent.removeTrail('maze-goal');
    this.fado.rig.dispose();
  }
}
