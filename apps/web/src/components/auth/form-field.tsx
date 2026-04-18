import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './auth-card.module.css';

/** Props for {@link FormField}. */
export interface FormFieldProps {
  /** Unique field id — drives the `<label htmlFor>` / `<input id>` link. */
  id: string;
  /** Uppercase-mono label shown above the field. */
  label: string;
  /** Optional right-side auxiliary slot (e.g. "Forgot?" link). */
  aux?: ReactNode;
  /** Leading icon rendered inside the field frame. */
  icon: ReactNode;
  /** Trailing slot inside the field frame (e.g. Show/Hide toggle). */
  trailing?: ReactNode;
  /**
   * Forwarded to the `<input>`. `className` is ignored — the field styling is
   * fully owned by `auth-card.module.css` so the look can't drift.
   */
  inputProps: Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'>;
}

/**
 * A single labeled input row inside the auth frosted card.
 *
 * Encapsulates the repeating label + field frame + icon layout so
 * `LoginForm` / `RegisterForm` stay focused on their own field lists and
 * submission logic rather than field chrome.
 */
export function FormField({
  id,
  label,
  aux,
  icon,
  trailing,
  inputProps,
}: FormFieldProps) {
  return (
    <div className={styles.fieldLabel}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.labelText}>
          {label}
        </label>
        {aux}
      </div>
      <div className={styles.field}>
        <span className={styles.fieldIcon}>{icon}</span>
        <input id={id} className={styles.input} {...inputProps} />
        {trailing}
      </div>
    </div>
  );
}
