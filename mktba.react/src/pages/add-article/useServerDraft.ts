import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteArticleDraft, getArticleDraft, saveArticleDraft } from '../../services/Article/draftService';
import { hasArticleDraftChanged, type ArticleDraft } from './articleDraft';
import { isDraftShaped, type LocalDraftCopy } from './localDraftCopy';

/** How long typing has to pause before the draft goes to the server. */
export const SERVER_DRAFT_DELAY_MS = 3000;

/** Raised when the stored shape changes, so an older draft is dropped instead of misread. */
const SNAPSHOT_VERSION = 1;

/** What the editor stores as the server draft's opaque `snapshot`. */
export const toServerSnapshot = (draft: ArticleDraft) => ({ version: SNAPSHOT_VERSION, draft });

/** The draft held by a server snapshot, or null when it is unreadable or of another version. */
export const fromServerSnapshot = (snapshot: unknown): ArticleDraft | null => {
  if (typeof snapshot !== 'object' || snapshot === null) {
    return null;
  }
  const { version, draft } = snapshot as { version?: unknown; draft?: unknown };
  return version === SNAPSHOT_VERSION && isDraftShaped(draft) ? draft : null;
};

/**
 * `clean` — nothing differs from the saved article; `pending` — edits wait to be sent;
 * `saving` — they are on their way; `saved` — the server holds them; `failed` — it did not take them.
 */
export type ServerDraftStatus = 'clean' | 'pending' | 'saving' | 'saved' | 'failed';

export type ServerDraftState = {
  status: ServerDraftStatus;
  /** A draft an earlier visit (any browser) left on the server that differs from the article as loaded, until the user decides. */
  offer: LocalDraftCopy | null;
  /** Takes the offered draft (the caller puts it into the editor) and ends the offer. */
  acceptOffer: () => ArticleDraft | null;
  /** Deletes the offered draft. */
  discardOffer: () => void;
  /** Deletes the draft for good — after a successful save, a delete, or leaving on purpose. */
  clear: () => void;
};

type Options = {
  /** False until the signed-in user is known: nothing is read or written before. */
  enabled: boolean;
  /** The article being edited; null for the new-article page. */
  articleId: number | null;
  draft: ArticleDraft;
  baseline: ArticleDraft;
  /** The loaded article's `updatedAt` (`null` for a new article). */
  baseUpdatedAt: string | null;
};

type LoadState = { ready: boolean; offer: LocalDraftCopy | null };

type LastWrite = { draft: ArticleDraft; ok: boolean };

/**
 * Autosaves the editor's unsaved edits as the user's own server draft (E-02, #75, decision B): a
 * moment after the edits stop and when the editor closes; it is deleted as soon as the draft equals
 * the baseline again. The draft found on open is offered and not overwritten until the user
 * decides. Requests go out one at a time, in order, so a delete after a save always lands last.
 * The browser's local copy (`useLocalDraftCopy`) stays the fallback for a lost connection.
 */
export const useServerDraft = ({ enabled, articleId, draft, baseline, baseUpdatedAt }: Options): ServerDraftState => {
  const [load, setLoad] = useState<LoadState>({ ready: false, offer: null });
  const [lastWrite, setLastWrite] = useState<LastWrite | null>(null);
  const [inFlight, setInFlight] = useState<ArticleDraft | null>(null);
  const isDirty = hasArticleDraftChanged(draft, baseline);

  const latest = useRef({ draft, baseline, baseUpdatedAt });
  // Declared before the effects below, so it is current when they run.
  useEffect(() => {
    latest.current = { draft, baseline, baseUpdatedAt };
  });
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** Whether a draft may be on the server, so a clean editor knows to delete it. */
  const onServer = useRef(false);
  const requested = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enqueue = useCallback((task: () => Promise<void>) => {
    queue.current = queue.current.then(task).catch(() => undefined);
  }, []);

  const remove = useCallback(() => {
    enqueue(async () => {
      await deleteArticleDraft(articleId);
      onServer.current = false;
    });
  }, [articleId, enqueue]);

  const write = useCallback(() => {
    timer.current = null;
    const { draft: current, baseUpdatedAt: base } = latest.current;
    setInFlight(current);
    enqueue(async () => {
      try {
        await saveArticleDraft(articleId, toServerSnapshot(current), base);
        onServer.current = true;
        setLastWrite({ draft: current, ok: true });
      } catch {
        setLastWrite({ draft: current, ok: false });
      } finally {
        setInFlight((sending) => (sending === current ? null : sending));
      }
    });
  }, [articleId, enqueue]);

  const cancelWrite = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    if (!enabled || requested.current) {
      return;
    }
    requested.current = true;
    getArticleDraft(articleId).then(
      (found) => {
        if (found) {
          onServer.current = true;
        }
        const restored = found ? fromServerSnapshot(found.snapshot) : null;
        const offer = found && restored && hasArticleDraftChanged(restored, latest.current.baseline)
          ? { savedAt: found.updatedAt, baseUpdatedAt: found.baseUpdatedAt ?? null, draft: restored }
          : null;
        setLoad((current) => (current.ready ? current : { ready: true, offer }));
      },
      // Unreachable server: autosave goes on, the local copy keeps the edits meanwhile.
      () => setLoad((current) => (current.ready ? current : { ready: true, offer: null })),
    );
  }, [enabled, articleId]);

  const isWriting = load.ready && load.offer === null;

  useEffect(() => {
    if (!isWriting) {
      return;
    }
    cancelWrite();
    if (!isDirty) {
      if (onServer.current) {
        remove();
      }
      return;
    }
    timer.current = setTimeout(write, SERVER_DRAFT_DELAY_MS);
  }, [isWriting, isDirty, draft, write, remove]);

  // A write still waiting goes out when the editor closes.
  useEffect(() => () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      write();
    }
  }, [write]);

  const status: ServerDraftStatus = !isDirty
    ? 'clean'
    : lastWrite?.draft === draft
      ? lastWrite.ok ? 'saved' : 'failed'
      : inFlight === draft ? 'saving' : 'pending';

  const endOffer = () => setLoad({ ready: true, offer: null });

  const acceptOffer = () => {
    const accepted = load.offer?.draft ?? null;
    endOffer();
    return accepted;
  };

  const discardOffer = () => {
    remove();
    endOffer();
  };

  const clear = () => {
    cancelWrite();
    // A draft still loading is not offered any more.
    requested.current = true;
    remove();
    endOffer();
    setLastWrite(null);
  };

  return { status, offer: load.offer, acceptOffer, discardOffer, clear };
};
