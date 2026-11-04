import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, cyl, damp, glow, makeFado, mat, Particles, sphere, type FadoActor } from '../kit';

interface Roof {
  x0: number;
  x1: number;
  top: number;
  awning: boolean;
}

const ROOFS: Roof[] = [
  { x0: 0, x1: 8, top: 6, awning: false },
  { x0: 11, x1: 18, top: 7, awning: false },
  { x0: 20.5, x1: 24.5, top: 5, awning: true },
  { x0: 27.5, x1: 35, top: 8.5, awning: false },
  { x0: 38, x1: 44, top: 6.5, awning: false },
  { x0: 46.5, x1: 50, top: 5.5, awning: true },
  { x0: 53, x1: 61, top: 9, awning: false },
  { x0: 64, x1: 72, top: 7.5, awning: false },
  { x0: 75, x1: 84, top: 10, awning: false },
];
const GRAVITY = 22;
const MAX_SPEED = 17.5;
const CAT_START = 3;
const MAX_FALLS = 4;

/** Poziom 15: procą z łap przeskakuj dachy i dogoń kota ze skradzionym szalikiem. */
export class Game15Rooftops extends BaseMinigame {
  readonly id = 15;

  private fado!: FadoActor;
  private fx!: Particles;
  private cat = new THREE.Group();
  private catRoof = CAT_START;
  private catWait = 0;
  private catHop = 0;
  private catFrom = new THREE.Vector3();
  private catTo = new THREE.Vector3();
  private catPos = new THREE.Vector3();
  private catLimit = 4.6;
  private anchor!: THREE.Object3D;
  private preview!: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private grounded = true;
  private aimId: number | null = null;
  private aimStart = new THREE.Vector2();
  private aimNow = new THREE.Vector2();
  private aiming = false;
  private jumps = 0;
  private falls = 0;
  private lastSafe = new THREE.Vector3();
  private awningSquash = new Map<number, number>();
  private awningMeshes: THREE.Mesh[] = [];

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('dusk');
    const { dir } = addLighting(ctx, { sky: '#b99ad6', ground: '#3a2f48', sun: '#ffb27a', sunIntensity: 2.6, sunPos: [-14, 20, 14], shadowRange: 34 });
    // księżyc i tło miasta
    ctx.root.add(sphere(3, glow('#fff0cf', 1.2), [50, 26, -60], 16));
    for (let i = 0; i < 26; i++) {
      const h = 8 + ctx.random() * 22;
      const z = -14 - ctx.random() * 22;
      const b = box(5 + ctx.random() * 4, h, 5, mat(['#3a3f5a', '#4a4a6a', '#35405a'][i % 3]), [-8 + i * 4.2, h / 2 - 6, z]);
      ctx.root.add(b);
      for (let w = 0; w < 4; w++) if (ctx.random() < 0.7) ctx.root.add(box(0.6, 0.8, 0.05, glow('#ffd88a', 0.9), [b.position.x + (w % 2 - 0.5) * 2, 2 + Math.floor(w / 2) * 3 + ctx.random() * 6, z + 2.55]));
    }

    const brick = ['#9b5a44', '#7a6a8a', '#8a7a5a', '#6a7a8a'];
    ROOFS.forEach((r, i) => {
      const w = r.x1 - r.x0;
      const cx = (r.x0 + r.x1) / 2;
      if (r.awning) {
        const stripes = new THREE.Group();
        for (let s = 0; s < 6; s++) stripes.add(box(w / 6, 0.14, 3.2, mat(s % 2 ? '#f4f1e8' : '#d94a4a'), [-w / 2 + (s + 0.5) * (w / 6), 0, 0]));
        stripes.position.set(cx, r.top - 0.1, 0);
        ctx.root.add(stripes);
        this.awningMeshes.push(stripes as unknown as THREE.Mesh);
        ctx.root.add(cyl(0.06, 0.06, 4, mat('#444'), [r.x0, r.top - 2.1, 1.4], 6), cyl(0.06, 0.06, 4, mat('#444'), [r.x1, r.top - 2.1, 1.4], 6));
      } else {
        ctx.root.add(box(w, 14, 5, mat(brick[i % 4]), [cx, r.top - 7, 0]));
        ctx.root.add(box(w + 0.4, 0.4, 5.4, mat('#2f2a33'), [cx, r.top + 0.2, 0]));
        ctx.root.add(box(0.9, 1.4, 0.9, mat('#6b4a3a'), [r.x0 + 1.2 + (i % 3), r.top + 1.1, -1.2]));
        for (let wi = 0; wi < Math.floor(w / 2.6); wi++) ctx.root.add(box(1, 1.4, 0.06, glow('#ffd88a', 0.7), [r.x0 + 1.5 + wi * 2.4, r.top - 2.2, 2.53]));
      }
    });

