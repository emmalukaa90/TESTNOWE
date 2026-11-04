import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, cyl, damp, glow, goldenBone, makeFado, mat, Particles, plane, sphere, spinBob, type FadoActor } from '../kit';
import type { EngineHandle } from '../../systems/AudioManager';

const ROW = 2.4;
const ROWS = 7; // 0 = start, 1..2 jezdnia, 3 = wysepka, 4..5 jezdnia, 6 = meta
const MEDIAN = 3;
const WRAP = 34;

interface Vehicle {
  group: THREE.Group;
  row: number;
  x: number;
  speed: number;
  half: number;
  truck: boolean;
  engine: EngineHandle | null;
}

/** Poziom 11: przejdź ulicę, słuchając i obserwując nadjeżdżające pojazdy. */
export class Game11RushHour extends BaseMinigame {
  readonly id = 11;

  private fado!: FadoActor;
  private fx!: Particles;
  private vehicles: Vehicle[] = [];
  private bone!: THREE.Group;
  private boneTaken = false;
  private row = 0;
  private x = 0;
  private hop = 0;
  private hopFrom = new THREE.Vector3();
  private hopTo = new THREE.Vector3();
  private courage = 1;
  private hits = 0;
  private safeRow = 0;
  private knock = 0;
  private lastHorn = 0;

  private rowZ(r: number): number {
    return -r * ROW;
  }

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('city');
    const { dir } = addLighting(ctx, { sky: '#ffd9b8', ground: '#4a4a52', sun: '#ffc48a', sunIntensity: 3, sunPos: [-10, 12, 8], shadowRange: 24 });
    // jezdnie i chodniki
    for (let r = 0; r < ROWS; r++) {
      const sidewalk = r === 0 || r === ROWS - 1 || r === MEDIAN;
      ctx.root.add(plane(WRAP * 2, ROW, mat(sidewalk ? '#b8b2a6' : '#3d3d44', { roughness: 1 }), [0, 0.01, this.rowZ(r)]));
      if (!sidewalk) {
        for (let i = -WRAP; i < WRAP; i += 3) ctx.root.add(box(1.4, 0.02, 0.12, mat('#f1e9c8'), [i, 0.03, this.rowZ(r) + ROW / 2]));
      }
    }
    // budynki w tle
    for (let i = 0; i < 14; i++) {
      const h = 6 + ctx.random() * 10;
      const b = box(4 + ctx.random() * 2, h, 4, mat(['#c9826b', '#8d9db6', '#d9b38c', '#9aa78a'][i % 4]), [-30 + i * 4.6, h / 2, this.rowZ(ROWS) - 4]);
      ctx.root.add(b);
      for (let w = 0; w < 6; w++) ctx.root.add(box(0.5, 0.7, 0.05, glow('#ffe7a8', 0.7), [b.position.x + (w % 3 - 1) * 1.1, 2 + Math.floor(w / 3) * 2.4 + ctx.random() * 3, this.rowZ(ROWS) - 1.95]));
    }
    // latarnie
    for (let i = -3; i <= 3; i++) ctx.root.add(cyl(0.08, 0.1, 4, mat('#333'), [i * 8, 2, 1.8], 6), sphere(0.25, glow('#fff1c0', 1.4), [i * 8, 4.1, 1.8], 8));

    // pojazdy: pasy 1,2,4,5, naprzemienne kierunki, losowe odstępy
    const rowsDef = [1, 2, 4, 5];
    rowsDef.forEach((r, ri) => {
      const dirSign = ri % 2 === 0 ? 1 : -1;
      let x = -WRAP + ctx.random() * 8;
      while (x < WRAP - 6) {
        const truck = ctx.random() < 0.45;
        this.spawnVehicle(ctx, r, x, dirSign * (truck ? 5 + ri : 7.5 + ri * 0.6), truck);
        x += (truck ? 11 : 8) + 8 + ctx.random() * 9;
      }
    });

    this.bone = goldenBone(1.5);
    this.bone.position.set(1.5, 0.9, this.rowZ(MEDIAN));
    ctx.root.add(this.bone);

