'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { LightboardLoader } from '@/components/brand';
import { queryKeys } from '@/lib/query-keys';

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

/** Shape the `/test` endpoint returns. */
interface TestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

/** Payload variables the save mutation accepts. */
interface SaveVars {
  payload: Record<string, unknown>;
  makeDefault: boolean;
}

/** Snapshot taken `onMutate` so `onError` can roll back optimistic inserts. */
interface SaveContext {
  previousConfigs?: LlmConfig[];
  previousRouting?: RoutingMap;
  /** Temp id the optimistic row carried so we can swap or remove on settle. */
  tempId?: string;
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
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialState(mode, routing));
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode.kind === 'edit';
  const provider = getProvider(form.provider);
  const showBaseUrl = provider?.needsBaseUrl ?? false;

  /**
   * Save mutation covers both create (POST) and edit (PUT). Optimistic updates:
   *
   * - Create: append a synthetic row with `id: tempId` so the list shows
   *   immediately; `onSuccess` replaces it with the server row; `onError`
   *   drops it.
   * - Edit: patch the existing row in place so name / provider / model
   *   changes paint instantly; `onError` reverts to the snapshot.
   *
   * The routing PUT for the "make default" toggle runs after the save
   * settles — it's a separate request that only fires when the user checked
   * the toggle, and it invalidates the routing cache itself.
   */
  const saveMutation = useMutation<LlmConfig, Error, SaveVars, SaveContext>({
    mutationFn: async ({ payload }) => {
      const url = isEdit
        ? `/api/settings/ai/configs/${mode.config.id}`
        : '/api/settings/ai/configs';
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
      return data.config;
    },
    onMutate: async ({ payload }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.aiConfigs() });
      const previousConfigs = queryClient.getQueryData<LlmConfig[]>(queryKeys.aiConfigs());

      if (isEdit) {
        if (previousConfigs) {
          queryClient.setQueryData<LlmConfig[]>(
            queryKeys.aiConfigs(),
            previousConfigs.map((c) =>
              c.id === mode.config.id
                ? {
                    ...c,
                    name: (payload.name as string) ?? c.name,
                    provider: (payload.provider as string) ?? c.provider,
                    model: (payload.model as string) ?? c.model,
                    baseUrl: (payload.baseUrl as string | null) ?? c.baseUrl,
                    temperature:
                      typeof payload.temperature === 'number'
                        ? payload.temperature
                        : c.temperature,
                    maxTokens:
                      typeof payload.maxTokens === 'number' ? payload.maxTokens : c.maxTokens,
                  }
                : c,
            ),
          );
        }
        return { previousConfigs };
      }

      // Create — synthesize a temp row so the list doesn't flash empty.
      const tempId = `temp-${Date.now()}`;
      const optimisticRow: LlmConfig = {
        id: tempId,
        name: (payload.name as string) ?? '',
        provider: (payload.provider as string) ?? '',
        model: (payload.model as string) ?? '',
        baseUrl: (payload.baseUrl as string | null) ?? null,
        temperature:
          typeof payload.temperature === 'number' ? payload.temperature : 0.2,
        maxTokens: typeof payload.maxTokens === 'number' ? payload.maxTokens : 4096,
        hasApiKey: !!payload.apiKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      queryClient.setQueryData<LlmConfig[]>(queryKeys.aiConfigs(), [
        ...(previousConfigs ?? []),
        optimisticRow,
      ]);
      return { previousConfigs, tempId };
    },
    onError: (err, _vars, context) => {
      if (context?.previousConfigs) {
        queryClient.setQueryData(queryKeys.aiConfigs(), context.previousConfigs);
      }
      setError(err.message);
    },
    onSuccess: async (serverRow, { makeDefault }, context) => {
      // Swap the optimistic temp row with the real server row. For edits the
      // existing row has already been patched so we just overwrite with the
      // authoritative data.
      const current = queryClient.getQueryData<LlmConfig[]>(queryKeys.aiConfigs()) ?? [];
      if (context?.tempId) {
        queryClient.setQueryData<LlmConfig[]>(
          queryKeys.aiConfigs(),
          current.map((c) => (c.id === context.tempId ? serverRow : c)),
        );
      } else {
        queryClient.setQueryData<LlmConfig[]>(
          queryKeys.aiConfigs(),
          current.map((c) => (c.id === serverRow.id ? serverRow : c)),
        );
      }

      if (makeDefault && routing.leader !== serverRow.id) {
        await fetch('/api/settings/ai/routing', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leader: serverRow.id }),
        });
        await queryClient.invalidateQueries({ queryKey: queryKeys.aiRouting() });
      }

      onSaved();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.aiConfigs() });
    },
  });

  /**
   * Delete mutation — optimistic removal of the row. Rolls back on 409
   * (config is referenced by routing) so the row reappears with the
   * error banner explaining why.
   */
  const deleteMutation = useMutation<
    void,
    Error,
    void,
    { previousConfigs?: LlmConfig[] }
  >({
    mutationFn: async () => {
      if (!isEdit) return;
      const res = await fetch(`/api/settings/ai/configs/${mode.config.id}`, {
        method: 'DELETE',
      });
      if (res.status === 409) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onMutate: async () => {
      if (!isEdit) return {};
      await queryClient.cancelQueries({ queryKey: queryKeys.aiConfigs() });
      const previousConfigs = queryClient.getQueryData<LlmConfig[]>(queryKeys.aiConfigs());
      if (previousConfigs) {
        queryClient.setQueryData<LlmConfig[]>(
          queryKeys.aiConfigs(),
          previousConfigs.filter((c) => c.id !== mode.config.id),
        );
      }
      return { previousConfigs };
    },
    onError: (err, _vars, context) => {
      if (context?.previousConfigs) {
        queryClient.setQueryData(queryKeys.aiConfigs(), context.previousConfigs);
      }
      setError(err.message);
    },
    onSuccess: () => {
      onSaved();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.aiConfigs() });
    },
  });

  /**
   * "Test connection" mutation — non-optimistic, just surfaces the latency
   * and status message from the server. Uses a mutation (not a query) so
   * users can re-trigger it by clicking, and so the drawer can show a
   * loader during the request.
   */
  const testMutation = useMutation<TestResult, Error, void>({
    mutationFn: async () => {
      if (!isEdit) throw new Error('Cannot test an unsaved config');
      const res = await fetch(`/api/settings/ai/configs/${mode.config.id}/test`, {
        method: 'POST',
      });
      return (await res.json()) as TestResult;
    },
    onSuccess: (data) => {
      setTestResult(data);
    },
    onError: (err) => {
      setTestResult({ ok: false, message: err.message });
    },
  });

  function update(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function handleSave() {
    setError(null);
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
        return;
      }
      payload.apiKey = form.apiKey;
    }
    saveMutation.mutate({ payload, makeDefault: form.makeDefault });
  }

  function handleDelete() {
    if (!isEdit) return;
    setError(null);
    deleteMutation.mutate();
  }

  function handleTest() {
    if (!isEdit) return;
    setTestResult(null);
    testMutation.mutate();
  }

  const saving = saveMutation.isPending;
  const deleting = deleteMutation.isPending;
  const testing = testMutation.isPending;
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
