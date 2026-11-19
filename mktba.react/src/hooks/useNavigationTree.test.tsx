import type { ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient, invalidateArticleQueries, QUERY_STALE_TIME_MS } from '../app/queryClient';
import { getNavigationTree } from '../services/Article/navigationService';
import { useNavigationTree } from './useNavigationTree';

vi.mock('../services/Article/navigationService', () => ({
  getNavigationTree: vi.fn(),
}));

const fetchTree = vi.mocked(getNavigationTree);

const tree = [{ id: 1, name: 'Намаз', children: [] }] as unknown as Awaited<ReturnType<typeof getNavigationTree>>;

const wrapperFor = (client: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

describe('createQueryClient', () => {
  it('given the app client, when reading query defaults, then data stays fresh and focus does not refetch', () => {
    const defaults = createQueryClient().getDefaultOptions().queries;

    expect(defaults?.staleTime).toBe(QUERY_STALE_TIME_MS);
    expect(QUERY_STALE_TIME_MS).toBeGreaterThan(0);
    expect(defaults?.refetchOnWindowFocus).toBe(false);
  });
});

describe('useNavigationTree', () => {
  let client: QueryClient;

  beforeEach(() => {
    fetchTree.mockReset();
    fetchTree.mockResolvedValue(tree);
    client = createQueryClient();
  });

  afterEach(() => {
    client.clear();
  });

  it('given several components on one page, when they mount, then the tree is fetched once', async () => {
    const wrapper = wrapperFor(client);
    const sidebar = renderHook(() => useNavigationTree(), { wrapper });
    const breadcrumbs = renderHook(() => useNavigationTree(), { wrapper });

    await waitFor(() => expect(sidebar.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(breadcrumbs.result.current.data).toEqual(tree));
    expect(fetchTree).toHaveBeenCalledTimes(1);
  });

  it('given a fetched tree, when a page remounts after navigation, then it is served from cache', async () => {
    const wrapper = wrapperFor(client);
    const first = renderHook(() => useNavigationTree(), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const next = renderHook(() => useNavigationTree(), { wrapper });

    expect(next.result.current.data).toEqual(tree);
    expect(next.result.current.isFetching).toBe(false);
    expect(fetchTree).toHaveBeenCalledTimes(1);
  });

  it('given a fresh tree, when an admin mutation invalidates article queries, then the tree is refetched', async () => {
    const wrapper = wrapperFor(client);
    const updated = [...tree, { id: 2, name: 'Пост', children: [] }] as typeof tree;
    const { result } = renderHook(() => useNavigationTree(), { wrapper });
    // Read data before the refetch: React Query re-renders only for the result fields a component used.
    await waitFor(() => expect(result.current.data).toEqual(tree));
    fetchTree.mockResolvedValue(updated);

    await act(() => invalidateArticleQueries(client));

    expect(fetchTree).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.data).toEqual(updated));
  });

  it('given a failing request, when the tree loads, then the error reaches the caller', async () => {
    fetchTree.mockRejectedValue(new Error('network down'));
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });

    const { result } = renderHook(() => useNavigationTree(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('network down');
  });
});
