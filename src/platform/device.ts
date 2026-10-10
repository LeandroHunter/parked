// Small best-effort device niceties. None of these are relied on: every call may silently do nothing.

let hapticSwitch: HTMLLabelElement | null = null;

/**
 * A light tap of feedback.
 *
 * Web pages on iPhone have no vibration API. The only hook is that toggling a native switch control
 * ticks the Taptic Engine, so we toggle a hidden one. iOS may ignore it when no tap is in progress
 * (for example when a save finishes a few seconds after the tap); that is expected.
 */
export function haptic(kind: 'tap' | 'success' = 'tap'): void {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'success' ? [10, 70, 16] : 8);
      return;
    }
    if (!hapticSwitch) {
      hapticSwitch = document.createElement('label');
      hapticSwitch.setAttribute('aria-hidden', 'true');
      hapticSwitch.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      hapticSwitch.append(input);
      document.body.append(hapticSwitch);
    }
    hapticSwitch.click();
    if (kind === 'success') setTimeout(() => hapticSwitch?.click(), 90);
  } catch {
    // Feedback is a nicety; never let it break a save.
  }
}

/** Keeps the screen on while the guidance screen is showing. Released automatically when the page is hidden. */
export class ScreenWake {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  async acquire(): Promise<void> {
    this.wanted = true;
    if (this.sentinel || document.visibilityState !== 'visible') return;
    try {
      const sentinel = await navigator.wakeLock?.request('screen');
      if (!sentinel) return;
      if (!this.wanted) {
        void sentinel.release();
        return;
      }
      this.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
    } catch {
      // Low Power Mode and older iOS versions refuse; the screen then follows the normal auto-lock.
    }
  }

  release(): void {
    this.wanted = false;
    void this.sentinel?.release().catch(() => {});
    this.sentinel = null;
  }
}

/** True when launched from the Home Screen rather than in a Safari tab. */
export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
