'use client';


/** A message in the chat. */
export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; status: 'running' | 'done' | 'error' }[];
}

/** Props for ChatMessage. */
interface ChatMessageProps {
  message: ChatMessageData;
}

/** Renders a single chat message with tool call progress indicators. */
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
        {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded px-2 py-1 text-xs"
                style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}
              >
                <span>
                  {tc.status === 'running' && '⏳'}
                  {tc.status === 'done' && '✓'}
                  {tc.status === 'error' && '✗'}
                </span>
                <span>{tc.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
