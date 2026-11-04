import type { CutsceneManager } from './CutsceneManager';
import { Epilogue } from './Epilogue';
import { Prologue } from './Prologue';

export function registerCutscenes(manager: CutsceneManager): void {
  manager.register('prologue', () => new Prologue());
  manager.register('epilogue', () => new Epilogue());
}
