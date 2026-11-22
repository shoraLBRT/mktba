import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router';
import { METRIKA_GOALS, trackGoal } from '../../analytics/metrika';
import { useLocale } from '../../localization/hooks';
import { articleHref } from '../../shared/slug';
import type { ArticleRelatedLinkDto, ArticleTagDto } from '../../shared/types/ApiTypes';
import { ArticleTagList } from './ArticleTagList';
import { useActiveSection } from './useActiveSection';

/** Each block after the first is divided from the one above by a rule. */
const blockClass = 'border-t border-[var(--color-border-soft)] pt-4 mt-5 first:mt-0 first:border-t-0 first:pt-0';

export type TocItem = {
  /** Id of the element the entry leads to. */
  id: string;
  label: string;
  /** Heading level of the entry: 2 for a section, 3 for a subsection (indented). */
  depth: 2 | 3;
};

type ArticleRightSidebarProps = {
  tocItems: TocItem[];
  summary?: string;
  tags?: ArticleTagDto[];
  relatedLinks?: ArticleRelatedLinkDto[];
};

export const ArticleRightSidebar = ({ tocItems, summary, tags, relatedLinks }: ArticleRightSidebarProps) => {
  const locale = useLocale();
  const t = locale.articleRightSidebar;
  const tocIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);
  const { activeId, select } = useActiveSection(tocIds);
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);

  // In a long table of contents the current entry stays in sight.
  useEffect(() => {
    const link = activeLinkRef.current;
    if (link && link.offsetParent !== null && typeof link.scrollIntoView === 'function') {
      link.scrollIntoView({ block: 'nearest' });
    }
  }, [activeId]);

  const hasTags = tags && tags.length > 0;
  const hasRelatedLinks = relatedLinks && relatedLinks.length > 0;
  const hasSummary = Boolean(summary?.trim());
  const hasToc = tocItems.length > 0;

  // A block with nothing to show is left out, and so is the column when every block is empty (a stub
  // without a summary, tags or related articles): the article column then takes the width.
  if (!hasToc && !hasSummary && !hasTags && !hasRelatedLinks) {
    return null;
  }

  return (
    <aside className="print:hidden! hidden xl:sticky xl:top-[var(--layout-header-height)] xl:block xl:h-[calc(100vh-var(--layout-header-height))] xl:w-[220px] xl:shrink-0 xl:overflow-hidden">
      <div className="h-full overflow-y-auto px-4 py-4">
        {hasToc && (
          <div className={blockClass}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
              {t.onThisPage}
            </p>
            <nav aria-label={t.onThisPage} className="space-y-0.5">
              {tocItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  ref={activeId === item.id ? activeLinkRef : undefined}
                  aria-current={activeId === item.id ? 'location' : undefined}
                  className={[
                    'block rounded py-1 pr-2 text-[12.5px] transition-colors',
                    item.depth === 3 ? 'pl-5' : 'pl-2',
                    activeId === item.id
                      ? 'bg-[var(--color-brand-forest-soft)] text-[var(--color-brand-forest)]'
                      : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-page-panel)] hover:text-[var(--color-ink-strong)]',
                  ].join(' ')}
                  onClick={() => {
                    select(item.id);
                    trackGoal(METRIKA_GOALS.tocClick, { depth: item.depth });
                  }}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        )}

        {(hasSummary || hasTags) && (
          <div className={`${blockClass} space-y-3`}>
            {hasSummary && (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
                  {t.summaryTitle}
                </p>
                <p className="m-0 text-[12px] leading-5 text-[var(--color-ink-default)]">{summary}</p>
              </div>
            )}
            {hasTags && (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
                  {t.tagsTitle}
                </p>
                <ArticleTagList tags={tags!} label={t.tagsTitle} />
              </div>
            )}
          </div>
        )}

        {hasRelatedLinks && (
          <div className={blockClass}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
              {t.relatedArticles}
            </p>
            <nav aria-label={t.relatedArticles} className="space-y-0.5">
              {relatedLinks!.map((link) => (
                <Link
                  key={link.id}
                  to={articleHref(link.relatedArticleSlug)}
                  className="block rounded px-2 py-1 text-[12.5px] text-[var(--color-brand-forest)] transition-colors hover:bg-[var(--color-brand-forest-soft)]"
                >
                  {link.relatedArticleTitle}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </div>
    </aside>
  );
};
