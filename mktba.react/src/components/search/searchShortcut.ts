import { useEffect } from 'react';

/**
 * Whether a key press is the search shortcut: Ctrl+K, or ⌘K on a Mac. The physical key is read
 * (`code`), so it works on the Russian layout too. A press inside a text editor is left to it
 * (Ctrl+K inserts a link there).
 */
export const isSearchShortcut = (event: KeyboardEvent): boolean => {
  if (event.code !== 'KeyK' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
    return false;
  }
  const target = event.target instanceof HTMLElement ? event.target : null;
  return !(target?.isContentEditable || target?.closest('textarea, [contenteditable="true"]'));
};

/** Calls `onOpen` on the search shortcut, anywhere on the page. */
export const useSearchShortcut = (onOpen: () => void) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSearchShortcut(event)) {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpen]);
};
