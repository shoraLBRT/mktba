import { Link, useLocation } from 'react-router';
import { useLanguage, useLocale } from '../localization/hooks';
import { languageSelfName, LANGUAGES, localizedPath, pathWithoutLanguage } from '../localization/language';

/** Pages with no other language (the admin, the editor and the old `/article/…` URLs, A-06 #35). */
const RUSSIAN_ONLY_PATH = /^\/(article|admin)(\/|$)/;

/**
 * The reader's language switcher (I-08, #112): the same page in every language of the site. The link
 * is the same path in the other language, `/{slug}` <-> `/en/{slug}`; on an article page that URL
 * leads to the article's own translation, or follows the missing-translation setting
 * (`shared/missingTranslation.ts`), so the switcher needs nothing from the page. The query is kept.
 * Not shown on a page that exists in Russian only. The visible code starts the accessible name
 * («EN English»), so the label and the name agree (axe `label-content-name-mismatch`).
 */
export const LanguageSwitcher = () => {
  const locale = useLocale();
  const current = useLanguage();
  const { pathname, search } = useLocation();
  const path = pathWithoutLanguage(pathname);
  if (RUSSIAN_ONLY_PATH.test(path)) return null;

  return (
    <nav aria-label={locale.layout.actions.language} className="flex items-center gap-0.5" data-testid="language-switcher">
      {LANGUAGES.map((language) => (
        language === current ? (
          <span
            key={language}
            aria-current="true"
            lang={language}
            title={languageSelfName(language)}
            className="rounded-md px-1.5 py-1 text-[11px] font-bold text-[var(--color-ink-strong)]"
          >
            {language.toUpperCase()}{' '}
            <span className="sr-only">{languageSelfName(language)}</span>
          </span>
        ) : (
          <Link
            key={language}
            to={`${localizedPath(language, path)}${search}`}
            lang={language}
            hrefLang={language}
            title={languageSelfName(language)}
            className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-ink-strong)]"
          >
            {language.toUpperCase()}{' '}
            <span className="sr-only">{languageSelfName(language)}</span>
          </Link>
        )
      ))}
    </nav>
  );
};
