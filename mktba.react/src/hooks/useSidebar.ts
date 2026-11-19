import { useState } from 'react';
import { useHydrated } from '../shared/useHydrated';

const SIDEBAR_COLLAPSE_STORAGE_KEY = 'sidebarCollapsed';

const readSavedCollapsed = (): boolean | null => {
  try {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
    return saved === null ? null : saved === 'true';
  } catch {
    return null;
  }
};

/** Whether the sidebar is collapsed; the saved state applies after hydration (the server renders the default). */
export const useSidebar = (defaultCollapsed = false) => {
  const hydrated = useHydrated();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const collapsed = chosen ?? (hydrated ? readSavedCollapsed() : null) ?? defaultCollapsed;

  const setCollapsed = (next: boolean) => {
    setChosen(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, String(next));
    } catch {
      // Storage blocked: the choice lasts until the page is reloaded.
    }
  };

  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
  };

  return {
    collapsed,
    toggleCollapsed,
    setCollapsed,
  };
};
