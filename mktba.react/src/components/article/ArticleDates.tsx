import { Link } from 'react-router';
import { useLocale } from '../../localization/hooks';
import { authorHref } from '../../shared/author';
import { formatRussianDate } from '../../shared/lib/formatDate';
import type { ArticleAuthorDto } from '../../shared/types/ApiTypes';

type ArticleDatesProps = {
  publishedAt?: string | null;
  updatedAt?: string | null;
  /** Estimated minutes to read the article; left out when there is nothing to read. */
  readingMinutes?: number | null;
  /** The credited people who have a name, the author first; a slug means the author page exists. */
  authors?: ArticleAuthorDto[] | null;
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
 * The authors, «Опубликовано …», «Обновлено …» and the reading time under the article title. The
 * update line is left out when it falls on the publication day, so a fresh article shows a single
 * date. An author is a link only when their page exists; with no named author there is no line.
 */
export const ArticleDates = ({ publishedAt, updatedAt, readingMinutes = null, authors }: ArticleDatesProps) => {
  const t = useLocale().articlePage;
  const published = publishedAt ? formatRussianDate(publishedAt) : null;
  const updated = updatedAt ? formatRussianDate(updatedAt) : null;
  const lines = [
    publishedAt && published ? { template: t.publishedOn, iso: publishedAt, text: published } : null,
    updatedAt && updated && updated !== published ? { template: t.updatedOn, iso: updatedAt, text: updated } : null,
  ].filter((line): line is DateLine => line !== null);

  const named = authors ?? [];

  if (lines.length === 0 && readingMinutes === null && named.length === 0) {
    return null;
  }

  const minutes = String(readingMinutes);

  return (
    <p className="mb-4 flex flex-wrap gap-x-4 text-xs text-[var(--color-ink-subtle)]" data-testid="article-dates">
      {named.length > 0 ? (
        <span data-testid="article-authors">
          {named.length > 1 ? t.authors : t.author}
          {named.map(({ displayName, slug }, index) => (
            <span key={slug ?? displayName}>
              {index > 0 ? ', ' : ' '}
              {slug ? (
                <Link to={authorHref(slug)} rel="author" className="text-[var(--color-brand-forest)] underline">
                  {displayName}
                </Link>
              ) : displayName}
            </span>
          ))}
        </span>
      ) : null}
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
