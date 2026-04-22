import { createContext, useContext, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'mktba.mazhab';

const getInitialSchoolId = (): number | null => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  const parsed = parseInt(saved, 10);
  return isNaN(parsed) ? null : parsed;
};

type MazhabContextValue = {
  selectedSchoolId: number | null;
  setSelectedSchoolId: (id: number | null) => void;
};

const MazhabContext = createContext<MazhabContextValue>({
  selectedSchoolId: null,
  setSelectedSchoolId: () => {},
});

export const MazhabProvider = ({ children }: { children: ReactNode }) => {
  const [selectedSchoolId, setSelectedSchoolIdState] = useState<number | null>(getInitialSchoolId);

  const setSelectedSchoolId = (id: number | null) => {
    setSelectedSchoolIdState(id);
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  };

  return (
    <MazhabContext.Provider value={{ selectedSchoolId, setSelectedSchoolId }}>
      {children}
    </MazhabContext.Provider>
  );
};

export const useMazhab = () => useContext(MazhabContext);
