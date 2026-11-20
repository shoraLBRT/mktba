import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { useLocale } from '../../localization/hooks';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';

type ExternalLinkDialogProps = {
  /** The address of the link at the cursor, empty when there is none. */
  initialHref: string;
  /** The typed address, trimmed; empty removes the link. */
  onApply: (href: string) => void;
  onClose: () => void;
};

/** Asks for the address of a link in a rich text («Внешняя ссылка», Ctrl/⌘+K). */
export const ExternalLinkDialog = ({ initialHref, onApply, onClose }: ExternalLinkDialogProps) => {
  const t = useLocale().addArticleEditor.richText.linkDialog;
  const titleId = useId();
  const hintId = useId();
  const [href, setHref] = useState(initialHref);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <Card role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onApply(href.trim());
          }}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-6 py-5">
            <h2 id={titleId} className="m-0 text-xl font-semibold text-[var(--color-ink-strong)]">{t.title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.cancel}
              className="rounded-lg p-2 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-ink-strong)]"
            >
              <X size={18} />
            </button>
          </div>
          <div className="space-y-2 px-6 py-5">
            <Input
              autoFocus
              type="text"
              inputMode="url"
              value={href}
              aria-label={t.urlLabel}
              aria-describedby={hintId}
              placeholder={t.urlPlaceholder}
              onChange={(event) => setHref(event.target.value)}
            />
            <p id={hintId} className="m-0 text-xs text-[var(--color-ink-subtle)]">{t.hint}</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--color-border-soft)] px-6 py-4">
            <Button type="button" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" variant="primary">{t.apply}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
