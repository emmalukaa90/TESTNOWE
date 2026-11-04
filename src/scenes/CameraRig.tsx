import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraDirector } from '../core/CameraDirector';

const FOLLOW_LAMBDA = 3.2;
const LOOK_LAMBDA = 6;
const FOV_LAMBDA = 5;

/**
 * Filmowa kamera: wygładzone podążanie (MathUtils.damp, odpowiednik SmoothDamp),
 * ujęcia z CameraDirector, drżenie, roll i punkt ostrości dla Depth of Field.
 */
export function CameraRig({ director }: { director: CameraDirector }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  const tmp = useMemo(
    () => ({
      target: new THREE.Vector3(),
      want: new THREE.Vector3(),
      look: new THREE.Vector3(),
      smoothLook: new THREE.Vector3(),
      ready: false,
    }),
    [],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const rig = director.rig;

    if (director.target) director.target.getWorldPosition(tmp.target);
    else tmp.target.set(0, 0, 0);

    tmp.want.copy(tmp.target).add(rig.offset);
    tmp.look.copy(tmp.target).add(rig.look);

    if (!tmp.ready) {
      camera.position.copy(tmp.want);
      tmp.smoothLook.copy(tmp.look);
      tmp.ready = true;
    } else {
      camera.position.x = THREE.MathUtils.damp(camera.position.x, tmp.want.x, FOLLOW_LAMBDA, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, tmp.want.y, FOLLOW_LAMBDA, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, tmp.want.z, FOLLOW_LAMBDA, dt);
      tmp.smoothLook.x = THREE.MathUtils.damp(tmp.smoothLook.x, tmp.look.x, LOOK_LAMBDA, dt);
      tmp.smoothLook.y = THREE.MathUtils.damp(tmp.smoothLook.y, tmp.look.y, LOOK_LAMBDA, dt);
      tmp.smoothLook.z = THREE.MathUtils.damp(tmp.smoothLook.z, tmp.look.z, LOOK_LAMBDA, dt);
    }

    if (rig.shake > 0.001) {
      const t = state.clock.elapsedTime;
      const s = rig.shake * 0.08;
      camera.position.x += (Math.sin(t * 47) + Math.sin(t * 31.7)) * 0.5 * s;
      camera.position.y += (Math.sin(t * 53) + Math.sin(t * 27.3)) * 0.5 * s;
    }

    camera.lookAt(tmp.smoothLook);
    if (Math.abs(rig.roll) > 1e-4) camera.rotateZ(rig.roll);

    const fov = THREE.MathUtils.damp(camera.fov, rig.fov, FOV_LAMBDA, dt);
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // Ostrość DoF na punkcie, na który patrzy kamera (mutowane w miejscu).
    director.focusPoint.copy(tmp.smoothLook);
  });

  return null;
}
