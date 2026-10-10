import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { destinationPoint } from '../src/core/geo.ts';
import { combinedUncertainty, computeGuidance, type GuidanceInput } from '../src/core/guidance.ts';
import type { HeadingSample, LocationSample } from '../src/core/readings.ts';

const NOW = 1_800_000_000_000;
const CAR = { latitude: 50.9413, longitude: 6.9583, accuracyM: 5 };

/** A fix `distanceM` away from the car, positioned so the car lies on `bearingToCar` from me. */
function standing(distanceM: number, bearingToCar: number, overrides: Partial<LocationSample> = {}): LocationSample {
  const me = destinationPoint(CAR, bearingToCar + 180, distanceM);
  return { ...me, accuracyM: 5, timestampMs: NOW, ...overrides };
}

function facing(headingDeg: number, overrides: Partial<HeadingSample> = {}): HeadingSample {
  return { headingDeg, reference: 'true', accuracyDeg: 8, timestampMs: NOW, ...overrides };
}

function input(overrides: Partial<GuidanceInput> = {}): GuidanceInput {
  return {
    nowMs: NOW,
    target: CAR,
    location: standing(100, 90),
    heading: facing(0),
    compass: 'ok',
    declinationDeg: 0,
    screenAngleDeg: 0,
    wasNear: false,
    ...overrides,
  };
}

const close = (actual: number | null, expected: number, tolerance = 0.2) => {
  assert.ok(actual !== null, 'expected a number');
  const diff = Math.abs(((actual - expected + 540) % 360) - 180);
  assert.ok(diff <= tolerance, `expected ${expected} ±${tolerance}, got ${actual}`);
};

describe('arrow from live readings', () => {
  it('car east, phone north -> right', () => {
    const state = computeGuidance(input());
    assert.equal(state.mode, 'arrow');
    assert.equal(state.live, true);
    close(state.arrowDeg, 90);
    close(state.distanceM, 100, 0.1);
  });

  it('car east, phone east -> up', () => {
    close(computeGuidance(input({ heading: facing(90) })).arrowDeg, 0);
  });

  it('car behind me -> down', () => {
    close(computeGuidance(input({ heading: facing(270) })).arrowDeg, 180);
  });

  it('follows rotation while standing still', () => {
    const location = standing(60, 30);
    for (let heading = 0; heading < 360; heading += 20) {
      const state = computeGuidance(input({ location, heading: facing(heading) }));
      close(state.arrowDeg, 30 - heading);
    }
  });

  it('shows where north is on the ring', () => {
    close(computeGuidance(input({ heading: facing(90) })).northDeg, 270);
  });

  it('accounts for a landscape screen', () => {
    // I face north with the phone turned anticlockwise into landscape: device top points west.
    const state = computeGuidance(input({ location: standing(80, 0), heading: facing(270), screenAngleDeg: 90 }));
    close(state.arrowDeg, 0);
  });
});

describe('true versus magnetic north', () => {
  it('applies declination to a magnetic heading', () => {
    // Declination 10° east: magnetic 80° is true 90°, so a car due east is straight ahead.
    const state = computeGuidance(
      input({ heading: facing(80, { reference: 'magnetic' }), declinationDeg: 10 }),
    );
    close(state.arrowDeg, 0);
    assert.ok(!state.issues.includes('magnetic-north'));
  });

  it('applies a westerly (negative) declination', () => {
    const state = computeGuidance(
      input({ heading: facing(5, { reference: 'magnetic' }), declinationDeg: -15, location: standing(100, 350) }),
    );
    close(state.arrowDeg, 0);
  });

  it('does not silently treat an uncorrected magnetic heading as exact', () => {
    const corrected = computeGuidance(input({ heading: facing(0, { reference: 'magnetic' }), declinationDeg: 0 }));
    const uncorrected = computeGuidance(input({ heading: facing(0, { reference: 'magnetic' }), declinationDeg: null }));
    assert.equal(uncorrected.mode, 'arrow');
    assert.ok(uncorrected.issues.includes('magnetic-north'));
    assert.notEqual(uncorrected.compassQuality, 'good');
    assert.ok(uncorrected.spreadDeg! > corrected.spreadDeg!, 'the stated uncertainty must widen');
  });

  it('leaves a true-north heading alone', () => {
    const state = computeGuidance(input({ heading: facing(90, { reference: 'true' }), declinationDeg: 25 }));
    close(state.arrowDeg, 0);
  });
});

