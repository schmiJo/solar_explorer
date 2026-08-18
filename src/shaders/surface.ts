/**
 * Procedural planetary surfaces.
 *
 * Nothing here loads a texture. Each body's appearance is evaluated per
 * fragment from noise in the mesh's own object space, so features rotate with
 * the body and stay sharp however far you zoom in. `uStyle` selects between the
 * surface archetypes declared in data/types.ts.
 */
import { BackSide, Color, DoubleSide, ShaderMaterial, Vector3 } from 'three';
import type { SurfaceStyle } from '../data/types';
import { NOISE_GLSL } from './noise.glsl';

/** Keep in sync with the branch order in the fragment shader. */
const STYLE_INDEX: Record<SurfaceStyle, number> = {
  rock: 0, cratered: 1, volcanic: 2, terrestrial: 3, desert: 4,
  clouded: 5, gasGiant: 6, iceGiant: 7, ice: 8, sun: 9,
};

const VERTEX = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vObjPos = normalize(position);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SURFACE_FRAGMENT = /* glsl */ `
precision highp float;

// three.js declares this in the vertex prefix only, but does supply the value
// to any program that uses it — so the fragment stage has to ask for it.
uniform mat4 modelMatrix;

uniform vec3  uColor;
uniform vec3  uLightDir;        // world space, pointing from surface toward the star
uniform vec3  uLightColor;
uniform float uLightIntensity;
uniform float uTime;
uniform float uSeed;
uniform int   uStyle;
uniform float uSpotLongitude;   // < 0 disables the storm
uniform vec3  uAtmosphere;
uniform float uAtmosphereDensity;
uniform float uRingInner;       // ring shadow cast onto the planet; 0 disables
uniform float uRingOuter;       // both in units of the body's own radius
uniform vec3  uLightDirLocal;   // uLightDir rotated into the body's object space

varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

${NOISE_GLSL}

/** Height field for the rocky styles. Also drives the normal perturbation. */
float terrain(vec3 p, int style) {
  if (style == 1) {                                   // cratered
    float base = fbm(p * 2.5, 5, 2.0, 0.5) * 0.35;
    float big = worley(p * 5.0);
    float small = worley(p * 17.0 + 31.7);
    float basins = -smoothstep(0.32, 0.0, big) * 0.55 + smoothstep(0.0, 0.12, big) * 0.18;
    float pits = -smoothstep(0.22, 0.0, small) * 0.22 + smoothstep(0.0, 0.09, small) * 0.08;
    return base + basins + pits;
  }
  if (style == 8) {                                   // ice
    float cracks = 1.0 - abs(fbm(p * 4.0, 5, 2.1, 0.55));
    return fbm(p * 3.0, 5, 2.0, 0.5) * 0.4 + pow(cracks, 6.0) * 0.5;
  }
  if (style == 3 || style == 4) {                     // terrestrial / desert
    return warpedFbm(p * 1.9 + uSeed, 0.7, 6);
  }
  if (style == 2) {                                   // volcanic
    return warpedFbm(p * 3.2 + uSeed, 1.1, 6);
  }
  return fbm(p * 3.4 + uSeed, 6, 2.0, 0.5);           // rock
}

/** Central-difference normal from the height field, in object space. */
vec3 perturbNormal(vec3 p, int style, float strength) {
  float e = 0.012;
  float h = terrain(p, style);
  vec3 tangentA = normalize(cross(p, abs(p.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 tangentB = cross(p, tangentA);
  float ha = terrain(normalize(p + tangentA * e), style);
  float hb = terrain(normalize(p + tangentB * e), style);
  return normalize(p - strength * ((ha - h) * tangentA + (hb - h) * tangentB) / e * 0.02);
}

/** Latitude-banded flow used by both gas and ice giants. */
float bands(vec3 p, float stretch, float turbulence, int octaves) {
  vec3 warp = vec3(
    fbm(p * 2.0 + uTime * 0.006, 4, 2.0, 0.5),
    fbm(p * 2.0 + 19.3, 4, 2.0, 0.5),
    fbm(p * 2.0 + 43.1, 4, 2.0, 0.5));
  vec3 q = p + warp * turbulence;
  return fbm(vec3(q.x, q.y * stretch, q.z) + uSeed, octaves, 2.0, 0.55);
}

/** An oval storm, swirled by noise, placed at a fixed latitude and longitude. */
float storm(vec3 n, float longitude, float latitude, vec2 radii) {
  float lon = atan(n.z, n.x);
  float dLon = atan(sin(lon - longitude), cos(lon - longitude));
  vec2 d = vec2(dLon / radii.x, (n.y - latitude) / radii.y);
  float swirl = fbm(n * 9.0 + uTime * 0.02, 4, 2.0, 0.5) * 0.35;
  return smoothstep(1.0, 0.15, length(d) + swirl);
}

/**
 * True where a fragment sits in the shadow the rings throw across the planet.
 * Worked entirely in object space, where the ring plane is y = 0 and lengths
 * are already in units of the body's radius.
 */
float ringShadow(vec3 objPos) {
  if (uRingOuter <= 0.0) return 1.0;
  vec3 L = uLightDirLocal;
  if (abs(L.y) < 1e-4) return 1.0;
  float t = -objPos.y / L.y;                         // travel to the ring plane
  if (t <= 0.0) return 1.0;                          // the rings are behind us
  float r = length((objPos + L * t).xz);
  float inside = smoothstep(uRingInner, uRingInner + 0.02, r) *
                 (1.0 - smoothstep(uRingOuter - 0.02, uRingOuter, r));
  // Feather the shadow where the rings are nearly edge-on to the light.
  float grazing = smoothstep(0.0, 0.25, abs(L.y));
  return 1.0 - inside * 0.75 * grazing;
}

void main() {
  vec3 n = normalize(vObjPos);
  vec3 albedo = uColor;
  float gloss = 0.0;
  float roughness = 1.0;
  vec3 emissive = vec3(0.0);
  vec3 shadingNormal = normalize(vWorldNormal);

  if (uStyle == 6 || uStyle == 7) {
    // ---- gas and ice giants: latitude bands, storms, polar hoods
    float stretch = uStyle == 6 ? 26.0 : 16.0;
    float turb = uStyle == 6 ? 0.30 : 0.16;
    float b = bands(n * 1.6, stretch, turb, 6);
    float zonal = 0.5 + 0.5 * sin(n.y * (uStyle == 6 ? 14.0 : 8.0) + b * 3.5);
    vec3 dark = uColor * 0.55;
    vec3 light = mix(uColor, vec3(1.0), 0.35);
    albedo = mix(dark, light, smoothstep(0.15, 0.85, zonal * 0.6 + (b * 0.5 + 0.5) * 0.4));
    // Fine shear at the band boundaries.
    albedo *= 1.0 + 0.12 * ridged(vec3(n.x, n.y * stretch * 1.6, n.z) * 2.2, 4, 2.0, 0.5);
    // Cooler, hazier poles.
    albedo = mix(albedo, mix(uColor, vec3(0.75, 0.82, 0.9), 0.45), smoothstep(0.55, 0.95, abs(n.y)));
    if (uSpotLongitude >= 0.0) {
      float spot = storm(n, uSpotLongitude, -0.34, vec2(0.42, 0.10));
      albedo = mix(albedo, vec3(0.72, 0.26, 0.16), spot * 0.9);
      float halo = storm(n, uSpotLongitude, -0.34, vec2(0.52, 0.135));
      albedo = mix(albedo, vec3(0.85, 0.62, 0.42), max(halo - spot, 0.0) * 0.6);
    }
    roughness = 0.95;
  } else if (uStyle == 9) {
    // ---- star photosphere: convection cells over a limb-darkened disc
    float granule = worley(n * 42.0 + uTime * 0.05);
    float supergranule = worley(n * 11.0 - uTime * 0.02);
    float turbulence = fbm(n * 26.0 + uTime * 0.08, 4, 2.2, 0.5);
    float cell = smoothstep(0.05, 0.55, granule) * 0.55 + smoothstep(0.1, 0.6, supergranule) * 0.35;
    float brightness = 0.72 + cell * 0.42 + turbulence * 0.14;
    float limb = pow(max(dot(shadingNormal, vViewDir), 0.0), 0.42);   // limb darkening
    emissive = uColor * brightness * mix(0.45, 1.25, limb);
    // Faint dark patches standing in for active regions.
    float spots = smoothstep(0.86, 0.995, fbm(n * 3.1 + uSeed, 4, 2.0, 0.5) * 0.5 + 0.5);
    emissive *= 1.0 - spots * 0.55;
    gl_FragColor = vec4(emissive, 1.0);
    return;
  } else {
    // ---- solid surfaces
    float h = terrain(n, uStyle);
    shadingNormal = normalize(mat3(modelMatrix) * perturbNormal(n, uStyle, 1.0));

    if (uStyle == 3) {
      // Earth-like: ocean, shelf, land, and ice at the poles.
      float sea = 0.02;
      float land = smoothstep(sea, sea + 0.06, h);
      vec3 deep = vec3(0.016, 0.055, 0.16);
      vec3 shallow = vec3(0.05, 0.26, 0.42);
      vec3 ocean = mix(deep, shallow, smoothstep(-0.25, sea, h));
      float dryness = fbm(n * 5.0 + 71.0, 4, 2.0, 0.5) * 0.5 + 0.5;
      vec3 vegetation = mix(vec3(0.09, 0.24, 0.09), vec3(0.20, 0.30, 0.12), dryness);
      vec3 arid = mix(vec3(0.55, 0.45, 0.28), vec3(0.42, 0.36, 0.24), dryness);
      float latitude = abs(n.y);
      vec3 ground = mix(vegetation, arid, smoothstep(0.05, 0.45, latitude) * dryness);
      ground = mix(ground, vec3(0.42, 0.40, 0.38), smoothstep(0.18, 0.42, h));   // mountains
      float ice = smoothstep(0.72, 0.88, latitude + h * 0.25);
      ground = mix(ground, vec3(0.92, 0.94, 0.97), ice);
      albedo = mix(ocean, ground, land);
      albedo = mix(albedo, vec3(0.90, 0.93, 0.96), ice * (1.0 - land) * 0.85);   // sea ice
      gloss = (1.0 - land) * (1.0 - ice) * 0.9;
      roughness = mix(0.08, 0.9, land);
    } else if (uStyle == 4) {
      // Mars-like: iron oxide plains, dark basalt, polar caps.
      vec3 dust = mix(vec3(0.60, 0.30, 0.17), vec3(0.78, 0.46, 0.27), h * 0.5 + 0.5);
      vec3 basalt = vec3(0.30, 0.19, 0.14);
      albedo = mix(basalt, dust, smoothstep(-0.35, 0.25, h));
      float caps = smoothstep(0.86, 0.96, abs(n.y) + fbm(n * 8.0, 3, 2.0, 0.5) * 0.06);
      albedo = mix(albedo, vec3(0.94, 0.95, 0.96), caps);
      roughness = 0.95;
    } else if (uStyle == 2) {
      // Io-like: sulfur plains with hot volcanic centres.
      vec3 sulfur = mix(vec3(0.86, 0.74, 0.30), vec3(0.94, 0.88, 0.62), h * 0.5 + 0.5);
      float vents = smoothstep(0.55, 0.05, worley(n * 9.0 + uSeed));
      albedo = mix(sulfur, vec3(0.35, 0.13, 0.08), vents * 0.8);
      emissive = vec3(1.0, 0.35, 0.06) * pow(vents, 3.0) * 0.6;
      roughness = 0.9;
    } else if (uStyle == 8) {
      // Icy: bright water ice cut by fracture systems.
      float cracks = pow(1.0 - abs(fbm(n * 5.0 + uSeed, 5, 2.1, 0.55)), 8.0);
      albedo = mix(uColor, vec3(1.0), 0.35 * (fbm(n * 7.0, 4, 2.0, 0.5) * 0.5 + 0.5));
      albedo = mix(albedo, uColor * vec3(0.75, 0.68, 0.60), cracks * 0.85);
      gloss = 0.25;
      roughness = 0.4;
    } else if (uStyle == 5) {
      // Venus-like: opaque, featureless cloud deck.
      float deck = warpedFbm(n * 3.0 + uTime * 0.004 + uSeed, 1.4, 6);
      albedo = mix(uColor * 0.82, mix(uColor, vec3(1.0), 0.4), deck * 0.5 + 0.5);
      albedo *= 1.0 - 0.1 * smoothstep(0.5, 0.95, abs(n.y));
      shadingNormal = normalize(vWorldNormal);
      roughness = 1.0;
    } else {
      // Bare rock and cratered regolith.
      float shade = h * 0.5 + 0.5;
      albedo = uColor * (0.55 + 0.7 * shade);
      float rays = smoothstep(0.75, 1.0, fbm(n * 14.0 + uSeed, 3, 2.0, 0.5) * 0.5 + 0.5);
      albedo = mix(albedo, albedo * 1.5, rays * 0.3);
      roughness = 1.0;
    }
  }

  // ---- lighting
  vec3 N = shadingNormal;
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(vViewDir);
  float NdotL = dot(N, L);

  // Atmospheres carry light a little past the geometric terminator.
  float wrap = 0.06 + uAtmosphereDensity * 0.22;
  float diffuse = clamp((NdotL + wrap) / (1.0 + wrap), 0.0, 1.0);
  diffuse *= diffuse * (3.0 - 2.0 * diffuse);       // soften the terminator

  float shadow = ringShadow(n);
  vec3 lit = albedo * uLightColor * uLightIntensity * diffuse * shadow;

  // Specular: sharp on water and ice, absent on dust.
  if (gloss > 0.0) {
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), mix(24.0, 220.0, 1.0 - roughness));
    lit += uLightColor * spec * gloss * step(0.0, NdotL) * shadow * 1.4;
  }

  // Earth's night side: city lights where land is low-lying and unglaciated.
  if (uStyle == 3) {
    float night = smoothstep(0.08, -0.12, NdotL);
    float h = terrain(n, uStyle);
    float habitable = smoothstep(0.02, 0.10, h) * (1.0 - smoothstep(0.30, 0.5, h))
                    * (1.0 - smoothstep(0.6, 0.78, abs(n.y)));
    float density = pow(max(fbm(n * 22.0 + 5.0, 4, 2.2, 0.5), 0.0), 2.2);
    lit += vec3(1.0, 0.82, 0.48) * night * habitable * density * 1.6;
  }

  // Ambient starlight, so the night side is never pure black.
  lit += albedo * 0.018;
  lit += emissive;

  // Rim haze for bodies with an atmosphere.
  if (uAtmosphereDensity > 0.0) {
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.5);
    float facing = smoothstep(-0.35, 0.6, NdotL);
    lit += uAtmosphere * fresnel * facing * uAtmosphereDensity * 0.85;
  }

  gl_FragColor = vec4(lit, 1.0);
}
`;

