import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConversationLog,
  defaultLogDir,
  wrapToolContext,
} from './conversation-log';
import type { ToolContext } from '../tools/router';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'convlog-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ConversationLog', () => {
  it('seeds with a session_start event', () => {
    const log = new ConversationLog({
      sessionId: 'sess_1',
      orgId: 'org_1',
      userMessage: 'hello',
      dataSources: [{ id: 'ds_1', name: 'cricket', type: 'postgres' }],
    });
    const events = log.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      t: 'session_start',
      session_id: 'sess_1',
      org_id: 'org_1',
      user_message: 'hello',
    });
  });

  it('snapshotSchemaDocs picks the first non-empty tier and reports chars', () => {
    const log = new ConversationLog({
      sessionId: 's',
      orgId: 'o',
      userMessage: '',
      dataSources: [],
    });
    log.snapshotSchemaDocs([
      { id: 'a', name: 'A', schemaDoc: '# doc' },
      { id: 'b', name: 'B', schemaContext: { tables: [] } },
      { id: 'c', name: 'C', cachedSchema: { tables: [] } },
      { id: 'd', name: 'D' },
    ]);
    const snaps = log.getEvents().filter((e) => e.t === 'schema_doc_snapshot');
    expect(snaps).toHaveLength(4);
    expect(snaps[0]).toMatchObject({ source: 'schemaDoc', chars: 5 });
    expect(snaps[1]).toMatchObject({ source: 'schemaContext' });
    expect(snaps[2]).toMatchObject({ source: 'cachedSchema' });
    expect(snaps[3]).toMatchObject({ source: 'none', chars: 0, doc: null });
  });

  it('flush writes a JSONL file with session_end appended', async () => {
    const log = new ConversationLog({
      sessionId: 'sess_flush',
      orgId: 'o',
      userMessage: 'q',
      dataSources: [],
    });
    log.push({ t: 'user_message', text: 'q' });

    const written = await log.flush(tmpDir, 'end_turn');
    expect(written).not.toBeNull();

    const body = await fs.readFile(written!, 'utf8');
    const lines = body.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines[0].t).toBe('session_start');
    expect(lines.at(-1)?.t).toBe('session_end');
    expect(lines.at(-1)?.stop_reason).toBe('end_turn');
  });

  it('flush returns null and does not throw when the dir is unwritable', async () => {
    const log = new ConversationLog({
      sessionId: 's',
      orgId: 'o',
      userMessage: '',
      dataSources: [],
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Use a path that will fail the mkdir (null byte is invalid on every OS).
    const result = await log.flush('\0/invalid', undefined);
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('wrapToolContext', () => {
  function createCtx(overrides?: Partial<ToolContext>): ToolContext {
    return {
      getSchema: vi.fn().mockResolvedValue({ tables: [] }),
      runSQL: vi.fn().mockResolvedValue({ columns: ['a'], rows: [{ a: 1 }], rowCount: 1 }),
      describeTable: vi.fn().mockResolvedValue({ columns: [] }),
      ...overrides,
    };
  }

  it('records runSQL calls with the SQL input and a row_count on success', async () => {
    const log = new ConversationLog({
      sessionId: 's',
      orgId: 'o',
      userMessage: '',
      dataSources: [],
    });
    const wrapped = wrapToolContext(createCtx(), log);
    await wrapped.runSQL!('ds_1', 'SELECT 1');
    const events = log.getEvents();
    expect(events.some((e) => e.t === 'tool_call' && e.tool === 'run_sql' && e.input.sql === 'SELECT 1')).toBe(true);
    const result = events.find((e) => e.t === 'tool_result' && e.tool === 'run_sql');
    expect(result).toMatchObject({ status: 'ok', row_count: 1, column_count: 1 });
  });

  it('records runSQL errors without throwing past the wrapper', async () => {
    const log = new ConversationLog({
      sessionId: 's',
      orgId: 'o',
      userMessage: '',
      dataSources: [],
    });
    const boom = new Error('bad sql');
    const wrapped = wrapToolContext(createCtx({ runSQL: vi.fn().mockRejectedValue(boom) }), log);
    await expect(wrapped.runSQL!('ds_1', 'SELECT oops')).rejects.toThrow('bad sql');
    const result = log.getEvents().find((e) => e.t === 'tool_result' && e.tool === 'run_sql');
    expect(result).toMatchObject({ status: 'error', error: 'bad sql' });
  });

  it('omits runSQL / describeTable when the original context lacks them', () => {
    const log = new ConversationLog({
      sessionId: 's',
      orgId: 'o',
      userMessage: '',
      dataSources: [],
    });
    const minimal: ToolContext = { getSchema: vi.fn().mockResolvedValue({}) };
    const wrapped = wrapToolContext(minimal, log);
    expect(wrapped.runSQL).toBeUndefined();
    expect(wrapped.describeTable).toBeUndefined();
  });
});

describe('defaultLogDir', () => {
  it('resolves to an absolute path under the cwd', () => {
    const dir = defaultLogDir();
    expect(path.isAbsolute(dir)).toBe(true);
    expect(dir.endsWith('.agent-logs')).toBe(true);
  });
});
