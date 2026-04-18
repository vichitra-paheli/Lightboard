import type { ReactNode } from 'react';
import { LightboardLoader } from '../brand';
import { ArrowIcon } from './field-icons';
import styles from './auth-card.module.css';

/** Props for {@link SubmitButton}. */
export interface SubmitButtonProps {
  /** Whether the submit is currently in flight (shows spinner + loading label). */
  loading: boolean;
  /** Whether the form is valid enough to submit. */
  canSubmit: boolean;
  /** Resting label — e.g. "Sign in", "Create account". */
  label: ReactNode;
  /** Loading-state label — e.g. "Signing in…". */
  loadingLabel: ReactNode;
}

/**
 * Primary form submit button for the auth pages.
 *
 * Renders the ink-1 / bg-2 pill button with an arrow icon that slides on
 * hover, swaps to a spinner + custom loading label while a request is in
 * flight, and flips to the warm-amber treatment via `data-sent` so the
 * "sent" state reads at a glance.
 */
export function SubmitButton({
  loading,
  canSubmit,
  label,
  loadingLabel,
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={!canSubmit || loading}
      data-sent={loading}
      className={`${styles.btn} ${styles.btnPrimary}`}
    >
      {loading ? (
        <>
          <LightboardLoader size={12} />
          {loadingLabel}
        </>
      ) : (
        <>
          {label}
          <ArrowIcon className={styles.arrow} />
        </>
      )}
    </button>
  );
}
