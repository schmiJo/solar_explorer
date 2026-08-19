/**
 * The background sky: the 5,051 naked-eye stars from the catalog, and a
 * procedural Milky Way band behind them.
 */
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial } from 'three';
import { SKY_COUNT, SKY_DIRECTIONS, SKY_MAGNITUDES, SKY_TEMPERATURES } from '../data/backgroundSky.gen';
import { BLACKBODY_GLSL } from '../astro/color';

const SKY_VERTEX = /* glsl */ `
attribute float magnitude;
attribute float temperature;
uniform float uPixelRatio;
uniform float uScale;
uniform float uBrightness;
varying vec3 vColor;
varying float vAlpha;

${BLACKBODY_GLSL}

void main() {
  // Flux follows Pogson's ratio: each magnitude is 2.512x fainter.
  float flux = pow(2.512, -magnitude);
  float apparent = pow(flux, 0.34);

  vec3 tint = blackbody(temperature);
  // Bright stars wash toward white in the eye; faint ones keep their colour.
  vColor = mix(tint, vec3(1.0), clamp(apparent * 0.55, 0.0, 0.75));
  vAlpha = clamp(apparent * 2.6, 0.06, 1.0) * uBrightness;

  gl_PointSize = clamp(apparent * 26.0 * uScale, 1.0, 9.0) * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float falloff = exp(-r * 4.0);
  gl_FragColor = vec4(vColor * falloff, falloff * vAlpha);
}
`;

/**
 * Builds the naked-eye star field on a sphere of the given radius. The points
 * carry no depth, so the same object works at any scene scale.
 */
export function createBackgroundStars(radius: number): Points {
  const positions = new Float32Array(SKY_COUNT * 3);
  for (let i = 0; i < SKY_COUNT * 3; i++) positions[i] = SKY_DIRECTIONS[i] * radius;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('magnitude', new BufferAttribute(SKY_MAGNITUDES, 1));
  geometry.setAttribute('temperature', new BufferAttribute(SKY_TEMPERATURES, 1));

  const material = new ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uScale: { value: 1 },
      uBrightness: { value: 1 },
    },
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -100;
  return points;
}

const MILKY_WAY_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uBrightness;
uniform vec3  uCore;
uniform vec3  uDust;
varying vec3 vDirection;

${'#include <common>'}

// Cheap value noise; the band only needs soft, large-scale structure.
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float valueNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i), n100 = hash(i + vec3(1, 0, 0));
  float n010 = hash(i + vec3(0, 1, 0)), n110 = hash(i + vec3(1, 1, 0));
  float n001 = hash(i + vec3(0, 0, 1)), n101 = hash(i + vec3(1, 0, 1));
  float n011 = hash(i + vec3(0, 1, 1)), n111 = hash(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float bandNoise(vec3 p) {
  float sum = 0.0, amp = 0.5, freq = 1.0;
  for (int i = 0; i < 6; i++) { sum += amp * valueNoise(p * freq); freq *= 2.03; amp *= 0.52; }
  return sum;
}

void main() {
  vec3 d = normalize(vDirection);
  // The geometry is already in galactic coordinates, so the plane is y = 0.
  float latitude = abs(d.y);
  float band = exp(-pow(latitude / 0.10, 1.5));

  // The bulge toward the galactic centre, which sits at +x.
  float toCentre = max(dot(d, vec3(1.0, 0.0, 0.0)), 0.0);
  float bulge = exp(-pow(latitude / 0.15, 2.0)) * pow(toCentre, 4.0);

  float clouds = bandNoise(d * 12.0) * 0.55 + bandNoise(d * 34.0) * 0.45;
  float lanes = bandNoise(d * 17.0 + 40.0);

  float glow = band * (0.25 + clouds * 0.75) + bulge * 0.7;
  // Dark nebulae cutting through the band.
  glow *= mix(0.22, 1.0, smoothstep(0.34, 0.66, lanes));
  glow *= 0.16;

  vec3 color = mix(uDust, uCore, clamp(bulge * 2.2, 0.0, 1.0));
  gl_FragColor = vec4(color * glow * uBrightness, 1.0);
}
`;

const MILKY_WAY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export function createMilkyWayMaterial(brightness = 1): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: MILKY_WAY_VERTEX,
    fragmentShader: MILKY_WAY_FRAGMENT,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: {
      uBrightness: { value: brightness },
      uCore: { value: new Color(0xffe6c0) },
      uDust: { value: new Color(0xc2d2ee) },
    },
  });
}
