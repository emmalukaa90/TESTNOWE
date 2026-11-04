import { game } from '../core/GameManager';
import { countGoldenBones, useSave } from '../core/SaveSystem';
import { useGameUi } from '../core/store';
import { BADGES } from '../data/badges';
import { CHAPTERS, TOTAL_LEVELS } from '../data/campaign';

/** Album: odznaki, statystyki i powtórki cutscenek. */
export function Album() {
  const data = useSave((s) => s.data);
  const earned = BADGES.filter((b) => b.earned(data)).length;
  const stars = Object.values(data.completed).reduce((sum, r) => sum + r.stars, 0);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-fado-dusk/80 p-4 backdrop-blur-md">
      <div className="glass flex max-h-full w-full max-w-3xl animate-pop flex-col gap-4 overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-3xl font-extrabold">Album Fado</h2>
          <button className="btn-ghost" onClick={() => useGameUi.setState({ albumOpen: false })}>
            Zamknij
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Złote Kości" value={`${countGoldenBones(data)} / ${TOTAL_LEVELS}`} icon="🦴" />
          <Stat label="Gwiazdki" value={`${stars} / ${TOTAL_LEVELS * 3}`} icon="⭐" />
          <Stat label="Odznaki" value={`${earned} / ${BADGES.length}`} icon="🏅" />
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BADGES.map((b) => {
            const ok = b.earned(data);
            return (
              <div key={b.id} className={`rounded-2xl border p-3 ${ok ? 'border-fado-scarf/60 bg-white/10' : 'border-white/5 bg-black/20 opacity-50'}`}>
                <div className="text-3xl">{ok ? b.icon : '🔒'}</div>
                <div className="font-display font-bold">{b.title}</div>
                <div className="text-xs text-fado-cream/70">{b.description}</div>
              </div>
            );
          })}
        </section>

        <section>
          <h3 className="mb-2 font-display text-lg font-bold">Historia</h3>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" disabled={!data.seenPrologue} onClick={() => game.replayCutscene('prologue')}>
              ▶ Prolog
            </button>
            <button className="btn-ghost" disabled={!data.seenEpilogue} onClick={() => game.replayCutscene('epilogue')}>
              ▶ Epilog
            </button>
          </div>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-fado-cream/80">
            {CHAPTERS.map((c, i) =>
              c.levels.every((id) => data.completed[id]) ? (
                <li key={c.id} className="rounded-xl bg-white/5 p-3">
                  <span className="font-display font-bold">{i + 1}. {c.title}</span>
                  <br />
                  {c.outro}
                </li>
              ) : null,
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3">
      <div className="text-2xl">{icon}</div>
      <div className="font-display text-xl font-extrabold">{value}</div>
      <div className="text-xs text-fado-cream/70">{label}</div>
    </div>
  );
}
