/**
 * The heads-up interface: time controls, view toggles, and the navigator.
 */
import { formatJD, formatRate, nowJD } from '../astro/time';

/** Simulation rates in days per real second, slowest first. */
export const RATES = [
  1 / 86400, 1 / 8640, 1 / 1440, 1 / 240, 1 / 24, 1 / 6, 1, 3, 10, 30, 100, 365.25, 3652.5, 36525,
];
/** Index into RATES used on load: one day per second. */
export const DEFAULT_RATE = 6;

export interface NavigatorItem {
  id: string;
  label: string;
  detail: string;
  /** Grouping header this item belongs under. */
  group: string;
  color?: string;
  indent?: boolean;
}

export interface HudCallbacks {
  onPlayToggle(): void;
  onRateChange(index: number): void;
  onReverse(): void;
  onNow(): void;
  onScrub(jd: number): void;
  onToggle(key: ToggleKey, value: boolean): void;
  onNavigate(id: string): void;
  onBack(): void;
  onTour(): void;
}

export type ToggleKey = 'orbits' | 'labels' | 'belts' | 'habitable' | 'schematic' | 'grid';

const TOGGLES: { key: ToggleKey; label: string; hint: string; initial: boolean }[] = [
  { key: 'schematic', label: 'Schematic scale', hint: 'M', initial: true },
  { key: 'orbits', label: 'Orbit paths', hint: 'O', initial: true },
  { key: 'labels', label: 'Labels', hint: 'L', initial: true },
  { key: 'belts', label: 'Asteroid & Kuiper belts', hint: 'B', initial: true },
  { key: 'habitable', label: 'Habitable zone', hint: 'H', initial: false },
  { key: 'grid', label: 'Star map grid', hint: 'G', initial: true },
];

export class Hud {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly dateLabel: HTMLElement;
  private readonly rateLabel: HTMLElement;
  private readonly playButton: HTMLElement;
  private readonly reverseButton: HTMLElement;
  private readonly rateSlider: HTMLInputElement;
  private readonly scrubber: HTMLInputElement;
  private readonly navigator: HTMLElement;
  private readonly navSearch: HTMLInputElement;
  private readonly backButton: HTMLElement;
  private readonly toggleInputs = new Map<ToggleKey, HTMLInputElement>();
  private readonly stats: HTMLElement;
  private items: NavigatorItem[] = [];
  private activeId: string | null = null;
  /** Julian date the scrubber is centred on. */
  private scrubAnchor = nowJD();

  constructor(parent: HTMLElement, private readonly callbacks: HudCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = TEMPLATE;
    parent.appendChild(this.root);

    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.title = q('.hud-title');
    this.subtitle = q('.hud-subtitle');
    this.dateLabel = q('.time-date');
    this.rateLabel = q('.time-rate');
    this.playButton = q('.time-play');
    this.reverseButton = q('.time-reverse');
    this.rateSlider = q<HTMLInputElement>('.time-slider');
    this.scrubber = q<HTMLInputElement>('.time-scrub');
    this.navigator = q('.nav-list');
    this.navSearch = q<HTMLInputElement>('.nav-search');
    this.backButton = q('.hud-back');
    this.stats = q('.hud-stats');

    this.playButton.addEventListener('click', () => callbacks.onPlayToggle());
    this.reverseButton.addEventListener('click', () => callbacks.onReverse());
    q('.time-now').addEventListener('click', () => callbacks.onNow());
    q('.hud-tour').addEventListener('click', () => callbacks.onTour());
    this.backButton.addEventListener('click', () => callbacks.onBack());

    this.rateSlider.max = String(RATES.length - 1);
    this.rateSlider.value = String(DEFAULT_RATE);
    this.rateSlider.addEventListener('input', () => callbacks.onRateChange(Number(this.rateSlider.value)));

    // The scrubber is relative: it offsets from wherever time was when grabbed,
    // then re-centres on release, so it works at any epoch.
    this.scrubber.addEventListener('pointerdown', () => { this.scrubbing = true; });
    this.scrubber.addEventListener('input', () => {
      const offset = Number(this.scrubber.value);
      callbacks.onScrub(this.scrubAnchor + Math.sign(offset) * Math.pow(Math.abs(offset), 3) * 4e-6);
    });
    const release = () => {
      if (!this.scrubbing) return;
      this.scrubbing = false;
      this.scrubber.value = '0';
    };
    this.scrubber.addEventListener('pointerup', release);
    this.scrubber.addEventListener('pointercancel', release);

    const toggleHost = q('.hud-toggles');
    for (const toggle of TOGGLES) {
      const row = document.createElement('label');
      row.className = 'toggle';
      row.innerHTML = `
        <input type="checkbox" ${toggle.initial ? 'checked' : ''}>
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
        <span class="toggle-label">${toggle.label}</span>
        <kbd>${toggle.hint}</kbd>`;
      const input = row.querySelector('input') as HTMLInputElement;
      input.addEventListener('change', () => callbacks.onToggle(toggle.key, input.checked));
      this.toggleInputs.set(toggle.key, input);
      toggleHost.appendChild(row);
    }

    this.navSearch.addEventListener('input', () => this.renderNavigator());
    q('.hud-settings-button').addEventListener('click', () => this.root.classList.toggle('settings-open'));
  }

