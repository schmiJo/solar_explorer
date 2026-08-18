/**
 * Star colour from temperature.
 *
 * Uses Mitchell Charity's blackbody colour table (bbr_color.txt, CIE-based,
 * sRGB D65) sampled every 1000 K and interpolated. Real stars are far less
 * saturated than the naive Planck-curve conversion suggests, and this table is
 * what keeps an M dwarf orange rather than fire-engine red.
 */
import { Color } from 'three';

/** [kelvin, r, g, b] in 0–255, from 1000 K to 40000 K. */
const BLACKBODY: [number, number, number, number][] = [
  [1000, 255, 56, 0], [1500, 255, 109, 0], [2000, 255, 137, 18], [2500, 255, 161, 72],
  [3000, 255, 180, 107], [3500, 255, 196, 137], [4000, 255, 209, 163], [4500, 255, 219, 186],
  [5000, 255, 228, 206], [5500, 255, 236, 224], [6000, 255, 243, 239], [6500, 255, 249, 253],
  [7000, 245, 243, 255], [7500, 235, 238, 255], [8000, 227, 233, 255], [8500, 220, 229, 255],
  [9000, 214, 225, 255], [10000, 204, 219, 255], [11000, 196, 215, 255], [12000, 191, 211, 255],
  [14000, 183, 206, 255], [16000, 178, 202, 255], [20000, 172, 198, 255], [25000, 168, 195, 255],
  [30000, 165, 193, 255], [40000, 163, 191, 255],
];

/** Linear-interpolated sRGB triple in 0–1 for a blackbody at `kelvin`. */
export function blackbodyRGB(kelvin: number): [number, number, number] {
  const t = Math.max(1000, Math.min(40000, kelvin));
  let i = 0;
  while (i < BLACKBODY.length - 2 && BLACKBODY[i + 1][0] < t) i++;
  const [t0, r0, g0, b0] = BLACKBODY[i];
  const [t1, r1, g1, b1] = BLACKBODY[i + 1];
  const f = (t - t0) / (t1 - t0);
  return [(r0 + (r1 - r0) * f) / 255, (g0 + (g1 - g0) * f) / 255, (b0 + (b1 - b0) * f) / 255];
}

export function blackbodyColor(kelvin: number, target = new Color()): Color {
  const [r, g, b] = blackbodyRGB(kelvin);
  return target.setRGB(r, g, b);
}

/** GLSL port of the same table, compressed to a piecewise fit. */
export const BLACKBODY_GLSL = /* glsl */ `
/** Approximate sRGB colour of a blackbody, matched to Charity's table. */
vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 1000.0, 40000.0) / 1000.0;
  vec3 c;
  if (t < 6.6) {
    c.r = 1.0;
    c.g = clamp(0.3900816 * log(t) + 0.6527497 * (t - 2.0) / 8.0, 0.0, 1.0);
    c.b = t < 1.9 ? 0.0 : clamp(0.5432068 * log(t - 1.9) + 0.3862, 0.0, 1.0);
  } else {
    c.r = clamp(1.2929362 * pow(t - 6.0, -0.1332047), 0.0, 1.0);
    c.g = clamp(1.1298909 * pow(t - 6.0, -0.0755148), 0.0, 1.0);
    c.b = 1.0;
  }
  return c;
}
`;

const CLASS_TEMP: Record<string, [number, number]> = {
  O: [42000, 30000], B: [30000, 10000], A: [10000, 7500], F: [7500, 6000],
  G: [6000, 5200], K: [5200, 3700], M: [3700, 2400], L: [2400, 1300],
  T: [1300, 600], Y: [600, 350],
};

/** Effective temperature implied by a spectral type such as "M5.5Ve" or "G2V". */
export function temperatureFromSpectral(spectral: string): number | null {
  const m = /^\s*(?:[dsg]|sd)?([OBAFGKMLTY])\s*(\d+(?:\.\d+)?)?/.exec(spectral);
  if (!m) return null;
  const [hot, cool] = CLASS_TEMP[m[1]];
  const sub = m[2] == null ? 5 : Math.min(Number(m[2]), 9.9);
  return hot + ((cool - hot) * sub) / 10;
}

/** Leading spectral class letter, or null if the type is unparseable. */
export function spectralClass(spectral: string): string | null {
  return /^\s*(?:[dsg]|sd)?([OBAFGKMLTY])/.exec(spectral)?.[1] ?? null;
}
