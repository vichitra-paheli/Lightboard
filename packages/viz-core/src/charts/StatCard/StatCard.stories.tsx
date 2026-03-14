import type { Meta, StoryObj } from '@storybook/react';
import { lightTheme, darkTheme } from '../../theme';
import { StatCard, type StatCardConfig } from './index';

const sparklineData = Array.from({ length: 20 }, (_, i) => ({
  value: Math.round(Math.random() * 50 + 100 + i * 3),
  trend: Math.round(Math.random() * 50 + 100 + i * 3),
}));

const meta: Meta = {
  title: 'Charts/StatCard',
  component: StatCard as any,
};

export default meta;

export const BasicNumber: StoryObj = {
  render: () => (
    <StatCard
      data={[{ value: 42857 }]}
      config={{ valueField: 'value', label: 'Total Users' }}
      width={250}
      height={150}
      theme={lightTheme}
    />
  ),
};

export const WithSparkline: StoryObj = {
  render: () => (
    <StatCard
      data={sparklineData}
      config={{ valueField: 'value', label: 'Revenue', sparklineField: 'trend' }}
      width={250}
      height={180}
      theme={lightTheme}
    />
  ),
};

export const WithThresholds: StoryObj = {
  render: () => (
    <StatCard
      data={[{ value: 95.2 }]}
      config={{
        valueField: 'value',
        label: 'Uptime %',
        thresholds: [
          { value: 99, color: '#22c55e' },
          { value: 95, color: '#eab308' },
          { value: 0, color: '#ef4444' },
        ],
      }}
      width={250}
      height={150}
      theme={lightTheme}
    />
  ),
};

export const DarkTheme: StoryObj = {
  render: () => (
    <div style={{ background: darkTheme.colors.background, padding: 16 }}>
      <StatCard
        data={sparklineData}
        config={{ valueField: 'value', label: 'Active Sessions', sparklineField: 'trend' }}
        width={250}
        height={180}
        theme={darkTheme}
      />
    </div>
  ),
};
