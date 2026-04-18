import styles from './auth-card.module.css';

/** Props for {@link PasswordToggle}. */
export interface PasswordToggleProps {
  /** Whether the password is currently visible as plain text. */
  visible: boolean;
  /** Fires when the user taps the toggle. */
  onToggle: () => void;
  /** Translated "Show" / "Hide" labels + their accessible-name counterparts. */
  labels: {
    show: string;
    hide: string;
    showAria: string;
    hideAria: string;
  };
}

/**
 * Inline Show/Hide toggle rendered inside the password-field frame. Used by
 * both {@link LoginForm} and {@link RegisterForm} so the behaviour stays
 * identical across the two routes.
 */
export function PasswordToggle({ visible, onToggle, labels }: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? labels.hideAria : labels.showAria}
      className={styles.toggle}
    >
      {visible ? labels.hide : labels.show}
    </button>
  );
}
