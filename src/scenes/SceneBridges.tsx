import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { game } from '../core/GameManager';

/** Udostępnia modułom aktualną kamerę i rozmiar widoku (do raycastów i HUD). */
export function ViewBridge() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);

  useEffect(() => {
    game.view.camera = camera;
    return () => {
      game.view.camera = null;
    };
  }, [camera]);

  useEffect(() => {
    game.view.width = size.width;
    game.view.height = size.height;
  }, [size]);

  return null;
}

/** Stosuje tło i mgłę z EnvironmentDirector (jedno źródło prawdy dla minigier i cutscenek). */
export function EnvironmentRig() {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const fog = new THREE.Fog(game.env.fogColor.getHex(), game.env.fog.near, game.env.fog.far);
    scene.fog = fog;
    scene.background = game.env.background.clone();
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene]);

  useFrame(() => {
    const env = game.env;
    const bg = scene.background;
    if (bg instanceof THREE.Color) bg.copy(env.background);
    const fog = scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.color.copy(env.fogColor);
      fog.near = env.fog.near;
      fog.far = env.fog.far;
    }
  });

  return null;
}
