import { MAZHAB_LINK_PARAM } from '../context/mazhabContext';
import type { FeedbackType } from './types/ApiTypes';

/** Path of the feedback form (F-01, #66). */
export const FEEDBACK_PATH = '/feedback';

/** The server's limits (`FeedbackService`), mirrored so the form can say so before sending. */
export const FEEDBACK_TEXT_MAX_LENGTH = 4000;
export const FEEDBACK_CONTACT_MAX_LENGTH = 200;
export const FEEDBACK_PAGE_URL_MAX_LENGTH = 2048;

/** The kinds of message, in the order the form offers them. */
export const FEEDBACK_TYPES: FeedbackType[] = ['ArticleError', 'SiteProblem', 'Idea'];

const TYPE_PARAM = 'type';
const ARTICLE_PARAM = 'article';
const FROM_PARAM = 'from';

const typeSlugs: Record<FeedbackType, string> = {
  ArticleError: 'article-error',
  SiteProblem: 'site-problem',
  Idea: 'idea',
};

/** What a link to the form carries: everything the form attaches to the message by itself. */
export type FeedbackRequest = {
  /** The kind of message chosen in advance; the reader can change it. */
  type: FeedbackType | null;
  /** The article the reader came from. */
  articleId: number | null;
  /** The page the reader came from: a site-relative path with its query, never another site. */
  from: string | null;
};

/** A path on this site (`/…`), not a protocol-relative or absolute address, within the server's limit. */
const isSitePath = (value: string): boolean =>
  value.startsWith('/')
  && !value.startsWith('//')
  && !value.includes('\\')
  && value.length <= FEEDBACK_PAGE_URL_MAX_LENGTH;

/**
 * The link to the form from the page at `from` (path with query). A mazhab the reader got from a
 * shared link (`?mazhab=`) is carried over as the form's own `?mazhab=`, so the form attaches the
 * mazhab the reader was actually reading in.
 */
export const feedbackHref = ({ type = null, articleId = null, from = null }: Partial<FeedbackRequest> = {}): string => {
  const params = new URLSearchParams();
  if (type) {
    params.set(TYPE_PARAM, typeSlugs[type]);
  }
  if (articleId !== null) {
    params.set(ARTICLE_PARAM, String(articleId));
  }
  if (from && isSitePath(from)) {
    params.set(FROM_PARAM, from);
    const queryStart = from.indexOf('?');
    const linkedMazhab = queryStart < 0
      ? null
      : new URLSearchParams(from.slice(queryStart + 1).split('#')[0]).get(MAZHAB_LINK_PARAM);
    if (linkedMazhab) {
      params.set(MAZHAB_LINK_PARAM, linkedMazhab);
    }
  }

  const query = params.toString();
  return query ? `${FEEDBACK_PATH}?${query}` : FEEDBACK_PATH;
};

/** Reads a form link back; anything malformed is dropped, never an error. */
export const readFeedbackRequest = (searchParams: URLSearchParams): FeedbackRequest => {
  const typeSlug = searchParams.get(TYPE_PARAM);
  const type = FEEDBACK_TYPES.find((candidate) => typeSlugs[candidate] === typeSlug) ?? null;

  const articleParam = searchParams.get(ARTICLE_PARAM) ?? '';
  const articleId = /^[1-9]\d{0,8}$/.test(articleParam) ? Number(articleParam) : null;

  const fromParam = searchParams.get(FROM_PARAM);
  const from = fromParam && isSitePath(fromParam) ? fromParam : null;

  return { type, articleId, from };
};

/** The number of characters as the server counts them (UTF-16 units, after trimming). */
export const feedbackTextLength = (text: string): number => text.trim().length;
