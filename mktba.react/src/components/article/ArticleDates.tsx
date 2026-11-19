import { useLocale } from '../../localization/hooks';
import { formatRussianDate } from '../../shared/lib/formatDate';

type ArticleDatesProps = {
  publishedAt?: string | null;
  updatedAt?: string | null;
};

/**
 * «Опубликовано …» and «Обновлено …» under the article title. The update line is left out when
 * it falls on the publication day, so a fresh article shows a single date.
 */
export const ArticleDates = ({ publishedAt, updatedAt }: ArticleDatesProps) => {
  const t = useLocale().articlePage;
  const published = publishedAt ? formatRussianDate(publishedAt) : null;
  const updated = updatedAt ? formatRussianDate(updatedAt) : null;
  const lines = [
    published ? t.publishedOn.replace('{date}', published) : null,
    updated && updated !== published ? t.updatedOn.replace('{date}', updated) : null,
  ].filter((line): line is string => line !== null);

  if (lines.length === 0) {
    return null;
  }

  return (
    <p className="mb-4 flex flex-wrap gap-x-4 text-xs text-[var(--color-ink-subtle)]" data-testid="article-dates">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </p>
  );
};
