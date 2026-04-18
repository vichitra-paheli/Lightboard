import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Thread, groupTurns } from '../thread';
import type { ChatMessageData } from '../chat-message';

// next-intl's useTranslations is the only translation surface Thread touches;
// stubbing it here returns the key back so assertions can target the literal
// copy from `en.json` without wiring the full provider.
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const dict: Record<string, string> = {
      emptyTitle: 'Ask a question',
      emptySubtitle:
        'Pick a data source in the sidebar and send a prompt to start exploring.',
      conversationHeader: '{date} · {source}',
    };
    return (key: string, values?: Record<string, string>) => {
      const template = dict[key] ?? key;
      if (!values) return template;
      return template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? `{${k}}`);
    };
  },
}));

// UserMessage fetches /api/auth/me on mount — stub globally so the network
// call never fires in the test environment.
globalThis.fetch = vi.fn(async () =>
  new Response(JSON.stringify({ user: { name: 'Alex' } }), { status: 200 }),
) as unknown as typeof fetch;

const USER_A: ChatMessageData = {
  id: 'u1',
  role: 'user',
  parts: [{ kind: 'text', text: 'Hello?' }],
};
const ASSIST_A: ChatMessageData = {
  id: 'a1',
  role: 'assistant',
  parts: [{ kind: 'text', text: 'Hi' }],
};
const USER_B: ChatMessageData = {
  id: 'u2',
  role: 'user',
  parts: [{ kind: 'text', text: 'More' }],
};
const ASSIST_B: ChatMessageData = {
  id: 'a2',
  role: 'assistant',
  parts: [{ kind: 'text', text: 'Sure' }],
};

describe('groupTurns', () => {
  it('pairs alternating user + assistant messages', () => {
    const turns = groupTurns([USER_A, ASSIST_A, USER_B, ASSIST_B]);
    expect(turns).toHaveLength(2);
    expect(turns[0]?.user.id).toBe('u1');
    expect(turns[0]?.assistant?.id).toBe('a1');
    expect(turns[1]?.user.id).toBe('u2');
    expect(turns[1]?.assistant?.id).toBe('a2');
  });

  it('opens a turn without an assistant when a user message is still pending', () => {
    const turns = groupTurns([USER_A]);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.user.id).toBe('u1');
    expect(turns[0]?.assistant).toBeUndefined();
  });

  it('drops leading assistant-only messages (no user to pair with)', () => {
    const turns = groupTurns([ASSIST_A, USER_A]);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.user.id).toBe('u1');
  });
});

describe('<Thread>', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the empty state when there are no messages', () => {
    const { getByText } = render(
      <Thread messages={[]} selectedSource={null} dataSources={[]} />,
    );
    expect(getByText('Ask a question')).toBeTruthy();
  });

  it('renders a conversation header once there is a first user message', () => {
    const { getByRole } = render(
      <Thread
        messages={[USER_A]}
        selectedSource={null}
        dataSources={[]}
      />,
    );
    // The header uses an h1 — use getByRole so we anchor on the semantic role.
    const heading = getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('Hello?');
  });

  it('renders one turn per user/assistant pair', () => {
    const { container } = render(
      <Thread
        messages={[USER_A, ASSIST_A, USER_B, ASSIST_B]}
        selectedSource={null}
        dataSources={[]}
      />,
    );
    // Each Turn contains a user avatar (aria-hidden) and an agent-message
    // avatar (aria-hidden). Two turns × 2 avatars each = at least 4 hidden
    // glyphs (the sigil SVG inside the agent avatar adds more).
    const hiddenAvatars = container.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenAvatars.length).toBeGreaterThanOrEqual(4);
  });
});
