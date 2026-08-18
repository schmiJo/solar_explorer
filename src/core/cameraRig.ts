/**
 * Camera control with a floating origin.
 *
 * The scene spans eleven orders of magnitude, from a 1,700 km moon to a 500 au
 * orbit, which float32 vertex data cannot represent in one absolute frame. So
 * the world is drawn relative to whatever body is currently focused: the focus
 * sits at the scene origin, and every other object is positioned by its offset
 * from it. Precision is therefore always best exactly where you are looking.
 *
 * `origin` is the focus position in absolute units (au); `offset` is the
 * camera's position relative to it, and the only thing three.js ever sees.
 */
import { MathUtils, PerspectiveCamera, Spherical, Vector3 } from 'three';

const DAMPING = 0.12;
const MIN_POLAR = 0.02;
const MAX_POLAR = Math.PI - 0.02;

export class CameraRig {
  /** Absolute position of the current focus, in scene units. */
  readonly origin = new Vector3();
  /** Where the origin is heading, when a focus change is in flight. */
  private readonly targetOrigin = new Vector3();
  /** Offset from origin to camera, as a spherical coordinate. */
  private readonly spherical = new Spherical(10, Math.PI / 2.6, 0.6);
  private readonly desired = new Spherical(10, Math.PI / 2.6, 0.6);
  /** Set while a focus transition is animating. */
  private transition = 0;
  private transitionFrom = new Vector3();

  minDistance = 1e-6;
  maxDistance = 1e6;
  /** Multiplies wheel sensitivity; large systems want coarser steps. */
  zoomSpeed = 1;
  enabled = true;

  private dragging: 'orbit' | null = null;
  private lastPointer = { x: 0, y: 0 };
  private velocity = { theta: 0, phi: 0 };

  constructor(private readonly camera: PerspectiveCamera, private readonly dom: HTMLElement) {
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Current camera distance from the focus, in scene units. */
  get distance(): number { return this.spherical.radius; }

  /** Absolute camera position — origin plus the local offset. */
  absolutePosition(out = new Vector3()): Vector3 {
    return out.copy(this.camera.position).add(this.origin);
  }

  /**
   * Move the focus to a new absolute position. When `animate` is set the origin
   * slides there over a moment rather than cutting, which reads as flying.
   */
  moveOrigin(to: Vector3, animate = false): void {
    if (!animate) {
      this.origin.copy(to);
      this.targetOrigin.copy(to);
      this.transition = 0;
      return;
    }
    this.transitionFrom.copy(this.origin);
    this.targetOrigin.copy(to);
    this.transition = 1;
  }

  /** Keep tracking a moving focus without restarting the transition. */
  updateOriginTarget(to: Vector3): void {
    this.targetOrigin.copy(to);
    if (this.transition <= 0) this.origin.copy(to);
  }

  /** Frame the focus at `distance`, optionally easing there. */
  setDistance(distance: number, animate = true): void {
    this.desired.radius = MathUtils.clamp(distance, this.minDistance, this.maxDistance);
    if (!animate) this.spherical.radius = this.desired.radius;
  }

  /** Point the camera from a given direction, as a nicety when arriving somewhere. */
  setAngles(theta: number, phi: number, animate = true): void {
    this.desired.theta = theta;
    this.desired.phi = MathUtils.clamp(phi, MIN_POLAR, MAX_POLAR);
    if (!animate) {
      this.spherical.theta = this.desired.theta;
      this.spherical.phi = this.desired.phi;
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled || e.button !== 0) return;
    this.dragging = 'orbit';
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.dom.setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    const scale = 0.005;
    this.desired.theta -= dx * scale;
    this.desired.phi = MathUtils.clamp(this.desired.phi - dy * scale, MIN_POLAR, MAX_POLAR);
    this.velocity.theta = -dx * scale;
    this.velocity.phi = -dy * scale;
  };

  private onPointerUp = (): void => { this.dragging = null; };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    // Exponential zoom: constant proportional change per notch, so the control
    // feels the same whether you are 100 km or 100 au out.
    const step = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) / 100, 3) * 0.16 * this.zoomSpeed;
    this.desired.radius = MathUtils.clamp(
      this.desired.radius * Math.exp(step), this.minDistance, this.maxDistance,
    );
  };

  update(dt: number): void {
    // Ease the focus toward its target while a transition is running.
    if (this.transition > 0) {
      this.transition = Math.max(0, this.transition - dt / 1.1);
      const t = 1 - this.transition;
      const eased = t * t * (3 - 2 * t);
      this.origin.lerpVectors(this.transitionFrom, this.targetOrigin, eased);
      if (this.transition === 0) this.origin.copy(this.targetOrigin);
    } else {
      this.origin.copy(this.targetOrigin);
    }

    // Let a flick of the mouse keep turning for a moment after release.
    if (!this.dragging) {
      this.desired.theta += this.velocity.theta;
      this.desired.phi = MathUtils.clamp(this.desired.phi + this.velocity.phi, MIN_POLAR, MAX_POLAR);
      this.velocity.theta *= 0.88;
      this.velocity.phi *= 0.88;
      if (Math.abs(this.velocity.theta) < 1e-5) this.velocity.theta = 0;
      if (Math.abs(this.velocity.phi) < 1e-5) this.velocity.phi = 0;
    }

    this.desired.radius = MathUtils.clamp(this.desired.radius, this.minDistance, this.maxDistance);

    const k = 1 - Math.pow(1 - DAMPING, dt * 60);
    this.spherical.theta += (this.desired.theta - this.spherical.theta) * k;
    this.spherical.phi += (this.desired.phi - this.spherical.phi) * k;
    // Interpolate distance geometrically so zooming is smooth across decades.
    this.spherical.radius *= Math.pow(this.desired.radius / this.spherical.radius, k);

    this.camera.position.setFromSpherical(this.spherical);
    this.camera.lookAt(0, 0, 0);

    // Keep the depth range tight around whatever we can actually see.
    this.camera.near = Math.max(this.spherical.radius * 1e-4, 1e-9);
    this.camera.far = Math.max(this.spherical.radius * 1e5, 1e4);
    this.camera.updateProjectionMatrix();
  }
}
