import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { scaleLinear, scaleTime } from '@visx/scale';
import { LinePath, AreaClosed } from '@visx/shape';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { extent, max, bisector } from 'd3-array';
import { timeFormat } from 'd3-time-format';
import { useCallback, useMemo } from 'react';
import type { PanelPlugin, PanelProps } from '../../panel/types';
import type { ChartTheme } from '../../theme/types';

/** Data point for time series. */
export interface TimeSeriesPoint {
  time: Date | number | string;
  [series: string]: unknown;
}

/** Configuration for TimeSeriesLine chart. */
export interface TimeSeriesLineConfig {
  xField: string;
  yFields: string[];
  showArea?: boolean;
  showGrid?: boolean;
  showPoints?: boolean;
  dateFormat?: string;
}

/** TimeSeriesLine chart component. */
export function TimeSeriesLine({
  data,
  config,
  width,
  height,
  theme,
  onInteraction,
}: PanelProps<TimeSeriesPoint[], TimeSeriesLineConfig>) {
  const { xField, yFields, showArea = false, showGrid = true, dateFormat = '%b %d' } = config;
  const margin = theme.spacing.padding;
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  type ParsedRow = Record<string, unknown> & { _time: Date };
  const parsedData = useMemo(
    (): ParsedRow[] => data.map((d) => {
      const row = d as Record<string, unknown>;
      return Object.assign({} as ParsedRow, row, { _time: new Date(row[xField] as string | number | Date) });
    }),
    [data, xField],
  );

  const xScale = useMemo(
    () =>
      scaleTime({
        domain: extent(parsedData, (d) => d._time) as [Date, Date],
        range: [0, innerWidth],
      }),
    [parsedData, innerWidth],
  );

  const allValues = useMemo(
    () => parsedData.flatMap((d) => yFields.map((f) => Number(d[f]) || 0)),
    [parsedData, yFields],
  );

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, max(allValues) ?? 0],
        range: [innerHeight, 0],
        nice: true,
      }),
    [allValues, innerHeight],
  );

  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } =
    useTooltip<TimeSeriesPoint>();

  const bisectDate = bisector<(typeof parsedData)[0], Date>((d) => d._time).left;

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const svg = event.currentTarget.closest('svg');
      if (!svg) return;
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());
      const x0 = xScale.invert(svgPoint.x - margin.left);
      const idx = bisectDate(parsedData, x0, 1);
      const d = parsedData[idx - 1];
      if (!d) return;
      showTooltip({
        tooltipData: d as unknown as TimeSeriesPoint,
        tooltipLeft: xScale(d._time),
        tooltipTop: margin.top,
      });
    },
    [xScale, parsedData, bisectDate, margin, showTooltip],
  );

  if (width < 10 || height < 10) return null;

  const formatDate = timeFormat(dateFormat);

  return (
    <>
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {showGrid && (
            <GridRows
              scale={yScale}
              width={innerWidth}
              stroke={theme.colors.grid}
              strokeOpacity={0.5}
            />
          )}

          {yFields.map((field, i) => {
            const color = theme.colors.series[i % theme.colors.series.length];
            return (
              <g key={field}>
                {showArea && (
                  <AreaClosed
                    data={parsedData}
                    x={(d) => xScale(d._time) ?? 0}
                    y={(d) => yScale(Number(d[field]) || 0) ?? 0}
                    yScale={yScale}
                    fill={color}
                    fillOpacity={0.1}
                  />
                )}
                <LinePath
                  data={parsedData}
                  x={(d) => xScale(d._time) ?? 0}
                  y={(d) => yScale(Number(d[field]) || 0) ?? 0}
                  stroke={color}
                  strokeWidth={2}
                />
              </g>
            );
          })}

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
            tickFormat={(v) => formatDate(v as Date)}
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

          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={handleMouseMove}
            onMouseLeave={hideTooltip}
            onClick={() => {
              if (tooltipData && onInteraction) {
                onInteraction({ type: 'click', payload: tooltipData });
              }
            }}
          />
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={(tooltipLeft ?? 0) + margin.left}
          top={tooltipTop ?? 0}
          style={{
            ...defaultStyles,
            backgroundColor: theme.colors.tooltipBackground,
            color: theme.colors.tooltipText,
            fontSize: theme.typography.fontSize.tooltip,
          }}
        >
          <div>
            <strong>{formatDate(new Date(tooltipData[xField] as string))}</strong>
          </div>
          {yFields.map((field, i) => (
            <div key={field} style={{ color: theme.colors.series[i % theme.colors.series.length] }}>
              {field}: {String(tooltipData[field])}
            </div>
          ))}
        </TooltipWithBounds>
      )}
    </>
  );
}

/** TimeSeriesLine panel plugin registration. */
export const timeSeriesLinePlugin: PanelPlugin<TimeSeriesPoint[], TimeSeriesLineConfig> = {
  id: 'time-series-line',
  name: 'Time Series Line',
  configSchema: {
    type: 'object',
    properties: {
      xField: { type: 'string' },
      yFields: { type: 'array', items: { type: 'string' } },
      showArea: { type: 'boolean' },
      showGrid: { type: 'boolean' },
      showPoints: { type: 'boolean' },
      dateFormat: { type: 'string' },
    },
    required: ['xField', 'yFields'],
  },
  dataShape: {
    minColumns: 2,
    requiredTypes: ['time', 'numeric'],
    description: 'Time-based x-axis with one or more numeric y-series',
  },
  Component: TimeSeriesLine as any,
};
