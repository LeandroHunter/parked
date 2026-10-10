import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { decimalYear, magneticDeclination } from '../src/core/wmm.ts';

const require = createRequire(import.meta.url);

type OfficialRow = { year: number; altKm: number; lat: number; lon: number; decl: number };

/** NOAA's published WMM test values, as shipped with the `geomagnetism` package (dev dependency). */
function officialRows(): OfficialRow[] {
  const csv = readFileSync(require.resolve('geomagnetism/test/values.csv'), 'utf8');
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  const columns = header!.split(',');
  const col = (name: string) => columns.indexOf(name);
  return lines
    .map((line) => line.split(',').map(Number))
    .map((v) => ({ year: v[col('date')]!, altKm: v[col('alt')]!, lat: v[col('lat')]!, lon: v[col('lon')]!, decl: v[col('decl')]! }))
    .filter((row) => row.year >= 2025 && Number.isFinite(row.decl));
}

const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('magnetic declination (WMM2025)', () => {
  it('matches a few official test values (hand-copied, so the test stands on its own)', () => {
    // date, altitude km, lat, lon -> declination
    const rows: Array<[number, number, number, number, number]> = [
      [2025.0, 65, 43, 93, 0.5],
      [2025.0, 51, -33, 109, -5.49],
      [2025.0, 18, 0, 21, 1.29],
      [2025.5, 44, 33, -118, 11.1],
      [2027.0, 54, 54, 178, 0.63],
      [2027.5, 60, 27, 65, 1.85],
    ];
    for (const [year, alt, lat, lon, expected] of rows) {
      const actual = magneticDeclination(lat, lon, year, alt).degrees;
      assert.ok(angleDiff(actual, expected) <= 0.01, `(${lat}, ${lon}) @ ${year}: expected ${expected}, got ${actual}`);
    }
  });

  it('matches every official WMM2025 test value', () => {
    const rows = officialRows();
    assert.ok(rows.length >= 50, `expected the official 2025+ rows, found ${rows.length}`);
    for (const row of rows) {
      const actual = magneticDeclination(row.lat, row.lon, row.year, row.altKm).degrees;
      assert.ok(
        angleDiff(actual, row.decl) <= 0.011,
        `(${row.lat}, ${row.lon}, ${row.altKm} km) @ ${row.year}: expected ${row.decl}, got ${actual}`,
      );
    }
  });

  it('agrees with an independent implementation across the globe', () => {
    const geomagnetism = require('geomagnetism') as {
      model(date: Date): { point(coords: [number, number, number?]): { decl: number } };
    };
    const date = new Date(Date.UTC(2026, 9, 10));
    const model = geomagnetism.model(date);
    const year = decimalYear(date);
    let worst = 0;
    for (let lat = -80; lat <= 80; lat += 10) {
      for (let lon = -180; lon < 180; lon += 15) {
        const mine = magneticDeclination(lat, lon, year).degrees;
        const theirs = model.point([lat, lon]).decl;
        worst = Math.max(worst, angleDiff(mine, theirs));
      }
    }
    assert.ok(worst < 0.05, `largest disagreement was ${worst}°`);
  });

  it('gives a small easterly declination in western Germany in 2026', () => {
    const { degrees, withinValidity } = magneticDeclination(50.94, 6.96, 2026.78);
    assert.ok(degrees > 2 && degrees < 5, `expected roughly +3°, got ${degrees}`);
    assert.equal(withinValidity, true);
  });

  it('flags dates outside the model validity window', () => {
    assert.equal(magneticDeclination(50, 7, 2031).withinValidity, false);
    assert.equal(magneticDeclination(50, 7, 2023).withinValidity, false);
    assert.equal(magneticDeclination(50, 7, 2029.9).withinValidity, true);
  });

  it('stays finite at the poles', () => {
    assert.ok(Number.isFinite(magneticDeclination(90, 0, 2026).degrees));
    assert.ok(Number.isFinite(magneticDeclination(-90, 0, 2026).degrees));
  });
});

describe('decimalYear', () => {
  it('converts dates', () => {
    assert.equal(decimalYear(new Date(Date.UTC(2026, 0, 1))), 2026);
    assert.ok(Math.abs(decimalYear(new Date(Date.UTC(2026, 6, 2, 12))) - 2026.5) < 0.001);
  });
});
