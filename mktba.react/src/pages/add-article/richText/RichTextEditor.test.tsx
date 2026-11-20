import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../../localization/provider';
import { RichTextEditor, type RichTextHandle } from './RichTextEditor';

const renderEditor = (value: string) => {
  const onChange = vi.fn();
  const onRequestLink = vi.fn();
  let handle: RichTextHandle | null = null;
  const view = (current: string) => (
    <LocalizationProvider>
      <RichTextEditor
        value={current}
        onChange={onChange}
        onFocus={() => undefined}
        onRequestLink={onRequestLink}
        handleRef={(next) => {
          handle = next;
        }}
        disabled={false}
        placeholder="Текст"
      />
    </LocalizationProvider>
  );
  const { rerender } = render(view(value));
  const element = screen.getByRole('textbox', { name: 'Текст' }) as HTMLElement & { editor: Editor };
  return { element, onChange, onRequestLink, handle: () => handle!, rerender: (next: string) => rerender(view(next)) };
};

describe('RichTextEditor', () => {
  it('given a text with footnotes, when a footnote is added, then the next number is referenced and its definition goes last', () => {
    const { element, handle, onChange } = renderEditor('Текст[^1].\n\n[^1]: Первая.');

    act(() => {
      // After «Текст» (1–6) and the reference atom (6–7).
      element.editor.commands.setTextSelection(7);
      handle().format('footnote');
    });

    expect(onChange).toHaveBeenLastCalledWith('Текст[^1][^2].\n\n[^1]: Первая.\n\n[^2]: ');
  });

  it('given a new value from outside, when it arrives, then the editor shows it without reporting a change', () => {
    const { element, onChange, rerender } = renderEditor('Было');

    rerender('Стало **жирным**');

    expect(element.textContent).toBe('Стало жирным');
    expect(element.querySelector('strong')?.textContent).toBe('жирным');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('given a list button, when pressed, then the paragraph becomes a list item', () => {
    const { handle, onChange } = renderEditor('Пункт');

    act(() => {
      handle().format('bulletList');
    });

    expect(onChange).toHaveBeenLastCalledWith('- Пункт');
  });

  it('given Ctrl+K in the text, when pressed in any layout, then the page is asked for the link dialog', () => {
    const { element, onRequestLink } = renderEditor('Текст');

    fireEvent.keyDown(element, { key: 'л', code: 'KeyK', ctrlKey: true });

    expect(onRequestLink).toHaveBeenCalledTimes(1);
  });
});
