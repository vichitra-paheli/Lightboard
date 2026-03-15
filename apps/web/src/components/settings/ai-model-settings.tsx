'use client';

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@lightboard/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/** AI model settings form — lets users configure their AI provider per-org. */
export function AIModelSettings() {
  const t = useTranslations('settings.ai');
  const [providerType, setProviderType] = useState<'claude' | 'openai-compatible'>('openai-compatible');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load existing config on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings/ai');
        if (res.ok) {
          const data = await res.json();
          if (data.providerType) setProviderType(data.providerType);
          if (data.baseUrl) setBaseUrl(data.baseUrl);
          if (data.model) setModel(data.model);
          if (data.hasApiKey) {
            setHasExistingKey(true);
            setApiKey('********');
          }
        }
      } catch {
        // Silently fail — form will show defaults
      }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerType, apiKey, baseUrl, model }),
      });
      if (res.ok) {
        setFeedback({ type: 'success', message: t('saved') });
        setHasExistingKey(true);
      } else {
        const data = await res.json();
        setFeedback({ type: 'error', message: data.error ?? t('error') });
      }
    } catch {
      setFeedback({ type: 'error', message: t('error') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
          {t('description')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider Type */}
        <div className="space-y-2">
          <Label htmlFor="ai-provider">{t('providerType')}</Label>
          <select
            id="ai-provider"
            value={providerType}
            onChange={(e) => setProviderType(e.target.value as 'claude' | 'openai-compatible')}
            className="flex h-10 w-full rounded-md px-3 py-2 text-sm"
            style={{
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--color-input)',
              backgroundColor: 'transparent',
              color: 'var(--color-foreground)',
            }}
          >
            <option value="openai-compatible">{t('providerOpenAI')}</option>
            <option value="claude">{t('providerClaude')}</option>
          </select>
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="ai-api-key">{t('apiKey')}</Label>
          <Input
            id="ai-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t('apiKeyPlaceholder')}
            onFocus={() => {
              if (apiKey === '********') setApiKey('');
            }}
            onBlur={() => {
              if (!apiKey && hasExistingKey) setApiKey('********');
            }}
          />
        </div>

        {/* Base URL — only for openai-compatible */}
        {providerType === 'openai-compatible' && (
          <div className="space-y-2">
            <Label htmlFor="ai-base-url">{t('baseUrl')}</Label>
            <Input
              id="ai-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={t('baseUrlPlaceholder')}
            />
          </div>
        )}

        {/* Model Name */}
        <div className="space-y-2">
          <Label htmlFor="ai-model">{t('model')}</Label>
          <Input
            id="ai-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={t('modelPlaceholder')}
          />
        </div>

        {/* Feedback */}
        {feedback && (
          <div
            className="rounded-md p-3 text-sm"
            style={{
              backgroundColor: feedback.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: feedback.type === 'success' ? '#22c55e' : '#ef4444',
            }}
          >
            {feedback.message}
          </div>
        )}

        {/* Save */}
        <Button onClick={handleSave} disabled={saving || !apiKey}>
          {saving ? t('saving') : t('save')}
        </Button>
      </CardContent>
    </Card>
  );
}
