/**
 * A star system, described uniformly.
 *
 * The Solar System and the 61 exoplanet systems in the catalog come from very
 * different sources, so both are normalised into this shape before anything is
 * rendered. Everything downstream — the scene builder, the info panel, the
 * search — only ever sees a SystemModel.
 */
import { Vector3 } from 'three';
import type { Body, ExoPlanet, ExoSystem, SmallBody, SurfaceStyle } from '../data/types';
import { AU_KM, PLANETS, SMALL_BODIES, SUN } from '../data/solarSystem';
import { moonPosition, planetPosition, sampleOrbit, samplePlanetOrbit, smallBodyPosition } from '../astro/kepler';
import { temperatureFromSpectral } from '../astro/color';

export type NodeKind = 'star' | 'planet' | 'dwarf' | 'asteroid' | 'comet' | 'moon' | 'exoplanet';

/** How a node's position is computed at a given Julian date. */
export type Ephemeris =
  | { kind: 'fixed' }
  | { kind: 'jpl'; body: Body }
  | { kind: 'epoch'; body: SmallBody }
  | { kind: 'satellite'; aKm: number; periodDays: number; ecc: number; incDeg: number; phase: number }
  | { kind: 'circularish'; au: number; periodDays: number; ecc: number; incDeg: number; argPeri: number; phase: number };

export interface InfoFact { label: string; value: string; }

export interface SystemNode {
  id: string;
  name: string;
  kind: NodeKind;
  /** Mean radius, km. */
  radiusKm: number;
  /** Sidereal rotation period, hours. Negative is retrograde. */
  rotationHours: number;
  /** Obliquity, degrees. */
  tiltDeg: number;
  style: SurfaceStyle;
  color: number;
  atmosphere?: number;
  atmosphereDensity?: number;
  /** Fractional cloud coverage; omit for no cloud deck. */
  clouds?: number;
  rings?: { inner: number; outer: number; detail: number };
  /** Longitude of a persistent storm, radians. */
  spotLongitude?: number;
  ephemeris: Ephemeris;
  parentId?: string;
  /** Semi-major axis in au, for orbit lines and sorting. Zero for the star. */
  au: number;
  blurb: string;
  facts: InfoFact[];
  /** Set when a value in the catalog was missing and had to be estimated. */
  estimated?: boolean;
}

export interface SystemModel {
  id: string;
  name: string;
  /** Star mass in solar masses, used for orbital-speed readouts. */
  starMass: number;
  /** Star luminosity in solar luminosities, used for the habitable zone. */
  luminosity: number;
  /** Distance from the Sun in light years; zero for the Solar System. */
  distanceLy: number;
  nodes: SystemNode[];
  /** Longest semi-major axis in the system, au. */
  extent: number;
  /** Prose about the system as a whole. */
  blurb: string;
}

const facts = (pairs: [string, string][]): InfoFact[] =>
  pairs.map(([label, value]) => ({ label, value }));

// ---------------------------------------------------------------- solar system

/** Deterministic per-body phase so moons are not all lined up at t = 0. */
const phaseFor = (name: string): number => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
};

function moonNodes(parentId: string, parent: Body | SmallBody): SystemNode[] {
  return (parent.moons ?? []).map((m) => ({
    id: `${parentId}/${m.name.toLowerCase()}`,
    name: m.name,
    kind: 'moon' as const,
    radiusKm: m.radius,
    // Major moons are tidally locked, so they rotate once per orbit.
    rotationHours: m.period * 24,
    tiltDeg: 0,
    style: m.style,
    color: m.color,
    ephemeris: {
      kind: 'satellite' as const,
      aKm: m.a, periodDays: m.period, ecc: m.ecc ?? 0, incDeg: m.inclination,
      phase: phaseFor(m.name),
    },
    parentId,
    au: m.a / AU_KM,
    blurb: m.note,
    facts: facts([
      ['Radius', `${m.radius.toLocaleString()} km`],
      ['Orbital radius', `${Math.round(m.a).toLocaleString()} km`],
      ['Orbital period', `${Math.abs(m.period).toFixed(m.period < 10 ? 3 : 2)} days${m.period < 0 ? ' (retrograde)' : ''}`],
      ['Inclination', `${m.inclination.toFixed(2)}°`],
    ]),
  }));
}

