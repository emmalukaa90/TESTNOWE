import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, cameraAnchor, clamp, cyl, damp, glow, makeFado, mat, Particles, plane, sphere, type FadoActor } from '../kit';

type Sign = 'howl' | 'bark' | 'scratch';
const SIGNS: Sign[] = ['howl', 'bark', 'scratch'];
const COLORS: Record<Sign, string> = { howl: '#a29bfe', bark: '#ffa94d', scratch: '#69db7c' };
const LABELS: Record<Sign, string> = { howl: 'Wycie', bark: 'Szczek', scratch: 'Drap' };
const ICONS: Record<Sign, string> = { howl: '🐺', bark: '🐕', scratch: '🐾' };
const ROUND_LENGTHS = [3, 4, 4, 5, 6];

/** Poziom 16: powtórz sekwencję starego psa strażnika — wycie, szczeknięcie, drapanie. */
export class Game16Cipher extends BaseMinigame {
  readonly id = 16;

  private fado!: FadoActor;
  private guard!: FadoActor;
  private fx!: Particles;
  private orbs = new Map<Sign, THREE.Mesh>();
  private gate!: THREE.Group;
  private gateOpen = 0;

  private round = 0;
  private sequence: Sign[] = [];
  private phase: 'demo' | 'input' | 'between' = 'between';
  private phaseT = 1.2;
  private demoIdx = 0;
  private inputIdx = 0;
  private mistakes = 0;
  private lives = 3;
  private guardPose: Sign | null = null;
  private guardT = 0;
  private fadoPose: Sign | null = null;
  private fadoT = 0;

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('night');
    const { dir } = addLighting(ctx, { sky: '#5a6aa8', ground: '#1a1a2a', hemi: 0.7, sun: '#a9c0ff', sunIntensity: 1.8, sunPos: [-6, 12, 10] });
    ctx.root.add(plane(40, 30, mat('#2e3328', { roughness: 1 }), [0, 0, -4]));
    // brama zajezdni
    this.gate = new THREE.Group();
    this.gate.add(box(3.2, 5, 0.3, mat('#3a3f46', { metalness: 0.5, roughness: 0.5 }), [-1.6, 2.5, 0]));
    const right = box(3.2, 5, 0.3, mat('#3a3f46', { metalness: 0.5, roughness: 0.5 }), [1.6, 2.5, 0]);
    this.gate.add(right);
    this.gate.position.set(0, 0, -6);
    ctx.root.add(this.gate);
    ctx.root.add(box(0.6, 6, 0.6, mat('#222'), [-3.6, 3, -6]), box(0.6, 6, 0.6, mat('#222'), [3.6, 3, -6]));
    ctx.root.add(box(40, 3, 0.3, mat('#2d2f36'), [0, 1.5, -6.2]));
    ctx.root.add(cyl(0.1, 0.12, 5, mat('#333'), [-6, 2.5, -2], 6), sphere(0.4, glow('#ffd27a', 2.2), [-6, 5.1, -2], 10));
    const lamp = new THREE.PointLight('#ffb35a', 30, 18, 2);
    lamp.position.set(-6, 5, -1);
    ctx.root.add(lamp);

    // pies strażnik: szara sierść, bez szalika
    this.guard = makeFado(ctx, { scale: 1.5, carryScarf: false, quality: 'low', palette: { brown: '#6e7077', black: '#34363c', white: '#c9ccd2' }, lightDir: dir });
    this.guard.group.position.set(2.8, 0, -1.2);
    this.guard.group.rotation.y = -Math.PI / 2 + 0.2;
    this.fado = makeFado(ctx, { scale: 1.1, lightDir: dir });
    this.fado.group.position.set(-2.4, 0, 0.6);
    this.fado.group.rotation.y = Math.PI / 2 - 0.2;

    // trzy kolorowe lampy-symbole nad nimi
    SIGNS.forEach((s, i) => {
      const orb = sphere(0.38, glow(COLORS[s], 0.2), [(i - 1) * 1.6, 4.4, 0], 14);
      this.orbs.set(s, orb);
      ctx.root.add(orb);
      ctx.root.add(cyl(0.03, 0.03, 1.2, mat('#555'), [(i - 1) * 1.6, 5.1, 0], 4));
    });
    this.fx = new Particles(220);
    ctx.root.add(this.fx.points);

