import { describe, expect, it } from 'vitest';
import { COMMENT_MAX_LEVEL, commentLength, commentRows, safeCommentHref, templateParts } from './articleComments';
import type { ArticleCommentDto } from './types/ApiTypes';

const comment = (id: number, parentId: number | null, patch: Partial<ArticleCommentDto> = {}): ArticleCommentDto => ({
  id,
  parentId,
  authorName: `Автор ${id}`,
  body: `Текст ${id}`,
  isDeleted: false,
  isMine: false,
  canEdit: false,
  canDelete: false,
  createdAt: '2026-11-26T10:00:00Z',
  editedAt: null,
  ...patch,
});

describe('commentRows', () => {
  it('indents each reply one level deeper than its parent, up to the last level', () => {
    // 1 → 2 → 3 → 4 → 5 → 6, and 7 a second top-level comment.
    const items = [comment(1, null), comment(2, 1), comment(3, 2), comment(4, 3), comment(5, 4), comment(6, 5), comment(7, null)];

    const rows = commentRows(items, 'Без имени');

    expect(rows.map((row) => row.level)).toEqual([0, 1, 2, 3, 3, 3, 0]);
    expect(COMMENT_MAX_LEVEL).toBe(3);
  });

  it('names whom a reply answers only where the indentation no longer shows it', () => {
    const items = [
      comment(1, null),
      comment(2, 1),
      comment(3, 2),
      comment(4, 3),
      comment(5, 4, { authorName: null }),
      comment(6, 5),
    ];

    const rows = commentRows(items, 'Без имени');

    expect(rows.map((row) => row.replyTo)).toEqual([null, null, null, null, 'Автор 4', 'Без имени']);
  });

  it('does not name the author of a deleted comment', () => {
    const items = [comment(1, null), comment(2, 1), comment(3, 2), comment(4, 3, { isDeleted: true, authorName: null, body: null }), comment(5, 4)];

    expect(commentRows(items, 'Без имени')[4].replyTo).toBeNull();
  });
});

describe('safeCommentHref', () => {
  it.each([
    ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['http://example.com', 'http://example.com/'],
    ['/namaz-putnika#p-1', '/namaz-putnika#p-1'],
  ])('keeps %s', (url, expected) => {
    expect(safeCommentHref(url)).toBe(expected);
  });

  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.example', '/\\evil.example', 'mailto:a@b.c', 'notes', ''])(
    'drops %s',
    (url) => {
      expect(safeCommentHref(url)).toBeNull();
    },
  );
});

describe('commentLength', () => {
  it('counts the text as the server stores it, trimmed', () => {
    expect(commentLength('  абв \n')).toBe(3);
  });
});

describe('templateParts', () => {
  it('splits a template around its placeholders', () => {
    expect(templateParts('{signIn} или {signUp}, чтобы')).toEqual([
      { text: '{signIn}', placeholder: 'signIn' },
      { text: ' или ', placeholder: null },
      { text: '{signUp}', placeholder: 'signUp' },
      { text: ', чтобы', placeholder: null },
    ]);
  });
});
