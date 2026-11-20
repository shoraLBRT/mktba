import { describe, expect, it } from 'vitest';
import { createEmptyArticleDraft, type ArticleDraft } from './articleDraft';
import { seoExcerpt, seoSnippetOf } from './seoSnippet';

const draftWith = (patch: Partial<ArticleDraft>) => ({ ...createEmptyArticleDraft(), ...patch });

describe('seoExcerpt', () => {
  it('given Markdown, when cut, then markup, links and images are reduced to text', () => {
    expect(seoExcerpt('## Намаз\n\n**Время** [молитвы](/vremya) ![x](/a.png)')).toBe('Намаз Время молитвы');
  });

  it('given a text over 160 characters, when cut, then it ends on a word boundary with an ellipsis', () => {
    const excerpt = seoExcerpt(`${'слово '.repeat(40)}конец`)!;

    expect(excerpt.length).toBeLessThanOrEqual(160);
    expect(excerpt.endsWith('слово…')).toBe(true);
  });

  it('given only markup, when cut, then nothing is left', () => {
    expect(seoExcerpt('## **')).toBeNull();
  });
});

describe('seoSnippetOf', () => {
  it('given SEO overrides, when resolved, then they win over the title and summary', () => {
    const snippet = seoSnippetOf(draftWith({
      title: 'Намаз',
      summary: 'Кратко',
      seo: { title: 'Намаз: как молиться', description: 'Описание', socialImageUrl: '', noIndex: false },
    }));

    expect(snippet).toEqual({ title: 'Намаз: как молиться', description: 'Описание' });
  });

  it('given no overrides, when resolved, then the title and the summary are used', () => {
    expect(seoSnippetOf(draftWith({ title: ' Намаз ', summary: 'Кратко' }))).toEqual({ title: 'Намаз', description: 'Кратко' });
  });

  it('given no summary, when resolved, then the description is the default opinion of the first stored paragraph', () => {
    const snippet = seoSnippetOf(draftWith({
      title: 'Намаз',
      blocks: [
        { id: 'a', kind: 'paragraph', content: '   ' },
        {
          id: 'b',
          kind: 'versioned',
          variants: [
            { localId: 'x', content: 'Мнение ханафитов', isDefault: false, schoolIds: [1] },
            { localId: 'y', content: 'Мнение по умолчанию', isDefault: true, schoolIds: [2] },
          ],
        },
      ],
    }));

    expect(snippet.description).toBe('Мнение по умолчанию');
  });
});
