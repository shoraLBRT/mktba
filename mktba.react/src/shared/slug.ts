/**
 * Article slugs on the client: the editor's prefill from the title and the reader's URLs.
 * The transliteration must stay identical to `ArticleSlugRules.FromTitle` in
 * Mktba.Application (and the backfill in migration `AddArticleSlugs`); the server validates
 * and de-duplicates whatever the editor sends.
 */

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

/** Whether the API will accept the slug: a–z, 0–9 in hyphen-separated groups, not digits only. */
export const isValidSlug = (slug: string): boolean =>
  slug.length > 0 && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug) && !DIGITS_ONLY.test(slug);

/** The reader's URL of an article. */
export const articleHref = (slug: string): string => `/article/${encodeURIComponent(slug)}`;
