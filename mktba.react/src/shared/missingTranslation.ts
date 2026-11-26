/**
 * What the reader gets when an article has no version in the language of the URL (I-08, #112): a
 * site-level setting, `MISSING_TRANSLATION` on the SSR server (`server/missingTranslation.server.ts`),
 * handed to the browser by the root loader.
 *
 * - `original` (the default, chosen by the agent, open for the owner in #112): `/en/{slug}` of a
 *   Russian article shows the Russian original in the English interface, with a note, its canonical
 *   at the original and noindex, so it is never indexed twice;
 * - `hide`: such a URL sends the reader to that language's home page.
 *
 * Either way, an article with a published version in the language goes to that version, so the
 * language switcher (`components/LanguageSwitcher.tsx`) needs only the path: `/{slug}` <-> `/en/{slug}`.
 */
import { createContext, useContext } from 'react';
import { LANGUAGES, localizedPath, type Language } from '../localization/language';
import { ApiError } from './api-client/apiError';
import { articleHref } from './slug';
import type { ArticleContentDto } from './types/ApiTypes';

export const MISSING_TRANSLATION_MODES = ['original', 'hide'] as const;

export type MissingTranslationMode = (typeof MISSING_TRANSLATION_MODES)[number];

export const DEFAULT_MISSING_TRANSLATION: MissingTranslationMode = 'original';

/** The setting's value from its text; anything unknown (or unset) is the default. */
export const parseMissingTranslation = (value: string | null | undefined): MissingTranslationMode => {
  const mode = value?.trim().toLowerCase();
  return (MISSING_TRANSLATION_MODES as readonly string[]).includes(mode ?? '')
    ? (mode as MissingTranslationMode)
    : DEFAULT_MISSING_TRANSLATION;
};

/** Set once by the root route; outside it (tests) the default. */
export const MissingTranslationContext = createContext<MissingTranslationMode>(DEFAULT_MISSING_TRANSLATION);

export const useMissingTranslation = (): MissingTranslationMode => useContext(MissingTranslationContext);

/**
 * The article at `/{language}/{slug}`: the one of that language with that slug, else (404) the one of
 * another language with that slug — the article the reader switched language on, which then either
 * leads to its translation or is shown as the original ({@link articleUrlTarget}). A 404 everywhere
 * is the first 404; a 410 or any other failure of the URL's own language is thrown as it is.
 */
export const fetchArticleForUrl = async (
  slug: string,
  language: Language,
  fetchBySlug: (slug: string, language: Language) => Promise<ArticleContentDto>,
): Promise<ArticleContentDto> => {
  try {
    return await fetchBySlug(slug, language);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;

    for (const other of LANGUAGES) {
      if (other === language) continue;
      try {
        const original = await fetchBySlug(slug, other);
        return { ...original, locale: original.locale ?? other };
      } catch (otherError) {
        if (!(otherError instanceof ApiError && (otherError.status === 404 || otherError.status === 410))) throw otherError;
      }
    }

    throw error;
  }
};

/** Whether the article shown at a URL in `language` is another language's original (I-08). */
export const isShownOriginal = (content: ArticleContentDto, language: Language, legacyLink: boolean): boolean =>
  !legacyLink && (content.locale ?? language) !== language;

export type ArticleUrlTarget = { path: string; permanent: boolean };

/**
 * Where the article page at `pathname` (in `language`) should go instead, or null to stay:
 * - its own article: its current URL in its language when that is another (an id link, an old slug) — permanent;
 * - another language's original: its published version in `language` (temporary, a translation can be
 *   unpublished), else in `hide` mode that language's home (temporary), else the current slug's URL
 *   in `language` when the slug asked for is an old one (permanent).
 */
export const articleUrlTarget = (
  content: ArticleContentDto,
  { language, pathname, legacyLink, mode }: {
    language: Language;
    pathname: string;
    legacyLink: boolean;
    mode: MissingTranslationMode;
  },
): ArticleUrlTarget | null => {
  if (!content.slug) return null;

  if (!isShownOriginal(content, language, legacyLink)) {
    const own = localizedPath(content.locale ?? language, articleHref(content.slug));
    return own === pathname ? null : { path: own, permanent: true };
  }

  const translation = (content.translations ?? []).find((version) =>
    version.locale === language && version.status === 'Published' && version.slug);
  if (translation?.slug) {
    return { path: localizedPath(language, articleHref(translation.slug)), permanent: false };
  }

  if (mode === 'hide') {
    return { path: localizedPath(language, '/'), permanent: false };
  }

  const shown = localizedPath(language, articleHref(content.slug));
  return shown === pathname ? null : { path: shown, permanent: true };
};
