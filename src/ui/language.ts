import {
  isTranslationKey,
  pickLanguage,
  translate,
  type Language,
  type TranslationKey,
  type TranslationParams,
} from '../core/i18n.ts';

// The language the interface is currently shown in, and the plumbing to switch it live.
//
// Static text in index.html is tagged with `data-i18n="key"` (text content) or
// `data-i18n-attr="attribute:key; attribute:key"` (attributes such as aria-label and placeholder).
// Text built in code calls `t()`, and re-renders through `onLanguageChange`.

const STORAGE_KEY = 'parked.language';

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let current: Language = pickLanguage(readSaved(), navigator.languages ?? [navigator.language]);
const listeners = new Set<() => void>();

export function language(): Language {
  return current;
}

/** Translates with the current language. */
export function t(key: TranslationKey, params?: TranslationParams): string {
  return translate(current, key, params);
}

/** BCP 47 tag for dates and times: the phone's own regional flavour when it matches, else the plain language. */
export function localeTag(): string {
  const device = navigator.language ?? '';
  return device.toLowerCase().startsWith(current) ? device : current === 'de' ? 'de-DE' : 'en-GB';
}

/** Runs after every switch, once the static text has been updated. */
export function onLanguageChange(listener: () => void): void {
  listeners.add(listener);
}

/** Fills in every tagged element under `root`. */
export function applyTranslations(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n ?? '';
    if (isTranslationKey(key)) element.textContent = translate(current, key);
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    for (const pair of (element.dataset.i18nAttr ?? '').split(';')) {
      const [attribute, key] = pair.split(':').map((part) => part.trim());
      if (attribute && key && isTranslationKey(key)) element.setAttribute(attribute, translate(current, key));
    }
  }
  document.documentElement.lang = current;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-language]')) {
    button.setAttribute('aria-pressed', String(button.dataset.language === current));
  }
}

export function setLanguage(next: Language): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private browsing: the choice simply lasts until the page is closed.
  }
  applyTranslations();
  for (const listener of listeners) listener();
}

/** Wires up the EN / DE switch and applies the starting language. */
export function initLanguage(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-language]')) {
    button.addEventListener('click', () => {
      const choice = button.dataset.language;
      if (choice === 'en' || choice === 'de') setLanguage(choice);
    });
  }
  applyTranslations();
}