    // kot ze szalikiem
    const fur = mat('#3a3640', { roughness: 1 });
    this.cat.add(sphere(0.55, fur, [0, 0.55, 0], 14), sphere(0.36, fur, [0.55, 0.85, 0], 12), box(0.9, 0.08, 0.5, mat('#ffd23f'), [0.95, 0.75, 0]));
    for (const z of [-0.18, 0.18]) this.cat.add(cyl(0.01, 0.1, 0.28, fur, [0.5, 1.2, z], 4));
    const tail = cyl(0.07, 0.04, 1.0, fur, [-0.8, 0.9, 0], 6);
    tail.rotation.z = 0.9;
    this.cat.add(tail, sphere(0.06, glow('#a0ff9a', 1.5), [0.8, 0.95, 0.2], 6), sphere(0.06, glow('#a0ff9a', 1.5), [0.8, 0.95, -0.2], 6));
    this.cat.scale.setScalar(1.25);
    ctx.root.add(this.cat);
    this.placeCat(CAT_START);

    this.fado = makeFado(ctx, { scale: 0.9, lightDir: dir });
    this.fado.group.rotation.y = Math.PI / 2;
    this.pos.set(4, ROOFS[0].top, 0);
    this.lastSafe.copy(this.pos);
    this.fx = new Particles(240);
    ctx.root.add(this.fx.points);

