import { useLocale } from '../../localization/hooks';
import type { ArticleStatus } from '../../shared/types/ApiTypes';

const toneByStatus: Record<ArticleStatus, string> = {
  Draft: 'border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] text-[var(--color-ink-muted)]',
  InReview: 'border-amber-300 bg-amber-50 text-amber-800',
  Published: 'border-[var(--color-brand-forest)] bg-[var(--color-brand-forest-soft)] text-[var(--color-brand-forest)]',
  Archived: 'border-[var(--color-border-soft)] bg-white text-[var(--color-ink-subtle)]',
};

/** A small label with the article's status in Russian. */
export const ArticleStatusBadge = ({ status, compact = false }: { status: ArticleStatus; compact?: boolean }) => {
  const locale = useLocale();
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full border font-medium',
        compact ? 'px-1.5 text-[10px] leading-4' : 'px-2.5 py-0.5 text-xs',
        toneByStatus[status],
      ].join(' ')}
    >
      {locale.articleStatus[status]}
    </span>
  );
};
