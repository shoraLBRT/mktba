import type { ArticleDraft } from './articleDraft';

/**
 * The editor's copy of unsaved edits in this browser (E-02, #75): if the connection drops, the tab
 * closes or a save fails, the edits are offered back the next time the same user opens the same
 * article (or the new-article page). The server draft (`useServerDraft`) holds the same edits
 * for any browser; this copy is the fallback when the server cannot be reached. The article itself
 * is saved only by «Сохранить».
 */
export type LocalDraftCopy = {
  /** When the copy was written, ISO 8601. */
  savedAt: string;
  /**
   * The server's `updatedAt` of the article the edits started from (`null` for a new article), so
   * the offer can say the article has been saved elsewhere since.
   */
  baseUpdatedAt: string | null;
  draft: ArticleDraft;
};

/** Raised when the stored shape changes, so an older copy is dropped instead of misread. */
const COPY_VERSION = 1;
const KEY_PREFIX = 'mktba.editorDraft';

/** One copy per user and article; `articleId` null is the new-article page. */
export const localDraftCopyKey = (userId: number, articleId: number | null): string =>
  `${KEY_PREFIX}.${userId}.${articleId ?? 'new'}`;

export const isDraftShaped = (value: unknown): value is ArticleDraft => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const draft = value as Partial<Record<keyof ArticleDraft, unknown>>;
  return typeof draft.title === 'string'
    && Array.isArray(draft.blocks)
    && Array.isArray(draft.tags)
    && Array.isArray(draft.relatedLinks)
    && typeof draft.infobox === 'object' && draft.infobox !== null
    && typeof draft.seo === 'object' && draft.seo !== null
    && typeof draft.summary === 'string'
    && typeof draft.editComment === 'string';
};

/** The stored copy, or null when there is none, it is unreadable or from another version. */
export const readLocalDraftCopy = (key: string): LocalDraftCopy | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as { version?: unknown; savedAt?: unknown; baseUpdatedAt?: unknown; draft?: unknown };
    if (parsed.version !== COPY_VERSION
      || typeof parsed.savedAt !== 'string'
      || (parsed.baseUpdatedAt !== null && typeof parsed.baseUpdatedAt !== 'string')
      || !isDraftShaped(parsed.draft)) {
      return null;
    }
    return { savedAt: parsed.savedAt, baseUpdatedAt: parsed.baseUpdatedAt, draft: parsed.draft };
  } catch {
    return null;
  }
};

/** Stores the copy; false when the browser refuses (storage full or blocked). */
export const writeLocalDraftCopy = (key: string, copy: LocalDraftCopy): boolean => {
  try {
    window.localStorage.setItem(key, JSON.stringify({ version: COPY_VERSION, ...copy }));
    return true;
  } catch {
    return false;
  }
};

export const removeLocalDraftCopy = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do: a storage that cannot be read holds no copy to offer either.
  }
};
