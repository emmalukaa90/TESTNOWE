# Fado: Tropem do Domu

Mobilna gra przygodowa 3D (Android przez Capacitor). Stylizowane 3D w duchu animacji Pixar/DreamWorks:
shader sierści, miękkie światło wolumetryczne, fizyka uszu i szalika, Psi Węch z post-processingiem.

Stan: komplet **20 minigier** (4 rozdziały × 5), prolog i epilog na silniku gry, muzyka i dźwięk generowane proceduralnie
(WebAudio, bez plików), tryb pomocy, Album z 10 odznakami, powtórki cutscenek.

> **Uwaga:** projekt był pisany bez dostępu do rejestru npm, więc nie został jeszcze skompilowany ani uruchomiony.
> Po `npm install` uruchom `npm run build` — ewentualne drobne błędy typów (głównie API drei/postprocessing) naprawia się lokalnie.

## Co jest w grze

- **Rozdziały:** I Las (Symfonia, Bystrza, Ciernie, Zwiad, Burza), II Wieś (Kopanie, Owce, Spiżarnia, Traktor, Prysznic),
  III Miasto (Ruch, Echo, Łapacz, Bistro, Dachy), IV Powrót (Szyfr, Bagaż, Targ, Fajerwerki, Finał rytmiczny).
- **Systemy:** Psi Węch, haptyka (bicie serca), multi-touch/swipe/pinch/żyroskop/akcelerometr/mikrofon, zapis, Złote Kości i akcesoria.
- **Od siebie:** tryb pomocy (łagodniejsze tolerancje ×1.4), Album (statystyki, odznaki, powtórki prologu/epilogu),
  podpowiedź w „Bagażu”, generatywna muzyka z intensywnością zależną od akcji, karty zakończenia rozdziałów.


## Stos technologiczny

| Warstwa | Wybór | Po co |
|---|---|---|
| Render | React Three Fiber 8 + Three.js r160 | scena 3D deklaratywnie, shadery GLSL |
| Fizyka | Rapier3D (`@react-three/rapier`) | świat współdzielony z modułami minigier przez `PhysicsHandle` |
| Animacja filmowa | GSAP | ujęcia kamery, śledzenie siły węchu, cutscenki |
| Post-processing | `@react-three/postprocessing` | DoF, Bloom, Vignette, ACES, desaturacja węchu |
| UI | Tailwind CSS 3 | HUD, menu, wybór poziomów |
| Stan | Zustand | most gra ↔ React (zapis, HUD) |
| Android | Capacitor 6 | haptyka, orientacja, zapis (Preferences), WebView |

## Drzewo katalogów

```
fado/
├── capacitor.config.ts, vite.config.ts, tailwind.config.js, tsconfig.json
└── src/
    ├── main.tsx, App.tsx, index.css
    ├── core/
    │   ├── types.ts                 IMinigame, GameContext, InputEvent, GameEvents
    │   ├── EventBus.ts              typowana magistrala zdarzeń
    │   ├── StateMachine.ts          generyczna FSM z grafem przejść
    │   ├── MinigameStateMachine.ts  graf przepływu gry (menu→hub→intro→playing⇄paused→result)
    │   ├── MinigameManager.ts       rejestr, cykl życia modułu, sprzątanie zasobów
    │   ├── BaseMinigame.ts          baza dla modułów minigier
    │   ├── GameManager.ts           orkiestrator systemów (singleton `game`)
    │   ├── CameraDirector.ts        ujęcia, shake, FOV punch, roll (GSAP)
    │   ├── SaveSystem.ts            zapis, odblokowania, Złote Kości, akcesoria
    │   ├── PhysicsHandle.ts, store.ts, dispose.ts, random.ts
    ├── data/campaign.ts             4 rozdziały, metadane 20 minigier
    ├── systems/
    │   ├── InputAndSensorManager.ts multi-touch, tap/swipe/hold/pinch, żyroskop, shake, mikrofon
    │   ├── HapticController.ts      bicie serca, pulsowanie przy tropie
    │   └── scent/                   ScentController, ScentVisionSystem (wstęgi + cząsteczki)
    ├── characters/                  Fado.tsx, FurPart.tsx (shell fur), SpringChain.ts, Scarf.tsx
    ├── environment/wind.ts
    ├── render/quality.ts            profile low / medium / high
    ├── scenes/                      GameCanvas, ExplorationScene, ForestBackdrop, CameraRig, PostFX, PhysicsBridge
    ├── ui/                          MainMenu, Hud, ChapterSelect, SettingsPanel, Album, Overlays, Toast
    ├── cutscenes/                   CutsceneManager, Prologue, Epilogue, shared (Klara, wagon, oś czasu)
    ├── minigames/
    │   ├── registry.ts              rejestr 20 minigier
    │   ├── kit/                     helpery, Particles, PhysicsSet, TiltSource, makeFado
    │   └── ch1..ch4/                Game01..Game20 (po jednym module IMinigame)
    └── native/platform.ts           inicjalizacja Capacitora (orientacja, status bar, lifecycle)
```

## Uruchomienie

```bash
npm install
npm run dev          # podgląd w przeglądarce (telefon w tej samej sieci: adres z konsoli Vite)
npm run build        # typecheck + build produkcyjny do dist/
```

## APK bez Android Studio (GitHub Actions)

1. Wrzuć projekt do nowego repozytorium na GitHubie (gałąź `main`).
2. Zakładka **Actions** → „Build Android APK” (uruchamia się sama po pushu lub przyciskiem *Run workflow*).
3. Po kilku minutach pobierz artefakt **fado-debug-apk** → `app-debug.apk` i zainstaluj na telefonie
   (zezwól na instalację z nieznanych źródeł).

## Android (Capacitor)

```bash
npm run build
npm run cap:add      # raz: tworzy projekt android/
npm run cap:sync
npm run cap:open     # Android Studio
```

W `android/app/src/main/AndroidManifest.xml` dodaj uprawnienia:

```xml
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

Orientację poziomą wymusza `@capacitor/screen-orientation` przy starcie (`native/platform.ts`).

## Jak dodać minigrę

1. Utwórz plik `src/minigames/ch1/Game01Symphony.ts` dziedziczący po `BaseMinigame`
   (`onInitialize`, `startGame`, `onUpdate`, `handleInput`; wygrana/przegrana przez `this.win()` / `this.lose()`).
2. Zarejestruj w `src/minigames/registry.ts`: `manager.register(1, () => new Game01Symphony())`.
3. Wszystko, co moduł doda do `ctx.root`, zostanie zwolnione przez `MinigameManager.unload()`.
   Fizyka: `ctx.physics.world` i `ctx.physics.rapier`. Sensory: `ctx.input.enableMotion()`, `enableMicrophone()`.

## Uwagi

- Wejście: gest „przytrzymaj” w hubie włącza Psi Węch; w minigrach moduł sam steruje `ctx.scent`.
- `ExplorationScene` to polana testowa z trzema demonstracyjnymi tropami (żółty/zielony/czerwony).
- Tryb jakości jest dobierany przy pierwszym uruchomieniu wg pamięci i liczby rdzeni, można go zmienić w ustawieniach.
