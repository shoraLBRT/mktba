import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { formatRussianDate } from '../../shared/lib/formatDate';
import { ArticleDates } from './ArticleDates';

const renderDates = (publishedAt?: string | null, updatedAt?: string | null, readingMinutes?: number | null) =>
  render(
    <LocalizationProvider>
      <ArticleDates publishedAt={publishedAt} updatedAt={updatedAt} readingMinutes={readingMinutes} />
    </LocalizationProvider>,
  );

describe('formatRussianDate', () => {
  it('given a UTC timestamp, when formatted, then reads as a Russian calendar date of that UTC day', () => {
    expect(formatRussianDate('2026-11-01T23:30:00Z')).toMatch(/^1 ноября 2026/);
  });
});

describe('ArticleDates', () => {
  it('given publication and a later update, when rendered, then shows both lines', () => {
    renderDates('2026-11-01T09:00:00Z', '2026-11-19T10:00:00Z');

    const [published, updated] = screen.getByTestId('article-dates').children;
    expect(published.textContent).toMatch(/^Опубликовано 1 ноября 2026/);
    expect(updated.textContent).toMatch(/^Обновлено 19 ноября 2026/);
  });

  it('given both dates, when rendered, then each date is a time element with its ISO instant', () => {
    renderDates('2026-11-01T09:00:00Z', '2026-11-19T10:00:00.1234567Z');

    const times = [...screen.getByTestId('article-dates').querySelectorAll('time')];
    expect(times.map((time) => time.getAttribute('datetime'))).toEqual([
      '2026-11-01T09:00:00.000Z',
      '2026-11-19T10:00:00.123Z',
    ]);
    expect(times[0].textContent).toMatch(/^1 ноября 2026/);
  });

  it('given an update on the publication day, when rendered, then shows only the publication date', () => {
    renderDates('2026-11-01T09:00:00Z', '2026-11-01T18:00:00Z');

    expect(screen.getByTestId('article-dates').textContent).toMatch(/^Опубликовано 1 ноября 2026/);
    expect(screen.getByTestId('article-dates').textContent).not.toMatch(/Обновлено/);
  });

  it('given no dates, when rendered, then renders nothing', () => {
    renderDates(null, null);

    expect(screen.queryByTestId('article-dates')).toBeNull();
  });

  it('given a reading time, when rendered, then it follows the dates with a spoken label', () => {
    renderDates('2026-11-01T09:00:00Z', '2026-11-19T10:00:00Z', 7);

    const line = screen.getByTestId('article-dates');
    expect(line.lastElementChild).toBe(screen.getByTestId('article-reading-time'));
    expect(line.lastElementChild?.querySelector('[aria-hidden="true"]')?.textContent).toBe('7 мин чтения');
    expect(line.lastElementChild?.querySelector('.sr-only')?.textContent).toBe('Время чтения: около 7 мин');
  });

  it('given a reading time and no dates, when rendered, then shows the reading time alone', () => {
    renderDates(null, null, 1);

    expect(screen.getByTestId('article-dates').children).toHaveLength(1);
    expect(screen.getByTestId('article-reading-time').textContent).toContain('1 мин чтения');
  });

  it('given dates and nothing to read, when rendered, then shows no reading time', () => {
    renderDates('2026-11-01T09:00:00Z', null, null);

    expect(screen.queryByTestId('article-reading-time')).toBeNull();
  });

  const renderAuthors = (authors: { displayName: string; slug?: string | null }[], publishedAt: string | null = '2026-11-01T09:00:00Z') =>
    render(
      <MemoryRouter>
        <LocalizationProvider>
          <ArticleDates publishedAt={publishedAt} authors={authors} />
        </LocalizationProvider>
      </MemoryRouter>,
    );

  it('given one author with a page, when rendered, then the line comes first and links the name to the author page', () => {
    renderAuthors([{ displayName: 'Ахмад Иванов', slug: 'ahmad-ivanov' }]);

    const line = screen.getByTestId('article-authors');
    expect(screen.getByTestId('article-dates').firstElementChild).toBe(line);
    expect(line.textContent).toBe('Автор: Ахмад Иванов');
    const link = screen.getByRole('link', { name: 'Ахмад Иванов' });
    expect(link.getAttribute('href')).toBe('/authors/ahmad-ivanov');
    expect(link.getAttribute('rel')).toBe('author');
  });

  it('given an author and a co-author without a page, when rendered, then both are named in order and only the first is a link', () => {
    renderAuthors([{ displayName: 'Ахмад Иванов', slug: 'ahmad-ivanov' }, { displayName: 'Умар Петров', slug: null }]);

    expect(screen.getByTestId('article-authors').textContent).toBe('Авторы: Ахмад Иванов, Умар Петров');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('given no named author, when rendered, then there is no author line', () => {
    renderAuthors([]);

    expect(screen.queryByTestId('article-authors')).toBeNull();
    expect(screen.getByTestId('article-dates').textContent).toMatch(/^Опубликовано/);
  });

  it('given an author and no dates, when rendered, then the author line stands alone', () => {
    renderAuthors([{ displayName: 'Ахмад Иванов', slug: null }], null);

    expect(screen.getByTestId('article-dates').textContent).toBe('Автор: Ахмад Иванов');
  });
});
