import type { MinigameManager } from '../core/MinigameManager';
import { Game01Symphony } from './ch1/Game01Symphony';
import { Game02Rapids } from './ch1/Game02Rapids';
import { Game03Thorns } from './ch1/Game03Thorns';
import { Game04NightScout } from './ch1/Game04NightScout';
import { Game05Storm } from './ch1/Game05Storm';
import { Game06Dig } from './ch2/Game06Dig';
import { Game07Sheep } from './ch2/Game07Sheep';
import { Game08Pantry } from './ch2/Game08Pantry';
import { Game09Tractor } from './ch2/Game09Tractor';
import { Game10Shower } from './ch2/Game10Shower';
import { Game11RushHour } from './ch3/Game11RushHour';
import { Game12Echo } from './ch3/Game12Echo';
import { Game13Catcher } from './ch3/Game13Catcher';
import { Game14Bistro } from './ch3/Game14Bistro';
import { Game15Rooftops } from './ch3/Game15Rooftops';
import { Game16Cipher } from './ch4/Game16Cipher';
import { Game17Luggage } from './ch4/Game17Luggage';
import { Game18Market } from './ch4/Game18Market';
import { Game19Fireworks } from './ch4/Game19Fireworks';
import { Game20Finale } from './ch4/Game20Finale';

/** Rejestr wszystkich 20 minigier. Każdy moduł to osobna klasa implementująca IMinigame. */
export function registerMinigames(manager: MinigameManager): void {
  manager.register(1, () => new Game01Symphony());
  manager.register(2, () => new Game02Rapids());
  manager.register(3, () => new Game03Thorns());
  manager.register(4, () => new Game04NightScout());
  manager.register(5, () => new Game05Storm());
  manager.register(6, () => new Game06Dig());
  manager.register(7, () => new Game07Sheep());
  manager.register(8, () => new Game08Pantry());
  manager.register(9, () => new Game09Tractor());
  manager.register(10, () => new Game10Shower());
  manager.register(11, () => new Game11RushHour());
  manager.register(12, () => new Game12Echo());
  manager.register(13, () => new Game13Catcher());
  manager.register(14, () => new Game14Bistro());
  manager.register(15, () => new Game15Rooftops());
  manager.register(16, () => new Game16Cipher());
  manager.register(17, () => new Game17Luggage());
  manager.register(18, () => new Game18Market());
  manager.register(19, () => new Game19Fireworks());
  manager.register(20, () => new Game20Finale());
}
