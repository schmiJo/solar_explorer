/**
 * Renders one star system.
 *
 * Everything is positioned relative to the camera rig's floating origin, so the
 * absolute coordinates below (in au) never reach a float32 buffer. Bodies are
 * drawn as real geometry when they are large enough on screen and as a glow
 * billboard when they are not, which is what keeps a 6,371 km planet findable
 * from 30 au away.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh,
  PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import type { SystemModel, SystemNode } from './systemModel';
import { absolutePosition, habitableZone, nodePosition, sampleNodeOrbit } from './systemModel';
import { ScaleModel } from './scale';
import { OrbitPath } from './orbitLine';
import { Belt } from './belts';
import {
  createAtmosphereMaterial, createCloudMaterial, createRingMaterial, createSurfaceMaterial,
} from '../shaders/surface';
import { createCoronaMaterial, createPointGlowMaterial } from '../shaders/star';
import { createBackgroundStars, createMilkyWayMaterial } from '../shaders/sky';
import { blackbodyColor } from '../astro/color';
import type { CameraRig } from '../core/cameraRig';

/** Angular size, in pixels, below which a body is drawn as a glow instead. */
const MARKER_THRESHOLD = 5;

export interface ScreenPlacement {
  node: SystemNode;
  x: number;
  y: number;
  /** Apparent radius in pixels. */
  radius: number;
  /** Distance from the camera in scene units. */
  distance: number;
  visible: boolean;
}

interface NodeView {
  node: SystemNode;
  /** Positioned each frame; holds everything that belongs to this body. */
  group: Group;
  /** Tilted and spun; the surface, clouds and rings ride on it. */
  spin: Group;
  surface: Mesh;
  clouds?: Mesh;
  atmosphere?: Mesh;
  rings?: Mesh;
  marker: Mesh;
  orbit?: OrbitPath;
  /** Absolute position in au, relative to the star. */
  absolute: Vector3;
  /** Position after the scale model, still relative to the star. */
  display: Vector3;
  displayRadius: number;
  screen: ScreenPlacement;
}

const SPHERE_SEGMENTS = { star: 96, large: 72, small: 40 };

export class SystemView {
  readonly scene = new Scene();
  readonly views: NodeView[] = [];
  private readonly byId = new Map<string, NodeView>();
  private readonly starColor: Color;
  private readonly corona: Mesh;
  private readonly belts: Belt[] = [];
  private readonly habitableRing?: Mesh;
  private readonly sky: Group;
  private orbitRevision = -1;
  private lastOrbitJD = Number.NaN;

  /** Toggled from the UI. */
  showOrbits = true;
  showLabels = true;
  showHabitableZone = false;
  showBelts = true;

  constructor(readonly model: SystemModel, private readonly scale: ScaleModel) {
    const star = model.nodes[0];
    const teff = extractTemperature(star) ?? 5772;
    this.starColor = blackbodyColor(teff);

    // ---- background sky, shared by every system
    this.sky = new Group();
    const skyRadius = 1e7;
    this.sky.add(createBackgroundStars(skyRadius));
    const milkyWay = new Mesh(new SphereGeometry(skyRadius * 1.4, 48, 32), createMilkyWayMaterial(0.42));
    milkyWay.renderOrder = -200;
    milkyWay.frustumCulled = false;
    this.sky.add(milkyWay);
    this.scene.add(this.sky);

    // ---- the star's corona, drawn behind everything else in the system
    this.corona = new Mesh(new PlaneGeometry(2, 2), createCoronaMaterial(this.starColor, 1.15));
    this.corona.renderOrder = -50;
    this.corona.frustumCulled = false;
    this.scene.add(this.corona);

    for (const node of model.nodes) this.addNode(node);

    if (model.id === 'sol') {
      this.belts.push(new Belt({
        count: 26_000, inner: 2.06, outer: 3.28, maxEcc: 0.22, maxInc: 18,
        color: 0x9c8f7a, gaps: true, size: 0.85,
      }));
      this.belts.push(new Belt({
        count: 16_000, inner: 30, outer: 50, maxEcc: 0.18, maxInc: 22,
        color: 0x7fa8c4, size: 1.5,
      }));
      for (const belt of this.belts) this.scene.add(belt.object);
    }

    this.habitableRing = createHabitableZoneRing();
    this.habitableRing.visible = false;
    this.scene.add(this.habitableRing);
  }

