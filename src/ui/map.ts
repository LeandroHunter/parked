import type * as Leaflet from 'leaflet';
import type { Coordinate } from '../core/geo.ts';

// The secondary map. Leaflet is loaded only when a map is first opened, and the tiles come from
// OpenStreetMap over the network, so this part needs an internet connection. The arrow does not.

type L = typeof Leaflet;

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

let loading: Promise<L> | null = null;

function loadLeaflet(): Promise<L> {
  if (!loading) {
    loading = (async () => {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = new URL('../vendor/leaflet.css', import.meta.url).href;
      document.head.append(stylesheet);
      const moduleUrl = new URL('../vendor/leaflet.js', import.meta.url).href;
      return (await import(moduleUrl)) as L;
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

function baseMap(
  leaflet: L,
  container: HTMLElement,
  center: Coordinate,
  zoom: number,
  onTileError: () => void,
  inertia = true,
): Leaflet.Map {
  const map = leaflet.map(container, { zoomControl: true, attributionControl: true, inertia }).setView(
    [center.latitude, center.longitude],
    zoom,
  );
  map.attributionControl.setPrefix(false);
  const tiles = leaflet.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION });
  let reported = false;
  tiles.on('tileerror', () => {
    if (!reported) onTileError();
    reported = true;
  });
  tiles.addTo(map);
  return map;
}

function dot(leaflet: L, className: string, size: number): Leaflet.DivIcon {
  return leaflet.divIcon({ className, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

export type SpotMap = {
  /** Updates (or removes) the "you are here" marker. */
  setMe(position: (Coordinate & { accuracyM: number }) | null): void;
  destroy(): void;
};

/** Read-only map with the saved spot and, when known, the current position. */
export async function createSpotMap(
  container: HTMLElement,
  car: Coordinate & { accuracyM: number },
  onTileError: () => void,
): Promise<SpotMap> {
  const leaflet = await loadLeaflet();
  const map = baseMap(leaflet, container, car, 18, onTileError);
  const carPoint: Leaflet.LatLngTuple = [car.latitude, car.longitude];
  leaflet.circle(carPoint, { radius: car.accuracyM, color: '#c8401c', weight: 1, fillOpacity: 0.12 }).addTo(map);
  leaflet.marker(carPoint, { icon: dot(leaflet, 'map-car', 22), alt: 'Your saved spot', keyboard: false }).addTo(map);

  let meMarker: Leaflet.Marker | null = null;
  let meCircle: Leaflet.Circle | null = null;
  let framed = false;

  return {
    setMe(position) {
      if (!position) {
        meMarker?.remove();
        meCircle?.remove();
        meMarker = null;
        meCircle = null;
        return;
      }
      const point: Leaflet.LatLngTuple = [position.latitude, position.longitude];
      if (!meMarker || !meCircle) {
        meCircle = leaflet.circle(point, { radius: position.accuracyM, color: '#1e2124', weight: 1, fillOpacity: 0.08 }).addTo(map);
        meMarker = leaflet.marker(point, { icon: dot(leaflet, 'map-me', 18), alt: 'You', keyboard: false }).addTo(map);
      } else {
        meMarker.setLatLng(point);
        meCircle.setLatLng(point).setRadius(position.accuracyM);
      }
      // Frame both points once; after that the user owns the viewport.
      if (!framed) {
        framed = true;
        map.fitBounds(leaflet.latLngBounds([carPoint, point]).pad(0.35), { maxZoom: 19 });
      }
    },
    destroy() {
      map.remove();
    },
  };
}

export type PinPicker = {
  /** The coordinate under the pin (the centre of the map). */
  center(): Coordinate;
  destroy(): void;
};

/** Map with a fixed pin in the middle; the user drags the map underneath it. */
export async function createPinPicker(
  container: HTMLElement,
  start: Coordinate,
  accuracyM: number | null,
  onTileError: () => void,
): Promise<PinPicker> {
  const leaflet = await loadLeaflet();
  const zoom = accuracyM !== null && accuracyM > 150 ? 16 : 18;
  // No fling: the map must stop exactly where the finger lets go, or the pin would drift off the car.
  const map = baseMap(leaflet, container, start, zoom, onTileError, false);
  if (accuracyM !== null) {
    // Shows the area the GPS fix could have been in, as a hint for where to look.
    leaflet
      .circle([start.latitude, start.longitude], { radius: accuracyM, color: '#1e2124', weight: 1, fillOpacity: 0.06, interactive: false })
      .addTo(map);
  }
  return {
    center() {
      const center = map.getCenter().wrap();
      return { latitude: center.lat, longitude: center.lng };
    },
    destroy() {
      map.remove();
    },
  };
}
