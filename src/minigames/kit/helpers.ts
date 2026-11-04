import * as THREE from 'three';
import type { GameContext } from '../../core/types';

export const { clamp, lerp, damp, smoothstep, inverseLerp } = THREE.MathUtils;

export const TAU = Math.PI * 2;

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Najkrótsza droga kątowa do celu, wygładzona wykładniczo. */
export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return current + wrapAngle(target - current) * (1 - Math.exp(-lambda * dt));
}

export function rand(ctx: GameContext, min: number, max: number): number {
  return min + (max - min) * ctx.random();
}

export function pick<T>(ctx: GameContext, items: readonly T[]): T {
  return items[Math.floor(ctx.random() * items.length) % items.length];
}

export function shuffle<T>(ctx: GameContext, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------- materiały ------------------------------- */

export function mat(color: THREE.ColorRepresentation, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
}

export function glow(color: THREE.ColorRepresentation, intensity = 1.5): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

/* --------------------------------- meshe --------------------------------- */

function finish(m: THREE.Mesh, pos?: readonly [number, number, number], shadows = true): THREE.Mesh {
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

export function box(w: number, h: number, d: number, material: THREE.Material, pos?: readonly [number, number, number]): THREE.Mesh {
  return finish(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), pos);
}

export function sphere(r: number, material: THREE.Material, pos?: readonly [number, number, number], seg = 16): THREE.Mesh {
  return finish(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1)), material), pos);
}

export function cyl(rTop: number, rBottom: number, h: number, material: THREE.Material, pos?: readonly [number, number, number], seg = 14): THREE.Mesh {
  return finish(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material), pos);
}

export function cone(r: number, h: number, material: THREE.Material, pos?: readonly [number, number, number], seg = 12): THREE.Mesh {
  return finish(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material), pos);
}

export function plane(w: number, h: number, material: THREE.Material, pos?: readonly [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

export function roundedBox(w: number, h: number, d: number, r: number, material: THREE.Material, pos?: readonly [number, number, number]): THREE.Mesh {
  // tani zamiennik zaokrąglonego pudełka: sfera/walce dają miękkie krawędzie bez zależności
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const half = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const inner = v.clone().clamp(half.clone().negate(), half);
    const dir = v.clone().sub(inner);
    if (dir.lengthSq() > 0) dir.normalize().multiplyScalar(r);
    p.setXYZ(i, inner.x + dir.x, inner.y + dir.y, inner.z + dir.z);
  }
  g.computeVertexNormals();
  return finish(new THREE.Mesh(g, material), pos);
}

/* ------------------------------ światło, scena ------------------------------ */

export interface LightingOptions {
  sky?: THREE.ColorRepresentation;
  ground?: THREE.ColorRepresentation;
  hemi?: number;
  sun?: THREE.ColorRepresentation;
  sunIntensity?: number;
  sunPos?: readonly [number, number, number];
  shadowSize?: number;
  shadowRange?: number;
}

/** Półsfera + słońce z cieniami; zwraca kierunek światła do ustawienia futra Fado. */
export function addLighting(ctx: GameContext, o: LightingOptions = {}): { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; dir: THREE.Vector3 } {
  const hemi = new THREE.HemisphereLight(o.sky ?? '#ffe2c4', o.ground ?? '#5b4630', o.hemi ?? 0.9);
  const sun = new THREE.DirectionalLight(o.sun ?? '#ffd9a8', o.sunIntensity ?? 3);
  const pos = o.sunPos ?? [-8, 12, 6];
  sun.position.set(pos[0], pos[1], pos[2]);
  sun.castShadow = ctx.quality !== 'low';
  const size = ctx.quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(size, size);
  const range = o.shadowRange ?? 16;
  sun.shadow.camera.left = -range;
  sun.shadow.camera.right = range;
  sun.shadow.camera.top = range;
  sun.shadow.camera.bottom = -range;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  ctx.root.add(hemi, sun, sun.target);
  return { hemi, sun, dir: sun.position.clone().normalize() };
}

/** Niewidoczny punkt, za którym podąża kamera. */
export function cameraAnchor(ctx: GameContext, x = 0, y = 0, z = 0): THREE.Object3D {
  const a = new THREE.Object3D();
  a.position.set(x, y, z);
  ctx.root.add(a);
  ctx.camera.setTarget(a);
  return a;
}

/* --------------------------- Złota Kość i drobiazgi --------------------------- */

export function goldenBone(size = 1): THREE.Group {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: '#ffcf2e', emissive: '#ff9d00', emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.25 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 12), gold);
  shaft.rotation.z = Math.PI / 2;
  g.add(shaft);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), gold);
      knob.position.set(sx * 0.27, 0, sz * 0.08);
      g.add(knob);
    }
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  g.scale.setScalar(size);
  return g;
}

/** Animacja obrotu i unoszenia pickupów. */
export function spinBob(obj: THREE.Object3D, t: number, baseY: number, speed = 2, amp = 0.12): void {
  obj.rotation.y = t * speed;
  obj.position.y = baseY + Math.sin(t * speed * 1.4) * amp;
}

/** Ekran 2D (-1..1) na współrzędne płaszczyzny XZ; zwraca null, gdy promień jej nie przecina. */
export function screenToGround(ctx: GameContext, nx: number, ny: number, y = 0): THREE.Vector3 | null {
  return ctx.groundPoint(nx, ny, y);
}

/** Drewniane/kamienne tło „tablicy” z miękkim światłem — wspólna podłoga dla gier płaskich. */
export function floor(ctx: GameContext, color: THREE.ColorRepresentation, w: number, d: number, y = 0, cx = 0, cz = 0): THREE.Mesh {
  const m = plane(w, d, mat(color, { roughness: 1 }), [cx, y, cz]);
  ctx.root.add(m);
  return m;
}

/** Proste drzewo/krzew do dekoracji (stożki + pień). */
export function pineTree(h = 3, trunk = '#5a3d28', leaf = '#2f5a3a'): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.12, 0.18, h * 0.35, mat(trunk), [0, h * 0.175, 0], 8));
  const lm = mat(leaf, { roughness: 0.9 });
  for (let i = 0; i < 3; i++) g.add(cone(h * (0.34 - i * 0.07), h * 0.42, lm, [0, h * (0.4 + i * 0.22), 0], 9));
  return g;
}

/** Rozstawia dekoracje wokół obszaru gry (nie wchodzą w pole gry |x|<clear). */
export function scatter(ctx: GameContext, make: () => THREE.Object3D, count: number, area: { x: [number, number]; z: [number, number] }, clear?: { x: number; z0?: number; z1?: number }): void {
  for (let i = 0; i < count; i++) {
    const x = rand(ctx, area.x[0], area.x[1]);
    const z = rand(ctx, area.z[0], area.z[1]);
    if (clear && Math.abs(x) < clear.x && z > (clear.z0 ?? -1e9) && z < (clear.z1 ?? 1e9)) continue;
    const o = make();
    o.position.set(x, o.position.y, z);
    o.rotation.y = ctx.random() * TAU;
    const s = 0.8 + ctx.random() * 0.6;
    o.scale.multiplyScalar(s);
    ctx.root.add(o);
  }
}
