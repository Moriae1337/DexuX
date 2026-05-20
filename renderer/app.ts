namespace DexuXRenderer {
  const APPEARANCE_STORAGE_KEY = 'dexux.appearance-settings';
  const DEFAULT_THEME: ThemeName = 'sunset';

  function clampBackgroundOpacity(value: number): number {
    return Math.max(15, Math.min(100, Math.round(value)));
  }

  function isThemeName(value: unknown): value is ThemeName {
    return typeof value === 'string' && THEME_OPTIONS.some((option) => option.value === value);
  }

  function readAppearanceSettings(): AppearanceSettings {
    try {
      const rawSettings = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);

      if (!rawSettings) {
        return {
          backgroundOpacity: 100,
          theme: DEFAULT_THEME,
        };
      }

      const parsedSettings = JSON.parse(rawSettings) as Partial<AppearanceSettings>;

      return {
        backgroundOpacity: clampBackgroundOpacity(Number(parsedSettings.backgroundOpacity ?? 100)),
        theme: isThemeName(parsedSettings.theme) ? parsedSettings.theme : DEFAULT_THEME,
      };
    } catch {
      return {
        backgroundOpacity: 100,
        theme: DEFAULT_THEME,
      };
    }
  }

  function saveAppearanceSettings(): void {
    const settings: AppearanceSettings = {
      backgroundOpacity: state.backgroundOpacity,
      theme: state.theme,
    };

    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
  }

  function updateOpacityLabel(): void {
    ui.backgroundOpacityValue.textContent = `${state.backgroundOpacity}%`;
  }

  async function applyAppearanceSettings(): Promise<void> {
    const opacityRatio = state.backgroundOpacity / 100;
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.style.setProperty('--bg-accent-alpha', `${(0.08 * opacityRatio).toFixed(3)}`);
    document.documentElement.style.setProperty('--bg-warm-alpha', `${(0.4 * opacityRatio).toFixed(3)}`);
    document.documentElement.style.setProperty('--bg-fill-alpha', `${(1 * opacityRatio).toFixed(3)}`);
    document.documentElement.style.setProperty('--surface-alpha', `${(0.82 * opacityRatio).toFixed(3)}`);
    document.documentElement.style.setProperty('--surface-strong-alpha', `${(0.96 * opacityRatio).toFixed(3)}`);
    document.documentElement.style.setProperty('--surface-soft-alpha', `${(0.86 * opacityRatio).toFixed(3)}`);
    document.documentElement.style.setProperty('--surface-input-alpha', `${(0.94 * opacityRatio).toFixed(3)}`);
    document.documentElement.style.setProperty('--surface-overlay-alpha', `${(0.18 * opacityRatio).toFixed(3)}`);
    document.documentElement.style.setProperty('--surface-dark-alpha', `${(0.75 * opacityRatio).toFixed(3)}`);
    ui.backgroundOpacitySlider.value = String(state.backgroundOpacity);
    ui.themeSelect.value = state.theme;
    updateOpacityLabel();

    try {
      const appliedOpacity = await window.downloaderApi.setWindowOpacity(opacityRatio);
      state.backgroundOpacity = clampBackgroundOpacity(appliedOpacity * 100);
      ui.backgroundOpacitySlider.value = String(state.backgroundOpacity);
      updateOpacityLabel();
    } catch {
      // Keep the CSS preview even if the native window opacity update is unavailable.
    }
  }

  function setAppearanceMenuOpen(nextValue: boolean): void {
    ui.appearanceMenu.classList.toggle('hidden', !nextValue);
    ui.appearanceMenuOverlay.classList.toggle('hidden', !nextValue);
    ui.appearanceMenuButton.setAttribute('aria-expanded', String(nextValue));
  }

  function initializeAppearanceSettings(): void {
    const settings = readAppearanceSettings();
    state.backgroundOpacity = settings.backgroundOpacity;
    state.theme = settings.theme;
    void applyAppearanceSettings();

    ui.backgroundOpacitySlider.addEventListener('input', () => {
      state.backgroundOpacity = clampBackgroundOpacity(Number(ui.backgroundOpacitySlider.value));
      void applyAppearanceSettings();
      saveAppearanceSettings();
    });

    ui.themeSelect.addEventListener('change', () => {
      const nextTheme = ui.themeSelect.value;

      if (!isThemeName(nextTheme)) {
        return;
      }

      state.theme = nextTheme;
      void applyAppearanceSettings();
      saveAppearanceSettings();
    });

    ui.appearanceMenuButton.addEventListener('click', () => {
      const nextValue = ui.appearanceMenu.classList.contains('hidden');
      setAppearanceMenuOpen(nextValue);
    });

    ui.appearanceMenuClose.addEventListener('click', () => {
      setAppearanceMenuOpen(false);
    });

    ui.appearanceMenuOverlay.addEventListener('click', () => {
      setAppearanceMenuOpen(false);
    });

    ui.videoModalClose.addEventListener('click', () => {
      closeVideoPreview();
    });

    ui.videoModalOverlay.addEventListener('click', () => {
      closeVideoPreview();
    });

    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (!ui.videoModal.classList.contains('hidden')) {
        closeVideoPreview();
      }

      if (!ui.appearanceMenu.classList.contains('hidden')) {
        setAppearanceMenuOpen(false);
      }
    });
  }

  export function start(): void {
    window.downloaderApi.onDownloadProgress(handleDownloadProgress);
    initializeAppearanceSettings();

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
