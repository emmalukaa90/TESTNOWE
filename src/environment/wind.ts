import { Vector3 } from 'three';

/** Globalny wiatr: kierunek bazowy + porywy. Rozdział I (burza) podkręca `base`. */
export const wind = {
  base: new Vector3(0.6, 0, 0.25),
  gustiness: 1,
};

/** Zapisuje wektor wiatru (m/s, w układzie świata) dla czasu t do `out`. */
export function sampleWind(t: number, out: Vector3): Vector3 {
  const gust = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 1.9 + 1.3);
  const flutter = Math.sin(t * 5.1) * 0.1;
  const strength = 0.6 + gust * 1.6 * wind.gustiness + flutter;
  return out.copy(wind.base).multiplyScalar(strength);
}
