import { checkLocation, type LocationSample } from './readings.ts';

export type AcquisitionOptions = {
  /** Hard upper bound. The save never waits longer than this. */
  windowMs: number;
  /** Give GPS at least this long to settle before accepting a merely "good" fix. */
  minSettleMs: number;
  /** A fix this accurate ends the wait immediately. */
  excellentM: number;
  /** A fix this accurate ends the wait once `minSettleMs` has passed. */
  goodM: number;
  /** Worst accuracy we still save without asking. Anything vaguer needs an explicit choice. */
  acceptableM: number;
  /** A fix older than this when it arrives is a cached position, not a fresh one. */
  maxFixAgeMs: number;
};

export const DEFAULT_ACQUISITION: AcquisitionOptions = {
  windowMs: 15_000,
  minSettleMs: 2_500,
  excellentM: 8,
  goodM: 20,
  acceptableM: 35,
  maxFixAgeMs: 10_000,
};

export type AcquisitionOutcome =
  /** Accurate enough to save straight away. */
  | { kind: 'precise'; fix: LocationSample }
  /** We got something, but it is vague. The user decides what to do with it. */
  | { kind: 'approximate'; fix: LocationSample }
  /** No usable fresh fix arrived inside the window. */
  | { kind: 'none' };

/**
 * Collects fixes during the bounded "Saving your spot…" window and keeps the best fresh one.
 * Cached, invalid or out-of-date readings are refused, so a stale coordinate can never be saved.
 */
export class FixCollector {
  private readonly startedAtMs: number;
  private readonly options: AcquisitionOptions;
  private bestFix: LocationSample | null = null;

  constructor(startedAtMs: number, options: AcquisitionOptions = DEFAULT_ACQUISITION) {
    this.startedAtMs = startedAtMs;
    this.options = options;
  }

  get best(): LocationSample | null {
    return this.bestFix;
  }

  /** Offers a reading. Returns true when it was fresh and valid (whether or not it became the best). */
  offer(sample: LocationSample, nowMs: number): boolean {
    if (checkLocation(sample, nowMs, this.options.maxFixAgeMs) !== 'ok') return false;
    const best = this.bestFix;
    if (
      !best ||
      sample.accuracyM < best.accuracyM ||
      (sample.accuracyM === best.accuracyM && sample.timestampMs > best.timestampMs)
    ) {
      this.bestFix = sample;
    }
    return true;
  }

  /** True once we should stop waiting: an excellent fix, a good one after settling, or the deadline. */
  isComplete(nowMs: number): boolean {
    const elapsed = nowMs - this.startedAtMs;
    if (elapsed >= this.options.windowMs) return true;
    const best = this.bestFix;
    if (!best) return false;
    if (best.accuracyM <= this.options.excellentM) return true;
    return elapsed >= this.options.minSettleMs && best.accuracyM <= this.options.goodM;
  }

  remainingMs(nowMs: number): number {
    return Math.max(0, this.options.windowMs - (nowMs - this.startedAtMs));
  }

  outcome(): AcquisitionOutcome {
    const best = this.bestFix;
    if (!best) return { kind: 'none' };
    return best.accuracyM <= this.options.acceptableM
      ? { kind: 'precise', fix: best }
      : { kind: 'approximate', fix: best };
  }
}
