import { ChevronDown } from 'lucide-react';
import { METRIKA_GOALS, trackGoal } from '../../analytics/metrika';
import { useLocale } from '../../localization/hooks';
import type { ArticleTagDto } from '../../shared/types/ApiTypes';
import type { TocItem } from './ArticleRightSidebar';
import { ArticleTagList } from './ArticleTagList';

type ArticleMobileOverviewProps = {
  tocItems: TocItem[];
  summary?: string;
  tags?: ArticleTagDto[];
};

const captionClass = 'mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]';

/**
 * The right sidebar's table of contents, summary and tags for screens below `xl`, where the sidebar
 * is hidden (R-11, #47): one collapsed `<details>` under the article header. It is plain HTML, so it
 * is in the server HTML and opens before hydration; from `xl` up it is hidden by CSS. Related articles
 * are not here: below `xl` the article footer lists them.
 */
export const ArticleMobileOverview = ({ tocItems, summary, tags }: ArticleMobileOverviewProps) => {
  const locale = useLocale();
  const t = locale.articleMobileOverview;
  const sidebarText = locale.articleRightSidebar;
  const hasToc = tocItems.length > 0;
  const hasSummary = Boolean(summary?.trim());
  const hasTags = Boolean(tags && tags.length > 0);

  if (!hasToc && !hasSummary && !hasTags) {
    return null;
  }

  const title = hasToc && (hasSummary || hasTags) ? t.contentsAndSummary : hasToc ? t.contents : t.summary;

  return (
    <details
      data-testid="article-mobile-overview"
      className="print:hidden group mb-5 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] xl:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-[13px] font-semibold text-[var(--color-ink-strong)] [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown size={15} aria-hidden="true" className="shrink-0 text-[var(--color-ink-muted)] transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-4 border-t border-[var(--color-border-soft)] px-3.5 py-3">
        {hasToc && (
          <nav aria-label={sidebarText.onThisPage}>
            <p className={captionClass}>{sidebarText.onThisPage}</p>
            <ul className="m-0 list-none space-y-0.5 p-0">
              {tocItems.map((item) => (
                <li key={item.id} className={item.depth === 3 ? 'ps-4' : undefined}>
                  <a
                    href={`#${item.id}`}
                    className="block py-1.5 text-[13.5px] leading-5 text-[var(--color-brand-forest)] hover:underline"
                    onClick={() => trackGoal(METRIKA_GOALS.tocClick, { depth: item.depth })}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {hasSummary && (
          <div>
            <p className={captionClass}>{sidebarText.summaryTitle}</p>
            <p className="m-0 text-[13px] leading-5 text-[var(--color-ink-default)]">{summary}</p>
          </div>
        )}

        {hasTags && (
          <div>
            <p className={captionClass}>{sidebarText.tagsTitle}</p>
            <ArticleTagList tags={tags!} label={sidebarText.tagsTitle} />
          </div>
        )}
      </div>
    </details>
  );
};
