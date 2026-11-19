import { useLocale } from '../../localization/hooks';
import { formatRussianDate } from '../../shared/lib/formatDate';

type ArticleDatesProps = {
  publishedAt?: string | null;
  updatedAt?: string | null;
  /** Estimated minutes to read the article; left out when there is nothing to read. */
  readingMinutes?: number | null;
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
 * «Опубликовано …», «Обновлено …» and the reading time under the article title. The update line
 * is left out when it falls on the publication day, so a fresh article shows a single date.
 */
export const ArticleDates = ({ publishedAt, updatedAt, readingMinutes = null }: ArticleDatesProps) => {
  const t = useLocale().articlePage;
  const published = publishedAt ? formatRussianDate(publishedAt) : null;
  const updated = updatedAt ? formatRussianDate(updatedAt) : null;
  const lines = [
    publishedAt && published ? { template: t.publishedOn, iso: publishedAt, text: published } : null,
    updatedAt && updated && updated !== published ? { template: t.updatedOn, iso: updatedAt, text: updated } : null,
  ].filter((line): line is DateLine => line !== null);

  if (lines.length === 0 && readingMinutes === null) {
    return null;
  }

  const minutes = String(readingMinutes);

  return (
    <p className="mb-4 flex flex-wrap gap-x-4 text-xs text-[var(--color-ink-subtle)]" data-testid="article-dates">
      {lines.map((line) => (
        <DateLineView key={line.template} {...line} />
      ))}
      {readingMinutes !== null ? (
        <span data-testid="article-reading-time">
          <span aria-hidden="true">{t.readingTime.replace('{minutes}', minutes)}</span>
          <span className="sr-only">{t.readingTimeLabel.replace('{minutes}', minutes)}</span>
        </span>
      ) : null}
    </p>
  );
};
