// Service worker: keeps the app shell on the phone so Parked opens without a connection.
// The two placeholders below are filled in by scripts/build.ts.

type WorkerEvent = Event & {
  waitUntil(promise: Promise<unknown>): void;
};
type WorkerFetchEvent = WorkerEvent & {
  request: Request;
  respondWith(response: Promise<Response>): void;
};
type WorkerScope = {
  location: Location;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: 'install' | 'activate', listener: (event: WorkerEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: WorkerFetchEvent) => void): void;
};

const worker = self as unknown as WorkerScope;

const VERSION = '__VERSION__';
const PRECACHE: string[] = JSON.parse('__PRECACHE__');
const CACHE_PREFIX = 'parked-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;

worker.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // 'reload' bypasses the HTTP cache so a new version never precaches stale files.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => worker.skipWaiting()),
  );
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => worker.clients.claim()),
  );
});

worker.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // Only our own files are cached. Map tiles and anything else cross-origin go straight to the network.
  if (new URL(request.url).origin !== worker.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch (error) {
        if (request.mode === 'navigate') {
          const shell = await cache.match('index.html');
          if (shell) return shell;
        }
        throw error;
      }
    }),
  );
});
