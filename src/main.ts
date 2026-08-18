/**
 * Solar System Explorer.
 *
 * Two views share one camera and one clock: a star system rendered from real
 * orbital elements, and the solar neighbourhood rendered from real parallaxes.
 * Selecting a star with catalogued planets flies you into its system.
 */
import './style.css';
import { Viewer } from './core/viewer';
import { CameraRig } from './core/cameraRig';
import { ScaleModel } from './scene/scale';
import { SystemView } from './scene/systemView';
import { GalaxyView, entryColor, type StarEntry } from './scene/galaxyView';
import { buildExoSystem, buildSolarSystem, type SystemModel } from './scene/systemModel';
import { LabelLayer, type LabelRequest } from './ui/labels';
import { InfoPanel, nodeContent, starContent } from './ui/infoPanel';
import { DEFAULT_RATE, Hud, RATES, type NavigatorItem, type ToggleKey } from './ui/hud';
import { nowJD } from './astro/time';
import { TOUR, type TourStop } from './tour';

type Mode = 'system' | 'galaxy';

class App {
  private readonly viewer: Viewer;
  private readonly rig: CameraRig;
  private readonly scale = new ScaleModel();
  private readonly galaxy = new GalaxyView();
  private readonly labels: LabelLayer;
  private readonly panel: InfoPanel;
  private readonly hud: Hud;
  private readonly caption: HTMLElement;

  private system: SystemView;
  private mode: Mode = 'system';
  /** The star entry whose system we are inside, if we arrived from the map. */
  private hostEntry: StarEntry | null = null;

  private jd = nowJD();
  private rateIndex = DEFAULT_RATE;
  private direction = 1;
  private paused = false;
  private elapsed = 0;

  private focusId: string | null = 'sun';
  private selectedId: string | null = null;
  private selectedStarId: string | null = null;

  private tourIndex = -1;
  private tourTimer = 0;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.system = new SystemView(buildSolarSystem(), this.scale);
    this.viewer = new Viewer(canvas, this.system.scene);
    this.rig = new CameraRig(this.viewer.camera, canvas);
    this.labels = new LabelLayer(overlay);
    this.caption = document.createElement('div');
    this.caption.className = 'tour-caption';
    overlay.appendChild(this.caption);
    this.panel = new InfoPanel(overlay);
    this.hud = new Hud(overlay, {
      onPlayToggle: () => { this.paused = !this.paused; },
      onRateChange: (i) => { this.rateIndex = i; this.paused = false; },
      onReverse: () => { this.direction *= -1; },
      onNow: () => { this.jd = nowJD(); },
      onScrub: (jd) => { this.jd = jd; },
      onToggle: (key, value) => this.applyToggle(key, value),
      onNavigate: (id) => this.navigate(id),
      onBack: () => this.exitToGalaxy(),
      onTour: () => this.toggleTour(),
    });

    this.applySystemCameraLimits();
    this.focus('sun', false);
    this.refreshNavigator();
    this.hud.setHeading('Solar System', 'Sol · G2V · you are here', false);

