import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useLocale } from '../../localization/hooks';
import { SearchForm } from './SearchForm';

const FOCUSABLE = 'input, button, a[href]';

/**
 * The search dialog the header button and Ctrl+K open (R-10, #46): the query field, focused; Enter
 * leads to the results page. Escape, the close button or a click outside closes it and returns the
 * focus to where it was; Tab stays inside.
 */
export const SearchDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useLocale().search.dialog;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Read while rendering: by the time effects run, the field has already taken the focus. The
  // dialog only ever opens in the browser, after a click or a key press.
  const [openedFrom] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  const close = () => {
    onClose();
    openedFrom?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    // The backdrop closes on a pointer click; the keyboard has Escape and the close button.
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 p-4 pt-[12vh]" onClick={close}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl rounded-2xl border border-[var(--color-border-soft)] bg-white p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 text-sm font-semibold text-[var(--color-ink-strong)]">
            {t.title}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={t.close}
            className="rounded-lg p-1 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-muted)]"
          >
            <X size={14} />
          </button>
        </div>
        <SearchForm autoFocus />
        <p className="mb-0 mt-3 text-xs text-[var(--color-ink-subtle)]">{t.hint}</p>
      </div>
    </div>
  );
};
