import { isPluralForms } from './format';

/**
 * Compares a translation with the default (`ru`) dictionary it translates (I-05, #109), for the
 * completeness test (`completeness.test.ts`, run in CI): every key there and nothing else, the same
 * `{placeholders}`, list entries of the same length, plural entries with exactly the forms of the
 * translation's own language (`Intl.PluralRules`), and no Cyrillic left untranslated.
 * Returns one line per problem, empty when the translation is complete.
 */
export const compareTranslation = (
  language: string,
  source: unknown,
  translation: unknown,
  path = '',
): string[] => {
  const at = path || '(root)';

  if (isPluralForms(source)) {
    if (!isPluralForms(translation)) {
      return [`${at}: plural forms expected`];
    }

    const categories = [...new Intl.PluralRules(language).resolvedOptions().pluralCategories].sort();
    const forms = Object.keys(translation).sort();
    const problems = forms.join() === categories.join()
      ? []
      : [`${at}: plural forms ${forms.join('/')}, ${language} needs ${categories.join('/')}`];
    return [
      ...problems,
      ...comparePlaceholders(at, Object.values(source).join(' '), Object.values(translation).join(' ')),
      ...Object.values(translation).flatMap((text) => untranslated(at, text)),
    ];
  }

  if (typeof source === 'string') {
    return typeof translation === 'string'
      ? [...comparePlaceholders(at, source, translation), ...untranslated(at, translation)]
      : [`${at}: text expected`];
  }

  if (Array.isArray(source)) {
    if (!Array.isArray(translation)) {
      return [`${at}: list expected`];
    }

    return translation.length === source.length
      ? source.flatMap((item, index) => compareTranslation(language, item, translation[index], `${path}[${index}]`))
      : [`${at}: ${translation.length} entries, ${source.length} expected`];
  }

  if (isRecord(source)) {
    if (!isRecord(translation)) {
      return [`${at}: object expected`];
    }

    const child = (key: string) => (path ? `${path}.${key}` : key);
    return [
      ...Object.keys(source).filter((key) => !(key in translation)).map((key) => `${child(key)}: missing`),
      ...Object.keys(translation).filter((key) => !(key in source)).map((key) => `${child(key)}: extra`),
      ...Object.keys(source)
        .filter((key) => key in translation)
        .flatMap((key) => compareTranslation(language, source[key], translation[key], child(key))),
    ];
  }

  return source === translation ? [] : [`${at}: ${JSON.stringify(translation)}, expected ${JSON.stringify(source)}`];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const placeholders = (text: string) => [...new Set(text.match(/\{[^{}]+\}/g) ?? [])].sort();

const comparePlaceholders = (at: string, source: string, translation: string): string[] => {
  const expected = placeholders(source).join(' ');
  const actual = placeholders(translation).join(' ');
  return expected === actual ? [] : [`${at}: placeholders "${actual}", expected "${expected}"`];
};

const untranslated = (at: string, text: string): string[] =>
  /[Ѐ-ӿ]/.test(text) ? [`${at}: Cyrillic text left untranslated`] : [];
