import * as THREE from 'three';
import { getChapterOf, getMinigameMeta, TOTAL_LEVELS } from '../data/campaign';
import { CutsceneManager } from '../cutscenes/CutsceneManager';
import { registerCutscenes } from '../cutscenes/registry';
import { registerMinigames } from '../minigames/registry';
import { initNative, onAppVisibility } from '../native/platform';
import { AudioManager } from '../systems/AudioManager';
import { HapticController } from '../systems/HapticController';
import { InputAndSensorManager } from '../systems/InputAndSensorManager';
import { ScentController } from '../systems/scent/ScentController';
import { CameraDirector, SHOTS } from './CameraDirector';
import { EnvironmentDirector } from './EnvironmentDirector';
import { EventBus } from './EventBus';
import { MinigameManager } from './MinigameManager';
import { GameFlow } from './MinigameStateMachine';
import { PhysicsHandle } from './PhysicsHandle';
import { ACCESSORY_LABELS, SaveSystem } from './SaveSystem';
import { minigameHud, showToast, useGameUi } from './store';
import type { GameEvents, GameState, InputEvent, MusicTrack, ViewHandle } from './types';

const INTRO_MS = 2300;
const MAX_FRAME_DT = 1 / 20;

/**
 * Orkiestrator: właściciel wszystkich systemów, maszyny stanów, managera minigier
 * i cutscenek. Komponenty Reacta tylko czytają stan (zustand) i wywołują metody publiczne.
 */
export class GameManager {
  readonly events = new EventBus<GameEvents>();
  readonly root = new THREE.Group();
  readonly physics = new PhysicsHandle();
  readonly haptics = new HapticController();
  readonly audio = new AudioManager();
  readonly input = new InputAndSensorManager(this.events);
  readonly scent = new ScentController(this.events, this.haptics);
  readonly camera = new CameraDirector();
  readonly env = new EnvironmentDirector();
  readonly save = new SaveSystem();
  readonly flow = new GameFlow();
  /** aktualna kamera i rozmiar widoku (uzupełniane co klatkę przez ViewBridge) */
  readonly view: ViewHandle = { camera: null, width: 1, height: 1 };
  readonly minigames: MinigameManager;
  readonly cutscenes: CutsceneManager;

  private booted = false;
  private launchToken = 0;
  private cutsceneReturn: 'hub' | 'menu' = 'hub';

  constructor() {
    this.root.name = 'MinigameRoot';
    this.minigames = new MinigameManager({
      root: this.root,
      events: this.events,
      input: this.input,
      haptics: this.haptics,
      audio: this.audio,
      scent: this.scent,
      camera: this.camera,
      env: this.env,
      physics: this.physics,
      hud: minigameHud,
      view: this.view,
      save: this.save,
    });
    this.cutscenes = new CutsceneManager({
      root: this.root,
      camera: this.camera,
      env: this.env,
      audio: this.audio,
      haptics: this.haptics,
      view: this.view,
      save: this.save,
    });
    registerMinigames(this.minigames);
    registerCutscenes(this.cutscenes);

    this.flow.onChange((from, to) => this.handleStateChange(from, to));
    this.events.on('input', (e) => this.routeInput(e));
    this.events.on('minigame:finished', (result) => this.handleFinished(result));
    this.events.on('toast', ({ message }) => showToast(message));
  }

  /** Jednorazowy start: wczytanie zapisu, podpięcie dotyku, natywna powłoka, menu główne. */
  async boot(touchLayer: HTMLElement): Promise<void> {
    if (this.booted) return;
    this.booted = true;
    await this.save.load();
    this.applySettings();
    this.input.attach(touchLayer);
    // przeglądarki wymagają gestu, by uruchomić dźwięk
    const unlock = () => this.audio.unlock();
    touchLayer.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    await initNative();
    onAppVisibility((visible) => {
      if (!visible && this.flow.is('minigame-playing')) this.pause();
    });
    this.flow.transition('menu');
  }

  applySettings(): void {
    const s = this.save.data.settings;
    this.haptics.enabled = s.haptics;
    this.audio.setVolumes(s.musicVolume, s.sfxVolume);
  }

  /** Wywoływane co klatkę z pętli renderowania. */
  tick(rawDelta: number): void {
    const dt = Math.min(rawDelta, MAX_FRAME_DT);
    this.input.update(dt);
    this.haptics.update(dt);
    this.scent.update(dt);
    this.minigames.update(dt);
    if (this.flow.is('cutscene')) this.cutscenes.update(dt);
    this.flow.update(dt);
  }

  /* ------------------------------ API publiczne ------------------------------ */

  startAdventure(): void {
    this.audio.unlock();
    this.audio.sfx('ui');
    useGameUi.setState({ levelSelectOpen: false, settingsOpen: false, albumOpen: false });
    if (!this.save.data.seenPrologue) {
      this.playCutscene('prologue', 'hub');
      return;
    }
    this.flow.transition('hub');
  }

  /** Powtórka prologu/epilogu z albumu (z menu lub z huba). */
  replayCutscene(id: 'prologue' | 'epilogue'): void {
    const back = this.flow.is('menu') ? 'menu' : 'hub';
    useGameUi.setState({ albumOpen: false, settingsOpen: false, levelSelectOpen: false });
    this.playCutscene(id, back);
  }

  private playCutscene(id: 'prologue' | 'epilogue', back: 'hub' | 'menu'): void {
    if (!this.flow.transition('cutscene')) return;
    this.cutsceneReturn = back;
    void this.cutscenes.play(id, () => {
      if (id === 'prologue') this.save.markSeen('seenPrologue');
      if (id === 'epilogue') {
        this.save.markSeen('seenEpilogue');
        useGameUi.setState({ endCard: true });
        return; // karta końcowa decyduje o dalszym przebiegu (finishEnding)
      }
      this.flow.transition(this.cutsceneReturn);
    });
  }

