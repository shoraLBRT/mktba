import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type To } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageViewKey, usePageViewTracking } from './usePageViewTracking';

const { trackPageView } = vi.hoisted(() => ({ trackPageView: vi.fn() }));
vi.mock('./metrika', () => ({ trackPageView }));

const Tracker = () => {
  usePageViewTracking();
  return null;
};

const renderAt = (initialEntry: string) => {
  const router = createMemoryRouter([{ path: '*', element: <Tracker /> }], { initialEntries: [initialEntry] });
  render(<RouterProvider router={router} />);
  return (to: To, options?: { replace?: boolean }) => act(() => router.navigate(to, options));
};

afterEach(() => {
  trackPageView.mockClear();
});

describe('pageViewKey', () => {
  it('given a hash or a mazhab link, when keyed, then both are left out and the rest of the query is kept', () => {
    expect(pageViewKey({ pathname: '/zakyat', search: '?mazhab=hanafi' })).toBe('/zakyat');
    expect(pageViewKey({ pathname: '/search', search: '?q=%D0%B7&mazhab=hanafi&page=2' })).toBe('/search?q=%D0%B7&page=2');
  });
});

describe('usePageViewTracking', () => {
  it('given the first page of a visit, when rendered, then no hit is sent (init counts it)', () => {
    renderAt('/zakyat');

    expect(trackPageView).not.toHaveBeenCalled();
  });

  it('given a client-side navigation to another page, when it lands, then one hit is sent with the previous page as referer', async () => {
    const navigate = renderAt('/zakyat');

    await navigate('/namaz');
    await navigate('/search?q=namaz');

    const origin = window.location.origin;
    expect(trackPageView.mock.calls.map(([url, referer]) => [url, referer])).toEqual([
      [`${origin}/namaz`, `${origin}/zakyat`],
      [`${origin}/search?q=namaz`, `${origin}/namaz`],
    ]);
  });

  it('given a jump to an anchor or the mazhab link dropped from the URL, when it lands, then no hit is sent', async () => {
    const navigate = renderAt('/zakyat?mazhab=hanafi');

    await navigate('/zakyat#usloviya');
    await navigate('/zakyat', { replace: true });

    expect(trackPageView).not.toHaveBeenCalled();
  });
});
