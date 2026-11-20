import { useMemo, useState } from 'react';
import { ArticleBreadcrumbs } from '../../components/article/ArticleBreadcrumbs';
import { ArticleDates } from '../../components/article/ArticleDates';
import { ArticleFooter } from '../../components/article/ArticleFooter';
import { ArticleInfoboxPanel } from '../../components/article/ArticleInfoboxPanel';
import { ArticleMobileOverview } from '../../components/article/ArticleMobileOverview';
import { ArticleParagraphList } from '../../components/article/ArticleParagraphs';
import { useArticleOutline, useRenderedParagraphs, useTocItems } from '../../components/article/useArticleParagraphs';
import { ArticleRightSidebar } from '../../components/article/ArticleRightSidebar';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useMazhab } from '../../context/mazhabContext';
import { useLocale } from '../../localization/hooks';
import { ARTICLE_OVERVIEW_ANCHOR } from '../../shared/articleOutline';
import { collectCitedSources } from '../../shared/articleSources';
import { findArticlePath } from '../../shared/articleTree';
import { estimateReadingMinutes } from '../../shared/readingTime';
import type { ArticleAuthorDto, NavigationTreeDto, SchoolDto } from '../../shared/types/ApiTypes';
import { buildArticlePreviewContent, PREVIEW_WIDTHS, type PreviewWidth } from './articlePreview';
import type { ArticleDraft } from './articleDraft';
import type { RelatedLinkDraft } from './metadataHelpers';
import { PreviewFrame } from './PreviewFrame';

type ArticleDraftPreviewProps = {
  draft: ArticleDraft;
  /** The saved article, `null` for a new one: where it sits in the tree, its dates and authors. */
  article: { id: number; publishedAt?: string | null; updatedAt?: string | null; authors?: ArticleAuthorDto[] | null } | null;
  /** The system schools and the article's own: the schools its opinions may name. */
  schools: SchoolDto[];
  /** The editor's tree (every status): breadcrumbs and child articles. */
  navigationTree: NavigationTreeDto | undefined;
};

const toFooterArticle = (link: RelatedLinkDraft, navigationTree: NavigationTreeDto | undefined) => ({
  id: link.articleId,
  slug: findArticlePath(navigationTree, link.articleId).at(-1)?.slug ?? '',
  title: link.articleTitle,
});

/**
 * The unsaved draft through the reader's own components (E-11, #81): the article column as on
 * `/{slug}` — breadcrumbs, title, dates, the overview, the infobox, the text with the reader's
 * opinion selection and the footer — inside a frame of a phone's, a tablet's or a desktop's width.
 * The mazhab picked here is the preview's own: the reader's saved choice is only where it starts.
 */
