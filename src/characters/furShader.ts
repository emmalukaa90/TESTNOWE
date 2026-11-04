import * as THREE from 'three';

/** Część ciała wyznacza wzór umaszczenia beagle'a (trójkolorowy). */
export type FurPartId = 'torso' | 'head' | 'muzzle' | 'leg' | 'tail' | 'ear';
const PART_INDEX: Record<FurPartId, number> = { torso: 0, head: 1, muzzle: 2, leg: 3, tail: 4, ear: 5 };

export interface FurPalette {
  brown: string;
  black: string;
  white: string;
}

export const BEAGLE_PALETTE: FurPalette = { brown: '#8a4b22', black: '#1c1512', white: '#f4ede2' };

/** Uniformy współdzielone przez wszystkie warstwy i części jednego psa. */
export interface FurShared {
  uTime: { value: number };
  uWind: { value: THREE.Vector3 };
  uLightDir: { value: THREE.Vector3 };
  uLightColor: { value: THREE.Color };
  uSky: { value: THREE.Color };
  uGround: { value: THREE.Color };
  uBrown: { value: THREE.Color };
  uBlack: { value: THREE.Color };
  uWhite: { value: THREE.Color };
  /** błoto: x = tułów, y = głowa i uszy, z = łapy, w = ogon (0..1) */
  uMud: { value: THREE.Vector4 };
  uMudColor: { value: THREE.Color };
}

export function createFurShared(palette: Partial<FurPalette> = {}): FurShared {
  const p = { ...BEAGLE_PALETTE, ...palette };
  return {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector3() },
    uLightDir: { value: new THREE.Vector3(-12, 14, 8).normalize() },
    uLightColor: { value: new THREE.Color('#ffd9a8') },
    uSky: { value: new THREE.Color('#ffe2c4') },
    uGround: { value: new THREE.Color('#5b4630') },
    uBrown: { value: new THREE.Color(p.brown) },
    uBlack: { value: new THREE.Color(p.black) },
    uWhite: { value: new THREE.Color(p.white) },
    uMud: { value: new THREE.Vector4(0, 0, 0, 0) },
    uMudColor: { value: new THREE.Color('#4a3420') },
  };
}

