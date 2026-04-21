export type LocaleNamespace = Record<string, unknown>;
export type LocaleDictionary = Record<string, LocaleNamespace>;
export type LocaleNamespaceName = 'brand' | 'shared' | 'pages' | 'editor';
export type LocaleNamespacesByLanguage = Record<string, Partial<Record<LocaleNamespaceName, LocaleNamespace>>>;

export const DEFAULT_LOCALE = 'ru' as const;
export const REQUIRED_NAMESPACES: LocaleNamespaceName[] = ['brand', 'shared', 'pages', 'editor'];

export const validateNamespaceOwnership = (
  language: string,
  namespace: string,
  namespaceData: LocaleNamespace,
  languageOwners: Record<string, string>,
) => {
  Object.keys(namespaceData).forEach((topLevelKey) => {
    const owner = languageOwners[topLevelKey];
    if (owner) {
      throw new Error(
        `Duplicate top-level locale key "${topLevelKey}" detected in ${language}/${owner}.json and ${language}/${namespace}.json.`,
      );
    }

    languageOwners[topLevelKey] = namespace;
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasLeafValues = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some((item) => hasLeafValues(item));
  }

  if (isRecord(value)) {
    return Object.values(value).some((item) => hasLeafValues(item));
  }

  return value !== null;
};

export const getValidatedDefaultLocaleNamespaces = (
  defaultNamespaces: Partial<Record<LocaleNamespaceName, LocaleNamespace>> | undefined,
): Record<LocaleNamespaceName, LocaleNamespace> => {
  if (!defaultNamespaces) {
    throw new Error(`Default locale "${DEFAULT_LOCALE}" is missing in src/localization/locales.`);
  }

  REQUIRED_NAMESPACES.forEach((namespace) => {
    const namespaceData = defaultNamespaces[namespace];

    if (!namespaceData) {
      throw new Error(`Required default namespace ${DEFAULT_LOCALE}/${namespace}.json is missing.`);
    }

    if (!hasLeafValues(namespaceData)) {
      throw new Error(`Default namespace ${DEFAULT_LOCALE}/${namespace}.json does not contain any translation values.`);
    }
  });

  return defaultNamespaces as Record<LocaleNamespaceName, LocaleNamespace>;
};
