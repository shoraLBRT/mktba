import type { OpinionCreateDto, OpinionDto, OpinionSourceDto, ParagraphCreateDto, ParagraphDto, SourceDto } from '../../shared/types/ApiTypes';
import type { AlternativeDraft, CitationDraft, EditorBlock, PlainBlockKind, VersionedEditorBlock } from './types';

/** A citation of `source` as the editor holds it. */
export const createCitation = (source: SourceDto, locator = ''): CitationDraft => ({
  localId: crypto.randomUUID(),
  source,
  locator,
});

const toCitationDtos = (citations: CitationDraft[] | undefined): OpinionSourceDto[] =>
  (citations ?? []).map(({ source, locator }) => ({ sourceId: source.id, locator: locator.trim() || null }));

/** The saved citations of an opinion as drafts; a citation whose source the article does not carry is skipped. */
const toCitationDrafts = (citations: OpinionSourceDto[] | null | undefined, sources: Map<number, SourceDto>): CitationDraft[] =>
  (citations ?? []).flatMap(({ sourceId, locator }) => {
    const source = sources.get(sourceId);
    return source ? [createCitation(source, locator ?? '')] : [];
  });

/**
 * Replaces the citations of one opinion: of a version (`localId`) of a versioned block, or of a
 * plain paragraph (`localId` null).
 */
export const setOpinionSources = (
  blocks: EditorBlock[],
  blockId: string,
  localId: string | null,
  sources: CitationDraft[],
): EditorBlock[] =>
  blocks.map((block) => {
    if (block.id !== blockId) {
      return block;
    }

    if (block.kind !== 'versioned') {
      return localId === null ? { ...block, sources } : block;
    }

    return {
      ...block,
      variants: block.variants.map((variant) => (variant.localId === localId ? { ...variant, sources } : variant)),
    };
  });

const createVariant = (isDefault: boolean): AlternativeDraft => ({
  localId: crypto.randomUUID(),
  content: '',
  isDefault,
  schoolIds: [],
});

export const createEmptyBlock = (kind: PlainBlockKind | 'versioned'): EditorBlock => {
  if (kind === 'versioned') {
    return {
      id: crypto.randomUUID(),
      kind: 'versioned',
      variants: [createVariant(true)],
    };
  }

  return {
    id: crypto.randomUUID(),
    kind,
    content: '',
  };
};

export const updatePlainBlockContent = (
  blocks: EditorBlock[],
  blockId: string,
  content: string,
): EditorBlock[] =>
  blocks.map((block) =>
    block.id === blockId && block.kind !== 'versioned' ? { ...block, content } : block,
  );

export const updateVersionContent = (
  blocks: EditorBlock[],
  blockId: string,
  localId: string,
  content: string,
): EditorBlock[] =>
  blocks.map((block) =>
    block.id !== blockId || block.kind !== 'versioned'
      ? block
      : {
          ...block,
          variants: block.variants.map((variant) =>
            variant.localId === localId ? { ...variant, content } : variant,
          ),
        },
  );

export const setDefaultVersion = (
  blocks: EditorBlock[],
  blockId: string,
  localId: string,
): EditorBlock[] =>
  blocks.map((block) =>
    block.id !== blockId || block.kind !== 'versioned'
      ? block
      : {
          ...block,
          variants: block.variants.map((variant) => ({
            ...variant,
            isDefault: variant.localId === localId,
          })),
        },
  );

export const addVersionToBlock = (blocks: EditorBlock[], blockId: string): EditorBlock[] =>
  blocks.map((block) =>
    block.id !== blockId || block.kind !== 'versioned'
      ? block
      : {
          ...block,
          variants: [...block.variants, createVariant(false)],
        },
  );

/**
 * Schools can be assigned only in a block with two or more versions. A paragraph with a single
 * opinion is common to all schools, and the API rejects school ids on it
 * (`paragraph_plain_schools_not_allowed`).
 */
export const canAssignSchools = (block: VersionedEditorBlock): boolean => block.variants.length > 1;

export const removeVersionFromBlock = (
  blocks: EditorBlock[],
  blockId: string,
  localId: string,
): EditorBlock[] =>
  blocks.map((block) => {
    if (block.id !== blockId || block.kind !== 'versioned' || block.variants.length <= 1) {
      return block;
    }

    let variants = block.variants.filter((variant) => variant.localId !== localId);
    if (!variants.some((variant) => variant.isDefault) && variants[0]) {
      variants[0] = { ...variants[0], isDefault: true };
    }
    if (!canAssignSchools({ ...block, variants })) {
      variants = variants.map((variant) => ({ ...variant, schoolIds: [] }));
    }

    return { ...block, variants };
  });

export const deleteBlock = (blocks: EditorBlock[], blockId: string): EditorBlock[] =>
  blocks.filter((block) => block.id !== blockId);

