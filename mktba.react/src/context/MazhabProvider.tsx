import { useState, type ReactNode } from 'react';
import { trackGoal } from '../analytics/metrika';
import { useHydrated } from '../shared/useHydrated';
import { MazhabContext, MAZHAB_STORAGE_KEY } from './mazhabContext';

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
 */
export const MazhabProvider = ({ children }: { children: ReactNode }) => {
  const hydrated = useHydrated();
  const [chosen, setChosen] = useState<{ schoolId: number | null } | null>(null);
  const selectedSchoolId = chosen ? chosen.schoolId : hydrated ? readSavedSchoolId() : null;

  const setSelectedSchoolId = (id: number | null) => {
    setChosen({ schoolId: id });
    if (id === null) {
      localStorage.removeItem(MAZHAB_STORAGE_KEY);
    } else {
      localStorage.setItem(MAZHAB_STORAGE_KEY, String(id));
    }
    trackGoal('mazhab_change', { schoolId: id });
  };

  return (
    <MazhabContext.Provider value={{ selectedSchoolId, setSelectedSchoolId }}>
      {children}
    </MazhabContext.Provider>
  );
};
