import type { LazyLocaleChunk } from './chunks';
import { isPluralForms } from './format';
import {
  DEFAULT_LOCALE,
  getValidatedDefaultLocaleNamespaces,
  REQUIRED_NAMESPACES,
  validateNamespaceOwnership,
  type LocaleDictionary,
  type LocaleNamespace,
  type LocaleNamespaceName,
  type LocaleNamespacesByLanguage,
} from './validation';

type LocaleNamespaceModule = { default: LocaleNamespace };
type LazyLocaleModules = Record<string, () => Promise<LocaleNamespaceModule>>;

// Each top-level file is split by key into chunks (./chunks.ts, the `localeChunks` plugin in
// vite.config.ts): `core` is in the first load and the server render, the others load on demand.
// A file under `locales/<lang>/admin/` is all `admin`; its name is its one top-level key.
//
// Only the default language's `core` is eager (the glob names it: `ru` is `DEFAULT_LOCALE`): it is
// the base every other language merges onto. Another language's `core` is a lazy chunk of its own,
// which `loadLanguage` loads before a page in that language renders (the client entry before
// hydration, the provider on a navigation into it, the server entry before rendering), so a Russian
// page never downloads the English strings (I-05, #109).
const coreModules = import.meta.glob<LocaleNamespaceModule>('./locales/ru/*.json', {
  eager: true,
  query: '?locale-chunk=core',
});
const languageCoreModules: LazyLocaleModules = import.meta.glob<LocaleNamespaceModule>(
  ['./locales/*/*.json', '!./locales/ru/*.json'],
  { query: '?locale-chunk=core' },
);
const lazyModules: Record<LazyLocaleChunk, LazyLocaleModules> = {
  admin: {
    ...import.meta.glob<LocaleNamespaceModule>('./locales/*/*.json', { query: '?locale-chunk=admin' }),
    ...import.meta.glob<LocaleNamespaceModule>('./locales/*/admin/*.json'),
  },
};
const localePathPattern = /^\.\/locales\/([^/]+)\/([^/]+)\.json(?:\?.*)?$/;
const sectionPathPattern = /^\.\/locales\/([^/]+)\/(admin)\/([^/]+)\.json$/;

