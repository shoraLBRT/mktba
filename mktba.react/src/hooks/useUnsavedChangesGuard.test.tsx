import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

const Editor = ({ dirty }: { dirty: boolean }) => {
  const { blocker, allowLeaving } = useUnsavedChangesGuard(dirty);
  return (
    <>
      <p>{`blocker:${blocker.state}`}</p>
      <button type="button" onClick={() => blocker.reset?.()}>stay</button>
      <button type="button" onClick={() => blocker.proceed?.()}>leave</button>
      <button type="button" onClick={allowLeaving}>allow</button>
    </>
  );
};

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

const renderEditor = (dirty: boolean) => {
  const router = createMemoryRouter(
    [
      { path: '/edit', element: <Editor dirty={dirty} /> },
      { path: '/elsewhere', element: <p>elsewhere</p> },
    ],
    { initialEntries: ['/edit'] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

const unloadIsCancelled = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('useUnsavedChangesGuard', () => {
  it('given no unsaved changes, when navigating away or closing the tab, then nothing asks', async () => {
    const router = renderEditor(false);

    await act(() => router.navigate('/elsewhere'));

    expect(router.state.location.pathname).toBe('/elsewhere');
    expect(unloadIsCancelled()).toBe(false);
  });

  it('given unsaved changes, when navigating to another path, then the navigation waits and staying keeps the page', async () => {
    const router = renderEditor(true);

    await act(() => router.navigate('/elsewhere'));

    expect(router.state.location.pathname).toBe('/edit');
    expect(screen.getByText('blocker:blocked')).toBeTruthy();

    click('stay');
    expect(screen.getByText('blocker:unblocked')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/edit');
  });

  it('given a held navigation, when the user chooses to leave, then it goes through', async () => {
    const router = renderEditor(true);
    await act(() => router.navigate('/elsewhere'));

    click('leave');
    await screen.findByText('elsewhere');

    expect(router.state.location.pathname).toBe('/elsewhere');
  });

  it('given unsaved changes, when only the query or the hash changes, then the page is not held', async () => {
    const router = renderEditor(true);

    await act(() => router.navigate('/edit?tab=seo#title'));

    expect(router.state.location.search).toBe('?tab=seo');
    expect(screen.getByText('blocker:unblocked')).toBeTruthy();
  });

  it('given unsaved changes, when the tab is closed or reloaded, then the browser is asked to confirm', () => {
    renderEditor(true);

    expect(unloadIsCancelled()).toBe(true);
  });

  it('given a save that just succeeded, when the page navigates away itself, then it is let through without asking', async () => {
    const router = renderEditor(true);

    click('allow');
    await act(() => router.navigate('/elsewhere'));

    expect(router.state.location.pathname).toBe('/elsewhere');
  });
});
