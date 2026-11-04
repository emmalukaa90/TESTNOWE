import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, cyl, damp, dampAngle, glow, goldenBone, makeFado, mat, Particles, plane, sphere, spinBob, type FadoActor } from '../kit';

const LENGTH = 130;
const HALF_W = 3.8;
const SPEED = 6.2;
const BARRELS = 14;

interface Barrel {
  mesh: THREE.Object3D;
  x: number;
  z: number;
  hit: boolean;
}

/** Poziom 19: uspokajaj Fado głaskaniem, prowadź go przez fajerwerki — wybuchy odwracają sterowanie. */
export class Game19Fireworks extends BaseMinigame {
  readonly id = 19;

  private fado!: FadoActor;
  private fx!: Particles;
  private sparks!: Particles;
  private barrels: Barrel[] = [];
  private bone!: THREE.Group;
  private boneTaken = false;
  private flash!: THREE.PointLight;
  private hemi!: THREE.HemisphereLight;

  private z = 0;
  private x = 0;
  private targetX = 0;
  private courage = 0.9;
  private invert = 0;
  private nextBoom = 4.5;
  private stumble = 0;
  private freeze = 0;
  private stroking: number | null = null;
  private steering: number | null = null;
  private booms = 0;
  private hits = 0;
  private flashT = 0;

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('festival');
    const l = addLighting(ctx, { sky: '#3a3f8a', ground: '#14163a', hemi: 0.7, sun: '#9fb0ff', sunIntensity: 1.3, sunPos: [-6, 14, 8], shadowRange: 24 });
    this.hemi = l.hemi;
    ctx.root.add(plane(HALF_W * 2 + 2, LENGTH + 40, mat('#4a4150', { roughness: 1 }), [0, 0, -LENGTH / 2 + 10]));
    ctx.root.add(plane(80, LENGTH + 60, mat('#1b2a24', { roughness: 1 }), [0, -0.05, -LENGTH / 2 + 10]));
    // girlandy i lampiony
    for (let i = 0; i < 32; i++) {
      const z = -i * 4.2;
      for (const sx of [-1, 1]) {
        ctx.root.add(cyl(0.06, 0.08, 3.4, mat('#333'), [sx * (HALF_W + 1.2), 1.7, z], 6));
        ctx.root.add(sphere(0.22, glow(['#ff6b9d', '#ffd23f', '#6bcBff', '#9bff8a'][i % 4], 1.6), [sx * (HALF_W + 1.2), 3.5, z], 8));
      }
    }
    // sceny/budynki w tle
    for (let i = 0; i < 18; i++) {
      const h = 5 + (i * 37 % 9);
      ctx.root.add(box(5, h, 5, mat(['#2a2f5a', '#3a2f5a', '#2f3f5a'][i % 3]), [(i % 2 ? 1 : -1) * 14, h / 2, -i * 7.5]));
    }

    // beczki na torze
    for (let i = 0; i < BARRELS; i++) {
      const z = -14 - i * 8.2 - ctx.random() * 2.5;
      const x = (ctx.random() * 2 - 1) * (HALF_W - 0.9);
      const g = cyl(0.55, 0.55, 1.1, mat('#8a5a34'), [x, 0.55, z], 12);
      ctx.root.add(g);
      ctx.root.add(cyl(0.57, 0.57, 0.1, mat('#444'), [x, 0.3, z], 12), cyl(0.57, 0.57, 0.1, mat('#444'), [x, 0.8, z], 12));
      this.barrels.push({ mesh: g, x, z, hit: false });
    }
    // meta: arka
    ctx.root.add(box(0.4, 5, 0.4, mat('#ffd23f'), [-HALF_W, 2.5, -LENGTH]), box(0.4, 5, 0.4, mat('#ffd23f'), [HALF_W, 2.5, -LENGTH]), box(HALF_W * 2 + 0.4, 0.5, 0.4, glow('#ffd23f', 1.5), [0, 5, -LENGTH]));

