'use client';

import { useTranslations } from 'next-intl';
import { useTransitionRouter } from 'next-view-transitions';
import { useState } from 'react';
import { RegisterForm } from '@/components/auth/register-form';

/** Register page. */
export default function RegisterPage() {
  const t = useTranslations('auth');
  const router = useTransitionRouter();
  const [error, setError] = useState('');

  async function handleRegister(data: {
    email: string;
    password: string;
    name: string;
    orgName: string;
  }) {
    setError('');
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const resData = await res.json();
      setError(resData.error ?? t('emailInUse'));
      return;
    }

    router.push('/');
    router.refresh();
  }

  return <RegisterForm onSubmit={handleRegister} error={error} />;
}
