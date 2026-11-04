import * as THREE from 'three';
import { sampleWind } from '../environment/wind';

const SEGMENT_LENGTH = 0.055;
const WIDTH = 0.1;
const COLOR_A = new THREE.Color('#ffcf2e');
const COLOR_B = new THREE.Color('#f0a81c');

/**
 * Szalik Klary jako łańcuch Verleta (więzy odległości, grawitacja, wiatr)
 * renderowany jako falująca wstęga. Współrzędne symulacji są światowe,
 * więc `mesh` należy dodać do korzenia sceny (nie do grupy psa).
 */
export class ScarfRig {
  readonly mesh: THREE.Mesh;
  groundY = 0.03;

  private readonly pos: THREE.Vector3[];
  private readonly prev: THREE.Vector3[];
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  private initialised = false;

  private readonly tmpWind = new THREE.Vector3();
  private readonly tmpTangent = new THREE.Vector3();
  private readonly tmpSide = new THREE.Vector3();
  private readonly tmpRef = new THREE.Vector3();
  private readonly tmpNormal = new THREE.Vector3();
  private readonly tmpDelta = new THREE.Vector3();

  constructor(
    private scale: number,
    private readonly segments = 18,
  ) {
    this.pos = Array.from({ length: segments }, () => new THREE.Vector3());
    this.prev = Array.from({ length: segments }, () => new THREE.Vector3());

    const vertexCount = segments * 2;
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const colors = new Float32Array(vertexCount * 3);
    const c = new THREE.Color();
    for (let i = 0; i < segments; i++) {
      c.copy(COLOR_A).lerp(COLOR_B, i / (segments - 1));
      colors.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    }
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const index: number[] = [];
    for (let i = 0; i < segments - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(index);

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'Scarf';
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  /** Wymusza ponowne ułożenie szalika (np. po teleportacji psa). */
  reset(): void {
    this.initialised = false;
  }

  update(dt: number, t: number, anchor: THREE.Vector3): void {
    const step = Math.min(dt, 1 / 30);
    if (step <= 0) return;
    const { pos, prev, segments } = this;
    const rest = SEGMENT_LENGTH * this.scale;

    // Teleportacja: jeśli pierwszy wolny punkt jest bardzo daleko od kotwicy, układamy łańcuch od nowa.
    if (this.initialised && pos[1].distanceTo(anchor) > rest * 8) this.initialised = false;

    if (!this.initialised) {
      for (let i = 0; i < segments; i++) {
        pos[i].set(anchor.x, anchor.y - i * rest * 0.2, anchor.z - i * rest * 0.97);
        prev[i].copy(pos[i]);
      }
      this.initialised = true;
    }

    sampleWind(t, this.tmpWind);

    const substeps = 2;
    const h = step / substeps;
    for (let s = 0; s < substeps; s++) {
      pos[0].copy(anchor);
      prev[0].copy(anchor);

      for (let i = 1; i < segments; i++) {
        const p = pos[i];
        const q = prev[i];
        const vx = (p.x - q.x) * 0.985;
        const vy = (p.y - q.y) * 0.985;
        const vz = (p.z - q.z) * 0.985;
        q.copy(p);
        const k = 0.4 + (i / segments) * 0.9;
        const turbulence = Math.sin(t * 6 + i * 0.7) * 0.6;
        p.x += vx + (this.tmpWind.x * 2.4 * k + turbulence * 0.3) * h * h;
        p.y += vy + (-5.5 * this.scale + turbulence * 0.4) * h * h;
        p.z += vz + this.tmpWind.z * 2.4 * k * h * h;
      }

      for (let iter = 0; iter < 5; iter++) {
        pos[0].copy(anchor);
        for (let i = 0; i < segments - 1; i++) {
          const a = pos[i];
          const b = pos[i + 1];
          this.tmpDelta.subVectors(b, a);
          const dist = this.tmpDelta.length() || 1e-6;
          const diff = (dist - rest) / dist;
          if (i === 0) {
            b.addScaledVector(this.tmpDelta, -diff);
          } else {
            a.addScaledVector(this.tmpDelta, diff * 0.5);
            b.addScaledVector(this.tmpDelta, -diff * 0.5);
          }
        }
      }

      for (let i = 1; i < segments; i++) if (pos[i].y < this.groundY) pos[i].y = this.groundY;
    }

    const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const normals = this.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const halfWidth = (WIDTH * this.scale) / 2;

    for (let i = 0; i < segments; i++) {
      const a = pos[Math.max(0, i - 1)];
      const b = pos[Math.min(segments - 1, i + 1)];
      this.tmpTangent.subVectors(b, a).normalize();
      this.tmpRef.set(Math.sin(i * 0.7 - t * 4) * 0.6, 1, Math.cos(i * 0.7 - t * 3.3) * 0.6);
      this.tmpSide.crossVectors(this.tmpTangent, this.tmpRef);
      if (this.tmpSide.lengthSq() < 1e-6) this.tmpSide.set(1, 0, 0);
      this.tmpSide.normalize().multiplyScalar(halfWidth * (i > segments - 4 ? 0.85 : 1));
      this.tmpNormal.crossVectors(this.tmpSide, this.tmpTangent).normalize();

      const p = pos[i];
      positions.setXYZ(i * 2, p.x - this.tmpSide.x, p.y - this.tmpSide.y, p.z - this.tmpSide.z);
      positions.setXYZ(i * 2 + 1, p.x + this.tmpSide.x, p.y + this.tmpSide.y, p.z + this.tmpSide.z);
      normals.setXYZ(i * 2, this.tmpNormal.x, this.tmpNormal.y, this.tmpNormal.z);
      normals.setXYZ(i * 2 + 1, this.tmpNormal.x, this.tmpNormal.y, this.tmpNormal.z);
    }
    positions.needsUpdate = true;
    normals.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
