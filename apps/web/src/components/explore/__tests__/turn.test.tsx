import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Turn } from '../turn';
import type { ChatMessageData } from '../chat-message';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Silence the /api/auth/me fetch inside UserMessage.
globalThis.fetch = vi.fn(async () =>
  new Response(JSON.stringify({ user: { name: 'A' } }), { status: 200 }),
) as unknown as typeof fetch;

const USER: ChatMessageData = {
  id: 'u',
  role: 'user',
  content: 'Show me the top batters',
};

const ASSIST: ChatMessageData = {
  id: 'a',
  role: 'assistant',
  content: 'Here you go',
  toolCalls: [
    { name: 'run_sql', status: 'done', durationMs: 42 },
  ],
  view: {
    title: 'Top batters',
    description: 'IPL 2014+',
    sql: 'SELECT 1',
    html: '<html><body>chart</body></html>',
  },
};

describe('<Turn>', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders in the editorial order: user → trace → chart → agent text', () => {
    const { container } = render(
      <Turn userMessage={USER} assistantMessage={ASSIST} />,
    );
    // Walk the top-level children of the turn container and identify each
    // block by a unique marker. The turn wrapper is a flex column whose
    // direct children are the blocks in order.
    const turnRoot = container.firstElementChild;
    expect(turnRoot).toBeTruthy();
    const blocks = Array.from(turnRoot!.children);

    // Block 0 — user message (contains the prompt text).
    expect(blocks[0]?.textContent).toContain('Show me the top batters');

    // Block 1 — trace card (has our shared background class token).
    expect(blocks[1]?.getAttribute('style') ?? '').toContain('var(--bg-3)');

    // Block 2 — inline chart frame (has bg-5 + rounded-[14px]).
    expect(blocks[2]?.getAttribute('style') ?? '').toContain('var(--bg-5)');

    // Block 3 — agent text. Contains the markdown-rendered content.
    expect(blocks[3]?.textContent).toContain('Here you go');
  });

  it('omits the chart block when no view is attached', () => {
    const { container } = render(
      <Turn
        userMessage={USER}
        assistantMessage={{ ...ASSIST, view: undefined }}
      />,
    );
    const turnRoot = container.firstElementChild;
    const blocks = Array.from(turnRoot!.children);
    // user + trace + agent text = 3 blocks.
    expect(blocks.length).toBe(3);
  });

  it('omits the trace block when no tool calls / thinking / delegations are present', () => {
    const { container } = render(
      <Turn
        userMessage={USER}
        assistantMessage={{
          ...ASSIST,
          toolCalls: [],
          agentDelegations: [],
          thinking: undefined,
          view: undefined,
        }}
      />,
    );
    const turnRoot = container.firstElementChild;
    // The placeholder returns null when empty, so children are
    // user + agent text (no trace, no chart).
    const blocks = Array.from(turnRoot!.children);
    expect(blocks.length).toBe(2);
  });
});
