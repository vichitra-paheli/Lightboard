import { LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { useMemo } from 'react';
import type { PanelPlugin, PanelProps } from '../../panel/types';

/** Configuration for StatCard. */
export interface StatCardConfig {
  valueField: string;
  label?: string;
  sparklineField?: string;
  format?: Intl.NumberFormatOptions;
  thresholds?: { value: number; color: string }[];
}

/** StatCard component — big number display with optional sparkline. */
export function StatCard({
  data,
  config,
  width,
  height,
  theme,
}: PanelProps<Record<string, unknown>[], StatCardConfig>) {
  const { valueField, label, sparklineField, format, thresholds } = config;

  const value = useMemo(() => {
    const lastRow = data[data.length - 1];
    return lastRow ? Number(lastRow[valueField]) || 0 : 0;
  }, [data, valueField]);

  const formattedValue = useMemo(() => {
    const opts = format ?? { maximumFractionDigits: 2 };
    return new Intl.NumberFormat(undefined, opts).format(value);
  }, [value, format]);

  const valueColor = useMemo(() => {
    if (!thresholds || thresholds.length === 0) return theme.colors.text;
    const sorted = [...thresholds].sort((a, b) => b.value - a.value);
    for (const t of sorted) {
      if (value >= t.value) return t.color;
    }
    return theme.colors.text;
  }, [value, thresholds, theme.colors.text]);

  const sparklineData = useMemo(() => {
    if (!sparklineField) return null;
    return data.map((d, i) => ({ x: i, y: Number(d[sparklineField]) || 0 }));
  }, [data, sparklineField]);

  const sparkHeight = Math.max(0, height * 0.3);
  const sparkWidth = Math.max(0, width - 32);

  const sparkScaleX = useMemo(
    () => scaleLinear({ domain: [0, (sparklineData?.length ?? 1) - 1], range: [0, sparkWidth] }),
    [sparklineData, sparkWidth],
  );

  const sparkScaleY = useMemo(() => {
    if (!sparklineData) return scaleLinear({ domain: [0, 1], range: [sparkHeight, 0] });
    const vals = sparklineData.map((d) => d.y);
    return scaleLinear({
      domain: [Math.min(...vals), Math.max(...vals)],
      range: [sparkHeight, 0],
    });
  }, [sparklineData, sparkHeight]);

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: theme.typography.fontFamily,
        color: theme.colors.text,
      }}
    >
      {label && (
        <div style={{ fontSize: theme.typography.fontSize.label, opacity: 0.7, marginBottom: 4 }}>
          {label}
        </div>
      )}
      <div style={{ fontSize: Math.min(height * 0.3, 48), fontWeight: 700, color: valueColor }}>
        {formattedValue}
      </div>
      {sparklineData && sparklineData.length > 1 && (
        <svg width={sparkWidth} height={sparkHeight} style={{ marginTop: 8 }}>
          <LinePath
            data={sparklineData}
            x={(d) => sparkScaleX(d.x) ?? 0}
            y={(d) => sparkScaleY(d.y) ?? 0}
            stroke={theme.colors.series[0]}
            strokeWidth={1.5}
          />
        </svg>
      )}
    </div>
  );
}

/** StatCard panel plugin registration. */
export const statCardPlugin: PanelPlugin<Record<string, unknown>[], StatCardConfig> = {
  id: 'stat-card',
  name: 'Stat Card',
  configSchema: {
    type: 'object',
    properties: {
      valueField: { type: 'string' },
      label: { type: 'string' },
      sparklineField: { type: 'string' },
      format: { type: 'object' },
      thresholds: {
        type: 'array',
        items: {
          type: 'object',
          properties: { value: { type: 'number' }, color: { type: 'string' } },
        },
      },
    },
    required: ['valueField'],
  },
  dataShape: {
    minColumns: 1,
    requiredTypes: ['numeric'],
    description: 'Single numeric value, optionally with sparkline series',
  },
  Component: StatCard as any,
};
