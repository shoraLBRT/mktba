import React from 'react';
import { AXIS_WIDTH, PLOT_HEIGHT, PLOT_TOP, barChartLayout, type BarChartGeometry } from './barChartLayout';

export type BarChartSeries = { label: string; color: string };

export type BarChartGroup = {
  key: string;
  /** The date under the group and in the first column of the table. */
  label: string;
  /** The tooltip of the group: its numbers in words. */
  title: string;
  /** One value per series, in the order of the series. */
  values: number[];
};

type BarChartProps = {
  /** The chart's accessible name and the table's caption. */
  label: string;
  /** The heading of the table's first column. */
  groupColumn: string;
  series: BarChartSeries[];
  groups: BarChartGroup[];
  geometry?: BarChartGeometry;
  /** The widest the chart is drawn, in px; by default its own width, so it never scales up. */
  maxWidth?: number;
  groupTestId?: string;
};

/**
 * A grouped bar chart in plain SVG (P-04 #92, N-05 #99): a legend, the bars on a shared scale with a
 * tooltip per group, and the same numbers in a table for screen readers.
 */
export const BarChart: React.FC<BarChartProps> = ({ label, groupColumn, series, groups, geometry, maxWidth, groupTestId }) => {
  const layout = barChartLayout(
    groups.map((group) => group.values),
    geometry,
  );
  const baseline = PLOT_TOP + PLOT_HEIGHT;
  return (
    <>
      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--color-ink-muted)]" aria-hidden="true">
        {series.map((item) => (
          <li key={item.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>

      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="mt-2 block h-auto w-full"
        style={{ maxWidth: maxWidth ?? layout.width }}
      >
        <line x1={AXIS_WIDTH} x2={layout.width} y1={PLOT_TOP} y2={PLOT_TOP} stroke="var(--color-border-soft)" strokeDasharray="3 3" />
        <line x1={AXIS_WIDTH} x2={layout.width} y1={baseline} y2={baseline} stroke="var(--color-border-soft)" />
        <text x={AXIS_WIDTH - 4} y={PLOT_TOP + 4} textAnchor="end" fontSize="10" fill="var(--color-ink-muted)">
          {layout.max}
        </text>
        <text x={AXIS_WIDTH - 4} y={baseline} textAnchor="end" fontSize="10" fill="var(--color-ink-muted)">
          {0}
        </text>
        {layout.groups.map((drawn, index) => (
          <g key={groups[index].key} data-testid={groupTestId}>
            <title>{groups[index].title}</title>
            {drawn.bars.map((bar, barIndex) => (
              <rect
                key={series[barIndex]?.label ?? barIndex}
                x={bar.x}
                y={baseline - bar.height}
                width={layout.barWidth}
                height={bar.height}
                rx="1.5"
                fill={series[barIndex]?.color}
              />
            ))}
            {drawn.labelled ? (
              <text x={drawn.center} y={baseline + 14} textAnchor="middle" fontSize="9" fill="var(--color-ink-muted)">
                {groups[index].label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>

      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{groupColumn}</th>
            {series.map((item) => (
              <th key={item.label} scope="col">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.key}>
              <th scope="row">{group.label}</th>
              {group.values.map((value, index) => (
                <td key={series[index]?.label ?? index}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};
