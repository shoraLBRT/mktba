import type { ArticleInfoboxDto, ParagraphDto, SourceDto } from '../../shared/types/ApiTypes';
import type { ArticleDraft } from './articleDraft';
import { buildParagraphUpdateDtosFromBlocks } from './draftHelpers';
import { buildInfoboxCreateDto } from './infoboxHelpers';

/** The screens the preview emulates, by their CSS width: a phone below `md`, a tablet from `md` to below `lg`, a desktop at `xl`. */
export const PREVIEW_WIDTHS = { phone: 375, tablet: 768, desktop: 1280 } as const;
export type PreviewWidth = keyof typeof PREVIEW_WIDTHS;

/** The parts of an unsaved draft the reader's components render (E-11, #81). */
export type ArticlePreviewContent = {
  title: string;
  paragraphs: ParagraphDto[];
  /** Every directory entry the draft cites, once. */
  sources: SourceDto[];
  infobox: ArticleInfoboxDto | undefined;
  summary: string | undefined;
  tags: string[];
};

/**
 * The draft as the API would store it, so the preview goes through the reader's own rules: empty
 * blocks dropped, a block of opinions left with one text shown as a plain paragraph. Paragraphs and
 * opinions are numbered by position — a new block has no id yet, and the ids only key the rendering
 * and the anchors of the preview.
 */
export const buildArticlePreviewContent = (draft: ArticleDraft): ArticlePreviewContent => {
  const paragraphs = buildParagraphUpdateDtosFromBlocks(draft.blocks).map((paragraph, paragraphIndex) => ({
    ...paragraph,
    id: paragraphIndex + 1,
    opinions: paragraph.opinions.map((opinion, opinionIndex) => ({ ...opinion, id: opinionIndex + 1 })),
  }));

  const sources = new Map<number, SourceDto>();
  for (const block of draft.blocks) {
    const citations = block.kind === 'versioned' ? block.variants.flatMap((variant) => variant.sources ?? []) : block.sources ?? [];
    for (const { source } of citations) sources.set(source.id, source);
  }

  const infobox = buildInfoboxCreateDto(draft.infobox);
  return {
    title: draft.title.trim(),
    paragraphs,
    sources: [...sources.values()],
    infobox: infobox
      ? { title: infobox.title, subtitle: infobox.subtitle, fields: infobox.fields.map((field) => ({ ...field, id: field.order })) }
      : undefined,
    summary: draft.summary.trim() || undefined,
    tags: draft.tags,
  };
};