export function buildSolarSystem(): SystemModel {
  const nodes: SystemNode[] = [{
    id: 'sun',
    name: SUN.name,
    kind: 'star',
    radiusKm: SUN.radius,
    rotationHours: SUN.rotation,
    tiltDeg: SUN.tilt,
    style: 'sun',
    color: 0xfff2df,
    ephemeris: { kind: 'fixed' },
    au: 0,
    blurb: SUN.blurb,
    facts: facts(SUN.facts),
  }];

  for (const p of PLANETS) {
    nodes.push({
      id: p.id,
      name: p.name,
      kind: 'planet',
      radiusKm: p.radius,
      rotationHours: p.rotation,
      tiltDeg: p.tilt,
      style: p.style,
      color: p.color,
      atmosphere: p.atmosphere,
      atmosphereDensity: p.atmosphereDensity,
      clouds: p.id === 'earth' ? 0.32 : undefined,
      rings: p.rings
        ? { inner: p.rings.inner, outer: p.rings.outer, detail: p.id === 'saturn' ? 1 : 0.22 }
        : undefined,
      spotLongitude: p.id === 'jupiter' ? 2.1 : undefined,
      ephemeris: { kind: 'jpl', body: p },
      au: p.elements.a,
      blurb: p.blurb,
      facts: facts([
        ['Radius', `${p.radius.toLocaleString()} km`],
        ['Mass', `${p.mass} × 10²⁴ kg`],
        ['Distance from Sun', `${p.elements.a.toFixed(3)} au`],
        ['Orbital period', formatPeriod(365.256 * Math.pow(p.elements.a, 1.5))],
        ['Day length', `${Math.abs(p.rotation).toFixed(2)} hours${p.rotation < 0 ? ' (retrograde)' : ''}`],
        ['Axial tilt', `${p.tilt.toFixed(2)}°`],
        ['Mean temperature', `${p.temp} °C`],
        ['Moons', `${p.moonCount}`],
        ...p.facts,
      ]),
    });
    nodes.push(...moonNodes(p.id, p));
  }

  for (const b of SMALL_BODIES) {
    nodes.push({
      id: b.id,
      name: b.name,
      kind: b.kind,
      radiusKm: b.radius,
      rotationHours: b.rotation,
      tiltDeg: 0,
      style: b.style,
      color: b.color,
      ephemeris: { kind: 'epoch', body: b },
      au: b.orbit.a,
      blurb: b.blurb,
      facts: facts([
        ['Radius', `${b.radius.toLocaleString()} km`],
        ['Semi-major axis', `${b.orbit.a.toFixed(3)} au`],
        ['Eccentricity', b.orbit.e.toFixed(4)],
        ['Inclination', `${b.orbit.i.toFixed(2)}°`],
        ['Orbital period', formatPeriod(b.orbit.period)],
        ['Perihelion', `${(b.orbit.a * (1 - b.orbit.e)).toFixed(2)} au`],
        ['Aphelion', `${(b.orbit.a * (1 + b.orbit.e)).toFixed(2)} au`],
        ...b.facts,
      ]),
    });
    nodes.push(...moonNodes(b.id, b));
  }

  return {
    id: 'sol',
    name: 'Solar System',
    starMass: 1,
    luminosity: 1,
    distanceLy: 0,
    nodes,
    extent: Math.max(...nodes.map((n) => n.au)),
    blurb:
      'One G-type star, eight planets, at least five dwarf planets and several ' +
      'hundred known moons, all within a disc of debris left over from a ' +
      'collapsing cloud 4.6 billion years ago.',
  };
}

