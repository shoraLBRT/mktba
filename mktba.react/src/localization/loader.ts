import type { LazyLocaleChunk } from './chunks';
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
const coreModules = import.meta.glob<LocaleNamespaceModule>('./locales/*/*.json', {
  eager: true,
  query: '?locale-chunk=core',
});
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

    if (isRecord(fallbackValue) && isRecord(value)) {
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

const buildDictionaries = (): Record<string, LocaleDictionary> => {
  const localeNamespaces = collectLocaleNamespaces(Object.entries(coreModules));
  const defaultNamespaces = getValidatedDefaultLocaleNamespaces(localeNamespaces[DEFAULT_LOCALE]);

  return Object.fromEntries(
    Object.entries(localeNamespaces).map(([language, namespaces]) => [language, mergeLanguage(namespaces, defaultNamespaces)]),
  );
};

export const dictionaries = buildDictionaries();

const loadedChunks = new Map<LazyLocaleChunk, Promise<void>>();

const loadChunk = async (chunk: LazyLocaleChunk) => {
  const modules = await Promise.all(
    Object.entries(lazyModules[chunk]).map(async ([path, load]) => [path, await load()] as [string, LocaleNamespaceModule]),
  );
  const localeNamespaces = collectLocaleNamespaces(modules);
  const defaultNamespaces = localeNamespaces[DEFAULT_LOCALE] ?? {};

  // In place: every holder of a dictionary (the provider, `locale`) sees the new keys.
  Object.entries(dictionaries).forEach(([language, dictionary]) => {
    Object.assign(dictionary, mergeLanguage(localeNamespaces[language] ?? {}, defaultNamespaces));
  });
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
