import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, cyl, damp, floor, goldenBone, makeFado, mat, Particles, pineTree, scatter, smoothstep, spinBob, TiltSource, type FadoActor } from '../kit';

interface Platform {
  mesh: THREE.Object3D;
  baseX: number;
  x: number;
  y: number;
  top: number;
  drift: number;
  phase: number;
  slippery: boolean;
  bank: boolean;
}

type Mode = 'standing' | 'jumping' | 'falling';

const JUMP_TIME = 0.62;
const MAX_LIVES = 3;

/** Poziom 2: równowaga na dryfujących kłodach i skoki po kamieniach. */
export class Game02Rapids extends BaseMinigame {
  readonly id = 2;

  private fado!: FadoActor;
  private tilt!: TiltSource;
  private platforms: Platform[] = [];
  private fx!: Particles;
  private water!: THREE.Mesh;
  private bone!: THREE.Group;
  private boneTaken = false;

  private mode: Mode = 'standing';
  private current = 0;
  private landing = 0;
  private jumpT = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private theta = 0;
  private omega = 0;
  private lives = MAX_LIVES;
  private falls = 0;
  private respawn = 0;
  private pos = new THREE.Vector3();
  private wobbleSeed = 0;

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set({ background: '#bfe0d0', fogColor: '#bfe0d0', fogNear: 28, fogFar: 90 });
    const { dir } = addLighting(ctx, { sky: '#e6f4ff', ground: '#5d6f4a', sunIntensity: 3.2 });
    floor(ctx, '#4f7a46', 90, 30, -1.2, 0, -22);
    floor(ctx, '#4f7a46', 90, 20, -1.2, 0, 16);
    scatter(ctx, () => pineTree(4 + ctx.random() * 3, '#5a3d28', '#2b5d3a'), 36, { x: [-24, 40], z: [-30, -8] });

    const water = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uTime;
        void main(){
          float f = sin(vUv.x*90.0 - uTime*3.0 + sin(vUv.y*30.0)*2.0)*0.5+0.5;
          float g = sin(vUv.x*47.0 - uTime*2.0 + vUv.y*18.0)*0.5+0.5;
          vec3 c = mix(vec3(0.10,0.43,0.55), vec3(0.45,0.82,0.9), pow(f*g, 3.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(70, 10), water);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(14, -0.5, 0);
    ctx.root.add(this.water);

    // brzegi + kłody/kamienie
    const bankMat = mat('#6b8f4d');
    const logMat = mat('#8a5a34');
    const stoneMat = mat('#8b8f93');
    const defs: Array<{ x: number; kind: 'bank' | 'log' | 'stone' }> = [
      { x: -3, kind: 'bank' }, { x: 3.2, kind: 'log' }, { x: 6.6, kind: 'stone' }, { x: 10.4, kind: 'log' },
      { x: 14.2, kind: 'log' }, { x: 18, kind: 'stone' }, { x: 21.8, kind: 'log' }, { x: 26.2, kind: 'bank' },
    ];
    defs.forEach((d, i) => {
      const g = new THREE.Group();
      if (d.kind === 'bank') g.add(box(5, 1.2, 8, bankMat, [0, -0.6, 0]));
      else if (d.kind === 'log') {
        const l = cyl(0.55, 0.55, 5.4, logMat, [0, -0.1, 0], 14);
        l.rotation.x = Math.PI / 2;
        g.add(l);
        g.add(cyl(0.12, 0.12, 0.2, mat('#d7b88a'), [0, 0.45, 0], 8));
      } else {
        const s = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 0), stoneMat);
        s.scale.set(1.3, 0.55, 1.1);
        s.castShadow = true;
        s.position.y = -0.05;
        g.add(s);
      }
      ctx.root.add(g);
      this.platforms.push({
        mesh: g, baseX: d.x, x: d.x, y: 0, top: d.kind === 'bank' ? 0 : d.kind === 'log' ? 0.45 : 0.22,
        drift: d.kind === 'bank' ? 0 : 0.6 + ctx.random() * 0.8, phase: i * 1.7, slippery: d.kind === 'stone', bank: d.kind === 'bank',
      });
    });

    // Złota Kość czeka na kamieniu pomijanym przy zwykłych skokach
    this.bone = goldenBone(1.4);
    ctx.root.add(this.bone);

