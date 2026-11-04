import { StateMachine } from './StateMachine';
import type { GameState } from './types';

/**
 * Graf przepływu gry. Minigra żyje w czterech stanach:
 * intro -> playing <-> paused -> result (-> intro przy powtórce albo hub).
 */
export const GAME_GRAPH: Record<GameState, readonly GameState[]> = {
  boot: ['menu'],
  menu: ['hub', 'cutscene'],
  cutscene: ['hub', 'menu', 'minigame-intro'],
  hub: ['menu', 'minigame-intro', 'cutscene'],
  'minigame-intro': ['minigame-playing', 'hub'],
  'minigame-playing': ['paused', 'minigame-result', 'hub'],
  paused: ['minigame-playing', 'minigame-intro', 'hub'],
  'minigame-result': ['hub', 'minigame-intro', 'cutscene'],
};

export class GameFlow extends StateMachine<GameState> {
  constructor() {
    super(GAME_GRAPH, 'boot');
  }
}
