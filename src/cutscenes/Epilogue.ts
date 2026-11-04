import * as THREE from 'three';
import type { FadoRig } from '../characters/FadoRig';
import type { CutsceneContext, ICutscene } from '../core/types';
import { box, cone, cyl, mat, plane, sphere } from '../minigames/kit/helpers';
import { addCutsceneLights, makeFadoActor, makeKlara, makeTree, Script, type KlaraRig } from './shared';

/** Epilog: Fado wraca na wzgórze, szczeka, Klara upuszcza plakaty i rzuca się do biegu. */
export class Epilogue implements ICutscene {
  readonly id = 'epilogue' as const;

  private ctx!: CutsceneContext;
  private script = new Script();
  private fado!: FadoRig;
  private klara!: KlaraRig;
  private focus = new THREE.Object3D();
  private posters: THREE.Mesh[] = [];
  private fallen: boolean[] = [];
  private blades = new THREE.Group();
  private petals: THREE.Mesh[] = [];
  private t = 0;
  private finished = false;
  private fadoMode: 'walk' | 'bark' | 'leap' | 'hug' = 'walk';
  private fadoT = 0;
  private klaraMode: 'search' | 'turn' | 'kneel' | 'hug' = 'search';
  private klaraT = 0;

  private readonly start = new THREE.Vector3(-14, 4.2, 2);
  private readonly crest = new THREE.Vector3(-3.6, 5.3, 2);
  private readonly klaraPos = new THREE.Vector3(5, 5.4, 2);

  build(ctx: CutsceneContext): void {
    this.ctx = ctx;
    ctx.env.set('dawn');
    const light = addCutsceneLights(ctx, '#ffcf99', 3.4, '#fff0d6', '#8aa65a');
    // wzgórze: dwie pochylnie
    const up = box(20, 1, 12, mat('#7bb04e', { roughness: 1 }), [-9, 2.2, 2]);
    up.rotation.z = 0.22;
    const down = box(20, 1, 12, mat('#6fa845', { roughness: 1 }), [10, 2.7, 2]);
    down.rotation.z = -0.03;
    ctx.root.add(up, down, plane(160, 100, mat('#5f9340', { roughness: 1 }), [0, -0.5, -10]));
    // wiatrak i płot
    const mill = new THREE.Group();
    mill.add(cone(1.8, 6, mat('#d9c7a6'), [0, 3, 0], 12), cyl(1.5, 1.8, 0.3, mat('#8a6a42'), [0, 0.15, 0], 12));
    this.blades = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.add(box(0.35, 4.6, 0.08, mat('#f1e6d0'), [0, 2.4, 0]));
      arm.rotation.z = (i * Math.PI) / 2;
      this.blades.add(arm);
    }
    this.blades.position.set(0, 5.6, 1.3);
    mill.add(this.blades);
    mill.position.set(14, 2.6, -6);
    ctx.root.add(mill);
    for (let i = 0; i < 10; i++) {
      const tr = makeTree(3.5 + (i % 3), ['#6a9a3a', '#e0a52f', '#c8742b'][i % 3]);
      tr.position.set(-20 + i * 5, 0, -14 - (i % 2) * 3);
      ctx.root.add(tr);
    }
    const flowers = ['#ff6b9d', '#ffd23f', '#ffffff', '#a29bfe'];
    for (let i = 0; i < 70; i++) {
      const f = sphere(0.1, mat(flowers[i % 4]), [-16 + Math.random() * 32, 0, -3 + Math.random() * 10], 6);
      f.position.y = f.position.x < -2 ? 3.1 + (f.position.x + 16) * 0.22 : 3.2;
      f.castShadow = false;
      ctx.root.add(f);
    }

