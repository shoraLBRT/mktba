import { useState, type ReactNode } from 'react';
import { trackGoal } from '../analytics/metrika';
import { MazhabContext, MAZHAB_STORAGE_KEY } from './mazhabContext';

const getInitialSchoolId = (): number | null => {
  const saved = localStorage.getItem(MAZHAB_STORAGE_KEY);
  if (!saved) return null;
  const parsed = parseInt(saved, 10);
  return isNaN(parsed) ? null : parsed;
};

export const MazhabProvider = ({ children }: { children: ReactNode }) => {
  const [selectedSchoolId, setSelectedSchoolIdState] = useState<number | null>(getInitialSchoolId);

  const setSelectedSchoolId = (id: number | null) => {
    setSelectedSchoolIdState(id);
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
