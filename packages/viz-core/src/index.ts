// Theme
export { ChartThemeProvider, useChartTheme } from './theme';
export { darkTheme, lightTheme } from './theme';
export type { ChartColors, ChartSpacing, ChartTheme, ChartTypography } from './theme';

// Panel protocol
export { defaultPanelRegistry, PanelRegistry } from './panel';
export type { ColumnType, DataShapeDeclaration, PanelInteractionEvent, PanelPlugin, PanelProps } from './panel';

// Charts
export { TimeSeriesLine, timeSeriesLinePlugin, type TimeSeriesLineConfig, type TimeSeriesPoint } from './charts/TimeSeriesLine';
export { BarChart, barChartPlugin, type BarChartConfig } from './charts/BarChart';
export { StatCard, statCardPlugin, type StatCardConfig } from './charts/StatCard';
export { DataTable, dataTablePlugin, type DataTableConfig } from './charts/DataTable';

// Auto-viz
export { selectVisualization, type ColumnInfo, type VizRecommendation } from './auto-viz';
