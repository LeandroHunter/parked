import { DEFAULT_ACQUISITION, FixCollector } from './core/acquisition.ts';
import { formatAccuracy, formatElapsed, unitSystemFor } from './core/format.ts';
import { isValidCoordinate, type Coordinate } from './core/geo.ts';
import type { LocationSample } from './core/readings.ts';
import { MANUAL_PIN_ACCURACY_M, type ParkingSession } from './core/session.ts';
import { CorruptSessionError, ParkingStore, type NewSpot } from './core/store.ts';
import { BrowserCompass, type CompassSource } from './platform/compass.ts';
import { ScreenWake, haptic, isAppleMobile, isInstalled } from './platform/device.ts';
import { BrowserLocation, type LocationFailure, type LocationSource } from './platform/location.ts';
import { IndexedDbBackend, requestPersistentStorage } from './platform/storage.ts';
import { byId, confirmSheet, openSheet, svgById, toast } from './ui/dom.ts';
import { GuideView } from './ui/guide.ts';
import { initLanguage, language, localeTag, onLanguageChange, t } from './ui/language.ts';
import { createPinPicker, createSpotMap, type PinPicker, type SpotMap } from './ui/map.ts';
import { photoToUrl, preparePhoto } from './ui/photo.ts';
import { lockViewport } from './ui/viewport.ts';

type Problem = LocationFailure | 'no-fix' | 'storage' | 'interrupted' | 'corrupt';

/** How long we let the system permission prompt sit before giving up on a save. */
const PERMISSION_WAIT_MS = 90_000;

const SECTIONS = ['home-empty', 'home-saving', 'home-decision', 'home-problem', 'home-saved'] as const;
type Section = (typeof SECTIONS)[number];

/** Debug simulation is opt-in per page load via the address bar and is never remembered. */
const simulate = new URLSearchParams(location.search).get('sim') === '1';
const units = unitSystemFor(navigator.language);

