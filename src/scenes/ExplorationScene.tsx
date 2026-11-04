import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { Fado, createFadoMotion } from '../characters/Fado';
import { game } from '../core/GameManager';
import { useSave } from '../core/SaveSystem';
import { useGameUi } from '../core/store';
import type { QualityProfile } from '../render/quality';
import { ARENA_HALF, ForestBackdrop } from './ForestBackdrop';

const MAX_SPEED = 5.5;
const BODY_HALF_HEIGHT = 0.2;
const BODY_RADIUS = 0.35;
/** wysokość środka kapsuły nad podłożem */
const BODY_CENTER_Y = BODY_HALF_HEIGHT + BODY_RADIUS;

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Polana startowa: Fado chodzi po dotknięciu, przytrzymanie ekranu włącza Psi Węch. */
export function ExplorationScene({ profile }: { profile: QualityProfile }) {
  const camera = useThree((s) => s.camera);
  const accessory = useSave((s) => s.data.equippedAccessory);

  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<THREE.Group>(null);
  const fadoGroup = useRef<THREE.Group>(null);
  const motion = useRef(createFadoMotion());

  const sim = useMemo(
    () => ({
      target: null as THREE.Vector3 | null,
      happyUntil: 0,
      probe: new THREE.Vector3(),
      raycaster: new THREE.Raycaster(),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      hit: new THREE.Vector3(),
      ndc: new THREE.Vector2(),
    }),
    [],
  );

  // Kamera podąża za Fado, a Psi Węch mierzy dystans do tropu od jego pozycji.
  useEffect(() => {
    const own = visual.current;
    if (own) game.camera.setTarget(own);
    game.scent.setProbe(sim.probe);
    return () => {
      // nie zdejmujemy celu, jeśli przejęła go już minigra
      if (game.camera.target === own) game.camera.setTarget(null);
      game.scent.setProbe(null);
    };
  }, [sim]);

  // Tropy demonstracyjne polany (w rozdziałach tropy definiuje poziom).
  useEffect(() => {
    const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
    game.scent.addTrail({
      id: 'demo-klara',
      kind: 'klara',
      points: [v(1, 3), v(4, 0), v(7, -3), v(6, -7), v(9, -10), v(12, -11)],
      width: 0.6,
    });
    game.scent.addTrail({
      id: 'demo-food',
      kind: 'food',
      points: [v(-2, 2), v(-5, 0), v(-8, -3), v(-10, -6)],
      width: 0.5,
    });
    game.scent.addTrail({
      id: 'demo-danger',
      kind: 'danger',
      points: [v(-3, -6), v(-1, -9), v(2, -12)],
      width: 0.5,
    });
    return () => {
      game.scent.removeTrail('demo-klara');
      game.scent.removeTrail('demo-food');
      game.scent.removeTrail('demo-danger');
    };
  }, []);

  // Dotknięcie ekranu w stanie 'hub' ustawia cel ruchu na płaszczyźnie podłoża.
  useEffect(() => {
    return game.events.on('input', (e) => {
      if (e.type !== 'tap' || !game.flow.is('hub')) return;
      sim.ndc.set(e.nx, e.ny);
      sim.raycaster.setFromCamera(sim.ndc, camera);
      if (!sim.raycaster.ray.intersectPlane(sim.plane, sim.hit)) return;
      const limit = ARENA_HALF - 1.5;
      const target = sim.target ?? new THREE.Vector3();
      target.set(THREE.MathUtils.clamp(sim.hit.x, -limit, limit), 0, THREE.MathUtils.clamp(sim.hit.z, -limit, limit));
      sim.target = target;
      game.haptics.impact('light');
    });
  }, [camera, sim]);

  useFrame((_, rawDt) => {
    const rb = body.current;
    const yawGroup = visual.current;
    if (!rb || !yawGroup) return;
    const dt = Math.min(rawDt, 1 / 30);
    const state = useGameUi.getState().state;
    const now = performance.now();

    const pos = rb.translation();
    const vel = rb.linvel();
    sim.probe.set(pos.x, 0, pos.z);

    let desiredX = 0;
    let desiredZ = 0;
    let yawTarget: number | null = null;

    if (state === 'hub' && !game.scent.active && sim.target) {
      const dx = sim.target.x - pos.x;
      const dz = sim.target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.3) {
        const speed = Math.min(MAX_SPEED, 1.5 + dist * 3);
        desiredX = (dx / dist) * speed;
        desiredZ = (dz / dist) * speed;
        yawTarget = Math.atan2(dx, dz);
      } else {
        sim.target = null;
        sim.happyUntil = now + 1200;
        game.haptics.impact('light');
      }
    }

    rb.setLinvel({ x: desiredX, y: vel.y, z: desiredZ }, true);

    if (yawTarget !== null) {
      const diff = wrapAngle(yawTarget - yawGroup.rotation.y);
      yawGroup.rotation.y += diff * (1 - Math.exp(-dt * 10));
    }

    const horizontal = Math.hypot(vel.x, vel.z);
    const m = motion.current;
    m.speed = Math.min(1, horizontal / MAX_SPEED);
    if (state === 'menu') m.expression = 'happy';
    else if (game.scent.active) m.expression = 'sniff';
    else if (horizontal > 0.4) m.expression = 'run';
    else if (now < sim.happyUntil) m.expression = 'happy';
    else m.expression = 'idle';
  });

  return (
    <>
      <ForestBackdrop profile={profile} />
      <RigidBody
        ref={body}
        colliders={false}
        lockRotations
        position={[0, BODY_CENTER_Y + 0.05, 0]}
        linearDamping={0.5}
        friction={0.8}
      >
        <CapsuleCollider args={[BODY_HALF_HEIGHT, BODY_RADIUS]} />
        <group ref={visual} position={[0, -BODY_CENTER_Y, 0]}>
          <Fado ref={fadoGroup} motion={motion} accessory={accessory} quality={profile.tier} scale={1.6} />
        </group>
      </RigidBody>
    </>
  );
}
