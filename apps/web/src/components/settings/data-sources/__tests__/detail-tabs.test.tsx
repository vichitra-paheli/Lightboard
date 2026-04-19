import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { DetailTabs } from '../detail-tabs';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      schema: 'Schema doc',
      connection: 'Connection',
      access: 'Access & roles',
    };
    return map[key] ?? key;
  },
}));

describe('DetailTabs', () => {
  afterEach(() => cleanup());

  it('renders all three tabs', () => {
    render(<DetailTabs tab="schema" setTab={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Schema doc' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Connection' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Access & roles' })).toBeDefined();
  });

  it('marks the active tab with aria-selected=true', () => {
    render(<DetailTabs tab="connection" setTab={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Connection' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Schema doc' }).getAttribute('aria-selected')).toBe('false');
  });

  it('fires setTab when a different tab is clicked', () => {
    const setTab = vi.fn();
    render(<DetailTabs tab="schema" setTab={setTab} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Connection' }));
    expect(setTab).toHaveBeenCalledWith('connection');
  });
});
