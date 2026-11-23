import type { ArticleContentCreateDto, ArticleContentDto, ArticleSnapshotDto, SourceDto } from '../../shared/types/ApiTypes';
import { buildSeoDto, emptySeoDraft, isValidSocialImageUrl, seoDraftFromDto, type SeoDraft } from '../../shared/seo';
import { articleSlugFromTitle, isReservedArticleSlug, isValidSlug } from '../../shared/slug';
import {
  addVersionToBlock,
  buildParagraphCreateDtosFromBlocks,
  buildParagraphUpdateDtosFromBlocks,
  convertParagraphToVersioned,
  createEmptyBlock,
  hasAnyFilledContent,
  hasVersionedBlockWithoutFilledDefault,
  importBlocksFromParagraphs,
  updatePlainBlockContent,
  updateVersionContent,
} from './draftHelpers';
import { buildInfoboxCreateDto, createEmptyInfoboxDraft, hasIncompleteInfoboxFields, importInfoboxFromDto } from './infoboxHelpers';
import { buildRelatedLinkCreateDtos, importRelatedLinksFromDto, type RelatedLinkDraft } from './metadataHelpers';
import type { EditorBlock, InfoboxDraft } from './types';

/** A new translation (I-06, #110): the article it translates and the language it is written in. */
export type TranslationTarget = { sourceId: number; locale: string };

/** Which article the editor works on: a new one (maybe a translation), or an existing one loaded from the API. */
export type ArticleEditorMode = { kind: 'create'; translation?: TranslationTarget } | { kind: 'edit'; article: ArticleContentDto };

/** Everything the editor lets the user change before saving, in one value. */
export type ArticleDraft = {
  title: string;
  /**
   * `null` while the slug follows the title (a new article until a slug is typed): it is then
   * left to the server, so a slug already taken gets a `-2` suffix instead of an error.
   */
  slug: string | null;
  parentArticleId: number | null;
  infobox: InfoboxDraft;
  blocks: EditorBlock[];
  summary: string;
  seo: SeoDraft;
  tags: string[];
  relatedLinks: RelatedLinkDraft[];
  /** The revision comment of a save; only an existing article has revisions to comment on. */
  editComment: string;
  /** A translation's source revision it matches (I-06, #110); null for an original. Raised when the translator marks it up to date. */
  translatedFromRevision: number | null;
};

export const createEmptyArticleDraft = (): ArticleDraft => ({
  title: '',
  slug: null,
  parentArticleId: null,
  infobox: createEmptyInfoboxDraft(),
  blocks: [createEmptyBlock('paragraph')],
  summary: '',
  seo: emptySeoDraft(),
  tags: [],
  relatedLinks: [],
  editComment: '',
  translatedFromRevision: null,
});

export const articleDraftFromDto = (article: ArticleContentDto): ArticleDraft => {
  const blocks = importBlocksFromParagraphs(article.paragraphs, article.sources ?? []);
  return {
    ...createEmptyArticleDraft(),
    title: article.title,
    slug: article.slug ?? '',
    blocks: blocks.length > 0 ? blocks : [createEmptyBlock('paragraph')],
    infobox: article.infobox ? importInfoboxFromDto(article.infobox) : createEmptyInfoboxDraft(),
    summary: article.summary ?? '',
    seo: seoDraftFromDto(article.seo),
    tags: article.tags ?? [],
    relatedLinks: article.relatedLinks ? importRelatedLinksFromDto(article.relatedLinks) : [],
    translatedFromRevision: article.translatedFromRevision ?? null,
  };
};

export const initialArticleDraft = (mode: ArticleEditorMode): ArticleDraft =>
  mode.kind === 'edit' ? articleDraftFromDto(mode.article) : createEmptyArticleDraft();

/**
 * Whether the draft differs from the one last saved (or loaded): the unsaved-edits guard asks
 * this (E-03, #76), and so will autosave (E-02, #75). Edits undone by hand count as no change.
 */
export const hasArticleDraftChanged = (draft: ArticleDraft, baseline: ArticleDraft): boolean =>
  draft !== baseline && JSON.stringify(draft) !== JSON.stringify(baseline);

/** The slug the slug field shows: the typed one, or the one derived from the title. */
export const displayedSlug = (draft: ArticleDraft): string =>
  draft.slug ?? (draft.title.trim() ? articleSlugFromTitle(draft.title) : '');

/**
 * The slug a save asks for. A new article sends none unless one was typed; an existing article
 * always sends its slug, so an emptied field is refused rather than silently kept.
 */
const requestedSlug = (draft: ArticleDraft, kind: ArticleEditorMode['kind']): string | undefined =>
  kind === 'create' ? draft.slug?.trim() || undefined : (draft.slug ?? '').trim();

export type ArticleDraftProblem =
  | { code: 'titleRequired' }
  | { code: 'paragraphRequired' }
  | { code: 'defaultRequired' }
  | { code: 'infoboxFieldIncomplete' }
  | { code: 'slugInvalid' }
  | { code: 'slugReserved'; slug: string }
  | { code: 'socialImageInvalid' };

/** The first reason the draft cannot be saved, in the order the editor reports them; `null` if it can. */
export const findArticleDraftProblem = (
  draft: ArticleDraft,
  kind: ArticleEditorMode['kind'],
): ArticleDraftProblem | null => {
  if (!draft.title.trim()) return { code: 'titleRequired' };
  if (!hasAnyFilledContent(draft.blocks)) return { code: 'paragraphRequired' };
  if (hasVersionedBlockWithoutFilledDefault(draft.blocks)) return { code: 'defaultRequired' };
  if (hasIncompleteInfoboxFields(draft.infobox)) return { code: 'infoboxFieldIncomplete' };

  const slug = requestedSlug(draft, kind);
  if (slug !== undefined && !isValidSlug(slug)) return { code: 'slugInvalid' };
  if (slug !== undefined && isReservedArticleSlug(slug)) return { code: 'slugReserved', slug };

  if (!isValidSocialImageUrl(draft.seo.socialImageUrl)) return { code: 'socialImageInvalid' };
  return null;
};