    this.bone = goldenBone(1.6);
    this.bone.position.set(1.4, 2.4, -72);
    ctx.root.add(this.bone);

    this.flash = new THREE.PointLight('#ffffff', 0, 40, 2);
    this.flash.position.set(0, 14, -10);
    ctx.root.add(this.flash);

    this.fado = makeFado(ctx, { scale: 0.95, lightDir: l.dir });
    this.fado.group.rotation.y = Math.PI;
    this.fx = new Particles(200);
    this.sparks = new Particles(900, { opacity: 0.9 });
    ctx.root.add(this.fx.points, this.sparks.points);

    ctx.camera.setTarget(this.fado.group);
    ctx.camera.apply({ offset: [0, 3.3, 6.5], look: [0, 1.2, -9], fov: 58, bokeh: 0.8, duration: 0 });
    ctx.hud.setObjective('Przeprowadź Fado przez fajerwerki');
    ctx.hud.showHint('Lewa strona: głaszcz kółkami · prawa strona: steruj');
    ctx.hud.setCourage(this.courage);
  }

  startGame(): void {
    this.ctx.audio.music('tension');
    this.ctx.audio.setMusicIntensity(0.5);
  }

  handleInput(e: InputEvent): void {
    if (e.type === 'pointer-down') {
      if (e.nx < 0 && this.stroking === null) this.stroking = e.pointerId;
      else if (e.nx >= 0 && this.steering === null) this.steering = e.pointerId;
    } else if (e.type === 'pointer-move') {
      if (e.pointerId === this.stroking) {
        const amount = (Math.abs(e.dx) + Math.abs(e.dy)) * 0.0011;
        this.courage = clamp(this.courage + amount * (this.ctx.assist > 1 ? 1.5 : 1), 0, 1);
        if (amount > 0.004 && Math.random() < 0.08) this.ctx.audio.sfx('rustle', { gain: 0.18 });
      } else if (e.pointerId === this.steering) {
        const sign = this.invert > 0 ? -1 : 1;
        this.targetX = clamp(this.targetX + sign * e.dx * 0.0125, -HALF_W + 0.5, HALF_W - 0.5);
      }
    } else if (e.type === 'pointer-up') {
      if (e.pointerId === this.stroking) this.stroking = null;
      if (e.pointerId === this.steering) this.steering = null;
    }
  }

  private boom(): void {
    const ctx = this.ctx;
    this.booms++;
    const x = (ctx.random() * 2 - 1) * 12;
    const y = 10 + ctx.random() * 6;
    const color = new THREE.Color().setHSL(ctx.random(), 0.9, 0.6);
    const origin = new THREE.Vector3(x, y, -this.z - 22 - ctx.random() * 10);
    this.sparks.emit(origin, { count: 160, speed: 8, life: 1.8, size: 0.35, color, gravity: 4, spread: 1 });
    this.sparks.emit(origin, { count: 60, speed: 4, life: 1.2, size: 0.25, color: '#ffffff', gravity: 3 });
    this.flashT = 0.35;
    this.flash.position.copy(origin);
    this.flash.color.copy(color);
    ctx.audio.sfx('boom');
    ctx.audio.sfx('thunder', { gain: 0.5 });
    ctx.camera.shake(0.7, 0.5);
    ctx.haptics.pattern([80, 30, 120]);
    // panika: spadek odwagi i odwrócenie sterowania, krótsze przy spokojnym psie
    this.courage = clamp(this.courage - 0.22, 0, 1);
    this.invert = this.courage > 0.6 ? 1.2 : 2.6;
    ctx.hud.showHint(this.courage > 0.6 ? 'Huk! Sterowanie na chwilę odwrócone.' : 'Fado się przestraszył! Głaszcz go, STEROWANIE ODWRÓCONE!');
    this.fado.rig.motion.expression = 'scared';
    this.fado.rig.blinkNow();
    this.nextBoom = 5.5 + ctx.random() * 3.5;
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    const m = this.fado.rig.motion;

    // czas: wybuchy co kilka sekund
    this.nextBoom -= dt;
    if (this.nextBoom <= 0) this.boom();
    this.invert = Math.max(0, this.invert - dt);
    this.stumble = Math.max(0, this.stumble - dt);
    this.freeze = Math.max(0, this.freeze - dt);
    // odwaga powoli maleje (stres tłumu)
    this.courage = clamp(this.courage - 0.012 * dt, 0, 1);
    if (this.courage < 0.15 && this.freeze <= 0 && Math.random() < dt * 0.6) {
      this.freeze = 1.1;
      ctx.hud.showHint('Fado zamarł z przerażenia — głaszcz go!');
      ctx.audio.sfx('whine', { gain: 0.6 });
    }

    // ruch do przodu zależny od odwagi
    const speedMul = this.freeze > 0 ? 0 : this.stumble > 0 ? 0.4 : 0.55 + this.courage * 0.6;
    const speed = SPEED * speedMul;
    this.z += speed * dt;
    this.x = damp(this.x, this.targetX, 9, dt);
    const g = this.fado.group;
    g.position.set(this.x, 0, -this.z);
    g.rotation.y = dampAngle(g.rotation.y, Math.PI + clamp((this.targetX - this.x) * 0.4, -0.5, 0.5), 8, dt);
    m.speed = clamp(speed / SPEED, 0, 1);
    m.expression = this.courage < 0.4 || this.invert > 0 ? 'scared' : speed > 0.5 ? 'run' : 'alert';
    this.fado.rig.update(dt, t);

    // kolizje z beczkami
    for (const b of this.barrels) {
      if (b.hit) continue;
      if (Math.abs(b.z - -this.z) < 0.9 && Math.abs(b.x - this.x) < 1.0) {
        b.hit = true;
        this.hits++;
        this.stumble = 0.9;
        this.courage = clamp(this.courage - 0.12, 0, 1);
        ctx.audio.sfx('thud');
        ctx.haptics.impact('heavy');
        ctx.camera.shake(0.5, 0.4);
        this.fx.emit(new THREE.Vector3(b.x, 0.8, b.z), { count: 20, speed: 4, life: 0.7, size: 0.15, color: '#c9a77a', gravity: 8 });
        b.mesh.rotation.z = 1.2;
        b.mesh.position.y = 0.5;
        b.mesh.position.x += Math.sign(b.x - this.x || 1) * 0.6;
      }
    }

    // kość nad torem
    if (!this.boneTaken) {
      spinBob(this.bone, t, 2.4);
      if (Math.hypot(this.bone.position.x - this.x, this.bone.position.z - -this.z) < 1.5) {
        this.boneTaken = true;
        this.collectGoldenBone();
        this.bone.visible = false;
        ctx.audio.sfx('bone');
        ctx.haptics.impact('heavy');
        this.fx.emit(this.bone.position, { count: 40, speed: 4, life: 1, size: 0.2, color: '#ffd23f' });
      }
    }

    // błysk wybuchu
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.intensity = this.flashT > 0 ? 400 * (this.flashT / 0.35) : 0;
    this.hemi.intensity = 0.7 + (this.flashT > 0 ? 0.9 * (this.flashT / 0.35) : 0);

    ctx.hud.setCourage(this.courage);
    ctx.hud.setProgress(this.z / LENGTH);
    ctx.haptics.setHeartbeat(this.courage < 0.5 ? 110 + (0.5 - this.courage) * 120 : 0, 0.4);
    ctx.audio.setMusicIntensity(1 - this.courage);
    this.fx.update(dt, ctx);
    this.sparks.update(dt, ctx);

    if (this.z >= LENGTH) this.win({ stars: this.hits === 0 && this.booms > 0 ? 3 : this.hits <= 3 ? 2 : 1 });
    else if (this.courage <= 0.001 && this.freeze > 0) {
      ctx.hud.showHint('Fado uciekł w panice...');
      this.lose();
    }
  }

  protected onCleanup(): void {
    this.fado.rig.dispose();
  }
}
