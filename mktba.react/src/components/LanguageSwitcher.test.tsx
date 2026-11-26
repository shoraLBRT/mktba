import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { languageFromPath } from '../localization/language';
import { LocalizationProvider } from '../localization/provider';
import { LanguageSwitcher } from './LanguageSwitcher';

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <LocalizationProvider language={languageFromPath(new URL(url, 'http://x').pathname)}>
        <LanguageSwitcher />
      </LocalizationProvider>
    </MemoryRouter>,
  );

afterEach(cleanup);

describe('LanguageSwitcher', () => {
  it('given a Russian article, when rendered, then links the same slug under /en/ and marks Russian as current (I-08)', () => {
    renderAt('/namaz?mazhab=hanafi');

    expect(screen.getByRole('link', { name: 'English' }).getAttribute('href')).toBe('/en/namaz?mazhab=hanafi');
    expect(screen.getByText('ru').getAttribute('aria-current')).toBe('true');
  });

  it('given an English page, when rendered, then links the same path without the prefix (I-08)', () => {
    renderAt('/en/tags/fiqh');

    const russian = screen.getAllByRole('link')[0];
    expect(russian.getAttribute('href')).toBe('/tags/fiqh');
    expect(russian.getAttribute('hreflang')).toBe('ru');
    expect(screen.getByText('en').getAttribute('aria-current')).toBe('true');
  });

  it('given the English home, when rendered, then links the Russian home', () => {
    renderAt('/en/');

    expect(screen.getAllByRole('link')[0].getAttribute('href')).toBe('/');
  });

  it.each(['/admin/articles', '/article/new'])('given the Russian-only page %s, when rendered, then shows no switcher', (url) => {
    renderAt(url);

    expect(screen.queryByTestId('language-switcher')).toBeNull();
  });
});
