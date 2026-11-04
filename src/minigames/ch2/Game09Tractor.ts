import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, cyl, damp, goldenBone, makeFado, mat, Particles, sphere, type FadoActor } from '../kit';

const ROUTE = 250;
const SPEED = 7;
const HALF = 2.2; // połowa długości paki
const G = 5.6;
const COUNT = 4;

const BUMPS = [48, 86, 121, 158, 193, 224];

/** Profil drogi: wzgórza + kilka garbów. */
function road(x: number): number {
  let h = 1.1 * Math.sin(x * 0.14) + 0.5 * Math.sin(x * 0.31 + 1.3) + 0.2 * Math.sin(x * 0.6);
  for (const b of BUMPS) h += 0.38 * Math.exp(-((x - b) * (x - b)) / 0.5);
  return h * Math.min(1, x / 12); // spokojny początek
}
const slope = (x0: number, x1: number) => Math.atan2(road(x1) - road(x0), x1 - x0);

interface Pumpkin {
  mesh: THREE.Mesh;
  p: number;
  v: number;
  lost: boolean;
  fall: number;
}

/** Poziom 9: Fado jako przeciwwaga dla turlających się dyń na przyczepie. */
export class Game09Tractor extends BaseMinigame {
  readonly id = 9;

  private fado!: FadoActor;
  private fx!: Particles;
  private tractor = new THREE.Group();
  private trailer = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private pumpkins: Pumpkin[] = [];
  private bone!: THREE.Group;
  private boneTaken = false;
  private x = 8;
  private bed = 0;
  private fadoP = 0;
  private fadoTarget = 0;
  private lost = 0;
  private bumpCd = 0;

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('farm');
    const { dir } = addLighting(ctx, { sky: '#e6f5ff', ground: '#7a9a50', sunIntensity: 3.2, sunPos: [-10, 18, 14], shadowRange: 22 });

