import * as THREE from 'three';
import type { FadoRig } from '../characters/FadoRig';
import type { CutsceneContext, ICutscene } from '../core/types';
import { box, mat, plane } from '../minigames/kit/helpers';
import { addCutsceneLights, makeBoxcar, makeFadoActor, makeKlara, makeTree, Script, type KlaraRig } from './shared';


/** Prolog: stacja jesienią, wiatr porywa żółty szalik, Fado wskakuje za nim do wagonu. */
export class Prologue implements ICutscene {
  readonly id = 'prologue' as const;

  private ctx!: CutsceneContext;
  private script = new Script();
  private fado!: FadoRig;
  private klara!: KlaraRig;
  private train!: THREE.Group;
  private door!: THREE.Mesh;
  private scarf!: THREE.Mesh;
  private leaves: THREE.Mesh[] = [];
  private focus = new THREE.Object3D();
  private t = 0;
  private finished = false;
  // stan animacji
  private scarfMode: 'held' | 'flying' | 'ride' | 'ground' = 'held';
  private scarfT = 0;
  private fadoMode: 'sit' | 'chase' | 'jump' | 'gone' | 'fall' | 'hay' = 'sit';
  private fadoT = 0;
  private trainSpeed = 0;
  private doorOpen = 1;
  private wind = 0.2;

