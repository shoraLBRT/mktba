import { Link } from 'react-router';
import { VerifiedMark } from './article/VerifiedMark';
import { useFormat, useLocale, useLocalizedPath } from '../localization/hooks';
import { articleHref } from '../shared/slug';
import type { AuthorArticleDto } from '../shared/types/ApiTypes';

const linkClass = 'text-[var(--color-brand-forest)] underline-offset-2 hover:underline';

/**
 * One article of a public list (the author page, the tag page): the title as a link, the
 * «Проверено учёными» mark when it counts as verified (V-08, #124), the summary and the dates.
 */
export const ArticleListEntry = ({ article }: { article: AuthorArticleDto }) => {
  const t = useLocale().articlePage;
  const format = useFormat();
  const localize = useLocalizedPath();
  // A save on the day of publication is not news: the second date is shown from the next day on.
  const edited = format.date(article.updatedAt) !== format.date(article.publishedAt) && article.updatedAt > article.publishedAt;
  const date = (template: string, iso: string) => {
    const [before, after = ''] = template.split('{date}');
    return (
      <>
        {before}
        <time dateTime={new Date(iso).toISOString()}>{format.date(iso)}</time>
        {after}
      </>
    );
  };

  return (
    <li>
      <Link to={localize(articleHref(article.slug))} className={`font-medium [overflow-wrap:anywhere] ${linkClass}`}>
        {article.title}
      </Link>
      {article.isVerified && <VerifiedMark />}
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
