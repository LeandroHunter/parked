// Pure geographic and angle maths. No browser APIs, so everything here is unit-tested in Node.

export type Coordinate = {
  latitude: number;
  longitude: number;
};

/** IUGG mean Earth radius. Haversine on a sphere is within ~0.5 % of the ellipsoid, plenty for a car park. */
export const EARTH_RADIUS_M = 6_371_008.8;

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Wraps any angle into [0, 360). */
export function normalizeDegrees(degrees: number): number {
  const wrapped = degrees % 360;
  // `+ 0` turns -0 into 0 so callers never see a negative zero.
  return (wrapped < 0 ? wrapped + 360 : wrapped) + 0;
}

/**
 * Shortest signed rotation that takes `from` to `to`, in (-180, 180].
 * Positive is clockwise. 359 -> 1 is +2, never -358.
 */
export function signedAngleDelta(from: number, to: number): number {
  const delta = normalizeDegrees(to - from);
  return delta > 180 ? delta - 360 : delta;
}

export function isValidCoordinate(coordinate: Coordinate): boolean {
  const { latitude, longitude } = coordinate;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  // Exactly 0,0 is what broken location stacks report; nobody parks in the Gulf of Guinea.
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

/** Great-circle (straight-line over the ground) distance in metres. */
export function distanceMeters(from: Coordinate, to: Coordinate): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Initial true-north bearing from `from` to `to`, in [0, 360).
 * Returns null when the two points coincide, because the bearing is then undefined.
 */
export function initialBearing(from: Coordinate, to: Coordinate): number | null {
  if (from.latitude === to.latitude && from.longitude === to.longitude) return null;
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  if (y === 0 && x === 0) return null;
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

/** Point reached by travelling `distanceM` from `origin` on the given true bearing. */
export function destinationPoint(origin: Coordinate, bearingDeg: number, distanceM: number): Coordinate {
  const angular = distanceM / EARTH_RADIUS_M;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(origin.latitude);
  const lon1 = toRadians(origin.longitude);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    latitude: toDegrees(lat2),
    longitude: ((toDegrees(lon2) + 540) % 360) - 180,
  };
}

/**
 * Heading of the top edge of the *screen*, given the heading of the top edge of the *device*.
 *
 * The compass reports where the top of the phone (in portrait) points. When the page is shown in
 * landscape the top of the screen is a different physical edge, offset by the screen rotation angle
 * (`screen.orientation.angle`: 0 portrait, 90 when the phone is turned anticlockwise, 270 clockwise).
 */
export function screenHeading(deviceHeadingDeg: number, screenAngleDeg: number): number {
  return normalizeDegrees(deviceHeadingDeg + screenAngleDeg);
}

/**
 * Screen-relative rotation for the arrow, clockwise from the top of the screen, in [0, 360).
 * 0 = straight ahead (up), 90 = to the right, 180 = behind (down), 270 = to the left.
 *
 * Both angles must use the same north reference (true north here).
 */
export function arrowRotation(bearingToTargetDeg: number, screenHeadingDeg: number): number {
  return normalizeDegrees(bearingToTargetDeg - screenHeadingDeg);
}

const CARDINALS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;

export function cardinalDirection(bearingDeg: number): (typeof CARDINALS)[number] {
  const index = Math.round(normalizeDegrees(bearingDeg) / 45) % 8;
  return CARDINALS[index] ?? 'north';
}

/** Clock position (1–12) for a screen-relative angle; used for VoiceOver, where "2 o'clock" beats "62 degrees". */
export function clockPosition(arrowDeg: number): number {
  const hour = Math.round(normalizeDegrees(arrowDeg) / 30) % 12;
  return hour === 0 ? 12 : hour;
}
