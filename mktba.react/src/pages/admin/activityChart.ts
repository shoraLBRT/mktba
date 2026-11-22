// Weeks are UTC calendar weeks (the API's), so their dates are printed in UTC too.
const weekDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const formatWeekStart = (weekStart: string) => weekDate.format(new Date(`${weekStart}T00:00:00Z`));

export const EDITS_COLOR = 'var(--color-ink-subtle)';
export const PUBLICATIONS_COLOR = 'var(--color-brand-forest)';
