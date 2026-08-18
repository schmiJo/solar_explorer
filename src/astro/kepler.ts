/**
 * Orbit propagation.
 *
 * Planets use JPL's approximate-position algorithm: linear element rates from
 * J2000 plus, for the outer planets, extra long-period terms in the mean
 * anomaly. Small bodies use osculating elements propagated from their own epoch
 * by mean motion. Both paths end in the same place — heliocentric ecliptic
 * cartesian coordinates in au.
 *
 * Reference: https://ssd.jpl.nasa.gov/planets/approx_pos.html
 */
import { Vector3 } from 'three';
import type { Body, EpochElements, OuterTerms, WideElements } from '../data/types';
import { TABLE1_RANGE, WIDE_ELEMENTS } from '../data/solarSystem';
import { centuriesSinceJ2000 } from './time';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/** Wrap to [-180, 180) degrees. */
function wrapDeg(x: number): number {
  return ((((x + 180) % 360) + 360) % 360) - 180;
}

/**
 * Solve Kepler's equation M = E - e·sin E by Newton–Raphson.
 * Converges in a handful of iterations for e < 0.9; comets get more headroom.
 */
export function solveKepler(M: number, e: number): number {
  // Start from a guess that stays sane at high eccentricity.
  let E = e < 0.8 ? M + e * Math.sin(M) : Math.PI * Math.sign(M || 1);
  for (let n = 0; n < 40; n++) {
    const f = E - e * Math.sin(E) - M;
    const df = 1 - e * Math.cos(E);
    const dE = f / df;
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/**
 * Position in the orbital plane, rotated into the ecliptic frame.
 * Angles in radians; `a` in au; result in au.
 */
function orbitalToEcliptic(
  a: number, e: number, E: number, argPeri: number, inc: number, node: number, out: Vector3,
): Vector3 {
  // In-plane coordinates with the x-axis toward perihelion.
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cw = Math.cos(argPeri), sw = Math.sin(argPeri);
  const co = Math.cos(node), so = Math.sin(node);
  const ci = Math.cos(inc), si = Math.sin(inc);

  const x = (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp;
  const y = (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp;
  const z = sw * si * xp + cw * si * yp;
  return out.set(x, y, z);
}

/**
 * Ecliptic (x, y, z) in au to the scene's y-up frame, where the ecliptic plane
 * is the XZ plane.
 */
export function eclipticToScene(v: Vector3): Vector3 {
  return v.set(v.x, v.z, -v.y);
}

/**
 * Pick the element set covering `jd`. Table 1 is the more accurate of the two
 * but only spans 1800–2050; outside that we fall back to the wide-range set.
 */
function elementsFor(body: Body, jd: number): WideElements {
  if (jd >= TABLE1_RANGE[0] && jd <= TABLE1_RANGE[1]) {
    return { elements: body.elements, rates: body.rates };
  }
  return WIDE_ELEMENTS[body.id] ?? { elements: body.elements, rates: body.rates };
}

/** Heliocentric position of a planet at Julian date `jd`, in scene coordinates (au). */
export function planetPosition(body: Body, jd: number, out = new Vector3()): Vector3 {
  const T = centuriesSinceJ2000(jd);
  const set = elementsFor(body, jd);
  const el = set.elements, r = set.rates;

  const a = el.a + r.a * T;
  const e = el.e + r.e * T;
  const inc = (el.i + r.i * T) * DEG;
  const L = el.L + r.L * T;
  const peri = el.peri + r.peri * T;
  const node = (el.node + r.node * T) * DEG;

  let M = L - peri;
  const o: OuterTerms | undefined = set.outer;
  if (o) M += o.b * T * T + o.c * Math.cos(o.f * DEG * T) + o.s * Math.sin(o.f * DEG * T);

  const E = solveKepler(wrapDeg(M) * DEG, e);
  orbitalToEcliptic(a, e, E, (peri * DEG) - node, inc, node, out);
  return eclipticToScene(out);
}

/** Heliocentric position of a small body at `jd`, in scene coordinates (au). */
export function smallBodyPosition(orbit: EpochElements, jd: number, out = new Vector3()): Vector3 {
  const n = TAU / orbit.period;                    // mean motion, rad/day
  const M = orbit.M0 * DEG + n * (jd - orbit.epoch);
  // Wrap into (-pi, pi] so Newton starts well-conditioned even after millennia.
  const wrapped = ((M % TAU) + TAU) % TAU;
  const E = solveKepler(wrapped > Math.PI ? wrapped - TAU : wrapped, orbit.e);
  orbitalToEcliptic(orbit.a, orbit.e, E, orbit.argPeri * DEG, orbit.i * DEG, orbit.node * DEG, out);
  return eclipticToScene(out);
}

/**
 * Sample a closed orbit into a polyline. Points are spaced by eccentric anomaly,
 * which naturally puts more of them near perihelion where the curve bends most.
 */
export function sampleOrbit(
  a: number, e: number, incDeg: number, nodeDeg: number, argPeriDeg: number, segments = 512,
): Vector3[] {
  const pts: Vector3[] = [];
  const inc = incDeg * DEG, node = nodeDeg * DEG, argPeri = argPeriDeg * DEG;
  for (let i = 0; i <= segments; i++) {
    const E = (i / segments) * TAU;
    const v = orbitalToEcliptic(a, e, E, argPeri, inc, node, new Vector3());
    pts.push(eclipticToScene(v));
  }
  return pts;
}

/** Sample a planet's orbit using its elements at `jd`, so it drifts with them. */
export function samplePlanetOrbit(body: Body, jd: number, segments = 512): Vector3[] {
  const T = centuriesSinceJ2000(jd);
  const set = elementsFor(body, jd);
  const el = set.elements, r = set.rates;
  const node = el.node + r.node * T;
  return sampleOrbit(
    el.a + r.a * T, el.e + r.e * T, el.i + r.i * T, node, (el.peri + r.peri * T) - node, segments,
  );
}

/**
 * Position of a moon relative to its planet, in au. Moons are modelled on
 * circular-to-mildly-elliptical orbits in the planet's equatorial plane, which
 * is what the mean elements in the catalog describe.
 */
export function moonPosition(
  aKm: number, periodDays: number, eccentricity: number, incDeg: number,
  phase: number, jd: number, auKm: number, out = new Vector3(),
): Vector3 {
  const M = TAU * ((jd / periodDays) + phase);
  const Mw = ((M % TAU) + TAU) % TAU;
  const E = solveKepler(Mw > Math.PI ? Mw - TAU : Mw, eccentricity);
  const a = aKm / auKm;
  const inc = incDeg * DEG;
  const xp = a * (Math.cos(E) - eccentricity);
  const zp = a * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(E);
  // Tilt the orbit about the x-axis by the inclination.
  return out.set(xp, zp * Math.sin(inc), zp * Math.cos(inc));
}

/** Orbital speed at a given radius, km/s, for the info readout. */
export function orbitalSpeed(aAu: number, rAu: number, starMassSolar = 1): number {
  const GM = 1.32712440018e11 * starMassSolar; // km³/s² for the Sun
  const auKm = 149_597_870.7;
  return Math.sqrt(GM * (2 / (rAu * auKm) - 1 / (aAu * auKm)));
}
