import { Link } from 'react-router';
import { useLocale } from '../localization/hooks';
import { Button } from '../shared/ui/Button';

/** What `ErrorBoundary` shows instead of a page that failed to render. */
export const ErrorFallback = () => {
  const locale = useLocale();

  return (
    <div role="alert" className="flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-red-200 bg-red-50 px-8 py-10 text-center shadow-sm">
        <h1 className="m-0 text-2xl font-semibold text-red-700">{locale.errorPage.title}</h1>
        <p className="mb-0 mt-3 text-base leading-7 text-red-600">{locale.errorPage.message}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}>
            {locale.errorPage.reload}
          </Button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border-soft)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink-default)] hover:bg-[var(--color-surface-muted)]"
          >
            {locale.errorPage.homeLink}
          </Link>
        </div>
      </div>
    </div>
  );
};
