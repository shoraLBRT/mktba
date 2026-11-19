import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { getArticleContentById, getArticleContentBySlug } from '../services/Article/articleService';
import { articleContentQueryKey, parseLegacyArticleId } from '../services/Article/articleQueries';
import { ArticleInfoboxPanel } from '../components/article/ArticleInfoboxPanel';
import { ArticleBreadcrumbs } from '../components/article/ArticleBreadcrumbs';
import { ArticleDates } from '../components/article/ArticleDates';
import { ArticleFooter } from '../components/article/ArticleFooter';
import { collectCitedSources } from '../shared/articleSources';
import { ArticleMeta } from '../components/article/ArticleMeta';
import { NotFoundMeta, PageMeta } from '../components/PageMeta';
import { ArticleStructuredData } from '../components/StructuredData';
import { ArticleRightSidebar, type TocItem } from '../components/article/ArticleRightSidebar';
import { VersionedParagraphBlock, type OpinionTab } from '../components/article/VersionedParagraphBlock';
import { resolvePaletteKey } from '../components/mazhab/schoolPalette';
import { resolveAutoOpinionIndex } from '../components/mazhab/opinionSelection';
import { buildOpinionCaptions, resolveMissingOpinionNote } from '../components/mazhab/opinionCaptions';
import MarkdownContent from '../components/MarkdownContent';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { useLocale } from '../localization/hooks';
import { useNavigationTree } from '../hooks/useNavigationTree';
import { getSchoolsByArticleId, getSystemSchools } from '../services/schoolService';
import type { SchoolDto } from '../shared/types/ApiTypes';
import { useMazhab } from '../context/mazhabContext';
import { useTrackEvent } from '../analytics/useTrackEvent';
import { ApiError, extractApiErrorMessage } from '../shared/api-client/apiError';
import NotFoundPage from './NotFoundPage';
import { articleHref } from '../shared/slug';
import { findAdjacentArticles, findArticlePath } from '../shared/articleTree';
import { estimateReadingMinutes } from '../shared/readingTime';
import { ARTICLE_OVERVIEW_ANCHOR, buildArticleOutline } from '../shared/articleOutline';
import { useHydrated } from '../shared/useHydrated';
import { BackToTopButton } from '../components/article/BackToTopButton';
import { useHashAnchor } from '../components/article/useHashAnchor';

