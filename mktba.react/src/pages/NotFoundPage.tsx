import React from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../localization/hooks';

/** Shown for an unknown route and for an article the API does not have. */
const NotFoundPage: React.FC = () => {
  const locale = useLocale();

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-[var(--color-border-soft)] bg-white px-8 py-10 text-center shadow-sm">
        <p className="m-0 text-5xl font-bold tracking-[-0.03em] text-[var(--color-brand-forest)]">404</p>
        <h1 className="mb-0 mt-3 text-2xl font-semibold text-[var(--color-ink-strong)]">{locale.notFoundPage.title}</h1>
        <p className="mb-0 mt-3 text-base leading-7 text-[var(--color-ink-muted)]">{locale.notFoundPage.message}</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-xl border border-[var(--color-brand-forest)] bg-[var(--color-brand-forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-forest-strong)]"
        >
          {locale.notFoundPage.homeLink}
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;
