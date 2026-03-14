'use client';

import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle, Input, Label } from '@lightboard/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Connector type options. */
const CONNECTOR_TYPES = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'clickhouse', label: 'ClickHouse' },
];

/** Props for AddDataSourceForm. */
interface AddDataSourceFormProps {
  onSave: (data: {
    name: string;
    type: string;
    connection: Record<string, string>;
  }) => Promise<void>;
  onCancel: () => void;
  onTestConnection: (data: Record<string, string>) => Promise<{ success: boolean; message: string }>;
}

/** Form for adding a new data source. Dynamically renders fields based on connector type. */
export function AddDataSourceForm({ onSave, onCancel, onTestConnection }: AddDataSourceFormProps) {
  const t = useTranslations('dataSources');
  const [name, setName] = useState('');
  const [type, setType] = useState('postgres');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTestConnection({ host, port, database, user, password });
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: t('testFailed') });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        name,
        type,
        connection: { host, port, database, user, password },
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-lg mx-auto mt-6">
      <CardHeader>
        <CardTitle>{t('addNew')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ds-name">{t('name')}</Label>
          <Input id="ds-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ds-type">{t('type')}</Label>
          <select
            id="ds-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="flex h-10 w-full rounded-md px-3 py-2 text-sm"
            style={{
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--color-input)',
              backgroundColor: 'transparent',
              color: 'var(--color-foreground)',
            }}
          >
            {CONNECTOR_TYPES.map((ct) => (
              <option key={ct.value} value={ct.value}>{ct.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ds-host">{t('host')}</Label>
            <Input id="ds-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ds-port">{t('port')}</Label>
            <Input id="ds-port" value={port} onChange={(e) => setPort(e.target.value)} placeholder="5432" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ds-database">{t('database')}</Label>
          <Input id="ds-database" value={database} onChange={(e) => setDatabase(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ds-user">{t('user')}</Label>
            <Input id="ds-user" value={user} onChange={(e) => setUser(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ds-password">{t('password')}</Label>
            <Input id="ds-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        </div>

        {testResult && (
          <div
            className="rounded-md p-3 text-sm"
            style={{
              backgroundColor: testResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: testResult.success ? '#22c55e' : '#ef4444',
            }}
          >
            {testResult.success ? t('connected') : t('disconnected')}: {testResult.message}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <button
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm"
          style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
        >
          {t('cancel')}
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={testing || !host || !database}
            className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
          >
            {testing ? '...' : t('testConnection')}
          </button>
          <Button onClick={handleSave} disabled={saving || !name || !host || !database}>
            {saving ? '...' : t('save')}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
