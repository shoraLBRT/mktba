import { Tag } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router';
import { METRIKA_GOALS, trackGoal } from '../../analytics/metrika';
import { useLocale } from '../../localization/hooks';
import { articleHref } from '../../shared/slug';
import type { ArticleRelatedLinkDto } from '../../shared/types/ApiTypes';
import { useActiveSection } from './useActiveSection';

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
  tags?: string[];
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

  return (
    <aside className="hidden xl:sticky xl:top-[var(--layout-header-height)] xl:block xl:h-[calc(100vh-var(--layout-header-height))] xl:w-[220px] xl:shrink-0 xl:overflow-hidden">
      <div className="h-full overflow-y-auto px-4 py-4">
        <div className="mb-6">
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

        {(hasSummary || hasTags) && (
          <div className="mb-4 border-t border-[var(--color-border-soft)] pt-4 space-y-3">
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
                <div className="flex flex-wrap gap-1">
                  {tags!.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full bg-[var(--color-brand-forest-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-brand-forest)]"
                    >
                      <Tag size={8} />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-[var(--color-border-soft)] pt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">
            {t.relatedArticles}
          </p>
          {hasRelatedLinks ? (
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
          ) : (
            <p className="m-0 text-[12px] leading-5 text-[var(--color-ink-subtle)]">{t.noRelatedArticles}</p>
          )}
        </div>
      </div>
    </aside>
  );
};
