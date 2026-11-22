import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
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
import { ArticleMobileOverview } from '../components/article/ArticleMobileOverview';
import { ArticleRightSidebar } from '../components/article/ArticleRightSidebar';
import { ArticleSkeleton } from '../components/article/ArticleSkeleton';
import { ArticleParagraphList } from '../components/article/ArticleParagraphs';
import { useArticleOutline, useRenderedParagraphs, useTocItems } from '../components/article/useArticleParagraphs';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { useLanguage, useLocale } from '../localization/hooks';
import { localizedPath } from '../localization/language';
import { useNavigationTree } from '../hooks/useNavigationTree';
import { getSchoolsByArticleId, getSystemSchools } from '../services/schoolService';
import { useMazhab } from '../context/mazhabContext';
import { METRIKA_GOALS } from '../analytics/metrika';
import { useReadToEnd } from '../analytics/useReadToEnd';
import { useTrackEvent } from '../analytics/useTrackEvent';
import { trackEvent } from '../analytics/events';
import { useInternalLinkClicks, useOpinionImpressions, useScrollDepth } from '../analytics/articleEvents';
import { ApiError, extractApiErrorMessage } from '../shared/api-client/apiError';
import NotFoundPage from './NotFoundPage';
import { articleHref, authorHref } from '../shared/slug';
import { feedbackHref } from '../shared/feedback';
import { findAdjacentArticles, findArticlePath } from '../shared/articleTree';
import { estimateReadingMinutes } from '../shared/readingTime';
import { ARTICLE_OVERVIEW_ANCHOR } from '../shared/articleOutline';
import { useHydrated } from '../shared/useHydrated';
import { BackToTopButton } from '../components/article/BackToTopButton';
import { useHashAnchor } from '../components/article/useHashAnchor';

