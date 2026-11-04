import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, damp, glow, makeFado, mat, Particles, plane, type FadoActor } from '../kit';

const N = 6;
const EXIT_COL = 4;
const FADO_ROW = 2;
const TIME_LIMIT = 150;

interface Block {
  id: number;
  horiz: boolean;
  len: number;
  /** pozycja początkowa (kolumna lub wiersz), stała druga współrzędna */
  fixed: number;
  mesh: THREE.Group;
  pos: number;
  /** pozycja całkowita po zwolnieniu */
  cell: number;
}

type State = number[];

function key(s: State): string {
  return s.join(',');
}

/** Poziom 17: przesuwane bagaże jak w Rush Hour — generowane losowo i sprawdzane BFS-em. */
export class Game17Luggage extends BaseMinigame {
  readonly id = 17;

  private fado!: FadoActor;
  private fx!: Particles;
  private blocks: Block[] = [];
  private raycaster = new THREE.Raycaster();
  private drag: { block: Block; id: number; offset: number; startCell: number } | null = null;
  private moves = 0;
  private timeLeft = TIME_LIMIT;
  private hints = 0;
  private hintBlock: Block | null = null;
  private hintT = 0;
  private bestLen = 0;
  private exiting = 0;
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmp = new THREE.Vector3();
  private conductor!: THREE.Group;

