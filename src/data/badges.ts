import { countGoldenBones, type SaveData } from '../core/SaveSystem';
import { CHAPTERS } from './campaign';

export interface Badge {
  id: string;
  icon: string;
  title: string;
  description: string;
  earned(data: SaveData): boolean;
}

const completedCount = (d: SaveData) => Object.values(d.completed).length;
const threeStars = (d: SaveData) => Object.values(d.completed).filter((r) => r.stars === 3).length;
const chapterDone = (d: SaveData, index: number) => CHAPTERS[index].levels.every((id) => d.completed[id]);

/** Odznaki liczone na bieżąco z zapisu — nic dodatkowego nie trzeba przechowywać. */
export const BADGES: readonly Badge[] = [
  { id: 'first', icon: '🐾', title: 'Pierwsze ślady', description: 'Ukończ pierwszy poziom.', earned: (d) => completedCount(d) >= 1 },
  { id: 'c1', icon: '🌲', title: 'Król Głuszy', description: 'Ukończ rozdział I.', earned: (d) => chapterDone(d, 0) },
  { id: 'c2', icon: '🐑', title: 'Pies Pasterski', description: 'Ukończ rozdział II.', earned: (d) => chapterDone(d, 1) },
  { id: 'c3', icon: '🏙️', title: 'Miejski Spryciarz', description: 'Ukończ rozdział III.', earned: (d) => chapterDone(d, 2) },
  { id: 'c4', icon: '🏠', title: 'Wreszcie w domu', description: 'Ukończ rozdział IV.', earned: (d) => chapterDone(d, 3) },
  { id: 'bones5', icon: '🦴', title: 'Kolekcjoner', description: 'Zdobądź 5 Złotych Kości.', earned: (d) => countGoldenBones(d) >= 5 },
  { id: 'bones20', icon: '👑', title: 'Złota Setka', description: 'Zdobądź wszystkie 20 Złotych Kości.', earned: (d) => countGoldenBones(d) >= 20 },
  { id: 'stars10', icon: '⭐', title: 'Gwiazdor', description: 'Zdobądź 3 gwiazdki w 10 poziomach.', earned: (d) => threeStars(d) >= 10 },
  { id: 'wardrobe', icon: '🎩', title: 'Elegant', description: 'Odblokuj wszystkie akcesoria.', earned: (d) => d.ownedAccessories.length >= 3 },
  { id: 'finale', icon: '💛', title: 'Szczęśliwe zakończenie', description: 'Obejrzyj epilog.', earned: (d) => d.seenEpilogue },
];
