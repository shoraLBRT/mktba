import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dictionaries, formatMessage, locale } from './index';
import { useLocale } from './hooks';
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

  it('given no provider, when the locale hook runs, then it throws', () => {
    expect(() => renderHook(() => useLocale())).toThrow(/must be used within LocalizationProvider/);
  });
});
