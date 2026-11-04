import type * as THREE from 'three';
import type { EventBus } from './EventBus';
import type { InputAndSensorManager } from '../systems/InputAndSensorManager';
import type { HapticController } from '../systems/HapticController';
import type { AudioManager } from '../systems/AudioManager';
import type { ScentController } from '../systems/scent/ScentController';
import type { CameraDirector } from './CameraDirector';
import type { EnvironmentDirector } from './EnvironmentDirector';
import type { PhysicsHandle } from './PhysicsHandle';

/* ------------------------------------------------------------------ */
/*  Stany gry                                                          */
/* ------------------------------------------------------------------ */

export type GameState =
  | 'boot'
  | 'menu'
  | 'hub'
  | 'cutscene'
  | 'minigame-intro'
  | 'minigame-playing'
  | 'paused'
  | 'minigame-result';

export type AccessoryId = 'red-bandana' | 'sherlock-hat' | 'aviator-goggles';
export type QualityTier = 'low' | 'medium' | 'high';

/* ------------------------------------------------------------------ */
/*  Zdarzenia wejścia                                                  */
/* ------------------------------------------------------------------ */

export type Side = 'left' | 'right';
export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

interface PointerPayload {
  pointerId: number;
  /** piksele względem warstwy dotyku */
  x: number;
  y: number;
  /** znormalizowane -1..1, oś Y skierowana w górę */
  nx: number;
  ny: number;
  pointerCount: number;
  time: number;
}

export type InputEvent =
  | ({ type: 'tap'; side: Side } & PointerPayload)
  | ({ type: 'pointer-down' } & PointerPayload)
  | ({ type: 'pointer-move'; dx: number; dy: number } & PointerPayload)
  | ({ type: 'pointer-up' } & PointerPayload)
  | ({ type: 'hold-start' } & PointerPayload)
  | ({ type: 'hold-end' } & PointerPayload)
  | ({ type: 'swipe'; direction: SwipeDirection; dx: number; dy: number; velocity: number } & PointerPayload)
  | { type: 'pinch'; scale: number; delta: number; centerNx: number; centerNy: number; time: number }
  | { type: 'tilt'; nx: number; ny: number; beta: number; gamma: number; time: number }
  | { type: 'shake'; intensity: number; time: number }
  | { type: 'sound'; kind: 'bark' | 'blow'; level: number; time: number }
  | { type: 'action'; id: string; time: number };

/* ------------------------------------------------------------------ */
/*  Wyniki i zdarzenia gry                                             */
/* ------------------------------------------------------------------ */

export interface MinigameResult {
  id: number;
  outcome: 'win' | 'lose';
  timeSeconds: number;
  stars: 0 | 1 | 2 | 3;
  goldenBone: boolean;
  score: number;
}

export type FinishStats = Partial<Pick<MinigameResult, 'stars' | 'goldenBone' | 'score'>>;

export interface GameEvents {
  'state:changed': { from: GameState; to: GameState };
  input: InputEvent;
  'scent:toggle': { active: boolean };
  'minigame:loaded': { id: number };
  'minigame:finished': MinigameResult;
  toast: { message: string };
}

/* ------------------------------------------------------------------ */
/*  Metadane                                                           */
/* ------------------------------------------------------------------ */

export type ControlKind = 'touch' | 'multitouch' | 'swipe' | 'pinch' | 'gyro' | 'accel' | 'mic' | 'slider' | 'draw';
export type MusicTrack = 'menu' | 'forest' | 'night' | 'farm' | 'city' | 'tension' | 'finale' | 'cutscene';

export interface MinigameMeta {
  id: number;
  chapter: 1 | 2 | 3 | 4;
  level: 1 | 2 | 3 | 4 | 5;
  slug: string;
  title: string;
  summary: string;
  /** krótka instrukcja pokazywana w intro i jako podpowiedź */
  howTo: string;
  /** wyzwanie na Złotą Kość */
  boneGoal: string;
  controls: readonly ControlKind[];
  accent: string;
  music: MusicTrack;
}

