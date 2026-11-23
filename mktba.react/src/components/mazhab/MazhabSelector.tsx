import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, ChevronUp, Info, Link2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getSystemSchools } from '../../services/schoolService';
import { MAZHAB_LINK_PARAM, useMazhab } from '../../context/mazhabContext';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';
import { useHydrated } from '../../shared/useHydrated';
import { getPaletteForSchool } from './schoolPalette';

export const MAZHAB_HINT_STORAGE_KEY = 'mktba.mazhabHintSeen';

// From `md` up the picker is in the header and the panel opens under it; below `md` it is in the bar at
// the bottom of the screen (`MainLayout`) and the panel opens above the bar.
const PANEL_POSITION =
  'fixed inset-e-3 bottom-[calc(var(--layout-bottom-bar-height)+env(safe-area-inset-bottom)+0.5rem)] z-50 md:bottom-auto md:top-[calc(var(--layout-header-height)+0.5rem)]';

const readHintSeen = (): boolean => {
  try {
    return localStorage.getItem(MAZHAB_HINT_STORAGE_KEY) !== null;
  } catch {
    return true;
  }
};

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * The mazhab picker of the public layout: a button with the current choice and a panel by it — in the
 * header from `md` up, in the bottom bar on phones.
 * A reader who has not chosen a mazhab and has not seen the hint yet gets a short note under the
 * button; it does not block the page and goes away for good when closed or when the picker is
 * opened. With a mazhab chosen, the panel offers a link to the current page that opens with it.
 */
