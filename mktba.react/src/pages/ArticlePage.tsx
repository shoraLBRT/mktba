import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getArticleContentById, getArticleContentBySlug } from '../services/Article/articleService';
import { ArticleInfoboxPanel } from '../components/article/ArticleInfoboxPanel';
import { ArticleDates } from '../components/article/ArticleDates';
import { ArticleMeta } from '../components/article/ArticleMeta';
import { ArticleRightSidebar, type TocItem } from '../components/article/ArticleRightSidebar';
import { VersionedParagraphBlock, type OpinionTab } from '../components/article/VersionedParagraphBlock';
import { resolvePaletteKey } from '../components/mazhab/schoolPalette';
import { resolveAutoOpinionIndex } from '../components/mazhab/opinionSelection';
import MarkdownContent from '../components/MarkdownContent';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { useLocale } from '../localization/hooks';
import { formatMessage, type Locale } from '../localization';
import {
  ARTICLE_UI_MODE_STORAGE_KEY,
  DEFAULT_ARTICLE_UI_MODE,
  isParagraphUiMode,
  type ParagraphUiMode,
} from '../constants/ArticleUiConstants';
import { useNavigationTree } from '../hooks/useNavigationTree';
import { getSchoolsByArticleId, getSystemSchools } from '../services/schoolService';
import type { NavigationArticleDto, SchoolDto } from '../shared/types/ApiTypes';
import { useMazhab } from '../context/mazhabContext';
import { useTrackEvent } from '../analytics/useTrackEvent';
import { ApiError, extractApiErrorMessage } from '../shared/api-client/apiError';
import NotFoundPage from './NotFoundPage';
import { articleHref } from '../shared/slug';

const findArticlePathById = (
  articles: NavigationArticleDto[],
  targetArticleId: number,
  parentPath: NavigationArticleDto[] = [],
): NavigationArticleDto[] => {
  for (const article of articles) {
    const currentPath = [...parentPath, article];

    if (article.id === targetArticleId && article.hasContent) {
      return currentPath;
    }

    if (article.children && article.children.length > 0) {
      const nestedPath = findArticlePathById(article.children, targetArticleId, currentPath);
      if (nestedPath.length > 0) {
        return nestedPath;
      }
    }
  }

  return [];
};

const getInitialUiMode = (): ParagraphUiMode => {
  const savedMode = localStorage.getItem(ARTICLE_UI_MODE_STORAGE_KEY);
  return isParagraphUiMode(savedMode) ? savedMode : DEFAULT_ARTICLE_UI_MODE;
};

