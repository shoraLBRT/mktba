import { formatDate } from '../../localization/format';

/**
 * @deprecated Use `useFormat().date(iso, 'short')` (I-04, #108): it follows the reader's language.
 * Kept only for the admin article list until it moves over.
 */
export const formatShortRussianDate = (iso: string): string => formatDate('ru', iso, 'short');
