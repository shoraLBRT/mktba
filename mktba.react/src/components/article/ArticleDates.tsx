import { useLocale } from '../../localization/hooks';
import { formatRussianDate } from '../../shared/lib/formatDate';

type ArticleDatesProps = {
  publishedAt?: string | null;
  updatedAt?: string | null;
};

type DateLine = {
  template: string;
  iso: string;
  text: string;
};

/** «Опубликовано {date}» with the date as a `<time>` carrying the machine-readable instant. */
const DateLineView = ({ template, iso, text }: DateLine) => {
  const [before, after = ''] = template.split('{date}');
  return (
    <span>
      {before}
      <time dateTime={new Date(iso).toISOString()}>{text}</time>
      {after}
    </span>
  );
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
    publishedAt && published ? { template: t.publishedOn, iso: publishedAt, text: published } : null,
    updatedAt && updated && updated !== published ? { template: t.updatedOn, iso: updatedAt, text: updated } : null,
  ].filter((line): line is DateLine => line !== null);

  if (lines.length === 0) {
    return null;
  }

  return (
    <p className="mb-4 flex flex-wrap gap-x-4 text-xs text-[var(--color-ink-subtle)]" data-testid="article-dates">
      {lines.map((line) => (
        <DateLineView key={line.template} {...line} />
      ))}
    </p>
  );
};
