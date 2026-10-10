import { formatAccuracy, formatDistance, type UnitSystem } from '../core/format.ts';
import { cardinalDirection, clockPosition, distanceMeters } from '../core/geo.ts';
import { computeGuidance, type GuidanceIssue, type GuidanceState } from '../core/guidance.ts';
import type { HeadingSample, LocationSample } from '../core/readings.ts';
import type { ParkingSession } from '../core/session.ts';
import { AngleSmoother } from '../core/smoothing.ts';
import { decimalYear, magneticDeclination } from '../core/wmm.ts';
import { currentScreenAngle, type CompassSource } from '../platform/compass.ts';
import type { ScreenWake } from '../platform/device.ts';
import type { LocationFailure, LocationSource } from '../platform/location.ts';
import { byId, setAttr, setHidden, setText, svgById } from './dom.ts';
import { language, t } from './language.ts';

export type GuideDependencies = {
  location: LocationSource;
  compass: CompassSource;
  wake: ScreenWake;
  units: UnitSystem;
  onBack(): void;
  onFound(): void;
  onOpenMap(): void;
  onOpenPhoto(): void;
};

/** How long we say "finding you…" before admitting there is no signal. */
const LOCATION_GRACE_MS = 10_000;
const COMPASS_GRACE_MS = 3_500;
/** Below this height the dial is unreadable, so it is hidden and the text carries the screen. */
const DIAL_MIN_READABLE_PX = 96;
/** Recompute declination only after moving this far; it changes by a fraction of a degree per 100 km. */
const DECLINATION_REFRESH_M = 25_000;
/** Beyond this spread the arrow is drawn as an outline: a rough direction, not a pointer. */
const ROUGH_SPREAD_DEG = 40;

/** Most important first: the single line of advice shown under the readout. */
const ISSUE_PRIORITY: GuidanceIssue[] = [
  'location-missing',
  'location-stale',
  'location-approximate',
  'compass-permission',
  'compass-denied',
  'location-weak',
  'compass-uncalibrated',
  'compass-stale',
  'compass-missing',
  'compass-unsupported',
  'compass-poor',
  'spot-approximate',
  'magnetic-north',
];

const COMPASS_ISSUES = new Set<GuidanceIssue>([
  'compass-permission',
  'compass-denied',
  'compass-uncalibrated',
  'compass-stale',
  'compass-missing',
  'compass-unsupported',
  'compass-poor',
  'magnetic-north',
]);

function arcPath(radius: number, halfAngleDeg: number): string {
  const half = (Math.min(halfAngleDeg, 179) * Math.PI) / 180;
  const x = radius * Math.sin(half);
  const y = -radius * Math.cos(half);
  const large = halfAngleDeg > 90 ? 1 : 0;
  return `M${(-x).toFixed(1)} ${y.toFixed(1)}A${radius} ${radius} 0 ${large} 1 ${x.toFixed(1)} ${y.toFixed(1)}`;
}

/**
 * The "Find my car" screen. Sensors run only while this view is open AND the page is visible.
 * Every frame it asks the pure guidance engine what may be shown and renders exactly that.
 */
export class GuideView {
  private readonly deps: GuideDependencies;
  private readonly view = byId('guide');
  private readonly dial = byId('dial');
  private readonly ring = svgById('dial-ring');
  private readonly arrow = svgById('dial-arrow');
  private readonly spread = svgById('dial-spread');
  private readonly caption = byId('dial-caption');
  private readonly simBadge = byId('dial-sim');
  private readonly distance = byId('distance');
  private readonly distanceValue = byId('distance-value');
  private readonly distanceUnit = byId('distance-unit');
  private readonly distanceCaption = byId('distance-caption');
  private readonly signalLocation = byId('signal-location');
  private readonly signalLocationText = byId('signal-location-text');
  private readonly signalCompass = byId('signal-compass');
  private readonly signalCompassText = byId('signal-compass-text');
  private readonly advice = byId('advice');
  private readonly adviceText = byId('advice-text');
  private readonly enableCompass = byId<HTMLButtonElement>('compass-enable');
  private readonly announcer = byId('guide-announcer');
  private readonly mapsLink = byId<HTMLAnchorElement>('maps-link');

  private readonly arrowSmoother = new AngleSmoother(140, 60);
  private readonly ringSmoother = new AngleSmoother(140, 60);

  private session: ParkingSession | null = null;
  private running = false;
  private frame: number | null = null;
  private lastFrameAt = 0;
  private startedAt = 0;
  private location: LocationSample | null = null;
  private heading: HeadingSample | null = null;
  private failure: LocationFailure | null = null;
  private declination: { degrees: number; at: LocationSample } | null = null;
  private wasNear = false;
  private lastMode: string | null = null;
  private lastSpread = '';