  private scrubbing = false;

  setHeading(title: string, subtitle: string, showBack: boolean): void {
    this.title.textContent = title;
    this.subtitle.textContent = subtitle;
    this.backButton.classList.toggle('is-visible', showBack);
  }

  setTime(jd: number, rateDaysPerSecond: number, paused: boolean): void {
    this.dateLabel.textContent = formatJD(jd);
    this.rateLabel.textContent = paused ? 'paused' : formatRate(rateDaysPerSecond);
    this.playButton.classList.toggle('is-paused', paused);
    this.playButton.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    this.reverseButton.classList.toggle('is-active', rateDaysPerSecond < 0);
    if (!this.scrubbing) this.scrubAnchor = jd;
  }

  setRateIndex(index: number): void { this.rateSlider.value = String(index); }

  setToggle(key: ToggleKey, value: boolean): void {
    const input = this.toggleInputs.get(key);
    if (input) input.checked = value;
  }

  setStats(text: string): void { this.stats.textContent = text; }

  setItems(items: NavigatorItem[]): void {
    this.items = items;
    this.renderNavigator();
  }

  setActive(id: string | null): void {
    this.activeId = id;
    for (const element of this.navigator.querySelectorAll('.nav-item')) {
      element.classList.toggle('is-active', (element as HTMLElement).dataset.id === id);
    }
  }

  private renderNavigator(): void {
    const query = this.navSearch.value.trim().toLowerCase();
    const matches = query
      ? this.items.filter((i) => i.label.toLowerCase().includes(query) || i.detail.toLowerCase().includes(query))
      : this.items;

    let html = '';
    let group = '';
    for (const item of matches) {
      if (item.group !== group) {
        group = item.group;
        html += `<div class="nav-group">${group}</div>`;
      }
      html += `
        <button class="nav-item${item.indent ? ' is-indented' : ''}${item.id === this.activeId ? ' is-active' : ''}" data-id="${item.id}">
          <span class="nav-dot" style="background:${item.color ?? '#6f9fd8'}"></span>
          <span class="nav-name">${item.label}</span>
          <span class="nav-detail">${item.detail}</span>
        </button>`;
    }
    this.navigator.innerHTML = html || '<div class="nav-empty">Nothing matches that.</div>';

    for (const element of this.navigator.querySelectorAll('.nav-item')) {
      element.addEventListener('click', () => {
        this.callbacks.onNavigate((element as HTMLElement).dataset.id as string);
      });
    }
  }

  /** True while the user is typing, so keyboard shortcuts should stand down. */
  get isTyping(): boolean { return document.activeElement === this.navSearch; }
}

const TEMPLATE = /* html */ `
  <header class="hud-header">
    <button class="hud-back" title="Back to the solar neighbourhood">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>Neighbourhood</span>
    </button>
    <div class="hud-heading">
      <h1 class="hud-title">Solar System</h1>
      <div class="hud-subtitle"></div>
    </div>
    <div class="hud-header-actions">
      <button class="hud-tour" title="Take the guided tour (T)">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 3l14 9-14 9V3z" stroke-linejoin="round"/>
        </svg>
        <span>Tour</span>
      </button>
      <button class="hud-settings-button" title="View options">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </header>

  <section class="panel hud-settings">
    <div class="panel-heading">View</div>
    <div class="hud-toggles"></div>
    <div class="hud-stats"></div>
  </section>

  <section class="panel hud-navigator">
    <div class="panel-heading">Navigate</div>
    <input class="nav-search" type="search" placeholder="Search worlds and stars…" spellcheck="false">
    <div class="nav-list"></div>
  </section>

  <section class="panel hud-time">
    <div class="time-readout">
      <div class="time-date">—</div>
      <div class="time-rate">—</div>
    </div>
    <div class="time-buttons">
      <button class="time-reverse" title="Reverse time (R)">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M11 5v14L2 12zM21 5v14l-9-7z"/></svg>
      </button>
      <button class="time-play" title="Play / pause (Space)">
        <svg class="icon-play" viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M6 3.5l14 8.5-14 8.5z"/></svg>
        <svg class="icon-pause" viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
      </button>
      <button class="time-now" title="Jump to now (N)">Now</button>
    </div>
    <div class="time-sliders">
      <label class="time-field">
        <span>Rate</span>
        <input class="time-slider" type="range" min="0" max="13" step="1" value="6">
      </label>
      <label class="time-field">
        <span>Scrub</span>
        <input class="time-scrub" type="range" min="-100" max="100" step="1" value="0">
      </label>
    </div>
  </section>
`;
