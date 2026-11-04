import * as THREE from 'three';
import { getMinigameMeta } from '../data/campaign';
import type { AudioManager } from '../systems/AudioManager';
import type { HapticController } from '../systems/HapticController';
import type { InputAndSensorManager } from '../systems/InputAndSensorManager';
import type { ScentController } from '../systems/scent/ScentController';
import type { CameraDirector } from './CameraDirector';
import { disposeObject3D } from './dispose';
import type { EnvironmentDirector } from './EnvironmentDirector';
import type { EventBus } from './EventBus';
import type { PhysicsHandle } from './PhysicsHandle';
import { mulberry32 } from './random';
import type { SaveSystem } from './SaveSystem';
import type {
  FinishStats,
  GameContext,
  GameEvents,
  IMinigame,
  MinigameHud,
  MinigameMeta,
  MinigameResult,
  ViewHandle,
} from './types';

export type MinigameFactory = () => IMinigame;

export interface MinigameManagerDeps {
  root: THREE.Group;
  events: EventBus<GameEvents>;
  input: InputAndSensorManager;
  haptics: HapticController;
  audio: AudioManager;
  scent: ScentController;
  camera: CameraDirector;
  env: EnvironmentDirector;
  physics: PhysicsHandle;
  hud: MinigameHud;
  view: ViewHandle;
  save: SaveSystem;
}

/** Mnożnik wyrozumiałości w trybie pomocy. */
export const ASSIST_FACTOR = 1.4;

/**
 * Wzorzec Minigame Manager: rejestr fabryk, cykl życia modułu
 * (initialize -> startGame -> updateLoop/handleInput -> onWin|onLose -> cleanup)
 * i pewne zwalnianie zasobów po każdej minigrze.
 */
export class MinigameManager {
  private readonly registry = new Map<number, MinigameFactory>();
  private active: IMinigame | null = null;
  private meta: MinigameMeta | null = null;
  private started = false;
  private paused = false;
  private finished = false;
  private elapsed = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  constructor(private readonly deps: MinigameManagerDeps) {}

  register(id: number, factory: MinigameFactory): void {
    if (!getMinigameMeta(id)) throw new Error(`[minigames] nieznany identyfikator poziomu: ${id}`);
    this.registry.set(id, factory);
  }

  isImplemented(id: number): boolean {
    return this.registry.has(id);
  }

  get activeId(): number | null {
    return this.active?.id ?? null;
  }

  async load(id: number): Promise<void> {
    this.unload();
    const factory = this.registry.get(id);
    const meta = getMinigameMeta(id);
    if (!factory || !meta) throw new Error(`[minigames] poziom ${id} nie jest zarejestrowany`);

    const module = factory();
    this.active = module;
    this.meta = meta;
    this.started = false;
    this.paused = false;
    this.finished = false;
    this.elapsed = 0;

    await this.deps.physics.whenReady();
    await module.initialize(this.createContext(meta));
    this.deps.events.emit('minigame:loaded', { id });
  }

  start(): void {
    if (!this.active || this.started) return;
    this.started = true;
    this.active.startGame();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  update(dt: number): void {
    if (!this.active || !this.started || this.paused) return;
    if (!this.finished) this.elapsed += dt;
    this.active.updateLoop(dt);
  }

  handleInput(event: GameEvents['input']): void {
    if (!this.active || !this.started || this.paused || this.finished) return;
    this.active.handleInput(event);
  }

  unload(): void {
    const { root, input, haptics, scent, audio, env, hud } = this.deps;
    if (this.active) {
      try {
        this.active.cleanup();
      } catch (error) {
        console.error('[minigames] błąd w cleanup()', error);
      }
    }
    this.active = null;
    this.meta = null;
    this.started = false;
    this.paused = false;
    this.finished = false;

    input.disableMicrophone();
    input.disableMotion();
    haptics.setHeartbeat(0);
    scent.setActive(false);
    scent.clearTrails();
    audio.setMusicIntensity(0.3);
    env.set('autumn');
    hud.setActions(null);
    hud.showHint(null);
    hud.setTimer(null);

    while (root.children.length > 0) {
      const child = root.children[0];
      root.remove(child);
      disposeObject3D(child);
    }
  }

  private finish(outcome: 'win' | 'lose', stats: FinishStats): void {
    if (!this.active || !this.meta || this.finished) return;
    this.finished = true;

    if (outcome === 'win') this.active.onWin();
    else this.active.onLose();

    const result: MinigameResult = {
      id: this.meta.id,
      outcome,
      timeSeconds: this.elapsed,
      stars: outcome === 'win' ? stats.stars ?? 1 : 0,
      goldenBone: outcome === 'win' && (stats.goldenBone ?? false),
      score: stats.score ?? 0,
    };
    this.deps.events.emit('minigame:finished', result);
  }

  private createContext(meta: MinigameMeta): GameContext {
    const { root, events, input, haptics, audio, scent, camera, env, physics, hud, view, save } = this.deps;
    const settings = save.data.settings;

    const pointOnPlane = (nx: number, ny: number, plane: THREE.Plane, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 | null => {
      const cam = view.camera;
      if (!cam) return null;
      this.ndc.set(nx, ny);
      this.raycaster.setFromCamera(this.ndc, cam);
      return this.raycaster.ray.intersectPlane(plane, out);
    };
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    return {
      root,
      events,
      input,
      haptics,
      audio,
      scent,
      camera,
      env,
      physics,
      hud,
      view,
      meta,
      quality: settings.quality,
      accessory: save.data.equippedAccessory,
      assist: settings.assist ? ASSIST_FACTOR : 1,
      random: mulberry32((meta.id * 7919) ^ (Date.now() & 0xffff)),
      groundPoint: (nx, ny, y = 0, out) => {
        groundPlane.constant = -y;
        return pointOnPlane(nx, ny, groundPlane, out);
      },
      pointOnPlane,
      requestFinish: (outcome, stats) => this.finish(outcome, stats ?? {}),
    };
  }
}