export interface SurfaceOptions {
  style: SurfaceStyle;
  color: number;
  seed?: number;
  atmosphere?: number;
  atmosphereDensity?: number;
  /** Longitude of a Great-Red-Spot-style storm, radians. Omit for none. */
  spotLongitude?: number;
}

export function createSurfaceMaterial(opts: SurfaceOptions): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: SURFACE_FRAGMENT,
    uniforms: {
      uColor: { value: new Color(opts.color) },
      uLightDir: { value: new Vector3(1, 0, 0) },
      uLightColor: { value: new Color(0xfff4e8) },
      uLightIntensity: { value: 1 },
      uTime: { value: 0 },
      uSeed: { value: opts.seed ?? 0 },
      uStyle: { value: STYLE_INDEX[opts.style] },
      uSpotLongitude: { value: opts.spotLongitude ?? -1 },
      uAtmosphere: { value: new Color(opts.atmosphere ?? 0x000000) },
      uAtmosphereDensity: { value: opts.atmosphereDensity ?? 0 },
      uRingInner: { value: 0 },
      uRingOuter: { value: 0 },
      uLightDirLocal: { value: new Vector3(1, 0, 0) },
    },
  });
}

// ---------------------------------------------------------------- clouds

const CLOUD_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3  uLightDir;
uniform vec3  uLightColor;
uniform float uTime;
uniform float uCoverage;
uniform float uSeed;
varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

