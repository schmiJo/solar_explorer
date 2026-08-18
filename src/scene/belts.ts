/**
 * The asteroid and Kuiper belts.
 *
 * Tens of thousands of bodies is too many to propagate on the CPU every frame,
 * so each particle carries its own orbital elements as vertex attributes and
 * the vertex shader solves Kepler's equation for it. The distribution of
 * semi-major axes reproduces the Kirkwood gaps — the resonances with Jupiter
 * that the real belt has been swept clean of.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial,
} from 'three';

/** Mean-motion resonances with Jupiter that clear the main belt, in au. */
const KIRKWOOD_GAPS: [number, number][] = [
  [2.065, 0.02],  // 4:1
  [2.502, 0.03],  // 3:1
  [2.825, 0.02],  // 5:2
  [2.958, 0.015], // 7:3
  [3.279, 0.025], // 2:1
];

const VERTEX = /* glsl */ `
attribute float aAxis;        // semi-major axis, au
attribute float aEcc;
attribute float aInc;         // radians
attribute float aNode;        // radians
attribute float aPeri;        // radians, argument of perihelion
attribute float aPhase;       // mean anomaly at epoch, radians
attribute float aSize;

uniform float uJD;
uniform float uScaleT;        // 0 = true distances, 1 = compressed
uniform float uPointScale;
uniform float uOpacity;
varying float vAlpha;

/** Must match ScaleModel.orbitRadius in scene/scale.ts. */
float orbitRadius(float au) {
  float compressed = 0.9 * log(1.0 + au / 0.25) / log(10.0);
  return mix(au, compressed, uScaleT);
}

void main() {
  // Kepler's third law sets the rate; GM_sun in au^3/day^2.
  float n = sqrt(0.00029591220828 / (aAxis * aAxis * aAxis));
  float M = aPhase + n * uJD;
  M = mod(M + 3.14159265, 6.28318531) - 3.14159265;

  float E = M + aEcc * sin(M);
  for (int i = 0; i < 4; i++) {
    E -= (E - aEcc * sin(E) - M) / (1.0 - aEcc * cos(E));
  }

  float xp = aAxis * (cos(E) - aEcc);
  float yp = aAxis * sqrt(1.0 - aEcc * aEcc) * sin(E);

  float cw = cos(aPeri), sw = sin(aPeri);
  float co = cos(aNode), so = sin(aNode);
  float ci = cos(aInc), si = sin(aInc);

  vec3 ecliptic = vec3(
    (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
    (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
    sw * si * xp + cw * si * yp);

  // Ecliptic (x, y, z) to the scene's y-up frame, then apply the scale model.
  vec3 scenePos = vec3(ecliptic.x, ecliptic.z, -ecliptic.y);
  float r = length(scenePos);
  scenePos *= orbitRadius(r) / max(r, 1e-9);

  vec4 mv = modelViewMatrix * vec4(scenePos, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = -mv.z;
  gl_PointSize = clamp(aSize * uPointScale / max(dist, 1e-6), 0.6, 3.5);
  // Fade out rather than shrink below a pixel, so the belt does not shimmer.
  vAlpha = uOpacity * clamp(aSize * uPointScale / max(dist, 1e-6) / 0.8, 0.05, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  gl_FragColor = vec4(uColor, vAlpha * (1.0 - r) * 0.85);
}
`;

export interface BeltOptions {
  count: number;
  /** Semi-major axis range, au. */
  inner: number;
  outer: number;
  /** Maximum eccentricity and inclination (degrees). */
  maxEcc: number;
  maxInc: number;
  color: number;
  /** Apply the main-belt Kirkwood gaps. */
  gaps?: boolean;
  size?: number;
}

export class Belt {
  readonly object: Points;
  private readonly material: ShaderMaterial;

  constructor(private readonly options: BeltOptions) {
    const { count } = options;
    const geometry = new BufferGeometry();

    const axis = new Float32Array(count);
    const ecc = new Float32Array(count);
    const inc = new Float32Array(count);
    const node = new Float32Array(count);
    const peri = new Float32Array(count);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);
    // Positions are computed in the shader; this only exists to size the draw.
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      axis[i] = this.sampleAxis();
      // Rayleigh-ish tails: most orbits are near-circular and near-coplanar.
      ecc[i] = options.maxEcc * Math.pow(Math.random(), 1.7);
      inc[i] = ((options.maxInc * Math.pow(Math.random(), 1.6)) * Math.PI) / 180 * (Math.random() < 0.5 ? -1 : 1);
      node[i] = Math.random() * Math.PI * 2;
      peri[i] = Math.random() * Math.PI * 2;
      phase[i] = Math.random() * Math.PI * 2;
      size[i] = (options.size ?? 0.9) * (0.45 + Math.random() * Math.random() * 1.9);
    }

    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aAxis', new BufferAttribute(axis, 1));
    geometry.setAttribute('aEcc', new BufferAttribute(ecc, 1));
    geometry.setAttribute('aInc', new BufferAttribute(inc, 1));
    geometry.setAttribute('aNode', new BufferAttribute(node, 1));
    geometry.setAttribute('aPeri', new BufferAttribute(peri, 1));
    geometry.setAttribute('aPhase', new BufferAttribute(phase, 1));
    geometry.setAttribute('aSize', new BufferAttribute(size, 1));
    geometry.boundingSphere = null;

    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uJD: { value: 0 },
        uScaleT: { value: 1 },
        uPointScale: { value: 1 },
        uOpacity: { value: 1 },
        uColor: { value: new Color(options.color) },
      },
    });

    this.object = new Points(geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = -5;
  }

  /** Draw a semi-major axis, rejecting anything that falls in a Kirkwood gap. */
  private sampleAxis(): number {
    const { inner, outer, gaps } = this.options;
    for (let attempt = 0; attempt < 24; attempt++) {
      const a = inner + Math.random() * (outer - inner);
      if (!gaps) return a;
      let keep = true;
      for (const [centre, width] of KIRKWOOD_GAPS) {
        const depth = Math.exp(-Math.pow((a - centre) / width, 2));
        if (Math.random() < depth * 0.97) { keep = false; break; }
      }
      if (keep) return a;
    }
    return inner + Math.random() * (outer - inner);
  }

  update(jd: number, scaleT: number, pointScale: number, opacity: number): void {
    this.material.uniforms.uJD.value = jd;
    this.material.uniforms.uScaleT.value = scaleT;
    this.material.uniforms.uPointScale.value = pointScale;
    this.material.uniforms.uOpacity.value = opacity;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}
