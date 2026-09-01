import { useState, useRef, useEffect } from 'react';
import { BookMarked, Check, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getSystemSchools } from '../../services/schoolService';
import { useMazhab } from '../../context/MazhabContext';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { useLocale } from '../../localization/hooks';

export const MazhabSelector = () => {
  const locale = useLocale();
  const t = locale.mazhabSelector;
  const [open, setOpen] = useState(false);
  const { selectedSchoolId, setSelectedSchoolId } = useMazhab();
  const ref = useRef<HTMLDivElement>(null);

  const { data: systemSchools = [] } = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS],
    queryFn: getSystemSchools,
  });

  const selectedSchool = systemSchools.find((s) => s.id === selectedSchoolId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSelect = (id: number | null) => {
    setSelectedSchoolId(id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="mb-1 min-w-[180px] rounded-2xl border border-[var(--color-border-soft)] bg-white py-2 shadow-lg">
          <p className="px-4 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-subtle)]">
            {t.title}
          </p>

          <button
            type="button"
            onClick={() => handleSelect(null)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] transition-colors hover:bg-[var(--color-surface-muted)]"
          >
            <span className={selectedSchoolId === null ? 'font-semibold text-[var(--color-brand-forest)]' : 'text-[var(--color-ink-muted)]'}>
              {t.noPreference}
            </span>
            {selectedSchoolId === null && (
              <Check size={12} className="ml-auto text-[var(--color-brand-forest)]" />
            )}
          </button>

          {systemSchools.map((school) => {
            const isActive = school.id === selectedSchoolId;
            return (
              <button
                key={school.id}
                type="button"
                onClick={() => handleSelect(school.id)}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[var(--color-surface-muted)]"
              >
                <span className="rounded bg-[var(--color-brand-forest-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-brand-forest)]">
                  {school.shortName}
                </span>
                <span className={`text-[13px] ${isActive ? 'font-semibold text-[var(--color-brand-forest)]' : 'text-[var(--color-ink-default)]'}`}>
                  {school.name}
                </span>
                {isActive && <Check size={12} className="ml-auto text-[var(--color-brand-forest)]" />}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border border-[#cfe3d6] bg-white px-3.5 py-2 text-[12px] font-semibold text-[var(--color-brand-forest)] shadow-md transition-colors hover:bg-[var(--color-brand-forest-soft)]"
      >
        <BookMarked size={14} />
        <span>{selectedSchool ? selectedSchool.shortName : t.placeholder}</span>
        {open && <X size={11} className="text-[var(--color-ink-muted)]" />}
      </button>
    </div>
  );
};
