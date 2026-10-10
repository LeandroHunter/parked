// Wording helpers. Kept pure so the "never claim more precision than we have" rules are testable.

import { decimalSeparator, translate, type Language } from './i18n.ts';

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

function oneDecimal(value: number, language: Language): string {
  return value.toFixed(1).replace('.', decimalSeparator(language));
}

/**
 * Formats a distance no more precisely than the positioning allows.
 * With ±15 m of uncertainty "83 m" would be theatre, so it becomes "85 m".
 */
export function formatDistance(
  metres: number,
  uncertaintyM: number,
  units: UnitSystem = 'metric',
  language: Language = 'en',
): DistanceText {
  const safe = Math.max(0, metres);
  const spoken = (value: string, unit: 'metres' | 'kilometres' | 'feet' | 'miles') =>
    `${value} ${translate(language, `unit.${unit}`)}`;

  if (units === 'imperial') {
    const feet = safe * FEET_PER_METRE;
    if (safe < METRES_PER_MILE * 0.19) {
      const step = uncertaintyM > 8 ? 25 : 10;
      const value = String(Math.max(step, roundTo(feet, step)));
      return { value, unit: 'ft', spoken: spoken(value, 'feet') };
    }
    const miles = safe / METRES_PER_MILE;
    const value = miles < 10 ? oneDecimal(miles, language) : String(Math.round(miles));
    return { value, unit: 'mi', spoken: spoken(value, 'miles') };
  }
  if (safe < 995) {
    const step = uncertaintyM > 40 ? 10 : uncertaintyM > 8 ? 5 : 1;
    const value = String(roundTo(safe, step));
    return { value, unit: 'm', spoken: spoken(value, 'metres') };
  }
  const km = safe / 1000;
  const value = km < 10 ? oneDecimal(km, language) : String(Math.round(km));
  return { value, unit: 'km', spoken: spoken(value, 'kilometres') };
}

/** Keeps a number and its unit on the same line. */
const NBSP = '\u00a0';

/** "±6 m" style accuracy, rounded up so we never understate the error. */
export function formatAccuracy(accuracyM: number, units: UnitSystem = 'metric', language: Language = 'en'): string {
  if (units === 'imperial') {
    const feet = accuracyM * FEET_PER_METRE;
    return `±${feet < 100 ? Math.ceil(feet / 5) * 5 : Math.ceil(feet / 50) * 50}${NBSP}ft`;
  }
  if (accuracyM < 10) return `±${Math.max(1, Math.ceil(accuracyM))}${NBSP}m`;
  if (accuracyM < 100) return `±${Math.ceil(accuracyM / 5) * 5}${NBSP}m`;
  if (accuracyM < 1000) return `±${Math.ceil(accuracyM / 50) * 50}${NBSP}m`;
  return `±${oneDecimal(Math.ceil(accuracyM / 100) / 10, language)}${NBSP}km`;
}

/** "2 h 14 min ago" style elapsed time. */
export function formatElapsed(fromMs: number, nowMs: number, language: Language = 'en'): string {
  const minutes = Math.max(0, Math.floor((nowMs - fromMs) / 60_000));
  if (minutes < 1) return translate(language, 'elapsed.now');
  if (minutes < 60) return translate(language, 'elapsed.minutes', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0
      ? translate(language, 'elapsed.hours', { hours })
      : translate(language, 'elapsed.hoursMinutes', { hours, minutes: rest });
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? translate(language, 'elapsed.yesterday') : translate(language, 'elapsed.days', { days });
}
