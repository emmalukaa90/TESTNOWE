import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, cyl, damp, glow, goldenBone, makeFado, mat, Particles, plane, sphere, spinBob, type FadoActor } from '../kit';

const X0 = -3;
const X1 = 27;
const Y0 = -12;
const RES = 8;
const W = (X1 - X0) * RES;
const H = (0 - Y0) * RES;
const BRUSH = 0.62;
const TIP_SPEED = 6.5;
const FADO_SPEED = 4.2;

interface Stone { x: number; y: number; r: number }
interface Pipe { x0: number; y0: number; x1: number; y1: number; r: number }
interface Mole { x0: number; x1: number; y: number; speed: number; mesh: THREE.Group; phase: number; x: number }

const FENCE = { x: 12, hw: 0.3, bottom: -6.1 };

function distToSegment(px: number, py: number, p: Pipe): number {
  const dx = p.x1 - p.x0;
  const dy = p.y1 - p.y0;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - p.x0) * dx + (py - p.y0) * dy) / l2, 0, 1);
  return Math.hypot(px - (p.x0 + dx * t), py - (p.y0 + dy * t));
}

/** Poziom 6: wykop tunel pod płotem; Fado idzie wykopanym korytarzem. */
export class Game06Dig extends BaseMinigame {
  readonly id = 6;

  private fado!: FadoActor;
  private fx!: Particles;
  private mask = new Uint8Array(W * H);
  private maskTex!: THREE.DataTexture;
  private stones: Stone[] = [];
  private pipes: Pipe[] = [];
  private moles: Mole[] = [];
  private bone!: THREE.Group;
  private boneAt = new THREE.Vector2(19.5, -9.6);
  private boneTaken = false;
  private exit = new THREE.Vector2(23, -1.6);
  private exitRing!: THREE.Mesh;
  private tipMarker!: THREE.Mesh;

  /** punkty wykopanej ścieżki (od startu do końcówki) */
  private path: THREE.Vector2[] = [new THREE.Vector2(0.5, 0.3)];
  private tip = new THREE.Vector2(0.5, 0.3);
  private pathProgress = 0;
  private finger: THREE.Vector2 | null = null;
  private fingerId: number | null = null;
  private dragging = false;
  private courage = 1;
  private hurt = 0;
  private hits = 0;
  private cooldown = 0;
  private finished2 = false;
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private tmpV = new THREE.Vector3();

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('farm');
    const { dir } = addLighting(ctx, { sky: '#dff1ff', ground: '#6b5a40', sunIntensity: 2.8, sunPos: [-6, 14, 14] });

