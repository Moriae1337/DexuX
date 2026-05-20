import { layoutWithLines, prepareWithSegments } from './vendor/pretext/layout.js';

const title = document.getElementById('hero-title');

if (title instanceof HTMLHeadingElement) {
  const sourceText = title.textContent?.trim() ?? '';
  const layoutHost = title.closest('.hero-copy-block');
  let currentPrepared = null;
  let currentFont = '';
  let pointerFrame = 0;
  let pointerX = null;
  let pointerY = null;
  const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const getFontShorthand = () => {
    const computed = window.getComputedStyle(title);
    return `${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
  };

  const ensurePreparedText = () => {
    const nextFont = getFontShorthand();

    if (currentPrepared && nextFont === currentFont) {
      return currentPrepared;
    }

    currentFont = nextFont;
    currentPrepared = prepareWithSegments(sourceText, currentFont, { whiteSpace: 'normal' });
    return currentPrepared;
  };

  const renderTitle = () => {
    const prepared = ensurePreparedText();
    const availableWidth = layoutHost instanceof HTMLElement ? layoutHost.clientWidth : title.clientWidth;
    const fontSize = Number.parseFloat(window.getComputedStyle(title).fontSize) || 48;
    const layoutWidth = Math.max(fontSize * 5.4, Math.min(availableWidth, fontSize * 14.2));
    const lineHeight = fontSize * 0.98;
    const layout = layoutWithLines(prepared, layoutWidth, lineHeight);

    title.style.setProperty('--hero-title-width', `${layoutWidth}px`);
    title.replaceChildren(
      ...layout.lines.map((line) => {
        const row = document.createElement('span');
        row.className = 'hero-title-line';

        for (const segment of graphemeSegmenter.segment(line.text)) {
          if (/^\s+$/.test(segment.segment)) {
            row.append(document.createTextNode(segment.segment));
            continue;
          }

          const letter = document.createElement('span');
          letter.className = 'hero-title-letter';
          letter.textContent = segment.segment;
          row.append(letter);
        }

        return row;
      }),
    );

    updateLetterOffsets();
  };

  const updateLetterOffsets = () => {
    const letters = title.querySelectorAll('.hero-title-letter');

    for (const letter of letters) {
      if (!(letter instanceof HTMLElement)) {
        continue;
      }

      if (pointerX == null || pointerY == null) {
        letter.style.setProperty('--letter-offset-x', '0px');
        letter.style.setProperty('--letter-offset-y', '0px');
        continue;
      }

      const bounds = letter.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const deltaX = pointerX - centerX;
      const deltaY = pointerY - centerY;
      const distance = Math.hypot(deltaX, deltaY);
      const radius = 110;
      const influence = clamp(1 - distance / radius, 0, 1);
      const offsetX = clamp((-deltaX / 18) * influence, -4, 4);
      const offsetY = clamp((-deltaY / 20) * influence, -4, 4);

      letter.style.setProperty('--letter-offset-x', `${offsetX.toFixed(2)}px`);
      letter.style.setProperty('--letter-offset-y', `${offsetY.toFixed(2)}px`);
    }
  };

  const renderPointerEffect = () => {
    pointerFrame = 0;
    updateLetterOffsets();
  };

  const queuePointerEffect = () => {
    if (pointerFrame !== 0) {
      return;
    }

    pointerFrame = window.requestAnimationFrame(renderPointerEffect);
  };

  title.setAttribute('aria-label', sourceText);
  title.textContent = '';
  renderTitle();

  if (layoutHost instanceof HTMLElement) {
    layoutHost.addEventListener('mousemove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      queuePointerEffect();
    });

    layoutHost.addEventListener('mouseleave', () => {
      pointerX = null;
      pointerY = null;
      queuePointerEffect();
    });
  }

  const observer = new ResizeObserver(() => {
    currentPrepared = null;
    renderTitle();
  });

  if (layoutHost instanceof HTMLElement) {
    observer.observe(layoutHost);
  } else {
    observer.observe(title);
  }

  window.addEventListener('resize', () => {
    currentPrepared = null;
    renderTitle();
  });

  void document.fonts?.ready.then(() => {
    currentPrepared = null;
    renderTitle();
  });
}
