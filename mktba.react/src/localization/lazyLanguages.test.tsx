import { act, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The test setup loads every language up front; these tests take a fresh copy of the localization
// modules, as a browser has on its first page, where nothing is loaded yet (I-02, #106).
const freshLocalization = async () => {
  vi.resetModules();
  const localization = await import('./index');
  const { LocalizationProvider } = await import('./provider');
  const { useLocale } = await import('./hooks');
  return { ...localization, LocalizationProvider, useLocale };
};

describe('lazy languages (#106)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('given a first page, when nothing has loaded a language, then no dictionary is in memory', async () => {
    const { isLanguageLoaded } = await freshLocalization();

    expect(isLanguageLoaded('ru')).toBe(false);
    expect(isLanguageLoaded('en')).toBe(false);
  });

  it('given a Russian route module, when it is imported, then the Russian strings are there at once', async () => {
    const { isLanguageLoaded, dictionaryFor } = await freshLocalization();

    await import('./defaultLanguage');

    expect(isLanguageLoaded('ru')).toBe(true);
    expect(dictionaryFor('ru').brand.name).toBe('mktba');
    expect(isLanguageLoaded('en')).toBe(false);
  });

  it('given an English page, when its language is loaded, then the Russian core is not loaded with it', async () => {
    const { isLanguageLoaded, loadLanguage, dictionaryFor } = await freshLocalization();

    await loadLanguage('en');

    expect(isLanguageLoaded('en')).toBe(true);
    expect(isLanguageLoaded('ru')).toBe(false);
    expect(dictionaryFor('en').layout.menu.home).toBe('Home');
  });

  it('given English, when the admin chunk loads before the Russian core, then English reads the Russian admin keys', async () => {
    const { loadLanguage, loadLocaleChunk, dictionaryFor } = await freshLocalization();

    await loadLanguage('en');
    await loadLocaleChunk('admin');
    await import('./defaultLanguage');

    expect(dictionaryFor('en').adminPage).toEqual(dictionaryFor('ru').adminPage);
  });

  it('given a navigation from a Russian page into English, when the en strings are not loaded, then the provider suspends until they are', async () => {
    const { LocalizationProvider, useLocale, loadLanguage } = await freshLocalization();
    await import('./defaultLanguage');
    const Home = () => <span>{useLocale().layout.menu.home}</span>;
    let suspended = false;
    const Loading = () => {
      suspended = true;
      return null;
    };
    const page = (language: 'ru' | 'en') => (
      <Suspense fallback={<Loading />}>
        <LocalizationProvider language={language}>
          <Home />
        </LocalizationProvider>
      </Suspense>
    );

    const { rerender } = render(page('ru'));
    expect(screen.queryByText('Home')).toBeNull();
    expect(suspended).toBe(false);

    await act(async () => rerender(page('en')));
    // The provider waits on this same load; once it resolves, React renders the English page.
    await act(() => loadLanguage('en'));

    expect(suspended).toBe(true);
    expect(screen.getByText('Home')).toBeDefined();
  });
});
