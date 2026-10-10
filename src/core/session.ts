import { isValidCoordinate } from './geo.ts';

/** How the saved coordinate was obtained. Decides how the app words its confidence. */
export type SpotSource =
  /** A fresh GPS fix that met the accuracy bar. */
  | 'gps'
  /** A vague fix the user explicitly chose to keep. */
  | 'gps-approximate'
  /** The user placed the pin on the map by hand. */
  | 'manual';

export type ParkingSession = {
  version: 1;
  id: string;
  latitude: number;
  longitude: number;
  /** Accuracy radius of the saved coordinate, in metres. */
  accuracyM: number;
  /** When the car was parked (epoch ms). */
  parkedAtMs: number;
  source: SpotSource;
  level: string;
  note: string;
  hasPhoto: boolean;
};

export type ParkingDetails = {
  level: string;
  note: string;
};

export const MAX_LEVEL_LENGTH = 24;
export const MAX_NOTE_LENGTH = 140;
/** Accuracy we assign to a pin the user dropped by hand. */
export const MANUAL_PIN_ACCURACY_M = 10;

export function newSessionId(nowMs: number, random: () => number = Math.random): string {
  return `${nowMs.toString(36)}-${Math.floor(random() * 0xffffffff).toString(36)}`;
}

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** Validates data read back from storage. Returns null for anything that is not a usable session. */
export function parseSession(raw: unknown): ParkingSession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  const { latitude, longitude, accuracyM, parkedAtMs, source } = value;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!isValidCoordinate({ latitude, longitude })) return null;
  if (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM) || accuracyM <= 0) return null;
  if (typeof parkedAtMs !== 'number' || !Number.isFinite(parkedAtMs) || parkedAtMs <= 0) return null;
  if (source !== 'gps' && source !== 'gps-approximate' && source !== 'manual') return null;
  return {
    version: 1,
    id: value.id,
    latitude,
    longitude,
    accuracyM,
    parkedAtMs,
    source,
    level: cleanText(value.level, MAX_LEVEL_LENGTH),
    note: cleanText(value.note, MAX_NOTE_LENGTH),
    hasPhoto: value.hasPhoto === true,
  };
}
