import type { ArticleStatus } from './types/ApiTypes';

export type ArticleListSort = 'UpdatedAt' | 'CreatedAt' | 'PublishedAt' | 'Title' | 'Status';
export type SortDirection = 'Asc' | 'Desc';

/** The admin article list's filters, sort and page, as kept in the URL query (A-02, #34). */
export type ArticleListParams = {
  search: string;
  status: ArticleStatus | null;
  authorId: number | null;
  tag: string;
  locale: string;
  sort: ArticleListSort;
  dir: SortDirection;
  page: number;
  pageSize: number;
};

export const ARTICLE_STATUSES: readonly ArticleStatus[] = ['Draft', 'InReview', 'Published', 'Archived'];
export const ARTICLE_LIST_SORTS: readonly ArticleListSort[] = ['UpdatedAt', 'CreatedAt', 'PublishedAt', 'Title', 'Status'];
export const PAGE_SIZES: readonly number[] = [20, 50, 100];

export const DEFAULT_ARTICLE_LIST_PARAMS: ArticleListParams = {
  search: '',
  status: null,
  authorId: null,
  tag: '',
  locale: '',
  sort: 'UpdatedAt',
  dir: 'Desc',
  page: 1,
  pageSize: PAGE_SIZES[0],
};

const positiveInt = (value: string | null): number | null => {
  const parsed = value === null ? NaN : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const oneOf = <T extends string>(value: string | null, options: readonly T[]): T | null =>
  options.find((option) => option === value) ?? null;

/** The list parameters in `query`; unknown or malformed values fall back to the defaults. */
export const parseArticleListParams = (query: URLSearchParams): ArticleListParams => ({
  search: query.get('search') ?? '',
  status: oneOf(query.get('status'), ARTICLE_STATUSES),
  authorId: positiveInt(query.get('authorId')),
  tag: query.get('tag') ?? '',
  locale: query.get('locale') ?? '',
  sort: oneOf(query.get('sort'), ARTICLE_LIST_SORTS) ?? DEFAULT_ARTICLE_LIST_PARAMS.sort,
  dir: oneOf(query.get('dir'), ['Asc', 'Desc'] as const) ?? DEFAULT_ARTICLE_LIST_PARAMS.dir,
  page: positiveInt(query.get('page')) ?? DEFAULT_ARTICLE_LIST_PARAMS.page,
  pageSize: oneOf(query.get('pageSize'), PAGE_SIZES.map(String)) !== null
    ? Number(query.get('pageSize'))
    : DEFAULT_ARTICLE_LIST_PARAMS.pageSize,
});

/** The URL query for `params`, leaving out every value that equals its default. */
export const toArticleListQuery = (params: ArticleListParams): URLSearchParams => {
  const query = new URLSearchParams();
  (Object.keys(DEFAULT_ARTICLE_LIST_PARAMS) as (keyof ArticleListParams)[]).forEach((key) => {
    const value = params[key];
    if (value !== null && value !== '' && value !== DEFAULT_ARTICLE_LIST_PARAMS[key]) {
      query.set(key, String(value));
    }
  });
  return query;
};
