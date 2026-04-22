export type AlternativeDraft = {
  localId: string;
  content: string;
  isDefault: boolean;
  opinionId?: number;
  schoolIds: number[];
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
};

export type VersionedEditorBlock = {
  id: string;
  kind: 'versioned';
  variants: AlternativeDraft[];
  paragraphId?: number;
};

export type EditorBlock = PlainEditorBlock | VersionedEditorBlock;
