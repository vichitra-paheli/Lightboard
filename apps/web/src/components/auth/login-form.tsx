'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthShell } from './auth-shell';
import { AuthCard } from './auth-card';
import styles from './auth-card.module.css';
import { FormField } from './form-field';
import { UserIcon, LockIcon } from './field-icons';
import { SubmitButton } from './submit-button';
import { GoogleButton } from './google-button';
import { PasswordToggle } from './password-toggle';

/** Props for the {@link LoginForm} component. */
export interface LoginFormProps {
  /** Handler invoked when the user submits valid credentials. */
  onSubmit: (email: string, password: string) => Promise<void>;
  /** Localised error message, shown above the form when present. */
  error?: string;
}

/**
 * Redesigned login form rendered inside the {@link AuthShell} chrome.
 *
 * Behaviour unchanged from the prior version — this component still calls
 * `onSubmit(email, password)` and surfaces the caller's `error` prop. The
 * visual layer is now the frosted-glass card from the design handoff with
 * icon-in-field inputs, a password Show/Hide toggle, a primary Sign-in
 * button, and a non-functional "Continue with Google" placeholder.
 *
 * Non-functional placeholders (flagged for future PRs):
 *   - "Forgot?" link — href="#" until password reset ships.
 *   - Google SSO button — no onClick until OAuth ships.
 */
export function LoginForm({ onSubmit, error }: LoginFormProps) {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await onSubmit(email, password);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <AuthCard
        promptText={t('noAccountPrompt')}
        linkLabel={t('createOneLink')}
        linkHref="/register"
      >
        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          {error && (
            <div className={styles.errorRow} role="alert">
              <span className={styles.errorLabel}>{t('errorLabel')}</span>
              <span>{error}</span>
            </div>
          )}

          <FormField
            id="email"
            label={t('usernameLabel')}
            icon={<UserIcon />}
            inputProps={{
              type: 'email',
              required: true,
              autoComplete: 'username',
              placeholder: t('emailPlaceholder'),
              value: email,
              onChange: (e) => setEmail(e.target.value),
            }}
          />

          <FormField
            id="password"
            label={t('passwordLabel')}
            aux={
              // Placeholder — password reset flow not yet shipped.
              <a href="#" className={styles.labelAux} aria-disabled="true">
                {t('forgot')}
              </a>
            }
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
              autoComplete: 'current-password',
              placeholder: t('passwordPlaceholder'),
              value: password,
              onChange: (e) => setPassword(e.target.value),
            }}
          />

          <SubmitButton
            loading={loading}
            canSubmit={canSubmit}
            label={t('signIn')}
            loadingLabel={t('signingIn')}
          />

          <div className={styles.divider}>
            <div className={styles.dividerLine} />
            <span className={styles.dividerText}>{t('orDivider')}</span>
            <div className={styles.dividerLine} />
          </div>

          <GoogleButton label={t('continueWithGoogle')} />
        </form>
      </AuthCard>
    </AuthShell>
  );
}
