import { create } from 'zustand';
import type { GameState, HudAction, MinigameHud, MinigameMeta, MinigameResult } from './types';

interface GameUiState {
  state: GameState;
  activeMinigame: MinigameMeta | null;
  objective: string;
  progress: number;
  courage: number;
  timer: number | null;
  hint: string | null;
  actions: HudAction[] | null;
  lastResult: MinigameResult | null;
  /** nowe akcesoria odblokowane ostatnim wynikiem */
  newAccessories: string[];
  scentActive: boolean;
  toast: { id: number; message: string } | null;
  settingsOpen: boolean;
  levelSelectOpen: boolean;
  albumOpen: boolean;
  /** napisy w cutscenkach */
  caption: string | null;
  /** przesłona cutscenek 0..1 */
  fade: number;
  /** karta „Koniec” po epilogu */
  endCard: boolean;
  /** czy trwa cutscenka, którą można pominąć */
  cutsceneId: 'prologue' | 'epilogue' | null;
}

export const useGameUi = create<GameUiState>(() => ({
  state: 'boot',
  activeMinigame: null,
  objective: '',
  progress: 0,
  courage: 1,
  timer: null,
  hint: null,
  actions: null,
  lastResult: null,
  newAccessories: [],
  scentActive: false,
  toast: null,
  settingsOpen: false,
  levelSelectOpen: false,
  albumOpen: false,
  caption: null,
  fade: 0,
  endCard: false,
  cutsceneId: null,
}));

/** Implementacja MinigameHud przekazywana modułom minigier w GameContext. */
export const minigameHud: MinigameHud = {
  setObjective: (text) => useGameUi.setState({ objective: text }),
  setProgress: (value) => useGameUi.setState({ progress: Math.min(1, Math.max(0, value)) }),
  setCourage: (value) => useGameUi.setState({ courage: Math.min(1, Math.max(0, value)) }),
  setTimer: (seconds) => useGameUi.setState({ timer: seconds }),
  showHint: (text) => useGameUi.setState({ hint: text }),
  setActions: (actions) => useGameUi.setState({ actions }),
};

let toastId = 0;
export function showToast(message: string): void {
  const id = ++toastId;
  useGameUi.setState({ toast: { id, message } });
  window.setTimeout(() => {
    if (useGameUi.getState().toast?.id === id) useGameUi.setState({ toast: null });
  }, 2600);
}