// ---------------------------------------------------------------- exoplanets

/**
 * Guess a surface archetype from radius, mass and irradiation. The archive
 * gives us no imagery — nobody has any — so this is an illustration of what
 * the measured bulk properties imply, not an observation.
 */
function classifyExoplanet(p: ExoPlanet): { style: SurfaceStyle; color: number; atmosphere?: number; density?: number } {
  const r = p.radius ?? 1;
  const t = p.eqTemp ?? 255;

  if (r > 6) {
    return t > 1000
      ? { style: 'gasGiant', color: 0xb05a3a, atmosphere: 0xff9a5a, density: 0.7 }
      : { style: 'gasGiant', color: 0xc9a578, atmosphere: 0xe0c49a, density: 0.6 };
  }
  if (r > 2.2) return { style: 'iceGiant', color: 0x5f86c4, atmosphere: 0x86b0ff, density: 0.6 };
  if (t > 900) return { style: 'volcanic', color: 0x8c3320, atmosphere: 0xff6a3a, density: 0.35 };
  if (t > 500) return { style: 'rock', color: 0x8a6f5c };
  if (t > 330) return { style: 'desert', color: 0xa8663f, atmosphere: 0xd08a55, density: 0.2 };
  if (t > 200) return { style: 'terrestrial', color: 0x35618f, atmosphere: 0x74b6ff, density: 0.55 };
  return { style: 'ice', color: 0xc6d4dc, atmosphere: 0xa8c8e8, density: 0.15 };
}

/** Mass–radius relation for planets the archive has no measured radius for. */
function estimateRadius(massEarths: number): number {
  return massEarths < 120 ? Math.pow(massEarths, 0.28) : 11 * Math.pow(massEarths / 318, 0.02);
}

function formatPeriod(days: number): string {
  if (days < 1) return `${(days * 24).toFixed(1)} hours`;
  if (days < 700) return `${days.toFixed(days < 10 ? 3 : 1)} days`;
  const years = days / 365.25;
  return years < 1000 ? `${years.toFixed(years < 10 ? 2 : 1)} years` : `${(years / 1000).toFixed(1)}k years`;
}

/** Inner and outer edge of the conservative habitable zone, in au. */
export function habitableZone(luminosity: number): [number, number] {
  return [Math.sqrt(luminosity / 1.1), Math.sqrt(luminosity / 0.53)];
}

