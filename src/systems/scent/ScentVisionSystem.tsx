import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { game } from '../../core/GameManager';
import { SCENT_COLORS, useScentTrails, type ScentTrail } from './ScentController';

/* ----------------------------- geometria wstęgi ----------------------------- */

const RIBBON_SEGMENTS = 120;

function buildRibbonGeometry(trail: ScentTrail): { geometry: THREE.BufferGeometry; length: number } {
  const width = trail.width ?? 0.5;
  const lift = trail.height ?? 0.28;
  const curve = new THREE.CatmullRomCurve3(trail.points, false, 'centripetal');
  const length = curve.getLength();

  const count = RIBBON_SEGMENTS + 1;
  const position = new Float32Array(count * 2 * 3);
  const aT = new Float32Array(count * 2);
  const aSide = new Float32Array(count * 2);
  const index: number[] = [];

  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const point = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const t = i / RIBBON_SEGMENTS;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent);
    side.crossVectors(tangent, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize().multiplyScalar(width * 0.5);

    const o = i * 6;
    position[o] = point.x - side.x;
    position[o + 1] = point.y + lift;
    position[o + 2] = point.z - side.z;
    position[o + 3] = point.x + side.x;
    position[o + 4] = point.y + lift;
    position[o + 5] = point.z + side.z;

    aT[i * 2] = t;
    aT[i * 2 + 1] = t;
    aSide[i * 2] = -1;
    aSide[i * 2 + 1] = 1;

    if (i < RIBBON_SEGMENTS) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  geometry.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return { geometry, length };
}

function buildParticleGeometry(trail: ScentTrail, count: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(trail.points, false, 'centripetal');
  const position = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    curve.getPointAt(Math.random(), p);
    position[i * 3] = p.x + (Math.random() - 0.5) * (trail.width ?? 0.5);
    position[i * 3 + 1] = p.y + (trail.height ?? 0.28);
    position[i * 3 + 2] = p.z + (Math.random() - 0.5) * (trail.width ?? 0.5);
    seed[i] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/* --------------------------------- shadery --------------------------------- */

const RIBBON_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  attribute float aT;
  attribute float aSide;
  varying float vT;
  varying float vSide;
  void main() {
    vT = aT;
    vSide = aSide;
    vec3 p = position;
    p.y += sin(aT * 18.0 - uTime * 2.2) * 0.07 * uStrength + sin(aT * 7.0 + uTime) * 0.03;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const RIBBON_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uStrength;
  uniform float uLength;
  varying float vT;
  varying float vSide;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float reveal = smoothstep(0.0, 0.15, uStrength * 1.25 - vT);
    float edge = 1.0 - smoothstep(0.35, 1.0, abs(vSide));
    float flow = fract(vT * uLength * 0.6 - uTime * 0.9);
    float pulse = smoothstep(0.0, 0.5, flow) * (1.0 - smoothstep(0.5, 1.0, flow));
    float sparkle = step(0.985, hash(floor(vec2(vT * uLength * 8.0, vSide * 6.0 + floor(uTime * 6.0)))));
    float core = (0.35 + 0.65 * pulse) * edge;
    float a = (core + sparkle * 0.8) * reveal * uStrength;
    vec3 col = uColor * (0.8 + 0.6 * pulse) + vec3(sparkle);
    gl_FragColor = vec4(col, a);
  }
`;

const PARTICLE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uSize;
  attribute float aSeed;
  varying float vSeed;
  void main() {
    vSeed = aSeed;
    vec3 p = position;
    p.y += fract(aSeed + uTime * 0.15) * 0.7;
    p.x += sin(uTime * 1.3 + aSeed * 40.0) * 0.06;
    p.z += cos(uTime * 1.1 + aSeed * 31.0) * 0.06;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * uStrength * (0.6 + aSeed) * (300.0 / max(-mv.z, 0.1));
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * uStrength * (0.5 + 0.5 * vSeed);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

/* -------------------------------- komponenty -------------------------------- */

function ScentTrailMesh({ trail }: { trail: ScentTrail }) {
  const ribbonMesh = useRef<THREE.Mesh>(null);
  const points = useRef<THREE.Points>(null);

  const resources = useMemo(() => {
    const color = new THREE.Color(SCENT_COLORS[trail.kind]);
    const { geometry, length } = buildRibbonGeometry(trail);
    const ribbonMaterial = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      uniforms: {
        uColor: { value: color },
        uTime: { value: 0 },
        uStrength: { value: 0 },
        uLength: { value: length },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const particleGeometry = buildParticleGeometry(trail, Math.min(120, Math.ceil(length * 6)));
    const particleMaterial = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: {
        uColor: { value: color },
        uTime: { value: 0 },
        uStrength: { value: 0 },
        uSize: { value: 0.09 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry, ribbonMaterial, particleGeometry, particleMaterial };
  }, [trail]);

  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.ribbonMaterial.dispose();
      resources.particleGeometry.dispose();
      resources.particleMaterial.dispose();
    },
    [resources],
  );

  useFrame((state) => {
    const strength = game.scent.state.strength;
    const t = state.clock.elapsedTime;
    const visible = strength > 0.01;
    if (ribbonMesh.current) ribbonMesh.current.visible = visible;
    if (points.current) points.current.visible = visible;
    if (!visible) return;
    resources.ribbonMaterial.uniforms.uTime.value = t;
    resources.ribbonMaterial.uniforms.uStrength.value = strength;
    resources.particleMaterial.uniforms.uTime.value = t;
    resources.particleMaterial.uniforms.uStrength.value = strength;
  });

  return (
    <>
      <mesh ref={ribbonMesh} geometry={resources.geometry} material={resources.ribbonMaterial} frustumCulled={false} renderOrder={10} />
      <points
        ref={points}
        geometry={resources.particleGeometry}
        material={resources.particleMaterial}
        frustumCulled={false}
        renderOrder={11}
      />
    </>
  );
}

/**
 * Renderuje wszystkie zarejestrowane tropy (żółty = Klara, zielony = jedzenie,
 * czerwony = zagrożenie). Widoczność i „rośnięcie” wstęgi napędza
 * game.scent.state.strength, a desaturację ekranu robi PostFX.
 */
export function ScentVisionSystem() {
  const trails = useScentTrails((s) => s.trails);
  return (
    <group name="ScentVisionSystem">
      {trails.map((trail) => (
        <ScentTrailMesh key={trail.id} trail={trail} />
      ))}
    </group>
  );
}
