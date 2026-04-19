import { DataSourceDetail } from '@/components/settings/data-sources';

/** Settings → Datasource detail. */
export default async function SettingsDataSourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DataSourceDetail id={id} />;
}
