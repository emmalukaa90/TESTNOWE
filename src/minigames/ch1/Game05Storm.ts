import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, cyl, damp, goldenBone, makeFado, mat, Particles, plane, sphere, spinBob, type FadoActor } from '../kit';

type ObstacleKind = 'log' | 'branch' | 'rock';
interface Obstacle {
  kind: ObstacleKind;
  z: number;
  lane: number;
  mesh: THREE.Object3D;
  hit: boolean;
}

const LANES = [-2.2, 0, 2.2];
const TOTAL = 420;
const GRAVITY = 30;
const JUMP_V = 10.5;
const SLIDE_TIME = 0.65;

/** Poziom 5: bieg przed burzą — trzy pasy, skoki, ślizgi, błyskawice. */
export class Game05Storm extends BaseMinigame {
  readonly id = 5;

  private fado!: FadoActor;
  private fx!: Particles;
  private rain!: Particles;
  private obstacles: Obstacle[] = [];
  private cloud = new THREE.Group();
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private bone!: THREE.Group;
  private boneZ = -TOTAL * 0.62;
  private boneTaken = false;

  private lane = 1;
  private x = 0;
  private y = 0;
  private vy = 0;
  private dist = 0;
  private speed = 11;
  private slide = 0;
  private stumble = 0;
  private gap = 28;
  private hits = 0;
  private flashT = 0;
  private nextLightning = 4;
  private startedRun = false;

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('storm');
    const l = addLighting(ctx, { sky: '#8b99b5', ground: '#2c3a30', hemi: 0.8, sun: '#c8d4ff', sunIntensity: 1.6, sunPos: [-6, 14, 8], shadowRange: 22 });
    this.sun = l.sun;
    this.hemi = l.hemi;
    ctx.root.add(plane(14, TOTAL + 120, mat('#5a4a36', { roughness: 1 }), [0, 0, -TOTAL / 2 + 20]));
    ctx.root.add(plane(160, TOTAL + 160, mat('#2f4a30', { roughness: 1 }), [0, -0.03, -TOTAL / 2 + 20]));