    this.fado = makeFado(ctx, { scale: 0.95, lightDir: dir });
    this.fx = new Particles(200);
    ctx.root.add(this.fx.points);
    this.tilt = new TiltSource(ctx);
    this.pos.set(-3, 0, 0);
    this.fado.group.rotation.y = Math.PI / 2;
    ctx.camera.setTarget(this.fado.group);
    ctx.camera.apply({ offset: [2.5, 3.2, 9.5], look: [2.5, 0.6, 0], fov: 40, bokeh: 1.4, duration: 0 });
    ctx.hud.setObjective('Przejdź na drugi brzeg');
    ctx.hud.showHint('Przechylaj, by utrzymać równowagę · stuknij = skok · przesuń w górę = długi skok');
    ctx.hud.setCourage(1);
  }

  startGame(): void {
    this.ctx.audio.music('forest');
  }

  handleInput(e: InputEvent): void {
    this.tilt.handle(e);
    if (this.mode !== 'standing') return;
    if (e.type === 'tap') this.jump(1);
    else if (e.type === 'swipe' && e.direction === 'up') this.jump(2);
  }

  private jump(skip: 1 | 2): void {
    const next = this.current + skip;
    if (next >= this.platforms.length) return;
    const reach = skip === 1 ? 6.8 : 10.6;
    const p = this.platforms[next];
    if (p.x - this.pos.x > reach) {
      this.ctx.audio.sfx('whine', { gain: 0.5 });
      return;
    }
    this.mode = 'jumping';
    this.jumpT = 0;
    this.landing = next;
    this.from.copy(this.pos);
    this.ctx.audio.sfx('jump');
    this.fado.rig.motion.expression = 'run';
    this.fado.rig.motion.speed = 1;
  }

  private fall(): void {
    const ctx = this.ctx;
    this.mode = 'falling';
    this.respawn = 1.1;
    this.falls++;
    this.lives--;
    ctx.hud.setCourage(this.lives / MAX_LIVES);
    ctx.audio.sfx('splash');
    ctx.haptics.pattern([40, 30, 80]);
    ctx.camera.shake(0.6, 0.5);
    this.fx.emit(new THREE.Vector3(this.pos.x, -0.2, this.pos.z), { count: 40, speed: 4, life: 0.9, size: 0.18, color: '#cfeeff', gravity: 9, dir: new THREE.Vector3(0, 2, 0) });
    this.fado.rig.motion.expression = 'scared';
    if (this.lives <= 0) this.lose();
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    this.tilt.update(dt);

    // platformy dryfują i kołyszą się
    for (const p of this.platforms) {
      p.x = p.baseX + Math.sin(t * 0.5 + p.phase) * p.drift;
      p.y = p.bank ? 0 : Math.sin(t * 1.3 + p.phase) * 0.09;
      p.mesh.position.set(p.x, p.y, 0);
      if (!p.bank) p.mesh.rotation.z = Math.sin(t * 1.1 + p.phase) * 0.05;
    }
    (this.water.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

    const boneHost = this.platforms[5];
    if (!this.boneTaken) {
      spinBob(this.bone, t, boneHost.top + 1.0);
      this.bone.position.x = boneHost.x;
    }

    const g = this.fado.group;
    const m = this.fado.rig.motion;

    if (this.mode === 'standing') {
      const p = this.platforms[this.current];
      this.pos.set(p.x, p.y + p.top, 0);
      if (!p.bank) {
        // odwrócone wahadło: im dalej od pionu, tym mocniej spada; przechył telefonu to przeciwwaga
        const disturbance = (Math.sin(t * 1.9 + p.phase) * 0.9 + Math.sin(t * 4.1 + this.wobbleSeed) * 0.5) * (p.slippery ? 1.5 : 1);
        const control = this.tilt.x * 5.2 * ctx.assist;
        this.omega += (disturbance * 0.9 + this.theta * 1.2 - control) * dt;
        this.omega *= 1 - 1.4 * dt;
        this.theta += this.omega * dt;
        if (Math.abs(this.theta) > 1.0) this.fall();
      } else {
        this.theta = damp(this.theta, 0, 6, dt);
        this.omega = 0;
      }
      m.speed = 0;
      m.expression = Math.abs(this.theta) > 0.55 ? 'scared' : 'idle';
    } else if (this.mode === 'jumping') {
      this.jumpT += dt / JUMP_TIME;
      const target = this.platforms[this.landing];
      this.to.set(target.x, target.y + target.top, 0);
      const k = clamp(this.jumpT, 0, 1);
      this.pos.lerpVectors(this.from, this.to, smoothstep(k, 0, 1));
      this.pos.y += Math.sin(k * Math.PI) * (this.landing - this.current > 1 ? 2.2 : 1.3);
      if (k >= 1) {
        const rough = Math.abs(this.theta) > 0.5;
        this.current = this.landing;
        this.mode = 'standing';
        this.wobbleSeed = ctx.random() * 10;
        this.omega = (rough ? Math.sign(this.theta || 1) : (ctx.random() - 0.5)) * 1.1;
        this.theta *= 0.4;
        ctx.audio.sfx('land');
        ctx.haptics.impact('light');
        this.fx.emit(this.to, { count: 10, speed: 2, life: 0.5, size: 0.12, color: '#e8f6ff', gravity: 8, dir: new THREE.Vector3(0, 1.5, 0) });
        ctx.hud.setProgress(this.current / (this.platforms.length - 1));
        if (this.platforms[this.current].bank && this.current === this.platforms.length - 1) this.finishRun();
      }
      m.speed = 1;
    } else {
      this.respawn -= dt;
      this.pos.y -= 3.5 * dt;
      if (this.respawn <= 0 && this.lives > 0) {
        this.theta = 0;
        this.omega = 0;
        this.mode = 'standing';
        const p = this.platforms[this.current];
        this.pos.set(p.x, p.y + p.top, 0);
      }
    }

    // zbieranie Złotej Kości w locie lub po wylądowaniu obok niej
    if (!this.boneTaken && this.pos.distanceTo(this.bone.position) < 1.7) {
      this.boneTaken = true;
      this.collectGoldenBone();
      this.bone.visible = false;
      ctx.audio.sfx('bone');
      ctx.haptics.impact('heavy');
      this.fx.emit(this.bone.position, { count: 36, speed: 4, life: 1, size: 0.18, color: '#ffd23f' });
    }

    g.position.copy(this.pos);
    g.rotation.z = this.mode === 'standing' ? -this.theta * 0.5 : 0;
    this.fado.rig.update(dt, t);
    this.fx.update(dt, ctx);
  }

  private finishRun(): void {
    this.ctx.hud.setProgress(1);
    this.win({ stars: this.falls === 0 ? 3 : this.falls === 1 ? 2 : 1 });
  }

  protected onCleanup(): void {
    this.fado.rig.dispose();
  }
}
