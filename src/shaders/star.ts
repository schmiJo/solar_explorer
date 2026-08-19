/**
 * The glow around a star: an outer corona for the star you are inside the
 * system of, and a cheap billboard used when a star is only a point of light.
 */
import { AdditiveBlending, Color, ShaderMaterial } from 'three';
import { NOISE_GLSL } from './noise.glsl';

const BILLBOARD_VERTEX = /* glsl */ `
uniform float uScale;
varying vec2 vUv;
void main() {
  vUv = uv;
  // Expand the quad in view space so it always faces the camera.
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 scale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 1.0);
  center.xy += position.xy * scale.xy * uScale;
  gl_Position = projectionMatrix * center;
}
`;

const CORONA_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3  uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uSeed;
varying vec2 vUv;

${NOISE_GLSL}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float angle = atan(p.y, p.x);
  // Streamers that shift slowly, as coronal structure does.
  vec3 samplePos = vec3(cos(angle), sin(angle), uSeed) * 2.6;
  float rays = ridged(samplePos + vec3(0.0, 0.0, uTime * 0.03), 4, 2.3, 0.5);
  float fine = fbm(samplePos * 3.5 + vec3(0.0, 0.0, uTime * 0.05), 3, 2.0, 0.5) * 0.5 + 0.5;

  // Two falloffs stacked: a tight inner blaze and a broad outer halo.
  float inner = exp(-r * 14.0);
  float outer = exp(-r * 4.2) * (0.4 + rays * 0.8) * (0.7 + fine * 0.5);
  float edge = 1.0 - smoothstep(0.7, 1.0, r);

  float intensity = (inner * 0.9 + outer * 0.32) * edge * uIntensity;
  vec3 color = mix(uColor, vec3(1.0), inner * 0.7);
  gl_FragColor = vec4(color * intensity, intensity);
}
`;

export function createCoronaMaterial(color: Color, intensity = 1, seed = 0): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: CORONA_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: {
      uColor: { value: color.clone() },
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uSeed: { value: seed },
      uScale: { value: 1 },
    },
  });
}

const POINT_GLOW_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3  uColor;
uniform float uIntensity;
uniform float uSpikes;
varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float core = exp(-r * 16.0);
  float halo = exp(-r * 3.2) * 0.35;
  // A soft four-point flare, the way a bright star reads through an optic.
  float spike = uSpikes * 0.22 *
    (exp(-abs(p.x) * 42.0) + exp(-abs(p.y) * 42.0)) * exp(-r * 3.0);

  float intensity = (core + halo + spike) * uIntensity * (1.0 - smoothstep(0.8, 1.0, r));
  gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.8) * intensity, intensity);
}
`;

export function createPointGlowMaterial(color: Color, intensity = 1, spikes = 1): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: BILLBOARD_VERTEX,
    fragmentShader: POINT_GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uColor: { value: color.clone() },
      uIntensity: { value: intensity },
      uSpikes: { value: spikes },
      uScale: { value: 1 },
    },
  });
}
