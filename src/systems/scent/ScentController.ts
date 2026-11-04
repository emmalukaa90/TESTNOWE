import gsap from 'gsap';
import * as THREE from 'three';
import { create } from 'zustand';
import type { EventBus } from '../../core/EventBus';
import { useGameUi } from '../../core/store';
import type { GameEvents } from '../../core/types';
import type { HapticController } from '../HapticController';

export type ScentKind = 'klara' | 'food' | 'danger';

export const SCENT_COLORS: Record<ScentKind, string> = {
  klara: '#ffd23f',
  food: '#5ee07a',
  danger: '#ff4a4a',
};

export interface ScentTrailInput {
  id: string;
  kind: ScentKind;
  /** punkty kontrolne splajnu w świecie (y = poziom gruntu) */
  points: THREE.Vector3[];
  width?: number;
  height?: number;
}

export interface ScentTrail extends ScentTrailInput {
  samples: THREE.Vector3[];
}

export const useScentTrails = create<{ trails: ScentTrail[] }>(() => ({ trails: [] }));

const PROXIMITY_RANGE = 6;

/**
 * Logika Psiego Węchu niezależna od Reacta: włączanie/wyłączanie trybu (siła 0..1
 * animowana GSAP), rejestr tropów i proximity do tropu Klary dla haptyki.
 */
export class ScentController {
  /** `strength` jest czytane co klatkę przez shadery i post-processing. */
  readonly state = { strength: 0 };
  active = false;

  private probe: THREE.Vector3 | null = null;
  private clock = 0;

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly haptics: HapticController,
  ) {}

  setActive(on: boolean): void {
    if (this.active === on) return;
    this.active = on;
    gsap.to(this.state, {
      strength: on ? 1 : 0,
      duration: on ? 0.55 : 0.35,
      ease: on ? 'power2.out' : 'power2.in',
      overwrite: true,
    });
    useGameUi.setState({ scentActive: on });
    if (on) this.haptics.impact('light');
    this.events.emit('scent:toggle', { active: on });
  }

  addTrail(input: ScentTrailInput): void {
    const curve = new THREE.CatmullRomCurve3(input.points, false, 'centripetal');
    const trail: ScentTrail = { ...input, samples: curve.getSpacedPoints(64) };
    useScentTrails.setState((s) => ({ trails: [...s.trails.filter((t) => t.id !== input.id), trail] }));
  }

  removeTrail(id: string): void {
    useScentTrails.setState((s) => ({ trails: s.trails.filter((t) => t.id !== id) }));
  }

  clearTrails(): void {
    useScentTrails.setState({ trails: [] });
    this.haptics.setProximity(0);
  }

  /** Punkt (zwykle pozycja Fado), względem którego liczone jest pulsowanie haptyczne. */
  setProbe(position: THREE.Vector3 | null): void {
    this.probe = position;
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < 0.1) return;
    this.clock = 0;

    const probe = this.probe;
    if (!probe) {
      this.haptics.setProximity(0);
      return;
    }
    let best = Infinity;
    for (const trail of useScentTrails.getState().trails) {
      if (trail.kind !== 'klara') continue;
      for (const sample of trail.samples) {
        const d = sample.distanceToSquared(probe);
        if (d < best) best = d;
      }
    }
    const distance = Math.sqrt(best);
    this.haptics.setProximity(distance < PROXIMITY_RANGE ? 1 - distance / PROXIMITY_RANGE : 0);
  }
}
