import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';

export const isNative = (): boolean => Capacitor.isNativePlatform();

/** Inicjalizacja natywnej powłoki Androida: tryb poziomy, pełny ekran. W przeglądarce nic nie robi. */
export async function initNative(): Promise<void> {
  if (!isNative()) return;
  try {
    await ScreenOrientation.lock({ orientation: 'landscape' });
  } catch (error) {
    console.warn('[native] nie udało się zablokować orientacji', error);
  }
  try {
    await StatusBar.hide();
  } catch (error) {
    console.warn('[native] nie udało się ukryć paska stanu', error);
  }
}

/** Powiadamia o przejściu aplikacji w tło / na pierwszy plan (natywnie i w przeglądarce). */
export function onAppVisibility(callback: (visible: boolean) => void): void {
  document.addEventListener('visibilitychange', () => callback(!document.hidden));
  if (isNative()) {
    void App.addListener('appStateChange', ({ isActive }) => callback(isActive));
  }
}
