import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, damp, glow, goldenBone, makeFado, mat, Particles, plane, pineTree, scatter, sphere, spinBob, type FadoActor } from '../kit';

const STEPS = 15;
const STEP_LEN = 1.15;
const MAX_ALERTS = 3;

/** Poziom 4: rytmiczne skradanie obok śpiącego niedźwiedzia. */
export class Game04NightScout extends BaseMinigame {
  readonly id = 4;

  private fado!: FadoActor;
  private bear = new THREE.Group();
  private belly!: THREE.Mesh;
  private eyes: THREE.Mesh[] = [];
  private fx!: Particles;
  private mist!: Particles;
  private flies!: Particles;
  private bone!: THREE.Group;
  private boneTaken = false;

  private steps = 0;
  private lastSide: 'left' | 'right' | null = null;
  private alerts = 0;
  private errors = 0;
  private breathT = 0;
  private period = 3;
  private exhale = false;
  private lastExhale = false;
  private fadoX = -9;
  private targetX = -9;
  private wake = 0;
  private cycle = 0;

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('night');
    const { dir, sun } = addLighting(ctx, { sky: '#4a5a9a', ground: '#101428', hemi: 0.6, sun: '#9bb7ff', sunIntensity: 1.6, sunPos: [6, 14, 6] });
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    ctx.root.add(plane(90, 40, mat('#1d3a2c', { roughness: 1 }), [0, 0, 0]));
    // ścieżka
    ctx.root.add(plane(36, 2.2, mat('#6f5b44', { roughness: 1 }), [0, 0.02, 0]));
    scatter(ctx, () => pineTree(5 + ctx.random() * 4, '#3a2a20', '#1d4030'), 46, { x: [-30, 30], z: [-16, -4] });
    scatter(ctx, () => pineTree(5 + ctx.random() * 3, '#3a2a20', '#1d4030'), 20, { x: [-30, 30], z: [4, 12] });

    // księżyc
    const moon = sphere(2.2, glow('#fff6d6', 1.2), [-12, 14, -22]);
    ctx.root.add(moon);

    // niedźwiedź: śpiący kopiec przy ścieżce
    const fur = mat('#4a3426', { roughness: 1 });
    this.belly = sphere(2.0, fur, [0, 1.6, 0], 20);
    this.belly.scale.set(1.4, 0.95, 1.1);
    const head = sphere(0.95, fur, [-2.3, 1.1, 1.0], 16);
    const snout = sphere(0.5, mat('#6a4d38'), [-3.1, 0.95, 1.3], 12);
    const nose = sphere(0.14, mat('#111'), [-3.55, 1.0, 1.3], 8);
    for (const s of [-1, 1]) {
      const ear = sphere(0.32, fur, [-2.0, 1.95, 1.0 + s * 0.65], 10);
      this.bear.add(ear);
      const eye = sphere(0.09, glow('#ffe08a', 0), [-3.0, 1.3, 1.3 + s * 0.35], 8);
      eye.castShadow = false;
      this.eyes.push(eye);
      this.bear.add(eye);
    }
    const paw = sphere(0.7, fur, [-1.0, 0.5, 2.1], 12);
    paw.scale.set(1.5, 0.6, 1);
    this.bear.add(this.belly, head, snout, nose, paw);
    this.bear.position.set(0, 0, -3.4);
    ctx.root.add(this.bear);

    this.fado = makeFado(ctx, { scale: 1.0, lightDir: dir });
    this.fado.group.position.set(this.fadoX, 0, 0);
    this.fado.group.rotation.y = Math.PI / 2;

    this.bone = goldenBone(1.3);
    this.bone.position.set(STEP_LEN * STEPS - 9 + 1.5, 0.8, 0);
    ctx.root.add(this.bone);
    // wyjście — latarnia-krzew
    ctx.root.add(box(0.3, 3, 0.3, mat('#2a2a2a'), [STEP_LEN * STEPS - 9 + 3, 1.5, 1.2]));
    ctx.root.add(sphere(0.4, glow('#ffd27a', 2.2), [STEP_LEN * STEPS - 9 + 3, 3.1, 1.2]));

    this.fx = new Particles(120);
    this.mist = new Particles(80, { additive: false, opacity: 0.35 });
    this.flies = new Particles(60);
    ctx.root.add(this.fx.points, this.mist.points, this.flies.points);
    for (let i = 0; i < 40; i++) this.flies.emit(new THREE.Vector3(ctx.random() * 40 - 20, 0.5 + ctx.random() * 3, ctx.random() * 14 - 7), { count: 1, speed: 0.3, life: 40, size: 0.09, color: '#d8ff8a' });

