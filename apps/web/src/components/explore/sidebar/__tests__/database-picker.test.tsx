import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { DatabasePicker } from '../database-picker';
import type { DataSourceOption } from '../../data-source-selector';

const SOURCES: DataSourceOption[] = [
  { id: 'cricket', name: 'cricket', type: 'postgres' },
  { id: 'events', name: 'events', type: 'clickhouse' },
];

describe('<DatabasePicker>', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the current source name in the trigger', () => {
    const { getByText } = render(
      <DatabasePicker sources={SOURCES} selectedId="cricket" onChange={() => {}} />,
    );
    // The trigger renders both the name and the uppercase type tag.
    expect(getByText('cricket')).toBeTruthy();
    expect(getByText('postgres')).toBeTruthy();
  });

  it('opens the dropdown on trigger click and lists all sources', () => {
    const { getByRole, container } = render(
      <DatabasePicker sources={SOURCES} selectedId="cricket" onChange={() => {}} />,
    );
    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-db-picker-trigger]',
    );
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger!);

    const listbox = getByRole('listbox');
    const options = listbox.querySelectorAll('[role="option"]');
    expect(options.length).toBe(SOURCES.length);
  });

  it('calls onChange with the selected id and closes the dropdown', () => {
    const onChange = vi.fn();
    const { getByText, container, queryByRole } = render(
      <DatabasePicker sources={SOURCES} selectedId="cricket" onChange={onChange} />,
    );
    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-db-picker-trigger]',
    );
    fireEvent.click(trigger!);

    // `events` appears twice once the list is open (the list row + the tag).
    // `getAllByText` would also match, but clicking the row-level button is
    // what we care about. Find it by the role=option wrapper.
    const eventsRow = queryByRole('option', { selected: false });
    expect(eventsRow).toBeTruthy();
    fireEvent.click(eventsRow!);
    expect(onChange).toHaveBeenCalledWith('events');

    // Dropdown closes after selection.
    expect(queryByRole('listbox')).toBeNull();

    // Silence unused warning — we asserted the visible trigger above.
    void getByText;
  });

  it('carries the data-source-selector attribute for the Cmd+K shortcut', () => {
    const { container } = render(
      <DatabasePicker sources={SOURCES} selectedId="cricket" onChange={() => {}} />,
    );
    const trigger = container.querySelector('[data-source-selector]');
    expect(trigger).toBeTruthy();
  });
});