/** Language, namespace and data of one locale module; a section file is wrapped in its key. */
const readLocaleModule = (path: string, module: LocaleNamespaceModule) => {
  const section = path.match(sectionPathPattern);
  if (section) {
    const [, language, folder, key] = section;
    return { language, namespace: `${folder}/${key}`, data: { [key]: module.default } as LocaleNamespace };
  }

  const match = path.match(localePathPattern);
  return match ? { language: match[1], namespace: match[2], data: module.default } : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeWithFallback = <T extends Record<string, unknown>>(fallback: T, override: Record<string, unknown>): T => {
  const result: Record<string, unknown> = { ...fallback };

  Object.entries(override).forEach(([key, value]) => {
    const fallbackValue = result[key];

    // Plural forms are one entry: a language's own set replaces the default's whole, so English
    // never picks up a Russian `few`.
    if (isRecord(fallbackValue) && isRecord(value) && !isPluralForms(value)) {
      result[key] = mergeWithFallback(fallbackValue, value);
      return;
    }

    result[key] = value;
  });

  return result as T;
};

// Who owns each top-level key, per language, across every chunk loaded so far.
const topLevelOwners: Record<string, Record<string, string>> = {};

const collectLocaleNamespaces = (modules: [path: string, module: LocaleNamespaceModule][]): LocaleNamespacesByLanguage => {
  const byLanguage: LocaleNamespacesByLanguage = {};

  modules.forEach(([path, module]) => {
    const localeModule = readLocaleModule(path, module);
    if (!localeModule) {
      return;
    }

    const { language, namespace, data: namespaceData } = localeModule;
    const namespaceName = namespace as LocaleNamespaceName;
    byLanguage[language] ??= {};

    if (byLanguage[language][namespaceName]) {
      throw new Error(`Duplicate locale namespace detected: ${language}/${namespace}.json`);
    }

    const languageOwners = (topLevelOwners[language] ??= {});
    validateNamespaceOwnership(language, namespace, namespaceData, languageOwners);

    byLanguage[language][namespaceName] = namespaceData;
  });

  return byLanguage;
};

const mergeLanguage = (
  namespaces: Partial<Record<LocaleNamespaceName, LocaleNamespace>>,
  defaultNamespaces: Partial<Record<LocaleNamespaceName, LocaleNamespace>>,
): LocaleDictionary =>
  [...new Set([...REQUIRED_NAMESPACES, ...Object.keys(defaultNamespaces), ...Object.keys(namespaces)])].reduce<LocaleDictionary>((dictionary, name) => {
    const namespace = name as LocaleNamespaceName;
    const fallbackNamespace = defaultNamespaces[namespace] ?? {};
    const localeNamespace = namespaces[namespace] ?? {};
    return mergeWithFallback(dictionary, mergeWithFallback(fallbackNamespace, localeNamespace));
  }, {});

const defaultNamespaces = getValidatedDefaultLocaleNamespaces(
  collectLocaleNamespaces(Object.entries(coreModules))[DEFAULT_LOCALE],
);

/** The loaded dictionaries: the default language's from the start, any other once `loadLanguage` resolved. */
export const dictionaries: Record<string, LocaleDictionary> = {
  [DEFAULT_LOCALE]: mergeLanguage(defaultNamespaces, defaultNamespaces),
};

const languageOfPath = (path: string): string | undefined => path.match(localePathPattern)?.[1];

/** Every language that has dictionary files, loaded or not. */
export const localeFileLanguages: ReadonlySet<string> = new Set([
  DEFAULT_LOCALE,
  ...Object.keys(languageCoreModules).flatMap((path) => languageOfPath(path) ?? []),
]);

/** Whether the language's strings are ready: loaded, or a language without files (it reads the default's). */
export const isLanguageLoaded = (language: string): boolean =>
  language in dictionaries || !localeFileLanguages.has(language);

// Every lazy chunk loaded so far, so a language loaded after it gets its keys too.
const loadedChunkNamespaces: LocaleNamespacesByLanguage[] = [];

const applyChunk = (language: string, chunkNamespaces: LocaleNamespacesByLanguage) => {
  // In place: every holder of a dictionary (the provider, `locale`) sees the new keys.
  Object.assign(
    dictionaries[language],
    mergeLanguage(chunkNamespaces[language] ?? {}, chunkNamespaces[DEFAULT_LOCALE] ?? {}),
  );
};

const loadingLanguages = new Map<string, Promise<void>>();

const loadLanguageCore = async (language: string) => {
  const modules = await Promise.all(
    Object.entries(languageCoreModules)
      .filter(([path]) => languageOfPath(path) === language)
      .map(async ([path, load]) => [path, await load()] as [string, LocaleNamespaceModule]),
  );
  dictionaries[language] = mergeLanguage(collectLocaleNamespaces(modules)[language] ?? {}, defaultNamespaces);
  loadedChunkNamespaces.forEach((chunkNamespaces) => applyChunk(language, chunkNamespaces));
};

/**
 * Loads one language's `core` strings into `dictionaries`. Repeated calls share one load; a loaded
 * language, or one without files, resolves at once.
 */
export const loadLanguage = (language: string): Promise<void> => {
  if (isLanguageLoaded(language)) {
    return Promise.resolve();
  }

  let pending = loadingLanguages.get(language);
  if (!pending) {
    pending = loadLanguageCore(language);
    pending.catch(() => loadingLanguages.delete(language));
    loadingLanguages.set(language, pending);
  }

  return pending;
};

const loadedChunks = new Map<LazyLocaleChunk, Promise<void>>();

const loadChunk = async (chunk: LazyLocaleChunk) => {
  const modules = await Promise.all(
    Object.entries(lazyModules[chunk]).map(async ([path, load]) => [path, await load()] as [string, LocaleNamespaceModule]),
  );
  const chunkNamespaces = collectLocaleNamespaces(modules);
  loadedChunkNamespaces.push(chunkNamespaces);
  Object.keys(dictionaries).forEach((language) => applyChunk(language, chunkNamespaces));
};

/**
 * Adds the keys of a lazy chunk (./chunks.ts) to every dictionary. Await it before rendering what
 * reads them; repeated calls share one load.
 */
export const loadLocaleChunk = (chunk: LazyLocaleChunk): Promise<void> => {
  let pending = loadedChunks.get(chunk);
  if (!pending) {
    pending = loadChunk(chunk);
    pending.catch(() => loadedChunks.delete(chunk));
    loadedChunks.set(chunk, pending);
  }

  return pending;
};
