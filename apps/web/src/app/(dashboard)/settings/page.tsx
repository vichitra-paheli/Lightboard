import { AIModelSettings } from '@/components/settings/ai-model-settings';

/**
 * Settings page — application configuration.
 * Includes AI model provider settings.
 */
export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <AIModelSettings />
    </div>
  );
}
