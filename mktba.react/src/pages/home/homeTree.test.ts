import { describe, expect, it } from 'vitest';
import type { NavigationArticleDto } from '../../shared/types/ApiTypes';
import { homeSections } from './homeTree';

let nextId = 1;
const node = (title: string, children: NavigationArticleDto[] = [], hasContent = true): NavigationArticleDto => ({
  id: nextId++,
  title,
  slug: title.toLowerCase(),
  locale: 'ru',
  status: 'Published',
  hasContent,
  canEdit: false,
  isVerified: false,
  children,
});

const tree = [
  node('Поклонение', [node('Салат', [node('Салат путника')]), node('Закят')]),
  node('Вероубеждение', [node('Столпы имана')], false),
];

describe('homeSections', () => {
  it('given a tree, when building sections, then each top-level article previews its direct children', () => {
    const sections = homeSections(tree);

    expect(sections.map((section) => section.article.title)).toEqual(['Поклонение', 'Вероубеждение']);
    expect(sections[0].preview.map((article) => article.title)).toEqual(['Салат', 'Закят']);
    expect(sections[0].moreCount).toBe(0);
  });

  it('given more children than the preview holds, when building sections, then counts the rest', () => {
    const [section] = homeSections(tree, 1);

    expect(section.preview.map((article) => article.title)).toEqual(['Салат']);
    expect(section.moreCount).toBe(1);
  });

  it('given no tree, when building sections, then there are none', () => {
    expect(homeSections(undefined)).toEqual([]);
  });
});