const ArticlePage: React.FC = () => {
  const locale = useLocale();
  const language = useLanguage();
  const navigate = useNavigate();
  const { pathname, search: locationSearch } = useLocation();
  const { slug: requestedSlug = '' } = useParams<{ slug: string }>();
  // `/article/{id}` links from before slugs still open the article and are replaced by its `/{slug}` URL.
  const legacyArticleId = parseLegacyArticleId(requestedSlug);
  const { selectedSchoolId } = useMazhab();
  const { data: articleContent, isLoading, error } = useQuery({
    queryKey: articleContentQueryKey(requestedSlug, language),
    queryFn: () => (legacyArticleId !== null
      ? getArticleContentById(legacyArticleId)
      : getArticleContentBySlug(requestedSlug, language)),
    enabled: requestedSlug.length > 0,
  });
  const articleId = articleContent?.id ?? 0;
  const canonicalSlug = articleContent?.slug;
  // The article's own URL: in its language, which a legacy id link does not say (I-01, #105).
  const canonicalPath = canonicalSlug ? localizedPath(articleContent?.locale ?? language, articleHref(canonicalSlug)) : null;

  // An old `/article/…` URL, an id link or an old slug lands on the article's current `/{slug}`
  // without a history entry, keeping the query (`?mazhab=`) as the server's 301 does.
  useEffect(() => {
    if (canonicalPath && canonicalPath !== pathname) {
      navigate(`${canonicalPath}${locationSearch}`, { replace: true });
    }
  }, [canonicalPath, pathname, locationSearch, navigate]);

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
    track(METRIKA_GOALS.articleView, { articleId });
    fiveMinTimerRef.current = setTimeout(() => {
      track(METRIKA_GOALS.articleTime5min, { articleId });
    }, 5 * 60 * 1000);
    return () => {
      if (fiveMinTimerRef.current) clearTimeout(fiveMinTimerRef.current);
    };
  }, [articleId, articleContent, track]);

  const schools = useMemo(
    () => [...(systemSchools ?? []), ...(articleSchools ?? [])],
    [systemSchools, articleSchools],
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

  const { renderedParagraphs, setAlternative } = useRenderedParagraphs(articleContent?.paragraphs, schools, selectedSchoolId);
  const outline = useArticleOutline(renderedParagraphs);
  const tocItems = useTocItems(outline);

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
    track(METRIKA_GOALS.opinionSwitch, { paragraphId, index: boundedIndex });
    const opinionId = renderedParagraphs.find((paragraph) => paragraph.paragraphId === paragraphId)?.opinions[boundedIndex]?.id;
    if (opinionId !== undefined) {
      trackEvent({ type: 'OpinionSwitched', articleId, paragraphId, opinionId, schoolId: selectedSchoolId });
    }
  };

  // The site's own events (N-02, #96), counted once the page is hydrated, so the reader's mazhab is
  // known. The callbacks change only with the article: what is on screen is read from refs when reported.
  const articleReady = hydrated && articleContent !== undefined;
  const articleRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const schoolIdRef = useRef(selectedSchoolId);
  const shownOpinionsRef = useRef(new Map<number, number>());
  useEffect(() => {
    schoolIdRef.current = selectedSchoolId;
    shownOpinionsRef.current = new Map(renderedParagraphs.flatMap((paragraph) =>
      paragraph.hasAlternatives && paragraph.activeOpinion ? [[paragraph.paragraphId, paragraph.activeOpinion.id] as const] : []));
  });
  const versionedParagraphKey = articleReady
    ? renderedParagraphs.filter((paragraph) => paragraph.hasAlternatives).map((paragraph) => paragraph.paragraphId).join(',')
    : '';

  useEffect(() => {
    if (articleReady) trackEvent({ type: 'ArticleView', articleId, schoolId: schoolIdRef.current });
  }, [articleReady, articleId]);

  const reportOpinionShown = useCallback((paragraphId: number) => {
    const opinionId = shownOpinionsRef.current.get(paragraphId);
    if (opinionId !== undefined) {
      trackEvent({ type: 'OpinionShown', articleId, paragraphId, opinionId, schoolId: schoolIdRef.current });
    }
  }, [articleId]);
  useOpinionImpressions(textRef, versionedParagraphKey, reportOpinionShown);

  const reportScrollDepth = useCallback(
    (scrollDepth: number) => trackEvent({ type: 'ScrollDepth', articleId, scrollDepth, schoolId: schoolIdRef.current }),
    [articleId],
  );
  useScrollDepth(textRef, articleReady && renderedParagraphs.length > 0, reportScrollDepth);

  const reportLinkFollowed = useCallback(
    (targetPath: string) => trackEvent({ type: 'InternalLinkClick', articleId, targetPath, schoolId: schoolIdRef.current }),
    [articleId],
  );
  useInternalLinkClicks(articleRef, articleReady, reportLinkFollowed);

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
              authors: (articleContent.authors ?? []).flatMap((author) =>
                author.slug ? [{ name: author.displayName, path: authorHref(author.slug) }] : []),
            }}
            breadcrumbs={breadcrumbSteps}
          />
        )}
      </>
    )
    : <PageMeta noIndex />;

  // The reader scrolled to the end of the text (N-01, #51): once per article, not for a stub.
  const textEndRef = useRef<HTMLDivElement>(null);
  const reportReadToEnd = useCallback(() => track(METRIKA_GOALS.articleReadEnd, { articleId }), [articleId, track]);
  useReadToEnd(textEndRef, renderedParagraphs.length > 0, reportReadToEnd);

  if (isLoading) {
    return (
      <div className="xl:flex">
        {documentHead}
        <ArticleSkeleton />
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
      <article ref={articleRef} className="min-w-0 flex-1 overflow-hidden print:overflow-visible print:border-0 print:shadow-none border-right border-[var(--color-border-soft)] bg-white shadow-[0_24px_80px_rgba(28,27,24,0.05)] xl:rounded-e-none xl:border-e xl:border-[var(--color-border-soft)]">
        <div className="mx-auto max-w-[760px] px-4 py-6 pb-24 sm:px-6 lg:px-8 xl:px-10 print:max-w-none print:p-0!">
          <ArticleBreadcrumbs ancestors={breadcrumbItems.slice(0, -1)} currentTitle={articleContent.title} />

          <h1 className="mb-4 text-[28px] font-bold tracking-[-0.03em] text-[var(--color-ink-strong)]">
            {articleContent.title}
          </h1>
          <ArticleDates
            publishedAt={articleContent.publishedAt}
            updatedAt={articleContent.updatedAt}
            readingMinutes={readingMinutes}
            authors={articleContent.authors}
          />
          <ArticleMobileOverview
            tocItems={tocItems}
            summary={articleContent.summary ?? undefined}
            tags={articleContent.tagLinks ?? []}
          />

          {/* The infobox floats by this column's width, not the viewport's (the sidebars take their share);
              `flow-root` keeps the float inside the column. */}
          <div ref={textRef} className="@container flow-root">
          <div id={ARTICLE_OVERVIEW_ANCHOR} className="scroll-mt-24">
            <ArticleInfoboxPanel infobox={articleContent.infobox} />
          </div>

          <ArticleParagraphList paragraphs={renderedParagraphs} outline={outline} onSelect={selectAlternative} />
          {renderedParagraphs.length > 0 && <div ref={textEndRef} aria-hidden="true" />}
          </div>

          <ArticleFooter
            sources={citedSources}
            childArticles={childArticles}
            relatedArticles={relatedArticles}
            previous={adjacentArticles.previous}
            next={adjacentArticles.next}
            errorReportHref={localizedPath(language, feedbackHref({
              type: 'ArticleError',
              articleId: articleContent.id,
              from: `${canonicalPath ?? pathname}${locationSearch}`,
            }))}
          />
        </div>
      </article>

      <ArticleRightSidebar
        tocItems={tocItems}
        summary={articleContent.summary ?? undefined}
        tags={articleContent.tagLinks ?? []}
        relatedLinks={articleContent.relatedLinks ?? undefined}
      />
      <BackToTopButton />
    </div>
  );
};

export default ArticlePage;