    // niebo/trawa
    ctx.root.add(box(60, 0.5, 1.4, mat('#5fa04a', { roughness: 1 }), [12, -0.2, 0.3]));
    ctx.root.add(plane(80, 30, mat('#8cc063', { roughness: 1 }), [12, 0.0, -14]));
    // dirt shader z maską wykopów
    const mask = this.mask;
    this.maskTex = new THREE.DataTexture(mask, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    this.maskTex.magFilter = THREE.LinearFilter;
    this.maskTex.minFilter = THREE.LinearFilter;
    this.maskTex.needsUpdate = true;
    const dirt = new THREE.ShaderMaterial({
      uniforms: { uMask: { value: this.maskTex }, uSize: { value: new THREE.Vector2(X1 - X0, -Y0) }, uOrigin: { value: new THREE.Vector2(X0, Y0) } },
      transparent: true,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform sampler2D uMask; uniform vec2 uSize; uniform vec2 uOrigin;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          float m = texture2D(uMask, vUv).r;
          if (m > 0.5) discard;
          vec2 w = uOrigin + vUv * uSize;
          float depth = clamp(-w.y / 12.0, 0.0, 1.0);
          vec3 top = vec3(0.50,0.33,0.20);
          vec3 deep = vec3(0.22,0.15,0.12);
          vec3 c = mix(top, deep, depth);
          float n = hash(floor(w * 9.0));
          c *= 0.88 + 0.24 * n;
          c *= 1.0 - smoothstep(0.0, 0.5, m) * 0.55;  // ciemniejszy brzeg tunelu
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const dirtMesh = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, -Y0), dirt);
    dirtMesh.position.set((X0 + X1) / 2, Y0 / 2, 0.4);
    ctx.root.add(dirtMesh);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, -Y0), new THREE.MeshBasicMaterial({ color: '#150e0a' }));
    back.position.set((X0 + X1) / 2, Y0 / 2, -0.4);
    ctx.root.add(back);

    // płot: słupki wchodzą głęboko w ziemię
    const wood = mat('#b98a56');
    for (let i = 0; i < 3; i++) ctx.root.add(box(0.1, 3.6, 0.2, wood, [FENCE.x - 0.5 + i * 0.5, 1.8, 0.1]));
    ctx.root.add(box(2, 0.2, 0.2, wood, [FENCE.x, 2.4, 0.1]), box(2, 0.2, 0.2, wood, [FENCE.x, 1.0, 0.1]));
    ctx.root.add(box(FENCE.hw * 2, 3 - FENCE.bottom, 0.5, mat('#8e6a42'), [FENCE.x, (3 + FENCE.bottom) / 2, 0.4]));
    // wysokie tło farmy
    ctx.root.add(box(6, 4, 0.5, mat('#c0392b'), [22, 2.2, -2.5]));

    // kamienie, rury, krety
    const stoneMat = mat('#82868b');
    for (const s of [{ x: 6, y: -2.5, r: 1.1 }, { x: 8.8, y: -4.6, r: 1.2 }, { x: 11.2, y: -8.9, r: 1.0 }, { x: 15.5, y: -4.5, r: 1.3 }, { x: 17.2, y: -6.8, r: 1.0 }, { x: 20, y: -4, r: 0.9 }]) {
      this.stones.push(s);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s.r, 0), stoneMat);
      m.position.set(s.x, s.y, 0.55);
      m.scale.set(1, 0.9, 0.5);
      m.castShadow = true;
      ctx.root.add(m);
    }
    const pipeMat = mat('#6f7b86', { metalness: 0.6, roughness: 0.4 });
    for (const p of [{ x0: 2, y0: -5.2, x1: 7, y1: -5.2, r: 0.28 }, { x0: 14.2, y0: -10.5, x1: 14.2, y1: -7.0, r: 0.28 }, { x0: 16, y0: -9.6, x1: 22, y1: -9.6, r: 0.28 }]) {
      this.pipes.push(p);
      const len = Math.hypot(p.x1 - p.x0, p.y1 - p.y0);
      const c = cyl(p.r, p.r, len, pipeMat, [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0.55]);
      c.rotation.z = Math.atan2(p.y1 - p.y0, p.x1 - p.x0) - Math.PI / 2;
      ctx.root.add(c);
    }
    for (const mdef of [{ x0: 9.5, x1: 13.8, y: -7.2, speed: 1.4 }, { x0: 16.5, x1: 22.5, y: -2.8, speed: 1.9 }]) {
      const g = new THREE.Group();
      g.add(sphere(0.42, mat('#4a4048'), [0, 0, 0], 14), sphere(0.14, mat('#e58aa0'), [0.45, -0.02, 0], 8), sphere(0.06, mat('#000'), [0.3, 0.14, 0.2], 6));
      g.position.z = 0.0;
      ctx.root.add(g);
      const mole: Mole = { ...mdef, mesh: g, phase: ctx.random() * 6, x: mdef.x0 };
      this.moles.push(mole);
      this.paintLine(mdef.x0, mdef.y, mdef.x1, mdef.y, 0.55);
    }

    // kość i wyjście
    this.bone = goldenBone(1.4);
    this.bone.position.set(this.boneAt.x, this.boneAt.y, 0.0);
    ctx.root.add(this.bone);
    this.exitRing = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.09, 8, 24), glow('#ffd23f', 2));
    this.exitRing.position.set(this.exit.x, this.exit.y, 0.2);
    ctx.root.add(this.exitRing);
    this.paintCircle(this.exit.x, this.exit.y, 0.9);
    this.paintCircle(this.boneAt.x, this.boneAt.y, 0.8);
    this.paintCircle(0.5, 0.0, 0.9);

    this.tipMarker = sphere(0.22, glow('#ffe08a', 2), [0.5, 0.3, 0.3]);
    ctx.root.add(this.tipMarker);

    this.fado = makeFado(ctx, { scale: 0.62, lightDir: dir });
    this.fado.group.position.set(0.5, 0.3, 0.05);
    this.fado.group.rotation.y = Math.PI / 2;
    this.fx = new Particles(260, { additive: false, opacity: 0.9 });
    ctx.root.add(this.fx.points);

    ctx.camera.setTarget(this.fado.group);
    ctx.camera.apply({ offset: [2.5, -2.2, 15], look: [2.5, -3.2, 0], fov: 42, bokeh: 0.6, duration: 0 });
    ctx.hud.setObjective('Wykop tunel pod płotem');
    ctx.hud.showHint('Przeciągnij od świecącej końcówki — Fado pójdzie za Tobą');
    ctx.hud.setCourage(1);
    this.maskTex.needsUpdate = true;
  }

  startGame(): void {
    this.ctx.audio.music('farm');
  }

  private paintCircle(cx: number, cy: number, r: number): void {
    const px = (cx - X0) * RES;
    const py = (cy - Y0) * RES;
    const pr = r * RES;
    const x0 = Math.max(0, Math.floor(px - pr));
    const x1 = Math.min(W - 1, Math.ceil(px + pr));
    const y0 = Math.max(0, Math.floor(py - pr));
    const y1 = Math.min(H - 1, Math.ceil(py + pr));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
        if (d <= pr) this.mask[y * W + x] = 255;
      }
    }
  }

  private paintLine(ax: number, ay: number, bx: number, by: number, r: number): void {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (r * 0.5));
    for (let i = 0; i <= steps; i++) this.paintCircle(ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps, r);
  }

  private blocked(x: number, y: number): boolean {
    for (const s of this.stones) if (Math.hypot(x - s.x, y - s.y) < s.r * 0.95 + BRUSH * 0.6) return true;
    if (Math.abs(x - FENCE.x) < FENCE.hw + 0.35 && y > FENCE.bottom - 0.2) return true;
    return x < X0 + 0.6 || x > X1 - 0.6 || y < Y0 + 0.6;
  }

  handleInput(e: InputEvent): void {
    if (e.type === 'pointer-down' && this.fingerId === null) {
      const p = this.worldAt(e.nx, e.ny);
      if (!p) return;
      this.fingerId = e.pointerId;
      this.finger = p;
      this.dragging = p.distanceTo(this.tip) < 3.2 * this.ctx.assist;
      if (this.dragging) this.ctx.audio.sfx('rustle');
    } else if (e.type === 'pointer-move' && e.pointerId === this.fingerId) {
      const p = this.worldAt(e.nx, e.ny);
      if (p) this.finger = p;
    } else if (e.type === 'pointer-up' && e.pointerId === this.fingerId) {
      this.fingerId = null;
      this.finger = null;
      this.dragging = false;
    }
  }

  private worldAt(nx: number, ny: number): THREE.Vector2 | null {
    const v = this.ctx.pointOnPlane(nx, ny, this.plane, this.tmpV);
    return v ? new THREE.Vector2(v.x, v.y) : null;
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.hurt = Math.max(0, this.hurt - dt);

    // końcówka tunelu podąża za palcem (kopie po drodze)
    if (this.dragging && this.finger && !this.finished2) {
      const to = this.finger.clone().sub(this.tip);
      const dist = to.length();
      if (dist > 0.05) {
        const stepLen = Math.min(dist, TIP_SPEED * dt);
        const step = to.multiplyScalar(stepLen / dist);
        const nx = this.tip.x + step.x;
        let ny = this.tip.y + step.y;
        ny = Math.min(ny, 0.3);
        if (this.blocked(nx, ny)) {
          if (this.cooldown <= 0) {
            ctx.audio.sfx('thud', { gain: 0.4 });
            ctx.haptics.impact('light');
            this.cooldown = 0.35;
            this.fx.emit(new THREE.Vector3(this.tip.x, this.tip.y, 0.5), { count: 6, speed: 1.5, life: 0.4, size: 0.1, color: '#9a9a9a', gravity: 6 });
          }
        } else {
          this.tip.set(nx, ny);
          const last = this.path[this.path.length - 1];
          if (this.tip.distanceTo(last) > 0.18) {
            this.paintLine(last.x, last.y, this.tip.x, this.tip.y, BRUSH);
            this.path.push(this.tip.clone());
            this.maskTex.needsUpdate = true;
            if (Math.random() < 0.5) this.fx.emit(new THREE.Vector3(this.tip.x, this.tip.y, 0.6), { count: 3, speed: 1.4, life: 0.5, size: 0.11, color: '#7a5232', gravity: 7 });
            if (Math.random() < 0.2) ctx.audio.sfx('scratch', { gain: 0.25 });
          }
          this.checkPipes(this.tip.x, this.tip.y);
        }
      }
    }
    this.tipMarker.position.set(this.tip.x, this.tip.y, 0.3);
    this.tipMarker.scale.setScalar(1 + Math.sin(t * 6) * 0.15);

    // Fado idzie wykopaną ścieżką
    const g = this.fado.group;
    const m = this.fado.rig.motion;
    const total = this.pathLength();
    const prev = g.position.clone();
    if (this.pathProgress < total - 0.05 && !this.finished2) {
      this.pathProgress = Math.min(total, this.pathProgress + FADO_SPEED * dt);
    }
    const pos = this.pointAt(this.pathProgress);
    g.position.set(pos.x, pos.y - 0.25, 0.05);
    const dx = g.position.x - prev.x;
    const dy = g.position.y - prev.y;
    const moving = Math.hypot(dx, dy) / dt > 0.4;
    m.speed = moving ? 0.55 : 0;
    m.expression = this.hurt > 0 ? 'scared' : moving ? 'run' : 'sniff';
    if (Math.abs(dx) > 1e-4) g.rotation.y = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.rotation.z = damp(g.rotation.z, clamp(Math.atan2(dy, Math.abs(dx) + 1e-3), -0.9, 0.9) * (dx >= 0 ? 1 : -1), 8, dt);
    this.fado.rig.update(dt, t);

    // krety patrolują swoje korytarze
    for (const mole of this.moles) {
      const span = mole.x1 - mole.x0;
      const u = (Math.sin(t * mole.speed * 0.6 + mole.phase) + 1) / 2;
      const nx = mole.x0 + u * span;
      mole.mesh.rotation.y = nx >= mole.x ? 0 : Math.PI;
      mole.x = nx;
      mole.mesh.position.set(nx, mole.y, 0.1);
      if (this.cooldown <= 0 && Math.hypot(g.position.x - nx, g.position.y + 0.25 - mole.y) < 0.8) this.damage(0.34, 'Kret!');
    }
    // Fado w rurze (np. gdy tunel przeszedł obok)
    this.checkPipes(g.position.x, g.position.y + 0.25);

    // kość, meta
    if (!this.boneTaken) {
      spinBob(this.bone, t, this.boneAt.y, 2, 0.08);
      if (this.tip.distanceTo(this.boneAt) < 1.0 || Math.hypot(g.position.x - this.boneAt.x, g.position.y - this.boneAt.y) < 1.0) {
        this.boneTaken = true;
        this.collectGoldenBone();
        this.bone.visible = false;
        ctx.audio.sfx('bone');
        ctx.haptics.impact('heavy');
        this.fx.emit(new THREE.Vector3(this.boneAt.x, this.boneAt.y, 0.5), { count: 32, speed: 3.5, life: 1, size: 0.16, color: '#ffd23f' });
      }
    }
    this.exitRing.rotation.z = t * 2;
    const dEnd = Math.hypot(g.position.x - this.exit.x, g.position.y + 0.25 - this.exit.y);
    ctx.hud.setProgress(1 - clamp(dEnd / (this.exit.x + 1), 0, 1));
    if (!this.finished2 && dEnd < 1.0) {
      this.finished2 = true;
      ctx.audio.sfx('sparkle');
      this.win({ stars: this.hits === 0 ? 3 : this.hits === 1 ? 2 : 1 });
    }
    this.fx.update(dt, ctx);
  }

  private checkPipes(x: number, y: number): void {
    if (this.cooldown > 0) return;
    for (const p of this.pipes) {
      if (distToSegment(x, y, p) < p.r + 0.4) {
        this.damage(0.25, 'Pęknięta rura!');
        // odrzut końcówki do ostatniego bezpiecznego punktu ścieżki
        const back = this.path[Math.max(0, this.path.length - 6)];
        this.tip.copy(back);
        break;
      }
    }
  }

  private damage(amount: number, hint: string): void {
    const ctx = this.ctx;
    this.cooldown = 1.0;
    this.hurt = 0.9;
    this.hits++;
    this.courage = clamp(this.courage - amount / ctx.assist, 0, 1);
    ctx.hud.setCourage(this.courage);
    ctx.hud.showHint(hint);
    ctx.audio.sfx(hint === 'Kret!' ? 'hit' : 'splash');
    ctx.haptics.pattern([50, 30, 70]);
    ctx.camera.shake(0.5, 0.4);
    this.fx.emit(new THREE.Vector3(this.fado.group.position.x, this.fado.group.position.y + 0.3, 0.6), { count: 24, speed: 4, life: 0.7, size: 0.13, color: '#bfe8ff', gravity: 8 });
    if (this.courage <= 0.001) this.lose();
  }

  private pathLength(): number {
    let l = 0;
    for (let i = 1; i < this.path.length; i++) l += this.path[i].distanceTo(this.path[i - 1]);
    return l;
  }

  private pointAt(dist: number): THREE.Vector2 {
    let rest = dist;
    for (let i = 1; i < this.path.length; i++) {
      const seg = this.path[i].distanceTo(this.path[i - 1]);
      if (rest <= seg) return this.path[i - 1].clone().lerp(this.path[i], seg > 0 ? rest / seg : 0);
      rest -= seg;
    }
    return this.path[this.path.length - 1].clone();
  }

  protected onCleanup(): void {
    this.maskTex.dispose();
    this.fado.rig.dispose();
  }
}
