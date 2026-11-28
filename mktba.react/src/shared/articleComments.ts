import type { ArticleCommentDto } from './types/ApiTypes';

/** The longest comment the server keeps (`ArticleComment.BodyMaxLength`), in UTF-16 code units after trimming. */
export const COMMENT_BODY_MAX_LENGTH = 2000;

/**
 * Levels of the reply tree the page indents (C-01, #127): a top-level comment is level 0, a reply
 * deeper than the last level stays at it and names whom it answers.
 */
export const COMMENT_MAX_LEVEL = 3;

/** One comment as the list shows it. */
export type CommentRow = {
  comment: ArticleCommentDto;
  /** Its indentation, 0 to {@link COMMENT_MAX_LEVEL}. */
  level: number;
  /** The answered comment's author, for a reply deeper than the indentation shows; null otherwise. */
  replyTo: string | null;
};

/**
 * The rows of the list from the API's flat items, which come in tree order (each comment after the
 * one it answers): the depth of each comment, capped at {@link COMMENT_MAX_LEVEL}.
 */
export const commentRows = (items: readonly ArticleCommentDto[], noName: string): CommentRow[] => {
  const depths = new Map<number, number>();
  const byId = new Map(items.map((item) => [item.id, item]));
  return items.map((comment) => {
    const parentDepth = comment.parentId == null ? undefined : depths.get(comment.parentId);
    const depth = parentDepth === undefined ? 0 : parentDepth + 1;
    depths.set(comment.id, depth);
    const level = Math.min(depth, COMMENT_MAX_LEVEL);
    const parent = comment.parentId == null ? undefined : byId.get(comment.parentId);
    const replyTo = depth > COMMENT_MAX_LEVEL && parent && !parent.isDeleted && !parent.isHidden ? parent.authorName ?? noName : null;
    return { comment, level, replyTo };
  });
};

/** The length the server counts: the text as it will be stored, trimmed. */
export const commentLength = (text: string): number => text.trim().length;

/**
 * Where a link in a comment may point: an absolute http(s) URL or a site-relative path. Anything
 * else (`javascript:`, `data:`, `//host`, a bare word) is no link at all: null.
 */
export const safeCommentHref = (url: string): string | null => {
  const value = url.trim();
  if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) {
    return value;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
};

/** The parts of a message template around its `{name}` placeholders, for putting elements in their place. */
export const templateParts = (template: string): { text: string; placeholder: string | null }[] =>
  template
    .split(/(\{\w+\})/)
    .filter((part) => part !== '')
    .map((part) => {
      const match = /^\{(\w+)\}$/.exec(part);
      return match ? { text: part, placeholder: match[1] } : { text: part, placeholder: null };
    });
