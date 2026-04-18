'use client';

import { MarkdownRenderer } from '@/components/chat/markdown-renderer';
import { ThinkingState } from '@/components/chat/thinking-state';
import { ToolCallDetails, type ToolCallData } from '@/components/chat/tool-call-details';
import { AgentIndicator, type AgentIndicatorData } from '@/components/chat/agent-indicator';
import type { ViewSpec } from '@lightboard/viz-core';
import type { HtmlView } from '@/components/view-renderer';

export type { ToolCallData, AgentIndicatorData };

/** A message in the chat. */
export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Thinking/reasoning text from the agent, shown in a collapsible section. */
  thinking?: string;
  /** Tool calls with optional expandable input/output details. */
  toolCalls?: ToolCallData[];
  /** Sub-agent delegation indicators. */
  agentDelegations?: AgentIndicatorData[];
  isStreaming?: boolean;
  /**
   * Optional chart produced by this assistant message. Rendered inline
   * inside the turn (see {@link /components/explore/turn.tsx}). Populated
   * by `ExplorePageClient` when a `view_created` SSE event arrives. Remains
   * `undefined` on user messages and on assistant messages that did not
   * produce a chart. This field was added without migrating the message
   * model to `parts[]` — that refactor ships in PR 5.
   */
  view?: ViewSpec | HtmlView;
  /**
   * Data rows for the legacy ViewSpec renderer path. Ignored when
   * {@link ChatMessageData.view} is an `HtmlView` (HTML views embed their
   * own data).
   */
  viewData?: Record<string, unknown>[] | null;
}

/** Props for ChatMessage. */
interface ChatMessageProps {
  message: ChatMessageData;
}

/** Renders a single chat message with tool call details, agent indicators, and streaming support. */
export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${isUser ? 'ml-8' : 'mr-8'}`}
        style={{
          backgroundColor: isUser ? 'var(--color-primary)' : 'var(--color-card)',
          color: isUser ? 'var(--color-primary-foreground)' : 'var(--color-card-foreground)',
          borderWidth: isUser ? 0 : '1px',
          borderStyle: 'solid',
          borderColor: 'var(--color-border)',
        }}
      >
        {!isUser && message.thinking && (
          <ThinkingState
            thinking={message.thinking}
            isActive={message.isStreaming}
          />
        )}

        {message.content && isUser && (
          <p className="whitespace-pre-wrap">
            {message.content}
          </p>
        )}

        {message.content && !isUser && (
          <div>
            <MarkdownRenderer content={message.content} />
            {message.isStreaming && <StreamingCursor />}
          </div>
        )}

        {!message.content && message.isStreaming && (
          <p className="whitespace-pre-wrap">
            <StreamingCursor />
          </p>
        )}

        {/* Agent delegation indicators */}
        {message.agentDelegations && message.agentDelegations.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.agentDelegations.map((delegation, i) => (
              <AgentIndicator key={`${delegation.agent}-${i}`} delegation={delegation} />
            ))}
          </div>
        )}

        {/* Expandable tool call details */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc, i) => (
              <ToolCallDetails key={`${tc.name}-${i}`} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Blinking cursor shown during streaming text generation. */
function StreamingCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-4 w-0.5 animate-pulse"
      style={{ backgroundColor: 'var(--color-foreground)' }}
    />
  );
}