  skipCutscene(): void {
    if (this.flow.is('cutscene')) this.cutscenes.skip();
  }

  finishEnding(): void {
    useGameUi.setState({ endCard: false });
    if (this.flow.is('cutscene')) this.flow.transition('menu');
  }

  backToMenu(): void {
    if (this.flow.is('hub')) this.flow.transition('menu');
  }

  async openLevel(id: number): Promise<boolean> {
    if (!this.save.isUnlocked(id)) {
      showToast('Ten poziom jest jeszcze zablokowany.');
      return false;
    }
    const meta = getMinigameMeta(id);
    if (!meta || !this.minigames.isImplemented(id)) {
      showToast('Tego poziomu jeszcze nie ma w grze.');
      return false;
    }
    if (!this.flow.transition('minigame-intro')) return false;
    const token = ++this.launchToken;
    this.audio.sfx('ui');

    useGameUi.setState({
      levelSelectOpen: false,
      activeMinigame: meta,
      objective: '',
      progress: 0,
      courage: 1,
      timer: null,
      hint: null,
      actions: null,
      lastResult: null,
      newAccessories: [],
    });
    this.audio.music(meta.music);

    try {
      await this.minigames.load(id);
    } catch (error) {
      console.error('[game] ładowanie minigry nie powiodło się', error);
      if (token === this.launchToken) {
        this.minigames.unload();
        showToast('Nie udało się wczytać poziomu.');
        this.flow.transition('hub');
      }
      return false;
    }
    if (token !== this.launchToken) {
      // gracz wyszedł w trakcie ładowania — sprzątamy to, co moduł zdążył dodać
      this.minigames.unload();
      return false;
    }

    await new Promise((resolve) => window.setTimeout(resolve, INTRO_MS));
    if (token === this.launchToken && this.flow.is('minigame-intro')) this.flow.transition('minigame-playing');
    return true;
  }

  pause(): void {
    this.flow.transition('paused');
  }

  resume(): void {
    if (this.flow.is('paused')) this.flow.transition('minigame-playing');
  }

  quitToHub(): void {
    this.flow.transition('hub');
  }

  retry(): void {
    const id = useGameUi.getState().activeMinigame?.id;
    if (id !== undefined) void this.openLevel(id);
  }

  nextLevel(): void {
    const { activeMinigame, lastResult } = useGameUi.getState();
    if (!activeMinigame) return;
    if (activeMinigame.id >= TOTAL_LEVELS && lastResult?.outcome === 'win') {
      this.playCutscene('epilogue', 'menu');
      return;
    }
    void this.openLevel(activeMinigame.id + 1);
  }

  /** Wywoływane przez przyciski akcji w HUD. */
  triggerAction(id: string): void {
    this.events.emit('input', { type: 'action', id, time: performance.now() });
  }

  /* ------------------------------- wnętrze -------------------------------- */

  private handleFinished(result: GameEvents['minigame:finished']): void {
    const { newAccessories } = this.save.recordResult(result);
    useGameUi.setState({ lastResult: result, newAccessories });
    this.audio.sfx(result.outcome === 'win' ? 'win' : 'lose');
    this.haptics.pattern(result.outcome === 'win' ? [30, 40, 60] : [120]);
    newAccessories.forEach((a) => showToast(`Nowy dodatek: ${ACCESSORY_LABELS[a]}!`));
    this.flow.transition('minigame-result');
  }

  private musicFor(state: GameState): MusicTrack | null | undefined {
    switch (state) {
      case 'menu':
        return 'menu';
      case 'hub':
        return 'forest';
      case 'cutscene':
        return 'cutscene';
      default:
        return undefined; // minigry ustawiają własną ścieżkę w openLevel
    }
  }

  private handleStateChange(from: GameState, to: GameState): void {
    useGameUi.setState({ state: to });

    if (to !== 'hub' && to !== 'minigame-playing' && to !== 'paused') this.scent.setActive(false);
    const track = this.musicFor(to);
    if (track) this.audio.music(track);
    if (to === 'minigame-playing' && from !== 'paused') this.audio.setMusicIntensity(0.4);

    if (from === 'cutscene' && to !== 'cutscene') {
      this.cutscenes.stop();
      this.env.set('autumn');
      useGameUi.setState({ fade: 0, caption: null, endCard: false });
    }

    switch (to) {
      case 'menu':
        this.camera.shot('menu');
        break;
      case 'hub':
        this.launchToken++;
        if (this.minigames.activeId !== null || this.root.children.length > 0) this.minigames.unload();
        this.haptics.setHeartbeat(0);
        this.camera.shot('explore');
        this.env.set('autumn', 0.8);
        break;
      case 'minigame-playing':
        if (from === 'paused') this.minigames.setPaused(false);
        else this.minigames.start();
        break;
      case 'paused':
        this.minigames.setPaused(true);
        this.haptics.setHeartbeat(0);
        break;
      case 'minigame-result':
        this.haptics.setHeartbeat(0);
        break;
      default:
        break;
    }

    this.events.emit('state:changed', { from, to });
  }

  private routeInput(event: InputEvent): void {
    const state = this.flow.current;

    if (state === 'hub') {
      if (event.type === 'hold-start') {
        this.scent.setActive(true);
        this.camera.shot(SHOTS.scent);
      } else if (event.type === 'hold-end') {
        this.scent.setActive(false);
        this.camera.shot(SHOTS.explore);
      }
      return;
    }

    if (state === 'minigame-playing') this.minigames.handleInput(event);
  }

  chapterOf(levelId: number) {
    return getChapterOf(levelId);
  }
}

export const game = new GameManager();
