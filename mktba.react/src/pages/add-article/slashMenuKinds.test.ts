import { describe, expect, it } from 'vitest';
import { filterSlashMenuKinds, slashMenuQuery } from './slashMenuKinds';

const labels = { paragraph: 'Текст', heading2: 'Заголовок H2', heading3: 'Подзаголовок H3', versioned: 'Блок мнений' };

describe('slashMenuQuery', () => {
  it('given a paragraph holding only a slash and a word, when read, then gives the word in lower case', () => {
    expect(slashMenuQuery('/')).toBe('');
    expect(slashMenuQuery('/H2')).toBe('h2');
    expect(slashMenuQuery('/мнения')).toBe('мнения');
  });

  it('given a slash inside a text or followed by a space, when read, then there is no menu', () => {
    expect(slashMenuQuery('и/или')).toBeNull();
    expect(slashMenuQuery('/ текст')).toBeNull();
    expect(slashMenuQuery('')).toBeNull();
  });
});

describe('filterSlashMenuKinds', () => {
  it('given no query, when filtered, then every kind is offered in menu order', () => {
    expect(filterSlashMenuKinds('', labels)).toEqual(['paragraph', 'heading2', 'heading3', 'versioned']);
  });

  it('given a label part or an alias, when filtered, then only the matching kinds are offered', () => {
    expect(filterSlashMenuKinds('h2', labels)).toEqual(['heading2']);
    expect(filterSlashMenuKinds('подз', labels)).toEqual(['heading3']);
    expect(filterSlashMenuKinds('мнен', labels)).toEqual(['versioned']);
    expect(filterSlashMenuKinds('zzz', labels)).toEqual([]);
  });
});
