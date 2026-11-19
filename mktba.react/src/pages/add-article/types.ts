import type { SourceDto } from '../../shared/types/ApiTypes';

/** One citation of an opinion while it is edited: the directory entry and the place inside it. */
export type CitationDraft = {
  localId: string;
  source: SourceDto;
  /** Page, hadith number, sura:ayah; blank cites the work as a whole. */
  locator: string;
};

export type AlternativeDraft = {
  localId: string;
  content: string;
  isDefault: boolean;
  opinionId?: number;
  schoolIds: number[];
  /** The sources this opinion cites, in order; absent means none. */
  sources?: CitationDraft[];
};

export type InfoboxFieldDraft = {
  id: string;
  key: string;
  label: string;
  value: string;
};

export type InfoboxDraft = {
  title: string;
  subtitle: string;
  fields: InfoboxFieldDraft[];
};

export type PlainBlockKind = 'heading2' | 'heading3' | 'paragraph';

export type PlainEditorBlock = {
  id: string;
  kind: PlainBlockKind;
  content: string;
  paragraphId?: number;
  opinionId?: number;
  /** The sources the paragraph cites, in order; absent means none. Headings cite nothing. */
  sources?: CitationDraft[];
};

export type VersionedEditorBlock = {
  id: string;
  kind: 'versioned';
  variants: AlternativeDraft[];
  paragraphId?: number;
};

export type EditorBlock = PlainEditorBlock | VersionedEditorBlock;
