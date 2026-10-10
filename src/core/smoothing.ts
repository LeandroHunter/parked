import { normalizeDegrees, signedAngleDelta } from './geo.ts';

/**
 * Low-pass filter for an angle that lives on a circle.
 *
 * It always moves along the shortest arc, so a reading that goes 359° -> 1° turns the arrow 2°
 * clockwise instead of 358° anticlockwise. `continuous` is the unwrapped angle (it can exceed 360
 * or go negative) and is what the view should rotate by, so the renderer never sees a jump either.
 */
export class AngleSmoother {
  private current: number | null = null;
  private readonly timeConstantMs: number;
  private readonly fastTimeConstantMs: number;

  /**
   * @param timeConstantMs how quickly small changes are followed (higher = calmer, laggier)
   * @param fastTimeConstantMs used for big swings, so turning around does not feel like wading
   */
  constructor(timeConstantMs = 140, fastTimeConstantMs = 60) {
    this.timeConstantMs = timeConstantMs;
    this.fastTimeConstantMs = fastTimeConstantMs;
  }

  /** Unwrapped smoothed angle, or null before the first reading. */
  get continuous(): number | null {
    return this.current;
  }

  /** Smoothed angle wrapped into [0, 360), or null before the first reading. */
  get wrapped(): number | null {
    return this.current === null ? null : normalizeDegrees(this.current);
  }

  reset(): void {
    this.current = null;
  }

  /** Feeds a new target angle. `dtMs` is the time since the previous call. Returns the unwrapped angle. */
  update(targetDeg: number, dtMs: number): number {
    if (!Number.isFinite(targetDeg)) return this.current ?? 0;
    if (this.current === null) {
      this.current = normalizeDegrees(targetDeg);
      return this.current;
    }
    const delta = signedAngleDelta(normalizeDegrees(this.current), targetDeg);
    const magnitude = Math.abs(delta);
    if (magnitude < 0.05) return this.current;

    // Blend between the calm and the fast time constant between 10° and 60° of error.
    const blend = Math.min(1, Math.max(0, (magnitude - 10) / 50));
    const tau = this.timeConstantMs + (this.fastTimeConstantMs - this.timeConstantMs) * blend;
    const dt = Math.min(Math.max(dtMs, 0), 250);
    const alpha = 1 - Math.exp(-dt / tau);
    this.current += delta * alpha;
    return this.current;
  }
}

/** Mean direction of a set of angles (vector average). Null when they cancel out or the list is empty. */
export function circularMean(anglesDeg: readonly number[]): number | null {
  let x = 0;
  let y = 0;
  for (const angle of anglesDeg) {
    const radians = (angle * Math.PI) / 180;
    x += Math.cos(radians);
    y += Math.sin(radians);
  }
  if (anglesDeg.length === 0 || Math.hypot(x, y) < 1e-9) return null;
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}
