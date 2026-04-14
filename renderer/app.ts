namespace DexuXRenderer {
  export function start(): void {
    window.downloaderApi.onDownloadProgress(handleDownloadProgress);

    ui.searchButton.addEventListener('click', () => {
      void handleSearch();
    });

    ui.queryInput.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !state.isBusy) {
        void handleSearch();
      }
    });

    renderFeed();
  }
}

DexuXRenderer.start();