    this.fado = makeFado(ctx, { scale: 0.85, lightDir: dir });
    this.fado.group.position.set(0, 0, this.rowZ(0));
    this.fado.group.rotation.y = Math.PI;
    this.fx = new Particles(100);
    ctx.root.add(this.fx.points);
    ctx.camera.setTarget(this.fado.group);
    ctx.camera.apply({ offset: [0, 6.5, 8.5], look: [0, 0.5, -3.5], fov: 48, bokeh: 0.9, duration: 0 });
    ctx.hud.setObjective('Przejdź na drugą stronę ulicy');
    ctx.hud.showHint('Przesuń w górę: krok · w bok: unik · słuchaj silników!');
    ctx.hud.setCourage(1);
  }

  private spawnVehicle(ctx: GameContext, row: number, x: number, speed: number, truck: boolean): void {
    const g = new THREE.Group();
    const color = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#8338ec'][Math.floor(ctx.random() * 5)];
    const half = truck ? 3.6 : 2.0;
    if (truck) {
      g.add(box(5.6, 2.3, 2.1, mat('#d9d9d9'), [-0.7, 1.45, 0]), box(1.8, 1.7, 2.0, mat(color), [3.0, 1.1, 0]), box(0.1, 0.8, 1.7, glow('#bfe8ff', 0.4), [3.95, 1.5, 0]));
    } else {
      g.add(box(3.8, 0.9, 1.8, mat(color), [0, 0.7, 0]), box(2.0, 0.8, 1.6, mat(color), [-0.2, 1.45, 0]), box(0.1, 0.5, 1.4, glow('#bfe8ff', 0.4), [0.82, 1.45, 0]));
    }
    const lampMat = glow('#fff2b0', 1.6);
    g.add(box(0.1, 0.25, 0.4, lampMat, [truck ? 4.0 : 1.9, 0.7, 0.6]), box(0.1, 0.25, 0.4, lampMat, [truck ? 4.0 : 1.9, 0.7, -0.6]));
    for (const wx of truck ? [-2.6, -0.6, 3] : [-1.2, 1.2]) for (const z of [-1, 1]) {
      const w = cyl(0.45, 0.45, 0.3, mat('#222'), [wx, 0.45, z * 0.9], 12);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
    g.position.set(x, 0, this.rowZ(row));
    g.rotation.y = speed > 0 ? 0 : Math.PI;
    ctx.root.add(g);
    this.vehicles.push({ group: g, row, x, speed, half, truck, engine: truck ? ctx.audio.createEngine() : null });
  }

  startGame(): void {
    this.ctx.audio.music('city');
    this.ctx.audio.setMusicIntensity(0.45);
  }

  handleInput(e: InputEvent): void {
    if (e.type !== 'swipe' || this.hop > 0 || this.knock > 0) return;
    const ctx = this.ctx;
    if (e.direction === 'up' && this.row < ROWS - 1) this.startHop(this.x, this.row + 1);
    else if (e.direction === 'down' && this.row > 0 && this.row === this.safeRow + 0) this.startHop(this.x, this.row - 1);
    else if (e.direction === 'left') this.startHop(this.x - 2.2, this.row);
    else if (e.direction === 'right') this.startHop(this.x + 2.2, this.row);
    else return;
    ctx.audio.sfx('jump', { gain: 0.45 });
  }

  private startHop(x: number, row: number): void {
    this.hopFrom.set(this.x, 0, this.rowZ(this.row));
    this.hopTo.set(clamp(x, -9, 9), 0, this.rowZ(row));
    this.hop = 0.0001;
    this.row = row;
    this.x = this.hopTo.x;
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    const g = this.fado.group;
    const m = this.fado.rig.motion;

    // pojazdy
    for (const v of this.vehicles) {
      v.x += v.speed * dt;
      if (v.x > WRAP) v.x -= WRAP * 2;
      if (v.x < -WRAP) v.x += WRAP * 2;
      v.group.position.x = v.x;
      if (v.engine) {
        const dx = v.x - g.position.x;
        const dz = Math.abs(this.rowZ(v.row) - g.position.z);
        const near = clamp(1 - Math.abs(dx) / 30, 0, 1) * clamp(1 - dz / 12, 0.2, 1);
        v.engine.setPan(clamp(dx / 16, -1, 1));
        v.engine.setGain(0.14 * near * near);
        v.engine.setPitch(70 + Math.abs(v.speed) * 6 + (v.speed > 0 ? (dx < 0 ? 10 : -10) : dx > 0 ? 10 : -10));
      }
    }

    // skok / odrzut
    if (this.knock > 0) {
      this.knock -= dt;
      if (this.knock <= 0) m.expression = 'idle';
    } else if (this.hop > 0) {
      this.hop += dt / 0.28;
      const k = clamp(this.hop, 0, 1);
      g.position.lerpVectors(this.hopFrom, this.hopTo, k);
      g.position.y = Math.sin(k * Math.PI) * 0.7;
      m.speed = 1;
      m.expression = 'run';
      if (k >= 1) {
        this.hop = 0;
        ctx.audio.sfx('step', { gain: 0.5 });
        const sidewalk = this.row === 0 || this.row === MEDIAN || this.row === ROWS - 1;
        if (sidewalk) this.safeRow = this.row;
        ctx.hud.setProgress(this.row / (ROWS - 1));
        if (this.row === ROWS - 1) {
          const bone = this.boneTaken && this.hits === 0;
          if (bone) this.collectGoldenBone();
          this.win({ stars: this.hits === 0 ? 3 : this.hits === 1 ? 2 : 1 });
        }
      }
    } else {
      m.speed = 0;
      m.expression = 'alert';
      g.position.x = damp(g.position.x, this.x, 14, dt);
    }
    if (g.position.x !== this.x && this.hop === 0 && this.knock <= 0) g.position.x = this.x;

    // kolizje (tylko gdy Fado jest na jezdni)
    const onRoad = this.row !== 0 && this.row !== MEDIAN && this.row !== ROWS - 1;
    if (onRoad && this.knock <= 0 && g.position.y < 0.5) {
      for (const v of this.vehicles) {
        if (v.row !== this.row) continue;
        if (Math.abs(v.x - g.position.x) < v.half + 0.35) {
          this.hit(v);
          break;
        }
      }
    }
    // klakson, gdy pojazd jest bardzo blisko
    this.lastHorn -= dt;
    if (onRoad && this.lastHorn <= 0) {
      for (const v of this.vehicles) {
        if (v.row === this.row && v.truck && Math.abs(v.x + Math.sign(v.speed) * 6 - g.position.x) < 4 && Math.sign(g.position.x - v.x) === Math.sign(v.speed)) {
          ctx.audio.sfx('honk', { pan: clamp((v.x - g.position.x) / 16, -1, 1), gain: 0.6 });
          this.lastHorn = 2.4;
          break;
        }
      }
    }

    if (!this.boneTaken) {
      spinBob(this.bone, t, 0.9);
      if (g.position.distanceTo(this.bone.position) < 1.1 && this.row === MEDIAN) {
        this.boneTaken = true;
        this.bone.visible = false;
        ctx.audio.sfx('bone');
        ctx.haptics.impact('medium');
        this.fx.emit(this.bone.position, { count: 26, speed: 3, life: 0.9, size: 0.15, color: '#ffd23f' });
      }
    }
    this.fado.rig.update(dt, t);
    this.fx.update(dt, ctx);
  }

  private hit(v: Vehicle): void {
    const ctx = this.ctx;
    this.hits++;
    this.courage = clamp(this.courage - 0.34 / ctx.assist, 0, 1);
    ctx.hud.setCourage(this.courage);
    ctx.audio.sfx('honk', { gain: 0.9 });
    ctx.audio.sfx('hit');
    ctx.haptics.pattern([80, 40, 100]);
    ctx.camera.shake(0.8, 0.5);
    this.fx.emit(this.fado.group.position.clone().setY(0.7), { count: 22, speed: 4, life: 0.7, size: 0.15, color: '#ffe08a', gravity: 6 });
    // odrzut na ostatni bezpieczny chodnik
    this.row = this.safeRow;
    this.x = clamp(v.x < this.fado.group.position.x ? this.fado.group.position.x : this.fado.group.position.x, -9, 9);
    this.fado.group.position.set(this.x, 0, this.rowZ(this.row));
    this.knock = 0.8;
    this.fado.rig.motion.expression = 'scared';
    ctx.hud.setProgress(this.row / (ROWS - 1));
    if (this.courage <= 0.001) this.lose();
  }

  protected onCleanup(): void {
    for (const v of this.vehicles) v.engine?.stop();
    this.fado.rig.dispose();
  }
}
