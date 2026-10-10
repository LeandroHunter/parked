import type { LocationSample } from '../core/readings.ts';

export type LocationFailure =
  /** Permission refused, or Location Services switched off (the web cannot tell these apart). */
  | 'denied'
  /** The device could not work out a position. */
  | 'unavailable'
  | 'timeout'
  /** This browser has no geolocation at all. */
  | 'unsupported'
  /** Not served over https, so the browser withholds location. */
  | 'insecure';

export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unknown';

/** Anything that can deliver position fixes: the real browser API, or the debug simulator. */
export interface LocationSource {
  /** Whether the browser will have to ask the user before it shares a position. */
  permission(): Promise<LocationPermission>;
  start(onSample: (sample: LocationSample) => void, onFailure: (failure: LocationFailure) => void): void;
  stop(): void;
}

const RESTART_AFTER_SILENCE_MS = 10_000;
const WATCHDOG_INTERVAL_MS = 5_000;

/**
 * Wraps `navigator.geolocation`. Only ever runs between `start()` and `stop()`: there is no
 * background tracking, and a web page cannot get location while it is closed anyway.
 */
export class BrowserLocation implements LocationSource {
  private watchId: number | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastFixAt = 0;
  private onSample: ((sample: LocationSample) => void) | null = null;
  private onFailure: ((failure: LocationFailure) => void) | null = null;

  async permission(): Promise<LocationPermission> {
    try {
      const status = await navigator.permissions?.query({ name: 'geolocation' });
      return status?.state ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }

  start(onSample: (sample: LocationSample) => void, onFailure: (failure: LocationFailure) => void): void {
    this.stop();
    this.onSample = onSample;
    this.onFailure = onFailure;
    if (!('geolocation' in navigator)) {
      onFailure('unsupported');
      return;
    }
    if (!window.isSecureContext) {
      onFailure('insecure');
      return;
    }
    this.lastFixAt = Date.now();
    this.watch();
    // If fixes dry up (it happens after long pauses), ask again rather than showing an old position.
    this.watchdog = setInterval(() => {
      if (this.watchId !== null && Date.now() - this.lastFixAt > RESTART_AFTER_SILENCE_MS) {
        this.lastFixAt = Date.now();
        this.watch();
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  stop(): void {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchId = null;
    this.watchdog = null;
    this.onSample = null;
    this.onFailure = null;
  }

  private watch(): void {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.lastFixAt = Date.now();
        this.onSample?.({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
          timestampMs: position.timestamp,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          const report = this.onFailure;
          this.stop();
          report?.('denied');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          this.onFailure?.('unavailable');
        } else {
          this.onFailure?.('timeout');
        }
      },
      // maximumAge 0: never accept a cached position. High accuracy: ask for GPS, not just Wi-Fi.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }
}
