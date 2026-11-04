import * as THREE from 'three';
import { FadoRig } from '../characters/FadoRig';
import type { CutsceneContext } from '../core/types';
import { box, cone, cyl, mat, sphere } from '../minigames/kit/helpers';

/** Prosta oś czasu: zdarzenia jednorazowe odpalane w kolejności, gdy zegar je minie. */
export class Script {
  private readonly steps: { at: number; run: () => void }[] = [];
  private index = 0;
  time = 0;

  at(time: number, run: () => void): this {
    this.steps.push({ at: time, run });
    this.steps.sort((a, b) => a.at - b.at);
    return this;
  }

  advance(dt: number): void {
    this.time += dt;
    while (this.index < this.steps.length && this.steps[this.index].at <= this.time) this.steps[this.index++].run();
  }

  get done(): boolean {
    return this.index >= this.steps.length;
  }

  /** Odpala wszystkie pozostałe kroki od razu (używane przy pominięciu). */
  flush(): void {
    while (this.index < this.steps.length) this.steps[this.index++].run();
  }
}

export interface KlaraRig {
  group: THREE.Group;
  arms: THREE.Mesh[];
  /** 0 = stoi, 1 = klęczy */
  kneel: number;
  update(t: number): void;
}

/** Klara — stylizowana postać dziewczynki w czerwonym płaszczu, zbudowana z prymitywów. */
export function makeKlara(): KlaraRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const skin = mat('#e8b995');
  const coat = mat('#d94a4a');
  const hair = mat('#4a2f22');
  const torso = cyl(0.26, 0.34, 0.8, coat, [0, 0.95, 0], 12);
  const head = sphere(0.27, skin, [0, 1.62, 0], 14);
  const hairCap = sphere(0.3, hair, [0, 1.68, -0.05], 14);
  hairCap.scale.set(1, 0.95, 1);
  const eyeL = sphere(0.03, mat('#222'), [-0.09, 1.64, 0.24], 6);
  const eyeR = sphere(0.03, mat('#222'), [0.09, 1.64, 0.24], 6);
  const legL = cyl(0.09, 0.09, 0.6, mat('#3a4a7a'), [-0.12, 0.3, 0], 8);
  const legR = cyl(0.09, 0.09, 0.6, mat('#3a4a7a'), [0.12, 0.3, 0], 8);
  const braidL = cyl(0.05, 0.03, 0.5, hair, [-0.26, 1.42, -0.05], 6);
  const braidR = cyl(0.05, 0.03, 0.5, hair, [0.26, 1.42, -0.05], 6);
  const armL = cyl(0.065, 0.065, 0.62, coat, [-0.38, 1.1, 0], 8);
  const armR = cyl(0.065, 0.065, 0.62, coat, [0.38, 1.1, 0], 8);
  body.add(torso, head, hairCap, eyeL, eyeR, legL, legR, braidL, braidR, armL, armR);
  group.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : undefined));

  const rig: KlaraRig = {
    group,
    arms: [armL, armR],
    kneel: 0,
    update(t: number) {
      const k = rig.kneel;
      body.position.y = -0.38 * k;
      body.rotation.x = 0.25 * k;
      legL.rotation.x = legR.rotation.x = -1.1 * k;
      legL.position.set(-0.12, 0.3 - 0.1 * k, 0.15 * k);
      legR.position.set(0.12, 0.3 - 0.1 * k, 0.15 * k);
      const sway = Math.sin(t * 1.6) * 0.04;
      armL.rotation.z = 0.15 + sway - 1.2 * k;
      armR.rotation.z = -0.15 - sway + 1.2 * k;
      armL.rotation.x = armR.rotation.x = -1.3 * k;
      braidL.rotation.z = sway * 2;
      braidR.rotation.z = -sway * 2;
    },
  };
  return rig;
}

/** Lokomotywa-towarowy wagon: wagon z otwartymi drzwiami do wskoczenia. */
export function makeBoxcar(): { group: THREE.Group; door: THREE.Mesh } {
  const group = new THREE.Group();
  const red = mat('#8a3a2a');
  group.add(box(7, 3, 2.6, red, [0, 2.1, 0]));
  group.add(box(7.2, 0.25, 2.8, mat('#3a3a3a'), [0, 0.55, 0]));
  group.add(box(7.4, 0.2, 3, mat('#5a4a3a'), [0, 3.7, 0]));
  for (const x of [-2.4, 2.4]) for (const z of [-1.3, 1.3]) group.add(cyl(0.5, 0.5, 0.2, mat('#222'), [x, 0.5, z], 14));
  group.children.slice(-4).forEach((w) => (w.rotation.x = Math.PI / 2));
  const door = box(2.4, 2.6, 0.12, mat('#6e2e20'), [0, 2.0, 1.34]);
  group.add(door);
  const hay = box(6.4, 0.5, 2.2, mat('#d9b95a'), [0, 0.95, 0]);
  group.add(hay);
  return { group, door };
}

export function makeTree(h: number, color = '#c8742b'): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.15, 0.22, h * 0.45, mat('#5a3d28'), [0, h * 0.22, 0], 6));
  g.add(cone(h * 0.32, h * 0.7, mat(color), [0, h * 0.7, 0], 8));
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : undefined));
  return g;
}

export function makeFadoActor(ctx: CutsceneContext, scale = 1): FadoRig {
  const rig = new FadoRig({ quality: ctx.quality, accessory: ctx.accessory, scale, carryScarf: false });
  ctx.root.add(rig.group);
  rig.attachScarfTo(ctx.root);
  return rig;
}

export function addCutsceneLights(ctx: CutsceneContext, sun = '#ffd0a0', intensity = 3, sky = '#ffe4c8', ground = '#6a5238'): THREE.Vector3 {
  const hemi = new THREE.HemisphereLight(sky, ground, 0.9);
  const dir = new THREE.DirectionalLight(sun, intensity);
  dir.position.set(-10, 14, 8);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  const c = dir.shadow.camera;
  c.left = -18;
  c.right = 18;
  c.top = 18;
  c.bottom = -18;
  ctx.root.add(hemi, dir, dir.target);
  return dir.position.clone().normalize();
}