  build(ctx: CutsceneContext): void {
    this.ctx = ctx;
    ctx.env.set('autumn');
    const light = addCutsceneLights(ctx);
    ctx.root.add(plane(80, 40, mat('#8a7a5a', { roughness: 1 }), [0, 0, 0]));
    ctx.root.add(box(80, 0.15, 0.2, mat('#555'), [0, 0.1, -2.2]), box(80, 0.15, 0.2, mat('#555'), [0, 0.1, -3.4]));
    for (let i = -30; i < 30; i += 1.2) ctx.root.add(box(0.25, 0.1, 2, mat('#4a3a2a'), [i, 0.05, -2.8]));
    // peron i wiata
    ctx.root.add(box(26, 0.35, 4, mat('#9a8f7c'), [0, 0.17, 2.6]));
    ctx.root.add(box(0.2, 3.2, 0.2, mat('#5a4636'), [-6, 1.6, 3.8]), box(0.2, 3.2, 0.2, mat('#5a4636'), [6, 1.6, 3.8]), box(13, 0.2, 3.4, mat('#7a4a3a'), [0, 3.3, 3]));
    ctx.root.add(box(2.4, 0.9, 0.6, mat('#6a4a2a'), [-3, 0.8, 4.2]));
    for (let i = 0; i < 14; i++) {
      const tr = makeTree(3 + (i % 3), ['#c8742b', '#d9a02b', '#a84a2a'][i % 3]);
      tr.position.set(-22 + i * 3.4, 0, -9 - (i % 3) * 2.5);
      ctx.root.add(tr);
    }

    this.klara = makeKlara();
    this.klara.group.position.set(-2.2, 0.35, 2.6);
    this.klara.group.rotation.y = 0.5;
    ctx.root.add(this.klara.group);

    this.fado = makeFadoActor(ctx, 1);
    this.fado.setLighting({ dir: light });
    this.fado.group.position.set(-1.2, 0.35, 3.0);
    this.fado.group.rotation.y = 0.6;
    this.fado.motion.expression = 'happy';

    const boxcar = makeBoxcar();
    this.train = boxcar.group;
    this.door = boxcar.door;
    this.train.position.set(-30, 0, -0.6);
    ctx.root.add(this.train);
    this.door.position.x = 1.8;

    this.scarf = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.26, 10, 2),
      new THREE.MeshStandardMaterial({ color: '#ffd23f', side: THREE.DoubleSide, roughness: 0.9 }),
    );
    this.scarf.castShadow = true;
    ctx.root.add(this.scarf);

    for (let i = 0; i < 40; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.16), new THREE.MeshStandardMaterial({ color: ['#d9742b', '#e0a52f', '#a8452a'][i % 3], side: THREE.DoubleSide }));
      leaf.position.set(-15 + Math.random() * 30, 0.5 + Math.random() * 5, -4 + Math.random() * 10);
      this.leaves.push(leaf);
      ctx.root.add(leaf);
    }

    ctx.root.add(this.focus);
    this.focus.position.set(-1.6, 1.3, 2.8);
    ctx.camera.setTarget(this.focus);
    ctx.camera.apply({ offset: [2.2, 0.4, 5.5], look: [0, 0, 0], fov: 42, bokeh: 1.2, duration: 0 });

    // oś czasu
    const s = this.script;
    const cap = (text: string | null) => ctx.caption(text);
    s.at(0.1, () => {
      ctx.fade(0, 1.4);
      ctx.audio.sfx('whoosh', { gain: 0.3 });
      cap('Jesienna stacja. Klara i jej beagle, Fado.');
    });
    s.at(4.0, () => {
      cap('Żółty szalik — prezent od Klary. Fado nie rozstaje się z nim ani na krok.');
      ctx.camera.shot({ offset: [-1.4, 0.2, 3.4], look: [0, 0.1, 0], fov: 38, bokeh: 1.6, duration: 3 });
    });
    s.at(8.2, () => {
      cap('Nagle zerwał się wiatr...');
      this.wind = 1;
      ctx.audio.sfx('thunder', { gain: 0.18 });
      ctx.camera.shot({ offset: [3, 0.6, 6], look: [0, 0.2, 0], fov: 46, bokeh: 0.8, duration: 1.6 });
      this.scarfMode = 'flying';
      this.scarfT = 0;
      ctx.haptics.pattern([30, 30, 60]);
    });
    s.at(9.2, () => {
      cap(null);
      this.train.position.x = -30;
      this.trainSpeed = 14;
      ctx.audio.sfx('honk', { gain: 0.5 });
      this.fadoMode = 'chase';
      this.fadoT = 0;
      this.fado.motion.expression = 'alert';
      this.klara.kneel = 0;
      ctx.camera.shot({ offset: [0, 1.5, 9], look: [3, 1.2, 0], fov: 50, bokeh: 0.6, duration: 1.2 });
      this.focus.position.set(2, 1.2, 1);
    });
    s.at(11.0, () => {
      cap('Szalik poleciał prosto na przejeżdżający pociąg towarowy!');
      this.scarfMode = 'ride';
    });
    s.at(12.6, () => {
      this.fadoMode = 'jump';
      this.fadoT = 0;
      this.fado.motion.expression = 'run';
      ctx.audio.sfx('jump');
      ctx.haptics.impact('medium');
      ctx.camera.punchFov(6, 0.5);
    });
    s.at(14.2, () => {
      this.fadoMode = 'gone';
      this.doorOpen = 0;
      cap('Fado skoczył. Drzwi wagonu zatrzasnęły się za nim.');
      ctx.audio.sfx('crate', { gain: 0.8 });
      ctx.haptics.impact('heavy');
      ctx.camera.shake(0.4, 0.4);
    });
    s.at(17.5, () => {
      this.trainSpeed = 22;
      cap('Klara została sama na pustym peronie.');
      this.klara.group.rotation.y = -1.2;
      ctx.camera.shot({ offset: [-3, 0.4, 5.5], look: [2, 0.8, 0], fov: 36, bokeh: 1.8, duration: 3.2 });
      this.focus.position.set(-1.2, 1.3, 2.8);
      this.klara.group.position.set(-1.8, 0.35, 2.6);
    });
    s.at(21.2, () => {
      ctx.fade(1, 1.2);
    });
    s.at(22.6, () => {
      cap('Kilkadziesiąt kilometrów dalej…');
      ctx.audio.sfx('thud', { gain: 0.5 });
    });
    s.at(25, () => this.setupFarm());
    s.at(25.2, () => {
      ctx.fade(0, 1.2);
      cap('Fado ocknął się na stogu siana — z szalikiem w pysku. Czas wracać do domu.');
      ctx.audio.sfx('sparkle', { gain: 0.5 });
    });
    s.at(31.5, () => {
      ctx.fade(1, 1);
    });
    s.at(33, () => this.end());
  }

  /** Zmiana dekoracji na wiejską łąkę ze stogiem. */
  private setupFarm(): void {
    const ctx = this.ctx;
    this.train.visible = false;
    this.klara.group.visible = false;
    ctx.env.set('dawn');
    this.fadoMode = 'hay';
    this.fadoT = 0;
    this.scarfMode = 'ground';
    const hay = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 10), mat('#d9b95a'));
    hay.scale.set(1.5, 0.7, 1.2);
    hay.position.set(30, 0.7, 0);
    hay.castShadow = true;
    ctx.root.add(hay);
    for (let i = 0; i < 6; i++) {
      const b = makeTree(3, '#6a8a3a');
      b.position.set(24 + i * 2, 0, -6 - (i % 2) * 2);
      ctx.root.add(b);
    }
    ctx.root.add(plane(40, 30, mat('#7b9a4a', { roughness: 1 }), [30, 0.01, 0]));
    this.focus.position.set(30, 1.1, 0);
    ctx.camera.apply({ offset: [2.6, 0.9, 5], look: [0, 0, 0], fov: 38, bokeh: 1.4, duration: 0 });
    ctx.camera.shot({ offset: [-1.6, 0.5, 4], look: [0, 0.2, 0], fov: 34, bokeh: 1.8, duration: 6 });
  }

  play(): void {
    this.ctx.audio.music('cutscene');
  }

  update(dt: number): void {
    if (this.finished) return;
    this.t += dt;
    this.script.advance(dt);
    this.animate(dt);
  }

  private animate(dt: number): void {
    const t = this.t;
    const m = this.fado.motion;

    // liście niesione wiatrem
    for (let i = 0; i < this.leaves.length; i++) {
      const l = this.leaves[i];
      l.position.x += (0.8 + this.wind * 5) * dt * (0.5 + (i % 5) * 0.2);
      l.position.y += Math.sin(t * 2 + i) * dt * 0.6;
      if (l.position.x > 22) l.position.x = -15;
      l.rotation.set(t * 2 + i, t * 3 + i * 0.5, 0);
    }
    if (this.wind > 0.2) this.wind = Math.max(0.2, this.wind - dt * 0.05);

    // pociąg
    if (this.trainSpeed > 0) {
      this.train.position.x += this.trainSpeed * dt;
      if (this.train.position.x > 5 && this.trainSpeed === 14) this.trainSpeed = 8;
    }
    this.door.position.x = THREE.MathUtils.damp(this.door.position.x, this.doorOpen ? 1.8 : 0, 6, dt);

    // Klara
    if (this.t > 9) this.klara.kneel = THREE.MathUtils.damp(this.klara.kneel, this.t > 17 ? 0.7 : 0, 3, dt);
    this.klara.update(t);

    // Fado
    this.fadoT += dt;
    const fg = this.fado.group;
    switch (this.fadoMode) {
      case 'chase': {
        fg.position.x += 6 * dt;
        fg.position.z = THREE.MathUtils.damp(fg.position.z, 1.4, 4, dt);
        fg.rotation.y = Math.PI / 2;
        m.speed = 1;
        this.focus.position.x = THREE.MathUtils.damp(this.focus.position.x, fg.position.x + 1, 3, dt);
        break;
      }
      case 'jump': {
        const k = Math.min(1, this.fadoT / 1.4);
        const tx = this.train.position.x + 0.5;
        fg.position.x = THREE.MathUtils.lerp(fg.position.x, tx, 0.12);
        fg.position.z = THREE.MathUtils.lerp(1.4, -0.3, k);
        fg.position.y = 0.35 + Math.sin(k * Math.PI) * 1.6 + k * 1.1;
        m.speed = 0.4;
        this.focus.position.lerp(fg.position, 0.08);
        if (k >= 1) this.fadoMode = 'gone';
        break;
      }
      case 'gone':
        fg.visible = false;
        break;
      case 'hay': {
        fg.visible = true;
        m.speed = 0;
        const k = Math.min(1, this.fadoT / 0.9);
        fg.position.set(30 + 2.4 - k * 2.4, 1.4 - 0.5 * k + (1 - k) * 4 * (1 - k), 0.4);
        fg.rotation.set(0, 0.8, (1 - k) * 0.7);
        m.expression = this.fadoT > 3 ? 'happy' : 'scared';
        break;
      }
      default:
        m.speed = 0;
        fg.rotation.y = 0.6 + Math.sin(t * 0.5) * 0.1;
        break;
    }
    if (this.fadoMode === 'sit' && this.t > 9 && this.t < 9.3) m.expression = 'alert';
    this.fado.update(dt, t);

    // szalik
    this.animateScarf(dt, t);
  }

  private animateScarf(dt: number, t: number): void {
    const s = this.scarf;
    const pos = s.position;
    switch (this.scarfMode) {
      case 'held':
        pos.set(-1.9, 1.15 + Math.sin(t * 2) * 0.03, 2.95);
        s.rotation.set(0, 0.5, Math.sin(t * 2) * 0.1);
        break;
      case 'flying': {
        this.scarfT += dt;
        const k = this.scarfT;
        pos.set(-1.9 + k * 3.2, 1.2 + k * 1.2 + Math.sin(k * 6) * 0.2, 2.95 - k * 1.2);
        s.rotation.set(k * 3, 0.5 + k * 2, Math.sin(k * 9) * 0.6);
        if (k > 1.9) this.scarfMode = 'ride';
        break;
      }
      case 'ride':
        pos.set(this.train.position.x - 1.6, 3.9 + Math.sin(t * 8) * 0.12, -0.5);
        s.rotation.set(Math.sin(t * 9) * 0.4, 0.2, Math.sin(t * 12) * 0.5);
        break;
      case 'ground':
        s.visible = false;
        break;
    }
    this.flutter(s, t);
  }

  private flutter(s: THREE.Mesh, t: number): void {
    const attr = s.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) {
      const x = attr.getX(i);
      attr.setZ(i, Math.sin(t * 10 + x * 5) * 0.06 * (0.4 + this.wind));
    }
    attr.needsUpdate = true;
  }

  private end(): void {
    if (this.finished) return;
    this.finished = true;
    this.ctx.finish();
  }

  skip(): void {
    this.finished = true;
    this.ctx.fade(0, 0);
  }

  cleanup(): void {
    this.fado?.dispose();
    this.ctx?.camera.setTarget(null);
  }
}
