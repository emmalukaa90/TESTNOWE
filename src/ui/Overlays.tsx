import { game } from '../core/GameManager';
import { useGameUi } from '../core/store';

/** Napisy, przesłona i przycisk pominięcia cutscenek oraz karta końcowa. */
export function Overlays() {
  const caption = useGameUi((s) => s.caption);
  const fade = useGameUi((s) => s.fade);
  const cutsceneId = useGameUi((s) => s.cutsceneId);
  const endCard = useGameUi((s) => s.endCard);

  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: fade, transition: 'opacity 60ms linear' }} />
      {cutsceneId ? (
        <>
          <div className="safe-pad pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-10">
            {caption ? (
              <p key={caption} className="max-w-2xl animate-pop rounded-2xl bg-black/55 px-6 py-3 text-center font-display text-xl font-bold text-fado-cream shadow-soft sm:text-2xl">
                {caption}
              </p>
            ) : null}
          </div>
          <div className="safe-pad absolute right-0 top-0">
            <button className="btn-ghost pointer-events-auto text-base" onClick={() => game.skipCutscene()}>
              Pomiń ⏭
            </button>
          </div>
        </>
      ) : null}
      {endCard ? (
        <div className="pointer-events-auto absolute inset-0 z-20 flex animate-pop flex-col items-center justify-center gap-5 bg-black/85 p-6 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-fado-autumn">Koniec</p>
          <h2 className="font-display text-5xl font-extrabold text-fado-scarf">Fado jest w domu</h2>
          <p className="max-w-md text-fado-cream/80">
            Dziękujemy, że przeszedłeś całą drogę razem z Fado. Żółty szalik znów jest na swoim miejscu.
          </p>
          <button className="btn-primary" onClick={() => game.finishEnding()}>
            Wróć do menu
          </button>
        </div>
      ) : null}
    </>
  );
}