${NOISE_GLSL}

void main() {
  vec3 n = normalize(vObjPos);
  // Drift the deck slowly and shear it with latitude, as weather systems do.
  vec3 p = n * 3.2 + vec3(uTime * 0.01, 0.0, 0.0) + uSeed;
  float cover = warpedFbm(p, 1.1, 6) * 0.5 + 0.5;
  float wisps = ridged(n * 8.0 + uTime * 0.02, 4, 2.2, 0.5);
  float density = smoothstep(uCoverage, uCoverage + 0.22, cover + wisps * 0.18);
  if (density < 0.004) discard;

  vec3 N = normalize(vWorldNormal);
  float NdotL = dot(N, normalize(uLightDir));
  float diffuse = clamp((NdotL + 0.15) / 1.15, 0.0, 1.0);
  // Silver lining where we look through the edge of a sunlit cloud.
  float rim = pow(1.0 - max(dot(N, normalize(vViewDir)), 0.0), 2.0);
  vec3 color = uLightColor * (0.85 + rim * 0.5) * (diffuse * 0.95 + 0.03);
  gl_FragColor = vec4(color, density * 0.92);
}
`;

export function createCloudMaterial(coverage: number, seed = 0): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: CLOUD_FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uLightDir: { value: new Vector3(1, 0, 0) },
      uLightColor: { value: new Color(0xfff4e8) },
      uTime: { value: 0 },
      uCoverage: { value: coverage },
      uSeed: { value: seed },
    },
  });
}

// ---------------------------------------------------------------- atmosphere

const ATMOSPHERE_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3  uColor;
uniform vec3  uLightDir;
uniform float uDensity;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(vViewDir);
  vec3 L = normalize(uLightDir);

  // Thickest where we graze the shell, and only where the shell is lit.
  float limb = pow(1.0 - abs(dot(N, V)), 2.6);
  float lit = smoothstep(-0.45, 0.35, dot(N, L));
  // Extra brightness looking through the atmosphere toward the star.
  float forward = pow(max(dot(V, -L), 0.0), 3.0);
  float intensity = limb * lit * (1.0 + forward * 1.6) * uDensity;
  gl_FragColor = vec4(uColor * intensity, intensity);
}
`;

