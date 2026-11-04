import * as THREE from 'three';
import { BaseMinigame } from '../../core/BaseMinigame';
import type { GameContext, InputEvent } from '../../core/types';
import { addLighting, box, clamp, dampAngle, glow, makeFado, mat, Particles, sphere, type FadoActor } from '../kit';

interface Tile {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  reveal: number;
  seen: boolean;
}
interface Ripple {
  t: number;
  origin: THREE.Vector3;
}

const SPEED = 4.2;
const RIPPLE_SPEED = 14;
const RIPPLE_MAX = 16;
const BONE_SONARS = 8;
const LIVES = 5;

/** Poziom 12: sonar z szczeknięcia odsłania platformy nad przepaścią. */
export class Game12Echo extends BaseMinigame {
  readonly id = 12;

  private fado!: FadoActor;
  private fx!: Particles;
  private tiles: Tile[] = [];
  private ripples: Ripple[] = [];
  private ringMesh!: THREE.Mesh;
  private pos = new THREE.Vector3(0, 0, 0);
  private target: THREE.Vector3 | null = null;
  private checkpoint = new THREE.Vector3();
  private falling = 0;
  private sonars = 0;
  private falls = 0;
  private exit = new THREE.Vector3(0, 0, -45.5);
  private exitLight!: THREE.Mesh;
  private pings = 0;

  protected onInitialize(ctx: GameContext): void {
    ctx.env.set('sewer');
    addLighting(ctx, { sky: '#16303a', ground: '#050708', hemi: 0.25, sun: '#4cc9f0', sunIntensity: 0.35, sunPos: [0, 12, 4] });
    const lamp = new THREE.PointLight('#4cc9f0', 6, 9, 2);
    lamp.name = 'fado-light';
    ctx.root.add(lamp);
    this.lamp = lamp;

    // układ platform: ścieżka główna z odnogami i ślepymi zaułkami
    const rects: Array<[number, number, number, number]> = [
      [0, 0, 3, 3], [0, -6.5, 1.1, 3.5], [0, -12, 3.5, 2.5], [-5.5, -12, 2.5, 1.1], [-9, -12, 2.5, 3],
      [-9, -18.5, 1.1, 3.5], [-5, -22.5, 4, 2], [3, -22.5, 4.5, 1.1], [7, -26, 1.1, 3], [7, -31, 3, 2.5],
      [1.5, -31, 3, 1.1], [-2, -35.4, 1.1, 4.6], [0.5, -36, 3.5, 1.2], [0, -41, 3, 1.8], [0, -45.5, 3.5, 3.5],
      [6, -12, 3, 1.1], [10, -9, 2.5, 3], [-5, -27, 2.5, 3], [-10, -23, 2, 1.1],
    ];
    const edgeMat = new THREE.LineBasicMaterial({ color: '#4cc9f0', transparent: true, opacity: 0 });
    for (const [cx, cz, hx, hz] of rects) {
      const m = new THREE.MeshBasicMaterial({ color: '#4cc9f0', transparent: true, opacity: 0.02 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 0.4, hz * 2), m);
      mesh.position.set(cx, -0.2, cz);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat.clone());
      edges.position.copy(mesh.position);
      ctx.root.add(mesh, edges);
      this.tiles.push({ cx, cz, hx, hz, mesh, edges, reveal: 0, seen: false });
    }

