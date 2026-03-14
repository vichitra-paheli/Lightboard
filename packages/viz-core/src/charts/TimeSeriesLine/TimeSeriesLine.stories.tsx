import type { Meta, StoryObj } from '@storybook/react';
import { lightTheme, darkTheme } from '../../theme';
import { TimeSeriesLine, type TimeSeriesLineConfig, type TimeSeriesPoint } from './index';

/** Generate mock time series data. */
function generateTimeSeries(days: number, series: string[]): TimeSeriesPoint[] {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const point: TimeSeriesPoint = {
      time: new Date(now.getTime() - (days - i) * 86400000).toISOString(),
    };
    for (const s of series) {
      point[s] = Math.round(Math.random() * 100 + 50 + i * 2);
    }
    return point;
  });
}

const meta: Meta = {
  title: 'Charts/TimeSeriesLine',
  component: TimeSeriesLine as any,
};

export default meta;

const singleSeriesData = generateTimeSeries(30, ['requests']);
const multiSeriesData = generateTimeSeries(30, ['cpu', 'memory', 'disk']);

export const SingleSeries: StoryObj = {
  render: () => (
    <TimeSeriesLine
      data={singleSeriesData}
      config={{ xField: 'time', yFields: ['requests'] }}
      width={700}
      height={400}
      theme={lightTheme}
    />
  ),
};

export const MultiSeries: StoryObj = {
  render: () => (
    <TimeSeriesLine
      data={multiSeriesData}
      config={{ xField: 'time', yFields: ['cpu', 'memory', 'disk'] }}
      width={700}
      height={400}
      theme={lightTheme}
    />
  ),
};

export const WithAreaFill: StoryObj = {
  render: () => (
    <TimeSeriesLine
      data={singleSeriesData}
      config={{ xField: 'time', yFields: ['requests'], showArea: true }}
      width={700}
      height={400}
      theme={lightTheme}
    />
  ),
};

export const DarkTheme: StoryObj = {
  render: () => (
    <div style={{ background: darkTheme.colors.background, padding: 16 }}>
      <TimeSeriesLine
        data={multiSeriesData}
        config={{ xField: 'time', yFields: ['cpu', 'memory', 'disk'], showArea: true }}
        width={700}
        height={400}
        theme={darkTheme}
      />
    </div>
  ),
};
