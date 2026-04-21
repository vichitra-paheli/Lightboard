import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AssistantStream } from '../assistant-stream';
import type { MessagePart } from '../chat-message';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// MarkdownRenderer hits `next-intl` transitively; the AgentMessage wrapper
// around it does not. No other collaborators to mock.

describe('<AssistantStream> ghost-text suppression', () => {
  afterEach(() => cleanup());

  it('skips rendering an empty text part that sits before a trace cluster', () => {
    // Whitespace-only text parts occasionally fall out of Claude's stream
    // around tool boundaries. Rendering them adds a ghost 26px agent avatar
    // next to the following cluster with nothing on its right — the exact
    // "empty gutter above the panel" the user flagged in round-2 review.
    const parts: MessagePart[] = [
      { kind: 'text', text: '   \n  ' },
      {
        kind: 'tool_call',
        name: 'run_sql',
        status: 'done',
        durationMs: 12,
      },
    ];
    const { container } = render(<AssistantStream parts={parts} />);
    // No AgentMessage avatars — the 26×26 rounded-md div from
    // AgentMessage is unique to that component.
    const avatars = container.querySelectorAll('.rounded-md.h-\\[26px\\]');
    expect(avatars.length).toBe(0);
  });

  it('still renders a non-empty text part with its avatar', () => {
    const parts: MessagePart[] = [
      { kind: 'text', text: 'Checking the schema.' },
    ];
    const { container } = render(<AssistantStream parts={parts} />);
    // Text content should appear.
    expect(container.textContent).toContain('Checking the schema.');
  });

  it('keeps rendering an empty text part when it is the actively streaming last part', () => {
    // While the agent is still typing into the tail text part, the text can
    // legitimately be empty for a few frames. We keep rendering it so the
    // blinking cursor has a home — otherwise the UI flickers avatar-in,
    // avatar-out as every delta arrives.
    const parts: MessagePart[] = [
      {
        kind: 'tool_call',
        name: 'run_sql',
        status: 'done',
        durationMs: 10,
      },
      { kind: 'text', text: '' },
    ];
    const { container } = render(
      <AssistantStream parts={parts} isStreaming={true} />,
    );
    // The empty trailing text part renders because it's the streaming tail.
    // Detect via the cursor element (1px-wide inline-block span).
    const cursors = container.querySelectorAll('span[class*="inline-block"]');
    expect(cursors.length).toBeGreaterThan(0);
  });
});
