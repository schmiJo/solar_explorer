/**
 * The detail panel: what you are looking at, and what is known about it.
 */
import type { InfoFact, SystemNode } from '../scene/systemModel';
import type { StarEntry } from '../scene/galaxyView';
import { entryColor } from '../scene/galaxyView';

export interface PanelContent {
  eyebrow: string;
  title: string;
  subtitle?: string;
  blurb: string;
  facts: InfoFact[];
  accent?: string;
  /** Rendered as a button at the foot of the panel. */
  action?: { label: string; onClick: () => void };
  /** A short caveat rendered in italics under the blurb. */
  note?: string;
}

export class InfoPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private currentAction?: () => void;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('aside');
    this.root.className = 'panel info-panel';
    this.root.innerHTML = `
      <button class="panel-close" title="Close (Esc)">×</button>
      <div class="info-body"></div>`;
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.info-body') as HTMLElement;
    (this.root.querySelector('.panel-close') as HTMLElement).addEventListener('click', () => this.hide());
    this.hide();
  }

  show(content: PanelContent): void {
    const accent = content.accent ?? '#7fc4ff';
    this.body.innerHTML = `
      <div class="info-eyebrow" style="color:${accent}">${escape(content.eyebrow)}</div>
      <h2 class="info-title">${escape(content.title)}</h2>
      ${content.subtitle ? `<div class="info-subtitle">${escape(content.subtitle)}</div>` : ''}
      <p class="info-blurb">${escape(content.blurb)}</p>
      ${content.note ? `<p class="info-note">${escape(content.note)}</p>` : ''}
      <dl class="info-facts">
        ${content.facts.map((f) => `
          <div class="info-fact">
            <dt>${escape(f.label)}</dt>
            <dd>${escape(f.value)}</dd>
          </div>`).join('')}
      </dl>
      ${content.action ? `<button class="info-action" style="--accent:${accent}">${escape(content.action.label)}</button>` : ''}`;

    this.currentAction = content.action?.onClick;
    const button = this.body.querySelector('.info-action') as HTMLElement | null;
    button?.addEventListener('click', () => this.currentAction?.());

    this.root.classList.add('is-open');
    this.body.scrollTop = 0;
  }

  hide(): void { this.root.classList.remove('is-open'); }
  get isOpen(): boolean { return this.root.classList.contains('is-open'); }
}

const KIND_LABEL: Record<string, string> = {
  star: 'Star', planet: 'Planet', dwarf: 'Dwarf planet', asteroid: 'Asteroid',
  comet: 'Comet', moon: 'Natural satellite', exoplanet: 'Exoplanet',
};

export function nodeContent(node: SystemNode, systemName: string): PanelContent {
  return {
    eyebrow: `${KIND_LABEL[node.kind] ?? node.kind} · ${systemName}`,
    title: node.name,
    blurb: node.blurb,
    facts: node.facts,
    accent: `#${node.color.toString(16).padStart(6, '0')}`,
    note: node.estimated
      ? 'Appearance is an illustration of the measured bulk properties. No image of this world exists.'
      : node.kind === 'exoplanet'
        ? 'Appearance is inferred from radius, mass and irradiation. No image of this world exists.'
        : undefined,
  };
}

export function starContent(entry: StarEntry, onEnter?: () => void): PanelContent {
  const planets = entry.system?.planets ?? [];
  const facts: InfoFact[] = [
    { label: 'Distance', value: entry.distanceLy === 0 ? 'You are here' : `${entry.distanceLy.toFixed(2)} light years` },
    { label: 'Spectral type', value: entry.spectral || '—' },
    { label: 'Temperature', value: `${Math.round(entry.temp).toLocaleString()} K` },
    { label: 'Apparent magnitude', value: entry.vmag != null ? entry.vmag.toFixed(2) : '—' },
    { label: 'Known planets', value: planets.length ? `${planets.length}` : 'None catalogued' },
  ];
  if (entry.system) {
    facts.push(
      { label: 'Stellar mass', value: entry.system.mass != null ? `${entry.system.mass.toFixed(3)} M☉` : '—' },
      { label: 'Luminosity', value: entry.system.lum != null ? `${entry.system.lum < 0.01 ? entry.system.lum.toExponential(2) : entry.system.lum.toFixed(3)} L☉` : '—' },
    );
  }
  if (entry.distanceLy > 0) {
    facts.push({ label: 'Travel time at 1% c', value: `${(entry.distanceLy * 100).toFixed(0)} years` });
  }

  return {
    eyebrow: entry.kind === 'BD*' ? 'Brown dwarf' : entry.kind === 'WD*' ? 'White dwarf' : 'Star',
    title: entry.name,
    subtitle: planets.length
      ? `${planets.length} known planet${planets.length === 1 ? '' : 's'}`
      : undefined,
    blurb: describeStar(entry),
    facts,
    accent: entryColor(entry),
    action: onEnter && planets.length ? { label: `Enter the ${entry.name} system`, onClick: onEnter } : undefined,
  };
}

function describeStar(entry: StarEntry): string {
  if (entry.distanceLy === 0) {
    return 'Our own star, at the origin of this map. Every distance shown here is measured from this point.';
  }
  const cls = entry.spectral.charAt(0).toUpperCase();
  const kind = entry.kind === 'BD*'
    ? 'A brown dwarf — too small to sustain hydrogen fusion, and radiating only the heat of its own contraction.'
    : entry.kind === 'WD*'
      ? 'A white dwarf: the exposed, cooling core of a star that exhausted its fuel and shed its outer layers.'
      : cls === 'M'
        ? 'A red dwarf. They are the most common stars in the galaxy and the faintest — not one is visible to the naked eye.'
        : cls === 'K' ? 'An orange dwarf, cooler and longer-lived than the Sun.'
        : cls === 'G' ? 'A star much like the Sun.'
        : cls === 'F' ? 'Hotter and more luminous than the Sun.'
        : cls === 'A' ? 'A hot white star, burning through its fuel far faster than the Sun.'
        : 'A star in the solar neighbourhood.';
  const light = `Light leaving it now reaches Earth in ${entry.distanceLy.toFixed(1)} years.`;
  const planets = entry.system?.planets.length
    ? ` ${entry.system.planets.length} planet${entry.system.planets.length === 1 ? ' has' : 's have'} been found here.`
    : '';
  return `${kind} ${light}${planets}`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
