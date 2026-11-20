import { useCallback, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { SearchDialog } from './SearchDialog';
import { useSearchShortcut } from './searchShortcut';

const { trackGoal } = vi.hoisted(() => ({ trackGoal: vi.fn() }));
vi.mock('../../analytics/metrika', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics/metrika')>()),
  trackGoal,
}));

/** A page with an opener button, a text field, an editor and the dialog on the shortcut — as the public layout wires it. */
const Harness = () => {
  const [open, setOpen] = useState(false);
  const { pathname, search } = useLocation();
  useSearchShortcut(useCallback(() => setOpen(true), []));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>opener</button>
      <input aria-label="field" />
      <textarea aria-label="editor" />
      <span data-testid="location">{pathname + search}</span>
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  );
};

const renderHarness = () =>
  render(
    <LocalizationProvider>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </LocalizationProvider>,
  );

const pressShortcut = (target: Element | Window, init: KeyboardEventInit = { ctrlKey: true }) =>
  fireEvent.keyDown(target, { code: 'KeyK', key: 'k', ...init });

describe('SearchDialog', () => {
  it('given Ctrl+K or ⌘K, when pressed on the page or in a text field, then opens the dialog with the field focused', () => {
    renderHarness();

    pressShortcut(window);
    expect(screen.getByRole('dialog', { name: 'Поиск по статьям' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    pressShortcut(screen.getByLabelText('field'), { metaKey: true });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('given the Russian layout, when Ctrl and the K key are pressed, then opens the dialog', () => {
    renderHarness();

    fireEvent.keyDown(window, { code: 'KeyK', key: 'л', ctrlKey: true });

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('given a multi-line editor or other modifiers, when the keys are pressed, then the dialog stays closed', () => {
    renderHarness();

    expect(pressShortcut(screen.getByLabelText('editor'))).toBe(true);
    pressShortcut(window, { ctrlKey: true, shiftKey: true });
    pressShortcut(window, {});

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('given the open dialog, when Escape is pressed, then it closes and focus returns to the opener', () => {
    renderHarness();
    const opener = screen.getByRole('button', { name: 'opener' });
    opener.focus();
    fireEvent.click(opener);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('given the open dialog, when Tab leaves its last control, then focus wraps to the first', () => {
    renderHarness();
    pressShortcut(window);
    const close = screen.getByRole('button', { name: 'Закрыть поиск' });
    const submit = screen.getByRole('button', { name: 'Найти' });

    submit.focus();
    fireEvent.keyDown(submit, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(submit);
  });

  it('given a query in the dialog, when submitted, then goes to the results page', () => {
    renderHarness();
    pressShortcut(window);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'закят' } });
    fireEvent.submit(screen.getByRole('search'));

    expect(screen.getByTestId('location').textContent).toBe('/search?q=%D0%B7%D0%B0%D0%BA%D1%8F%D1%82');
    expect(trackGoal).toHaveBeenCalledExactlyOnceWith('search');
  });
});
