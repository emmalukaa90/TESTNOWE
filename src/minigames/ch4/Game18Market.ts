import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, cone, cyl, dampAngle, glow, goldenBone, makeFado, mat, Particles, plane, sphere, spinBob, type FadoActor } from '../kit';

const FOG_COUNT = 420;
const AREA = { x0: -17, x1: 17, z0: -9, z1: 9 };
const BRUSH_R = 2.6;
const THREAD_DOTS = 60;

/** Poziom 18: rozwiewaj mgłę zapachów, by odsłonić złotą nić Klary i ukrytą kość. */
export class Game18Market extends BaseMinigame {
  readonly id = 18;

  private fado!: FadoActor;
  private fx!: Particles;
  private fog!: THREE.Points;
  private fogPos!: Float32Array;
  private fogDen!: Float32Array;
  private fogSize!: Float32Array;
  private fogVel!: Float32Array;
  private fogHome!: Float32Array;
  private curve!: THREE.CatmullRomCurve3;
  private dots!: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private bone!: THREE.Group;
  private bonePos = new THREE.Vector3(-4, 0.6, -6.2);
  private boneTaken = false;
  private boneRevealed = false;
  private u = 0;
  private strokeId: number | null = null;
  private last: THREE.Vector3 | null = null;
  private waitT = 0;
  private waitHint = 0;
  private totalLen = 1;
  private tmp = new THREE.Vector3();

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('city');
    const { dir } = addLighting(ctx, { sky: '#ffe9c9', ground: '#7a6046', sunIntensity: 2.8, sunPos: [-8, 16, 8], shadowRange: 24 });
    ctx.root.add(plane(48, 30, mat('#b79d78', { roughness: 1 }), [0, 0, 0]));
    // stragany
    const colors = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#8338ec', '#ffbe0b'];
    for (let i = 0; i < 7; i++) {
      const x = -15 + i * 5;
      const z = i % 2 ? -7 : 7;
      const g = new THREE.Group();
      g.add(box(3.4, 1.2, 1.6, mat('#7a5a3a'), [0, 0.6, 0]));
      for (const sx of [-1.6, 1.6]) g.add(cyl(0.06, 0.06, 2.8, mat('#444'), [sx, 1.4, 0.7], 6), cyl(0.06, 0.06, 2.4, mat('#444'), [sx, 1.2, -0.7], 6));
      const awning = box(3.8, 0.12, 2, mat(colors[i % colors.length]), [0, 2.75, 0]);
      awning.rotation.x = z > 0 ? -0.2 : 0.2;
      g.add(awning);
      for (let f = 0; f < 4; f++) g.add(sphere(0.2, mat(['#e74c3c', '#f1c40f', '#2ecc71', '#e67e22'][f]), [-1.2 + f * 0.8, 1.35, 0.1], 8));
      g.position.set(x, 0, z);
      g.rotation.y = z > 0 ? Math.PI : 0;
      ctx.root.add(g);
    }
    for (let i = 0; i < 12; i++) ctx.root.add(sphere(0.2, glow('#ffe7a8', 1.4), [-16 + i * 3, 3.6, ((i % 2) * 2 - 1) * 3], 8));
    ctx.root.add(cone(0.9, 1.6, mat('#caa46a'), [8, 0.8, -1], 4), box(1.1, 1, 1.1, mat('#8a6a42'), [-9, 0.5, 2]));

