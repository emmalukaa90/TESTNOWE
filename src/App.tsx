import { useEffect, useRef } from 'react';
import { game } from './core/GameManager';
import { useGameUi } from './core/store';
import { GameCanvas } from './scenes/GameCanvas';
import { Album } from './ui/Album';
import { ChapterSelect } from './ui/ChapterSelect';
import { Hud } from './ui/Hud';
import { MainMenu } from './ui/MainMenu';
import { Overlays } from './ui/Overlays';
import { SettingsPanel } from './ui/SettingsPanel';
import { Toast } from './ui/Toast';

export function App() {
  const touchLayer = useRef<HTMLDivElement>(null);
  const state = useGameUi((s) => s.state);
  const settingsOpen = useGameUi((s) => s.settingsOpen);
  const levelSelectOpen = useGameUi((s) => s.levelSelectOpen);
  const albumOpen = useGameUi((s) => s.albumOpen);

  useEffect(() => {
    if (touchLayer.current) void game.boot(touchLayer.current);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-fado-dusk">
      <GameCanvas />
      {/* Warstwa dotyku: tu trafiają gesty gry; interfejs leży nad nią. */}
      <div ref={touchLayer} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-0">
        {state === 'menu' ? <MainMenu /> : state === 'cutscene' ? null : <Hud />}
        {levelSelectOpen ? <ChapterSelect /> : null}
        {albumOpen ? <Album /> : null}
        {settingsOpen ? <SettingsPanel /> : null}
        <Overlays />
        <Toast />
      </div>
    </div>
  );
}