export function createAtmosphereMaterial(color: number, density: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: BackSide,
    uniforms: {
      uColor: { value: new Color(color) },
      uLightDir: { value: new Vector3(1, 0, 0) },
      uDensity: { value: density },
    },
  });
}

// ---------------------------------------------------------------- rings

const RING_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3  uColor;
uniform vec3  uLightDir;        // render space, for the forward-scattering term
uniform vec3  uLightDirLocal;   // ring object space, for the planet's shadow
uniform vec3  uLightColor;
uniform float uInner;
uniform float uOuter;
uniform float uSeed;
uniform float uDetail;       // 0 = faint dusty ring, 1 = full Saturnian structure
varying vec3 vLocalPos;
varying vec3 vWorldPos;

${NOISE_GLSL}

void main() {
  float r = length(vLocalPos.xz);
  float t = (r - uInner) / (uOuter - uInner);
  if (t < 0.0 || t > 1.0) discard;

  // Fine ringlets at several scales, plus the major divisions.
  float ringlets = 0.5 + 0.5 * simplexNoise3(vec3(t * 420.0, uSeed, 0.0));
  ringlets = mix(ringlets, 0.5 + 0.5 * simplexNoise3(vec3(t * 96.0, uSeed + 3.0, 0.0)), 0.5);
  float coarse = fbm(vec3(t * 22.0, uSeed, 0.0), 4, 2.0, 0.5) * 0.5 + 0.5;

  float density = mix(0.35, 1.0, coarse) * mix(0.55, 1.0, ringlets);
  // Cassini division, and the fade at both edges.
  float cassini = 1.0 - 0.92 * exp(-pow((t - 0.62) / 0.028, 2.0)) * uDetail;
  float encke  = 1.0 - 0.55 * exp(-pow((t - 0.88) / 0.008, 2.0)) * uDetail;
  density *= cassini * encke;
  density *= smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.93, 1.0, t));
  density *= mix(0.25, 1.0, uDetail);

  // The planet's shadow falling across the ring plane. Object space puts the
  // planet at the origin with unit radius, so this is a ray-sphere miss test.
  vec3 L = normalize(uLightDirLocal);
  float along = dot(-vLocalPos, L);
  float shadow = 1.0;
  if (along > 0.0) {
    float miss = length(vLocalPos + L * along);
    shadow = smoothstep(0.97, 1.06, miss);
  }

  // Ice particles scatter strongly forward, so the far side of the rings glows.
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float forward = pow(max(dot(viewDir, -normalize(uLightDir)), 0.0), 4.0);
  vec3 color = uColor * uLightColor * (0.55 + forward * 1.1) * mix(0.85, 1.15, ringlets);

  float alpha = clamp(density, 0.0, 1.0) * mix(0.35, 0.95, uDetail);
  gl_FragColor = vec4(color * (0.12 + 0.88 * shadow), alpha);
}
`;

const RING_VERTEX = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vWorldPos;
void main() {
  vLocalPos = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * Ring geometry is authored in units of the planet's radius and lying in the
 * object-space XZ plane, so `inner` and `outer` are ratios such as 1.24 and 2.27.
 */
export function createRingMaterial(
  color: number, inner: number, outer: number, detail: number, seed = 0,
): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    uniforms: {
      uColor: { value: new Color(color) },
      uLightDir: { value: new Vector3(1, 0, 0) },
      uLightDirLocal: { value: new Vector3(1, 0, 0) },
      uLightColor: { value: new Color(0xfff4e8) },
      uInner: { value: inner },
      uOuter: { value: outer },
      uSeed: { value: seed },
      uDetail: { value: detail },
    },
  });
}
