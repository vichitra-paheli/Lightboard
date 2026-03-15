'use client';

/** A message in the chat. */
export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; status: 'running' | 'done' | 'error' }[];
  isStreaming?: boolean;
}

/** Props for ChatMessage. */
interface ChatMessageProps {
  message: ChatMessageData;
}

/** Renders a single chat message with tool call progress indicators and streaming support. */
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
        {message.content && (
          <p className="whitespace-pre-wrap">
            {message.content}
            {message.isStreaming && <StreamingCursor />}
          </p>
        )}

        {!message.content && message.isStreaming && (
          <p className="whitespace-pre-wrap">
            <StreamingCursor />
          </p>
        )}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc, i) => (
              <ToolCallBadge key={i} name={tc.name} status={tc.status} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Props for ToolCallBadge. */
interface ToolCallBadgeProps {
  name: string;
  status: 'running' | 'done' | 'error';
}

/** Displays a tool call with a status indicator (spinner, checkmark, or error). */
function ToolCallBadge({ name, status }: ToolCallBadgeProps) {
  return (
    <div
      className="flex items-center gap-2 rounded px-2 py-1 text-xs"
      style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}
    >
      <span>
        {status === 'running' && <SpinnerIcon />}
        {status === 'done' && '\u2713'}
        {status === 'error' && '\u2717'}
      </span>
      <span>{name}</span>
    </div>
  );
}

/** Animated spinner icon for in-progress tool calls. */
function SpinnerIcon() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full"
      style={{
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: 'var(--color-muted-foreground)',
        borderTopColor: 'transparent',
      }}
    />
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
