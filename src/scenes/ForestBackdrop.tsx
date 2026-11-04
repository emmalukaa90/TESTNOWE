import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Sky, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { game } from '../core/GameManager';
import { mulberry32 } from '../core/random';
import { sampleWind } from '../environment/wind';
import type { QualityProfile } from '../render/quality';

/** Promień areny, po której chodzi Fado. Drzewa zaczynają się poza nią. */
export const ARENA_HALF = 14;
const SUN_DIR = new THREE.Vector3(-12, 14, 8).normalize();

const AUTUMN = ['#e07a1f', '#c9461d', '#d9a21b', '#8c6d1f', '#a33b14', '#6e7a2a'].map((c) => new THREE.Color(c));

/* --------------------------------- teren --------------------------------- */

function Terrain() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(160, 160, 160, 160);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const near = new THREE.Color('#7d8f3a');
    const far = new THREE.Color('#a8742a');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const d = Math.hypot(x, z);
      const ramp = THREE.MathUtils.smoothstep(d, 16, 48);
      const hills = Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.5 * Math.sin(x * 0.23 + z * 0.17);
      pos.setY(i, ramp * hills * 4.5);
      const patch = 0.5 + 0.5 * Math.sin(x * 0.7) * Math.sin(z * 0.6);
      c.copy(near).lerp(far, THREE.MathUtils.clamp(ramp * 0.9 + patch * 0.18, 0, 1));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}

/* --------------------------------- drzewa --------------------------------- */

const TREE_COUNT = 110;

function Trees() {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);

  const data = useMemo(() => {
    const rand = mulberry32(1337);
    return Array.from({ length: TREE_COUNT }, () => {
      const angle = rand() * Math.PI * 2;
      const dist = 16 + Math.pow(rand(), 0.7) * 44;
      return { x: Math.cos(angle) * dist, z: Math.sin(angle) * dist, s: 0.8 + rand() * 1.1, tone: Math.floor(rand() * AUTUMN.length), spin: rand() * 6 };
    });
  }, []);

  useLayoutEffect(() => {
    const trunk = trunkRef.current;
    const crown = crownRef.current;
    if (!trunk || !crown) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const rand = mulberry32(99);
    data.forEach((tree, i) => {
      // pagórki terenu: wysokość podstawy zgodna z Terrain()
      const d = Math.hypot(tree.x, tree.z);
      const ramp = THREE.MathUtils.smoothstep(d, 16, 48);
      const hills = Math.sin(tree.x * 0.11) * Math.cos(tree.z * 0.09) + 0.5 * Math.sin(tree.x * 0.23 + tree.z * 0.17);
      const baseY = ramp * hills * 4.5;

      q.setFromEuler(new THREE.Euler(0, tree.spin, 0));
      p.set(tree.x, baseY + 1.6 * tree.s, tree.z);
      s.setScalar(tree.s);
      m.compose(p, q, s);
      trunk.setMatrixAt(i, m);

      for (let k = 0; k < 3; k++) {
        const idx = i * 3 + k;
        const r = 1.5 + rand() * 0.8;
        p.set(tree.x + (rand() - 0.5) * 1.6 * tree.s, baseY + (3.4 + k * 1.1) * tree.s, tree.z + (rand() - 0.5) * 1.6 * tree.s);
        s.setScalar(r * tree.s * (1 - k * 0.18));
        m.compose(p, q, s);
        crown.setMatrixAt(idx, m);
        const c = AUTUMN[(tree.tone + k) % AUTUMN.length];
        crown.setColorAt(idx, c);
      }
    });
    trunk.instanceMatrix.needsUpdate = true;
    crown.instanceMatrix.needsUpdate = true;
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
  }, [data]);

  return (
    <>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, TREE_COUNT]} castShadow receiveShadow frustumCulled={false}>
        <cylinderGeometry args={[0.22, 0.36, 3.2, 8]} />
        <meshStandardMaterial color="#4a3326" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, TREE_COUNT * 3]} castShadow frustumCulled={false}>
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </>
  );
}

/* --------------------------------- skały --------------------------------- */

