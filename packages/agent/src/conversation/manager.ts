import type { Message } from '../provider/types';

const DEFAULT_MAX_MESSAGES = 50;
const SUMMARY_THRESHOLD = 40;

/**
 * Manages conversation history with context window management.
 * Stores messages, handles truncation, and injects context.
 */
export class ConversationManager {
  private messages: Message[] = [];
  private maxMessages: number;

  constructor(options?: { maxMessages?: number }) {
    this.maxMessages = options?.maxMessages ?? DEFAULT_MAX_MESSAGES;
  }

  /** Add a message to the conversation. */
  addMessage(message: Message): void {
    this.messages.push(message);
    this.truncateIfNeeded();
  }

  /** Get the full conversation history. */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /** Get the message count. */
  get length(): number {
    return this.messages.length;
  }

  /** Clear the conversation history. */
  clear(): void {
    this.messages = [];
  }

  /** Get the last message in the conversation. */
  lastMessage(): Message | undefined {
    return this.messages[this.messages.length - 1];
  }

  /**
   * Truncates conversation history when it exceeds the threshold.
   * Keeps the first message (usually sets context) and the most recent messages.
   */
  private truncateIfNeeded(): void {
    if (this.messages.length <= this.maxMessages) return;

    // Keep the first 2 messages (initial context) and the last N
    const keepRecent = this.maxMessages - 2;
    const first = this.messages.slice(0, 2);
    const recent = this.messages.slice(-keepRecent);

    // Insert a summary marker
    this.messages = [
      ...first,
      {
        role: 'system' as const,
        content: `[Previous ${this.messages.length - keepRecent - 2} messages truncated for context window management]`,
      },
      ...recent,
    ];
  }
}
