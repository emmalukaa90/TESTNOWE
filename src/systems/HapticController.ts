import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

type ImpactLevel = 'light' | 'medium' | 'heavy';

const STYLE: Record<ImpactLevel, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

const WEB_MS: Record<ImpactLevel, number> = { light: 12, medium: 25, heavy: 45 };
const MIN_GAP_MS = 40;

/**
 * Wibracje Androida: pojedyncze uderzenia, wzorce, bicie serca Fado w stresie
 * oraz delikatne pulsowanie przy zbliżaniu się do tropu.
 */
export class HapticController {
  enabled = true;
  private readonly native = Capacitor.isNativePlatform();
  private lastFire = 0;

  private heartbeat = { bpm: 0, intensity: 0.7, phase: 0, dubDone: true };
  private proximity = 0;
  private proximityClock = 0;

  impact(level: ImpactLevel = 'medium'): void {
    if (!this.canFire()) return;
    if (this.native) void Haptics.impact({ style: STYLE[level] }).catch(() => undefined);
    else navigator.vibrate?.(WEB_MS[level]);
  }

  pulse(durationMs: number): void {
    if (!this.canFire()) return;
    const duration = Math.max(8, Math.round(durationMs));
    if (this.native) void Haptics.vibrate({ duration }).catch(() => undefined);
    else navigator.vibrate?.(duration);
  }

  /** Wzorzec [wibracja, przerwa, wibracja, ...] w milisekundach. */
  pattern(steps: number[]): void {
    if (!this.enabled) return;
    if (!this.native) {
      navigator.vibrate?.(steps);
      return;
    }
    let at = 0;
    steps.forEach((ms, index) => {
      if (index % 2 === 0) window.setTimeout(() => void Haptics.vibrate({ duration: ms }).catch(() => undefined), at);
      at += ms;
    });
  }

  /** bpm = 0 wyłącza bicie serca. intensity 0..1 skaluje siłę uderzeń. */
  setHeartbeat(bpm: number, intensity = 0.7): void {
    this.heartbeat.bpm = Math.max(0, bpm);
    this.heartbeat.intensity = Math.min(1, Math.max(0, intensity));
    if (bpm <= 0) {
      this.heartbeat.phase = 0;
      this.heartbeat.dubDone = true;
    }
  }

  /** 0 = daleko od tropu, 1 = na tropie. Steruje częstotliwością delikatnych tyknięć. */
  setProximity(value: number): void {
    this.proximity = Math.min(1, Math.max(0, value));
  }

  update(dt: number): void {
    if (!this.enabled) return;

    if (this.heartbeat.bpm > 0) {
      const hb = this.heartbeat;
      hb.phase += (dt * hb.bpm) / 60;
      if (hb.phase >= 1) {
        hb.phase -= 1;
        hb.dubDone = false;
        this.pulse(28 + hb.intensity * 40);
      }
      if (!hb.dubDone && hb.phase >= 0.3) {
        hb.dubDone = true;
        this.pulse(18 + hb.intensity * 26);
      }
      return;
    }

    if (this.proximity > 0.05) {
      this.proximityClock += dt;
      const period = 1.2 - this.proximity * 0.95;
      if (this.proximityClock >= period) {
        this.proximityClock = 0;
        this.impact('light');
      }
    } else {
      this.proximityClock = 0;
    }
  }

  private canFire(): boolean {
    if (!this.enabled) return false;
    const now = performance.now();
    if (now - this.lastFire < MIN_GAP_MS) return false;
    this.lastFire = now;
    return true;
  }
}
