import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { create } from 'zustand';
import { TOTAL_LEVELS } from '../data/campaign';
import type { AccessoryId, MinigameResult, QualityTier } from './types';

const SAVE_KEY = 'fado.save.v1';

export const ACCESSORY_REQUIREMENTS: Record<AccessoryId, number> = {
  'red-bandana': 5,
  'sherlock-hat': 10,
  'aviator-goggles': 15,
};

export const ACCESSORY_LABELS: Record<AccessoryId, string> = {
  'red-bandana': 'Czerwona chustka',
  'sherlock-hat': 'Czapka Sherlocka',
  'aviator-goggles': 'Gogle lotnicze',
};

export interface LevelRecord {
  stars: 0 | 1 | 2 | 3;
  bestTime: number;
  goldenBone: boolean;
  attempts: number;
}

export interface SaveSettings {
  haptics: boolean;
  quality: QualityTier;
  musicVolume: number;
  sfxVolume: number;
  /** tryb pomocy: łagodniejsze tolerancje i czasy */
  assist: boolean;
}

export interface SaveData {
  version: 1;
  highestUnlocked: number;
  completed: Record<number, LevelRecord>;
  ownedAccessories: AccessoryId[];
  equippedAccessory: AccessoryId | null;
  settings: SaveSettings;
  seenPrologue: boolean;
  seenEpilogue: boolean;
}

export function detectDefaultQuality(): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const memory = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  if (memory <= 3 || cores <= 4) return 'low';
  if (memory >= 6 && cores >= 8) return 'high';
  return 'medium';
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    highestUnlocked: 1,
    completed: {},
    ownedAccessories: [],
    equippedAccessory: null,
    settings: { haptics: true, quality: detectDefaultQuality(), musicVolume: 0.8, sfxVolume: 1, assist: false },
    seenPrologue: false,
    seenEpilogue: false,
  };
}

export const useSave = create<{ data: SaveData; loaded: boolean }>(() => ({
  data: defaultSave(),
  loaded: false,
}));

export function countGoldenBones(data: SaveData): number {
  return Object.values(data.completed).filter((r) => r.goldenBone).length;
}

async function readRaw(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: SAVE_KEY });
    return value;
  }
  return localStorage.getItem(SAVE_KEY);
}

async function writeRaw(value: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await Preferences.set({ key: SAVE_KEY, value });
  else localStorage.setItem(SAVE_KEY, value);
}

export class SaveSystem {
  private persistTimer: number | null = null;

  get data(): SaveData {
    return useSave.getState().data;
  }

  async load(): Promise<void> {
    const base = defaultSave();
    try {
      const raw = await readRaw();
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        if (parsed.version === 1) {
          useSave.setState({
            data: {
              ...base,
              ...parsed,
              settings: { ...base.settings, ...(parsed.settings ?? {}) },
            } as SaveData,
            loaded: true,
          });
          return;
        }
      }
    } catch (error) {
      console.warn('[save] nie udało się wczytać zapisu, startuję od zera', error);
    }
    useSave.setState({ data: base, loaded: true });
  }

  isUnlocked(levelId: number): boolean {
    return levelId >= 1 && levelId <= this.data.highestUnlocked;
  }

  /** Zapisuje wynik minigry, odblokowuje kolejny poziom i akcesoria. */
  recordResult(result: MinigameResult): { newAccessories: AccessoryId[] } {
    const data = structuredClone(this.data);
    const prev = data.completed[result.id];
    const attempts = (prev?.attempts ?? 0) + 1;

    if (result.outcome === 'win') {
      data.completed[result.id] = {
        stars: Math.max(prev?.stars ?? 0, result.stars) as LevelRecord['stars'],
        bestTime: prev ? Math.min(prev.bestTime, result.timeSeconds) : result.timeSeconds,
        goldenBone: (prev?.goldenBone ?? false) || result.goldenBone,
        attempts,
      };
      data.highestUnlocked = Math.min(TOTAL_LEVELS, Math.max(data.highestUnlocked, result.id + 1));
    } else if (prev) {
      data.completed[result.id] = { ...prev, attempts };
    }

    const bones = countGoldenBones(data);
    const newAccessories: AccessoryId[] = [];
    (Object.keys(ACCESSORY_REQUIREMENTS) as AccessoryId[]).forEach((id) => {
      if (bones >= ACCESSORY_REQUIREMENTS[id] && !data.ownedAccessories.includes(id)) {
        data.ownedAccessories.push(id);
        newAccessories.push(id);
      }
    });

    this.commit(data);
    return { newAccessories };
  }

  equip(accessory: AccessoryId | null): void {
    const data = structuredClone(this.data);
    if (accessory && !data.ownedAccessories.includes(accessory)) return;
    data.equippedAccessory = accessory;
    this.commit(data);
  }

  markSeen(flag: 'seenPrologue' | 'seenEpilogue'): void {
    const data = structuredClone(this.data);
    data[flag] = true;
    this.commit(data);
  }

  updateSettings(patch: Partial<SaveSettings>): void {
    const data = structuredClone(this.data);
    data.settings = { ...data.settings, ...patch };
    this.commit(data);
  }

  reset(): void {
    this.commit(defaultSave());
  }

  private commit(data: SaveData): void {
    useSave.setState({ data });
    if (this.persistTimer !== null) window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      void writeRaw(JSON.stringify(useSave.getState().data)).catch((e) =>
        console.warn('[save] zapis nie powiódł się', e),
      );
    }, 250);
  }
}
