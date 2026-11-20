import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyArticleDraft } from './articleDraft';
import { localDraftCopyKey, readLocalDraftCopy, removeLocalDraftCopy, writeLocalDraftCopy } from './localDraftCopy';

const key = localDraftCopyKey(3, 7);
const copy = { savedAt: '2026-11-21T10:00:00.000Z', baseUpdatedAt: '2026-11-20T09:00:00Z', draft: { ...createEmptyArticleDraft(), title: 'Намаз' } };

describe('localDraftCopy', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('given a user and an article, when the key is built, then it names both and a new article is "new"', () => {
    expect(localDraftCopyKey(3, 7)).toBe('mktba.editorDraft.3.7');
    expect(localDraftCopyKey(3, null)).toBe('mktba.editorDraft.3.new');
  });

  it('given a written copy, when read back, then the same copy is returned', () => {
    expect(writeLocalDraftCopy(key, copy)).toBe(true);

    expect(readLocalDraftCopy(key)).toEqual(copy);
  });

  it('given a removed copy, when read, then there is none', () => {
    writeLocalDraftCopy(key, copy);

    removeLocalDraftCopy(key);

    expect(readLocalDraftCopy(key)).toBeNull();
  });

  it.each([
    ['not JSON', '{'],
    ['another version', JSON.stringify({ ...copy, version: 99 })],
    ['no draft', JSON.stringify({ version: 1, savedAt: copy.savedAt, baseUpdatedAt: null })],
    ['a draft without blocks', JSON.stringify({ version: 1, ...copy, draft: { title: 'x' } })],
  ])('given a stored value that is %s, when read, then it is ignored', (_case, raw) => {
    window.localStorage.setItem(key, raw);

    expect(readLocalDraftCopy(key)).toBeNull();
  });

  it('given a full storage, when a copy is written, then the write reports failure instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    expect(writeLocalDraftCopy(key, copy)).toBe(false);
  });
});
