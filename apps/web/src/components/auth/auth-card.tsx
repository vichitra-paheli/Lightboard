import type { ReactNode } from 'react';
import { Link } from 'next-view-transitions';
import styles from './auth-card.module.css';

/** Props for {@link AuthCard}. */
export interface AuthCardProps {
  /** Form body rendered inside the frosted-glass plate. */
  children: ReactNode;
  /** Localised plain prefix for the fine-print line (e.g. "No account?"). */
  promptText: string;
  /** Localised label for the fine-print link (e.g. "Create one"). */
  linkLabel: string;
  /** Href the fine-print link points at (e.g. "/register"). */
  linkHref: string;
}

/**
 * Shared frosted-glass card + below-card fine print used by both
 * {@link LoginForm} and {@link RegisterForm}. The card width, background,
 * backdrop-filter, border, and shadow live in `auth-card.module.css`.
 *
 * Callers pass the form contents via `children` and the localised strings
 * for the fine-print "No account? Create one" / "Already have an account?
 * Log in" line as explicit props so the copy can diverge per route without
 * any logic here.
 */
export function AuthCard({
  children,
  promptText,
  linkLabel,
  linkHref,
}: AuthCardProps) {
  return (
    <div className={styles.card}>
      {children}
      <p className={styles.finePrint}>
        {promptText}{' '}
        <Link href={linkHref} className={styles.finePrintLink}>
          {linkLabel}
        </Link>
      </p>
    </div>
  );
}
