import { isValidCoordinate, type Coordinate } from './geo.ts';
import {
  MANUAL_PIN_ACCURACY_M,
  MAX_LEVEL_LENGTH,
  MAX_NOTE_LENGTH,
  cleanText,
  newSessionId,
  parseSession,
  type ParkingDetails,
  type ParkingSession,
  type SpotSource,
} from './session.ts';

export type StorageOperation =
  | { type: 'put'; key: string; value: unknown }
  | { type: 'delete'; key: string };

/**
 * The only thing the store needs from the platform. `commit` must be all-or-nothing: either every
 * operation is durably applied or none is. IndexedDB transactions give us that on the phone.
 */
export interface StorageBackend {
  read(key: string): Promise<unknown>;
  commit(operations: StorageOperation[]): Promise<void>;
}

export type StoredPhoto = {
  type: string;
  bytes: ArrayBuffer;
};

export type NewSpot = Coordinate & {
  accuracyM: number;
  parkedAtMs: number;
  source: SpotSource;
};

export class StorageError extends Error {
  override readonly name = 'StorageError';
}

/** The saved record exists but cannot be understood. We never silently discard it. */
export class CorruptSessionError extends Error {
  override readonly name = 'CorruptSessionError';
}

const SESSION_KEY = 'session';
const photoKey = (sessionId: string) => `photo:${sessionId}`;

function sameSession(a: ParkingSession, b: ParkingSession): boolean {
  return (
    a.id === b.id &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.accuracyM === b.accuracyM &&
    a.parkedAtMs === b.parkedAtMs &&
    a.source === b.source &&
    a.level === b.level &&
    a.note === b.note &&
    a.hasPhoto === b.hasPhoto
  );
}

/**
 * Owns the single parking session. Every write is one atomic commit followed by a read-back, so a
 * method only resolves when the data is really on disk, and a failed replace leaves the old spot intact.
 */
export class ParkingStore {
  private readonly backend: StorageBackend;

  constructor(backend: StorageBackend) {
    this.backend = backend;
  }

  async load(): Promise<ParkingSession | null> {
    const raw = await this.read(SESSION_KEY);
    if (raw === undefined || raw === null) return null;
    const session = parseSession(raw);
    if (!session) throw new CorruptSessionError('The saved parking spot could not be read.');
    return session;
  }

  /** Saves a new spot, replacing any existing one (and its photo) in the same atomic commit. */
  async park(spot: NewSpot): Promise<ParkingSession> {
    if (!isValidCoordinate(spot) || !Number.isFinite(spot.accuracyM) || spot.accuracyM <= 0) {
      throw new StorageError('Refusing to save an invalid location.');
    }
    // A corrupt previous record must not block parking again; it is simply overwritten.
    const previous = await this.load().catch((error: unknown) => {
      if (error instanceof CorruptSessionError) return null;
      throw error;
    });
    const session: ParkingSession = {
      version: 1,
      id: newSessionId(spot.parkedAtMs),
      latitude: spot.latitude,
      longitude: spot.longitude,
      accuracyM: spot.accuracyM,
      parkedAtMs: spot.parkedAtMs,
      source: spot.source,
      level: '',
      note: '',
      hasPhoto: false,
    };
    const operations: StorageOperation[] = [{ type: 'put', key: SESSION_KEY, value: session }];
    if (previous) operations.push({ type: 'delete', key: photoKey(previous.id) });
    return this.commitAndVerify(operations, session);
  }

  /** Updates the optional details. The coordinate, accuracy and time are copied from storage untouched. */
  async updateDetails(sessionId: string, details: ParkingDetails): Promise<ParkingSession> {
    const current = await this.requireSession(sessionId);
    const next: ParkingSession = {
      ...current,
      level: cleanText(details.level, MAX_LEVEL_LENGTH),
      note: cleanText(details.note, MAX_NOTE_LENGTH),
    };
    return this.commitAndVerify([{ type: 'put', key: SESSION_KEY, value: next }], next);
  }

