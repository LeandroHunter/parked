// Tiny static server for dist/, for trying the app on this computer.
//   node scripts/serve.ts            -> http://localhost:5173
// Browsers treat localhost as secure, so location works here. A phone needs a real https address.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '..', 'dist');
const port = Number(process.env.PORT ?? 5173);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let file = path.join(dist, decodeURIComponent(url.pathname));
    // Never serve anything outside dist/.
    if (file !== dist && !file.startsWith(dist + path.sep)) throw new Error('outside root');
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    await stat(file);
    response.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, () => {
  console.log(`Parked is running at http://localhost:${port}  (add ?sim=1 for the labelled simulation mode)`);
});
