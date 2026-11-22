import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteArticleDraft, getArticleDraft, saveArticleDraft } from '../../services/Article/draftService';
import { createEmptyArticleDraft, type ArticleDraft } from './articleDraft';
import { fromServerSnapshot, SERVER_DRAFT_DELAY_MS, toServerSnapshot, useServerDraft } from './useServerDraft';

vi.mock('../../services/Article/draftService', () => ({
  deleteArticleDraft: vi.fn(),
  getArticleDraft: vi.fn(),
  saveArticleDraft: vi.fn(),
}));

const baseline: ArticleDraft = { ...createEmptyArticleDraft(), title: 'Намаз' };
const edited: ArticleDraft = { ...baseline, title: 'Намаз путника' };

type Props = { enabled: boolean; draft: ArticleDraft };

const renderDraft = (initial: Props) =>
  renderHook((props: Props) => useServerDraft({ ...props, articleId: 7, baseline, baseUpdatedAt: '2026-11-20T09:00:00Z' }), {
    initialProps: initial,
  });

/** Lets the queued requests and their promise callbacks run. */
const settle = () => act(async () => {
  await vi.advanceTimersByTimeAsync(0);
});

describe('useServerDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getArticleDraft).mockReset().mockResolvedValue(null);
    vi.mocked(saveArticleDraft).mockReset().mockImplementation(async (_id, snapshot, baseUpdatedAt) => ({
      snapshot,
      baseUpdatedAt,
      updatedAt: '2026-11-22T10:00:00Z',
    }));
    vi.mocked(deleteArticleDraft).mockReset().mockResolvedValue();
  });
  afterEach(() => vi.useRealTimers());

  it('given an edit, when typing pauses, then the draft is written to the server and the status says so', async () => {
    const { result, rerender } = renderDraft({ enabled: true, draft: baseline });
    await settle();

    rerender({ enabled: true, draft: edited });
    expect(result.current.status).toBe('pending');
    expect(saveArticleDraft).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SERVER_DRAFT_DELAY_MS);
    });

    expect(result.current.status).toBe('saved');
    expect(saveArticleDraft).toHaveBeenCalledWith(7, toServerSnapshot(edited), '2026-11-20T09:00:00Z');
  });

  it('given a server that refuses, when the draft is written, then the status is failed', async () => {
    vi.mocked(saveArticleDraft).mockRejectedValue(new Error('offline'));
    const { result, rerender } = renderDraft({ enabled: true, draft: baseline });
    await settle();

    rerender({ enabled: true, draft: edited });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SERVER_DRAFT_DELAY_MS);
    });

    expect(result.current.status).toBe('failed');
  });

  it('given a written draft, when the edit is undone by hand, then the server draft is deleted', async () => {
    const { result, rerender } = renderDraft({ enabled: true, draft: baseline });
    await settle();
    rerender({ enabled: true, draft: edited });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SERVER_DRAFT_DELAY_MS);
    });

    rerender({ enabled: true, draft: { ...baseline } });
    await settle();

    expect(result.current.status).toBe('clean');
    expect(deleteArticleDraft).toHaveBeenCalledWith(7);
  });

  it('given no signed-in user yet, when edited, then nothing is read or written', async () => {
    renderDraft({ enabled: false, draft: edited });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SERVER_DRAFT_DELAY_MS);
    });

    expect(getArticleDraft).not.toHaveBeenCalled();
    expect(saveArticleDraft).not.toHaveBeenCalled();
  });

  it('given a server draft that differs from the article, when opened, then it is offered and not overwritten until accepted', async () => {
    vi.mocked(getArticleDraft).mockResolvedValue({
      snapshot: toServerSnapshot({ ...baseline, title: 'С сервера' }),
      baseUpdatedAt: '2026-11-19T09:00:00Z',
      updatedAt: '2026-11-21T11:00:00Z',
    });
    const { result, rerender } = renderDraft({ enabled: true, draft: baseline });
    await settle();

    expect(result.current.offer).toEqual({
      savedAt: '2026-11-21T11:00:00Z',
      baseUpdatedAt: '2026-11-19T09:00:00Z',
      draft: { ...baseline, title: 'С сервера' },
    });
    rerender({ enabled: true, draft: edited });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SERVER_DRAFT_DELAY_MS);
    });
    expect(saveArticleDraft).not.toHaveBeenCalled();

    let accepted: ArticleDraft | null = null;
    act(() => {
      accepted = result.current.acceptOffer();
    });

    expect(accepted).toEqual({ ...baseline, title: 'С сервера' });
    expect(result.current.offer).toBeNull();
  });

  it('given a server draft equal to the article, when opened, then it is not offered and is deleted', async () => {
    vi.mocked(getArticleDraft).mockResolvedValue({
      snapshot: toServerSnapshot({ ...baseline }),
      baseUpdatedAt: null,
      updatedAt: '2026-11-21T11:00:00Z',
    });
    const { result } = renderDraft({ enabled: true, draft: baseline });
    await settle();

    expect(result.current.offer).toBeNull();
    expect(deleteArticleDraft).toHaveBeenCalledWith(7);
  });

  it('given a write on its way, when cleared after a save, then the delete is sent after the write', async () => {
    let finishWrite: () => void = () => undefined;
    vi.mocked(saveArticleDraft).mockImplementation(
      () => new Promise((resolve) => {
        finishWrite = () => resolve({ snapshot: {}, baseUpdatedAt: null, updatedAt: '2026-11-22T10:00:00Z' });
      }),
    );
    const { result, rerender } = renderDraft({ enabled: true, draft: baseline });
    await settle();
    rerender({ enabled: true, draft: edited });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SERVER_DRAFT_DELAY_MS);
    });
    expect(result.current.status).toBe('saving');

    act(() => result.current.clear());
    await settle();
    expect(deleteArticleDraft).not.toHaveBeenCalled();

    finishWrite();
    await settle();
    expect(deleteArticleDraft).toHaveBeenCalledWith(7);
  });

  it('given a waiting write, when the editor closes, then the draft is sent at once', async () => {
    const { rerender, unmount } = renderDraft({ enabled: true, draft: baseline });
    await settle();
    rerender({ enabled: true, draft: edited });

    unmount();

    expect(saveArticleDraft).toHaveBeenCalledTimes(0);
    await settle();
    expect(saveArticleDraft).toHaveBeenCalledWith(7, toServerSnapshot(edited), '2026-11-20T09:00:00Z');
  });
});

describe('fromServerSnapshot', () => {
  it('given a snapshot of another version or shape, when read, then it is ignored', () => {
    expect(fromServerSnapshot(toServerSnapshot(baseline))).toEqual(baseline);
    expect(fromServerSnapshot({ version: 2, draft: baseline })).toBeNull();
    expect(fromServerSnapshot({ version: 1, draft: { title: 'x' } })).toBeNull();
    expect(fromServerSnapshot('текст')).toBeNull();
  });
});
