import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale';
import { Bar, BarGroup, BarStack } from '@visx/shape';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { max } from 'd3-array';
import { useMemo } from 'react';
import type { PanelPlugin, PanelProps } from '../../panel/types';

/** Configuration for BarChart. */
export interface BarChartConfig {
  xField: string;
  yFields: string[];
  orientation?: 'vertical' | 'horizontal';
  mode?: 'grouped' | 'stacked';
  showGrid?: boolean;
  barRadius?: number;
}

/** BarChart component. */
export function BarChart({
  data,
  config,
  width,
  height,
  theme,
  onInteraction,
}: PanelProps<Record<string, unknown>[], BarChartConfig>) {
  const {
    xField,
    yFields,
    mode = 'grouped',
    showGrid = true,
    barRadius = 2,
  } = config;
  const margin = theme.spacing.padding;
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const categories = useMemo(
    () => data.map((d) => String(d[xField])),
    [data, xField],
  );

  const xScale = useMemo(
    () => scaleBand({ domain: categories, range: [0, innerWidth], padding: 0.2 }),
    [categories, innerWidth],
  );

  const allValues = useMemo(() => {
    if (mode === 'stacked') {
      return data.map((d) => yFields.reduce((sum, f) => sum + (Number(d[f]) || 0), 0));
    }
    return data.flatMap((d) => yFields.map((f) => Number(d[f]) || 0));
  }, [data, yFields, mode]);

  const yScale = useMemo(
    () => scaleLinear({ domain: [0, max(allValues) ?? 0], range: [innerHeight, 0], nice: true }),
    [allValues, innerHeight],
  );

  const colorScale = useMemo(
    () =>
      scaleOrdinal({
        domain: yFields,
        range: theme.colors.series.slice(0, yFields.length),
      }),
    [yFields, theme.colors.series],
  );

  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<{ category: string; field: string; value: number }>();

  if (width < 10 || height < 10) return null;

  return (
    <>
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {showGrid && (
            <GridRows scale={yScale} width={innerWidth} stroke={theme.colors.grid} strokeOpacity={0.5} />
          )}

          {mode === 'grouped' ? (
            // Grouped bars
            data.map((d, i) => {
              const category = String(d[xField]);
              const x0 = xScale(category) ?? 0;
              const barGroupWidth = xScale.bandwidth();
              const barWidth = barGroupWidth / yFields.length;

              return yFields.map((field, j) => {
                const value = Number(d[field]) || 0;
                const barHeight = innerHeight - (yScale(value) ?? 0);
                const color = theme.colors.series[j % theme.colors.series.length];

                return (
                  <Bar
                    key={`${i}-${j}`}
                    x={x0 + j * barWidth}
                    y={yScale(value) ?? 0}
                    width={barWidth - 1}
                    height={barHeight}
                    fill={color}
                    rx={barRadius}
                    onMouseEnter={() =>
                      showTooltip({
                        tooltipData: { category, field, value },
                        tooltipLeft: x0 + j * barWidth + barWidth / 2,
                        tooltipTop: yScale(value) ?? 0,
                      })
                    }
                    onMouseLeave={hideTooltip}
                    onClick={() =>
                      onInteraction?.({ type: 'click', payload: { category, field, value, row: d } })
                    }
                  />
                );
              });
            })
          ) : (
            // Stacked bars
            data.map((d, i) => {
              const category = String(d[xField]);
              const x = xScale(category) ?? 0;
              let cumY = innerHeight;

              return yFields.map((field, j) => {
                const value = Number(d[field]) || 0;
                const barHeight = innerHeight - (yScale(value) ?? innerHeight);
                cumY -= barHeight;
                const color = theme.colors.series[j % theme.colors.series.length];

                return (
                  <Bar
                    key={`${i}-${j}`}
                    x={x}
                    y={cumY}
                    width={xScale.bandwidth()}
                    height={barHeight}
                    fill={color}
                    rx={j === yFields.length - 1 ? barRadius : 0}
                    onMouseEnter={() =>
                      showTooltip({
                        tooltipData: { category, field, value },
                        tooltipLeft: x + xScale.bandwidth() / 2,
                        tooltipTop: cumY,
                      })
                    }
                    onMouseLeave={hideTooltip}
                    onClick={() =>
                      onInteraction?.({ type: 'click', payload: { category, field, value, row: d } })
                    }
                  />
                );
              });
            })
          )}

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke={theme.colors.axis}
            tickStroke={theme.colors.axis}
            tickLabelProps={() => ({
              fill: theme.colors.text,
              fontSize: theme.typography.fontSize.axis,
              textAnchor: 'middle' as const,
            })}
          />

          <AxisLeft
            scale={yScale}
            stroke={theme.colors.axis}
            tickStroke={theme.colors.axis}
            tickLabelProps={() => ({
              fill: theme.colors.text,
              fontSize: theme.typography.fontSize.axis,
              textAnchor: 'end' as const,
              dx: '-0.25em',
              dy: '0.33em',
            })}
          />
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={(tooltipLeft ?? 0) + margin.left}
          top={(tooltipTop ?? 0) + margin.top}
          style={{
            ...defaultStyles,
            backgroundColor: theme.colors.tooltipBackground,
            color: theme.colors.tooltipText,
            fontSize: theme.typography.fontSize.tooltip,
          }}
        >
          <div><strong>{tooltipData.category}</strong></div>
          <div style={{ color: colorScale(tooltipData.field) }}>
            {tooltipData.field}: {tooltipData.value}
          </div>
        </TooltipWithBounds>
      )}
    </>
  );
}

/** BarChart panel plugin registration. */
export const barChartPlugin: PanelPlugin<Record<string, unknown>[], BarChartConfig> = {
  id: 'bar-chart',
  name: 'Bar Chart',
  configSchema: {
    type: 'object',
    properties: {
      xField: { type: 'string' },
      yFields: { type: 'array', items: { type: 'string' } },
      orientation: { type: 'string', enum: ['vertical', 'horizontal'] },
      mode: { type: 'string', enum: ['grouped', 'stacked'] },
      showGrid: { type: 'boolean' },
      barRadius: { type: 'number' },
    },
    required: ['xField', 'yFields'],
  },
  dataShape: {
    minColumns: 2,
    requiredTypes: ['categorical', 'numeric'],
    description: 'Categorical x-axis with one or more numeric y-values',
  },
  Component: BarChart as any,
};
