import { describe, expect, it } from 'vitest';
import editor from '../../localization/locales/ru/editor.json';
import { filterSlashMenuKinds, slashMenuQuery } from './slashMenuKinds';

const { kinds: labels, aliases } = editor.addArticleEditor.slashMenu;

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
    expect(filterSlashMenuKinds('', labels, aliases)).toEqual(['paragraph', 'heading2', 'heading3', 'versioned']);
  });

  it('given a label part or an alias, when filtered, then only the matching kinds are offered', () => {
    expect(filterSlashMenuKinds('h2', labels, aliases)).toEqual(['heading2']);
    expect(filterSlashMenuKinds('подз', labels, aliases)).toEqual(['heading3']);
    expect(filterSlashMenuKinds('мнен', labels, aliases)).toEqual(['versioned']);
    expect(filterSlashMenuKinds('абз', labels, aliases)).toEqual(['paragraph']);
    expect(filterSlashMenuKinds('zzz', labels, aliases)).toEqual([]);
  });
});