export const ArticleDraftPreview = ({ draft, article, schools, navigationTree }: ArticleDraftPreviewProps) => {
  const locale = useLocale();
  const t = locale.addArticlePage.preview;
  const { selectedSchoolId: readerSchoolId } = useMazhab();
  const [schoolId, setSchoolId] = useState<number | null>(readerSchoolId);
  const [width, setWidth] = useState<PreviewWidth>('desktop');

  const systemSchools = useMemo(() => schools.filter((school) => school.isSystem), [schools]);
  const content = useMemo(() => buildArticlePreviewContent(draft), [draft]);
  const { renderedParagraphs, setAlternative } = useRenderedParagraphs(content.paragraphs, schools, schoolId);
  const outline = useArticleOutline(renderedParagraphs);
  const tocItems = useTocItems(outline);

  const parentPath = useMemo(() => {
    if (article) return findArticlePath(navigationTree, article.id).slice(0, -1);
    return draft.parentArticleId !== null ? findArticlePath(navigationTree, draft.parentArticleId) : [];
  }, [article, draft.parentArticleId, navigationTree]);
  const childArticles = useMemo(
    () => (article ? findArticlePath(navigationTree, article.id).at(-1)?.children ?? [] : []),
    [article, navigationTree],
  );

  const tags = useMemo(() => content.tags.map((name) => ({ name, slug: name })), [content.tags]);
  const relatedArticles = useMemo(
    () => draft.relatedLinks.map((link) => toFooterArticle(link, navigationTree)),
    [draft.relatedLinks, navigationTree],
  );
  const citedSources = useMemo(() => collectCitedSources(content.paragraphs, content.sources), [content]);
  const readingMinutes = useMemo(
    () =>
      estimateReadingMinutes(content.paragraphs.map((paragraph) =>
        (paragraph.opinions.find((opinion) => opinion.isDefault) ?? paragraph.opinions[0])?.content ?? '')),
    [content.paragraphs],
  );

  const title = content.title || locale.common.untitled;

  return (
    <section aria-label={t.title} className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-ink-muted)]">
          {t.mazhab}
          <select
            value={schoolId ?? ''}
            onChange={(event) => setSchoolId(event.target.value ? Number(event.target.value) : null)}
            className="min-h-8 rounded-lg border border-[var(--color-border-soft)] bg-white px-2 text-xs text-[var(--color-ink-strong)]"
          >
            <option value="">{t.noMazhab}</option>
            {systemSchools.map((school) => (
              <option key={school.id} value={school.id}>{school.name}</option>
            ))}
          </select>
        </label>
        <div role="group" aria-label={t.width} className="flex items-center gap-1">
          {(Object.keys(PREVIEW_WIDTHS) as PreviewWidth[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={width === key}
              onClick={() => setWidth(key)}
              className={`min-h-8 rounded-lg border px-2.5 text-xs transition-colors ${width === key
                ? 'border-[var(--color-brand-forest)] bg-[var(--color-brand-forest)] text-white'
                : 'border-[var(--color-border-soft)] bg-white text-[var(--color-ink-muted)] hover:text-[var(--color-ink-strong)]'}`}
            >
              {t.widths[key].replace('{width}', String(PREVIEW_WIDTHS[key]))}
            </button>
          ))}
        </div>
      </div>
      <p className="m-0 text-xs text-[var(--color-ink-subtle)]">{t.note}</p>

      <PreviewFrame width={PREVIEW_WIDTHS[width]} title={t.frameTitle}>
        <div className="flex min-h-screen bg-page-bg text-ink-default">
          {/* The site's navigation sidebar is not rendered; its place is kept, so the column is as wide as on the site. */}
          <div
            aria-hidden="true"
            className="hidden shrink-0 border-r border-[var(--color-border-soft)] bg-[var(--color-page-panel)] lg:block"
            style={{ width: APP_CONSTANTS.DIMENSIONS.SIDEBAR_WIDTH }}
          />
          <div className="min-w-0 flex-1 xl:flex xl:gap-0">
            <article className="min-w-0 flex-1 overflow-hidden bg-white shadow-[0_24px_80px_rgba(28,27,24,0.05)] xl:border-r xl:border-[var(--color-border-soft)]">
              <div className="mx-auto max-w-[760px] px-4 py-6 pb-24 sm:px-6 lg:px-8 xl:px-10">
                <ArticleBreadcrumbs
                  ancestors={parentPath.map((node) => ({ id: node.id, slug: node.slug, title: node.title, hasContent: node.hasContent }))}
                  currentTitle={title}
                />
                <h1 className="mb-4 text-[28px] font-bold tracking-[-0.03em] text-[var(--color-ink-strong)]">{title}</h1>
                <ArticleDates
                  publishedAt={article?.publishedAt}
                  updatedAt={article?.updatedAt}
                  readingMinutes={readingMinutes}
                  authors={article?.authors}
                />
                <ArticleMobileOverview tocItems={tocItems} summary={content.summary} tags={tags} />
                <div className="@container flow-root">
                  <div id={ARTICLE_OVERVIEW_ANCHOR} className="scroll-mt-24">
                    <ArticleInfoboxPanel infobox={content.infobox} />
                  </div>
                  <ArticleParagraphList
                    paragraphs={renderedParagraphs}
                    outline={outline}
                    onSelect={(paragraphId, index, total) => setAlternative(paragraphId, Math.max(0, Math.min(index, total - 1)))}
                  />
                </div>
                <ArticleFooter
                  sources={citedSources}
                  childArticles={childArticles.map((child) => ({ id: child.id, slug: child.slug, title: child.title, hasContent: child.hasContent }))}
                  relatedArticles={relatedArticles}
                  previous={null}
                  next={null}
                  errorReportHref="#"
                />
              </div>
            </article>
            <ArticleRightSidebar
              tocItems={tocItems}
              summary={content.summary}
              tags={tags}
              relatedLinks={relatedArticles.map((link, index) => ({
                id: index + 1,
                relatedArticleId: link.id,
                relatedArticleTitle: link.title,
                relatedArticleSlug: link.slug,
                order: index + 1,
              }))}
            />
          </div>
        </div>
      </PreviewFrame>
    </section>
  );
};
