import type { ChartTheme } from './types';

/** Default light chart theme. */
export const lightTheme: ChartTheme = {
  colors: {
    series: [
      '#e76f51', '#2a9d8f', '#264653', '#e9c46a', '#f4a261',
      '#606c38', '#283618', '#bc6c25', '#4361ee', '#7209b7',
    ],
    axis: '#6b7280',
    grid: '#e5e7eb',
    text: '#1f2937',
    background: '#ffffff',
    tooltipBackground: '#1f2937',
    tooltipText: '#f9fafb',
  },
  typography: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: { axis: 11, label: 12, title: 14, tooltip: 12 },
  },
  spacing: {
    padding: { top: 20, right: 20, bottom: 40, left: 50 },
    tickLength: 5,
    legendGap: 16,
  },
};

/** Default dark chart theme. */
export const darkTheme: ChartTheme = {
  colors: {
    series: [
      '#f4a261', '#2a9d8f', '#e9c46a', '#e76f51', '#4cc9f0',
      '#80b918', '#f72585', '#7209b7', '#3a86ff', '#06d6a0',
    ],
    axis: '#9ca3af',
    grid: '#374151',
    text: '#f3f4f6',
    background: '#111827',
    tooltipBackground: '#f9fafb',
    tooltipText: '#1f2937',
  },
  typography: lightTheme.typography,
  spacing: lightTheme.spacing,
};
