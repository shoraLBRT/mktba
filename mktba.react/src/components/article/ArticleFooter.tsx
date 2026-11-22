import { Fragment } from 'react';
import { ArrowLeft, ArrowRight, Flag, Printer } from 'lucide-react';
import { Link } from 'react-router';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import { paragraphAnchorId } from '../../shared/articleOutline';
import type { CitedSource } from '../../shared/articleSources';
import { articleHref } from '../../shared/slug';

/** An article the bottom of the page leads to. */
export type FooterArticle = {
  id: number;
  slug: string;
  title: string;
};

/** A child of the open article in the tree. */
export type FooterChildArticle = FooterArticle & {
  /** False for a stub: it has no page worth opening, so its title is shown without a link. */
  hasContent: boolean;
};

type ArticleFooterProps = {
  /** The sources the article cites (`collectCitedSources`), in the order of first citation. */
  sources: CitedSource[];
  /** The open article's direct children in the navigation tree, in tree order. */
  childArticles: FooterChildArticle[];
  /** The articles the editor linked as related, in the editor's order. */
  relatedArticles: FooterArticle[];
  /** The nearest article with content before the open one in the tree, if any. */
  previous: FooterArticle | null;
  /** The nearest article with content after the open one in the tree, if any. */
  next: FooterArticle | null;
  /** The feedback form opened for this article (`feedbackHref`): «сообщить об ошибке». */
  errorReportHref: string;
};

const headingClass = 'mb-3 mt-0 text-[17px] font-semibold tracking-[-0.01em] text-[var(--color-ink-strong)]';
const listClass = 'm-0 grid list-none gap-x-6 gap-y-1.5 p-0 text-[14px] sm:grid-cols-2';
const linkClass = 'text-[var(--color-brand-forest)] [overflow-wrap:anywhere] hover:underline';
const adjacentClass =
  'flex min-w-0 flex-col gap-1 rounded-2xl border border-[var(--color-border-soft)] px-4 py-3 no-underline transition-colors hover:border-[var(--color-brand-forest)] hover:bg-[var(--color-brand-forest-soft)]';
const adjacentCaptionClass = 'flex items-center gap-1 text-[12px] text-[var(--color-ink-muted)]';
const adjacentTitleClass = 'text-[14px] font-medium text-[var(--color-brand-forest)] [overflow-wrap:anywhere]';

/**
 * The bottom of the article: the sources it cites, its child articles, the related articles and the
 * previous / next article by the tree, then the link to report an error in the article. A block
 * with nothing to show is left out; the error report is always there. Each source lists the places
 * it is cited from as links back to those paragraphs. Beside the error report, a button opens the
 * browser's print dialog (R-19); the print version itself is CSS (`index.css`), and on paper only the
 * sources remain of this block.
 * The related block repeats the right sidebar's one, which only wide screens have, so it is
 * hidden from `xl` up.
 */
export const ArticleFooter = ({ sources, childArticles, relatedArticles, previous, next, errorReportHref }: ArticleFooterProps) => {
  const t = useLocale().articlePage;
  const hasSources = sources.length > 0;
  const hasChildren = childArticles.length > 0;
  const hasRelated = relatedArticles.length > 0;
  const hasAdjacent = previous !== null || next !== null;

  return (
    <footer
      className="mt-10 space-y-8 border-t border-[var(--color-border-soft)] pt-8"
      data-testid="article-footer"
    >
      {hasSources && (
        <section aria-labelledby="article-sources-title" data-testid="article-sources">
          <h2 id="article-sources-title" className={headingClass}>{t.sources}</h2>
          <ol className="m-0 list-decimal space-y-1.5 ps-5 text-[14px] leading-6 text-[var(--color-ink-default)]">
            {sources.map(({ source, citations }) => (
              <li key={source.id} className="[overflow-wrap:anywhere]">
                {source.author ? formatMessage(t.sourceAuthor, { author: source.author }) : null}
                {source.url
                  ? <a href={source.url} target="_blank" rel="noopener noreferrer" className={linkClass}><cite className="not-italic">{source.title}</cite></a>
                  : <cite className="not-italic font-medium text-[var(--color-ink-strong)]">{source.title}</cite>}
                {source.details ? <span className="text-[var(--color-ink-muted)]">{formatMessage(t.sourceDetails, { details: source.details })}</span> : null}
                <span className="text-[var(--color-ink-muted)]">{t.sourceCitationsSeparator}</span>
                {citations.map((citation, index) => (
                  <Fragment key={`${citation.paragraphId}:${citation.locator ?? ''}`}>
                    {index > 0 ? t.sourceCitationsDivider : null}
                    <a
                      href={`#${paragraphAnchorId(citation.paragraphId)}`}
                      title={t.sourceCitationLink}
                      className={linkClass}
                    >
                      {citation.locator ?? t.sourceCitedInText}
                    </a>
                  </Fragment>
                ))}
              </li>
            ))}
          </ol>
        </section>
      )}

      {hasChildren && (
        <nav aria-labelledby="article-children-title" className="print:hidden" data-testid="article-children">
          <h2 id="article-children-title" className={headingClass}>{t.childArticles}</h2>
          <ul className={listClass}>
            {childArticles.map((child) => (
              <li key={child.id} className={child.hasContent ? undefined : 'text-[var(--color-ink-muted)] [overflow-wrap:anywhere]'}>
                {child.hasContent
                  ? <Link to={articleHref(child.slug)} className={linkClass}>{child.title}</Link>
                  : child.title}
              </li>
            ))}
          </ul>
        </nav>
      )}

      {hasRelated && (
        <nav aria-labelledby="article-related-title" className="xl:hidden print:hidden" data-testid="article-related">
          <h2 id="article-related-title" className={headingClass}>{t.relatedArticles}</h2>
          <ul className={listClass}>
            {relatedArticles.map((related) => (
              <li key={related.id}>
                <Link to={articleHref(related.slug)} className={linkClass}>{related.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {hasAdjacent && (
        <nav aria-label={t.adjacentArticles} className="grid gap-3 sm:grid-cols-2 print:hidden" data-testid="article-adjacent">
          {previous && (
            <Link to={articleHref(previous.slug)} rel="prev" className={adjacentClass}>
              <span className={adjacentCaptionClass}>
                <ArrowLeft size={12} aria-hidden="true" className="rtl:-scale-x-100" />
                {t.previousArticle}
              </span>
              {' '}
              <span className={adjacentTitleClass}>{previous.title}</span>
            </Link>
          )}
          {next && (
            <Link
              to={articleHref(next.slug)}
              rel="next"
              className={`${adjacentClass} sm:col-start-2 sm:items-end sm:text-end`}
            >
              <span className={adjacentCaptionClass}>
                {t.nextArticle}
                <ArrowRight size={12} aria-hidden="true" className="rtl:-scale-x-100" />
              </span>
              {' '}
              <span className={adjacentTitleClass}>{next.title}</span>
            </Link>
          )}
        </nav>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 print:hidden">
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-[var(--color-ink-muted)]" data-testid="article-report-error">
          {t.reportErrorPrompt}
          {' '}
          <Link to={errorReportHref} className={`inline-flex items-center gap-1.5 ${linkClass}`}>
            <Flag size={13} aria-hidden="true" />
            {t.reportError}
          </Link>
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-soft)] px-3 py-1.5 text-[13px] text-[var(--color-ink-default)] transition-colors hover:border-[var(--color-brand-forest)] hover:text-[var(--color-brand-forest)]"
        >
          <Printer size={13} aria-hidden="true" />
          {t.print}
        </button>
      </div>
    </footer>
  );
};