const VERT = /* glsl */ `
  uniform float uLayer;
  uniform float uLength;
  uniform float uDroop;
  uniform float uTime;
  uniform vec3 uWind;
  varying vec3 vObj;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  varying vec3 vViewPos;

  void main() {
    vObj = position;
    vUv = uv;
    vec3 displaced = position + normal * uLength * uLayer;
    vec4 wp = modelMatrix * vec4(displaced, 1.0);
    float l2 = uLayer * uLayer;
    wp.xyz += vec3(0.0, -1.0, 0.0) * uDroop * l2;
    wp.xyz += uWind * l2 * (0.6 + 0.4 * sin(uTime * 3.0 + wp.x * 4.0 + wp.z * 3.0));
    vNormalV = normalize(normalMatrix * normal);
    vNormalW = normalize((vec4(vNormalV, 0.0) * viewMatrix).xyz);
    vec4 mv = viewMatrix * wp;
    vViewPos = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uLayer;
  uniform float uDensity;
  uniform int uPart;
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uSky;
  uniform vec3 uGround;
  uniform vec3 uBrown;
  uniform vec3 uBlack;
  uniform vec3 uWhite;
  uniform vec4 uMud;
  uniform vec3 uMudColor;
  varying vec3 vObj;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  varying vec3 vViewPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  vec3 albedoFor(int part, vec3 p) {
    float n = (hash(floor(p.xz * 6.0 + p.y * 4.0)) - 0.5) * 0.12;
    if (part == 0) {
      float saddle = smoothstep(0.05 + n, 0.35 + n, p.y) * smoothstep(-0.95, -0.35, p.z);
      float rump = smoothstep(0.2, 0.7, -p.z);
      float belly = smoothstep(-0.15 + n, -0.45 + n, p.y);
      float chest = smoothstep(0.45, 0.85, p.z) * smoothstep(0.3, -0.2, p.y);
      vec3 c = mix(uBrown, uBlack, saddle * (1.0 - rump * 0.8));
      c = mix(c, uWhite, belly);
      return mix(c, uWhite, chest);
    }
    if (part == 1) {
      float blaze = (1.0 - smoothstep(0.08, 0.2, abs(p.x))) * smoothstep(0.0, 0.5, p.z) * smoothstep(-0.2, 0.5, p.y);
      return mix(uBrown, uWhite, blaze);
    }
    if (part == 2) {
      float top = smoothstep(0.3, 0.8, p.y);
      return mix(uWhite, uBrown, top * 0.6);
    }
    if (part == 3) {
      float lower = smoothstep(0.1, -0.35, p.y);
      return mix(uBrown, uWhite, lower);
    }
    if (part == 4) {
      float tip = smoothstep(0.35, 0.7, p.y);
      return mix(uBrown, uWhite, tip);
    }
    return uBrown * 0.82;
  }

  void main() {
    vec2 grid = vUv * uDensity;
    if (uLayer > 0.0) {
      vec2 cell = floor(grid);
      float strand = hash(cell);
      vec2 f = fract(grid) - 0.5;
      if (strand < uLayer || length(f) > 0.5 * (1.0 - uLayer)) discard;
    }

    vec3 N = normalize(vNormalV);
    vec3 V = normalize(vViewPos);
    vec3 L = normalize((viewMatrix * vec4(uLightDir, 0.0)).xyz);
    float diffuse = clamp((dot(N, L) + 0.5) / 1.5, 0.0, 1.0);
    vec3 ambient = mix(uGround, uSky, normalize(vNormalW).y * 0.5 + 0.5) * 0.85;
    float ao = mix(0.45, 1.0, uLayer);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.35;

    vec3 albedo = albedoFor(uPart, vObj);

    float mudAmount = uMud.x;
    if (uPart == 1 || uPart == 2 || uPart == 5) mudAmount = uMud.y;
    else if (uPart == 3) mudAmount = uMud.z;
    else if (uPart == 4) mudAmount = uMud.w;
    float blot = 0.4 + 0.6 * hash(floor(vObj.xz * 5.0 + vObj.y * 3.0));
    float mud = clamp(mudAmount * blot * 1.4, 0.0, 1.0);
    albedo = mix(albedo, uMudColor, mud);

    vec3 color = albedo * (ambient + uLightColor * diffuse * 0.9) * ao + uLightColor * rim * 0.35 * (1.0 - mud);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const sphereCache = new Map<string, THREE.SphereGeometry>();
function unitSphere(w: number, h: number): THREE.SphereGeometry {
  const key = `${w}x${h}`;
  let g = sphereCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(1, w, h);
    sphereCache.set(key, g);
  }
  return g;
}

export interface FurPartOptions {
  part: FurPartId;
  shared: FurShared;
  layers: number;
  /** długość włosa w jednostkach sfery jednostkowej */
  length?: number;
  /** gęstość pasm (komórek UV) */
  density?: number;
  droop?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** promienie elipsoidy */
  scale: [number, number, number];
  segments?: [number, number];
}

/**
 * Elipsoida z futrem metodą powłok (shell fur): warstwa 0 to skóra (rzuca cień),
 * kolejne warstwy są wypychane wzdłuż normalnych z odrzucaniem pikseli (kępki włosów).
 * Materiały są dopisywane do `materials`, by właściciel mógł je zwolnić.
 */
export function createFurPart(o: FurPartOptions, materials: THREE.ShaderMaterial[]): THREE.Group {
  const group = new THREE.Group();
  if (o.position) group.position.set(...o.position);
  if (o.rotation) group.rotation.set(...o.rotation);
  group.scale.set(...o.scale);

  const geometry = unitSphere(o.segments?.[0] ?? 28, o.segments?.[1] ?? 20);
  const count = Math.max(1, o.layers);
  for (let i = 0; i < count; i++) {
    const layer = count === 1 ? 0 : i / (count - 1);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...o.shared,
        uLayer: { value: layer },
        uLength: { value: o.length ?? 0.07 },
        uDroop: { value: o.droop ?? 0.01 },
        uDensity: { value: o.density ?? 90 },
        uPart: { value: PART_INDEX[o.part] },
      },
    });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = i === 0;
    group.add(mesh);
  }
  return group;
}
