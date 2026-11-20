import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, type Blocker, type BlockerFunction } from 'react-router';

export type UnsavedChangesGuard = {
  /** `blocked` while a navigation waits for the user: `proceed()` leaves, `reset()` stays. */
  blocker: Blocker;
  /**
   * Lets the next navigation through without asking — for the page's own navigation after a
   * successful save or delete, which happens before the new baseline reaches a render.
   */
  allowLeaving: () => void;
};

/**
 * Keeps unsaved edits from being lost (E-03, #76): while `hasUnsavedChanges` is true, a navigation
 * inside the app to another path is held for the page to confirm (`blocker`), and closing or
 * reloading the tab asks the browser's own question (`beforeunload`). A change of only the query
 * or the hash stays on the page and is let through.
 */
export const useUnsavedChangesGuard = (hasUnsavedChanges: boolean): UnsavedChangesGuard => {
  const guardRef = useRef(hasUnsavedChanges);
  useEffect(() => {
    guardRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => guardRef.current && currentLocation.pathname !== nextLocation.pathname,
    [],
  );
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return undefined;
    }

    const warn = (event: BeforeUnloadEvent) => {
      if (!guardRef.current) {
        return;
      }
      event.preventDefault();
      // Older browsers ask only when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  const allowLeaving = useCallback(() => {
    guardRef.current = false;
  }, []);

  return { blocker, allowLeaving };
};
