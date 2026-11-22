import { describe, expect, it } from 'vitest';
import { createEmptyArticleDraft } from './articleDraft';
import { chooseDraftOffer, draftSaveStatus, isSameInstant } from './draftAutosave';

const copy = (savedAt: string, title: string) => ({ savedAt, baseUpdatedAt: null, draft: { ...createEmptyArticleDraft(), title } });

describe('chooseDraftOffer', () => {
  it('given only one of the two, when chosen, then that one is offered', () => {
    expect(chooseDraftOffer(null, null)).toBeNull();
    expect(chooseDraftOffer(copy('2026-11-21T10:00:00Z', 'a'), null)?.source).toBe('local');
    expect(chooseDraftOffer(null, copy('2026-11-21T10:00:00Z', 'b'))?.source).toBe('server');
  });

  it('given both, when chosen, then the newer one is offered', () => {
    const local = copy('2026-11-21T10:00:05Z', 'local');
    const server = copy('2026-11-21T10:00:00.000000Z', 'server');

    expect(chooseDraftOffer(local, server)).toEqual({ source: 'local', copy: local });
    expect(chooseDraftOffer(copy('2026-11-21T09:00:00Z', 'old'), server)).toEqual({ source: 'server', copy: server });
  });
});

describe('isSameInstant', () => {
  it('given one moment written two ways, when compared, then it is the same', () => {
    expect(isSameInstant('2026-11-20T09:00:00Z', '2026-11-20T09:00:00.000000Z')).toBe(true);
    expect(isSameInstant('2026-11-20T09:00:00Z', '2026-11-20T09:00:01Z')).toBe(false);
    expect(isSameInstant(null, null)).toBe(true);
    expect(isSameInstant(null, '2026-11-20T09:00:00Z')).toBe(false);
  });
});

describe('draftSaveStatus', () => {
  it('given the two statuses, when combined, then the server decides and the browser copy is the fallback', () => {
    expect(draftSaveStatus('clean', 'clean')).toBe('clean');
    expect(draftSaveStatus('stored', 'saved')).toBe('serverSaved');
    expect(draftSaveStatus('stored', 'saving')).toBe('pending');
    expect(draftSaveStatus('stored', 'failed')).toBe('localOnly');
    expect(draftSaveStatus('failed', 'failed')).toBe('failed');
    expect(draftSaveStatus('pending', 'failed')).toBe('pending');
  });
});
