import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { formatAccuracy, formatDistance, formatElapsed } from '../src/core/format.ts';
import {
  LANGUAGES,
  TRANSLATIONS,
  isTranslationKey,
  pickLanguage,
  translate,
  type TranslationKey,
} from '../src/core/i18n.ts';

const keys = Object.keys(TRANSLATIONS.en) as TranslationKey[];
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('translations', () => {
  it('has every key in every language, with real text', () => {
    for (const language of LANGUAGES) {
      assert.deepEqual(Object.keys(TRANSLATIONS[language]).sort(), [...keys].sort(), language);
      for (const key of keys) {
        assert.ok(TRANSLATIONS[language][key].trim().length > 0, `${language} ${key} is empty`);
      }
    }
  });

  it('uses the same placeholders in German as in English', () => {
    for (const key of keys) {
      assert.deepEqual(placeholders(TRANSLATIONS.de[key]), placeholders(TRANSLATIONS.en[key]), key);
    }
  });

  it('actually translates: German differs from English wherever the English has words', () => {
    const same = keys.filter((key) => TRANSLATIONS.de[key] === TRANSLATIONS.en[key]);
    // Nothing is expected to be identical; a copy-pasted English line would show up here.
    assert.deepEqual(same, []);
  });

  it('fills in placeholders and leaves unknown ones visible', () => {
    assert.equal(translate('en', 'saving.doneDetail', { accuracy: '±6 m' }), 'Accurate to about ±6 m.');
    assert.equal(translate('de', 'saving.doneDetail', { accuracy: '±6 m' }), 'Auf etwa ±6 m genau.');
    assert.equal(translate('en', 'saving.doneDetail', {}), 'Accurate to about {accuracy}.');
    assert.equal(translate('de', 'saved.title', { elapsed: 'gerade eben' }), 'Geparkt gerade eben');
  });

  it('covers every key referenced from index.html', () => {
    const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
    const referenced = new Set<string>();
    for (const match of html.matchAll(/data-i18n="([^"]+)"/g)) referenced.add(match[1]!);
    for (const match of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of match[1]!.split(';')) referenced.add(pair.split(':')[1]!.trim());
    }
    assert.ok(referenced.size > 20, 'expected the page to be tagged for translation');
    for (const key of referenced) assert.ok(isTranslationKey(key), `index.html uses unknown key "${key}"`);
  });
});

describe('choosing the starting language', () => {
  it('prefers an explicit earlier choice', () => {
    assert.equal(pickLanguage('de', ['en-US']), 'de');
    assert.equal(pickLanguage('en', ['de-DE']), 'en');
  });

  it('otherwise follows the phone', () => {
    assert.equal(pickLanguage(null, ['de-DE', 'en-GB']), 'de');
    assert.equal(pickLanguage(null, ['de']), 'de');
    assert.equal(pickLanguage(null, ['en-GB', 'de-DE']), 'en');
    assert.equal(pickLanguage(null, ['fr-FR', 'de-AT']), 'de');
  });

  it('falls back to English for anything else', () => {
    assert.equal(pickLanguage(null, ['fr-FR']), 'en');
    assert.equal(pickLanguage(null, []), 'en');
    assert.equal(pickLanguage('klingon', ['fr-FR']), 'en');
  });
});

describe('German wording of numbers and times', () => {
  const now = 1_800_000_000_000;

  it('uses a decimal comma', () => {
    assert.deepEqual(formatDistance(1234, 5, 'metric', 'de'), { value: '1,2', unit: 'km', spoken: '1,2 Kilometer' });
    assert.equal(formatAccuracy(3200, 'metric', 'de'), '±3,2\u00a0km');
  });

  it('keeps metres identical apart from the spoken unit', () => {
    assert.deepEqual(formatDistance(83.4, 5, 'metric', 'de'), { value: '83', unit: 'm', spoken: '83 Meter' });
    assert.equal(formatAccuracy(11, 'metric', 'de'), '±15\u00a0m');
  });

  it('words elapsed time', () => {
    assert.equal(formatElapsed(now - 20_000, now, 'de'), 'gerade eben');
    assert.equal(formatElapsed(now - 5 * 60_000, now, 'de'), 'vor 5 Min.');
    assert.equal(formatElapsed(now - 2 * 3_600_000, now, 'de'), 'vor 2 Std.');
    assert.equal(formatElapsed(now - (2 * 60 + 14) * 60_000, now, 'de'), 'vor 2 Std. 14 Min.');
    assert.equal(formatElapsed(now - 26 * 3_600_000, now, 'de'), 'gestern');
    assert.equal(formatElapsed(now - 3 * 86_400_000, now, 'de'), 'vor 3 Tagen');
  });
});
