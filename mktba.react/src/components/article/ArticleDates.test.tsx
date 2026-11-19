import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { formatRussianDate } from '../../shared/lib/formatDate';
import { ArticleDates } from './ArticleDates';

const renderDates = (publishedAt?: string | null, updatedAt?: string | null) =>
  render(
    <LocalizationProvider>
      <ArticleDates publishedAt={publishedAt} updatedAt={updatedAt} />
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
});