    // droga jako wstęga zgodna z profilem
    const seg = ROUTE + 80;
    const geo = new THREE.PlaneGeometry(seg, 7, seg, 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, road(pos.getX(i) + seg / 2 - 20));
    geo.translate(seg / 2 - 20, 0, 0);
    geo.computeVertexNormals();
    const roadMesh = new THREE.Mesh(geo, mat('#8a7458', { roughness: 1 }));
    roadMesh.receiveShadow = true;
    ctx.root.add(roadMesh);
    // pola po bokach
    const fieldGeo = new THREE.PlaneGeometry(seg, 40, seg / 2, 1);
    fieldGeo.rotateX(-Math.PI / 2);
    const fp = fieldGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) fp.setY(i, road(fp.getX(i) + seg / 2 - 20) - 0.15);
    fieldGeo.translate(seg / 2 - 20, 0, -23.5);
    fieldGeo.computeVertexNormals();
    ctx.root.add(new THREE.Mesh(fieldGeo, mat('#78b24f', { roughness: 1 })));
    // słupki ogrodzenia i drzewa w tle (parallax przez rozmieszczenie)
    const postGeo = new THREE.BoxGeometry(0.15, 1.1, 0.15);
    const posts = new THREE.InstancedMesh(postGeo, mat('#9a6f43'), 120);
    const d = new THREE.Object3D();
    for (let i = 0; i < 120; i++) {
      const px = -10 + i * 2.6;
      d.position.set(px, road(px) + 0.5, -3.8);
      d.updateMatrix();
      posts.setMatrixAt(i, d.matrix);
    }
    ctx.root.add(posts);
    for (let i = 0; i < 40; i++) {
      const tx = -10 + i * 7.5 + ctx.random() * 3;
      const t = new THREE.Group();
      t.add(cyl(0.2, 0.28, 1.6, mat('#5a3d28'), [0, 0.8, 0], 6), sphere(1.5 + ctx.random(), mat('#3f8a3f'), [0, 2.6, 0], 10));
      t.position.set(tx, road(tx), -9 - ctx.random() * 8);
      ctx.root.add(t);
    }

    this.buildTractor();
    this.buildTrailer(ctx);

    this.fado = makeFado(ctx, { scale: 0.85, lightDir: dir });
    this.trailer.add(this.fado.group);
    this.fado.group.rotation.y = Math.PI / 2;
    this.fx = new Particles(120);
    ctx.root.add(this.fx.points);

    this.bone = goldenBone(1.4);
    ctx.root.add(this.bone);

    ctx.camera.setTarget(this.trailer);
    ctx.camera.apply({ offset: [3.2, 2.6, 11], look: [3.5, 1.2, 0], fov: 40, bokeh: 1.1, duration: 0 });
    ctx.hud.setObjective('Nie zgub dyń!');
    ctx.hud.showHint('Przeciągaj palcem w lewo i w prawo, by przesuwać Fado');
    ctx.hud.setCourage(1);
  }

  private buildTractor(): void {
    const red = mat('#c0392b');
    const dark = mat('#2b2b2b');
    const body = box(3.0, 1.0, 1.6, red, [0.2, 1.2, 0]);
    const hood = box(1.5, 0.8, 1.2, red, [1.5, 1.05, 0]);
    const cab = box(1.2, 1.3, 1.5, mat('#e8b04a'), [-0.4, 2.2, 0]);
    const glass = box(1.22, 0.7, 1.52, new THREE.MeshStandardMaterial({ color: '#bfe0f0', transparent: true, opacity: 0.55 }), [-0.4, 2.3, 0]);
    const pipe = cyl(0.08, 0.08, 0.8, dark, [1.9, 1.9, 0.3]);
    for (const [wx, r] of [[0, 0.95], [2.2, 0.55]] as const) {
      for (const z of [-0.95, 0.95]) {
        const w = cyl(r, r, 0.45, dark, [wx, r, z], 18);
        w.rotation.x = Math.PI / 2;
        const hub = cyl(r * 0.45, r * 0.45, 0.5, mat('#e8c14a'), [wx, r, z], 10);
        hub.rotation.x = Math.PI / 2;
        this.wheels.push(w);
        this.tractor.add(w, hub);
      }
    }
    this.tractor.add(body, hood, cab, glass, pipe);
  }

  private buildTrailer(ctx: GameContext): void {
    const wood = mat('#a97d4a');
    this.trailer.add(box(HALF * 2 + 0.6, 0.22, 2.4, wood, [0, 0.55, 0]));
    for (const z of [-1.15, 1.15]) this.trailer.add(box(HALF * 2 + 0.6, 0.35, 0.1, mat('#8a6238'), [0, 0.8, z]));
    for (const wx of [-1.5, 1.5]) {
      for (const z of [-1.2, 1.2]) {
        const w = cyl(0.55, 0.55, 0.3, mat('#2b2b2b'), [wx, 0.0, z], 16);
        w.rotation.x = Math.PI / 2;
        this.wheels.push(w);
        this.trailer.add(w);
      }
    }
    const orange = mat('#f08a24');
    const stem = mat('#4a7a2c');
    for (let i = 0; i < COUNT; i++) {
      const m = sphere(0.5, orange, [0, 0, 0], 16);
      m.scale.set(1, 0.85, 1);
      m.add(cyl(0.06, 0.08, 0.2, stem, [0, 0.45, 0], 6));
      this.trailer.add(m);
      this.pumpkins.push({ mesh: m, p: -1.5 + i * 1.0, v: 0, lost: false, fall: 0 });
    }
    ctx.root.add(this.tractor, this.trailer);
  }

  startGame(): void {
    this.ctx.audio.music('farm');
    this.ctx.audio.setMusicIntensity(0.55);
  }

  handleInput(e: InputEvent): void {
    if (e.type === 'pointer-down' || e.type === 'pointer-move') this.fadoTarget = clamp(e.nx * HALF * 1.15, -HALF, HALF);
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    this.x += SPEED * dt;
    this.bumpCd = Math.max(0, this.bumpCd - dt);

    // pozycje pojazdów na profilu drogi
    const tx = this.x;
    this.tractor.position.set(tx, road(tx), 0);
    this.tractor.rotation.z = slope(tx, tx + 2.2);
    const trx = tx - 4.6;
    const terrain = slope(trx - 1.5, trx + 1.5);
    this.trailer.position.set(trx, (road(trx - 1.5) + road(trx + 1.5)) / 2 + 0.55, 0);

    // Fado przesuwa się po pace
    this.fadoP = damp(this.fadoP, this.fadoTarget, 7, dt);
    const sumMoment = 2 * this.fadoP + this.pumpkins.reduce((s, p) => s + (p.lost ? 0 : p.p), 0);
    // bardziej obciążona prawa strona opuszcza pakę — dynie toczą się dalej w prawo (dodatnie sprzężenie)
    const bedTarget = terrain - 0.06 * sumMoment;
    this.bed = damp(this.bed, bedTarget, 9, dt);
    this.trailer.rotation.z = this.bed;

    // dynie
    for (const p of this.pumpkins) {
      if (p.lost) {
        p.fall += dt;
        p.mesh.position.y -= 9 * p.fall * dt * 2;
        p.mesh.position.x += Math.sign(p.p) * 2 * dt;
        p.mesh.rotation.z += 6 * dt;
        continue;
      }
      p.v += -G * Math.sin(this.bed) * dt;
      // przeszkody na drodze podrzucają dynie
      p.v *= Math.exp(-0.35 * dt);
      p.p += p.v * dt;
      p.mesh.rotation.z -= (p.v * dt) / 0.5;
      // odbicie od Fado (szerokość ~0.9)
      const df = p.p - this.fadoP;
      if (Math.abs(df) < 0.85) {
        p.p = this.fadoP + Math.sign(df || 1) * 0.85;
        p.v = Math.abs(p.v) * 0.45 * Math.sign(df || 1);
      }
    }
    // zderzenia dyń ze sobą
    const alive = this.pumpkins.filter((p) => !p.lost).sort((a, b) => a.p - b.p);
    for (let i = 1; i < alive.length; i++) {
      const a = alive[i - 1];
      const b = alive[i];
      if (b.p - a.p < 0.95) {
        const mid = (a.p + b.p) / 2;
        a.p = mid - 0.475;
        b.p = mid + 0.475;
        const va = a.v;
        a.v = b.v * 0.8;
        b.v = va * 0.8;
      }
    }
    // garby: krótki kopniak
    for (const b of BUMPS) {
      if (this.bumpCd <= 0 && Math.abs(trx + 1.5 - b) < 0.35) {
        this.bumpCd = 0.6;
        for (const p of alive) p.v += (ctx.random() - 0.5) * 2.4;
        ctx.audio.sfx('thud', { gain: 0.6 });
        ctx.haptics.impact('medium');
        ctx.camera.shake(0.3, 0.3);
        this.fx.emit(new THREE.Vector3(trx + 1.5, road(b) + 0.2, 1.2), { count: 8, speed: 2, life: 0.5, size: 0.12, color: '#b9a37c', gravity: 5 });
      }
    }
    // spadanie za burtę
    for (const p of alive) {
      if (Math.abs(p.p) > HALF + 0.35) {
        p.lost = true;
        this.lost++;
        ctx.audio.sfx('lose', { gain: 0.5 });
        ctx.audio.sfx('splash', { gain: 0.4 });
        ctx.haptics.pattern([60, 30, 90]);
        ctx.hud.setCourage(1 - this.lost / 2);
        ctx.hud.showHint('Dynia spadła!');
        if (this.lost >= 2) this.lose();
      }
    }
    for (const p of this.pumpkins) {
      if (!p.lost) p.mesh.position.set(p.p, 0.55 + 0.11 + 0.42, 0);
    }
    this.fado.group.position.set(this.fadoP, 0.66, 0);
    const m = this.fado.rig.motion;
    m.speed = clamp(Math.abs(this.fadoTarget - this.fadoP) * 0.6, 0, 1);
    m.expression = Math.abs(this.bed) > 0.25 ? 'scared' : 'alert';
    this.fado.group.rotation.y = Math.abs(this.fadoTarget - this.fadoP) > 0.1 ? (this.fadoTarget > this.fadoP ? Math.PI / 2 : -Math.PI / 2) : this.fado.group.rotation.y;
    this.fado.rig.update(dt, t);

    for (const w of this.wheels) w.rotation.z -= (SPEED * dt) / 0.7;

    // Złota Kość w powietrzu nad drogą
    if (!this.boneTaken) {
      const bx = 150;
      this.bone.position.set(bx, road(bx) + 3.2 + Math.sin(t * 2) * 0.15, 0);
      this.bone.rotation.y = t * 2;
      if (Math.abs(trx - bx) < 1.4 || Math.abs(tx - bx) < 1.0) {
        // kość jest nad kabiną/pakę — wystarczy przejechać pod nią (Fado ją chwyta w locie)
        this.boneTaken = true;
        this.bone.visible = false;
        ctx.audio.sfx('bone');
        this.fx.emit(this.bone.position, { count: 30, speed: 3, life: 1, size: 0.16, color: '#ffd23f' });
      }
    }

    ctx.hud.setProgress(this.x / (ROUTE + 6));
    this.fx.update(dt, ctx);
    if (this.x >= ROUTE + 6) {
      if (this.lost === 0 && this.boneTaken) this.collectGoldenBone();
      this.win({ stars: this.lost === 0 ? 3 : 2 });
    }
  }

  protected onCleanup(): void {
    this.fado.rig.dispose();
  }
}
