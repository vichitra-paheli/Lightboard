import type { Meta, StoryObj } from '@storybook/react';
import { lightTheme, darkTheme } from '../../theme';
import { BarChart, type BarChartConfig } from './index';

const salesData = [
  { product: 'Widget A', sales: 420, profit: 120 },
  { product: 'Widget B', sales: 380, profit: 95 },
  { product: 'Widget C', sales: 290, profit: 80 },
  { product: 'Widget D', sales: 510, profit: 200 },
  { product: 'Widget E', sales: 180, profit: 45 },
];

const meta: Meta = {
  title: 'Charts/BarChart',
  component: BarChart as any,
};

export default meta;

export const Grouped: StoryObj = {
  render: () => (
    <BarChart
      data={salesData}
      config={{ xField: 'product', yFields: ['sales', 'profit'], mode: 'grouped' }}
      width={700}
      height={400}
      theme={lightTheme}
    />
  ),
};

export const Stacked: StoryObj = {
  render: () => (
    <BarChart
      data={salesData}
      config={{ xField: 'product', yFields: ['sales', 'profit'], mode: 'stacked' }}
      width={700}
      height={400}
      theme={lightTheme}
    />
  ),
};

export const SingleSeries: StoryObj = {
  render: () => (
    <BarChart
      data={salesData}
      config={{ xField: 'product', yFields: ['sales'] }}
      width={700}
      height={400}
      theme={lightTheme}
    />
  ),
};

export const DarkTheme: StoryObj = {
  render: () => (
    <div style={{ background: darkTheme.colors.background, padding: 16 }}>
      <BarChart
        data={salesData}
        config={{ xField: 'product', yFields: ['sales', 'profit'], mode: 'grouped' }}
        width={700}
        height={400}
        theme={darkTheme}
      />
    </div>
  ),
};
