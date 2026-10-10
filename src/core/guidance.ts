import {
  arrowRotation,
  distanceMeters,
  initialBearing,
  normalizeDegrees,
  screenHeading,
  toDegrees,
  type Coordinate,
} from './geo.ts';
import {
  APPROXIMATE_LOCATION_M,
  WEAK_LOCATION_M,
  checkHeading,
  checkLocation,
  headingQuality,
  locationQuality,
  type HeadingSample,
  type LocationSample,
  type Quality,
} from './readings.ts';

// The guidance engine: one pure function from "what the sensors say right now" to "what the screen
// is allowed to claim". All honesty rules (stale data, weak signal, near-the-spot ambiguity) live here.

export type CompassAvailability =
  /** Readings may arrive; whether they are usable is judged per sample. */
  | 'ok'
  /** iOS needs a tap before it will hand over compass data. */
  | 'permission-needed'
  | 'denied'
  /** This device or browser has no compass. */
  | 'unsupported';

export type GuidanceIssue =
  | 'location-missing'
  | 'location-stale'
  | 'location-weak'
  | 'location-approximate'
  | 'spot-approximate'
  | 'compass-permission'
  | 'compass-denied'
  | 'compass-unsupported'
  | 'compass-missing'
  | 'compass-stale'
  | 'compass-uncalibrated'
  | 'compass-poor'
  | 'magnetic-north';

export type GuidanceMode =
  /** No usable position: nothing can be claimed. */
  | 'no-location'
  /** Within the positioning uncertainty of the spot: no arrow, "near your saved spot". */
  | 'near'
  /** A direction can be shown. */
  | 'arrow'
  /** Distance is known but a trustworthy direction is not. */
  | 'distance-only';

export type GuidanceInput = {
  nowMs: number;
  target: Coordinate & { accuracyM: number };
  location: LocationSample | null;
  heading: HeadingSample | null;
  compass: CompassAvailability;
  /** Degrees to add to a magnetic heading to get true north; null when it could not be worked out. */
  declinationDeg: number | null;
  /** `screen.orientation.angle`: how far the page is rotated from the device's portrait orientation. */
  screenAngleDeg: number;
  /** Whether the previous result was 'near'; gives the near zone some hysteresis. */
  wasNear: boolean;
};

export type GuidanceState = {
  mode: GuidanceMode;
  /** Straight-line distance, or null when there is no usable position. */
  distanceM: number | null;
  /** True when `distanceM` comes from an out-of-date fix. */
  distanceIsStale: boolean;
  /** Combined uncertainty of the saved spot and the current fix, in metres. */
  uncertaintyM: number | null;
  /** Radius inside which we say "near" instead of pointing. */
  nearRadiusM: number | null;
  /** True-north bearing to the car. */
  bearingDeg: number | null;
  /** Arrow rotation clockwise from the top of the screen. Null whenever no arrow may be shown. */
  arrowDeg: number | null;
  /** Where north is, clockwise from the top of the screen (for the compass ring). */
  northDeg: number | null;
  /** Half-width of the direction uncertainty, in degrees. */
  spreadDeg: number | null;
  /** The arrow is driven by fresh, valid position and compass readings. */
  live: boolean;
  locationQuality: Quality | 'stale' | 'none';
  locationAccuracyM: number | null;
  compassQuality: Quality | 'stale' | 'none';
  compassAccuracyDeg: number | null;
  issues: GuidanceIssue[];
  /** Any reading involved came from the debug simulator. */
  simulated: boolean;
};

/** Never claim "near" inside a radius smaller than this; phones are not that good. */
export const MIN_NEAR_RADIUS_M = 8;
/** Extra angular doubt added when the heading could not be corrected to true north. */
const UNCORRECTED_NORTH_PENALTY_DEG = 10;
const UNKNOWN_HEADING_ACCURACY_DEG = 20;

export function combinedUncertainty(spotAccuracyM: number, fixAccuracyM: number): number {
  return Math.hypot(spotAccuracyM, fixAccuracyM);
}

function emptyState(issues: GuidanceIssue[], simulated: boolean): GuidanceState {
  return {
    mode: 'no-location',
    distanceM: null,
    distanceIsStale: false,
    uncertaintyM: null,
    nearRadiusM: null,
    bearingDeg: null,
    arrowDeg: null,
    northDeg: null,
    spreadDeg: null,
    live: false,
    locationQuality: 'none',
    locationAccuracyM: null,
    compassQuality: 'none',
    compassAccuracyDeg: null,
    issues,
    simulated,
  };
}

