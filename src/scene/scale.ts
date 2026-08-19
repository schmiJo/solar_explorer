/**
 * How physical distances become scene distances.
 *
 * At true scale the solar system is almost entirely empty: Earth is 4.3e-5 au
 * across on a 1 au orbit, so a view that frames the orbit renders the planet
 * at a fraction of a pixel. That is the honest picture and it is worth being
 * able to see, but it makes for a poor map. So there are two models, and the
 * app blends smoothly between them:
 *
 *   realistic  — 1 scene unit = 1 au, bodies at their true size
 *   schematic  — orbits compressed logarithmically, bodies enlarged by a
 *                power law, so every planet is visible at once
 *
 * `t` is the blend, eased by `update`. Nothing else in the app needs to know
 * which mode is active.
 */
import { Vector3 } from 'three';
import { AU_KM } from '../data/solarSystem';

/** Earth's radius in km, the reference for the schematic size law. */
const EARTH_RADIUS_KM = 6371;

export class ScaleModel {
  /** 0 = realistic, 1 = schematic. */
  t = 1;
  private target = 1;
  /** Bumped whenever `t` moves, so cached geometry knows to rebuild. */
  revision = 0;

  get schematic(): boolean { return this.target > 0.5; }

  setMode(schematic: boolean): void { this.target = schematic ? 1 : 0; }
  toggle(): void { this.setMode(!this.schematic); }

  update(dt: number): boolean {
    if (Math.abs(this.target - this.t) < 1e-4) {
      if (this.t !== this.target) { this.t = this.target; this.revision++; return true; }
      return false;
    }
    this.t += (this.target - this.t) * (1 - Math.pow(0.001, dt));
    this.revision++;
    return true;
  }

  /** Orbital radius in au to display radius. */
  orbitRadius(au: number): number {
    if (this.t === 0) return au;
    const compressed = 0.9 * Math.log10(1 + au / 0.25);
    return au + (compressed - au) * this.t;
  }

  /** Remap a heliocentric position, preserving its direction. */
  mapPosition(au: Vector3, out = new Vector3()): Vector3 {
    const r = au.length();
    if (r < 1e-12) return out.set(0, 0, 0);
    return out.copy(au).multiplyScalar(this.orbitRadius(r) / r);
  }

  /**
   * Body radius in km to display radius.
   *
   * Stars follow a gentler curve than everything else. One law cannot serve
   * both: an exponent flat enough to keep the Sun from swallowing Mercury's
   * orbit also inflates a 200 km moon until it rivals Saturn.
   */
  bodyRadius(km: number, isStar = false): number {
    const real = km / AU_KM;
    if (this.t === 0) return real;
    const enlarged = isStar
      ? 0.020 * Math.pow(km / EARTH_RADIUS_KM, 0.30)
      : 0.021 * Math.pow(km / EARTH_RADIUS_KM, 0.55);
    return real + (enlarged - real) * this.t;
  }

  /**
   * Semi-major axis of a satellite orbit, in display units. Moons are pushed
   * out relative to their (enlarged) parent so they clear its surface.
   */
  moonOrbit(aKm: number, parentRadiusKm: number): number {
    const real = aKm / AU_KM;
    if (this.t === 0) return real;
    const ratio = aKm / parentRadiusKm;
    const spread = this.bodyRadius(parentRadiusKm) * (1.6 + 0.9 * Math.log10(1 + ratio));
    return real + (spread - real) * this.t;
  }
}
