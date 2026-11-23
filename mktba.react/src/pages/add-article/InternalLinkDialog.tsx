import { useEffect, useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useLocale } from '../../localization/hooks';
import { formatMessage } from '../../localization';
import { Card } from '../../shared/ui/Card';
import { Input } from '../../shared/ui/Input';
import { filterLinkTargets, type ArticleLinkTarget } from './internalLinks';

/** How many matches the dialog lists; a longer list is narrowed by typing. */
const MAX_RESULTS = 50;

type InternalLinkDialogProps = {
  articles: ArticleLinkTarget[];
  isLoading: boolean;
  onPick: (article: ArticleLinkTarget) => void;
  onClose: () => void;
};

/**
 * Finds an article to link to by its title, path or slug. It knows nothing about the text being
 * edited: the caller inserts the link wherever its editor keeps the cursor.
 */
export const InternalLinkDialog = ({ articles, isLoading, onPick, onClose }: InternalLinkDialogProps) => {
  const locale = useLocale();
  const t = locale.addArticleEditor.internalLinks;
  const titleId = useId();
  const [query, setQuery] = useState('');
  const matches = useMemo(() => filterLinkTargets(articles, query), [articles, query]);
  const shown = matches.slice(0, MAX_RESULTS);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,18,0.35)] p-4 backdrop-blur-sm">
      <Card role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[80vh] w-full max-w-xl flex-col">
        <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-6 py-5">
          <h2 id={titleId} className="m-0 text-xl font-semibold text-[var(--color-ink-strong)]">{t.dialogTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="rounded-lg p-2 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-page-panel)] hover:text-[var(--color-ink-strong)]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2 px-6 pt-5">
          <Input
            autoFocus
            type="search"
            value={query}
            aria-label={t.searchLabel}
            placeholder={t.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && shown.length > 0) {
                event.preventDefault();
                onPick(shown[0]);
              }
            }}
          />
          <p className="m-0 text-xs text-[var(--color-ink-subtle)]" aria-live="polite">
            {isLoading
              ? t.loading
              : matches.length > MAX_RESULTS
                ? formatMessage(t.tooMany, { shown: MAX_RESULTS, total: matches.length })
                : matches.length === 0
                  ? t.noResults
                  : t.enterHint}
          </p>
        </div>
        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto px-3 py-3">
          {shown.map((article) => (
            <li key={article.id}>
              <button
                type="button"
                onClick={() => onPick(article)}
                className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-start transition-colors hover:bg-[var(--color-page-panel)] focus:bg-[var(--color-page-panel)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--color-ink-strong)]">{article.title}</span>
                  <span className="block truncate text-xs text-[var(--color-ink-subtle)]">{article.path}</span>
                </span>
                {article.status !== 'Published' ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    {locale.articleStatus[article.status]}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};
