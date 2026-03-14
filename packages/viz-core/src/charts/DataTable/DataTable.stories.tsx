import type { Meta, StoryObj } from '@storybook/react';
import { lightTheme, darkTheme } from '../../theme';
import { DataTable, type DataTableConfig } from './index';

const sampleData = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  name: `User ${i + 1}`,
  email: `user${i + 1}@example.com`,
  role: ['admin', 'editor', 'viewer'][i % 3],
  logins: Math.round(Math.random() * 500),
  lastActive: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString().split('T')[0],
}));

const meta: Meta = {
  title: 'Charts/DataTable',
  component: DataTable as any,
};

export default meta;

export const AutoColumns: StoryObj = {
  render: () => (
    <DataTable
      data={sampleData.slice(0, 10)}
      config={{}}
      width={800}
      height={400}
      theme={lightTheme}
    />
  ),
};

export const ConfiguredColumns: StoryObj = {
  render: () => (
    <DataTable
      data={sampleData}
      config={{
        columns: [
          { field: 'name', header: 'Name' },
          { field: 'email', header: 'Email' },
          { field: 'role', header: 'Role' },
          { field: 'logins', header: 'Login Count' },
        ],
        pageSize: 10,
      }}
      width={800}
      height={450}
      theme={lightTheme}
    />
  ),
};

export const LargeDataset: StoryObj = {
  render: () => (
    <DataTable
      data={sampleData}
      config={{ pageSize: 15 }}
      width={800}
      height={500}
      theme={lightTheme}
    />
  ),
};

export const DarkTheme: StoryObj = {
  render: () => (
    <div style={{ background: darkTheme.colors.background, padding: 16 }}>
      <DataTable
        data={sampleData.slice(0, 10)}
        config={{}}
        width={800}
        height={400}
        theme={darkTheme}
      />
    </div>
  ),
};
