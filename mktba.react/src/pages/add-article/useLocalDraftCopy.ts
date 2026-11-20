import { useCallback, useEffect, useRef, useState } from 'react';
import { hasArticleDraftChanged, type ArticleDraft } from './articleDraft';
import { readLocalDraftCopy, removeLocalDraftCopy, writeLocalDraftCopy, type LocalDraftCopy } from './localDraftCopy';

/** How long typing has to pause before the copy is written. */
export const LOCAL_DRAFT_COPY_DELAY_MS = 1000;

/**
 * `clean` — nothing differs from the saved article; `pending` — edits wait for the copy;
 * `stored` — the edits are in this browser; `failed` — the browser refused to store them.
 */
export type LocalDraftCopyStatus = 'clean' | 'pending' | 'stored' | 'failed';

export type LocalDraftCopyState = {
  status: LocalDraftCopyStatus;
  /** A copy left by an earlier visit that differs from the article as loaded, until the user decides. */
  offer: LocalDraftCopy | null;
  /** Takes the offered copy's draft (the caller puts it into the editor) and ends the offer. */
  acceptOffer: () => ArticleDraft | null;
  /** Forgets the offered copy. */
  discardOffer: () => void;
  /** Forgets the copy for good — after a successful save, a delete, or leaving on purpose. */
  clear: () => void;
};

type Options = {
  /** `null` until the signed-in user is known: nothing is read or written before. */
  storageKey: string | null;
  draft: ArticleDraft;
  baseline: ArticleDraft;
  /** The loaded article's `updatedAt` (`null` for a new article). */
  baseUpdatedAt: string | null;
};

/** The copy found for a key when it was first known; `offer` null once decided or when there was none. */
type OfferState = { key: string | null; offer: LocalDraftCopy | null };

/** The last write: which draft value it stored and whether the browser took it. */
type LastWrite = { draft: ArticleDraft; stored: boolean };

/**
 * Keeps a copy of the editor's unsaved edits in `localStorage` (E-02, #75). The copy is written a
 * moment after the edits stop and at once when the page is hidden or the editor closes, and removed
 * as soon as the draft equals the baseline again. A copy found on open is not overwritten while it
 * is offered: the user restores or discards it first. The admin editor renders only in the
 * browser, so the stored copy may be read while rendering.
 */
export const useLocalDraftCopy = ({ storageKey, draft, baseline, baseUpdatedAt }: Options): LocalDraftCopyState => {
  const [offerState, setOfferState] = useState<OfferState>({ key: null, offer: null });
  const [lastWrite, setLastWrite] = useState<LastWrite | null>(null);

  // Looked at once per key, as soon as it is known (the signed-in user may load after the editor).
  if (storageKey !== null && offerState.key !== storageKey) {
    const found = readLocalDraftCopy(storageKey);
    setOfferState({ key: storageKey, offer: found && hasArticleDraftChanged(found.draft, baseline) ? found : null });
  }
  const offer = offerState.key === storageKey ? offerState.offer : null;
  const isWriting = storageKey !== null && offerState.key === storageKey && offer === null;
  const isDirty = hasArticleDraftChanged(draft, baseline);

  const latest = useRef({ storageKey, draft, baseUpdatedAt });
  // Declared before the effects below, so it is current when they run.
  useEffect(() => {
    latest.current = { storageKey, draft, baseUpdatedAt };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = useCallback(() => {
    timer.current = null;
    const { storageKey: key, draft: current, baseUpdatedAt: base } = latest.current;
    if (key === null) {
      return;
    }
    const stored = writeLocalDraftCopy(key, { savedAt: new Date().toISOString(), baseUpdatedAt: base, draft: current });
    setLastWrite({ draft: current, stored });
  }, []);

  const cancelWrite = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    if (!isWriting) {
      return;
    }
    cancelWrite();
    if (!isDirty) {
      removeLocalDraftCopy(storageKey);
      return;
    }
    timer.current = setTimeout(write, LOCAL_DRAFT_COPY_DELAY_MS);
  }, [isWriting, isDirty, draft, storageKey, write]);

  // A write still waiting goes out before the page is hidden (tab closed, app switched) or the editor closes.
  useEffect(() => {
    const flush = () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        write();
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [write]);

  const status: LocalDraftCopyStatus = !isDirty
    ? 'clean'
    : lastWrite?.draft !== draft
      ? 'pending'
      : lastWrite.stored ? 'stored' : 'failed';

  const endOffer = () => setOfferState((current) => ({ ...current, offer: null }));

  const acceptOffer = () => {
    const accepted = offer?.draft ?? null;
    endOffer();
    return accepted;
  };

  const discardOffer = () => {
    if (storageKey !== null) {
      removeLocalDraftCopy(storageKey);
    }
    endOffer();
  };

  const clear = () => {
    cancelWrite();
    if (storageKey !== null) {
      removeLocalDraftCopy(storageKey);
    }
    endOffer();
    setLastWrite(null);
  };

  return { status, offer, acceptOffer, discardOffer, clear };
};
