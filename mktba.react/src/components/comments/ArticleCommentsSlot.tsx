import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLocale } from '../../localization/hooks';
import { Button } from '../../shared/ui/Button';

/** Shown when the comments' chunk does not load (offline, a new deploy): the article stays. */
const LoadFailed: React.FC = () => {
  const t = useLocale().articleComments;
  return <p role="alert" className="text-sm text-red-600">{t.loadError}</p>;
};

const ArticleComments = lazy(() =>
  import('./ArticleComments').catch(() => ({ default: LoadFailed as React.FC<{ articleId: number }> })),
);

/** How far below the screen the comments start loading. */
const LOAD_MARGIN = '600px 0px';

/**
 * The place of the comments under an article (C-01, #127). The server HTML holds only the heading
 * and a button: the comments themselves, their code and their requests come in the browser when
 * the reader scrolls near them or presses the button, so the article's first load stays as it was
 * and search engines never see comments as the article's text (C-06, #132).
 */
export const ArticleCommentsSlot: React.FC<{ articleId: number }> = ({ articleId }) => {
  const t = useLocale().articleComments;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (open || !node || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setOpen(true);
        }
      },
      { rootMargin: LOAD_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  return (
    <section ref={ref} id="comments" aria-labelledby="comments-title" className="mt-10 border-t border-[var(--color-border-soft)] pt-6 print:hidden!">
      <h2 id="comments-title" className="mb-3 text-xl font-semibold text-[var(--color-ink-strong)]">{t.title}</h2>
      {open ? (
        <Suspense fallback={<p role="status" className="text-sm text-[var(--color-ink-muted)]">{t.loading}</p>}>
          <ArticleComments articleId={articleId} />
        </Suspense>
      ) : (
        <Button onClick={() => setOpen(true)}>{t.show}</Button>
      )}
    </section>
  );
};
