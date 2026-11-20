import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyArticleDraft, type ArticleDraft } from './articleDraft';
import { readLocalDraftCopy, writeLocalDraftCopy } from './localDraftCopy';
import { LOCAL_DRAFT_COPY_DELAY_MS, useLocalDraftCopy } from './useLocalDraftCopy';

const key = 'mktba.editorDraft.1.7';
const baseline: ArticleDraft = { ...createEmptyArticleDraft(), title: 'Намаз' };
const edited: ArticleDraft = { ...baseline, title: 'Намаз путника' };

type Props = { storageKey: string | null; draft: ArticleDraft };

const renderCopy = (initial: Props) =>
  renderHook((props: Props) => useLocalDraftCopy({ ...props, baseline, baseUpdatedAt: '2026-11-20T09:00:00Z' }), {
    initialProps: initial,
  });

describe('useLocalDraftCopy', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('given an edit, when typing pauses, then the copy is written and the status says so', () => {
    const { result, rerender } = renderCopy({ storageKey: key, draft: baseline });
    expect(result.current.status).toBe('clean');

    rerender({ storageKey: key, draft: edited });
    expect(result.current.status).toBe('pending');
    expect(readLocalDraftCopy(key)).toBeNull();

    act(() => vi.advanceTimersByTime(LOCAL_DRAFT_COPY_DELAY_MS));

    expect(result.current.status).toBe('stored');
    expect(readLocalDraftCopy(key)?.draft.title).toBe('Намаз путника');
    expect(readLocalDraftCopy(key)?.baseUpdatedAt).toBe('2026-11-20T09:00:00Z');
  });

  it('given an edit undone by hand, when the draft equals the baseline again, then the copy is removed', () => {
    const { result, rerender } = renderCopy({ storageKey: key, draft: edited });
    act(() => vi.advanceTimersByTime(LOCAL_DRAFT_COPY_DELAY_MS));

    rerender({ storageKey: key, draft: { ...baseline } });

    expect(result.current.status).toBe('clean');
    expect(readLocalDraftCopy(key)).toBeNull();
  });

  it('given a waiting write, when the editor closes, then the copy is written at once', () => {
    const { rerender, unmount } = renderCopy({ storageKey: key, draft: baseline });
    rerender({ storageKey: key, draft: edited });

    unmount();

    expect(readLocalDraftCopy(key)?.draft.title).toBe('Намаз путника');
  });

  it('given no signed-in user yet, when edited, then nothing is stored until the key is known', () => {
    const { rerender } = renderCopy({ storageKey: null, draft: edited });
    act(() => vi.advanceTimersByTime(LOCAL_DRAFT_COPY_DELAY_MS));
    expect(window.localStorage.length).toBe(0);

    rerender({ storageKey: key, draft: edited });
    act(() => vi.advanceTimersByTime(LOCAL_DRAFT_COPY_DELAY_MS));

    expect(readLocalDraftCopy(key)?.draft.title).toBe('Намаз путника');
  });

  it('given a copy left by an earlier visit, when the editor opens, then it is offered and not overwritten until restored', () => {
    writeLocalDraftCopy(key, { savedAt: '2026-11-21T10:00:00Z', baseUpdatedAt: '2026-11-20T09:00:00Z', draft: edited });
    const { result } = renderCopy({ storageKey: key, draft: baseline });

    expect(result.current.offer?.draft.title).toBe('Намаз путника');
    act(() => vi.advanceTimersByTime(LOCAL_DRAFT_COPY_DELAY_MS));
    expect(readLocalDraftCopy(key)?.draft.title).toBe('Намаз путника');

    let restored: ArticleDraft | null = null;
    act(() => {
      restored = result.current.acceptOffer();
    });

    expect(restored).toEqual(edited);
    expect(result.current.offer).toBeNull();
  });

  it('given an offered copy, when discarded, then it is removed', () => {
    writeLocalDraftCopy(key, { savedAt: '2026-11-21T10:00:00Z', baseUpdatedAt: null, draft: edited });
    const { result } = renderCopy({ storageKey: key, draft: baseline });

    act(() => result.current.discardOffer());

    expect(result.current.offer).toBeNull();
    expect(readLocalDraftCopy(key)).toBeNull();
  });

  it('given a stored copy equal to the article as loaded, when the editor opens, then nothing is offered and the copy is dropped', () => {
    writeLocalDraftCopy(key, { savedAt: '2026-11-21T10:00:00Z', baseUpdatedAt: null, draft: baseline });
    const { result } = renderCopy({ storageKey: key, draft: baseline });

    expect(result.current.offer).toBeNull();
    expect(readLocalDraftCopy(key)).toBeNull();
  });

  it('given a waiting write, when cleared after a save, then no copy is left even when the editor closes', () => {
    const { result, rerender, unmount } = renderCopy({ storageKey: key, draft: baseline });
    rerender({ storageKey: key, draft: edited });

    act(() => result.current.clear());
    unmount();

    expect(readLocalDraftCopy(key)).toBeNull();
  });
});
