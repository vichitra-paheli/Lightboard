'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthShell } from './auth-shell';
import { AuthCard } from './auth-card';
import styles from './auth-card.module.css';
import { FormField } from './form-field';
import {
  BuildingIcon,
  LockIcon,
  MailIcon,
  UserIcon,
} from './field-icons';
import { SubmitButton } from './submit-button';
import { PasswordToggle } from './password-toggle';

/** Props for the {@link RegisterForm} component. */
export interface RegisterFormProps {
  /** Handler invoked when the user submits a complete registration payload. */
  onSubmit: (data: {
    email: string;
    password: string;
    name: string;
    orgName: string;
  }) => Promise<void>;
  /** Localised error message, shown above the form when present. */
  error?: string;
}

/**
 * Redesigned registration form, visually locked to {@link LoginForm}.
 *
 * Shares the frosted card, icon-in-field inputs, and primary button styling.
 * The Google SSO button is deliberately omitted here — registration needs an
 * organisation name, which doesn't cleanly flow out of an OAuth handshake,
 * and we don't want to imply support we can't deliver yet.
 */
export function RegisterForm({ onSubmit, error }: RegisterFormProps) {
  const t = useTranslations('auth');
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit =
    orgName.trim().length > 0 &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await onSubmit({ email, password, name, orgName });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <AuthCard
        promptText={t('hasAccountPrompt')}
        linkLabel={t('loginLink')}
        linkHref="/login"
      >
        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          {error && (
            <div className={styles.errorRow} role="alert">
              <span className={styles.errorLabel}>{t('errorLabel')}</span>
              <span>{error}</span>
            </div>
          )}

          <FormField
            id="orgName"
            label={t('orgName')}
            icon={<BuildingIcon />}
            inputProps={{
              type: 'text',
              required: true,
              autoComplete: 'organization',
              placeholder: t('orgNamePlaceholder'),
              value: orgName,
              onChange: (e) => setOrgName(e.target.value),
            }}
          />

          <FormField
            id="name"
            label={t('name')}
            icon={<UserIcon />}
            inputProps={{
              type: 'text',
              required: true,
              autoComplete: 'name',
              placeholder: t('namePlaceholder'),
              value: name,
              onChange: (e) => setName(e.target.value),
            }}
          />

          <FormField
            id="email"
            label={t('email')}
            icon={<MailIcon />}
            inputProps={{
              type: 'email',
              required: true,
              autoComplete: 'email',
              placeholder: t('emailPlaceholder'),
              value: email,
              onChange: (e) => setEmail(e.target.value),
            }}
          />

          <FormField
            id="password"
            label={t('passwordLabel')}
            icon={<LockIcon />}
            trailing={
              <PasswordToggle
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                labels={{
                  show: t('showPassword'),
                  hide: t('hidePassword'),
                  showAria: t('showPasswordAria'),
                  hideAria: t('hidePasswordAria'),
                }}
              />
            }
            inputProps={{
              type: showPassword ? 'text' : 'password',
              required: true,
              autoComplete: 'new-password',
              minLength: 8,
              placeholder: t('passwordPlaceholder'),
              value: password,
              onChange: (e) => setPassword(e.target.value),
            }}
          />

          <SubmitButton
            loading={loading}
            canSubmit={canSubmit}
            label={t('register')}
            loadingLabel={t('creatingAccount')}
          />
        </form>
      </AuthCard>
    </AuthShell>
  );
}
