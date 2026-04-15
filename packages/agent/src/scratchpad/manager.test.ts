import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScratchpadManager } from './manager';

describe('ScratchpadManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and retrieves a scratchpad for a session', async () => {
    const mgr = new ScratchpadManager({ cleanupIntervalMs: 0 });
    const sp = mgr.getOrCreate('s1');

    expect(sp.sessionId).toBe('s1');
    expect(mgr.has('s1')).toBe(true);
    expect(mgr.sessionCount).toBe(1);

    // Same session returns the same instance
    const sp2 = mgr.getOrCreate('s1');
    expect(sp2).toBe(sp);

    await mgr.destroyAll();
  });

  it('reports correct session count across multiple sessions', async () => {
    const mgr = new ScratchpadManager({ cleanupIntervalMs: 0 });
    mgr.getOrCreate('a');
    mgr.getOrCreate('b');
    mgr.getOrCreate('c');

    expect(mgr.sessionCount).toBe(3);

    await mgr.destroy('b');
    expect(mgr.sessionCount).toBe(2);
    expect(mgr.has('b')).toBe(false);

    await mgr.destroyAll();
  });

  it('destroys a specific session', async () => {
    const mgr = new ScratchpadManager({ cleanupIntervalMs: 0 });
    const sp = mgr.getOrCreate('target');
    await sp.saveTable('data', [{ x: 1 }]);

    await mgr.destroy('target');
    expect(mgr.has('target')).toBe(false);
    expect(sp.isDestroyed).toBe(true);

    // Destroying a non-existent session is a no-op
    await mgr.destroy('nonexistent');

    await mgr.destroyAll();
  });

  it('cleans up stale sessions based on maxSessionAgeMs', async () => {
    const mgr = new ScratchpadManager({
      cleanupIntervalMs: 0,
      maxSessionAgeMs: 1000,
    });

    const sp = mgr.getOrCreate('old');
    await sp.saveTable('data', [{ v: 1 }]);

    // Manually backdate the lastAccess by mocking Date.now
    const originalNow = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(originalNow() + 2000);

    const cleaned = await mgr.cleanup();
    expect(cleaned).toBe(1);
    expect(mgr.has('old')).toBe(false);

    vi.spyOn(Date, 'now').mockRestore();
    await mgr.destroyAll();
  });

  it('destroyAll cleans up all sessions', async () => {
    const mgr = new ScratchpadManager({ cleanupIntervalMs: 0 });
    mgr.getOrCreate('x');
    mgr.getOrCreate('y');
    mgr.getOrCreate('z');

    expect(mgr.sessionCount).toBe(3);

    await mgr.destroyAll();
    expect(mgr.sessionCount).toBe(0);
  });

  it('creates a new scratchpad if the previous one was destroyed', async () => {
    const mgr = new ScratchpadManager({ cleanupIntervalMs: 0 });
    const sp1 = mgr.getOrCreate('s1');
    await sp1.destroy();

    // getOrCreate should detect the destroyed scratchpad and create a new one
    const sp2 = mgr.getOrCreate('s1');
    expect(sp2).not.toBe(sp1);
    expect(sp2.isDestroyed).toBe(false);

    await mgr.destroyAll();
  });

  it('passes scratchpad limits to new scratchpads', async () => {
    const mgr = new ScratchpadManager({
      cleanupIntervalMs: 0,
      scratchpadLimits: { maxTables: 1 },
    });

    const sp = mgr.getOrCreate('limited');
    await sp.saveTable('t1', [{ a: 1 }]);
    await expect(sp.saveTable('t2', [{ b: 2 }])).rejects.toThrow('limit');

    await mgr.destroyAll();
  });
});