export function buildExoSystem(system: ExoSystem): SystemModel {
  const teff = system.teff ?? temperatureFromSpectral(system.spectral) ?? 3500;
  const starRadius = (system.radius ?? 0.3) * 695_700;
  const starMass = system.mass ?? 0.3;
  // Fall back to the Stefan–Boltzmann estimate when the archive has no luminosity.
  const luminosity = system.lum ?? Math.pow((system.radius ?? 0.3), 2) * Math.pow(teff / 5772, 4);

  const nodes: SystemNode[] = [{
    id: 'star',
    name: system.host,
    kind: 'star',
    radiusKm: starRadius,
    rotationHours: 24 * 30,
    tiltDeg: 0,
    style: 'sun',
    color: 0xffffff,
    ephemeris: { kind: 'fixed' },
    au: 0,
    blurb:
      `${system.host} lies ${system.ly.toFixed(2)} light years away and hosts ` +
      `${system.planets.length} known planet${system.planets.length === 1 ? '' : 's'}. ` +
      (teff < 3900
        ? 'As a red dwarf it will keep burning hydrogen for hundreds of billions of years — far longer than the universe has so far existed.'
        : 'Its planets were found by measuring shifts and dips in this star’s light, not by seeing them directly.'),
    facts: facts([
      ['Distance', `${system.ly.toFixed(2)} light years`],
      ['Spectral type', system.spectral || '—'],
      ['Temperature', `${Math.round(teff).toLocaleString()} K`],
      ['Radius', system.radius ? `${system.radius.toFixed(3)} R☉` : '—'],
      ['Mass', system.mass ? `${system.mass.toFixed(3)} M☉` : '—'],
      ['Luminosity', `${luminosity < 0.01 ? luminosity.toExponential(2) : luminosity.toFixed(3)} L☉`],
      ['Apparent magnitude', system.vmag != null ? system.vmag.toFixed(2) : '—'],
      ['Right ascension', `${system.ra.toFixed(4)}°`],
      ['Declination', `${system.dec.toFixed(4)}°`],
    ]),
  }];

  system.planets.forEach((p, index) => {
    const period = p.period ?? 365.25 * Math.sqrt(Math.pow(p.au ?? 1, 3) / starMass);
    const au = p.au ?? Math.cbrt(starMass * Math.pow(period / 365.25, 2));
    const radiusEarths = p.radius ?? (p.mass != null ? estimateRadius(p.mass) : 1);
    const look = classifyExoplanet({ ...p, radius: radiusEarths });
    const [hzInner, hzOuter] = habitableZone(luminosity);
    const inHZ = au >= hzInner && au <= hzOuter;

    nodes.push({
      id: `p${index}`,
      name: p.name,
      kind: 'exoplanet',
      radiusKm: radiusEarths * 6371,
      // Planets this close in are almost certainly tidally locked.
      rotationHours: au < 0.15 ? period * 24 : 24,
      tiltDeg: 0,
      style: look.style,
      color: look.color,
      atmosphere: look.atmosphere,
      atmosphereDensity: look.density,
      ephemeris: {
        kind: 'circularish',
        au, periodDays: period, ecc: p.ecc ?? 0,
        // Spread the orbits slightly; true inclinations are mostly unknown.
        incDeg: ((index * 37) % 11) - 5,
        argPeri: (index * 73) % 360,
        phase: phaseFor(p.name),
      },
      parentId: undefined,
      au,
      blurb: describeExoplanet(p, radiusEarths, au, inHZ, p.radius == null),
      facts: facts([
        ['Semi-major axis', `${au.toFixed(4)} au`],
        ['Orbital period', formatPeriod(period)],
        ['Radius', p.radius != null ? `${p.radius.toFixed(2)} R⊕` : `~${radiusEarths.toFixed(2)} R⊕ (estimated)`],
        ['Mass', p.mass != null ? `${p.mass.toFixed(2)} M⊕` : '—'],
        ['Eccentricity', p.ecc.toFixed(3)],
        ['Equilibrium temp.', p.eqTemp != null ? `${Math.round(p.eqTemp)} K  (${Math.round(p.eqTemp - 273.15)} °C)` : '—'],
        ['Habitable zone', inHZ ? 'Inside' : au < hzInner ? 'Interior to it' : 'Beyond it'],
        ['Discovered', p.year != null ? `${p.year}` : '—'],
      ]),
      estimated: p.radius == null,
    });
  });

  return {
    id: system.host.replace(/\s+/g, '-').toLowerCase(),
    name: system.host,
    starMass,
    luminosity,
    distanceLy: system.ly,
    nodes,
    extent: Math.max(...nodes.map((n) => n.au), 0.05),
    blurb: nodes[0].blurb,
  };
}

