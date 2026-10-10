import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_ACQUISITION, FixCollector } from '../src/core/acquisition.ts';
import {
  HEADING_STALE_MS,
  LOCATION_STALE_MS,
  checkHeading,
  checkLocation,
  headingQuality,
  locationQuality,
  type HeadingSample,
  type LocationSample,
} from '../src/core/readings.ts';

const NOW = 1_800_000_000_000;

const fix = (overrides: Partial<LocationSample> = {}): LocationSample => ({
  latitude: 50.9413,
  longitude: 6.9583,
  accuracyM: 6,
  timestampMs: NOW,
  ...overrides,
});

const heading = (overrides: Partial<HeadingSample> = {}): HeadingSample => ({
  headingDeg: 120,
  reference: 'magnetic',
  accuracyDeg: 10,
  timestampMs: NOW,
  ...overrides,
});

describe('location readings', () => {
  it('accepts a fresh, sane fix', () => {
    assert.equal(checkLocation(fix(), NOW), 'ok');
  });

  it('reports a missing reading', () => {
    assert.equal(checkLocation(null, NOW), 'missing');
    assert.equal(checkLocation(undefined, NOW), 'missing');
  });

  it('rejects impossible coordinates', () => {
    assert.equal(checkLocation(fix({ latitude: 95 }), NOW), 'invalid');
    assert.equal(checkLocation(fix({ longitude: Number.NaN }), NOW), 'invalid');
    assert.equal(checkLocation(fix({ latitude: 0, longitude: 0 }), NOW), 'invalid');
  });

  it('rejects missing or nonsensical accuracy', () => {
    assert.equal(checkLocation(fix({ accuracyM: -1 }), NOW), 'invalid');
    assert.equal(checkLocation(fix({ accuracyM: 0 }), NOW), 'invalid');
    assert.equal(checkLocation(fix({ accuracyM: Number.POSITIVE_INFINITY }), NOW), 'invalid');
  });

  it('flags stale fixes by timestamp', () => {
    assert.equal(checkLocation(fix({ timestampMs: NOW - LOCATION_STALE_MS }), NOW), 'ok');
    assert.equal(checkLocation(fix({ timestampMs: NOW - LOCATION_STALE_MS - 1 }), NOW), 'stale');
    assert.equal(checkLocation(fix({ timestampMs: NOW - 3_600_000 }), NOW), 'stale');
  });

  it('rejects timestamps from the future or the epoch', () => {
    assert.equal(checkLocation(fix({ timestampMs: NOW + 60_000 }), NOW), 'invalid');
    assert.equal(checkLocation(fix({ timestampMs: 0 }), NOW), 'invalid');
    assert.equal(checkLocation(fix({ timestampMs: NOW + 1_000 }), NOW), 'ok', 'small clock skew is tolerated');
  });

  it('grades accuracy', () => {
    assert.equal(locationQuality(5), 'good');
    assert.equal(locationQuality(25), 'fair');
    assert.equal(locationQuality(65), 'poor');
  });
});

describe('heading readings', () => {
  it('accepts a fresh, calibrated heading', () => {
    assert.equal(checkHeading(heading(), NOW), 'ok');
  });

  it('reports an unavailable heading', () => {
    assert.equal(checkHeading(null, NOW), 'missing');
  });

  it('rejects the "heading 0, accuracy -1" reading Safari sends when it has no compass fix', () => {
    assert.equal(checkHeading(heading({ headingDeg: 0, accuracyDeg: -1 }), NOW), 'invalid');
  });

  it('rejects out-of-range and non-finite headings', () => {
    assert.equal(checkHeading(heading({ headingDeg: -5 }), NOW), 'invalid');
    assert.equal(checkHeading(heading({ headingDeg: 400 }), NOW), 'invalid');
    assert.equal(checkHeading(heading({ headingDeg: Number.NaN }), NOW), 'invalid');
    assert.equal(checkHeading(heading({ accuracyDeg: Number.NaN }), NOW), 'invalid');
  });

  it('flags stale headings', () => {
    assert.equal(checkHeading(heading({ timestampMs: NOW - HEADING_STALE_MS }), NOW), 'ok');
    assert.equal(checkHeading(heading({ timestampMs: NOW - HEADING_STALE_MS - 1 }), NOW), 'stale');
  });

  it('never rates a heading without an accuracy figure better than fair', () => {
    assert.equal(checkHeading(heading({ accuracyDeg: null }), NOW), 'ok');
    assert.equal(headingQuality(null), 'fair');
    assert.equal(headingQuality(8), 'good');
    assert.equal(headingQuality(25), 'fair');
    assert.equal(headingQuality(45), 'poor');
  });
});

