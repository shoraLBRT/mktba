import { createContext, useContext } from 'react';

export const MAZHAB_STORAGE_KEY = 'mktba.mazhab';

/** Query parameter of a shared link: the slug of a canonical school, e.g. `?mazhab=shafii`. */
export const MAZHAB_LINK_PARAM = 'mazhab';

export type MazhabContextValue = {
  selectedSchoolId: number | null;
  setSelectedSchoolId: (id: number | null) => void;
};

export const MazhabContext = createContext<MazhabContextValue>({
  selectedSchoolId: null,
  setSelectedSchoolId: () => {},
});

export const useMazhab = () => useContext(MazhabContext);
