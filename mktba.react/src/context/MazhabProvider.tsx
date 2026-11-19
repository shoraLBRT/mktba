import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { trackGoal } from '../analytics/metrika';
import { APP_CONSTANTS } from '../constants/AppConstants';
import { getSystemSchools } from '../services/schoolService';
import { useHydrated } from '../shared/useHydrated';
import { MazhabContext, MAZHAB_LINK_PARAM, MAZHAB_STORAGE_KEY } from './mazhabContext';

const readSavedSchoolId = (): number | null => {
  try {
    const saved = localStorage.getItem(MAZHAB_STORAGE_KEY);
    if (!saved) return null;
    const parsed = parseInt(saved, 10);
    return isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
};

/**
 * The reader's mazhab. The server and the hydrating browser render without one (default
 * opinions); the saved choice applies right after hydration.
 *
 * A shared link (`?mazhab=<school slug>`) wins over the saved choice while the parameter is in
 * the URL and never overwrites it: the reader sees what the sender saw, and their own mazhab is
 * back on the next page. Choosing a mazhab by hand saves it and drops the parameter. An unknown
 * slug is ignored.
 */
export const MazhabProvider = ({ children }: { children: ReactNode }) => {
  const hydrated = useHydrated();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedSlug = searchParams.get(MAZHAB_LINK_PARAM);
  const [chosen, setChosen] = useState<{ schoolId: number | null } | null>(null);

  // A key of its own: an observer on the shared system-schools key, mounted above the public layout,
  // would create that query before the layout's HydrationBoundary sees it, and the boundary then puts
  // off the server's data to an effect — the server HTML and the first client render would lose the
  // schools.
  const { data: systemSchools } = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS, 'mazhab-link'],
    queryFn: getSystemSchools,
    enabled: linkedSlug !== null,
    staleTime: Infinity,
  });
  const linkedSchoolId = linkedSlug === null
    ? null
    : systemSchools?.find((school) => school.slug === linkedSlug)?.id ?? null;

  const ownSchoolId = chosen ? chosen.schoolId : hydrated ? readSavedSchoolId() : null;
  const selectedSchoolId = hydrated && linkedSchoolId !== null ? linkedSchoolId : ownSchoolId;

  const setSelectedSchoolId = (id: number | null) => {
    setChosen({ schoolId: id });
    if (id === null) {
      localStorage.removeItem(MAZHAB_STORAGE_KEY);
    } else {
      localStorage.setItem(MAZHAB_STORAGE_KEY, String(id));
    }
    if (linkedSlug !== null) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete(MAZHAB_LINK_PARAM);
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    }
    trackGoal('mazhab_change', { schoolId: id });
  };

  return (
    <MazhabContext.Provider value={{ selectedSchoolId, setSelectedSchoolId }}>
      {children}
    </MazhabContext.Provider>
  );
};
