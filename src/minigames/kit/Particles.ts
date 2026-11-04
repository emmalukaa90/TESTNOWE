import * as THREE from 'three';
import type { GameContext } from '../../core/types';

export interface ParticleBurst {
  count?: number;
  speed?: number;
  spread?: number;
  life?: number;
  size?: number;
  gravity?: number;
  color?: THREE.ColorRepresentation;
  dir?: THREE.Vector3;
}

/**
 * Pula cząsteczek na jednym THREE.Points (jeden draw call). Kolor i rozmiar per cząsteczka,
 * rozmiar zanika z życiem. Używana do iskier, rozbryzgów, kurzu, deszczu, mgły i konfetti.
 */
export class Particles {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly base: Float32Array;
  private readonly grav: Float32Array;
  private cursor = 0;
  private readonly c = new THREE.Color();

  constructor(
    readonly capacity: number,
    options: { additive?: boolean; map?: boolean; opacity?: number } = {},
  ) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.base = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.pos[i * 3 + 1] = -9999;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: options.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: { uScale: { value: 400 }, uOpacity: { value: options.opacity ?? 1 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = color;
          vAlpha = aSize > 0.0 ? 1.0 : 0.0;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uOpacity;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          if (d > 0.5 || vAlpha < 0.5) discard;
          float a = smoothstep(0.5, 0.05, d) * uOpacity;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
  }

  emit(origin: THREE.Vector3, o: ParticleBurst = {}): void {
    const n = o.count ?? 12;
    this.c.set(o.color ?? '#ffffff');
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const spread = o.spread ?? 1;
      const speed = o.speed ?? 2;
      let vx = (Math.random() - 0.5) * 2 * spread;
      let vy = (Math.random() - 0.5) * 2 * spread;
      let vz = (Math.random() - 0.5) * 2 * spread;
      if (o.dir) {
        vx += o.dir.x;
        vy += o.dir.y;
        vz += o.dir.z;
      }
      const l = Math.hypot(vx, vy, vz) || 1;
      const sp = speed * (0.5 + Math.random() * 0.7);
      this.vel[i * 3] = (vx / l) * sp;
      this.vel[i * 3 + 1] = (vy / l) * sp;
      this.vel[i * 3 + 2] = (vz / l) * sp;
      this.pos[i * 3] = origin.x;
      this.pos[i * 3 + 1] = origin.y;
      this.pos[i * 3 + 2] = origin.z;
      this.col[i * 3] = this.c.r;
      this.col[i * 3 + 1] = this.c.g;
      this.col[i * 3 + 2] = this.c.b;
      const life = (o.life ?? 0.7) * (0.7 + Math.random() * 0.6);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.base[i] = (o.size ?? 0.15) * (0.7 + Math.random() * 0.6);
      this.size[i] = this.base[i];
      this.grav[i] = o.gravity ?? 0;
    }
  }

  update(dt: number, ctx?: GameContext): void {
    if (ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.setViewHeight(ctx.view.height * dpr, ctx.camera.rig.fov);
    }
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.life[i] > 0 ? this.base[i] * (0.25 + 0.75 * k) : 0;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  /** Skala punktu zależna od wysokości widoku (wywołaj raz, np. po initialize). */
  setViewHeight(px: number, fov: number): void {
    const u = (this.points.material as THREE.ShaderMaterial).uniforms.uScale;
    u.value = px / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }
}
