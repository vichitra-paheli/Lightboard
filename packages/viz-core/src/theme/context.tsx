import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { darkTheme, lightTheme } from './defaults';
import type { ChartTheme } from './types';

const ChartThemeContext = createContext<ChartTheme>(lightTheme);

/** Props for ChartThemeProvider. */
interface ChartThemeProviderProps {
  theme?: ChartTheme;
  mode?: 'light' | 'dark';
  children: ReactNode;
}

/** Provides chart theme to all descendant chart components. */
export function ChartThemeProvider({ theme, mode, children }: ChartThemeProviderProps) {
  const resolvedTheme = useMemo(() => {
    if (theme) return theme;
    return mode === 'dark' ? darkTheme : lightTheme;
  }, [theme, mode]);

  return (
    <ChartThemeContext.Provider value={resolvedTheme}>
      {children}
    </ChartThemeContext.Provider>
  );
}

/** Hook to access the current chart theme. */
export function useChartTheme(): ChartTheme {
  return useContext(ChartThemeContext);
}
