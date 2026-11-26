import { Link } from 'react-router';
import { formatMessage } from '../../localization';
import { useFormat, useLocale, useLocalizedPath } from '../../localization/hooks';
import { groupMarksByMazhab, summarizeMarks, type VerificationSummary } from '../../shared/articleVerification';
import { authorHref } from '../../shared/slug';
import type { ArticleVerificationMarkDto, SchoolDto } from '../../shared/types/ApiTypes';

type ArticleVerificationProps = {
  /** The latest mark of each verified scholar, the newest revision first (`GET /articles/{id}/verification`). */
  marks?: readonly ArticleVerificationMarkDto[] | null;
  /** The canonical schools, for the madhab names and their order. */
  schools?: readonly SchoolDto[] | null;
};

/**
 * The scholars' marks under the article title (V-04, #120): one line with how many confirmed the
 * current version, how many found errors and how many marks are for a previous version (D5, #115);
 * a click opens who, when and which revision, by madhab. A native `<details>`, so it works in the
 * server's HTML without script. Nothing while no scholar has marked the article.
 */
export const ArticleVerification = ({ marks, schools }: ArticleVerificationProps) => {
  const t = useLocale().articlePage.verification;
  const format = useFormat();
  const localize = useLocalizedPath();
  if (!marks || marks.length === 0) return null;

  const line = (summary: VerificationSummary) =>
    [
      summary.confirmed > 0 ? format.plural(t.confirmed, summary.confirmed) : null,
      summary.errors > 0 ? format.plural(t.errors, summary.errors) : null,
      summary.previous > 0 ? format.plural(t.previous, summary.previous) : null,
    ].filter(Boolean).join(t.partsDivider);

  const canonical = schools ?? [];
  const groups = groupMarksByMazhab(marks, canonical.map((school) => school.slug));
  const scopeName = (mazhab: string | null) =>
    mazhab === null
      ? t.wholeArticle
      : formatMessage(t.mazhab, { mazhab: canonical.find((school) => school.slug === mazhab)?.name ?? mazhab });

  return (
    <details
      className="mb-4 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-page-panel)] px-4 py-2 text-sm text-[var(--color-ink-muted)]"
      data-testid="article-verification"
    >
      <summary className="cursor-pointer py-1">
        <span className="font-semibold text-[var(--color-ink-strong)]">{t.title}</span>
        {': '}
        {line(summarizeMarks(marks))}
      </summary>
      {groups.map((group) => (
        <div key={group.mazhab ?? ''} className="mt-2" data-testid="article-verification-group">
          <p className="m-0 text-xs font-semibold text-[var(--color-ink-strong)]">
            {scopeName(group.mazhab)}
            <span className="font-normal text-[var(--color-ink-subtle)]">{` — ${line(summarizeMarks(group.marks))}`}</span>
          </p>
          <ul className="m-0 mt-1 list-none p-0">
            {group.marks.map((mark, index) => (
              <li key={`${mark.scholarSlug ?? mark.scholarName ?? ''}-${index}`} className="py-0.5">
                {mark.scholarName && mark.scholarSlug ? (
                  <Link to={localize(authorHref(mark.scholarSlug))} className="text-[var(--color-brand-forest)] underline">
                    {mark.scholarName}
                  </Link>
                ) : (mark.scholarName ?? t.scholar)}
                {` — ${t.verdicts[mark.verdict]}, ${formatMessage(t.revision, { number: mark.revisionNumber })}, `}
                <time dateTime={new Date(mark.reviewedAt).toISOString()}>{format.date(mark.reviewedAt)}</time>
                {mark.isLatestRevision ? null : ` (${t.previousVersion})`}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  );
};