    // woda w dole i krople
    const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: '#0a1c22', roughness: 0.2, metalness: 0.6 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -4, -20);
    ctx.root.add(water);

    this.exitLight = sphere(0.5, glow('#7bff9b', 3), [this.exit.x, 1.6, this.exit.z]);
    ctx.root.add(this.exitLight);
    const exitL = new THREE.PointLight('#7bff9b', 20, 18, 2);
    exitL.position.copy(this.exitLight.position);
    ctx.root.add(exitL);
    ctx.root.add(box(0.2, 3, 0.2, mat('#2a3a3f'), [this.exit.x - 1.5, 1.5, this.exit.z - 2.5]), box(0.2, 3, 0.2, mat('#2a3a3f'), [this.exit.x + 1.5, 1.5, this.exit.z - 2.5]));

    this.ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: '#8fe9ff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.ringMesh.rotation.x = -Math.PI / 2;
    ctx.root.add(this.ringMesh);

    this.fado = makeFado(ctx, { scale: 0.8 });
    this.fado.rig.setLighting({ color: '#8fe9ff', sky: '#2a5a6a', ground: '#04080a' });
    this.fx = new Particles(160);
    ctx.root.add(this.fx.points);
    this.checkpoint.copy(this.pos);
    this.fado.group.position.copy(this.pos);

    ctx.camera.setTarget(this.fado.group);
    ctx.camera.apply({ offset: [0, 9, 7.5], look: [0, 0, -3.5], fov: 46, bokeh: 1.4, duration: 0 });
    ctx.hud.setObjective('Dojdź do zielonego światła');
    ctx.hud.setActions([{ id: 'bark', label: 'Sonar', icon: '🔊' }]);
    ctx.hud.showHint('Szczeknij, by zobaczyć platformy. Stuknij, dokąd iść.');
    ctx.hud.setCourage(1);
    // pierwszy ping na start, by gracz zrozumiał mechanikę
    this.ping(false);
  }

  private lamp!: THREE.PointLight;

  startGame(): void {
    this.ctx.audio.music('night');
    this.ctx.audio.setMusicIntensity(0.25);
    void this.ctx.input.enableMicrophone();
  }

  handleInput(e: InputEvent): void {
    if (this.falling > 0) return;
    if ((e.type === 'action' && e.id === 'bark') || (e.type === 'sound' && e.kind === 'bark')) {
      this.ping(true);
    } else if (e.type === 'tap') {
      const p = this.ctx.groundPoint(e.nx, e.ny, 0);
      if (p) {
        this.target = p.clone();
        this.ctx.audio.sfx('tick', { gain: 0.25 });
      }
    }
  }

  private ping(counts: boolean): void {
    const ctx = this.ctx;
    if (counts) {
      this.sonars++;
      ctx.hud.showHint(`Sonar: ${this.sonars} / ${BONE_SONARS} (do Złotej Kości)`);
    }
    this.ripples.push({ t: 0, origin: this.pos.clone() });
    ctx.audio.sfx('sonar');
    ctx.audio.sfx('bark', { gain: 0.5 });
    ctx.haptics.impact('medium');
    ctx.camera.punchFov(2);
    this.fado.rig.motion.expression = 'alert';
    this.pings++;
  }

  private inside(x: number, z: number, margin = -0.15): boolean {
    for (const t of this.tiles) {
      if (Math.abs(x - t.cx) <= t.hx + margin && Math.abs(z - t.cz) <= t.hz + margin) return true;
    }
    return false;
  }

  protected onUpdate(dt: number): void {
    const ctx = this.ctx;
    const t = this.elapsed;
    const g = this.fado.group;
    const m = this.fado.rig.motion;

    // fale sonaru
    const ring = this.ripples[this.ripples.length - 1];
    for (const r of this.ripples) {
      r.t += dt;
      const radius = r.t * RIPPLE_SPEED;
      for (const tile of this.tiles) {
        // najbliższy punkt prostokąta od źródła fali
        const dx = Math.max(Math.abs(r.origin.x - tile.cx) - tile.hx, 0);
        const dz = Math.max(Math.abs(r.origin.z - tile.cz) - tile.hz, 0);
        if (Math.hypot(dx, dz) <= radius && Math.hypot(dx, dz) < RIPPLE_MAX) {
          tile.reveal = Math.max(tile.reveal, 1 - Math.hypot(dx, dz) / (RIPPLE_MAX * 1.4));
          tile.seen = true;
        }
      }
    }
    this.ripples = this.ripples.filter((r) => r.t * RIPPLE_SPEED < RIPPLE_MAX + 4);
    const ringMat = this.ringMesh.material as THREE.MeshBasicMaterial;
    if (ring && ring.t * RIPPLE_SPEED < RIPPLE_MAX) {
      this.ringMesh.position.set(ring.origin.x, 0.05, ring.origin.z);
      this.ringMesh.scale.setScalar(Math.max(0.1, ring.t * RIPPLE_SPEED));
      ringMat.opacity = 0.7 * (1 - (ring.t * RIPPLE_SPEED) / RIPPLE_MAX);
    } else ringMat.opacity = 0;

    // platformy gasną po kilku sekundach, ale pamięć ich obrysu zostaje bardzo słaba
    const decay = ctx.assist > 1 ? 0.12 : 0.2;
    for (const tile of this.tiles) {
      tile.reveal = Math.max(0, tile.reveal - decay * dt);
      const a = tile.reveal;
      (tile.mesh.material as THREE.MeshBasicMaterial).opacity = 0.03 + a * 0.55;
      (tile.edges.material as THREE.LineBasicMaterial).opacity = (tile.seen ? 0.07 : 0) + a * 0.95;
    }

    if (this.falling > 0) {
      this.falling -= dt;
      g.position.y -= 7 * dt;
      m.expression = 'scared';
      if (this.falling <= 0) {
        this.pos.copy(this.checkpoint);
        g.position.copy(this.pos);
        this.target = null;
        m.expression = 'idle';
      }
    } else {
      m.speed = 0;
      if (this.target) {
        const dx = this.target.x - this.pos.x;
        const dz = this.target.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.2) this.target = null;
        else {
          const step = Math.min(d, SPEED * dt);
          this.pos.x += (dx / d) * step;
          this.pos.z += (dz / d) * step;
          g.rotation.y = dampAngle(g.rotation.y, Math.atan2(dx, dz), 12, dt);
          m.speed = 0.75;
          m.expression = 'run';
          if (Math.random() < dt * 4) ctx.audio.sfx('step', { gain: 0.2 });
        }
      } else if (m.expression !== 'alert') m.expression = 'sniff';

      if (!this.inside(this.pos.x, this.pos.z)) {
        this.fall();
      } else {
        // zapisz checkpoint na środku aktualnej platformy
        for (const tile of this.tiles) {
          if (Math.abs(this.pos.x - tile.cx) < tile.hx - 0.3 && Math.abs(this.pos.z - tile.cz) < tile.hz - 0.3) {
            if (tile.hx > 1.5 && tile.hz > 1.5) this.checkpoint.set(tile.cx, 0, tile.cz);
            else this.checkpoint.copy(this.pos);
            break;
          }
        }
        g.position.set(this.pos.x, 0, this.pos.z);
      }
    }
    if (m.expression === 'alert' && Math.random() < dt * 2) m.expression = 'sniff';

    this.lamp.position.set(this.pos.x, 2.2, this.pos.z);
    this.exitLight.scale.setScalar(1 + Math.sin(t * 4) * 0.2);
    ctx.hud.setProgress(clamp(1 - Math.abs(this.pos.z - this.exit.z) / Math.abs(this.exit.z), 0, 1));
    ctx.haptics.setProximity(1 - clamp(this.pos.distanceTo(this.exit) / 25, 0, 1));
    this.fado.rig.update(dt, t);
    this.fx.update(dt, ctx);

    if (Math.hypot(this.pos.x - this.exit.x, this.pos.z - this.exit.z) < 2.2 && this.falling <= 0) {
      if (this.sonars <= BONE_SONARS) this.collectGoldenBone();
      this.win({ stars: this.falls === 0 ? 3 : this.falls <= 2 ? 2 : 1 });
    }
  }

  private fall(): void {
    const ctx = this.ctx;
    this.falling = 1.0;
    this.falls++;
    ctx.audio.sfx('splash');
    ctx.audio.sfx('whine', { gain: 0.5 });
    ctx.haptics.pattern([50, 30, 90]);
    ctx.camera.shake(0.5, 0.5);
    ctx.hud.setCourage(1 - this.falls / (LIVES * ctx.assist));
    this.fx.emit(new THREE.Vector3(this.pos.x, -1, this.pos.z), { count: 30, speed: 4, life: 0.8, size: 0.14, color: '#7fd0e0', gravity: 8, dir: new THREE.Vector3(0, 2, 0) });
    this.fado.rig.motion.expression = 'scared';
    if (this.falls >= LIVES * ctx.assist) this.lose();
  }

  protected onCleanup(): void {
    this.ctx.input.disableMicrophone();
    this.ctx.scent.clearTrails();
    this.fado.rig.dispose();
  }
}