  private addNode(node: SystemNode): void {
    const group = new Group();
    const spin = new Group();
    // Obliquity is measured from the orbital plane, about the x-axis here.
    spin.rotation.z = (node.tiltDeg * Math.PI) / 180;
    group.add(spin);

    const segments = node.kind === 'star' ? SPHERE_SEGMENTS.star
      : node.radiusKm > 20_000 ? SPHERE_SEGMENTS.large : SPHERE_SEGMENTS.small;

    const surface = new Mesh(
      new SphereGeometry(1, segments, segments / 2),
      createSurfaceMaterial({
        style: node.style,
        color: node.color,
        seed: hashSeed(node.id),
        atmosphere: node.atmosphere,
        atmosphereDensity: node.atmosphereDensity,
        spotLongitude: node.spotLongitude,
      }),
    );
    spin.add(surface);

    const view: NodeView = {
      node, group, spin, surface,
      marker: this.createMarker(node),
      absolute: new Vector3(),
      display: new Vector3(),
      displayRadius: 0,
      screen: { node, x: 0, y: 0, radius: 0, distance: 0, visible: false },
    };

    if (node.clouds != null) {
      view.clouds = new Mesh(
        new SphereGeometry(1.012, segments, segments / 2),
        createCloudMaterial(1 - node.clouds, hashSeed(node.id) + 3),
      );
      spin.add(view.clouds);
    }

    if (node.atmosphere != null && node.atmosphereDensity) {
      view.atmosphere = new Mesh(
        new SphereGeometry(1.055, 48, 24),
        createAtmosphereMaterial(node.atmosphere, node.atmosphereDensity * 1.5),
      );
      view.atmosphere.renderOrder = 5;
      // The shell must not inherit the spin, or the rim would rotate with it.
      group.add(view.atmosphere);
    }

    if (node.rings) {
      const ringColor = node.style === 'gasGiant' ? 0xd8c8a8 : 0x9aa8b4;
      view.rings = new Mesh(
        createRingGeometry(node.rings.inner, node.rings.outer, 256),
        createRingMaterial(ringColor, node.rings.inner, node.rings.outer, node.rings.detail, hashSeed(node.id)),
      );
      view.rings.renderOrder = 6;
      spin.add(view.rings);
    }

    if (node.ephemeris.kind !== 'fixed') {
      view.orbit = new OrbitPath(orbitColor(node), 512, node.kind === 'moon' ? 0.1 : 0.17);
      this.scene.add(view.orbit.object);
    }

    this.scene.add(group);
    this.scene.add(view.marker);
    this.views.push(view);
    this.byId.set(node.id, view);
  }

  private createMarker(node: SystemNode): Mesh {
    const color = node.kind === 'star' ? this.starColor.clone() : new Color(node.color);
    const marker = new Mesh(
      new PlaneGeometry(2, 2),
      createPointGlowMaterial(color, 1, node.kind === 'star' ? 1 : 0.35),
    );
    marker.renderOrder = 20;
    marker.frustumCulled = false;
    return marker;
  }

  view(id: string): NodeView | undefined { return this.byId.get(id); }

  /** Absolute position of a node in display units, relative to the star. */
  displayPosition(id: string): Vector3 | undefined { return this.byId.get(id)?.display; }

  /** A sensible viewing distance for a node, in display units. */
  framingDistance(id: string): number {
    const view = this.byId.get(id);
    if (!view) return 3;
    if (view.node.kind === 'star') return Math.max(view.displayRadius * 8, 0.6);
    return Math.max(view.displayRadius * 6.5, 1e-6);
  }

  /**
   * Work out where everything is, without touching the scene graph. Run before
   * the camera rig updates, so the rig can follow a body it has not yet drawn.
   */
  computePositions(jd: number): void {
    for (const view of this.views) {
      absolutePosition(view.node, this.model, jd, view.absolute);
      if (view.node.parentId) {
        const parent = this.byId.get(view.node.parentId);
        const local = nodePosition(view.node, jd, tmpA);
        const scaled = scaleSatellite(local, view.node, parent?.node, this.scale, tmpB);
        view.display.copy(parent ? parent.display : ORIGIN).add(scaled);
      } else {
        this.scale.mapPosition(view.absolute, view.display);
      }
      view.displayRadius = this.scale.bodyRadius(view.node.radiusKm);
    }
  }

