import { LlmsSection } from '@/components/settings/llms';

/**
 * Settings → LLM providers page.
 * Composed entirely client-side because every control (drawer, select,
 * routing updates) is interactive.
 */
export default function SettingsLlmsPage() {
  return <LlmsSection />;
}
