import { describe, expect, it } from 'vitest';
import { ConversationManager } from './manager';

describe('ConversationManager', () => {
  it('stores and retrieves messages', () => {
    const mgr = new ConversationManager();
    mgr.addMessage({ role: 'user', content: 'Hello' });
    mgr.addMessage({ role: 'assistant', content: 'Hi there!' });

    expect(mgr.length).toBe(2);
    expect(mgr.getMessages()).toHaveLength(2);
  });

  it('returns last message', () => {
    const mgr = new ConversationManager();
    mgr.addMessage({ role: 'user', content: 'First' });
    mgr.addMessage({ role: 'user', content: 'Second' });
    expect(mgr.lastMessage()?.content).toBe('Second');
  });

  it('returns undefined for empty conversation', () => {
    const mgr = new ConversationManager();
    expect(mgr.lastMessage()).toBeUndefined();
  });

  it('clears conversation', () => {
    const mgr = new ConversationManager();
    mgr.addMessage({ role: 'user', content: 'Hello' });
    mgr.clear();
    expect(mgr.length).toBe(0);
  });

  it('truncates when exceeding max messages', () => {
    const mgr = new ConversationManager({ maxMessages: 5 });

    for (let i = 0; i < 10; i++) {
      mgr.addMessage({ role: 'user', content: `Message ${i}` });
    }

    // Should be truncated to ~5 messages
    expect(mgr.length).toBeLessThanOrEqual(6); // 2 first + 1 summary + 3 recent
  });

  it('preserves first two messages on truncation', () => {
    const mgr = new ConversationManager({ maxMessages: 5 });

    mgr.addMessage({ role: 'user', content: 'First' });
    mgr.addMessage({ role: 'assistant', content: 'Second' });

    for (let i = 0; i < 10; i++) {
      mgr.addMessage({ role: 'user', content: `Extra ${i}` });
    }

    const messages = mgr.getMessages();
    expect(messages[0]!.content).toBe('First');
    expect(messages[1]!.content).toBe('Second');
  });

  it('returns copies of messages (immutable)', () => {
    const mgr = new ConversationManager();
    mgr.addMessage({ role: 'user', content: 'Hello' });

    const msgs = mgr.getMessages();
    msgs.push({ role: 'user', content: 'injected' });
    expect(mgr.length).toBe(1); // Original unchanged
  });
});