  update(jd: number, rig: CameraRig, camera: PerspectiveCamera, time: number): void {
    const origin = rig.origin;
    const cameraAbsolute = rig.absolutePosition();

    // Rebuild the orbit paths when the scale blend moves, or once a decade of
    // simulated time has passed and the elements have drifted.
    const orbitsStale = this.orbitRevision !== this.scale.revision
      || !Number.isFinite(this.lastOrbitJD) || Math.abs(jd - this.lastOrbitJD) > 3652;

    for (const view of this.views) {
      view.group.position.copy(view.display).sub(origin);
      view.spin.scale.setScalar(view.displayRadius);
      if (view.atmosphere) view.atmosphere.scale.setScalar(view.displayRadius);
    }

    // ---- orientation, lighting and level of detail
    const starView = this.views[0];
    const halfHeight = Math.tan((camera.fov * Math.PI) / 360);
    const pixelsPerRadian = window.innerHeight / (2 * halfHeight);

    for (const view of this.views) {
      const { node } = view;

      // Spin about the body's own axis. Retrograde rotations run backwards.
      const turns = node.rotationHours === 0 ? 0 : (jd * 24) / node.rotationHours;
      view.spin.rotation.y = turns * Math.PI * 2;

      // Direction to the star, which is the light source for every surface.
      tmpA.copy(starView.display).sub(view.display);
      const starDistance = Math.max(tmpA.length(), 1e-9);
      tmpA.divideScalar(starDistance);
      if (node.kind === 'star') tmpA.set(0, 0, 1);

      const distanceAu = view.absolute.length();
      const illumination = node.kind === 'star' ? 1
        : Math.min(2.4, Math.max(0.22, Math.pow(this.model.luminosity / Math.max(distanceAu * distanceAu, 1e-6), 0.32)));

      applyLighting(view, tmpA, this.starColor, illumination, time);

      // Screen placement drives both the labels and the marker crossfade.
      const distance = view.group.position.distanceTo(camera.position);
      const screenRadius = (view.displayRadius / Math.max(distance, 1e-9)) * pixelsPerRadian;
      tmpB.copy(view.group.position).project(camera);
      const onScreen = tmpB.z > -1 && tmpB.z < 1 && Math.abs(tmpB.x) < 1.35 && Math.abs(tmpB.y) < 1.35;

      view.screen.x = (tmpB.x * 0.5 + 0.5) * window.innerWidth;
      view.screen.y = (-tmpB.y * 0.5 + 0.5) * window.innerHeight;
      view.screen.radius = screenRadius;
      view.screen.distance = distance;
      view.screen.visible = onScreen && distance > 0;

      // Fade the glow in as the disc shrinks past a few pixels.
      const markerStrength = 1 - smoothstep(MARKER_THRESHOLD * 0.6, MARKER_THRESHOLD * 2.4, screenRadius);
      uniformsOf(view.marker).uIntensity.value =
        markerStrength * (node.kind === 'star' ? 2.2 : 1.35) * (node.kind === 'moon' ? 0.5 : 1);
      view.marker.visible = markerStrength > 0.01 && onScreen;
      if (view.marker.visible) {
        view.marker.position.copy(view.group.position);
        view.marker.quaternion.copy(camera.quaternion);
        // Constant angular size, so a distant world stays a legible point.
        const angular = (node.kind === 'star' ? 34 : 12) / pixelsPerRadian;
        view.marker.scale.setScalar(angular * Math.max(distance, 1e-9));
      }

      // Skip the expensive surface entirely once it is smaller than the glow.
      view.group.visible = screenRadius > MARKER_THRESHOLD * 0.35;
      if (view.clouds) view.clouds.visible = screenRadius > 12;
    }

    // ---- the star's corona
    this.corona.position.copy(starView.group.position);
    this.corona.quaternion.copy(camera.quaternion);
    const coronaDistance = Math.max(this.corona.position.distanceTo(camera.position), 1e-9);
    // Never let the corona shrink below a visible glow, nor swamp the screen.
    const coronaSize = Math.max(starView.displayRadius * 3.4, coronaDistance * 0.012);
    this.corona.scale.setScalar(Math.min(coronaSize, coronaDistance * 0.55));
    const coronaUniforms = uniformsOf(this.corona);
    coronaUniforms.uTime.value = time;
    coronaUniforms.uIntensity.value = 1.15 * smoothstep(0.4, 3, starView.screen.radius);

    // ---- orbits
    for (const view of this.views) {
      if (!view.orbit) continue;
      if (orbitsStale) {
        const points = sampleNodeOrbit(view.node, jd, 512);
        const parent = view.node.parentId ? this.byId.get(view.node.parentId) : undefined;
        for (const p of points) {
          if (parent) scaleSatellite(p, view.node, parent.node, this.scale, p);
          else this.scale.mapPosition(p, p);
        }
        view.orbit.setPoints(points);
      }
      const parent = view.node.parentId ? this.byId.get(view.node.parentId) : undefined;
      view.orbit.object.position.copy(parent ? parent.display : ORIGIN).sub(origin);
      view.orbit.phase = orbitPhase(view, parent);

      // Fade an orbit out once you are close enough to its body that the
      // float32 path would visibly wander against the geometry.
      const nearness = view.screen.radius / window.innerHeight;
      view.orbit.opacity = this.showOrbits ? 1 - smoothstep(0.25, 0.9, nearness) : 0;
      view.orbit.object.visible = view.orbit.opacity > 0.004;
    }
    if (orbitsStale) {
      this.orbitRevision = this.scale.revision;
      this.lastOrbitJD = jd;
    }

    // ---- belts
    for (const belt of this.belts) {
      belt.object.position.copy(ORIGIN).sub(origin);
      belt.update(jd, this.scale.t, pixelsPerRadian * 0.0016, this.showBelts ? 1 : 0);
      belt.object.visible = this.showBelts;
    }

    // ---- habitable zone
    if (this.habitableRing) {
      this.habitableRing.visible = this.showHabitableZone;
      if (this.showHabitableZone) {
        const [inner, outer] = habitableZone(this.model.luminosity);
        this.habitableRing.position.copy(ORIGIN).sub(origin);
        const u = uniformsOf(this.habitableRing);
        u.uInner.value = this.scale.orbitRadius(inner);
        u.uOuter.value = this.scale.orbitRadius(outer);
      }
    }

    // ---- keep the sky centred on the camera so it stays at infinity
    this.sky.position.copy(cameraAbsolute).sub(origin);
  }