  private cellCenter(col: number, row: number): { x: number; z: number } {
    return { x: col - (N - 1) / 2, z: row - (N - 1) / 2 };
  }

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set({ background: '#2b2233', fogColor: '#2b2233', fogNear: 18, fogFar: 50 });
    addLighting(ctx, { sky: '#ffd9a8', ground: '#4a3a30', hemi: 0.9, sun: '#ffe2b8', sunIntensity: 2, sunPos: [-3, 14, 6] });
    // wagon: podłoga w kratę, ściany, okna
    ctx.root.add(box(N + 2, 0.4, N + 2, mat('#6b4a3a'), [0, -0.2, 0]));
    for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) {
      const p = this.cellCenter(c, r);
      ctx.root.add(plane(0.96, 0.96, mat((c + r) % 2 ? '#8a6a52' : '#7a5a44', { roughness: 1 }), [p.x, 0.01, p.z]));
    }
    ctx.root.add(box(N + 2, 2.5, 0.3, mat('#4a3a46'), [0, 1.25, -(N + 1) / 2]));
    ctx.root.add(box(0.3, 2.5, N + 2, mat('#4a3a46'), [-(N + 1) / 2, 1.25, 0]));
    for (let i = 0; i < 3; i++) ctx.root.add(box(1.2, 0.9, 0.05, glow('#9fd1ff', 0.7), [-2 + i * 2, 1.5, -(N + 1) / 2 + 0.2]));
    // drzwi (wyjście) po prawej stronie rzędu Fado
    const door = this.cellCenter(N, FADO_ROW);
    ctx.root.add(box(0.2, 2.2, 1.2, glow('#7bff9b', 0.9), [door.x + 0.1, 1.1, door.z]));

    this.generate(ctx);
    for (const b of this.blocks) this.buildBlockMesh(ctx, b);

    // konduktor w tle, pojawia się w miarę upływu czasu
    this.conductor = new THREE.Group();
    this.conductor.add(box(0.6, 1.6, 0.4, mat('#2a3a6a'), [0, 0.8, 0]), box(0.5, 0.5, 0.5, mat('#e0b48a'), [0, 1.9, 0]), box(0.6, 0.2, 0.6, mat('#1a1a2a'), [0, 2.2, 0]));
    this.conductor.position.set(-(N + 4), 0, (N + 1) / 2);
    ctx.root.add(this.conductor);

    this.fx = new Particles(120);
    ctx.root.add(this.fx.points);
    this.timeLeft = TIME_LIMIT * ctx.assist;

    ctx.camera.apply({ offset: [0, 9.5, 5.5], look: [0, 0, 0], fov: 42, bokeh: 0.5, duration: 0 });
    ctx.camera.setTarget(this.makeAnchor(ctx));
    ctx.hud.setObjective('Uwolnij drogę Fado do wyjścia');
    ctx.hud.setActions([{ id: 'hint', label: 'Podpowiedź', icon: '💡' }]);
    ctx.hud.showHint('Przeciągaj bagaże wzdłuż ich osi. Fado jedzie na wózku.');
    ctx.hud.setCourage(1);
  }

  private makeAnchor(ctx: GameContext): THREE.Object3D {
    const a = new THREE.Object3D();
    ctx.root.add(a);
    return a;
  }

  /* --------------------------- generator + solver --------------------------- */

  private generate(ctx: GameContext): void {
    let best: { blocks: Omit<Block, 'mesh'>[]; len: number; sol: Array<{ block: number; to: number }> } | null = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const defs = this.randomSolved(ctx);
      const scrambled = this.scramble(ctx, defs, 60);
      const sol = this.solve(scrambled);
      if (!sol) continue;
      if (!best || (sol.length > best.len && sol.length <= 22)) best = { blocks: scrambled, len: sol.length, sol };
      if (sol.length >= 9 && sol.length <= 20) {
        best = { blocks: scrambled, len: sol.length, sol };
        break;
      }
    }
    if (!best) {
      // awaryjny, prosty układ
      const fallback = this.randomSolved(ctx);
      best = { blocks: fallback, len: 0, sol: [] };
    }
    this.blocks = best.blocks.map((b) => ({ ...b, mesh: new THREE.Group() }));
    this.bestLen = best.len;
  }

  private occupancy(blocks: Array<Pick<Block, 'horiz' | 'len' | 'fixed' | 'cell'>>, ignore = -1): boolean[][] {
    const occ = Array.from({ length: N }, () => new Array<boolean>(N).fill(false));
    blocks.forEach((b, i) => {
      if (i === ignore) return;
      for (let k = 0; k < b.len; k++) {
        const c = b.horiz ? b.cell + k : b.fixed;
        const r = b.horiz ? b.fixed : b.cell + k;
        if (c >= 0 && c < N && r >= 0 && r < N) occ[r][c] = true;
      }
    });
    return occ;
  }

  /** Układ „rozwiązany”: Fado stoi przy wyjściu, reszta losowo, bez nakładania. */
  private randomSolved(ctx: GameContext): Omit<Block, 'mesh'>[] {
    const blocks: Omit<Block, 'mesh'>[] = [{ id: 0, horiz: true, len: 2, fixed: FADO_ROW, pos: EXIT_COL, cell: EXIT_COL }];
    const target = 8 + Math.floor(ctx.random() * 3);
    let guard = 0;
    while (blocks.length < target && guard++ < 200) {
      const horiz = ctx.random() < 0.45;
      const len = ctx.random() < 0.3 ? 3 : 2;
      const fixed = Math.floor(ctx.random() * N);
      if (horiz && fixed === FADO_ROW) continue;
      const cell = Math.floor(ctx.random() * (N - len + 1));
      const cand = { id: blocks.length, horiz, len, fixed, pos: cell, cell };
      const occ = this.occupancy(blocks);
      let ok = true;
      for (let k = 0; k < len; k++) {
        const c = horiz ? cell + k : fixed;
        const r = horiz ? fixed : cell + k;
        if (occ[r][c]) ok = false;
      }
      if (ok) blocks.push(cand);
    }
    return blocks;
  }

  private scramble(ctx: GameContext, start: Omit<Block, 'mesh'>[], steps: number, depth = 0): Omit<Block, 'mesh'>[] {
    const blocks = start.map((b) => ({ ...b }));
    for (let i = 0; i < steps; i++) {
      const idx = Math.floor(ctx.random() * blocks.length);
      const b = blocks[idx];
      const dirs = [-1, 1];
      const d = dirs[Math.floor(ctx.random() * 2)];
      const nc = b.cell + d;
      if (nc < 0 || nc + b.len > N) continue;
      const occ = this.occupancy(blocks, idx);
      const c = b.horiz ? (d > 0 ? b.cell + b.len : nc) : b.fixed;
      const r = b.horiz ? b.fixed : d > 0 ? b.cell + b.len : nc;
      if (!occ[r][c]) {
        b.cell = nc;
        b.pos = nc;
      }
    }
    // Fado nie może zaczynać już przy wyjściu
    if (blocks[0].cell >= EXIT_COL && depth < 8) return this.scramble(ctx, blocks, 40, depth + 1);
    return blocks;
  }

  /** BFS po stanach (pozycje wszystkich bloków); zwraca listę ruchów do wyjścia. */
  private solve(blocks: Omit<Block, 'mesh'>[]): Array<{ block: number; to: number }> | null {
    const start: State = blocks.map((b) => b.cell);
    const meta = blocks.map((b) => ({ horiz: b.horiz, len: b.len, fixed: b.fixed }));
    const prev = new Map<string, { from: string; block: number; to: number }>();
    const seen = new Set<string>([key(start)]);
    let queue: State[] = [start];
    let nodes = 0;
    while (queue.length > 0 && nodes < 90000) {
      const next: State[] = [];
      for (const s of queue) {
        nodes++;
        if (s[0] >= EXIT_COL) {
          const path: Array<{ block: number; to: number }> = [];
          let k = key(s);
          while (prev.has(k)) {
            const p = prev.get(k) as { from: string; block: number; to: number };
            path.push({ block: p.block, to: p.to });
            k = p.from;
          }
          return path.reverse();
        }
        const occ = Array.from({ length: N }, () => new Array<number>(N).fill(-1));
        s.forEach((cell, i) => {
          const m = meta[i];
          for (let q = 0; q < m.len; q++) occ[m.horiz ? m.fixed : cell + q][m.horiz ? cell + q : m.fixed] = i;
        });
        for (let i = 0; i < s.length; i++) {
          const m = meta[i];
          for (const d of [-1, 1]) {
            // blok może przesunąć się o dowolną liczbę wolnych pól w jednym ruchu gracza
            let c = s[i];
            for (;;) {
              const nc = c + d;
              if (nc < 0 || nc + m.len > N) break;
              const edge = d > 0 ? nc + m.len - 1 : nc;
              const ro = m.horiz ? m.fixed : edge;
              const co = m.horiz ? edge : m.fixed;
              if (occ[ro][co] !== -1) break;
              c = nc;
              const ns = s.slice();
              ns[i] = c;
              const nk = key(ns);
              if (!seen.has(nk)) {
                seen.add(nk);
                prev.set(nk, { from: key(s), block: i, to: c });
                next.push(ns);
              }
            }
          }
        }
      }
      queue = next;
    }
    return null;
  }

  private buildBlockMesh(ctx: GameContext, b: Block): void {
    const g = b.mesh;
    const palette = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d68910', '#16a085', '#7f8c8d', '#b03a6a', '#5d6d7e', '#af7a2a'];
    if (b.id === 0) {
      g.add(box(2 * 0.92, 0.25, 0.86, mat('#d4a373'), [0, 0.2, 0]), box(0.08, 0.7, 0.86, mat('#7a5a3a'), [-0.9, 0.55, 0]));
      this.fado = makeFado(ctx, { scale: 0.62, quality: 'low' });
      this.fado.group.rotation.y = Math.PI / 2;
      this.fado.group.position.set(0, 0.32, 0);
      g.add(this.fado.group);
      for (const x of [-0.6, 0.6]) for (const z of [-0.4, 0.4]) {
        const w = box(0.22, 0.22, 0.12, mat('#222'), [x, 0.11, z]);
        g.add(w);
      }
    } else {
      const color = palette[b.id % palette.length];
      const w = b.horiz ? b.len * 0.94 : 0.86;
      const d = b.horiz ? 0.86 : b.len * 0.94;
      g.add(box(w, 0.8, d, mat(color), [0, 0.4, 0]));
      g.add(box(w * 0.9, 0.06, d * 0.9, mat('#222'), [0, 0.82, 0]));
      g.add(box(b.horiz ? 0.08 : w * 0.5, 0.08, b.horiz ? d * 0.5 : 0.08, mat('#e8d5a8'), [0, 0.88, 0]));
    }
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.userData.block = b.id;
      }
    });
    this.placeBlock(b);
    this.ctxRoot(ctx).add(g);
  }

  private ctxRoot(ctx: GameContext): THREE.Object3D {
    return ctx.root;
  }

  private placeBlock(b: Block): void {
    const col = b.horiz ? b.pos : b.fixed;
    const row = b.horiz ? b.fixed : b.pos;
    const p = this.cellCenter(col, row);
    const cx = p.x + (b.horiz ? (b.len - 1) / 2 : 0);
    const cz = p.z + (b.horiz ? 0 : (b.len - 1) / 2);
    b.mesh.position.set(cx, 0, cz);
  }

  startGame(): void {
    this.ctx.audio.music('tension');
    this.ctx.audio.setMusicIntensity(0.4);
  }

  handleInput(e: InputEvent): void {
    if (this.exiting > 0) return;
    if (e.type === 'action' && e.id === 'hint') {
      this.showHint();
      return;
    }
    const cam = this.ctx.view.camera;
    if (!cam) return;
    if (e.type === 'pointer-down' && !this.drag) {
      this.raycaster.setFromCamera(new THREE.Vector2(e.nx, e.ny), cam);
      let hitBlock: Block | null = null;
      let dist = Infinity;
      for (const b of this.blocks) {
        const hit = this.raycaster.intersectObject(b.mesh, true)[0];
        if (hit && hit.distance < dist) {
          dist = hit.distance;
          hitBlock = b;
        }
      }
      if (hitBlock) {
        const p = this.ctx.pointOnPlane(e.nx, e.ny, this.plane, this.tmp);
        if (!p) return;
        const origin = this.cellCenter(hitBlock.horiz ? 0 : hitBlock.fixed, hitBlock.horiz ? hitBlock.fixed : 0);
        const coord = hitBlock.horiz ? p.x - origin.x : p.z - origin.z;
        this.drag = { block: hitBlock, id: e.pointerId, offset: coord - hitBlock.pos, startCell: hitBlock.cell };
        this.ctx.audio.sfx('crate', { gain: 0.35 });
        this.ctx.haptics.impact('light');
      }
    } else if (e.type === 'pointer-move' && this.drag && e.pointerId === this.drag.id) {
      const b = this.drag.block;
      const p = this.ctx.pointOnPlane(e.nx, e.ny, this.plane, this.tmp);
      if (!p) return;
      const origin = this.cellCenter(b.horiz ? 0 : b.fixed, b.horiz ? b.fixed : 0);
      const coord = b.horiz ? p.x - origin.x : p.z - origin.z;
      const [lo, hi] = this.range(b);
      b.pos = clamp(coord - this.drag.offset, lo, hi);
      this.placeBlock(b);
    } else if (e.type === 'pointer-up' && this.drag && e.pointerId === this.drag.id) {
      const b = this.drag.block;
      const start = this.drag.startCell;
      this.drag = null;
      const snapped = Math.round(b.pos);
      const [lo, hi] = this.range(b);
      b.cell = clamp(snapped, Math.ceil(lo), Math.floor(hi));
      b.pos = b.cell;
      this.placeBlock(b);
      if (b.cell !== start) {
        this.moves++;
        this.ctx.audio.sfx('thud', { gain: 0.5 });
        this.ctx.hud.setObjective(`Ruchy: ${this.moves}${this.bestLen ? ` (najlepiej: ${this.bestLen})` : ''}`);
        this.checkExit();
      }
    }
  }

  /** Zakres wolnej przestrzeni dla bloku w jego osi (z uwzględnieniem sąsiadów). */
  private range(b: Block): [number, number] {
    let lo = 0;
    let hi = N - b.len;
    for (const o of this.blocks) {
      if (o === b) continue;
      if (b.horiz) {
        // blokuje, jeśli przecina wiersz b
        if (o.horiz && o.fixed === b.fixed) {
          if (o.cell >= b.cell + b.len) hi = Math.min(hi, o.cell - b.len);
          else if (o.cell + o.len <= b.cell) lo = Math.max(lo, o.cell + o.len);
        } else if (!o.horiz && o.cell <= b.fixed && o.cell + o.len > b.fixed) {
          if (o.fixed >= b.cell + b.len) hi = Math.min(hi, o.fixed - b.len);
          else if (o.fixed < b.cell) lo = Math.max(lo, o.fixed + 1);
        }
      } else if (!o.horiz && o.fixed === b.fixed) {
        if (o.cell >= b.cell + b.len) hi = Math.min(hi, o.cell - b.len);
        else if (o.cell + o.len <= b.cell) lo = Math.max(lo, o.cell + o.len);
      } else if (o.horiz && o.cell <= b.fixed && o.cell + o.len > b.fixed) {
        if (o.fixed >= b.cell + b.len) hi = Math.min(hi, o.fixed - b.len);
        else if (o.fixed < b.cell) lo = Math.max(lo, o.fixed + 1);
      }
    }
    return [lo, hi];
  }

  private showHint(): void {
    // rozwiązanie liczymy od aktualnego stanu
    const sol = this.solve(this.blocks.map((b) => ({ id: b.id, horiz: b.horiz, len: b.len, fixed: b.fixed, pos: b.cell, cell: b.cell })));
    if (!sol || sol.length === 0) return;
    this.hints++;
    this.hintBlock = this.blocks[sol[0].block];
    this.hintT = 2.2;
    this.ctx.audio.sfx('bell', { gain: 0.5 });
    this.ctx.hud.showHint('Spróbuj ruszyć podświetlony bagaż.');
    this.ctx.hud.setProgress(clamp(1 - sol.length / Math.max(this.bestLen, sol.length), 0, 1));
  }

  private checkExit(): void {
    const fado = this.blocks[0];
    if (fado.cell >= EXIT_COL) {
      this.exiting = 0.0001;
      this.ctx.audio.sfx('sparkle');
      this.ctx.hud.showHint('Droga wolna!');
    }
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    const m = this.fado.rig.motion;
    this.timeLeft -= dt;
    ctx.hud.setTimer(Math.max(0, this.timeLeft));
    ctx.hud.setCourage(clamp(this.timeLeft / (TIME_LIMIT * ctx.assist), 0, 1));

    // konduktor zbliża się wraz z upływem czasu
    const prog = 1 - clamp(this.timeLeft / (TIME_LIMIT * ctx.assist), 0, 1);
    this.conductor.position.x = damp(this.conductor.position.x, -(N + 4) + prog * (N + 3), 2, dt);
    this.conductor.position.y = Math.abs(Math.sin(t * 5)) * 0.06;
    ctx.audio.setMusicIntensity(0.4 + prog * 0.6);
    if (prog > 0.75) ctx.haptics.setHeartbeat(90 + prog * 50, 0.4);

    // podpowiedź pulsuje
    if (this.hintT > 0 && this.hintBlock) {
      this.hintT -= dt;
      const s = 1 + Math.sin(t * 14) * 0.05;
      this.hintBlock.mesh.scale.setScalar(this.hintT > 0 ? s : 1);
      if (this.hintT <= 0) this.hintBlock.mesh.scale.setScalar(1);
    }

    if (this.exiting > 0) {
      this.exiting += dt;
      const fado = this.blocks[0];
      fado.pos = Math.min(N + 1.5, fado.pos + dt * 4);
      this.placeBlock(fado);
      m.speed = 1;
      m.expression = 'happy';
      if (this.exiting > 1.4) {
        const half = this.timeLeft > (TIME_LIMIT * ctx.assist) / 2;
        if (half) this.collectGoldenBone();
        this.exiting = -1;
        this.win({ stars: this.hints === 0 && half ? 3 : this.hints <= 1 ? 2 : 1 });
      }
    } else {
      m.speed = 0;
      m.expression = this.timeLeft < 30 ? 'scared' : 'alert';
    }
    this.fado.rig.update(dt, t);
    this.fx.update(dt, ctx);
    if (this.timeLeft <= 0 && this.exiting <= 0) this.lose();
  }

  protected onCleanup(): void {
    this.fado.rig.dispose();
  }
}
