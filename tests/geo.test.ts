import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  arrowRotation,
  cardinalDirection,
  clockPosition,
  destinationPoint,
  distanceMeters,
  initialBearing,
  isValidCoordinate,
  normalizeDegrees,
  screenHeading,
  signedAngleDelta,
} from '../src/core/geo.ts';

const near = (actual: number | null, expected: number, tolerance: number, label = '') => {
  assert.ok(actual !== null, `${label} expected a number, got null`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} expected ${expected} ±${tolerance}, got ${actual}`);
};

// A car park in Cologne; any mid-latitude point works.
const here = { latitude: 50.9413, longitude: 6.9583 };

describe('angle wrapping', () => {
  it('wraps into [0, 360)', () => {
    assert.equal(normalizeDegrees(0), 0);
    assert.equal(normalizeDegrees(360), 0);
    assert.equal(normalizeDegrees(-1), 359);
    assert.equal(normalizeDegrees(725), 5);
    assert.equal(normalizeDegrees(-725), 355);
    assert.ok(Object.is(normalizeDegrees(-0), 0), 'no negative zero');
  });

  it('takes the shortest way round across north', () => {
    assert.equal(signedAngleDelta(359, 1), 2);
    assert.equal(signedAngleDelta(1, 359), -2);
    assert.equal(signedAngleDelta(350, 10), 20);
    assert.equal(signedAngleDelta(10, 350), -20);
    assert.equal(signedAngleDelta(90, 90), 0);
    assert.equal(signedAngleDelta(0, 180), 180);
    assert.equal(signedAngleDelta(720, -350), 10);
  });
});

describe('distance', () => {
  it('is zero for identical coordinates', () => {
    assert.equal(distanceMeters(here, here), 0);
  });

  it('matches one degree of latitude', () => {
    near(distanceMeters({ latitude: 0, longitude: 10 }, { latitude: 1, longitude: 10 }), 111_195, 5);
  });

  it('matches one degree of longitude at 60° north (half the equatorial length)', () => {
    near(distanceMeters({ latitude: 60, longitude: 0 }, { latitude: 60, longitude: 1 }), 55_597, 30);
  });

  it('matches a known city pair (Berlin to Munich, about 504 km)', () => {
    const berlin = { latitude: 52.52, longitude: 13.405 };
    const munich = { latitude: 48.1351, longitude: 11.582 };
    near(distanceMeters(berlin, munich), 504_000, 2_000);
  });

  it('is symmetric and resolves car-park scale distances', () => {
    const car = destinationPoint(here, 73, 42);
    near(distanceMeters(here, car), 42, 0.01);
    near(distanceMeters(car, here), 42, 0.01);
  });

  it('handles the antimeridian', () => {
    near(distanceMeters({ latitude: 0, longitude: 179.5 }, { latitude: 0, longitude: -179.5 }), 111_195, 5);
  });
});

describe('bearing', () => {
  it('is undefined for identical coordinates', () => {
    assert.equal(initialBearing(here, here), null);
  });

  it('points to the four cardinal directions', () => {
    near(initialBearing(here, destinationPoint(here, 0, 100)), 0, 0.01, 'north');
    near(initialBearing(here, destinationPoint(here, 90, 100)), 90, 0.01, 'east');
    near(initialBearing(here, destinationPoint(here, 180, 100)), 180, 0.01, 'south');
    near(initialBearing(here, destinationPoint(here, 270, 100)), 270, 0.01, 'west');
  });

  it('round-trips arbitrary bearings', () => {
    for (const bearing of [1, 37.5, 123, 181, 269, 359]) {
      near(initialBearing(here, destinationPoint(here, bearing, 250)), bearing, 0.01, `bearing ${bearing}`);
    }
  });

  it('works in the southern and western hemispheres', () => {
    const sydney = { latitude: -33.8688, longitude: 151.2093 };
    near(initialBearing(sydney, destinationPoint(sydney, 45, 80)), 45, 0.01);
    const lima = { latitude: -12.0464, longitude: -77.0428 };
    near(initialBearing(lima, destinationPoint(lima, 300, 80)), 300, 0.01);
  });

  it('crosses the antimeridian the short way', () => {
    near(initialBearing({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 }), 90, 0.01);
  });
});

describe('arrow direction', () => {
  const east = 90;

  it('car east, phone facing north -> arrow points right', () => {
    assert.equal(arrowRotation(east, 0), 90);
  });

  it('car east, phone facing east -> arrow points up', () => {
    assert.equal(arrowRotation(east, 90), 0);
  });

  it('car behind me -> arrow points down', () => {
    assert.equal(arrowRotation(east, 270), 180);
    assert.equal(arrowRotation(0, 180), 180);
  });

  it('car east, phone facing south -> arrow points left', () => {
    assert.equal(arrowRotation(east, 180), 270);
  });

  it('stays in range when the subtraction wraps', () => {
    assert.equal(arrowRotation(10, 350), 20);
    assert.equal(arrowRotation(350, 10), 340);
    assert.equal(arrowRotation(0, 359), 1);
  });

  it('turning the phone clockwise turns the arrow anticlockwise by the same amount', () => {
    for (let heading = 0; heading < 360; heading += 15) {
      assert.equal(arrowRotation(40, heading), normalizeDegrees(40 - heading));
    }
  });

  it('uses real coordinates end to end: car due east of me', () => {
    const car = destinationPoint(here, 90, 120);
    const bearing = initialBearing(here, car);
    assert.ok(bearing !== null);
    near(arrowRotation(bearing, 0), 90, 0.01, 'facing north');
    near(arrowRotation(bearing, 90) < 180 ? arrowRotation(bearing, 90) : arrowRotation(bearing, 90) - 360, 0, 0.01, 'facing east');
    near(arrowRotation(bearing, 270), 180, 0.01, 'facing west');
  });
});

describe('screen orientation', () => {
  it('portrait: top of screen is the top of the device', () => {
    assert.equal(screenHeading(123, 0), 123);
  });

  it('landscape: top of screen is offset by the screen angle', () => {
    // Phone turned anticlockwise (angle 90): the device top points left, the screen top points 90° further clockwise.
    assert.equal(screenHeading(0, 90), 90);
    // Phone turned clockwise (angle 270): the screen top points 90° anticlockwise of the device top.
    assert.equal(screenHeading(0, 270), 270);
    assert.equal(screenHeading(300, 90), 30);
  });

  it('the arrow keeps pointing at the car when the page rotates to landscape', () => {
    // Car due north. I hold the phone in portrait facing north, then turn the device 90° anticlockwise
    // into landscape while still facing north myself: the device top now points west (270).
    const portrait = arrowRotation(0, screenHeading(0, 0));
    const landscape = arrowRotation(0, screenHeading(270, 90));
    assert.equal(portrait, 0);
    assert.equal(landscape, 0);
  });
});

describe('helpers', () => {
  it('rejects impossible coordinates', () => {
    assert.equal(isValidCoordinate(here), true);
    assert.equal(isValidCoordinate({ latitude: 91, longitude: 0 }), false);
    assert.equal(isValidCoordinate({ latitude: 10, longitude: 181 }), false);
    assert.equal(isValidCoordinate({ latitude: Number.NaN, longitude: 5 }), false);
    assert.equal(isValidCoordinate({ latitude: 5, longitude: Number.POSITIVE_INFINITY }), false);
    assert.equal(isValidCoordinate({ latitude: 0, longitude: 0 }), false);
  });

  it('names compass directions and clock positions', () => {
    assert.equal(cardinalDirection(0), 'north');
    assert.equal(cardinalDirection(44), 'north-east');
    assert.equal(cardinalDirection(200), 'south');
    assert.equal(cardinalDirection(350), 'north');
    assert.equal(clockPosition(0), 12);
    assert.equal(clockPosition(90), 3);
    assert.equal(clockPosition(180), 6);
    assert.equal(clockPosition(270), 9);
    assert.equal(clockPosition(350), 12);
  });
});
