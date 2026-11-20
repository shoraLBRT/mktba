import { BookOpen, Info } from 'lucide-react';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useLocale } from '../../localization/hooks';
import { getSchoolPalette, type SchoolPaletteKey } from '../mazhab/schoolPalette';
import { TAB_KEY_STEPS } from '../../shared/tabKeys';

/** One switchable opinion inside a paragraph slot. */
export type OpinionTab = {
  /** Tab text naming the opinion's schools; it is also the tab's accessible name. */
  label: string;
  /** Caption above the opinion's text while its tab is active. */
  heading: string;
  paletteKey: SchoolPaletteKey;
  /** The opinion belongs to the reader's chosen mazhab. */
  isReaderSchool: boolean;
};

type VersionedParagraphBlockProps = {
  activeIndex: number;
  tabs: OpinionTab[];
  onSelect: (index: number) => void;
  /** Shown above the text, e.g. when the reader's mazhab has no opinion of its own here. */
  note?: string | null;
  /**
   * One panel per tab, in the same order. Every panel is rendered, also on the server, so the
   * page HTML carries the text of every opinion; only the active one is visible.
   */
  panels: ReactNode[];
};

export const VersionedParagraphBlock = ({
  activeIndex,
  tabs,
  onSelect,
  note,
  panels,
}: VersionedParagraphBlockProps) => {
  const locale = useLocale();
  const t = locale.versionedParagraph;
  const idPrefix = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabId = (index: number) => `${idPrefix}-tab-${index}`;
  const panelId = (index: number) => `${idPrefix}-panel-${index}`;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = TAB_KEY_STEPS[event.key];
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
      className="my-4 flow-root min-w-0 rounded-2xl border transition-colors duration-200"
      style={{ backgroundColor: palette.bg, borderColor: palette.border }}
    >
      <div className="px-4 pt-3 pb-2">
        <div className="mb-2 flex items-center gap-1.5">
          <BookOpen size={11} aria-hidden="true" style={{ color: palette.accent }} />
          <span
            className="text-[10.5px] font-semibold tracking-[0.03em]"
            style={{ color: palette.accent }}
          >
            {activeTab?.heading}
          </span>
        </div>

        {note ? (
          <p className="mb-2 flex items-start gap-1.5 text-[12px] leading-5 text-[var(--color-ink-muted)]">
            <Info size={13} aria-hidden="true" className="mt-[3px] shrink-0" />
            <span>{note}</span>
          </p>
        ) : null}

        <div className="text-[14.5px] leading-7 text-[var(--color-ink-strong)]">
          {panels.map((panel, index) => (
            <div
              key={index}
              id={panelId(index)}
              role="tabpanel"
              aria-labelledby={tabId(index)}
              hidden={index !== activeIndex}
            >
              {panel}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 px-3 pb-3 pt-1">
        <span className="shrink-0 text-[10px] text-[var(--color-ink-subtle)]">{t.versions}</span>
        <div role="tablist" aria-label={t.versions} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [contain:inline-size] [scrollbar-width:none]">
          {tabs.map((tab, index) => {
            const isActive = index === activeIndex;
            const tabPalette = getSchoolPalette(tab.paletteKey);

            return (
              <button
                key={index}
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
                onClick={() => onSelect(index)}
                className={`${index === 0 ? 'ml-auto ' : ''}flex shrink-0 items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold transition-colors`}
                style={{
                  backgroundColor: isActive ? tabPalette.accent : 'var(--color-surface)',
                  color: isActive ? 'var(--color-surface)' : tabPalette.accent,
                  borderColor: isActive ? tabPalette.accent : tabPalette.border,
                }}
              >
                {tab.isReaderSchool ? (
                  <span
                    aria-hidden="true"
                    data-reader-school=""
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: isActive ? 'var(--color-surface)' : tabPalette.accent }}
                  />
                ) : null}
                {tab.label}
                {tab.isReaderSchool ? <span className="sr-only">{t.readerSchool}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
