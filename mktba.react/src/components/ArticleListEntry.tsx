import { Link } from 'react-router';
import { useLocale } from '../localization/hooks';
import { formatRussianDate } from '../shared/lib/formatDate';
import { articleHref } from '../shared/slug';
import type { AuthorArticleDto } from '../shared/types/ApiTypes';

const linkClass = 'text-[var(--color-brand-forest)] underline-offset-2 hover:underline';

/**
 * One article of a public list (the author page, the tag page): the title as a link, the summary
 * and the dates.
 */
export const ArticleListEntry = ({ article }: { article: AuthorArticleDto }) => {
  const t = useLocale().articlePage;
  // A save on the day of publication is not news: the second date is shown from the next day on.
  const edited = formatRussianDate(article.updatedAt) !== formatRussianDate(article.publishedAt) && article.updatedAt > article.publishedAt;
  const date = (template: string, iso: string) => {
    const [before, after = ''] = template.split('{date}');
    return (
      <>
        {before}
        <time dateTime={new Date(iso).toISOString()}>{formatRussianDate(iso)}</time>
        {after}
      </>
    );
  };

  return (
    <li>
      <Link to={articleHref(article.slug)} className={`font-medium [overflow-wrap:anywhere] ${linkClass}`}>
        {article.title}
      </Link>
      {article.summary && (
        <p className="mb-0 mt-1 line-clamp-2 text-sm leading-6 text-[var(--color-ink-muted)]">{article.summary}</p>
      )}
      <p className="mb-0 mt-1 text-xs text-[var(--color-ink-subtle)]">
        {date(t.publishedOn, article.publishedAt)}
        {edited && <> · {date(t.updatedOn, article.updatedAt)}</>}
      </p>
    </li>
  );
};
