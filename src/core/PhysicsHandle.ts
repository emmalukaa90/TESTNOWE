import type RAPIER from '@dimforge/rapier3d-compat';

/**
 * Most między światem Rapier (zarządzanym przez @react-three/rapier)
 * a modułami minigier, które nie są komponentami Reacta.
 * Moduł tworzy bryły przez world.createRigidBody(rapier.RigidBodyDesc.dynamic()) i
 * synchronizuje meshe w updateLoop(). Krok symulacji wykonuje <Physics>.
 */
export class PhysicsHandle {
  private _world: RAPIER.World | null = null;
  private _rapier: typeof RAPIER | null = null;
  private waiters: Array<() => void> = [];

  attach(world: RAPIER.World, rapier: typeof RAPIER): void {
    this._world = world;
    this._rapier = rapier;
    const pending = this.waiters;
    this.waiters = [];
    pending.forEach((resolve) => resolve());
  }

  detach(): void {
    this._world = null;
    this._rapier = null;
  }

  get ready(): boolean {
    return this._world !== null && this._rapier !== null;
  }

  /** Rozwiązuje się, gdy świat Rapier jest gotowy (WASM wczytany). */
  whenReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  get world(): RAPIER.World {
    if (!this._world) throw new Error('[physics] świat Rapier nie jest jeszcze gotowy');
    return this._world;
  }

  get rapier(): typeof RAPIER {
    if (!this._rapier) throw new Error('[physics] Rapier nie jest jeszcze gotowy');
    return this._rapier;
  }
}
