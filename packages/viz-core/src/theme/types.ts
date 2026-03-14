/** Color palette for chart rendering. */
export interface ChartColors {
  /** Series colors for multi-line/bar charts. */
  series: string[];
  /** Axis line and tick color. */
  axis: string;
  /** Grid line color. */
  grid: string;
  /** Text/label color. */
  text: string;
  /** Chart background color. */
  background: string;
  /** Tooltip background. */
  tooltipBackground: string;
  /** Tooltip text color. */
  tooltipText: string;
}

/** Typography settings for chart labels and text. */
export interface ChartTypography {
  fontFamily: string;
  fontSize: {
    axis: number;
    label: number;
    title: number;
    tooltip: number;
  };
}

/** Spacing settings for chart elements. */
export interface ChartSpacing {
  padding: { top: number; right: number; bottom: number; left: number };
  tickLength: number;
  legendGap: number;
}

/** Complete chart theme definition. */
export interface ChartTheme {
  colors: ChartColors;
  typography: ChartTypography;
  spacing: ChartSpacing;
}
