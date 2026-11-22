import { useId, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { SearchForm } from '../components/search/SearchForm';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { useNavigationTree } from '../hooks/useNavigationTree';
import { useFormat, useLocale } from '../localization/hooks';
import { getRecentArticles } from '../services/Article/articleService';
import { articleHref } from '../shared/slug';
import type { NavigationArticleDto, RecentArticleDto } from '../shared/types/ApiTypes';
import { homeSections } from './home/homeTree';

const linkClass = 'text-[var(--color-brand-forest)] underline-offset-2 hover:underline';
const sectionTitleClass = 'm-0 text-lg font-semibold text-[var(--color-ink-strong)]';
const panelClass = 'rounded-2xl border border-[var(--color-border-soft)] bg-white p-5';

/** An article of the tree as a link, or as plain text for a stub with no page to open. */
const TreeArticleLink = ({ article }: { article: NavigationArticleDto }) =>
  article.hasContent ? (
    <Link to={articleHref(article.slug)} className={linkClass}>
      {article.title}
    </Link>
  ) : (
    <span className="text-[var(--color-ink-muted)]">{article.title}</span>
  );

/** The top level of the tree: each section with its first nested articles. */
const Sections = ({ tree }: { tree: NavigationArticleDto[] | undefined }) => {
  const t = useLocale().homePage.sections;
  const titleId = useId();
  const sections = useMemo(() => homeSections(tree), [tree]);

  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className={sectionTitleClass}>
        {t.title}
      </h2>
      {sections.length === 0 ? (
        <p className="mb-0 mt-3 text-sm text-[var(--color-ink-muted)]">{t.empty}</p>
      ) : (
        <ul className="m-0 mt-4 grid list-none gap-4 p-0 sm:grid-cols-2">
          {sections.map(({ article, preview, moreCount }) => (
            <li key={article.id} className={panelClass}>
              <h3 className="m-0 text-base font-semibold text-[var(--color-ink-strong)]">
                <TreeArticleLink article={article} />
              </h3>
              {preview.length > 0 && (
                <ul className="m-0 mt-3 list-none space-y-1.5 p-0 text-sm">
                  {preview.map((child) => (
                    <li key={child.id}>
                      <TreeArticleLink article={child} />
                    </li>
                  ))}
                  {moreCount > 0 && (
                    <li className="text-[var(--color-ink-subtle)]">{t.more.replace('{count}', String(moreCount))}</li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

type RecentListProps = {
  title: string;
  articles: RecentArticleDto[];
  /** «Опубликовано {date}» or «Обновлено {date}». */
  dateTemplate: string;
  dateOf: (article: RecentArticleDto) => string;
  /** Shown instead of the list when it is empty; without it an empty list is left out altogether. */
  emptyText?: string;
};

const RecentList = ({ title, articles, dateTemplate, dateOf, emptyText }: RecentListProps) => {
  const titleId = useId();
  const format = useFormat();
  const [beforeDate, afterDate = ''] = dateTemplate.split('{date}');

  if (articles.length === 0 && !emptyText) {
    return null;
  }

  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className={sectionTitleClass}>
        {title}
      </h2>
      {articles.length === 0 ? (
        <p className="mb-0 mt-3 text-sm text-[var(--color-ink-muted)]">{emptyText}</p>
      ) : (
        <ul className="m-0 mt-4 list-none space-y-4 p-0">
          {articles.map((article) => (
            <li key={article.id}>
              <Link to={articleHref(article.slug)} className={`font-medium ${linkClass}`}>
                {article.title}
              </Link>
              {article.summary && (
                <p className="mb-0 mt-1 line-clamp-2 text-sm leading-6 text-[var(--color-ink-muted)]">{article.summary}</p>
              )}
              <p className="mb-0 mt-1 text-xs text-[var(--color-ink-subtle)]">
                {beforeDate}
                <time dateTime={new Date(dateOf(article)).toISOString()}>{format.date(dateOf(article))}</time>
                {afterDate}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const publishedAtOf = (article: RecentArticleDto) => article.publishedAt;
const updatedAtOf = (article: RecentArticleDto) => article.updatedAt;

/**
 * The home page (R-05, #41): what mktba is, the search field (it leads to the results page, R-10
 * #46), the top-level sections, and the new and updated articles. Popular articles wait for view
 * statistics.
 */
const HomePage = () => {
  const locale = useLocale();
  const t = locale.homePage;
  const aboutTitleId = useId();
  const { data: tree } = useNavigationTree();
  const { data: recent } = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.RECENT_ARTICLES],
    queryFn: getRecentArticles,
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-12 px-6 py-10 sm:px-8 sm:py-14">
      <header className="text-center">
        <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] text-[var(--color-ink-strong)] sm:text-4xl">{t.title}</h1>
        <p className="mb-0 mt-3 text-base text-[var(--color-ink-muted)] sm:text-lg">{t.lead}</p>
        <SearchForm className="mx-auto mt-8 w-full max-w-xl text-left" />
      </header>

      <Sections tree={tree} />

      {recent && (
        <div className="grid gap-10 md:grid-cols-2">
          <RecentList
            title={t.newArticles.title}
            articles={recent.new}
            dateTemplate={locale.articlePage.publishedOn}
            dateOf={publishedAtOf}
            emptyText={t.newArticles.empty}
          />
          <RecentList
            title={t.updatedArticles.title}
            articles={recent.updated}
            dateTemplate={locale.articlePage.updatedOn}
            dateOf={updatedAtOf}
          />
        </div>
      )}

      <section aria-labelledby={aboutTitleId} className={panelClass}>
        <h2 id={aboutTitleId} className={sectionTitleClass}>
          {t.about.title}
        </h2>
        {t.about.paragraphs.map((paragraph) => (
          <p key={paragraph} className="mb-0 mt-3 text-base leading-7 text-[var(--color-ink-muted)]">
            {paragraph}
          </p>
        ))}
      </section>
    </div>
  );
};

export default HomePage;
