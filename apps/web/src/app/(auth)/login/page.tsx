'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LoginForm } from '@/components/auth/login-form';

/** Login page. */
export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [error, setError] = useState('');

  async function handleLogin(email: string, password: string) {
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? t('invalidCredentials'));
      return;
    }

    router.push('/');
    router.refresh();
  }

  return <LoginForm onSubmit={handleLogin} error={error} />;
}
