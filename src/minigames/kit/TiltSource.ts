import type { GameContext, InputEvent } from '../../core/types';
import { clamp, damp } from './helpers';

/**
 * Jedno źródło „przechyłu” -1..1: żyroskop, gdy jest dostępny, a w przeciwnym razie
 * przeciągnięcie palcem (środek ekranu = 0). Dzięki temu gra działa też w przeglądarce.
 */
export class TiltSource {
  x = 0;
  y = 0;
  private dragX = 0;
  private dragY = 0;
  private dragging = false;
  private originX = 0;
  private originY = 0;
  private motion = false;

  constructor(private readonly ctx: GameContext) {
    void ctx.input.enableMotion().then((ok) => {
      this.motion = ok;
      if (ok) ctx.hud.showHint('Przechylaj telefon!');
    });
  }

  get usingMotion(): boolean {
    return this.motion && this.ctx.input.sensors.motionEnabled;
  }

  handle(e: InputEvent): void {
    if (e.type === 'pointer-down') {
      this.dragging = true;
      this.originX = e.nx;
      this.originY = e.ny;
    } else if (e.type === 'pointer-move' && this.dragging) {
      this.dragX = clamp((e.nx - this.originX) * 2.2, -1, 1);
      this.dragY = clamp((e.ny - this.originY) * 2.2, -1, 1);
    } else if (e.type === 'pointer-up') {
      this.dragging = false;
      this.dragX = 0;
      this.dragY = 0;
    }
  }

  update(dt: number, lambda = 10): void {
    const s = this.ctx.input.sensors;
    const tx = this.usingMotion ? s.tiltX : this.dragX;
    const ty = this.usingMotion ? s.tiltY : this.dragY;
    this.x = damp(this.x, clamp(tx, -1, 1), lambda, dt);
    this.y = damp(this.y, clamp(ty, -1, 1), lambda, dt);
  }
}
