import { useCallback } from 'react';
import { trackGoal, type MetrikaGoal } from './metrika';

export const useTrackEvent = () =>
  useCallback((goal: MetrikaGoal, params?: Record<string, unknown>) => {
    trackGoal(goal, params);
  }, []);