describe('unusable compass', () => {
  it('heading unavailable: distance only, no arrow', () => {
    const state = computeGuidance(input({ heading: null }));
    assert.equal(state.mode, 'distance-only');
    assert.equal(state.arrowDeg, null);
    assert.equal(state.live, false);
    assert.ok(state.issues.includes('compass-missing'));
    close(state.distanceM, 100, 0.1);
    close(state.bearingDeg, 90);
  });

  it('stale heading: no arrow', () => {
    const state = computeGuidance(input({ heading: facing(0, { timestampMs: NOW - 10_000 }) }));
    assert.equal(state.arrowDeg, null);
    assert.equal(state.compassQuality, 'stale');
    assert.ok(state.issues.includes('compass-stale'));
  });

  it('invalid heading (accuracy -1): no arrow, asks for calibration', () => {
    const state = computeGuidance(input({ heading: facing(0, { accuracyDeg: -1 }) }));
    assert.equal(state.arrowDeg, null);
    assert.ok(state.issues.includes('compass-uncalibrated'));
  });

  it('permission states are surfaced and never produce an arrow', () => {
    for (const [compass, issue] of [
      ['permission-needed', 'compass-permission'],
      ['denied', 'compass-denied'],
      ['unsupported', 'compass-unsupported'],
    ] as const) {
      // Even if an old sample is lying around, it must be ignored.
      const state = computeGuidance(input({ compass, heading: facing(0) }));
      assert.equal(state.arrowDeg, null, compass);
      assert.equal(state.live, false, compass);
      assert.ok(state.issues.includes(issue), compass);
    }
  });

  it('poor accuracy still points, but says so and widens the spread', () => {
    const good = computeGuidance(input());
    const poor = computeGuidance(input({ heading: facing(0, { accuracyDeg: 50 }) }));
    assert.equal(poor.mode, 'arrow');
    assert.equal(poor.compassQuality, 'poor');
    assert.ok(poor.issues.includes('compass-poor'));
    assert.ok(poor.spreadDeg! > good.spreadDeg!);
  });
});

describe('unusable position', () => {
  it('no fix: nothing is claimed', () => {
    const state = computeGuidance(input({ location: null }));
    assert.equal(state.mode, 'no-location');
    assert.equal(state.distanceM, null);
    assert.equal(state.arrowDeg, null);
    assert.equal(state.live, false);
    assert.ok(state.issues.includes('location-missing'));
  });

  it('invalid fix is treated as no fix', () => {
    for (const bad of [{ accuracyM: -1 }, { latitude: Number.NaN }, { latitude: 0, longitude: 0 }, { timestampMs: NOW + 600_000 }]) {
      const state = computeGuidance(input({ location: standing(100, 90, bad) }));
      assert.equal(state.mode, 'no-location', JSON.stringify(bad));
      assert.equal(state.distanceM, null);
    }
  });

  it('stale fix: last distance is shown as stale and the arrow is withheld', () => {
    const state = computeGuidance(input({ location: standing(100, 90, { timestampMs: NOW - 60_000 }) }));
    assert.equal(state.mode, 'distance-only');
    assert.equal(state.distanceIsStale, true);
    assert.equal(state.locationQuality, 'stale');
    assert.equal(state.arrowDeg, null);
    assert.equal(state.live, false);
    assert.equal(state.issues[0], 'location-stale');
  });

  it('weak signal far away: still points, flagged, with a wide spread', () => {
    const state = computeGuidance(input({ location: standing(600, 90, { accuracyM: 120 }) }));
    assert.equal(state.mode, 'arrow');
    assert.equal(state.locationQuality, 'poor');
    assert.ok(state.issues.includes('location-weak'));
    assert.ok(state.spreadDeg! > 11);
  });

  it('weak signal within its own error: neither an arrow nor a "near" claim', () => {
    const state = computeGuidance(input({ location: standing(60, 90, { accuracyM: 120 }) }));
    assert.equal(state.mode, 'distance-only');
    assert.equal(state.arrowDeg, null);
    assert.ok(state.issues.includes('location-weak'));
  });

  it('approximate (reduced accuracy) location is called out', () => {
    const state = computeGuidance(input({ location: standing(900, 90, { accuracyM: 3000 }) }));
    assert.ok(state.issues.includes('location-approximate'));
    assert.equal(state.arrowDeg, null);
    assert.notEqual(state.mode, 'near');
  });
});

