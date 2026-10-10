// Wording helpers. Kept pure so the "never claim more precision than we have" rules are testable.

export type UnitSystem = 'metric' | 'imperial';

export function unitSystemFor(locale: string | undefined): UnitSystem {
  const region = (locale ?? '').split(/[-_]/)[1]?.toUpperCase();
  return region === 'US' || region === 'LR' || region === 'MM' ? 'imperial' : 'metric';
}

export type DistanceText = {
  value: string;
  unit: string;
  /** Spoken form for VoiceOver. */
  spoken: string;
};

const FEET_PER_METRE = 3.28084;
const METRES_PER_MILE = 1609.344;

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Formats a distance no more precisely than the positioning allows.
 * With ±15 m of uncertainty "83 m" would be theatre, so it becomes "85 m".
 */
export function formatDistance(metres: number, uncertaintyM: number, units: UnitSystem = 'metric'): DistanceText {
  const safe = Math.max(0, metres);
  if (units === 'imperial') {
    const feet = safe * FEET_PER_METRE;
    if (safe < METRES_PER_MILE * 0.19) {
      const step = uncertaintyM > 8 ? 25 : 10;
      const value = Math.max(step, roundTo(feet, step));
      return { value: String(value), unit: 'ft', spoken: `${value} feet` };
    }
    const miles = safe / METRES_PER_MILE;
    const value = miles < 10 ? miles.toFixed(1) : String(Math.round(miles));
    return { value, unit: 'mi', spoken: `${value} miles` };
  }
  if (safe < 995) {
    const step = uncertaintyM > 40 ? 10 : uncertaintyM > 8 ? 5 : 1;
    const value = roundTo(safe, step);
    return { value: String(value), unit: 'm', spoken: `${value} metres` };
  }
  const km = safe / 1000;
  const value = km < 10 ? km.toFixed(1) : String(Math.round(km));
  return { value, unit: 'km', spoken: `${value} kilometres` };
}

/** "±6 m" style accuracy, rounded up so we never understate the error. */
export function formatAccuracy(accuracyM: number, units: UnitSystem = 'metric'): string {
  if (units === 'imperial') {
    const feet = accuracyM * FEET_PER_METRE;
    return `±${feet < 100 ? Math.ceil(feet / 5) * 5 : Math.ceil(feet / 50) * 50} ft`;
  }
  if (accuracyM < 10) return `±${Math.max(1, Math.ceil(accuracyM))} m`;
  if (accuracyM < 100) return `±${Math.ceil(accuracyM / 5) * 5} m`;
  if (accuracyM < 1000) return `±${Math.ceil(accuracyM / 50) * 50} m`;
  return `±${(Math.ceil(accuracyM / 100) / 10).toFixed(1)} km`;
}

/** "Parked 2 h 14 min ago" style elapsed time. */
export function formatElapsed(fromMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - fromMs) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h ago` : `${hours} h ${rest} min ago`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
