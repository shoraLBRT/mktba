import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';

type VersionedParagraphBlockProps = {
  order: number;
  activeIndex: number;
  total: number;
  mode: 'arrows' | 'numbers';
  labels?: string[];
  onSelect: (index: number) => void;
  onMove: (direction: -1 | 1) => void;
  children: ReactNode;
};

export const VersionedParagraphBlock = ({
  order,
  activeIndex,
  total,
  mode,
  labels,
  onSelect,
  onMove,
  children,
}: VersionedParagraphBlockProps) => {
  const locale = useLocale();
  const t = locale.versionedParagraph;

  const getLabel = (index: number) => labels?.[index] ?? String(index + 1);

  return (
    <section className="my-4 rounded-2xl border border-[var(--color-mazhab-border)] bg-[var(--color-mazhab-bg)] transition-colors duration-200">
      <div className="px-4 pt-3 pb-2">
        <div className="mb-2 flex items-center gap-1.5">
          <BookOpen size={11} className="text-[var(--color-mazhab-accent)]" />
          <span className="text-[10.5px] font-semibold tracking-[0.03em] text-[var(--color-mazhab-accent)]">
            {formatMessage(t.label, { order })}
          </span>
        </div>

        <div className="text-[14.5px] leading-7 text-[var(--color-ink-strong)]">{children}</div>
      </div>

      <div className="flex items-center justify-end gap-1.5 px-3 pb-3 pt-1">
        <span className="mr-1 text-[10px] text-[var(--color-ink-subtle)]">{t.versions}</span>
        {mode === 'arrows' ? (
          <>
            <button
              type="button"
              onClick={() => onMove(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-mazhab-border)] bg-white text-[var(--color-mazhab-accent)] transition-colors hover:bg-[var(--color-mazhab-accent-soft)]"
              aria-label={t.previous}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-12 text-center text-[11px] font-semibold text-[var(--color-ink-muted)]">
              {getLabel(activeIndex)}
            </span>
            <button
              type="button"
              onClick={() => onMove(1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-mazhab-border)] bg-white text-[var(--color-mazhab-accent)] transition-colors hover:bg-[var(--color-mazhab-accent-soft)]"
              aria-label={t.next}
            >
              <ChevronRight size={14} />
            </button>
          </>
        ) : (
          Array.from({ length: total }, (_, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={`${order}-${index}`}
                type="button"
                onClick={() => onSelect(index)}
                className="rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors"
                style={{
                  backgroundColor: isActive ? 'var(--color-mazhab-accent)' : 'white',
                  color: isActive ? 'white' : 'var(--color-mazhab-accent)',
                  borderColor: isActive ? 'var(--color-mazhab-accent)' : 'var(--color-mazhab-border)',
                }}
              >
                {getLabel(index)}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
};
