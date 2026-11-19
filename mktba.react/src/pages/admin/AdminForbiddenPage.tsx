import React from 'react';
import { Link } from 'react-router';
import { useLocale } from '../../localization/hooks';

/** Shown for an admin URL the signed-in role may not open. The API refuses the data anyway. */
const AdminForbiddenPage: React.FC = () => {
  const t = useLocale().adminLayout;

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="w-full max-w-xl rounded-3xl border border-[var(--color-border-soft)] bg-white px-8 py-10 text-center shadow-sm">
        <p className="m-0 text-5xl font-bold tracking-[-0.03em] text-[var(--color-brand-forest)]">403</p>
        <h1 className="mb-0 mt-3 text-2xl font-semibold text-[var(--color-ink-strong)]">{t.forbiddenTitle}</h1>
        <p className="mb-0 mt-3 text-base leading-7 text-[var(--color-ink-muted)]">{t.forbiddenMessage}</p>
        <Link
          to="/admin"
          className="mt-6 inline-flex items-center justify-center rounded-xl border border-[var(--color-brand-forest)] bg-[var(--color-brand-forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-forest-strong)]"
        >
          {t.forbiddenLink}
        </Link>
      </div>
    </div>
  );
};

export default AdminForbiddenPage;
