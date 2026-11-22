import type { ActivityWeekDto } from '../../shared/types/ApiTypes';

// Weeks are UTC calendar weeks (the API's), so their dates are printed in UTC too.
const weekDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const formatWeekStart = (weekStart: string) => weekDate.format(new Date(`${weekStart}T00:00:00Z`));

export const EDITS_COLOR = 'var(--color-ink-subtle)';
export const PUBLICATIONS_COLOR = 'var(--color-brand-forest)';

export const AXIS_WIDTH = 28;
const WEEK_WIDTH = 30;
export const BAR_WIDTH = 11;
export const PLOT_TOP = 8;
export const PLOT_HEIGHT = 120;
const LABEL_HEIGHT = 20;

/** The SVG geometry of the chart: no chart library, two bars per week on a shared scale. */
export const chartLayout = (weeks: ActivityWeekDto[]) => {
  const max = Math.max(1, ...weeks.map((week) => Math.max(week.edits, week.publications)));
  const barHeight = (value: number) => (value / max) * PLOT_HEIGHT;
  // About six date labels whatever the number of weeks; the current week is always labelled.
  const labelEvery = Math.max(1, Math.ceil(weeks.length / 6));
  return {
    max,
    width: AXIS_WIDTH + weeks.length * WEEK_WIDTH,
    height: PLOT_TOP + PLOT_HEIGHT + LABEL_HEIGHT,
    bars: weeks.map((week, index) => ({
      week,
      x: AXIS_WIDTH + index * WEEK_WIDTH + (WEEK_WIDTH - 2 * BAR_WIDTH - 2) / 2,
      editsHeight: barHeight(week.edits),
      publicationsHeight: barHeight(week.publications),
      labelled: (weeks.length - 1 - index) % labelEvery === 0,
    })),
  };
};
