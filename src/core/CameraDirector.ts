import gsap from 'gsap';
import { Object3D, Vector3 } from 'three';

type Vec3Tuple = readonly [number, number, number];

export interface CameraShot {
  offset: Vec3Tuple;
  look: Vec3Tuple;
  fov: number;
  bokeh: number;
  duration: number;
  ease?: string;
}

/** Biblioteka ujęć. Kolejne rozdziały dokładają własne przez shot({...}). */
export const SHOTS = {
  explore: { offset: [0, 5.2, 7.4], look: [0, 0.8, 0], fov: 42, bokeh: 2.2, duration: 1.4 },
  scent: { offset: [0, 2.3, 3.8], look: [0, 0.7, 0], fov: 34, bokeh: 4.5, duration: 0.9 },
  menu: { offset: [-2.4, 1.5, 3.6], look: [0.3, 0.9, 0], fov: 32, bokeh: 5, duration: 2.2 },
  wide: { offset: [0, 9, 12], look: [0, 0.5, 0], fov: 46, bokeh: 0.8, duration: 1.6 },
  lowChase: { offset: [0, 1.4, 4.4], look: [0, 0.8, -2], fov: 52, bokeh: 1.6, duration: 0.8 },
} as const satisfies Record<string, CameraShot>;

export type ShotName = keyof typeof SHOTS;

/**
 * Reżyser kamery: trzyma stan "rig" (offset, punkt patrzenia, FOV, bokeh, drżenie),
 * który komponent CameraRig wygładza i stosuje co klatkę. Przejścia między ujęciami
 * to tweeny GSAP, więc działają tak samo w eksploracji i w minigrach.
 */
export class CameraDirector {
  readonly rig = {
    offset: new Vector3(),
    look: new Vector3(),
    fov: 42,
    bokeh: 2.2,
    shake: 0,
    roll: 0,
  };

  /** Punkt w świecie, na którym ustawiana jest ostrość (aktualizowany przez CameraRig). */
  readonly focusPoint = new Vector3();

  target: Object3D | null = null;
  private timeline: gsap.core.Timeline | null = null;

  constructor() {
    this.apply(SHOTS.explore);
  }

  setTarget(target: Object3D | null): void {
    this.target = target;
  }

  /** Natychmiastowe ustawienie ujęcia bez animacji. */
  apply(shot: CameraShot): void {
    this.timeline?.kill();
    this.rig.offset.set(...shot.offset);
    this.rig.look.set(...shot.look);
    this.rig.fov = shot.fov;
    this.rig.bokeh = shot.bokeh;
  }

  shot(shot: CameraShot | ShotName, overrides?: { duration?: number; ease?: string }): gsap.core.Timeline {
    const s: CameraShot = typeof shot === 'string' ? SHOTS[shot] : shot;
    const duration = overrides?.duration ?? s.duration;
    const ease = overrides?.ease ?? s.ease ?? 'power3.inOut';
    this.timeline?.kill();
    const tl = gsap.timeline();
    tl.to(this.rig.offset, { x: s.offset[0], y: s.offset[1], z: s.offset[2], duration, ease }, 0);
    tl.to(this.rig.look, { x: s.look[0], y: s.look[1], z: s.look[2], duration, ease }, 0);
    tl.to(this.rig, { fov: s.fov, bokeh: s.bokeh, duration, ease }, 0);
    this.timeline = tl;
    return tl;
  }

  /** Drżenie kamery (wybuchy, pioruny, uderzenia). */
  shake(amplitude: number, duration = 0.5): void {
    gsap.fromTo(this.rig, { shake: amplitude }, { shake: 0, duration, ease: 'power2.out', overwrite: 'auto' });
  }

  /** Krótkie "pchnięcie" FOV, np. przy skoku albo szczeknięciu. */
  punchFov(delta: number, duration = 0.35): void {
    const base = this.rig.fov;
    gsap.fromTo(this.rig, { fov: base + delta }, { fov: base, duration, ease: 'power2.out', overwrite: 'auto' });
  }

  /** Przechył kamery (roll) w radianach, np. w runnerze. */
  tilt(angle: number, duration = 0.4): void {
    gsap.to(this.rig, { roll: angle, duration, ease: 'power2.out', overwrite: 'auto' });
  }
}
