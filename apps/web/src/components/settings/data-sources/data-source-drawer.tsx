'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { LightboardLoader } from '@/components/brand';

import {
  Drawer,
  Field,
  FieldGrid,
  GhostButton,
  PrimaryButton,
  SecondaryButton,
  Select,
  TextInput,
  ToggleRow,
} from '../primitives';

/** Connector options surfaced in the Type select. Mirrors the data-sources enum. */
const CONNECTOR_OPTIONS = [
  { value: 'postgres', label: 'PostgreSQL', sub: 'pg', dot: '#8AB4B8' },
  { value: 'mysql', label: 'MySQL', sub: 'my', dot: '#7DB469' },
  { value: 'clickhouse', label: 'ClickHouse', sub: 'ch', dot: '#F2C265' },
];

/** Local form state used by the drawer. */
interface DrawerFormState {
  name: string;
  type: string;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

/** Props for {@link DataSourceDrawer}. */
export interface DataSourceDrawerProps {
  onClose: () => void;
  onCreated: () => void;
}

/** Initial blank state. */
function blankState(): DrawerFormState {
  return {
    name: '',
    type: 'postgres',
    host: '',
    port: '5432',
    database: '',
    user: '',
    password: '',
    ssl: true,
  };
}

/** Create-datasource drawer. */
export function DataSourceDrawer({ onClose, onCreated }: DataSourceDrawerProps) {
  const t = useTranslations('settings.dataSources.drawer');
  const [form, setForm] = useState<DrawerFormState>(blankState);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<DrawerFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/data-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          connection: {
            host: form.host,
            port: form.port,
            database: form.database,
            user: form.user,
            password: form.password,
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    // There's no dedicated API for pre-save testing yet; surface a "best-effort
    // will verify on save" hint so the designed control still appears. Once
    // /api/data-sources/test lands we'll swap this to a real ping.
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTesting(false);
      setTestResult({ ok: true, message: t('testWillVerifyOnSave') });
    }, 200);
  }

  const canSave = !!(form.name && form.host && form.database && form.user && form.password);

  return (
    <Drawer
      title={t('newTitle')}
      subtitle={t('newSubtitle')}
      onClose={onClose}
      closeLabel={t('close')}
      footer={
        <>
          <GhostButton onClick={onClose} disabled={saving}>
            {t('cancel')}
          </GhostButton>
          <PrimaryButton onClick={handleSave} disabled={saving || !canSave}>
            {saving && <LightboardLoader size={12} ariaLabel="" />}
            <span>{t('add')}</span>
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FieldGrid cols={2}>
          <Field label={t('name')} hint={t('nameHint')}>
            <TextInput value={form.name} onChange={(v) => update({ name: v })} placeholder="cricket_prod" mono />
          </Field>
          <Field label={t('type')}>
            <Select value={form.type} onChange={(v) => update({ type: v })} options={CONNECTOR_OPTIONS} />
          </Field>
          <Field label={t('host')} full>
            <TextInput value={form.host} onChange={(v) => update({ host: v })} placeholder="db.acme.internal" mono />
          </Field>
          <Field label={t('port')}>
            <TextInput value={form.port} onChange={(v) => update({ port: v })} placeholder="5432" mono />
          </Field>
          <Field label={t('database')}>
            <TextInput value={form.database} onChange={(v) => update({ database: v })} placeholder="cricket_prod" mono />
          </Field>
          <Field label={t('user')}>
            <TextInput value={form.user} onChange={(v) => update({ user: v })} placeholder="lightboard_ro" mono />
          </Field>
          <Field label={t('password')}>
            <TextInput type="password" value={form.password} onChange={(v) => update({ password: v })} placeholder="••••••••" mono />
          </Field>
          <Field label={t('advanced')} full>
            <ToggleRow
              label={t('sslLabel')}
              description={t('sslDesc')}
              value={form.ssl}
              onChange={(v) => update({ ssl: v })}
            />
          </Field>
        </FieldGrid>

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
                </span>
              ) : (
                t('testDesc')
              )}
            </div>
          </div>
          <SecondaryButton size="sm" onClick={handleTest} disabled={testing || !form.host || !form.database}>
            {testing && <LightboardLoader size={12} ariaLabel="" />}
            <span>{t('runTest')}</span>
          </SecondaryButton>
        </div>

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
