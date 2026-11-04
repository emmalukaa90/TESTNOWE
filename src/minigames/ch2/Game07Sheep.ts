import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, cameraAnchor, clamp, dampAngle, glow, goldenBone, makeFado, mat, Particles, plane, sphere, spinBob, type FadoActor } from '../kit';

interface Sheep {
  group: THREE.Group;
  pos: THREE.Vector2;
  vel: THREE.Vector2;
  inPen: boolean;
  stubborn: boolean;
  seed: number;
}

const PEN = { cx: 0, cz: -12, hw: 4.2, hd: 3.2, gate: 1.9 };
const ARENA = 15;
const SHEEP = 9;
const TIME_LIMIT = 120;
const FLEE_R = 4.6;
const BARK_R = 8;

/** Poziom 7: zapędź owce do zagrody — rysuj trasę Fado i szczekaj. */
export class Game07Sheep extends BaseMinigame {
  readonly id = 7;

  private fado!: FadoActor;
  private fx!: Particles;
  private sheep: Sheep[] = [];
  private dots!: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private queue: THREE.Vector3[] = [];
  private drawId: number | null = null;
  private pos = new THREE.Vector3(0, 0, 10);
  private barkCd = 0;
  private barkRing!: THREE.Mesh;
  private barkT = 1;
  private timeLeft = TIME_LIMIT;
  private bone!: THREE.Group;
  private tmp2 = new THREE.Vector2();

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('farm');
    const { dir } = addLighting(ctx, { sky: '#e6f5ff', ground: '#6a8a4a', sunIntensity: 3, shadowRange: 22 });
    ctx.root.add(plane(80, 80, mat('#6fae4f', { roughness: 1 }), [0, 0, 0]));
    ctx.root.add(plane(PEN.hw * 2, PEN.hd * 2, mat('#8cc063', { roughness: 1 }), [PEN.cx, 0.01, PEN.cz]));

    // zagroda: trzy ściany, wejście od strony +z
    const wood = mat('#a9794a');
    const rail = (cx: number, cz: number, w: number, d: number) => {
      ctx.root.add(box(w, 0.9, d, wood, [cx, 0.45, cz]));
    };
    rail(PEN.cx, PEN.cz - PEN.hd, PEN.hw * 2 + 0.3, 0.3);
    rail(PEN.cx - PEN.hw, PEN.cz, 0.3, PEN.hd * 2);
    rail(PEN.cx + PEN.hw, PEN.cz, 0.3, PEN.hd * 2);
    const sideW = PEN.hw - PEN.gate;
    rail(PEN.cx - PEN.gate - sideW / 2, PEN.cz + PEN.hd, sideW, 0.3);
    rail(PEN.cx + PEN.gate + sideW / 2, PEN.cz + PEN.hd, sideW, 0.3);
    ctx.root.add(sphere(0.3, glow('#ffd23f', 1.5), [PEN.cx, 1.2, PEN.cz + PEN.hd]));

    // dekoracje
    for (let i = 0; i < 20; i++) {
      const tree = new THREE.Group();
      tree.add(sphere(1.2, mat('#3d7a3a'), [0, 2.2, 0]), sphere(0.2, mat('#5a3d28'), [0, 0.9, 0]));
      tree.position.set((i % 2 ? 1 : -1) * (ARENA + 3 + ctx.random() * 6), 0, -20 + (i / 20) * 45);
      ctx.root.add(tree);
    }

