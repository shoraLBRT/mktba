/**
 * Article slugs on the client: the editor's prefill from the title and the reader's URLs.
 * The transliteration must stay identical to `ArticleSlugRules.FromTitle` in
 * Mktba.Application (and the backfill in migration `AddArticleSlugs`); the server validates
 * and de-duplicates whatever the editor sends.
 */
import { DEFAULT_LANGUAGE, localizedPath } from '../localization/language';

/** Longest slug the API accepts (`ArticleSlugRules.MaxLength`). */
export const SLUG_MAX_LENGTH = 80;

const FALLBACK = 'article';

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Removed inside a word (Qur'an → quran) rather than turned into a hyphen. */
const APOSTROPHES = new Set(["'", '’', 'ʼ', 'ʻ', 'ʿ', 'ʾ', '`']);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIGITS_ONLY = /^[0-9]+$/;

/**
 * Turns a title into a slug: lowercase, Russian transliterated, diacritics stripped, everything
 * else collapsed into single hyphens, at most {@link SLUG_MAX_LENGTH} characters. Digits only get
 * the `article-` prefix; nothing to transliterate gives `article`. Slugs of something other than
 * an article pass their own `fallback` word (user profiles: `author`, as `UserProfileRules` does).
 */
export const slugFromTitle = (title: string, fallback: string = FALLBACK): string => {
  const transliterated = Array.from(title.toLowerCase())
    .map((character) => CYRILLIC[character] ?? (APOSTROPHES.has(character) ? '' : character))
    .join('');

  let slug = transliterated
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length === 0) return fallback;
  if (DIGITS_ONLY.test(slug)) slug = `${fallback}-${slug}`;

  return slug.length <= SLUG_MAX_LENGTH ? slug : slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/, '');
};

/**
 * Whether the slug has the API's shape: a–z, 0–9 in hyphen-separated groups, not digits only. An
 * article slug must also not be reserved ({@link isReservedArticleSlug}); profile slugs need not.
 */
export const isValidSlug = (slug: string): boolean =>
  slug.length > 0 && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug) && !DIGITS_ONLY.test(slug);

/**
 * First URL segments an article cannot take, because articles live at `/{slug}` (O-02, #53): the
 * site's other top-level routes, the old `/article/…` prefix, the build's `assets` and the language
 * prefixes. Mirror of `ArticleSlugRules.Reserved`; a name with a dot (`robots.txt`) is never a slug.
 */
export const RESERVED_ARTICLE_SLUGS: ReadonlySet<string> = new Set([
  'admin', 'api', 'article', 'articles', 'assets', 'authors', 'feedback', 'login', 'search', 'sitemaps', 'tags', 'ru', 'en',
]);

/** Whether the API will refuse the slug for an article as `article_slug_reserved`. */
export const isReservedArticleSlug = (slug: string): boolean => RESERVED_ARTICLE_SLUGS.has(slug);

/**
 * The editor's prefill of an article slug: {@link slugFromTitle}, with `-2` after a reserved word,
 * as the server's generator would give when that is free (a title «Search» → `search-2`).
 */
export const articleSlugFromTitle = (title: string): string => {
  const slug = slugFromTitle(title);
  return isReservedArticleSlug(slug) ? `${slug}-2` : slug;
};

/** The reader's URL of an article: directly under the site root. */
export const articleHref = (slug: string): string => `/${encodeURIComponent(slug)}`;

/**
 * The reader's URL of an article in its language (`locale` from the API): `/{slug}` in Russian,
 * `/en/{slug}` in English (I-06, #110).
 */
export const localizedArticleHref = (locale: string | null | undefined, slug: string): string =>
  localizedPath(locale ?? DEFAULT_LANGUAGE, articleHref(slug));

/**
 * The public page of the author whose profile slug is `slug`. It lives here, beside `articleHref`,
 * so the article page links to authors without loading the author page's module (`author.ts`).
 */
export const authorHref = (slug: string): string => `/authors/${encodeURIComponent(slug)}`;

/**
 * The page of the tag whose slug is `slug` (M-06, #70). Here for the same reason as `authorHref`:
 * the article page links to its tags without loading the tag page's module (`tag.ts`).
 */
export const tagHref = (slug: string): string => `/tags/${encodeURIComponent(slug)}`;
