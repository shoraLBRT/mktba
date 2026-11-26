import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { ArticleListEntry } from '../components/ArticleListEntry';
import { PageLinks } from '../components/PageLinks';
import { NotFoundMeta, PageMeta } from '../components/PageMeta';
import { useFormat, useLanguage, useLocale, useLocalizedPath } from '../localization/hooks';
import { getTagPage } from '../services/tagService';
import { ApiError } from '../shared/api-client/apiError';
import { readTagPage, tagHref, tagPageCount, tagPageHref, tagPageQueryKey } from '../shared/tag';
import NotFoundPage from './NotFoundPage';

const linkClass = 'text-[var(--color-brand-forest)] underline-offset-2 hover:underline';
const noteClass = 'm-0 text-base leading-7 text-[var(--color-ink-muted)]';

/**
 * The public page of a tag (M-06, #70), `/tags/{slug}`: the tag's name and the articles a reader can
 * open that carry it, newest first, with their dates. A tag no such article carries is a 404. The
 * first page is indexable with its canonical address; further pages are `noindex`.
 */
const TagPage = () => {
  const locale = useLocale();
  const format = useFormat();
  const localize = useLocalizedPath();
  const t = locale.tagPage;
  const { slug = '' } = useParams();
  const [searchParams] = useSearchParams();
  const page = readTagPage(searchParams);
  const language = useLanguage();
  const query = useQuery({
    queryKey: tagPageQueryKey(slug, page, language),
    queryFn: () => getTagPage(slug, page, language),
    placeholderData: keepPreviousData,
  });
  const tag = query.data;

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <>
        <NotFoundMeta />
        <NotFoundPage />
      </>
    );
  }

  if (!tag) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8">
        <PageMeta description={null} image={null} noIndex />
        {query.isError ? (
          <p className={noteClass} role="alert">
            {t.loadError}{' '}
            <button type="button" onClick={() => query.refetch()} className={`cursor-pointer border-0 bg-transparent p-0 ${linkClass}`}>
              {locale.search.retry}
            </button>
          </p>
        ) : (
          <p className={noteClass}>{locale.common.loading}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8">
      <PageMeta
        title={t.title.replace('{name}', tag.name)}
        description={t.metaDescription.replace('{name}', tag.name)}
        path={page === 1 ? tagHref(tag.slug) : undefined}
        noIndex={page > 1}
      />
      <header>
        <p className="m-0 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">{t.kicker}</p>
        <h1 className="m-0 mt-1 text-3xl font-bold tracking-[-0.03em] [overflow-wrap:anywhere] text-[var(--color-ink-strong)]">
          {tag.name}
        </h1>
        <p className="mb-0 mt-2 text-sm text-[var(--color-ink-muted)]">{format.plural(t.articlesCount, tag.total)}</p>
      </header>
      <ul aria-label={t.articlesLabel} className="m-0 flex list-none flex-col gap-4 p-0">
        {tag.items.map((article) => (
          <ArticleListEntry key={article.id} article={article} />
        ))}
      </ul>
      <PageLinks
        label={t.pagesLabel}
        page={tag.page}
        pageCount={tagPageCount(tag.total, tag.pageSize)}
        hrefFor={(target) => localize(tagPageHref(tag.slug, target))}
      />
    </div>
  );
};

export default TagPage;
