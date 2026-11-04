import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, cameraAnchor, clamp, damp, glow, makeFado, mat, Particles, plane, pineTree, scatter, sphere, TAU, wrapAngle, type FadoActor } from '../kit';

const POINTS = 72;
const X_SPAN = 11;
const ROUNDS = [
  { amp: 0.9, phase: 1.1, k: 1.0, noise: 0.03 },
  { amp: 1.35, phase: 4.1, k: 1.3, noise: 0.05 },
  { amp: 0.55, phase: 2.6, k: 1.7, noise: 0.08 },
  { amp: 1.15, phase: 5.4, k: 2.1, noise: 0.11 },
];
const AMP_MIN = 0.2;
const AMP_MAX = 1.6;
const HOLD_NEEDED = 1.1;
const TIME_LIMIT = 110;

/** Poziom 1: dopasuj amplitudę i fazę fali zapachu, filtrując szum lasu. */
export class Game01Symphony extends BaseMinigame {
  readonly id = 1;

  private fado!: FadoActor;
  private target!: THREE.InstancedMesh;
  private player!: THREE.InstancedMesh;
  private noiseWave!: THREE.InstancedMesh;
  private knobs: THREE.Mesh[] = [];
  private fx!: Particles;
  private tmp = new THREE.Object3D();

  private round = 0;
  private amp = 0.5;
  private phase = 0;
  private sliderOf = new Map<number, 'amp' | 'phase'>();
  private hold = 0;
  private tick = 0;
  private roundDone = 0;
  private timeLeft = TIME_LIMIT;
  private flash = 0;
  private fadoPos = new THREE.Vector3(-4.2, 0, 1.2);

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('dusk');
    const { dir } = addLighting(ctx, { sky: '#c9b6ff', ground: '#3b2b4a', sun: '#ffd0a0', sunIntensity: 2.2 });
    ctx.root.add(plane(80, 80, mat('#2f4a35', { roughness: 1 }), [0, -2.6, -4]));
    scatter(ctx, () => pineTree(4 + ctx.random() * 3), 26, { x: [-22, 22], z: [-24, -8] });

    const dot = new THREE.SphereGeometry(0.1, 8, 6);
    this.target = new THREE.InstancedMesh(dot, glow('#ffd23f', 1.8), POINTS);
    this.player = new THREE.InstancedMesh(dot, glow('#47e0ff', 1.6), POINTS);
    this.noiseWave = new THREE.InstancedMesh(dot, mat('#a9a9b8', { transparent: true, opacity: 0.45 }), POINTS);
    for (const m of [this.target, this.player, this.noiseWave]) {
      m.frustumCulled = false;
      ctx.root.add(m);
    }

