import { Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { game } from '../core/GameManager';
import { useSave } from '../core/SaveSystem';
import { useGameUi } from '../core/store';
import { PROFILES } from '../render/quality';
import { ScentVisionSystem } from '../systems/scent/ScentVisionSystem';
import { CameraRig } from './CameraRig';
import { ExplorationScene } from './ExplorationScene';
import { PhysicsBridge } from './PhysicsBridge';
import { PostFX } from './PostFX';
import { EnvironmentRig, ViewBridge } from './SceneBridges';

/** Napędza GameManager.tick() tuż przed renderem (priorytet < 0). */
function GameLoop() {
  useFrame((_, delta) => game.tick(delta), -1);
  return null;
}

export function GameCanvas() {
  const quality = useSave((s) => s.data.settings.quality);
  const state = useGameUi((s) => s.state);
  const profile = PROFILES[quality];
  const showExploration = state === 'menu' || state === 'hub';

  return (
    <Canvas
      className="absolute inset-0"
      shadows="soft"
      dpr={profile.dpr}
      flat
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false }}
      camera={{ fov: 42, near: 0.1, far: 400, position: [0, 5, 8] }}
    >
      <GameLoop />
      <ViewBridge />
      <EnvironmentRig />
      <Suspense fallback={null}>
        <Physics gravity={[0, -18, 0]} paused={state === 'paused'}>
          <PhysicsBridge />
          {showExploration ? <ExplorationScene profile={profile} /> : null}
          <primitive object={game.root} />
        </Physics>
      </Suspense>
      <ScentVisionSystem />
      <CameraRig director={game.camera} />
      <PostFX profile={profile} director={game.camera} scent={game.scent} />
    </Canvas>
  );
}
