import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MANUAL_PIN_ACCURACY_M, parseSession } from '../src/core/session.ts';
import { CorruptSessionError, MemoryBackend, ParkingStore, StorageError, type NewSpot } from '../src/core/store.ts';

const spot = (overrides: Partial<NewSpot> = {}): NewSpot => ({
  latitude: 50.9413,
  longitude: 6.9583,
  accuracyM: 6,
  parkedAtMs: 1_800_000_000_000,
  source: 'gps',
  ...overrides,
});

const photo = () => ({ type: 'image/jpeg', bytes: new Uint8Array([1, 2, 3, 4]).buffer });

function setup() {
  const backend = new MemoryBackend();
  return { backend, store: new ParkingStore(backend) };
}

describe('saving and restoring', () => {
  it('starts empty', async () => {
    const { store } = setup();
    assert.equal(await store.load(), null);
  });

  it('saves latitude, longitude, time and accuracy', async () => {
    const { store } = setup();
    const saved = await store.park(spot());
    assert.equal(saved.latitude, 50.9413);
    assert.equal(saved.longitude, 6.9583);
    assert.equal(saved.accuracyM, 6);
    assert.equal(saved.parkedAtMs, 1_800_000_000_000);
    assert.equal(saved.source, 'gps');
    assert.equal(saved.hasPhoto, false);
  });

  it('survives an app restart (a new store over the same storage)', async () => {
    const { backend, store } = setup();
    const saved = await store.park(spot());
    const restored = await new ParkingStore(backend).load();
    assert.deepEqual(restored, saved);
  });

  it('refuses to save an invalid location', async () => {
    const { store } = setup();
    await assert.rejects(store.park(spot({ latitude: Number.NaN })), StorageError);
    await assert.rejects(store.park(spot({ accuracyM: -1 })), StorageError);
    await assert.rejects(store.park(spot({ latitude: 0, longitude: 0 })), StorageError);
    assert.equal(await store.load(), null);
  });

  it('reports a write failure instead of claiming success', async () => {
    const { backend, store } = setup();
    backend.failCommits = true;
    await assert.rejects(store.park(spot()), StorageError);
    backend.failCommits = false;
    assert.equal(await store.load(), null);
  });

  it('reports a read failure', async () => {
    const { backend, store } = setup();
    await store.park(spot());
    backend.failReads = true;
    await assert.rejects(store.load(), StorageError);
  });

  it('detects a write that did not stick', async () => {
    // A backend that accepts commits but drops them, like storage that is silently full.
    const lossy = new MemoryBackend();
    lossy.commit = async () => {};
    await assert.rejects(new ParkingStore(lossy).park(spot()), StorageError);
  });

  it('surfaces a corrupt record rather than pretending nothing was saved', async () => {
    const { backend, store } = setup();
    backend.plant('session', { version: 1, id: 'x', latitude: 'north-ish' });
    await assert.rejects(store.load(), CorruptSessionError);
    // Parking again still works and overwrites it.
    const saved = await store.park(spot());
    assert.deepEqual(await store.load(), saved);
  });
});

describe('details never move the car', () => {
  it('updates level and note, leaving the coordinates untouched', async () => {
    const { store } = setup();
    const saved = await store.park(spot());
    const updated = await store.updateDetails(saved.id, { level: '  P2 ', note: 'Bay 417,\n  near the lift' });
    assert.equal(updated.level, 'P2');
    assert.equal(updated.note, 'Bay 417, near the lift');
    assert.equal(updated.latitude, saved.latitude);
    assert.equal(updated.longitude, saved.longitude);
    assert.equal(updated.accuracyM, saved.accuracyM);
    assert.equal(updated.parkedAtMs, saved.parkedAtMs);
    assert.equal(updated.id, saved.id);
  });

  it('clamps over-long text', async () => {
    const { store } = setup();
    const saved = await store.park(spot());
    const updated = await store.updateDetails(saved.id, { level: 'L'.repeat(100), note: 'n'.repeat(500) });
    assert.equal(updated.level.length, 24);
    assert.equal(updated.note.length, 140);
  });

  it('rejects updates for a session that no longer exists', async () => {
    const { store } = setup();
    const first = await store.park(spot());
    await store.park(spot({ latitude: 48.1, longitude: 11.5, parkedAtMs: 1_800_000_100_000 }));
    await assert.rejects(store.updateDetails(first.id, { level: 'P1', note: '' }), StorageError);
  });

  it('a failed details write keeps the previous details', async () => {
    const { backend, store } = setup();
    const saved = await store.park(spot());
    await store.updateDetails(saved.id, { level: 'P2', note: 'Bay 9' });
    backend.failCommits = true;
    await assert.rejects(store.updateDetails(saved.id, { level: 'P5', note: 'wrong' }), StorageError);
    backend.failCommits = false;
    const current = await store.load();
    assert.equal(current?.level, 'P2');
    assert.equal(current?.note, 'Bay 9');
  });

  it('moving the pin is explicit and is recorded as manual', async () => {
    const { store } = setup();
    const saved = await store.park(spot({ accuracyM: 90, source: 'gps-approximate' }));
    const moved = await store.movePin(saved.id, { latitude: 50.942, longitude: 6.959 });
    assert.equal(moved.latitude, 50.942);
    assert.equal(moved.longitude, 6.959);
    assert.equal(moved.source, 'manual');
    assert.equal(moved.accuracyM, MANUAL_PIN_ACCURACY_M);
    assert.equal(moved.parkedAtMs, saved.parkedAtMs);
    await assert.rejects(store.movePin(saved.id, { latitude: 200, longitude: 0 }), StorageError);
  });
});

