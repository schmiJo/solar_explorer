/**
 * Builds typed catalog modules from the raw astronomical data in data/raw/.
 *
 *   stars.csv   SIMBAD  — every object with parallax > 122 mas (within ~26.7 ly)
 *   bright.csv  SIMBAD  — every star with V < 6.0, for the naked-eye background sky
 *   exo10.csv   NASA Exoplanet Archive (pscomppars) — planets with sy_dist < 10 pc
 *   hosts.csv   NASA Exoplanet Archive (pscomppars) — their host stars
 *
 * Run with: npm run build:catalog
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (f) => readFileSync(join(root, 'data/raw', f), 'utf8');
const out = (f, s) => writeFileSync(join(root, 'src/data', f), s);

// ---------------------------------------------------------------- csv

function parseCSV(text) {
  const rows = [];
  let field = '', row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const num = (v) => (v === '' || v == null ? null : Number(v));
const round = (v, d) => (v == null ? null : Number(v.toFixed(d)));

// ---------------------------------------------------------------- astrometry

const DEG = Math.PI / 180;

/** ICRS equatorial (deg) -> galactic (l, b) in degrees. */
function toGalactic(ra, dec) {
  const raNGP = 192.85948 * DEG, decNGP = 27.12825 * DEG, lNCP = 122.93192 * DEG;
  const a = ra * DEG, d = dec * DEG;
  const sb = Math.sin(decNGP) * Math.sin(d) + Math.cos(decNGP) * Math.cos(d) * Math.cos(a - raNGP);
  const b = Math.asin(Math.max(-1, Math.min(1, sb)));
  const y = Math.cos(d) * Math.sin(a - raNGP);
  const x = Math.cos(decNGP) * Math.sin(d) - Math.sin(decNGP) * Math.cos(d) * Math.cos(a - raNGP);
  let l = lNCP - Math.atan2(y, x);
  l = ((l % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return [l / DEG, b / DEG];
}

/**
 * Galactic (l, b, distance) -> right-handed cartesian with the galactic plane
 * lying in the scene's XZ plane, so the Milky Way reads as a horizon band.
 */
function galacticCartesian(l, b, dist) {
  const lr = l * DEG, br = b * DEG;
  return [
    dist * Math.cos(br) * Math.cos(lr),
    dist * Math.sin(br),
    -dist * Math.cos(br) * Math.sin(lr),
  ];
}

// ---------------------------------------------------------------- spectra

/** Leading spectral class + numeric subtype, e.g. "M5.5Ve" -> ['M', 5.5]. */
function splitSpectral(sp) {
  const m = /^\s*(?:[dsg]|sd)?([OBAFGKMLTY])\s*(\d+(?:\.\d+)?)?/.exec(sp || '');
  if (!m) return [null, null];
  return [m[1], m[2] == null ? 5 : Number(m[2])];
}

/** Approximate effective temperature from spectral class, for colouring. */
const CLASS_TEMP = { O: [42000, 30000], B: [30000, 10000], A: [10000, 7500], F: [7500, 6000], G: [6000, 5200], K: [5200, 3700], M: [3700, 2400], L: [2400, 1300], T: [1300, 600], Y: [600, 350] };

function tempFromSpectral(sp) {
  const [cls, sub] = splitSpectral(sp);
  if (!cls) return null;
  const [hot, cool] = CLASS_TEMP[cls];
  return Math.round(hot + (cool - hot) * Math.min(sub, 9.9) / 10);
}

// ---------------------------------------------------------------- names

/** SIMBAD pads catalogue numbers with spaces: "HD  95735" -> "HD 95735". */
const tidy = (id) => id.replace(/\s+/g, ' ').replace(/^NAME /, '').trim();

// ---------------------------------------------------------------- nearby stars

const NON_STELLAR = new Set(['Pl', 'Pl?', 'err']);

let near = parseCSV(raw('stars.csv'))
  .filter((r) => !NON_STELLAR.has(r.otype_txt) && num(r.plx_value) > 0)
  .map((r) => {
    const ra = num(r.ra), dec = num(r.dec);
    const parsecs = 1000 / num(r.plx_value);
    const [l, b] = toGalactic(ra, dec);
    return {
      name: tidy(r.main_id),
      ra, dec,
      ly: parsecs * 3.26156378,
      pos: galacticCartesian(l, b, parsecs * 3.26156378),
      spectral: (r.sp_type || '').trim(),
      vmag: num(r.flux),
      otype: r.otype_txt,
      pm: [num(r.pmra), num(r.pmdec)],
      rv: num(r.rvz_radvel),
    };
  });

// Composite entries ("* alf Cen", sp_type "G2V+K1V") duplicate components that
// are also catalogued individually. Drop the composite only when its members
// are actually present nearby.
near = near.filter((s) => {
  if (!s.spectral.includes('+')) return true;
  return !near.some((o) => o !== s && !o.spectral.includes('+') &&
    Math.hypot(o.pos[0] - s.pos[0], o.pos[1] - s.pos[1], o.pos[2] - s.pos[2]) < 0.05);
});

near.sort((a, b) => a.ly - b.ly);

// ---------------------------------------------------------------- exoplanets

const hostRows = parseCSV(raw('hosts.csv'));
const hosts = new Map();
for (const r of hostRows) {
  // The archive can carry several parameter sets per host; keep the fullest.
  const score = ['st_teff', 'st_rad', 'st_mass', 'st_lum'].filter((k) => r[k] !== '').length;
  const prev = hosts.get(r.hostname);
  if (!prev || score > prev._score) hosts.set(r.hostname, { ...r, _score: score });
}

const planetsByHost = new Map();
for (const p of parseCSV(raw('exo10.csv'))) {
  if (!planetsByHost.has(p.hostname)) planetsByHost.set(p.hostname, []);
  planetsByHost.get(p.hostname).push({
    name: p.pl_name,
    period: num(p.pl_orbper),
    au: num(p.pl_orbsmax),
    radius: num(p.pl_rade),          // Earth radii
    mass: num(p.pl_bmasse),          // Earth masses
    ecc: num(p.pl_orbeccen) ?? 0,
    eqTemp: num(p.pl_eqt),           // Kelvin
    year: num(p.disc_year),
  });
}

const systems = [...hosts.values()]
  .map((h) => {
    const ra = num(h.ra), dec = num(h.dec);
    const ly = num(h.sy_dist) * 3.26156378;
    const [l, b] = toGalactic(ra, dec);
    const planets = (planetsByHost.get(h.hostname) || [])
      .filter((p) => p.au != null || p.period != null)
      .sort((a, b2) => (a.au ?? 0) - (b2.au ?? 0));
    return {
      host: h.hostname,
      ra, dec, ly,
      pos: galacticCartesian(l, b, ly),
      teff: num(h.st_teff) ?? tempFromSpectral(h.st_spectype),
      radius: num(h.st_rad),                                   // solar radii
      mass: num(h.st_mass),                                    // solar masses
      lum: h.st_lum === '' ? null : Math.pow(10, num(h.st_lum)), // L/Lsun
      spectral: (h.st_spectype || '').trim(),
      vmag: num(h.sy_vmag),
      planets,
    };
  })
  .filter((s) => s.planets.length)
  .sort((a, b) => a.ly - b.ly);

// ---------------------------------------------------------------- background sky

// Flat arrays keep 5k stars cheap to ship and to upload straight into buffers.
const brightRows = parseCSV(raw('bright.csv')).filter((r) => r.ra !== '' && r.flux !== '');
const dir = [], mag = [], temp = [];
for (const r of brightRows) {
  const [l, b] = toGalactic(num(r.ra), num(r.dec));
  const [x, y, z] = galacticCartesian(l, b, 1);
  dir.push(round(x, 5), round(y, 5), round(z, 5));
  mag.push(round(num(r.flux), 2));
  temp.push(tempFromSpectral(r.sp_type) ?? 5500);
}

// ---------------------------------------------------------------- emit

const banner = (src) => `// GENERATED FILE — do not edit by hand.
// Source: ${src}
// Regenerate with: npm run build:catalog
`;

const compact = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Number(x.toFixed(6)) : x));

