import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useLocale } from '../../localization/hooks';
import { getSchoolPalette, type SchoolPaletteKey } from '../mazhab/schoolPalette';

/** One switchable opinion inside a paragraph slot. */
export type OpinionTab = {
  /** Chip caption — always rendered, so colour is never the only signal. */
  shortLabel: string;
  /** Full caption for the block header and the chip's accessible name. */
  fullLabel: string;
  paletteKey: SchoolPaletteKey;
};

type VersionedParagraphBlockProps = {
  order: number;
  activeIndex: number;
  tabs: OpinionTab[];
  mode: 'arrows' | 'numbers';
  onSelect: (index: number) => void;
  onMove: (direction: -1 | 1) => void;
  /**
   * One panel per tab, in the same order. Every panel is rendered, also on the server, so the
   * page HTML carries the text of every opinion; only the active one is visible.
   */
  panels: ReactNode[];
};

const KEY_STEPS: Record<string, (index: number, total: number) => number> = {
  ArrowRight: (index, total) => (index + 1) % total,
  ArrowDown: (index, total) => (index + 1) % total,
  ArrowLeft: (index, total) => (index - 1 + total) % total,
  ArrowUp: (index, total) => (index - 1 + total) % total,
  Home: () => 0,
  End: (_index, total) => total - 1,
};

export const VersionedParagraphBlock = ({
  order,
  activeIndex,
  tabs,
  mode,
  onSelect,
  onMove,
  panels,
}: VersionedParagraphBlockProps) => {
  const locale = useLocale();
  const t = locale.versionedParagraph;
  const idPrefix = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isTabs = mode === 'numbers';
  const tabId = (index: number) => `${idPrefix}-tab-${index}`;
  const panelId = (index: number) => `${idPrefix}-panel-${index}`;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = KEY_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const nextIndex = step(index, tabs.length);
    onSelect(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  const activeTab = tabs[activeIndex] ?? tabs[0];
  const palette = getSchoolPalette(activeTab?.paletteKey ?? 'neutral');

  return (
    <section
      className="my-4 rounded-2xl border transition-colors duration-200"
      style={{ backgroundColor: palette.bg, borderColor: palette.border }}
    >
      <div className="px-4 pt-3 pb-2">
        <div className="mb-2 flex items-center gap-1.5">
          <BookOpen size={11} style={{ color: palette.accent }} />
          <span
            className="text-[10.5px] font-semibold tracking-[0.03em]"
            style={{ color: palette.accent }}
          >
            {activeTab?.fullLabel}
          </span>
        </div>

        <div className="text-[14.5px] leading-7 text-[var(--color-ink-strong)]">
          {panels.map((panel, index) => (
            <div
              key={`${order}-${index}`}
              id={panelId(index)}
              role={isTabs ? 'tabpanel' : undefined}
              aria-labelledby={isTabs ? tabId(index) : undefined}
              hidden={index !== activeIndex}
            >
              {panel}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5 px-3 pb-3 pt-1">
        <span className="mr-1 text-[10px] text-[var(--color-ink-subtle)]">{t.versions}</span>
        {!isTabs ? (
          <>
            <button
              type="button"
              onClick={() => onMove(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border bg-white transition-colors"
              style={{ borderColor: palette.border, color: palette.accent }}
              aria-label={t.previous}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-12 text-center text-[11px] font-semibold text-[var(--color-ink-muted)]">
              {activeTab?.shortLabel}
            </span>
            <button
              type="button"
              onClick={() => onMove(1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border bg-white transition-colors"
              style={{ borderColor: palette.border, color: palette.accent }}
              aria-label={t.next}
            >
              <ChevronRight size={14} />
            </button>
          </>
        ) : (
          <div role="tablist" aria-label={t.versions} className="flex flex-wrap justify-end gap-1.5">
            {tabs.map((tab, index) => {
              const isActive = index === activeIndex;
              const tabPalette = getSchoolPalette(tab.paletteKey);

              return (
                <button
                  key={`${order}-${index}`}
                  ref={(element) => {
                    tabRefs.current[index] = element;
                  }}
                  id={tabId(index)}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={panelId(index)}
                  tabIndex={isActive ? 0 : -1}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  aria-label={tab.fullLabel}
                  title={tab.fullLabel}
                  onClick={() => onSelect(index)}
                  className="rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors"
                  style={{
                    backgroundColor: isActive ? tabPalette.accent : 'white',
                    color: isActive ? 'white' : tabPalette.accent,
                    borderColor: isActive ? tabPalette.accent : tabPalette.border,
                  }}
                >
                  {tab.shortLabel}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