  /** The one deliberate way to move a saved spot: the user dragged the pin on the map. */
  async movePin(sessionId: string, coordinate: Coordinate): Promise<ParkingSession> {
    if (!isValidCoordinate(coordinate)) throw new StorageError('Refusing to save an invalid location.');
    const current = await this.requireSession(sessionId);
    const next: ParkingSession = {
      ...current,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      accuracyM: MANUAL_PIN_ACCURACY_M,
      source: 'manual',
    };
    return this.commitAndVerify([{ type: 'put', key: SESSION_KEY, value: next }], next);
  }

  async setPhoto(sessionId: string, photo: StoredPhoto | null): Promise<ParkingSession> {
    const current = await this.requireSession(sessionId);
    const next: ParkingSession = { ...current, hasPhoto: photo !== null };
    const operations: StorageOperation[] = [
      photo ? { type: 'put', key: photoKey(sessionId), value: photo } : { type: 'delete', key: photoKey(sessionId) },
      { type: 'put', key: SESSION_KEY, value: next },
    ];
    return this.commitAndVerify(operations, next);
  }

  async loadPhoto(sessionId: string): Promise<StoredPhoto | null> {
    const raw = await this.read(photoKey(sessionId));
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Partial<StoredPhoto>;
    if (typeof value.type !== 'string' || !(value.bytes instanceof ArrayBuffer)) return null;
    return { type: value.type, bytes: value.bytes };
  }

  /** Ends the parking session. Only ever called from an explicit user action. */
  async clear(): Promise<void> {
    const raw = await this.read(SESSION_KEY);
    const operations: StorageOperation[] = [{ type: 'delete', key: SESSION_KEY }];
    const id = typeof raw === 'object' && raw !== null ? (raw as { id?: unknown }).id : undefined;
    if (typeof id === 'string') operations.push({ type: 'delete', key: photoKey(id) });
    await this.commit(operations);
    const after = await this.read(SESSION_KEY);
    if (after !== undefined && after !== null) throw new StorageError('The parking spot could not be removed.');
  }

  private async requireSession(sessionId: string): Promise<ParkingSession> {
    const current = await this.load();
    if (!current || current.id !== sessionId) {
      throw new StorageError('That parking spot no longer exists.');
    }
    return current;
  }

  private async commitAndVerify(operations: StorageOperation[], expected: ParkingSession): Promise<ParkingSession> {
    await this.commit(operations);
    const stored = parseSession(await this.read(SESSION_KEY));
    if (!stored || !sameSession(stored, expected)) {
      throw new StorageError('The parking spot was not saved correctly.');
    }
    return stored;
  }

  private async read(key: string): Promise<unknown> {
    try {
      return await this.backend.read(key);
    } catch (error) {
      throw new StorageError('Storage could not be read.', { cause: error });
    }
  }

  private async commit(operations: StorageOperation[]): Promise<void> {
    try {
      await this.backend.commit(operations);
    } catch (error) {
      throw new StorageError('Storage could not be written.', { cause: error });
    }
  }
}

/** In-memory backend used by the tests and as a last resort when the browser has no IndexedDB. */
export class MemoryBackend implements StorageBackend {
  private readonly data = new Map<string, unknown>();
  /** Set to make the next commits or reads fail, to exercise the error paths. */
  failCommits = false;
  failReads = false;

  async read(key: string): Promise<unknown> {
    if (this.failReads) throw new Error('simulated read failure');
    const value = this.data.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  async commit(operations: StorageOperation[]): Promise<void> {
    if (this.failCommits) throw new Error('simulated write failure');
    // Apply to a copy first so a throw half-way cannot leave a partial write behind.
    const next = new Map(this.data);
    for (const operation of operations) {
      if (operation.type === 'put') next.set(operation.key, structuredClone(operation.value));
      else next.delete(operation.key);
    }
    this.data.clear();
    for (const [key, value] of next) this.data.set(key, value);
  }

  /** Test helper: plant raw data, bypassing validation. */
  plant(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  keys(): string[] {
    return [...this.data.keys()].sort();
  }
}