export const MazhabSelector = () => {
  const locale = useLocale();
  const t = locale.mazhabSelector;
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const { selectedSchoolId, setSelectedSchoolId } = useMazhab();
  const ref = useRef<HTMLDivElement>(null);

  const { data: systemSchools = [] } = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS],
    queryFn: getSystemSchools,
  });

  const selectedSchool = systemSchools.find((school) => school.id === selectedSchoolId);
  const indicatorColor = selectedSchool
    ? getPaletteForSchool(selectedSchool).accent
    : 'var(--color-ink-subtle)';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (aboutOpen) {
        setAboutOpen(false);
        return;
      }
      setOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [aboutOpen]);

  const hintVisible = hydrated && !open && !hintDismissed && selectedSchoolId === null && !readHintSeen();

  const dismissHint = () => {
    setHintDismissed(true);
    try {
      localStorage.setItem(MAZHAB_HINT_STORAGE_KEY, '1');
    } catch {
      // Storage is unavailable: the hint stays closed for this visit only.
    }
  };

  const toggleOpen = () => {
    dismissHint();
    setCopyState('idle');
    setOpen((prev) => !prev);
  };

  const handleSelect = (id: number | null) => {
    setSelectedSchoolId(id);
    setOpen(false);
  };

  const handleCopyLink = async (slug: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set(MAZHAB_LINK_PARAM, slug);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const schoolDescriptions = t.descriptions as Record<string, string | undefined>;

  return (
    <>
      <div ref={ref} className="flex items-center">
        {open && (
          <div className={`${PANEL_POSITION} w-[min(17.5rem,calc(100vw-1.5rem))] rounded-2xl border border-[var(--color-border-soft)] bg-white p-3 shadow-lg`}>
            <p className="mb-2 text-[11px] font-semibold text-[var(--color-ink-muted)]">{t.title}</p>

            <div className="grid grid-cols-2 gap-2">
              {systemSchools.map((school) => {
                const palette = getPaletteForSchool(school);
                const isActive = school.id === selectedSchoolId;

                return (
                  <button
                    key={school.id}
                    type="button"
                    onClick={() => handleSelect(school.id)}
                    aria-pressed={isActive}
                    className="relative rounded-xl border px-2.5 py-2 text-start transition-colors"
                    style={{
                      backgroundColor: palette.bg,
                      borderColor: isActive ? palette.accent : palette.border,
                    }}
                  >
                    {isActive && (
                      <Check
                        size={11}
                        className="absolute inset-e-1.5 top-1.5"
                        style={{ color: palette.accent }}
                      />
                    )}
                    <span
                      className="block text-[13px] font-bold leading-none"
                      style={{ color: palette.accent }}
                    >
                      {school.shortName}
                    </span>
                    <span className="mt-1 block text-[10px] leading-tight text-[var(--color-ink-muted)]">
                      {school.name}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => handleSelect(null)}
              className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-start text-[11.5px] transition-colors hover:bg-[var(--color-surface-muted)]"
              aria-pressed={selectedSchoolId === null}
            >
              <span
                className={
                  selectedSchoolId === null
                    ? 'font-semibold text-[var(--color-ink-default)]'
                    : 'text-[var(--color-ink-muted)]'
                }
              >
                {t.noPreference}
              </span>
              {selectedSchoolId === null && (
                <Check size={11} className="ms-auto text-[var(--color-ink-muted)]" />
              )}
            </button>

            {selectedSchool && (
              <div className="mt-1 border-t border-[var(--color-border-soft)] pt-1">
                <button
                  type="button"
                  onClick={() => void handleCopyLink(selectedSchool.slug)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-start text-[11.5px] text-[var(--color-ink-default)] transition-colors hover:bg-[var(--color-surface-muted)]"
                >
                  <Link2 size={12} className="shrink-0 text-[var(--color-ink-muted)]" />
                  {t.copyLink}
                </button>
                <p role="status" className="m-0 px-2 text-[11px] leading-4 text-[var(--color-ink-muted)]">
                  {copyState === 'copied' ? t.linkCopied : copyState === 'failed' ? t.linkCopyFailed : null}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="mt-1 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-[var(--color-brand-forest)] transition-colors hover:underline"
            >
              <Info size={12} />
              {t.about}
            </button>
          </div>
        )}

        {hintVisible && (
          <div
            role="note"
            className={`${PANEL_POSITION} flex w-[min(16rem,calc(100vw-1.5rem))] items-start gap-2 rounded-xl border border-[var(--color-border-soft)] bg-white p-2.5 shadow-md`}
          >
            <p className="m-0 flex-1 text-[11.5px] leading-4 text-[var(--color-ink-default)]">{t.hint}</p>
            <button
              type="button"
              onClick={dismissHint}
              aria-label={t.hintClose}
              className="-me-1 -mt-1 shrink-0 rounded-lg p-1 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-muted)]"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          className="flex min-h-8 max-w-[min(15rem,calc(100vw-7rem))] items-center gap-2 rounded-full border border-[var(--color-border-soft)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--color-ink-default)] transition-colors hover:bg-[var(--color-surface-muted)] sm:max-w-[15rem]"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: indicatorColor }}
            aria-hidden="true"
          />
          <span className="truncate">{selectedSchool ? selectedSchool.name : t.placeholder}</span>
          {open ? (
            <ChevronUp size={13} className="shrink-0 max-md:rotate-180 text-[var(--color-ink-muted)]" />
          ) : (
            <ChevronDown size={13} className="shrink-0 max-md:rotate-180 text-[var(--color-ink-muted)]" />
          )}
        </button>
      </div>

      {aboutOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30 p-4 sm:items-center"
          onClick={() => setAboutOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.about}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[75vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-[var(--color-border-soft)] bg-white p-4 shadow-xl"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <h2 className="text-[14px] font-semibold text-[var(--color-ink-strong)]">{t.about}</h2>
              <button
                type="button"
                onClick={() => setAboutOpen(false)}
                aria-label={t.close}
                className="rounded-lg p-1 text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-muted)]"
              >
                <X size={14} />
              </button>
            </div>

            <p className="mb-3 text-[12px] leading-5 text-[var(--color-ink-muted)]">{t.aboutIntro}</p>

            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {systemSchools.map((school) => {
                const palette = getPaletteForSchool(school);

                return (
                  <li key={school.id} className="border-s-2 ps-2.5" style={{ borderColor: palette.accent }}>
                    <p className="m-0 text-[12px] font-semibold" style={{ color: palette.accent }}>
                      {school.name} ({school.shortName})
                    </p>
                    <p className="m-0 mt-1 text-[12px] leading-5 text-[var(--color-ink-default)]">
                      {schoolDescriptions[school.slug]}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
};