    canvas.addEventListener('click', (e) => this.onClick(e));
    canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    overlay.addEventListener('click', (e) => {
      const id = this.labels.hitTest(e.target);
      if (id) this.navigate(id);
    });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));

    this.loop();
  }

  // ---------------------------------------------------------------- state

  private get rate(): number { return RATES[this.rateIndex] * this.direction; }

  private applyToggle(key: ToggleKey, value: boolean): void {
    switch (key) {
      case 'schematic': this.scale.setMode(value); break;
      case 'orbits': this.system.showOrbits = value; break;
      case 'labels': this.system.showLabels = value; break;
      case 'belts': this.system.showBelts = value; break;
      case 'habitable': this.system.showHabitableZone = value; break;
      case 'grid': this.galaxy.showGrid = value; this.galaxy.showDropLines = value; break;
    }
  }

  private applySystemCameraLimits(): void {
    const smallest = Math.min(...this.system.views.map((v) => this.scale.bodyRadius(v.node.radiusKm)));
    this.rig.minDistance = Math.max(smallest * 1.15, 1e-8);
    this.rig.maxDistance = Math.max(this.scale.orbitRadius(this.system.model.extent) * 12, 40);
    this.rig.zoomSpeed = 1;
  }

  private applyGalaxyCameraLimits(): void {
    this.rig.minDistance = 0.02;
    this.rig.maxDistance = 400;
    this.rig.zoomSpeed = 1;
  }

  // ---------------------------------------------------------------- navigation

  private navigate(id: string): void {
    if (this.mode === 'system') {
      if (this.system.view(id)) { this.focus(id, true); this.select(id); return; }
      // An id from the other view's list: switch over and go there.
      this.enterGalaxy(id);
      return;
    }
    const entry = this.galaxy.entry(id);
    if (entry) this.selectStar(entry, true);
  }

  private focus(id: string, animate: boolean): void {
    const view = this.system.view(id);
    if (!view) return;
    this.focusId = id;
    this.system.computePositions(this.jd);
    this.rig.moveOrigin(view.display, animate);
    this.rig.setDistance(this.system.framingDistance(id), animate);
    this.hud.setActive(id);
  }

  private select(id: string | null): void {
    this.selectedId = id;
    const view = id ? this.system.view(id) : undefined;
    if (view) this.panel.show(nodeContent(view.node, this.system.model.name));
    else this.panel.hide();
    this.hud.setActive(id);
  }

  private selectStar(entry: StarEntry, moveCamera: boolean): void {
    this.selectedStarId = entry.id;
    this.galaxy.select(entry.id);
    this.panel.show(starContent(entry, entry.system ? () => this.enterSystem(entry) : undefined));
    this.hud.setActive(entry.id);
    if (moveCamera) {
      this.rig.moveOrigin(entry.position, true);
      this.rig.setDistance(Math.max(2.5, this.rig.distance * 0.55), true);
    }
  }

  private enterGalaxy(selectId?: string): void {
    this.mode = 'galaxy';
    this.hostEntry = null;
    this.viewer.setScene(this.galaxy.scene);
    this.viewer.setBloom(0.75, 0.3);
    this.applyGalaxyCameraLimits();
    this.labels.clear();

    const entry = (selectId && this.galaxy.entry(selectId)) || this.galaxy.entry('sol');
    if (entry) {
      this.rig.moveOrigin(entry.position, false);
      this.rig.setDistance(selectId && selectId !== 'sol' ? 6 : 26, false);
      this.rig.setAngles(0.9, 1.15, false);
      this.selectStar(entry, false);
    }
    this.hud.setHeading('Solar Neighbourhood', `${this.galaxy.entries.length} stars within 27 light years`, false);
    this.refreshNavigator();
  }

  private enterSystem(entry: StarEntry): void {
    if (!entry.system) return;
    this.swapSystem(buildExoSystem(entry.system));
    this.hostEntry = entry;
    this.hud.setHeading(
      entry.name,
      `${entry.distanceLy.toFixed(2)} ly · ${entry.spectral || 'unknown type'} · ${entry.system.planets.length} known planets`,
      true,
    );
  }

  private exitToGalaxy(): void {
    if (this.mode === 'galaxy') return;
    this.enterGalaxy(this.hostEntry?.id ?? 'sol');
  }

  /** Return to the Solar System from anywhere. */
  private enterSolarSystem(): void {
    this.swapSystem(buildSolarSystem());
    this.hostEntry = null;
    this.hud.setHeading('Solar System', 'Sol · G2V · you are here', false);
  }

  private swapSystem(model: SystemModel): void {
    this.system.dispose();
    this.system = new SystemView(model, this.scale);
    this.system.showOrbits = true;
    this.mode = 'system';
    this.viewer.setScene(this.system.scene);
    this.viewer.setBloom(0.62, 0.55);
    this.applySystemCameraLimits();
    this.labels.clear();
    this.system.computePositions(this.jd);

    // Arrive looking at the star from slightly above the orbital plane.
    this.focusId = model.nodes[0].id;
    this.rig.moveOrigin(this.system.view(this.focusId)!.display, false);
    this.rig.setDistance(this.scale.orbitRadius(model.extent) * 2.1, false);
    this.rig.setAngles(0.7, 1.05, false);
    this.select(model.nodes[0].id);
    this.refreshNavigator();

    for (const [key, value] of [
      ['orbits', this.system.showOrbits], ['labels', this.system.showLabels],
      ['belts', this.system.showBelts], ['habitable', this.system.showHabitableZone],
    ] as [ToggleKey, boolean][]) this.hud.setToggle(key, value);
  }

  private refreshNavigator(): void {
    const items: NavigatorItem[] = [];
    if (this.mode === 'system') {
      const model = this.system.model;
      for (const node of model.nodes) {
        const group = node.kind === 'star' ? 'Star'
          : node.kind === 'moon' ? 'Moons'
          : node.kind === 'exoplanet' ? 'Planets'
          : node.kind === 'planet' ? 'Planets' : 'Small bodies';
        items.push({
          id: node.id,
          label: node.name,
          detail: node.kind === 'star' ? '—'
            : node.au < 0.01 ? `${(node.au * 149597870.7).toFixed(0)} km`
            : `${node.au.toFixed(node.au < 10 ? 3 : 1)} au`,
          group,
          color: `#${node.color.toString(16).padStart(6, '0')}`,
          indent: node.kind === 'moon',
        });
      }
      // Sort moons under their planets by keeping catalogue order within groups.
      const order = ['Star', 'Planets', 'Moons', 'Small bodies'];
      items.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    } else {
      for (const entry of this.galaxy.entries) {
        items.push({
          id: entry.id,
          label: entry.name,
          detail: entry.distanceLy === 0 ? 'here' : `${entry.distanceLy.toFixed(2)} ly`,
          group: entry.system ? 'Planetary systems' : 'Stars',
          color: entryColor(entry),
        });
      }
      items.sort((a, b) => (a.group === b.group ? 0 : a.group === 'Planetary systems' ? -1 : 1));
    }
    this.hud.setItems(items);
    this.hud.setActive(this.mode === 'system' ? this.focusId : this.selectedStarId);
  }

  // ---------------------------------------------------------------- input

  private onClick(e: MouseEvent): void {
    if (this.mode === 'system') {
      const node = this.system.pick(e.clientX, e.clientY);
      if (node) this.select(node.id);
    } else {
      const entry = this.galaxy.pick(e.clientX, e.clientY);
      if (entry) this.selectStar(entry, false);
    }
  }

  private onDoubleClick(e: MouseEvent): void {
    if (this.mode === 'system') {
      const node = this.system.pick(e.clientX, e.clientY);
      if (node) { this.focus(node.id, true); this.select(node.id); }
    } else {
      const entry = this.galaxy.pick(e.clientX, e.clientY);
      if (entry?.system) this.enterSystem(entry);
      else if (entry) this.selectStar(entry, true);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.hud.isTyping) {
      if (e.key === 'Escape') (document.activeElement as HTMLElement).blur();
      return;
    }
    switch (e.key) {
      case ' ': e.preventDefault(); this.paused = !this.paused; break;
      case 'ArrowRight': this.rateIndex = Math.min(RATES.length - 1, this.rateIndex + 1); this.hud.setRateIndex(this.rateIndex); break;
      case 'ArrowLeft': this.rateIndex = Math.max(0, this.rateIndex - 1); this.hud.setRateIndex(this.rateIndex); break;
      case 'r': case 'R': this.direction *= -1; break;
      case 'n': case 'N': this.jd = nowJD(); break;
      case 'm': case 'M': this.scale.toggle(); this.hud.setToggle('schematic', this.scale.schematic); break;
      case 'o': case 'O': this.system.showOrbits = !this.system.showOrbits; this.hud.setToggle('orbits', this.system.showOrbits); break;
      case 'l': case 'L': this.system.showLabels = !this.system.showLabels; this.hud.setToggle('labels', this.system.showLabels); break;
      case 'b': case 'B': this.system.showBelts = !this.system.showBelts; this.hud.setToggle('belts', this.system.showBelts); break;
      case 'h': case 'H': this.system.showHabitableZone = !this.system.showHabitableZone; this.hud.setToggle('habitable', this.system.showHabitableZone); break;
      case 'g': case 'G': this.galaxy.showGrid = !this.galaxy.showGrid; this.galaxy.showDropLines = this.galaxy.showGrid; this.hud.setToggle('grid', this.galaxy.showGrid); break;
      case 't': case 'T': this.toggleTour(); break;
      case 'Escape': this.stopTour(); this.panel.hide(); break;
      case 'Tab': e.preventDefault(); this.cycleFocus(e.shiftKey ? -1 : 1); break;
      case 'Backspace': this.exitToGalaxy(); break;
      default: return;
    }
  }

  private cycleFocus(step: number): void {
    if (this.mode === 'system') {
      const ids = this.system.views.map((v) => v.node.id);
      const index = Math.max(0, ids.indexOf(this.focusId ?? ids[0]));
      const next = ids[(index + step + ids.length) % ids.length];
      this.focus(next, true);
      this.select(next);
    } else {
      const ids = this.galaxy.entries.map((e) => e.id);
      const index = Math.max(0, ids.indexOf(this.selectedStarId ?? ids[0]));
      const entry = this.galaxy.entry(ids[(index + step + ids.length) % ids.length]);
      if (entry) this.selectStar(entry, true);
    }
  }

  // ---------------------------------------------------------------- tour

  private toggleTour(): void {
    if (this.tourIndex >= 0) this.stopTour();
    else { this.tourIndex = 0; this.tourTimer = 0; this.runTourStop(TOUR[0]); }
  }

  private stopTour(): void {
    if (this.tourIndex < 0) return;
    this.tourIndex = -1;
    document.body.classList.remove('touring');
    this.caption.classList.remove('is-visible');
  }

  private runTourStop(stop: TourStop): void {
    document.body.classList.add('touring');
    this.caption.textContent = stop.caption;
    this.caption.classList.add('is-visible');
    if (stop.system === 'sol' && (this.mode !== 'system' || this.system.model.id !== 'sol')) {
      this.enterSolarSystem();
    } else if (stop.system === 'galaxy' && this.mode !== 'galaxy') {
      this.enterGalaxy(stop.star ?? 'sol');
    } else if (stop.system === 'exo' && stop.star) {
      const entry = this.galaxy.entry(stop.star);
      if (entry?.system && this.system.model.name !== entry.name) this.enterSystem(entry);
    }

    if (stop.rateIndex != null) { this.rateIndex = stop.rateIndex; this.hud.setRateIndex(stop.rateIndex); }
    if (stop.schematic != null) { this.scale.setMode(stop.schematic); this.hud.setToggle('schematic', stop.schematic); }
    if (stop.habitable != null) { this.system.showHabitableZone = stop.habitable; this.hud.setToggle('habitable', stop.habitable); }

    if (this.mode === 'system' && stop.node) {
      this.focus(stop.node, true);
      this.select(stop.node);
      if (stop.distanceScale != null) {
        this.rig.setDistance(this.system.framingDistance(stop.node) * stop.distanceScale, true);
      }
    } else if (this.mode === 'galaxy' && stop.star) {
      const entry = this.galaxy.entry(stop.star);
      if (entry) {
        this.selectStar(entry, true);
        if (stop.distanceScale != null) this.rig.setDistance(stop.distanceScale, true);
      }
    }
  }

  private updateTour(dt: number): void {
    if (this.tourIndex < 0) return;
    this.tourTimer += dt;
    if (this.tourTimer < TOUR[this.tourIndex].seconds) return;
    this.tourTimer = 0;
    this.tourIndex++;
    if (this.tourIndex >= TOUR.length) { this.stopTour(); this.enterSolarSystem(); return; }
    this.runTourStop(TOUR[this.tourIndex]);
  }

  // ---------------------------------------------------------------- frame

  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const dt = this.viewer.tick();
    this.elapsed += dt;

    if (!this.paused) this.jd += this.rate * dt;
    this.scale.update(dt);
    this.updateTour(dt);

    if (this.mode === 'system') {
      this.system.computePositions(this.jd);
      const focus = this.focusId ? this.system.view(this.focusId) : undefined;
      if (focus) this.rig.updateOriginTarget(focus.display);
      this.applySystemCameraLimits();
      this.rig.update(dt);
      this.system.update(this.jd, this.rig, this.viewer.camera, this.elapsed);
      this.renderSystemLabels();
    } else {
      this.rig.update(dt);
      this.galaxy.update(this.rig, this.viewer.camera, this.elapsed);
      this.renderGalaxyLabels();
    }

    this.hud.setTime(this.jd, this.rate, this.paused);
    this.hud.setStats(`${(1000 / Math.max(this.viewer.frameTime, 1)).toFixed(0)} fps`);
    this.viewer.render();
  };

  private renderSystemLabels(): void {
    if (!this.system.showLabels) { this.labels.render([]); return; }
    const requests: LabelRequest[] = this.system.placements().map((p) => {
      const isMoon = p.node.kind === 'moon';
      const isMinor = p.node.kind === 'asteroid' || p.node.kind === 'comet';
      // Keep the clutter down: minor bodies only earn a label up close.
      const cutoff = isMoon ? 1.4 : isMinor ? 1.0 : 0;
      return {
        id: p.node.id,
        text: p.node.name,
        x: p.x,
        y: p.y,
        radius: p.radius,
        priority: (p.node.kind === 'star' ? 100 : p.node.kind === 'planet' ? 80 : isMoon ? 30 : 45)
          - Math.log10(Math.max(p.distance, 1e-9)),
        visible: p.visible && p.radius >= cutoff,
        selected: p.node.id === this.selectedId,
        color: `#${p.node.color.toString(16).padStart(6, '0')}`,
        muted: isMoon || isMinor,
      };
    });
    this.labels.render(requests);
  }

  private renderGalaxyLabels(): void {
    const requests: LabelRequest[] = this.galaxy.entries.map((entry) => ({
      id: entry.id,
      text: entry.name,
      detail: entry.system ? `${entry.distanceLy.toFixed(1)} ly · ${entry.system.planets.length} planets` : `${entry.distanceLy.toFixed(1)} ly`,
      x: entry.screen.x,
      y: entry.screen.y,
      radius: 8,
      // Nearby stars and planet hosts get first claim on the screen.
      priority: (entry.system ? 60 : 20) + entry.weight * 20 - entry.distanceLy * 0.7,
      visible: entry.screen.visible,
      selected: entry.id === this.selectedStarId,
      color: entryColor(entry),
      muted: !entry.system,
    }));
    this.labels.render(requests);
  }
}

const canvas = document.getElementById('view') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLElement;
new App(canvas, overlay);
