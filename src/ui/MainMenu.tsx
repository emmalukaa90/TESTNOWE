import { game } from '../core/GameManager';
import { countGoldenBones, useSave } from '../core/SaveSystem';
import { TOTAL_LEVELS } from '../data/campaign';
import { useGameUi } from '../core/store';

export function MainMenu() {
  const data = useSave((s) => s.data);
  const loaded = useSave((s) => s.loaded);
  const hasProgress = data.highestUnlocked > 1 || Object.keys(data.completed).length > 0;

  return (
    <div className="safe-pad absolute inset-0 flex items-center justify-between bg-gradient-to-r from-fado-dusk/80 via-fado-dusk/25 to-transparent">
      <div className="max-w-md animate-pop">
        <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-fado-autumn">Przygoda z beaglem</p>
        <h1 className="mt-1 font-display text-5xl font-extrabold leading-[0.95] text-fado-cream drop-shadow-lg sm:text-6xl">
          Fado
          <span className="block text-3xl text-fado-scarf sm:text-4xl">Tropem do Domu</span>
        </h1>
        <p className="mt-4 text-base text-fado-cream/80">
          Żółty szalik, pędzący pociąg i jeden bardzo uparty nos. Pomóż Fado wrócić do Klary.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button className="btn-primary" disabled={!loaded} onClick={() => game.startAdventure()}>
            {hasProgress ? 'Kontynuuj' : 'Graj'}
          </button>
          <button
            className="btn-ghost"
            onClick={() => useGameUi.setState({ levelSelectOpen: true })}
          >
            Poziomy
          </button>
          <button className="btn-ghost" onClick={() => useGameUi.setState({ albumOpen: true })}>
            Album
          </button>
          <button className="btn-ghost" onClick={() => useGameUi.setState({ settingsOpen: true })}>
            Ustawienia
          </button>
        </div>

        <p className="mt-5 flex items-center gap-2 text-sm text-fado-cream/70">
          <span aria-hidden>🦴</span>
          Złote Kości: {countGoldenBones(data)} / {TOTAL_LEVELS}
        </p>
      </div>
    </div>
  );
}