const ArticlePage: React.FC = () => {
  const locale = useLocale();
  const navigate = useNavigate();
  const { slug: requestedSlug = '' } = useParams<{ slug: string }>();
  // `/article/{id}` links from before slugs still open the article and are replaced by its slug URL.
  const legacyArticleId = parseLegacyArticleId(requestedSlug);
  const { selectedSchoolId } = useMazhab();
  // Per-paragraph overrides are scoped to the mazhab they were made under, so
  // picking a different mazhab drops them without a state-resetting effect.
  const [overrides, setOverrides] = useState<{
    schoolId: number | null;
    byParagraph: Record<number, number>;
  }>({ schoolId: selectedSchoolId, byParagraph: {} });

  const selectedAlternatives = useMemo(
    () => (overrides.schoolId === selectedSchoolId ? overrides.byParagraph : {}),
    [overrides, selectedSchoolId],
  );

  const setAlternative = (paragraphId: number, index: number) => {
    setOverrides((current) => ({
      schoolId: selectedSchoolId,
      byParagraph:
        current.schoolId === selectedSchoolId
          ? { ...current.byParagraph, [paragraphId]: index }
          : { [paragraphId]: index },
    }));
  };

  const { data: articleContent, isLoading, error } = useQuery({
    queryKey: articleContentQueryKey(requestedSlug),
    queryFn: () => (legacyArticleId !== null
      ? getArticleContentById(legacyArticleId)
      : getArticleContentBySlug(requestedSlug)),
    enabled: requestedSlug.length > 0,
  });
  const articleId = articleContent?.id ?? 0;
  const canonicalSlug = articleContent?.slug;

  // An id link or an old slug lands on the article's current slug URL without a history entry.
  useEffect(() => {
    if (canonicalSlug && canonicalSlug !== requestedSlug) {
      navigate(articleHref(canonicalSlug), { replace: true });
    }
  }, [canonicalSlug, requestedSlug, navigate]);

  const { data: navigationTree } = useNavigationTree();

  const { data: systemSchools } = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS],
    queryFn: getSystemSchools,
  });

  const { data: articleSchools } = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.ARTICLE_SCHOOLS, articleId],
    queryFn: () => getSchoolsByArticleId(articleId),
    enabled: articleId > 0,
  });

  const track = useTrackEvent();
  const fiveMinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!articleContent) return;
    track('article_view', { articleId });
    fiveMinTimerRef.current = setTimeout(() => {
      track('article_time_5min', { articleId });
    }, 5 * 60 * 1000);
    return () => {
      if (fiveMinTimerRef.current) clearTimeout(fiveMinTimerRef.current);
    };
  }, [articleId, articleContent, track]);

  const tv = locale.versionedParagraph;

  const schoolMap = useMemo<Map<number, SchoolDto>>(() => {
    const map = new Map<number, SchoolDto>();
    for (const s of systemSchools ?? []) map.set(s.id, s);
    for (const s of articleSchools ?? []) map.set(s.id, s);
    return map;
  }, [systemSchools, articleSchools]);

  const systemSchoolIds = useMemo(
    () => (systemSchools ?? []).map((school) => school.id),
    [systemSchools],
  );

  const articlePath = useMemo(
    () => findArticlePath(navigationTree, articleId),
    [navigationTree, articleId],
  );

  const breadcrumbItems = useMemo(
    () =>
      articlePath.map((article) => ({
        id: article.id,
        slug: article.slug,
        title: article.title,
        hasContent: article.hasContent,
      })),
    [articlePath],
  );

  // The bottom of the page reads the same tree as the breadcrumbs: the public one hides
  // non-Published articles, so neither the children nor the neighbours can name one.
  const childArticles = useMemo(
    () =>
      (articlePath[articlePath.length - 1]?.children ?? []).map((child) => ({
        id: child.id,
        slug: child.slug,
        title: child.title,
        hasContent: child.hasContent,
      })),
    [articlePath],
  );

  const adjacentArticles = useMemo(
    () => findAdjacentArticles(navigationTree, articleId),
    [navigationTree, articleId],
  );

  const relatedArticles = useMemo(
    () =>
      (articleContent?.relatedLinks ?? []).map((link) => ({
        id: link.id,
        slug: link.relatedArticleSlug,
        title: link.relatedArticleTitle,
      })),
    [articleContent],
  );

  const citedSources = useMemo(
    () => collectCitedSources(articleContent?.paragraphs ?? [], articleContent?.sources ?? []),
    [articleContent],
  );

  const renderedParagraphs = useMemo(() => {
    return [...(articleContent?.paragraphs ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((paragraph) => {
        const autoIndex = resolveAutoOpinionIndex(paragraph.opinions, selectedSchoolId);
        const activeIndex = selectedAlternatives[paragraph.id] ?? autoIndex;
        const activeOpinion = paragraph.opinions[activeIndex] ?? paragraph.opinions[0];

        const tabs = paragraph.opinions.map<OpinionTab>((opinion) => {
          const schools = opinion.schoolIds
            .map((schoolId) => schoolMap.get(schoolId))
            .filter((school): school is SchoolDto => school !== undefined);

          return {
            ...buildOpinionCaptions(schools, systemSchoolIds, tv),
            paletteKey: resolvePaletteKey(schools),
            isReaderSchool: selectedSchoolId !== null && opinion.schoolIds.includes(selectedSchoolId),
          };
        });
        const note = resolveMissingOpinionNote(
          paragraph.opinions,
          activeIndex,
          selectedSchoolId,
          selectedSchoolId !== null ? schoolMap.get(selectedSchoolId) : undefined,
          tv,
        );

        return {
          paragraphId: paragraph.id,
          order: paragraph.order,
          opinions: paragraph.opinions,
          activeIndex,
          activeOpinion,
          tabs,
          note,
          hasAlternatives: paragraph.opinions.length > 1,
        };
      });
  }, [articleContent, selectedAlternatives, schoolMap, selectedSchoolId, systemSchoolIds, tv]);

  // Anchors follow the opinions on screen: the default ones in the server HTML and while hydrating,
  // the reader's after that. Only the shown opinion's headings get ids, so an id is never repeated
  // in a hidden panel.
  const outline = useMemo(
    () =>
      buildArticleOutline(
        renderedParagraphs.map((paragraph) => ({
          paragraphId: paragraph.paragraphId,
          content: paragraph.activeOpinion?.content ?? '',
        })),
      ).map((paragraph) => ({
        ...paragraph,
        headingAnchors: paragraph.headings.map((heading) => ({
          id: heading.id,
          text: heading.text,
          linkLabel: locale.articlePage.headingLink.replace('{title}', heading.text),
        })),
      })),
    [renderedParagraphs, locale.articlePage.headingLink],
  );

  const tocItems = useMemo<TocItem[]>(
    () => [
      { id: ARTICLE_OVERVIEW_ANCHOR, label: locale.articlePage.overview, depth: 2 },
      ...outline.flatMap((paragraph) =>
        paragraph.headings
          .filter((heading) => heading.depth <= 3 && heading.text.length > 0)
          .map<TocItem>((heading) => ({ id: heading.id, label: heading.text, depth: heading.depth === 3 ? 3 : 2 }))),
    ],
    [locale.articlePage.overview, outline],
  );

  const hydrated = useHydrated();
  useHashAnchor(hydrated && articleContent !== undefined, `${articleId}:${selectedSchoolId ?? ''}`);

  // The estimate follows each paragraph's default opinion, so it is the same in the server HTML
  // and after the reader's mazhab is read from the browser.
  const readingMinutes = useMemo(
    () =>
      estimateReadingMinutes(
        (articleContent?.paragraphs ?? []).map((paragraph) =>
          (paragraph.opinions.find((opinion) => opinion.isDefault) ?? paragraph.opinions[0])?.content ?? ''),
      ),
    [articleContent],
  );

  const selectAlternative = (paragraphId: number, index: number, total: number) => {
    const boundedIndex = Math.max(0, Math.min(index, total - 1));
    setAlternative(paragraphId, boundedIndex);
    track('opinion_switch', { paragraphId, index: boundedIndex });
  };

  // Structured data breadcrumbs (O-05): the visible trail, without the section titles that link nowhere.
  const breadcrumbSteps = useMemo(
    () =>
      breadcrumbItems
        .filter((item, index) => item.hasContent || index === breadcrumbItems.length - 1)
        .map((item) => ({ name: item.title, path: articleHref(item.slug) })),
    [breadcrumbItems],
  );

  // The page always renders its own metadata (the route's `ownsMeta` handle): the article's, or a
  // non-indexed placeholder while it loads or failed. A noindex article carries no structured data.
  const documentHead = articleContent?.meta && articleContent.slug
    ? (
      <>
        <ArticleMeta
          meta={articleContent.meta}
          slug={articleContent.slug}
          publishedAt={articleContent.publishedAt}
          updatedAt={articleContent.updatedAt}
        />
        {articleContent.meta.noIndex ? null : (
          <ArticleStructuredData
            article={{
              path: articleHref(articleContent.slug),
              headline: articleContent.title,
              description: articleContent.meta.description,
              image: articleContent.meta.socialImageUrl,
              publishedAt: articleContent.publishedAt,
              updatedAt: articleContent.updatedAt,
            }}
            breadcrumbs={breadcrumbSteps}
          />
        )}
      </>
    )
    : <PageMeta noIndex />;

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        {documentHead}
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-border-soft)] border-t-[var(--color-brand-forest)]" />
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 410) {
    return (
      <>
        <NotFoundMeta status={410} />
        <NotFoundPage status={410} />
      </>
    );
  }

  if ((error instanceof ApiError && error.status === 404) || (!error && !articleContent)) {
    return (
      <>
        <NotFoundMeta />
        <NotFoundPage />
      </>
    );
  }

  if (error || !articleContent) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        {documentHead}
        <div className="w-full max-w-xl rounded-3xl border border-red-200 bg-red-50 px-6 py-5 text-red-700 shadow-sm">
          <h1 className="m-0 text-base font-semibold">{locale.articlePage.loadError}</h1>
          <p className="mb-0 mt-2 text-sm text-red-600">{extractApiErrorMessage(error)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="xl:flex xl:gap-0">
      {documentHead}
      <article className="min-w-0 flex-1 overflow-hidden border-right border-[var(--color-border-soft)] bg-white shadow-[0_24px_80px_rgba(28,27,24,0.05)] xl:rounded-r-none xl:border-r xl:border-[var(--color-border-soft)]">
        <div className="mx-auto max-w-[760px] px-4 py-6 pb-24 sm:px-6 lg:px-8 xl:px-10">
          <ArticleBreadcrumbs ancestors={breadcrumbItems.slice(0, -1)} currentTitle={articleContent.title} />

          <h1 className="mb-4 text-[28px] font-bold tracking-[-0.03em] text-[var(--color-ink-strong)]">
            {articleContent.title}
          </h1>
          <ArticleDates
            publishedAt={articleContent.publishedAt}
            updatedAt={articleContent.updatedAt}
            readingMinutes={readingMinutes}
          />

          {/* The infobox floats by this column's width, not the viewport's (the sidebars take their share);
              `flow-root` keeps the float inside the column. */}
          <div className="@container flow-root">
          <div id={ARTICLE_OVERVIEW_ANCHOR} className="scroll-mt-24">
            <ArticleInfoboxPanel infobox={articleContent.infobox} />
          </div>

          {renderedParagraphs.length > 0 ? (
            renderedParagraphs.map((paragraph, index) => {
              const { anchorId, headingAnchors, startsWithHeading } = outline[index];
              // A paragraph that opens with a heading is linked through the heading's own anchor.
              const paragraphLink = startsWithHeading ? null : (
                <a
                  href={`#${anchorId}`}
                  aria-label={locale.articlePage.paragraphLink.replace('{number}', String(index + 1))}
                  className={`absolute -left-6 ${paragraph.hasAlternatives ? 'top-4' : 'top-1'} hidden h-6 w-6 items-center justify-center rounded text-[13px] text-[var(--color-ink-muted)] no-underline opacity-0 transition-opacity hover:text-[var(--color-brand-forest)] focus-visible:opacity-100 group-hover/paragraph:opacity-100 sm:flex`}
                >
                  <span aria-hidden="true">¶</span>
                </a>
              );

              if (!paragraph.hasAlternatives) {
                return (
                  <section key={paragraph.paragraphId} id={anchorId} className="group/paragraph relative scroll-mt-24 py-0.5">
                    {paragraphLink}
                    <div className="article-markdown text-[14.5px] leading-8 text-[var(--color-ink-default)]">
                      <MarkdownContent content={paragraph.activeOpinion?.content ?? ''} headingAnchors={headingAnchors} />
                    </div>
                  </section>
                );
              }

              return (
                <div key={paragraph.paragraphId} id={anchorId} className="group/paragraph relative scroll-mt-24">
                  {paragraphLink}
                  <VersionedParagraphBlock
                    activeIndex={paragraph.activeIndex}
                    tabs={paragraph.tabs}
                    note={paragraph.note}
                    onSelect={(optionIndex) => selectAlternative(paragraph.paragraphId, optionIndex, paragraph.opinions.length)}
                    panels={paragraph.opinions.map((opinion, opinionIndex) => (
                      <div key={opinion.id} className="article-markdown">
                        <MarkdownContent
                          content={opinion.content}
                          headingAnchors={opinionIndex === paragraph.activeIndex ? headingAnchors : undefined}
                        />
                      </div>
                    ))}
                  />
                </div>
              );
            })
          ) : (
            <div className="flow-root rounded-3xl border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] px-8 py-10 text-center text-[var(--color-ink-muted)] shadow-sm">
              {locale.articlePage.noContent}
            </div>
          )}
          </div>

          <ArticleFooter
            sources={citedSources}
            childArticles={childArticles}
            relatedArticles={relatedArticles}
            previous={adjacentArticles.previous}
            next={adjacentArticles.next}
          />
        </div>
      </article>

      <ArticleRightSidebar
        tocItems={tocItems}
        summary={articleContent.summary ?? undefined}
        tags={articleContent.tags}
        relatedLinks={articleContent.relatedLinks ?? undefined}
      />
      <BackToTopButton />
    </div>
  );
};

export default ArticlePage;