async function main(): Promise<void> {
  initLanguage();
  lockViewport();

  let locationSource: LocationSource;
  let compassSource: CompassSource;
  if (simulate) {
    const { Simulator } = await import('./platform/sim.ts');
    const simulator = new Simulator();
    simulator.mount();
    locationSource = simulator.location;
    compassSource = simulator.compass;
  } else {
    locationSource = new BrowserLocation();
    compassSource = new BrowserCompass();
  }

  // Simulated spots go to their own database so they can never overwrite a real one.
  const store = new ParkingStore(new IndexedDbBackend(simulate ? 'parked-sim' : 'parked'));
  const wake = new ScreenWake();

  let session: ParkingSession | null = null;
  let photoUrl: string | null = null;
  /** True while a location is being acquired or written; blocks re-entry and marks interruptions. */
  let saving = false;
  let cancelAcquisition: (() => void) | null = null;

  const home = byId('home');
  /** Redraws whichever home panel is showing; used when the language is switched. */
  let redraw: (() => void) | null = null;

  // ---------------------------------------------------------------------------------- rendering

  function show(section: Section, focusId?: string): void {
    for (const id of SECTIONS) byId(id).hidden = id !== section;
    // Switching language in the middle of a save would only confuse; it is back a moment later.
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-language]')) {
      button.disabled = section === 'home-saving';
    }
    if (focusId) byId(focusId).focus({ preventScroll: true });
  }

  function showIdle(focus = false): void {
    redraw = () => showIdle();
    if (session) {
      renderSaved();
      show('home-saved', focus ? 'saved-title' : undefined);
    } else {
      show('home-empty');
      if (focus) byId('park-button').focus({ preventScroll: true });
    }
  }

  function parkedAtText(parkedAtMs: number): string {
    const date = new Date(parkedAtMs);
    const time = date.toLocaleTimeString(localeTag(), { hour: 'numeric', minute: '2-digit' });
    if (date.toDateString() === new Date().toDateString()) return t('saved.whenToday', { time });
    const day = date.toLocaleDateString(localeTag(), { weekday: 'short', day: 'numeric', month: 'short' });
    return t('saved.whenOther', { date: day, time });
  }

  const accuracyText = (accuracyM: number) => formatAccuracy(accuracyM, units, language());
  const elapsedText = (parkedAtMs: number) => formatElapsed(parkedAtMs, Date.now(), language());

  function accuracySentence(current: ParkingSession): string {
    const when = parkedAtText(current.parkedAtMs);
    if (current.source === 'manual') return t('saved.manual', { when });
    const accuracy = accuracyText(current.accuracyM);
    return t(current.source === 'gps-approximate' ? 'saved.approx' : 'saved.gps', { when, accuracy });
  }

  function fillFacts(target: HTMLElement, current: ParkingSession): void {
    target.replaceChildren();
    for (const [label, value] of [[t('facts.level'), current.level], [t('facts.note'), current.note]] as const) {
      if (!value) continue;
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      row.append(term, detail);
      target.append(row);
    }
  }

  function renderSaved(): void {
    if (!session) return;
    byId('saved-title').textContent = t('saved.title', { elapsed: elapsedText(session.parkedAtMs) });
    byId('saved-accuracy').textContent = accuracySentence(session);
    fillFacts(byId('saved-facts'), session);
    const hasDetails = Boolean(session.level || session.note || session.hasPhoto);
    byId('details-button').textContent = t(hasDetails ? 'saved.editDetails' : 'saved.addDetails');
    const photo = byId<HTMLButtonElement>('saved-photo');
    photo.hidden = !photoUrl;
    const image = photo.querySelector('img');
    if (image && photoUrl) image.src = photoUrl;
  }

  async function refreshPhoto(): Promise<void> {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
    if (!session?.hasPhoto) return;
    try {
      const photo = await store.loadPhoto(session.id);
      if (photo) photoUrl = photoToUrl(photo);
    } catch {
      // The photo is a nicety; the spot itself is still good.
    }
  }

  /** Called whenever the stored session changed. */
  async function adopt(next: ParkingSession | null): Promise<void> {
    const photoChanged = next?.id !== session?.id || next?.hasPhoto !== session?.hasPhoto;
    session = next;
    if (photoChanged || !next) await refreshPhoto();
    if (session && guide.isOpen) guide.renderSpot(session, photoUrl);
    if (!byId('home-saved').hidden || !byId('home-empty').hidden) showIdle();
  }

  function showProblem(problem: Problem, focus = true): void {
    redraw = () => showProblem(problem, false);
    const kept = session ? ` ${t('common.previousKept')}` : '';
    const steps = byId('problem-steps');
    steps.hidden = true;
    steps.replaceChildren();
    let title = t('problem.title');
    let detail = '';
    let retry = t('common.tryAgain');
    switch (problem) {
      case 'denied': {
        title = t('problem.denied.title');
        detail = t('problem.denied.detail') + kept;
        const list = isInstalled()
          ? [t('problem.denied.step1'), t('problem.denied.app.step2'), t('problem.denied.app.step3')]
          : [t('problem.denied.step1'), t('problem.denied.web.step2'), t('problem.denied.web.step3')];
        for (const text of list) {
          const item = document.createElement('li');
          item.textContent = text;
          steps.append(item);
        }
        steps.hidden = false;
        break;
      }
      case 'no-fix':
      case 'unavailable':
      case 'timeout':
        title = t('problem.noFix.title');
        detail = t('problem.noFix.detail', { seconds: Math.round(DEFAULT_ACQUISITION.windowMs / 1000) }) + kept;
        break;
      case 'unsupported':
        title = t('problem.unsupported.title');
        detail = t('problem.unsupported.detail');
        break;
      case 'insecure':
        title = t('problem.insecure.title');
        detail = t('problem.insecure.detail');
        break;
      case 'storage':
        detail = t('problem.storage.detail') + kept;
        break;
      case 'interrupted':
        title = t('problem.interrupted.title');
        detail = t('problem.interrupted.detail') + kept;
        break;
      case 'corrupt':
        title = t('problem.corrupt.title');
        detail = t('problem.corrupt.detail');
        retry = t('problem.corrupt.clear');
        break;
    }
    byId('problem-title').textContent = title;
    byId('problem-detail').textContent = detail;
    const retryButton = byId<HTMLButtonElement>('problem-retry');
    retryButton.textContent = retry;
    retryButton.onclick =
      problem === 'corrupt'
        ? async () => {
            try {
              await store.clear();
              session = null;
              showIdle(true);
            } catch {
              toast(t('toast.corruptClearFailed'));
            }
          }
        : () => void startParking();
    byId('problem-cancel').hidden = problem === 'corrupt';
    show('home-problem', focus ? 'problem-title' : undefined);
  }

  // ------------------------------------------------------------------------------------ parking

  /**
   * The one-tap save. Collects fixes for a bounded window, keeps the best fresh one, and only
   * writes to storage at the end, so an existing spot is untouched until a replacement really exists.
   */
  function startParking(): void {
    if (saving) return;
    saving = true;
    redraw = null;

    const progress = byId('saving-progress');
    const ring = svgById('saving-ring');
    const accuracyLabel = byId('saving-accuracy');
    const detail = byId('saving-detail');
    progress.classList.remove('is-done');
    ring.style.strokeDashoffset = '100';
    accuracyLabel.textContent = '';
    detail.textContent = t('saving.start');
    byId('saving-title').textContent = t('saving.title');
    byId<HTMLButtonElement>('saving-cancel').hidden = false;
    show('home-saving', 'saving-title');

    const tappedAt = Date.now();
    let collector = new FixCollector(tappedAt);
    let collectingSince = tappedAt;
    let settled = false;
    // While iOS is showing its "Allow location?" prompt the clock must not run, or a slow reader
    // would be told there is no GPS signal before they had even answered.
    let awaitingPermission = false;
    let responded = false;

    const stop = () => {
      settled = true;
      clearInterval(timer);
      locationSource.stop();
      cancelAcquisition = null;
    };

    const fail = (problem: Problem) => {
      if (settled) return;
      stop();
      saving = false;
      showProblem(problem);
    };

    const finish = () => {
      if (settled) return;
      stop();
      const outcome = collector.outcome();
      if (outcome.kind === 'precise') {
        void commit({ ...coordinateOf(outcome.fix), accuracyM: outcome.fix.accuracyM, parkedAtMs: tappedAt, source: 'gps' });
      } else if (outcome.kind === 'approximate') {
        saving = false;
        showDecision(outcome.fix, tappedAt);
      } else {
        saving = false;
        showProblem('no-fix');
      }
    };

    cancelAcquisition = () => {
      if (settled) return;
      stop();
      saving = false;
    };

    const timer = setInterval(() => {
      const now = Date.now();
      if (awaitingPermission) {
        if (now - tappedAt > PERMISSION_WAIT_MS) fail('no-fix');
        return;
      }
      const elapsed = now - collectingSince;
      const fraction = Math.min(1, elapsed / DEFAULT_ACQUISITION.windowMs);
      ring.style.strokeDashoffset = String(100 - fraction * 100);
      progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
      const best = collector.best;
      if (best) {
        accuracyLabel.textContent = accuracyText(best.accuracyM);
        detail.textContent = t('saving.waiting');
      }
      if (collector.isComplete(now)) finish();
    }, 100);

    void locationSource.permission().then((state) => {
      if (settled || responded || state !== 'prompt') return;
      awaitingPermission = true;
      detail.textContent = t('saving.permission');
    });

    locationSource.start(
      (sample) => {
        if (settled) return;
        responded = true;
        if (awaitingPermission) {
          // Permission was just granted: the bounded window starts now.
          awaitingPermission = false;
          collectingSince = Date.now();
          collector = new FixCollector(collectingSince);
          detail.textContent = t('saving.start');
        }
        collector.offer(sample, Date.now());
      },
      (failure) => {
        responded = true;
        // A timeout or a momentary "unavailable" is not final: keep listening until the window closes.
        if (failure === 'denied' || failure === 'unsupported' || failure === 'insecure') fail(failure);
      },
    );
  }

  function coordinateOf(sample: LocationSample): Coordinate {
    return { latitude: sample.latitude, longitude: sample.longitude };
  }

  function showDecision(fix: LocationSample, startedAt: number, focus = true): void {
    redraw = () => showDecision(fix, startedAt, false);
    const accuracy = accuracyText(fix.accuracyM);
    byId('decision-detail').textContent =
      t('decision.detail', { accuracy }) + (session ? ` ${t('common.previousKept')}` : '');
    byId('decision-approx').textContent = t('decision.approx', { accuracy });
    byId('decision-retry').onclick = () => void startParking();
    byId('decision-cancel').onclick = () => showIdle(true);
    byId('decision-approx').onclick = () => {
      if (saving) return;
      saving = true;
      void commit({ ...coordinateOf(fix), accuracyM: fix.accuracyM, parkedAtMs: startedAt, source: 'gps-approximate' }, false);
    };
    byId('decision-adjust').onclick = () => {
      void pickPin(coordinateOf(fix), fix.accuracyM, async (coordinate) => {
        if (saving) return false;
        saving = true;
        return commit({ ...coordinate, accuracyM: MANUAL_PIN_ACCURACY_M, parkedAtMs: startedAt, source: 'manual' }, false);
      });
    };
    show('home-decision', focus ? 'decision-title' : undefined);
  }

  /** Writes the spot. Success is only shown after the store has read the record back. */
  async function commit(spot: NewSpot, celebrate = true): Promise<boolean> {
    try {
      const saved = await store.park(spot);
      saving = false;
      void requestPersistentStorage();
      haptic('success');
      if (celebrate) {
        byId<HTMLButtonElement>('saving-cancel').hidden = true;
        byId('saving-title').textContent = t('saving.doneTitle');
        byId('saving-detail').textContent = t('saving.doneDetail', { accuracy: accuracyText(saved.accuracyM) });
        byId('saving-progress').classList.add('is-done');
        await new Promise((resolve) => setTimeout(resolve, 850));
      }
      await adopt(saved);
      showIdle(true);
      if (!celebrate) toast(t('toast.saved'));
      return true;
    } catch (error) {
      saving = false;
      console.error(error);
      showProblem('storage');
      return false;
    }
  }

  // ------------------------------------------------------------------------------- pin on a map

  let pinPicker: PinPicker | null = null;

  async function pickPin(
    start: Coordinate,
    accuracyM: number | null,
    onUse: (coordinate: Coordinate) => Promise<boolean>,
  ): Promise<void> {
    const dialog = byId<HTMLDialogElement>('pin-sheet');
    const error = byId('pin-error');
    const note = byId('pin-note');
    error.hidden = true;
    note.textContent = t('pin.note');
    openSheet(dialog, () => {});
    const close = () => {
      pinPicker?.destroy();
      pinPicker = null;
      if (dialog.open) dialog.close();
    };
    byId('pin-cancel').onclick = close;
    dialog.oncancel = () => {
      pinPicker?.destroy();
      pinPicker = null;
    };
    const save = byId<HTMLButtonElement>('pin-save');
    save.disabled = true;
    try {
      pinPicker?.destroy();
      pinPicker = await createPinPicker(byId('pin-map'), start, accuracyM, () => {
        note.textContent = t('pin.tiles');
      });
      save.disabled = false;
    } catch {
      error.textContent = t('pin.loadError');
      error.hidden = false;
      return;
    }
    save.onclick = async () => {
      if (!pinPicker) return;
      save.disabled = true;
      const ok = await onUse(pinPicker.center());
      save.disabled = false;
      if (ok) close();
      else {
        error.textContent = t('pin.saveError');
        error.hidden = false;
      }
    };
  }

  // ------------------------------------------------------------------------------------ details

  const detailsSheet = byId<HTMLDialogElement>('details-sheet');
  const levelInput = byId<HTMLInputElement>('details-level');
  const noteInput = byId<HTMLInputElement>('details-note');
  const detailsError = byId('details-error');

  function renderDetailsPhoto(): void {
    const preview = byId<HTMLImageElement>('details-photo-preview');
    preview.hidden = !photoUrl;
    if (photoUrl) preview.src = photoUrl;
    byId('details-photo-pick-text').textContent = t(photoUrl ? 'details.replacePhoto' : 'details.addPhoto');
    byId('details-photo-remove').hidden = !photoUrl;
  }

  function openDetails(): void {
    if (!session) return;
    levelInput.value = session.level;
    noteInput.value = session.note;
    detailsError.hidden = true;
    renderDetailsPhoto();
    openSheet(detailsSheet, () => void saveDetails());
  }

  /** Saves the text fields. The sheet only closes once the write has succeeded. */
  async function saveDetails(): Promise<void> {
    if (!session) {
      detailsSheet.close();
      return;
    }
    try {
      if (levelInput.value.trim() !== session.level || noteInput.value.trim() !== session.note) {
        await adopt(await store.updateDetails(session.id, { level: levelInput.value, note: noteInput.value }));
      }
      detailsSheet.close();
    } catch (error) {
      console.error(error);
      detailsError.textContent = t('details.saveError');
      detailsError.hidden = false;
    }
  }

  byId('details-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void saveDetails();
  });

  byId<HTMLInputElement>('details-photo-input').addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !session) return;
    detailsError.hidden = true;
    try {
      const photo = await preparePhoto(file);
      await adopt(await store.setPhoto(session.id, photo));
      renderDetailsPhoto();
    } catch (error) {
      console.error(error);
      detailsError.textContent = t('details.photoError');
      detailsError.hidden = false;
    }
  });

  byId('details-photo-remove').addEventListener('click', async () => {
    if (!session) return;
    try {
      await adopt(await store.setPhoto(session.id, null));
      renderDetailsPhoto();
    } catch {
      detailsError.textContent = t('details.photoRemoveError');
      detailsError.hidden = false;
    }
  });

  byId('details-adjust').addEventListener('click', () => {
    if (!session) return;
    const current = session;
    void pickPin(current, null, async (coordinate) => {
      try {
        await adopt(await store.movePin(current.id, coordinate));
        toast(t('pin.moved'));
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    });
  });

  // ------------------------------------------------------------------------ photo and map sheets

  function openPhoto(): void {
    if (!photoUrl) return;
    byId<HTMLImageElement>('photo-full').src = photoUrl;
    openSheet(byId<HTMLDialogElement>('photo-sheet'));
  }

  let spotMap: SpotMap | null = null;
  let spotMapTimer: ReturnType<typeof setInterval> | null = null;
  const mapSheet = byId<HTMLDialogElement>('map-sheet');

  function closeMap(): void {
    if (spotMapTimer !== null) clearInterval(spotMapTimer);
    spotMapTimer = null;
    spotMap?.destroy();
    spotMap = null;
    if (mapSheet.open) mapSheet.close();
  }

  async function openMap(): Promise<void> {
    if (!session) return;
    const note = byId('map-note');
    note.textContent = t(navigator.onLine ? 'map.note' : 'map.offline');
    openSheet(mapSheet, closeMap);
    try {
      spotMap?.destroy();
      spotMap = await createSpotMap(byId('spot-map'), session, { car: t('map.car'), me: t('map.me') }, () => {
        note.textContent = t('map.tiles');
      });
      const update = () => {
        const me = guide.latestLocation;
        spotMap?.setMe(me && isValidCoordinate(me) && Number.isFinite(me.accuracyM) && me.accuracyM > 0 ? me : null);
      };
      update();
      spotMapTimer = setInterval(update, 1000);
    } catch {
      note.textContent = t('map.loadError');
    }
  }

  byId('map-close').addEventListener('click', closeMap);
  mapSheet.addEventListener('cancel', () => closeMap());

  // ------------------------------------------------------------------------------- end session

  async function endSession(): Promise<boolean> {
    if (!session) return false;
    const confirmed = await confirmSheet({
      title: t('found.title'),
      text: t('found.text'),
      confirmLabel: t('found.yes'),
      cancelLabel: t('found.no'),
    });
    if (!confirmed) return false;
    try {
      await store.clear();
    } catch (error) {
      console.error(error);
      toast(t('toast.clearFailed'));
      return false;
    }
    haptic('tap');
    closeMap();
    if (guide.isOpen) {
      guide.close();
      home.hidden = false;
    }
    session = null;
    await refreshPhoto();
    showIdle(true);
    toast(t('toast.ended'));
    return true;
  }

  // ----------------------------------------------------------------------------------- guidance

  const guide = new GuideView({
    location: locationSource,
    compass: compassSource,
    wake,
    units,
    onBack: () => {
      closeMap();
      guide.close();
      home.hidden = false;
      showIdle(true);
    },
    onFound: () => void endSession(),
    onOpenMap: () => void openMap(),
    onOpenPhoto: openPhoto,
  });

  // ------------------------------------------------------------------------------------- wiring

  byId('park-button').addEventListener('click', () => {
    haptic('tap');
    startParking();
  });

  byId('saving-cancel').addEventListener('click', () => {
    cancelAcquisition?.();
    showIdle(true);
  });

  byId('problem-cancel').addEventListener('click', () => showIdle(true));

  byId('find-button').addEventListener('click', () => {
    if (!session) return;
    haptic('tap');
    // Must happen inside this tap, or iOS will not show its motion-access prompt.
    void compassSource.requestAccess();
    home.hidden = true;
    guide.open(session, photoUrl);
  });

  byId('found-button').addEventListener('click', () => void endSession());

  byId('repark-button').addEventListener('click', async () => {
    if (!session || saving) return;
    const confirmed = await confirmSheet({
      title: t('replace.title'),
      text: t('replace.text', { elapsed: elapsedText(session.parkedAtMs) }),
      confirmLabel: t('replace.yes'),
      cancelLabel: t('replace.no'),
    });
    if (confirmed) startParking();
  });

  onLanguageChange(() => redraw?.());

  byId('details-button').addEventListener('click', openDetails);
  byId('saved-photo').addEventListener('click', openPhoto);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // An acquisition cannot continue in the background. Stop it and say so, rather than save blind.
      if (cancelAcquisition) {
        cancelAcquisition();
        showProblem('interrupted');
      }
      return;
    }
    if (!byId('home-saved').hidden) renderSaved();
  });

  // Keep "Parked 12 min ago" current while the screen is on.
  setInterval(() => {
    if (document.visibilityState === 'visible' && !home.hidden && !byId('home-saved').hidden) renderSaved();
  }, 30_000);

  for (const hint of document.querySelectorAll<HTMLElement>('.install-hint')) {
    hint.hidden = !(isAppleMobile() && !isInstalled());
  }

  // ---------------------------------------------------------------------------------- start-up

  try {
    session = await store.load();
    await refreshPhoto();
    showIdle();
  } catch (error) {
    console.error(error);
    showProblem(error instanceof CorruptSessionError ? 'corrupt' : 'storage');
  }

  // Offline support. Skipped on localhost so development never fights a cache (add ?sw=1 to test it there).
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const forced = new URLSearchParams(location.search).get('sw') === '1';
  if ('serviceWorker' in navigator && (!local || forced) && !simulate) {
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Offline support unavailable', error));
  }
}

void main();