export function computeGuidance(input: GuidanceInput): GuidanceState {
  const { nowMs, target, location, heading } = input;
  const simulated = Boolean(location?.simulated || heading?.simulated);
  const issues: GuidanceIssue[] = [];

  // ---- Compass --------------------------------------------------------------------------------
  let headingTrueDeg: number | null = null;
  let headingAccuracyDeg: number | null = null;
  let compassQuality: GuidanceState['compassQuality'] = 'none';
  let headingFresh = false;
  let uncorrectedNorth = false;

  if (input.compass === 'permission-needed') issues.push('compass-permission');
  else if (input.compass === 'denied') issues.push('compass-denied');
  else if (input.compass === 'unsupported') issues.push('compass-unsupported');
  else {
    const check = checkHeading(heading, nowMs);
    if (check === 'missing') issues.push('compass-missing');
    else if (check === 'invalid') issues.push('compass-uncalibrated');
    else if (check === 'stale') {
      compassQuality = 'stale';
      issues.push('compass-stale');
    } else if (heading) {
      headingFresh = true;
      headingAccuracyDeg = heading.accuracyDeg;
      compassQuality = headingQuality(heading.accuracyDeg);
      if (heading.reference === 'true') {
        headingTrueDeg = heading.headingDeg;
      } else if (input.declinationDeg !== null && Number.isFinite(input.declinationDeg)) {
        headingTrueDeg = heading.headingDeg + input.declinationDeg;
      } else {
        // Usable, but we say so rather than pretending magnetic north is true north.
        headingTrueDeg = heading.headingDeg;
        uncorrectedNorth = true;
        issues.push('magnetic-north');
        if (compassQuality === 'good') compassQuality = 'fair';
      }
      if (compassQuality === 'poor') issues.push('compass-poor');
    }
  }

  const topOfScreenDeg = headingTrueDeg === null ? null : screenHeading(headingTrueDeg, input.screenAngleDeg);
  const northDeg = topOfScreenDeg === null ? null : normalizeDegrees(-topOfScreenDeg);

  // ---- Position -------------------------------------------------------------------------------
  const locationCheck = checkLocation(location, nowMs);
  if (locationCheck === 'missing' || locationCheck === 'invalid' || !location) {
    const state = emptyState(['location-missing', ...issues], simulated);
    state.compassQuality = compassQuality;
    state.compassAccuracyDeg = headingAccuracyDeg;
    state.northDeg = northDeg;
    return state;
  }

  const locationFresh = locationCheck === 'ok';
  const distanceM = distanceMeters(location, target);
  const bearingDeg = initialBearing(location, target);
  const uncertaintyM = combinedUncertainty(target.accuracyM, location.accuracyM);
  const nearRadiusM = Math.max(MIN_NEAR_RADIUS_M, uncertaintyM);
  const weakFix = location.accuracyM > WEAK_LOCATION_M;

  const state: GuidanceState = {
    mode: 'distance-only',
    distanceM,
    distanceIsStale: !locationFresh,
    uncertaintyM,
    nearRadiusM,
    bearingDeg,
    arrowDeg: null,
    northDeg,
    spreadDeg: null,
    live: false,
    locationQuality: locationFresh ? locationQuality(location.accuracyM) : 'stale',
    locationAccuracyM: location.accuracyM,
    compassQuality,
    compassAccuracyDeg: headingAccuracyDeg,
    issues,
    simulated,
  };

  if (!locationFresh) {
    // The last distance is still worth showing, clearly marked, but nothing may point anywhere.
    issues.unshift('location-stale');
    return state;
  }

  if (location.accuracyM > APPROXIMATE_LOCATION_M) issues.unshift('location-approximate');
  else if (weakFix) issues.unshift('location-weak');

  // ---- Near the spot --------------------------------------------------------------------------
  // Inside the combined uncertainty the bearing is noise: a one-metre GPS wobble can flip it by 180°.
  // The exit threshold is wider than the entry one so the screen does not flicker at the edge.
  const nearThresholdM = input.wasNear ? nearRadiusM * 1.25 + 3 : nearRadiusM;
  if (distanceM <= nearThresholdM) {
    if (weakFix) {
      // We might be close, but with a fix this vague "near" would be a guess.
      state.mode = 'distance-only';
    } else {
      state.mode = 'near';
      if (target.accuracyM > WEAK_LOCATION_M) issues.push('spot-approximate');
    }
    return state;
  }

  if (target.accuracyM > WEAK_LOCATION_M && target.accuracyM >= location.accuracyM) issues.push('spot-approximate');

  // ---- Direction ------------------------------------------------------------------------------
  if (bearingDeg === null || topOfScreenDeg === null || !headingFresh) {
    state.mode = 'distance-only';
    return state;
  }

  const positionSpreadDeg = toDegrees(Math.atan2(uncertaintyM, distanceM));
  const compassSpreadDeg =
    (headingAccuracyDeg ?? UNKNOWN_HEADING_ACCURACY_DEG) + (uncorrectedNorth ? UNCORRECTED_NORTH_PENALTY_DEG : 0);

  state.mode = 'arrow';
  state.arrowDeg = arrowRotation(bearingDeg, topOfScreenDeg);
  state.spreadDeg = Math.min(90, Math.max(4, Math.hypot(positionSpreadDeg, compassSpreadDeg)));
  state.live = true;
  return state;
}
