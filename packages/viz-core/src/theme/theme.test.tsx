import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ChartThemeProvider, useChartTheme } from './context';
import { darkTheme, lightTheme } from './defaults';

describe('ChartTheme', () => {
  it('provides light theme by default', () => {
    const { result } = renderHook(() => useChartTheme());
    expect(result.current.colors.background).toBe(lightTheme.colors.background);
  });

  it('provides dark theme when mode is dark', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ChartThemeProvider mode="dark">{children}</ChartThemeProvider>
    );
    const { result } = renderHook(() => useChartTheme(), { wrapper });
    expect(result.current.colors.background).toBe(darkTheme.colors.background);
  });

  it('allows custom theme override', () => {
    const custom = { ...lightTheme, colors: { ...lightTheme.colors, background: '#ff0000' } };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ChartThemeProvider theme={custom}>{children}</ChartThemeProvider>
    );
    const { result } = renderHook(() => useChartTheme(), { wrapper });
    expect(result.current.colors.background).toBe('#ff0000');
  });

  it('light theme has 10 series colors', () => {
    expect(lightTheme.colors.series).toHaveLength(10);
  });

  it('dark theme has 10 series colors', () => {
    expect(darkTheme.colors.series).toHaveLength(10);
  });

  it('themes have all required spacing properties', () => {
    for (const theme of [lightTheme, darkTheme]) {
      expect(theme.spacing.padding).toHaveProperty('top');
      expect(theme.spacing.padding).toHaveProperty('right');
      expect(theme.spacing.padding).toHaveProperty('bottom');
      expect(theme.spacing.padding).toHaveProperty('left');
      expect(theme.spacing.tickLength).toBeGreaterThan(0);
    }
  });
});