    cameraAnchor(ctx, 0, 2.2, 0);
    ctx.camera.apply({ offset: [0, 1.2, 11], look: [0, 0, 0], fov: 40, bokeh: 1.2, duration: 0 });
    ctx.hud.setObjective('Powtórz sekwencję strażnika');
    ctx.hud.setCourage(1);
  }

  startGame(): void {
    this.ctx.audio.music('night');
    this.ctx.audio.setMusicIntensity(0.3);
    this.ctx.hud.setActions(null);
    this.beginRound();
  }

  private beginRound(): void {
    const ctx = this.ctx;
    const len = ROUND_LENGTHS[this.round];
    this.sequence = Array.from({ length: len }, () => SIGNS[Math.floor(ctx.random() * 3)]);
    this.phase = 'demo';
    this.phaseT = 1.0;
    this.demoIdx = 0;
    this.inputIdx = 0;
    ctx.hud.setActions(null);
    ctx.hud.setObjective(`Runda ${this.round + 1} z ${ROUND_LENGTHS.length}: patrz i słuchaj`);
    ctx.hud.setProgress(this.round / ROUND_LENGTHS.length);
    ctx.hud.showHint(null);
  }

  private perform(who: 'guard' | 'fado', sign: Sign): void {
    const ctx = this.ctx;
    const orb = this.orbs.get(sign);
    if (orb) (orb.material as THREE.MeshStandardMaterial).emissiveIntensity = 3.2;
    ctx.audio.sfx(sign, { pan: who === 'guard' ? 0.5 : -0.5, gain: who === 'guard' ? 0.9 : 1 });
    const actor = who === 'guard' ? this.guard : this.fado;
    if (who === 'guard') {
      this.guardPose = sign;
      this.guardT = 0.8;
    } else {
      this.fadoPose = sign;
      this.fadoT = 0.8;
    }
    const origin = actor.group.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    this.fx.emit(origin, { count: 14, speed: 2.5, life: 0.9, size: 0.17, color: COLORS[sign], gravity: -0.5 });
    ctx.haptics.impact(sign === 'bark' ? 'heavy' : sign === 'howl' ? 'medium' : 'light');
  }

  handleInput(e: InputEvent): void {
    if (e.type !== 'action' || this.phase !== 'input') return;
    const sign = e.id as Sign;
    if (!SIGNS.includes(sign)) return;
    const ctx = this.ctx;
    this.perform('fado', sign);
    if (sign === this.sequence[this.inputIdx]) {
      this.inputIdx++;
      ctx.hud.showHint(`${this.inputIdx} / ${this.sequence.length}`);
      if (this.inputIdx >= this.sequence.length) {
        this.phase = 'between';
        this.phaseT = 1.0;
        ctx.hud.setActions(null);
        ctx.audio.sfx('sparkle');
        ctx.audio.sfx('perfect', { gain: 0.5 });
        this.round++;
        if (this.round >= ROUND_LENGTHS.length) {
          ctx.hud.setProgress(1);
          if (this.mistakes === 0) this.collectGoldenBone();
          this.gateOpen = 0.0001;
          ctx.audio.sfx('win', { gain: 0.5 });
          this.win({ stars: this.mistakes === 0 ? 3 : this.mistakes === 1 ? 2 : 1 });
        }
      }
    } else {
      this.mistakes++;
      this.lives--;
      ctx.hud.setCourage(this.lives / 3);
      ctx.audio.sfx('lose', { gain: 0.5 });
      ctx.audio.sfx('whine', { gain: 0.6 });
      ctx.haptics.pattern([80, 40, 80]);
      ctx.camera.shake(0.5, 0.4);
      this.fado.rig.motion.expression = 'scared';
      if (this.lives <= 0) {
        this.lose();
        return;
      }
      ctx.hud.showHint('Pomyłka! Strażnik powtórzy sekwencję.');
      // powtórka tej samej sekwencji
      this.phase = 'demo';
      this.phaseT = 1.4;
      this.demoIdx = 0;
      this.inputIdx = 0;
      ctx.hud.setActions(null);
    }
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    const step = 0.95 * ctx.assist;

    this.phaseT -= dt;
    if (this.phase === 'demo' && this.phaseT <= 0) {
      if (this.demoIdx < this.sequence.length) {
        this.perform('guard', this.sequence[this.demoIdx]);
        this.demoIdx++;
        this.phaseT = step;
      } else {
        this.phase = 'input';
        ctx.hud.setObjective('Twoja kolej!');
        ctx.hud.setActions(SIGNS.map((s) => ({ id: s, label: LABELS[s], icon: ICONS[s] })));
        ctx.hud.showHint('Powtórz sekwencję w tej samej kolejności');
      }
    } else if (this.phase === 'between' && this.phaseT <= 0 && this.round < ROUND_LENGTHS.length) {
      this.beginRound();
    }

    // lampy gasną
    for (const orb of this.orbs.values()) {
      const m = orb.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = damp(m.emissiveIntensity, 0.2, 6, dt);
    }

    // pozy psów
    this.applyPose(this.guard, this.guardPose, this.guardT, t);
    this.applyPose(this.fado, this.fadoPose, this.fadoT, t);
    this.guardT = Math.max(0, this.guardT - dt);
    this.fadoT = Math.max(0, this.fadoT - dt);
    if (this.guardT === 0) this.guardPose = null;
    if (this.fadoT === 0) this.fadoPose = null;
    this.guard.rig.update(dt, t);
    this.fado.rig.update(dt, t);

    if (this.gateOpen > 0) {
      this.gateOpen = Math.min(1, this.gateOpen + dt * 0.5);
      this.gate.children[0].position.x = -1.6 - this.gateOpen * 3;
      this.gate.children[1].position.x = 1.6 + this.gateOpen * 3;
    }
    this.fx.update(dt, ctx);
  }

  private applyPose(actor: FadoActor, sign: Sign | null, left: number, t: number): void {
    const rig = actor.rig;
    const k = clamp(left / 0.8, 0, 1);
    let pitch = 0;
    let shake = 0;
    rig.earLiftOverride = null;
    rig.motion.expression = 'idle';
    if (sign === 'howl') {
      pitch = -0.9 * Math.sin(k * Math.PI * 0.9);
      rig.earLiftOverride = 0.2;
      rig.motion.expression = 'alert';
    } else if (sign === 'bark') {
      pitch = 0.25 * Math.sin(k * Math.PI * 5);
      rig.motion.expression = 'alert';
    } else if (sign === 'scratch') {
      shake = 0.5 * k;
      rig.motion.expression = 'sniff';
      actor.group.rotation.z = Math.sin(t * 40) * 0.05 * k;
    }
    if (sign !== 'scratch') actor.group.rotation.z = 0;
    rig.look.pitch = damp(rig.look.pitch, pitch, 16, 0.016);
    rig.motion.shake = shake;
  }

  protected onCleanup(): void {
    this.guard.rig.dispose();
    this.fado.rig.dispose();
  }
}
