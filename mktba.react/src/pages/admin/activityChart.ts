import { formatDate } from '../../localization/format';
import type { Language } from '../../localization/language';

// Weeks are UTC calendar weeks (the API's), so their dates are printed in UTC too.
export const formatWeekStart = (language: Language, weekStart: string) => formatDate(language, `${weekStart}T00:00:00Z`, 'dayMonth');

export const EDITS_COLOR = 'var(--color-ink-subtle)';
export const PUBLICATIONS_COLOR = 'var(--color-brand-forest)';
