import { useState } from 'react';
import { game } from '../core/GameManager';
import { useSave } from '../core/SaveSystem';
import { useGameUi } from '../core/store';
import { CHAPTERS, getMinigameMeta } from '../data/campaign';

export function ChapterSelect() {
  const data = useSave((s) => s.data);
  const [chapterIndex, setChapterIndex] = useState(0);
  const chapter = CHAPTERS[chapterIndex];

  const close = () => useGameUi.setState({ levelSelectOpen: false });
  const play = (id: number) => {
    if (game.flow.is('menu')) {
      // z menu wchodzimy najpierw do huba (prolog odtwarza się tylko przy „Graj”)
      useGameUi.setState({ levelSelectOpen: false });
      game.flow.transition('hub');
    }
    void game.openLevel(id);
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-fado-dusk/75 p-4 backdrop-blur-md">
      <div className="glass flex max-h-full w-full max-w-4xl animate-pop flex-col gap-4 overflow-hidden p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-3xl font-extrabold">Poziomy</h2>
          <button className="btn-ghost" onClick={close}>
            Zamknij
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {CHAPTERS.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setChapterIndex(i)}
              className={`shrink-0 rounded-2xl px-4 py-2 text-left font-display font-bold transition ${
                i === chapterIndex ? 'text-fado-ink shadow-glow' : 'bg-white/10 text-fado-cream hover:bg-white/20'
              }`}
              style={i === chapterIndex ? { background: `linear-gradient(135deg, ${c.gradient[0]}, ${c.gradient[1]})` } : undefined}
            >
              <span className="block text-xs uppercase tracking-widest opacity-80">Rozdział {c.id}</span>
              {c.title}
            </button>
          ))}
        </div>

        <p className="text-sm text-fado-cream/70">{chapter.subtitle}</p>
        {chapter.levels.every((id) => data.completed[id]) ? <p className="rounded-xl bg-white/5 p-3 text-sm italic">{chapter.outro}</p> : null}

        <div className="grid grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {chapter.levels.map((id) => {
            const meta = getMinigameMeta(id);
            if (!meta) return null;
            const unlocked = game.save.isUnlocked(id);
            const record = data.completed[id];
            const implemented = game.minigames.isImplemented(id);
            return (
              <button
                key={id}
                disabled={!unlocked}
                onClick={() => play(id)}
                className={`rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                  unlocked ? 'border-white/20 bg-white/10 hover:bg-white/20' : 'border-white/5 bg-black/20 opacity-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-bold" style={{ color: meta.accent }}>
                    {id}
                  </span>
                  <span className="text-sm">
                    {record?.goldenBone ? '🦴 ' : ''}
                    {'★'.repeat(record?.stars ?? 0)}
                    <span className="text-white/20">{'★'.repeat(3 - (record?.stars ?? 0))}</span>
                  </span>
                </div>
                <div className="mt-1 font-display text-lg font-bold">{meta.title}</div>
                <p className="mt-1 text-xs text-fado-cream/70">{meta.summary}</p>
                {!unlocked ? <p className="mt-2 text-xs font-bold">🔒 Zablokowany</p> : null}
                {unlocked && !implemented ? <p className="mt-2 text-xs font-bold text-fado-autumn">Wkrótce</p> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
