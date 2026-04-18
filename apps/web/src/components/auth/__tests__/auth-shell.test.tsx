import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AuthShell } from '../auth-shell';

// Stub next-intl — assertions match the English copy in `messages/en.json`.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      tagline: 'The thinking surface for your data.',
      buildTag: 'lightboard · v1.0',
      privacy: 'Privacy',
      terms: 'Terms',
      copyright: '© 2026',
    };
    return map[key] ?? key;
  },
}));

// Stub matchMedia so the GridBackdrop doesn't blow up in jsdom.
function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

describe('AuthShell', () => {
  beforeEach(() => installMatchMedia());
  afterEach(() => cleanup());

  it('renders the Lightboard sigil', () => {
    render(
      <AuthShell>
        <div data-testid="child">child</div>
      </AuthShell>,
    );
    expect(screen.getByLabelText('Lightboard')).toBeDefined();
  });

  it('renders the default tagline, build tag, and fine-print links', () => {
    render(
      <AuthShell>
        <div />
      </AuthShell>,
    );
    expect(
      screen.getByText('The thinking surface for your data.'),
    ).toBeDefined();
    expect(screen.getByText('lightboard · v1.0')).toBeDefined();
    expect(screen.getByText('Privacy')).toBeDefined();
    expect(screen.getByText('Terms')).toBeDefined();
    expect(screen.getByText('© 2026')).toBeDefined();
  });

  it('respects a caller-supplied tagline', () => {
    render(
      <AuthShell tagline="Custom tagline for this route.">
        <div />
      </AuthShell>,
    );
    expect(screen.getByText('Custom tagline for this route.')).toBeDefined();
    expect(
      screen.queryByText('The thinking surface for your data.'),
    ).toBeNull();
  });

  it('renders children in the center stack', () => {
    render(
      <AuthShell>
        <div data-testid="auth-card">form goes here</div>
      </AuthShell>,
    );
    expect(screen.getByTestId('auth-card').textContent).toBe(
      'form goes here',
    );
  });
});