    this.klara = makeKlara();
    this.klara.group.position.copy(this.klaraPos);
    this.klara.group.rotation.y = -1.2;
    ctx.root.add(this.klara.group);
    // plakaty „zaginął pies” w ręku Klary
    for (let i = 0; i < 5; i++) {
      const p = box(0.32, 0.42, 0.015, mat('#fffaf0'), [this.klaraPos.x - 0.45, this.klaraPos.y + 1.05 + i * 0.01, this.klaraPos.z + 0.1]);
      p.rotation.z = (i - 2) * 0.08;
      this.posters.push(p);
      this.fallen.push(false);
      ctx.root.add(p);
    }

    this.fado = makeFadoActor(ctx, 1);
    this.fado.setLighting({ dir: light });
    // epilog zaczyna się z szalikiem w pysku — kula szalika dołączona do pyska
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.05, 8, 14), new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.9 }));
    scarf.rotation.x = Math.PI / 2;
    this.fado.mouthAnchor.add(scarf);
    this.fado.group.add(this.fado.mouthAnchor);
    this.fado.group.position.copy(this.start);
    this.fado.group.rotation.y = Math.PI / 2;
    this.fado.motion.expression = 'run';

    ctx.root.add(this.focus);
    this.focus.position.copy(this.start).add(new THREE.Vector3(0, 0.8, 0));
    ctx.camera.setTarget(this.focus);
    ctx.camera.apply({ offset: [3, 0.6, 7], look: [3, 0.4, 0], fov: 40, bokeh: 1.1, duration: 0 });

    for (let i = 0; i < 30; i++) {
      const petal = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), new THREE.MeshStandardMaterial({ color: '#ffd9a8', side: THREE.DoubleSide }));
      petal.position.set(-10 + Math.random() * 25, 4 + Math.random() * 4, -1 + Math.random() * 6);
      this.petals.push(petal);
      ctx.root.add(petal);
    }

    const s = this.script;
    s.at(0.1, () => {
      ctx.fade(0, 1.4);
      ctx.caption('Długa droga dobiegła końca…');
      ctx.audio.sfx('whoosh', { gain: 0.25 });
    });
    s.at(4.5, () => {
      ctx.caption('Fado, z odzyskanym szalikiem w pysku, wspina się na ostatnie wzgórze.');
      ctx.camera.shot({ offset: [1.5, 0.3, 5.2], look: [2, 0.4, 0], fov: 36, bokeh: 1.5, duration: 4 });
    });
    s.at(9.5, () => {
      this.fadoMode = 'bark';
      this.fadoT = 0;
      ctx.caption(null);
      ctx.audio.sfx('bark', { gain: 1 });
      ctx.haptics.impact('heavy');
      ctx.camera.punchFov(5, 0.4);
    });
    s.at(11.2, () => {
      this.klaraMode = 'turn';
      this.klaraT = 0;
      ctx.audio.sfx('bark', { gain: 0.9 });
      ctx.camera.shot({ offset: [0, 1.2, 9.5], look: [0, 0.8, 0], fov: 46, bokeh: 0.6, duration: 1.6 });
      this.focus.position.set(0.8, 5.4, 2);
    });
    s.at(12.4, () => {
      this.klaraMode = 'kneel';
      this.klaraT = 0;
      ctx.caption('„Fado?!”');
      ctx.audio.sfx('sparkle', { gain: 0.6 });
      this.posters.forEach((_, i) => (this.fallen[i] = true));
    });
    s.at(14.6, () => {
      this.fadoMode = 'leap';
      this.fadoT = 0;
      this.fado.motion.expression = 'happy';
      ctx.caption(null);
      ctx.audio.sfx('jump');
      ctx.camera.shot({ offset: [-1, 0.8, 5.5], look: [0, 0.6, 0], fov: 38, bokeh: 1.4, duration: 2.6 });
    });
    s.at(16.4, () => {
      this.fadoMode = 'hug';
      this.klaraMode = 'hug';
      ctx.audio.sfx('win');
      ctx.audio.sfx('bell', { gain: 0.5 });
      ctx.haptics.pattern([40, 30, 80, 30, 120]);
      ctx.caption('Fado jest w domu.');
    });
    s.at(21, () => {
      ctx.fade(1, 1.4);
    });
    s.at(22.6, () => this.end());
  }

  play(): void {
    this.ctx.audio.music('finale');
    this.ctx.audio.setMusicIntensity(0.5);
  }

  update(dt: number): void {
    if (this.finished) return;
    this.t += dt;
    this.script.advance(dt);
    this.animate(dt);
  }

  private animate(dt: number): void {
    const t = this.t;
    const fg = this.fado.group;
    const m = this.fado.motion;
    this.fadoT += dt;
    this.klaraT += dt;
    this.blades.rotation.z -= dt * 0.9;

    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      p.position.x += dt * (0.6 + (i % 4) * 0.2);
      p.position.y -= dt * 0.2;
      if (p.position.x > 16) p.position.x = -10;
      if (p.position.y < 3) p.position.y = 7;
      p.rotation.set(t * 2 + i, t * 2.4, 0);
    }

    // Fado
    switch (this.fadoMode) {
      case 'walk': {
        const k = Math.min(1, this.t / 9.5);
        const e = k * k * (3 - 2 * k);
        fg.position.lerpVectors(this.start, this.crest, e);
        fg.rotation.y = Math.PI / 2;
        m.speed = 0.55 * (1 - e * 0.6);
        m.expression = 'run';
        this.focus.position.lerp(new THREE.Vector3(fg.position.x + 1.5, fg.position.y + 0.8, fg.position.z), 0.06);
        break;
      }
      case 'bark':
        m.speed = 0;
        m.expression = 'alert';
        fg.position.y = this.crest.y + Math.max(0, Math.sin(this.fadoT * 14)) * 0.12;
        break;
      case 'leap': {
        const k = Math.min(1, this.fadoT / 1.8);
        m.speed = 1;
        fg.position.x = THREE.MathUtils.lerp(this.crest.x, this.klaraPos.x - 0.55, k);
        fg.position.y = THREE.MathUtils.lerp(this.crest.y, this.klaraPos.y, k) + Math.sin(k * Math.PI) * (k > 0.8 ? 0.2 : 0.1);
        if (k > 0.85) fg.position.y += Math.sin(((k - 0.85) / 0.15) * Math.PI) * 0.9;
        break;
      }
      case 'hug':
        m.speed = 0;
        m.expression = 'happy';
        fg.position.set(this.klaraPos.x - 0.35, this.klaraPos.y + 0.7, this.klaraPos.z + 0.25);
        fg.rotation.set(0.5, Math.PI / 2 + Math.sin(t * 6) * 0.15, 0);
        break;
    }
    this.fado.update(dt, t);

    // Klara
    const kg = this.klara.group;
    switch (this.klaraMode) {
      case 'search':
        kg.rotation.y = -1.2 + Math.sin(t * 0.7) * 0.25;
        this.klara.kneel = 0;
        break;
      case 'turn':
        kg.rotation.y = THREE.MathUtils.damp(kg.rotation.y, -Math.PI / 2 - 0.1, 6, dt);
        break;
      case 'kneel':
        this.klara.kneel = THREE.MathUtils.damp(this.klara.kneel, 1, 4, dt);
        break;
      case 'hug':
        this.klara.kneel = 1;
        break;
    }
    this.klara.update(t);

    // plakaty opadają
    this.posters.forEach((p, i) => {
      if (!this.fallen[i]) return;
      p.position.y = Math.max(this.klaraPos.y + 0.03, p.position.y - dt * (1.2 + i * 0.1));
      p.position.x += Math.sin(t * 3 + i) * dt * 0.3;
      p.rotation.x = THREE.MathUtils.damp(p.rotation.x, -Math.PI / 2, 3, dt);
    });
  }

  private end(): void {
    if (this.finished) return;
    this.finished = true;
    this.ctx.finish();
  }

  skip(): void {
    this.finished = true;
  }

  cleanup(): void {
    this.fado?.dispose();
    this.ctx?.camera.setTarget(null);
  }
}
