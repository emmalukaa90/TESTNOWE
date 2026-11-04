import * as THREE from 'three';
import { FadoRig, type FadoRigOptions } from '../../characters/FadoRig';
import type { GameContext } from '../../core/types';

export interface FadoActor {
  rig: FadoRig;
  group: THREE.Group;
}

/** Tworzy Fado w korzeniu minigry (z szalikiem, akcesorium gracza i jakością z ustawień). */
export function makeFado(ctx: GameContext, o: Partial<FadoRigOptions> & { lightDir?: THREE.Vector3 } = {}): FadoActor {
  const rig = new FadoRig({ quality: ctx.quality, accessory: ctx.accessory, scale: 1.0, carryScarf: true, ...o });
  if (o.lightDir) rig.setLighting({ dir: o.lightDir });
  ctx.root.add(rig.group);
  rig.attachScarfTo(ctx.root);
  return { rig, group: rig.group };
}

/** Kieruje przodem Fado w stronę wektora ruchu (XZ). */
export function faceDirection(group: THREE.Object3D, dx: number, dz: number, lambda: number, dt: number): void {
  if (Math.hypot(dx, dz) < 1e-3) return;
  const target = Math.atan2(dx, dz);
  const diff = Math.atan2(Math.sin(target - group.rotation.y), Math.cos(target - group.rotation.y));
  group.rotation.y += diff * (1 - Math.exp(-lambda * dt));
}
