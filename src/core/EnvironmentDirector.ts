import gsap from 'gsap';
import { Color } from 'three';

export interface EnvironmentPreset {
  background: string;
  fogColor?: string;
  fogNear?: number;
  fogFar?: number;
}

/** Presety używane przez eksplorację, minigry i cutscenki. */
export const ENV_PRESETS = {
  autumn: { background: '#e9c39b', fogColor: '#e9c39b', fogNear: 22, fogFar: 95 },
  night: { background: '#0a0c1c', fogColor: '#0a0c1c', fogNear: 6, fogFar: 40 },
  storm: { background: '#3b4358', fogColor: '#3b4358', fogNear: 14, fogFar: 70 },
  farm: { background: '#bfe3f5', fogColor: '#d9efe0', fogNear: 30, fogFar: 120 },
  city: { background: '#f0b48a', fogColor: '#e8b99c', fogNear: 25, fogFar: 110 },
  sewer: { background: '#050708', fogColor: '#050708', fogNear: 4, fogFar: 26 },
  dusk: { background: '#4a2f55', fogColor: '#6a4666', fogNear: 20, fogFar: 90 },
  festival: { background: '#0d1030', fogColor: '#171a4a', fogNear: 20, fogFar: 90 },
  dawn: { background: '#ffd6a5', fogColor: '#ffe3c2', fogNear: 30, fogFar: 140 },
} as const satisfies Record<string, EnvironmentPreset>;

export type EnvironmentName = keyof typeof ENV_PRESETS;

/**
 * Kolor tła i mgły sceny. Komponent EnvironmentRig stosuje te wartości co klatkę,
 * a moduły minigier zmieniają je przez set()/apply() (z płynnym przejściem).
 */
export class EnvironmentDirector {
  readonly background = new Color(ENV_PRESETS.autumn.background);
  readonly fogColor = new Color(ENV_PRESETS.autumn.fogColor);
  readonly fog = { near: ENV_PRESETS.autumn.fogNear as number, far: ENV_PRESETS.autumn.fogFar as number };

  set(name: EnvironmentName | EnvironmentPreset, duration = 0): void {
    const preset: EnvironmentPreset = typeof name === 'string' ? ENV_PRESETS[name] : name;
    const fogColor = preset.fogColor ?? preset.background;
    const target = new Color(preset.background);
    const fogTarget = new Color(fogColor);
    const near = preset.fogNear ?? 20;
    const far = preset.fogFar ?? 100;

    if (duration <= 0) {
      this.background.copy(target);
      this.fogColor.copy(fogTarget);
      this.fog.near = near;
      this.fog.far = far;
      return;
    }
    gsap.to(this.background, { r: target.r, g: target.g, b: target.b, duration, overwrite: 'auto' });
    gsap.to(this.fogColor, { r: fogTarget.r, g: fogTarget.g, b: fogTarget.b, duration, overwrite: 'auto' });
    gsap.to(this.fog, { near, far, duration, overwrite: 'auto' });
  }
}