export const moveBlock = (blocks: EditorBlock[], blockId: string, direction: -1 | 1): EditorBlock[] => {
  const index = blocks.findIndex((block) => block.id === blockId);
  const targetIndex = index + direction;

  if (index < 0 || targetIndex < 0 || targetIndex >= blocks.length) {
    return blocks;
  }

  const next = [...blocks];
  const [block] = next.splice(index, 1);
  next.splice(targetIndex, 0, block);
  return next;
};

export const insertBlockAfter = (
  blocks: EditorBlock[],
  afterBlockId: string | null,
  kind: PlainBlockKind | 'versioned',
): EditorBlock[] => {
  const newBlock = createEmptyBlock(kind);
  if (!afterBlockId) {
    return [...blocks, newBlock];
  }

  const index = blocks.findIndex((block) => block.id === afterBlockId);
  if (index < 0) {
    return [...blocks, newBlock];
  }

  const next = [...blocks];
  next.splice(index + 1, 0, newBlock);
  return next;
};

export const convertParagraphToVersioned = (blocks: EditorBlock[], blockId: string): EditorBlock[] =>
  blocks.map((block) => {
    if (block.id !== blockId || block.kind === 'versioned') {
      return block;
    }

    return {
      id: block.id,
      kind: 'versioned',
      paragraphId: block.paragraphId,
      variants: [
        {
          localId: crypto.randomUUID(),
          content: block.content,
          isDefault: true,
          opinionId: block.opinionId,
          schoolIds: [],
          sources: block.sources,
        },
      ],
    };
  });

export const convertVersionedToParagraph = (blocks: EditorBlock[], blockId: string): EditorBlock[] =>
  blocks.map((block) => {
    if (block.id !== blockId || block.kind !== 'versioned') {
      return block;
    }

    const defaultVariant = block.variants.find((variant) => variant.isDefault) ?? block.variants[0];

    return {
      id: block.id,
      kind: 'paragraph',
      content: defaultVariant?.content ?? '',
      paragraphId: block.paragraphId,
      opinionId: defaultVariant?.opinionId,
      sources: defaultVariant?.sources,
    };
  });

const toStoredMarkdown = (block: EditorBlock): string[] => {
  if (block.kind === 'versioned') {
    return block.variants
      .filter((variant) => variant.content.trim())
      .map((variant) => variant.content.trim());
  }

  if (block.kind === 'heading2') {
    return block.content.trim() ? [`## ${block.content.trim()}`] : [];
  }

  if (block.kind === 'heading3') {
    return block.content.trim() ? [`### ${block.content.trim()}`] : [];
  }

  if (block.kind === 'paragraph') {
    return block.content.trim() ? [block.content.trim()] : [];
  }

  return [];
};

/**
 * A versioned block whose other opinions are empty is saved as a plain paragraph: its only opinion
 * is common to all schools, so it is sent without school ids and as the default
 * (the API rejects school ids on a single-opinion paragraph).
 */
const asPlainOpinion = <T extends OpinionCreateDto>(opinion: T): T => ({ ...opinion, isDefault: true, schoolIds: [] });

/** Only a paragraph cites sources: a heading block sends none, whatever it held before it became a heading. */
const plainBlockSources = (block: EditorBlock): OpinionSourceDto[] =>
  block.kind === 'paragraph' ? toCitationDtos(block.sources) : [];

export const buildParagraphCreateDtosFromBlocks = (blocks: EditorBlock[]): ParagraphCreateDto[] => {
  const paragraphs: ParagraphCreateDto[] = [];

  blocks.forEach((block, index) => {
    const order = index + 1;

    if (block.kind === 'versioned') {
      const opinions: OpinionCreateDto[] = block.variants
        .filter((variant) => variant.content.trim())
        .map((variant) => ({
          content: variant.content.trim(),
          isDefault: variant.isDefault,
          schoolIds: variant.schoolIds,
          sources: toCitationDtos(variant.sources),
        }));
      if (opinions.length === 1) {
        opinions[0] = asPlainOpinion(opinions[0]);
      }

      if (opinions.length > 0) {
        paragraphs.push({ articleId: 0, order, opinions });
      }
      return;
    }

    const [content] = toStoredMarkdown(block);
    if (!content) return;

    paragraphs.push({
      articleId: 0,
      order,
      opinions: [{ content, isDefault: true, schoolIds: [], sources: plainBlockSources(block) }],
    });
  });

  return paragraphs;
};

export const buildParagraphUpdateDtosFromBlocks = (blocks: EditorBlock[]): ParagraphDto[] => {
  const paragraphs: ParagraphDto[] = [];

  blocks.forEach((block, index) => {
    const order = index + 1;

    if (block.kind === 'versioned') {
      const opinions: OpinionDto[] = block.variants
        .filter((variant) => variant.content.trim())
        .map((variant) => ({
          id: variant.opinionId ?? 0,
          content: variant.content.trim(),
          isDefault: variant.isDefault,
          schoolIds: variant.schoolIds,
          sources: toCitationDtos(variant.sources),
        }));
      if (opinions.length === 1) {
        opinions[0] = asPlainOpinion(opinions[0]);
      }

      if (opinions.length > 0) {
        paragraphs.push({ id: block.paragraphId ?? 0, order, opinions });
      }
      return;
    }

    const [content] = toStoredMarkdown(block);
    if (!content) return;

    paragraphs.push({
      id: block.paragraphId ?? 0,
      order,
      opinions: [{
        id: block.opinionId ?? 0,
        content,
        isDefault: true,
        schoolIds: [],
        sources: plainBlockSources(block),
      }],
    });
  });

  return paragraphs;
};