function Rocks() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 26;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const rand = mulberry32(2024);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = 6 + rand() * 24;
      const size = 0.3 + rand() * 0.9;
      const d = Math.hypot(Math.cos(angle) * dist, Math.sin(angle) * dist);
      const ramp = THREE.MathUtils.smoothstep(d, 16, 48);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const hills = Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.5 * Math.sin(x * 0.23 + z * 0.17);
      q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
      p.set(x, ramp * hills * 4.5 + size * 0.25, z);
      s.set(size, size * (0.6 + rand() * 0.4), size * (0.8 + rand() * 0.4));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow frustumCulled={false}>
      <dodecahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color="#7c7468" roughness={0.95} />
    </instancedMesh>
  );
}

/* ------------------------- wolumetryczne smugi światła ------------------------- */

const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const SHAFT_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    float fade = pow(1.0 - vUv.y, 1.5);
    float facing = pow(abs(dot(normalize(vNormalV), normalize(vViewDir))), 1.5);
    float shimmer = 0.7 + 0.3 * sin(uTime * 0.6 + uPhase);
    float a = fade * facing * 0.16 * shimmer;
    gl_FragColor = vec4(uColor, a);
  }
`;

function LightShafts() {
  const shafts = useMemo(() => {
    const rand = mulberry32(55);
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, SUN_DIR);
    return Array.from({ length: 5 }, (_, i) => {
      const x = (rand() - 0.5) * 26;
      const z = (rand() - 0.5) * 26;
      const position = new THREE.Vector3(x, 0, z).addScaledVector(SUN_DIR, 10);
      const material = new THREE.ShaderMaterial({
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        uniforms: { uTime: { value: 0 }, uPhase: { value: i * 1.7 }, uColor: { value: new THREE.Color('#ffd9a0') } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      return { position, quat, material, radius: 1.2 + rand() * 1.6 };
    });
  }, []);

  useEffect(() => () => shafts.forEach((s) => s.material.dispose()), [shafts]);

  useFrame((state) => {
    shafts.forEach((s) => {
      s.material.uniforms.uTime.value = state.clock.elapsedTime;
    });
  });

  return (
    <>
      {shafts.map((s, i) => (
        <mesh key={i} position={s.position} quaternion={s.quat} material={s.material} renderOrder={5}>
          <cylinderGeometry args={[0.4, s.radius, 20, 20, 1, true]} />
        </mesh>
      ))}
    </>
  );
}

/* --------------------------------- liście --------------------------------- */

const LEAF_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  uniform vec3 uWind;
  uniform float uScale;
  attribute vec4 aSeed;
  varying float vAngle;
  varying vec3 vColor;
  void main() {
    vec3 box = vec3(36.0, 14.0, 36.0);
    float fall = uTime * (0.6 + aSeed.x * 0.8);
    vec3 p = vec3(aSeed.x * box.x, aSeed.y * box.y, aSeed.z * box.z);
    p.y = mod(p.y - fall, box.y);
    p.x += sin(uTime * (0.7 + aSeed.w) + aSeed.z * 20.0) * 1.2 + uWind.x * uTime * 0.5;
    p.z += cos(uTime * (0.6 + aSeed.x) + aSeed.y * 17.0) * 1.2 + uWind.z * uTime * 0.5;
    p.xz = uCenter.xz + (mod(p.xz - uCenter.xz + box.xz * 0.5, box.xz) - box.xz * 0.5);
    vAngle = uTime * (0.5 + aSeed.w * 2.0) + aSeed.x * 6.28;
    vColor = mix(vec3(0.9, 0.45, 0.1), vec3(0.75, 0.18, 0.06), aSeed.w) + vec3(0.1, 0.08, 0.0) * aSeed.y;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (0.5 + aSeed.x * 0.6) * uScale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const LEAF_FRAG = /* glsl */ `
  varying float vAngle;
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float c = cos(vAngle);
    float s = sin(vAngle);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
    float d = uv.x * uv.x * 4.0 + uv.y * uv.y * 16.0;
    if (d > 0.25) discard;
    float vein = smoothstep(0.02, 0.0, abs(uv.y)) * 0.3;
    gl_FragColor = vec4(vColor * (1.0 - vein), 1.0);
  }