    // złota nić
    const pts = [
      new THREE.Vector3(-16, 0.25, 3), new THREE.Vector3(-11, 0.25, 0), new THREE.Vector3(-7, 0.25, -2.5), new THREE.Vector3(-2, 0.25, 1.5),
      new THREE.Vector3(3, 0.25, 3.5), new THREE.Vector3(6, 0.25, -1), new THREE.Vector3(10, 0.25, -3), new THREE.Vector3(16, 0.25, 0.5),
    ];
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.totalLen = this.curve.getLength();
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), glow('#ffd23f', 2.6), THREAD_DOTS);
    this.dots.frustumCulled = false;
    ctx.root.add(this.dots);

    // kość ukryta pod mgłą za straganem
    this.bone = goldenBone(1.5);
    this.bone.position.copy(this.bonePos);
    ctx.root.add(this.bone);

    // mgła zapachów: instancje punktów o zmiennej gęstości
    this.fogPos = new Float32Array(FOG_COUNT * 3);
    this.fogHome = new Float32Array(FOG_COUNT * 3);
    this.fogVel = new Float32Array(FOG_COUNT * 2);
    this.fogDen = new Float32Array(FOG_COUNT).fill(1);
    this.fogSize = new Float32Array(FOG_COUNT);
    for (let i = 0; i < FOG_COUNT; i++) {
      const x = AREA.x0 + ctx.random() * (AREA.x1 - AREA.x0);
      const z = AREA.z0 + ctx.random() * (AREA.z1 - AREA.z0);
      const y = 0.4 + ctx.random() * 1.2;
      this.fogHome.set([x, y, z], i * 3);
      this.fogPos.set([x, y, z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.fogPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.fogSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aDen', new THREE.BufferAttribute(this.fogDen, 1).setUsage(THREE.DynamicDrawUsage));
    const mist = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 500 } },
      vertexShader: `attribute float aSize; attribute float aDen; varying float vDen; uniform float uScale;
        void main(){ vDen = aDen; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vDen;
        void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vDen * 0.55;
          gl_FragColor = vec4(0.92, 0.88, 0.8, a); }`,
    });
    this.fog = new THREE.Points(geo, mist);
    this.fog.frustumCulled = false;
    ctx.root.add(this.fog);

    this.fado = makeFado(ctx, { scale: 0.9, lightDir: dir });
    const start = this.curve.getPointAt(0);
    this.fado.group.position.copy(start);
    this.fx = new Particles(160);
    ctx.root.add(this.fx.points);

    ctx.camera.setTarget(this.fado.group);
    ctx.camera.apply({ offset: [0, 10, 8], look: [3, 0, -1.5], fov: 44, bokeh: 0.5, duration: 0 });
    ctx.hud.setObjective('Rozwiej mgłę i podążaj za złotą nicią');
    ctx.hud.showHint('Przeciągaj palcem po ekranie, by rozwiewać mgłę');
    ctx.hud.setCourage(1);
  }

  startGame(): void {
    this.ctx.audio.music('city');
    this.ctx.audio.setMusicIntensity(0.35);
  }

  handleInput(e: InputEvent): void {
    const ctx = this.ctx;
    if (e.type === 'pointer-down' && this.strokeId === null) {
      this.strokeId = e.pointerId;
      const p = ctx.groundPoint(e.nx, e.ny, 0.8);
      this.last = p ? p.clone() : null;
    } else if (e.type === 'pointer-move' && e.pointerId === this.strokeId) {
      const p = ctx.groundPoint(e.nx, e.ny, 0.8);
      if (p) {
        if (this.last) this.sweep(this.last, p);
        this.last = p.clone();
      }
    } else if (e.type === 'pointer-up' && e.pointerId === this.strokeId) {
      this.strokeId = null;
      this.last = null;
    } else if (e.type === 'tap' && this.boneRevealed && !this.boneTaken) {
      const p = ctx.groundPoint(e.nx, e.ny, 0.6);
      if (p && Math.hypot(p.x - this.bonePos.x, p.z - this.bonePos.z) < 1.8) this.takeBone();
    }
  }

  /** Odpycha i rozrzedza puchy mgły wzdłuż odcinka ruchu palca. */
  private sweep(a: THREE.Vector3, b: THREE.Vector3): void {
    const r = BRUSH_R * this.ctx.assist;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1e-6;
    const speed = Math.sqrt(len2);
    for (let i = 0; i < FOG_COUNT; i++) {
      const px = this.fogPos[i * 3];
      const pz = this.fogPos[i * 3 + 2];
      const t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / len2, 0, 1);
      const cx = a.x + dx * t;
      const cz = a.z + dz * t;
      const d = Math.hypot(px - cx, pz - cz);
      if (d < r) {
        const k = 1 - d / r;
        this.fogDen[i] = Math.max(0, this.fogDen[i] - k * 0.9);
        this.fogVel[i * 2] += ((px - cx) / (d + 0.2)) * k * (1.5 + speed * 4);
        this.fogVel[i * 2 + 1] += ((pz - cz) / (d + 0.2)) * k * (1.5 + speed * 4);
      }
    }
    if (Math.random() < 0.3) this.ctx.audio.sfx('whoosh', { gain: 0.12 });
  }

  /** Średnia gęstość mgły wokół punktu. */
  private densityAt(x: number, z: number): number {
    let sum = 0;
    let w = 0;
    for (let i = 0; i < FOG_COUNT; i++) {
      const d = Math.hypot(this.fogPos[i * 3] - x, this.fogPos[i * 3 + 2] - z);
      if (d < 2.4) {
        const k = 1 - d / 2.4;
        sum += this.fogDen[i] * k;
        w += k;
      }
    }
    return w > 0.15 ? sum / w : 0;
  }

  private takeBone(): void {
    const ctx = this.ctx;
    this.boneTaken = true;
    this.collectGoldenBone();
    this.bone.visible = false;
    ctx.audio.sfx('bone');
    ctx.haptics.impact('heavy');
    this.fx.emit(this.bonePos, { count: 40, speed: 4, life: 1.1, size: 0.18, color: '#ffd23f' });
    ctx.hud.showHint('Znalazłeś ukrytą Złotą Kość!');
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    const m = this.fado.rig.motion;

    // mgła: dryf do domu, regeneracja gęstości, wygładzenie
    const regen = ctx.assist > 1 ? 0.05 : 0.09;
    for (let i = 0; i < FOG_COUNT; i++) {
      this.fogVel[i * 2] *= Math.exp(-2.2 * dt);
      this.fogVel[i * 2 + 1] *= Math.exp(-2.2 * dt);
      this.fogPos[i * 3] += this.fogVel[i * 2] * dt + (this.fogHome[i * 3] - this.fogPos[i * 3]) * 0.3 * dt;
      this.fogPos[i * 3 + 2] += this.fogVel[i * 2 + 1] * dt + (this.fogHome[i * 3 + 2] - this.fogPos[i * 3 + 2]) * 0.3 * dt;
      this.fogPos[i * 3 + 1] = this.fogHome[i * 3 + 1] + Math.sin(t * 0.6 + i) * 0.1;
      this.fogDen[i] = Math.min(1, this.fogDen[i] + regen * dt);
      this.fogSize[i] = 3.4 * (0.25 + 0.75 * this.fogDen[i]);
    }
    const geo = this.fog.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aDen.needsUpdate = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    (this.fog.material as THREE.ShaderMaterial).uniforms.uScale.value = (ctx.view.height * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.rig.fov) / 2));

    // nić: kropki widoczne tam, gdzie mgła jest rzadka
    for (let i = 0; i < THREAD_DOTS; i++) {
      const p = this.curve.getPointAt(i / (THREAD_DOTS - 1));
      const vis = 1 - clamp(this.densityAt(p.x, p.z) * 1.3, 0, 1);
      this.dummy.position.set(p.x, 0.25 + Math.sin(t * 4 + i) * 0.04, p.z);
      this.dummy.scale.setScalar(0.15 + vis * 1.1);
      this.dummy.updateMatrix();
      this.dots.setMatrixAt(i, this.dummy.matrix);
    }
    this.dots.instanceMatrix.needsUpdate = true;

    // Fado idzie po nici, gdy odcinek przed nim jest czysty
    const ahead = [0.012, 0.03, 0.05].map((du) => this.curve.getPointAt(Math.min(1, this.u + du)));
    const clear = ahead.every((p) => this.densityAt(p.x, p.z) < 0.5 + (ctx.assist - 1));
    const pos = this.curve.getPointAt(this.u);
    if (clear) {
      this.u = Math.min(1, this.u + (3.0 * dt) / this.totalLen);
      this.waitT = 0;
    } else this.waitT += dt;
    const nowP = this.curve.getPointAt(this.u);
    const dir = this.tmp.copy(nowP).sub(pos);
    if (dir.lengthSq() > 1e-8) this.fado.group.rotation.y = dampAngle(this.fado.group.rotation.y, Math.atan2(dir.x, dir.z), 10, dt);
    this.fado.group.position.copy(nowP);
    m.speed = clear ? 0.6 : 0;
    m.expression = clear ? 'run' : 'sniff';
    this.fado.rig.update(dt, t);
    if (!clear && this.waitT > 6 && this.waitHint <= 0) {
      ctx.hud.showHint('Mgła zasłania drogę — rozwiej ją przed Fado!');
      this.waitHint = 8;
    }
    this.waitHint = Math.max(0, this.waitHint - dt);

    // kość
    if (!this.boneTaken) {
      spinBob(this.bone, t, 0.7);
      const den = this.densityAt(this.bonePos.x, this.bonePos.z);
      const revealed = den < 0.35;
      if (revealed && !this.boneRevealed) {
        this.boneRevealed = true;
        ctx.audio.sfx('sparkle', { gain: 0.6 });
        ctx.hud.showHint('Coś błyszczy! Stuknij kość, by ją zabrać.');
      }
      this.bone.visible = this.boneRevealed || den < 0.7;
      if (this.boneRevealed && den > 0.9) this.boneRevealed = false;
    }

    ctx.hud.setProgress(this.u);
    this.fx.update(dt, ctx);
    if (this.u >= 0.999) this.win({ stars: this.elapsed < 70 ? 3 : this.elapsed < 110 ? 2 : 1 });
  }

  protected onCleanup(): void {
    this.fado.rig.dispose();
  }
}
