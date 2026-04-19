import { redirect } from 'next/navigation';

/**
 * Legacy `/data-sources` route — redirects to the settings sub-section.
 * Shipped alongside the v2 settings shell; delete this file in a later
 * release once outbound links have been updated across the docs.
 */
export default function LegacyDataSourcesPage(): never {
  redirect('/settings/data-sources');
}
