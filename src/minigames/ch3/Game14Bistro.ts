import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, cyl, damp, glow, makeFado, mat, Particles, sphere, type FadoActor } from '../kit';

type Phase = 'wait' | 'look' | 'waiter';
const NEEDED = 3;
const TIME_LIMIT = 100;

/** Poziom 14: pod stolikiem — dopasuj uszy i pochylenie głowy, gdy gość spojrzy w dół. */
export class Game14Bistro extends BaseMinigame {
  readonly id = 14;

  private fado!: FadoActor;
  private fx!: Particles;
  private guestHead = new THREE.Group();
  private waiter = new THREE.Group();
  private sausage!: THREE.Group;
  private markEar!: THREE.Mesh;
  private markTilt!: THREE.Mesh;
  private curEar!: THREE.Mesh;
  private curTilt!: THREE.Mesh;
  private susBar!: THREE.Mesh;

  private ear = 0.4;
  private tilt = 0;
  private targetEar = 0.8;
  private targetTilt = -0.5;
  private sliders = new Map<number, 'ear' | 'tilt'>();
  private phase: Phase = 'wait';
  private phaseT = 2;
  private match = 0;
  private charm = 0;
  private suspicion = 0;
  private maxSuspicion = 0;
  private timeLeft = TIME_LIMIT;
  private waiterX = 12;
  private waiterDir = -1;
  private lookCount = 0;

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set({ background: '#f0b48a', fogColor: '#e8b99c', fogNear: 25, fogFar: 80 });
    const { dir } = addLighting(ctx, { sky: '#ffe2c4', ground: '#6b5a48', sunIntensity: 2.4, sunPos: [-6, 10, 10], shadowRange: 16 });
    ctx.root.add(box(40, 0.3, 24, mat('#a98d70'), [0, -0.15, -4]));
    // ściana kawiarni z oknem i markizą
    ctx.root.add(box(40, 10, 0.4, mat('#e5cfa8'), [0, 5, -9]));
    ctx.root.add(box(10, 5, 0.1, new THREE.MeshStandardMaterial({ color: '#cfe8f0', transparent: true, opacity: 0.6 }), [-6, 4.2, -8.7]));
    const awning = box(14, 0.2, 3, mat('#d94a4a'), [4, 6.6, -7.6]);
    awning.rotation.x = 0.35;
    ctx.root.add(awning);
    for (let i = 0; i < 4; i++) ctx.root.add(sphere(0.18, glow('#ffe7a8', 1.4), [-10 + i * 6, 6, -4], 8));

    // stolik z obrusem: dwa płaty po bokach zostawiają „okienko” dla Fado
    ctx.root.add(cyl(2.6, 2.6, 0.18, mat('#f7f2e8'), [0, 2.45, 0], 28));
    const cloth = mat('#fff7ea');
    ctx.root.add(box(2.4, 1.0, 4.6, cloth, [-2.7, 1.9, 0]), box(2.4, 1.0, 4.6, cloth, [2.7, 1.9, 0]), box(1.4, 1.0, 0.1, cloth, [0, 1.9, -2.2]));
    ctx.root.add(cyl(0.12, 0.2, 2.3, mat('#4a3a30'), [0, 1.2, -0.3], 8));