    ctx.camera.setTarget(this.fado.group);
    ctx.camera.apply({ offset: [2.5, 3.0, 8], look: [2.5, 0.9, -1], fov: 40, bokeh: 1.6, duration: 0 });
    ctx.hud.setObjective('Przemknij obok niedźwiedzia');
    ctx.hud.showHint('Stukaj lewo-prawo, ale tylko na WYDECH niedźwiedzia');
    ctx.hud.setCourage(1);
    this.nextPeriod();
  }

  private nextPeriod(): void {
    this.period = 2.4 + this.ctx.random() * 1.0;
    this.cycle++;
  }

  startGame(): void {
    this.ctx.audio.music('night');
    this.ctx.audio.setMusicIntensity(0.2);
  }

  handleInput(e: InputEvent): void {
    if (e.type !== 'tap') return;
    const ctx = this.ctx;
    const wrongRhythm = !this.exhale;
    const sameSide = this.lastSide === e.side;
    if (wrongRhythm || sameSide) {
      this.alert(wrongRhythm ? 'Niedźwiedź się poruszył!' : 'Niezgrabnie — zmieniaj strony!');
      return;
    }
    this.lastSide = e.side;
    this.steps++;
    this.targetX += STEP_LEN;
    ctx.audio.sfx('step', { gain: 0.35, pan: e.side === 'left' ? -0.4 : 0.4 });
    ctx.haptics.impact('light');
    ctx.hud.setProgress(this.steps / STEPS);
    this.fx.emit(new THREE.Vector3(this.targetX - STEP_LEN, 0.05, 0.3), { count: 4, speed: 0.6, life: 0.5, size: 0.1, color: '#a89878', gravity: 2 });
    if (this.steps >= STEPS) {
      if (this.errors === 0) this.collectGoldenBone();
      this.win({ stars: this.alerts === 0 ? 3 : this.alerts === 1 ? 2 : 1 });
    }
  }

  private alert(msg: string): void {
    const ctx = this.ctx;
    this.alerts++;
    this.errors++;
    this.wake = 1;
    ctx.hud.showHint(msg);
    ctx.hud.setCourage(1 - this.alerts / MAX_ALERTS);
    ctx.audio.sfx('snore', { gain: 1.2 });
    ctx.haptics.pattern([60, 40, 90]);
    ctx.camera.shake(0.45, 0.5);
    this.fado.rig.blinkNow();
    this.lastSide = null;
    if (this.alerts >= MAX_ALERTS) this.lose();
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    const assistedExhale = 0.5 * Math.min(ctx.assist, 1.3);
    this.breathT += dt;
    if (this.breathT >= this.period) {
      this.breathT -= this.period;
      this.nextPeriod();
    }
    const phase = this.breathT / this.period;
    // dłuższy wydech z trybem pomocy
    this.exhale = phase >= 1 - assistedExhale;
    if (this.exhale !== this.lastExhale) {
      this.lastExhale = this.exhale;
      if (this.exhale) {
        ctx.audio.sfx('snore', { gain: 0.8 });
        ctx.hud.showHint('WYDECH — teraz!');
      } else {
        ctx.hud.showHint('Wdech… czekaj');
      }
    }

    // oddychanie: brzuch unosi się przy wdechu, opada przy wydechu
    const breath = this.exhale ? 1 - (phase - (1 - assistedExhale)) / assistedExhale : phase / (1 - assistedExhale);
    this.belly.scale.y = 0.95 + breath * 0.1 + this.wake * 0.03;
    this.bear.rotation.z = Math.sin(t * 0.7) * 0.01;
    if (this.exhale && Math.random() < dt * 28) {
      this.mist.emit(new THREE.Vector3(-3.7, 1.0, -3.4 + 1.3), { count: 1, speed: 0.8, life: 1.3, size: 0.45, color: '#c8d4ff', dir: new THREE.Vector3(-1, 0.2, 0.2), spread: 0.4 });
    }
    // oczy niedźwiedzia uchylają się po błędach
    this.wake = damp(this.wake, 0, 0.9, dt);
    for (const eye of this.eyes) (eye.material as THREE.MeshStandardMaterial).emissiveIntensity = this.wake * 2.2;

    // Fado płynnie podchodzi do kolejnych kroków
    const prev = this.fadoX;
    this.fadoX = damp(this.fadoX, this.targetX, 9, dt);
    const speed = (this.fadoX - prev) / Math.max(dt, 1e-4);
    const m = this.fado.rig.motion;
    m.speed = clamp(speed / 3, 0, 0.6);
    m.expression = this.alerts > 0 && this.wake > 0.3 ? 'scared' : speed > 0.2 ? 'run' : 'alert';
    this.fado.group.position.x = this.fadoX;
    this.fado.rig.update(dt, t);

    if (!this.boneTaken) {
      spinBob(this.bone, t, 0.8);
      if (Math.abs(this.fadoX - this.bone.position.x) < 0.9 && this.errors === 0) {
        this.boneTaken = true;
        this.bone.visible = false;
        ctx.audio.sfx('bone');
        this.fx.emit(this.bone.position, { count: 30, speed: 3, life: 1, size: 0.15, color: '#ffd23f' });
      }
    }

    // świetliki dryfują
    this.flies.update(dt, ctx);
    this.mist.update(dt, ctx);
    this.fx.update(dt, ctx);
    ctx.audio.setMusicIntensity(0.2 + this.alerts * 0.2);
  }

  protected onCleanup(): void {
    this.fado.rig.dispose();
  }
}
