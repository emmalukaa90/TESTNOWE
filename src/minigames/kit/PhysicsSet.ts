import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { PhysicsHandle } from '../../core/PhysicsHandle';

export interface PhysItem {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D | null;
}

/**
 * Zestaw brył Rapier należących do jednej minigry: tworzenie, synchronizacja z meshami
 * i gwarantowane usunięcie ze świata w dispose() (świat jest wspólny dla całej aplikacji).
 */
export class PhysicsSet {
  readonly items: PhysItem[] = [];
  private disposed = false;

  constructor(private readonly physics: PhysicsHandle) {}

  get world(): RAPIER.World {
    return this.physics.world;
  }
  get R(): typeof RAPIER {
    return this.physics.rapier;
  }

  fixedBox(hx: number, hy: number, hz: number, pos: THREE.Vector3Like, mesh: THREE.Object3D | null = null, friction = 0.8): PhysItem {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z));
    this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction), body);
    return this.track({ body, mesh });
  }

  dynamicBox(hx: number, hy: number, hz: number, pos: THREE.Vector3Like, mesh: THREE.Object3D | null, opts: { friction?: number; restitution?: number; density?: number; damping?: number; angularDamping?: number } = {}): PhysItem {
    const desc = this.R.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(opts.damping ?? 0.1)
      .setAngularDamping(opts.angularDamping ?? 0.3);
    const body = this.world.createRigidBody(desc);
    this.world.createCollider(
      this.R.ColliderDesc.cuboid(hx, hy, hz)
        .setFriction(opts.friction ?? 0.8)
        .setRestitution(opts.restitution ?? 0.05)
        .setDensity(opts.density ?? 1),
      body,
    );
    return this.track({ body, mesh });
  }

  dynamicBall(r: number, pos: THREE.Vector3Like, mesh: THREE.Object3D | null, opts: { friction?: number; restitution?: number; density?: number } = {}): PhysItem {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setLinearDamping(0.05));
    this.world.createCollider(
      this.R.ColliderDesc.ball(r)
        .setFriction(opts.friction ?? 0.6)
        .setRestitution(opts.restitution ?? 0.3)
        .setDensity(opts.density ?? 1),
      body,
    );
    return this.track({ body, mesh });
  }

  /** Kinematyczna bryła sterowana pozycją (platformy, ręka gracza). */
  kinematicBox(hx: number, hy: number, hz: number, pos: THREE.Vector3Like, mesh: THREE.Object3D | null = null): PhysItem {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z));
    this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz), body);
    return this.track({ body, mesh });
  }

  private track(item: PhysItem): PhysItem {
    this.items.push(item);
    return item;
  }

  remove(item: PhysItem): void {
    const i = this.items.indexOf(item);
    if (i < 0) return;
    this.items.splice(i, 1);
    if (this.physics.ready) this.world.removeRigidBody(item.body);
  }

  /** Kopiuje pozycje/rotacje z fizyki na meshe. */
  sync(): void {
    for (const it of this.items) {
      if (!it.mesh) continue;
      const t = it.body.translation();
      const r = it.body.rotation();
      it.mesh.position.set(t.x, t.y, t.z);
      it.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.physics.ready) {
      for (const it of this.items) {
        try {
          this.world.removeRigidBody(it.body);
        } catch {
          /* bryła mogła już zostać usunięta razem ze światem */
        }
      }
    }
    this.items.length = 0;
  }
}
