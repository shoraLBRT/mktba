import { describe, expect, it } from 'vitest';
import { pickLocaleChunk, TRANSLATED_LOCALE_CHUNKS } from './chunks';
import { compareTranslation } from './completeness';
import { dictionaryFor, isLanguageLoaded, loadLanguage } from './index';
import { DEFAULT_LANGUAGE, LANGUAGES } from './language';

// Every dictionary file as it is on disk: `./locales/<lang>/<namespace>.json`, `./locales/<lang>/admin/<key>.json`.
const files = import.meta.glob<Record<string, unknown>>('./locales/**/*.json', { eager: true, import: 'default' });
const filesOf = (language: string) =>
  Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => path.startsWith(`./locales/${language}/`))
      .map(([path, data]) => [path.slice(`./locales/${language}/`.length, -'.json'.length), data]),
  );

/** The part of the default dictionary a translation must have: the translated chunks of each top-level file. */
const translatable = Object.fromEntries(
  Object.entries(filesOf(DEFAULT_LANGUAGE))
    .filter(([name]) => !name.includes('/'))
    .map(([name, data]) => [
      name,
      Object.assign({}, ...TRANSLATED_LOCALE_CHUNKS.map((chunk) => pickLocaleChunk(name, data, chunk))) as Record<string, unknown>,
    ]),
);

const translations = LANGUAGES.filter((language) => language !== DEFAULT_LANGUAGE);

describe('dictionary completeness (I-05, #109)', () => {
  it.each(translations)('given the %s files, when compared with ru, then every key, placeholder and plural form matches', (language) => {
    const own = filesOf(language);

    expect(Object.keys(own).sort(), `${language}: files`).toEqual(Object.keys(translatable).sort());
    expect(Object.entries(translatable).flatMap(([name, source]) =>
      compareTranslation(language, source, own[name], '').map((problem) => `${language}/${name}.json ${problem}`),
    )).toEqual([]);
  });

  it.each(translations)('given %s, when loaded, then its dictionary reads its own strings', async (language) => {
    await loadLanguage(language);

    expect(isLanguageLoaded(language)).toBe(true);
    expect(dictionaryFor(language)).not.toBe(dictionaryFor(DEFAULT_LANGUAGE));
    const brand = filesOf(language).brand as { brand: { description: string } };
    expect(dictionaryFor(language).brand.description).toBe(brand.brand.description);
  });
});

describe('compareTranslation', () => {
  it('given a missing key, an extra key and a changed placeholder, when compared, then names each', () => {
    expect(compareTranslation(
      'en',
      { a: { b: 'Привет, {name}', c: 'x' } },
      { a: { b: 'Hello, {user}', d: 'y' } },
    )).toEqual(['a.c: missing', 'a.d: extra', 'a.b: placeholders "{user}", expected "{name}"']);
  });

  it('given plural forms, when compared, then wants exactly the forms of the translation language', () => {
    const ru = { one: '{count} статья', few: '{count} статьи', many: '{count} статей', other: '{count} статьи' };

    expect(compareTranslation('en', ru, { one: '{count} article', other: '{count} articles' })).toEqual([]);
    expect(compareTranslation('en', ru, { one: '{count} article', few: 'x {count}', other: '{count} articles' }))
      .toEqual(['(root): plural forms few/one/other, en needs one/other']);
    expect(compareTranslation('en', ru, 'articles')).toEqual(['(root): plural forms expected']);
  });

  it('given Russian text or a list of another length, when compared, then reports it', () => {
    expect(compareTranslation('en', { t: 'Да' }, { t: 'Да' })).toEqual(['t: Cyrillic text left untranslated']);
    expect(compareTranslation('en', { l: ['а', 'б'] }, { l: ['a'] })).toEqual(['l: 1 entries, 2 expected']);
  });
});
