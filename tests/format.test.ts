import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAccuracy, formatDistance, formatElapsed, unitSystemFor } from '../src/core/format.ts';

describe('distance wording', () => {
  it('shows whole metres when positioning is tight', () => {
    assert.deepEqual(formatDistance(83.4, 5), { value: '83', unit: 'm', spoken: '83 metres' });
  });

  it('rounds to 5 m when the uncertainty does not justify single metres', () => {
    assert.equal(formatDistance(83.4, 15).value, '85');
    assert.equal(formatDistance(12.4, 15).value, '10');
  });

  it('rounds to 10 m when the fix is weak', () => {
    assert.equal(formatDistance(83.4, 120).value, '80');
    assert.equal(formatDistance(146, 200).value, '150');
  });

  it('never shows centimetres or a negative distance', () => {
    assert.equal(formatDistance(0.37, 3).value, '0');
    assert.equal(formatDistance(-4, 3).value, '0');
  });

  it('switches to kilometres', () => {
    assert.deepEqual(formatDistance(1234, 5), { value: '1.2', unit: 'km', spoken: '1.2 kilometres' });
    assert.equal(formatDistance(997, 5).unit, 'km');
    assert.equal(formatDistance(24_600, 5).value, '25');
  });

  it('supports feet and miles', () => {
    assert.equal(formatDistance(30, 5, 'imperial').unit, 'ft');
    assert.equal(formatDistance(30, 5, 'imperial').value, '100');
    assert.equal(formatDistance(1609.344 * 2, 5, 'imperial').value, '2.0');
  });

  it('picks units from the locale', () => {
    assert.equal(unitSystemFor('en-US'), 'imperial');
    assert.equal(unitSystemFor('de-DE'), 'metric');
    assert.equal(unitSystemFor('en-GB'), 'metric');
    assert.equal(unitSystemFor(undefined), 'metric');
  });
});

describe('accuracy wording', () => {
  it('rounds up, never understating the error', () => {
    assert.equal(formatAccuracy(4.2), '±5\u00a0m');
    assert.equal(formatAccuracy(0.3), '±1\u00a0m');
    assert.equal(formatAccuracy(11), '±15\u00a0m');
    assert.equal(formatAccuracy(65), '±65\u00a0m');
    assert.equal(formatAccuracy(120), '±150\u00a0m');
    assert.equal(formatAccuracy(3200), '±3.2\u00a0km');
  });
});

describe('elapsed time', () => {
  const now = 1_800_000_000_000;
  it('reads naturally', () => {
    assert.equal(formatElapsed(now - 20_000, now), 'just now');
    assert.equal(formatElapsed(now - 5 * 60_000, now), '5 min ago');
    assert.equal(formatElapsed(now - 2 * 3_600_000, now), '2 h ago');
    assert.equal(formatElapsed(now - (2 * 60 + 14) * 60_000, now), '2 h 14 min ago');
    assert.equal(formatElapsed(now - 26 * 3_600_000, now), 'yesterday');
    assert.equal(formatElapsed(now - 3 * 86_400_000, now), '3 days ago');
    assert.equal(formatElapsed(now + 5_000, now), 'just now');
  });
});