export interface ChapterMeta {
  id: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  gradient: readonly [string, string];
  levels: readonly number[];
  /** karta historii pokazywana po ukończeniu rozdziału */
  outro: string;
}

/* ------------------------------------------------------------------ */
/*  Kontrakt minigry                                                   */
/* ------------------------------------------------------------------ */

export interface HudAction {
  id: string;
  label: string;
  icon?: string;
}

export interface MinigameHud {
  setObjective(text: string): void;
  setProgress(value: number): void;
  setCourage(value: number): void;
  setTimer(seconds: number | null): void;
  showHint(text: string | null): void;
  /** przyciski akcji; kliknięcie wysyła InputEvent { type: 'action', id } */
  setActions(actions: HudAction[] | null): void;
}

/** Uchwyt do aktualnej kamery i rozmiaru widoku (ustawiany co klatkę przez ViewBridge). */
export interface ViewHandle {
  camera: THREE.PerspectiveCamera | null;
  width: number;
  height: number;
}

export interface GameContext {
  /** Korzeń sceny minigry. Wszystko, co moduł doda, zostanie zwolnione w unload(). */
  readonly root: THREE.Group;
  readonly events: EventBus<GameEvents>;
  readonly input: InputAndSensorManager;
  readonly haptics: HapticController;
  readonly audio: AudioManager;
  readonly scent: ScentController;
  readonly camera: CameraDirector;
  readonly env: EnvironmentDirector;
  readonly physics: PhysicsHandle;
  readonly hud: MinigameHud;
  readonly view: ViewHandle;
  readonly meta: MinigameMeta;
  readonly quality: QualityTier;
  readonly accessory: AccessoryId | null;
  /** mnożnik wyrozumiałości (1 = normalnie, >1 = tryb pomocy) */
  readonly assist: number;
  /** deterministyczny generator 0..1 (ziarno zależne od poziomu i sesji) */
  readonly random: () => number;
  /** Przecięcie promienia z kamery (współrzędne ekranu -1..1) z płaszczyzną y = `y`. */
  groundPoint(nx: number, ny: number, y?: number, out?: THREE.Vector3): THREE.Vector3 | null;
  /** Przecięcie promienia z dowolną płaszczyzną. */
  pointOnPlane(nx: number, ny: number, plane: THREE.Plane, out?: THREE.Vector3): THREE.Vector3 | null;
  /** Moduł zgłasza koniec rozgrywki; manager wywoła onWin()/onLose() i opublikuje wynik. */
  requestFinish(outcome: 'win' | 'lose', stats?: FinishStats): void;
}

export interface IMinigame {
  readonly id: number;
  initialize(context: GameContext): void | Promise<void>;
  startGame(): void;
  updateLoop(deltaTime: number): void;
  handleInput(input: InputEvent): void;
  onWin(): void;
  onLose(): void;
  cleanup(): void;
}

/* ------------------------------------------------------------------ */
/*  Cutscenki                                                          */
/* ------------------------------------------------------------------ */

export interface CutsceneContext {
  readonly root: THREE.Group;
  readonly camera: CameraDirector;
  readonly env: EnvironmentDirector;
  readonly audio: AudioManager;
  readonly haptics: HapticController;
  readonly view: ViewHandle;
  readonly quality: QualityTier;
  readonly accessory: AccessoryId | null;
  caption(text: string | null): void;
  /** 0 = brak przesłony, 1 = pełna czerń */
  fade(opacity: number, duration?: number): void;
  /** Zgłoszenie końca cutscenki (np. po zakończeniu osi czasu). */
  finish(): void;
}

export interface ICutscene {
  readonly id: 'prologue' | 'epilogue';
  build(context: CutsceneContext): void | Promise<void>;
  play(): void;
  update(deltaTime: number): void;
  skip(): void;
  cleanup(): void;
}
