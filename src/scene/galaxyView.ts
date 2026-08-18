/**
 * The solar neighbourhood.
 *
 * Every star within about 27 light years from SIMBAD, plus the 61 catalogued
 * planetary systems within 10 parsecs, placed at their real three-dimensional
 * positions. Coordinates are galactic cartesian in light years, so the plane of
 * the Milky Way is the scene's XZ plane and the galactic centre lies toward +X.
 *
 * Depth in a star map is hard to read from parallax alone, so each star is
 * dropped to the galactic plane with a faint line, and range rings are marked
 * every five light years.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, LineBasicMaterial,
  LineSegments, PerspectiveCamera, Points, Scene, ShaderMaterial, SphereGeometry, Mesh, Vector3,
} from 'three';
import { NEARBY_STARS } from '../data/nearbyStars.gen';
import { EXO_SYSTEMS } from '../data/exoSystems.gen';
import type { ExoSystem, NearbyStar } from '../data/types';
import { blackbodyRGB, spectralClass, temperatureFromSpectral } from '../astro/color';
import { createMilkyWayMaterial } from '../shaders/sky';
import { BLACKBODY_GLSL } from '../astro/color';
import type { CameraRig } from '../core/cameraRig';

export interface StarEntry {
  id: string;
  name: string;
  /** Galactic cartesian position, light years. */
  position: Vector3;
  distanceLy: number;
  spectral: string;
  /** Effective temperature, K. */
  temp: number;
  /** SIMBAD object type, or 'Exo' for archive-only entries. */
  kind: string;
  vmag: number | null;
  /** Set when this star has catalogued planets. */
  system?: ExoSystem;
  /** Relative visual weight, driving how large it is drawn. */
  weight: number;
  screen: { x: number; y: number; visible: boolean; distance: number };
}

/** The Sun sits at the origin of this frame by construction. */
const SUN_ENTRY: Omit<StarEntry, 'screen'> = {
  id: 'sol',
  name: 'Sun',
  position: new Vector3(0, 0, 0),
  distanceLy: 0,
  spectral: 'G2V',
  temp: 5772,
  kind: 'Sun',
  vmag: -26.74,
  weight: 1,
};

const STAR_VERTEX = /* glsl */ `
attribute float aTemp;
attribute float aWeight;
attribute float aHasPlanets;
uniform float uPixelRatio;
uniform float uHeight;
uniform float uSelected;      // index of the highlighted star, or -1
uniform float uTime;
varying vec3 vColor;
varying float vHalo;
varying float vRing;

${BLACKBODY_GLSL}

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = max(-mv.z, 1e-4);
  // Mostly constant on screen, with a boost as you close on a star, which is
  // what makes flying through the neighbourhood feel like moving.
  float size = (3.4 + aWeight * 7.0) * (1.0 + 26.0 / (dist + 2.0));
  gl_PointSize = clamp(size * uHeight / 900.0, 2.0, 110.0) * uPixelRatio;

  vColor = blackbody(aTemp);
  vHalo = 0.35 + aWeight * 0.65;
  // Stars with known planets get a slowly pulsing ring.
  vRing = aHasPlanets * (0.55 + 0.45 * sin(uTime * 1.6 + float(gl_VertexID)));
  if (abs(float(gl_VertexID) - uSelected) < 0.5) vRing = 2.0;
}
`;

