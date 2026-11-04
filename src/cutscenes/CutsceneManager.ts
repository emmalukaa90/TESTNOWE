import gsap from 'gsap';
import * as THREE from 'three';
import type { CameraDirector } from '../core/CameraDirector';
import { disposeObject3D } from '../core/dispose';
import type { EnvironmentDirector } from '../core/EnvironmentDirector';
import type { SaveSystem } from '../core/SaveSystem';
import { useGameUi } from '../core/store';
import type { CutsceneContext, ICutscene, ViewHandle } from '../core/types';
import type { AudioManager } from '../systems/AudioManager';
import type { HapticController } from '../systems/HapticController';

export type CutsceneFactory = () => ICutscene;

export interface CutsceneManagerDeps {
  root: THREE.Group;
  camera: CameraDirector;
  env: EnvironmentDirector;
  audio: AudioManager;
  haptics: HapticController;
  view: ViewHandle;
  save: SaveSystem;
}

/** Odtwarza cutscenki na silniku gry: zarządza napisami, przesłoną i sprzątaniem sceny. */
export class CutsceneManager {
  private readonly factories = new Map<ICutscene['id'], CutsceneFactory>();
  private active: ICutscene | null = null;
  private onDone: (() => void) | null = null;
  private token = 0;
  private readonly fadeState = { v: 0 };

  constructor(private readonly deps: CutsceneManagerDeps) {}

  register(id: ICutscene['id'], factory: CutsceneFactory): void {
    this.factories.set(id, factory);
  }

  get isPlaying(): boolean {
    return this.active !== null;
  }

  async play(id: ICutscene['id'], onDone: () => void): Promise<void> {
    this.stop();
    const factory = this.factories.get(id);
    if (!factory) {
      onDone();
      return;
    }
    const token = ++this.token;
    const scene = factory();
    this.active = scene;
    this.onDone = onDone;
    useGameUi.setState({ cutsceneId: id, caption: null, endCard: false });
    this.setFade(1, 0);
    try {
      await scene.build(this.createContext(token));
    } catch (error) {
      console.error('[cutscene] build() nie powiodło się', error);
      if (token === this.token) this.complete();
      return;
    }
    if (token !== this.token) return;
    scene.play();
  }

  update(dt: number): void {
    this.active?.update(dt);
  }

  skip(): void {
    if (!this.active) return;
    const scene = this.active;
    try {
      scene.skip();
    } catch (error) {
      console.error('[cutscene] skip()', error);
    }
    this.complete();
  }

  /** Przerywa bez wywołania callbacku (np. wyjście do menu). */
  stop(): void {
    this.token++;
    this.cleanupActive();
    this.onDone = null;
  }

  private complete(): void {
    if (!this.active) return;
    const done = this.onDone;
    this.token++;
    this.cleanupActive();
    this.onDone = null;
    done?.();
  }

  private cleanupActive(): void {
    gsap.killTweensOf(this.fadeState);
    if (this.active) {
      try {
        this.active.cleanup();
      } catch (error) {
        console.error('[cutscene] cleanup()', error);
      }
    }
    this.active = null;
    const { root } = this.deps;
    while (root.children.length > 0) {
      const child = root.children[0];
      root.remove(child);
      disposeObject3D(child);
    }
    useGameUi.setState({ cutsceneId: null, caption: null });
  }

  private setFade(opacity: number, duration: number): void {
    gsap.killTweensOf(this.fadeState);
    if (duration <= 0) {
      this.fadeState.v = opacity;
      useGameUi.setState({ fade: opacity });
      return;
    }
    gsap.to(this.fadeState, {
      v: opacity,
      duration,
      ease: 'power1.inOut',
      onUpdate: () => useGameUi.setState({ fade: this.fadeState.v }),
    });
  }

  private createContext(token: number): CutsceneContext {
    const { root, camera, env, audio, haptics, view, save } = this.deps;
    return {
      root,
      camera,
      env,
      audio,
      haptics,
      view,
      quality: save.data.settings.quality,
      accessory: save.data.equippedAccessory,
      caption: (text) => {
        if (token === this.token) useGameUi.setState({ caption: text });
      },
      fade: (opacity, duration = 1) => {
        if (token === this.token) this.setFade(opacity, duration);
      },
      finish: () => {
        if (token === this.token) this.complete();
      },
    };
  }
}
