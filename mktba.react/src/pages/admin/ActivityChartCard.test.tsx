import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { getMyActivity } from '../../services/profileService';
import { ActivityChartCard } from './ActivityChartCard';
import { chartLayout, formatWeekStart } from './activityChart';

vi.mock('../../services/profileService', () => ({ getMyActivity: vi.fn() }));

const fetchActivity = vi.mocked(getMyActivity);

const renderCard = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LocalizationProvider>
        <ActivityChartCard />
      </LocalizationProvider>
    </QueryClientProvider>,
  );

const weeks = [
  { weekStart: '2026-11-02', edits: 0, publications: 0 },
  { weekStart: '2026-11-09', edits: 4, publications: 1 },
  { weekStart: '2026-11-16', edits: 2, publications: 0 },
];

describe('ActivityChartCard', () => {
  beforeEach(() => {
    fetchActivity.mockReset();
  });

  it('given weeks of activity, when it opens, then draws a bar pair per week and lists the numbers', async () => {
    fetchActivity.mockResolvedValue({ weeks });

    renderCard();

    expect((await screen.findByTestId('activity-totals')).textContent).toBe(
      'Всего за 3 нед.: правок — 6, публикаций — 1',
    );
    expect(screen.getByRole('img', { name: 'График активности по неделям' })).toBeTruthy();
    const drawn = screen.getAllByTestId('activity-week');
    expect(drawn).toHaveLength(3);
    expect(drawn[1].querySelector('title')?.textContent).toBe(
      `Неделя с ${formatWeekStart('2026-11-09')}: правок — 4, публикаций — 1`,
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(rows[2].textContent).toBe(`${formatWeekStart('2026-11-09')}41`);
    expect(screen.queryByText('За эти недели нет ни правок, ни публикаций.')).toBeNull();
  });

  it('given no activity, when it opens, then says so and still draws the empty weeks', async () => {
    fetchActivity.mockResolvedValue({ weeks: weeks.map((week) => ({ ...week, edits: 0, publications: 0 })) });

    renderCard();

    expect(await screen.findByText('За эти недели нет ни правок, ни публикаций.')).toBeTruthy();
    expect(screen.getAllByTestId('activity-week')).toHaveLength(3);
  });

  it('given the request fails, when it opens, then shows the failure', async () => {
    fetchActivity.mockRejectedValue(new Error('boom'));

    renderCard();

    expect(await screen.findByText('Не удалось загрузить активность.')).toBeTruthy();
  });
});

describe('chartLayout', () => {
  it('given the busiest week, when laying out, then it fills the plot and the others scale to it', () => {
    const layout = chartLayout(weeks);

    expect(layout.max).toBe(4);
    expect(layout.bars.map((bar) => bar.editsHeight)).toEqual([0, 120, 60]);
    expect(layout.bars.map((bar) => bar.publicationsHeight)).toEqual([0, 30, 0]);
  });

  it('given twelve weeks, when laying out, then labels every second week ending at the current one', () => {
    const twelve = Array.from({ length: 12 }, (_, index) => ({ weekStart: `2026-09-${10 + index}`, edits: 0, publications: 0 }));

    const layout = chartLayout(twelve);

    expect(layout.max).toBe(1);
    expect(layout.bars.filter((bar) => bar.labelled)).toHaveLength(6);
    expect(layout.bars[11].labelled).toBe(true);
    expect(layout.bars[10].labelled).toBe(false);
  });

  it('given a week start, when formatting, then prints its UTC calendar day', () => {
    expect(formatWeekStart('2026-11-16')).toMatch(/^16 нояб/);
  });
});