export const hasVersionedBlockWithoutFilledDefault = (blocks: EditorBlock[]): boolean =>
  blocks.some(
    (block) =>
      block.kind === 'versioned' &&
      !block.variants.some((variant) => variant.isDefault && variant.content.trim()),
  );

export const hasAnyFilledContent = (blocks: EditorBlock[]): boolean =>
  blocks.some((block) => {
    if (block.kind === 'versioned') {
      return block.variants.some((variant) => variant.content.trim());
    }

    return Boolean(block.content.trim());
  });

export const importBlocksFromMarkdown = (importText: string): EditorBlock[] => {
  const parts = importText
    .split(/\n\s*\n/g)
    .map((value) => value.trim())
    .filter(Boolean);

  return parts.map((content) => {
    if (content.startsWith('## ')) {
      return {
        id: crypto.randomUUID(),
        kind: 'heading2' as const,
        content: content.replace(/^##\s+/, ''),
      };
    }

    if (content.startsWith('### ')) {
      return {
        id: crypto.randomUUID(),
        kind: 'heading3' as const,
        content: content.replace(/^###\s+/, ''),
      };
    }

    return {
      id: crypto.randomUUID(),
      kind: 'paragraph' as const,
      content,
    };
  });
};

export const buildDocumentPreviewMarkdown = (blocks: EditorBlock[]): string =>
  blocks
    .flatMap((block) => {
      if (block.kind === 'versioned') {
        const defaultVariant = block.variants.find((variant) => variant.isDefault) ?? block.variants[0];
        return defaultVariant?.content?.trim() ? [defaultVariant.content.trim()] : [];
      }

      return toStoredMarkdown(block);
    })
    .join('\n\n');

/**
 * @param sources The directory entries the article cites (`ArticleContentDto.sources`), which the
 * citations of the opinions refer to by id.
 */
export const importBlocksFromParagraphs = (paragraphs: ParagraphDto[], sources: SourceDto[] = []): EditorBlock[] => {
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  return [...paragraphs].sort((a, b) => a.order - b.order).map((paragraph) => {
    const { id: paragraphId, opinions } = paragraph;

    if (opinions.length === 1) {
      const op = opinions[0];
      const content = op.content;

      if (content.startsWith('### ')) {
        return {
          id: crypto.randomUUID(),
          kind: 'heading3' as const,
          content: content.replace(/^###\s+/, ''),
          paragraphId,
          opinionId: op.id,
        };
      }

      if (content.startsWith('## ')) {
        return {
          id: crypto.randomUUID(),
          kind: 'heading2' as const,
          content: content.replace(/^##\s+/, ''),
          paragraphId,
          opinionId: op.id,
        };
      }

      return {
        id: crypto.randomUUID(),
        kind: 'paragraph' as const,
        content,
        paragraphId,
        opinionId: op.id,
        sources: toCitationDrafts(op.sources, sourcesById),
      };
    }

    return {
      id: crypto.randomUUID(),
      kind: 'versioned' as const,
      paragraphId,
      variants: opinions.map((op) => ({
        localId: crypto.randomUUID(),
        content: op.content,
        isDefault: op.isDefault,
        opinionId: op.id,
        schoolIds: op.schoolIds,
        sources: toCitationDrafts(op.sources, sourcesById),
      })),
    };
  });
};

export const setOpinionSchools = (
  blocks: EditorBlock[],
  blockId: string,
  localId: string,
  schoolIds: number[],
): EditorBlock[] =>
  blocks.map((block) =>
    block.id !== blockId || block.kind !== 'versioned'
      ? block
      : {
          ...block,
          variants: block.variants.map((variant) =>
            variant.localId === localId ? { ...variant, schoolIds } : variant,
          ),
        },
  );

export const collectWholeArticleAiTargets = (
  blocks: EditorBlock[],
): Array<{ blockId: string; localId: string | null; content: string }> => {
  const targets: Array<{ blockId: string; localId: string | null; content: string }> = [];

  blocks.forEach((block) => {
    if (block.kind === 'versioned') {
      block.variants
        .filter((variant) => variant.content.trim())
        .forEach((variant) => {
          targets.push({ blockId: block.id, localId: variant.localId, content: variant.content });
        });
      return;
    }

    if (block.kind === 'paragraph' && block.content.trim()) {
      targets.push({ blockId: block.id, localId: null, content: block.content });
    }
  });

  return targets;
};
