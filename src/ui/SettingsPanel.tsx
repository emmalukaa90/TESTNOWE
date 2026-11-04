import { ACCESSORY_LABELS, ACCESSORY_REQUIREMENTS, useSave } from '../core/SaveSystem';
import { game } from '../core/GameManager';
import { useGameUi } from '../core/store';
import type { AccessoryId, QualityTier } from '../core/types';

const QUALITY_LABELS: Record<QualityTier, string> = { low: 'Niska', medium: 'Średnia', high: 'Wysoka' };

export function SettingsPanel() {
  const data = useSave((s) => s.data);
  const { settings } = data;

  const setHaptics = (on: boolean) => {
    game.save.updateSettings({ haptics: on });
    game.applySettings();
    if (on) game.haptics.impact('medium');
  };

  const setVolume = (patch: { musicVolume?: number; sfxVolume?: number }) => {
    game.save.updateSettings(patch);
    game.applySettings();
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-fado-dusk/75 p-4 backdrop-blur-md">
      <div className="glass flex max-h-full w-full max-w-xl animate-pop flex-col gap-5 overflow-y-auto p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-3xl font-extrabold">Ustawienia</h2>
          <button className="btn-ghost" onClick={() => useGameUi.setState({ settingsOpen: false })}>
            Gotowe
          </button>
        </div>

        <section>
          <h3 className="mb-2 font-display text-lg font-bold">Jakość grafiki</h3>
          <div className="flex gap-2">
            {(Object.keys(QUALITY_LABELS) as QualityTier[]).map((tier) => (
              <button
                key={tier}
                onClick={() => game.save.updateSettings({ quality: tier })}
                className={settings.quality === tier ? 'btn-primary flex-1' : 'btn-ghost flex-1'}
              >
                {QUALITY_LABELS[tier]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-fado-cream/60">Niższa jakość oszczędza baterię i trzyma 60 FPS na starszych telefonach.</p>
        </section>

        <section className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Wibracje</h3>
          <button className={settings.haptics ? 'btn-primary' : 'btn-ghost'} onClick={() => setHaptics(!settings.haptics)}>
            {settings.haptics ? 'Włączone' : 'Wyłączone'}
          </button>
        </section>

        <section className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-bold">Tryb pomocy</h3>
            <p className="text-xs text-fado-cream/60">Większa tolerancja błędów i wolniejsze tempo. Złote Kości nadal do zdobycia.</p>
          </div>
          <button className={settings.assist ? 'btn-primary' : 'btn-ghost'} onClick={() => game.save.updateSettings({ assist: !settings.assist })}>
            {settings.assist ? 'Włączony' : 'Wyłączony'}
          </button>
        </section>

        <section className="flex flex-col gap-3">
          <Slider label="Muzyka" value={settings.musicVolume} onChange={(v) => setVolume({ musicVolume: v })} />
          <Slider label="Efekty" value={settings.sfxVolume} onChange={(v) => setVolume({ sfxVolume: v })} />
        </section>

        <section>
          <h3 className="mb-2 font-display text-lg font-bold">Szafa Fado</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              onClick={() => game.save.equip(null)}
              className={data.equippedAccessory === null ? 'btn-primary' : 'btn-ghost'}
            >
              Bez dodatków
            </button>
            {(Object.keys(ACCESSORY_LABELS) as AccessoryId[]).map((id) => {
              const owned = data.ownedAccessories.includes(id);
              return (
                <button
                  key={id}
                  disabled={!owned}
                  onClick={() => game.save.equip(id)}
                  className={`${data.equippedAccessory === id ? 'btn-primary' : 'btn-ghost'} disabled:opacity-40`}
                >
                  <span className="block text-sm">{ACCESSORY_LABELS[id]}</span>
                  {!owned ? <span className="block text-xs">🦴 {ACCESSORY_REQUIREMENTS[id]}</span> : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-4">
      <span className="w-20 font-display font-bold">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 flex-1 accent-fado-scarf"
      />
    </label>
  );
}
