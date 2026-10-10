import { destinationPoint, normalizeDegrees, type Coordinate } from '../core/geo.ts';
import type { CompassAvailability } from '../core/guidance.ts';
import type { HeadingSample, LocationSample } from '../core/readings.ts';
import type { CompassSource } from './compass.ts';
import type { LocationFailure, LocationPermission, LocationSource } from './location.ts';

// DEBUG ONLY. Fake sensors for trying the interface on a desk.
//
// This module is loaded only when the page URL contains `?sim=1`. While it is active a striped
// banner stays on screen, every reading is tagged `simulated`, the dial is stamped "Simulated",
// and data goes to a separate database so a real saved spot can never be touched by a test.

/** Where the pretend phone starts. Brandenburg Gate; any fixed point would do. */
const BASE: Coordinate = { latitude: 52.5163, longitude: 13.3777 };

type GpsMode = 'on' | 'off' | 'denied';

type SimState = {
  distanceM: number;
  directionDeg: number;
  accuracyM: number;
  headingDeg: number;
  compassAccuracyDeg: number;
  gps: GpsMode;
  compassOn: boolean;
  needsTap: boolean;
  spin: boolean;
};

export class Simulator {
  private readonly state: SimState = {
    distanceM: 0,
    directionDeg: 0,
    accuracyM: 5,
    headingDeg: 0,
    compassAccuracyDeg: 8,
    gps: 'on',
    compassOn: true,
    needsTap: false,
    spin: false,
  };

  private compassGranted = false;
  private headingOutput: HTMLOutputElement | null = null;
  private headingInput: HTMLInputElement | null = null;

  readonly location: LocationSource = (() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    return {
      permission: async (): Promise<LocationPermission> => (this.state.gps === 'denied' ? 'denied' : 'granted'),
      start: (onSample: (sample: LocationSample) => void, onFailure: (failure: LocationFailure) => void) => {
        if (timer !== null) clearInterval(timer);
        const emit = () => {
          if (this.state.gps === 'denied') {
            if (timer !== null) clearInterval(timer);
            timer = null;
            onFailure('denied');
            return;
          }
          if (this.state.gps === 'off') return;
          const position = destinationPoint(BASE, this.state.directionDeg, this.state.distanceM);
          onSample({ ...position, accuracyM: this.state.accuracyM, timestampMs: Date.now(), simulated: true });
        };
        timer = setInterval(emit, 500);
        setTimeout(emit, 120);
      },
      stop: () => {
        if (timer !== null) clearInterval(timer);
        timer = null;
      },
    };
  })();

  readonly compass: CompassSource = (() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    return {
      availability: (): CompassAvailability => (this.state.needsTap && !this.compassGranted ? 'permission-needed' : 'ok'),
      requestAccess: async (): Promise<CompassAvailability> => {
        this.compassGranted = true;
        return 'ok';
      },
      start: (onSample: (sample: HeadingSample) => void) => {
        if (timer !== null) clearInterval(timer);
        timer = setInterval(() => {
          if (this.state.spin) {
            this.state.headingDeg = normalizeDegrees(this.state.headingDeg + 2);
            if (this.headingInput) this.headingInput.value = String(Math.round(this.state.headingDeg));
            if (this.headingOutput) this.headingOutput.value = `${Math.round(this.state.headingDeg)}°`;
          }
          if (!this.state.compassOn) return;
          if (this.state.needsTap && !this.compassGranted) return;
          onSample({
            headingDeg: this.state.headingDeg,
            reference: 'magnetic',
            accuracyDeg: this.state.compassAccuracyDeg,
            timestampMs: Date.now(),
            simulated: true,
          });
        }, 33);
      },
      stop: () => {
        if (timer !== null) clearInterval(timer);
        timer = null;
      },
    };
  })();

  /** Builds the always-visible warning banner and the control panel. */
  mount(): void {
    const root = document.createElement('aside');
    root.className = 'sim';
    root.setAttribute('aria-label', 'Simulation controls');
    root.innerHTML = `
      <strong>Simulation — not real guidance</strong>
      <details>
        <summary>Fake sensors (remove <code>?sim=1</code> from the address for the real app)</summary>
        <div class="sim-grid"></div>
      </details>`;
    const grid = root.querySelector<HTMLElement>('.sim-grid')!;

    const slider = (
      label: string,
      key: 'distanceM' | 'directionDeg' | 'accuracyM' | 'headingDeg' | 'compassAccuracyDeg',
      min: number,
      max: number,
      unit: string,
    ) => {
      const id = `sim-${key}`;
      const name = document.createElement('label');
      name.htmlFor = id;
      name.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.id = id;
      input.min = String(min);
      input.max = String(max);
      input.value = String(this.state[key]);
      const output = document.createElement('output');
      output.value = `${this.state[key]}${unit}`;
      input.addEventListener('input', () => {
        this.state[key] = Number(input.value);
        output.value = `${input.value}${unit}`;
      });
      grid.append(name, input, output);
      return { input, output };
    };

    slider('Walked away', 'distanceM', 0, 600, ' m');
    slider('…towards', 'directionDeg', 0, 359, '°');
    slider('GPS accuracy', 'accuracyM', 3, 300, ' m');
    const heading = slider('Phone heading', 'headingDeg', 0, 359, '°');
    this.headingInput = heading.input;
    this.headingOutput = heading.output;
    slider('Compass accuracy', 'compassAccuracyDeg', -1, 60, '°');

    const toggles = document.createElement('div');
    toggles.className = 'sim-toggles';
    const gps = document.createElement('label');
    gps.textContent = 'GPS ';
    const select = document.createElement('select');
    for (const mode of ['on', 'off', 'denied'] as const) select.add(new Option(mode, mode));
    select.addEventListener('change', () => {
      this.state.gps = select.value as GpsMode;
    });
    gps.append(select);
    toggles.append(gps);

    const checkbox = (label: string, key: 'compassOn' | 'needsTap' | 'spin') => {
      const wrap = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = this.state[key];
      input.addEventListener('change', () => {
        this.state[key] = input.checked;
        if (key === 'needsTap') this.compassGranted = false;
      });
      wrap.append(input, ` ${label}`);
      toggles.append(wrap);
    };
    checkbox('Compass on', 'compassOn');
    checkbox('Compass needs a tap', 'needsTap');
    checkbox('Spin phone', 'spin');
    grid.append(toggles);

    document.body.classList.add('simulating');
    document.body.prepend(root);
  }
}
