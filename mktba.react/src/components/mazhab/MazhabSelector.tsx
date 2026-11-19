import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, ChevronUp, Info, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getSystemSchools } from '../../services/schoolService';
import { useMazhab } from '../../context/mazhabContext';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';
import { getPaletteForSchool } from './schoolPalette';

export const MazhabSelector = () => {
  const locale = useLocale();
  const t = locale.mazhabSelector;
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
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

  const handleSelect = (id: number | null) => {
    setSelectedSchoolId(id);
    setOpen(false);
  };

  const schoolDescriptions = t.descriptions as Record<string, string | undefined>;

  return (
    <>
      <div ref={ref} className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        {open && (
          <div className="mb-1 w-[min(17.5rem,calc(100vw-2.5rem))] rounded-2xl border border-[var(--color-border-soft)] bg-white p-3 shadow-lg">
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
                    className="relative rounded-xl border px-2.5 py-2 text-left transition-colors"
                    style={{
                      backgroundColor: palette.bg,
                      borderColor: isActive ? palette.accent : palette.border,
                    }}
                  >
                    {isActive && (
                      <Check
                        size={11}
                        className="absolute right-1.5 top-1.5"
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
              className="mt-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11.5px] transition-colors hover:bg-[var(--color-surface-muted)]"
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
                <Check size={11} className="ml-auto text-[var(--color-ink-muted)]" />
              )}
            </button>

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

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="flex max-w-[min(15rem,calc(100vw-2.5rem))] items-center gap-2 rounded-full border border-[var(--color-border-soft)] bg-white px-3.5 py-2 text-[12px] font-semibold text-[var(--color-ink-default)] shadow-md transition-colors hover:bg-[var(--color-surface-muted)]"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: indicatorColor }}
            aria-hidden="true"
          />
          <span className="truncate">{selectedSchool ? selectedSchool.name : t.placeholder}</span>
          {open ? (
            <ChevronDown size={13} className="shrink-0 text-[var(--color-ink-muted)]" />
          ) : (
            <ChevronUp size={13} className="shrink-0 text-[var(--color-ink-muted)]" />
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
                  <li key={school.id} className="border-l-2 pl-2.5" style={{ borderColor: palette.accent }}>
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