  /** Screen placements for the label layer, nearest first. */
  placements(): ScreenPlacement[] {
    return this.views.map((v) => v.screen);
  }

  /**
   * Pick a body from a screen position. Works in screen space rather than by
   * raycasting so that a planet rendered one pixel wide is still clickable.
   */
  pick(x: number, y: number, tolerance = 26): SystemNode | null {
    let best: SystemNode | null = null;
    let bestScore = Infinity;
    for (const view of this.views) {
      const s = view.screen;
      if (!s.visible) continue;
      const reach = Math.max(s.radius, 6) + tolerance;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d > reach) continue;
      // Prefer whatever is closest to the cursor, then whatever is nearer.
      const score = d - Math.min(s.radius, 40);
      if (score < bestScore) { bestScore = score; best = view.node; }
    }
    return best;
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as { dispose?: () => void } | undefined;
      material?.dispose?.();
    });
    for (const view of this.views) view.orbit?.dispose();
    for (const belt of this.belts) belt.dispose();
  }
}

// ---------------------------------------------------------------- helpers

const ORIGIN = new Vector3();

/**
 * Every material in this view is a ShaderMaterial we built ourselves, so
 * reaching for its uniforms is safe — this just keeps the cast in one place.
 */
const uniformsOf = (mesh: Mesh): ShaderMaterial['uniforms'] =>
  (mesh.material as ShaderMaterial).uniforms;
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10_000) / 100;
}

