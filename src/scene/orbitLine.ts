/**
 * Orbit paths.
 *
 * The whole ellipse is drawn faintly, with a bright head that sits on the body
 * and trails off behind it, so a glance shows both the shape of the orbit and
 * which way round the body is travelling.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Line, LineLoop, ShaderMaterial, Vector3,
} from 'three';

const VERTEX = /* glsl */ `
attribute float t;              // 0..1 along the path
uniform float uPhase;           // where the body currently is
uniform float uTrail;           // length of the bright trail, in turns
uniform float uBase;            // brightness of the rest of the ellipse
varying float vAlpha;

void main() {
  // Distance travelled backwards from the body to this vertex.
  float behind = fract(uPhase - t + 1.0);
  float head = 1.0 - smoothstep(0.0, uTrail, behind);
  vAlpha = mix(uBase, 1.0, head * head);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha * uOpacity);
}
`;

export class OrbitPath {
  readonly object: Line;
  private readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;

  constructor(color: number, segments: number, base = 0.16) {
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array((segments + 1) * 3), 3));
    const t = new Float32Array(segments + 1);
    for (let i = 0; i <= segments; i++) t[i] = i / segments;
    this.geometry.setAttribute('t', new BufferAttribute(t, 1));

    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uColor: { value: new Color(color) },
        uPhase: { value: 0 },
        uTrail: { value: 0.32 },
        uBase: { value: base },
        uOpacity: { value: 1 },
      },
    });

    this.object = new LineLoop(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = -10;
  }

  /** Replace the path. Points are consumed in place. */
  setPoints(points: Vector3[]): void {
    const attr = this.geometry.getAttribute('position') as BufferAttribute;
    const array = attr.array as Float32Array;
    const n = Math.min(points.length, array.length / 3);
    for (let i = 0; i < n; i++) {
      array[i * 3] = points[i].x;
      array[i * 3 + 1] = points[i].y;
      array[i * 3 + 2] = points[i].z;
    }
    attr.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  set phase(v: number) { this.material.uniforms.uPhase.value = v; }
  set opacity(v: number) { this.material.uniforms.uOpacity.value = v; }
  get opacity(): number { return this.material.uniforms.uOpacity.value as number; }
  set color(v: number) { (this.material.uniforms.uColor.value as Color).set(v); }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
