import { useLocale } from '../../localization/hooks';
import { formatMessage } from '../../localization';
import { Button } from '../../shared/ui/Button';
import type { LocalDraftCopy } from './localDraftCopy';
import type { LocalDraftCopyStatus } from './useLocalDraftCopy';

// The writer's own browser and clock: the copy's time is shown in their time zone.
const copyTime = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

type LocalDraftOfferProps = {
  copy: LocalDraftCopy;
  /** The loaded article's `updatedAt`: when it differs from the copy's, the article was saved since. */
  baseUpdatedAt: string | null;
  onRestore: () => void;
  onDiscard: () => void;
};

/** Offers back the unsaved edits an earlier visit left in this browser (E-02, #75). */
export const LocalDraftOffer = ({ copy, baseUpdatedAt, onRestore, onDiscard }: LocalDraftOfferProps) => {
  const t = useLocale().articleDraftCopy;
  const isStale = copy.baseUpdatedAt !== baseUpdatedAt;

  return (
    <section
      aria-labelledby="local-draft-offer-title"
      className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
    >
      <h2 id="local-draft-offer-title" className="m-0 text-sm font-semibold">{t.offerTitle}</h2>
      <p className="mt-1 mb-0">{formatMessage(t.offerText, { time: copyTime.format(new Date(copy.savedAt)) })}</p>
      {isStale ? <p className="mt-1 mb-0">{t.offerStale}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onRestore}>{t.restore}</Button>
        <Button variant="ghost" onClick={onDiscard}>{t.discard}</Button>
      </div>
    </section>
  );
};

/** Where the edits are: saved, kept in this browser only, or being saved (E-02, #75). */
export const DraftSaveIndicator = ({ status, isSaving }: { status: LocalDraftCopyStatus; isSaving: boolean }) => {
  const t = useLocale().articleDraftCopy.status;
  const tone = status === 'failed' && !isSaving ? 'text-red-700' : 'text-[var(--color-ink-muted)]';

  return (
    <p role="status" data-testid="draft-save-indicator" className={`mb-3 mt-0 text-right text-xs ${tone}`}>
      {isSaving ? t.saving : t[status]}
    </p>
  );
};
