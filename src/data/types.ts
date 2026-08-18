/** Shared shapes for every catalog in this folder. */

/** Classical Keplerian elements plus their per-century rates (JPL, epoch J2000). */
export interface KeplerElements {
  /** Semi-major axis, au. */
  a: number;
  /** Eccentricity. */
  e: number;
  /** Inclination to the ecliptic, degrees. */
  i: number;
  /** Mean longitude, degrees. */
  L: number;
  /** Longitude of perihelion, degrees. */
  peri: number;
  /** Longitude of the ascending node, degrees. */
  node: number;
}

/** Rates of change of the elements, per Julian century. */
export type KeplerRates = KeplerElements;

/**
 * JPL's wider-range element set, valid 3000 BC – 3000 AD, with the extra
 * long-period terms the outer planets need over that span.
 */
export interface WideElements {
  elements: KeplerElements;
  rates: KeplerRates;
  outer?: OuterTerms;
}

/** Extra long-period terms JPL applies to the outer planets. */
export interface OuterTerms {
  b: number;
  c: number;
  s: number;
  f: number;
}

export type BodyKind = 'star' | 'planet' | 'dwarf' | 'moon';

/** How a body's surface is synthesised on the GPU. */
export type SurfaceStyle =
  | 'rock' | 'cratered' | 'volcanic' | 'terrestrial' | 'desert'
  | 'clouded' | 'gasGiant' | 'iceGiant' | 'ice' | 'sun';

export interface Ring {
  /** Inner and outer radii, in units of the parent body's radius. */
  inner: number;
  outer: number;
  tilt?: number;
}

export interface Moon {
  name: string;
  /** Mean radius, km. */
  radius: number;
  /** Semi-major axis about the parent, km. */
  a: number;
  /** Sidereal period, days. Negative means retrograde. */
  period: number;
  /** Orbital inclination to the parent's equator, degrees. */
  inclination: number;
  ecc?: number;
  style: SurfaceStyle;
  color: number;
  /** One-line description shown in the info panel. */
  note: string;
}

export interface Body {
  id: string;
  name: string;
  kind: BodyKind;
  /** Mean radius, km. */
  radius: number;
  /** Mass, 10^24 kg. */
  mass: number;
  /** Sidereal rotation period, hours. Negative means retrograde. */
  rotation: number;
  /** Obliquity to its orbit, degrees. */
  tilt: number;
  /** Mean surface (or 1-bar) temperature, °C. */
  temp: number;
  /** Confirmed natural satellites. */
  moonCount: number;
  style: SurfaceStyle;
  /** Base albedo colour used by the surface shader. */
  color: number;
  /** Atmospheric rim colour, if it has an appreciable atmosphere. */
  atmosphere?: number;
  /** Strength of the atmospheric rim, 0–1. */
  atmosphereDensity?: number;
  /** JPL Table 1 elements, valid 1800–2050. */
  elements: KeplerElements;
  rates: KeplerRates;
  rings?: Ring;
  moons?: Moon[];
  /** Prose shown in the info panel. */
  blurb: string;
  facts: [string, string][];
}

export interface NearbyStar {
  name: string;
  /** ICRS right ascension and declination, degrees. */
  ra: number;
  dec: number;
  /** Distance from the Sun, light years. */
  ly: number;
  /** Galactic cartesian position in light years; the galactic plane is XZ. */
  pos: [number, number, number];
  spectral: string;
  /** Apparent visual magnitude, where known. */
  vmag: number | null;
  /** SIMBAD object type, e.g. "PM*", "WD*", "BD*". */
  kind: string;
  /** Proper motion in RA and Dec, mas/yr. */
  pm: [number | null, number | null];
  /** Radial velocity, km/s. */
  rv: number | null;
}

export interface ExoPlanet {
  name: string;
  /** Orbital period, days. */
  period: number | null;
  /** Semi-major axis, au. */
  au: number | null;
  /** Radius in Earth radii. */
  radius: number | null;
  /** Mass (or minimum mass) in Earth masses. */
  mass: number | null;
  ecc: number;
  /** Equilibrium temperature, K. */
  eqTemp: number | null;
  /** Year of discovery. */
  year: number | null;
}

export interface ExoSystem {
  host: string;
  ra: number;
  dec: number;
  ly: number;
  pos: [number, number, number];
  /** Effective temperature, K. */
  teff: number | null;
  /** Radius in solar radii. */
  radius: number | null;
  /** Mass in solar masses. */
  mass: number | null;
  /** Bolometric luminosity in solar luminosities. */
  lum: number | null;
  spectral: string;
  vmag: number | null;
  planets: ExoPlanet[];
}

/** Elements for a small body, given at a specific epoch rather than as rates. */
export interface EpochElements {
  /** Julian date the elements are osculating at. */
  epoch: number;
  a: number;
  e: number;
  /** Inclination, degrees. */
  i: number;
  /** Longitude of the ascending node, degrees. */
  node: number;
  /** Argument of perihelion, degrees. */
  argPeri: number;
  /** Mean anomaly at the epoch, degrees. */
  M0: number;
  /** Orbital period, days. */
  period: number;
}

export interface SmallBody {
  id: string;
  name: string;
  kind: 'dwarf' | 'asteroid' | 'comet';
  /** Mean radius, km. */
  radius: number;
  /** Sidereal rotation period, hours. */
  rotation: number;
  color: number;
  style: SurfaceStyle;
  orbit: EpochElements;
  moons?: Moon[];
  blurb: string;
  facts: [string, string][];
}
