export class VirtualList {
  constructor(scrollEl, { itemHeight = 68, overscan = 6, renderItem, emptyText = 'Nenhum item encontrado.' }) {
    this.scrollEl = scrollEl;
    this.itemHeight = itemHeight;
    this.overscan = overscan;
    this.renderItem = renderItem;
    this.emptyText = emptyText;
    this.items = [];
    this.lastRangeKey = '';
    this.rafId = null;

    this.spacer = document.createElement('div');
    this.spacer.className = 'vlist-spacer';
    this.spacer.style.position = 'relative';
    this.spacer.style.width = '100%';

    this.windowEl = document.createElement('div');
    this.windowEl.className = 'vlist-window';
    this.windowEl.style.position = 'absolute';
    this.windowEl.style.top = '0';
    this.windowEl.style.left = '0';
    this.windowEl.style.right = '0';
    this.windowEl.style.willChange = 'transform';

    this.spacer.appendChild(this.windowEl);
    this.scrollEl.innerHTML = '';
    this.scrollEl.appendChild(this.spacer);

    this.onScroll = this.onScroll.bind(this);
    this.scrollEl.addEventListener('scroll', this.onScroll, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.render(true));
      this.resizeObs.observe(this.scrollEl);
    }
  }

  setItems(items, { resetScroll = false } = {}) {
    this.items = Array.isArray(items) ? items : [];
    if (resetScroll) this.scrollEl.scrollTop = 0;
    this.spacer.style.height = `${Math.max(this.items.length * this.itemHeight, 1)}px`;
    this.lastRangeKey = '';
    this.render(true);
  }

  refreshVisible() {
    this.lastRangeKey = '';
    this.render(true);
  }

  onScroll() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render(false);
    });
  }

  render(force) {
    if (this.items.length === 0) {
      if (this.lastRangeKey !== 'empty' || force) {
        this.lastRangeKey = 'empty';
        this.spacer.style.height = 'auto';
        this.windowEl.style.transform = 'translate3d(0, 0, 0)';
        this.windowEl.innerHTML = `<p class="empty-state">${this.emptyText}</p>`;
      }
      return;
    }

    const viewHeight = this.scrollEl.clientHeight || 600;
    const scrollTop = this.scrollEl.scrollTop || 0;
    const start = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.overscan);
    const visibleCount = Math.ceil(viewHeight / this.itemHeight);
    const end = Math.min(this.items.length, start + visibleCount + this.overscan * 2);

    const rangeKey = `${start}:${end}:${this.items.length}`;
    if (!force && rangeKey === this.lastRangeKey) return;
    this.lastRangeKey = rangeKey;

    this.windowEl.style.transform = `translate3d(0, ${start * this.itemHeight}px, 0)`;

    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const node = this.renderItem(this.items[i], i);
      node.style.height = `${this.itemHeight}px`;
      frag.appendChild(node);
    }
    this.windowEl.innerHTML = '';
    this.windowEl.appendChild(frag);
  }

  destroy() {
    this.scrollEl.removeEventListener('scroll', this.onScroll);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.resizeObs) this.resizeObs.disconnect();
  }
}
