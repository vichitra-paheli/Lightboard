'use client';

import {
  defaultPanelRegistry,
  useChartTheme,
  type ViewSpec,
} from '@lightboard/viz-core';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { LightboardLoader } from '../brand';
import { ControlBar } from './controls/control-bar';

/** Props for the ViewRenderer component. */
interface ViewRendererProps {
  /** The ViewSpec to render. */
  spec: ViewSpec;
  /** Query result data (already fetched). */
  data: Record<string, unknown>[] | null;
  /** Whether the query is currently loading. */
  isLoading: boolean;
  /** Error from query execution. */
  error: string | null;
  /** Available width. */
  width: number;
  /** Available height. */
  height: number;
  /** Callback when a control variable changes. */
  onVariableChange?: (variables: Record<string, unknown>) => void;
}

/**
 * Renders a ViewSpec as a complete interactive panel:
 * - Title and description
 * - Control bar (dropdowns, date ranges, toggles)
 * - Chart component (looked up from panel registry)
 * - Loading skeleton and error states
 */
export function ViewRenderer({
  spec,
  data,
  isLoading,
  error,
  width,
  height,
  onVariableChange,
}: ViewRendererProps) {
  const theme = useChartTheme();
  const t = useTranslations('view');

  // D9.3: Variable state
  const [variables, setVariables] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const control of spec.controls) {
      if (control.defaultValue !== undefined) {
        initial[control.variable] = control.defaultValue;
      }
    }
    return initial;
  });

  const handleVariableChange = useCallback(
    (variable: string, value: unknown) => {
      setVariables((prev) => {
        const next = { ...prev, [variable]: value };
        onVariableChange?.(next);
        return next;
      });
    },
    [onVariableChange],
  );

  // Look up the panel plugin
  const plugin = useMemo(
    () => defaultPanelRegistry.get(spec.chart.type),
    [spec.chart.type],
  );

  const controlBarHeight = spec.controls.length > 0 ? 60 : 0;
  const headerHeight = spec.title ? 48 : 0;
  const chartHeight = Math.max(0, height - controlBarHeight - headerHeight);

  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column' }}>
      {/* Title */}
      {spec.title && (
        <div className="px-4 pt-3">
          <h3 className="text-lg font-semibold text-foreground">
            {spec.title}
          </h3>
          {spec.description && (
            <p className="text-sm text-muted-foreground">
              {spec.description}
            </p>
          )}
        </div>
      )}

      {/* Controls */}
      <ControlBar
        controls={spec.controls}
        values={variables}
        onChange={handleVariableChange}
      />

      {/* Chart area */}
      <div className="flex-1 relative">
        {isLoading && !data && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-muted/50">
            <LightboardLoader size={14} />
            <span className="text-sm text-muted-foreground">{t('loading')}</span>
          </div>
        )}

        {error && (
          <div className="p-4">
            <div className="rounded-md bg-destructive/90 p-3 text-destructive-foreground">
              <p className="text-sm font-medium">{t('queryError')}</p>
              <p className="mt-1 text-xs opacity-80">{error}</p>
            </div>
          </div>
        )}

        {data && plugin && (
          <plugin.Component
            data={data}
            config={spec.chart.config}
            width={width}
            height={chartHeight}
            theme={theme}
          />
        )}

        {data && !plugin && (
          <div className="p-4 text-sm text-muted-foreground">
            {t('unknownChartType', { type: spec.chart.type })}
          </div>
        )}

        {/* Stale indicator during re-fetch */}
        {isLoading && data && (
          <div className="absolute top-2 right-2 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            {t('updating')}
          </div>
        )}
      </div>
    </div>
  );
}
