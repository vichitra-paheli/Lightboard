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
  parts: [{ kind: 'text', text: 'Show me the top batters' }],
};

const ASSIST_INTERLEAVED: ChatMessageData = {
  id: 'a',
  role: 'assistant',
  // Parts[] preserves the temporal order: text → tool → chart → text.
  parts: [
    { kind: 'text', text: 'Planning the query…' },
    { kind: 'tool_call', name: 'run_sql', status: 'done', durationMs: 42 },
    {
      kind: 'view',
      view: {
        title: 'Top batters',
        description: 'IPL 2014+',
        sql: 'SELECT 1',
        html: '<html><body>chart</body></html>',
      },
      data: null,
    },
    { kind: 'text', text: 'Here you go' },
  ],
};

describe('<Turn>', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders user message and an assistant stream in that order', () => {
    const { container } = render(
      <Turn userMessage={USER} assistantMessage={ASSIST_INTERLEAVED} />,
    );
    const turnRoot = container.firstElementChild;
    expect(turnRoot).toBeTruthy();
    const blocks = Array.from(turnRoot!.children);

    // Block 0 — user message (contains the prompt text).
    expect(blocks[0]?.textContent).toContain('Show me the top batters');
    // Block 1 — the assistant stream wrapper.
    expect(blocks[1]).toBeTruthy();
    expect(blocks[1]?.textContent).toContain('Planning the query');
    expect(blocks[1]?.textContent).toContain('Here you go');
    expect(blocks[1]?.textContent).toContain('run_sql');
  });

  it('renders each part in its ordered slot inside the assistant stream', () => {
    const { container } = render(
      <Turn userMessage={USER} assistantMessage={ASSIST_INTERLEAVED} />,
    );
    // The assistant stream is the 2nd top-level block. Its children are
    // one block per part (tool rows nested under a solo wrapper).
    const turnRoot = container.firstElementChild!;
    const stream = turnRoot.children[1]!;
    const streamChildren = Array.from(stream.children);

    // text → tool → view → text = 4 stream children.
    expect(streamChildren.length).toBe(4);
    // First text part comes before the tool row.
    expect(streamChildren[0]?.textContent).toContain('Planning the query');
    // Tool call row is wrapped in a solo-trace div.
    expect(streamChildren[1]?.textContent).toContain('run_sql');
    // View has the bg-5 inline style token.
    expect(streamChildren[2]?.getAttribute('style') ?? '').toContain(
      'var(--bg-5)',
    );
    // Final text part.
    expect(streamChildren[3]?.textContent).toContain('Here you go');
  });

  it('omits the chart block when no view part is attached', () => {
    const assistant: ChatMessageData = {
      id: 'a',
      role: 'assistant',
      parts: [{ kind: 'text', text: 'No chart here' }],
    };
    const { container } = render(
      <Turn userMessage={USER} assistantMessage={assistant} />,
    );
    const turnRoot = container.firstElementChild!;
    const stream = turnRoot.children[1]!;
    // Only a single text part — stream has 1 child.
    expect(stream.children.length).toBe(1);
  });

  it('clusters consecutive tool calls into a single trace cluster', () => {
    const assistant: ChatMessageData = {
      id: 'a',
      role: 'assistant',
      parts: [
        { kind: 'tool_call', name: 'get_schema', status: 'done' },
        { kind: 'tool_call', name: 'run_sql', status: 'done' },
        { kind: 'text', text: 'Done.' },
      ],
    };
    const { container } = render(
      <Turn userMessage={USER} assistantMessage={assistant} />,
    );
    const turnRoot = container.firstElementChild!;
    const stream = turnRoot.children[1]!;
    // Two consecutive trace rows = 1 cluster + 1 text = 2 stream children.
    expect(stream.children.length).toBe(2);
    // The first child (cluster) contains both tool names.
    expect(stream.children[0]?.textContent).toContain('get_schema');
    expect(stream.children[0]?.textContent).toContain('run_sql');
  });

  it('preserves text between tool calls as a separate block (the PR 5 fix)', () => {
    const assistant: ChatMessageData = {
      id: 'a',
      role: 'assistant',
      parts: [
        { kind: 'text', text: 'Before tool.' },
        { kind: 'tool_call', name: 'run_sql', status: 'done' },
        { kind: 'text', text: 'After tool.' },
      ],
    };
    const { container } = render(
      <Turn userMessage={USER} assistantMessage={assistant} />,
    );
    const turnRoot = container.firstElementChild!;
    const stream = turnRoot.children[1]!;
    // text → tool → text = 3 stream children; tool renders as solo
    // (single trace row, no cluster wrapper).
    expect(stream.children.length).toBe(3);
    expect(stream.children[0]?.textContent).toContain('Before tool.');
    expect(stream.children[1]?.textContent).toContain('run_sql');
    expect(stream.children[2]?.textContent).toContain('After tool.');
  });
});
