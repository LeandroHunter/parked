import { normalizeDegrees } from '../core/geo.ts';
import type { CompassAvailability } from '../core/guidance.ts';
import type { HeadingSample } from '../core/readings.ts';

/** Anything that can deliver compass headings: the real sensor, or the debug simulator. */
export interface CompassSource {
  /** What we currently know about access to the compass. */
  availability(): CompassAvailability;
  /** Must be called directly from a tap: iOS only shows its permission prompt inside a user gesture. */
  requestAccess(): Promise<CompassAvailability>;
  start(onSample: (sample: HeadingSample) => void): void;
  stop(): void;
}

type SafariOrientationEvent = DeviceOrientationEvent & {
  /** Heading of the top of the device, clockwise from MAGNETIC north (WebKit reads CLHeading.magneticHeading). */
  webkitCompassHeading?: number;
  /** Error in degrees; -1 when the heading is not valid. */
  webkitCompassAccuracy?: number;
};

type PermissionedOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** If no reading at all shows up in this time, the device has no compass we can use. */
const NO_SENSOR_AFTER_MS = 3_000;

/** Current rotation of the page relative to the device's portrait orientation, in degrees. */
export function currentScreenAngle(): number {
  const modern = screen.orientation?.angle;
  if (typeof modern === 'number') return modern;
  const legacy = (window as { orientation?: number | string }).orientation;
  return typeof legacy === 'number' ? normalizeDegrees(legacy) : 0;
}

export class BrowserCompass implements CompassSource {
  private state: CompassAvailability;
  private onSample: ((sample: HeadingSample) => void) | null = null;
  private sawReading = false;
  private noSensorTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof DeviceOrientationEvent === 'undefined') this.state = 'unsupported';
    else if (this.needsGesture()) this.state = 'permission-needed';
    else this.state = 'ok';
  }

  private needsGesture(): boolean {
    return (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as PermissionedOrientation).requestPermission === 'function'
    );
  }

  availability(): CompassAvailability {
    return this.state;
  }

  async requestAccess(): Promise<CompassAvailability> {
    if (this.state === 'unsupported' || !this.needsGesture()) return this.state;
    try {
      const answer = await (DeviceOrientationEvent as PermissionedOrientation).requestPermission!();
      this.state = answer === 'granted' ? 'ok' : 'denied';
    } catch {
      // Thrown when called outside a tap. Nothing was decided; the user can still tap "Enable compass".
      if (this.state !== 'ok') this.state = 'permission-needed';
    }
    if (this.state === 'ok' && this.onSample) this.armNoSensorTimer();
    return this.state;
  }

  start(onSample: (sample: HeadingSample) => void): void {
    this.stop();
    this.onSample = onSample;
    this.sawReading = false;
    if (this.state === 'unsupported') return;
    window.addEventListener('deviceorientation', this.handle);
    // Chromium reports a north-referenced orientation on a separate event.
    window.addEventListener('deviceorientationabsolute', this.handle);
    if (this.state === 'ok') this.armNoSensorTimer();
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.handle);
    window.removeEventListener('deviceorientationabsolute', this.handle);
    if (this.noSensorTimer !== null) clearTimeout(this.noSensorTimer);
    this.noSensorTimer = null;
    this.onSample = null;
  }

  private armNoSensorTimer(): void {
    if (this.noSensorTimer !== null) clearTimeout(this.noSensorTimer);
    this.noSensorTimer = setTimeout(() => {
      if (!this.sawReading && this.state === 'ok') this.state = 'unsupported';
    }, NO_SENSOR_AFTER_MS);
  }

  private readonly handle = (event: Event): void => {
    const orientation = event as SafariOrientationEvent;
    let sample: HeadingSample | null = null;

    if (typeof orientation.webkitCompassHeading === 'number') {
      const accuracy = orientation.webkitCompassAccuracy;
      sample = {
        headingDeg: orientation.webkitCompassHeading,
        reference: 'magnetic',
        // Passed through untouched: a negative value means "not valid" and is rejected downstream.
        accuracyDeg: typeof accuracy === 'number' ? accuracy : null,
        timestampMs: Date.now(),
      };
    } else if (orientation.absolute === true && typeof orientation.alpha === 'number') {
      // alpha grows anticlockwise; compass headings grow clockwise.
      sample = {
        headingDeg: normalizeDegrees(360 - orientation.alpha),
        reference: 'magnetic',
        accuracyDeg: null,
        timestampMs: Date.now(),
      };
    }
    if (!sample) return;

    this.sawReading = true;
    // Readings are flowing, so access was evidently granted (e.g. earlier in this browser session).
    if (this.state !== 'ok') this.state = 'ok';
    this.onSample?.(sample);
  };
}
