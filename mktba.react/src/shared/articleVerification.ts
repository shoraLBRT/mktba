import type { ArticleVerificationMarkDto } from './types/ApiTypes';

/**
 * What the widget's line says (V-04, #120): of the current marks, how many confirm the article (with
 * or without remarks) and how many found errors; and how many marks a substantial edit has made
 * stale (D5, #115; V-05, #121: shown «для предыдущей версии», counted apart). A mark of an earlier
 * revision whose text the edits since left alone is current.
 */
export type VerificationSummary = { confirmed: number; errors: number; previous: number };

export const summarizeMarks = (marks: readonly ArticleVerificationMarkDto[]): VerificationSummary => {
  const summary: VerificationSummary = { confirmed: 0, errors: 0, previous: 0 };
  for (const mark of marks) {
    if (!mark.isCurrent) summary.previous += 1;
    else if (mark.verdict === 'HasErrors') summary.errors += 1;
    else summary.confirmed += 1;
  }
  return summary;
};

/** The marks of one scope: a madhab's readers' version, or the whole article (`mazhab` null). */
export type VerificationGroup = { mazhab: string | null; marks: ArticleVerificationMarkDto[] };

/**
 * The marks by scope, the whole article first, then the madhabs in `order` (the canonical schools'
 * slugs), an unknown slug last; the marks keep the API's order (the newest revision first).
 */
export const groupMarksByMazhab = (
  marks: readonly ArticleVerificationMarkDto[],
  order: readonly string[],
): VerificationGroup[] => {
  const groups = new Map<string | null, ArticleVerificationMarkDto[]>();
  for (const mark of marks) {
    const key = mark.mazhab ?? null;
    groups.set(key, [...(groups.get(key) ?? []), mark]);
  }
  const rank = (mazhab: string | null) => {
    if (mazhab === null) return -1;
    const index = order.indexOf(mazhab);
    return index < 0 ? order.length : index;
  };
  return [...groups.entries()]
    .map(([mazhab, items]) => ({ mazhab, marks: items }))
    .sort((a, b) => rank(a.mazhab) - rank(b.mazhab));
};

/** A scholar the page names as its reviewer (V-08, #124). */
export type ReviewerMark = { name: string; slug: string | null; reviewedAt: string };

/**
 * The scholars Schema.org's `reviewedBy` names (V-08, #124): the rule of `VerifiedArticles` on the
 * server — at least one current confirmation (with or without remarks) and no current «есть ошибки»,
 * else nobody — then, of the current confirmations, those with a public name, in the API's order.
 */
export const reviewersOf = (marks: readonly ArticleVerificationMarkDto[]): ReviewerMark[] => {
  const current = marks.filter((mark) => mark.isCurrent);
  if (current.some((mark) => mark.verdict === 'HasErrors')) return [];
  return current.flatMap((mark) =>
    mark.scholarName ? [{ name: mark.scholarName, slug: mark.scholarSlug ?? null, reviewedAt: mark.reviewedAt }] : []);
};