`;

function FallingLeaves({ count }: { count: number }) {
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const wind = useMemo(() => new THREE.Vector3(), []);

  const { geometry, material } = useMemo(() => {
    const rand = mulberry32(7);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = rand();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const m = new THREE.ShaderMaterial({
      vertexShader: LEAF_VERT,
      fragmentShader: LEAF_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uWind: { value: new THREE.Vector3() },
        uScale: { value: 1 },
      },
    });
    return { geometry: g, material: m };
  }, [count]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uScale.value = size.height * gl.getPixelRatio() * 0.05;
    // Chmura liści podąża za celem kamery (Fado), więc zawsze otacza gracza.
    game.camera.target?.getWorldPosition(material.uniforms.uCenter.value as THREE.Vector3);
    sampleWind(state.clock.elapsedTime, wind);
    (material.uniforms.uWind.value as THREE.Vector3).copy(wind).multiplyScalar(0.5);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/* ---------------------------------- mgła ---------------------------------- */

const MIST_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const MIST_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }
  void main() {
    vec2 uv = vWorld.xz * 0.12 + vec2(uTime * 0.012, uTime * 0.008);
    float n = fbm(uv);
    float radial = 1.0 - smoothstep(18.0, 40.0, length(vWorld.xz));
    float a = smoothstep(0.45, 0.85, n) * uAlpha * radial;
    gl_FragColor = vec4(uColor, a);
  }
`;

function GroundMist() {
  const layers = useMemo(
    () =>
      [0.35, 0.95].map(
        (y, i) =>
          ({
            y,
            material: new THREE.ShaderMaterial({
              vertexShader: MIST_VERT,
              fragmentShader: MIST_FRAG,
              uniforms: { uTime: { value: i * 40 }, uColor: { value: new THREE.Color('#ffe3c2') }, uAlpha: { value: 0.22 - i * 0.07 } },
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          }) as const,
      ),
    [],
  );
  useEffect(() => () => layers.forEach((l) => l.material.dispose()), [layers]);
  useFrame((state) => {
    layers.forEach((l, i) => {
      l.material.uniforms.uTime.value = state.clock.elapsedTime + i * 40;
    });
  });
  return (
    <>
      {layers.map((l, i) => (
        <mesh key={i} position={[0, l.y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={l.material} renderOrder={4}>
          <planeGeometry args={[90, 90]} />
        </mesh>
      ))}
    </>
  );
}

/* ------------------------------ całe otoczenie ------------------------------ */

interface ForestBackdropProps {
  profile: QualityProfile;
}

export function ForestBackdrop({ profile }: ForestBackdropProps) {
  return (
    <>
      <Sky distance={450000} sunPosition={[-12, 6, 8]} turbidity={8} rayleigh={2} mieCoefficient={0.01} mieDirectionalG={0.85} />

      <hemisphereLight args={['#ffe2c4', '#5b4630', 0.85]} />
      <directionalLight
        position={[-12, 14, 8]}
        intensity={3.2}
        color="#ffd9a8"
        castShadow
        shadow-mapSize={[profile.shadowMapSize, profile.shadowMapSize]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <directionalLight position={[10, 6, -10]} intensity={0.6} color="#9ab4ff" />

      <Terrain />
      <Trees />
      <Rocks />
      <LightShafts />
      <GroundMist />
      <FallingLeaves count={profile.leaves} />
      <Sparkles count={profile.sparkles} scale={[24, 6, 24]} size={3} speed={0.3} color="#ffd98a" position={[0, 3, 0]} />

      {/* fizyczne granice areny + podłoże */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[ARENA_HALF * 2, 0.5, ARENA_HALF * 2]} position={[0, -0.5, 0]} />
        <CuboidCollider args={[ARENA_HALF, 3, 0.5]} position={[0, 3, -ARENA_HALF]} />
        <CuboidCollider args={[ARENA_HALF, 3, 0.5]} position={[0, 3, ARENA_HALF]} />
        <CuboidCollider args={[0.5, 3, ARENA_HALF]} position={[-ARENA_HALF, 3, 0]} />
        <CuboidCollider args={[0.5, 3, ARENA_HALF]} position={[ARENA_HALF, 3, 0]} />
      </RigidBody>
    </>
  );
}
