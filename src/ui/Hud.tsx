import { game } from '../core/GameManager';
import { countGoldenBones, useSave } from '../core/SaveSystem';
import { useGameUi } from '../core/store';
import { getChapterOf, TOTAL_LEVELS } from '../data/campaign';
import { ACCESSORY_LABELS } from '../core/SaveSystem';
import type { AccessoryId } from '../core/types';

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <div className="h-2.5 w-44 overflow-hidden rounded-full bg-white/15">
      <div className={`h-full rounded-full transition-[width] duration-200 ${className}`} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Stars({ count }: { count: number }) {
  return (
    <div className="flex justify-center gap-2 text-4xl">
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= count ? 'text-fado-scarf drop-shadow-[0_0_10px_rgba(255,207,46,.8)]' : 'text-white/20'}>
          ★
        </span>
      ))}
    </div>
  );
}

export function Hud() {
  const state = useGameUi((s) => s.state);
  const meta = useGameUi((s) => s.activeMinigame);
  const objective = useGameUi((s) => s.objective);
  const progress = useGameUi((s) => s.progress);
  const courage = useGameUi((s) => s.courage);
  const timer = useGameUi((s) => s.timer);
  const hint = useGameUi((s) => s.hint);
  const result = useGameUi((s) => s.lastResult);
  const scentActive = useGameUi((s) => s.scentActive);
  const actions = useGameUi((s) => s.actions);
  const newAccessories = useGameUi((s) => s.newAccessories);
  const data = useSave((s) => s.data);

  if (state === 'boot') return null;

  if (state === 'hub') {
    return (
      <div className="safe-pad absolute inset-0 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="glass pointer-events-auto flex items-center gap-2 px-4 py-2 font-display text-lg font-bold">
            <span aria-hidden>🦴</span>
            {countGoldenBones(data)} / {TOTAL_LEVELS}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => useGameUi.setState({ levelSelectOpen: true })}>
              Poziomy
            </button>
            <button className="btn-ghost" onClick={() => useGameUi.setState({ albumOpen: true })}>
              Album
            </button>
            <button className="btn-ghost" onClick={() => useGameUi.setState({ settingsOpen: true })}>
              Ustawienia
            </button>
            <button className="btn-ghost" onClick={() => game.backToMenu()}>
              Menu
            </button>
          </div>
        </div>
        <div className="flex justify-center">
          <div className={`glass px-5 py-2 text-center text-sm transition ${scentActive ? 'shadow-glow' : ''}`}>
            {scentActive ? 'Węszysz… żółty ślad prowadzi do Klary' : 'Dotknij, by iść · Przytrzymaj ekran, by węszyć'}
          </div>
        </div>
      </div>
    );
  }

  if (state === 'minigame-intro' && meta) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-fado-dusk/60 backdrop-blur-sm">
        <div className="glass max-w-lg animate-pop px-8 py-6 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-[0.25em]" style={{ color: meta.accent }}>
            Rozdział {meta.chapter} · Poziom {meta.level}
          </p>
          <h2 className="mt-1 font-display text-4xl font-extrabold">{meta.title}</h2>
          <p className="mt-3 text-fado-cream/80">{meta.summary}</p>
          <p className="mt-3 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold">{meta.howTo}</p>
          <p className="mt-3 text-xs text-fado-scarf">🦴 {meta.boneGoal}</p>
        </div>
      </div>
    );
  }

  if (state === 'minigame-playing' || state === 'paused') {
    return (
      <>
        <div className="safe-pad absolute inset-0 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="glass flex flex-col gap-2 px-4 py-3">
              <div className="font-display text-base font-bold">{objective || meta?.title}</div>
              <Bar value={progress} className="bg-fado-scarf" />
              <div className="flex items-center gap-2 text-xs text-fado-cream/70">
                <span>Odwaga</span>
                <Bar value={courage} className="bg-fado-collar" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {timer !== null ? <div className="glass px-4 py-2 font-display text-xl font-bold">{formatTime(timer)}</div> : null}
              <button className="btn-ghost pointer-events-auto" onClick={() => game.pause()}>
                Pauza
              </button>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            {hint ? <div className="glass animate-pop px-5 py-2 text-sm">{hint}</div> : null}
            {actions && state === 'minigame-playing' ? (
              <div className="flex gap-3">
                {actions.map((a) => (
                  <button
                    key={a.id}
                    className="btn-primary min-w-[6.5rem] text-xl"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      game.triggerAction(a.id);
                    }}
                  >
                    {a.icon ? <span className="mr-1">{a.icon}</span> : null}
                    {a.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        {state === 'paused' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-fado-dusk/70 backdrop-blur-sm">
            <div className="glass flex animate-pop flex-col gap-3 px-10 py-8 text-center">
              <h2 className="font-display text-3xl font-extrabold">Pauza</h2>
              <button className="btn-primary" onClick={() => game.resume()}>
                Wróć do gry
              </button>
              <button className="btn-ghost" onClick={() => game.retry()}>
                Zacznij od nowa
              </button>
              <button className="btn-ghost" onClick={() => game.quitToHub()}>
                Wyjdź do polany
              </button>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (state === 'minigame-result' && result && meta) {
    const won = result.outcome === 'win';
    const chapter = getChapterOf(meta.id);
    const chapterEnd = won && chapter !== undefined && meta.level === 5;
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-fado-dusk/70 backdrop-blur-sm">
        <div className="glass flex min-w-[20rem] animate-pop flex-col gap-4 px-10 py-8 text-center">
          <h2 className="font-display text-4xl font-extrabold">{won ? 'Brawo, Fado!' : 'Spróbuj jeszcze raz'}</h2>
          <p className="text-fado-cream/80">{meta.title}</p>
          {won ? <Stars count={result.stars} /> : null}
          {newAccessories.map((a) => (
            <p key={a} className="font-display font-bold text-fado-autumn">🎩 Nowy dodatek: {ACCESSORY_LABELS[a as AccessoryId]}</p>
          ))}
          {chapterEnd && chapter ? <p className="rounded-xl bg-white/10 p-3 text-sm italic">{chapter.outro}</p> : null}
          {result.goldenBone ? <p className="font-display text-lg font-bold text-fado-scarf">🦴 Złota Kość zdobyta!</p> : null}
          <p className="text-sm text-fado-cream/60">Czas: {formatTime(result.timeSeconds)}</p>
          <div className="flex flex-col gap-2">
            {won ? (
              <button className="btn-primary" onClick={() => game.nextLevel()}>
                {meta.id >= TOTAL_LEVELS ? 'Epilog ▶' : 'Dalej'}
              </button>
            ) : null}
            <button className="btn-ghost" onClick={() => game.retry()}>
              Powtórz
            </button>
            <button className="btn-ghost" onClick={() => game.quitToHub()}>
              Polana
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