describe('near the saved spot', () => {
  it('identical coordinates: near, no arrow, no bearing', () => {
    const state = computeGuidance(input({ location: { ...CAR, accuracyM: 5, timestampMs: NOW } }));
    assert.equal(state.mode, 'near');
    assert.equal(state.distanceM, 0);
    assert.equal(state.bearingDeg, null);
    assert.equal(state.arrowDeg, null);
  });

  it('uses the uncertainty of BOTH the saved spot and the current fix', () => {
    assert.equal(combinedUncertainty(3, 4), 5);
    // 14 m away. Spot ±5, fix ±5 -> 7.1 m combined, floor of 8 m: point at it.
    const tight = computeGuidance(input({ location: standing(14, 90) }));
    assert.equal(tight.mode, 'arrow');
    // Same distance, but the spot was saved at ±15 m -> 15.8 m combined: we are inside the noise.
    const looseSpot = computeGuidance(input({ target: { ...CAR, accuracyM: 15 }, location: standing(14, 90) }));
    assert.equal(looseSpot.mode, 'near');
    // Same distance, good spot, but the current fix is ±15 m.
    const looseFix = computeGuidance(input({ location: standing(14, 90, { accuracyM: 15 }) }));
    assert.equal(looseFix.mode, 'near');
    assert.equal(looseFix.arrowDeg, null);
  });

  it('never claims near inside a radius tighter than phones can deliver', () => {
    const state = computeGuidance(
      input({ target: { ...CAR, accuracyM: 1 }, location: standing(6, 90, { accuracyM: 1 }) }),
    );
    assert.equal(state.mode, 'near');
    assert.equal(state.nearRadiusM, 8);
  });

  it('does not flip-flop at the edge (hysteresis)', () => {
    const edge = standing(8.5, 90); // radius is 8 m here
    assert.equal(computeGuidance(input({ location: edge, wasNear: false })).mode, 'arrow');
    assert.equal(computeGuidance(input({ location: edge, wasNear: true })).mode, 'near');
    assert.equal(computeGuidance(input({ location: standing(20, 90), wasNear: true })).mode, 'arrow');
  });

  it('a GPS wobble around the spot cannot spin the arrow', () => {
    // Fixes scattered a few metres on every side of the car: the bearing swings wildly, the UI must not.
    for (let bearing = 0; bearing < 360; bearing += 45) {
      const state = computeGuidance(input({ location: standing(4, bearing), wasNear: true }));
      assert.equal(state.mode, 'near', `bearing ${bearing}`);
      assert.equal(state.arrowDeg, null);
    }
  });

  it('the direction spread grows as the distance approaches the uncertainty', () => {
    const far = computeGuidance(input({ location: standing(300, 90) }));
    const closer = computeGuidance(input({ location: standing(12, 90) }));
    assert.equal(closer.mode, 'arrow');
    assert.ok(closer.spreadDeg! > far.spreadDeg!);
    assert.ok(closer.spreadDeg! >= 30, `at 12 m with ±7 m the spread should be wide, got ${closer.spreadDeg}`);
  });

  it('an approximately saved spot is admitted as approximate', () => {
    const target = { ...CAR, accuracyM: 80 };
    const nearby = computeGuidance(input({ target, location: standing(40, 90) }));
    assert.equal(nearby.mode, 'near');
    assert.ok(nearby.issues.includes('spot-approximate'));
    const away = computeGuidance(input({ target, location: standing(400, 90) }));
    assert.equal(away.mode, 'arrow');
    assert.ok(away.issues.includes('spot-approximate'));
  });

  it('being near never depends on the compass', () => {
    const state = computeGuidance(input({ location: standing(3, 90), heading: null, compass: 'unsupported' }));
    assert.equal(state.mode, 'near');
  });
});

describe('simulation labelling', () => {
  it('marks the state when any reading is simulated', () => {
    assert.equal(computeGuidance(input()).simulated, false);
    assert.equal(computeGuidance(input({ heading: facing(0, { simulated: true }) })).simulated, true);
    assert.equal(computeGuidance(input({ location: standing(50, 0, { simulated: true }) })).simulated, true);
  });
});
