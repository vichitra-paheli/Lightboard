'use client';

import { Label } from './label';

/**
 * One conversation entry in a group.
 */
interface ConvoItem {
  id: string;
  title: string;
}

/**
 * Group of conversations shown under a single time bucket (Today, Yesterday, ...).
 */
interface ConvoGroup {
  label: string;
  items: ConvoItem[];
}

/**
 * MOCK: Replace with real conversations once backend persistence lands
 * (see documentation/backend-ui-polish-followups.md §4). These fixtures
 * match the editorial handoff's example so the sidebar looks correct
 * during visual review before the wire-up ticket is done.
 */
const MOCK_GROUPS: ConvoGroup[] = [
  {
    label: 'Today',
    items: [
      { id: 'c1', title: 'Post 2014 IPL True Strike Rate' },
      { id: 'c2', title: 'RCB Team Analysis' },
    ],
  },
  {
    label: 'Yesterday',
    items: [
      { id: 'c3', title: 'Toss decision · win %' },
      { id: 'c4', title: 'Death overs economy' },
    ],
  },
  {
    label: 'This week',
    items: [
      { id: 'c5', title: 'Fielder impact model v2' },
      { id: 'c6', title: 'Venue-adjusted averages' },
      { id: 'c7', title: 'Powerplay SR trends' },
    ],
  },
];

/**
 * Props for {@link ConversationsList}.
 */
interface ConversationsListProps {
  /** Id of the currently-active conversation, if any. */
  activeId?: string | null;
  /** Called with the id of the selected conversation. No-op by default. */
  onSelect?: (id: string) => void;
}

/**
 * Grouped, time-bucketed conversations rendered in the Explore sidebar.
 *
 * Currently ships with hardcoded editorial fixture data — real conversation
 * titles come from the backend persistence ticket (see backend followups §4).
 * Selection is optional; when no handler is wired, clicks are no-ops.
 */
export function ConversationsList({ activeId, onSelect }: ConversationsListProps) {
  return (
    <div className="flex flex-col gap-3.5">
      <Label>Conversations</Label>
      {MOCK_GROUPS.map((g) => (
        <div key={g.label}>
          <div
            className="lb-mono-tag uppercase"
            style={{
              fontSize: 9,
              letterSpacing: '0.1em',
              color: 'var(--ink-6)',
              padding: '0 4px 4px',
            }}
          >
            {g.label}
          </div>
          <div className="flex flex-col gap-px">
            {g.items.map((i) => (
              <ConvoItemButton
                key={i.id}
                item={i}
                active={i.id === activeId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Single conversation row. Active state uses a 2px warm-accent left bar and
 * the `--bg-6` fill; passive rows fade between ink-3 (idle) and ink-2 (hover).
 */
function ConvoItemButton({
  item,
  active,
  onSelect,
}: {
  item: ConvoItem;
  active: boolean;
  onSelect?: (id: string) => void;
}) {
  return (
    <button
      type="button"
      title={item.title}
      onClick={() => onSelect?.(item.id)}
      className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors"
      style={{
        color: active ? 'var(--ink-1)' : 'var(--ink-3)',
        background: active ? 'var(--bg-6)' : 'transparent',
        fontWeight: active ? 500 : 400,
        borderLeft: active
          ? '2px solid var(--accent-warm)'
          : '2px solid transparent',
        paddingLeft: active ? 8 : 10,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = 'var(--ink-2)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = 'var(--ink-3)';
      }}
    >
      {item.title}
    </button>
  );
}
