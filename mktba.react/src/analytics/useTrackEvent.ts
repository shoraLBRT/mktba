import { useCallback } from 'react';
import { trackGoal } from './metrika';

export const useTrackEvent = () =>
  useCallback((goal: string, params?: Record<string, unknown>) => {
    trackGoal(goal, params);
  }, []);
