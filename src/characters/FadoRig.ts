import * as THREE from 'three';
import { disposeObject3D } from '../core/dispose';
import type { AccessoryId, QualityTier } from '../core/types';
import { sampleWind } from '../environment/wind';
import { PROFILES } from '../render/quality';
import { createFurPart, createFurShared, type FurPalette, type FurShared } from './furShader';
import { ScarfRig } from './ScarfRig';
import { createEarState, stepEarChain, type EarState } from './SpringChain';

export type FadoExpression = 'idle' | 'sniff' | 'run' | 'happy' | 'scared' | 'alert';

/** Mutowalny stan sterujący animacją (bez re-renderów Reacta). */
export interface FadoMotion {
  /** 0..1, prędkość biegu */
  speed: number;
  expression: FadoExpression;
  /** 0..1, otrząsanie się całym ciałem */
  shake: number;
}

export function createFadoMotion(): FadoMotion {
  return { speed: 0, expression: 'idle', shake: 0 };
}

interface Pose {
  earLift: number;
  tailRate: number;
  tailAmp: number;
  brow: number;
  browTilt: number;
  eyeOpen: number;
  headPitch: number;
  tongue: number;
  nose: number;
  tuck: number;
}

const POSES: Record<FadoExpression, Pose> = {
  idle: { earLift: 0, tailRate: 5, tailAmp: 0.25, brow: 0, browTilt: 0, eyeOpen: 1, headPitch: 0, tongue: 0, nose: 0.2, tuck: 0 },
  sniff: { earLift: 0.15, tailRate: 4, tailAmp: 0.15, brow: 0.2, browTilt: 0, eyeOpen: 0.85, headPitch: 0.45, tongue: 0, nose: 1, tuck: 0 },
  run: { earLift: 0.05, tailRate: 9, tailAmp: 0.4, brow: 0.1, browTilt: 0, eyeOpen: 1, headPitch: -0.1, tongue: 0.6, nose: 0.3, tuck: 0 },
  happy: { earLift: 0.35, tailRate: 16, tailAmp: 0.7, brow: 0.35, browTilt: -0.1, eyeOpen: 0.9, headPitch: -0.15, tongue: 1, nose: 0.2, tuck: 0 },
  scared: { earLift: -0.2, tailRate: 3, tailAmp: 0.08, brow: 0.5, browTilt: 0.45, eyeOpen: 1.25, headPitch: 0.1, tongue: 0, nose: 0.1, tuck: 1 },
  alert: { earLift: 0.5, tailRate: 2, tailAmp: 0.05, brow: 0.45, browTilt: -0.15, eyeOpen: 1.15, headPitch: -0.05, tongue: 0, nose: 0.5, tuck: 0 },
};

const POSE_KEYS = Object.keys(POSES.idle) as (keyof Pose)[];

const EAR_SEGMENTS = [
  { len: 0.07, w: 0.034, d: 0.08 },
  { len: 0.07, w: 0.031, d: 0.08 },
  { len: 0.07, w: 0.026, d: 0.07 },
] as const;

export interface FadoRigOptions {
  quality?: QualityTier;
  accessory?: AccessoryId | null;
  /** skala całego psa (1 = ok. 0,8 m wysokości) */
  scale?: number;
  carryScarf?: boolean;
  palette?: Partial<FurPalette>;
  motion?: FadoMotion;
}

function standard(color: THREE.ColorRepresentation, roughness = 0.85, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, pos?: [number, number, number], scale?: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  if (pos) m.position.set(...pos);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  return m;
}

/**
 * Proceduralny beagle Fado jako czysty obiekt Three (bez Reacta), dzięki czemu
 * ten sam model działa w eksploracji, minigrach i cutscenkach.
 * Zawiera: futro (shell fur), fizykę uszu, ogon, mruganie, mimikę, obrożę, akcesoria
 * oraz szalik w pysku (ScarfRig, dodawany osobno do korzenia sceny).
 */
export class FadoRig {
  readonly group = new THREE.Group();
  readonly motion: FadoMotion;
  /** dodatkowe spojrzenie głowy (rad): pitch w dół+, yaw w bok, roll przechył */
  readonly look = { pitch: 0, yaw: 0, roll: 0 };
  /** nadpisuje uniesienie uszu z wyrazu pyszczka (np. mini-gra „Bistro”) */
  earLiftOverride: number | null = null;
  readonly scarf: ScarfRig | null;
  readonly shared: FurShared;
  /** punkt w pysku, w którym trzymany jest szalik */
  readonly mouthAnchor = new THREE.Object3D();

