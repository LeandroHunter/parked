import { isValidCoordinate } from './geo.ts';

/** One position fix, already detached from any browser type. */
export type LocationSample = {
  latitude: number;
  longitude: number;
  /** Reported horizontal accuracy radius in metres. */
  accuracyM: number;
  /** When the fix was taken (epoch ms). */
  timestampMs: number;
  /** True only for readings produced by the debug simulator. */
  simulated?: boolean;
};

/** One compass reading: where the top edge of the device (in portrait) points. */
export type HeadingSample = {
  headingDeg: number;
  /** Safari's compass is magnetic; 'true' is only used when a source really is true-north referenced. */
  reference: 'magnetic' | 'true';
  /** Reported error in degrees. Null = the browser gives no figure. Negative = the compass says it is invalid. */
  accuracyDeg: number | null;
  timestampMs: number;
  simulated?: boolean;
};

export type Quality = 'good' | 'fair' | 'poor';

export type ReadingCheck = 'ok' | 'missing' | 'invalid' | 'stale';

/** Clock skew we tolerate before calling a timestamp bogus. */
const FUTURE_TOLERANCE_MS = 5_000;

export const LOCATION_STALE_MS = 20_000;
export const HEADING_STALE_MS = 3_000;

/** Above this the fix is too vague to say "you are near" anything. */
export const WEAK_LOCATION_M = 50;
/** Above this iOS is almost certainly giving approximate location (Precise Location off). */
export const APPROXIMATE_LOCATION_M = 1_000;

export function checkLocation(
  sample: LocationSample | null | undefined,
  nowMs: number,
  maxAgeMs: number = LOCATION_STALE_MS,
): ReadingCheck {
  if (!sample) return 'missing';
  if (!isValidCoordinate(sample)) return 'invalid';
  if (!Number.isFinite(sample.accuracyM) || sample.accuracyM <= 0) return 'invalid';
  if (!Number.isFinite(sample.timestampMs) || sample.timestampMs <= 0) return 'invalid';
  if (sample.timestampMs - nowMs > FUTURE_TOLERANCE_MS) return 'invalid';
  if (nowMs - sample.timestampMs > maxAgeMs) return 'stale';
  return 'ok';
}

export function checkHeading(
  sample: HeadingSample | null | undefined,
  nowMs: number,
  maxAgeMs: number = HEADING_STALE_MS,
): ReadingCheck {
  if (!sample) return 'missing';
  if (!Number.isFinite(sample.headingDeg) || sample.headingDeg < 0 || sample.headingDeg > 360) return 'invalid';
  // Safari reports heading 0 with accuracy -1 when it has no compass fix. That 0 is not north.
  if (sample.accuracyDeg !== null && (!Number.isFinite(sample.accuracyDeg) || sample.accuracyDeg < 0)) return 'invalid';
  if (!Number.isFinite(sample.timestampMs) || sample.timestampMs <= 0) return 'invalid';
  if (sample.timestampMs - nowMs > FUTURE_TOLERANCE_MS) return 'invalid';
  if (nowMs - sample.timestampMs > maxAgeMs) return 'stale';
  return 'ok';
}

export function locationQuality(accuracyM: number): Quality {
  if (accuracyM <= 12) return 'good';
  if (accuracyM <= 30) return 'fair';
  return 'poor';
}

export function headingQuality(accuracyDeg: number | null): Quality {
  // No figure at all means we cannot vouch for it; never better than fair.
  if (accuracyDeg === null) return 'fair';
  if (accuracyDeg <= 15) return 'good';
  if (accuracyDeg <= 30) return 'fair';
  return 'poor';
}