describe('photo', () => {
  it('stores and returns a photo with the session', async () => {
    const { store } = setup();
    const saved = await store.park(spot());
    const withPhoto = await store.setPhoto(saved.id, photo());
    assert.equal(withPhoto.hasPhoto, true);
    const loaded = await store.loadPhoto(saved.id);
    assert.equal(loaded?.type, 'image/jpeg');
    assert.deepEqual([...new Uint8Array(loaded!.bytes)], [1, 2, 3, 4]);
  });

  it('removes a photo', async () => {
    const { backend, store } = setup();
    const saved = await store.park(spot());
    await store.setPhoto(saved.id, photo());
    const without = await store.setPhoto(saved.id, null);
    assert.equal(without.hasPhoto, false);
    assert.equal(await store.loadPhoto(saved.id), null);
    assert.deepEqual(backend.keys(), ['session']);
  });
});

describe('replacing', () => {
  it('replaces the session and removes the old photo', async () => {
    const { backend, store } = setup();
    const first = await store.park(spot());
    await store.setPhoto(first.id, photo());
    await store.updateDetails(first.id, { level: 'P2', note: 'old' });

    const second = await store.park(spot({ latitude: 48.137, longitude: 11.575, parkedAtMs: 1_800_000_500_000 }));
    assert.notEqual(second.id, first.id);
    assert.equal(second.level, '');
    assert.equal(second.note, '');
    assert.equal(second.hasPhoto, false);
    assert.deepEqual(await store.load(), second);
    assert.equal(await store.loadPhoto(first.id), null);
    assert.deepEqual(backend.keys(), ['session']);
  });

  it('keeps the previous session, details and photo if the replacement fails', async () => {
    const { backend, store } = setup();
    const first = await store.park(spot());
    await store.setPhoto(first.id, photo());
    const detailed = await store.updateDetails(first.id, { level: 'P2', note: 'Bay 417' });

    backend.failCommits = true;
    await assert.rejects(
      store.park(spot({ latitude: 48.137, longitude: 11.575, parkedAtMs: 1_800_000_500_000 })),
      StorageError,
    );
    backend.failCommits = false;

    assert.deepEqual(await store.load(), detailed);
    assert.ok(await store.loadPhoto(first.id), 'photo is still there');
  });

  it('keeps the previous session if the new location is invalid', async () => {
    const { store } = setup();
    const first = await store.park(spot());
    await assert.rejects(store.park(spot({ longitude: 999 })), StorageError);
    assert.deepEqual(await store.load(), first);
  });
});

describe('clearing', () => {
  it('removes the session and its photo', async () => {
    const { backend, store } = setup();
    const saved = await store.park(spot());
    await store.setPhoto(saved.id, photo());
    await store.clear();
    assert.equal(await store.load(), null);
    assert.deepEqual(backend.keys(), []);
  });

  it('is safe when nothing is saved', async () => {
    const { store } = setup();
    await store.clear();
    assert.equal(await store.load(), null);
  });

  it('can clear a corrupt record', async () => {
    const { backend, store } = setup();
    backend.plant('session', 'garbage');
    await store.clear();
    assert.equal(await store.load(), null);
  });

  it('keeps the session if clearing fails', async () => {
    const { backend, store } = setup();
    const saved = await store.park(spot());
    backend.failCommits = true;
    await assert.rejects(store.clear(), StorageError);
    backend.failCommits = false;
    assert.deepEqual(await store.load(), saved);
  });
});

describe('session validation', () => {
  const valid = {
    version: 1,
    id: 'abc',
    latitude: 50.9,
    longitude: 6.9,
    accuracyM: 8,
    parkedAtMs: 1_800_000_000_000,
    source: 'gps',
    level: 'P1',
    note: '',
    hasPhoto: false,
  };

  it('accepts a well-formed record', () => {
    assert.deepEqual(parseSession(valid), valid);
  });

  it('rejects malformed records', () => {
    assert.equal(parseSession(null), null);
    assert.equal(parseSession('session'), null);
    assert.equal(parseSession({ ...valid, version: 2 }), null);
    assert.equal(parseSession({ ...valid, id: '' }), null);
    assert.equal(parseSession({ ...valid, latitude: 123 }), null);
    assert.equal(parseSession({ ...valid, longitude: '6.9' }), null);
    assert.equal(parseSession({ ...valid, accuracyM: 0 }), null);
    assert.equal(parseSession({ ...valid, parkedAtMs: Number.NaN }), null);
    assert.equal(parseSession({ ...valid, source: 'guess' }), null);
  });

  it('tolerates missing optional fields', () => {
    const { level: _level, note: _note, hasPhoto: _hasPhoto, ...bare } = valid;
    assert.deepEqual(parseSession(bare), { ...valid, level: '', note: '', hasPhoto: false });
  });
});
