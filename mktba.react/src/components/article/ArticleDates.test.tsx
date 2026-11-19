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

    expect(screen.getByText(/^Опубликовано 1 ноября 2026/)).toBeTruthy();
    expect(screen.getByText(/^Обновлено 19 ноября 2026/)).toBeTruthy();
  });

  it('given an update on the publication day, when rendered, then shows only the publication date', () => {
    renderDates('2026-11-01T09:00:00Z', '2026-11-01T18:00:00Z');

    expect(screen.getByTestId('article-dates').textContent).toMatch(/^Опубликовано 1 ноября 2026/);
    expect(screen.queryByText(/Обновлено/)).toBeNull();
  });

  it('given no dates, when rendered, then renders nothing', () => {
    renderDates(null, null);

    expect(screen.queryByTestId('article-dates')).toBeNull();
  });
});