    // talerz z kiełbaską
    ctx.root.add(cyl(0.7, 0.7, 0.06, mat('#ffffff'), [0.9, 2.58, 0.3], 20));
    this.sausage = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const s = sphere(0.2, mat('#c0392b'), [i * 0.35 - 0.17, 0.2, 0], 10);
      s.scale.set(1.9, 0.8, 0.8);
      this.sausage.add(s);
    }
    this.sausage.position.set(0.9, 2.65, 0.3);
    ctx.root.add(this.sausage);

    // gość: nogi pod stolikiem, tułów i głowa nad blatem
    const guest = new THREE.Group();
    guest.add(cyl(0.2, 0.2, 1.6, mat('#2d3a5a'), [-0.3, 1.1, 0.4], 10), cyl(0.2, 0.2, 1.6, mat('#2d3a5a'), [0.3, 1.1, 0.4], 10));
    guest.add(box(0.9, 0.35, 0.5, mat('#5a3a2a'), [-0.3, 0.2, 0.9]), box(0.9, 0.35, 0.5, mat('#5a3a2a'), [0.3, 0.2, 0.9]));
    guest.add(box(1.5, 2.0, 0.8, mat('#c97a5a'), [0, 3.6, 1.0]));
    this.guestHead.add(sphere(0.55, mat('#e5b999'), [0, 0, 0], 14), sphere(0.58, mat('#4a3322'), [0, 0.12, -0.06], 12));
    this.guestHead.position.set(0, 5.1, 1.0);
    guest.add(this.guestHead);
    guest.position.set(4.6, 0, 1.2);
    guest.rotation.y = -0.3;
    ctx.root.add(guest);

    // kelner w tle
    this.waiter.add(cyl(0.42, 0.5, 1.9, mat('#f1f1f1'), [0, 1.2, 0], 10), sphere(0.36, mat('#e0b48a'), [0, 2.45, 0], 10), box(0.55, 0.9, 0.12, mat('#222'), [0, 1.5, 0.45]));
    this.waiter.position.set(this.waiterX, 0, -6);
    ctx.root.add(this.waiter);

    this.fado = makeFado(ctx, { scale: 1.6, lightDir: dir });
    this.fado.group.position.set(0, 0.0, 1.2);
    this.fado.rig.earLiftOverride = this.ear;
    this.fx = new Particles(100);
    ctx.root.add(this.fx.points);

    // wskaźniki pozy: dwa pionowe paski z markerem celu i bieżącą wartością
    const mkBar = (x: number, color: string) => {
      const bar = box(0.18, 3.2, 0.1, mat('#ffffff', { transparent: true, opacity: 0.4 }), [x, 1.6, 4.4]);
      const cur = sphere(0.22, glow('#ffffff', 1.2), [x, 0, 4.5], 10);
      const mark = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 20), glow(color, 2));
      mark.position.set(x, 0, 4.5);
      ctx.root.add(bar, cur, mark);
      return { bar, cur, mark };
    };
    const a = mkBar(-4.4, '#ffd23f');
    const b = mkBar(4.4, '#7bff9b');
    this.curEar = a.cur; this.markEar = a.mark;
    this.curTilt = b.cur; this.markTilt = b.mark;
    this.susBar = box(3.0, 0.16, 0.1, glow('#ff4a4a', 1.2), [0, 7.6, 3]);
    this.susBar.scale.x = 0.001;
    ctx.root.add(this.susBar);

    ctx.camera.setTarget(this.makeAnchor(ctx));
    ctx.camera.apply({ offset: [0, 0, 12.5], look: [0, 0, 0], fov: 42, bokeh: 0.7, duration: 0 });
    ctx.hud.setObjective(`Wzrusz gościa: 0 / ${NEEDED}`);
    ctx.hud.showHint('Lewy kciuk: uszy · prawy kciuk: pochylenie głowy');
    ctx.hud.setCourage(1);
    this.timeLeft = TIME_LIMIT * ctx.assist;
  }

  private makeAnchor(ctx: GameContext): THREE.Object3D {
    const a = new THREE.Object3D();
    a.position.set(0, 3.2, 0);
    ctx.root.add(a);
    return a;
  }

  startGame(): void {
    this.ctx.audio.music('city');
    this.ctx.audio.setMusicIntensity(0.3);
    this.nextWindow();
  }

  private nextWindow(): void {
    const c = this.ctx;
    this.targetEar = 0.15 + c.random() * 0.8;
    this.targetTilt = (c.random() - 0.5) * 1.6;
    this.phase = 'wait';
    this.phaseT = 2.2 + c.random() * 2;
  }

  handleInput(e: InputEvent): void {
    if (e.type === 'pointer-down') {
      const role = e.nx < 0 ? 'ear' : 'tilt';
      for (const r of this.sliders.values()) if (r === role) return;
      this.sliders.set(e.pointerId, role);
      this.apply(role, e.ny);
    } else if (e.type === 'pointer-move') {
      const role = this.sliders.get(e.pointerId);
      if (role) this.apply(role, e.ny);
    } else if (e.type === 'pointer-up') {
      this.sliders.delete(e.pointerId);
    }
  }

  private apply(role: 'ear' | 'tilt', ny: number): void {
    const v = clamp((ny + 0.75) / 1.5, 0, 1);
    if (role === 'ear') this.ear = v;
    else this.tilt = v * 2 - 1;
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    const rig = this.fado.rig;

    this.timeLeft -= dt;
    ctx.hud.setTimer(Math.max(0, this.timeLeft));
    if (this.timeLeft <= 0) {
      this.lose();
      return;
    }

    // poza Fado
    rig.earLiftOverride = this.ear;
    rig.look.roll = damp(rig.look.roll, this.tilt * 0.55, 14, dt);
    rig.look.pitch = 0.2 + this.ear * 0.1;
    rig.motion.expression = this.phase === 'look' && this.match > 0.3 ? 'happy' : this.suspicion > 0.6 ? 'scared' : 'alert';

    // maszyna faz
    this.phaseT -= dt;
    const tolEar = 0.16 * ctx.assist;
    const tolTilt = 0.22 * ctx.assist;
    const matchNow = Math.abs(this.ear - this.targetEar) < tolEar && Math.abs(this.tilt - this.targetTilt) < tolTilt;
    if (this.phase === 'wait') {
      this.guestHead.rotation.x = damp(this.guestHead.rotation.x, 0, 6, dt);
      if (this.phaseT <= 0) {
        // czy kelner idzie? co trzeci cykl
        this.lookCount++;
        if (this.lookCount % 3 === 0) {
          this.phase = 'waiter';
          this.phaseT = 4.2;
          ctx.hud.showHint('Kelner patrzy na stolik! Trzymaj uszy nisko i głowę prosto.');
        } else {
          this.phase = 'look';
          this.phaseT = 2.4 * ctx.assist;
          this.match = 0;
          ctx.hud.showHint('Gość patrzy! Dopasuj uszy i głowę do złotych kółek.');
          ctx.audio.sfx('bell', { gain: 0.5 });
        }
      }
    } else if (this.phase === 'look') {
      this.guestHead.rotation.x = damp(this.guestHead.rotation.x, 0.9, 8, dt);
      this.match = matchNow ? this.match + dt : Math.max(0, this.match - dt * 1.5);
      if (this.match >= 0.75) this.charmed();
      else if (this.phaseT <= 0) {
        this.suspicion = clamp(this.suspicion + 0.08, 0, 1);
        ctx.audio.sfx('whine', { gain: 0.4 });
        ctx.hud.showHint('Za późno — gość się odwrócił.');
        this.nextWindow();
      }
    } else {
      // kelner sprawdza: każda ostentacyjna poza budzi podejrzenia
      this.guestHead.rotation.x = damp(this.guestHead.rotation.x, 0, 6, dt);
      const lowProfile = this.ear < 0.3 && Math.abs(this.tilt) < 0.3;
      this.suspicion = clamp(this.suspicion + (lowProfile ? -0.05 : 0.42 / ctx.assist) * dt, 0, 1);
      if (this.phaseT <= 0) {
        ctx.hud.showHint(null);
        this.nextWindow();
      }
    }
    this.maxSuspicion = Math.max(this.maxSuspicion, this.suspicion);
    if (this.phase !== 'waiter') this.suspicion = Math.max(0, this.suspicion - 0.05 * dt);
    ctx.hud.setCourage(1 - this.suspicion);
    if (this.suspicion >= 1) {
      this.lose();
      return;
    }

    // kelner spaceruje, a w fazie „waiter” zatrzymuje się i patrzy
    const wantX = this.phase === 'waiter' ? 1.5 : this.waiterX;
    if (this.phase === 'waiter') this.waiter.position.x = damp(this.waiter.position.x, wantX, 2.4, dt);
    else {
      this.waiterX += this.waiterDir * 2.2 * dt;
      if (Math.abs(this.waiterX) > 12) this.waiterDir *= -1;
      this.waiter.position.x = damp(this.waiter.position.x, this.waiterX, 3, dt);
    }
    this.waiter.rotation.y = this.phase === 'waiter' ? Math.PI * 0.0 : Math.PI / 2 * -this.waiterDir;
    this.waiter.position.y = Math.abs(Math.sin(t * 6)) * (this.phase === 'waiter' ? 0 : 0.05);

    // wskaźniki
    this.curEar.position.y = this.ear * 3.2;
    this.markEar.position.y = this.targetEar * 3.2;
    this.curTilt.position.y = ((this.tilt + 1) / 2) * 3.2;
    this.markTilt.position.y = ((this.targetTilt + 1) / 2) * 3.2;
    const live = this.phase === 'look' ? 1 : 0.35;
    (this.markEar.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + live * 2;
    (this.markTilt.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + live * 2;
    this.markEar.scale.setScalar(1 + (matchNow && this.phase === 'look' ? 0.3 : 0));
    this.markTilt.scale.copy(this.markEar.scale);
    this.susBar.scale.x = Math.max(0.001, this.suspicion);
    this.susBar.position.x = -1.5 + this.suspicion * 1.5;

    this.sausage.position.y = 2.65 + Math.sin(t * 2) * 0.02;
    rig.update(dt, t);
    this.fx.update(dt, ctx);
  }

  private charmed(): void {
    const ctx = this.ctx;
    this.charm++;
    ctx.hud.setObjective(`Wzrusz gościa: ${this.charm} / ${NEEDED}`);
    ctx.hud.setProgress(this.charm / NEEDED);
    ctx.audio.sfx('sparkle');
    ctx.audio.sfx('perfect', { gain: 0.5 });
    ctx.haptics.impact('medium');
    this.fx.emit(new THREE.Vector3(4.4, 5.8, 1.5), { count: 24, speed: 2.5, life: 1.1, size: 0.18, color: '#ff8fb1', gravity: -1.5 });
    this.fado.rig.blinkNow();
    if (this.charm >= NEEDED) {
      if (this.maxSuspicion < 0.35) this.collectGoldenBone();
      this.sausage.visible = true;
      ctx.audio.sfx('win', { gain: 0.5 });
      this.win({ stars: this.maxSuspicion < 0.35 ? 3 : this.maxSuspicion < 0.7 ? 2 : 1 });
      return;
    }
    this.nextWindow();
  }

  protected onCleanup(): void {
    this.sliders.clear();
    this.fado.rig.dispose();
  }
}
