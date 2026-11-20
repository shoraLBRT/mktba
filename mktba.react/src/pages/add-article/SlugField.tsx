import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { SLUG_MAX_LENGTH, isReservedArticleSlug, isValidSlug } from '../../shared/slug';

const ARTICLE_PATH_PREFIX = '/';

type SlugFieldProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  /** Fills the field from the title's transliteration. */
  onFillFromTitle: () => void;
  /** The article's language code; shown read-only, the slug is unique within it. */
  locale?: string;
};

/** The article's URL segment under the title in the editor, with a format check as you type. */
export const SlugField = ({ value, disabled, onChange, onFillFromTitle, locale = 'ru' }: SlugFieldProps) => {
  const t = useLocale().addArticlePage;
  const malformed = value.length > 0 && !isValidSlug(value);
  const reserved = isReservedArticleSlug(value);
  const invalid = malformed || reserved;

  return (
    <div>
      <label
        htmlFor="article-slug"
        className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]"
      >
        {t.slugLabel}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--color-ink-muted)]">{ARTICLE_PATH_PREFIX}</span>
        <input
          id="article-slug"
          value={value}
          disabled={disabled}
          maxLength={SLUG_MAX_LENGTH}
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby="article-slug-hint"
          onChange={(event) => onChange(event.target.value)}
          className="min-w-[12rem] flex-1 rounded-lg border border-[var(--color-border-soft)] bg-white px-2 py-1 font-mono text-sm text-[var(--color-ink-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-forest)]"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={onFillFromTitle}
          title={t.slugFromTitleTitle}
          className="rounded-lg border border-[var(--color-border-soft)] px-2 py-1 text-[11px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink-strong)] disabled:opacity-50"
        >
          {t.slugFromTitle}
        </button>
      </div>
      <p
        id="article-slug-hint"
        className={`mb-0 mt-1 text-[11px] ${invalid ? 'text-red-600' : 'text-[var(--color-ink-subtle)]'}`}
      >
        {malformed
          ? formatMessage(t.slugInvalid, { maxLength: SLUG_MAX_LENGTH })
          : reserved ? formatMessage(t.slugReserved, { slug: value }) : t.slugHint}
      </p>
      <p data-testid="article-locale" className="mb-0 mt-1 text-[11px] text-[var(--color-ink-subtle)]">
        {formatMessage(t.localeLabel, { locale })}
      </p>
    </div>
  );
};