const STAR_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vHalo;
varying float vRing;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float core = exp(-r * r * 22.0);
  float halo = exp(-r * 3.4) * 0.28 * vHalo;
  float spikes = 0.16 * (exp(-abs(p.x) * 30.0) + exp(-abs(p.y) * 30.0)) * exp(-r * 3.2);

  float alpha = core + halo + spikes;
  vec3 color = mix(vColor, vec3(1.0), core * 0.85);

  // The planet-host marker: a thin annulus around the star.
  if (vRing > 0.0) {
    float ring = smoothstep(0.60, 0.66, r) * (1.0 - smoothstep(0.72, 0.80, r));
    vec3 ringColor = vRing > 1.5 ? vec3(1.0, 0.85, 0.45) : vec3(0.45, 0.85, 1.0);
    color += ringColor * ring * min(vRing, 1.0) * 1.4;
    alpha += ring * min(vRing, 1.0) * 0.75;
  }

  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export class GalaxyView {
  readonly scene = new Scene();
  readonly entries: StarEntry[] = [];
  private readonly points: Points;
  private readonly material: ShaderMaterial;
  private readonly dropLines: LineSegments;
  private readonly grid: LineSegments;
  private readonly connection: LineSegments;
  private readonly sky: Group;
  private selectedIndex = -1;

  showGrid = true;
  showDropLines = true;
  /** Only draw stars with catalogued planets. */
  planetHostsOnly = false;

  constructor() {
    this.entries = buildEntries();

    // ---- stars
    const n = this.entries.length;
    const positions = new Float32Array(n * 3);
    const temps = new Float32Array(n);
    const weights = new Float32Array(n);
    const hasPlanets = new Float32Array(n);
    this.entries.forEach((e, i) => {
      positions[i * 3] = e.position.x;
      positions[i * 3 + 1] = e.position.y;
      positions[i * 3 + 2] = e.position.z;
      temps[i] = e.temp;
      weights[i] = e.weight;
      hasPlanets[i] = e.system ? 1 : 0;
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aTemp', new BufferAttribute(temps, 1));
    geometry.setAttribute('aWeight', new BufferAttribute(weights, 1));
    geometry.setAttribute('aHasPlanets', new BufferAttribute(hasPlanets, 1));

    this.material = new ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uHeight: { value: window.innerHeight },
        uSelected: { value: -1 },
        uTime: { value: 0 },
      },
    });
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.scene.add(this.points);

    // ---- vertical drop lines to the galactic plane
    const dropVerts = new Float32Array(n * 6);
    this.entries.forEach((e, i) => {
      dropVerts.set([e.position.x, e.position.y, e.position.z, e.position.x, 0, e.position.z], i * 6);
    });
    const dropGeometry = new BufferGeometry();
    dropGeometry.setAttribute('position', new BufferAttribute(dropVerts, 3));
    this.dropLines = new LineSegments(dropGeometry, new LineBasicMaterial({
      color: 0x3d5a80, transparent: true, opacity: 0.28, depthWrite: false, blending: AdditiveBlending,
    }));
    this.dropLines.frustumCulled = false;
    this.scene.add(this.dropLines);

    // ---- range rings and radial spokes on the galactic plane
    this.grid = createGrid();
    this.scene.add(this.grid);

    // ---- a line from the Sun to whichever star is selected
    const connectionGeometry = new BufferGeometry();
    connectionGeometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
    this.connection = new LineSegments(connectionGeometry, new LineBasicMaterial({
      color: 0xffd27f, transparent: true, opacity: 0.75, depthWrite: false, blending: AdditiveBlending,
    }));
    this.connection.frustumCulled = false;
    this.connection.visible = false;
    this.scene.add(this.connection);

    // ---- the Milky Way, far enough out to read as a backdrop
    this.sky = new Group();
    const backdrop = new Mesh(new SphereGeometry(4000, 48, 32), createMilkyWayMaterial(0.55));
    backdrop.renderOrder = -200;
    backdrop.frustumCulled = false;
    this.sky.add(backdrop);
    this.scene.add(this.sky);
  }

  entry(id: string): StarEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  select(id: string | null): void {
    this.selectedIndex = id == null ? -1 : this.entries.findIndex((e) => e.id === id);
    this.material.uniforms.uSelected.value = this.selectedIndex;

    const visible = this.selectedIndex >= 0 && this.entries[this.selectedIndex].distanceLy > 0.01;
    this.connection.visible = visible;
    if (visible) {
      const target = this.entries[this.selectedIndex].position;
      const attr = this.connection.geometry.getAttribute('position') as BufferAttribute;
      (attr.array as Float32Array).set([0, 0, 0, target.x, target.y, target.z]);
      attr.needsUpdate = true;
    }
  }

  update(rig: CameraRig, camera: PerspectiveCamera, time: number): void {
    const origin = rig.origin;
    this.points.position.copy(ORIGIN).sub(origin);
    this.dropLines.position.copy(this.points.position);
    this.grid.position.copy(this.points.position);
    this.connection.position.copy(this.points.position);

    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uHeight.value = window.innerHeight;

    this.dropLines.visible = this.showDropLines;
    this.grid.visible = this.showGrid;

    // Screen placement for labels and picking.
    for (const entry of this.entries) {
      tmp.copy(entry.position).sub(origin).project(camera);
      entry.screen.x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
      entry.screen.y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
      entry.screen.visible = tmp.z > -1 && tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2
        && (!this.planetHostsOnly || entry.system != null);
      entry.screen.distance = entry.position.distanceTo(rig.absolutePosition(tmp2));
    }

    this.sky.position.copy(rig.absolutePosition(tmp2)).sub(origin);
  }

  pick(x: number, y: number, tolerance = 22): StarEntry | null {
    let best: StarEntry | null = null;
    let bestDistance = Infinity;
    for (const entry of this.entries) {
      if (!entry.screen.visible) continue;
      const d = Math.hypot(entry.screen.x - x, entry.screen.y - y);
      if (d < tolerance && d < bestDistance) { bestDistance = d; best = entry; }
    }
    return best;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
    this.dropLines.geometry.dispose();
    this.grid.geometry.dispose();
    this.connection.geometry.dispose();
  }
}

