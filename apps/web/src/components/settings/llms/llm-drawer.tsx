'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { LightboardLoader } from '@/components/brand';
import {
  Drawer,
  Field,
  FieldGrid,
  FieldLabel,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
  Select,
  SliderInput,
  TextInput,
  ToggleRow,
} from '../primitives';
import { getProvider } from './provider-catalog';
import { ProviderTileGrid } from './provider-tile-grid';
import type { LlmConfig, RoutingMap } from './use-llm-data';

/** The masked string the UI preserves to keep a stored key intact. */
const API_KEY_MASK = '********';

/** Drawer mode — new config vs editing an existing one. */
export type LlmDrawerMode = { kind: 'new' } | { kind: 'edit'; config: LlmConfig };

/** Props for {@link LlmDrawer}. */
export interface LlmDrawerProps {
  mode: LlmDrawerMode;
  /** Current routing — used for the "workspace default" toggle + delete-check. */
  routing: RoutingMap;
  onClose: () => void;
  onSaved: () => void;
}

/** Local form state. */
interface FormState {
  name: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  makeDefault: boolean;
}

/** Derive initial state from the drawer mode. */
function initialState(mode: LlmDrawerMode, routing: RoutingMap): FormState {
  if (mode.kind === 'edit') {
    const c = mode.config;
    return {
      name: c.name,
      provider: c.provider,
      model: c.model,
      apiKey: API_KEY_MASK,
      baseUrl: c.baseUrl ?? '',
      temperature: c.temperature ?? 0.2,
      maxTokens: c.maxTokens ?? 4096,
      makeDefault: routing.leader === c.id,
    };
  }
  return {
    name: '',
    provider: 'anthropic',
    model: '',
    apiKey: '',
    baseUrl: '',
    temperature: 0.2,
    maxTokens: 4096,
    makeDefault: false,
  };
}

