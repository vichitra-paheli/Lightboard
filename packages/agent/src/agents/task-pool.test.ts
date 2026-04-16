import { describe, expect, it } from 'vitest';

import { TaskPool } from './task-pool';
import type { SubAgentResult } from './types';

function successResult(partial: Partial<SubAgentResult> = {}): SubAgentResult {
  return {
    role: 'query',
    success: true,
    data: {},
    explanation: 'ok',
    ...partial,
  };
}

describe('TaskPool', () => {
  it('dispatches a task and returns a running handle synchronously', () => {
    const pool = new TaskPool();
    const id = pool.nextId('query');

    const handle = pool.dispatch({
      id,
      role: 'query',
      instruction: 'fetch sales',
      run: () => new Promise(() => { /* never resolves */ }),
    });

    expect(handle.id).toBe(id);
    expect(handle.role).toBe('query');
    expect(handle.status).toBe('running');
    expect(pool.running()).toHaveLength(1);
  });

  it('awaitTasks resolves with results when tasks complete', async () => {
    const pool = new TaskPool();
    const id = pool.nextId('query');

    pool.dispatch({
      id,
      role: 'query',
      instruction: 'q1',
      run: async () => successResult({ explanation: 'done1' }),
    });

    const results = await pool.awaitTasks([id]);
    expect(results.get(id)?.explanation).toBe('done1');
    expect(pool.getHandle(id)?.status).toBe('done');
  });

  it('awaits multiple tasks concurrently (parallel execution)', async () => {
    const pool = new TaskPool();
    const id1 = pool.nextId('query');
    const id2 = pool.nextId('query');
    const startedAt: Record<string, number> = {};
    const finishedAt: Record<string, number> = {};

    pool.dispatch({
      id: id1,
      role: 'query',
      instruction: 'q1',
      run: async () => {
        startedAt[id1] = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        finishedAt[id1] = Date.now();
        return successResult();
      },
    });

    pool.dispatch({
      id: id2,
      role: 'query',
      instruction: 'q2',
      run: async () => {
        startedAt[id2] = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        finishedAt[id2] = Date.now();
        return successResult();
      },
    });

    await pool.awaitTasks([id1, id2]);

    // They must have overlapped — both should have started before either finished.
    expect(startedAt[id1]).toBeLessThan(finishedAt[id2]!);
    expect(startedAt[id2]).toBeLessThan(finishedAt[id1]!);
  });

  it('awaitTasks resolves immediately for already-settled tasks', async () => {
    const pool = new TaskPool();
    const id = pool.nextId('view');

    pool.dispatch({
      id,
      role: 'view',
      instruction: 'v',
      run: async () => successResult({ role: 'view' }),
    });

    // Let the microtask queue flush.
    await new Promise((r) => setTimeout(r, 0));

    const results = await pool.awaitTasks([id]);
    expect(results.size).toBe(1);
    expect(results.get(id)?.success).toBe(true);
  });

  it('awaitTasks returns a timeout marker for still-running tasks', async () => {
    const pool = new TaskPool();
    const id = pool.nextId('query');

    pool.dispatch({
      id,
      role: 'query',
      instruction: 'slow',
      run: () => new Promise(() => { /* never */ }),
    });

    const results = await pool.awaitTasks([id], 10);
    const entry = results.get(id)!;
    expect(entry.success).toBe(false);
    expect(entry.error).toBe('timeout');
  });

  it('awaitTasks returns a synthetic error for unknown ids', async () => {
    const pool = new TaskPool();
    const results = await pool.awaitTasks(['task_missing']);
    expect(results.get('task_missing')?.error).toBe('unknown_task_id');
  });

  it('cancel marks a running task cancelled and resolves awaiters', async () => {
    const pool = new TaskPool();
    const id = pool.nextId('insights');

    pool.dispatch({
      id,
      role: 'insights',
      instruction: 'hang',
      run: (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });

    expect(pool.cancel(id)).toBe(true);
    const results = await pool.awaitTasks([id]);
    expect(results.get(id)?.success).toBe(false);
    expect(pool.getHandle(id)?.status).toBe('cancelled');
  });

  it('drain waits out every running task', async () => {
    const pool = new TaskPool();
    const id1 = pool.nextId('query');
    const id2 = pool.nextId('view');

    pool.dispatch({
      id: id1,
      role: 'query',
      instruction: 'q',
      run: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return successResult();
      },
    });
    pool.dispatch({
      id: id2,
      role: 'view',
      instruction: 'v',
      run: async () => {
        await new Promise((r) => setTimeout(r, 30));
        return successResult({ role: 'view' });
      },
    });

    const drained = await pool.drain();
    expect(drained).toHaveLength(2);
    expect(pool.running()).toHaveLength(0);
  });

  it('propagates exceptions from the task runner as error results', async () => {
    const pool = new TaskPool();
    const id = pool.nextId('query');

    pool.dispatch({
      id,
      role: 'query',
      instruction: 'boom',
      run: async () => {
        throw new Error('kaboom');
      },
    });

    const results = await pool.awaitTasks([id]);
    const result = results.get(id)!;
    expect(result.success).toBe(false);
    expect(result.error).toBe('kaboom');
    expect(pool.getHandle(id)?.status).toBe('error');
  });
});
