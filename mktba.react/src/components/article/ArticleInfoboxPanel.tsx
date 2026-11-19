import { ChevronDown, ChevronUp } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useLocale } from '../../localization/hooks';
import type { ArticleInfoboxDto } from '../../shared/types/ApiTypes';

type ArticleInfoboxPanelProps = {
  infobox?: ArticleInfoboxDto;
};

const DEFAULT_VISIBLE_ROWS = 5;
// Long words break at syllables (the document is `lang="ru"`), and a string with no break points
// (a URL, a long transliteration) breaks anywhere rather than widening the panel.
const WRAP = 'min-w-0 hyphens-auto [overflow-wrap:anywhere]';

/**
 * The article's fact card. It floats beside the text only when the nearest `@container` ancestor
 * (the article column) is wide enough for both; in a narrower column it is a full-width block, and
 * on a phone its body starts collapsed behind the header. Collapsing only hides the body with CSS,
 * so the facts are in the server HTML either way.
 */
export const ArticleInfoboxPanel = ({ infobox }: ArticleInfoboxPanelProps) => {
  const locale = useLocale();
  const t = locale.articleInfobox;
  const [expanded, setExpanded] = useState(false);
  const [openOnPhone, setOpenOnPhone] = useState(false);
  const bodyId = useId();

  const normalizedInfobox = useMemo(() => {
    if (!infobox) {
      return null;
    }

    const title = infobox.title?.trim();
    const subtitle = infobox.subtitle?.trim();
    const fields = (infobox.fields ?? [])
      .map((field) => ({
        ...field,
        key: field.key.trim(),
        label: field.label.trim(),
        value: field.value.trim(),
      }))
      .filter((field) => field.label && field.value)
      .sort((left, right) => left.order - right.order);

    if (!title && !subtitle && fields.length === 0) {
      return null;
    }

    return {
      title: title || t.defaultTitle,
      subtitle: subtitle || undefined,
      fields,
    };
  }, [infobox, t.defaultTitle]);

  if (!normalizedInfobox) {
    return null;
  }

  const hasOverflow = normalizedInfobox.fields.length > DEFAULT_VISIBLE_ROWS;
  const visibleFields = hasOverflow && !expanded
    ? normalizedInfobox.fields.slice(0, DEFAULT_VISIBLE_ROWS)
    : normalizedInfobox.fields;

  return (
    <aside
      aria-label={normalizedInfobox.title}
      className="mb-6 w-full min-w-0 overflow-hidden rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] text-sm shadow-sm @2xl:float-right @2xl:mb-4 @2xl:ml-6 @2xl:w-[320px]"
    >
      <div className="relative bg-[var(--color-brand-forest)] px-4 py-3 text-white max-sm:pr-12">
        <p className={`m-0 text-[15px] font-semibold leading-6 ${WRAP}`}>{normalizedInfobox.title}</p>
        {normalizedInfobox.subtitle ? (
          <p className={`mb-0 mt-1 text-[12px] leading-5 text-[#cfeedd] ${WRAP}`}>{normalizedInfobox.subtitle}</p>
        ) : null}
        <button
          type="button"
          aria-expanded={openOnPhone}
          aria-controls={bodyId}
          aria-label={openOnPhone ? t.hideDetails : t.showDetails}
          onClick={() => setOpenOnPhone((current) => !current)}
          className="absolute inset-0 flex items-center justify-end pr-4 sm:hidden"
        >
          {openOnPhone ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
        </button>
      </div>

      <div id={bodyId} data-testid="infobox-body" className={openOnPhone ? undefined : 'max-sm:hidden'}>
        {normalizedInfobox.fields.length > 0 ? (
          <div className="divide-y divide-[var(--color-border-mute)]">
            {visibleFields.map((field) => (
              <div key={`${field.key}-${field.order}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-3 px-4 py-3">
                <span className={`whitespace-pre-wrap text-[12px] font-medium uppercase leading-5 tracking-[0.08em] text-[var(--color-ink-muted)] ${WRAP}`}>
                  {field.label}
                </span>
                <span className={`whitespace-pre-wrap text-[12px] leading-5 text-[var(--color-ink-strong)] ${WRAP}`}>{field.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-4 text-[12px] leading-6 text-[var(--color-ink-muted)]">{t.noFields}</div>
        )}

        {hasOverflow ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="flex w-full items-center justify-center gap-1 border-t border-[var(--color-border-soft)] py-2 text-[12px] text-[var(--color-brand-forest)] transition-colors hover:bg-[var(--color-brand-forest-soft)]"
          >
            {expanded ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
            {expanded ? t.collapse : t.expand}
          </button>
        ) : null}
      </div>
    </aside>
  );
};