function extractTemperature(star: SystemNode): number | null {
  const fact = star.facts.find((f) => f.label === 'Temperature' || f.label === 'Surface temperature');
  if (!fact) return null;
  const n = Number(fact.value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function orbitColor(node: SystemNode): number {
  switch (node.kind) {
    case 'moon': return 0x7fa6c9;
    case 'comet': return 0x6fd9c0;
    case 'asteroid': return 0x9c8f7a;
    case 'dwarf': return 0xb08fd0;
    case 'exoplanet': return 0x7fc4ff;
    default: return 0x6f9fd8;
  }
}

/** Where the body currently sits along its own sampled orbit, as a fraction. */
function orbitPhase(view: NodeView, parent: NodeView | undefined): number {
  tmpC.copy(view.display).sub(parent ? parent.display : ORIGIN);
  // The sampled path starts at perihelion and runs prograde, so the angle in
  // the orbital plane is a good enough proxy for the parameter along it.
  const angle = Math.atan2(tmpC.z, tmpC.x);
  return (angle / (Math.PI * 2) + 1) % 1;
}

/** Apply the scale model to a satellite's offset from its parent. */
function scaleSatellite(
  local: Vector3, node: SystemNode, parent: SystemNode | undefined, scale: ScaleModel, out: Vector3,
): Vector3 {
  const e = node.ephemeris;
  if (e.kind !== 'satellite' || !parent) return out.copy(local);
  const realA = e.aKm / 149_597_870.7;
  const factor = scale.moonOrbit(e.aKm, parent.radiusKm) / Math.max(realA, 1e-12);
  return out.copy(local).multiplyScalar(factor);
}

function applyLighting(
  view: NodeView, lightDir: Vector3, starColor: Color, intensity: number, time: number,
): void {
  const setUniforms = (mesh: Mesh | undefined, local: boolean) => {
    if (!mesh) return;
    const u = uniformsOf(mesh);
    if (u.uLightDir) (u.uLightDir.value as Vector3).copy(lightDir);
    if (u.uLightColor) (u.uLightColor.value as Color).copy(starColor);
    if (u.uLightIntensity) u.uLightIntensity.value = intensity;
    if (u.uTime) u.uTime.value = time;
    if (local && u.uLightDirLocal) {
      // The surface and ring shaders do their shadow maths in object space.
      tmpC.copy(lightDir);
      mesh.worldToLocal(tmpC.add(mesh.getWorldPosition(tmpB))).normalize();
      (u.uLightDirLocal.value as Vector3).copy(tmpC);
    }
  };
  setUniforms(view.surface, true);
  setUniforms(view.clouds, false);
  setUniforms(view.atmosphere, false);
  setUniforms(view.rings, true);

}

/** A flat annulus in the XZ plane, with radii in units of the body's radius. */
function createRingGeometry(inner: number, outer: number, segments: number): BufferGeometry {
  const positions = new Float32Array(segments * 6 * 3);
  let i = 0;
  const push = (r: number, a: number) => {
    positions[i++] = Math.cos(a) * r;
    positions[i++] = 0;
    positions[i++] = Math.sin(a) * r;
  };
  for (let s = 0; s < segments; s++) {
    const a0 = (s / segments) * Math.PI * 2;
    const a1 = ((s + 1) / segments) * Math.PI * 2;
    push(inner, a0); push(outer, a0); push(outer, a1);
    push(inner, a0); push(outer, a1); push(inner, a1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const HZ_FRAGMENT = /* glsl */ `
precision mediump float;
uniform float uInner;
uniform float uOuter;
uniform vec3  uColor;
varying vec3 vLocal;
void main() {
  float r = length(vLocal.xz);
  if (r < uInner || r > uOuter) discard;
  float t = (r - uInner) / max(uOuter - uInner, 1e-6);
  // Brightest at the two edges, so the zone reads as a band rather than a disc.
  float edge = smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.86, 1.0, t));
  gl_FragColor = vec4(uColor, (0.10 + 0.26 * (1.0 - edge)) * 0.55);
}
`;

/**
 * The conservative habitable zone, drawn as a translucent annulus. The mesh is
 * a wide disc and the shader discards outside the current radii, so the zone
 * can be resized every frame as the scale model blends without touching
 * geometry.
 */
function createHabitableZoneRing(): Mesh {
  const material = new ShaderMaterial({
    vertexShader: `varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: HZ_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uInner: { value: 0.95 },
      uOuter: { value: 1.37 },
      uColor: { value: new Color(0x4ade80) },
    },
  });
  const mesh = new Mesh(createRingGeometry(0.0001, 200, 192), material);
  mesh.renderOrder = -8;
  mesh.frustumCulled = false;
  return mesh;
}
