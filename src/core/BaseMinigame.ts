import * as THREE from 'three';
import type { FinishStats, GameContext, IMinigame, InputEvent } from './types';

/**
 * Wygodna baza dla modułów minigier: pilnuje kontekstu, czasu, jednokrotnego
 * zakończenia i zbierania „Złotej Kości”. Konkretne minigry implementują
 * onInitialize / startGame / onUpdate / handleInput.
 */
export abstract class BaseMinigame implements IMinigame {
  abstract readonly id: number;

  protected ctx!: GameContext;
  protected elapsed = 0;
  protected finished = false;
  private goldenBone = false;

  async initialize(context: GameContext): Promise<void> {
    this.ctx = context;
    await this.onInitialize(context);
  }

  protected abstract onInitialize(context: GameContext): void | Promise<void>;
  abstract startGame(): void;
  protected abstract onUpdate(deltaTime: number): void;
  abstract handleInput(input: InputEvent): void;

  updateLoop(deltaTime: number): void {
    this.elapsed += deltaTime;
    this.onUpdate(deltaTime);
  }

  onWin(): void {
    /* domyślnie brak dodatkowych efektów; moduł może nadpisać */
  }

  onLose(): void {
    /* domyślnie brak dodatkowych efektów; moduł może nadpisać */
  }

  cleanup(): void {
    this.onCleanup();
  }

  /** Zwolnienie zasobów specyficznych dla modułu (nasłuchy, timery). Obiekty w ctx.root zwalnia manager. */
  protected onCleanup(): void {
    /* domyślnie nic do zwolnienia */
  }

  protected win(stats?: FinishStats): void {
    if (this.finished) return;
    this.finished = true;
    this.ctx.requestFinish('win', { ...stats, goldenBone: this.goldenBone || stats?.goldenBone });
  }

  protected lose(): void {
    if (this.finished) return;
    this.finished = true;
    this.ctx.requestFinish('lose');
  }

  protected collectGoldenBone(): void {
    this.goldenBone = true;
  }

  /** Podstawowe światło sceny minigry (półsfera + słońce z cieniami). */
  protected addDefaultLighting(): THREE.Light[] {
    const hemi = new THREE.HemisphereLight('#ffe2c4', '#5b4630', 0.9);
    const sun = new THREE.DirectionalLight('#ffd9a8', 3);
    sun.position.set(-8, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.ctx.root.add(hemi, sun);
    return [hemi, sun];
  }
}
