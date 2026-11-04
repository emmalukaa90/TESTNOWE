import { useEffect } from 'react';
import { useRapier } from '@react-three/rapier';
import type RAPIER from '@dimforge/rapier3d-compat';
import { game } from '../core/GameManager';

/**
 * Udostępnia świat Rapier modułom minigier (game.physics). Musi być renderowany
 * wewnątrz <Physics>. Obsługuje zarówno surowy świat, jak i opakowanie z raw().
 */
export function PhysicsBridge() {
  const { world, rapier } = useRapier();

  useEffect(() => {
    const maybeWrapped = world as unknown as { raw?: () => RAPIER.World };
    const raw = typeof maybeWrapped.raw === 'function' ? maybeWrapped.raw() : (world as unknown as RAPIER.World);
    game.physics.attach(raw, rapier);
    return () => game.physics.detach();
  }, [world, rapier]);

  return null;
}