    // „suwaki” po bokach: tory i gałki
    for (const side of [-1, 1]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.12), mat('#ffffff', { transparent: true, opacity: 0.35 }));
      track.position.set(side * (X_SPAN / 2 + 1.2), 0, 0);
      const knob = sphere(0.28, glow(side < 0 ? '#ff9d4a' : '#9a7bff', 1.2));
      knob.position.set(track.position.x, 0, 0);
      this.knobs.push(knob);
      ctx.root.add(track, knob);
    }

    this.fado = makeFado(ctx, { scale: 1.05, lightDir: dir });
    this.fado.group.position.copy(this.fadoPos);
    this.fado.group.rotation.y = Math.PI * 0.5;
    this.fado.rig.motion.expression = 'sniff';

    this.fx = new Particles(160);
    ctx.root.add(this.fx.points);
    cameraAnchor(ctx, 0, 0.4, 0);
    ctx.camera.apply({ offset: [0, 0.4, 13], look: [0, 0, 0], fov: 38, bokeh: 0.6, duration: 0 });
    ctx.hud.setObjective('Dopasuj złotą falę zapachu');
    ctx.hud.showHint('Lewy kciuk: siła fali · Prawy kciuk: faza');
  }

  startGame(): void {
    this.ctx.audio.music('forest');
    this.ctx.hud.setTimer(TIME_LIMIT * this.ctx.assist);
    this.timeLeft = TIME_LIMIT * this.ctx.assist;
    this.setRound(0);
  }

  private setRound(i: number): void {
    this.round = i;
    this.hold = 0;
    this.ctx.hud.setObjective(`Fala ${i + 1} z ${ROUNDS.length}`);
    this.ctx.hud.setProgress(i / ROUNDS.length);
  }

  handleInput(e: InputEvent): void {
    if (e.type === 'pointer-down') {
      const role = e.nx < 0 ? 'amp' : 'phase';
      for (const r of this.sliderOf.values()) if (r === role) return; // jeden palec na suwak
      this.sliderOf.set(e.pointerId, role);
      this.applySlider(role, e.ny);
      this.ctx.audio.sfx('tick');
    } else if (e.type === 'pointer-move') {
      const role = this.sliderOf.get(e.pointerId);
      if (role) this.applySlider(role, e.ny);
    } else if (e.type === 'pointer-up') {
      this.sliderOf.delete(e.pointerId);
    }
  }

  private applySlider(role: 'amp' | 'phase', ny: number): void {
    const v = clamp((ny + 0.8) / 1.6, 0, 1);
    if (role === 'amp') this.amp = AMP_MIN + v * (AMP_MAX - AMP_MIN);
    else this.phase = v * TAU;
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const r = ROUNDS[this.round];
    const t = this.elapsed;

    this.timeLeft -= dt;
    ctx.hud.setTimer(Math.max(0, this.timeLeft));
    if (this.timeLeft <= 0) {
      this.lose();
      return;
    }

    const dAmp = Math.abs(this.amp - r.amp);
    const dPhase = Math.abs(wrapAngle(this.phase - r.phase));
    const tolAmp = 0.13 * ctx.assist;
    const tolPhase = 0.36 * ctx.assist;
    const closeness = clamp(1 - Math.max(dAmp / 0.8, dPhase / 2.2), 0, 1);
    const matched = dAmp < tolAmp && dPhase < tolPhase;

    this.hold = matched ? this.hold + dt : Math.max(0, this.hold - dt * 1.5);
    ctx.hud.setProgress((this.round + clamp(this.hold / HOLD_NEEDED, 0, 1)) / ROUNDS.length);
    ctx.hud.setCourage(clamp(closeness, 0, 1));

    // sprzężenie zwrotne: ton i haptyka rosną w miarę zbliżania się do celu
    this.tick -= dt;
    if (this.tick <= 0 && this.sliderOf.size > 0) {
      this.tick = 0.22 - closeness * 0.12;
      ctx.audio.tone(220 + closeness * 520, 0.12, { type: 'sine', gain: 0.05 + closeness * 0.06 });
      if (closeness > 0.6) ctx.haptics.impact('light');
    }

    // fale
    const jitter = r.noise;
    for (let i = 0; i < POINTS; i++) {
      const u = i / (POINTS - 1);
      const x = (u - 0.5) * X_SPAN;
      const arg = x * r.k * 0.9 + t * 1.6;
      const ty = r.amp * Math.sin(arg + r.phase);
      const py = this.amp * Math.sin(arg + this.phase) + Math.sin(t * 17 + i * 1.7) * jitter * 3;
      const ny = 0.6 * Math.sin(x * 2.3 - t * 3.1) + 0.4 * Math.sin(x * 4.7 + t * 2.2);
      this.place(this.target, i, x, ty + 0.05, 0, matched ? 1.4 : 1);
      this.place(this.player, i, x, py - 0.05, 0.05, 1);
      this.place(this.noiseWave, i, x, ny * (0.5 + jitter * 6), -0.2, 0.8);
    }
    for (const m of [this.target, this.player, this.noiseWave]) m.instanceMatrix.needsUpdate = true;

    this.knobs[0].position.y = ((this.amp - AMP_MIN) / (AMP_MAX - AMP_MIN) - 0.5) * 3;
    this.knobs[1].position.y = (this.phase / TAU - 0.5) * 3;

    // Fado „czuje” zapach: im bliżej, tym radośniej
    this.fado.rig.motion.expression = closeness > 0.8 ? 'happy' : 'sniff';
    this.fado.rig.update(dt, t);
    this.flash = damp(this.flash, 0, 4, dt);
    this.fx.update(dt, ctx);

    if (this.hold >= HOLD_NEEDED) this.completeRound();
  }

  private place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, s: number): void {
    this.tmp.position.set(x, y, z);
    this.tmp.scale.setScalar(s);
    this.tmp.updateMatrix();
    mesh.setMatrixAt(i, this.tmp.matrix);
  }

  private completeRound(): void {
    const ctx = this.ctx;
    this.roundDone++;
    ctx.audio.sfx('sparkle');
    ctx.haptics.impact('medium');
    ctx.camera.punchFov(-4);
    this.fx.emit(new THREE.Vector3(0, 0, 0.3), { count: 40, speed: 4, life: 1, size: 0.2, color: '#ffd23f', gravity: -1 });
    if (this.roundDone >= ROUNDS.length) {
      ctx.hud.setProgress(1);
      const fast = this.elapsed < 40;
      if (fast) this.collectGoldenBone();
      this.win({ stars: this.elapsed < 40 ? 3 : this.elapsed < 70 ? 2 : 1 });
      return;
    }
    this.setRound(this.round + 1);
  }

  protected onCleanup(): void {
    this.sliderOf.clear();
    this.fado.rig.dispose();
  }
}
