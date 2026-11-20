/**
 * The keys of a WAI-ARIA tab list with automatic activation: each maps the index of the focused
 * tab and the number of tabs to the index of the tab the key moves to (wrapping around).
 */
export const TAB_KEY_STEPS: Record<string, (index: number, total: number) => number> = {
  ArrowRight: (index, total) => (index + 1) % total,
  ArrowDown: (index, total) => (index + 1) % total,
  ArrowLeft: (index, total) => (index - 1 + total) % total,
  ArrowUp: (index, total) => (index - 1 + total) % total,
  Home: () => 0,
  End: (_index, total) => total - 1,
};
