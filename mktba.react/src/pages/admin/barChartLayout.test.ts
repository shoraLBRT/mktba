import { describe, expect, it } from 'vitest';
import { AXIS_WIDTH, barChartLayout } from './barChartLayout';

describe('barChartLayout', () => {
  it('given the largest value, when laying out, then it fills the plot and the others scale to it', () => {
    const layout = barChartLayout([
      [0, 0],
      [4, 1],
      [2, 0],
    ]);

    expect(layout.max).toBe(4);
    expect(layout.groups.map((group) => group.bars[0].height)).toEqual([0, 120, 60]);
    expect(layout.groups.map((group) => group.bars[1].height)).toEqual([0, 30, 0]);
  });

  it('given two series of 11 px bars, when laying out, then each group is 30 px wide with its bars side by side', () => {
    const layout = barChartLayout([
      [1, 1],
      [1, 1],
    ]);

    expect(layout.width).toBe(AXIS_WIDTH + 60);
    expect(layout.groups[1].bars.map((bar) => bar.x)).toEqual([AXIS_WIDTH + 33, AXIS_WIDTH + 46]);
    expect(layout.groups[1].center).toBe(AXIS_WIDTH + 45);
  });

  it('given one series and a custom geometry, when laying out, then uses its bar width and gaps', () => {
    const layout = barChartLayout([[3], [5], [1]], { barWidth: 8, groupGap: 2 });

    expect(layout.barWidth).toBe(8);
    expect(layout.width).toBe(AXIS_WIDTH + 30);
    expect(layout.groups.map((group) => group.bars[0].x)).toEqual([AXIS_WIDTH + 1, AXIS_WIDTH + 11, AXIS_WIDTH + 21]);
  });

  it('given twelve groups, when laying out, then labels every second one ending at the last', () => {
    const layout = barChartLayout(Array.from({ length: 12 }, () => [0]));

    expect(layout.max).toBe(1);
    expect(layout.groups.filter((group) => group.labelled)).toHaveLength(6);
    expect(layout.groups[11].labelled).toBe(true);
    expect(layout.groups[10].labelled).toBe(false);
  });

  it('given no groups, when laying out, then draws only the axis', () => {
    const layout = barChartLayout([]);

    expect(layout.width).toBe(AXIS_WIDTH);
    expect(layout.groups).toEqual([]);
  });
});
