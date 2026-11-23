import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { MazhabProvider } from '../../context/MazhabProvider';
import { MAZHAB_STORAGE_KEY } from '../../context/mazhabContext';
import type { Language } from '../../localization/language';
import { LocalizationProvider } from '../../localization/provider';
import type { SchoolDto } from '../../shared/types/ApiTypes';
import { MAZHAB_HINT_STORAGE_KEY, MazhabSelector } from './MazhabSelector';

const school = (id: number, slug: string, name: string, shortName: string): SchoolDto =>
  ({ id, slug, name, shortName, isSystem: true }) as SchoolDto;

const SYSTEM_SCHOOLS = [
  school(1, 'hanafi', 'Ханафитский мазхаб', 'Хан'),
  school(3, 'shafii', 'Шафиитский мазхаб', 'Шаф'),
];

const HINT = /Мазхаб — школа исламского права\. Выберите свою/;

const ENGLISH_SCHOOLS = [
  school(1, 'hanafi', 'Hanafi madhhab', 'Han'),
  school(3, 'shafii', "Shafi'i madhhab", 'Shaf'),
];

const renderSelector = (url = '/salat', language: Language = 'ru') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS, 'ru'], SYSTEM_SCHOOLS);
  client.setQueryData([APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS, 'en'], ENGLISH_SCHOOLS);
  render(
    <QueryClientProvider client={client}>
      <LocalizationProvider language={language}>
        <MemoryRouter initialEntries={[url]}>
          <MazhabProvider>
            <MazhabSelector />
          </MazhabProvider>
        </MemoryRouter>
      </LocalizationProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('MazhabSelector', () => {
  it('given a first visit, when rendered, then the hint explains the mazhab and closing it is remembered', () => {
    renderSelector();
    expect(screen.getByRole('note').textContent).toMatch(HINT);

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть подсказку' }));

    expect(screen.queryByRole('note')).toBeNull();
    expect(localStorage.getItem(MAZHAB_HINT_STORAGE_KEY)).not.toBeNull();
  });

  it('given the hint was seen before, when rendered, then it is not shown again', () => {
    localStorage.setItem(MAZHAB_HINT_STORAGE_KEY, '1');

    renderSelector();

    expect(screen.queryByRole('note')).toBeNull();
  });

  it('given a first visit, when the picker is opened, then the hint goes away for good', () => {
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Мазхаб не выбран' }));

    expect(screen.queryByRole('note')).toBeNull();
    expect(localStorage.getItem(MAZHAB_HINT_STORAGE_KEY)).not.toBeNull();
  });

  it('given a reader with a saved mazhab, when rendered, then there is no hint and the button names the mazhab', () => {
    localStorage.setItem(MAZHAB_STORAGE_KEY, '3');

    renderSelector();

    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByRole('button', { name: 'Шафиитский мазхаб' })).not.toBeNull();
  });

  it('given an English reader with a saved mazhab, when rendered, then the button names it in English', () => {
    localStorage.setItem(MAZHAB_STORAGE_KEY, '3');

    renderSelector('/en/salat', 'en');

    expect(screen.getByRole('button', { name: "Shafi'i madhhab" })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Шафиитский мазхаб' })).toBeNull();
  });

  it('given no mazhab chosen, when the picker is opened, then no link is offered', () => {
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Мазхаб не выбран' }));

    expect(screen.queryByRole('button', { name: 'Скопировать ссылку с этим мазхабом' })).toBeNull();
  });

  it('given a chosen mazhab, when the link is copied, then it carries the school slug and the copy is confirmed', async () => {
    localStorage.setItem(MAZHAB_STORAGE_KEY, '3');
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Шафиитский мазхаб' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку с этим мазхабом' }));

    expect(await screen.findByText('Ссылка скопирована')).not.toBeNull();
    expect(new URL(writeText.mock.calls[0][0] as string).searchParams.get('mazhab')).toBe('shafii');
  });

  it('given the clipboard is unavailable, when the link is copied, then the failure is shown', async () => {
    localStorage.setItem(MAZHAB_STORAGE_KEY, '3');
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Шафиитский мазхаб' }));
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку с этим мазхабом' }));

    expect(await screen.findByText('Не удалось скопировать ссылку')).not.toBeNull();
  });
});