    for (let i = 0; i < SHEEP; i++) {
      const stubborn = i === 0;
      const g = new THREE.Group();
      const wool = mat(stubborn ? '#3c3a40' : '#f4efe6', { roughness: 1 });
      g.add(sphere(0.62, wool, [0, 0.8, 0], 14), sphere(0.34, mat('#2b2b30'), [0, 0.95, 0.62], 10));
      for (const lx of [-0.28, 0.28]) for (const lz of [-0.25, 0.3]) g.add(sphere(0.1, mat('#2b2b30'), [lx, 0.2, lz], 6));
      const a = (i / SHEEP) * Math.PI * 2;
      const pos = new THREE.Vector2(Math.cos(a) * (3 + ctx.random() * 3), 2 + Math.sin(a) * 3 + ctx.random());
      g.position.set(pos.x, 0, pos.y);
      ctx.root.add(g);
      this.sheep.push({ group: g, pos, vel: new THREE.Vector2(), inPen: false, stubborn, seed: ctx.random() * 10 });
    }

    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), glow('#fff2a8', 1.6), 40);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    ctx.root.add(this.dots);

    this.barkRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, side: THREE.DoubleSide }));
    this.barkRing.rotation.x = -Math.PI / 2;
    ctx.root.add(this.barkRing);

    this.bone = goldenBone(1.3);
    this.bone.visible = false;
    ctx.root.add(this.bone);

    this.fado = makeFado(ctx, { scale: 0.95, lightDir: dir });
    this.fado.group.position.copy(this.pos);
    this.fx = new Particles(200);
    ctx.root.add(this.fx.points);

    cameraAnchor(ctx, 0, 0, -1.5);
    ctx.camera.apply({ offset: [0, 21, 12], look: [0, 0, 0], fov: 44, bokeh: 0.4, duration: 0 });
    ctx.hud.setObjective(`Owce w zagrodzie: 0 / ${SHEEP}`);
    ctx.hud.setActions([{ id: 'bark', label: 'Szczeknij', icon: '🐕' }]);
    ctx.hud.showHint('Przeciągnij palcem, by wyznaczyć trasę Fado');
    this.timeLeft = TIME_LIMIT * ctx.assist;
  }

  startGame(): void {
    this.ctx.audio.music('farm');
    this.ctx.input.enableMicrophone().then((ok) => ok && this.ctx.hud.showHint('Możesz też szczekać do mikrofonu!'), () => undefined);
  }

  handleInput(e: InputEvent): void {
    if (e.type === 'pointer-down' && this.drawId === null) {
      this.drawId = e.pointerId;
      this.queue.length = 0;
      this.addPoint(e.nx, e.ny);
    } else if (e.type === 'pointer-move' && e.pointerId === this.drawId) {
      this.addPoint(e.nx, e.ny);
    } else if (e.type === 'pointer-up' && e.pointerId === this.drawId) {
      this.drawId = null;
    } else if ((e.type === 'action' && e.id === 'bark') || (e.type === 'sound' && e.kind === 'bark')) {
      this.bark();
    }
  }

  private addPoint(nx: number, ny: number): void {
    const p = this.ctx.groundPoint(nx, ny, 0);
    if (!p) return;
    p.x = clamp(p.x, -ARENA, ARENA);
    p.z = clamp(p.z, -ARENA, ARENA);
    const last = this.queue[this.queue.length - 1];
    if (last && last.distanceTo(p) < 0.8) return;
    this.queue.push(p.clone());
    if (this.queue.length > 36) this.queue.shift();
  }

  private bark(): void {
    if (this.barkCd > 0) return;
    const ctx = this.ctx;
    this.barkCd = 2.4;
    this.barkT = 0;
    ctx.audio.sfx('bark');
    ctx.haptics.impact('heavy');
    ctx.camera.punchFov(3);
    for (const s of this.sheep) {
      if (s.inPen) continue;
      const dx = s.pos.x - this.pos.x;
      const dz = s.pos.y - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < BARK_R && d > 0.01) {
        const k = (1 - d / BARK_R) * 11;
        s.vel.x += (dx / d) * k;
        s.vel.y += (dz / d) * k;
      }
    }
    this.fado.rig.motion.expression = 'alert';
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    this.barkCd = Math.max(0, this.barkCd - dt);
    this.timeLeft -= dt;
    ctx.hud.setTimer(Math.max(0, this.timeLeft));

    // Fado biegnie za kolejką punktów
    const m = this.fado.rig.motion;
    let speed = 0;
    const next = this.queue[0];
    if (next) {
      const dx = next.x - this.pos.x;
      const dz = next.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.45) this.queue.shift();
      else {
        speed = 7.2;
        this.pos.x += (dx / d) * speed * dt;
        this.pos.z += (dz / d) * speed * dt;
        this.fado.group.rotation.y = dampAngle(this.fado.group.rotation.y, Math.atan2(dx, dz), 14, dt);
      }
    }
    m.speed = speed > 0 ? 1 : 0;
    m.expression = speed > 0 ? 'run' : this.barkT < 0.5 ? 'alert' : 'idle';
    this.fado.group.position.copy(this.pos);
    this.fado.rig.update(dt, t);

    // ścieżka (kropki)
    this.dots.count = this.queue.length;
    this.queue.forEach((p, i) => {
      this.dummy.position.set(p.x, 0.15, p.z);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.dots.setMatrixAt(i, this.dummy.matrix);
    });
    this.dots.instanceMatrix.needsUpdate = true;

    this.updateSheep(dt, t);

    // fala szczeknięcia
    this.barkT += dt * 2.2;
    const ringMat = this.barkRing.material as THREE.MeshBasicMaterial;
    ringMat.opacity = this.barkT < 1 ? (1 - this.barkT) * 0.7 : 0;
    this.barkRing.position.set(this.pos.x, 0.08, this.pos.z);
    this.barkRing.scale.setScalar(0.5 + this.barkT * BARK_R);

    const inside = this.sheep.filter((s) => s.inPen).length;
    ctx.hud.setObjective(`Owce w zagrodzie: ${inside} / ${SHEEP}`);
    ctx.hud.setProgress(inside / SHEEP);
    ctx.hud.setCourage(clamp(this.timeLeft / (TIME_LIMIT * ctx.assist), 0, 1));
    this.fx.update(dt, ctx);

    if (inside === SHEEP) {
      this.bone.visible = true;
      if (this.elapsed < 90 * ctx.assist) this.collectGoldenBone();
      this.win({ stars: this.elapsed < 50 ? 3 : this.elapsed < 85 ? 2 : 1 });
    } else if (this.timeLeft <= 0) {
      this.lose();
    }
  }

  private updateSheep(dt: number, t: number): void {
    const center = this.tmp2.set(0, 0);
    let n = 0;
    for (const s of this.sheep) {
      if (!s.inPen) {
        center.add(s.pos);
        n++;
      }
    }
    if (n > 0) center.multiplyScalar(1 / n);

    for (const s of this.sheep) {
      const fx = s.pos.x - this.pos.x;
      const fz = s.pos.y - this.pos.z;
      const d = Math.hypot(fx, fz) || 0.001;
      const fleeR = FLEE_R * (s.stubborn ? 1.35 : 1);
      if (!s.inPen && d < fleeR) {
        const k = (1 - d / fleeR) * 22 * dt * (s.stubborn ? 1.4 : 1);
        s.vel.x += (fx / d) * k;
        s.vel.y += (fz / d) * k;
      }
      if (!s.inPen) {
        // spójność stada i lekkie błądzenie
        s.vel.x += (center.x - s.pos.x) * 0.05 * dt + Math.sin(t * 0.7 + s.seed) * 0.4 * dt;
        s.vel.y += (center.y - s.pos.y) * 0.05 * dt + Math.cos(t * 0.6 + s.seed) * 0.4 * dt;
        // separacja
        for (const o of this.sheep) {
          if (o === s) continue;
          const sx = s.pos.x - o.pos.x;
          const sz = s.pos.y - o.pos.y;
          const sd = Math.hypot(sx, sz);
          if (sd < 1.3 && sd > 0.001) {
            s.vel.x += (sx / sd) * (1.3 - sd) * 6 * dt;
            s.vel.y += (sz / sd) * (1.3 - sd) * 6 * dt;
          }
        }
      }
      // tłumienie i limit prędkości
      s.vel.multiplyScalar(Math.exp(-2.2 * dt));
      const sp = s.vel.length();
      const max = 6.2;
      if (sp > max) s.vel.multiplyScalar(max / sp);
      s.pos.x += s.vel.x * dt;
      s.pos.y += s.vel.y * dt;
      this.collideSheep(s);

      // w zagrodzie?
      if (!s.inPen && Math.abs(s.pos.x - PEN.cx) < PEN.hw - 0.5 && Math.abs(s.pos.y - PEN.cz) < PEN.hd - 0.5) {
        s.inPen = true;
        this.ctx.audio.sfx('pop', { gain: 0.6 });
        this.ctx.haptics.impact('light');
        this.fx.emit(new THREE.Vector3(s.pos.x, 1, s.pos.y), { count: 14, speed: 2.4, life: 0.8, size: 0.14, color: '#ffffff', gravity: -1 });
      }
      if (s.inPen) {
        s.pos.x = clamp(s.pos.x, PEN.cx - PEN.hw + 0.6, PEN.cx + PEN.hw - 0.6);
        s.pos.y = clamp(s.pos.y, PEN.cz - PEN.hd + 0.6, PEN.cz + PEN.hd - 0.6);
        s.vel.multiplyScalar(0.8);
      }

      const moving = clamp(s.vel.length() / 3, 0, 1);
      s.group.position.set(s.pos.x, Math.abs(Math.sin(t * 12 + s.seed)) * 0.12 * moving, s.pos.y);
      if (s.vel.lengthSq() > 0.04) s.group.rotation.y = dampAngle(s.group.rotation.y, Math.atan2(s.vel.x, s.vel.y), 10, dt);
    }
    this.bone.position.set(PEN.cx, 1.4, PEN.cz);
    spinBob(this.bone, t, 1.4);
  }

  /** Kolizje owcy z ogrodzeniem zagrody i granicą areny. */
  private collideSheep(s: Sheep): void {
    const r = 0.6;
    s.pos.x = clamp(s.pos.x, -ARENA, ARENA);
    s.pos.y = clamp(s.pos.y, -ARENA, ARENA);
    if (s.inPen) return;
    const walls: Array<[number, number, number, number]> = [
      [PEN.cx, PEN.cz - PEN.hd, PEN.hw + 0.15, 0.15],
      [PEN.cx - PEN.hw, PEN.cz, 0.15, PEN.hd],
      [PEN.cx + PEN.hw, PEN.cz, 0.15, PEN.hd],
      [PEN.cx - PEN.gate - (PEN.hw - PEN.gate) / 2, PEN.cz + PEN.hd, (PEN.hw - PEN.gate) / 2, 0.15],
      [PEN.cx + PEN.gate + (PEN.hw - PEN.gate) / 2, PEN.cz + PEN.hd, (PEN.hw - PEN.gate) / 2, 0.15],
    ];
    for (const [cx, cz, hx, hz] of walls) {
      const dx = s.pos.x - cx;
      const dz = s.pos.y - cz;
      const ox = hx + r - Math.abs(dx);
      const oz = hz + r - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) {
          s.pos.x += Math.sign(dx || 1) * ox;
          s.vel.x *= -0.3;
        } else {
          s.pos.y += Math.sign(dz || 1) * oz;
          s.vel.y *= -0.3;
        }
      }
    }
  }

  protected onCleanup(): void {
    this.ctx.input.disableMicrophone();
    this.fado.rig.dispose();
  }
}
