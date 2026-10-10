import { G, G_DOT, H, H_DOT, WMM_EPOCH, WMM_MAX_DEGREE, WMM_VALID_FROM, WMM_VALID_UNTIL } from './wmm-coefficients.ts';

// Magnetic declination from the World Magnetic Model.
//
// Why this exists: Safari's compass (`webkitCompassHeading`) is referenced to MAGNETIC north, while
// a bearing computed from two GPS coordinates is referenced to TRUE north. Subtracting one from the
// other without this correction would leave the arrow off by the local declination (about 3-4° in
// western Germany, over 15° in parts of North America), and nobody would be told.

const WGS84_A_KM = 6378.137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const GEOMAGNETIC_RADIUS_KM = 6371.2;

export type Declination = {
  /** Degrees to add to a magnetic heading to get a true heading. East is positive. */
  degrees: number;
  /** False once the date is outside the model's official validity window (it is then extrapolated). */
  withinValidity: boolean;
};

export function decimalYear(date: Date): number {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (date.getTime() - start) / (end - start);
}

function index(n: number, m: number): number {
  return (n * (n + 1)) / 2 + m;
}

/**
 * Magnetic declination at a point.
 * @param latitude geodetic latitude in degrees
 * @param longitude longitude in degrees
 * @param year decimal year, e.g. 2026.78
 * @param altitudeKm height above the WGS84 ellipsoid; ground level is fine for a car park
 */
export function magneticDeclination(latitude: number, longitude: number, year: number, altitudeKm = 0): Declination {
  const phi = (latitude * Math.PI) / 180;
  const lambda = (longitude * Math.PI) / 180;

  // Geodetic -> geocentric spherical coordinates.
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const primeVertical = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  const p = (primeVertical + altitudeKm) * cosPhi;
  const z = (primeVertical * (1 - WGS84_E2) + altitudeKm) * sinPhi;
  const r = Math.hypot(p, z);
  const phiPrime = Math.asin(z / r);

  // Colatitude terms. Clamp sin(theta) away from zero so the poles do not divide by zero.
  const cosTheta = Math.sin(phiPrime);
  const sinTheta = Math.max(Math.cos(phiPrime), 1e-10);

  // Schmidt semi-normalised associated Legendre functions and their derivatives w.r.t. colatitude.
  const size = index(WMM_MAX_DEGREE, WMM_MAX_DEGREE) + 1;
  const P = new Float64Array(size);
  const dP = new Float64Array(size);
  P[0] = 1;
  dP[0] = 0;
  for (let n = 1; n <= WMM_MAX_DEGREE; n++) {
    for (let m = 0; m <= n; m++) {
      const i = index(n, m);
      if (n === m) {
        const prev = index(n - 1, n - 1);
        const factor = n === 1 ? 1 : Math.sqrt(1 - 1 / (2 * n));
        P[i] = factor * sinTheta * P[prev]!;
        dP[i] = factor * (sinTheta * dP[prev]! + cosTheta * P[prev]!);
      } else {
        const a = index(n - 1, m);
        const root = Math.sqrt(n * n - m * m);
        // The n-2 term only exists when m <= n-2.
        const hasB = m <= n - 2;
        const b = hasB ? index(n - 2, m) : 0;
        const k = hasB ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0;
        P[i] = ((2 * n - 1) * cosTheta * P[a]! - k * (hasB ? P[b]! : 0)) / root;
        dP[i] = ((2 * n - 1) * (cosTheta * dP[a]! - sinTheta * P[a]!) - k * (hasB ? dP[b]! : 0)) / root;
      }
    }
  }

  const dt = year - WMM_EPOCH;
  const ratio = GEOMAGNETIC_RADIUS_KM / r;
  let north = 0; // X' in the geocentric frame
  let east = 0; // Y'
  let down = 0; // Z'
  let power = ratio * ratio; // (a/r)^(n+2), starting at n = 0
  for (let n = 1; n <= WMM_MAX_DEGREE; n++) {
    power *= ratio;
    let sumNorth = 0;
    let sumEast = 0;
    let sumDown = 0;
    for (let m = 0; m <= n; m++) {
      const i = index(n, m);
      const g = G[i]! + dt * G_DOT[i]!;
      const h = H[i]! + dt * H_DOT[i]!;
      const cosM = Math.cos(m * lambda);
      const sinM = Math.sin(m * lambda);
      sumNorth += (g * cosM + h * sinM) * dP[i]!;
      sumEast += m * (g * sinM - h * cosM) * P[i]!;
      sumDown += (g * cosM + h * sinM) * P[i]!;
    }
    north += power * sumNorth;
    east += (power * sumEast) / sinTheta;
    down -= (n + 1) * power * sumDown;
  }

  // Rotate from the geocentric frame back to the geodetic (local north/east/down) frame.
  const psi = phiPrime - phi;
  const x = north * Math.cos(psi) - down * Math.sin(psi);
  const y = east;

  return {
    degrees: (Math.atan2(y, x) * 180) / Math.PI,
    withinValidity: year >= WMM_VALID_FROM - 0.25 && year < WMM_VALID_UNTIL,
  };
}
