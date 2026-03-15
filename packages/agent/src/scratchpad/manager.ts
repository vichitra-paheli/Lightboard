import { SessionScratchpad, type ScratchpadLimits } from './scratchpad';

/** Configuration options for the ScratchpadManager. */
export interface ScratchpadManagerOptions {
  /** Interval in ms between automatic cleanup sweeps (default: 5 minutes). */
  cleanupIntervalMs?: number;
  /** Maximum age in ms before a session is considered stale (default: 30 minutes). */
  maxSessionAgeMs?: number;
  /** Limits to apply to each new scratchpad. */
  scratchpadLimits?: Partial<ScratchpadLimits>;
}

/** Default manager configuration. */
const DEFAULTS = {
  cleanupIntervalMs: 5 * 60 * 1000,
  maxSessionAgeMs: 30 * 60 * 1000,
};

/**
 * Manages the lifecycle of per-session scratchpads.
 *
 * Provides get-or-create semantics, automatic cleanup of stale sessions,
 * and bulk teardown for graceful shutdown.
 */
export class ScratchpadManager {
  private sessions = new Map<string, SessionScratchpad>();
  private readonly maxSessionAgeMs: number;
  private readonly scratchpadLimits: Partial<ScratchpadLimits> | undefined;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: ScratchpadManagerOptions) {
    this.maxSessionAgeMs = options?.maxSessionAgeMs ?? DEFAULTS.maxSessionAgeMs;
    this.scratchpadLimits = options?.scratchpadLimits;

    const intervalMs = options?.cleanupIntervalMs ?? DEFAULTS.cleanupIntervalMs;
    if (intervalMs > 0) {
      this.cleanupTimer = setInterval(() => {
        void this.cleanup();
      }, intervalMs);
      // Allow Node to exit even if the timer is still running
      if (typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Get or create a scratchpad for the given session.
   *
   * If a scratchpad already exists for the session it is returned.
   * Otherwise a new one is created with the manager's default limits.
   *
   * @param sessionId - Unique session identifier.
   * @returns The session's scratchpad.
   */
  getOrCreate(sessionId: string): SessionScratchpad {
    const existing = this.sessions.get(sessionId);
    if (existing && !existing.isDestroyed) {
      return existing;
    }

    const scratchpad = new SessionScratchpad(sessionId, this.scratchpadLimits);
    this.sessions.set(sessionId, scratchpad);
    return scratchpad;
  }

  /**
   * Check whether a scratchpad exists for the given session.
   *
   * @param sessionId - Unique session identifier.
   * @returns True if an active scratchpad exists.
   */
  has(sessionId: string): boolean {
    const s = this.sessions.get(sessionId);
    return s !== undefined && !s.isDestroyed;
  }

  /**
   * Destroy a specific session's scratchpad and remove it from the manager.
   *
   * @param sessionId - Unique session identifier.
   */
  async destroy(sessionId: string): Promise<void> {
    const scratchpad = this.sessions.get(sessionId);
    if (scratchpad) {
      await scratchpad.destroy();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Clean up stale sessions that have not been accessed within the
   * configured `maxSessionAgeMs`.
   *
   * @returns Number of sessions destroyed.
   */
  async cleanup(): Promise<number> {
    const now = Date.now();
    let count = 0;

    for (const [id, scratchpad] of this.sessions.entries()) {
      const age = now - scratchpad.lastAccess.getTime();
      if (age > this.maxSessionAgeMs || scratchpad.isDestroyed) {
        await scratchpad.destroy();
        this.sessions.delete(id);
        count++;
      }
    }

    return count;
  }

  /**
   * Destroy all active scratchpads and stop the cleanup timer.
   * Call this during graceful shutdown.
   */
  async destroyAll(): Promise<void> {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const [id, scratchpad] of this.sessions.entries()) {
      await scratchpad.destroy();
      this.sessions.delete(id);
    }
  }

  /** Number of active (non-destroyed) sessions. */
  get sessionCount(): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (!s.isDestroyed) count++;
    }
    return count;
  }
}
