import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LAZY_LOCALE_KEYS, pickLocaleChunk } from './chunks';
import { dictionaries, dictionaryFor, formatMessage, hasOwnDictionary, loadLocaleChunk, locale } from './index';
import ruEditor from './locales/ru/editor.json';
import ruPages from './locales/ru/pages.json';
import ruSiteAnalytics from './locales/ru/admin/siteAnalytics.json';
import coreEditor from './locales/ru/editor.json?locale-chunk=core';
import corePages from './locales/ru/pages.json?locale-chunk=core';
import { useLanguage, useLocale, useLocalizedPath } from './hooks';
import { LocalizationProvider } from './provider';
import { getValidatedDefaultLocaleNamespaces, REQUIRED_NAMESPACES, validateNamespaceOwnership } from './validation';

describe('formatMessage', () => {
  it('given placeholders, when formatting, then substitutes every occurrence', () => {
    expect(formatMessage('{n} из {total}, снова {n}', { n: 3, total: 10 })).toBe('3 из 10, снова 3');
  });

  it('given a placeholder without a value, when formatting, then leaves it untouched', () => {
    expect(formatMessage('Удалено: {articles}', { paragraphs: 2 })).toBe('Удалено: {articles}');
  });
});

describe('dictionaries', () => {
  it('given the ru locale files, when loaded, then every namespace is merged into one dictionary', () => {
    expect(locale).toBe(dictionaries.ru);
    expect(locale.brand.name).toBe('mktba');
    expect(typeof locale.adminPage.cleanupDone).toBe('string');
  });
});

describe('dictionary chunks (#106)', () => {
  const files = { pages: ruPages, editor: ruEditor } as Record<string, Record<string, unknown>>;

  it('given every lazy key, when looked up, then its namespace file has it', () => {
    Object.values(LAZY_LOCALE_KEYS).forEach((byNamespace) =>
      Object.entries(byNamespace).forEach(([namespace, keys]) =>
        keys?.forEach((key) => expect(Object.keys(files[namespace] ?? {}), `${namespace}.${key}`).toContain(key)),
      ),
    );
  });

  it('given a namespace file, when split, then its chunks are disjoint and together are the file', () => {
    Object.entries(files).forEach(([namespace, data]) => {
      const core = pickLocaleChunk(namespace, data, 'core');
      const admin = pickLocaleChunk(namespace, data, 'admin');

      expect(Object.keys(core).filter((key) => key in admin)).toEqual([]);
      expect({ ...core, ...admin }).toEqual(data);
    });
  });

  it('given the core chunk import, when loaded, then it has the public keys and none of the admin ones', () => {
    expect(Object.keys(corePages)).toContain('articlePage');
    expect(Object.keys(corePages)).toContain('adminLoginPage');
    expect(Object.keys(corePages)).not.toContain('adminPage');
    expect(Object.keys(coreEditor)).toEqual(['versionedParagraph']);
  });

  it('given the admin chunk, when loaded, then the dictionary has its keys and a second load is shared', async () => {
    const first = loadLocaleChunk('admin');

    expect(loadLocaleChunk('admin')).toBe(first);
    await first;
    expect(locale.addArticleEditor).toEqual(ruEditor.addArticleEditor);
    expect(locale.adminPage).toEqual(ruPages.adminPage);
    expect(locale.siteAnalytics).toEqual(ruSiteAnalytics);
  });
});

describe('validateNamespaceOwnership', () => {
  it('given distinct top-level keys, when validating, then records the owning namespace', () => {
    const owners: Record<string, string> = {};

    validateNamespaceOwnership('ru', 'brand', { brand: {} }, owners);
    validateNamespaceOwnership('ru', 'pages', { adminPage: {} }, owners);

    expect(owners).toEqual({ brand: 'brand', adminPage: 'pages' });
  });

  it('given a top-level key owned by another namespace, when validating, then throws', () => {
    const owners: Record<string, string> = { brand: 'brand' };

    expect(() => validateNamespaceOwnership('ru', 'pages', { brand: {} }, owners)).toThrow(
      /Duplicate top-level locale key "brand"/,
    );
  });
});

describe('getValidatedDefaultLocaleNamespaces', () => {
  const complete = Object.fromEntries(REQUIRED_NAMESPACES.map((namespace) => [namespace, { key: 'значение' }]));

  it('given every required namespace with values, when validating, then returns them', () => {
    expect(getValidatedDefaultLocaleNamespaces(complete)).toBe(complete);
  });

  it('given no default locale, when validating, then throws', () => {
    expect(() => getValidatedDefaultLocaleNamespaces(undefined)).toThrow(/Default locale "ru" is missing/);
  });

  it('given a missing required namespace, when validating, then throws naming it', () => {
    const withoutEditor = Object.fromEntries(
      Object.entries(complete).filter(([namespace]) => namespace !== 'editor'),
    );

    expect(() => getValidatedDefaultLocaleNamespaces(withoutEditor)).toThrow(/ru\/editor\.json is missing/);
  });

  it('given a namespace with only empty values, when validating, then throws', () => {
    const empty = { ...complete, shared: { nested: { value: null }, list: [] } };

    expect(() => getValidatedDefaultLocaleNamespaces(empty)).toThrow(/ru\/shared\.json does not contain/);
  });
});

describe('LocalizationProvider', () => {
  it('given the provider, when a component reads the locale, then it renders ru strings and sets the page language', () => {
    const BrandName = () => <span>{useLocale().brand.name}</span>;

    render(
      <LocalizationProvider>
        <BrandName />
      </LocalizationProvider>,
    );

    expect(screen.getByText('mktba')).toBeDefined();
    expect(document.documentElement.lang).toBe('ru');
  });

  it('given a language without its own dictionary, when rendered, then it reads the ru strings and sets its own page language', () => {
    const Probe = () => <span>{`${useLanguage()}:${useLocale().brand.name}:${useLocalizedPath()('/search')}`}</span>;

    render(
      <LocalizationProvider language="en">
        <Probe />
      </LocalizationProvider>,
    );

    expect(screen.getByText('en:mktba:/en/search')).toBeDefined();
    expect(document.documentElement.lang).toBe('en');
    expect(dictionaryFor('en')).toBe(dictionaries.ru);
    expect(hasOwnDictionary('ru')).toBe(true);
    expect(hasOwnDictionary('en')).toBe(false);
  });

  it('given no provider, when the locale hook runs, then it throws', () => {
    expect(() => renderHook(() => useLocale())).toThrow(/must be used within LocalizationProvider/);
  });
});
