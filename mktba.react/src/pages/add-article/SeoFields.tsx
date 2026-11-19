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

type SeoFieldsProps = {
  value: SeoDraft;
  disabled?: boolean;
  onChange: (value: SeoDraft) => void;
};

const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]';

const Counter = ({ id, count, max }: { id: string; count: number; max: number }) => {
  const t = useLocale().addArticlePage.seo;
  return (
    <p id={id} className="mb-0 mt-1 text-right text-[11px] text-[var(--color-ink-subtle)]">
      {formatMessage(t.counter, { count, max })}
    </p>
  );
};

/** The «SEO» section of the article editor: search title, description, social image and noindex. */
export const SeoFields = ({ value, disabled, onChange }: SeoFieldsProps) => {
  const t = useLocale().addArticlePage.seo;
  const imageInvalid = !isValidSocialImageUrl(value.socialImageUrl);
  const update = (patch: Partial<SeoDraft>) => onChange({ ...value, ...patch });

  return (
    <details data-testid="seo-fields" className="rounded-xl border border-[var(--color-border-soft)] px-3 py-2">
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-subtle)]">
        {t.title}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="mb-0 text-[11px] text-[var(--color-ink-subtle)]">{t.hint}</p>
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
    </details>
  );
};
