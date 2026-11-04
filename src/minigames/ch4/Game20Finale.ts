import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, cone, cyl, damp, glow, makeFado, mat, Particles, sphere, type FadoActor } from '../kit';

const BPM = 100;
const BEAT = 60 / BPM;
const APPROACH_BEATS = 3;
const NOTES = 64;
const HILL = { dx: 80, dy: 16 };
const PERFECT = 0.075;
const GOOD = 0.15;

interface Note {
  time: number;
  judged: boolean;
}

/** Poziom 20: bieg pod górę do wiatraka w rytm bicia serca Fado. */
export class Game20Finale extends BaseMinigame {
  readonly id = 20;

  private fado!: FadoActor;
  private fx!: Particles;
  private notes: Note[] = [];
  private hud = new THREE.Group();
  private target!: THREE.Mesh;
  private approach: THREE.Mesh[] = [];
  private judgement!: THREE.Mesh;
  private blades!: THREE.Group;
  private klara!: THREE.Group;
  private poster: THREE.Mesh[] = [];

  private clock = 0;
  private perfect = 0;
  private good = 0;
  private missed = 0;
  private combo = 0;
  private courage = 1;
  private pace = 0;
  private lastBeat = -1;
  private judgeT = 0;
  private lastJudge: 'perfect' | 'good' | 'miss' = 'good';
  private run = 0;
  private forward = new THREE.Vector3();

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('dawn');
    const l = addLighting(ctx, { sky: '#fff0d6', ground: '#8aa65a', sun: '#ffd09a', sunIntensity: 3.2, sunPos: [-20, 12, 20], shadowRange: 40 });
    const slope = Math.atan2(HILL.dy, HILL.dx);
    const ground = box(HILL.dx * 1.6, 1, 40, mat('#7bb04e', { roughness: 1 }), [HILL.dx * 0.5 + 10, HILL.dy * 0.5 - 0.6, 0]);
    ground.rotation.z = slope;
    ctx.root.add(ground);
    ctx.root.add(box(300, 1, 160, mat('#5f9340', { roughness: 1 }), [60, -5, -10]));
    // kwiaty i trawa przy drodze
    const flowerColors = ['#ff6b9d', '#ffd23f', '#ffffff', '#a29bfe'];
    for (let i = 0; i < 90; i++) {
      const u = Math.random();
      const x = u * HILL.dx;
      const z = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 8);
      const f = sphere(0.12, mat(flowerColors[i % 4]), [x, u * HILL.dy + 0.25, z], 6);
      f.castShadow = false;
      ctx.root.add(f);
    }
    // wiatrak na szczycie
    const top = new THREE.Vector3(HILL.dx + 5, HILL.dy + 0.3, 0);
    ctx.root.add(cone(2.4, 8, mat('#d9c7a6'), [top.x, top.y + 4, -2], 12), cyl(2.0, 2.4, 0.4, mat('#8a6a42'), [top.x, top.y + 0.2, -2], 12));
    this.blades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const b = box(0.4, 5.5, 0.1, mat('#f1e6d0'), [0, 2.8, 0]);
      const arm = new THREE.Group();
      arm.add(b);
      arm.rotation.z = (i * Math.PI) / 2;
      this.blades.add(arm);
    }
    this.blades.position.set(top.x, top.y + 7.5, -0.7);
    ctx.root.add(this.blades);
    // Klara (sylwetka) i plakaty
    this.klara = new THREE.Group();
    this.klara.add(cyl(0.3, 0.38, 1.1, mat('#d94a4a'), [0, 0.8, 0], 10), sphere(0.28, mat('#e5b999'), [0, 1.65, 0], 10), sphere(0.31, mat('#4a2f22'), [0, 1.72, -0.04], 10));
    this.klara.add(cyl(0.07, 0.07, 0.9, mat('#e5b999'), [0.45, 1.5, 0], 6));
    this.klara.position.set(top.x - 2.2, top.y, 1.8);
    ctx.root.add(this.klara);
    for (let i = 0; i < 5; i++) {
      const p = box(0.7, 0.9, 0.05, mat('#fffaf0'), [HILL.dx * (0.84 + i * 0.03), HILL.dy * (0.84 + i * 0.03) + 1.4, 3 + (i % 2)]);
      p.rotation.y = -0.3;
      this.poster.push(p);
      ctx.root.add(p);
    }

    this.fado = makeFado(ctx, { scale: 1.0, lightDir: l.dir });
    this.fado.group.rotation.y = Math.PI / 2;
    this.fx = new Particles(260);
    ctx.root.add(this.fx.points);

    // układ nut: stała siatka uderzeń, od 2/3 gry dochodzą ósemki
    for (let i = 0; i < NOTES; i++) {
      this.notes.push({ time: (i + APPROACH_BEATS + 1) * BEAT, judged: false });
      if (i > NOTES * 0.55 && i % 4 === 3 && this.notes.length < NOTES + 12) this.notes.push({ time: (i + APPROACH_BEATS + 1.5) * BEAT, judged: false });
    }

    // nakładka rytmiczna w przestrzeni kamery
    this.target = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 10, 48), glow('#ffffff', 1.6));
    this.hud.add(this.target);
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 10, 48), glow('#ffd23f', 2));
      ring.visible = false;
      this.approach.push(ring);
      this.hud.add(ring);
    }
    this.judgement = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 10, 48), new THREE.MeshBasicMaterial({ color: '#7bff9b', transparent: true, opacity: 0, depthTest: false }));
    this.hud.add(this.judgement);
    this.hud.renderOrder = 999;
    this.hud.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.renderOrder = 999;
        (mesh.material as THREE.Material).depthTest = false;
        mesh.castShadow = false;
      }
    });
    ctx.root.add(this.hud);

    ctx.camera.setTarget(this.fado.group);
    ctx.camera.apply({ offset: [-1.5, 2.2, 12], look: [5, 1.4, 0], fov: 44, bokeh: 1.0, duration: 0 });
    ctx.hud.setObjective('Biegnij do Klary!');
    ctx.hud.showHint('Stuknij, gdy złoty pierścień nałoży się na biały');
    ctx.hud.setCourage(1);
    this.placeFado(0);
  }

  startGame(): void {
    this.ctx.audio.music('finale');
    this.ctx.audio.setMusicIntensity(0.5);
    this.clock = 0;
    this.ctx.haptics.setHeartbeat(BPM, 0.5);
  }

  private placeFado(p: number): void {
    const x = p * HILL.dx;
    const y = p * HILL.dy;
    this.fado.group.position.set(x, y, 0);
    this.fado.group.rotation.z = Math.atan2(HILL.dy, HILL.dx) * 0.8;
  }

  handleInput(e: InputEvent): void {
    if (e.type !== 'pointer-down') return;
    const ctx = this.ctx;
    const widen = ctx.assist;
    let best: Note | null = null;
    let bestD = Infinity;
    for (const n of this.notes) {
      if (n.judged) continue;
      const d = Math.abs(n.time - this.clock);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (!best || bestD > GOOD * 1.6 * widen) {
      // pusty stuk — drobna kara za spam
      this.courage = clamp(this.courage - 0.02, 0, 1);
      return;
    }
    best.judged = true;
    if (bestD <= PERFECT * widen) this.judge('perfect');
    else if (bestD <= GOOD * widen) this.judge('good');
    else this.judge('miss');
  }

  private judge(kind: 'perfect' | 'good' | 'miss'): void {
    const ctx = this.ctx;
    this.lastJudge = kind;
    this.judgeT = 0.4;
    const mat3 = this.judgement.material as THREE.MeshBasicMaterial;
    if (kind === 'perfect') {
      this.perfect++;
      this.combo++;
      this.courage = clamp(this.courage + 0.05, 0, 1);
      this.pace = Math.min(1, this.pace + 0.14);
      mat3.color.set('#7bff9b');
      ctx.audio.sfx('timpani', { gain: 0.9 });
      ctx.audio.sfx('perfect', { gain: 0.35 });
      ctx.haptics.impact('heavy');
      ctx.camera.punchFov(2.5, 0.25);
      this.fx.emit(this.fado.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), { count: 8, speed: 2.5, life: 0.6, size: 0.14, color: '#ffd23f', gravity: 3 });
    } else if (kind === 'good') {
      this.good++;
      this.combo++;
      this.courage = clamp(this.courage + 0.02, 0, 1);
      this.pace = Math.min(1, this.pace + 0.08);
      mat3.color.set('#ffd23f');
      ctx.audio.sfx('timpani', { gain: 0.5 });
      ctx.haptics.impact('medium');
    } else {
      this.missed++;
      this.combo = 0;
      this.courage = clamp(this.courage - 0.1 / ctx.assist, 0, 1);
      this.pace = Math.max(0, this.pace - 0.2);
      mat3.color.set('#ff4a4a');
      ctx.audio.sfx('thud', { gain: 0.5 });
      ctx.haptics.pattern([60]);
      ctx.camera.shake(0.3, 0.25);
    }
    ctx.audio.setMusicIntensity(clamp(0.4 + this.combo * 0.03 + this.pace * 0.3, 0.3, 1));
    if (this.courage <= 0.001) this.lose();
  }

  /** Dokładność: perfect = 1, good = 0.6, pudło = 0. */
  private accuracy(): number {
    const judged = this.perfect + this.good + this.missed;
    return judged === 0 ? 1 : (this.perfect + this.good * 0.6) / judged;
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    this.clock += dt;
    const m = this.fado.rig.motion;

    // metronom serca
    const beat = Math.floor(this.clock / BEAT);
    if (beat !== this.lastBeat && this.clock >= 0) {
      this.lastBeat = beat;
      if (beat >= 0) ctx.audio.sfx('beat', { gain: 0.45 });
      this.fado.rig.blinkNow();
    }

    // nuty: pierścień zbliżający się do celu, auto-pudło po przekroczeniu okna
    const window = GOOD * ctx.assist;
    let used = 0;
    for (const n of this.notes) {
      if (n.judged) continue;
      const until = n.time - this.clock;
      if (until < -window) {
        n.judged = true;
        this.judge('miss');
        continue;
      }
      if (until <= APPROACH_BEATS * BEAT && used < this.approach.length) {
        const ring = this.approach[used++];
        ring.visible = true;
        const k = clamp(until / (APPROACH_BEATS * BEAT), 0, 1);
        ring.scale.setScalar(1 + k * 3.2);
        (ring.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + (1 - k) * 2;
      }
    }
    for (let i = used; i < this.approach.length; i++) this.approach[i].visible = false;

    // sylwetka rytmu przyklejona do kamery
    this.placeHud();
    this.judgeT = Math.max(0, this.judgeT - dt);
    const jm = this.judgement.material as THREE.MeshBasicMaterial;
    jm.opacity = this.judgeT > 0 ? this.judgeT / 0.4 : 0;
    this.judgement.scale.setScalar(1 + (1 - this.judgeT / 0.4) * (this.lastJudge === 'perfect' ? 0.8 : 0.4));
    const flash = this.judgeT > 0 && this.lastJudge !== 'miss' ? 1.4 : 1;
    this.target.scale.setScalar(damp(this.target.scale.x, flash, 20, dt));

    // bieg: tempo zależne od trafień
    this.pace = Math.max(0, this.pace - 0.03 * dt);
    const speed = 0.35 + this.pace * 0.65;
    const total = NOTES * BEAT + (APPROACH_BEATS + 2) * BEAT;
    this.run = clamp(this.clock / total, 0, 1);
    // sama pozycja zależy od zegara (nuty stałe), a tempo pokazują animacja i drobne wyprzedzenie
    const shown = clamp(this.run + (this.pace - 0.5) * 0.015, 0, 1);
    this.placeFado(shown);
    m.speed = speed;
    m.expression = this.courage < 0.3 ? 'scared' : this.combo > 4 ? 'happy' : 'run';
    this.fado.rig.update(dt, t);

    // otoczenie
    this.blades.rotation.z -= dt * (0.6 + this.run * 1.8);
    this.klara.rotation.z = Math.sin(t * 5) * 0.03;
    this.klara.children[this.klara.children.length - 1].rotation.z = Math.sin(t * 6) * 0.5 + 0.4;
    this.poster.forEach((p, i) => (p.rotation.z = Math.sin(t * 2 + i) * 0.1));
    if (Math.random() < dt * 30) this.fx.emit(new THREE.Vector3(this.fado.group.position.x + (Math.random() - 0.5) * 12, this.fado.group.position.y + 4 + Math.random() * 3, (Math.random() - 0.5) * 12), { count: 1, speed: 0.4, life: 2, size: 0.1, color: '#ffe8b8', gravity: -0.2 });

    ctx.hud.setProgress(this.run);
    ctx.hud.setCourage(this.courage);
    ctx.hud.setObjective(this.combo > 3 ? `Seria: ${this.combo}  ·  trafność ${(this.accuracy() * 100).toFixed(0)}%` : `Trafność ${(this.accuracy() * 100).toFixed(0)}%`);
    this.fx.update(dt, ctx);

    const allJudged = this.notes.every((n) => n.judged);
    if (allJudged && this.clock > total - BEAT) {
      const acc = this.accuracy();
      if (acc >= 0.85) this.collectGoldenBone();
      ctx.haptics.setHeartbeat(0);
      ctx.audio.sfx('win');
      this.win({ stars: acc >= 0.85 ? 3 : acc >= 0.65 ? 2 : 1 });
    }
  }

  private placeHud(): void {
    const cam = this.ctx.view.camera;
    if (!cam) return;
    cam.getWorldDirection(this.forward);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    this.hud.position.copy(cam.position).addScaledVector(this.forward, 6).addScaledVector(up, -1.6);
    this.hud.quaternion.copy(cam.quaternion);
    this.hud.scale.setScalar(1.15);
  }

  protected onCleanup(): void {
    this.ctx.haptics.setHeartbeat(0);
    this.fado.rig.dispose();
  }
}
