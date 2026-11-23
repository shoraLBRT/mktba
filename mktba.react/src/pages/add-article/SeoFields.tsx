import { useState } from 'react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import {
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  SOCIAL_IMAGE_URL_MAX_LENGTH,
  isValidSocialImageUrl,
  type SeoDraft,
} from '../../shared/seo';
import { Input } from '../../shared/ui/Input';
import { Textarea } from '../../shared/ui/Textarea';
import type { SeoSnippet } from './seoSnippet';

type SeoFieldsProps = {
  value: SeoDraft;
  disabled?: boolean;
  onChange: (value: SeoDraft) => void;
  /** The effective title and description (`seoSnippetOf`), previewed as a search result. */
  snippet: SeoSnippet;
  /** The article's address as the result would show it. */
  url: string;
};

const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]';

const Counter = ({ id, count, max }: { id: string; count: number; max: number }) => {
  const t = useLocale().addArticlePage.seo;
  return (
    <p id={id} className="mb-0 mt-1 text-end text-[11px] text-[var(--color-ink-subtle)]">
      {formatMessage(t.counter, { count, max })}
    </p>
  );
};

/** How the article would look in search results with the fields as they are now. */
const SnippetPreview = ({ snippet, url, noIndex }: { snippet: SeoSnippet; url: string; noIndex: boolean }) => {
  const t = useLocale().addArticlePage.seo;
  return (
    <figure data-testid="seo-snippet" className="m-0 rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] p-3">
      <figcaption className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-subtle)]">{t.snippetTitle}</figcaption>
      <p className="mb-0 break-all text-[11px] text-[var(--color-ink-muted)]">{url}</p>
      <p className="mb-0 text-[14px] font-medium leading-snug text-[var(--color-brand-forest)]">{snippet.title || t.snippetNoTitle}</p>
      <p className="mb-0 mt-1 text-[12px] leading-snug text-[var(--color-ink-muted)]">{snippet.description ?? t.snippetNoDescription}</p>
      {noIndex ? <p className="mb-0 mt-2 text-[11px] font-medium text-amber-700">{t.snippetNoIndex}</p> : null}
    </figure>
  );
};

/** The «SEO» section of the article editor: search title, description, social image and noindex. */
export const SeoFields = ({ value, disabled, onChange, snippet, url }: SeoFieldsProps) => {
  const t = useLocale().addArticlePage.seo;
  const imageInvalid = !isValidSocialImageUrl(value.socialImageUrl);
  const update = (patch: Partial<SeoDraft>) => onChange({ ...value, ...patch });
  // The fields and the preview are rendered only while the section is open: closed, the preview would repeat the article text in the page.
  const [isOpen, setIsOpen] = useState(false);

  return (
    <details
      data-testid="seo-fields"
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className="rounded-xl border border-[var(--color-border-soft)] px-3 py-2"
    >
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]">
        {t.title}
      </summary>
      {isOpen ? (
        <div className="mt-3 space-y-3">
          <p className="mb-0 text-[11px] text-[var(--color-ink-subtle)]">{t.hint}</p>
          <SnippetPreview snippet={snippet} url={url} noIndex={value.noIndex} />
          <div>
            <label htmlFor="seo-title" className={labelClass}>{t.seoTitleLabel}</label>
            <Input
              id="seo-title"
              value={value.title}
              disabled={disabled}
              maxLength={SEO_TITLE_MAX_LENGTH}
              aria-describedby="seo-title-counter"
              placeholder={t.seoTitlePlaceholder}
              onChange={(event) => update({ title: event.target.value })}
            />
            <Counter id="seo-title-counter" count={value.title.length} max={SEO_TITLE_MAX_LENGTH} />
          </div>
          <div>
            <label htmlFor="seo-description" className={labelClass}>{t.descriptionLabel}</label>
            <Textarea
              id="seo-description"
              rows={3}
              value={value.description}
              disabled={disabled}
              maxLength={SEO_DESCRIPTION_MAX_LENGTH}
              aria-describedby="seo-description-counter"
              placeholder={t.descriptionPlaceholder}
              onChange={(event) => update({ description: event.target.value })}
            />
            <Counter id="seo-description-counter" count={value.description.length} max={SEO_DESCRIPTION_MAX_LENGTH} />
          </div>
          <div>
            <label htmlFor="seo-image" className={labelClass}>{t.imageLabel}</label>
            <Input
              id="seo-image"
              value={value.socialImageUrl}
              disabled={disabled}
              maxLength={SOCIAL_IMAGE_URL_MAX_LENGTH}
              spellCheck={false}
              aria-invalid={imageInvalid}
              placeholder={t.imagePlaceholder}
              onChange={(event) => update({ socialImageUrl: event.target.value })}
            />
            {imageInvalid ? <p className="mb-0 mt-1 text-[11px] text-red-600">{t.imageInvalid}</p> : null}
          </div>
          <label className="flex items-start gap-2 text-sm text-[var(--color-ink-strong)]">
            <input
              id="seo-noindex"
              type="checkbox"
              className="mt-1"
              checked={value.noIndex}
              disabled={disabled}
              onChange={(event) => update({ noIndex: event.target.checked })}
            />
            <span>
              {t.noIndexLabel}
              <span className="block text-[11px] text-[var(--color-ink-subtle)]">{t.noIndexHint}</span>
            </span>
          </label>
        </div>
      ) : null}
    </details>
  );
};