    // drzewa po bokach (instancing)
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2, 6);
    const crownGeo = new THREE.ConeGeometry(1.5, 4.2, 7);
    const count = 90;
    const trunks = new THREE.InstancedMesh(trunkGeo, mat('#3a2a20'), count);
    const crowns = new THREE.InstancedMesh(crownGeo, mat('#254a35'), count);
    const d = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (6 + ctx.random() * 14);
      const z = 15 - (i / count) * (TOTAL + 60);
      const s = 0.8 + ctx.random() * 0.8;
      d.position.set(x, 1 * s, z);
      d.scale.setScalar(s);
      d.updateMatrix();
      trunks.setMatrixAt(i, d.matrix);
      d.position.set(x, 3.6 * s, z);
      d.updateMatrix();
      crowns.setMatrixAt(i, d.matrix);
    }
    trunks.castShadow = crowns.castShadow = true;
    ctx.root.add(trunks, crowns);

    this.buildObstacles(ctx);
    this.buildCloud();
    ctx.root.add(this.cloud);

    // meta: łuk z żółtym szalikiem
    const finish = new THREE.Group();
    finish.add(box(0.4, 4, 0.4, mat('#6b4a2c'), [-3.4, 2, 0]), box(0.4, 4, 0.4, mat('#6b4a2c'), [3.4, 2, 0]), box(7.2, 0.4, 0.4, mat('#ffd23f'), [0, 4, 0]));
    finish.position.z = -TOTAL;
    ctx.root.add(finish);

    this.bone = goldenBone(1.5);
    this.bone.position.set(LANES[1], 1.1, this.boneZ);
    ctx.root.add(this.bone);

    this.fado = makeFado(ctx, { scale: 1.0, lightDir: l.dir });
    this.fado.group.rotation.y = Math.PI;
    this.fx = new Particles(200);
    this.rain = new Particles(420, { opacity: 0.55 });
    ctx.root.add(this.fx.points, this.rain.points);

    ctx.camera.setTarget(this.fado.group);
    ctx.camera.apply({ offset: [0, 3.0, 6.2], look: [0, 1.2, -8], fov: 62, bokeh: 0.7, duration: 0 });
    ctx.hud.setObjective('Uciekaj przed burzą!');
    ctx.hud.showHint('W górę: skok · w dół: ślizg · w bok: zmiana pasa');
    ctx.hud.setCourage(1);
    this.gap = 28 * ctx.assist;
  }

  private buildObstacles(ctx: GameContext): void {
    let z = -34;
    const wood = mat('#7a5230');
    const bark = mat('#4a3322');
    const stone = mat('#7d8288');
    while (z > -TOTAL + 12) {
      const roll = ctx.random();
      const kind: ObstacleKind = roll < 0.34 ? 'log' : roll < 0.62 ? 'branch' : 'rock';
      const lane = Math.floor(ctx.random() * 3);
      const g = new THREE.Group();
      if (kind === 'log') {
        const logMesh = cyl(0.45, 0.45, 7.6, wood, [0, 0.45, 0], 12);
        logMesh.rotation.z = Math.PI / 2;
        g.add(logMesh);
      } else if (kind === 'branch') {
        g.add(box(0.3, 4, 0.3, bark, [-3.6, 2, 0]), box(0.3, 4, 0.3, bark, [3.6, 2, 0]), box(7.6, 0.45, 0.45, bark, [0, 1.75, 0]));
        for (let i = 0; i < 6; i++) g.add(sphere(0.45, mat('#2a5a35'), [-3 + i * 1.2, 1.55, 0]));
      } else {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 0), stone);
        r.scale.set(1.1, 0.9, 1);
        r.position.y = 0.7;
        r.castShadow = true;
        g.add(r);
      }
      g.position.set(kind === 'rock' ? LANES[lane] : 0, 0, z);
      ctx.root.add(g);
      this.obstacles.push({ kind, z, lane, mesh: g, hit: false });
      z -= 15 + ctx.random() * 9;
    }
  }

  private buildCloud(): void {
    const dark = mat('#1d2230', { roughness: 1 });
    for (let i = 0; i < 16; i++) {
      const s = sphere(3 + Math.random() * 3, dark, [(i - 8) * 3.2, 4 + Math.random() * 6, Math.random() * 6], 12);
      s.castShadow = false;
      this.cloud.add(s);
    }
  }

  startGame(): void {
    this.ctx.audio.music('tension');
    this.ctx.audio.setMusicIntensity(0.7);
    this.startedRun = true;
  }

  handleInput(e: InputEvent): void {
    if (e.type !== 'swipe') return;
    const ctx = this.ctx;
    if (e.direction === 'left' && this.lane > 0) {
      this.lane--;
      ctx.audio.sfx('whoosh', { pan: -0.4, gain: 0.5 });
      ctx.camera.tilt(0.06, 0.15);
      window.setTimeout(() => ctx.camera.tilt(0, 0.35), 160);
    } else if (e.direction === 'right' && this.lane < 2) {
      this.lane++;
      ctx.audio.sfx('whoosh', { pan: 0.4, gain: 0.5 });
      ctx.camera.tilt(-0.06, 0.15);
      window.setTimeout(() => ctx.camera.tilt(0, 0.35), 160);
    } else if (e.direction === 'up' && this.y <= 0.01) {
      this.vy = JUMP_V;
      this.slide = 0;
      ctx.audio.sfx('jump');
    } else if (e.direction === 'down') {
      this.slide = SLIDE_TIME;
      if (this.y > 0.01) this.vy = -16;
      ctx.audio.sfx('scratch', { gain: 0.5 });
    }
  }

  protected onUpdate(dt: number): void {
    if (!this.startedRun) return;
    const ctx = this.ctx;
    const t = this.elapsed;

    this.stumble = Math.max(0, this.stumble - dt);
    const target = this.stumble > 0 ? 5.5 : 11 + (this.dist / TOTAL) * 5.5;
    this.speed = damp(this.speed, target, 4, dt);
    this.dist += this.speed * dt;
    this.slide = Math.max(0, this.slide - dt);
    this.x = damp(this.x, LANES[this.lane], 14, dt);
    this.vy -= GRAVITY * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0 && this.vy < 0) this.vy = 0;

    // burza dogania: stałe tempo + kary; trzymanie się z przodu ją odsuwa
    this.gap -= (0.38 - (this.speed - 11) * 0.015) * dt / ctx.assist;
    const z = -this.dist;
    const g = this.fado.group;
    g.position.set(this.x, this.y, z);
    g.scale.y = this.slide > 0 ? 0.6 : 1;
    const m = this.fado.rig.motion;
    m.speed = clamp(this.speed / 14, 0, 1);
    m.expression = this.stumble > 0 ? 'scared' : 'run';
    this.fado.rig.update(dt, t);

    // kolizje
    for (const o of this.obstacles) {
      if (o.hit || Math.abs(o.z - z) > 0.7) continue;
      let blocked = false;
      if (o.kind === 'log') blocked = this.y < 0.75;
      else if (o.kind === 'branch') blocked = this.slide <= 0;
      else blocked = Math.abs(LANES[o.lane] - this.x) < 1.15 && this.y < 1.0;
      if (blocked) this.collide(o);
    }

    // kość na środkowym pasie
    if (!this.boneTaken) {
      spinBob(this.bone, t, 1.1 + 0.0);
      if (Math.abs(this.boneZ - z) < 1.1 && Math.abs(this.x - LANES[1]) < 1.2 && this.y < 2.2) {
        this.boneTaken = true;
        this.collectGoldenBone();
        this.bone.visible = false;
        ctx.audio.sfx('bone');
        ctx.haptics.impact('heavy');
        this.fx.emit(new THREE.Vector3(this.x, 1.2, z), { count: 40, speed: 5, life: 1, size: 0.18, color: '#ffd23f' });
      }
    }

    // pył spod łap
    if (this.y === 0 && Math.random() < dt * 22) {
      this.fx.emit(new THREE.Vector3(this.x, 0.1, z + 0.5), { count: 1, speed: 0.8, life: 0.5, size: 0.14, color: '#8b7b64', gravity: 1, dir: new THREE.Vector3(0, 1, 0.6) });
    }

    // chmura i deszcz podążają za Fado
    this.cloud.position.set(0, 2, z + this.gap + 8);
    for (let i = 0; i < 6; i++) {
      this.rain.emit(new THREE.Vector3(this.x + (Math.random() - 0.5) * 22, 12 + Math.random() * 3, z + (Math.random() - 0.5) * 30), {
        count: 1, speed: 20, life: 0.8, size: 0.05, color: '#cfe0ff', dir: new THREE.Vector3(0, -2, 0.3), spread: 0.1,
      });
    }

    // błyskawice
    this.nextLightning -= dt;
    if (this.nextLightning <= 0) {
      this.nextLightning = 3 + Math.random() * 4;
      this.flashT = 0.35;
      ctx.audio.sfx('thunder');
      ctx.camera.shake(0.25, 0.4);
      ctx.haptics.impact('heavy');
    }
    this.flashT = Math.max(0, this.flashT - dt);
    const flash = this.flashT > 0 ? (Math.sin(this.flashT * 60) > 0 ? 1 : 0.3) * (this.flashT / 0.35) : 0;
    this.sun.intensity = 1.6 + flash * 6;
    this.hemi.intensity = 0.8 + flash * 1.4;

    // HUD
    ctx.hud.setProgress(this.dist / TOTAL);
    ctx.hud.setCourage(clamp(this.gap / (28 * ctx.assist), 0, 1));
    ctx.haptics.setHeartbeat(this.gap < 10 ? 150 : 0, 0.8);
    ctx.audio.setMusicIntensity(clamp(1 - this.gap / 28, 0.3, 1));
    this.fx.update(dt, ctx);
    this.rain.update(dt, ctx);

    if (this.gap <= 0) {
      this.lose();
    } else if (this.dist >= TOTAL) {
      this.win({ stars: this.hits === 0 ? 3 : this.hits <= 2 ? 2 : 1 });
    }
  }

  private collide(o: Obstacle): void {
    const ctx = this.ctx;
    o.hit = true;
    this.hits++;
    this.stumble = 0.9;
    this.gap -= 7 / ctx.assist;
    this.y = 0;
    this.vy = 0;
    ctx.audio.sfx('thud');
    ctx.haptics.pattern([70, 30, 90]);
    ctx.camera.shake(0.7, 0.5);
    this.fx.emit(this.fado.group.position.clone().setY(0.8), { count: 24, speed: 4, life: 0.7, size: 0.16, color: '#c9a77a', gravity: 8 });
  }

  protected onCleanup(): void {
    this.ctx.camera.tilt(0, 0);
    this.fado.rig.dispose();
  }
}