const headingPattern = /^(#{1,6})\s+(.+)$/gm;

const extractHeadingTitle = (content: string): string | null => {
  const match = headingPattern.exec(content);
  headingPattern.lastIndex = 0;
  return match?.[2]?.trim() ?? null;
};

/**
 * Captions for one opinion. The chip caption is always rendered next to the
 * colour, so the mazhab stays readable without relying on hue alone.
 */
const buildOpinionCaptions = (
  schools: SchoolDto[],
  systemSchoolIds: number[],
  t: Locale['versionedParagraph'],
): Pick<OpinionTab, 'shortLabel' | 'fullLabel'> => {
  if (schools.length === 0) {
    return { shortLabel: t.tabCommon, fullLabel: t.labelCommon };
  }

  const coversEverySystemSchool =
    systemSchoolIds.length > 0 &&
    systemSchoolIds.every((schoolId) => schools.some((school) => school.id === schoolId));

  if (coversEverySystemSchool) {
    return { shortLabel: t.tabConsensus, fullLabel: t.labelConsensus };
  }

  if (schools.length === 1) {
    return {
      shortLabel: schools[0].shortName,
      fullLabel: formatMessage(t.label, { school: schools[0].name }),
    };
  }

  return {
    shortLabel: schools.map((school) => school.shortName).join(' · '),
    fullLabel: formatMessage(t.labelSeveral, {
      schools: schools.map((school) => school.name).join(', '),
    }),
  };
};

const ArticlePage: React.FC = () => {
  const locale = useLocale();
  const navigate = useNavigate();
  const { slug: requestedSlug = '' } = useParams<{ slug: string }>();
  // `/article/{id}` links from before slugs still open the article and are replaced by its slug URL.
  const legacyArticleId = /^\d+$/.test(requestedSlug) ? Number(requestedSlug) : null;
  const [uiMode] = useState<ParagraphUiMode>(getInitialUiMode);
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
    queryKey: legacyArticleId !== null
      ? [APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, legacyArticleId]
      : [APP_CONSTANTS.QUERY_KEYS.ARTICLE_CONTENT, 'slug', requestedSlug],
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
    () => (navigationTree ? findArticlePathById(navigationTree, articleId) : []),
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

  const renderedParagraphs = useMemo(() => {
    return [...(articleContent?.paragraphs ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((paragraph) => {
        const autoIndex = resolveAutoOpinionIndex(paragraph.opinions, selectedSchoolId);
        const activeIndex = selectedAlternatives[paragraph.id] ?? autoIndex;
        const activeOpinion = paragraph.opinions[activeIndex] ?? paragraph.opinions[0];
        const title = extractHeadingTitle(activeOpinion?.content ?? '');

        const tabs = paragraph.opinions.map<OpinionTab>((opinion) => {
          const schools = opinion.schoolIds
            .map((schoolId) => schoolMap.get(schoolId))
            .filter((school): school is SchoolDto => school !== undefined);

          return {
            ...buildOpinionCaptions(schools, systemSchoolIds, tv),
            paletteKey: resolvePaletteKey(schools),
          };
        });

        return {
          paragraphId: paragraph.id,
          order: paragraph.order,
          opinions: paragraph.opinions,
          activeIndex,
          activeOpinion,
          tabs,
          hasAlternatives: paragraph.opinions.length > 1,
          anchorId: title ? `section-${paragraph.order}` : `paragraph-${paragraph.order}`,
          title,
        };
      });
  }, [articleContent, selectedAlternatives, schoolMap, selectedSchoolId, systemSchoolIds, tv]);

  const tocItems = useMemo<TocItem[]>(() => {
    const items: TocItem[] = [{ id: 'article-overview', label: locale.articlePage.overview }];

    renderedParagraphs.forEach((paragraph) => {
      if (paragraph.title) {
        items.push({ id: paragraph.anchorId, label: paragraph.title });
      }
    });

    return items;
  }, [locale.articlePage.overview, renderedParagraphs]);

  const normalizeAlternativeIndex = (index: number, total: number) => {
    if (total <= 0) return 0;
    return ((index % total) + total) % total;
  };

  const selectAlternative = (paragraphId: number, index: number, total: number) => {
    const boundedIndex = Math.max(0, Math.min(index, total - 1));
    setAlternative(paragraphId, boundedIndex);
    track('opinion_switch', { paragraphId, index: boundedIndex });
  };

  const moveAlternative = (paragraphId: number, currentIndex: number, direction: -1 | 1, total: number) => {
    const nextIndex = normalizeAlternativeIndex(currentIndex + direction, total);
    setAlternative(paragraphId, nextIndex);
    track('opinion_switch', { paragraphId, index: nextIndex });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-border-soft)] border-t-[var(--color-brand-forest)]" />
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 404) {
    return <NotFoundPage />;
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-xl rounded-3xl border border-red-200 bg-red-50 px-6 py-5 text-red-700 shadow-sm">
          <p className="m-0 text-base font-semibold">{locale.articlePage.loadError}</p>
          <p className="mb-0 mt-2 text-sm text-red-600">{extractApiErrorMessage(error)}</p>
        </div>
      </div>
    );
  }

  if (!articleContent) {
    return <NotFoundPage />;
  }

  return (
    <div className="xl:flex xl:gap-0">
      {articleContent.meta && articleContent.slug ? <ArticleMeta meta={articleContent.meta} slug={articleContent.slug} /> : null}
      <main className="min-w-0 flex-1 overflow-hidden border-right border-[var(--color-border-soft)] bg-white shadow-[0_24px_80px_rgba(28,27,24,0.05)] xl:rounded-r-none xl:border-r xl:border-[var(--color-border-soft)]">
        <div className="mx-auto max-w-[760px] px-4 py-6 pb-24 sm:px-6 lg:px-8 xl:px-10">
          {breadcrumbItems.length > 0 ? (
            <nav className="mb-5 flex flex-wrap items-center gap-1 text-[12.5px]">
              {breadcrumbItems.map((item, index) => (
                <React.Fragment key={`${item.id}-${index}`}>
                  <span className={
                    index === breadcrumbItems.length - 1
                      ? 'text-[var(--color-ink-strong)]'
                      : item.hasContent
                        ? 'text-[var(--color-brand-forest)]'
                        : 'text-[var(--color-ink-muted)]'
                  }>
                    {item.hasContent ? <Link to={articleHref(item.slug)}>{item.title}</Link> : item.title}
                  </span>
                  {index < breadcrumbItems.length - 1 ? (
                    <ChevronRight size={12} className="shrink-0 text-[#bebdb8]" />
                  ) : null}
                </React.Fragment>
              ))}
            </nav>
          ) : null}

          <h1 className="mb-4 text-[28px] font-bold tracking-[-0.03em] text-[var(--color-ink-strong)]">
            {articleContent.title}
          </h1>
          <ArticleDates publishedAt={articleContent.publishedAt} updatedAt={articleContent.updatedAt} />

          <div id="article-overview" className="scroll-mt-24">
            <ArticleInfoboxPanel infobox={articleContent.infobox} />
          </div>

          {renderedParagraphs.length > 0 ? (
            renderedParagraphs.map((paragraph) => {
              if (!paragraph.hasAlternatives) {
                return (
                  <section key={paragraph.paragraphId} id={paragraph.anchorId} className="scroll-mt-24 py-0.5">
                    <div className="article-markdown text-[14.5px] leading-8 text-[var(--color-ink-default)]">
                      <MarkdownContent content={paragraph.activeOpinion?.content ?? ''} />
                    </div>
                  </section>
                );
              }

              return (
                <div key={paragraph.paragraphId} id={paragraph.anchorId} className="scroll-mt-24">
                  <VersionedParagraphBlock
                    order={paragraph.order}
                    activeIndex={paragraph.activeIndex}
                    tabs={paragraph.tabs}
                    mode={uiMode}
                    onSelect={(index) => selectAlternative(paragraph.paragraphId, index, paragraph.opinions.length)}
                    onMove={(direction) => moveAlternative(paragraph.paragraphId, paragraph.activeIndex, direction, paragraph.opinions.length)}
                  >
                    <div className="article-markdown">
                      <MarkdownContent content={paragraph.activeOpinion?.content ?? ''} />
                    </div>
                  </VersionedParagraphBlock>
                </div>
              );
            })
          ) : (
            <div className="rounded-3xl border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] px-8 py-10 text-center text-[var(--color-ink-muted)] shadow-sm">
              {locale.articlePage.noContent}
            </div>
          )}
        </div>
      </main>

      <ArticleRightSidebar
        tocItems={tocItems}
        summary={articleContent.summary ?? undefined}
        tags={articleContent.tags}
        relatedLinks={articleContent.relatedLinks ?? undefined}
      />
    </div>
  );
};

export default ArticlePage;