export const buildArticleCreateDto = (draft: ArticleDraft, translation?: TranslationTarget): ArticleContentCreateDto => ({
  title: draft.title.trim(),
  slug: requestedSlug(draft, 'create'),
  parentArticleId: draft.parentArticleId ?? undefined,
  paragraphs: buildParagraphCreateDtosFromBlocks(draft.blocks),
  infobox: buildInfoboxCreateDto(draft.infobox),
  summary: draft.summary.trim() || undefined,
  seo: buildSeoDto(draft.seo),
  tags: draft.tags.length > 0 ? draft.tags : undefined,
  relatedLinks: buildRelatedLinkCreateDtos(draft.relatedLinks),
  ...(translation ? { locale: translation.locale, translationOfId: translation.sourceId } : {}),
});

export const buildArticleUpdateDto = (draft: ArticleDraft, articleId: number): ArticleContentDto => {
  const infobox = buildInfoboxCreateDto(draft.infobox);
  return {
    id: articleId,
    title: draft.title.trim(),
    slug: requestedSlug(draft, 'edit'),
    paragraphs: buildParagraphUpdateDtosFromBlocks(draft.blocks),
    infobox: infobox
      ? { title: infobox.title, subtitle: infobox.subtitle, fields: infobox.fields.map((field) => ({ ...field, id: 0 })) }
      : undefined,
    editComment: draft.editComment.trim() || undefined,
    translatedFromRevision: draft.translatedFromRevision ?? undefined,
    summary: draft.summary.trim() || undefined,
    seo: buildSeoDto(draft.seo),
    tags: draft.tags,
    relatedLinks: draft.relatedLinks.map((link, index) => ({
      id: 0,
      relatedArticleId: link.articleId,
      relatedArticleTitle: link.articleTitle,
      order: index + 1,
      // Read-only on the server: it reports the related article's current slug.
      relatedArticleSlug: '',
    })),
  };
};

/**
 * The draft as the revision its save would write (E-13, #83), so the history can compare it with
 * a saved revision: the same paragraphs, orders and trimming as the update DTO, each citation with
 * the directory entry the editor shows.
 */
export const articleDraftSnapshot = (draft: ArticleDraft): ArticleSnapshotDto => {
  const dto = buildArticleUpdateDto(draft, 0);
  const sources = new Map<number, SourceDto>();
  draft.blocks.forEach((block) => {
    const citations = block.kind === 'versioned' ? block.variants.flatMap((variant) => variant.sources ?? []) : block.sources ?? [];
    citations.forEach((citation) => sources.set(citation.source.id, citation.source));
  });

  return {
    schemaVersion: 3,
    title: dto.title,
    slug: dto.slug ?? '',
    summary: dto.summary ?? null,
    tags: dto.tags ?? [],
    infobox: dto.infobox,
    paragraphs: dto.paragraphs.map((paragraph) => ({
      order: paragraph.order,
      opinions: paragraph.opinions.map((opinion) => ({
        content: opinion.content,
        isDefault: opinion.isDefault,
        schoolIds: opinion.schoolIds ?? [],
        sources: (opinion.sources ?? []).flatMap(({ sourceId, locator }) => {
          const source = sources.get(sourceId);
          return source
            ? [{ sourceId, locator, kind: source.kind, title: source.title, author: source.author, details: source.details, url: source.url }]
            : [];
        }),
      })),
    })),
    relatedLinks: (dto.relatedLinks ?? []).map((link) => ({
      relatedArticleId: link.relatedArticleId,
      relatedArticleTitle: link.relatedArticleTitle,
      relatedArticleSlug: link.relatedArticleSlug,
      order: link.order,
    })),
    seo: dto.seo,
  };
};

/** One text the AI styled: a paragraph's content, or one opinion of a block of opinions. */
export type AiStyledText = { blockId: string; localId: string | null; original: string; styled: string };

/**
 * Puts the AI's texts into the blocks. A new article takes every text in place of the original.
 * An existing article takes only the texts the AI changed: a changed opinion is added to its block
 * as a further opinion, the original kept; a changed paragraph is turned into a block of opinions
 * whose default is the original and whose second opinion is the styled text.
 */
export const applyAiStyledTexts = (
  blocks: EditorBlock[],
  results: AiStyledText[],
  kind: ArticleEditorMode['kind'],
): { blocks: EditorBlock[]; styledCount: number } => {
  if (kind === 'create') {
    const next = results.reduce(
      (current, result) =>
        result.localId
          ? updateVersionContent(current, result.blockId, result.localId, result.styled)
          : updatePlainBlockContent(current, result.blockId, result.styled),
      blocks,
    );
    return { blocks: next, styledCount: results.length };
  }

  const changed = results.filter((result) => result.styled && result.styled !== result.original);
  const next = changed.reduce((current, result) => {
    const withVersion = result.localId
      ? addVersionToBlock(current, result.blockId)
      : convertParagraphToVersioned(current, result.blockId);
    const block = withVersion.find((item) => item.id === result.blockId);
    if (block?.kind !== 'versioned') {
      return withVersion;
    }

    const lastVariant = block.variants[block.variants.length - 1];
    return updateVersionContent(withVersion, result.blockId, lastVariant.localId, result.styled);
  }, blocks);
  return { blocks: next, styledCount: changed.length };
};