/** Drawer for creating or editing an LLM configuration. */
export function LlmDrawer({ mode, routing, onClose, onSaved }: LlmDrawerProps) {
  const t = useTranslations('settings.llms.drawer');
  const [form, setForm] = useState<FormState>(() => initialState(mode, routing));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string; latencyMs?: number } | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode.kind === 'edit';
  const provider = getProvider(form.provider);
  const showBaseUrl = provider?.needsBaseUrl ?? false;

  function update(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        provider: form.provider,
        model: form.model,
        baseUrl: showBaseUrl ? form.baseUrl : null,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
      };
      // Only send apiKey when it has actually been changed.
      if (form.apiKey && form.apiKey !== API_KEY_MASK) {
        payload.apiKey = form.apiKey;
      } else if (!isEdit) {
        // New configs must supply a key.
        if (!form.apiKey) {
          setError(t('errors.apiKeyRequired'));
          setSaving(false);
          return;
        }
        payload.apiKey = form.apiKey;
      }

      const url = isEdit ? `/api/settings/ai/configs/${mode.config.id}` : '/api/settings/ai/configs';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { config: LlmConfig };

      // Apply the "workspace default" intent to routing. Only pushes if the
      // user toggled it on for a config that isn't currently leader.
      if (form.makeDefault && routing.leader !== data.config.id) {
        await fetch('/api/settings/ai/routing', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leader: data.config.id }),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/ai/configs/${mode.config.id}`, { method: 'DELETE' });
      if (res.status === 409) {
        const data = (await res.json()) as { error: string };
        setError(data.error);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  async function handleTest() {
    if (!isEdit) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/settings/ai/configs/${mode.config.id}/test`, { method: 'POST' });
      const data = (await res.json()) as { ok: boolean; message: string; latencyMs?: number };
      setTestResult(data);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }

  const modelOptions = (provider?.models ?? []).map((m) => ({ value: m, label: m }));

  return (
    <Drawer
      wide
      title={isEdit ? t('editTitle', { name: mode.config.name }) : t('newTitle')}
      subtitle={isEdit ? t('editSubtitle') : t('newSubtitle')}
      onClose={onClose}
      closeLabel={t('close')}
      footer={
        <>
          <GhostButton onClick={onClose} disabled={saving || deleting}>
            {t('cancel')}
          </GhostButton>
          {isEdit && (
            <SecondaryButton danger onClick={handleDelete} disabled={saving || deleting}>
              {deleting && <LightboardLoader size={12} ariaLabel="" />}
              <span>{t('remove')}</span>
            </SecondaryButton>
          )}
          <PrimaryButton onClick={handleSave} disabled={saving || deleting}>
            {saving && <LightboardLoader size={12} ariaLabel="" />}
            <span>{isEdit ? t('saveChanges') : t('add')}</span>
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <FieldLabel>{t('provider')}</FieldLabel>
          <ProviderTileGrid value={form.provider} onChange={(id) => update({ provider: id, model: '' })} />
        </div>

        <FieldGrid cols={2}>
          <Field label={t('name')} hint={t('nameHint')}>
            <TextInput value={form.name} onChange={(v) => update({ name: v })} placeholder="Sonnet 4.5" />
          </Field>
          <Field label={t('model')}>
            {modelOptions.length > 0 ? (
              <Select value={form.model} onChange={(v) => update({ model: v })} options={modelOptions} placeholder={t('modelPlaceholder')} />
            ) : (
              <TextInput value={form.model} onChange={(v) => update({ model: v })} placeholder="model-id" mono />
            )}
          </Field>
          <Field label={t('apiKey')} hint={isEdit ? t('apiKeyHintEdit') : t('apiKeyHintNew')} full>
            <TextInput
              type="password"
              value={form.apiKey}
              onChange={(v) => update({ apiKey: v })}
              onFocus={() => {
                if (form.apiKey === API_KEY_MASK) update({ apiKey: '' });
              }}
              onBlur={() => {
                if (isEdit && !form.apiKey) update({ apiKey: API_KEY_MASK });
              }}
              placeholder={isEdit ? API_KEY_MASK : 'sk-…'}
              mono
              right={
                <span
                  className="rounded border border-[var(--line-1)] px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink-3)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {t('secretBadge')}
                </span>
              }
            />
          </Field>
          {showBaseUrl && (
            <Field label={t('baseUrl')} full>
              <TextInput
                value={form.baseUrl}
                onChange={(v) => update({ baseUrl: v })}
                placeholder={provider?.baseUrlPlaceholder ?? 'https://…'}
                mono
              />
            </Field>
          )}
          <Field label={t('temperature')} hint={form.temperature.toFixed(2)}>
            <SliderInput value={form.temperature} onChange={(v) => update({ temperature: v })} min={0} max={2} step={0.05} ariaLabel={t('temperature')} />
          </Field>
          <Field label={t('maxTokens')} hint={form.maxTokens.toLocaleString()}>
            <SliderInput value={form.maxTokens} onChange={(v) => update({ maxTokens: v })} min={512} max={16384} step={256} ariaLabel={t('maxTokens')} />
          </Field>
          <Field label={t('defaultLabel')} full>
            <ToggleRow
              label={t('defaultToggleLabel')}
              description={t('defaultToggleDesc')}
              value={form.makeDefault}
              onChange={(v) => update({ makeDefault: v })}
            />
          </Field>
        </FieldGrid>

        {isEdit && (
          <div className="flex items-center justify-between gap-4 rounded-[8px] border border-[var(--line-1)] bg-[var(--bg-1)] px-3.5 py-3">
            <div className="min-w-0">
              <div className="text-[12.5px] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-body)' }}>
                {t('testTitle')}
              </div>
              <div
                className="mt-0.5 text-[10.5px] text-[var(--ink-5)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {testResult ? (
                  <span style={{ color: testResult.ok ? 'var(--kind-narrate)' : 'var(--color-destructive)' }}>
                    {testResult.ok ? '● ' : '● '}
                    {testResult.message}
                    {testResult.latencyMs !== undefined ? ` · ${testResult.latencyMs}ms` : ''}
                  </span>
                ) : (
                  t('testDesc')
                )}
              </div>
            </div>
            <SecondaryButton size="sm" onClick={handleTest} disabled={testing}>
              {testing && <LightboardLoader size={12} ariaLabel="" />}
              <span>{t('runTest')}</span>
            </SecondaryButton>
          </div>
        )}

        {error && (
          <div
            className="rounded-md p-3 text-sm"
            style={{
              backgroundColor: 'color-mix(in oklab, var(--color-destructive) 14%, transparent)',
              color: 'var(--color-destructive)',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </Drawer>
  );
}
