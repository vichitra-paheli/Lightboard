import { redirect } from 'next/navigation';

/**
 * Settings index — redirects to the default sub-section.
 * The settings shell lives under `/settings/{section}`; visiting the bare
 * `/settings` path funnels users to Data Sources, which is the most common
 * entry point.
 */
export default function SettingsIndexPage(): never {
  redirect('/settings/data-sources');
}
