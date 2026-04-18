import type { SubAgentResult, SubAgentRole } from './types';

/** Lifecycle state of a dispatched task. */
export type TaskStatus = 'running' | 'done' | 'error' | 'cancelled';

/**
 * Handle returned to the leader when a sub-agent task is dispatched.
 * Serialized fields are safe to surface to the LLM as the tool result.
 */
export interface TaskHandle {
  /** Opaque task id (also serves as the scratchpad/tool correlation key). */
  id: string;
  /** Which specialist role is running this task. */
  role: SubAgentRole;
  /** Instruction the task was dispatched with (truncated for display). */
  instruction: string;
  /** Current status. */
  status: TaskStatus;
  /** Epoch millis the task was dispatched at. */
  dispatchedAt: number;
}

/** Internal entry combining the public handle with its in-flight promise. */
interface TaskEntry {
  handle: TaskHandle;
  promise: Promise<SubAgentResult>;
  /** Final result once the task settles. Undefined while running. */
  result?: SubAgentResult;
  /** Abort controller for cooperative cancellation. */
  abortController: AbortController;
  /** Listeners waiting on this specific task via awaitTasks. */
  resolvers: Array<(result: SubAgentResult) => void>;
}

/** Registration payload when dispatching a task into the pool. */
export interface DispatchInput {
  id: string;
  role: SubAgentRole;
  instruction: string;
  run: (signal: AbortSignal) => Promise<SubAgentResult>;
}

/**
 * Per-conversation pool of in-flight sub-agent tasks.
 *
 * Dispatches do not block the caller — tasks run concurrently until the
 * leader explicitly calls `awaitTasks()` to collect results, or the leader
 * finishes and `drain()` waits out anything still running.
 */
export class TaskPool {
  private entries = new Map<string, TaskEntry>();
  private counter = 0;

  /** Generate a new monotonic task id. Format: `task_<role>_<n>`. */
  nextId(role: SubAgentRole): string {
    this.counter += 1;
    return `task_${role}_${this.counter}`;
  }

  /**
   * Register and start a task. Returns the handle immediately;
   * the task runs on the event loop in the background.
   */
  dispatch(input: DispatchInput): TaskHandle {
    const handle: TaskHandle = {
      id: input.id,
      role: input.role,
      instruction: input.instruction.slice(0, 200),
      status: 'running',
      dispatchedAt: Date.now(),
    };

    const abortController = new AbortController();
    const entry: TaskEntry = {
      handle,
      promise: undefined as unknown as Promise<SubAgentResult>,
      abortController,
      resolvers: [],
    };

    entry.promise = input
      .run(abortController.signal)
      .then((result) => {
        entry.result = result;
        handle.status = result.success ? 'done' : 'error';
        for (const resolve of entry.resolvers) resolve(result);
        entry.resolvers = [];
        return result;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        const failed: SubAgentResult = {
          role: input.role,
          success: false,
          data: {},
          explanation: `Task failed: ${message}`,
          error: message,
        };
        entry.result = failed;
        handle.status = abortController.signal.aborted ? 'cancelled' : 'error';
        for (const resolve of entry.resolvers) resolve(failed);
        entry.resolvers = [];
        return failed;
      });

    this.entries.set(input.id, entry);
    return handle;
  }

  /** Returns the public handle for a task, or undefined if unknown. */
  getHandle(id: string): TaskHandle | undefined {
    return this.entries.get(id)?.handle;
  }

  /** List every handle currently tracked by the pool (running and settled). */
  listHandles(): TaskHandle[] {
    return Array.from(this.entries.values()).map((e) => e.handle);
  }

  /** Tasks still in the running state. */
  running(): TaskHandle[] {
    return this.listHandles().filter((h) => h.status === 'running');
  }

  /**
   * Wait for a specific set of task ids to settle.
   * Unknown ids resolve to a synthetic error result so the leader always
   * receives one entry per requested id.
   */
  async awaitTasks(
    ids: string[],
    timeoutMs?: number,
  ): Promise<Map<string, SubAgentResult>> {
    const results = new Map<string, SubAgentResult>();
    const pending: Array<Promise<void>> = [];

    for (const id of ids) {
      const entry = this.entries.get(id);
      if (!entry) {
        results.set(id, {
          role: 'query',
          success: false,
          data: {},
          explanation: `Unknown task id: ${id}`,
          error: 'unknown_task_id',
        });
        continue;
      }
      if (entry.result) {
        results.set(id, entry.result);
        continue;
      }
      pending.push(
        new Promise<void>((resolve) => {
          entry.resolvers.push((result) => {
            results.set(id, result);
            resolve();
          });
        }),
      );
    }

    if (pending.length === 0) return results;

    if (typeof timeoutMs === 'number') {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      });
      await Promise.race([Promise.all(pending), timeout]);
      if (timer) clearTimeout(timer);
      // Any task that did not resolve before the timeout is reported as still running.
      for (const id of ids) {
        if (!results.has(id)) {
          const handle = this.entries.get(id)?.handle;
          results.set(id, {
            role: handle?.role ?? 'query',
            success: false,
            data: { status: 'running' },
            explanation: `Task ${id} still running after ${timeoutMs}ms`,
            error: 'timeout',
          });
        }
      }
    } else {
      await Promise.all(pending);
    }

    return results;
  }

  /**
   * Wait for every running task to settle. Used by the leader before
   * ending a turn so no background work is abandoned mid-conversation.
   */
  async drain(timeoutMs?: number): Promise<TaskHandle[]> {
    const runningIds = this.running().map((h) => h.id);
    if (runningIds.length === 0) return [];
    await this.awaitTasks(runningIds, timeoutMs);
    return this.listHandles().filter((h) => runningIds.includes(h.id));
  }

  /** Cooperatively cancel a task. Resolves to true if the task was running. */
  cancel(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (entry.handle.status !== 'running') return false;
    entry.abortController.abort();
    return true;
  }

  /** Cancel every running task. Returns the number of tasks cancelled. */
  cancelAll(): number {
    let count = 0;
    for (const [id] of this.entries) {
      if (this.cancel(id)) count++;
    }
    return count;
  }

  /** Remove every entry. The in-flight promises keep running but are untracked. */
  clear(): void {
    this.entries.clear();
    this.counter = 0;
  }
}
