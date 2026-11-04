import { useGameUi } from '../core/store';

export function Toast() {
  const toast = useGameUi((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="safe-pad absolute inset-x-0 bottom-0 z-30 flex justify-center">
      <div key={toast.id} className="glass animate-pop px-5 py-3 text-center font-bold">
        {toast.message}
      </div>
    </div>
  );
}
