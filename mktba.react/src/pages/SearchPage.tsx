import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { PageLinks } from '../components/PageLinks';
import { VerifiedMark } from '../components/article/VerifiedMark';
import { SearchForm } from '../components/search/SearchForm';
import { useFormat, useLanguage, useLocale, useLocalizedPath } from '../localization/hooks';
import { searchArticles } from '../services/Article/articleService';
import {
  isSearchableQuery,
  readSearchRequest,
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MIN_QUERY_LENGTH,
  searchHref,
  searchPageCount,
  searchQueryKey,
  searchResultHref,
} from '../shared/search';
import type { SearchResultDto, SearchTextSegmentDto } from '../shared/types/ApiTypes';

const linkClass = 'text-[var(--color-brand-forest)] underline-offset-2 hover:underline';
const noteClass = 'm-0 text-base leading-7 text-[var(--color-ink-muted)]';
const panelClass = 'rounded-2xl border border-[var(--color-border-soft)] bg-white p-5';

/** Text of a result with the matched words marked. The runs are plain text: nothing is parsed as HTML. */
const Highlighted = ({ segments }: { segments: SearchTextSegmentDto[] }) => (
  <>
    {segments.map((segment, index) =>
      segment.match ? (
        // The runs have no identity of their own and never reorder, so the index is the key.
        <mark key={index} className="rounded-sm bg-[var(--color-search-mark)] px-0.5 text-inherit">
          {segment.text}
        </mark>
      ) : (
        segment.text
      ),
    )}
  </>
);

const ResultItem = ({ result }: { result: SearchResultDto }) => {
  const localize = useLocalizedPath();
  return (
    <li className={panelClass}>
      <h2 className="m-0 text-lg font-semibold">
        <Link to={localize(searchResultHref(result))} className={linkClass}>
          <Highlighted segments={result.title} />
        </Link>
        {result.isVerified && <VerifiedMark />}
      </h2>
      {result.summary && (
        <p className="mb-0 mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">
          <Highlighted segments={result.summary} />
        </p>
      )}
      {result.snippet && (
        <p className="mb-0 mt-2 text-sm leading-6 text-[var(--color-ink-default)]">
          <Highlighted segments={result.snippet} />
        </p>
      )}
    </li>
  );
};

/** Nothing matched: say so plainly and suggest what to try. */
const NothingFound = ({ query, verified }: { query: string; verified: boolean }) => {
  const t = useLocale().search.empty;
  const localize = useLocalizedPath();
  const [beforeQuery, afterQuery = ''] = t.title.split('{query}');

  return (
    <div className={panelClass}>
      <p className="m-0 text-lg font-semibold text-[var(--color-ink-strong)]">
        {beforeQuery}
        <q>{query}</q>
        {afterQuery}
      </p>
      <p className={`${noteClass} mt-3`}>{t.hintsTitle}</p>
      <ul className="mb-0 mt-2 list-disc space-y-1 ps-5 text-base leading-7 text-[var(--color-ink-muted)]">
        {t.hints.map((hint) => (
          <li key={hint}>{hint}</li>
        ))}
      </ul>
      <p className={`${noteClass} mt-4`}>
        {verified ? (
          // Only verified articles were searched: the same words over all of them come first.
          <Link to={localize(searchHref(query))} className={linkClass}>
            {t.allArticles}
          </Link>
        ) : (
          <Link to={localize('/')} className={linkClass}>
            {t.homeLink}
          </Link>
        )}
      </p>
    </div>
  );
};

/**
 * The search results page (R-10, #46), `/search?q=…&page=…&verified=1`: the query field with the
 * «только проверенные» filter (V-08, #124), the articles found with the matched words marked and the
 * «Проверено учёными» mark, paging, and a plain «ничего не найдено» state. The request lives
 * in the URL, so a results page can be shared and the server renders it.
 */
const SearchPage = () => {
  const t = useLocale().search;
  const format = useFormat();
  const localize = useLocalizedPath();
  const language = useLanguage();
  const statusId = useId();
  const [searchParams] = useSearchParams();
  const request = readSearchRequest(searchParams);
  const searchable = isSearchableQuery(request.query);
  const { data: results, isError, isPending, refetch } = useQuery({
    queryKey: searchQueryKey(request, language),
    queryFn: () => searchArticles(request, language),
    enabled: searchable,
  });

  const prompt = request.query.length > SEARCH_MAX_QUERY_LENGTH
    ? t.tooLong.replace('{max}', String(SEARCH_MAX_QUERY_LENGTH))
    : t.prompt.replace('{min}', String(SEARCH_MIN_QUERY_LENGTH));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-10 sm:px-8">
      <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] text-[var(--color-ink-strong)]">{t.title}</h1>
      <SearchForm key={`${request.query}|${request.verified}`} initialQuery={request.query} verifiedFilter={request.verified} />

      <div id={statusId} role="status" aria-live="polite" className="space-y-6">
        {!searchable && <p className={noteClass}>{prompt}</p>}
        {searchable && isError && (
          <p className={noteClass}>
            {t.error}{' '}
            <button type="button" onClick={() => refetch()} className={`cursor-pointer border-0 bg-transparent p-0 ${linkClass}`}>
              {t.retry}
            </button>
          </p>
        )}
        {searchable && !isError && isPending && <p className={noteClass}>{t.loading}</p>}
        {searchable && results && results.total === 0 && <NothingFound query={results.query} verified={request.verified} />}
        {searchable && results && results.total > 0 && (
          <p className={noteClass}>{format.plural(t.found, results.total)}</p>
        )}
      </div>

      {searchable && results && results.total > 0 && (
        <>
          <ol aria-label={t.resultsLabel} className="m-0 list-none space-y-4 p-0">
            {results.items.map((result) => (
              <ResultItem key={result.id} result={result} />
            ))}
          </ol>
          <PageLinks
            label={t.pagination.label}
            page={results.page}
            pageCount={searchPageCount(results.total, results.pageSize)}
            hrefFor={(page) => localize(searchHref(results.query, page, request.verified))}
          />
        </>
      )}
    </div>
  );
};

export default SearchPage;
