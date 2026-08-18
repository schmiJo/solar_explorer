/**
 * Floating labels.
 *
 * Labels are DOM nodes rather than sprites so they stay crisp and selectable.
 * Elements are pooled by id, and overlapping labels are dropped in priority
 * order, which keeps a crowded inner system readable without any flicker.
 */

export interface LabelRequest {
  id: string;
  text: string;
  /** Secondary line, e.g. a distance. */
  detail?: string;
  x: number;
  y: number;
  /** Radius of the thing being labelled, in pixels; the label clears it. */
  radius: number;
  /** Higher wins when two labels collide. */
  priority: number;
  visible: boolean;
  selected?: boolean;
  /** CSS colour for the leading dot. */
  color?: string;
  /** Dim styling for secondary bodies such as moons. */
  muted?: boolean;
}

interface Rect { left: number; top: number; right: number; bottom: number; }

export class LabelLayer {
  private readonly container: HTMLElement;
  private readonly pool = new Map<string, HTMLElement>();
  private readonly placed: Rect[] = [];

  constructor(parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'labels';
    parent.appendChild(this.container);
  }

  render(requests: LabelRequest[]): void {
    this.placed.length = 0;
    const shown = new Set<string>();

    // Highest priority first, so important labels win any overlap.
    const sorted = requests.filter((r) => r.visible).sort((a, b) => b.priority - a.priority);

    for (const request of sorted) {
      const offset = Math.min(request.radius, 90) + 10;
      const left = request.x + offset;
      const top = request.y - 9;
      // Estimated box; measuring every element would force a layout each frame.
      const width = 12 + request.text.length * 7.4;
      const height = request.detail ? 32 : 18;
      const box: Rect = { left, top, right: left + width, bottom: top + height };

      if (left < -60 || top < -40 || box.right > window.innerWidth + 60 || box.bottom > window.innerHeight + 40) continue;
      if (!request.selected && this.placed.some((r) => overlaps(r, box))) continue;
      this.placed.push(box);
      shown.add(request.id);

      let element = this.pool.get(request.id);
      if (!element) {
        element = document.createElement('div');
        element.className = 'label';
        element.innerHTML = '<span class="label-dot"></span><span class="label-text"></span><span class="label-detail"></span>';
        this.container.appendChild(element);
        this.pool.set(request.id, element);
      }

      const text = element.querySelector('.label-text') as HTMLElement;
      const detail = element.querySelector('.label-detail') as HTMLElement;
      const dot = element.querySelector('.label-dot') as HTMLElement;
      if (text.textContent !== request.text) text.textContent = request.text;
      const detailText = request.detail ?? '';
      if (detail.textContent !== detailText) detail.textContent = detailText;
      dot.style.background = request.color ?? '#8fb8e8';

      element.classList.toggle('is-selected', !!request.selected);
      element.classList.toggle('is-muted', !!request.muted);
      element.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      element.style.opacity = '1';
      element.dataset.id = request.id;
    }

    for (const [id, element] of this.pool) {
      if (!shown.has(id)) element.style.opacity = '0';
    }
  }

  /** The label under a screen position, if any — labels are click targets too. */
  hitTest(target: EventTarget | null): string | null {
    const element = (target as HTMLElement | null)?.closest?.('.label') as HTMLElement | null;
    return element?.dataset.id ?? null;
  }

  clear(): void {
    for (const element of this.pool.values()) element.remove();
    this.pool.clear();
  }
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