    this.preview = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), glow('#ffe36a', 1.5), 26);
    this.preview.count = 0;
    this.preview.frustumCulled = false;
    ctx.root.add(this.preview);

    this.anchor = new THREE.Object3D();
    this.anchor.position.set(8, 8, 0);
    ctx.root.add(this.anchor);
    ctx.camera.setTarget(this.anchor);
    ctx.camera.apply({ offset: [5, 1.5, 21], look: [4, 0.5, 0], fov: 42, bokeh: 0.8, duration: 0 });
    ctx.hud.setObjective('Dogoń kota ze skradzionym szalikiem');
    ctx.hud.showHint('Przeciągnij do tyłu i puść — skok! Markizy podbijają.');
    ctx.hud.setCourage(1);
    this.catLimit = 4.6 * ctx.assist;
  }

  private placeCat(i: number): void {
    const r = ROOFS[i];
    this.catPos.set((r.x0 + r.x1) / 2 + (r.x1 - r.x0) * 0.2, r.top + (r.awning ? 0.0 : 0.4), 0);
    this.cat.position.copy(this.catPos);
  }

  startGame(): void {
    this.ctx.audio.music('city');
    this.ctx.audio.setMusicIntensity(0.5);
  }

  handleInput(e: InputEvent): void {
    if (e.type === 'pointer-down' && this.aimId === null && this.grounded) {
      this.aimId = e.pointerId;
      this.aimStart.set(e.nx, e.ny);
      this.aimNow.set(e.nx, e.ny);
      this.aiming = true;
    } else if (e.type === 'pointer-move' && e.pointerId === this.aimId) {
      this.aimNow.set(e.nx, e.ny);
    } else if (e.type === 'pointer-up' && e.pointerId === this.aimId) {
      this.aimId = null;
      if (this.aiming && this.grounded) {
        const v = this.aimVelocity();
        if (v && v.length() > 4) this.launch(v);
      }
      this.aiming = false;
    }
  }

  /** Wektor startowy z przeciągnięcia (przeciwny do kierunku pociągnięcia). */
  private aimVelocity(): THREE.Vector3 | null {
    const aspect = this.ctx.view.width / Math.max(1, this.ctx.view.height);
    const dx = (this.aimStart.x - this.aimNow.x) * aspect;
    const dy = this.aimStart.y - this.aimNow.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.05) return null;
    const power = clamp(len / 0.65, 0, 1);
    const speed = 7 + power * (MAX_SPEED - 7);
    const v = new THREE.Vector3(dx / len, dy / len, 0).multiplyScalar(speed);
    if (v.y < 1.5) v.y = 1.5; // zawsze lekko w górę
    return v;
  }

  private launch(v: THREE.Vector3): void {
    const ctx = this.ctx;
    this.vel.copy(v);
    this.grounded = false;
    this.jumps++;
    ctx.audio.sfx('jump');
    ctx.audio.sfx('whoosh', { gain: 0.4 });
    ctx.haptics.impact('medium');
    ctx.camera.punchFov(3);
    this.fx.emit(this.pos, { count: 10, speed: 2, life: 0.5, size: 0.14, color: '#d8d0e8', gravity: 4 });
    ctx.hud.setObjective(`Skoki: ${this.jumps}`);
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    const g = this.fado.group;
    const m = this.fado.rig.motion;

    // Fado: balistyka i lądowanie
    if (!this.grounded) {
      const prevY = this.pos.y;
      this.vel.y -= GRAVITY * dt;
      this.pos.x += this.vel.x * dt;
      this.pos.y += this.vel.y * dt;
      for (let i = 0; i < ROOFS.length; i++) {
        const r = ROOFS[i];
        const inX = this.pos.x > r.x0 - 0.15 && this.pos.x < r.x1 + 0.15;
        if (!inX) continue;
        if (this.vel.y <= 0 && prevY >= r.top - 0.1 && this.pos.y <= r.top) {
          this.pos.y = r.top;
          if (r.awning) {
            this.vel.y = 16.5;
            this.vel.x *= 0.92;
            this.awningSquash.set(i, 1);
            ctx.audio.sfx('pop');
            ctx.haptics.impact('light');
            this.fx.emit(this.pos, { count: 12, speed: 3, life: 0.6, size: 0.14, color: '#ff7b7b', gravity: -1 });
          } else {
            this.grounded = true;
            this.vel.set(0, 0, 0);
            this.lastSafe.copy(this.pos);
            ctx.audio.sfx('land');
            ctx.haptics.impact('light');
            this.fx.emit(this.pos, { count: 10, speed: 2, life: 0.5, size: 0.14, color: '#cfc7dc', gravity: 4 });
          }
          break;
        }
        // ściana budynku z boku (tylko dachy, nie markizy)
        if (!r.awning && this.pos.y < r.top - 0.1 && this.pos.y > r.top - 14) {
          const left = Math.abs(this.pos.x - r.x0);
          const right = Math.abs(this.pos.x - r.x1);
          this.pos.x = left < right ? r.x0 - 0.2 : r.x1 + 0.2;
          this.vel.x *= -0.3;
          ctx.audio.sfx('thud', { gain: 0.4 });
        }
      }
      if (this.pos.y < 0) this.fall();
    }
    g.position.copy(this.pos);
    m.speed = this.grounded ? 0 : 1;
    m.expression = this.grounded ? (this.aiming ? 'alert' : 'idle') : 'run';
    g.rotation.z = damp(g.rotation.z, this.grounded ? 0 : clamp(Math.atan2(this.vel.y, Math.max(1, this.vel.x)) * 0.8, -0.9, 0.9), 10, dt);
    this.fado.rig.update(dt, t);

    // podgląd trajektorii
    if (this.aiming && this.grounded) {
      const v = this.aimVelocity();
      if (v) {
        let n = 0;
        const p = this.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
        const vv = v.clone();
        for (let i = 0; i < 26; i++) {
          vv.y -= GRAVITY * 0.07;
          p.x += vv.x * 0.07;
          p.y += vv.y * 0.07;
          this.dummy.position.copy(p);
          this.dummy.scale.setScalar(1 - i * 0.025);
          this.dummy.updateMatrix();
          this.preview.setMatrixAt(n++, this.dummy.matrix);
        }
        this.preview.count = n;
        this.preview.instanceMatrix.needsUpdate = true;
      }
    } else this.preview.count = 0;

    // markizy sprężynują
    this.awningMeshes.forEach((a) => {
      const idx = ROOFS.findIndex((r) => r.awning && Math.abs((r.x0 + r.x1) / 2 - a.position.x) < 0.01);
      const s = this.awningSquash.get(idx) ?? 0;
      if (s > 0) {
        this.awningSquash.set(idx, Math.max(0, s - dt * 3));
        a.position.y = ROOFS[idx].top - 0.1 - Math.sin(s * Math.PI) * 0.35;
      }
    });

    this.updateCat(dt, t);

    // kamera patrzy pomiędzy Fado a kotem
    const midX = (this.pos.x + this.catPos.x) / 2 + 2;
    const midY = (this.pos.y + this.catPos.y) / 2 + 1;
    this.anchor.position.x = damp(this.anchor.position.x, midX, 3, dt);
    this.anchor.position.y = damp(this.anchor.position.y, midY, 3, dt);

    // złapanie kota
    if (this.pos.distanceTo(this.catPos) < 1.7) {
      ctx.audio.sfx('win');
      ctx.audio.sfx('bark');
      this.fx.emit(this.catPos, { count: 40, speed: 5, life: 1.2, size: 0.2, color: '#ffd23f' });
      if (this.jumps <= 12) this.collectGoldenBone();
      this.win({ stars: this.jumps <= 12 ? 3 : this.jumps <= 18 ? 2 : 1 });
    }
    ctx.hud.setProgress(clamp(this.pos.x / ROOFS[ROOFS.length - 1].x0, 0, 1));
    ctx.hud.setTimer(this.catRoof >= ROOFS.length - 1 ? Math.max(0, this.catLimit - this.catWait) : null);
    this.fx.update(dt, ctx);
  }

  private updateCat(dt: number, t: number): void {
    const ctx = this.ctx;
    if (this.catHop > 0) {
      this.catHop += dt / 0.8;
      const k = clamp(this.catHop, 0, 1);
      this.catPos.lerpVectors(this.catFrom, this.catTo, k);
      this.catPos.y += Math.sin(k * Math.PI) * 2.2;
      if (k >= 1) {
        this.catHop = 0;
        this.catWait = 0;
        ctx.audio.sfx('rustle', { gain: 0.4 });
      }
    } else {
      this.catWait += dt;
      this.catPos.y += Math.sin(t * 8) * 0.002;
      if (this.catRoof >= ROOFS.length - 1) {
        if (this.catWait >= this.catLimit) {
          ctx.hud.showHint('Kot uciekł!');
          this.lose();
        }
      } else if (this.catWait >= this.catLimit) {
        const next = this.catRoof + 1;
        this.catRoof = next;
        this.catFrom.copy(this.catPos);
        const r = ROOFS[next];
        this.catTo.set((r.x0 + r.x1) / 2 + (r.x1 - r.x0) * 0.2, r.top + (r.awning ? 0 : 0.4), 0);
        this.catHop = 0.0001;
        ctx.audio.sfx('whoosh', { gain: 0.4 });
        ctx.hud.showHint('Kot ucieka dalej!');
      }
    }
    this.cat.position.copy(this.catPos);
    this.cat.rotation.y = 0;
  }

  private fall(): void {
    const ctx = this.ctx;
    this.falls++;
    this.grounded = true;
    this.vel.set(0, 0, 0);
    this.pos.copy(this.lastSafe);
    this.jumps += 1; // kara
    ctx.audio.sfx('whine');
    ctx.haptics.pattern([60, 30, 90]);
    ctx.camera.shake(0.5, 0.4);
    ctx.hud.setCourage(1 - this.falls / MAX_FALLS);
    ctx.hud.showHint('Spadłeś! Wracasz na ostatni dach.');
    if (this.falls >= MAX_FALLS) this.lose();
  }

  protected onCleanup(): void {
    this.fado.rig.dispose();
  }
}