  constructor(deps: GuideDependencies) {
    this.deps = deps;
    this.drawTicks();

    // The dial flexes to fit the screen. If advice text leaves it only a sliver, hide it.
    new ResizeObserver(([entry]) => {
      const height = entry?.contentRect.height ?? 0;
      this.dial.toggleAttribute('data-tiny', height > 0 && height < DIAL_MIN_READABLE_PX);
    }).observe(this.dial);

    byId('guide-back').addEventListener('click', () => deps.onBack());
    byId('guide-found').addEventListener('click', () => deps.onFound());
    byId('guide-map').addEventListener('click', () => deps.onOpenMap());
    byId('guide-photo').addEventListener('click', () => deps.onOpenPhoto());
    this.enableCompass.addEventListener('click', () => {
      // Called straight from the tap so iOS will show its motion-access prompt.
      void deps.compass.requestAccess();
    });

    document.addEventListener('visibilitychange', () => {
      if (!this.session) return;
      if (document.visibilityState === 'visible') this.startSensors();
      else this.stopSensors();
    });
    // Restored from the back/forward cache: treat like coming back from the background.
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && this.session && document.visibilityState === 'visible') this.startSensors();
    });
  }

  get isOpen(): boolean {
    return this.session !== null;
  }

  /** Most recent valid-looking fix, for the map sheet. May be stale; the map labels it by position only. */
  get latestLocation(): LocationSample | null {
    return this.location;
  }

  open(session: ParkingSession, photoUrl: string | null): void {
    this.session = session;
    this.renderSpot(session, photoUrl);
    this.mapsLink.href =
      `https://maps.apple.com/directions?destination=${session.latitude.toFixed(6)},${session.longitude.toFixed(6)}&mode=walking`;
    this.view.hidden = false;
    this.startSensors();
    byId('guide-back').focus({ preventScroll: true });
  }

  close(): void {
    this.stopSensors();
    this.session = null;
    this.view.hidden = true;
  }

  /** Refreshes the note/photo block after details were edited elsewhere. */
  renderSpot(session: ParkingSession, photoUrl: string | null): void {
    if (this.session) this.session = session;
    const facts = byId('guide-facts');
    facts.replaceChildren();
    for (const [label, value] of [[t('facts.level'), session.level], [t('facts.note'), session.note]] as const) {
      if (!value) continue;
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      row.append(term, detail);
      facts.append(row);
    }
    const photo = byId<HTMLButtonElement>('guide-photo');
    photo.hidden = !photoUrl;
    const image = photo.querySelector('img');
    if (image && photoUrl) image.src = photoUrl;
    byId('guide-spot').hidden = !photoUrl && !session.level && !session.note;
  }

  // ---- sensors -------------------------------------------------------------------------------

  /**
   * (Re)starts everything from scratch. Old readings are thrown away first, so after returning
   * from the background the arrow only comes back once genuinely fresh readings have arrived.
   */
  private startSensors(): void {
    this.stopSensors();
    if (!this.session) return;
    this.running = true;
    this.startedAt = Date.now();
    this.location = null;
    this.heading = null;
    this.failure = null;
    this.wasNear = false;
    this.arrowSmoother.reset();
    this.ringSmoother.reset();

    this.deps.location.start(
      (sample) => {
        this.location = sample;
        this.failure = null;
        this.updateDeclination(sample);
      },
      (failure) => {
        this.failure = failure;
      },
    );
    this.deps.compass.start((sample) => {
      this.heading = sample;
    });
    void this.deps.wake.acquire();

    this.lastFrameAt = performance.now();
    const loop = (time: number) => {
      if (!this.running) return;
      this.render(time);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  private stopSensors(): void {
    this.running = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.deps.location.stop();
    this.deps.compass.stop();
    this.deps.wake.release();
  }

  private updateDeclination(sample: LocationSample): void {
    if (this.declination && distanceMeters(this.declination.at, sample) < DECLINATION_REFRESH_M) return;
    if (!Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude)) return;
    const result = magneticDeclination(sample.latitude, sample.longitude, decimalYear(new Date()));
    if (Number.isFinite(result.degrees)) this.declination = { degrees: result.degrees, at: sample };
  }

  // ---- rendering -----------------------------------------------------------------------------

  private render(time: number): void {
    const session = this.session;
    if (!session) return;
    const dt = time - this.lastFrameAt;
    this.lastFrameAt = time;
    const now = Date.now();

    const state = computeGuidance({
      nowMs: now,
      target: session,
      location: this.location,
      heading: this.heading,
      compass: this.deps.compass.availability(),
      declinationDeg: this.declination?.degrees ?? null,
      screenAngleDeg: currentScreenAngle(),
      wasNear: this.wasNear,
    });
    this.wasNear = state.mode === 'near';

    // The two rotations are the only things that change every frame.
    if (state.arrowDeg !== null) {
      this.arrow.setAttribute('transform', `rotate(${this.arrowSmoother.update(state.arrowDeg, dt).toFixed(2)})`);
    } else {
      this.arrowSmoother.reset();
    }
    if (state.northDeg !== null) {
      this.ring.setAttribute('transform', `rotate(${this.ringSmoother.update(state.northDeg, dt).toFixed(2)})`);
    } else {
      this.ringSmoother.reset();
    }

    this.renderReadout(state, now);
  }

  private renderReadout(state: GuidanceState, now: number): void {
    const elapsed = now - this.startedAt;
    const locating = state.mode === 'no-location' && this.failure === null && elapsed < LOCATION_GRACE_MS;
    const compassSettling = elapsed < COMPASS_GRACE_MS;

    // ---- dial
    const dialMode = state.mode === 'arrow' ? 'arrow' : state.mode === 'near' ? 'near' : 'off';
    setAttr(this.dial, 'data-mode', dialMode);
    setAttr(this.dial, 'data-north', state.northDeg !== null ? '' : null);
    setAttr(this.dial, 'data-rough', state.spreadDeg !== null && state.spreadDeg > ROUGH_SPREAD_DEG ? '' : null);
    setHidden(this.simBadge, !state.simulated);

    const spreadKey = state.spreadDeg === null ? '' : String(Math.round(state.spreadDeg / 2) * 2);
    if (spreadKey !== this.lastSpread) {
      this.lastSpread = spreadKey;
      this.spread.setAttribute('d', spreadKey === '' ? '' : arcPath(144, Number(spreadKey)));
    }

    let caption = '';
    if (dialMode === 'off') {
      if (locating) caption = t('dial.finding');
      else if (state.mode === 'no-location') caption = t(this.failure === 'denied' ? 'dial.locationOff' : 'dial.noLocation');
      else if (state.issues.includes('compass-permission')) caption = t('dial.compassOff');
      else if (state.issues.includes('compass-missing') && compassSettling) caption = t('dial.readingCompass');
      else caption = t('dial.noDirection');
    }
    setText(this.caption, caption);

    // ---- distance
    const units = this.deps.units;
    const lang = language();
    let phrase = false;
    if (state.mode === 'near') {
      phrase = true;
      setText(this.distanceValue, t('near.title'));
      setText(this.distanceUnit, '');
      const radius = formatDistance(Math.ceil((state.nearRadiusM ?? 10) / 5) * 5, 99, units, lang);
      setText(this.distanceCaption, t('near.caption', { distance: `${radius.value}\u00a0${radius.unit}` }));
    } else if (state.distanceM !== null) {
      const text = formatDistance(state.distanceM, state.uncertaintyM ?? 0, units, lang);
      // With a weak or out-of-date fix the number is a rough figure, and is marked as one.
      const rough = state.locationQuality === 'poor' || state.locationQuality === 'stale';
      setText(this.distanceValue, rough ? `≈${text.value}` : text.value);
      setText(this.distanceUnit, text.unit);
      if (state.distanceIsStale && this.location) {
        const seconds = Math.round((now - this.location.timestampMs) / 1000);
        const age =
          seconds < 90 ? t('age.seconds', { count: seconds }) : t('age.minutes', { count: Math.round(seconds / 60) });
        setText(this.distanceCaption, t('distance.stale', { age }));
      } else if (state.mode === 'distance-only' && state.bearingDeg !== null) {
        const direction = t(`cardinal.${cardinalDirection(state.bearingDeg)}`);
        setText(this.distanceCaption, t('distance.straightTo', { direction }));
      } else {
        setText(this.distanceCaption, t('distance.straight'));
      }
    } else {
      setText(this.distanceValue, '–');
      setText(this.distanceUnit, '');
      setText(this.distanceCaption, t(locating ? 'distance.locating' : 'distance.unknown'));
    }
    this.distance.classList.toggle('is-phrase', phrase);
    this.distance.classList.toggle('is-stale', state.distanceIsStale);

    // ---- signal meters
    const quality = { good: '3', fair: '2', poor: '1', stale: '0', none: '0' } as const;
    setAttr(this.signalLocation, 'data-level', quality[state.locationQuality]);
    setText(
      this.signalLocationText,
      state.locationQuality === 'none'
        ? t(locating ? 'signal.locating' : 'signal.noLocation')
        : state.locationQuality === 'stale'
          ? t('signal.locationStale')
          : t('signal.location', { accuracy: formatAccuracy(state.locationAccuracyM ?? 0, units, lang) }),
    );
    setAttr(this.signalCompass, 'data-level', quality[state.compassQuality]);
    const compassOff =
      state.issues.includes('compass-permission') ||
      state.issues.includes('compass-denied') ||
      state.issues.includes('compass-unsupported');
    setText(
      this.signalCompassText,
      compassOff
        ? t('signal.compassOff')
        : state.compassQuality === 'none'
          ? t(compassSettling ? 'signal.readingCompass' : 'signal.noCompass')
          : state.compassQuality === 'stale'
            ? t('signal.compassStopped')
            : t(`signal.compass.${state.compassQuality}`),
    );

    // ---- one line of advice
    const issue = ISSUE_PRIORITY.find((candidate) => {
      if (!state.issues.includes(candidate)) return false;
      // Near the spot the compass no longer matters, so do not nag about it.
      if (state.mode === 'near' && COMPASS_ISSUES.has(candidate)) return false;
      if (candidate === 'location-missing' && locating) return false;
      if (candidate === 'compass-missing' && compassSettling) return false;
      return true;
    });
    const advice = issue ? this.adviceFor(issue, state) : '';
    setHidden(this.advice, advice === '');
    setText(this.adviceText, advice);
    setHidden(this.enableCompass, issue !== 'compass-permission');

    // ---- VoiceOver
    setAttr(this.dial, 'aria-label', this.describe(state, locating));
    const modeKey = `${state.mode}:${issue ?? ''}:${lang}`;
    if (modeKey !== this.lastMode) {
      const first = this.lastMode === null;
      this.lastMode = modeKey;
      // Announce changes of situation, not every movement of the arrow.
      if (!first || state.mode === 'near') {
        setText(this.announcer, state.mode === 'near' ? t('spoken.nearShort') : advice);
      }
    }
  }

  private adviceFor(issue: GuidanceIssue, state: GuidanceState): string {
    switch (issue) {
      case 'location-missing':
        if (this.failure === 'denied') return t('advice.location.denied');
        if (this.failure === 'insecure') return t('advice.location.insecure');
        if (this.failure === 'unsupported') return t('advice.location.unsupported');
        return t('advice.location.missing');
      case 'location-stale':
        return t('advice.location.stale');
      case 'location-approximate':
        return t('advice.location.approximate');
      case 'location-weak':
        return t('advice.location.weak', {
          accuracy: formatAccuracy(state.locationAccuracyM ?? 0, this.deps.units, language()),
        });
      case 'spot-approximate':
        return t('advice.spot.approximate');
      case 'compass-permission':
        return t('advice.compass.permission');
      case 'compass-denied':
        return t('advice.compass.denied');
      case 'compass-unsupported':
        return t('advice.compass.unsupported');
      case 'compass-missing':
        return t('advice.compass.missing');
      case 'compass-stale':
        return t('advice.compass.stale');
      case 'compass-uncalibrated':
        return t('advice.compass.uncalibrated');
      case 'compass-poor':
        return t('advice.compass.poor');
      case 'magnetic-north':
        return t('advice.compass.magnetic');
    }
  }

  private describe(state: GuidanceState, locating: boolean): string {
    if (state.mode === 'near') return t('spoken.near');
    if (state.distanceM === null) return t(locating ? 'spoken.finding' : 'spoken.noLocation');
    const distance = formatDistance(state.distanceM, state.uncertaintyM ?? 0, this.deps.units, language()).spoken;
    if (state.arrowDeg === null) return t('spoken.noDirection', { distance });
    const rough = state.spreadDeg !== null && state.spreadDeg > ROUGH_SPREAD_DEG;
    return t(rough ? 'spoken.arrowRough' : 'spoken.arrow', { hour: clockPosition(state.arrowDeg), distance });
  }

  private drawTicks(): void {
    const group = svgById('dial-ticks');
    const namespace = 'http://www.w3.org/2000/svg';
    for (let angle = 0; angle < 360; angle += 5) {
      const major = angle % 30 === 0;
      const tick = document.createElementNS(namespace, 'line');
      tick.setAttribute('x1', '0');
      tick.setAttribute('x2', '0');
      tick.setAttribute('y1', '-132');
      tick.setAttribute('y2', major ? '-120' : '-126');
      tick.setAttribute('transform', `rotate(${angle})`);
      tick.setAttribute('class', major ? 'dial-tick dial-tick-major' : 'dial-tick');
      group.append(tick);
    }
  }
}
