import type { LocalDraftCopy } from './localDraftCopy';
import type { LocalDraftCopyStatus } from './useLocalDraftCopy';
import type { ServerDraftStatus } from './useServerDraft';

/** Where an offered draft comes from: this browser's copy or the user's server draft (E-02, #75). */
export type DraftOfferSource = 'local' | 'server';

export type DraftOffer = { source: DraftOfferSource; copy: LocalDraftCopy };

const time = (value: string | null): number | null => {
  if (value === null) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/** Whether two `updatedAt` values name the same moment, whatever their written form. */
export const isSameInstant = (left: string | null, right: string | null): boolean => {
  const a = time(left);
  const b = time(right);
  return a === null || b === null ? left === right : a === b;
};

/**
 * The one draft to offer when the editor opens: the newer of this browser's copy and the server
 * draft (both usually hold the same edits; the newer one has the last of them).
 */
export const chooseDraftOffer = (local: LocalDraftCopy | null, server: LocalDraftCopy | null): DraftOffer | null => {
  if (local === null || server === null) {
    return local ? { source: 'local', copy: local } : server ? { source: 'server', copy: server } : null;
  }
  return (time(server.savedAt) ?? 0) >= (time(local.savedAt) ?? 0)
    ? { source: 'server', copy: server }
    : { source: 'local', copy: local };
};

/**
 * What the indicator says: `clean`; `pending` — the edits are on their way to the server;
 * `serverSaved` — the server holds them; `localOnly` — the server did not take them but this
 * browser did; `failed` — neither did.
 */
export type DraftSaveStatus = 'clean' | 'pending' | 'serverSaved' | 'localOnly' | 'failed';

export const draftSaveStatus = (local: LocalDraftCopyStatus, server: ServerDraftStatus): DraftSaveStatus => {
  if (server === 'clean') {
    return 'clean';
  }
  if (server === 'saved') {
    return 'serverSaved';
  }
  if (server === 'failed') {
    return local === 'stored' ? 'localOnly' : local === 'failed' ? 'failed' : 'pending';
  }
  return 'pending';
};
