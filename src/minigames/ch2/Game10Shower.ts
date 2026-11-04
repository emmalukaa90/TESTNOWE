import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, cameraAnchor, clamp, cyl, damp, glow, makeFado, mat, Particles, plane, sphere, wrapAngle, type FadoActor } from '../kit';

type Zone = 'tail' | 'legs' | 'torso' | 'head';
const ZONES: Zone[] = ['tail', 'legs', 'torso', 'head'];
const KNOB_TURNS = 1.5 * Math.PI;
const WASH_RATE = 0.62;

/** Poziom 10: kręć zraszaczem, by zmyć błoto, a potem otrząśnij Fado. */
export class Game10Shower extends BaseMinigame {
  readonly id = 10;

  private fado!: FadoActor;
  private water!: Particles;
  private splash!: Particles;
  private knob = new THREE.Group();
  private knobPos = new THREE.Vector3(3.4, 0.9, 1.6);
  private nozzle = new THREE.Vector3(-3.6, 1.0, 0);
  private anchors = new Map<Zone, THREE.Vector2>();
  private mud: Record<Zone, number> = { tail: 1, legs: 1, torso: 1, head: 1 };
  private aim = new THREE.Vector2();
  private s = 0;
  private acc = 0;
  private lastAngle = 0;
  private knobId: number | null = null;
  private phase: 'wash' | 'shake' = 'wash';
  private shakeProg = 0;
  private shakeVis = 0;
  private fadoSize = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set({ background: '#bfe3f5', fogColor: '#d9efe0', fogNear: 20, fogFar: 70 });
    const { dir } = addLighting(ctx, { sky: '#e8f6ff', ground: '#6fa04a', sunIntensity: 3.2, sunPos: [-5, 12, 9] });
    ctx.root.add(plane(40, 30, mat('#79b552', { roughness: 1 }), [0, 0, -4]));
    ctx.root.add(plane(5, 4, mat('#6a4a30', { roughness: 1 }), [0, 0.02, 0]));
    // płot i budynek w tle
    ctx.root.add(box(24, 2.2, 0.2, mat('#d6b17a'), [0, 1.1, -5]));
    for (let i = 0; i < 12; i++) ctx.root.add(box(0.3, 2.5, 0.3, mat('#a97d4a'), [-11 + i * 2, 1.25, -4.9]));
    ctx.root.add(box(7, 4, 3, mat('#c0392b'), [8, 2, -9]), box(7.6, 0.4, 3.4, mat('#4a3a32'), [8, 4.1, -9]));
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Group();
      f.add(sphere(0.18, mat(['#ff6b9d', '#ffd23f', '#ffffff', '#a29bfe', '#ff9f43'][i]), [0, 0.5, 0], 8), cyl(0.02, 0.02, 0.5, mat('#3a7a3a'), [0, 0.25, 0], 4));
      f.position.set(-4.5 + i * 1.1, 0, -3.2);
      ctx.root.add(f);
    }

    // Fado (bokiem do kamery) i strefy błota
    this.fado = makeFado(ctx, { scale: 1.45, lightDir: dir });
    this.fado.group.rotation.y = Math.PI / 2;
    this.fado.group.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(this.fado.group);
    box3.getSize(this.fadoSize);
    const w = this.fadoSize.x;
    const h = this.fadoSize.y;
    this.anchors.set('tail', new THREE.Vector2(box3.min.x + w * 0.1, box3.min.y + h * 0.62));
    this.anchors.set('legs', new THREE.Vector2(box3.min.x + w * 0.48, box3.min.y + h * 0.18));
    this.anchors.set('torso', new THREE.Vector2(box3.min.x + w * 0.5, box3.min.y + h * 0.55));
    this.anchors.set('head', new THREE.Vector2(box3.max.x - w * 0.1, box3.min.y + h * 0.78));
    this.fado.rig.setMud(1);

    // zraszacz
    const metal = mat('#8a949e', { metalness: 0.6, roughness: 0.4 });
    ctx.root.add(cyl(0.12, 0.16, 1.0, metal, [this.nozzle.x, 0.5, 0], 10), sphere(0.2, mat('#2f80ed'), [this.nozzle.x, 1.0, 0], 12));

    // pokrętło
    const disc = cyl(0.8, 0.8, 0.25, mat('#2f80ed'), [0, 0, 0], 28);
    disc.rotation.x = Math.PI / 2;
    const tick = box(0.14, 0.7, 0.12, mat('#ffffff'), [0, 0.4, 0.18]);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.05, 8, 40), glow('#ffd23f', 1.0));
    this.knob.add(disc, tick, ring);
    this.knob.position.copy(this.knobPos);
    ctx.root.add(this.knob);

    this.water = new Particles(500, { additive: false, opacity: 0.8 });
    this.splash = new Particles(200, { additive: false, opacity: 0.8 });
    ctx.root.add(this.water.points, this.splash.points);

    cameraAnchor(ctx, 0.2, 1.1, 0);
    ctx.camera.apply({ offset: [0, 0.8, 8.2], look: [0, 0, 0], fov: 38, bokeh: 0.6, duration: 0 });
    ctx.hud.setObjective('Zmyj błoto z Fado');
    ctx.hud.showHint('Kręć pokrętłem zgodnie z ruchem wskazówek zegara');
    ctx.hud.setCourage(1);
    this.aim.copy(this.anchors.get('tail') as THREE.Vector2);
  }

  startGame(): void {
    this.ctx.audio.music('farm');
    void this.ctx.input.enableMotion();
  }

  /** Środek pokrętła w znormalizowanych współrzędnych ekranu. */
  private knobScreen(): THREE.Vector2 {
    const cam = this.ctx.view.camera;
    if (!cam) return new THREE.Vector2(0.7, -0.5);
    const v = this.tmp.copy(this.knobPos).project(cam);
    return new THREE.Vector2(v.x, v.y);
  }

  private angleAt(nx: number, ny: number): number {
    const c = this.knobScreen();
    const aspect = this.ctx.view.width / Math.max(1, this.ctx.view.height);
    return Math.atan2(ny - c.y, (nx - c.x) * aspect);
  }

  handleInput(e: InputEvent): void {
    if (this.phase === 'wash') {
      if (e.type === 'pointer-down' && this.knobId === null) {
        const c = this.knobScreen();
        const aspect = this.ctx.view.width / Math.max(1, this.ctx.view.height);
        if (Math.hypot((e.nx - c.x) * aspect, e.ny - c.y) < 0.75) {
          this.knobId = e.pointerId;
          this.lastAngle = this.angleAt(e.nx, e.ny);
          this.ctx.audio.sfx('tick');
        }
      } else if (e.type === 'pointer-move' && e.pointerId === this.knobId) {
        const a = this.angleAt(e.nx, e.ny);
        this.acc += wrapAngle(a - this.lastAngle);
        this.lastAngle = a;
        this.ctx.audio.sfx('tick', { gain: 0.15 });
      } else if (e.type === 'pointer-up' && e.pointerId === this.knobId) {
        this.knobId = null;
      }
      return;
    }
    // faza otrząsania: potrząśnięcie telefonem lub szybkie przeciąganie palcem
    if (e.type === 'shake') this.addShake(e.intensity * 0.35);
    else if (e.type === 'pointer-move') this.addShake(Math.min(0.05, (Math.abs(e.dx) + Math.abs(e.dy)) * 0.0016));
  }

  private addShake(v: number): void {
    this.shakeProg = clamp(this.shakeProg + v * (this.ctx.assist > 1 ? 1.4 : 1), 0, 1);
    this.shakeVis = Math.min(1, this.shakeVis + v * 3);
    if (Math.random() < 0.4) this.ctx.haptics.impact('light');
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    const rig = this.fado.rig;

    if (this.phase === 'wash') {
      // kąt zgodny z ruchem wskazówek (ujemny w układzie y-w-górę) = dalej wzdłuż psa
      this.s = clamp(-this.acc / KNOB_TURNS, 0, 1);
      this.acc = Math.max(this.acc, -KNOB_TURNS * 1.05);
      this.knob.rotation.z = damp(this.knob.rotation.z, -this.s * KNOB_TURNS, 14, dt);

      // punkt celowania wędruje po kolejnych strefach
      const pts = ZONES.map((z) => this.anchors.get(z) as THREE.Vector2);
      const f = this.s * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(f));
      this.aim.lerpVectors(pts[i], pts[i + 1], f - i);

      const spraying = this.s > 0.0 || this.knobId !== null;
      if (spraying) this.spray(dt);
      let total = 0;
      for (const z of ZONES) {
        const a = this.anchors.get(z) as THREE.Vector2;
        const dist = this.aim.distanceTo(a);
        if (dist < 0.55 * this.fadoSize.y && this.mud[z] > 0) {
          const before = this.mud[z];
          this.mud[z] = Math.max(0, this.mud[z] - WASH_RATE * ctx.assist * dt);
          if (before > 0 && this.mud[z] === 0) {
            ctx.audio.sfx('sparkle', { gain: 0.5 });
            ctx.haptics.impact('medium');
          }
        }
        total += this.mud[z];
      }
      rig.setMud({ torso: this.mud.torso, head: this.mud.head, legs: this.mud.legs, tail: this.mud.tail });
      const clean = 1 - total / ZONES.length;
      ctx.hud.setProgress(clean * 0.7);
      rig.motion.expression = this.knobId !== null && clean < 0.99 ? 'scared' : 'idle';
      if (total < 0.02) {
        this.phase = 'shake';
        rig.setMud(0);
        ctx.hud.setObjective('Otrząśnij się!');
        ctx.hud.showHint('Potrząśnij telefonem albo szybko przeciągaj palcem');
        ctx.audio.sfx('win', { gain: 0.5 });
      }
    } else {
      this.shakeVis = damp(this.shakeVis, 0, 3, dt);
      rig.motion.shake = this.shakeVis;
      rig.motion.expression = 'happy';
      ctx.hud.setProgress(0.7 + this.shakeProg * 0.3);
      if (this.shakeVis > 0.25 && Math.random() < dt * 50) {
        this.splash.emit(new THREE.Vector3(0, 1.0, 0), { count: 3, speed: 4, life: 0.7, size: 0.07, color: '#bfe8ff', gravity: 9, spread: 1 });
      }
      if (this.shakeProg >= 1) {
        rig.motion.shake = 0;
        ctx.audio.sfx('shake');
        this.splash.emit(new THREE.Vector3(0, 1.1, 0), { count: 80, speed: 6, life: 1, size: 0.09, color: '#d8f2ff', gravity: 9 });
        if (this.elapsed < 35) this.collectGoldenBone();
        this.win({ stars: this.elapsed < 35 ? 3 : this.elapsed < 55 ? 2 : 1 });
      }
    }

    rig.update(dt, t);
    this.water.update(dt, ctx);
    this.splash.update(dt, ctx);
  }

  private spray(dt: number): void {
    const dir = new THREE.Vector3(this.aim.x - this.nozzle.x, this.aim.y - this.nozzle.y, 0);
    const dist = dir.length();
    dir.normalize();
    const n = Math.round(60 * dt) + 1;
    for (let i = 0; i < n; i++) {
      this.water.emit(this.nozzle, { count: 1, speed: 11, life: dist / 11, size: 0.08, color: '#9fdcff', dir: dir.clone().multiplyScalar(4), spread: 0.18, gravity: 1.4 });
    }
    if (Math.random() < dt * 40) this.splash.emit(new THREE.Vector3(this.aim.x, this.aim.y, 0.2), { count: 3, speed: 2.2, life: 0.5, size: 0.07, color: '#ffffff', gravity: 6 });
    if (Math.random() < dt * 8) this.ctx.audio.sfx('spray', { gain: 0.35 });
  }

  protected onCleanup(): void {
    this.ctx.input.disableMotion();
    this.fado.rig.dispose();
  }
}
