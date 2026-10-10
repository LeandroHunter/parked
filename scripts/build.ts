// Builds the site into dist/. No bundler: TypeScript is stripped to plain ES modules by Node itself.
//   node scripts/build.ts

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const leaflet = path.join(root, 'node_modules', 'leaflet', 'dist');

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return files.flat().sort();
}

/** Strips types and points relative imports at the emitted .js files. */
function compile(source: string, file: string): string {
  let code: string;
  try {
    code = stripTypeScriptTypes(source, { mode: 'strip' });
  } catch (error) {
    throw new Error(`Could not compile ${path.relative(root, file)}: ${(error as Error).message}`);
  }
  return code.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\.ts\2/g, '$1$2$3.js$2');
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of await walk(src)) {
  const relative = path.relative(src, file);
  if (relative === 'sw.ts') continue; // needs the file list, so it is written last
  const target = path.join(dist, relative);
  await mkdir(path.dirname(target), { recursive: true });
  if (file.endsWith('.ts')) {
    await writeFile(target.replace(/\.ts$/, '.js'), compile(await readFile(file, 'utf8'), file));
  } else {
    await cp(file, target);
  }
}

// Leaflet is vendored into the build so the app never loads code from a third-party server.
await mkdir(path.join(dist, 'vendor'), { recursive: true });
await cp(path.join(leaflet, 'leaflet-src.esm.js'), path.join(dist, 'vendor', 'leaflet.js'));
await cp(path.join(leaflet, 'leaflet.css'), path.join(dist, 'vendor', 'leaflet.css'));
await cp(path.join(leaflet, 'images'), path.join(dist, 'vendor', 'images'), { recursive: true });
await writeFile(
  path.join(dist, 'vendor', 'leaflet.js'),
  (await readFile(path.join(dist, 'vendor', 'leaflet.js'), 'utf8')).replace(/\n\/\/# sourceMappingURL=.*\s*$/, '\n'),
);

// Service worker: precache every built file, versioned by a hash of their contents.
const built = await walk(dist);
const hash = createHash('sha256');
const precache = ['./'];
for (const file of built) {
  hash.update(path.relative(dist, file)).update(await readFile(file));
  precache.push(path.relative(dist, file).split(path.sep).join('/'));
}
const version = hash.digest('hex').slice(0, 12);
const worker = compile(await readFile(path.join(src, 'sw.ts'), 'utf8'), path.join(src, 'sw.ts'))
  .replace('__VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(precache));
await writeFile(path.join(dist, 'sw.js'), worker);

console.log(`Built ${built.length + 1} files into dist/ (version ${version}).`);