  private readonly body = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly nose: THREE.Mesh;
  private readonly tongue: THREE.Mesh;
  private readonly eyes: THREE.Group[] = [];
  private readonly brows: THREE.Mesh[] = [];
  private readonly legs: THREE.Group[] = [];
  private readonly tail: THREE.Group[] = [];
  private readonly ears: THREE.Group[][] = [[], []];
  private readonly furMaterials: THREE.ShaderMaterial[] = [];

  private readonly pose: Pose = { ...POSES.idle };
  private readonly earState: [EarState, EarState] = [createEarState(3), createEarState(3)];
  private gait = 0;
  private sprint = 0;
  private blinkIn = 2.5;
  private blink = 0;

  private initialised = false;
  private readonly prevHead = new THREE.Vector3();
  private readonly prevVel = new THREE.Vector3();
  private readonly headPos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly rawAcc = new THREE.Vector3();
  private readonly acc = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly localAcc = new THREE.Vector3();
  private readonly localWind = new THREE.Vector3();
  private readonly worldWind = new THREE.Vector3();
  private readonly down = new THREE.Vector3();
  private readonly anchorWorld = new THREE.Vector3();

  constructor(options: FadoRigOptions = {}) {
    const quality = options.quality ?? 'medium';
    const scale = options.scale ?? 1.6;
    const accessory = options.accessory ?? null;
    this.motion = options.motion ?? createFadoMotion();
    this.shared = createFurShared(options.palette);
    this.group.name = 'Fado';
    this.group.scale.setScalar(scale);

    const furLayers = PROFILES[quality].furLayers;
    const earLayers = Math.max(2, Math.round(furLayers / 2));
    const fm = this.furMaterials;
    const shared = this.shared;

    this.group.add(this.body);

    // tułów i szyja
    this.torso.add(createFurPart({ part: 'torso', shared, layers: furLayers, position: [0, 0.36, 0], scale: [0.2, 0.19, 0.34] }, fm));
    this.body.add(this.torso);
    this.body.add(createFurPart({ part: 'head', shared, layers: Math.max(2, furLayers - 3), position: [0, 0.48, 0.26], scale: [0.14, 0.15, 0.16] }, fm));

    // głowa
    this.head.position.set(0, 0.56, 0.36);
    this.head.add(createFurPart({ part: 'head', shared, layers: furLayers, length: 0.06, scale: [0.17, 0.155, 0.18] }, fm));
    this.head.add(createFurPart({ part: 'muzzle', shared, layers: Math.max(2, furLayers - 2), length: 0.04, position: [0, -0.05, 0.14], scale: [0.085, 0.075, 0.12] }, fm));

    this.nose = mesh(
      new THREE.SphereGeometry(0.038, 20, 16),
      new THREE.MeshPhysicalMaterial({ color: '#120d0b', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
      [0, -0.025, 0.265],
    );
    this.head.add(this.nose);

    this.tongue = mesh(new THREE.SphereGeometry(0.03, 12, 10), standard('#e86a7a', 0.5), [0, -0.095, 0.2]);
    this.tongue.rotation.x = 0.3;
    this.tongue.visible = false;
    this.head.add(this.tongue);

    const eyeGeo = new THREE.SphereGeometry(0.04, 20, 16);
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: '#1a100c', roughness: 0.1, clearcoat: 1 });
    const glintGeo = new THREE.SphereGeometry(0.011, 10, 8);
    const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const browGeo = new THREE.SphereGeometry(0.022, 10, 8);
    const browMat = standard('#6e3a1a', 0.9);
    ([1, -1] as const).forEach((side) => {
      const eye = new THREE.Group();
      eye.position.set(side * 0.075, 0.035, 0.145);
      eye.add(new THREE.Mesh(eyeGeo, eyeMat));
      const glint = new THREE.Mesh(glintGeo, glintMat);
      glint.position.set(0.012 * side, 0.014, 0.034);
      eye.add(glint);
      this.head.add(eye);
      this.eyes.push(eye);

      const brow = mesh(browGeo, browMat, [side * 0.075, 0.095, 0.15], [1.6, 0.6, 0.8]);
      this.head.add(brow);
      this.brows.push(brow);
    });

    // uszy: trzy zagnieżdżone segmenty na stronę
    ([1, -1] as const).forEach((side, ei) => {
      const base = new THREE.Group();
      base.position.set(side * 0.15, 0.08, 0);
      let parent: THREE.Object3D = base;
      EAR_SEGMENTS.forEach((seg, si) => {
        const g = new THREE.Group();
        if (si > 0) g.position.set(0, -EAR_SEGMENTS[si - 1].len, 0);
        g.add(
          createFurPart(
            { part: 'ear', shared, layers: earLayers, length: 0.05, density: 60, droop: 0.004, position: [0, -seg.len / 2, 0], scale: [seg.w, seg.len / 2 + 0.01, seg.d], segments: [14, 10] },
            fm,
          ),
        );
        parent.add(g);
        this.ears[ei].push(g);
        parent = g;
      });
      this.head.add(base);
    });

    this.mouthAnchor.position.set(0, -0.085, 0.24);
    this.head.add(this.mouthAnchor);

    const hat = this.buildHeadAccessory(accessory);
    if (hat) this.head.add(hat);
    this.body.add(this.head);

    // obroża (niebieska) z blaszką
    const collar = new THREE.Group();
    collar.position.set(0, 0.5, 0.27);
    collar.rotation.x = -0.8;
    collar.add(mesh(new THREE.TorusGeometry(0.12, 0.022, 14, 36), new THREE.MeshPhysicalMaterial({ color: '#2f6bff', roughness: 0.35, clearcoat: 0.6 })));
    const tag = mesh(new THREE.SphereGeometry(0.03, 14, 10), standard('#e8b93c', 0.25, { metalness: 0.9 }), [0, -0.125, 0], [1, 1, 0.4]);
    tag.rotation.x = Math.PI / 2;
    collar.add(tag);
    if (accessory === 'red-bandana') collar.add(this.buildBandana());
    this.body.add(collar);

    // nogi
    const pawGeo = new THREE.SphereGeometry(0.052, 14, 10);
    const pawMat = standard('#f4ede2', 0.85);
    const hips: [number, number, number][] = [
      [0.1, 0.3, 0.2],
      [-0.1, 0.3, 0.2],
      [0.1, 0.3, -0.2],
      [-0.1, 0.3, -0.2],
    ];
    hips.forEach((hip) => {
      const leg = new THREE.Group();
      leg.position.set(...hip);
      leg.add(createFurPart({ part: 'leg', shared, layers: Math.max(2, furLayers - 4), length: 0.05, position: [0, -0.14, 0], scale: [0.05, 0.15, 0.05] }, fm));
      leg.add(mesh(pawGeo, pawMat, [0, -0.29, 0.02], [1, 0.7, 1.3]));
      this.body.add(leg);
      this.legs.push(leg);
    });

    // ogon
    const tailBase = new THREE.Group();
    tailBase.position.set(0, 0.43, -0.34);
    const tail0 = new THREE.Group();
    tail0.rotation.x = -0.9;
    tail0.add(createFurPart({ part: 'tail', shared, layers: Math.max(2, furLayers - 4), length: 0.06, position: [0, 0.11, 0], scale: [0.03, 0.11, 0.03] }, fm));
    const tail1 = new THREE.Group();
    tail1.position.set(0, 0.22, 0);
    tail1.add(createFurPart({ part: 'tail', shared, layers: Math.max(2, furLayers - 4), length: 0.06, position: [0, 0.1, 0], scale: [0.028, 0.1, 0.028] }, fm));
    tail0.add(tail1);
    tailBase.add(tail0);
    this.body.add(tailBase);
    this.tail.push(tail0, tail1);

    this.scarf = options.carryScarf === false ? null : new ScarfRig(scale);
  }