function describeExoplanet(
  p: ExoPlanet, radiusEarths: number, au: number, inHZ: boolean, estimated: boolean,
): string {
  const size = radiusEarths < 1.25 ? 'an Earth-sized world'
    : radiusEarths < 2 ? 'a super-Earth'
    : radiusEarths < 4 ? 'a mini-Neptune'
    : radiusEarths < 8 ? 'a Neptune-class planet'
    : 'a gas giant';
  const heat = p.eqTemp == null ? ''
    : p.eqTemp > 1000 ? ' Its dayside is hot enough to vaporise rock.'
    : p.eqTemp > 600 ? ' Any surface there would glow dull red.'
    : p.eqTemp > 373 ? ' Too hot for liquid water at any plausible pressure.'
    : p.eqTemp > 180 ? ' Its equilibrium temperature is in the range where water could be liquid, given the right atmosphere.'
    : ' Far too cold for liquid water without substantial greenhouse warming.';
  const orbit = au < 0.1
    ? ` It circles its star every ${p.period != null ? p.period.toFixed(1) : '?'} days at ${au.toFixed(3)} au — closer than Mercury is to the Sun by a factor of ${(0.387 / au).toFixed(0)}.`
    : ` It orbits at ${au.toFixed(2)} au.`;
  const hz = inHZ ? ' It sits inside the conservative habitable zone.' : '';
  const caveat = estimated
    ? ' Its radius has never been measured — only a minimum mass — so the size shown here is inferred from a mass–radius relation.'
    : '';
  return `${p.name} is ${size}.${orbit}${heat}${hz}${caveat}`;
}

// ---------------------------------------------------------------- positions

const scratch = new Vector3();

/** Position of a node relative to its system's star, in au. */
export function nodePosition(node: SystemNode, jd: number, out = new Vector3()): Vector3 {
  const e = node.ephemeris;
  switch (e.kind) {
    case 'fixed':
      return out.set(0, 0, 0);
    case 'jpl':
      return planetPosition(e.body, jd, out);
    case 'epoch':
      return smallBodyPosition(e.body.orbit, jd, out);
    case 'satellite':
      return moonPosition(e.aKm, e.periodDays, e.ecc, e.incDeg, e.phase, jd, AU_KM, out);
    case 'circularish': {
      const M = 2 * Math.PI * (jd / e.periodDays + e.phase);
      return keplerEllipse(e.au, e.ecc, M, e.incDeg, e.argPeri, out);
    }
  }
}

/** Simple ellipse evaluation for the synthetic exoplanet orbits. */
function keplerEllipse(
  a: number, e: number, M: number, incDeg: number, argPeriDeg: number, out: Vector3,
): Vector3 {
  let E = M;
  for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e);
  const z = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (argPeriDeg * Math.PI) / 180;
  const inc = (incDeg * Math.PI) / 180;
  const xr = x * Math.cos(w) - z * Math.sin(w);
  const zr = x * Math.sin(w) + z * Math.cos(w);
  return out.set(xr, zr * Math.sin(inc), zr * Math.cos(inc));
}

/** Sample a node's orbit into a closed polyline, in au, relative to its parent. */
export function sampleNodeOrbit(node: SystemNode, jd: number, segments = 512): Vector3[] {
  const e = node.ephemeris;
  switch (e.kind) {
    case 'fixed':
      return [];
    case 'jpl':
      return samplePlanetOrbit(e.body, jd, segments);
    case 'epoch':
      return sampleOrbit(e.body.orbit.a, e.body.orbit.e, e.body.orbit.i, e.body.orbit.node, e.body.orbit.argPeri, segments);
    case 'satellite': {
      const pts: Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        pts.push(moonPosition(e.aKm, e.periodDays, e.ecc, e.incDeg, 0, (i / segments) * e.periodDays, AU_KM, new Vector3()));
      }
      return pts;
    }
    case 'circularish': {
      const pts: Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        pts.push(keplerEllipse(e.au, e.ecc, (i / segments) * Math.PI * 2, e.incDeg, e.argPeri, new Vector3()));
      }
      return pts;
    }
  }
}

/** Absolute position of a node, following its parent chain. */
export function absolutePosition(
  node: SystemNode, model: SystemModel, jd: number, out = new Vector3(),
): Vector3 {
  nodePosition(node, jd, out);
  if (node.parentId) {
    const parent = model.nodes.find((n) => n.id === node.parentId);
    if (parent) out.add(absolutePosition(parent, model, jd, scratch.clone()));
  }
  return out;
}
