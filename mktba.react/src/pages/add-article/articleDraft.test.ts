import { describe, expect, it } from 'vitest';
import type { ArticleContentDto } from '../../shared/types/ApiTypes';
import {
  applyAiStyledTexts,
  articleDraftFromDto,
  buildArticleCreateDto,
  buildArticleUpdateDto,
  createEmptyArticleDraft,
  displayedSlug,
  findArticleDraftProblem,
  initialArticleDraft,
  type ArticleDraft,
} from './articleDraft';
import type { EditorBlock } from './types';

const paragraph = (id: string, content: string): EditorBlock => ({
  id,
  kind: 'paragraph',
  content,
  sources: [],
});

const filledDraft = (patch: Partial<ArticleDraft> = {}): ArticleDraft => ({
  ...createEmptyArticleDraft(),
  title: 'Намаз',
  blocks: [paragraph('b1', 'Текст')],
  ...patch,
});

const article: ArticleContentDto = {
  id: 7,
  title: 'Намаз',
  slug: 'namaz',
  locale: 'ru',
  summary: 'Кратко',
  tags: ['фикх'],
  paragraphs: [
    { id: 11, order: 1, opinions: [{ id: 21, content: 'Текст', isDefault: true, schoolIds: [], sources: [] }] },
  ],
  relatedLinks: [{ id: 1, relatedArticleId: 8, relatedArticleTitle: 'Пост', relatedArticleSlug: 'post', order: 1 }],
};

describe('initialArticleDraft', () => {
  it('given the create mode, when the draft starts, then it is empty with one paragraph and a slug that follows the title', () => {
    const draft = initialArticleDraft({ kind: 'create' });

    expect(draft.title).toBe('');
    expect(draft.slug).toBeNull();
    expect(draft.blocks).toHaveLength(1);
    expect(draft.blocks[0].kind).toBe('paragraph');
  });

  it('given the edit mode, when the draft starts, then it holds the saved article', () => {
    const draft = initialArticleDraft({ kind: 'edit', article });

    expect(draft.title).toBe('Намаз');
    expect(draft.slug).toBe('namaz');
    expect(draft.summary).toBe('Кратко');
    expect(draft.tags).toEqual(['фикх']);
    expect(draft.relatedLinks.map((link) => link.articleId)).toEqual([8]);
    expect(draft.blocks).toHaveLength(1);
  });

  it('given a saved article without paragraphs, when the draft starts, then it gets one empty paragraph to type in', () => {
    const draft = articleDraftFromDto({ ...article, paragraphs: [] });

    expect(draft.blocks).toHaveLength(1);
  });
});

describe('displayedSlug', () => {
  it('given a slug that follows the title, when shown, then it is the transliterated title', () => {
    expect(displayedSlug(filledDraft({ title: 'Намаз путника' }))).toBe('namaz-putnika');
  });

  it('given a typed slug, when shown, then it is the typed one', () => {
    expect(displayedSlug(filledDraft({ slug: 'my-slug' }))).toBe('my-slug');
  });
});

describe('findArticleDraftProblem', () => {
  it('given a complete draft, when checked, then there is no problem', () => {
    expect(findArticleDraftProblem(filledDraft(), 'create')).toBeNull();
  });

  it('given no title, when checked, then the title is reported first', () => {
    expect(findArticleDraftProblem(filledDraft({ title: ' ', blocks: [paragraph('b1', '')] }), 'create')).toEqual({ code: 'titleRequired' });
  });

  it('given no text, when checked, then a paragraph is required', () => {
    expect(findArticleDraftProblem(filledDraft({ blocks: [paragraph('b1', ' ')] }), 'edit')).toEqual({ code: 'paragraphRequired' });
  });

  it('given a new article with an emptied slug field, when checked, then the server derives the slug', () => {
    expect(findArticleDraftProblem(filledDraft({ slug: '' }), 'create')).toBeNull();
  });

  it('given a saved article with an emptied slug field, when checked, then the slug is invalid', () => {
    expect(findArticleDraftProblem(filledDraft({ slug: '' }), 'edit')).toEqual({ code: 'slugInvalid' });
  });

  it('given a reserved slug, when checked, then it is refused by name', () => {
    expect(findArticleDraftProblem(filledDraft({ slug: 'admin' }), 'edit')).toEqual({ code: 'slugReserved', slug: 'admin' });
  });

  it('given an invalid social image address, when checked, then it is refused', () => {
    const draft = filledDraft();
    expect(findArticleDraftProblem({ ...draft, seo: { ...draft.seo, socialImageUrl: 'not a url' } }, 'create')).toEqual({ code: 'socialImageInvalid' });
  });
});

describe('buildArticleCreateDto', () => {
  it('given a slug that follows the title, when built, then no slug is sent and empty lists are left out', () => {
    const dto = buildArticleCreateDto(filledDraft({ parentArticleId: 3, summary: '  ' }));

    expect(dto.slug).toBeUndefined();
    expect(dto.parentArticleId).toBe(3);
    expect(dto.summary).toBeUndefined();
    expect(dto.tags).toBeUndefined();
    expect(dto.paragraphs).toHaveLength(1);
  });
});

describe('buildArticleUpdateDto', () => {
  it('given a saved article, when built, then it carries the id, the slug, the comment and the related links in order', () => {
    const draft = { ...articleDraftFromDto(article), editComment: ' Правка ' };

    const dto = buildArticleUpdateDto(draft, 7);

    expect(dto.id).toBe(7);
    expect(dto.slug).toBe('namaz');
    expect(dto.editComment).toBe('Правка');
    expect(dto.tags).toEqual(['фикх']);
    expect(dto.relatedLinks).toEqual([{ id: 0, relatedArticleId: 8, relatedArticleTitle: 'Пост', order: 1, relatedArticleSlug: '' }]);
  });
});

describe('applyAiStyledTexts', () => {
  const blocks = [paragraph('b1', 'старый'), paragraph('b2', 'тот же')];
  const results = [
    { blockId: 'b1', localId: null, original: 'старый', styled: 'новый' },
    { blockId: 'b2', localId: null, original: 'тот же', styled: 'тот же' },
  ];

  it('given a new article, when the AI answers, then every text is replaced in place', () => {
    const applied = applyAiStyledTexts(blocks, results, 'create');

    expect(applied.styledCount).toBe(2);
    expect(applied.blocks.map((block) => block.kind === 'versioned' ? null : block.content)).toEqual(['новый', 'тот же']);
  });

  it('given a saved article, when the AI changes one text, then only that block becomes a block of opinions with the styled text', () => {
    const applied = applyAiStyledTexts(blocks, results, 'edit');

    expect(applied.styledCount).toBe(1);
    const [first, second] = applied.blocks;
    expect(first.kind === 'versioned' ? first.variants.map((variant) => variant.content) : null).toEqual(['новый']);
    expect(second).toBe(blocks[1]);
  });
});
