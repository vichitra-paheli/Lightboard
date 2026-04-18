/**
 * Tiny inline SVG icons for the auth form fields. Inherit `currentColor` so
 * the `.field-icon` class in `auth-card.module.css` drives the tint via a
 * design-token color.
 */

/** User silhouette — used on username/email inputs. */
export function UserIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <circle
        cx="6.5"
        cy="4.5"
        r="2.2"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
      />
      <path
        d="M2 11.2c.6-2 2.4-3.2 4.5-3.2s3.9 1.2 4.5 3.2"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Padlock — used on password inputs. */
export function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <rect
        x="2.5"
        y="5.8"
        width="8"
        height="5.2"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
      />
      <path
        d="M4.3 5.8V4a2.2 2.2 0 014.4 0v1.8"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Office building — used on organization-name input. */
export function BuildingIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <rect
        x="2.5"
        y="2"
        width="8"
        height="9"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
      />
      <path
        d="M4.6 4.5h0M4.6 6.5h0M4.6 8.5h0M8.4 4.5h0M8.4 6.5h0M8.4 8.5h0"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Envelope — used on email inputs when a separate icon from the user icon is wanted. */
export function MailIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <rect
        x="1.5"
        y="3"
        width="10"
        height="7"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
      />
      <path
        d="M1.8 3.6 6.5 7.2l4.7-3.6"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Small right-arrow — used inside the primary submit button. */
export function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M1 6h9M6 2l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Google brand glyph — decorative; the button's visible label carries the name. */
export function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z"
      />
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.63z"
      />
      <path
        fill="#FBBC05"
        d="M3.88 10.78a5.5 5.5 0 01-.29-1.78c0-.62.11-1.22.29-1.78V4.96H.96A9 9 0 000 9c0 1.45.35 2.82.96 4.04l2.92-2.26z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.87.87-3.04.87-2.38 0-4.4-1.57-5.13-3.74H.96v2.33A9 9 0 009 18z"
      />
    </svg>
  );
}
