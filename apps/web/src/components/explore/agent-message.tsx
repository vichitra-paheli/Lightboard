'use client';

import { MarkdownRenderer } from '@/components/chat/markdown-renderer';

/**
 * Props for {@link AgentMessage}.
 */
interface AgentMessageProps {
  content: string;
  isStreaming?: boolean;
}

/**
 * Agent message row rendered inside a conversational turn. A 26×26 dark
 * rounded-square avatar on the left carries a miniature Lightboard sigil
 * (cross-plus-dot glyph in the warm `--accent` color); the message body
 * supports markdown via {@link MarkdownRenderer} and is constrained to a
 * 720px reading measure.
 *
 * When `isStreaming` is true, a blinking 1px cursor appears at the end of
 * the text so the user sees token-by-token progress. The cursor uses the
 * `cursorBlink` keyframe defined in globals.css.
 */
export function AgentMessage({ content, isStreaming }: AgentMessageProps) {
  return (
    <div className="flex items-start gap-3.5">
      <div
        aria-hidden="true"
        className="mt-px flex h-[26px] w-[26px] flex-none items-center justify-center rounded-md"
        style={{
          background: 'var(--bg-4)',
          border: '1px solid var(--line-3)',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 1.5 L6 10.5 M2 3 L10 3 M2 9 L10 9"
            stroke="var(--accent)"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          <circle cx="6" cy="6" r="1.4" fill="var(--accent)" />
        </svg>
      </div>
      <div
        className="lb-agent-msg pt-0.5"
        style={{ maxWidth: 720 }}
      >
        {content && <MarkdownRenderer content={content} />}
        {isStreaming && (
          <span
            className="ml-0.5 inline-block h-4 w-[2px] align-middle"
            style={{
              background: 'var(--ink-1)',
              animation: 'cursorBlink 900ms step-end infinite',
            }}
          />
        )}
      </div>
    </div>
  );
}
