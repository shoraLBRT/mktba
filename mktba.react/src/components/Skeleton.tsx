import type { ReactNode } from 'react';
import { useLocale } from '../localization/hooks';

/** A grey placeholder bar in the shape of content that is still loading; hidden from assistive technology. */
export const SkeletonBar = ({ className = '' }: { className?: string }) => (
  <div
    aria-hidden="true"
    className={`animate-pulse rounded bg-[var(--color-border-soft)] motion-reduce:animate-none ${className}`}
  />
);

/**
 * Wraps placeholder bars: screen readers hear «Загрузка…» once instead of the bars, and the
 * region is replaced by the content when it arrives.
 */
export const LoadingPlaceholder = ({ className = '', children }: { className?: string; children: ReactNode }) => {
  const locale = useLocale();
  return (
    <div role="status" className={className}>
      <span className="sr-only">{locale.common.loading}</span>
      {children}
    </div>
  );
};

/** Widths and depths of the rows of a navigation tree that is still loading. */
const TREE_ROWS: ReadonlyArray<{ width: string; nested: boolean }> = [
  { width: 'w-3/4', nested: false },
  { width: 'w-2/3', nested: true },
  { width: 'w-1/2', nested: true },
  { width: 'w-4/5', nested: false },
  { width: 'w-3/5', nested: true },
  { width: 'w-2/3', nested: false },
  { width: 'w-1/2', nested: false },
];

/** The navigation tree's place while it loads (the sidebar after a client-side start, the admin tree). */
export const NavigationTreeSkeleton = () => (
  <LoadingPlaceholder className="space-y-2.5 px-2 py-1">
    {TREE_ROWS.map((row, index) => (
      <SkeletonBar key={index} className={`h-4 ${row.width} ${row.nested ? 'ml-5' : ''}`} />
    ))}
  </LoadingPlaceholder>
);