  /* ------------------------------ akcesoria ------------------------------ */

  private buildBandana(): THREE.Group {
    const g = new THREE.Group();
    const cloth = standard('#d62839', 0.7);
    g.add(mesh(new THREE.TorusGeometry(0.135, 0.03, 12, 32), cloth));
    const drape = mesh(new THREE.ConeGeometry(0.085, 0.14, 3), standard('#d62839', 0.7, { side: THREE.DoubleSide }), [0, -0.12, 0.03], [1, 1, 0.25]);
    drape.rotation.x = Math.PI;
    g.add(drape);
    return g;
  }

  private buildHeadAccessory(id: AccessoryId | null): THREE.Group | null {
    if (id === 'sherlock-hat') {
      const g = new THREE.Group();
      g.position.set(0, 0.1, -0.02);
      const tweed = standard('#8b7355', 0.9);
      const dark = standard('#6e5a40', 0.9);
      g.add(mesh(new THREE.SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), tweed, undefined, [1, 0.8, 1.1]));
      g.add(mesh(new THREE.SphereGeometry(0.1, 14, 8), dark, [0, 0, 0.13], [1, 0.18, 0.7]));
      g.add(mesh(new THREE.SphereGeometry(0.1, 14, 8), dark, [0, 0, -0.13], [1, 0.18, 0.7]));
      g.add(mesh(new THREE.TorusGeometry(0.03, 0.01, 8, 16), standard('#3b2f20', 0.8), [0, 0.1, 0]));
      return g;
    }
    if (id === 'aviator-goggles') {
      const g = new THREE.Group();
      g.position.set(0, 0.07, 0);
      const strap = mesh(new THREE.TorusGeometry(0.165, 0.012, 8, 36), standard('#3b2a1a', 0.8), undefined, [1, 1.1, 1]);
      strap.rotation.x = Math.PI / 2;
      g.add(strap);
      const rimGeo = new THREE.TorusGeometry(0.045, 0.011, 10, 24);
      const rimMat = standard('#b8892b', 0.35, { metalness: 0.8 });
      const lensGeo = new THREE.CircleGeometry(0.042, 24);
      const lensMat = new THREE.MeshPhysicalMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.55, roughness: 0.05, clearcoat: 1 });
      ([-1, 1] as const).forEach((s) => {
        const lens = new THREE.Group();
        lens.position.set(s * 0.075, 0.035, 0.135);
        lens.rotation.x = -0.25;
        lens.add(new THREE.Mesh(rimGeo, rimMat));
        lens.add(new THREE.Mesh(lensGeo, lensMat));
        g.add(lens);
      });
      return g;
    }
    return null;
  }

  /* ------------------------------- publiczne ------------------------------- */

  /** Ustawia poziom zabłocenia: liczba = całe ciało, obiekt = poszczególne strefy. */
  setMud(value: number | { torso?: number; head?: number; legs?: number; tail?: number }): void {
    const mud = this.shared.uMud.value;
    if (typeof value === 'number') mud.set(value, value, value, value);
    else mud.set(value.torso ?? mud.x, value.head ?? mud.y, value.legs ?? mud.z, value.tail ?? mud.w);
  }

  getMud(): THREE.Vector4 {
    return this.shared.uMud.value;
  }

  /** Dopasowuje światło futra do otoczenia sceny. */
  setLighting(o: { dir?: THREE.Vector3; color?: THREE.ColorRepresentation; sky?: THREE.ColorRepresentation; ground?: THREE.ColorRepresentation }): void {
    if (o.dir) this.shared.uLightDir.value.copy(o.dir).normalize();
    if (o.color !== undefined) this.shared.uLightColor.value.set(o.color);
    if (o.sky !== undefined) this.shared.uSky.value.set(o.sky);
    if (o.ground !== undefined) this.shared.uGround.value.set(o.ground);
  }

  /** Dodaje szalik do podanego rodzica (zwykle korzenia sceny / ctx.root). */
  attachScarfTo(parent: THREE.Object3D): void {
    if (this.scarf) parent.add(this.scarf.mesh);
  }

  /** Kilkukrotne, szybkie mrugnięcie (np. po uderzeniu). */
  blinkNow(): void {
    this.blink = 0.18;
  }

  update(dt: number, t: number): void {
    const step = Math.min(dt, 1 / 30);
    if (step <= 0) return;
    const m = this.motion;
    const target = POSES[m.expression];
    const k = 1 - Math.exp(-step * 7);
    const pose = this.pose;
    for (const key of POSE_KEYS) pose[key] += (target[key] - pose[key]) * k;

    sampleWind(t, this.worldWind);
    this.shared.uTime.value = t;
    this.shared.uWind.value.copy(this.worldWind).multiplyScalar(0.02);

    /* chód */
    this.sprint += (m.speed - this.sprint) * (1 - Math.exp(-step * 8));
    const speed = this.sprint;
    this.gait += step * (4 + speed * 12);
    const swing = Math.sin(this.gait);
    const legPhase = [0, Math.PI, Math.PI, 0];
    this.legs.forEach((leg, i) => {
      const s = Math.sin(this.gait + legPhase[i]) * 0.75 * speed;
      leg.rotation.x += (s - leg.rotation.x) * (1 - Math.exp(-step * 25));
    });

    this.body.position.y = Math.abs(swing) * 0.03 * speed;
    this.body.rotation.x = -swing * 0.03 * speed;
    // otrząsanie: szybkie skręty całego ciała
    this.body.rotation.y = Math.sin(t * 46) * 0.38 * m.shake;
    this.body.rotation.z = Math.sin(t * 37) * 0.1 * m.shake;
    this.torso.scale.y = 1 + Math.sin(t * 2.2) * 0.012;

    /* głowa, nos, język */
    const idleLook = m.expression === 'idle' ? Math.sin(t * 0.6) * 0.1 : 0;
    const tremble = m.expression === 'scared' ? Math.sin(t * 40) * 0.015 : 0;
    this.head.rotation.set(pose.headPitch + this.look.pitch + tremble, idleLook + this.look.yaw, this.look.roll);
    this.head.position.y = 0.56 + Math.sin(t * 8) * 0.008 * pose.nose;
    this.nose.scale.setScalar(1 + Math.sin(t * 28) * 0.08 * pose.nose);
    this.tongue.scale.set(1, 0.2 + pose.tongue * 1.2, 1);
    this.tongue.visible = pose.tongue > 0.05;

    /* oczy i brwi */
    this.blinkIn -= step;
    if (this.blinkIn <= 0) {
      this.blink = 0.14;
      this.blinkIn = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - step);
    const blinkFactor = this.blink > 0 ? 0.1 : 1;
    this.eyes.forEach((eye) => eye.scale.set(pose.eyeOpen, pose.eyeOpen * blinkFactor, pose.eyeOpen));
    this.brows.forEach((brow, i) => {
      const side = i === 0 ? 1 : -1;
      brow.position.y = 0.095 + pose.brow * 0.035;
      brow.rotation.z = side * pose.browTilt;
    });

    /* ogon */
    const wag = Math.sin(t * pose.tailRate) * pose.tailAmp;
    this.tail[0].rotation.z = wag;
    this.tail[0].rotation.x = -0.9 + pose.tuck * 1.5;
    this.tail[1].rotation.z = Math.sin(t * pose.tailRate - 0.8) * pose.tailAmp * 1.2;

    /* fizyka uszu: przyspieszenie głowy, wiatr i grawitacja w układzie lokalnym głowy */
    this.head.getWorldPosition(this.headPos);
    if (!this.initialised) {
      this.prevHead.copy(this.headPos);
      this.initialised = true;
    }
    this.vel.subVectors(this.headPos, this.prevHead).divideScalar(step);
    this.rawAcc.subVectors(this.vel, this.prevVel).divideScalar(step);
    this.acc.lerp(this.rawAcc, 1 - Math.exp(-step * 20));
    this.prevHead.copy(this.headPos);
    this.prevVel.copy(this.vel);

    this.head.getWorldQuaternion(this.quat);
    this.quat.invert();
    this.localAcc.copy(this.acc).applyQuaternion(this.quat);
    this.localWind.copy(this.worldWind).applyQuaternion(this.quat);
    this.down.set(0, -1, 0).applyQuaternion(this.quat);

    const lift = this.earLiftOverride ?? pose.earLift;
    ([1, -1] as const).forEach((side, ei) => {
      stepEarChain(this.earState[ei], step, this.localAcc, this.localWind, this.down, side, lift);
      this.ears[ei].forEach((seg, si) => {
        seg.rotation.x = this.earState[ei].ax[si];
        seg.rotation.z = this.earState[ei].az[si];
      });
    });

    /* szalik */
    if (this.scarf) {
      this.mouthAnchor.getWorldPosition(this.anchorWorld);
      this.scarf.update(step, t, this.anchorWorld);
    }
  }

  dispose(): void {
    this.scarf?.dispose();
    this.furMaterials.forEach((mat) => mat.dispose());
    disposeObject3D(this.group);
    this.group.removeFromParent();
  }
}
