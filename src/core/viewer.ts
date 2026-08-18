/**
 * Renderer, post-processing and the render loop.
 *
 * Scenes are drawn through an EffectComposer so stars and hot surfaces can
 * bloom. Depth uses a logarithmic buffer, which is what makes it possible to
 * have a planet 6,000 km across and an orbit 4.5 billion km wide in one frame.
 */
import {
  ACESFilmicToneMapping, Camera, PerspectiveCamera, Scene, Vector2, WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export class Viewer {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloom: UnrealBloomPass;
  private lastFrame = performance.now();
  /** Smoothed frame time in milliseconds, for the performance readout. */
  frameTime = 16;

  constructor(canvas: HTMLCanvasElement, scene: Scene) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;

    this.camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1e-7, 1e9);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new UnrealBloomPass(
      new Vector2(window.innerWidth, window.innerHeight),
      0.62,   // strength
      0.7,    // radius
      0.55,   // threshold — only genuinely bright things bloom
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Point the render pass at a different scene, e.g. when changing view. */
  setScene(scene: Scene, camera: Camera = this.camera): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  setBloom(strength: number, threshold = this.bloom.threshold): void {
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
  }

  get exposure(): number { return this.renderer.toneMappingExposure; }
  set exposure(v: number) { this.renderer.toneMappingExposure = v; }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  /** Seconds elapsed since the previous call, clamped so tab-switches don't jump. */
  tick(): number {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.frameTime += ((now - this.lastFrame) - this.frameTime) * 0.1;
    this.lastFrame = now;
    return dt;
  }

  render(): void {
    this.renderer.clear();
    this.composer.render();
  }
}
