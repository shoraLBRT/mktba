import type { PlainBlockKind } from './types';

/** What the `/` menu turns an empty paragraph into. */
export type SlashMenuKind = PlainBlockKind | 'versioned';

export const SLASH_MENU_KINDS: SlashMenuKind[] = ['paragraph', 'heading2', 'heading3', 'versioned'];

/** Words typed after `/` that pick a kind besides its Russian label (`/h2`, `/заг`). */
const SLASH_MENU_ALIASES: Record<SlashMenuKind, string[]> = {
  paragraph: ['p', 'text', 'текст', 'абзац', 'параграф'],
  heading2: ['h2', 'заголовок', 'раздел'],
  heading3: ['h3', 'заголовок', 'подзаголовок'],
  versioned: ['opinions', 'мнения', 'мазхабы', 'блок'],
};

/**
 * The query of the `/` menu when a paragraph holds nothing but `/` and a word after it, else null:
 * the menu opens only in an empty paragraph, so typing a slash inside a text stays a slash.
 */
export const slashMenuQuery = (markdown: string): string | null => {
  const match = /^\/([\p{L}\p{N}]*)$/u.exec(markdown.trim());
  return match ? match[1].toLowerCase() : null;
};

/** The kinds the query matches, in menu order; an empty query matches every kind. */
export const filterSlashMenuKinds = (query: string, labels: Record<SlashMenuKind, string>): SlashMenuKind[] =>
  SLASH_MENU_KINDS.filter(
    (kind) =>
      query === '' ||
      labels[kind].toLowerCase().includes(query) ||
      SLASH_MENU_ALIASES[kind].some((alias) => alias.startsWith(query)),
  );
