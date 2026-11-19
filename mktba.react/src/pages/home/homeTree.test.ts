import { describe, expect, it } from 'vitest';
import type { NavigationArticleDto } from '../../shared/types/ApiTypes';
import { findArticlesByTitle, homeSections } from './homeTree';

let nextId = 1;
const node = (title: string, children: NavigationArticleDto[] = [], hasContent = true): NavigationArticleDto => ({
  id: nextId++,
  title,
  slug: title.toLowerCase(),
  status: 'Published',
  hasContent,
  canEdit: false,
  children,
});

const tree = [
  node('Поклонение', [node('Салат', [node('Салат путника')]), node('Закят')]),
  node('Вероубеждение', [node('Столпы имана')], false),
];

describe('findArticlesByTitle', () => {
  it('given a term in any case, when searching, then finds the articles at every depth in tree order', () => {
    expect(findArticlesByTitle(tree, ' сАЛат ').map((article) => article.title)).toEqual(['Салат', 'Салат путника']);
  });

  it('given a blank term, when searching, then finds nothing', () => {
    expect(findArticlesByTitle(tree, '   ')).toEqual([]);
  });

  it('given a term nothing matches or no tree, when searching, then finds nothing', () => {
    expect(findArticlesByTitle(tree, 'хадж')).toEqual([]);
    expect(findArticlesByTitle(undefined, 'салат')).toEqual([]);
  });

  it('given a matching stub with no content, when searching, then skips it but still looks at its children', () => {
    expect(findArticlesByTitle(tree, 'вероубеждение')).toEqual([]);
    expect(findArticlesByTitle(tree, 'иман').map((article) => article.title)).toEqual(['Столпы имана']);
  });

  it('given more matches than the limit, when searching, then returns only the first ones', () => {
    expect(findArticlesByTitle(tree, 'а', 2).map((article) => article.title)).toEqual(['Салат', 'Салат путника']);
  });
});

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
