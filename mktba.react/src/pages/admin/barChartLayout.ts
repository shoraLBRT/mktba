export const AXIS_WIDTH = 28;
export const PLOT_TOP = 8;
export const PLOT_HEIGHT = 120;
const LABEL_HEIGHT = 20;

export type BarChartGeometry = {
  /** Width of one bar. */
  barWidth?: number;
  /** Space between the bars of one group. */
  barGap?: number;
  /** Space between two groups. */
  groupGap?: number;
};

/**
 * The SVG geometry of a grouped bar chart (P-04 #92, N-05 #99): no chart library. Each group (a
 * week, a day) has one bar per series, every bar on one shared scale; about six groups carry a
 * date label, the last one always.
 */
export const barChartLayout = (groups: number[][], { barWidth = 11, barGap = 2, groupGap = 6 }: BarChartGeometry = {}) => {
  const series = Math.max(1, ...groups.map((values) => values.length));
  const max = Math.max(1, ...groups.flat());
  const groupWidth = series * barWidth + (series - 1) * barGap + groupGap;
  const labelEvery = Math.max(1, Math.ceil(groups.length / 6));
  return {
    max,
    barWidth,
    width: AXIS_WIDTH + groups.length * groupWidth,
    height: PLOT_TOP + PLOT_HEIGHT + LABEL_HEIGHT,
    groups: groups.map((values, index) => {
      const x = AXIS_WIDTH + index * groupWidth + groupGap / 2;
      return {
        center: x + (groupWidth - groupGap) / 2,
        bars: values.map((value, bar) => ({ x: x + bar * (barWidth + barGap), height: (value / max) * PLOT_HEIGHT })),
        labelled: (groups.length - 1 - index) % labelEvery === 0,
      };
    }),
  };
};
