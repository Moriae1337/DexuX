namespace DexuXRenderer {
  function getElementByIdOrThrow<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);

    if (!element) {
      throw new Error(`Missing required element: ${id}`);
    }

    return element as T;
  }

  export const ui = {
    queryInput: getElementByIdOrThrow<HTMLInputElement>('video-query'),
    searchButton: getElementByIdOrThrow<HTMLButtonElement>('search-button'),
    appearanceMenuButton: getElementByIdOrThrow<HTMLButtonElement>('appearance-menu-button'),
    appearanceMenu: getElementByIdOrThrow<HTMLElement>('appearance-menu'),
    appearanceMenuOverlay: getElementByIdOrThrow<HTMLElement>('appearance-menu-overlay'),
    appearanceMenuClose: getElementByIdOrThrow<HTMLButtonElement>('appearance-menu-close'),
    videoModal: getElementByIdOrThrow<HTMLElement>('video-modal'),
    videoModalOverlay: getElementByIdOrThrow<HTMLElement>('video-modal-overlay'),
    videoModalClose: getElementByIdOrThrow<HTMLButtonElement>('video-modal-close'),
    videoModalFrame: getElementByIdOrThrow<HTMLIFrameElement>('video-modal-frame'),
    backgroundOpacitySlider: getElementByIdOrThrow<HTMLInputElement>('background-opacity-slider'),
    backgroundOpacityValue: getElementByIdOrThrow<HTMLSpanElement>('background-opacity-value'),
    themeSelect: getElementByIdOrThrow<HTMLSelectElement>('theme-select'),
    statusText: getElementByIdOrThrow<HTMLParagraphElement>('status-text'),
    progressBar: getElementByIdOrThrow<HTMLDivElement>('progress-bar'),
    feedPanel: getElementByIdOrThrow<HTMLElement>('feed-panel'),
    feedTitle: getElementByIdOrThrow<HTMLHeadingElement>('feed-title'),
    queuePanel: getElementByIdOrThrow<HTMLElement>('queue-panel'),
    queueSummary: getElementByIdOrThrow<HTMLParagraphElement>('queue-summary'),
    queueActions: getElementByIdOrThrow<HTMLDivElement>('queue-actions'),
    queueItems: getElementByIdOrThrow<HTMLDivElement>('queue-items'),
    searchResults: getElementByIdOrThrow<HTMLDivElement>('search-results'),
    searchSummary: getElementByIdOrThrow<HTMLParagraphElement>('search-summary'),
  };

  export function restartAnimation(element: HTMLElement, className: string): void {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  export function setStatus(message: string, percent: number | null = null): void {
    ui.statusText.textContent = message;
    ui.progressBar.style.width = `${percent ?? 0}%`;
    restartAnimation(ui.statusText, 'is-updating');
  }

  export function setBusy(nextValue: boolean): void {
    state.isBusy = nextValue;
    ui.searchButton.disabled = nextValue;
    ui.searchButton.textContent = nextValue ? 'Working...' : 'Search';
    renderFeed();
  }
}
