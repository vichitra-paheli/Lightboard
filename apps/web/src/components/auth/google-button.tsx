import { GoogleIcon } from './field-icons';
import styles from './auth-card.module.css';

/** Props for {@link GoogleButton}. */
export interface GoogleButtonProps {
  /** Visible button label — translated by the caller. */
  label: string;
}

/**
 * Non-functional "Continue with Google" button. Shipped as a visual
 * placeholder while SSO isn't wired; clicking does nothing today.
 *
 * Kept as a `type="button"` so it never submits the parent form if pressed,
 * and left un-disabled so keyboard focus order stays natural once OAuth is
 * wired. A comment at the callsite flags the temporary state.
 */
export function GoogleButton({ label }: GoogleButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.btn} ${styles.btnGoogle}`}
      aria-disabled="true"
      onClick={(e) => e.preventDefault()}
    >
      <GoogleIcon />
      {label}
    </button>
  );
}
