import { ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '../../localization/hooks';

/** The button appears once the reader is this many pixels down the page. */
const SHOW_AFTER = 600;

/**
 * A floating «back to top» button for long articles. It is absent from the server HTML and
 * appears only after scrolling; the jump is instant for readers who asked for reduced motion.
 */
export const BackToTopButton = () => {
  const label = useLocale().articlePage.backToTop;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > SHOW_AFTER);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  if (!visible) return null;

  const scrollToTop = () => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label={label}
      title={label}
      className="fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-white text-[var(--color-ink-default)] shadow-lg transition-colors hover:bg-[var(--color-brand-forest-soft)] hover:text-[var(--color-brand-forest)] xl:right-[240px]"
    >
      <ArrowUp size={18} aria-hidden="true" />
    </button>
  );
};