describe('bounded fix acquisition', () => {
  const START = NOW;

  it('finishes at once on an excellent fix', () => {
    const collector = new FixCollector(START);
    assert.equal(collector.isComplete(START + 100), false);
    collector.offer(fix({ accuracyM: 5, timestampMs: START + 400 }), START + 400);
    assert.equal(collector.isComplete(START + 400), true);
    assert.deepEqual(collector.outcome().kind, 'precise');
  });

  it('gives GPS time to settle before accepting a merely good fix', () => {
    const collector = new FixCollector(START);
    collector.offer(fix({ accuracyM: 18, timestampMs: START + 500 }), START + 500);
    assert.equal(collector.isComplete(START + 500), false);
    assert.equal(collector.isComplete(START + DEFAULT_ACQUISITION.minSettleMs), true);
  });

  it('keeps the best reading, not the last one', () => {
    const collector = new FixCollector(START);
    collector.offer(fix({ accuracyM: 65, timestampMs: START + 300 }), START + 300);
    collector.offer(fix({ accuracyM: 14, latitude: 50.9414, timestampMs: START + 1500 }), START + 1500);
    collector.offer(fix({ accuracyM: 30, latitude: 50.9415, timestampMs: START + 2000 }), START + 2000);
    assert.equal(collector.best?.accuracyM, 14);
    assert.equal(collector.best?.latitude, 50.9414);
  });

  it('prefers the newer of two equally accurate fixes', () => {
    const collector = new FixCollector(START);
    collector.offer(fix({ accuracyM: 12, latitude: 50.1, timestampMs: START + 300 }), START + 300);
    collector.offer(fix({ accuracyM: 12, latitude: 50.2, timestampMs: START + 900 }), START + 900);
    assert.equal(collector.best?.latitude, 50.2);
  });

  it('refuses a cached position from before the tap', () => {
    const collector = new FixCollector(START);
    const cached = fix({ accuracyM: 4, timestampMs: START - 120_000 });
    assert.equal(collector.offer(cached, START + 200), false);
    assert.equal(collector.best, null);
    assert.deepEqual(collector.outcome(), { kind: 'none' });
  });

  it('refuses invalid readings', () => {
    const collector = new FixCollector(START);
    assert.equal(collector.offer(fix({ accuracyM: -1 }), START + 200), false);
    assert.equal(collector.offer(fix({ latitude: Number.NaN }), START + 200), false);
    assert.equal(collector.best, null);
  });

  it('never waits past the window, with or without a fix', () => {
    const empty = new FixCollector(START);
    assert.equal(empty.isComplete(START + DEFAULT_ACQUISITION.windowMs - 1), false);
    assert.equal(empty.isComplete(START + DEFAULT_ACQUISITION.windowMs), true);
    assert.equal(empty.remainingMs(START + DEFAULT_ACQUISITION.windowMs + 5_000), 0);
    assert.deepEqual(empty.outcome(), { kind: 'none' });

    const vague = new FixCollector(START);
    vague.offer(fix({ accuracyM: 80, timestampMs: START + 1000 }), START + 1000);
    assert.equal(vague.isComplete(START + 10_000), false, 'a vague fix keeps waiting for a better one');
    assert.equal(vague.isComplete(START + DEFAULT_ACQUISITION.windowMs), true);
  });

  it('never presents a vague fix as precise', () => {
    const collector = new FixCollector(START);
    collector.offer(fix({ accuracyM: 80, timestampMs: START + 1000 }), START + 1000);
    const outcome = collector.outcome();
    assert.equal(outcome.kind, 'approximate');
    assert.equal(outcome.kind === 'approximate' && outcome.fix.accuracyM, 80);

    const borderline = new FixCollector(START);
    borderline.offer(fix({ accuracyM: DEFAULT_ACQUISITION.acceptableM, timestampMs: START + 1000 }), START + 1000);
    assert.equal(borderline.outcome().kind, 'precise');
  });
});
