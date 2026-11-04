import { forwardRef, useEffect, useImperativeHandle, useMemo, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import type { AccessoryId, QualityTier } from '../core/types';
import { FadoRig, createFadoMotion, type FadoMotion } from './FadoRig';

export { createFadoMotion };
export type { FadoMotion, FadoExpression } from './FadoRig';

export interface FadoProps {
  motion?: MutableRefObject<FadoMotion>;
  accessory?: AccessoryId | null;
  carryScarf?: boolean;
  quality?: QualityTier;
  scale?: number;
}

/** Cienka nakładka Reacta na FadoRig: montuje model i napędza jego update() co klatkę. */
export const Fado = forwardRef<THREE.Group, FadoProps>(function Fado(
  { motion, accessory = null, carryScarf = true, quality = 'medium', scale = 1.6 },
  ref,
) {
  const scene = useThree((s) => s.scene);

  const rig = useMemo(
    () => new FadoRig({ accessory, carryScarf, quality, scale, motion: motion?.current }),
    // `motion` to stabilny ref; przebudowa tylko przy zmianie wyglądu
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accessory, carryScarf, quality, scale],
  );

  useImperativeHandle(ref, () => rig.group, [rig]);

  useEffect(() => {
    rig.attachScarfTo(scene);
    return () => rig.dispose();
  }, [rig, scene]);

  useFrame((state, dt) => {
    rig.update(dt, state.clock.elapsedTime);
  });

  return <primitive object={rig.group} />;
});
