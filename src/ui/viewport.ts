// Keeps the app locked to the screen like a native one: no pinch zoom, and sheets that stay
// above the on-screen keyboard. Page scrolling itself is switched off in styles.css.

/** Anything smaller than this is a browser toolbar moving, not the keyboard. */
const KEYBOARD_MIN_PX = 80;

export function lockViewport(): void {
  // Safari ignores `user-scalable=no` in a normal tab. Its own gesture events are the hook that
  // works there; `touch-action: none` in the stylesheet covers every other browser.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }

  // Ctrl/Cmd + wheel is how trackpads and desktop browsers zoom.
  document.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    },
    { passive: false },
  );

  // Because the page cannot scroll, a sheet with a text field has to be lifted clear of the
  // keyboard by hand. The visual viewport is the part of the page the keyboard leaves visible.
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement;
  const update = () => {
    const covered = window.innerHeight - viewport.height - viewport.offsetTop;
    if (viewport.height < window.innerHeight - KEYBOARD_MIN_PX) {
      root.style.setProperty('--viewport-height', `${Math.round(viewport.height)}px`);
      root.style.setProperty('--keyboard-inset', `${Math.max(0, Math.round(covered))}px`);
    } else {
      root.style.removeProperty('--viewport-height');
      root.style.removeProperty('--keyboard-inset');
    }
  };
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
}
