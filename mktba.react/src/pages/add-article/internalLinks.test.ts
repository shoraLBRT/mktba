import { describe, expect, it } from 'vitest';
import {
  filterLinkTargets,
  findBrokenInternalLinks,
  findInternalLinkSlugs,
  internalArticleSlug,
  type ArticleLinkTarget,
} from './internalLinks';
import type { EditorBlock } from './types';

const article = (id: number, slug: string, status: ArticleLinkTarget['status'] = 'Published'): ArticleLinkTarget => ({
  id,
  title: `Статья ${slug}`,
  path: `Раздел / Статья ${slug}`,
  slug,
  status,
});

describe('internalArticleSlug', () => {
  it('given a site-relative one-segment path, when read, then its slug is returned without query or fragment', () => {
    expect(internalArticleSlug('/namaz')).toBe('namaz');
    expect(internalArticleSlug('/namaz?mazhab=hanafi#p-3')).toBe('namaz');
    expect(internalArticleSlug('/namaz/')).toBe('namaz');
  });

  it('given anything but an article path, when read, then it is not an article link', () => {
    for (const href of ['https://mktba.ru/namaz', '//cdn.example/x', '#part', '/', '/search', '/authors/ivan', '/a/b', '/robots.txt', 'namaz']) {
      expect(internalArticleSlug(href)).toBeNull();
    }
  });
});

describe('findInternalLinkSlugs', () => {
  it('given inline, reference and image links, when scanned, then only the article links are listed once each', () => {
    const markdown = [
      'См. [намаз](/namaz), [ещё раз](/namaz#p-1) и [пост][p].',
      '![карта](/map) [внешняя](https://example.com) `[код](/code)`',
      '',
      '[p]: /post',
    ].join('\n');

    expect(findInternalLinkSlugs(markdown)).toEqual(['namaz', 'post']);
  });

  it('given text without links, when scanned, then nothing is listed', () => {
    expect(findInternalLinkSlugs('просто текст [в скобках]')).toEqual([]);
  });
});

describe('findBrokenInternalLinks', () => {
  const blocks: EditorBlock[] = [
    { id: 'b1', kind: 'paragraph', content: '[ок](/namaz) [нет](/missing)' },
    {
      id: 'b2',
      kind: 'versioned',
      variants: [
        { localId: 'v1', content: '[черновик](/draft)', isDefault: true, schoolIds: [] },
        { localId: 'v2', content: '[черновик снова](/draft) [нет](/missing)', isDefault: false, schoolIds: [] },
      ],
    },
  ];

  it('given links to unknown and unpublished articles, when checked, then each is reported once per block', () => {
    const result = findBrokenInternalLinks(blocks, [article(1, 'namaz'), article(2, 'draft', 'Draft')]);

    expect(result).toEqual([
      { blockId: 'b1', slug: 'missing', problem: 'missing' },
      { blockId: 'b2', slug: 'draft', problem: 'unpublished' },
      { blockId: 'b2', slug: 'missing', problem: 'missing' },
    ]);
  });

  it('given every link points at a Published article, when checked, then nothing is reported', () => {
    const result = findBrokenInternalLinks(blocks.slice(0, 1), [article(1, 'namaz'), article(3, 'missing')]);

    expect(result).toEqual([]);
  });
});

describe('filterLinkTargets', () => {
  const articles = [article(1, 'namaz'), article(2, 'post')];

  it('given a query, when filtered, then articles match by title, path or slug, ignoring case', () => {
    expect(filterLinkTargets(articles, 'POST').map((a) => a.id)).toEqual([2]);
    expect(filterLinkTargets(articles, 'раздел').map((a) => a.id)).toEqual([1, 2]);
  });

  it('given a blank query, when filtered, then every article is listed', () => {
    expect(filterLinkTargets(articles, '  ')).toHaveLength(2);
  });
});
