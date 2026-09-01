import { createContext, useContext } from 'react';

export const MAZHAB_STORAGE_KEY = 'mktba.mazhab';

export type MazhabContextValue = {
  selectedSchoolId: number | null;
  setSelectedSchoolId: (id: number | null) => void;
};

export const MazhabContext = createContext<MazhabContextValue>({
  selectedSchoolId: null,
  setSelectedSchoolId: () => {},
});

export const useMazhab = () => useContext(MazhabContext);
