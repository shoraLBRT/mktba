import { useFormat, useLocale } from '../../localization/hooks';
import { formatMessage } from '../../localization';
import { Button } from '../../shared/ui/Button';
import { isSameInstant, type DraftOfferSource, type DraftSaveStatus } from './draftAutosave';
import type { LocalDraftCopy } from './localDraftCopy';

// The writer's own browser and clock: the copy's time is shown in their time zone.

type LocalDraftOfferProps = {
  copy: LocalDraftCopy;
  /** This browser's copy or the user's server draft. */
  source: DraftOfferSource;
  /** The loaded article's `updatedAt`: when it differs from the copy's, the article was saved since. */
  baseUpdatedAt: string | null;
  onRestore: () => void;
  onDiscard: () => void;
};

/** Offers back the unsaved edits an earlier visit left in this browser or on the server (E-02, #75). */
export const LocalDraftOffer = ({ copy, source, baseUpdatedAt, onRestore, onDiscard }: LocalDraftOfferProps) => {
  const t = useLocale().articleDraftCopy;
  const format = useFormat();
  const isStale = !isSameInstant(copy.baseUpdatedAt, baseUpdatedAt);

  return (
    <section
      aria-labelledby="local-draft-offer-title"
      className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
    >
      <h2 id="local-draft-offer-title" className="m-0 text-sm font-semibold">{t.offerTitle}</h2>
      <p className="mt-1 mb-0">{formatMessage(source === 'server' ? t.offerTextServer : t.offerText, { time: format.date(copy.savedAt, 'dayTime') })}</p>
      {isStale ? <p className="mt-1 mb-0">{t.offerStale}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onRestore}>{t.restore}</Button>
        <Button variant="ghost" onClick={onDiscard}>{t.discard}</Button>
      </div>
    </section>
  );
};

/** Where the edits are: saved, in the server draft, kept in this browser only, or being saved (E-02, #75). */
export const DraftSaveIndicator = ({ status, isSaving }: { status: DraftSaveStatus; isSaving: boolean }) => {
  const t = useLocale().articleDraftCopy.status;
  const tone = status === 'failed' && !isSaving ? 'text-red-700' : 'text-[var(--color-ink-muted)]';

  return (
    <p role="status" data-testid="draft-save-indicator" className={`mb-3 mt-0 text-end text-xs ${tone}`}>
      {isSaving ? t.saving : t[status]}
    </p>
  );
};
