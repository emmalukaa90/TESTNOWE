import { MathUtils, type Vector3 } from 'three';

/**
 * Łańcuch sprężyn dla ucha: każdy segment ma dwa stopnie swobody (obrót wokół X i Z),
 * napędzane przyspieszeniem głowy, wiatrem i grawitacją w układzie lokalnym głowy.
 * Segmenty są zagnieżdżone w scenie, więc kąty się sumują (efekt "oklapniętego" ucha).
 */
export interface EarState {
  ax: number[];
  vx: number[];
  az: number[];
  vz: number[];
}

export function createEarState(segments = 3): EarState {
  const zeros = () => new Array<number>(segments).fill(0);
  return { ax: zeros(), vx: zeros(), az: zeros(), vz: zeros() };
}

const MAX_ANGLE = 1.3;

/**
 * @param acc    przyspieszenie głowy w układzie lokalnym (m/s²)
 * @param wind   wiatr w układzie lokalnym (m/s)
 * @param down   jednostkowy wektor "w dół" w układzie lokalnym głowy
 * @param side   +1 / -1 (strona głowy, na której wisi ucho)
 * @param lift   uniesienie ucha z wyrazu twarzy (-0.3..0.5)
 */
export function stepEarChain(
  s: EarState,
  dt: number,
  acc: Vector3,
  wind: Vector3,
  down: Vector3,
  side: number,
  lift: number,
): void {
  const substeps = 2;
  const h = dt / substeps;
  const ax = MathUtils.clamp(acc.x, -30, 30);
  const az = MathUtils.clamp(acc.z, -30, 30);

  for (let step = 0; step < substeps; step++) {
    for (let i = 0; i < s.ax.length; i++) {
      const inertiaGain = 0.022 * (1 + i * 0.6);
      const windGain = 0.12 * (1 + i * 0.4);

      const restZ = i === 0 ? side * (0.12 + lift * 0.9) : side * 0.04;
      const restX = i === 0 ? -lift * 0.5 : 0.05;

      // Obrót wokół X: dodatni kąt przesuwa dół ucha w stronę -Z.
      const driveX = az * inertiaGain + wind.z * windGain - down.z * 0.9;
      // Obrót wokół Z: dodatni kąt przesuwa dół ucha w stronę +X.
      const driveZ = -ax * inertiaGain - wind.x * windGain + down.x * 0.9;

      const k = i === 0 ? 70 : 48;
      const c = i === 0 ? 9 : 6.5;

      s.vx[i] += (-k * (s.ax[i] - restX - driveX) - c * s.vx[i]) * h;
      s.vz[i] += (-k * (s.az[i] - restZ - driveZ) - c * s.vz[i]) * h;
      s.ax[i] = MathUtils.clamp(s.ax[i] + s.vx[i] * h, -MAX_ANGLE, MAX_ANGLE);
      s.az[i] = MathUtils.clamp(s.az[i] + s.vz[i] * h, -MAX_ANGLE, MAX_ANGLE);
    }
  }
}
