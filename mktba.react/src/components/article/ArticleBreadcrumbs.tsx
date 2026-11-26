import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { useLocale, useLocalizedPath } from '../../localization/hooks';
import { articleHref } from '../../shared/slug';

/** One article on the way from a root of the tree to the open one. */
export type BreadcrumbArticle = {
  id: number;
  slug: string;
  title: string;
  /** False for a stub: it has no page worth opening, so its title is shown without a link. */
  hasContent: boolean;
};

type ArticleBreadcrumbsProps = {
  /** The open article's ancestors, from the root down; the article itself is not among them. */
  ancestors: BreadcrumbArticle[];
  /** The open article's title: the last, current step. */
  currentTitle: string;
};

const Separator = () => (
  <ChevronRight size={12} aria-hidden="true" className="shrink-0 text-[#bebdb8] rtl:-scale-x-100" />
);

/**
 * The trail above the article title: the home page, the ancestors and the article itself.
 * It is shown for every article, a stub or one the tree does not hold included — then it is
 * the home page and the title.
 */
export const ArticleBreadcrumbs = ({ ancestors, currentTitle }: ArticleBreadcrumbsProps) => {
  const t = useLocale().articlePage;
  const localize = useLocalizedPath();

  return (
    <nav aria-label={t.breadcrumbs} className="mb-5 text-[12.5px]" data-testid="article-breadcrumbs">
      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
        <li className="flex items-center gap-1 text-[var(--color-brand-forest)]">
          <Link to={localize('/')}>{t.breadcrumbsHome}</Link>
          <Separator />
        </li>
        {ancestors.map((ancestor) => (
          <li
            key={ancestor.id}
            className={`flex items-center gap-1 ${ancestor.hasContent ? 'text-[var(--color-brand-forest)]' : 'text-[var(--color-ink-muted)]'}`}
          >
            {ancestor.hasContent ? <Link to={localize(articleHref(ancestor.slug))}>{ancestor.title}</Link> : ancestor.title}
            <Separator />
          </li>
        ))}
        <li aria-current="page" className="text-[var(--color-ink-strong)] [overflow-wrap:anywhere]">
          {currentTitle}
        </li>
      </ol>
    </nav>
  );
};
