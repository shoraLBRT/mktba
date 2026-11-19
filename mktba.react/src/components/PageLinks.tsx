import { Link } from 'react-router';
import { useLocale } from '../localization/hooks';

type PageLinksProps = {
  /** Names the navigation for assistive technology: what the pages are of. */
  label: string;
  /** The page shown, from 1; one past the end is shown as the last. */
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
};

/** «Назад / Страница N из M / Вперёд» under a paged list; nothing for a single page. */
export const PageLinks = ({ label, page, pageCount, hrefFor }: PageLinksProps) => {
  const t = useLocale().search.pagination;
  const linkClass = 'text-[var(--color-brand-forest)] underline-offset-2 hover:underline';
  const current = Math.min(page, pageCount);

  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-4 text-sm">
      {page > 1 ? (
        <Link to={hrefFor(Math.min(page - 1, pageCount))} rel="prev" className={linkClass}>
          {t.previous}
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      <span className="text-[var(--color-ink-muted)]">
        {t.position.replace('{page}', String(current)).replace('{pages}', String(pageCount))}
      </span>
      {page < pageCount ? (
        <Link to={hrefFor(page + 1)} rel="next" className={linkClass}>
          {t.next}
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
};
