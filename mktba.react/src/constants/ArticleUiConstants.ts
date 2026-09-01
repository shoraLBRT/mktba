export type ParagraphUiMode = 'arrows' | 'numbers';

export const ARTICLE_UI_MODE_STORAGE_KEY = 'articleParagraphUiMode';
/** Figma shows every mazhab as a chip tab, so the tab row is the default. */
export const DEFAULT_ARTICLE_UI_MODE: ParagraphUiMode = 'numbers';

export const isParagraphUiMode = (value: string | null): value is ParagraphUiMode =>
  value === 'arrows' || value === 'numbers';