// ---------------------------------------------------------------- data

const ORIGIN = new Vector3();
const tmp = new Vector3();
const tmp2 = new Vector3();

/** How prominently to draw a star, from its spectral class. */
function visualWeight(spectral: string, kind: string): number {
  if (kind === 'WD*') return 0.15;
  if (kind === 'BD*') return 0.06;
  switch (spectralClass(spectral)) {
    case 'O': case 'B': return 1.0;
    case 'A': return 0.85;
    case 'F': return 0.62;
    case 'G': return 0.5;
    case 'K': return 0.34;
    case 'M': return 0.16;
    default: return 0.1;
  }
}

/**
 * Merge the SIMBAD catalog with the exoplanet archive. The two disagree on
 * naming — SIMBAD's "HD 95735" is the archive's "GJ 411" — so hosts are matched
 * by position, which is unambiguous at these separations.
 */
function buildEntries(): StarEntry[] {
  const entries: StarEntry[] = [{ ...SUN_ENTRY, screen: { x: 0, y: 0, visible: false, distance: 0 } }];
  const matched = new Set<string>();

  const findSystem = (position: Vector3): ExoSystem | undefined =>
    EXO_SYSTEMS.find((s) => position.distanceTo(new Vector3(...s.pos)) < 0.06);

  for (const star of NEARBY_STARS as NearbyStar[]) {
    const position = new Vector3(...star.pos);
    const system = findSystem(position);
    if (system) matched.add(system.host);
    entries.push({
      id: star.name,
      name: star.name,
      position,
      distanceLy: star.ly,
      spectral: star.spectral,
      temp: temperatureFromSpectral(star.spectral) ?? (system?.teff ?? 3200),
      kind: star.kind,
      vmag: star.vmag,
      system,
      weight: visualWeight(star.spectral, star.kind),
      screen: { x: 0, y: 0, visible: false, distance: 0 },
    });
  }

  // Planet hosts beyond SIMBAD's parallax cut, out to 10 parsecs.
  for (const system of EXO_SYSTEMS) {
    if (matched.has(system.host)) continue;
    const position = new Vector3(...system.pos);
    if (entries.some((e) => e.position.distanceTo(position) < 0.06)) continue;
    entries.push({
      id: system.host,
      name: system.host,
      position,
      distanceLy: system.ly,
      spectral: system.spectral,
      temp: system.teff ?? temperatureFromSpectral(system.spectral) ?? 3500,
      kind: 'Exo',
      vmag: system.vmag,
      system,
      weight: visualWeight(system.spectral, 'Exo'),
      screen: { x: 0, y: 0, visible: false, distance: 0 },
    });
  }

  entries.sort((a, b) => a.distanceLy - b.distanceLy);
  return entries;
}

/** Range rings every 5 ly, plus spokes toward the galactic centre and rotation. */
function createGrid(): LineSegments {
  const vertices: number[] = [];
  const segments = 160;

  for (let radius = 5; radius <= 30; radius += 5) {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      vertices.push(Math.cos(a0) * radius, 0, Math.sin(a0) * radius);
      vertices.push(Math.cos(a1) * radius, 0, Math.sin(a1) * radius);
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    vertices.push(0, 0, 0, Math.cos(a) * 30, 0, Math.sin(a) * 30);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  const lines = new LineSegments(geometry, new LineBasicMaterial({
    color: 0x2a4a6d, transparent: true, opacity: 0.34, depthWrite: false, blending: AdditiveBlending,
  }));
  lines.frustumCulled = false;
  lines.renderOrder = -20;
  return lines;
}

/** Colour of a star for use in the DOM, matching what the shader draws. */
export function entryColor(entry: StarEntry): string {
  const [r, g, b] = blackbodyRGB(entry.temp);
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/** Colour helper kept next to the view that defines the palette. */
export const SELECTION_COLOR = new Color(0xffd27f);