out('nearbyStars.gen.ts', banner('SIMBAD (CDS) — objects with parallax > 122 mas') +
`import type { NearbyStar } from './types';

/** Every cataloged object within ~26.7 light years, nearest first. */
export const NEARBY_STARS: NearbyStar[] = ${compact(near.map(({ otype, ...s }) => ({ ...s, kind: otype })))};
`);

out('exoSystems.gen.ts', banner('NASA Exoplanet Archive (pscomppars) — systems within 10 parsecs') +
`import type { ExoSystem } from './types';

/** Confirmed planetary systems within 10 pc (~32.6 ly), nearest first. */
export const EXO_SYSTEMS: ExoSystem[] = ${compact(systems)};
`);

out('backgroundSky.gen.ts', banner('SIMBAD (CDS) — stars brighter than V = 6.0') +
`/** Naked-eye sky: unit direction vectors in galactic cartesian, V magnitudes, and
 *  spectral-class temperatures in kelvin. Parallel arrays, one star per index. */
export const SKY_DIRECTIONS = new Float32Array(${compact(dir)});
export const SKY_MAGNITUDES = new Float32Array(${compact(mag)});
export const SKY_TEMPERATURES = new Float32Array(${compact(temp)});
export const SKY_COUNT = ${mag.length};
`);

console.log(`nearby stars      ${near.length}  (nearest: ${near[0].name} @ ${near[0].ly.toFixed(2)} ly)`);
console.log(`exoplanet systems ${systems.length}  (${systems.reduce((n, s) => n + s.planets.length, 0)} planets)`);
console.log(`background sky    ${mag.length} stars`);
